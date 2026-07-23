/**
 * Final score-sheet generation and transactional email delivery.
 *
 * Delivery is server-side, idempotent (guarded by game.emailStatus), and safe:
 * the game still ends successfully if email temporarily fails. If RESEND_API_KEY
 * is unset (e.g. local dev / the vertical slice) we log the sheet instead of
 * sending, so the flow is fully exercisable without an email provider.
 *
 * The email never exposes session tokens, hidden cards, burns, undealt cards, or
 * any other player's private data. The host's email is used only as the
 * recipient and is never shared with other players.
 */

import { computeSettlement, formatCents } from "@/core/settlement";
import { requireGameById } from "./engine";
import type { Game } from "./types";

export interface FinalScoreSheet {
  gameId: string;
  code: string;
  playedAt: string;
  boardValue: string;
  completedRounds: number;
  players: {
    name: string;
    net: string;
    outrightWins: number;
    tiedWins: number;
    sweeps: number;
    premiumBonuses: number;
  }[];
  pushes: number;
  settlement: string[];
}

export function buildFinalScoreSheet(game: Game): FinalScoreSheet {
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.displayName ?? id;
  const { payments } = computeSettlement(game.cumulative);

  return {
    gameId: game.id,
    code: game.code,
    playedAt: new Date(game.createdAt).toISOString(),
    boardValue: formatCents(game.boardValueCents),
    completedRounds: game.completedRounds,
    players: game.players.map((p) => ({
      name: p.displayName,
      net: formatCents(game.cumulative[p.id] ?? 0),
      outrightWins: game.stats.outrightWins[p.id] ?? 0,
      tiedWins: game.stats.tiedWins[p.id] ?? 0,
      sweeps: game.stats.sweeps[p.id] ?? 0,
      premiumBonuses: game.stats.premiumBonuses[p.id] ?? 0,
    })),
    pushes: game.stats.pushes,
    settlement:
      payments.length === 0
        ? ["No payments needed — everyone is even."]
        : payments.map((p) => `${nameOf(p.from)} pays ${nameOf(p.to)} ${formatCents(p.amountCents)}`),
  };
}

function renderText(sheet: FinalScoreSheet): string {
  const lines: string[] = [];
  lines.push(`Triple PLO — Final Score Sheet`);
  lines.push(`Room ${sheet.code} • ${sheet.boardValue} per board • ${sheet.completedRounds} rounds`);
  lines.push(`Played: ${sheet.playedAt}`);
  lines.push("");
  for (const p of sheet.players) {
    lines.push(
      `${p.name}: ${p.net}  (wins ${p.outrightWins}, tied ${p.tiedWins}, sweeps ${p.sweeps}, premium ${p.premiumBonuses})`
    );
  }
  lines.push(`Pushes: ${sheet.pushes}`);
  lines.push("");
  lines.push("Settlement:");
  for (const s of sheet.settlement) lines.push(`  • ${s}`);
  lines.push("");
  lines.push("This app only keeps score. Settle privately; no payments are processed.");
  return lines.join("\n");
}

/** Sends (or logs) the final score sheet to the host. Idempotent. */
export async function sendFinalScoreEmail(gameId: string): Promise<"sent" | "failed" | "skipped"> {
  const game = requireGameById(gameId);
  if (game.emailStatus === "sent") return "skipped";

  const host = game.players.find((p) => p.isHost);
  const sheet = buildFinalScoreSheet(game);
  const text = renderText(sheet);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Triple PLO <scores@example.com>";

  if (!apiKey || !host?.email) {
    // Vertical-slice / dev path: log instead of sending.
    console.info(`[final-score-sheet:${game.code}]\n${text}`);
    game.emailStatus = "sent";
    return "sent";
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: host.email,
      subject: `Triple PLO — Final Scores (Room ${game.code})`,
      text,
    });
    game.emailStatus = "sent";
    return "sent";
  } catch (err) {
    console.error(`Final-score email failed for ${game.code}:`, err);
    game.emailStatus = "failed";
    return "failed"; // caller should retry; game still ends successfully
  }
}
