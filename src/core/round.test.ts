import { describe, it, expect } from "vitest";
import { scoreRound, type RoundBoardInput } from "./round";
import type { PlayerBoardHand } from "./scoring";

function h(playerId: string, strength: number, isPremium = false): PlayerBoardHand {
  return { playerId, score: [strength], isPremium };
}

describe("sweep detection and scoring", () => {
  it("two-player sweep $2: A +1200, B -1200", () => {
    const ids = ["A", "B"];
    const boards: RoundBoardInput[] = [
      { boardId: "top", hands: [h("A", 5), h("B", 3)] },
      { boardId: "middle", hands: [h("A", 5), h("B", 3)] },
      { boardId: "bottom", hands: [h("A", 5), h("B", 3)] },
    ];
    const r = scoreRound(boards, 200, ids);
    expect(r.sweepApplied).toBe(true);
    expect(r.sweepWinner).toBe("A");
    expect(r.roundNet).toEqual({ A: 1200, B: -1200 });
    expect(r.zeroSum).toBe(true);
  });

  it("three-player sweep $2: A +2400, B -1200, C -1200", () => {
    const ids = ["A", "B", "C"];
    const boards: RoundBoardInput[] = [
      { boardId: "top", hands: [h("A", 5), h("B", 3), h("C", 2)] },
      { boardId: "middle", hands: [h("A", 5), h("B", 3), h("C", 2)] },
      { boardId: "bottom", hands: [h("A", 5), h("B", 3), h("C", 2)] },
    ];
    const r = scoreRound(boards, 200, ids);
    expect(r.sweepApplied).toBe(true);
    expect(r.roundNet).toEqual({ A: 2400, B: -1200, C: -1200 });
  });

  it("a tied board prevents a sweep", () => {
    const ids = ["A", "B"];
    const boards: RoundBoardInput[] = [
      { boardId: "top", hands: [h("A", 5), h("B", 3)] },
      { boardId: "middle", hands: [h("A", 5), h("B", 3)] },
      { boardId: "bottom", hands: [h("A", 5), h("B", 5)] }, // tie
    ];
    const r = scoreRound(boards, 200, ids);
    expect(r.sweepApplied).toBe(false);
    // Two outright wins at $2 (no sweep) => A +400, B -400; bottom push.
    expect(r.roundNet).toEqual({ A: 400, B: -400 });
  });

  it("stacked premium + sweep: premium board loser pays $8 in a $2 3p game", () => {
    const ids = ["A", "B", "C"];
    const boards: RoundBoardInput[] = [
      { boardId: "top", hands: [h("A", 8, true), h("B", 3), h("C", 2)] }, // quads
      { boardId: "middle", hands: [h("A", 5), h("B", 3), h("C", 2)] },
      { boardId: "bottom", hands: [h("A", 5), h("B", 3), h("C", 2)] },
    ];
    const r = scoreRound(boards, 200, ids);
    expect(r.sweepApplied).toBe(true);
    // Premium board: base 200 * premium 2 * sweep 2 = 800 per loser.
    expect(r.final.top.amountOwedPerLoser).toBe(800);
    expect(r.final.top.net).toEqual({ A: 1600, B: -800, C: -800 });
    expect(r.final.top.totalMultiplier).toBe(4);
    // Round is zero-sum.
    expect(r.zeroSum).toBe(true);
  });

  it("provisional scores differ from final when a sweep applies", () => {
    const ids = ["A", "B"];
    const boards: RoundBoardInput[] = [
      { boardId: "top", hands: [h("A", 5), h("B", 3)] },
      { boardId: "middle", hands: [h("A", 5), h("B", 3)] },
      { boardId: "bottom", hands: [h("A", 5), h("B", 3)] },
    ];
    const r = scoreRound(boards, 200, ids);
    expect(r.provisional.top.net).toEqual({ A: 200, B: -200 });
    expect(r.final.top.net).toEqual({ A: 400, B: -400 });
  });
});
