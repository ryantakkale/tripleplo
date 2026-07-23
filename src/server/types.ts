/**
 * Server-side authoritative game state types.
 *
 * This is the FULL state, including secret information (private cards, hidden
 * turns/rivers, burns, undealt cards). It must never be sent to a client as-is;
 * clients receive redacted "views" (see views.ts).
 */

import type { Card } from "@/core/cards";
import type { Deal, BoardId } from "@/core/deal";
import type { Assignment } from "@/core/assignment";
import type { RoundResult } from "@/core/round";
import type { GamePhase, RevealStep } from "@/core/stateMachine";

export interface ServerPlayer {
  id: string;
  seat: number;
  displayName: string;
  isHost: boolean;
  /** Practice-mode CPU opponent. Auto-arranges and auto-readies server-side. */
  isBot?: boolean;
  /** Secret. Never leaves the server except back to the owning session as a cookie. */
  sessionToken: string;
  /** Host only. Secret; never exposed to other players. */
  email?: string;
  connected: boolean;
  lastSeenAt: number;
}

export interface RoundState {
  roundNumber: number;
  /** Full authoritative deal (secret). */
  deal: Deal;
  /** Per-player arrangement; null until saved. */
  assignments: Record<string, Assignment | null>;
  /** Per-player ready flag; once true it is permanently locked for the round. */
  ready: Record<string, boolean>;
  /** Current reveal pointer; null until the host starts revealing. */
  revealStep: RevealStep | null;
  /** Live win-probabilities per board (percent), updated at each reveal step. */
  equity: Partial<Record<BoardId, Record<string, number>>>;
  /** Computed once all players are ready. Secret until progressively revealed. */
  result: RoundResult | null;
  cancelled: boolean;
}

export interface GameStats {
  outrightWins: Record<string, number>;
  tiedWins: Record<string, number>;
  pushes: number;
  sweeps: Record<string, number>;
  premiumBonuses: Record<string, number>;
}

export interface Game {
  id: string;
  code: string;
  playerCount: 2 | 3;
  boardValueCents: number;
  hostId: string;
  phase: GamePhase;
  /** Optimistic-concurrency version. Every committed mutation increments it. */
  version: number;
  players: ServerPlayer[];
  round: RoundState | null;
  completedRounds: number;
  cumulative: Record<string, number>;
  stats: GameStats;
  createdAt: number;
  endedAt: number | null;
  /** Phase to resume to after a host reconnection. */
  resumePhase: GamePhase | null;
  hostDisconnectedAt: number | null;
  /** Idempotency keys already applied, to make duplicate commands safe. */
  processedKeys: Set<string>;
  /** Records of final-score email attempts. */
  emailStatus: "none" | "pending" | "sent" | "failed";
  /**
   * When the next auto-reveal step should fire (epoch ms). Driven by poll/tick
   * rather than process timers so it works on multi-instance hosts (Vercel).
   */
  nextRevealAt: number | null;
}

export type { Card, BoardId, Assignment, GamePhase, RevealStep };
