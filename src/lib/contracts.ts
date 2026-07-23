/**
 * Zod contracts for all client -> server requests. Every route validates input
 * with these before touching the engine.
 */

import { z } from "zod";

const cardCode = z.string().regex(/^[23456789TJQKA][cdhs]$/, "invalid card");

export const createGameSchema = z.object({
  hostDisplayName: z.string().trim().min(1).max(24),
  hostEmail: z.string().trim().email().max(254),
  playerCount: z.union([z.literal(2), z.literal(3)]),
  boardValueDollars: z.union([z.literal(1), z.literal(2), z.literal(4)]),
});
export type CreateGamePayload = z.infer<typeof createGameSchema>;

export const practiceGameSchema = z.object({
  hostDisplayName: z.string().trim().min(1).max(24),
  playerCount: z.union([z.literal(2), z.literal(3)]),
  boardValueDollars: z.union([z.literal(1), z.literal(2), z.literal(4)]),
});

export const joinGameSchema = z.object({
  code: z.string().trim().min(4).max(12),
  displayName: z.string().trim().min(1).max(24),
});

export const assignmentSchema = z.object({
  top: z.array(cardCode).length(4),
  middle: z.array(cardCode).length(4),
  bottom: z.array(cardCode).length(4),
  idempotencyKey: z.string().max(100).optional(),
});

export const idempotentSchema = z.object({
  idempotencyKey: z.string().max(100).optional(),
});
