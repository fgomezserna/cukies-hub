jest.mock("@/lib/indexer-db/mongodb", () => ({ getEconomyDb: jest.fn() }));

jest.mock("@/lib/uki-economy/internal-auth", () => {
  class InternalEconomyAuthError extends Error {
    code: string;
    constructor(code: string, message: string) { super(message); this.code = code; }
  }
  return {
    InternalEconomyAuthError,
    createMongoInternalEconomyNonceRepository: jest.fn(() => ({})),
    loadInternalEconomyAuthConfig: jest.fn(() => ({ keyId: "ranking-admin" })),
    readLimitedInternalEconomyRequestBody: jest.fn(),
    verifyAndConsumeInternalEconomyRequest: jest.fn(),
  };
});

jest.mock("@/lib/uki-economy/ranking/service", () => ({
  weeklyRankingService: { persistCurrentRule: jest.fn() },
}));

jest.mock("@/lib/uki-economy/ranking/runtime", () => {
  class WeeklyRankingRuntimeBusyError extends Error {}
  class WeeklyRankingRuntimeConfigurationError extends Error {}
  return {
    WeeklyRankingRuntimeBusyError,
    WeeklyRankingRuntimeConfigurationError,
    runWeeklyRankingRuntimeTick: jest.fn(),
  };
});

import { POST as adminPost } from "@/app/api/economy/v1/internal/ranking/admin/rules/route";
import { POST as tickPost } from "@/app/api/economy/v1/internal/ranking/tick/route";
import { getEconomyDb } from "@/lib/indexer-db/mongodb";
import {
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from "@/lib/uki-economy/internal-auth";
import { weeklyRankingService } from "@/lib/uki-economy/ranking/service";
import { runWeeklyRankingRuntimeTick } from "@/lib/uki-economy/ranking/runtime";

const HEADERS = {
  "x-economy-timestamp": "1783685100000",
  "x-economy-nonce": "abcdefghijklmnopqrstuv",
  "x-economy-key-id": "ranking-admin",
  "x-economy-signature": `v1=${"a".repeat(64)}`,
};

function request(path: string) {
  return new Request(`http://localhost${path}`, { method: "POST", headers: HEADERS, body: "{}" });
}

describe("weekly ranking HMAC endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getEconomyDb as jest.Mock).mockResolvedValue({});
    (verifyAndConsumeInternalEconomyRequest as jest.Mock).mockResolvedValue(undefined);
  });

  it("persists only the exact approved rule shape with server write time", async () => {
    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(Buffer.from(JSON.stringify({
      version: "ranking-v1",
      activeFrom: "2026-07-06T00:00:00.000Z",
      activeUntil: null,
    })));
    (weeklyRankingService.persistCurrentRule as jest.Mock).mockResolvedValue({ rule: { version: "ranking-v1" }, replayed: false });
    const response = await adminPost(request("/api/economy/v1/internal/ranking/admin/rules"));
    expect(response.status).toBe(200);
    expect(weeklyRankingService.persistCurrentRule).toHaveBeenCalledWith({
      version: "ranking-v1",
      activeFrom: new Date("2026-07-06T00:00:00.000Z"),
      activeUntil: undefined,
      now: expect.any(Date),
    });
    expect(verifyAndConsumeInternalEconomyRequest).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({ path: "/api/economy/v1/internal/ranking/admin/rules" }),
    }));
  });

  it("tick rejects caller period/time and derives both server-side", async () => {
    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(Buffer.from(JSON.stringify({
      workerId: "scheduler:ranking",
      periodId: "2026-W01",
      now: "2026-01-01T00:00:00.000Z",
    })));
    const rejected = await tickPost(request("/api/economy/v1/internal/ranking/tick"));
    expect(rejected.status).toBe(400);
    expect(runWeeklyRankingRuntimeTick).not.toHaveBeenCalled();

    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(Buffer.from(JSON.stringify({
      workerId: "scheduler:ranking",
    })));
    (runWeeklyRankingRuntimeTick as jest.Mock).mockResolvedValue({ periodId: "2026-W28", replayed: false });
    const accepted = await tickPost(request("/api/economy/v1/internal/ranking/tick"));
    expect(accepted.status).toBe(200);
    expect(runWeeklyRankingRuntimeTick).toHaveBeenCalledWith({ workerId: "scheduler:ranking" });
  });
});
