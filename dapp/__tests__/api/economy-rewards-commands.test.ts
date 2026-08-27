jest.mock("@/lib/indexer-db/mongodb", () => ({
  getEconomyDb: jest.fn(),
}));

jest.mock("@/lib/uki-economy/internal-auth", () => {
  class InternalEconomyAuthError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    InternalEconomyAuthError,
    createMongoInternalEconomyNonceRepository: jest.fn(() => ({})),
    loadInternalEconomyAuthConfig: jest.fn(() => ({})),
    readLimitedInternalEconomyRequestBody: jest.fn(),
    verifyAndConsumeInternalEconomyRequest: jest.fn(),
  };
});

jest.mock("@/lib/uki-economy/rewards", () => ({
  rewardRuleService: { persistRule: jest.fn() },
  rewardCalculationCoordinator: { settleGame: jest.fn() },
  rewardPeriodSealService: { sealPeriod: jest.fn() },
  rewardClaimBatchService: { createDraft: jest.fn() },
}));

import { POST } from "@/app/api/economy/v1/internal/rewards/commands/route";
import { getEconomyDb } from "@/lib/indexer-db/mongodb";
import {
  InternalEconomyAuthError,
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from "@/lib/uki-economy/internal-auth";
import {
  rewardCalculationCoordinator,
  rewardClaimBatchService,
  rewardPeriodSealService,
  rewardRuleService,
} from "@/lib/uki-economy/rewards";

const headers = {
  "x-economy-timestamp": "1783685100000",
  "x-economy-nonce": "rewards-command-nonce-1",
  "x-economy-key-id": "rewards-coordinator",
  "x-economy-signature": `v1=${"a".repeat(64)}`,
};

function request() {
  return new Request("http://localhost/api/economy/v1/internal/rewards/commands", {
    method: "POST",
    headers,
    body: "{}",
  });
}

function draftBody(extra: Record<string, unknown> = {}) {
  return Buffer.from(JSON.stringify({
    command: "create_draft",
    payload: {
      periodId: "2026-W28",
      expectedPeriodAllocationHash: "a".repeat(64),
      chainId: 56,
      distributorAddress: `0x${"9".repeat(40)}`,
      metadata: "ipfs://preview",
      ...extra,
    },
  }));
}

describe("POST /api/economy/v1/internal/rewards/commands", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getEconomyDb as jest.Mock).mockResolvedValue({});
    (verifyAndConsumeInternalEconomyRequest as jest.Mock).mockResolvedValue(undefined);
    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(draftBody());
    (rewardClaimBatchService.createDraft as jest.Mock).mockResolvedValue({
      replayed: false,
      batch: { status: "draft", previewOnly: true, publishAuthorized: false },
    });
  });

  it("autentica el body exacto y solo crea un draft preview-only", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(verifyAndConsumeInternalEconomyRequest).toHaveBeenCalledTimes(1);
    expect(rewardClaimBatchService.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      periodId: "2026-W28",
      expectedPeriodAllocationHash: "a".repeat(64),
      now: expect.any(Date),
    }));
    expect(rewardRuleService.persistRule).not.toHaveBeenCalled();
    expect(rewardCalculationCoordinator.settleGame).not.toHaveBeenCalled();
    expect(rewardPeriodSealService.sealPeriod).not.toHaveBeenCalled();
  });

  it("rechaza campos de publicacion y no invoca servicios", async () => {
    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(
      draftBody({ publishAuthorized: true }),
    );
    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: "error", code: "REWARD_VALIDATION" });
    expect(rewardClaimBatchService.createDraft).not.toHaveBeenCalled();
  });

  it("mapea replay de autenticacion sin procesar el comando", async () => {
    (verifyAndConsumeInternalEconomyRequest as jest.Mock).mockRejectedValueOnce(
      new InternalEconomyAuthError("REPLAYED_REQUEST" as never, "nonce detail"),
    );
    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: "error", code: "REPLAYED_REQUEST" });
    expect(rewardClaimBatchService.createDraft).not.toHaveBeenCalled();
  });
});
