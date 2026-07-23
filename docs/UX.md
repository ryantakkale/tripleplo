# Triple PLO — UX & Prototype Plan (Phase 2)

## Design principles
Simple, modern, premium, fast, intuitive, poker-inspired, social, first-timer friendly, responsive, accessible. **Not** a loud casino: no flashing graphics, slot styling, crypto imagery, payment/deposit/withdrawal language, or public-betting language. Restrained motion; a deep felt-green surface with a single muted-gold accent; generous spacing; large touch targets.

Implemented theme lives in `tailwind.config.ts` / `src/app/globals.css` (felt palette, muted gold accent, `flip`/`rise` animations gated by `prefers-reduced-motion`).

## Screen catalog
For each screen: **purpose · hierarchy · components · primary action · secondary · disabled/loading/empty/error · responsive notes.**

1. **Landing** — choose Create/Join. H1 wordmark, one-line pitch, two large buttons, three value props, legal disclaimer. Primary: Create Game. Secondary: Join Game. No empty/error states. *Mobile:* stacked buttons; *desktop:* side-by-side. (`src/app/page.tsx`)
2. **Create-game flow** — collect host name, email, player count (2/3 segmented), board value ($1/$2/$4 segmented). Primary: Create Game (disabled until valid). Loading: "Creating…". Error: inline banner (e.g. invalid email). (`src/app/create/page.tsx`)
3. **Join-game flow** — code (big, centered, letter-spaced, uppercased) + display name. Primary: Join. Errors: invalid/expired room, full room, duplicate name, already started, or reconnect-to-seat. (`src/app/join/page.tsx`)
4. **Game lobby** — room code + copy link; seat list (filled/empty); rules summary; Start (host only, disabled until seats fill → "Waiting for players…"). Non-host sees "Waiting for host to start." (`src/components/Lobby.tsx`)
5. **Round-start transition** — brief "Dealing…" state (spinner) between Start and Arranging.
6. **Hand-arrangement** — your unassigned cards; three board zones each showing the face-up flop + two face-down placeholders and a 4-card capacity indicator; tap-to-select/tap-to-place; Reset; Ready (disabled until 4/4/4) with confirmation modal. Locked view after Ready shows your hands read-only + who's still arranging. (`src/components/Arrange.tsx`)
7. **Waiting-for-Ready** — presence list with per-player "Arranging…/Ready ✓". (part of Arrange locked view + scoreboard presence dots)
8–10. **Top/Middle/Bottom board reveal** — per board: flop always; turn then river flip in; each player's four assigned cards (used cards highlighted, unused dimmed); hand name; winner/tie badge; premium/sweep badges; net per player. Host: Reveal Next. (`src/components/Reveal.tsx`)
11. **Sweep-result transition** — on round summary, an announcement banner ("X swept all three boards! Every payout doubled.") with a `rise` animation, then updated totals.
12. **Round summary** — per-player round net + running total; sweep banner if any; host: Start Next Round / End Game (with active-round cancellation warning). (`src/components/Summary.tsx`)
13. **Current scoreboard** — sorted cumulative nets with connection dots; always visible during play. (`src/components/Scoreboard.tsx`)
14. **End-game confirmation** — modal explaining scores lock + settlement emailed; if active round, warns it will be excluded.
15. **Final settlement** — final nets, minimized payment list, email status, back-home. (`src/components/EndedScreen.tsx`)
16. **Host-disconnected state** — banner: "Host reconnecting… (m:ss)"; progression paused.
17. **Player-disconnected state** — presence shows the player as disconnected; round waits (if pre-Ready).
18. **Reconnection state** — transient "Reconnecting…" indicator; on success, silent restore (or "Reconnected" toast).
19. **Invalid-room / error states** — friendly full-screen messages with a path back to Join/Home.

> No player-facing previous-round-history screen in the MVP.

Disabled/loading/empty/error and responsive behavior are handled per component (segmented controls collapse to full-width on mobile; board zones go 3-up on ≥sm, stacked on mobile; reveal grids are 1/2/3-up by breakpoint).

## Hand-arrangement specifics
- **Desktop:** drag-and-drop is the target interaction (MVP ships tap-to-place, which also works with a mouse; DnD is a documented enhancement). **Mobile:** tap-to-select then tap-a-zone. **Accessible:** every place/remove is a real `<button>`; keyboard/screen-reader operable.
- Four-card capacity indicators ("2/4"), clear top/middle/bottom zones each showing the face-up flop, automatic validation, Reset, optional sorting (enhancement), Ready confirmation, and a clear "all 12 validly assigned" state (Ready enables).
- **Reorder within a group:** not required — order within a four-card group does not affect Omaha evaluation. MVP does not offer intra-group reordering (keeps the UI simpler); it can be added later purely as presentation.
- **After Ready:** your cards stay visible to you, controls disable, you see who's still arranging, and Ready cannot be reversed.

## Reveal experience
Visually separate assignment reveal → turn → river → evaluation → score. Show each player's four assigned cards, their best five-card hand (highlight the exact five used), the hand category, winner/tied winners, base value, premium multiplier, and provisional sweep state. On bottom-board completion, detect and announce a sweep, update affected payouts, and explain the adjustment rather than silently changing earlier numbers.

## Text wireframes

**Landing**
```
        TRIPLE PLO
  Three boards. Twelve cards.
 [ Create Game ]  [ Join Game ]
 (value props ×3)   (disclaimer)
```

