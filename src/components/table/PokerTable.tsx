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

  const renderSeat = (playerId: string, cardsBelow: boolean) => {
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
      >
        {seatCards?.(p.id)}
      </Seat>
    );
  };

  return (
    <div className="table-rail rounded-[2.25rem] p-2.5 sm:p-3">
      {/* overflow-visible so hand-name labels can extend past seat boxes */}
      <div className="table-felt relative overflow-visible rounded-[1.85rem] px-3 pb-8 pt-8 sm:px-6">
        {/* watermark */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="select-none text-6xl font-black tracking-tight text-white/[0.03] sm:text-8xl">
            TRIPLE PLO
          </span>
        </div>

        {/* Opponents across the top */}
        <div
          className={`relative flex ${
            opponents.length > 1 ? "justify-between px-2 sm:px-10" : "justify-center"
          }`}
        >
          {opponents.map((o) => renderSeat(o.id, true))}
        </div>

        {/* Community area */}
        <div className="relative my-3 flex flex-col items-center gap-1.5">
          {potLabel && (
            <div className="mb-1 rounded-full bg-black/45 px-4 py-1 text-xs font-semibold tracking-wide text-accent-soft">
              {potLabel}
            </div>
          )}
          <div className="w-full max-w-full overflow-x-auto">
            <div className="mx-auto w-max">{center}</div>
          </div>
        </div>

        {/* You, anchored at the bottom of the felt */}
        {you && <div className="relative flex justify-center">{renderSeat(you.id, false)}</div>}
      </div>

      {/* Your hand / interactive area, on the rail below the felt */}
      {bottom && <div className="px-1 pt-3 sm:px-3">{bottom}</div>}
    </div>
  );
}
