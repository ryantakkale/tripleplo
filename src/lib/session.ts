/**
 * Session cookie helpers. Sessions are opaque, high-entropy tokens stored in
 * HTTP-only, SameSite=Lax cookies scoped per game so a browser can hold seats in
 * multiple games. In production also set `Secure` (HTTPS).
 *
 * The token is the single credential proving a player owns a seat; it is never
 * exposed to other players and never placed in a client-readable location.
 */

import { cookies } from "next/headers";

const PREFIX = "tpl_session_";

export function cookieName(gameId: string): string {
  return PREFIX + gameId;
}

export function readSessionToken(gameId: string): string | null {
  return cookies().get(cookieName(gameId))?.value ?? null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24, // 24h
  };
}
