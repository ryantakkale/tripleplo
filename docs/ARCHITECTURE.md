# Triple PLO — Full-Stack Architecture (Phase 3)

## Stack decision
**Next.js (App Router) + TypeScript + Tailwind**, with **Supabase Postgres** for authoritative persistence, **Supabase Realtime** for push updates, **Resend** for transactional email, **Zod** for validation, **Vitest** for unit tests, **Playwright** for E2E.

**Why this stack.** One deployable app (server route handlers hold all authority; the browser is a thin client), Postgres gives us transactions + row-level security for the exact secrecy guarantees we need, Realtime gives low-latency push with an easy polling fallback, and it keeps the MVP simple (no bespoke microservices). The **pure game core** (`src/core`) has zero framework or DB dependencies, so it is trivially testable and portable if the stack ever changes.

**What ships in this repo.** The complete pure core (tested), the complete authoritative engine and API, a runnable web UI, and the full production DB schema + RLS. To keep the vertical slice runnable with **zero external services**, the engine currently persists to an **in-memory store** (`src/server/engine.ts`, `getStore()`), and email is logged when `RESEND_API_KEY` is unset. The store is a small seam; swapping it for the Supabase repository (below) does not touch any rules.

## Architecture overview & data flow
```
Browser (thin client)
  │  fetch() JSON, HTTP-only session cookie per game
  ▼
Next.js route handlers (Node runtime)  ── authorize · Zod validate · idempotency · version check
  │
  ▼
Engine (src/server/*)  ── state machine + pure core (deck/deal/evaluator/scoring/round/settlement)
  │            │
  │            └── buildView() redaction  ──►  ONLY-permitted state back to browser
  ▼
Store  ── in-memory now │ Supabase Postgres (transactions + RLS) in production
  ▲
  └── Supabase Realtime broadcast (production)  ──►  browser subscribes; polling is the fallback/replay
```
Every state-changing request: resolve session → authorize (host/membership) → validate input (Zod) → check `expected version` + `idempotency key` → run the pure transition inside a DB transaction → increment `version` → persist score/reveal events → broadcast a public event → return the viewer-redacted `GameView`.

## Repository structure
```
src/
  core/         # PURE, dependency-free rules + tests (deck, shuffle, deal,
                #   evaluator, scoring, round/sweep, settlement, stateMachine)
  server/       # authoritative engine, view redaction, email, types
  lib/          # zod contracts, session cookies, http helpers, client fetch
  app/          # Next.js routes (pages + /api route handlers)
  components/   # UI components
supabase/migrations/  # SQL schema + RLS
docs/          # PRD, rulebook, UX, architecture
```

## Data model — stored / derived / visibility
See `supabase/migrations/0001_init.sql`. Money is `bigint` cents.

| Table | Stored | Visibility |
| --- | --- | --- |
| `games` | id, code, player_count, board_value_cents, host, phase, version, completed_rounds, email_status, timestamps | public to room (code/phase/version/value); `host` email not here |
| `players` | seat, display_name, is_host, connected; **email (host)** | public **except email** (server strips; `players_public` view) |
| `player_sessions` | token **hash**, game, player, expiry | **server-only (secret)** |
| `rounds` | round_number, cancelled, reveal_step, sweep_applied, sweep_winner | public to room |
| `round_deals` | full deal JSON (private, burns, boards, undealt) | **server-only (secret)** |
| `boards` | flop[], turn, river | flop public; **turn/river secret until revealed** |
| `board_assignments` | 4 cards per player per board | **secret**; own row server-delivered; others withheld until reveal |
| `ready_states` | ready timestamps | public (who is ready) |
| `reveal_events` | step (unique per round) | public; drives idempotent reveal |
| `board_results` | result_type, winners, losers, multipliers, explanation | public once revealed |
| `score_events` | final delta_cents per player/board | public once revealed |
| `cumulative_scores` (view) | **derived** sum of score_events | public |
| `final_settlements` | minimized payments | public at game end |
| `email_deliveries` | status, attempts, idempotency_key | server-only |
| `connection_status` | connected flags | public presence |

