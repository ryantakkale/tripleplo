import { cookies } from "next/headers";
import { joinGameSchema } from "@/lib/contracts";
import { joinAsSpectator, withDurableStore } from "@/server/engine";
import { cookieName, sessionCookieOptions } from "@/lib/session";
import { ok, fail } from "@/lib/http";

export async function POST(req: Request) {
  return withDurableStore(async () => {
    try {
      const body = joinGameSchema.parse(await req.json());
      const { game, sessionToken } = joinAsSpectator(body.code, body.displayName, body.avatarId);
      cookies().set(cookieName(game.id), sessionToken, sessionCookieOptions());
      return ok({ gameId: game.id, code: game.code });
    } catch (e) {
      return fail(e);
    }
  });
}
