import { readSessionToken } from "@/lib/session";
import { postChat, requireActor, GameError, withDurableStore } from "@/server/engine";
import { chatSchema } from "@/lib/contracts";
import { buildView } from "@/server/views";
import { ok, fail } from "@/lib/http";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return withDurableStore(async () => {
    try {
      const token = readSessionToken(params.id);
      if (!token) throw new GameError("AUTH", "Missing session");
      const body = chatSchema.parse(await req.json());
      const game = postChat(token, body.text);
      const { player, spectator, isSpectator } = requireActor(token);
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
