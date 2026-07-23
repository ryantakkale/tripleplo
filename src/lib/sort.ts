import { rankValueOf, suitOf, type Card } from "@/core/cards";

const SUIT_ORDER: Record<string, number> = { s: 0, h: 1, d: 2, c: 3 };

/**
 * Sorts cards for display: highest rank first, then by suit for a stable,
 * easy-to-read order (spades, hearts, diamonds, clubs). Pure; returns a copy.
 */
export function sortCards(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const r = rankValueOf(b) - rankValueOf(a);
    if (r !== 0) return r;
    return (SUIT_ORDER[suitOf(a)] ?? 9) - (SUIT_ORDER[suitOf(b)] ?? 9);
  });
}
