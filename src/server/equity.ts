/**
 * Win-probability (equity) calculation for a single board, used to drive the
 * live percentages shown during the reveal.
 *
 * Server-only: it needs every player's assigned cards. It enumerates the
 * unknown community draws and awards each player a share of the wins (split
 * shares on ties), returning integer percentages that sum to ~100.
 */

import { evaluateOmaha } from "@/core/evaluator";
import type { Card } from "@/core/cards";

function cmp(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export interface EquityPlayer {
  playerId: string;
  cards: Card[]; // 4 assigned cards for this board
}

/**
 * @param players    each player's 4 assigned cards for the board
 * @param flop       the 3 flop cards
 * @param turn       the turn if revealed, else null (enumerated)
 * @param river      the river if revealed, else null (enumerated)
 * @param candidates unknown, still-drawable cards
 */
export function computeEquity(
  players: EquityPlayer[],
  flop: Card[],
  turn: Card | null,
  river: Card | null,
  candidates: Card[]
): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const p of players) tally[p.playerId] = 0;
  let count = 0;

  const evalOne = (community: Card[]) => {
    let best: number[] | null = null;
    const scores = players.map((p) => {
      const s = evaluateOmaha(p.cards, community).score;
      if (best === null || cmp(s, best) > 0) best = s;
      return { id: p.playerId, s };
    });
    const winners = scores.filter((x) => cmp(x.s, best!) === 0);
    const share = 1 / winners.length;
    for (const w of winners) tally[w.id]! += share;
    count++;
  };

  if (turn && river) {
    evalOne([...flop, turn, river]);
  } else if (turn) {
    for (const r of candidates) evalOne([...flop, turn, r]);
  } else {
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        evalOne([...flop, candidates[i]!, candidates[j]!]);
      }
    }
  }

  const out: Record<string, number> = {};
  for (const p of players) {
    out[p.playerId] = count ? Math.round((tally[p.playerId]! / count) * 100) : 0;
  }
  return out;
}
