/**
 * Authoritative game engine for Triple PLO.
 *
 * Every rule-affecting decision happens here on the server. The browser only
 * ever *requests* actions; this module authorizes, validates, applies, and
 * persists them. It composes the pure core (deck/deal/evaluator/scoring/round).
 *
 * Storage: in-memory locally; on Vercel, `withDurableStore` (Redis/Upstash)
 * shares rooms and sessions across serverless instances. See durableStore.ts.
 */

import { randomUUID, randomBytes } from "node:crypto";
import { makeDeck, type Card } from "@/core/cards";
import { secureShuffle } from "@/core/shuffle";
import { deal, BOARD_ORDER, type BoardId } from "@/core/deal";
import { validateAssignment, type Assignment } from "@/core/assignment";
import { evaluateOmaha, isPremiumHand } from "@/core/evaluator";
import { scoreRound, type RoundBoardInput } from "@/core/round";
import type { PlayerBoardHand } from "@/core/scoring";
import { computeEquity } from "./equity";
import { nextPhase, nextRevealStep, REVEAL_SEQUENCE } from "@/core/stateMachine";
import type { Game, RoundState, ServerPlayer, Spectator } from "./types";
import { getStore, type Store } from "./durableStore";
import { DEFAULT_AVATAR_ID, normalizeAvatarId } from "@/lib/avatars";

export class GameError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export { withDurableStore, redisConfigured } from "./durableStore";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

function generateRoomCode(store: Store): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = "";
    const bytes = randomBytes(6);
    for (let i = 0; i < 6; i++) code += ROOM_CODE_ALPHABET[bytes[i]! % ROOM_CODE_ALPHABET.length];
    if (!store.codeIndex.has(code)) return code;
  }
  throw new GameError("CODE_GENERATION", "Could not generate a unique room code");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function emptyRecord(players: ServerPlayer[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const p of players) r[p.id] = 0;
  return r;
}

