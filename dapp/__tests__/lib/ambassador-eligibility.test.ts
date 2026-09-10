import type { ClientSession, Db } from "mongodb";

import { getEconomyDb, withEconomyTransaction } from "@/lib/indexer-db/mongodb";
import { getAmbassadorDashboard, getPublicAmbassadorInvitation } from "@/lib/uki-economy/ambassadors/public";
import {
  createMongoAmbassadorAttributionRepository,
  findMongoAmbassadorByInvitationCode,
  getMongoAmbassadorEnrollment,
  getOrCreateMongoAmbassadorProfile,
} from "@/lib/uki-economy/ambassadors/repository";
import { ambassadorInvitationCode, buildAmbassadorAttribution, stableAmbassadorHash } from "@/lib/uki-economy/ambassadors/rules";
import {
  acceptCanonicalAmbassadorInvitation,
  acceptCanonicalCukiesWorldEnrollment,
  acceptDirectAmbassadorAttribution,
  getCanonicalAmbassadorEnrollment,
  getCanonicalAmbassadorInvitationWallet,
} from "@/lib/uki-economy/ambassadors/service";
import type { AmbassadorAttribution, AmbassadorProfile } from "@/lib/uki-economy/ambassadors/types";

jest.mock("@/lib/indexer-db/mongodb", () => ({
  getEconomyDb: jest.fn(),
  withEconomyTransaction: jest.fn(),
}));
const mockGetAmbassadorEligibility = jest.fn();
jest.mock("@/lib/uki-economy/ambassadors/eligibility", () => ({
  getAmbassadorEligibility: (...args: unknown[]) => mockGetAmbassadorEligibility(...args),
}));

const NEW_WALLET = "0x1111111111111111111111111111111111111111";
const AMBASSADOR = "0x2222222222222222222222222222222222222222";
const ROOT = "0x3333333333333333333333333333333333333333";
const NOW = new Date("2026-09-07T12:00:00.000Z");
const EVIDENCE = stableAmbassadorHash({ signature: "explicit-enrollment" });
const session = {} as ClientSession;

type Row = Record<string, unknown>;

function fixture(input: {
  profiles?: AmbassadorProfile[];
  presale?: Row[];
  attributions?: AmbassadorAttribution[];
} = {}) {
  const data: Record<string, Row[]> = {
    ambassador_profiles: [...(input.profiles ?? [])],
    presale_participants: [...(input.presale ?? [])],
    ambassador_attributions: [...(input.attributions ?? [])],
  };
  const matches = (row: Row, filter: Row) => Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object") {
      const operator = value as Row;
      if ("$in" in operator && !(operator.$in as unknown[]).includes(row[key])) return false;
      if ("$lte" in operator && (!(row[key] instanceof Date)
        || (row[key] as Date) > (operator.$lte as Date))) return false;
      if ("$type" in operator && typeof row[key] !== operator.$type) return false;
      if ("$regex" in operator && (typeof row[key] !== "string"
        || !new RegExp(operator.$regex as string, operator.$options as string).test(row[key] as string))) return false;
      return true;
    }
    return row[key] === value;
  });
  const collections = new Map<string, ReturnType<typeof makeCollection>>();
  function makeCollection(name: string) {
    const rows = data[name] ??= [];
    return {
      findOne: jest.fn(async (filter: Row) => rows.find((row) => matches(row, filter)) ?? null),
      find: (filter: Row) => {
        const query = {
          sort: () => query,
          limit: () => query,
          toArray: async () => rows.filter((row) => matches(row, filter)),
        };
        return query;
      },
      updateOne: jest.fn(async (filter: Row, update: { $setOnInsert?: Row }) => {
        if (!rows.some((row) => matches(row, filter))) rows.push({ ...filter, ...update.$setOnInsert });
        return { acknowledged: true };
      }),
      insertOne: jest.fn(async (row: Row) => {
        rows.push(row);
        return { acknowledged: true };
      }),
      bulkWrite: jest.fn(async () => ({ upsertedCount: 0 })),
    };
  }
  const collection = (name: string) => {
    if (!collections.has(name)) collections.set(name, makeCollection(name));
    return collections.get(name)!;
  };
  const db = { collection } as unknown as Db;
  jest.mocked(getEconomyDb).mockResolvedValue(db);
  jest.mocked(withEconomyTransaction).mockImplementation(async (fn) => fn(db, session));
  return { db, data, collection };
}

