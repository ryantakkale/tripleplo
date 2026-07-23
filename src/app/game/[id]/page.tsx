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

/** Lightweight polling. Production upgrade: Supabase Realtime channel + this as
 *  the reconnection/replay fallback (see docs/ARCHITECTURE.md). */
function usePolledGame(gameId: string) {
  const [view, setView] = useState<GameView | null>(null);
  const [unauth, setUnauth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(-1);

  const refresh = useCallback(async () => {
    try {
      const { view: v, unauthenticated } = await api.state(gameId);
      if (unauthenticated) {
        setUnauth(true);
        return;
      }
      if (v && v.version !== versionRef.current) {
        versionRef.current = v.version;
        setView(v);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection lost");
    }
  }, [gameId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [refresh]);

  return { view, unauth, error, refresh, setView };
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const { view, unauth, error, refresh, setView } = usePolledGame(id);

  const apply = useCallback(
    (v: GameView) => {
      setView(v);
    },
    [setView]
  );

  if (unauth) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">This seat isn&rsquo;t on this device</h1>
        <p className="mt-2 text-muted">
          Your session for this room wasn&rsquo;t found. Ask the host for the code and rejoin.
        </p>
        <Link href="/join" className="btn-primary mt-6">
          Join a game
        </Link>
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

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      {view.phase !== "GAME_ENDED" && (
        <header className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-accent">Triple PLO</div>
            <div className="text-sm text-muted">
              Room {view.code} • ${(view.boardValueCents / 100).toFixed(2)}/board • Round{" "}
              {view.round?.roundNumber ?? view.completedRounds + 1}
            </div>
          </div>
          {error && <div className="text-xs text-red-300">Reconnecting…</div>}
        </header>
      )}

      {(view.phase === "LOBBY" || view.phase === "READY_TO_START") && (
        <Lobby view={view} isHost={isHost} onUpdate={apply} />
      )}

      {view.phase === "ARRANGING" && <Arrange view={view} onUpdate={apply} onRefresh={refresh} />}

      {(view.phase === "READY_TO_REVEAL" ||
        view.phase === "REVEALING" ||
        view.phase === "ROUND_SUMMARY") && (
        <div className="relative">
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
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      {children}
    </main>
  );
}
