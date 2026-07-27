"use client";

import type { PlayerView } from "@/server/views";
import { fmt } from "@/lib/client";
import { SeatSpeechBubble } from "@/components/GameChat";

export interface SeatData extends PlayerView {}

export type SeatVariant = "idle" | "arranging" | "ready" | "winner";

// Use ring (outside the box) so thicker status borders never change layout size.
const VARIANT_CLASS: Record<SeatVariant, string> = {
  idle: "border border-transparent ring-1 ring-white/10 bg-black/40",
  arranging: "border border-transparent ring-2 ring-yellow-400/80 bg-yellow-400/5",
  ready: "border border-transparent ring-4 ring-emerald-500 bg-emerald-500/10",
  winner: "border border-transparent ring-2 ring-accent bg-accent/10 animate-winnerGlow",
};

/**
 * A seated player around the table. The border communicates state
 * (yellow = arranging, thick green = ready, glowing gold = board winner).
 * During the reveal it also shows a live win-probability and a floating
 * net delta that fades as the running total updates.
 *
 * Card / equity rows are reserved at a fixed height so the table never grows
 * when private cards or percentages appear. Hand names sit flush against the
 * box (above for opponents, below for you), centered, and may extend past the
 * box width. Felt padding keeps them off the rail.
 *
 * `cardsBelow` places the revealed cards below the box (for opponents seated
 * at the top of the felt) rather than above it (for the local player).
 */
export function Seat({
  player,
  cumulativeCents,
  variant = "idle",
  equity = null,
  deltaCents = null,
  deltaKey,
  handName,
  cardsBelow = false,
  chatSide = "right",
  children,
}: {
  player: SeatData;
  cumulativeCents: number;
  variant?: SeatVariant;
  equity?: number | null;
  deltaCents?: number | null;
  deltaKey?: string | number;
  handName?: string;
  cardsBelow?: boolean;
  /** Which side to park the bubble when cards are showing. */
  chatSide?: "left" | "right";
  children?: React.ReactNode; // revealed cards for the active board
}) {
  const hasCards = Boolean(children);
  const chatPlacement = hasCards ? chatSide : cardsBelow ? "below" : "above";

  // Fixed-height slots so arrange → reveal never resizes the felt.
  // pointer-events-none when empty so the reserved space never steals drags
  // from the hand tray below.
  const cardsEl = (
    <div
      className={`flex h-10 items-end justify-center gap-1 ${children ? "" : "pointer-events-none"}`}
    >
      {children}
    </div>
  );

  const equityEl = (
    <div className="pointer-events-none flex h-5 items-center justify-center">
      {equity != null ? (
        <div className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white shadow ring-1 ring-white/10">
          {equity}%
        </div>
      ) : null}
    </div>
  );

  // Centered against the box; may extend past the box edges. Absolute so 1-line
  // vs 2-line names don't leave awkward empty gaps or resize the table.
  const handNameEl = handName ? (
    <div
      className={`pointer-events-none absolute left-1/2 z-10 w-max max-w-[12rem] -translate-x-1/2 text-center text-[10px] font-medium leading-tight text-accent-soft ${
        cardsBelow ? "bottom-full mb-1" : "top-full mt-1"
      }`}
    >
      {handName}
    </div>
  ) : null;

  const pillEl = (
    <div className="relative w-full">
      {handNameEl}
      <SeatSpeechBubble playerId={player.id} placement={chatPlacement} />
      <div
        className={`relative flex w-full items-center gap-2 rounded-2xl px-3 py-2 backdrop-blur transition-colors ${VARIANT_CLASS[variant]}`}
      >
        <div className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/avatars/${player.avatarId || "Default"}.png`}
            alt=""
            className="seat-avatar h-9 w-9 object-cover"
            draggable={false}
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-felt-900 ${
              player.connected ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold leading-tight">{player.displayName}</div>
          <div
            className={`chip-pill mt-0.5 inline-block ${
              cumulativeCents > 0 ? "text-accent" : cumulativeCents < 0 ? "text-red-300" : "text-muted"
            }`}
          >
            {fmt(cumulativeCents)}
          </div>
        </div>
      </div>

      {deltaCents != null && deltaCents !== 0 && (
        <div
          key={deltaKey}
          className={`animate-fadefloat pointer-events-none absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full whitespace-nowrap text-sm font-black drop-shadow ${
            deltaCents > 0 ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {fmt(deltaCents)}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex w-36 flex-col items-center gap-1">
      {cardsBelow ? (
        // Opponents: box, then cards, then percentage. Hand name overlays above box.
        <>
          {pillEl}
          {cardsEl}
          {equityEl}
        </>
      ) : (
        // You: percentage, cards, box. Hand name overlays below box.
        <>
          {equityEl}
          {cardsEl}
          {pillEl}
        </>
      )}
    </div>
  );
}
