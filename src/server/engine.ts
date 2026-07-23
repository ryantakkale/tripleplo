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
import type { Game, RoundState, ServerPlayer } from "./types";
import { getStore, type Store } from "./durableStore";

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

/** Resolves and authorizes a session against a game. */
export function requireSession(token: string): { game: Game; player: ServerPlayer } {
  const store = getStore();
  const ref = store.sessions.get(token);
  if (!ref) throw new GameError("AUTH", "Invalid or missing session");
  const game = store.games.get(ref.gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  const player = game.players.find((p) => p.id === ref.playerId);
  if (!player) throw new GameError("AUTH", "Player not in game");
  return { game, player };
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
      sessionToken: newToken(), // never used, bots are server-driven
      connected: true,
      lastSeenAt: Date.now(),
    });
    game.cumulative[botId] = 0;
  }
  game.phase = "READY_TO_START";
  game.version++;

  void store; // store already holds the game via createGame
  return created;
}

export function joinGame(code: string, displayName: string): {
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
    // The reveal now runs automatically, one step every few seconds.
    scheduleAutoReveal(game.id, FIRST_REVEAL_MS);
  }
}

// ---------------------------------------------------------------------------
// Automatic reveal driver (server-side timers).
// In this in-memory MVP the whole app is one Node process, so setTimeout is a
// fine scheduler. A production deploy would use a durable scheduler instead.
// ---------------------------------------------------------------------------
const FIRST_REVEAL_MS = 2000;
const STEP_REVEAL_MS = 5000;
// Players get longer to study the freshly revealed private cards + equity.
const ASSIGNMENTS_REVEAL_MS = 10000;
const autoTimers = new Map<string, NodeJS.Timeout>();

/** How long we linger on a step before advancing to the next one. */
function stepDurationMs(step: string | null): number {
  if (!step) return STEP_REVEAL_MS;
  if (step.endsWith("ASSIGNMENTS")) return ASSIGNMENTS_REVEAL_MS;
  // Result / sweep show a banner first, then the payout — give both room.
  if (step.endsWith("RESULT") || step === "SWEEP_EVAL") return 9000;
  return STEP_REVEAL_MS;
}

function scheduleAutoReveal(gameId: string, delayMs: number): void {
  const existing = autoTimers.get(gameId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    autoTimers.delete(gameId);
    const store = getStore();
    const game = store.games.get(gameId);
    if (!game) return;
    if (game.phase !== "READY_TO_REVEAL" && game.phase !== "REVEALING") return;
    try {
      applyReveal(game);
      game.version++;
    } catch (err) {
      console.error("auto-reveal failed", err);
      return;
    }
    if (game.phase === "REVEALING") scheduleAutoReveal(gameId, stepDurationMs(game.round?.revealStep ?? null));
  }, delayMs);
  if (typeof t.unref === "function") t.unref();
  autoTimers.set(gameId, t);
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

export function getGameByToken(token: string): { game: Game; player: ServerPlayer } {
  return requireSession(token);
}

export function requireGameById(gameId: string): Game {
  const store = getStore();
  const game = store.games.get(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  return game;
}
