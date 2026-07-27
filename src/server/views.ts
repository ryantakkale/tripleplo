/**
 * View projection / redaction for Triple PLO.
 *
 * Converts the full authoritative `Game` into a per-viewer payload that contains
 * ONLY what that viewer is permitted to see. Hidden cards, other players'
 * pre-reveal assignments, face-down turns/rivers, burns, undealt cards, session
 * tokens and the host email are never included. This is the last enforcement
 * point before data leaves the server.
 */

import { BOARD_ORDER, type BoardId } from "@/core/deal";
import { evaluateOmaha, isPremiumHand } from "@/core/evaluator";
import { REVEAL_SEQUENCE } from "@/core/stateMachine";
import { computeSettlement } from "@/core/settlement";
import type { Card } from "@/core/cards";
import type { Game } from "./types";
import { normalizeAvatarId } from "@/lib/avatars";

export interface PlayerView {
  id: string;
  seat: number;
  displayName: string;
  avatarId: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  isYou: boolean;
}

export interface RevealedHandView {
  playerId: string;
  privateUsed: Card[];
  communityUsed: Card[];
  fiveCard: Card[];
  handName: string;
}

export interface BoardView {
  boardId: BoardId;
  flop: Card[];
  turn: Card | null; // null while face-down
  river: Card | null; // null while face-down
  /** Live win-probability per player (percent). Null before assignments reveal. */
  equity: Record<string, number> | null;
  /** Set once the river is revealed if a winner holds quads or better. */
  highHand: { winner: string; handName: string } | null;
  /** Per-player 4 assigned cards, only for players whose assignment is revealed. */
  assignments: Record<string, Card[]>;
  /** Populated once this board's result is revealed. */
  result: {
    resultType: string;
    winners: string[];
    losers: string[];
    premiumMultiplier: number;
    sweepMultiplier: number;
    totalMultiplier: number;
    net: Record<string, number>;
    explanation: string;
    hands: RevealedHandView[];
  } | null;
}

export interface GameView {
  id: string;
  code: string;
  phase: Game["phase"];
  version: number;
  playerCount: number;
  boardValueCents: number;
  completedRounds: number;
  players: PlayerView[];
  cumulative: Record<string, number>;
  you: {
    playerId: string;
    isHost: boolean;
    privateCards: Card[]; // only YOUR cards
    assignment: Record<BoardId, Card[]> | null;
    ready: boolean;
  } | null;
  round: {
    roundNumber: number;
    revealStep: string | null;
    boards: BoardView[];
    /** Running net for this round from boards revealed so far (reveal only). */
    runningNet: Record<string, number> | null;
    sweep: { applied: boolean; winner: string | null; delta: Record<string, number> } | null;
    roundNet: Record<string, number> | null;
  } | null;
  settlement: { payments: { from: string; to: string; amountCents: number }[] } | null;
  endedAt: number | null;
  emailStatus: Game["emailStatus"];
  /** Practice-vs-CPU room. */
  practice: boolean;
  chat: {
    id: string;
    playerId: string;
    displayName: string;
    text: string;
    createdAt: number;
    isSpectator?: boolean;
  }[];
  chatRevision: number;
  /** Named watchers currently in the room. */
  spectatorCount: number;
  /** True when this client is watching (no seat). */
  youAreSpectator: boolean;
  /** Your spectator id when watching. */
  spectatorId: string | null;
}

function revealIndex(revealStep: string | null): number {
  if (!revealStep) return -1;
  return REVEAL_SEQUENCE.indexOf(revealStep as (typeof REVEAL_SEQUENCE)[number]);
}

