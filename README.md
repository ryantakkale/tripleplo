# Triple PLO

A private, invite-only, browser-based **triple-board Pot-Limit Omaha** scorekeeping game for two or three friends. The app **only keeps score** and produces a final settlement sheet — it never processes payments, holds funds, or takes a rake.

> Three community boards. Each player splits 12 private cards into three groups of four. Best legal Omaha hand wins each board. Sweeps and premium hands multiply the stakes. We track it; you settle privately.

## What's in this repo

| Area | Status | Location |
| --- | --- | --- |
| **Pure game core** (deck, secure shuffle, deal, Omaha evaluator, scoring, sweep, settlement, state machine) | ✅ complete + 75 passing unit tests | `src/core/` |
| **Server-authoritative engine** (sessions, idempotency, versioning, redaction) | ✅ runnable vertical slice | `src/server/` |
| **API route handlers** (create/join/start/assign/ready/reveal/next/end/state) | ✅ | `src/app/api/` |
| **Web UI** (landing, create, join, lobby, arrange, reveal, summary, settlement) | ✅ | `src/app/`, `src/components/` |
| **Production DB schema + RLS** | ✅ SQL migration | `supabase/migrations/` |
| **Product docs** (PRD, rulebook, UX, architecture) | ✅ | `docs/` |

The vertical slice runs **with zero external services** using an in-memory authoritative store and console-logged email, so you can play a full game locally immediately. The Supabase/Resend wiring is documented in `docs/ARCHITECTURE.md`.

## Quickstart

```bash
npm install
npm test          # 75 unit tests (deck, evaluator, scoring, sweep, settlement, state machine)
npm run build     # production build
npm run start     # serve on http://localhost:3000
```

> Note: `npm run dev` (Next dev mode) works normally on a typical machine. To play a full game, open the app in two (or three) browser profiles / private windows so each player has their own session cookie.

Play flow: **Create Game** (host name, email, 2–3 players, $1/$2/$4 per board) → share the room code → each player **Joins** → host **Start Game** → everyone arranges 12 cards into top/middle/bottom and presses **Ready** → host **Reveal**s each board → **Round summary** (with sweep animation) → **Next Round** or **End Game** → **Final settlement** + emailed score sheet.

## Documentation

- [`docs/PRD.md`](docs/PRD.md) — Phase 1: product requirements, user roles/stories, functional & non-functional requirements, state machine, edge cases, legal boundaries, risks.
- [`docs/RULEBOOK.md`](docs/RULEBOOK.md) — the confirmed rules as an in-app "How to Play" page, with worked scoring examples.
- [`docs/UX.md`](docs/UX.md) — Phase 2: screen-by-screen UX, text wireframes, component spec, and UX copy.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Phase 3: architecture, data model, RLS, real-time events, reconnection, recovery, and the file-by-file continuation order.

## Guarantees enforced by the core (and tests)

- Cryptographically secure Fisher–Yates shuffle; unbiased (`src/core/shuffle.ts`).
- 3-player deal uses all 52 cards; 2-player deal uses 42 and hides 10 (`src/core/deal.ts`).
- Omaha evaluation uses **exactly two** private + **exactly three** community cards (`src/core/evaluator.ts`).
- All scores are **integer cents**; every board, round, and game is **zero-sum** (`src/core/scoring.ts`, `round.ts`).
- Sweep and premium multipliers stack multiplicatively (2× × 2× = 4×).
- Settlement minimizes payments and always sums to zero (`src/core/settlement.ts`).

## License / disclaimer

For entertainment and private scorekeeping only. Not a gambling service. See `docs/PRD.md` §9 for product/legal boundaries. Obtain qualified legal review before any public launch.
