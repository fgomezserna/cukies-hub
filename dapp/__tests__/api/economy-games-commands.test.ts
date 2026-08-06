jest.mock("@/lib/indexer-db/mongodb", () => ({ getEconomyDb: jest.fn() }));

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
    loadGameEconomyAuthConfig: jest.fn(() => ({ keyId: "games-v1" })),
    readLimitedInternalEconomyRequestBody: jest.fn(),
    verifyAndConsumeInternalEconomyRequest: jest.fn(),
  };
});

jest.mock("@/lib/uki-economy/game-economy/coordinator", () => ({
  openGameSession: jest.fn(),
  completeGameSession: jest.fn(),
  rejectGameSession: jest.fn(),
}));

import { POST } from "@/app/api/economy/v1/internal/games/commands/route";
import { getEconomyDb } from "@/lib/indexer-db/mongodb";
import {
  loadGameEconomyAuthConfig,
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from "@/lib/uki-economy/internal-auth";
import {
  completeGameSession,
  openGameSession,
  rejectGameSession,
} from "@/lib/uki-economy/game-economy/coordinator";

const HEADERS = {
  "x-economy-timestamp": "1783685100000",
  "x-economy-nonce": "abcdefghijklmnopqrstuv",
  "x-economy-key-id": "games-v1",
  "x-economy-signature": `v1=${"a".repeat(64)}`,
};

function request() {
  return new Request("http://localhost/api/economy/v1/internal/games/commands", {
    method: "POST",
    headers: HEADERS,
    body: "{}",
  });
}

function openBody() {
  return Buffer.from(JSON.stringify({
    command: "open_session",
    payload: {
      walletAddress: `0x${"1".repeat(40)}`,
      gameId: "arena",
      expectedRuleVersion: "v1",
      idempotencyKey: "run-1",
    },
  }));
}

describe("POST /api/economy/v1/internal/games/commands", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getEconomyDb as jest.Mock).mockResolvedValue({});
    (verifyAndConsumeInternalEconomyRequest as jest.Mock).mockResolvedValue(undefined);
    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(openBody());
    (openGameSession as jest.Mock).mockResolvedValue({ sessionId: "session-1", status: "started" });
  });

  it("uses the game-scoped credential and server time", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(loadGameEconomyAuthConfig).toHaveBeenCalledTimes(1);
    expect(openGameSession).toHaveBeenCalledWith(expect.objectContaining({
      gameId: "arena",
      now: expect.any(Date),
    }));
    expect(completeGameSession).not.toHaveBeenCalled();
    expect(rejectGameSession).not.toHaveBeenCalled();
  });

  it("does not grant rule-admin commands to the game credential", async () => {
    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(
      Buffer.from(JSON.stringify({ command: "persist_rule", payload: {} })),
    );
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: "error", code: "GAME_VALIDATION" });
    expect(openGameSession).not.toHaveBeenCalled();
  });

  it("rejects client-selected Cukie asset IDs", async () => {
    const body = JSON.parse(openBody().toString("utf8"));
    body.payload.cukieAssetIds = ["cukies:1"];
    (readLimitedInternalEconomyRequestBody as jest.Mock).mockResolvedValue(
      Buffer.from(JSON.stringify(body)),
    );
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(openGameSession).not.toHaveBeenCalled();
  });
});
