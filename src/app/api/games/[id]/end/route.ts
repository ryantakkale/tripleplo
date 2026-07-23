import { readSessionToken } from "@/lib/session";
import { endGame, requireSession, GameError, withDurableStore } from "@/server/engine";
import { idempotentSchema } from "@/lib/contracts";
import { buildView } from "@/server/views";
import { sendFinalScoreEmail } from "@/server/email";
import { ok, fail } from "@/lib/http";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return withDurableStore(async () => {
    try {
      const token = readSessionToken(params.id);
      if (!token) throw new GameError("AUTH", "Missing session");
      const { idempotencyKey } = idempotentSchema.parse(await req.json().catch(() => ({})));
      const game = endGame(token, idempotencyKey);
      // Fire-and-forget; the game ends successfully even if email is delayed.
      void sendFinalScoreEmail(game.id);
      const { player } = requireSession(token);
      return ok({ view: buildView(game, player.id) });
    } catch (e) {
      return fail(e);
    }
  });
}
