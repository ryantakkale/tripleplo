import { describe, it, expect } from "vitest";
import {
  evaluateFive,
  evaluateOmaha,
  compareScores,
  isPremiumHand,
  HandCategory,
} from "./evaluator";
import type { Card } from "./cards";

describe("evaluateFive categories", () => {
  const cases: Array<[string, Card[], HandCategory, boolean]> = [
    ["royal flush", ["As", "Ks", "Qs", "Js", "Ts"], HandCategory.StraightFlush, true],
    ["straight flush", ["9s", "8s", "7s", "6s", "5s"], HandCategory.StraightFlush, false],
    ["four of a kind", ["As", "Ac", "Ad", "Ah", "Ks"], HandCategory.FourOfAKind, false],
    ["full house", ["Ks", "Kc", "Kd", "2s", "2c"], HandCategory.FullHouse, false],
    ["flush", ["As", "Js", "9s", "5s", "2s"], HandCategory.Flush, false],
    ["straight", ["9s", "8d", "7c", "6h", "5s"], HandCategory.Straight, false],
    ["wheel straight", ["As", "2d", "3c", "4h", "5s"], HandCategory.Straight, false],
    ["three of a kind", ["As", "Ac", "Ad", "Ks", "Qc"], HandCategory.ThreeOfAKind, false],
    ["two pair", ["As", "Ac", "Ks", "Kc", "Qd"], HandCategory.TwoPair, false],
    ["one pair", ["As", "Ac", "Ks", "Qd", "Jc"], HandCategory.OnePair, false],
    ["high card", ["As", "Ks", "Qd", "Jc", "9s"], HandCategory.HighCard, false],
  ];
  for (const [name, cards, cat, royal] of cases) {
    it(name, () => {
      const v = evaluateFive(cards);
      expect(v.category).toBe(cat);
      expect(v.isRoyalFlush).toBe(royal);
    });
  }

  it("wheel straight ranks 5-high (below 6-high straight)", () => {
    const wheel = evaluateFive(["As", "2d", "3c", "4h", "5s"]);
    const six = evaluateFive(["2s", "3d", "4c", "5h", "6s"]);
    expect(compareScores(six.score, wheel.score)).toBeGreaterThan(0);
  });

  it("compares full houses by trip rank", () => {
    const kingsFull = evaluateFive(["Ks", "Kc", "Kd", "2s", "2c"]);
    const queensFull = evaluateFive(["Qs", "Qc", "Qd", "As", "Ac"]);
    expect(compareScores(kingsFull.score, queensFull.score)).toBeGreaterThan(0);
  });

  it("compares flushes by high cards", () => {
    const aHigh = evaluateFive(["As", "Js", "9s", "5s", "2s"]);
    const kHigh = evaluateFive(["Ks", "Js", "9s", "5s", "2s"]);
    expect(compareScores(aHigh.score, kHigh.score)).toBeGreaterThan(0);
  });

  it("compares by kicker", () => {
    const aceKingK = evaluateFive(["As", "Ac", "Ks", "Qd", "Jc"]);
    const aceQueenK = evaluateFive(["As", "Ac", "Qs", "Jd", "9c"]);
    expect(compareScores(aceKingK.score, aceQueenK.score)).toBeGreaterThan(0);
  });

  it("identical hands tie", () => {
    const a = evaluateFive(["As", "Ac", "Ks", "Qd", "Jc"]);
    const b = evaluateFive(["Ad", "Ah", "Kd", "Qc", "Jh"]);
    expect(compareScores(a.score, b.score)).toBe(0);
  });
});

describe("premium hand detection", () => {
  it("quads and straight flush and royal are premium; others are not", () => {
    expect(isPremiumHand(evaluateFive(["As", "Ac", "Ad", "Ah", "Ks"]))).toBe(true);
    expect(isPremiumHand(evaluateFive(["9s", "8s", "7s", "6s", "5s"]))).toBe(true);
    expect(isPremiumHand(evaluateFive(["As", "Ks", "Qs", "Js", "Ts"]))).toBe(true);
    expect(isPremiumHand(evaluateFive(["Ks", "Kc", "Kd", "2s", "2c"]))).toBe(false);
    expect(isPremiumHand(evaluateFive(["As", "Js", "9s", "5s", "2s"]))).toBe(false);
  });
});

describe("evaluateOmaha exact two-private / three-community rule", () => {
  it("cannot make a flush with only one private suited card", () => {
    const community: Card[] = ["Ah", "Kh", "Qh", "2h", "3c"]; // 4 hearts
    const priv: Card[] = ["Jh", "2c", "5d", "6d"]; // only one heart
    const r = evaluateOmaha(priv, community);
    expect(r.category).not.toBe(HandCategory.Flush);
  });

  it("makes a flush when the player has two suited private cards", () => {
    // Non-connecting hearts so the best hand is a flush, not a straight flush.
    const community: Card[] = ["Ah", "Kh", "Qh", "2h", "3c"];
    const priv: Card[] = ["Jh", "8h", "5d", "6d"]; // two hearts (J,8) -> A K Q J 8 flush
    const r = evaluateOmaha(priv, community);
    expect(r.category).toBe(HandCategory.Flush);
    // exactly two private + three community
    expect(r.privateUsed).toHaveLength(2);
    expect(r.communityUsed).toHaveLength(3);
  });

  it("cannot make a straight that would require only one private card", () => {
    // Board has 5-6-7-8 (four to a straight). A lone 9 cannot complete it in
    // Omaha because that would use only one private card.
    const community: Card[] = ["5c", "6d", "7h", "8s", "Kd"];
    const priv: Card[] = ["9c", "2h", "Jd", "Qs"]; // no second card adjacent to the run
    const r = evaluateOmaha(priv, community);
    expect(r.category).not.toBe(HandCategory.Straight);
  });

  it("cannot make quads without a valid two-private combination", () => {
    // Only one king on the board, so quad kings need 3 private kings -> impossible.
    const community: Card[] = ["Ah", "Ad", "Ac", "Kh", "2c"];
    const priv: Card[] = ["Kc", "Ks", "3d", "4d"]; // two private kings, one board king
    const r = evaluateOmaha(priv, community);
    expect(r.category).not.toBe(HandCategory.FourOfAKind);
    // Best legal hand here is aces full of kings (KK private + AAA community).
    expect(r.category).toBe(HandCategory.FullHouse);
  });

  it("always reports exactly two private and three community cards used", () => {
    const community: Card[] = ["As", "Kd", "7h", "2c", "9s"];
    const priv: Card[] = ["Ah", "Kh", "Qh", "Jh"];
    const r = evaluateOmaha(priv, community);
    expect(r.privateUsed).toHaveLength(2);
    expect(r.communityUsed).toHaveLength(3);
    // The two private cards must come from priv; the three community from community.
    for (const c of r.privateUsed) expect(priv).toContain(c);
    for (const c of r.communityUsed) expect(community).toContain(c);
  });
});
