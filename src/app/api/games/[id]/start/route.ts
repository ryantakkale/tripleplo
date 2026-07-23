import { readSessionToken } from "@/lib/session";
import { startRound, requireSession, withDurableStore, GameError } from "@/server/engine";
import { idempotentSchema } from "@/lib/contracts";
import { buildView } from "@/server/views";
import { ok, fail } from "@/lib/http";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return withDurableStore(async () => {
    try {
      const token = readSessionToken(params.id);
      if (!token) throw new GameError("AUTH", "Missing session");
      const { idempotencyKey } = idempotentSchema.parse(await req.json().catch(() => ({})));
      const game = startRound(token, idempotencyKey);
      const { player } = requireSession(token);
      return ok({ view: buildView(game, player.id) });
    } catch (e) {
      return fail(e);
    }
  });
}