/** Resolves and authorizes a seated-player session against a game. */
export function requireSession(token: string): { game: Game; player: ServerPlayer } {
  const store = getStore();
  const ref = store.sessions.get(token);
  if (!ref?.playerId) throw new GameError("AUTH", "Invalid or missing session");
  const game = store.games.get(ref.gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  const player = game.players.find((p) => p.id === ref.playerId);
  if (!player) throw new GameError("AUTH", "Player not in game");
  return { game, player };
}

/** Player or spectator session (state polling + chat). */
export function requireActor(token: string): {
  game: Game;
  player: ServerPlayer | null;
  spectator: Spectator | null;
  actorId: string;
  displayName: string;
  isSpectator: boolean;
} {
  const store = getStore();
  const ref = store.sessions.get(token);
  if (!ref) throw new GameError("AUTH", "Invalid or missing session");
  const game = store.games.get(ref.gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");

  if (ref.playerId) {
    const player = game.players.find((p) => p.id === ref.playerId);
    if (!player) throw new GameError("AUTH", "Player not in game");
    return {
      game,
      player,
      spectator: null,
      actorId: player.id,
      displayName: player.displayName,
      isSpectator: false,
    };
  }

  if (ref.spectatorId) {
    const spectator = (game.spectators ?? []).find((s) => s.id === ref.spectatorId);
    if (!spectator) throw new GameError("AUTH", "Spectator not in game");
    return {
      game,
      player: null,
      spectator,
      actorId: spectator.id,
      displayName: spectator.displayName,
      isSpectator: true,
    };
  }

  throw new GameError("AUTH", "Invalid or missing session");
}

function idempotent<T>(game: Game, key: string | undefined, current: () => T, run: () => T): T {
  if (key && game.processedKeys.has(key)) return current();
  const result = run();
  if (key) game.processedKeys.add(key);
  return result;
}

export interface CreateGameInput {
  hostDisplayName: string;
  hostEmail: string;
  playerCount: 2 | 3;
  boardValueCents: number;
  avatarId?: string;
}

export function createGame(input: CreateGameInput): {
  game: Game;
  sessionToken: string;
  playerId: string;
} {
  const store = getStore();
  const id = randomUUID();
  const code = generateRoomCode(store);
  const hostId = randomUUID();
  const sessionToken = newToken();

  const host: ServerPlayer = {
    id: hostId,
    seat: 0,
    displayName: input.hostDisplayName.trim(),
    isHost: true,
    avatarId: normalizeAvatarId(input.avatarId),
    sessionToken,
    email: input.hostEmail.trim(),
    connected: true,
    lastSeenAt: Date.now(),
  };

  const game: Game = {
    id,
    code,
    playerCount: input.playerCount,
    boardValueCents: input.boardValueCents,
    hostId,
    phase: "LOBBY",
    version: 1,
    players: [host],
    round: null,
    completedRounds: 0,
    cumulative: { [hostId]: 0 },
    stats: {
      outrightWins: {},
      tiedWins: {},
      pushes: 0,
      sweeps: {},
      premiumBonuses: {},
    },
    createdAt: Date.now(),
    endedAt: null,
    resumePhase: null,
    hostDisconnectedAt: null,
    processedKeys: new Set(),
    emailStatus: "none",
    nextRevealAt: null,
    chat: [],
    chatRevision: 0,
    spectators: [],
  };

  store.games.set(id, game);
  store.codeIndex.set(code, id);
  store.sessions.set(sessionToken, { gameId: id, playerId: hostId });
  return { game, sessionToken, playerId: hostId };
}

export interface CreatePracticeInput {
  hostDisplayName: string;
  playerCount: 2 | 3;
  boardValueCents: number;
  avatarId?: string;
}

/**
 * Practice mode: creates a game where the human is the host and the remaining
 * seats are filled by CPU opponents, so a single person can test the full flow.
 */
export function createPracticeGame(input: CreatePracticeInput): {
  game: Game;
  sessionToken: string;
  playerId: string;
} {
  const store = getStore();
  const created = createGame({
    hostDisplayName: input.hostDisplayName || "You",
    // Practice email is only used for the (console-logged) score sheet.
    hostEmail: `practice+${randomUUID().slice(0, 8)}@example.com`,
    playerCount: input.playerCount,
    boardValueCents: input.boardValueCents,
    avatarId: input.avatarId,
  });
  const game = created.game;

  for (let i = 1; i < input.playerCount; i++) {
    const botId = randomUUID();
    game.players.push({
      id: botId,
      seat: i,
      displayName: `CPU ${i}`,
      isHost: false,
      isBot: true,
      avatarId: DEFAULT_AVATAR_ID,
      sessionToken: newToken(), // never used, bots are server-driven
      connected: true,
      lastSeenAt: Date.now(),
    });
    game.cumulative[botId] = 0;
  }
  game.phase = "READY_TO_START";
  game.practice = true;
  game.version++;

  void store; // store already holds the game via createGame
  return created;
}

export function joinGame(
  code: string,
  displayName: string,
  avatarId?: string
): {
  game: Game;
  sessionToken: string;
  playerId: string;
} {
  const store = getStore();
  const gameId = store.codeIndex.get(code.trim().toUpperCase());
  if (!gameId) throw new GameError("INVALID_ROOM", "Room code not found");
  const game = store.games.get(gameId)!;

  if (game.phase !== "LOBBY") throw new GameError("GAME_STARTED", "This game has already started");
  if (game.players.length >= game.playerCount) throw new GameError("ROOM_FULL", "Room is full");

  const name = displayName.trim();
  if (!name) throw new GameError("INVALID_NAME", "Display name is required");
  if (game.players.some((p) => p.displayName.toLowerCase() === name.toLowerCase())) {
    throw new GameError("DUPLICATE_NAME", "That display name is already taken in this room");
  }

  const playerId = randomUUID();
  const sessionToken = newToken();
  const player: ServerPlayer = {
    id: playerId,
    seat: game.players.length,
    displayName: name,
    isHost: false,
    avatarId: normalizeAvatarId(avatarId),
    sessionToken,
    connected: true,
    lastSeenAt: Date.now(),
  };
  game.players.push(player);
  game.cumulative[playerId] = 0;

  if (game.players.length === game.playerCount) {
    game.phase = "READY_TO_START";
  }
  game.version++;

  store.sessions.set(sessionToken, { gameId: game.id, playerId });
  return { game, sessionToken, playerId };
}

const SPECTATE_PHASES = new Set([
  "ARRANGING",
  "READY_TO_REVEAL",
  "REVEALING",
  "ROUND_SUMMARY",
  "WAITING_NEXT_ROUND",
  "HOST_DISCONNECTED",
]);

const MAX_SPECTATORS = 24;

/** Join as a named spectator after the game has started (no seat). */
export function joinAsSpectator(
  code: string,
  displayName: string,
  avatarId?: string
): {
  game: Game;
  sessionToken: string;
  spectatorId: string;
} {
  const store = getStore();
  const gameId = store.codeIndex.get(code.trim().toUpperCase());
  if (!gameId) throw new GameError("INVALID_ROOM", "Room code not found");
  const game = store.games.get(gameId)!;

  if (!SPECTATE_PHASES.has(game.phase)) {
    if (game.phase === "LOBBY" || game.phase === "READY_TO_START") {
      throw new GameError("TOO_EARLY", "Spectators can join once the game has started");
    }
    throw new GameError("GAME_ENDED", "This game is over");
  }

  if (!game.spectators) game.spectators = [];
  if (game.spectators.length >= MAX_SPECTATORS) {
    throw new GameError("ROOM_FULL", "Spectator limit reached");
  }

  const name = displayName.trim();
  if (!name) throw new GameError("INVALID_NAME", "Display name is required");
  const taken = [
    ...game.players.map((p) => p.displayName),
    ...game.spectators.map((s) => s.displayName),
  ].some((n) => n.toLowerCase() === name.toLowerCase());
  if (taken) {
    throw new GameError("DUPLICATE_NAME", "That display name is already taken in this room");
  }

  const spectatorId = randomUUID();
  const sessionToken = newToken();
  const spectator: Spectator = {
    id: spectatorId,
    displayName: name,
    avatarId: normalizeAvatarId(avatarId),
    sessionToken,
    connected: true,
    lastSeenAt: Date.now(),
  };
  game.spectators.push(spectator);
  game.version++;

  store.sessions.set(sessionToken, { gameId: game.id, spectatorId });
  return { game, sessionToken, spectatorId };
}

/** Host starts a round: shuffle + deal atomically, then move to ARRANGING. */
export function startRound(token: string, idempotencyKey?: string): Game {
  const { game, player } = requireSession(token);
  if (!player.isHost) throw new GameError("FORBIDDEN", "Only the host can start a round");

  return idempotent(
    game,
    idempotencyKey,
    () => game,
    () => {
      const target = nextPhase(game.phase, { type: "START_ROUND" });
      if (target !== "DEALING") {
        throw new GameError("BAD_STATE", `Cannot start a round from ${game.phase}`);
      }
      if (game.players.length !== game.playerCount) {
        throw new GameError("SEATS", "All seats must be filled");
      }
      if (game.players.some((p) => !p.connected)) {
        throw new GameError("DISCONNECTED", "All players must be connected to start a round");
      }

      // Atomic deal: build fully, validate (via deal()), then commit.
      const shuffled = secureShuffle(makeDeck());
      const dealt = deal(shuffled, game.playerCount);

      const round: RoundState = {
        roundNumber: game.completedRounds + 1,
        deal: dealt,
        assignments: {},
        ready: {},
        revealStep: null,
        equity: {},
        result: null,
        cancelled: false,
      };
      for (const p of game.players) {
        round.assignments[p.id] = null;
        round.ready[p.id] = false;
      }
      game.round = round;
      game.phase = "ARRANGING";
      autoPlayBots(game);
      game.version++;
      return game;
    }
  );
}

export function saveAssignment(
  token: string,
  assignment: Assignment,
  idempotencyKey?: string
): Game {
  const { game, player } = requireSession(token);
  const round = game.round;
  if (!round || game.phase !== "ARRANGING") {
    throw new GameError("BAD_STATE", "Not currently arranging");
  }
  if (round.ready[player.id]) {
    throw new GameError("LOCKED", "Your arrangement is locked after Ready");
  }

  return idempotent(
    game,
    idempotencyKey,
    () => game,
    () => {
      const seat = player.seat;
      const priv = round.deal.private[seat]!;
      const validation = validateAssignment(assignment, priv);
      if (!validation.valid) {
        throw new GameError("INVALID_ASSIGNMENT", validation.errors.join("; "));
      }
      round.assignments[player.id] = assignment;
      game.version++;
      return game;
    }
  );
}

export function setReady(token: string, idempotencyKey?: string): Game {
  const { game, player } = requireSession(token);
  const round = game.round;
  if (!round || game.phase !== "ARRANGING") {
    throw new GameError("BAD_STATE", "Not currently arranging");
  }
  if (round.ready[player.id]) return game; // idempotent: already ready

  return idempotent(
    game,
    idempotencyKey,
    () => game,
    () => {
      const priv = round.deal.private[player.seat]!;
      const assignment = round.assignments[player.id];
      if (!assignment) throw new GameError("NO_ASSIGNMENT", "Assign all 12 cards before Ready");
      const validation = validateAssignment(assignment, priv);
      if (!validation.valid) {
        throw new GameError("INVALID_ASSIGNMENT", validation.errors.join("; "));
      }
      round.ready[player.id] = true;
      maybeCompleteReady(game);
      game.version++;
      return game;
    }
  );
}

/** If every player is Ready, compute the authoritative result and advance. */
function maybeCompleteReady(game: Game): void {
  const round = game.round;
  if (!round || game.phase !== "ARRANGING") return;
  if (game.players.every((p) => round.ready[p.id])) {
    round.result = evaluateRound(game);
    game.phase = "READY_TO_REVEAL";
    // Schedule the first reveal step; clients advance it via poll/tick.
    game.nextRevealAt = Date.now() + FIRST_REVEAL_MS;
  }
}

// ---------------------------------------------------------------------------
// Automatic reveal driver (timestamp + poll).
// setTimeout is unreliable on serverless (Vercel). Instead we store
// `nextRevealAt` on the game and advance whenever any client loads state.
// ---------------------------------------------------------------------------
const FIRST_REVEAL_MS = 2000;
const STEP_REVEAL_MS = 5000;
// Players get longer to study the freshly revealed private cards + equity.
const ASSIGNMENTS_REVEAL_MS = 10000;

/** How long we linger on a step before advancing to the next one. */
function stepDurationMs(step: string | null): number {
  if (!step) return STEP_REVEAL_MS;
  if (step.endsWith("ASSIGNMENTS")) return ASSIGNMENTS_REVEAL_MS;
  // Result / sweep show a banner first, then the payout — give both room.
  if (step.endsWith("RESULT") || step === "SWEEP_EVAL") return 9000;
  return STEP_REVEAL_MS;
}

/**
 * Advance any due auto-reveal steps. Safe to call on every state poll.
 * Returns true if the game was mutated.
 */
export function tickAutoReveal(game: Game): boolean {
  if (game.phase !== "READY_TO_REVEAL" && game.phase !== "REVEALING") {
    if (game.nextRevealAt != null) game.nextRevealAt = null;
    return false;
  }
  // Recover games stuck from the old in-process setTimeout driver (Vercel).
  if (game.nextRevealAt == null) {
    game.nextRevealAt = Date.now();
  }
  if (Date.now() < game.nextRevealAt) return false;

  let changed = false;
  let guard = 0;
  while (
    game.nextRevealAt != null &&
    Date.now() >= game.nextRevealAt &&
    (game.phase === "READY_TO_REVEAL" || game.phase === "REVEALING") &&
    guard++ < 20
  ) {
    try {
      applyReveal(game);
      game.version++;
      changed = true;
    } catch (err) {
      console.error("auto-reveal failed", err);
      game.nextRevealAt = null;
      break;
    }
    if (game.phase === "REVEALING") {
      game.nextRevealAt = Date.now() + stepDurationMs(game.round?.revealStep ?? null);
    } else {
      game.nextRevealAt = null;
    }
  }
  return changed;
}

function boardOfStep(step: string): BoardId | null {
  if (step.startsWith("TOP")) return "top";
  if (step.startsWith("MIDDLE")) return "middle";
  if (step.startsWith("BOTTOM")) return "bottom";
  return null;
}
function phaseOfStep(step: string): "ASSIGNMENTS" | "TURN" | "RIVER" | "RESULT" | "OTHER" {
  if (step.endsWith("ASSIGNMENTS")) return "ASSIGNMENTS";
  if (step.endsWith("TURN")) return "TURN";
  if (step.endsWith("RIVER")) return "RIVER";
  if (step.endsWith("RESULT")) return "RESULT";
  return "OTHER";
}

function updateEquityForStep(game: Game, step: string): void {
  const round = game.round!;
  const board = boardOfStep(step);
  if (!board) return;
  const which = phaseOfStep(step);
  const deal = round.deal;
  const flop = [...deal.boards[board].flop];
  const players = game.players.map((p) => ({
    playerId: p.id,
    cards: round.assignments[p.id]![board],
  }));

  // Standard poker "all-in equity": the turn/river are drawn from the full deck
  // minus only this board's flop and the players' cards for this board. We do
  // NOT remove the other boards' cards, otherwise a 3-player deal (all 52 cards
  // dealt) leaves almost nothing unknown and every board looks decided on the
  // flop. This mirrors how equity calculators run a single board out.
  const known = new Set<Card>(flop);
  for (const pl of players) for (const c of pl.cards) known.add(c);

  if (which === "ASSIGNMENTS") {
    const pool = makeDeck().filter((c) => !known.has(c));
    round.equity[board] = computeEquity(players, flop, null, null, pool);
  } else if (which === "TURN") {
    const turn = deal.boards[board].turn;
    known.add(turn);
    const pool = makeDeck().filter((c) => !known.has(c));
    round.equity[board] = computeEquity(players, flop, turn, null, pool);
  } else if (which === "RIVER") {
    round.equity[board] = computeEquity(
      players,
      flop,
      deal.boards[board].turn,
      deal.boards[board].river,
      []
    );
  }
}

/** Core reveal transition shared by the auto driver and the manual endpoint. */
function applyReveal(game: Game): void {
  const round = game.round;
  if (!round) throw new GameError("BAD_STATE", "No active round");

  if (game.phase === "READY_TO_REVEAL") {
    game.phase = "REVEALING";
    round.revealStep = REVEAL_SEQUENCE[0]!;
    updateEquityForStep(game, round.revealStep);
    return;
  }
  if (game.phase !== "REVEALING" || !round.revealStep) {
    throw new GameError("BAD_STATE", `Cannot reveal from ${game.phase}`);
  }
  const next = nextRevealStep(round.revealStep);
  if (next === null) {
    commitRound(game);
    game.phase = "ROUND_SUMMARY";
  } else {
    round.revealStep = next;
    updateEquityForStep(game, next);
  }
}

/**
 * Practice mode: makes every CPU player arrange (a valid 4/4/4 split of their
 * dealt cards) and press Ready automatically. Runs server-side right after the
 * deal, so a solo human can exercise the full flow.
 */
function autoPlayBots(game: Game): void {
  const round = game.round;
  if (!round) return;
  for (const bot of game.players) {
    if (!bot.isBot || round.ready[bot.id]) continue;
    const priv = round.deal.private[bot.seat]!;
    const assignment: Assignment = {
      top: priv.slice(0, 4),
      middle: priv.slice(4, 8),
      bottom: priv.slice(8, 12),
    };
    const validation = validateAssignment(assignment, priv);
    if (!validation.valid) throw new GameError("BOT", validation.errors.join("; "));
    round.assignments[bot.id] = assignment;
    round.ready[bot.id] = true;
  }
  maybeCompleteReady(game);
}

/** Computes the full round result from the committed deal + assignments. */
function evaluateRound(game: Game) {
  const round = game.round!;
  const playerIds = game.players.map((p) => p.id);
  const boards: RoundBoardInput[] = BOARD_ORDER.map((boardId) => {
    const community = [
      ...round.deal.boards[boardId].flop,
      round.deal.boards[boardId].turn,
      round.deal.boards[boardId].river,
    ];
    const hands: PlayerBoardHand[] = game.players.map((p) => {
      const assignment = round.assignments[p.id]!;
      const result = evaluateOmaha(assignment[boardId], community);
      return { playerId: p.id, score: result.score, isPremium: isPremiumHand(result) };
    });
    return { boardId, hands };
  });
  return scoreRound(boards, game.boardValueCents, playerIds);
}

/** Host advances the reveal one step. Idempotent per step via idempotencyKey. */
export function revealNext(token: string, idempotencyKey?: string): Game {
  const { game, player } = requireSession(token);
  if (!player.isHost) throw new GameError("FORBIDDEN", "Only the host can reveal boards");
  const round = game.round;
  if (!round) throw new GameError("BAD_STATE", "No active round");

  return idempotent(
    game,
    idempotencyKey,
    () => game,
    () => {
      applyReveal(game);
      game.version++;
      if (game.phase === "REVEALING") {
        game.nextRevealAt = Date.now() + stepDurationMs(game.round?.revealStep ?? null);
      } else {
        game.nextRevealAt = null;
      }
      return game;
    }
  );
}

/** Persists the round's final scores into the cumulative scoreboard + stats. */
function commitRound(game: Game): void {
  const round = game.round!;
  const result = round.result!;
  for (const p of game.players) {
    game.cumulative[p.id] = (game.cumulative[p.id] ?? 0) + (result.roundNet[p.id] ?? 0);
  }
  // Stats.
  for (const b of BOARD_ORDER) {
    const bo = result.outcomes[b];
    const bs = result.final[b];
    if (bo.resultType === "TWO_PLAYER_PUSH" || bo.resultType === "THREE_PLAYER_THREE_WAY_PUSH") {
      game.stats.pushes++;
    } else if (bo.resultType === "THREE_PLAYER_TWO_WAY_TIE") {
      for (const w of bo.winners) {
        game.stats.tiedWins[w] = (game.stats.tiedWins[w] ?? 0) + 1;
        if (bs.premiumMultiplier === 2)
          game.stats.premiumBonuses[w] = (game.stats.premiumBonuses[w] ?? 0) + 1;
      }
    } else {
      const w = bo.winners[0]!;
      game.stats.outrightWins[w] = (game.stats.outrightWins[w] ?? 0) + 1;
      if (bs.premiumMultiplier === 2)
        game.stats.premiumBonuses[w] = (game.stats.premiumBonuses[w] ?? 0) + 1;
    }
  }
  if (result.sweepWinner) {
    game.stats.sweeps[result.sweepWinner] =
      (game.stats.sweeps[result.sweepWinner] ?? 0) + 1;
  }
  game.completedRounds++;
}

export function startNextRound(token: string, idempotencyKey?: string): Game {
  const { game, player } = requireSession(token);
  if (!player.isHost) throw new GameError("FORBIDDEN", "Only the host can start the next round");
  return idempotent(
    game,
    idempotencyKey,
    () => game,
    () => {
      if (game.phase !== "ROUND_SUMMARY") {
        throw new GameError("BAD_STATE", `Cannot start next round from ${game.phase}`);
      }
      if (game.players.some((p) => !p.connected)) {
        throw new GameError("DISCONNECTED", "All players must be connected to start a round");
      }
      game.round = null;
      game.phase = "WAITING_NEXT_ROUND";
      // Immediately deal the next round for a snappy MVP flow.
      game.version++;
      return startRound(token);
    }
  );
}

export function endGame(token: string, idempotencyKey?: string): Game {
  const { game, player } = requireSession(token);
  if (!player.isHost) throw new GameError("FORBIDDEN", "Only the host can end the game");
  return idempotent(
    game,
    idempotencyKey,
    () => game,
    () => {
      // An active, unscored round is cancelled and excluded.
      if (game.round && game.phase !== "ROUND_SUMMARY") {
        game.round.cancelled = true;
      }
      game.phase = "GAME_ENDED";
      game.endedAt = Date.now();
      game.emailStatus = "pending"; // final-score email is enqueued (see docs)
      game.version++;
      return game;
    }
  );
}

/** Marks a session as seen (heartbeat) for connection tracking. */
export function heartbeat(token: string): Game {
  const { game, player } = requireSession(token);
  player.connected = true;
  player.lastSeenAt = Date.now();
  return game;
}

export function getGameByToken(token: string): {
  game: Game;
  player: ServerPlayer | null;
  spectator: Spectator | null;
  actorId: string;
  isSpectator: boolean;
} {
  const session = requireActor(token);
  tickAutoReveal(session.game);
  return {
    game: session.game,
    player: session.player,
    spectator: session.spectator,
    actorId: session.actorId,
    isSpectator: session.isSpectator,
  };
}

const MAX_CHAT_LEN = 200;
const MAX_CHAT_HISTORY = 120;

/** Post a table-talk message. Visible to everyone in the room. */
export function postChat(token: string, text: string): Game {
  const { game, player, actorId, displayName, isSpectator } = requireActor(token);
  if (player?.isBot) throw new GameError("FORBIDDEN", "Bots cannot chat");
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) throw new GameError("VALIDATION", "Message is empty");
  if (cleaned.length > MAX_CHAT_LEN) {
    throw new GameError("VALIDATION", `Message must be ${MAX_CHAT_LEN} characters or fewer`);
  }
  // Light spam guard: one message per 400ms per author.
  const last = [...game.chat].reverse().find((m) => m.playerId === actorId);
  if (last && Date.now() - last.createdAt < 400) {
    throw new GameError("RATE", "Slow down");
  }

  if (!game.chat) game.chat = [];
  game.chat.push({
    id: randomUUID(),
    playerId: actorId,
    displayName,
    text: cleaned,
    createdAt: Date.now(),
    isSpectator: isSpectator || undefined,
  });
  if (game.chat.length > MAX_CHAT_HISTORY) {
    game.chat = game.chat.slice(-MAX_CHAT_HISTORY);
  }
  game.chatRevision = (game.chatRevision ?? 0) + 1;
  return game;
}

const PRACTICE_BOT_LINES = [
  "glhf",
  "nice flop",
  "hmm interesting",
  "I'm ready",
  "oops",
  "gg that board",
  "what a cooler",
  "lets go",
  "good luck",
  "yikes",
];

/**
 * Practice only: post a canned line as a CPU so you can preview opponent chat UI
 * (seat bubbles, unread badge, left-aligned sheet messages).
 */
export function postPracticeBotChat(token: string): Game {
  const { game } = requireSession(token);
  const isPractice = game.practice || game.players.some((p) => p.isBot);
  if (!isPractice) {
    throw new GameError("FORBIDDEN", "CPU chat is only available in practice");
  }
  const bots = game.players.filter((p) => p.isBot);
  if (!bots.length) throw new GameError("BAD_STATE", "No CPU seats");

  const bot = bots[Math.floor(Math.random() * bots.length)]!;
  const text = PRACTICE_BOT_LINES[Math.floor(Math.random() * PRACTICE_BOT_LINES.length)]!;

  if (!game.chat) game.chat = [];
  game.chat.push({
    id: randomUUID(),
    playerId: bot.id,
    displayName: bot.displayName,
    text,
    createdAt: Date.now(),
  });
  if (game.chat.length > MAX_CHAT_HISTORY) {
    game.chat = game.chat.slice(-MAX_CHAT_HISTORY);
  }
  game.chatRevision = (game.chatRevision ?? 0) + 1;
  return game;
}

export function requireGameById(gameId: string): Game {
  const store = getStore();
  const game = store.games.get(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  return game;
}
