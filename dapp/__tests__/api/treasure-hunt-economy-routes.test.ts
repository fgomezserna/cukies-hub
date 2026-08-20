import { requireCompetitionIdentity } from "@/lib/treasure-hunt-competition/server/api";
import {
  appendTreasureHuntEconomyCheckpoint,
  finishTreasureHuntEconomyRun,
  openTreasureHuntEconomyRun,
} from "@/lib/uki-economy/game-economy/treasure-hunt";
import { POST as openRun } from "@/app/api/games/treasure-hunt/economy/sessions/route";
import { POST as checkpointRun } from "@/app/api/games/treasure-hunt/economy/sessions/[runId]/checkpoints/route";
import { POST as finishRun } from "@/app/api/games/treasure-hunt/economy/sessions/[runId]/result/route";

jest.mock("@/lib/treasure-hunt-competition/server/api", () => ({
  requireCompetitionIdentity: jest.fn(),
}));
jest.mock("@/lib/uki-economy/game-economy/treasure-hunt", () => ({
  appendTreasureHuntEconomyCheckpoint: jest.fn(),
  finishTreasureHuntEconomyRun: jest.fn(),
  openTreasureHuntEconomyRun: jest.fn(),
}));

const mockIdentity = requireCompetitionIdentity as jest.MockedFunction<
  typeof requireCompetitionIdentity
>;
const mockOpen = openTreasureHuntEconomyRun as jest.MockedFunction<
  typeof openTreasureHuntEconomyRun
>;
const mockCheckpoint = appendTreasureHuntEconomyCheckpoint as jest.MockedFunction<
  typeof appendTreasureHuntEconomyCheckpoint
>;
const mockFinish = finishTreasureHuntEconomyRun as jest.MockedFunction<
  typeof finishTreasureHuntEconomyRun
>;

const walletAddress = "0x1111111111111111111111111111111111111111";

function request(body: unknown) {
  return new Request("https://hub.test/api/games/treasure-hunt/economy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Treasure Hunt economy API boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_ENV = "staging";
    process.env.STAGING_ONLY_GUARD = "true";
    process.env.NEXT_PUBLIC_UKI_CHAIN_ID = "97";
    process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = "97";
    mockIdentity.mockResolvedValue({ userId: "user-1", walletAddress } as never);
    mockOpen.mockResolvedValue({
      runId: "run-1",
      gameEconomySessionId: "economy-session-1",
      creditSource: "pool",
      cukieSource: "own",
      cukieAssetId: "cukie-1",
      dailyPeriodId: "th-day:2026-08-17T14:00:00.000Z",
      dailyPeriodEndsAt: "2026-08-18T14:00:00.000Z",
    });
    mockCheckpoint.mockResolvedValue({ sequence: 1, evidenceHash: "e".repeat(64) });
    mockFinish.mockResolvedValue({
      runId: "run-1",
      status: "forfeited",
      scoreRaw: "0",
      leaderboardEligible: false,
      rewardEligible: false,
      jackpotEligible: false,
    });
  });

  afterEach(() => {
    delete process.env.APP_ENV;
    delete process.env.STAGING_ONLY_GUARD;
    delete process.env.NEXT_PUBLIC_UKI_CHAIN_ID;
    delete process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID;
  });

  it("fails closed before identity or persistence outside staging BSC Testnet", async () => {
    process.env.APP_ENV = "production";
    process.env.NEXT_PUBLIC_UKI_CHAIN_ID = "56";
    process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = "56";

    const response = await openRun(request({
      gameSessionId: "game-session-1",
      requestId: "request-12345678",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "error",
      code: "TREASURE_HUNT_STAGING_RUNTIME_REQUIRED",
    });
    expect(mockIdentity).not.toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("derives run ownership from signed identity and ignores caller resource choices", async () => {
    const response = await openRun(request({
      gameSessionId: "game-session-1",
      requestId: "request-12345678",
      walletAddress: "0x9999999999999999999999999999999999999999",
      resourceActions: { credit: "release", cukie: "release" },
    }));

    expect(response.status).toBe(201);
    expect(mockOpen).toHaveBeenCalledWith({
      userId: "user-1",
      walletAddress,
      authorityGameSessionId: "game-session-1",
      requestId: "request-12345678",
    });
  });

  it("binds checkpoints and voluntary forfeits to the route run and signed wallet", async () => {
    const checkpointResponse = await checkpointRun(
      request({ checkpointId: "checkpoint-1", score: 100, gameTimeMs: 5_000 }),
      { params: Promise.resolve({ runId: "run-route" }) },
    );
    const finishResponse = await finishRun(
      request({
        resultId: "result-12345678",
        score: 999,
        gameTimeMs: 6_000,
        outcome: "voluntary_forfeit",
        authoritySource: "economy",
        resourceActions: { credit: "release", cukie: "release" },
      }),
      { params: Promise.resolve({ runId: "run-route" }) },
    );

    expect(checkpointResponse.status).toBe(200);
    expect(mockCheckpoint).toHaveBeenCalledWith({
      userId: "user-1",
      walletAddress,
      runId: "run-route",
      checkpointId: "checkpoint-1",
      scoreRaw: "100",
      gameTimeMs: 5_000,
    });
    expect(finishResponse.status).toBe(200);
    expect(mockFinish).toHaveBeenCalledWith({
      userId: "user-1",
      walletAddress,
      runId: "run-route",
      resultId: "result-12345678",
      scoreRaw: "999",
      gameTimeMs: 6_000,
      outcome: "voluntary_forfeit",
      authoritySource: "economy",
    });
    expect(JSON.stringify(mockFinish.mock.calls[0][0])).not.toContain("resourceActions");
  });

  it("rejects malformed outcomes before invoking the terminal service", async () => {
    const response = await finishRun(
      request({
        resultId: "result-12345678",
        score: 0,
        gameTimeMs: 1_000,
        outcome: "system_failure",
        authoritySource: "economy",
      }),
      { params: Promise.resolve({ runId: "run-route" }) },
    );

    expect(response.status).toBe(400);
    expect(mockFinish).not.toHaveBeenCalled();
  });

});
