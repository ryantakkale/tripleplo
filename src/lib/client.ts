"use client";

import type { GameView } from "@/server/views";

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.message || "Request failed");
  return json.data as T;
}

export const api = {
  createGame: (body: {
    hostDisplayName: string;
    hostEmail: string;
    playerCount: 2 | 3;
    boardValueDollars: 1 | 2 | 4;
    avatarId?: string;
  }) => post<{ gameId: string; code: string }>("/api/games", body),

  joinGame: (body: { code: string; displayName: string; avatarId?: string }) =>
    post<{ gameId: string; code: string }>("/api/games/join", body),

  spectateGame: (body: { code: string; displayName: string; avatarId?: string }) =>
    post<{ gameId: string; code: string }>("/api/games/spectate", body),

  practiceGame: (body: {
    hostDisplayName: string;
    playerCount: 2 | 3;
    boardValueDollars: 1 | 2 | 4;
    avatarId?: string;
  }) => post<{ gameId: string; code: string }>("/api/games/practice", body),

  async state(gameId: string): Promise<{ view: GameView | null; unauthenticated?: boolean }> {
    const res = await fetch(`/api/games/${gameId}/state`, { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || "Failed to load");
    return json.data;
  },

  start: (id: string, key?: string) =>
    post<{ view: GameView }>(`/api/games/${id}/start`, { idempotencyKey: key }),
  assign: (id: string, a: { top: string[]; middle: string[]; bottom: string[]; idempotencyKey?: string }) =>
    post<{ view: GameView }>(`/api/games/${id}/assign`, a),
  ready: (id: string, key?: string) =>
    post<{ view: GameView }>(`/api/games/${id}/ready`, { idempotencyKey: key }),
  reveal: (id: string, key?: string) =>
    post<{ view: GameView }>(`/api/games/${id}/reveal`, { idempotencyKey: key }),
  nextRound: (id: string, key?: string) =>
    post<{ view: GameView }>(`/api/games/${id}/next-round`, { idempotencyKey: key }),
  end: (id: string, key?: string) =>
    post<{ view: GameView }>(`/api/games/${id}/end`, { idempotencyKey: key }),
  chat: (id: string, text: string) =>
    post<{ view: GameView }>(`/api/games/${id}/chat`, { text }),
  practiceBotChat: (id: string) =>
    post<{ view: GameView }>(`/api/games/${id}/chat/practice-bot`),
};

export function fmt(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}
