import { cookies } from "next/headers";
import { createGameSchema } from "@/lib/contracts";
import { createGame, withDurableStore, redisConfigured, GameError } from "@/server/engine";
import { BOARD_VALUE_CENTS } from "@/core/assignment";
import { cookieName, sessionCookieOptions } from "@/lib/session";
import { ok, fail } from "@/lib/http";

export async function POST(req: Request) {
  return withDurableStore(async () => {
    try {
      if (process.env.VERCEL && !redisConfigured()) {
        throw new GameError(
          "CONFIG",
          "Multiplayer storage is not configured. Add Upstash Redis to this Vercel project."
        );
      }
      const body = createGameSchema.parse(await req.json());
      const { game, sessionToken } = createGame({
        hostDisplayName: body.hostDisplayName,
        hostEmail: body.hostEmail,
        playerCount: body.playerCount,
        boardValueCents: BOARD_VALUE_CENTS[body.boardValueDollars],
        avatarId: body.avatarId,
      });
      cookies().set(cookieName(game.id), sessionToken, sessionCookieOptions());
      return ok({ gameId: game.id, code: game.code });
    } catch (e) {
      return fail(e);
    }
  });
}
