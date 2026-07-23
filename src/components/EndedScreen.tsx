"use client";

import Link from "next/link";
import type { GameView } from "@/server/views";
import { fmt } from "@/lib/client";

export function EndedScreen({ view }: { view: GameView }) {
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.displayName ?? "Player";
  const settlement = view.settlement;

  return (
    <div className="space-y-6">
      <div className="card-surface p-6 text-center">
        <div className="text-sm uppercase tracking-[0.25em] text-accent">Game over</div>
        <h1 className="mt-1 text-3xl font-bold">Final Scores</h1>
        <p className="mt-1 text-sm text-muted">
          {view.completedRounds} round{view.completedRounds === 1 ? "" : "s"} • $
          {(view.boardValueCents / 100).toFixed(2)}/board
        </p>

        <div className="mx-auto mt-6 max-w-md space-y-2">
          {[...view.players]
            .sort((a, b) => (view.cumulative[b.id] ?? 0) - (view.cumulative[a.id] ?? 0))
            .map((p) => {
              const c = view.cumulative[p.id] ?? 0;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"
                >
                  <span className="font-medium">{p.displayName}</span>
                  <span className={`font-semibold ${c >= 0 ? "text-accent" : "text-red-300"}`}>
                    {fmt(c)}
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      <div className="card-surface p-6">
        <h2 className="text-lg font-semibold">Settlement</h2>
        <div className="mt-4 space-y-2">
          {settlement && settlement.payments.length > 0 ? (
            settlement.payments.map((p, i) => (
              <div key={i} className="rounded-xl bg-black/20 px-4 py-3">
                <span className="font-medium">{nameOf(p.from)}</span> pays{" "}
                <span className="font-medium">{nameOf(p.to)}</span>{" "}
                <span className="text-accent">{fmt(p.amountCents)}</span>
              </div>
            ))
          ) : (
            <div className="text-muted">Everyone is even — no payments needed.</div>
          )}
        </div>
      </div>

      <div className="text-center">
        <Link href="/" className="btn-ghost">
          Home
        </Link>
      </div>
    </div>
  );
}
