import { buildAmbassadorAttribution } from "@/lib/uki-economy/ambassadors/rules";
import {
  changeCanonicalAmbassadorSponsor,
  resolveMongoAmbassadorOverride,
} from "@/lib/uki-economy/ambassadors/admin";
import { createMongoAmbassadorAttributionRepository, resolveMongoAmbassadorAttribution } from "@/lib/uki-economy/ambassadors/repository";
import { assertAttributionDoesNotCreateCycle } from "@/lib/uki-economy/ambassadors/service";

jest.mock("@/lib/uki-economy/ambassadors/repository", () => ({
  createMongoAmbassadorAttributionRepository: jest.fn(),
  resolveMongoAmbassadorAttribution: jest.fn(),
}));
jest.mock("@/lib/uki-economy/ambassadors/service", () => ({
  assertAttributionDoesNotCreateCycle: jest.fn(),
}));

const mockedRepository = jest.mocked(createMongoAmbassadorAttributionRepository);
const mockedResolveBase = jest.mocked(resolveMongoAmbassadorAttribution);
const mockedAssertCycle = jest.mocked(assertAttributionDoesNotCreateCycle);

const REFERRED = "0x1111111111111111111111111111111111111111";
const SPONSOR = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";
const ROOT = "0x9999999999999999999999999999999999999999";

function fakeDb() {
  const rows: any[] = [];
  const collection = {
    createIndex: jest.fn().mockResolvedValue("ok"),
    findOne: jest.fn(async (filter: any) => {
      if (filter.idempotencyKey) return rows.find((row) => row.idempotencyKey === filter.idempotencyKey) ?? null;
      const candidates = rows.filter((row) => row.referredWalletNormalized === filter.referredWalletNormalized && row.effectiveAt <= filter.effectiveAt.$lte);
      return candidates.sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime())[0] ?? null;
    }),
    insertOne: jest.fn(async (row: any) => {
      if (rows.some((candidate) => candidate.idempotencyKey === row.idempotencyKey)) {
        const error = Object.assign(new Error("duplicate"), { code: 11000 });
        throw error;
      }
      rows.push(row);
    }),
  };
  return { db: { collection: jest.fn().mockReturnValue(collection) } as any, collection, rows };
}

function input(overrides: Partial<Parameters<typeof changeCanonicalAmbassadorSponsor>[1]> = {}) {
  return {
    referredWallet: REFERRED,
    sponsorWallet: SPONSOR,
    expectedCurrentSponsor: null,
    reason: "Corrección solicitada por soporte con evidencia de identidad.",
    idempotencyKey: "ambassador-test-0001",
    actor: "ambassador-admin",
    keyId: "ambassador-admin-v1",
    now: new Date("2026-09-09T12:00:00.000Z"),
    ...overrides,
  };
}

