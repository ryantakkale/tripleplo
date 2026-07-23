/**
 * Authoritative deal logic for Triple PLO.
 *
 * Server-only. Produces a fully validated deal from a shuffled deck.
 * The exact card sequence is deterministic given the shuffled deck, which is
 * what makes reconnection / recovery reproducible: persist the deal, never
 * re-shuffle.
 *
 * Three-player deal (uses all 52 cards):
 *   36 private (12 each) + 1 burn + 9 flop + 3 turn + 3 river = 52
 * Two-player deal (uses 42, leaves 10 hidden):
 *   24 private (12 each) + 3 burn + 9 flop + 3 turn + 3 river = 42, +10 undealt
 */

import { assertFullDeck, type Card } from "./cards";

export type BoardId = "top" | "middle" | "bottom";
export const BOARD_ORDER: readonly BoardId[] = ["top", "middle", "bottom"] as const;

export interface CommunityBoard {
  flop: [Card, Card, Card];
  turn: Card;
  river: Card;
}

export interface Deal {
  playerCount: 2 | 3;
  /** private[seatIndex] = 12 cards for that seat. */
  private: Card[][];
  /** Burn cards, in the order they were burned. */
  burns: Card[];
  boards: Record<BoardId, CommunityBoard>;
  /** Cards never dealt (2-player only). Must never be exposed to clients. */
  undealt: Card[];
}

const PRIVATE_PER_PLAYER = 12;

class DeckCursor {
  private i = 0;
  constructor(private readonly cards: readonly Card[]) {}
  take(n: number): Card[] {
    if (this.i + n > this.cards.length) {
      throw new Error(`Deck underflow: needed ${n}, have ${this.cards.length - this.i}`);
    }
    const slice = this.cards.slice(this.i, this.i + n);
    this.i += n;
    return slice;
  }
  takeOne(): Card {
    return this.take(1)[0]!;
  }
  remaining(): Card[] {
    return this.cards.slice(this.i);
  }
}

/**
 * Deals from an already-shuffled 52-card deck. Throws if the deck is not a
 * valid full deck. Runs the exact burn sequence for the given player count.
 */
export function deal(shuffled: readonly Card[], playerCount: 2 | 3): Deal {
  assertFullDeck(shuffled);
  const cursor = new DeckCursor(shuffled);

  const priv: Card[][] = [];
  for (let seat = 0; seat < playerCount; seat++) {
    priv.push(cursor.take(PRIVATE_PER_PLAYER));
  }

  const burns: Card[] = [];

  // Burn before the flops (both variants).
  burns.push(cursor.takeOne());

  const flops: Record<BoardId, [Card, Card, Card]> = {
    top: cursor.take(3) as [Card, Card, Card],
    middle: cursor.take(3) as [Card, Card, Card],
    bottom: cursor.take(3) as [Card, Card, Card],
  };

  // Two-player games burn again before turns.
  if (playerCount === 2) burns.push(cursor.takeOne());

  const turns: Record<BoardId, Card> = {
    top: cursor.takeOne(),
    middle: cursor.takeOne(),
    bottom: cursor.takeOne(),
  };

  // Two-player games burn again before rivers.
  if (playerCount === 2) burns.push(cursor.takeOne());

  const rivers: Record<BoardId, Card> = {
    top: cursor.takeOne(),
    middle: cursor.takeOne(),
    bottom: cursor.takeOne(),
  };

  const undealt = cursor.remaining();

  const dealResult: Deal = {
    playerCount,
    private: priv,
    burns,
    boards: {
      top: { flop: flops.top, turn: turns.top, river: rivers.top },
      middle: { flop: flops.middle, turn: turns.middle, river: rivers.middle },
      bottom: { flop: flops.bottom, turn: turns.bottom, river: rivers.bottom },
    },
    undealt,
  };

  assertDealIntegrity(dealResult);
  return dealResult;
}

/**
 * Verifies every dealt/burned/undealt card is unique, counts match the player
 * count, and every one of the original 52 cards is accounted for exactly once.
 * This is the last line of defense before a deal is committed.
 */
export function assertDealIntegrity(d: Deal): void {
  const { playerCount } = d;
  const expectedPrivate = playerCount * PRIVATE_PER_PLAYER;
  const expectedBurns = playerCount === 3 ? 1 : 3;
  const expectedUndealt = playerCount === 3 ? 0 : 10;

  const privateFlat = d.private.flat();
  if (d.private.length !== playerCount) {
    throw new Error(`Expected ${playerCount} private hands, got ${d.private.length}`);
  }
  for (const hand of d.private) {
    if (hand.length !== PRIVATE_PER_PLAYER) {
      throw new Error(`Each player must have ${PRIVATE_PER_PLAYER} cards, got ${hand.length}`);
    }
  }
  if (privateFlat.length !== expectedPrivate) {
    throw new Error(`Expected ${expectedPrivate} private cards, got ${privateFlat.length}`);
  }
  if (d.burns.length !== expectedBurns) {
    throw new Error(`Expected ${expectedBurns} burn cards, got ${d.burns.length}`);
  }
  if (d.undealt.length !== expectedUndealt) {
    throw new Error(`Expected ${expectedUndealt} undealt cards, got ${d.undealt.length}`);
  }

  const all: Card[] = [
    ...privateFlat,
    ...d.burns,
    ...d.undealt,
    ...BOARD_ORDER.flatMap((b) => [...d.boards[b].flop, d.boards[b].turn, d.boards[b].river]),
  ];

  // Every card unique and, together, exactly one full deck.
  assertFullDeck(all);
}
