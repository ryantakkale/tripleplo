import { describe, it, expect } from "vitest";
import { nextPhase, nextRevealStep, isTerminal, REVEAL_SEQUENCE } from "./stateMachine";

describe("state machine transitions", () => {
  it("happy path lobby -> ended", () => {
    expect(nextPhase("LOBBY", { type: "SEATS_FILLED" })).toBe("READY_TO_START");
    expect(nextPhase("READY_TO_START", { type: "START_ROUND" })).toBe("DEALING");
    expect(nextPhase("DEALING", { type: "DEAL_COMMITTED" })).toBe("ARRANGING");
    expect(nextPhase("ARRANGING", { type: "ALL_PLAYERS_READY" })).toBe("READY_TO_REVEAL");
    expect(nextPhase("READY_TO_REVEAL", { type: "REVEAL_NEXT" })).toBe("REVEALING");
    expect(nextPhase("REVEALING", { type: "REVEAL_COMPLETE" })).toBe("ROUND_SUMMARY");
    expect(nextPhase("ROUND_SUMMARY", { type: "START_NEXT_ROUND" })).toBe("WAITING_NEXT_ROUND");
    expect(nextPhase("WAITING_NEXT_ROUND", { type: "START_ROUND" })).toBe("DEALING");
    expect(nextPhase("ROUND_SUMMARY", { type: "END_GAME" })).toBe("GAME_ENDED");
  });

  it("rejects illegal transitions", () => {
    expect(nextPhase("LOBBY", { type: "REVEAL_NEXT" })).toBeNull();
    expect(nextPhase("DEALING", { type: "START_ROUND" })).toBeNull();
    expect(nextPhase("GAME_ENDED", { type: "START_ROUND" })).toBeNull();
  });

  it("host disconnect + timeout ends the game", () => {
    expect(nextPhase("ARRANGING", { type: "HOST_DISCONNECTED" })).toBe("HOST_DISCONNECTED");
    expect(nextPhase("HOST_DISCONNECTED", { type: "HOST_TIMEOUT" })).toBe("GAME_ENDED");
  });

  it("everyone disconnected abandons the game", () => {
    expect(nextPhase("ARRANGING", { type: "EVERYONE_DISCONNECTED_GRACE_EXPIRED" })).toBe(
      "GAME_ABANDONED"
    );
  });

  it("reveal sequence advances then completes", () => {
    expect(nextRevealStep("TOP_ASSIGNMENTS")).toBe("TOP_TURN");
    expect(nextRevealStep(REVEAL_SEQUENCE[REVEAL_SEQUENCE.length - 1]!)).toBeNull();
  });

  it("terminal detection", () => {
    expect(isTerminal("GAME_ENDED")).toBe(true);
    expect(isTerminal("GAME_ABANDONED")).toBe(true);
    expect(isTerminal("LOBBY")).toBe(false);
  });
});
