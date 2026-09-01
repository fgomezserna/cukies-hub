import {
  competitionErrorResponse,
  competitionJson,
  competitionRateLimitResponse,
  readCompetitionIdentity,
} from "@/lib/treasure-hunt-competition/server/api";
import { getTreasureHuntWeeklyOverview } from "@/lib/uki-economy/game-economy/treasure-hunt-weekly-public";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const rateLimit = competitionRateLimitResponse({ request, operation: "leaderboard" });
    if (rateLimit) return rateLimit;
    const identity = await readCompetitionIdentity();
    const searchParams = new URL(request.url).searchParams;
    const overview = await getTreasureHuntWeeklyOverview({
      currentWalletAddress: identity?.walletAddress,
      page: Number(searchParams.get("page") ?? 1),
      pageSize: Number(searchParams.get("pageSize") ?? 20),
      mineOnly: searchParams.get("mine") === "1",
    });
    return competitionJson({ success: true, ...overview });
  } catch (error) {
    return competitionErrorResponse(error);
  }
}