**Create**
```
Create a game
Name [__________]
Email [_________]  (host only, for score sheet)
Players  [ 2 ][ 3 ]
Board    [ $1 ][ $2 ][ $4 ]
        [ Create Game ]
```

**Lobby**
```
Room ABC123        Seats 2/3
[ Copy invite link ]
• Alex (you) HOST
• Sam
• Waiting for player…
[ Start Game ]  (disabled until full)
```

**Hand arrangement**
```
Your cards:  A♠ K♠ Q♦ 9♥ 8♣ 7♦ 6♠ 5♣ 4♦ 3♣ 2♠ J♥
Top   [flop ♣♦♠ ▢ ▢]  0/4  [Place here]  (____)
Mid   [flop ♥♥♣ ▢ ▢]  0/4  [Place here]  (____)
Bot   [flop ♠♦♦ ▢ ▢]  0/4  [Place here]  (____)
              [ Ready ]  (disabled until 12 placed)
```

**Waiting for Ready**
```
You're locked in ✓
Waiting for: Sam
(your three hands, read-only)
```

**Board reveal**
```
TOP BOARD                         [Premium 2×][Winner]
♣ ♦ ♠   ♥(turn)   ♠(river)
Alex  +$4   A♠A♦ K♠ | Q♦ J♦ 10♦   Four of a Kind, Aces
Sam   -$4   ...                    Flush, King-high
Alex wins outright. Sam pays $4 (base $2, premium 2×).
[ Reveal Next ]  (host)
```

**Sweep adjustment**
```
🧹 Alex swept all three boards!
Every board payout was doubled.
Alex +$12   Sam −$12
```

**Round summary**
```
Round 1 complete
Alex  +$12   total +$12
Sam   −$12   total −$12
[ Start Next Round ]  [ End Game ]
```

**Current scoreboard**
```
SCOREBOARD
● Alex   +$12
● Sam    −$12
```

**Final settlement**
```
Final Scores — 1 round, $2/board
Alex +$12    Sam −$12
Settlement:
  Sam pays Alex $12
Email: sent to host
```

**Host disconnected**
```
Host reconnecting…  4:37
The game is paused. Your hands are safe.
```

## Prototype / component specification

Component hierarchy (implemented names in `src/components/`):
- `PlayingCard` — props: `card?`, `size` (sm/md/lg), `selected`, `dimmed`, `faceDown`, `onClick`. States: face-up (red/black), face-down, selected (lift + gold ring), dimmed (unused-in-hand), interactive vs static. Animation: `flip` on reveal.
- **Buttons:** `.btn-primary` (gold), `.btn-ghost` (outline). States: default/hover/active/disabled/loading.
- **Forms/fields:** `.field`, `.label`; segmented selectors (players, board value).
- **Modals:** Ready confirmation, End-game confirmation (overlay + card, focus-trapped).
- **Toasts/banners:** reconnection banner, sweep banner, error banners.
- **Player-status indicators:** presence dot (green/red), Ready ✓ / Arranging….
- **Board components:** `Reveal` → `BoardCard` (flop row + turn/river + per-player hand cards + `ResultBadge`).
- **Assignment zones:** capacity indicator, place button, card list (Arrange).
- **Score indicators / multiplier badges:** `+$/−$` colored nets; `Premium 2×`, `Sweep 2×` `Badge`s.
- **Reconnection banner / progress indicators:** host-timeout countdown, "Dealing…", "Revealing — <step>".

**Responsive breakpoints:** base (mobile) → `sm` (tablet, 640px) → `lg` (desktop, 1024px). Board zones: stacked → 3-up. Reveal player grid: 1 → 2 → 3 columns.

**Keyboard behavior:** all actions are buttons; tab order flows cards → zones → Ready; Enter/Space activate; modals trap focus and close on Esc.

**Touch behavior:** tap-select/tap-place; large targets; no hover-only affordances.

**Suggested transitions:** card `flip` (~260ms) on reveal; `rise` (~220ms) for summary/sweep; subtle button `active:scale`. **Reduced motion:** all animations/transitions disabled via the global `prefers-reduced-motion` rule.

## UX copy (selected)
- Create Game / Join Game
- Host email: "Used only to send the final score sheet. Never shared with other players."
- Select players / Select board value: "A scorekeeping label only — no money moves through the app."
- Copy invite: "Copy invite link" → "Copied!"
- Waiting for players: "Waiting for players…"; Start Game
- Arrange your hands: "Tap a card, then tap a board to place it. Each board needs exactly 4."
- Ready confirmation: "Your hands cannot be changed after you press Ready. Continue?"
- Waiting for others: "Waiting for: {names}"
- Player disconnected: "{name} disconnected — the round is waiting."
- Host reconnecting: "Host reconnecting… {m:ss}. The game is paused."
- Reveal Top/Middle/Bottom Board; Reveal Next
- Board winner: "{name} wins outright." / Two-way tie: "{a} and {b} tie." / Push: "Push — no score change."
- Premium: "Premium hand — payout doubled." / Sweep: "{name} swept all three boards!" / Stacked: "Premium + sweep — 4× this board."
- Round complete; Start Next Round; End Game
- Active-round cancellation: "This round hasn't been scored and will be excluded. Previously completed rounds remain."
- Final settlement: "Settle privately — the app never moves money."
- Email sent: "Final score sheet sent to the host."
- Invalid room code: "We couldn't find that room. Check the code and try again."
- Room full / already started: "This room is full." / "This game has already started."
- Reconnection successful: "Reconnected." / Connection lost: "Reconnecting…"
