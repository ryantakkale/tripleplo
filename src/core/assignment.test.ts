import { describe, it, expect } from "vitest";
import { validateAssignment, isValidBoardValue, BOARD_VALUE_CENTS } from "./assignment";
import type { Card } from "./cards";
import type { Assignment } from "./assignment";

const twelve: Card[] = [
  "As", "Ks", "Qs", "Js",
  "Th", "9h", "8h", "7h",
  "2c", "3c", "4c", "5c",
];

function assign(top: Card[], middle: Card[], bottom: Card[]): Assignment {
  return { top, middle, bottom };
}

describe("validateAssignment", () => {
  it("accepts a valid 4/4/4 split using each card once", () => {
    const a = assign(
      ["As", "Ks", "Qs", "Js"],
      ["Th", "9h", "8h", "7h"],
      ["2c", "3c", "4c", "5c"]
    );
    expect(validateAssignment(a, twelve).valid).toBe(true);
  });

  it("rejects fewer than four on a board", () => {
    const a = assign(["As", "Ks", "Qs"], ["Th", "9h", "8h", "7h", "Js"], ["2c", "3c", "4c", "5c"]);
    const r = validateAssignment(a, twelve);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("top board must have exactly 4"))).toBe(true);
  });

  it("rejects more than four on a board", () => {
    const a = assign(
      ["As", "Ks", "Qs", "Js", "Th"],
      ["9h", "8h", "7h"],
      ["2c", "3c", "4c", "5c"]
    );
    expect(validateAssignment(a, twelve).valid).toBe(false);
  });

  it("rejects duplicate card assignment", () => {
    const a = assign(
      ["As", "Ks", "Qs", "As"], // As twice
      ["Th", "9h", "8h", "7h"],
      ["2c", "3c", "4c", "5c"]
    );
    const r = validateAssignment(a, twelve);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("more than one board"))).toBe(true);
  });

  it("rejects a card not in the player's private cards", () => {
    const a = assign(
      ["As", "Ks", "Qs", "6d"], // 6d not owned
      ["Th", "9h", "8h", "7h"],
      ["2c", "3c", "4c", "5c"]
    );
    expect(validateAssignment(a, twelve).valid).toBe(false);
  });

  it("rejects a missing/unassigned private card", () => {
    const a = assign(
      ["As", "Ks", "Qs", "Js"],
      ["Th", "9h", "8h", "7h"],
      ["2c", "3c", "4c", "4c"] // 5c missing, 4c dup
    );
    expect(validateAssignment(a, twelve).valid).toBe(false);
  });
});

describe("board value config", () => {
  it("accepts 1, 2, 4", () => {
    expect(isValidBoardValue(1)).toBe(true);
    expect(isValidBoardValue(2)).toBe(true);
    expect(isValidBoardValue(4)).toBe(true);
  });
  it("rejects other values", () => {
    expect(isValidBoardValue(3)).toBe(false);
    expect(isValidBoardValue(0)).toBe(false);
  });
  it("maps dollars to exact cents", () => {
    expect(BOARD_VALUE_CENTS[1]).toBe(100);
    expect(BOARD_VALUE_CENTS[2]).toBe(200);
    expect(BOARD_VALUE_CENTS[4]).toBe(400);
  });
});
