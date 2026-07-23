/**
 * Round aggregation and sweep handling for Triple PLO.
 *
 * A round is three boards (top/middle/bottom). Sweep is only knowable after all
 * three boards are evaluated, so we:
 *   1. Compute provisional board scores (no sweep multiplier).
 *   2. Detect whether ONE player won all three boards OUTRIGHT (a tie on any
 *      board prevents a sweep).
 *   3. If so, recompute every board with the sweep multiplier applied.
 *
 * Recommended persistence model (see docs): store only FINAL board score events
 * plus a boolean `sweepApplied` on the round. Provisional scores are a UI-only
 * concept; the authoritative score events are always the final ones. This keeps
 * the audit trail simple and avoids double-counting.
 */

import { BOARD_ORDER, type BoardId } from "./deal";
import {
  determineBoardOutcome,
  scoreBoard,
  type BoardOutcome,
  type BoardScore,
  type PlayerBoardHand,
  type PlayerId,
} from "./scoring";

export interface RoundBoardInput {
  boardId: BoardId;
  hands: PlayerBoardHand[];
}

export interface RoundResult {
  boardValueCents: number;
  playerIds: PlayerId[];
  outcomes: Record<BoardId, BoardOutcome>;
  /** Provisional (pre-sweep) board scores — useful for progressive reveal UI. */
  provisional: Record<BoardId, BoardScore>;
  /** Final board scores (sweep applied if applicable). Authoritative. */
  final: Record<BoardId, BoardScore>;
  sweepApplied: boolean;
  sweepWinner: PlayerId | null;
  /** Net cents per player for the whole round (sum of final board nets). */
  roundNet: Record<PlayerId, number>;
  zeroSum: boolean;
}

function detectSweepWinner(outcomes: Record<BoardId, BoardOutcome>): PlayerId | null {
  let candidate: PlayerId | null = null;
  for (const b of BOARD_ORDER) {
    const o = outcomes[b];
    // Sweep requires an OUTRIGHT win (exactly one winner) on every board.
    if (o.winners.length !== 1) return null;
    const winner = o.winners[0]!;
    if (candidate === null) candidate = winner;
    else if (candidate !== winner) return null;
  }
  return candidate;
}

export function scoreRound(
  boards: RoundBoardInput[],
  boardValueCents: number,
  playerIds: PlayerId[]
): RoundResult {
  if (boards.length !== 3) throw new Error(`A round must have 3 boards, got ${boards.length}`);

  const outcomes = {} as Record<BoardId, BoardOutcome>;
  for (const { boardId, hands } of boards) {
    outcomes[boardId] = determineBoardOutcome(hands);
  }

  const provisional = {} as Record<BoardId, BoardScore>;
  for (const b of BOARD_ORDER) {
    provisional[b] = scoreBoard({
      boardValueCents,
      outcome: outcomes[b],
      playerIds,
      sweepApplies: false,
    });
  }

  const sweepWinner = detectSweepWinner(outcomes);
  const sweepApplied = sweepWinner !== null;

  const final = {} as Record<BoardId, BoardScore>;
  for (const b of BOARD_ORDER) {
    final[b] = sweepApplied
      ? scoreBoard({ boardValueCents, outcome: outcomes[b], playerIds, sweepApplies: true })
      : provisional[b];
  }

  const roundNet: Record<PlayerId, number> = {};
  for (const id of playerIds) roundNet[id] = 0;
  for (const b of BOARD_ORDER) {
    for (const id of playerIds) roundNet[id] = (roundNet[id] ?? 0) + (final[b].net[id] ?? 0);
  }

  const zeroSum = Object.values(roundNet).reduce((a, b) => a + b, 0) === 0;

  return {
    boardValueCents,
    playerIds,
    outcomes,
    provisional,
    final,
    sweepApplied,
    sweepWinner,
    roundNet,
    zeroSum,
  };
}
