"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { TextField } from "@/components/TextField";

export default function PracticePage() {
  const router = useRouter();
  const [name, setName] = useState("You");
  const [playerCount, setPlayerCount] = useState<2 | 3>(2);
  const [value, setValue] = useState<1 | 2 | 4>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { gameId } = await api.practiceGame({
        hostDisplayName: name,
        playerCount,
        boardValueDollars: value,
      });
      router.push(`/game/${gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-6 text-sm text-muted hover:text-ink">
        ← Back
      </Link>

      <h1 className="text-3xl font-bold leading-tight">Practice vs. CPU</h1>

      <form onSubmit={submit} className="mt-6 flex w-full flex-col gap-5">
        <TextField
          label="Your display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          required
        />

        <div className="flex w-full flex-col gap-1.5">
          <div className="label mb-0">Players</div>
          <div className="grid w-full grid-cols-2 gap-2">
            {[2, 3].map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => setPlayerCount(n as 2 | 3)}
                className={`btn w-full ${playerCount === n ? "btn-primary" : "btn-ghost"}`}
              >
                {n} players
              </button>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col gap-1.5">
          <div className="label mb-0">Value per board</div>
          <div className="grid w-full grid-cols-3 gap-2">
            {[1, 2, 4].map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => setValue(v as 1 | 2 | 4)}
                className={`btn w-full ${value === v ? "btn-primary" : "btn-ghost"}`}
              >
                ${v}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

        <button type="submit" className="btn-primary w-full text-lg" disabled={busy}>
          {busy ? "Setting up…" : "Start Game"}
        </button>
      </form>
    </main>
  );
}
