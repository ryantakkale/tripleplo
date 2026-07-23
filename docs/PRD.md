# Triple PLO — Product Requirements (Phase 1)

## 1. Product summary

**Target users.** Small groups of friends (2–3) who already play poker casually and want a fast, fair way to play a novel triple-board Omaha variant online without handling money in-app.

**Core problem.** Playing a home-game variant remotely is hard: someone has to deal fairly, everyone has to trust the shuffle, arranging three Omaha hands by hand is error-prone, and the scoring (ties, premium hands, sweeps, stacking multipliers) is fiddly and dispute-prone.

**Value proposition.** A provably server-fair deal, an intuitive drag/tap hand-builder, and an authoritative scoring engine that handles every tie and multiplier correctly, ending with a clean settlement sheet — so friends can focus on the game and settle privately.

**Intended experience.** Smooth, fast, premium, social, easy for first-timers, and exciting during reveals — without looking like a loud online casino.

**MVP scope.** Private rooms; 2–3 players; host is a player; $1/$2/$4 per board; secure deal; three boards; hand arrangement + Ready; sequential host-controlled reveals; full Omaha evaluation; ties/premium/sweep/stacking scoring; multiple rounds; cumulative scoreboard; reconnection; host-disconnect handling; final settlement; emailed score sheet.

**Explicit MVP exclusions.** Public matchmaking/discovery, tournaments, spectators, in-app chat, payments/crypto, accounts beyond guest sessions (+host email), player-facing round-by-round history, hand-setting timers, automatic timed reveals, host transfer, replacement players, manual redeal/score editing.

**Why it's different from standard online poker.** It's not a cash/real-money platform and takes no rake — it is a scorekeeper for a specific home variant (three simultaneous Omaha boards with sweep/premium multipliers). No betting rounds; the "wager" is a fixed per-board value used only for scoring.

**Why private/invite-only for MVP.** Keeps it clearly a friends' scorekeeping tool (not a gambling operator), avoids matchmaking/abuse/legal surface area, and lets us harden fairness, security, and reconnection before considering any public exposure.

## 2. Confirmed rulebook
See [`RULEBOOK.md`](RULEBOOK.md) for the full player-facing rules and worked examples (two-player outright/push, three-player outright/two-way tie/push, premium, sweep, stacked). These rules are **confirmed and must not be reopened** (see "Confirmed Rule Decisions" in the delivery summary).

## 3. User roles & permissions

| Capability | Host | Player |
| --- | --- | --- |
| Create room, set players & board value | ✅ | — |
| Share code/link | ✅ | (may reshare) |
| Join a seat with a display name | ✅ (auto) | ✅ |
| Start round / reveal next board / start next round / end game | ✅ | — |
| Arrange own 12 cards, save, press Ready | ✅ | ✅ |
| View own private cards & own arrangement | ✅ | ✅ |
| View the public scoreboard & revealed results | ✅ | ✅ |
| View another player's hidden cards / unrevealed turn/river / burns / undealt | ❌ | ❌ |
| Change/unlock another player's arrangement | ❌ | ❌ |
| Edit scores, override results, undo reveals, redeal, replace players, transfer host | ❌ | ❌ |

- **User-initiated actions:** create/join, arrange, save, Ready, host progression controls, end game, reconnect.
- **Server-authorized/validated actions:** shuffle/deal/burn, private-card delivery, assignment validation, Ready synchronization, reveal gating, evaluation, tie/premium/sweep detection, scoring, state transitions, settlement, email.
- **Visibility:** *public to room* — names, seats, connection/ready status, flops, revealed cards/results, cumulative scores. *Private to one player* — their 12 cards and arrangement. *Server-only* — full deal, hidden turn/river, burns, undealt, session tokens, host email.

## 4. User stories (prioritized)

**Must have**
- As a host I can create a room, enter my email, pick 2/3 players and $1/$2/$4, and get a code/link.
- As a player I can join with a code/link and a unique display name.
- As a player I can reconnect to my seat after refresh/disconnect and see the correct state.
- As a host I can start a round; as a player I privately receive my 12 cards and see the three flops.
- As a player I can arrange 12 cards into 4/4/4, get validation, and press Ready with a confirmation.
- As a player I can see who is still arranging and who is Ready.
- As a host I can reveal boards in order; everyone sees assignments, turn, river, evaluated hands, and scores.
- As a player I can see provisional scores and a clear sweep adjustment.
- As a host I can start another round or end the game.
- As everyone we can track cumulative scores and, at the end, view the final settlement.
- As a host I receive the final score sheet by email.

**Should have**
- Copy invite link; disabled Start until seats fill; reconnection banners; connection indicators; reduced-motion support.

**Later**
- Player-facing round history, richer stats, sound design, drag-and-drop refinements, spectator/read-only links.

## 5. Functional requirements
Private room creation; unguessable room codes; invite links; host email collection; guest display names; player-count & board-value config; lobby seat management; roster locking; secure server-side shuffle; burn-card handling; 2p & 3p deal logic; private-card delivery; face-up flop delivery; hidden turn/river storage; hand arrangement; assignment validation; Ready-state synchronization; sequential reveal synchronization; Omaha evaluation; tie detection; premium-hand calc; sweep detection; stacked multipliers; exact-decimal (integer-cent) scoring; cumulative scores; final settlement; host controls; reconnection; host-disconnection timeout (5 min); everyone-disconnected grace (30–60s, default **45s**); email delivery; game-state recovery; idempotent actions; technical integrity validation (deck uniqueness, exact counts, atomic deal).

