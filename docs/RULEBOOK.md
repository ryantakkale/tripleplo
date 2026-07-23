# Triple PLO — How to Play

Triple PLO is Pot-Limit Omaha played across **three community boards at once**. You get 12 private cards and split them into three hands of four — one for each board. The best five-card Omaha hand wins each board. It's fast, social, and easy to pick up.

**The app only keeps score.** No money moves through it. At the end you get a simple "who owes whom" sheet and settle privately.

---

## Creating a game
The host creates the room and is also a player. When creating, the host chooses:
- **Players:** 2 or 3.
- **Value per board:** $1, $2, or $4 (a scorekeeping label only). All three boards are always worth the same amount.

The host provides a display name and an email (used only to send the final score sheet — never shared with other players). The host shares a **room code** or **invite link**.

## Joining a game
Other players join with the room code or link and a **display name**. No account or email required. Display names must be unique within a room. Once the required number of seats is filled and the first round begins, the roster is **locked** — no new, replacement, or removed players.

## Setup
Every round the server shuffles one standard 52-card deck (no jokers) using a secure shuffle. You only ever see **your own** private cards. Hidden cards (other players' cards, face-down turns/rivers, burns, undealt cards) never reach your browser.

## Three-player deal
- 12 private cards to each player (36 total)
- Burn 1 card
- Three face-up flops (top, middle, bottom) — 9 cards
- One face-down turn per board — 3 cards
- One face-down river per board — 3 cards
- **All 52 cards are used.** No burns before the turns or rivers.

## Two-player deal
- 12 private cards to each player (24 total)
- Burn 1, deal three flops (9), burn 1, deal three turns (3), burn 1, deal three rivers (3)
- **42 cards used, 3 burned, 10 stay hidden and undealt.**

## Burn cards
Burn cards are removed by the server and never shown. (3-player: 1 burn. 2-player: 3 burns.)

## Three boards
Each board ends with three flop cards (face up during arrangement) + one turn + one river (hidden until that board's reveal).

## Hand arrangement
Split your 12 private cards into three groups of four: **top**, **middle**, **bottom**. Every card is used exactly once. Each board needs exactly four cards before you can press Ready.

Arrange by drag-and-drop (desktop) or tap-to-select then tap-to-place (mobile), with accessible button controls as a fallback. You can rearrange freely until you press Ready.

## Ready state
Pressing **Ready** permanently locks your arrangement for the round (with a confirmation: *"Your hands cannot be changed after you press Ready. Continue?"*). Nobody — not even the host — can unlock or change it. There is no arrangement timer; take all the time you need. The reveal can't begin until **everyone** is Ready.

## Reveal sequence
The host reveals boards in order: **Top → Middle → Bottom**. For each board: reveal every player's four assigned cards, then the turn, then the river; evaluate hands; show the winner (or tie), the exact five cards each player used, and the board score. There is no undo.

## Omaha hand construction
For each board you must use **exactly two** of your four assigned private cards and **exactly three** of that board's five community cards. Not one, not four private cards; not two or four community cards; and never cards you assigned to another board.

## Hand rankings (high to low)
Royal flush → Straight flush → Four of a kind → Full house → Flush → Straight → Three of a kind → Two pair → One pair → High card. Aces play high or as the low end of the 5-4-3-2-A wheel. A royal flush is the best straight flush (no extra bonus beyond the straight-flush premium).

---

## Scoring

### Normal payouts
- **Two-player outright win:** loser pays the winner one board value. *($2 game: winner +$2, loser −$2.)*
- **Three-player outright win:** each loser pays the winner one board value. *($2: winner +$4, each loser −$2.)*

### Two-player ties
Push — no payout, no score change.

### Three-player two-way tie
The sole loser owes **one** board value, split equally between the two tied winners.
- *$1 game:* winners +$0.50 each, loser −$1.
- *$2 game:* winners +$1 each, loser −$2.

### Three-player three-way tie
Push — no payout.

### Premium-hand bonus (2×)
A **winning** hand of **four of a kind, straight flush, or royal flush** doubles that board's payout.
- *Two-player, $2, winner has quads:* winner +$4, loser −$4.
- *Three-player, $2, winner has a straight flush:* winner +$8, each loser −$4.
- *Three-player two-way tie, $1, tied quads:* loser's liability doubles to $2, split → winners +$1 each, loser −$2.

### Sweep bonus (2×)
Winning **all three boards outright** (no ties) doubles **every** board payout in the round.
- *Two-player, $2 sweep:* +$12 / −$12.
- *Three-player, $2 sweep:* sweeper +$24; each opponent −$12.

A tie on any board prevents a sweep. Winning two and tying one is **not** a sweep.

### Stacking bonuses
Premium and sweep multipliers stack **multiplicatively** — a board that is both is worth **4×**.
- *Three-player, $2, sweep including one quads board:* that premium board is $8 per loser (winner +$16 on it).

Because a sweep is only known after all three boards resolve, board scores may show provisionally during the reveal and then clearly update when a sweep is confirmed.

**Every board, round, and completed game is zero-sum.**

---

## Multiple rounds
Scores carry forward. The host can start another round (all players must be connected) or end the game. Each new round is a fresh shuffle and deal with the same players, board value, and cumulative scoreboard.

## Disconnections
Your seat is tied to a secure session, so you can refresh, switch networks, or reopen the browser and return to the same seat with the game state restored.
- **Disconnect before Ready:** your seat and saved arrangement are preserved; the round waits for you.
- **Disconnect after Ready:** your locked hands are still evaluated and scored; reconnect any time.
- **Host disconnect:** a 5-minute window pauses progression. Reconnect to resume. If the host doesn't return, the game ends, completed scores are preserved, and the score sheet is emailed. (If everyone was Ready, the server finishes the reveals and includes that round; if not, the incomplete round is cancelled.)
- **Everyone disconnects:** after a short grace period the game is abandoned; completed scores are preserved and emailed.

## Ending the game
The host can End Game from a completed-round state (locks scores, shows and emails the settlement). Ending during an active round cancels and excludes that round; previously completed rounds remain. Once ended, nothing can be edited and no one can rejoin to continue.

## Final settlement
You get each player's cumulative net, key stats, and a **minimized list of payments** (e.g. "Sam pays Alex $12"). Balances always sum to zero. Settle privately — the app never moves money.
