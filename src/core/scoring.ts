/**
 * Board scoring engine for Triple PLO.
 *
 * Pure and independently testable. ALL money is integer cents. Never use binary
 * floating point for scores. Every board result is zero-sum.
 *
 * Multipliers stack multiplicatively: premium (2x) x sweep (2x) = 4x.
 */

export type PlayerId = string;

export type BoardResultType =
  | "TWO_PLAYER_OUTRIGHT"
  | "TWO_PLAYER_PUSH"
  | "THREE_PLAYER_OUTRIGHT"
  | "THREE_PLAYER_TWO_WAY_TIE"
  | "THREE_PLAYER_THREE_WAY_PUSH";

/** A player's evaluated hand strength on a board (from the Omaha evaluator). */
export interface PlayerBoardHand {
  playerId: PlayerId;
  /** Lexicographically comparable score vector. */
  score: number[];
  /** True if this player's hand qualifies for the premium bonus. */
  isPremium: boolean;
}

export interface BoardOutcome {
  resultType: BoardResultType;
  winners: PlayerId[];
  losers: PlayerId[];
  /** True when the (tied) winning hand qualifies for the premium bonus. */
  winningHandIsPremium: boolean;
}

export interface BoardScore {
  boardValueCents: number;
  resultType: BoardResultType;
  winners: PlayerId[];
  losers: PlayerId[];
  premiumMultiplier: 1 | 2;
  sweepMultiplier: 1 | 2;
  totalMultiplier: 1 | 2 | 4;
  /** Amount each losing player owes (positive cents). Empty on a push. */
  amountOwedPerLoser: number;
  /** Net change per player id, in cents. Sums to zero. */
  net: Record<PlayerId, number>;
  explanation: string;
  zeroSum: boolean;
}

/** Compare two score vectors lexicographically (>0 means a beats b). */
function cmp(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Determines winners/losers and result type from evaluated hands. */
export function determineBoardOutcome(hands: PlayerBoardHand[]): BoardOutcome {
  const playerCount = hands.length;
  if (playerCount !== 2 && playerCount !== 3) {
    throw new Error(`Board must have 2 or 3 players, got ${playerCount}`);
  }

  let best = hands[0]!.score;
  for (const h of hands) if (cmp(h.score, best) > 0) best = h.score;

  const winners = hands.filter((h) => cmp(h.score, best) === 0);
  const losers = hands.filter((h) => cmp(h.score, best) !== 0);
  const winningHandIsPremium = winners.every((w) => w.isPremium) && winners[0]!.isPremium;

  let resultType: BoardResultType;
  if (playerCount === 2) {
    resultType = winners.length === 1 ? "TWO_PLAYER_OUTRIGHT" : "TWO_PLAYER_PUSH";
  } else {
    resultType =
      winners.length === 1
        ? "THREE_PLAYER_OUTRIGHT"
        : winners.length === 2
          ? "THREE_PLAYER_TWO_WAY_TIE"
          : "THREE_PLAYER_THREE_WAY_PUSH";
  }

  return {
    resultType,
    winners: winners.map((w) => w.playerId),
    losers: losers.map((l) => l.playerId),
    winningHandIsPremium,
  };
}

export interface ScoreBoardInput {
  boardValueCents: number;
  outcome: BoardOutcome;
  /** All player ids on the board, in seat order (for stable zero net entries). */
  playerIds: PlayerId[];
  /** Whether the 3-board sweep multiplier applies to this board. */
  sweepApplies: boolean;
}

function emptyNet(ids: PlayerId[]): Record<PlayerId, number> {
  const net: Record<PlayerId, number> = {};
  for (const id of ids) net[id] = 0;
  return net;
}

function centsToDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

/**
 * Scores a single board. Returns full breakdown and net cents per player.
 * Guarantees zero-sum.
 */
export function scoreBoard(input: ScoreBoardInput): BoardScore {
  const { boardValueCents, outcome, playerIds, sweepApplies } = input;
  const { resultType, winners, losers, winningHandIsPremium } = outcome;

  const premiumMultiplier: 1 | 2 = winningHandIsPremium ? 2 : 1;
  const sweepMultiplier: 1 | 2 = sweepApplies ? 2 : 1;
  const totalMultiplier = (premiumMultiplier * sweepMultiplier) as 1 | 2 | 4;
  const unit = boardValueCents * totalMultiplier; // one board value after multipliers

  const net = emptyNet(playerIds);
  const add = (id: PlayerId, delta: number) => {
    net[id] = (net[id] ?? 0) + delta;
  };
  let amountOwedPerLoser = 0;
  let explanation: string;

  switch (resultType) {
    case "TWO_PLAYER_PUSH":
    case "THREE_PLAYER_THREE_WAY_PUSH": {
      explanation = `Push — hands tied. No score changes.`;
      break;
    }
    case "TWO_PLAYER_OUTRIGHT": {
      const winner = winners[0]!;
      const loser = losers[0]!;
      amountOwedPerLoser = unit;
      add(winner, unit);
      add(loser, -unit);
      explanation =
        `${winner} wins outright. ${loser} pays ${centsToDollars(unit)}` +
        multiplierNote(boardValueCents, premiumMultiplier, sweepMultiplier);
      break;
    }
    case "THREE_PLAYER_OUTRIGHT": {
      const winner = winners[0]!;
      amountOwedPerLoser = unit;
      for (const loser of losers) {
        add(loser, -unit);
        add(winner, unit);
      }
      explanation =
        `${winner} wins outright. Each of ${losers.join(", ")} pays ${centsToDollars(unit)}` +
        multiplierNote(boardValueCents, premiumMultiplier, sweepMultiplier);
      break;
    }
    case "THREE_PLAYER_TWO_WAY_TIE": {
      // Sole loser owes ONE total board value, split equally between winners.
      const loser = losers[0]!;
      amountOwedPerLoser = unit;
      const half = unit / 2; // always integer cents: base (100/200/400) x {1,2} is even
      if (!Number.isInteger(half)) {
        throw new Error(`Split payout is not an integer number of cents: ${unit}/2`);
      }
      add(loser, -unit);
      for (const w of winners) add(w, half);
      explanation =
        `${winners.join(" and ")} tie. ${loser} pays ${centsToDollars(unit)}, ` +
        `split ${centsToDollars(half)} each` +
        multiplierNote(boardValueCents, premiumMultiplier, sweepMultiplier);
      break;
    }
  }

  const zeroSum = Object.values(net).reduce((a, b) => a + b, 0) === 0;

  return {
    boardValueCents,
    resultType,
    winners,
    losers,
    premiumMultiplier,
    sweepMultiplier,
    totalMultiplier,
    amountOwedPerLoser,
    net,
    explanation,
    zeroSum,
  };
}

function multiplierNote(base: number, premium: 1 | 2, sweep: 1 | 2): string {
  const parts: string[] = [` (base ${centsToDollars(base)}`];
  if (premium === 2) parts.push(`, premium 2x`);
  if (sweep === 2) parts.push(`, sweep 2x`);
  parts.push(`).`);
  return parts.join("");
}