## 6. Non-functional requirements
- **Security/privacy/fairness:** server authority for all secret state and decisions; CSPRNG shuffle; secrets never sent to browser; per-seat opaque session tokens (HTTP-only cookies); host email private.
- **Real-time performance:** state updates within a few hundred ms of an action; reveal feels deliberate but not slow.
- **Responsive & mobile:** works on desktop/tablet/mobile; touch-first arrangement; large hit targets.
- **Accessibility:** keyboard operable; button fallback for arrangement; sufficient contrast; `prefers-reduced-motion` respected; ARIA labels on cards/controls.
- **Reliability/recovery:** authoritative persistent state; atomic deals; reconnection restores exact state; idempotent mutations; state-version (optimistic concurrency) checks.
- **Email reliability:** transactional provider, retries, idempotent, logged; game ends even if email is delayed.
- **Abuse/security:** high-entropy codes/tokens; rate limiting on create/join; validation of every input with Zod; no hidden info in client payloads; protection against duplicate/replayed commands.
- **Observability:** structured logs for state transitions, deals (metadata only, never card values), scoring, email, and errors.

## 7. State machine
Authoritative phases and the guarded transitions are implemented in [`src/core/stateMachine.ts`](../src/core/stateMachine.ts) and enforced by the engine.

Phases: `LOBBY → READY_TO_START → DEALING → ARRANGING → READY_TO_REVEAL → REVEALING → ROUND_SUMMARY → (WAITING_NEXT_ROUND → DEALING …) → GAME_ENDED`, plus `HOST_DISCONNECTED` and `GAME_ABANDONED`. `REVEALING` steps through a fixed sub-sequence (top assignments/turn/river/result → middle … → bottom … → sweep eval).

For each phase the engine specifies: entry/exit conditions, allowed player actions, allowed host actions, server-generated actions, validations, reconnection behavior, and idempotency:

| Phase | Player actions | Host actions | Server actions | Reconnection |
| --- | --- | --- | --- | --- |
| LOBBY | join | — | seat mgmt, roster lock at fill | rejoin seat |
| READY_TO_START | — | start round | — | rejoin |
| DEALING | — | — | shuffle+deal (atomic), commit | wait |
| ARRANGING | save, Ready | end game (cancels) | validate, detect all-ready → compute result | restore cards/arrangement/ready |
| READY_TO_REVEAL | — | reveal next | — | show ready state |
| REVEALING | — | reveal next (idempotent per step) | progressive redaction; commit on last step | replay revealed steps only |
| ROUND_SUMMARY | — | next round / end game | persist scores/stats | show summary |
| HOST_DISCONNECTED | — | (host reconnect) | 5-min timer; auto-finish or cancel | resume to `resume_phase` |
| GAME_ENDED / GAME_ABANDONED | — | — | settlement + email | read-only final |

Every mutation verifies: current phase, acting player, host authorization (when required), expected state version, idempotency key, valid transition, room membership, session validity.

## 8. Edge-case checklist
Duplicate display names (rejected); wrong/expired room code (404); room full (rejected); join after start (rejected); two tabs (same session, both work; last write wins under version check); refresh (state restored); device change (rejoin with session; if cookie absent, must rejoin via code — MVP); missing/invalid/stolen token (rejected, 403); host disconnect in lobby / before all Ready / after all Ready (see rulebook); non-host disconnect before/after Ready; everyone disconnects (grace then abandon); invalid assignment / <4 / >4 / duplicate card (rejected with message); Ready pressed twice (idempotent); reveal pressed twice / out of order / duplicate events (idempotent per step + version check); all tie types; tied premium; tie prevents sweep; stacked multipliers; half-dollar results (integer cents); negative balances; end during active round (round cancelled/excluded); email failure (game still ends, retried); server restart during arrangement/reveal (state persisted; same deal restored); DB deal-transaction failure (rollback, retry, no partial deal); browser dev-tools tampering (server re-validates everything; secrets never sent).

## 9. Product & legal boundaries
Private vs public games (MVP is private-only); scorekeeping vs payment facilitation (strictly scorekeeping — no funds, transfers, accounts, rake, or result-based fees); avoid gambling-style marketing; age requirement (users must be of legal age in their jurisdiction); Terms of Use and Privacy Policy needed; host email handling (collected for one purpose — the score sheet — stored minimally, not shared); data retention (retain the minimum for integrity/audit/recovery/stats/email, with a deletion policy). **Regional legal review is required before any public launch and wherever real-money settlement between friends could implicate local gambling law.** This document is not legal advice; obtain qualified counsel for the jurisdictions you operate in.

## 10. Product risks & MVP mitigations
- **Scoring correctness** (biggest): pure, exhaustively tested scoring/sweep engine; zero-sum assertions on every board/round/game.
- **Cheating/hidden-info leaks:** server authority + redacted views + secret tables with no client read path; never send hidden cards in any payload.
- **Omaha evaluation bugs:** brute-force the exact 2+3 rule; tests target the classic "one suited/one connector" mistakes.
- **Real-time sync / duplicate commands:** optimistic version checks + idempotency keys; server is the single source of truth.
- **Reconnection loss:** persistent authoritative state; deals stored (never re-shuffled) so recovery is exact.
- **Mobile arrangement friction:** tap-to-place + button fallback + capacity indicators + validation before Ready.
- **Email deliverability:** transactional provider with retries; game completes regardless; host sees sent/pending/failed.
- **Legal/platform:** invite-only, no payments, clear disclaimers; legal review gate before public launch.
