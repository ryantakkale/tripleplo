/**
 * Shared game store for multi-instance hosts (Vercel).
 *
 * Local/dev: plain in-memory Map (globalThis).
 * Production with Upstash Redis: load/save the whole store under a lock so
 * every serverless instance sees the same rooms and sessions.
 *
 * Env (either pair works):
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *   KV_REST_API_URL + KV_REST_API_TOKEN  (Vercel marketplace / legacy KV)
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { Redis } from "@upstash/redis";
import type { Game } from "./types";

export interface Store {
  games: Map<string, Game>;
  codeIndex: Map<string, string>;
  sessions: Map<string, SessionRef>;
}

export type SessionRef = {
  gameId: string;
  playerId?: string;
  spectatorId?: string;
};

type WireGame = Omit<Game, "processedKeys"> & { processedKeys: string[] };
type WireStore = {
  games: Record<string, WireGame>;
  codeIndex: Record<string, string>;
  sessions: Record<string, SessionRef>;
};

const STORE_KEY = "tpl:v1:store";
const LOCK_KEY = "tpl:v1:lock";
const STORE_TTL_SECONDS = 60 * 60 * 48; // 48h

const als = new AsyncLocalStorage<Store>();

function memoryStore(): Store {
  const g = globalThis as unknown as { __triplePloStore?: Store };
  if (!g.__triplePloStore) {
    g.__triplePloStore = {
      games: new Map(),
      codeIndex: new Map(),
      sessions: new Map(),
    };
  }
  return g.__triplePloStore;
}

function redisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export function redisConfigured(): boolean {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
  );
}

export function getStore(): Store {
  return als.getStore() ?? memoryStore();
}

function toWire(store: Store): WireStore {
  const games: Record<string, WireGame> = {};
  for (const [id, game] of store.games) {
    games[id] = {
      ...game,
      processedKeys: [...game.processedKeys],
    };
  }
  return {
    games,
    codeIndex: Object.fromEntries(store.codeIndex),
    sessions: Object.fromEntries(store.sessions),
  };
}

function fromWire(wire: WireStore | null): Store {
  const store: Store = {
    games: new Map(),
    codeIndex: new Map(),
    sessions: new Map(),
  };
  if (!wire) return store;
  for (const [id, g] of Object.entries(wire.games ?? {})) {
    store.games.set(id, {
      ...g,
      processedKeys: new Set(g.processedKeys ?? []),
      chat: g.chat ?? [],
      chatRevision: g.chatRevision ?? 0,
      nextRevealAt: g.nextRevealAt ?? null,
      spectators: g.spectators ?? [],
    });
  }
  for (const [code, gameId] of Object.entries(wire.codeIndex ?? {})) {
    store.codeIndex.set(code, gameId);
  }
  for (const [token, ref] of Object.entries(wire.sessions ?? {})) {
    store.sessions.set(token, ref);
  }
  return store;
}

async function acquireLock(redis: Redis): Promise<boolean> {
  for (let i = 0; i < 25; i++) {
    const ok = await redis.set(LOCK_KEY, "1", { nx: true, ex: 8 });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 40 + i * 20));
  }
  return false;
}

async function releaseLock(redis: Redis): Promise<void> {
  await redis.del(LOCK_KEY);
}

/**
 * Run an engine action against the shared store. In Redis mode the store is
 * loaded, mutated, and written back under a short lock.
 */
export async function withDurableStore<T>(fn: () => T | Promise<T>): Promise<T> {
  const redis = redisClient();
  if (!redis) {
    if (process.env.VERCEL) {
      console.warn(
        "[tripleplo] Redis is not configured. Multiplayer will fail across serverless instances. Add Upstash Redis and set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN."
      );
    }
    return fn();
  }

  const locked = await acquireLock(redis);
  if (!locked) {
    throw new Error("Game store busy — try again");
  }

  try {
    const raw = await redis.get<WireStore>(STORE_KEY);
    const store = fromWire(raw);
    const result = await als.run(store, fn);
    await redis.set(STORE_KEY, toWire(store), { ex: STORE_TTL_SECONDS });
    return result;
  } finally {
    await releaseLock(redis);
  }
}
