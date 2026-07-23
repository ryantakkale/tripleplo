/**
 * Poker hand evaluation for Triple PLO.
 *
 * Two layers:
 *   1. `evaluateFive` — ranks any 5 cards into a comparable value.
 *   2. `evaluateOmaha` — enforces the exact Omaha rule (use EXACTLY 2 of the 4
 *      assigned private cards + EXACTLY 3 of the 5 community cards) by brute
 *      forcing all 6 x 10 = 60 valid five-card hands and keeping the best.
 *
 * Comparison model: each hand produces a `score: number[]` vector whose first
 * element is the category (1..9) followed by tiebreak ranks in descending
 * importance. Vectors are compared lexicographically, so equal vectors mean a
 * genuine tie (identical hand strength), which is what drives tie / sweep logic.
 */

import { rankValueOf, suitOf, type Card } from "./cards";

export enum HandCategory {
  HighCard = 1,
  OnePair = 2,
  TwoPair = 3,
  ThreeOfAKind = 4,
  Straight = 5,
  Flush = 6,
  FullHouse = 7,
  FourOfAKind = 8,
  StraightFlush = 9,
}

export interface HandValue {
  category: HandCategory;
  /** Category (1..9) followed by tiebreakers, compared lexicographically. */
  score: number[];
  /** The exact 5 cards forming the hand. */
  cards: Card[];
  /** Human-readable name, e.g. "Full House, Kings full of Twos" or "Royal Flush". */
  name: string;
  /** True when the hand is a straight flush with A-high (10-J-Q-K-A). */
  isRoyalFlush: boolean;
}

export interface OmahaResult extends HandValue {
  /** The exactly-2 private cards used. */
  privateUsed: [Card, Card];
  /** The exactly-3 community cards used. */
  communityUsed: [Card, Card, Card];
}

const RANK_NAMES: Record<number, string> = {
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
  11: "Jack",
  12: "Queen",
  13: "King",
  14: "Ace",
};
const RANK_NAMES_PLURAL: Record<number, string> = {
  2: "Twos",
  3: "Threes",
  4: "Fours",
  5: "Fives",
  6: "Sixes",
  7: "Sevens",
  8: "Eights",
  9: "Nines",
  10: "Tens",
  11: "Jacks",
  12: "Queens",
  13: "Kings",
  14: "Aces",
};

