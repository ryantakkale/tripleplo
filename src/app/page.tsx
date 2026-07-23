import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-6 py-16">
      <div className="mb-3 text-sm uppercase tracking-[0.3em] text-accent">Private game</div>
      <h1 className="text-center text-5xl font-bold tracking-tight sm:text-6xl">
        Triple <span className="text-accent">PLO</span>
      </h1>
      <p className="mt-5 max-w-xl text-center text-lg text-muted">Three Boards. PLO. Max Pain.</p>

      <div className="mt-10 flex w-full max-w-md flex-col gap-3 sm:flex-row">
        <Link href="/create" className="btn-primary flex-1 text-lg">
          Host Game
        </Link>
        <Link href="/join" className="btn-ghost flex-1 text-lg">
          Join Game
        </Link>
      </div>

      <Link
        href="/practice"
        className="mt-3 text-sm text-muted underline-offset-4 hover:text-accent hover:underline"
      >
        Practice Mode (CPU) →
      </Link>
    </main>
  );
}
