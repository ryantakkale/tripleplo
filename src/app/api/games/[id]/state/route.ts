import { readSessionToken } from "@/lib/session";
import { getGameByToken, withDurableStore } from "@/server/engine";
import { buildView } from "@/server/views";
import { ok, fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return withDurableStore(async () => {
    try {
      const token = readSessionToken(params.id);
      if (!token) return ok({ view: null, unauthenticated: true });
      const { game, player, spectator, isSpectator } = getGameByToken(token);
      return ok({
        view: buildView(
          game,
          player?.id ?? null,
          isSpectator ? spectator?.id ?? null : null
        ),
      });
    } catch (e) {
      return fail(e);
    }
  });
}
