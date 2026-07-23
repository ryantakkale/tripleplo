"use client";

import { useEffect, useState } from "react";
import type { GameView, BoardView } from "@/server/views";
import type { Card } from "@/core/cards";
import type { BoardId } from "@/core/deal";
import { BOARD_ORDER } from "@/core/deal";
import { FlipCard } from "./FlipCard";
import { PokerTable } from "./table/PokerTable";
import { CommunityBoard } from "./table/CommunityBoard";
import type { SeatVariant } from "./table/Seat";
import { sortCards } from "@/lib/sort";

const BANNER_MS = 3500;

function boardOfStep(step: string | null): BoardId | null {
  if (!step) return null;
  if (step.startsWith("TOP")) return "top";
  if (step.startsWith("MIDDLE")) return "middle";
  if (step.startsWith("BOTTOM")) return "bottom";
  return null;
}

export function Reveal({ view }: { view: GameView; isHost?: boolean; onUpdate?: (v: GameView) => void }) {
  const round = view.round!;
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.displayName ?? "Player";
  // Under the round-summary overlay we freeze the table (no banners / timers).
  const frozen = view.phase === "ROUND_SUMMARY";
  const step = round.revealStep;
  const isSweepStep = !frozen && step === "SWEEP_EVAL";
  const isResultStep = !frozen && !!step && step.endsWith("RESULT");
  const activeBoard = frozen ? "bottom" : boardOfStep(step) ?? "bottom";
  const byId = Object.fromEntries(round.boards.map((b) => [b.boardId, b])) as Record<BoardId, BoardView>;
  const active = byId[activeBoard]!;
  const activeResult = active.result;
  const sweep = round.sweep;
  const sweepApplied = isSweepStep && !!sweep?.applied;
  // High-hand callout fires on the board RESULT step (after river), before payouts.
  const highHandPending = !frozen && isResultStep && !!active.highHand;

  // Banner-first, then payouts — same pattern for high hand and sweep.
  const [highHandPaid, setHighHandPaid] = useState(false);
  const [sweepPaid, setSweepPaid] = useState(false);

  useEffect(() => {
    if (highHandPending) {
      setHighHandPaid(false);
      const t = setTimeout(() => setHighHandPaid(true), BANNER_MS);
      return () => clearTimeout(t);
    }
    setHighHandPaid(false);
    return undefined;
  }, [highHandPending, activeBoard, round.roundNumber]);

  useEffect(() => {
    if (sweepApplied) {
      setSweepPaid(false);
      const t = setTimeout(() => setSweepPaid(true), BANNER_MS);
      return () => clearTimeout(t);
    }
    setSweepPaid(false);
    return undefined;
  }, [sweepApplied, round.roundNumber]);

  const showHighHandBanner = !frozen && highHandPending && !highHandPaid;
  const showSweepBanner = !frozen && sweepApplied && !sweepPaid;
  // Hold payout UI while a banner is up. Frozen summary always shows final state.
  const payoutsReady = frozen
    ? true
    : isSweepStep
      ? sweepPaid
      : isResultStep
        ? highHandPending
          ? highHandPaid
          : true
        : false;

  // Displayed total = pre-round cumulative + running net from revealed boards.
  // While a banner is up, hold the pre-payout total, then jump when paid.
  const seatCumulative = (pid: string) => {
    const total = (view.cumulative[pid] ?? 0) + (round.runningNet?.[pid] ?? 0);
    if (sweepApplied && !sweepPaid) return total - (sweep!.delta[pid] ?? 0);
    if (isResultStep && highHandPending && !highHandPaid && activeResult) {
      return total - (activeResult.net[pid] ?? 0);
    }
    return total;
  };

  const seatVariant = (pid: string): SeatVariant =>
    payoutsReady && activeResult && activeResult.winners.includes(pid) ? "winner" : "idle";

  const seatEquity = (pid: string) => active.equity?.[pid] ?? null;

  const seatDelta = (pid: string) => {
    if (!payoutsReady) return null;
    if (isSweepStep) return sweep!.delta[pid] ?? null;
    if (activeResult) return activeResult.net[pid] ?? null;
    return null;
  };
  const seatDeltaKey = (pid: string) =>
    sweepPaid ? `sweep-${pid}` : `${activeBoard}-result-${pid}`;

  // Hand names appear with the payout (not under the high-hand banner).
  const seatHandName = (pid: string) =>
    payoutsReady && activeResult
      ? activeResult.hands.find((h) => h.playerId === pid)?.handName
      : undefined;

  // Each player's 4 cards for the active board, once the assignments are revealed.
  const seatCards = (pid: string) => {
    const cards = active.assignments[pid];
    if (!cards || cards.length === 0) return null;
    const used =
      payoutsReady && activeResult
        ? new Set<Card>([
            ...(activeResult.hands.find((h) => h.playerId === pid)?.privateUsed ?? []),
          ])
        : null;
    return sortCards(cards as Card[]).map((c, i) => (
      <FlipCard
        key={c}
        card={c}
        size="xs"
        dealDelayMs={80 + i * 90}
        dimmed={used ? !used.has(c) : false}
      />
    ));
  };

  const center = (
    <div className="flex flex-col gap-1.5">
      {BOARD_ORDER.map((b) => {
        const bv = byId[b]!;
        // Highlight the winner's 3 community cards ONLY once payouts are shown
        // on the active board; earlier boards return to normal shading.
        let usedCommunity: Set<Card> | null = null;
        if (b === activeBoard && !isSweepStep && payoutsReady && bv.result) {
          usedCommunity = new Set<Card>();
          for (const h of bv.result.hands) {
            if (bv.result.winners.includes(h.playerId)) {
              for (const c of h.communityUsed) usedCommunity.add(c);
            }
          }
        }
        return (
          <CommunityBoard
            key={b}
            boardId={b}
            flop={bv.flop}
            turn={bv.turn}
            river={bv.river}
            size="sm"
            active={activeBoard === b && !isSweepStep}
            usedCommunity={usedCommunity}
          />
        );
      })}
    </div>
  );

  return (
    <div className="relative">
      <PokerTable
        view={view}
        center={center}
        seatVariant={seatVariant}
        seatEquity={seatEquity}
        seatDelta={seatDelta}
        seatDeltaKey={seatDeltaKey}
        seatHandName={seatHandName}
        seatCumulative={seatCumulative}
        seatCards={seatCards}
        potLabel={`$${(view.boardValueCents / 100).toFixed(2)} per board`}
      />

      {showSweepBanner && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center">
          <div className="animate-sweepPop rounded-3xl bg-black/70 px-10 py-6 text-center shadow-2xl ring-1 ring-white/10 backdrop-blur-sm">
            <div className="sweep-text text-4xl font-black uppercase tracking-tight sm:text-6xl">
              {nameOf(sweep!.winner ?? "")} sweeps
            </div>
          </div>
        </div>
      )}

      {showHighHandBanner && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center">
          <div className="animate-sweepPop rounded-3xl bg-black/70 px-10 py-6 text-center shadow-2xl ring-1 ring-white/10 backdrop-blur-sm">
            <div className="sweep-text text-4xl font-black uppercase tracking-tight sm:text-6xl">
              High Hand
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
