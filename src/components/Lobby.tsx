"use client";

import { useState } from "react";
import type { GameView } from "@/server/views";
import { api } from "@/lib/client";

export function Lobby({
  view,
  isHost,
  onUpdate,
}: {
  view: GameView;
  isHost: boolean;
  onUpdate: (v: GameView) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seatsFilled = view.players.length;
  const canStart = view.phase === "READY_TO_START";
  const inviteLink =
    typeof window !== "undefined" ? `${window.location.origin}/join?code=${view.code}` : "";

  async function copy() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { view: v } = await api.start(view.id, `start-r1-${view.id}`);
      onUpdate(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="card-surface p-6">
        <h2 className="text-lg font-semibold">Invite players</h2>
        <p className="mt-1 text-sm text-muted">Share this code or link privately.</p>
        <div className="mt-4 rounded-xl bg-black/30 p-4 text-center">
          <div className="text-3xl font-bold tracking-[0.3em]">{view.code}</div>
        </div>
        <button onClick={copy} className="btn-ghost mt-3 w-full">
          {copied ? "Copied!" : "Copy invite link"}
        </button>
      </div>

      <div className="card-surface p-6">
        <h2 className="text-lg font-semibold">
          Seats {seatsFilled}/{view.playerCount}
        </h2>
        <ul className="mt-4 space-y-2">
          {Array.from({ length: view.playerCount }).map((_, i) => {
            const p = view.players[i];
            return (
              <li
                key={i}
                className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"
              >
                {p ? (
                  <>
                    <span className="font-medium">
                      {p.displayName} {p.isYou && <span className="text-accent">(you)</span>}
                    </span>
                    {p.isHost && <span className="text-xs text-accent">HOST</span>}
                  </>
                ) : (
                  <span className="text-muted">Waiting for player…</span>
                )}
              </li>
            );
          })}
        </ul>

        {isHost ? (
          <>
            <button
              onClick={start}
              disabled={!canStart || busy}
              className="btn-primary mt-5 w-full text-lg"
            >
              {canStart ? (busy ? "Dealing…" : "Start Game") : "Waiting for players…"}
            </button>
            {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
          </>
        ) : (
          <p className="mt-5 text-center text-sm text-muted">
            Waiting for the host to start the game.
          </p>
        )}
      </div>
    </div>
  );
}
