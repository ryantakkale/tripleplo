"use client";

import { useState } from "react";
import type { GameView } from "@/server/views";
import { api, fmt } from "@/lib/client";

/**
 * Round-complete overlay. Sits on top of the table so the game interface stays
 * visible underneath. Host gets Next Round / End Game; everyone else just sees
 * "Waiting for host".
 */
export function Summary({
  view,
  isHost,
  onUpdate,
}: {
  view: GameView;
  isHost: boolean;
  onUpdate: (v: GameView) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const round = view.round!;

  async function action(kind: "next" | "end") {
    setBusy(kind);
    try {
      const { view: v } =
        kind === "next"
          ? await api.nextRound(view.id, `next-${view.id}-${round.roundNumber}`)
          : await api.end(view.id, `end-${view.id}`);
      onUpdate(v);
    } finally {
      setBusy(null);
      setConfirmEnd(false);
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/55 p-4 pt-10 backdrop-blur-[2px] sm:pt-16">
      <div className="card-surface w-full max-w-md animate-rise p-6 shadow-2xl">
        {/* One shared column so title, rows, and buttons share the same edges. */}
        <div className="flex w-full flex-col gap-5">
          <h2 className="w-full text-xl font-semibold">Round {round.roundNumber} Complete</h2>

          <div className="flex w-full flex-col gap-2">
            {view.players.map((p) => {
              const rn = round.roundNet?.[p.id] ?? 0;
              return (
                <div
                  key={p.id}
                  className="flex w-full items-center justify-between rounded-xl bg-black/20 px-4 py-3"
                >
                  <span className="font-medium">
                    {p.displayName}
                    {p.isYou ? <span className="text-accent"> (you)</span> : null}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className={rn >= 0 ? "text-accent" : "text-red-300"}>{fmt(rn)}</span>
                    <span className="text-sm text-muted">total {fmt(view.cumulative[p.id] ?? 0)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {isHost ? (
            <div className="grid w-full grid-cols-2 gap-3">
              <button
                className="btn-primary w-full"
                onClick={() => action("next")}
                disabled={busy !== null}
              >
                {busy === "next" ? "Dealing…" : "Start Next Round"}
              </button>
              <button
                className="btn-ghost w-full"
                onClick={() => setConfirmEnd(true)}
                disabled={busy !== null}
              >
                End Game
              </button>
            </div>
          ) : (
            <p className="w-full text-center text-sm font-medium text-muted">Waiting for host</p>
          )}
        </div>
      </div>

      {confirmEnd && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-6">
          <div className="card-surface max-w-sm p-6 text-center">
            <h3 className="text-lg font-semibold">End the game?</h3>
            <p className="mt-2 text-muted">
              Final scores will be locked and emailed to you.
              <br />
              This can&rsquo;t be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button className="btn-ghost flex-1" onClick={() => setConfirmEnd(false)}>
                Cancel
              </button>
              <button
                className="btn-primary flex-1"
                onClick={() => action("end")}
                disabled={busy !== null}
              >
                {busy === "end" ? "Ending…" : "End Game"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