describe("ambassador admin sponsor overrides", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AMBASSADOR_DEFAULT_WALLET_ADDRESS = ROOT;
    mockedRepository.mockReturnValue({
      acquireGraphWriteFence: jest.fn().mockResolvedValue(undefined),
      findAttribution: jest.fn().mockResolvedValue(null),
      findLockedPresaleAmbassador: jest.fn().mockResolvedValue(null),
      hasPresaleParticipation: jest.fn().mockResolvedValue(false),
      insertAttribution: jest.fn(),
    });
    mockedResolveBase.mockResolvedValue(null);
    mockedAssertCycle.mockResolvedValue(undefined);
  });

  afterEach(() => { delete process.env.AMBASSADOR_DEFAULT_WALLET_ADDRESS; });

  it("mantiene la atribución base, fija fence, comprueba ciclo y es idempotente", async () => {
    const { db, collection, rows } = fakeDb();
    const first = await changeCanonicalAmbassadorSponsor(db, input());
    const replay = await changeCanonicalAmbassadorSponsor(db, input({ actor: "rotated-actor", keyId: "ambassador-admin-v2" }));

    expect(first.changed).toBe(true);
    expect(replay.changed).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("admin_override");
    expect(collection.insertOne).toHaveBeenCalledTimes(1);
    expect(mockedRepository.mock.results[0].value.acquireGraphWriteFence).toHaveBeenCalled();
    expect(mockedAssertCycle).toHaveBeenCalledWith(expect.anything(), REFERRED, SPONSOR, input().now);
    expect(mockedResolveBase).toHaveBeenCalled();
  });

  it("rechaza overrides manipulados antes de devolverlos", async () => {
    const { db, rows } = fakeDb();
    await changeCanonicalAmbassadorSponsor(db, input());
    rows[0].evidenceHash = "f".repeat(64);
    await expect(resolveMongoAmbassadorOverride(db, REFERRED, new Date("2026-09-10T12:00:00.000Z"))).rejects.toMatchObject({ details: undefined });
    rows[0].evidenceHash = "not-a-hash";
    rows[0].createdAt = new Date("invalid");
    await expect(resolveMongoAmbassadorOverride(db, REFERRED, new Date("2026-09-10T12:00:00.000Z"))).rejects.toMatchObject({ details: undefined });
  });

  it("rechaza self-cycle, la raíz institucional y el sponsor esperado obsoleto", async () => {
    const { db } = fakeDb();
    await expect(changeCanonicalAmbassadorSponsor(db, input({ sponsorWallet: REFERRED }))).rejects.toMatchObject({ details: { reason: "AMBASSADOR_CYCLE" } });
    await expect(changeCanonicalAmbassadorSponsor(db, input({ referredWallet: ROOT }))).rejects.toMatchObject({ details: { reason: "AMBASSADOR_ROOT_PROTECTED" } });
    mockedResolveBase.mockResolvedValue(buildAmbassadorAttribution({
      referredWallet: REFERRED,
      ambassadorWallet: OTHER,
      source: "signed_wallet_session",
      sourceReferenceHash: "a".repeat(64),
      acceptedAt: new Date("2026-09-08T12:00:00.000Z"),
      now: new Date("2026-09-08T12:00:00.000Z"),
    }));
    await expect(changeCanonicalAmbassadorSponsor(db, input())).rejects.toMatchObject({ details: { reason: "AMBASSADOR_EXPECTED_SPONSOR_CONFLICT" } });
  });

  it("rechaza reutilizar idempotencyKey con otro payload y conserva historial", async () => {
    const { db, rows } = fakeDb();
    const base = buildAmbassadorAttribution({
      referredWallet: REFERRED,
      ambassadorWallet: OTHER,
      source: "signed_wallet_session",
      sourceReferenceHash: "b".repeat(64),
      acceptedAt: new Date("2026-09-08T12:00:00.000Z"),
      now: new Date("2026-09-08T12:00:00.000Z"),
    });
    mockedResolveBase.mockResolvedValue(base);
    await changeCanonicalAmbassadorSponsor(db, input({ expectedCurrentSponsor: OTHER }));
    await expect(changeCanonicalAmbassadorSponsor(db, input({ expectedCurrentSponsor: OTHER, reason: "otro motivo" }))).rejects.toMatchObject({ details: { reason: "IDEMPOTENCY_KEY_CONFLICT" } });
    expect(base.ambassadorWalletNormalized).toBe(OTHER);
    expect(rows).toHaveLength(1);
  });

  it("resuelve solo el override vigente hasta effectiveAt", async () => {
    const { db, rows } = fakeDb();
    await changeCanonicalAmbassadorSponsor(db, input());
    const before = await resolveMongoAmbassadorOverride(db, REFERRED, new Date("2026-09-08T12:00:00.000Z"));
    const after = await resolveMongoAmbassadorOverride(db, REFERRED, new Date("2026-09-10T12:00:00.000Z"));
    expect(before).toBeNull();
    expect(after?.source).toBe("admin_override");
    expect(rows[0].effectiveAt.toISOString()).toBe("2026-09-09T12:00:00.000Z");
  });
});
