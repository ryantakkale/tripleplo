/**
 * Authoritative game state machine for Triple PLO.
 *
 * This module is the single source of truth for legal transitions. The server
 * consults `canTransition` before applying any mutation. Every mutation must
 * also verify: acting player, host authorization, expected state version,
 * idempotency key, room membership, and session validity (enforced in the
 * server layer, not here — this module is pure).
 */

export type GamePhase =
  | "LOBBY" // room created, waiting for seats to fill
  | "READY_TO_START" // all seats filled, host may start
  | "DEALING" // server shuffling + dealing (transient, atomic)
  | "ARRANGING" // players arranging; waiting for everyone to press Ready
  | "READY_TO_REVEAL" // all players Ready; host may reveal boards
  | "REVEALING" // host stepping through board reveals (see revealStep)
  | "ROUND_SUMMARY" // all boards + sweep resolved; scores committed
  | "WAITING_NEXT_ROUND" // between rounds
  | "HOST_DISCONNECTED" // 5-minute host reconnection window; progression paused
  | "GAME_ABANDONED" // everyone disconnected past grace period
  | "GAME_ENDED"; // terminal

export type RevealStep =
  | "TOP_ASSIGNMENTS"
  | "TOP_TURN"
  | "TOP_RIVER"
  | "TOP_RESULT"
  | "MIDDLE_ASSIGNMENTS"
  | "MIDDLE_TURN"
  | "MIDDLE_RIVER"
  | "MIDDLE_RESULT"
  | "BOTTOM_ASSIGNMENTS"
  | "BOTTOM_TURN"
  | "BOTTOM_RIVER"
  | "BOTTOM_RESULT"
  | "SWEEP_EVAL";

export const REVEAL_SEQUENCE: readonly RevealStep[] = [
  "TOP_ASSIGNMENTS",
  "TOP_TURN",
  "TOP_RIVER",
  "TOP_RESULT",
  "MIDDLE_ASSIGNMENTS",
  "MIDDLE_TURN",
  "MIDDLE_RIVER",
  "MIDDLE_RESULT",
  "BOTTOM_ASSIGNMENTS",
  "BOTTOM_TURN",
  "BOTTOM_RIVER",
  "BOTTOM_RESULT",
  "SWEEP_EVAL",
] as const;

export type GameEvent =
  | { type: "PLAYER_JOINED" }
  | { type: "SEATS_FILLED" }
  | { type: "START_ROUND" } // host
  | { type: "DEAL_COMMITTED" } // server
  | { type: "ALL_PLAYERS_READY" } // server-derived
  | { type: "REVEAL_NEXT" } // host
  | { type: "REVEAL_COMPLETE" } // server: last reveal step done
  | { type: "START_NEXT_ROUND" } // host
  | { type: "END_GAME" } // host
  | { type: "HOST_DISCONNECTED" }
  | { type: "HOST_RECONNECTED" }
  | { type: "HOST_TIMEOUT" } // 5 min expired
  | { type: "EVERYONE_DISCONNECTED_GRACE_EXPIRED" };

/**
 * Returns the next phase for a (phase, event) pair, or null if the transition
 * is illegal. Illegal transitions must be rejected by the server.
 *
 * Note: HOST_DISCONNECTED can occur from most active phases; on reconnection we
 * return to the phase stored before disconnection (handled by the server via a
 * `resumePhase` field). Here we model the common lobby/active cases.
 */
export function nextPhase(phase: GamePhase, event: GameEvent): GamePhase | null {
  switch (phase) {
    case "LOBBY":
      if (event.type === "PLAYER_JOINED") return "LOBBY";
      if (event.type === "SEATS_FILLED") return "READY_TO_START";
      if (event.type === "END_GAME") return "GAME_ENDED";
      break;
    case "READY_TO_START":
      if (event.type === "START_ROUND") return "DEALING";
      if (event.type === "END_GAME") return "GAME_ENDED";
      break;
    case "DEALING":
      if (event.type === "DEAL_COMMITTED") return "ARRANGING";
      break;
    case "ARRANGING":
      if (event.type === "ALL_PLAYERS_READY") return "READY_TO_REVEAL";
      if (event.type === "END_GAME") return "GAME_ENDED"; // cancels round
      break;
    case "READY_TO_REVEAL":
      if (event.type === "REVEAL_NEXT") return "REVEALING";
      if (event.type === "END_GAME") return "GAME_ENDED";
      break;
    case "REVEALING":
      if (event.type === "REVEAL_NEXT") return "REVEALING";
      if (event.type === "REVEAL_COMPLETE") return "ROUND_SUMMARY";
      break;
    case "ROUND_SUMMARY":
      if (event.type === "START_NEXT_ROUND") return "WAITING_NEXT_ROUND";
      if (event.type === "END_GAME") return "GAME_ENDED";
      break;
    case "WAITING_NEXT_ROUND":
      if (event.type === "START_ROUND") return "DEALING";
      if (event.type === "END_GAME") return "GAME_ENDED";
      break;
    case "HOST_DISCONNECTED":
      if (event.type === "HOST_RECONNECTED") return "READY_TO_START"; // server overrides w/ resumePhase
      if (event.type === "HOST_TIMEOUT") return "GAME_ENDED";
      break;
    case "GAME_ABANDONED":
    case "GAME_ENDED":
      break;
  }

  // Global transitions available from any non-terminal active phase.
  const nonTerminal =
    phase !== "GAME_ENDED" && phase !== "GAME_ABANDONED";
  if (nonTerminal) {
    if (event.type === "HOST_DISCONNECTED" && phase !== "HOST_DISCONNECTED") {
      return "HOST_DISCONNECTED";
    }
    if (event.type === "EVERYONE_DISCONNECTED_GRACE_EXPIRED") return "GAME_ABANDONED";
  }

  return null;
}

/** Given the current reveal step, returns the next one, or null if done. */
export function nextRevealStep(step: RevealStep): RevealStep | null {
  const i = REVEAL_SEQUENCE.indexOf(step);
  if (i < 0 || i + 1 >= REVEAL_SEQUENCE.length) return null;
  return REVEAL_SEQUENCE[i + 1]!;
}

export function isTerminal(phase: GamePhase): boolean {
  return phase === "GAME_ENDED" || phase === "GAME_ABANDONED";
}
