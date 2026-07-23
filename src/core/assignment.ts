/**
 * Hand-arrangement (assignment) validation for Triple PLO.
 *
 * A player must split their 12 private cards into three groups of 4 (top,
 * middle, bottom). Every private card must be used exactly once. This is
 * validated authoritatively on the server before Ready is accepted.
 */

import { isCard, type Card } from "./cards";
import { BOARD_ORDER, type BoardId } from "./deal";

export type Assignment = Record<BoardId, Card[]>;

export interface AssignmentValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validates an assignment against the player's actual 12 private cards.
 * `privateCards` is the authoritative set the server dealt to this player.
 */
export function validateAssignment(
  assignment: Assignment,
  privateCards: readonly Card[]
): AssignmentValidation {
  const errors: string[] = [];

  if (privateCards.length !== 12) {
    errors.push(`Player must have exactly 12 private cards, got ${privateCards.length}`);
  }

  const allowed = new Set<string>(privateCards);
  const used = new Set<string>();
  let totalAssigned = 0;

  for (const board of BOARD_ORDER) {
    const cards = assignment[board] ?? [];
    if (cards.length !== 4) {
      errors.push(`${board} board must have exactly 4 cards, got ${cards.length}`);
    }
    for (const c of cards) {
      if (!isCard(c)) {
        errors.push(`Invalid card code on ${board} board: ${String(c)}`);
        continue;
      }
      if (!allowed.has(c)) {
        errors.push(`Card ${c} on ${board} board is not one of the player's private cards`);
      }
      if (used.has(c)) {
        errors.push(`Card ${c} is assigned to more than one board`);
      }
      used.add(c);
      totalAssigned++;
    }
  }

  if (totalAssigned !== 12) {
    errors.push(`Exactly 12 cards must be assigned, got ${totalAssigned}`);
  }
  // Every private card must be used (covered by count + membership, but explicit
  // check gives a clearer error).
  for (const c of privateCards) {
    if (!used.has(c)) errors.push(`Private card ${c} was left unassigned`);
  }

  return { valid: errors.length === 0, errors };
}

export const BOARD_VALUE_CENTS = {
  1: 100,
  2: 200,
  4: 400,
} as const;

export type BoardValueDollars = keyof typeof BOARD_VALUE_CENTS;

export function isValidBoardValue(v: number): v is BoardValueDollars {
  return v === 1 || v === 2 || v === 4;
}
