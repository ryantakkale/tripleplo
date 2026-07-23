/**
 * Card primitives for Triple PLO.
 *
 * A card is represented as a two-character code: <rank><suit>.
 *   rank: 2 3 4 5 6 7 8 9 T J Q K A
 *   suit: c d h s   (clubs, diamonds, hearts, spades)
 *
 * Example: "As" (ace of spades), "Td" (ten of diamonds), "2c" (two of clubs).
 *
 * This module is pure and has no dependency on any runtime service.
 */

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export const SUITS = ["c", "d", "h", "s"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

/** Branded string type for a card code, e.g. "As". */
export type Card = `${Rank}${Suit}`;

/** Numeric rank value used for comparisons. Ace is high (14) by default. */
export const RANK_VALUE: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const RANK_SET = new Set<string>(RANKS);
const SUIT_SET = new Set<string>(SUITS);

export function rankOf(card: Card): Rank {
  return card[0] as Rank;
}

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

export function rankValueOf(card: Card): number {
  return RANK_VALUE[rankOf(card)];
}

export function isCard(value: unknown): value is Card {
  return (
    typeof value === "string" &&
    value.length === 2 &&
    RANK_SET.has(value[0]!) &&
    SUIT_SET.has(value[1]!)
  );
}

/** Returns a fresh, ordered 52-card deck. No jokers. */
export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(`${r}${s}` as Card);
    }
  }
  return deck;
}

/**
 * Validates that a set of cards forms exactly one standard 52-card deck:
 * 52 cards, all valid, no duplicates. Throws with a precise reason otherwise.
 */
export function assertFullDeck(cards: readonly Card[]): void {
  if (cards.length !== 52) {
    throw new Error(`Deck must contain 52 cards, got ${cards.length}`);
  }
  const seen = new Set<string>();
  for (const c of cards) {
    if (!isCard(c)) throw new Error(`Invalid card code: ${String(c)}`);
    if (seen.has(c)) throw new Error(`Duplicate card in deck: ${c}`);
    seen.add(c);
  }
}

/** Returns true if the given cards are all distinct and valid. */
export function allUnique(cards: readonly Card[]): boolean {
  const seen = new Set<string>();
  for (const c of cards) {
    if (!isCard(c) || seen.has(c)) return false;
    seen.add(c);
  }
  return true;
}
