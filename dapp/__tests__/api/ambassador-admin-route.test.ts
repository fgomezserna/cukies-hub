import { POST } from "@/app/api/economy/v1/internal/ambassadors/sponsor/route";
import { getEconomyDb, withEconomyTransaction } from "@/lib/indexer-db/mongodb";
import { changeCanonicalAmbassadorSponsor, ensureMongoAmbassadorOverrideIndexes } from "@/lib/uki-economy/ambassadors/admin";
import {
  createMongoInternalEconomyNonceRepository,
  loadInternalEconomyAuthConfig,
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from "@/lib/uki-economy/internal-auth";

jest.mock("@/lib/indexer-db/mongodb", () => ({
  getEconomyDb: jest.fn(),
  withEconomyTransaction: jest.fn(),
}));
jest.mock("@/lib/uki-economy/ambassadors/admin", () => ({
  changeCanonicalAmbassadorSponsor: jest.fn(),
  ensureMongoAmbassadorOverrideIndexes: jest.fn(),
}));
jest.mock("@/lib/uki-economy/ambassadors/rules", () => ({
  assertAmbassadorRuntime: jest.fn(),
}));
jest.mock("@/lib/uki-economy/internal-auth", () => ({
  InternalEconomyAuthError: class InternalEconomyAuthError extends Error {
    code: string;
    constructor(code: string, message: string) { super(message); this.code = code; }
  },
  createMongoInternalEconomyNonceRepository: jest.fn(),
  loadInternalEconomyAuthConfig: jest.fn(),
  readLimitedInternalEconomyRequestBody: jest.fn(),
  verifyAndConsumeInternalEconomyRequest: jest.fn(),
}));

const mockedDb = jest.mocked(getEconomyDb);
const mockedTransaction = jest.mocked(withEconomyTransaction);
const mockedChange = jest.mocked(changeCanonicalAmbassadorSponsor);
const mockedIndexes = jest.mocked(ensureMongoAmbassadorOverrideIndexes);
const mockedConfig = jest.mocked(loadInternalEconomyAuthConfig);
const mockedReadBody = jest.mocked(readLimitedInternalEconomyRequestBody);
const mockedVerify = jest.mocked(verifyAndConsumeInternalEconomyRequest);
const mockedNonceRepo = jest.mocked(createMongoInternalEconomyNonceRepository);

const headers = {
  "x-economy-timestamp": String(Date.now()),
  "x-economy-nonce": "a".repeat(32),
  "x-economy-key-id": "ambassador-admin-v1",
  "x-economy-signature": `v1=${"b".repeat(64)}`,
};

describe("internal ambassador sponsor route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedReadBody.mockImplementation(async (request) => Buffer.from(await request.body!.getReader().read().then((value) => value.value ?? new Uint8Array())));
    mockedConfig.mockReturnValue({ keyId: "ambassador-admin-v1", secret: Buffer.from("x".repeat(32)), maxClockSkewMs: 30_000, nonceTtlMs: 600_000 });
    mockedDb.mockResolvedValue({} as never);
    mockedNonceRepo.mockReturnValue({ consume: jest.fn().mockResolvedValue(true) });
    mockedVerify.mockResolvedValue({ keyId: "ambassador-admin-v1", nonceHash: "n", bodyHash: "b", requestHash: "r", requestedAt: new Date(), verifiedAt: new Date() });
    mockedIndexes.mockResolvedValue(undefined);
    mockedChange.mockResolvedValue({ changed: true, overrideId: "override-1", attribution: {} as never });
    mockedTransaction.mockImplementation(async (work) => work({} as never, {} as never));
  });

  it("devuelve 401 por headers ausentes sin abrir Mongo", async () => {
    const response = await POST(new Request("http://localhost/api/economy/v1/internal/ambassadors/sponsor", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
    expect(mockedDb).not.toHaveBeenCalled();
  });

  it("rechaza actor/keyId/now/effectiveAt del body antes de abrir Mongo", async () => {
    const body = JSON.stringify({
      referredWallet: "0x1111111111111111111111111111111111111111",
      sponsorWallet: "0x2222222222222222222222222222222222222222",
      expectedCurrentSponsor: null,
      reason: "Corrección con evidencia",
      idempotencyKey: "ambassador-test-0002",
      actor: "spoofed",
    });
    const response = await POST(new Request("http://localhost/api/economy/v1/internal/ambassadors/sponsor", { method: "POST", headers: { ...headers, "content-length": String(Buffer.byteLength(body)) }, body }));
    expect(response.status).toBe(400);
    expect(mockedDb).not.toHaveBeenCalled();
    expect(mockedVerify).not.toHaveBeenCalled();
    expect(mockedChange).not.toHaveBeenCalled();
  });
});
