import {
  bodyNonNegativeInteger,
  bodyText,
  readTreasureEconomyBody,
  requireTreasureEconomyIdentity,
  treasureEconomyErrorResponse,
  treasureEconomyJson,
} from "../../../_lib/api";
import { finishTreasureHuntEconomyRun } from "@/lib/uki-economy/game-economy/treasure-hunt";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const identity = await requireTreasureEconomyIdentity();
    const body = await readTreasureEconomyBody(request);
    const { runId } = await context.params;
    const outcome = body?.outcome;
    const authoritySource = body?.authoritySource;
    if (outcome !== "completed" && outcome !== "voluntary_forfeit") {
      throw new TypeError("INVALID_OUTCOME");
    }
    if (authoritySource !== "competition" && authoritySource !== "economy") {
      throw new TypeError("INVALID_AUTHORITY_SOURCE");
    }
    const authorityReference = body?.authorityReference;
    if (authorityReference !== undefined && typeof authorityReference !== "string") {
      throw new TypeError("INVALID_AUTHORITY_REFERENCE");
    }
    const result = await finishTreasureHuntEconomyRun({
      userId: identity.userId,
      walletAddress: identity.walletAddress,
      runId,
      resultId: bodyText(body, "resultId", 8, 128),
      scoreRaw: String(bodyNonNegativeInteger(body, "score")),
      gameTimeMs: bodyNonNegativeInteger(body, "gameTimeMs"),
      outcome,
      authoritySource,
      ...(authorityReference ? { authorityReference } : {}),
    });
    return treasureEconomyJson({ status: "ok", result });
  } catch (error) {
    return treasureEconomyErrorResponse(error);
  }
}
