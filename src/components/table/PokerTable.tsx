"use client";

import type { GameView } from "@/server/views";
import { Seat, type SeatVariant } from "./Seat";

/**
 * The poker table: opponents seated across the top of the felt, the community
 * area in the middle, and the local player anchored at the bottom. Uses a
 * resilient flex layout (rather than fragile absolute-oval math) so it holds up
 * on phone / tablet / desktop.
 */
export function PokerTable({
  view,
  center,
  bottom,
  overlay,
  seatVariant,
  seatEquity,
  seatDelta,
  seatDeltaKey,
  seatHandName,
  seatCumulative,
  seatCards,
  potLabel,
}: {
  view: GameView;
  center: React.ReactNode;
  bottom?: React.ReactNode;
  /** Centered on the felt (high-hand / sweep banners). */
  overlay?: React.ReactNode;
  seatVariant?: (playerId: string) => SeatVariant;
  seatEquity?: (playerId: string) => number | null;
  seatDelta?: (playerId: string) => number | null;
  seatDeltaKey?: (playerId: string) => string | number | undefined;
  seatHandName?: (playerId: string) => string | undefined;
  seatCumulative?: (playerId: string) => number;
  seatCards?: (playerId: string) => React.ReactNode;
  potLabel?: React.ReactNode;
}) {
  const you = view.players.find((p) => p.isYou);
  const opponents = view.players.filter((p) => !p.isYou);

  const renderSeat = (
    playerId: string,
    cardsBelow: boolean,
    chatSide: "left" | "right"
  ) => {
    const p = view.players.find((x) => x.id === playerId)!;
    return (
      <Seat
        key={p.id}
        player={p}
        cumulativeCents={seatCumulative?.(p.id) ?? view.cumulative[p.id] ?? 0}
        variant={seatVariant?.(p.id) ?? "idle"}
        equity={seatEquity?.(p.id) ?? null}
        deltaCents={seatDelta?.(p.id) ?? null}
        deltaKey={seatDeltaKey?.(p.id)}
        handName={seatHandName?.(p.id)}
        cardsBelow={cardsBelow}
        chatSide={chatSide}
      >
        {seatCards?.(p.id)}
      </Seat>
    );
  };

  return (
    <div className="table-rail flex h-full min-h-0 flex-col rounded-[1.5rem] p-1.5 sm:rounded-[1.75rem] sm:p-2">
      {/* Compact felt — packed height; hand docks to the bottom of the rail. */}
      <div className="table-felt relative shrink-0 overflow-visible rounded-[1.2rem] px-2 pb-7 pt-7 sm:rounded-[1.4rem] sm:px-3 sm:pb-8 sm:pt-8">
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="select-none text-4xl font-black tracking-tight text-white/[0.03] sm:text-6xl">
            TRIPLE PLO
          </span>
        </div>

        <div
          className={`relative flex ${
            opponents.length > 1 ? "justify-between px-1 sm:px-6" : "justify-center"
          }`}
        >
          {opponents.map((o, i) => {
            const side =
              opponents.length === 1 ? "left" : i === 0 ? "right" : "left";
            return renderSeat(o.id, true, side);
          })}
        </div>

        <div className="relative mt-2 flex flex-col items-center gap-1 sm:mt-2.5">
          {potLabel && (
            <div className="rounded-full bg-black/45 px-3 py-0.5 text-[11px] font-semibold tracking-wide text-accent-soft">
              {potLabel}
            </div>
          )}
          <div className="w-full max-w-full overflow-x-auto overflow-y-hidden">
            <div className="mx-auto w-max">{center}</div>
          </div>
        </div>

        {you && (
          <div className="relative mt-2 flex justify-center sm:mt-2.5">
            {renderSeat(you.id, false, "left")}
          </div>
        )}

        {overlay && (
          <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center p-4">
            {overlay}
          </div>
        )}
      </div>

      {bottom ? <div className="min-h-0 flex-1" aria-hidden /> : null}

      {bottom && <div className="shrink-0 px-0.5 pt-1.5 sm:px-1 sm:pt-2">{bottom}</div>}
    </div>
  );
}
