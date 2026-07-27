"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { GameView } from "@/server/views";
import { api } from "@/lib/client";
import { Lobby } from "@/components/Lobby";
import { Arrange } from "@/components/Arrange";
import { Reveal } from "@/components/Reveal";
import { Summary } from "@/components/Summary";
import { Scoreboard } from "@/components/Scoreboard";
import { EndedScreen } from "@/components/EndedScreen";
import { GameChat } from "@/components/GameChat";
import { SpectatorWatch } from "@/components/SpectatorWatch";

/** Lightweight polling. Production upgrade: Supabase Realtime channel + this as
 *  the reconnection/replay fallback (see docs/ARCHITECTURE.md). */
function usePolledGame(gameId: string) {
  const [view, setView] = useState<GameView | null>(null);
  const [unauth, setUnauth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(-1);
  const chatRevRef = useRef(-1);

  const apply = useCallback((v: GameView) => {
    versionRef.current = v.version;
    chatRevRef.current = v.chatRevision;
    setView(v);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { view: v, unauthenticated } = await api.state(gameId);
      if (unauthenticated) {
        setUnauth(true);
        return;
      }
      if (
        v &&
        (v.version !== versionRef.current || v.chatRevision !== chatRevRef.current)
      ) {
        apply(v);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection lost");
    }
  }, [gameId, apply]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [refresh]);

  return { view, unauth, error, refresh, apply };
}

const TABLE_PHASES = new Set([
  "ARRANGING",
  "READY_TO_REVEAL",
  "REVEALING",
  "ROUND_SUMMARY",
]);

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const { view, unauth, error, refresh, apply } = usePolledGame(id);

  if (unauth) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">This seat isn&rsquo;t on this device</h1>
        <p className="mt-2 text-muted">
          Your session for this room wasn&rsquo;t found. Ask the host for the code and rejoin — or
          spectate if the game has started.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/join" className="btn-primary">
            Join a game
          </Link>
          <Link href="/spectate" className="btn-ghost">
            Spectate
          </Link>
        </div>
      </Centered>
    );
  }

  if (!view) {
    return (
      <Centered>
        <div className="animate-pulse text-muted">Loading table…</div>
      </Centered>
    );
  }

  const isHost = view.you?.isHost ?? false;
  const isSpectator = view.youAreSpectator;
  const showChat = view.phase !== "GAME_ENDED" && view.phase !== "GAME_ABANDONED";
  const fillViewport = TABLE_PHASES.has(view.phase);

  const body = (
    <main
      className={
        fillViewport
          ? "mx-auto flex h-full max-w-5xl flex-col overflow-hidden px-3 py-2 sm:px-4 sm:py-2.5"
          : "mx-auto max-w-5xl px-4 py-6 sm:py-10"
      }
    >
      {view.phase !== "GAME_ENDED" && (
        <header className={`flex items-center justify-between ${fillViewport ? "mb-2 shrink-0" : "mb-6"}`}>
          <div>
            <div className="flex items-center gap-3">
              <div className="text-xs uppercase tracking-[0.25em] text-accent">Triple PLO</div>
              {view.spectatorCount > 0 && (
                <div
                  className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-white/10"
                  title={`${view.spectatorCount} spectating`}
                >
                  <EyeIcon />
                  <span className="tabular-nums">{view.spectatorCount}</span>
                </div>
              )}
              {isSpectator && (
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Spectating
                </div>
              )}
            </div>
            <div className="text-sm text-muted">
              Room {view.code} • ${(view.boardValueCents / 100).toFixed(2)}/board • Round{" "}
              {view.round?.roundNumber ?? view.completedRounds + 1}
            </div>
          </div>
          {error && <div className="text-xs text-red-300">Reconnecting…</div>}
        </header>
      )}

      {(view.phase === "LOBBY" || view.phase === "READY_TO_START") && !isSpectator && (
        <Lobby view={view} isHost={isHost} onUpdate={apply} />
      )}

      {view.phase === "ARRANGING" && (
        <div className="min-h-0 flex-1">
          {isSpectator ? (
            <SpectatorWatch view={view} />
          ) : (
            <Arrange view={view} onUpdate={apply} onRefresh={refresh} />
          )}
        </div>
      )}

      {(view.phase === "READY_TO_REVEAL" ||
        view.phase === "REVEALING" ||
        view.phase === "ROUND_SUMMARY") && (
        <div className="relative min-h-0 flex-1">
          <Reveal view={view} isHost={isHost} onUpdate={apply} />
          {view.phase === "ROUND_SUMMARY" && (
            <Summary view={view} isHost={isHost} onUpdate={apply} />
          )}
        </div>
      )}

      {view.phase === "GAME_ENDED" && <EndedScreen view={view} />}

      {view.phase === "GAME_ABANDONED" && (
        <Centered>
          <h1 className="text-2xl font-bold">Game abandoned</h1>
          <p className="mt-2 text-muted">Everyone disconnected. Completed rounds were preserved.</p>
        </Centered>
      )}

      {["WAITING_NEXT_ROUND", "HOST_DISCONNECTED", "GAME_ABANDONED"].includes(view.phase) && (
        <div className="mt-8">
          <Scoreboard view={view} />
        </div>
      )}
    </main>
  );

  if (!showChat) return body;

  return (
    <GameChat view={view} onUpdate={apply} fillViewport={fillViewport}>
      {body}
    </GameChat>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      {children}
    </main>
  );
}