/** Lexicographic comparison of two score vectors. >0 if a beats b. */
export function compareScores(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Detects a straight from descending-unique rank values. Returns the straight
 *  high card (5 for the wheel) or null. */
function straightHigh(uniqueDesc: number[]): number | null {
  // Normal straights.
  for (let i = 0; i + 4 < uniqueDesc.length; i++) {
    const top = uniqueDesc[i]!;
    let ok = true;
    for (let k = 1; k < 5; k++) {
      if (uniqueDesc[i + k] !== top - k) {
        ok = false;
        break;
      }
    }
    if (ok) return top;
  }
  // Wheel: A-2-3-4-5 (Ace counts low).
  if (
    uniqueDesc.includes(14) &&
    uniqueDesc.includes(5) &&
    uniqueDesc.includes(4) &&
    uniqueDesc.includes(3) &&
    uniqueDesc.includes(2)
  ) {
    return 5;
  }
  return null;
}

/** Evaluates exactly 5 cards. Throws if not given 5 distinct cards. */
export function evaluateFive(cards: readonly Card[]): HandValue {
  if (cards.length !== 5) throw new Error(`evaluateFive requires 5 cards, got ${cards.length}`);

  const values = cards.map(rankValueOf).sort((a, b) => b - a); // desc
  const suits = cards.map(suitOf);
  const isFlush = suits.every((s) => s === suits[0]);

  // Count rank frequencies.
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  // Sort ranks by (count desc, rank desc).
  const grouped = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));

  const uniqueDesc = [...new Set(values)].sort((a, b) => b - a);
  const sHigh = straightHigh(uniqueDesc);

  const cardsCopy = cards.slice();

  // Straight flush (incl. royal). Since all 5 share a suit and form a straight.
  if (isFlush && sHigh !== null) {
    const isRoyal = sHigh === 14;
    return {
      category: HandCategory.StraightFlush,
      score: [HandCategory.StraightFlush, sHigh],
      cards: cardsCopy,
      name: isRoyal ? "Royal Flush" : `Straight Flush, ${RANK_NAMES[sHigh]}-high`,
      isRoyalFlush: isRoyal,
    };
  }

  const [g0, g1, g2] = grouped;

  // Four of a kind.
  if (g0 && g0[1] === 4) {
    const quad = g0[0];
    const kicker = grouped[1]![0];
    return {
      category: HandCategory.FourOfAKind,
      score: [HandCategory.FourOfAKind, quad, kicker],
      cards: cardsCopy,
      name: `Four of a Kind, ${RANK_NAMES_PLURAL[quad]}`,
      isRoyalFlush: false,
    };
  }

  // Full house.
  if (g0 && g0[1] === 3 && g1 && g1[1] === 2) {
    return {
      category: HandCategory.FullHouse,
      score: [HandCategory.FullHouse, g0[0], g1[0]],
      cards: cardsCopy,
      name: `Full House, ${RANK_NAMES_PLURAL[g0[0]]} full of ${RANK_NAMES_PLURAL[g1[0]]}`,
      isRoyalFlush: false,
    };
  }

  // Flush.
  if (isFlush) {
    return {
      category: HandCategory.Flush,
      score: [HandCategory.Flush, ...values],
      cards: cardsCopy,
      name: `Flush, ${RANK_NAMES[values[0]!]}-high`,
      isRoyalFlush: false,
    };
  }

  // Straight.
  if (sHigh !== null) {
    return {
      category: HandCategory.Straight,
      score: [HandCategory.Straight, sHigh],
      cards: cardsCopy,
      name: `Straight, ${RANK_NAMES[sHigh]}-high`,
      isRoyalFlush: false,
    };
  }

  // Three of a kind.
  if (g0 && g0[1] === 3) {
    const trip = g0[0];
    const kickers = values.filter((v) => v !== trip); // 2 kickers, desc
    return {
      category: HandCategory.ThreeOfAKind,
      score: [HandCategory.ThreeOfAKind, trip, ...kickers],
      cards: cardsCopy,
      name: `Three of a Kind, ${RANK_NAMES_PLURAL[trip]}`,
      isRoyalFlush: false,
    };
  }

  // Two pair.
  if (g0 && g0[1] === 2 && g1 && g1[1] === 2) {
    const hi = Math.max(g0[0], g1[0]);
    const lo = Math.min(g0[0], g1[0]);
    const kicker = g2![0];
    return {
      category: HandCategory.TwoPair,
      score: [HandCategory.TwoPair, hi, lo, kicker],
      cards: cardsCopy,
      name: `Two Pair, ${RANK_NAMES_PLURAL[hi]} and ${RANK_NAMES_PLURAL[lo]}`,
      isRoyalFlush: false,
    };
  }

  // One pair.
  if (g0 && g0[1] === 2) {
    const pair = g0[0];
    const kickers = values.filter((v) => v !== pair); // 3 kickers desc
    return {
      category: HandCategory.OnePair,
      score: [HandCategory.OnePair, pair, ...kickers],
      cards: cardsCopy,
      name: `Pair of ${RANK_NAMES_PLURAL[pair]}`,
      isRoyalFlush: false,
    };
  }

  // High card.
  return {
    category: HandCategory.HighCard,
    score: [HandCategory.HighCard, ...values],
    cards: cardsCopy,
    name: `${RANK_NAMES[values[0]!]}-high`,
    isRoyalFlush: false,
  };
}

const PAIRS_2_OF_4: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

const TRIPLES_3_OF_5: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [0, 1, 3],
  [0, 1, 4],
  [0, 2, 3],
  [0, 2, 4],
  [0, 3, 4],
  [1, 2, 3],
  [1, 2, 4],
  [1, 3, 4],
  [2, 3, 4],
];

/**
 * Evaluates a player's best legal Omaha hand on one board.
 *
 * @param privateFour the 4 private cards the player assigned to this board.
 * @param community the 5 community cards (flop, flop, flop, turn, river).
 *
 * Enforces the Omaha rule structurally: it only ever forms hands from exactly
 * 2 private + exactly 3 community cards.
 */
export function evaluateOmaha(
  privateFour: readonly Card[],
  community: readonly Card[]
): OmahaResult {
  if (privateFour.length !== 4) {
    throw new Error(`Omaha requires exactly 4 private cards, got ${privateFour.length}`);
  }
  if (community.length !== 5) {
    throw new Error(`Omaha requires exactly 5 community cards, got ${community.length}`);
  }

  let best: OmahaResult | null = null;

  for (const [p0, p1] of PAIRS_2_OF_4) {
    const priv: [Card, Card] = [privateFour[p0]!, privateFour[p1]!];
    for (const [c0, c1, c2] of TRIPLES_3_OF_5) {
      const comm: [Card, Card, Card] = [community[c0]!, community[c1]!, community[c2]!];
      const value = evaluateFive([priv[0], priv[1], comm[0], comm[1], comm[2]]);
      if (best === null || compareScores(value.score, best.score) > 0) {
        best = { ...value, privateUsed: priv, communityUsed: comm };
      }
    }
  }

  // best cannot be null: 60 combinations were evaluated.
  return best!;
}

/** True if a winning hand qualifies for the premium-hand bonus (quads,
 *  straight flush, or royal flush). Royal is a straight flush, no extra bonus. */
export function isPremiumHand(v: HandValue): boolean {
  return (
    v.category === HandCategory.FourOfAKind || v.category === HandCategory.StraightFlush
  );
}
