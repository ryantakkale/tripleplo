"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { TextField } from "@/components/TextField";
import { AvatarPicker } from "@/components/AvatarPicker";
import { DEFAULT_AVATAR_ID, type AvatarId } from "@/lib/avatars";

function SpectateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [name, setName] = useState("");
  const [avatarId, setAvatarId] = useState<AvatarId>(DEFAULT_AVATAR_ID);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { gameId } = await api.spectateGame({
        code: code.toUpperCase(),
        displayName: name,
        avatarId,
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

      <h1 className="text-3xl font-bold leading-tight">Spectate</h1>
      <p className="mt-2 text-sm text-muted">
        Watch and chat once the game has started. You won&rsquo;t take a seat.
      </p>

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
        <AvatarPicker value={avatarId} onChange={setAvatarId} />

        {error && <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

        <button type="submit" className="btn-primary w-full text-lg" disabled={busy}>
          {busy ? "Joining…" : "Spectate"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Want a seat instead?{" "}
        <Link href="/join" className="text-accent hover:underline">
          Join as a player
        </Link>
      </p>
    </main>
  );
}

export default function SpectatePage() {
  return (
    <Suspense fallback={null}>
      <SpectateForm />
    </Suspense>
  );
}
