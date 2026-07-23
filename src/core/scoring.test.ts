import { describe, it, expect } from "vitest";
import {
  determineBoardOutcome,
  scoreBoard,
  type PlayerBoardHand,
} from "./scoring";

function hand(playerId: string, strength: number, isPremium = false): PlayerBoardHand {
  return { playerId, score: [strength], isPremium };
}

function net(ids: string[], outcomeHands: PlayerBoardHand[], boardValueCents: number, sweep = false) {
  const outcome = determineBoardOutcome(outcomeHands);
  return scoreBoard({ boardValueCents, outcome, playerIds: ids, sweepApplies: sweep });
}

describe("two-player scoring", () => {
  it("$2 outright win: winner +200, loser -200", () => {
    const s = net(["A", "B"], [hand("A", 5), hand("B", 3)], 200);
    expect(s.net).toEqual({ A: 200, B: -200 });
    expect(s.resultType).toBe("TWO_PLAYER_OUTRIGHT");
    expect(s.zeroSum).toBe(true);
  });

  it("$1 and $4 outright scale correctly", () => {
    expect(net(["A", "B"], [hand("A", 5), hand("B", 3)], 100).net).toEqual({ A: 100, B: -100 });
    expect(net(["A", "B"], [hand("A", 5), hand("B", 3)], 400).net).toEqual({ A: 400, B: -400 });
  });

  it("push: no score change", () => {
    const s = net(["A", "B"], [hand("A", 5), hand("B", 5)], 200);
    expect(s.net).toEqual({ A: 0, B: 0 });
    expect(s.resultType).toBe("TWO_PLAYER_PUSH");
  });

  it("premium quads doubles payout ($2 -> +/-400)", () => {
    const s = net(["A", "B"], [hand("A", 8, true), hand("B", 3)], 200);
    expect(s.net).toEqual({ A: 400, B: -400 });
    expect(s.premiumMultiplier).toBe(2);
  });
});

describe("three-player scoring", () => {
  it("$2 outright: winner +400, each loser -200", () => {
    const s = net(["A", "B", "C"], [hand("A", 5), hand("B", 3), hand("C", 2)], 200);
    expect(s.net).toEqual({ A: 400, B: -200, C: -200 });
    expect(s.resultType).toBe("THREE_PLAYER_OUTRIGHT");
    expect(s.zeroSum).toBe(true);
  });

  it("$1 two-way tie: winners +50 each, loser -100 (half-dollar split)", () => {
    const s = net(["A", "B", "C"], [hand("A", 5), hand("B", 5), hand("C", 2)], 100);
    expect(s.net).toEqual({ A: 50, B: 50, C: -100 });
    expect(s.resultType).toBe("THREE_PLAYER_TWO_WAY_TIE");
    expect(s.zeroSum).toBe(true);
  });

  it("$2 two-way tie: winners +100 each, loser -200", () => {
    const s = net(["A", "B", "C"], [hand("A", 5), hand("B", 5), hand("C", 2)], 200);
    expect(s.net).toEqual({ A: 100, B: 100, C: -200 });
  });

  it("three-way push: no changes", () => {
    const s = net(["A", "B", "C"], [hand("A", 5), hand("B", 5), hand("C", 5)], 200);
    expect(s.net).toEqual({ A: 0, B: 0, C: 0 });
    expect(s.resultType).toBe("THREE_PLAYER_THREE_WAY_PUSH");
  });

  it("outright premium straight flush $2: winner +800, losers -400", () => {
    const s = net(["A", "B", "C"], [hand("A", 9, true), hand("B", 3), hand("C", 2)], 200);
    expect(s.net).toEqual({ A: 800, B: -400, C: -400 });
  });

  it("tied premium hand $1: loser -200, winners +100 each", () => {
    const s = net(["A", "B", "C"], [hand("A", 8, true), hand("B", 8, true), hand("C", 2)], 100);
    expect(s.net).toEqual({ A: 100, B: 100, C: -200 });
    expect(s.premiumMultiplier).toBe(2);
    expect(s.zeroSum).toBe(true);
  });
});

describe("integer cents & zero-sum invariants", () => {
  it("every result nets to zero", () => {
    const combos: PlayerBoardHand[][] = [
      [hand("A", 5), hand("B", 3)],
      [hand("A", 5), hand("B", 5)],
      [hand("A", 5), hand("B", 3), hand("C", 2)],
      [hand("A", 5), hand("B", 5), hand("C", 2)],
      [hand("A", 5), hand("B", 5), hand("C", 5)],
    ];
    for (const c of combos) {
      for (const value of [100, 200, 400]) {
        const ids = c.map((h) => h.playerId);
        const s = net(ids, c, value);
        const sum = Object.values(s.net).reduce((a, b) => a + b, 0);
        expect(sum).toBe(0);
        for (const v of Object.values(s.net)) expect(Number.isInteger(v)).toBe(true);
      }
    }
  });
});
