import { describe, it, expect } from "vitest";
import { makeDeck, assertFullDeck, allUnique, type Card } from "./cards";
import { secureShuffle, cryptoRandomInt, type RandomInt } from "./shuffle";
import { deal, assertDealIntegrity, BOARD_ORDER } from "./deal";

/** Deterministic RNG for reproducible shuffles in tests. */
function seededRandomInt(seed: number): RandomInt {
  let s = seed >>> 0;
  return (maxExclusive: number) => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s % maxExclusive;
  };
}

describe("deck", () => {
  it("contains 52 unique valid cards", () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(52);
    expect(allUnique(deck)).toBe(true);
    expect(() => assertFullDeck(deck)).not.toThrow();
  });
});

describe("secureShuffle", () => {
  it("preserves all 52 cards (permutation only)", () => {
    const deck = makeDeck();
    const shuffled = secureShuffle(deck, seededRandomInt(12345));
    expect(shuffled).toHaveLength(52);
    expect([...shuffled].sort()).toEqual([...deck].sort());
    expect(() => assertFullDeck(shuffled)).not.toThrow();
  });

  it("does not mutate the input deck", () => {
    const deck = makeDeck();
    const copy = [...deck];
    secureShuffle(deck, seededRandomInt(7));
    expect(deck).toEqual(copy);
  });

  it("cryptoRandomInt returns values in range without bias crashes", () => {
    for (let i = 0; i < 200; i++) {
      const v = cryptoRandomInt(52);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(52);
    }
    expect(cryptoRandomInt(1)).toBe(0);
  });
});

describe("three-player deal", () => {
  const shuffled = secureShuffle(makeDeck(), seededRandomInt(999));
  const d = deal(shuffled, 3);

  it("gives each of 3 players 12 cards", () => {
    expect(d.private).toHaveLength(3);
    for (const hand of d.private) expect(hand).toHaveLength(12);
  });

  it("burns exactly one card", () => {
    expect(d.burns).toHaveLength(1);
  });

  it("leaves no undealt cards (uses all 52)", () => {
    expect(d.undealt).toHaveLength(0);
  });

  it("has 3 flop + turn + river per board", () => {
    for (const b of BOARD_ORDER) {
      expect(d.boards[b].flop).toHaveLength(3);
      expect(typeof d.boards[b].turn).toBe("string");
      expect(typeof d.boards[b].river).toBe("string");
    }
  });

  it("has all unique cards accounting for a full deck", () => {
    expect(() => assertDealIntegrity(d)).not.toThrow();
  });
});

describe("two-player deal", () => {
  const shuffled = secureShuffle(makeDeck(), seededRandomInt(2024));
  const d = deal(shuffled, 2);

  it("gives each of 2 players 12 cards (24 total)", () => {
    expect(d.private).toHaveLength(2);
    expect(d.private.flat()).toHaveLength(24);
  });

  it("burns exactly three cards", () => {
    expect(d.burns).toHaveLength(3);
  });

  it("leaves exactly 10 undealt hidden cards", () => {
    expect(d.undealt).toHaveLength(10);
  });

  it("no burn card appears anywhere else", () => {
    const others: Card[] = [
      ...d.private.flat(),
      ...d.undealt,
      ...BOARD_ORDER.flatMap((b) => [...d.boards[b].flop, d.boards[b].turn, d.boards[b].river]),
    ];
    const otherSet = new Set(others);
    for (const b of d.burns) expect(otherSet.has(b)).toBe(false);
  });

  it("no undealt card appears anywhere else", () => {
    const others: Card[] = [
      ...d.private.flat(),
      ...d.burns,
      ...BOARD_ORDER.flatMap((b) => [...d.boards[b].flop, d.boards[b].turn, d.boards[b].river]),
    ];
    const otherSet = new Set(others);
    for (const u of d.undealt) expect(otherSet.has(u)).toBe(false);
  });

  it("all dealt cards are unique", () => {
    const all: Card[] = [
      ...d.private.flat(),
      ...d.burns,
      ...d.undealt,
      ...BOARD_ORDER.flatMap((b) => [...d.boards[b].flop, d.boards[b].turn, d.boards[b].river]),
    ];
    expect(allUnique(all)).toBe(true);
    expect(all).toHaveLength(52);
  });
});

describe("deal reproducibility", () => {
  it("same shuffled deck yields the same deal (recovery safety)", () => {
    const shuffled = secureShuffle(makeDeck(), seededRandomInt(555));
    const a = deal(shuffled, 3);
    const b = deal(shuffled, 3);
    expect(a).toEqual(b);
  });
});
