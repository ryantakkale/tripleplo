"use client";

import type { GameView } from "@/server/views";
import { fmt } from "@/lib/client";

export function Scoreboard({ view }: { view: GameView }) {
  const sorted = [...view.players].sort(
    (a, b) => (view.cumulative[b.id] ?? 0) - (view.cumulative[a.id] ?? 0)
  );
  return (
    <div className="card-surface p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Scoreboard</h3>
      <div className="space-y-1.5">
        {sorted.map((p) => {
          const c = view.cumulative[p.id] ?? 0;
          return (
            <div key={p.id} className="flex items-center justify-between px-2 py-1.5">
              <span className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${p.connected ? "bg-emerald-400" : "bg-red-400"}`}
                  title={p.connected ? "Connected" : "Disconnected"}
                />
                {p.displayName}
              </span>
              <span className={`font-medium ${c >= 0 ? "text-accent" : "text-red-300"}`}>
                {fmt(c)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
