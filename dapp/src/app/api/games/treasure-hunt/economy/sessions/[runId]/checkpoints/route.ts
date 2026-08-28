import {
  bodyNonNegativeInteger,
  bodyText,
  readTreasureEconomyBody,
  requireTreasureEconomyIdentity,
  treasureEconomyErrorResponse,
  treasureEconomyJson,
} from "../../../_lib/api";
import { appendTreasureHuntEconomyCheckpoint } from "@/lib/uki-economy/game-economy/treasure-hunt";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const identity = await requireTreasureEconomyIdentity();
    const body = await readTreasureEconomyBody(request);
    const { runId } = await context.params;
    const result = await appendTreasureHuntEconomyCheckpoint({
      userId: identity.userId,
      walletAddress: identity.walletAddress,
      runId,
      checkpointId: bodyText(body, "checkpointId", 1, 128),
      scoreRaw: String(bodyNonNegativeInteger(body, "score")),
      gameTimeMs: bodyNonNegativeInteger(body, "gameTimeMs"),
    });
    return treasureEconomyJson({ status: "ok", result });
  } catch (error) {
    return treasureEconomyErrorResponse(error);
  }
}
