import { readSessionToken } from "@/lib/session";
import { postPracticeBotChat, requireSession, GameError, withDurableStore } from "@/server/engine";
import { buildView } from "@/server/views";
import { ok, fail } from "@/lib/http";

/** Practice only — post a canned line as a CPU opponent. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return withDurableStore(async () => {
    try {
      const token = readSessionToken(params.id);
      if (!token) throw new GameError("AUTH", "Missing session");
      const game = postPracticeBotChat(token);
      const { player } = requireSession(token);
      return ok({ view: buildView(game, player.id) });
    } catch (e) {
      return fail(e);
    }
  });
}
