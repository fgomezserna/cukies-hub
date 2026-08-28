import {
  bodyText,
  readTreasureEconomyBody,
  requireTreasureEconomyIdentity,
  treasureEconomyErrorResponse,
  treasureEconomyJson,
} from "../_lib/api";
import { openTreasureHuntEconomyRun } from "@/lib/uki-economy/game-economy/treasure-hunt";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const identity = await requireTreasureEconomyIdentity();
    const body = await readTreasureEconomyBody(request);
    const result = await openTreasureHuntEconomyRun({
      userId: identity.userId,
      walletAddress: identity.walletAddress,
      authorityGameSessionId: bodyText(body, "gameSessionId", 8, 128),
      requestId: bodyText(body, "requestId", 8, 128),
    });
    return treasureEconomyJson({ status: "ok", result }, 201);
  } catch (error) {
    return treasureEconomyErrorResponse(error);
  }
}
