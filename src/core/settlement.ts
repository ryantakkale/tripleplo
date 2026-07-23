/**
 * Final settlement for Triple PLO.
 *
 * Pure function. Accepts every player's final net balance in cents (must sum to
 * zero) and returns a minimized list of payments. For 2-3 players the greedy
 * debtor/creditor match is provably minimal, but the algorithm generalizes.
 *
 * The app never moves money — this is a printed instruction list only.
 */

import type { PlayerId } from "./scoring";

export interface Payment {
  from: PlayerId; // debtor
  to: PlayerId; // creditor
  amountCents: number; // positive
}

export interface SettlementResult {
  payments: Payment[];
  zeroSum: boolean;
}

export function computeSettlement(balances: Record<PlayerId, number>): SettlementResult {
  const entries = Object.entries(balances);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  const zeroSum = total === 0;
  if (!zeroSum) {
    throw new Error(`Settlement balances must sum to zero, got ${total} cents`);
  }

  // Stable order keeps output deterministic for tests and audits.
  const creditors = entries
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, amount: v }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  const debtors = entries
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, amount: -v }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const payments: Payment[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci]!;
    const d = debtors[di]!;
    const pay = Math.min(c.amount, d.amount);
    if (pay > 0) {
      payments.push({ from: d.id, to: c.id, amountCents: pay });
    }
    c.amount -= pay;
    d.amount -= pay;
    if (c.amount === 0) ci++;
    if (d.amount === 0) di++;
  }

  return { payments, zeroSum };
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}