export function buildView(
  game: Game,
  viewerPlayerId: string | null,
  viewerSpectatorId: string | null = null
): GameView {
  const viewer = game.players.find((p) => p.id === viewerPlayerId) ?? null;
  const round = game.round;
  const summary = game.phase === "ROUND_SUMMARY" || game.phase === "GAME_ENDED";

  const players: PlayerView[] = game.players.map((p) => ({
    id: p.id,
    seat: p.seat,
    displayName: p.displayName,
    avatarId: normalizeAvatarId(p.avatarId),
    isHost: p.isHost,
    connected: p.connected,
    ready: round ? Boolean(round.ready[p.id]) : false,
    isYou: p.id === viewerPlayerId,
  }));

  let you: GameView["you"] = null;
  if (viewer) {
    const priv = round?.deal.private[viewer.seat] ?? [];
    you = {
      playerId: viewer.id,
      isHost: viewer.isHost,
      privateCards: round ? priv : [],
      assignment: round ? (round.assignments[viewer.id] as Record<BoardId, Card[]> | null) : null,
      ready: round ? Boolean(round.ready[viewer.id]) : false,
    };
  }

  let roundView: GameView["round"] = null;
  if (round && !round.cancelled) {
    const idx = summary ? REVEAL_SEQUENCE.length : revealIndex(round.revealStep);
    const result = round.result;

    const boards: BoardView[] = BOARD_ORDER.map((boardId, boardPos) => {
      const base = boardPos * 4;
      const assignmentsRevealed = idx >= base;
      const turnRevealed = idx >= base + 1;
      const riverRevealed = idx >= base + 2;
      const resultRevealed = idx >= base + 3 || summary;

      const community = round.deal.boards[boardId];

      const assignments: Record<string, Card[]> = {};
      for (const p of game.players) {
        const a = round.assignments[p.id];
        if (!a) continue;
        // A player always sees their own assignment; others only once revealed.
        if (p.id === viewerPlayerId || assignmentsRevealed) {
          assignments[p.id] = a[boardId];
        }
      }

      let resultView: BoardView["result"] = null;
      if (resultRevealed && result) {
        // Use final scores at summary, provisional during progressive reveal.
        const bs = summary ? result.final[boardId] : result.provisional[boardId];
        const bo = result.outcomes[boardId];
        const fullCommunity: Card[] = [...community.flop, community.turn, community.river];
        const hands: RevealedHandView[] = game.players.map((p) => {
          const a = round.assignments[p.id]!;
          const ev = evaluateOmaha(a[boardId], fullCommunity);
          return {
            playerId: p.id,
            privateUsed: [...ev.privateUsed],
            communityUsed: [...ev.communityUsed],
            fiveCard: ev.cards,
            handName: ev.name,
          };
        });
        // Replace internal player ids with display names in the explanation.
        let explanation = bs.explanation;
        for (const p of game.players) explanation = explanation.split(p.id).join(p.displayName);

        resultView = {
          resultType: bo.resultType,
          winners: bo.winners,
          losers: bo.losers,
          premiumMultiplier: bs.premiumMultiplier,
          sweepMultiplier: bs.sweepMultiplier,
          totalMultiplier: bs.totalMultiplier,
          net: bs.net,
          explanation,
          hands,
        };
      }

      // A winning quads-or-better hand triggers a HIGH HAND callout, shown from
      // the river reveal (before the payout) onwards.
      let highHand: BoardView["highHand"] = null;
      if (riverRevealed && result) {
        const bo = result.outcomes[boardId];
        const fullCommunity: Card[] = [...community.flop, community.turn, community.river];
        for (const winnerId of bo.winners) {
          const a = round.assignments[winnerId];
          if (!a) continue;
          const ev = evaluateOmaha(a[boardId], fullCommunity);
          if (isPremiumHand(ev)) {
            highHand = { winner: winnerId, handName: ev.name };
            break;
          }
        }
      }

      return {
        boardId,
        flop: [...community.flop],
        turn: turnRevealed ? community.turn : null,
        river: riverRevealed ? community.river : null,
        equity: assignmentsRevealed ? round.equity[boardId] ?? null : null,
        highHand,
        assignments,
        result: resultView,
      };
    });

    // Running total for the round from boards revealed so far. Once the sweep
    // step is reached (or at summary), switch to final (sweep-adjusted) values.
    const revealing = game.phase === "REVEALING" || game.phase === "READY_TO_REVEAL";
    const sweepReached = summary || round.revealStep === "SWEEP_EVAL";
    let runningNet: Record<string, number> | null = null;
    if (revealing && result) {
      runningNet = {};
      for (const p of game.players) runningNet[p.id] = 0;
      BOARD_ORDER.forEach((b, pos) => {
        const resultRevealed = idx >= pos * 4 + 3;
        if (!resultRevealed) return;
        const bs = sweepReached ? result.final[b] : result.provisional[b];
        for (const p of game.players) runningNet![p.id]! += bs.net[p.id] ?? 0;
      });
    }

    let sweep: { applied: boolean; winner: string | null; delta: Record<string, number> } | null =
      null;
    if ((sweepReached || summary) && result) {
      const delta: Record<string, number> = {};
      for (const p of game.players) {
        const fin = BOARD_ORDER.reduce((a, b) => a + (result.final[b].net[p.id] ?? 0), 0);
        const prov = BOARD_ORDER.reduce((a, b) => a + (result.provisional[b].net[p.id] ?? 0), 0);
        delta[p.id] = fin - prov;
      }
      sweep = { applied: result.sweepApplied, winner: result.sweepWinner, delta };
    }

    roundView = {
      roundNumber: round.roundNumber,
      revealStep: round.revealStep,
      boards,
      runningNet,
      sweep,
      roundNet: summary && result ? result.roundNet : null,
    };
  }

  let settlement: GameView["settlement"] = null;
  if (game.phase === "GAME_ENDED") {
    const { payments } = computeSettlement(game.cumulative);
    settlement = { payments };
  }

  return {
    id: game.id,
    code: game.code,
    phase: game.phase,
    version: game.version,
    playerCount: game.playerCount,
    boardValueCents: game.boardValueCents,
    completedRounds: game.completedRounds,
    players,
    cumulative: game.cumulative,
    you,
    round: roundView,
    settlement,
    endedAt: game.endedAt,
    emailStatus: game.emailStatus,
    practice: !!(game.practice || game.players.some((p) => p.isBot)),
    chat: game.chat ?? [],
    chatRevision: game.chatRevision ?? 0,
    spectatorCount: (game.spectators ?? []).length,
    youAreSpectator: Boolean(viewerSpectatorId),
    spectatorId: viewerSpectatorId,
  };
}
