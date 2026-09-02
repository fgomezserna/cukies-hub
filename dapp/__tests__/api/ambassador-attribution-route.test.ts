import { readWalletSession } from "@/lib/wallet-auth";
import {
  acceptCanonicalAmbassadorInvitation,
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
  acceptCanonicalAmbassadorInvitation: jest.fn(),
  getCanonicalAmbassadorAttribution: jest.fn(),
}));

const REFERRED = "0x1111111111111111111111111111111111111111";
const AMBASSADOR = "0x2222222222222222222222222222222222222222";
const INVITATION_CODE = "cw-123456789abc";
const NOW = new Date("2026-08-30T12:00:00.000Z");

const mockSession = readWalletSession as jest.MockedFunction<typeof readWalletSession>;
const mockAccept = acceptCanonicalAmbassadorInvitation as jest.MockedFunction<
  typeof acceptCanonicalAmbassadorInvitation
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
  policyVersion: "ambassador-direct-v1" as const,
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
    process.env.AMBASSADOR_ATTRIBUTION_WRITES_ENABLED = "true";
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
    delete process.env.AMBASSADOR_ATTRIBUTION_WRITES_ENABLED;
  });

  it("deriva la wallet referida de la sesion firmada y resuelve un codigo opaco", async () => {
    const response = await POST(request({
      invitationCode: INVITATION_CODE,
      referredWalletAddress: "0x9999999999999999999999999999999999999999",
      commissionBps: 9_999,
      levels: 99,
    }));

    expect(response.status).toBe(201);
    expect(mockAccept).toHaveBeenCalledWith(expect.objectContaining({
      referredWallet: REFERRED,
      invitationCode: INVITATION_CODE,
      signedSessionEvidenceHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(await response.json()).toMatchObject({
      status: "ok",
      policy: { version: "ambassador-direct-v1", commissionBps: 500, levels: 1 },
      attribution: { referredWalletNormalized: REFERRED, commissionBps: 500, levels: 1 },
    });
  });

  it("exige sesion EVM firmada tanto para consultar como para mutar", async () => {
    mockSession.mockResolvedValue(null);

    const getResponse = await GET();
    const postResponse = await POST(request({ invitationCode: INVITATION_CODE }));

    expect(getResponse.status).toBe(401);
    expect(postResponse.status).toBe(401);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("usa el mismo flujo en produccion cambiando solo las variables de entorno", async () => {
    process.env.APP_ENV = "production";
    process.env.STAGING_ONLY_GUARD = "false";
    process.env.NEXT_PUBLIC_UKI_CHAIN_ID = "56";
    process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = "56";

    const response = await POST(request({ invitationCode: INVITATION_CODE }));

    expect(response.status).toBe(201);
    expect(mockAccept).toHaveBeenCalledTimes(1);
  });

  it("falla cerrado cuando el entorno y la red no coinciden", async () => {
    process.env.APP_ENV = "production";
    process.env.STAGING_ONLY_GUARD = "false";
    process.env.NEXT_PUBLIC_UKI_CHAIN_ID = "97";
    process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = "97";

    const response = await POST(request({ invitationCode: INVITATION_CODE }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "error",
      code: "AMBASSADOR_RUNTIME_MISCONFIGURED",
    });
    expect(mockSession).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("no acepta nuevas relaciones mientras el interruptor de escritura está cerrado", async () => {
    process.env.AMBASSADOR_ATTRIBUTION_WRITES_ENABLED = "false";

    const response = await POST(request({ invitationCode: INVITATION_CODE }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "error",
      code: "AMBASSADOR_ATTRIBUTION_WRITES_DISABLED",
    });
    expect(mockSession).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("expone conflictos inmutables como 409 sin filtrar detalles", async () => {
    mockAccept.mockRejectedValue(new DomainConflictError("sponsor immutable", {
      currentAmbassadorWalletNormalized: AMBASSADOR,
    }));

    const response = await POST(request({ invitationCode: INVITATION_CODE }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: "error", code: "CONFLICT" });
  });

  it("no filtra mensajes de errores TypeError inesperados", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockAccept.mockRejectedValue(new TypeError("mongo internal detail"));

    const response = await POST(request({ invitationCode: INVITATION_CODE }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ status: "error", code: "INTERNAL_ERROR" });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
