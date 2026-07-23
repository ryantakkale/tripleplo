"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameView } from "@/server/views";
import type { Card } from "@/core/cards";
import type { BoardId } from "@/core/deal";
import { BOARD_ORDER } from "@/core/deal";
import { FlipCard } from "./FlipCard";
import { PokerTable } from "./table/PokerTable";
import { CommunityBoard } from "./table/CommunityBoard";
import type { SeatVariant } from "./table/Seat";
import { sortCards } from "@/lib/sort";
import { api } from "@/lib/client";

type Local = Record<BoardId, Card[]>;
type DropTarget = BoardId | "unassigned";

export function Arrange({
  view,
  onUpdate,
  onRefresh,
}: {
  view: GameView;
  onUpdate: (v: GameView) => void;
  onRefresh: () => void;
}) {
  const you = view.you!;
  const privateCards = you.privateCards;
  const initial: Local = (you.assignment as Local) ?? { top: [], middle: [], bottom: [] };

  const [assign, setAssign] = useState<Local>(initial);
  const [selected, setSelected] = useState<Card | null>(null);
  /** Seconds left on the cancel window after pressing READY; null = not armed. */
  const [countdown, setCountdown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverTarget, setHoverTarget] = useState<DropTarget | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const assignRef = useRef(assign);
  assignRef.current = assign;

  function clearCountdown() {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    countdownTimer.current = null;
    setCountdown(null);
  }

  useEffect(() => {
    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, []);

  const assignedSet = useMemo(
    () => new Set<Card>([...assign.top, ...assign.middle, ...assign.bottom]),
    [assign]
  );
  const unassigned = sortCards(privateCards.filter((c) => !assignedSet.has(c)));
  const allPlaced = BOARD_ORDER.every((b) => assign[b].length === 4);

  // If cards are moved off boards during the cancel window, abort the lock-in.
  useEffect(() => {
    if (!allPlaced && countdown !== null) clearCountdown();
  }, [allPlaced, countdown]);

  const flops = Object.fromEntries(
    (view.round?.boards ?? []).map((b) => [b.boardId, b.flop])
  ) as Record<BoardId, Card[]>;

  function placeOn(board: BoardId) {
    if (!selected || assign[board].length >= 4 || assignedSet.has(selected)) return;
    setAssign((a) => ({ ...a, [board]: [...a[board], selected] }));
    setSelected(null);
  }
  function removeCard(board: BoardId, card: Card) {
    if (you.ready) return;
    setAssign((a) => ({ ...a, [board]: a[board].filter((c) => c !== card) }));
  }

  /** Move a card to a board (or back to unassigned). */
  function moveCardTo(card: Card, target: DropTarget) {
    if (you.ready) return;
    setAssign((a) => {
      const from = BOARD_ORDER.find((b) => a[b].includes(card));
      // Reject if the target board is full and the card isn't already on it.
      if (target !== "unassigned" && from !== target && a[target].length >= 4) return a;
      const next: Local = { top: [...a.top], middle: [...a.middle], bottom: [...a.bottom] };
      if (from) next[from] = next[from].filter((c) => c !== card);
      if (target !== "unassigned" && from !== target) next[target] = [...next[target], card];
      return next;
    });
    setSelected(null);
  }

  function onCardDragStart(_e: React.DragEvent, _card: Card) {
    setDragging(true);
  }
  function onCardDragEnd() {
    setDragging(false);
    setHoverTarget(null);
  }
  function onDropTo(e: React.DragEvent, target: DropTarget) {
    e.preventDefault();
    e.stopPropagation();
    const card = e.dataTransfer.getData("text/plain") as Card;
    if (card) moveCardTo(card, target);
    setDragging(false);
    setHoverTarget(null);
  }
  const allowDrop = (e: React.DragEvent, target: DropTarget) => {
    if (you.ready) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (hoverTarget !== target) setHoverTarget(target);
  };

  function handleReadyClick() {
    if (countdown !== null) {
      // Cancel the pending lock-in.
      clearCountdown();
      return;
    }
    if (!allPlaced || busy) return;
    clearCountdown();
    setCountdown(3);
    let remaining = 3;
    countdownTimer.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (countdownTimer.current) clearInterval(countdownTimer.current);
        countdownTimer.current = null;
        setCountdown(null);
        void lockIn();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }

  async function lockIn() {
    const locked = assignRef.current;
    setBusy(true);
    setError(null);
    try {
      await api.assign(view.id, {
        top: locked.top,
        middle: locked.middle,
        bottom: locked.bottom,
        idempotencyKey: `assign-${view.id}-${view.round?.roundNumber}-${you.playerId}`,
      });
      const { view: v } = await api.ready(
        view.id,
        `ready-${view.id}-${view.round?.roundNumber}-${you.playerId}`
      );
      onUpdate(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not lock in");
      onRefresh();
    } finally {
      setBusy(false);
      clearCountdown();
    }
  }

  const seatVariant = (pid: string): SeatVariant => {
    const p = view.players.find((x) => x.id === pid)!;
    return p.ready ? "ready" : "arranging";
  };

  // Center: three boards, each with your 4-card slot on the right.
  const center = (
    <div className="flex flex-col gap-1.5">
      {BOARD_ORDER.map((b) => {
        const cards = sortCards(assign[b]);
        const full = cards.length === 4;
        const slots = [0, 1, 2, 3];
        const dropActive = dragging && hoverTarget === b && !full;
        return (
          <CommunityBoard
            key={b}
            boardId={b}
            flop={flops[b] ?? []}
            turn={null}
            river={null}
            size="sm"
            active={(Boolean(selected) && !full) || dropActive}
            dealFlop
            right={
              <div
                className={`flex items-center gap-1 rounded-lg p-1 transition-colors ${
                  dropActive ? "bg-accent/20 ring-1 ring-accent/60" : "bg-black/25"
                }`}
                onDragOver={(e) => allowDrop(e, b)}
                onDragLeave={() => setHoverTarget((t) => (t === b ? null : t))}
                onDrop={(e) => onDropTo(e, b)}
              >
                {slots.map((i) => {
                  const c = cards[i];
                  if (c)
                    return (
                      <FlipCard
                        key={c}
                        card={c}
                        size="xs"
                        onClick={() => removeCard(b, c)}
                        draggable={!you.ready}
                        onDragStart={(e) => onCardDragStart(e, c)}
                        onDragEnd={onCardDragEnd}
                      />
                    );
                  return (
                    <button
                      key={`empty-${i}`}
                      onClick={() => placeOn(b)}
                      disabled={!selected || full}
                      aria-label={`Place on ${b} board`}
                      className={`h-10 w-7 rounded-md border border-dashed transition-colors ${
                        (selected && !full) || dropActive
                          ? "border-accent/70 bg-accent/10"
                          : "border-white/15"
                      } disabled:opacity-40`}
                    />
                  );
                })}
                <span className={`ml-1 text-[10px] font-semibold ${full ? "text-accent" : "text-muted"}`}>
                  {cards.length}/4
                </span>
              </div>
            }
          />
        );
      })}
    </div>
  );

  const readyButtonLabel = busy
    ? "Locking…"
    : countdown !== null
      ? `CANCEL (${countdown})`
      : "READY";

  // Bottom: hand tray is a fixed height so READY never shifts as cards leave.
  const bottom = (
    <div>
      <div
        className={`flex h-[5.5rem] flex-wrap content-center items-center justify-center gap-1.5 overflow-y-auto rounded-xl p-2 transition-colors ${
          !you.ready && dragging && hoverTarget === "unassigned"
            ? "bg-white/5 ring-1 ring-inset ring-white/20"
            : ""
        }`}
        onDragOver={(e) => allowDrop(e, "unassigned")}
        onDragLeave={() => setHoverTarget((t) => (t === "unassigned" ? null : t))}
        onDrop={(e) => onDropTo(e, "unassigned")}
      >
        {you.ready ? (
          <p className="px-2 text-center text-sm text-muted">
            {view.players.every((p) => p.ready)
              ? "Everyone is ready — the reveal is about to begin."
              : `Waiting for: ${view.players
                  .filter((p) => !p.ready)
                  .map((p) => p.displayName)
                  .join(", ")}`}
          </p>
        ) : (
          unassigned.map((c) => (
            <FlipCard
              key={c}
              card={c}
              size="md"
              selected={selected === c}
              onClick={() => setSelected(selected === c ? null : c)}
              draggable={!you.ready}
              onDragStart={(e) => onCardDragStart(e, c)}
              onDragEnd={onCardDragEnd}
            />
          ))
        )}
      </div>
      {error && !you.ready && (
        <p className="mt-2 text-center text-sm text-red-300">{error}</p>
      )}
      <button
        type="button"
        className={
          you.ready
            ? "mt-3 w-full cursor-default rounded-xl bg-yellow-700 px-4 py-3 text-lg font-semibold text-black/80"
            : "mt-3 w-full rounded-xl bg-yellow-400 px-4 py-3 text-lg font-semibold text-black transition-colors hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-yellow-400/35 disabled:text-black/45 disabled:hover:bg-yellow-400/35"
        }
        disabled={you.ready || (!allPlaced && countdown === null) || busy}
        onClick={handleReadyClick}
      >
        {you.ready ? "READY" : readyButtonLabel}
      </button>
    </div>
  );

  return (
    <PokerTable
      view={view}
      center={center}
      bottom={bottom}
      seatVariant={seatVariant}
      potLabel={`$${(view.boardValueCents / 100).toFixed(2)} per board`}
    />
  );
}
