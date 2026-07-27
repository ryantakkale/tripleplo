"use client";

import type { GameView } from "@/server/views";
import type { Card } from "@/core/cards";
import type { BoardId } from "@/core/deal";
import { BOARD_ORDER } from "@/core/deal";
import { PokerTable } from "./table/PokerTable";
import { CommunityBoard } from "./table/CommunityBoard";
import type { SeatVariant } from "./table/Seat";

/** Read-only arrange view for spectators (flops + seats, no hand tray). */
export function SpectatorWatch({ view }: { view: GameView }) {
  const flops = Object.fromEntries(
    (view.round?.boards ?? []).map((b) => [b.boardId, b.flop])
  ) as Record<BoardId, Card[]>;

  const seatVariant = (pid: string): SeatVariant => {
    const p = view.players.find((x) => x.id === pid)!;
    return p.ready ? "ready" : "arranging";
  };

  const center = (
    <div className="flex flex-col gap-1">
      {BOARD_ORDER.map((b) => (
        <CommunityBoard
          key={b}
          boardId={b}
          flop={flops[b] ?? []}
          turn={null}
          river={null}
          size="sm"
          dealFlop
        />
      ))}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PokerTable
        view={view}
        center={center}
        seatVariant={seatVariant}
        potLabel={`$${(view.boardValueCents / 100).toFixed(2)} per board`}
      />
      <p className="mt-2 shrink-0 text-center text-sm text-muted">
        Watching as spectator — players are arranging their hands.
      </p>
    </div>
  );
}