**Derived at runtime:** cumulative scores (view), settlement (pure function), evaluated hands / provisional-vs-final board scores (recomputed deterministically from deal+assignments — never trust the client).

## Database security (RLS)
- **Secret tables** (`player_sessions`, `round_deals`, `boards`, `board_assignments`, `ready_states`, `reveal_events`, `email_deliveries`, `connection_status`) have **RLS enabled with no client-readable policy** → the anon/authenticated client cannot read them at all, even with a leaked anon key. Only the **service role** (server) touches them.
- **Public room state** is readable by room members (membership policy keyed on `player_id` from the JWT), and the host **email column is never exposed** (use the `players_public` view / column-limited select).
- **All writes** go through server route handlers using the service role; the browser never writes game state directly.
- **Defense in depth:** even though `buildView()` already redacts, the DB refuses to serve secrets — so a UI bug or crafted request can't leak private cards, turns/rivers, burns, undealt cards, other players' pre-reveal assignments, session tokens, or the host email.

## Guest sessions & host email
On create/join the server issues a high-entropy token, stores a **hash** of it (`player_sessions`), and sets it in an **HTTP-only, SameSite=Lax (Secure in prod)** cookie scoped per game (`src/lib/session.ts`). The token is the sole proof of seat ownership; it is never exposed to other players or placed in client-readable JS. Host email is stored on the host player row, used only to send the score sheet, and never included in any view.

## Real-time events
Production: server broadcasts on a per-game Supabase Realtime channel after each committed mutation; the browser subscribes and, on reconnect, calls `/state` to resync (the polling in `usePolledGame` is the built-in fallback/replay path). **Public payloads never contain hidden cards.**

| Event | Trigger | Origin | Server validation | Public payload | Private payload | Persist | Idempotency | Replay on reconnect |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| player_joined | join | client→server | membership, unique name, not full/started | player (no email) | — | players | code+name | yes (state) |
| player_disconnected / _reconnected | transport | server | — | presence | — | connection_status | last-writer | yes |
| room_full | seats fill | server | — | phase→READY_TO_START | — | games | phase | yes |
| game_started / round_started | host start | client→server | host, phase, seats, all connected | phase, round# | — | rounds (+deal) | start key | yes |
| private_cards_dealt | deal commit | server | — | — | your 12 cards | round_deals | deal atomic | yes (state) |
| flops_revealed | deal commit | server | — | 3 flops | — | boards | — | yes |
| assignment_saved | save | client→server | own seat, valid 4/4/4, not ready | who saved | your assignment | board_assignments | assign key | yes |
| player_ready | Ready | client→server | valid assignment, not already ready | who is ready | — | ready_states | ready key | yes |
| all_players_ready | derived | server | everyone ready | phase→READY_TO_REVEAL | — | games | — | yes |
| board_assignment/turn/river_revealed | reveal | client→server (host) | host, phase, step order | revealed cards | — | reveal_events | step unique | replay revealed only |
| board_result_calculated | reveal | server | — | result + hands used | — | board_results, score_events | round+board | yes |
| sweep_calculated | reveal end | server | — | sweep + adjusted scores | — | rounds.sweep_* | round | yes |
| scores_updated / round_completed | reveal end | server | — | cumulative, round net | — | score_events | round+board | yes |
| next_round_started | host | client→server | host, all connected | round# | new private cards | rounds | next key | yes |
| host_disconnected / _reconnected | transport | server | — | banner + timer | — | games | — | yes |
| game_ending / game_ended | host/timeout/abandon | client/server | host or timer | phase→ENDED, settlement | — | games, final_settlements | end key | yes |
| final_score_email_sent / _failed | email | server | — | email status | — | email_deliveries | idempotency_key | yes |

## Reconnection strategy
Secret + robust: HTTP-only per-game cookie holds the session; on load the client calls `/state`, which resolves the session and returns the fully-redacted view (your cards/assignment/ready flag, which boards are revealed, current scores, host-connection state). This transparently handles page refresh, browser restart, temporary network loss, multiple tabs (same cookie; version checks resolve races), and device changes (as long as the cookie is present; otherwise rejoin by code — MVP). Because the **committed deal is persisted and never re-shuffled**, recovery reproduces the exact same deal.

