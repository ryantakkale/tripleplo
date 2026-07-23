"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { TextField } from "@/components/TextField";

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { gameId } = await api.joinGame({ code: code.toUpperCase(), displayName: name });
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

      <h1 className="text-3xl font-bold leading-tight">Join Game</h1>

      <form onSubmit={submit} className="mt-6 flex w-full flex-col gap-5">
        <TextField
          label="Room code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          maxLength={12}
          required
          inputClassName="text-left text-2xl font-bold tracking-[0.3em] uppercase"
        />
        <TextField
          label="Your display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Roy"
          maxLength={24}
          required
        />

        {error && <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

        <button type="submit" className="btn-primary w-full text-lg" disabled={busy}>
          {busy ? "Joining…" : "Join Game"}
        </button>
      </form>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinForm />
    </Suspense>
  );
}
