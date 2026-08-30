import { readWalletSession } from "@/lib/wallet-auth";
import {
  acceptCanonicalAmbassadorAttribution,
  getCanonicalAmbassadorAttribution,
} from "@/lib/uki-economy/ambassadors/service";
import { DomainConflictError } from "@/lib/uki-economy/errors";
import {
  GET,
  POST,
} from "@/app/api/economy/v1/ambassadors/attribution/route";

jest.mock("@/lib/wallet-auth", () => ({
  readWalletSession: jest.fn(),
}));
jest.mock("@/lib/uki-economy/ambassadors/service", () => ({
  acceptCanonicalAmbassadorAttribution: jest.fn(),
  getCanonicalAmbassadorAttribution: jest.fn(),
}));

const REFERRED = "0x1111111111111111111111111111111111111111";
const AMBASSADOR = "0x2222222222222222222222222222222222222222";
const NOW = new Date("2026-08-30T12:00:00.000Z");

const mockSession = readWalletSession as jest.MockedFunction<typeof readWalletSession>;
const mockAccept = acceptCanonicalAmbassadorAttribution as jest.MockedFunction<
  typeof acceptCanonicalAmbassadorAttribution
>;
const mockGet = getCanonicalAmbassadorAttribution as jest.MockedFunction<
  typeof getCanonicalAmbassadorAttribution
>;

const attribution = {
  _id: `ambassador-attribution:${REFERRED}`,
  attributionId: `ambassador-attribution:${REFERRED}`,
  referredWalletNormalized: REFERRED,
  ambassadorWalletNormalized: AMBASSADOR,
  source: "signed_wallet_session" as const,
  sourceReferenceHash: "1".repeat(64),
  policyVersion: "ambassador-direct-staging-v1" as const,
  commissionBpsSnapshot: 500 as const,
  levelsSnapshot: 1 as const,
  acceptedAt: NOW,
  evidenceHash: "2".repeat(64),
  createdAt: NOW,
  updatedAt: NOW,
};

function request(body: unknown) {
  return new Request("https://hub.test/api/economy/v1/ambassadors/attribution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("ambassador attribution API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_ENV = "staging";
    process.env.STAGING_ONLY_GUARD = "true";
    process.env.NEXT_PUBLIC_UKI_CHAIN_ID = "97";
    process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = "97";
    mockSession.mockResolvedValue({
      userId: "user-1",
      walletAddress: REFERRED,
      signedWalletAddress: REFERRED,
      walletType: "evm",
      issuedAt: "2026-08-30T11:00:00.000Z",
      expiresAt: "2026-08-31T11:00:00.000Z",
    });
    mockAccept.mockResolvedValue(attribution);
    mockGet.mockResolvedValue(attribution);
  });

  afterEach(() => {
    delete process.env.APP_ENV;
    delete process.env.STAGING_ONLY_GUARD;
    delete process.env.NEXT_PUBLIC_UKI_CHAIN_ID;
    delete process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID;
  });

  it("deriva la wallet referida de la sesion firmada e ignora identidades del body", async () => {
    const response = await POST(request({
      ambassadorWalletAddress: AMBASSADOR,
      referredWalletAddress: "0x9999999999999999999999999999999999999999",
      commissionBps: 9_999,
      levels: 99,
    }));

    expect(response.status).toBe(201);
    expect(mockAccept).toHaveBeenCalledWith(expect.objectContaining({
      referredWallet: REFERRED,
      ambassadorWallet: AMBASSADOR,
      signedSessionEvidenceHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(await response.json()).toMatchObject({
      status: "ok",
      policy: { version: "ambassador-direct-staging-v1", commissionBps: 500, levels: 1 },
      attribution: { referredWalletNormalized: REFERRED, commissionBps: 500, levels: 1 },
    });
  });

  it("exige sesion EVM firmada tanto para consultar como para mutar", async () => {
    mockSession.mockResolvedValue(null);

    const getResponse = await GET();
    const postResponse = await POST(request({ ambassadorWalletAddress: AMBASSADOR }));

    expect(getResponse.status).toBe(401);
    expect(postResponse.status).toBe(401);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("falla antes de autenticacion y persistencia fuera de staging BSC97", async () => {
    process.env.APP_ENV = "production";
    process.env.NEXT_PUBLIC_UKI_CHAIN_ID = "56";
    process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = "56";

    const response = await POST(request({ ambassadorWalletAddress: AMBASSADOR }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "error",
      code: "AMBASSADOR_STAGING_RUNTIME_REQUIRED",
    });
    expect(mockSession).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("expone conflictos inmutables como 409 sin filtrar detalles", async () => {
    mockAccept.mockRejectedValue(new DomainConflictError("sponsor immutable", {
      currentAmbassadorWalletNormalized: AMBASSADOR,
    }));

    const response = await POST(request({ ambassadorWalletAddress: AMBASSADOR }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: "error", code: "CONFLICT" });
  });

  it("no filtra mensajes de errores TypeError inesperados", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockAccept.mockRejectedValue(new TypeError("mongo internal detail"));

    const response = await POST(request({ ambassadorWalletAddress: AMBASSADOR }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ status: "error", code: "INTERNAL_ERROR" });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