function legacyProfile(wallet = NEW_WALLET): AmbassadorProfile {
  return {
    _id: `ambassador-profile:${wallet}`,
    walletNormalized: wallet,
    invitationCode: ambassadorInvitationCode(wallet),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function confirmedAttribution(wallet = NEW_WALLET) {
  return buildAmbassadorAttribution({
    referredWallet: wallet,
    ambassadorWallet: AMBASSADOR,
    source: "signed_wallet_session",
    sourceReferenceHash: EVIDENCE,
    acceptedAt: NOW,
    now: NOW,
  });
}

describe("ambassador enrollment eligibility", () => {
  const originalDefaultWallet = process.env.AMBASSADOR_DEFAULT_WALLET_ADDRESS;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AMBASSADOR_DEFAULT_WALLET_ADDRESS;
    mockGetAmbassadorEligibility.mockResolvedValue({
      isCukieMaster: true,
      reason: null,
      sourceHash: EVIDENCE,
      observedAt: NOW,
    });
  });

  afterAll(() => {
    if (originalDefaultWallet === undefined) delete process.env.AMBASSADOR_DEFAULT_WALLET_ADDRESS;
    else process.env.AMBASSADOR_DEFAULT_WALLET_ADDRESS = originalDefaultWallet;
  });

  it("navegar o leer el dashboard de una wallet nueva no emite invitacion", async () => {
    const { db, collection } = fixture();

    await expect(getOrCreateMongoAmbassadorProfile(db, NEW_WALLET, NOW)).resolves.toBeNull();
    await expect(getAmbassadorDashboard(NEW_WALLET, NOW)).resolves.toMatchObject({
      profile: null,
      ownAttribution: null,
      defaultAmbassador: null,
      enrollment: { isPresaleParticipant: false, canChooseSponsor: true, canInvite: false },
    });
    expect(collection("ambassador_profiles").updateOne).not.toHaveBeenCalled();
    expect(collection("ambassador_attributions").insertOne).not.toHaveBeenCalled();
  });

  it("deshabilita un enlace antiguo sin borrar el perfil ni su historial", async () => {
    const profile = legacyProfile();
    const { db, data } = fixture({ profiles: [profile] });

    await expect(getOrCreateMongoAmbassadorProfile(db, NEW_WALLET, NOW)).resolves.toBeNull();
    await expect(findMongoAmbassadorByInvitationCode(db, profile.invitationCode)).resolves.toBeNull();
    await expect(getPublicAmbassadorInvitation(profile.invitationCode)).resolves.toBeNull();
    await expect(getCanonicalAmbassadorInvitationWallet(profile.invitationCode)).resolves.toBeNull();
    expect(data.ambassador_profiles).toEqual([profile]);
  });

  it("trata la perdida confirmada de Cukie Master como enlace no elegible", async () => {
    const profile = legacyProfile();
    const { db, data } = fixture({ profiles: [profile], attributions: [confirmedAttribution()] });
    mockGetAmbassadorEligibility.mockResolvedValue({
      isCukieMaster: false,
      reason: "CUKIE_MASTER_REQUIREMENT_NOT_MET",
      sourceHash: EVIDENCE,
      observedAt: NOW,
    });

    await expect(findMongoAmbassadorByInvitationCode(db, profile.invitationCode)).resolves.toBeNull();
    await expect(getPublicAmbassadorInvitation(profile.invitationCode)).resolves.toBeNull();
    expect(data.ambassador_profiles).toEqual([profile]);
  });

  it("mantiene un enlace pendiente cuando la elegibilidad es desconocida", async () => {
    const profile = legacyProfile();
    const { db } = fixture({ profiles: [profile], attributions: [confirmedAttribution()] });
    mockGetAmbassadorEligibility.mockResolvedValue({
      isCukieMaster: null,
      reason: "CUKIE_MASTER_SOURCE_UNKNOWN",
      sourceHash: null,
      observedAt: NOW,
    });

    await expect(findMongoAmbassadorByInvitationCode(db, profile.invitationCode))
      .rejects.toThrow("AMBASSADOR_ELIGIBILITY_UNAVAILABLE");
  });

  it("rechaza el enlace antiguo tambien durante la aceptacion transaccional", async () => {
    const profile = legacyProfile(AMBASSADOR);
    const { collection, data } = fixture({ profiles: [profile] });

    await expect(acceptCanonicalAmbassadorInvitation({
      referredWallet: NEW_WALLET,
      invitationCode: profile.invitationCode,
      signedSessionEvidenceHash: EVIDENCE,
      now: NOW,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(collection("ambassador_profiles").findOne).toHaveBeenCalledWith(
      { invitationCode: profile.invitationCode },
      { session },
    );
    expect(collection("presale_participants").findOne).toHaveBeenCalledWith(
      { normalizedWalletAddress: AMBASSADOR },
      expect.objectContaining({ session }),
    );
    expect(data.ambassador_attributions).toHaveLength(0);
  });

  it("recupera el codigo estable tras confirmar un patrocinador", async () => {
    const profile = legacyProfile();
    const { db } = fixture({ profiles: [profile], attributions: [confirmedAttribution()] });

    await expect(getOrCreateMongoAmbassadorProfile(db, NEW_WALLET, NOW)).resolves.toEqual(profile);
    await expect(findMongoAmbassadorByInvitationCode(db, profile.invitationCode)).resolves.toEqual(profile);
    await expect(getCanonicalAmbassadorInvitationWallet(profile.invitationCode)).resolves.toBe(NEW_WALLET);
    await expect(getCanonicalAmbassadorEnrollment(NEW_WALLET)).resolves.toEqual({
      isPresaleParticipant: false,
      canChooseSponsor: false,
      canInvite: true,
      isCukieMaster: true,
      hasConfirmedSponsor: true,
      eligibilityReason: null,
    });
  });

  it("mantiene el link de preventa sin sponsor y bloquea una eleccion posterior", async () => {
    const { db } = fixture({
      presale: [{ normalizedWalletAddress: NEW_WALLET, firstPurchaseAt: NOW }],
    });

    await expect(getOrCreateMongoAmbassadorProfile(db, NEW_WALLET, NOW)).resolves.toBeNull();
    await expect(getMongoAmbassadorEnrollment(db, NEW_WALLET)).resolves.toEqual({
      isPresaleParticipant: true,
      canChooseSponsor: false,
      canInvite: false,
      isCukieMaster: true,
      hasConfirmedSponsor: false,
      eligibilityReason: null,
    });
    await expect(acceptDirectAmbassadorAttribution(
      createMongoAmbassadorAttributionRepository(db, session),
      { referredWallet: NEW_WALLET, ambassadorWallet: AMBASSADOR, signedSessionEvidenceHash: EVIDENCE, now: NOW },
    )).rejects.toMatchObject({ details: { reason: "PRESALE_SPONSOR_LOCKED" } });
  });

  it.each([undefined, null, new Date("invalid"), "2026-01-01"])(
    "no considera compra una fila con firstPurchaseAt=%s sin evidencia bloqueada",
    async (firstPurchaseAt) => {
      const { db } = fixture({ presale: [{ normalizedWalletAddress: NEW_WALLET, firstPurchaseAt }] });
      await expect(getMongoAmbassadorEnrollment(db, NEW_WALLET)).resolves.toEqual({
        isPresaleParticipant: false,
        canChooseSponsor: true,
        canInvite: false,
        isCukieMaster: true,
        hasConfirmedSponsor: false,
        eligibilityReason: null,
      });
    },
  );

  it("reconoce preventa mediante sponsor bloqueado y fecha canonica", async () => {
    const { db } = fixture({ presale: [{
      normalizedWalletAddress: NEW_WALLET,
      lockedSponsorWalletAddress: AMBASSADOR,
      sponsorLockedAt: NOW,
    }] });
    await expect(getMongoAmbassadorEnrollment(db, NEW_WALLET)).resolves.toEqual({
      isPresaleParticipant: true,
      canChooseSponsor: false,
      canInvite: true,
      isCukieMaster: true,
      hasConfirmedSponsor: true,
      eligibilityReason: null,
    });
  });

  it("falla cerrado ante evidencia bloqueada incompleta", async () => {
    const { db } = fixture({ presale: [{
      normalizedWalletAddress: NEW_WALLET,
      lockedSponsorWalletAddress: AMBASSADOR,
    }] });
    await expect(getOrCreateMongoAmbassadorProfile(db, NEW_WALLET, NOW))
      .rejects.toThrow(/no tiene fecha canonica/);
  });

  it("la raiz configurada puede invitar sin compra y no elegir patrocinador", async () => {
    process.env.AMBASSADOR_DEFAULT_WALLET_ADDRESS = ROOT;
    const { db } = fixture();

    const profile = await getOrCreateMongoAmbassadorProfile(db, ROOT, NOW);
    expect(profile).toMatchObject({ invitationCode: ambassadorInvitationCode(ROOT) });
    await expect(getPublicAmbassadorInvitation(profile!.invitationCode)).resolves.toMatchObject({
      isCukiesWorld: true,
    });
    await expect(getMongoAmbassadorEnrollment(db, ROOT)).resolves.toEqual({
      isPresaleParticipant: false,
      canChooseSponsor: false,
      canInvite: true,
      isCukieMaster: null,
      hasConfirmedSponsor: true,
      eligibilityReason: "CUKIE_WORLD_ROOT_EXEMPT",
    });
    await expect(acceptDirectAmbassadorAttribution(
      createMongoAmbassadorAttributionRepository(db, session),
      { referredWallet: ROOT, ambassadorWallet: AMBASSADOR, signedSessionEvidenceHash: EVIDENCE, now: NOW },
    )).rejects.toMatchObject({ details: { reason: "AMBASSADOR_ALREADY_CONFIRMED" } });
  });

  it("confirmar Cukies World guarda atribucion normal y habilita el enlace propio", async () => {
    process.env.AMBASSADOR_DEFAULT_WALLET_ADDRESS = ROOT;
    const { data } = fixture();

    const attribution = await acceptCanonicalCukiesWorldEnrollment({
      referredWallet: NEW_WALLET,
      signedSessionEvidenceHash: EVIDENCE,
      now: NOW,
    });
    expect(attribution).toMatchObject({
      ambassadorWalletNormalized: ROOT,
      commissionBpsSnapshot: 500,
      source: "signed_wallet_session",
    });
    await expect(acceptCanonicalCukiesWorldEnrollment({
      referredWallet: NEW_WALLET,
      signedSessionEvidenceHash: EVIDENCE,
      now: NOW,
    })).resolves.toEqual(attribution);
    await expect(getAmbassadorDashboard(NEW_WALLET, NOW)).resolves.toMatchObject({
      profile: { invitationCode: ambassadorInvitationCode(NEW_WALLET) },
      ownAttribution: { isCukiesWorld: true },
      defaultAmbassador: { ambassadorWalletMasked: "0x3333…3333" },
      enrollment: { canChooseSponsor: false, canInvite: true },
    });
    expect(data.ambassador_attributions).toHaveLength(1);
  });

  it("Cukies World tampoco puede asignarse a compradores sin sponsor", async () => {
    process.env.AMBASSADOR_DEFAULT_WALLET_ADDRESS = ROOT;
    const { data } = fixture({ presale: [{ normalizedWalletAddress: NEW_WALLET, firstPurchaseAt: NOW }] });
    await expect(acceptCanonicalCukiesWorldEnrollment({
      referredWallet: NEW_WALLET, signedSessionEvidenceHash: EVIDENCE, now: NOW,
    })).rejects.toMatchObject({ details: { reason: "PRESALE_SPONSOR_LOCKED" } });
    expect(data.ambassador_attributions).toHaveLength(0);
  });

  it("no omite el historial de la raiz configurada al comprobar ciclos", async () => {
    process.env.AMBASSADOR_DEFAULT_WALLET_ADDRESS = ROOT;
    const historicalRoot = buildAmbassadorAttribution({
      referredWallet: ROOT,
      ambassadorWallet: NEW_WALLET,
      source: "signed_wallet_session",
      sourceReferenceHash: EVIDENCE,
      acceptedAt: NOW,
      now: NOW,
    });
    const { data } = fixture({ attributions: [historicalRoot] });

    await expect(acceptCanonicalCukiesWorldEnrollment({
      referredWallet: NEW_WALLET, signedSessionEvidenceHash: EVIDENCE, now: NOW,
    })).rejects.toMatchObject({ details: { reason: "AMBASSADOR_CYCLE" } });
    expect(data.ambassador_attributions).toEqual([historicalRoot]);
  });

  it("no inventa wallet Cukies World cuando falta configuracion", async () => {
    fixture();
    await expect(acceptCanonicalCukiesWorldEnrollment({
      referredWallet: NEW_WALLET, signedSessionEvidenceHash: EVIDENCE, now: NOW,
    })).rejects.toThrow("AMBASSADOR_DEFAULT_WALLET_NOT_CONFIGURED");
    expect(withEconomyTransaction).not.toHaveBeenCalled();
  });
});