## Host timeout & everyone-disconnected (production jobs)
- **Host disconnect:** set `host_disconnected_at`, phase→`HOST_DISCONNECTED`, store `resume_phase`. A scheduled check (edge function / cron) at 5 minutes either resumes (on reconnect) or ends the game: if all players were Ready, the server auto-completes the reveals and scores that round; otherwise it cancels the incomplete round. Then settle + email.
- **Everyone disconnected:** a **45s** grace period (configurable) before `GAME_ABANDONED`; preserve completed scores, apply the same incomplete-round rules, settle + email.

## Email delivery
`src/server/email.ts` builds the score sheet (no secrets) and sends via Resend, guarded by `email_deliveries.idempotency_key` and `game.email_status` (idempotent, retried, logged). The game **ends successfully even if email fails**; the host UI shows sent/pending/failed. If `RESEND_API_KEY` is unset, the sheet is logged (dev/vertical-slice path).

## Recovery & integrity
Atomic deal transaction (roll back on failure, retry, never expose a partial deal); deck-uniqueness + exact-count validation (`assertDealIntegrity`); idempotent round-start; persistent authoritative state; committed deals are never replaced. Genuine corruption is treated as an incident: end the game, preserve the latest valid scores, email the latest valid sheet, log for investigation.

## Logging & observability
Structured logs on every transition, deal (metadata only — counts/round id, **never card values**), scoring result, email attempt, and rejected/invalid action. Include game id, round, phase, version, and actor. Add request tracing and error monitoring (e.g. Sentry) before public launch.

## Deployment
1. `npm install`; create a Supabase project; run `supabase/migrations/0001_init.sql`.
2. Set env from `.env.example` (`NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `SESSION_SECRET`, `APP_URL`).
3. Deploy to Vercel (route handlers on the Node runtime). Configure the host-timeout/abandon cron (Vercel Cron or a Supabase scheduled edge function).
4. `npm run build` locally to verify; `npm test` in CI.

## Test strategy
- **Unit (Vitest, present):** deck/shuffle/deal, assignment, Omaha evaluation (incl. the exact 2+3 traps), scoring (all result types + multipliers + zero-sum + integer cents), sweep, settlement, state machine — 75 tests.
- **Integration/E2E (Playwright, to add):** create 2p/3p rooms; join by code/link; reject duplicate names / a 3rd (or 4th) player / joins after start; start; receive only your own cards; arrange (desktop + mobile emulation); Ready; wait; ordered reveals; reject premature/duplicate reveals; score push/tie/premium/sweep/stacked; multiple rounds; cumulative scores; reconnect player/host; end + settlement + email; **assert hidden cards are never returned by any browser-facing request.**

## File-by-file continuation order (in-memory → production)
1. `src/lib/supabase/server.ts` + `client.ts` — service-role and anon clients.
2. `src/server/repository.ts` — implement the `Store` seam against Postgres with transactions + `SELECT … FOR UPDATE`/version checks; move `getStore()` calls behind it.
3. Wire `engine.ts` mutations to run inside `repository.transaction(...)`, persisting `rounds`, `round_deals`, `boards`, `board_assignments`, `ready_states`, `reveal_events`, `board_results`, `score_events`.
4. `src/server/realtime.ts` — broadcast helpers; call after each commit; subscribe in `usePolledGame` (keep polling as fallback).
5. `src/lib/session.ts` — hash tokens before storing in `player_sessions`; add expiry sweep.
6. `src/server/jobs/hostTimeout.ts` + `abandon.ts` — scheduled resolution; add cron config.
7. `src/server/email.ts` — persist `email_deliveries`, add retry/backoff.
8. `tests/e2e/*.spec.ts` — Playwright scenarios above; `src/core/*` already covered.
9. Observability: structured logger + Sentry; rate limiting on create/join.
10. Enable/verify RLS policies against direct anon reads (or keep fully server-mediated).
