import { describe, it, expect } from "vitest";
import { computeSettlement } from "./settlement";

describe("computeSettlement", () => {
  it("two-player: B pays A $12", () => {
    const r = computeSettlement({ A: 1200, B: -1200 });
    expect(r.payments).toEqual([{ from: "B", to: "A", amountCents: 1200 }]);
  });

  it("three-player: B pays A $10, C pays A $20", () => {
    const r = computeSettlement({ A: 3000, B: -1000, C: -2000 });
    expect(r.payments).toEqual([
      { from: "C", to: "A", amountCents: 2000 },
      { from: "B", to: "A", amountCents: 1000 },
    ]);
  });

  it("handles multiple creditors and debtors", () => {
    const r = computeSettlement({ A: 3000, B: 1000, C: -2500, D: -1500 });
    const total = r.payments.reduce((a, p) => a + p.amountCents, 0);
    expect(total).toBe(4000); // sum of positive balances
    // Reconstruct balances from payments.
    const recon: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const p of r.payments) {
      recon[p.from]! -= p.amountCents;
      recon[p.to]! += p.amountCents;
    }
    expect(recon).toEqual({ A: 3000, B: 1000, C: -2500, D: -1500 });
  });

  it("handles decimal (half-dollar) balances exactly", () => {
    const r = computeSettlement({ A: 50, B: 50, C: -100 });
    const recon: Record<string, number> = { A: 0, B: 0, C: 0 };
    for (const p of r.payments) {
      recon[p.from]! -= p.amountCents;
      recon[p.to]! += p.amountCents;
    }
    expect(recon).toEqual({ A: 50, B: 50, C: -100 });
  });

  it("already-settled game yields no payments", () => {
    const r = computeSettlement({ A: 0, B: 0, C: 0 });
    expect(r.payments).toEqual([]);
  });

  it("rejects non-zero-sum input", () => {
    expect(() => computeSettlement({ A: 100, B: -50 })).toThrow(/sum to zero/);
  });
});
