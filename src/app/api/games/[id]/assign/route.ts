import { readSessionToken } from "@/lib/session";
import { saveAssignment, requireSession, GameError, withDurableStore } from "@/server/engine";
import { assignmentSchema } from "@/lib/contracts";
import { buildView } from "@/server/views";
import { ok, fail } from "@/lib/http";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return withDurableStore(async () => {
    try {
      const token = readSessionToken(params.id);
      if (!token) throw new GameError("AUTH", "Missing session");
      const body = assignmentSchema.parse(await req.json());
      const game = saveAssignment(
        token,
        { top: body.top, middle: body.middle, bottom: body.bottom } as any,
        body.idempotencyKey
      );
      const { player } = requireSession(token);
      return ok({ view: buildView(game, player.id) });
    } catch (e) {
      return fail(e);
    }
  });
}
