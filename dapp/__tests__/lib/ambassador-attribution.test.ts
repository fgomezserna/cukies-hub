import {
  acceptDirectAmbassadorAttribution,
  resolveAmbassadorAttribution,
} from "@/lib/uki-economy/ambassadors/service";
import {
  ambassadorInvitationCode,
  assertAmbassadorAttribution,
  assertAmbassadorInvitationCode,
  buildAmbassadorAttribution,
  stableAmbassadorHash,
} from "@/lib/uki-economy/ambassadors/rules";
import type {
  AmbassadorAttribution,
  AmbassadorAttributionRepository,
  LockedPresaleAmbassador,
} from "@/lib/uki-economy/ambassadors/types";

const REFERRED = "0x1111111111111111111111111111111111111111";
const AMBASSADOR = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";
const NOW = new Date("2026-08-30T12:00:00.000Z");

class MemoryAmbassadorRepository implements AmbassadorAttributionRepository {
  readonly attributions = new Map<string, AmbassadorAttribution>();
  readonly presale = new Map<string, LockedPresaleAmbassador>();
  readonly presalePurchases = new Set<string>();
  graphWriteFences = 0;

  async acquireGraphWriteFence() {
    this.graphWriteFences += 1;
  }

  async findAttribution(referredWalletNormalized: string) {
    return this.attributions.get(referredWalletNormalized) ?? null;
  }

  async findLockedPresaleAmbassador(referredWalletNormalized: string) {
    return this.presale.get(referredWalletNormalized) ?? null;
  }

  async hasPresalePurchase(referredWalletNormalized: string) {
    return this.presalePurchases.has(referredWalletNormalized);
  }

  async insertAttribution(attribution: AmbassadorAttribution) {
    if (this.attributions.has(attribution.referredWalletNormalized))
      return "duplicate" as const;
    this.attributions.set(attribution.referredWalletNormalized, attribution);
    return "inserted" as const;
  }
}

function sessionEvidence(suffix = "initial") {
  return stableAmbassadorHash({ kind: "signed_wallet_session", suffix });
}

describe("ambassador attribution", () => {
  it("genera un codigo estable que no expone la wallet", () => {
    const code = ambassadorInvitationCode(AMBASSADOR);

    expect(code).toMatch(/^cw-[0-9a-f]{12}$/);
    expect(code).not.toContain(AMBASSADOR.slice(2));
    expect(assertAmbassadorInvitationCode(code.toUpperCase())).toBe(code);
  });

  it("vincula sin compra mediante la wallet referida y sella 500 bps/un nivel", async () => {
    const repository = new MemoryAmbassadorRepository();
    const attribution = await acceptDirectAmbassadorAttribution(repository, {
      referredWallet: REFERRED,
      ambassadorWallet: AMBASSADOR,
      signedSessionEvidenceHash: sessionEvidence(),
      now: NOW,
    });

    expect(attribution).toMatchObject({
      referredWalletNormalized: REFERRED,
      ambassadorWalletNormalized: AMBASSADOR,
      source: "signed_wallet_session",
      policyVersion: "ambassador-direct-v1",
      commissionBpsSnapshot: 500,
      levelsSnapshot: 1,
      acceptedAt: NOW,
    });
    expect(attribution.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      resolveAmbassadorAttribution(repository, REFERRED, NOW)
    ).resolves.toEqual(attribution);
  });

  it("hace replay identico idempotente y no permite cambiar el sponsor", async () => {
    const repository = new MemoryAmbassadorRepository();
    const first = await acceptDirectAmbassadorAttribution(repository, {
      referredWallet: REFERRED,
      ambassadorWallet: AMBASSADOR,
      signedSessionEvidenceHash: sessionEvidence("first"),
      now: NOW,
    });
    const replay = await acceptDirectAmbassadorAttribution(repository, {
      referredWallet: REFERRED,
      ambassadorWallet: AMBASSADOR,
      signedSessionEvidenceHash: sessionEvidence("replay"),
      now: new Date("2026-08-30T13:00:00.000Z"),
    });

    expect(replay).toEqual(first);
    expect(repository.attributions.size).toBe(1);
    expect(repository.graphWriteFences).toBe(2);
    await expect(
      acceptDirectAmbassadorAttribution(repository, {
        referredWallet: REFERRED,
        ambassadorWallet: OTHER,
        signedSessionEvidenceHash: sessionEvidence("other"),
        now: NOW,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rechaza una referencia circular directa entre dos wallets", async () => {
    const repository = new MemoryAmbassadorRepository();
    await acceptDirectAmbassadorAttribution(repository, {
      referredWallet: REFERRED,
      ambassadorWallet: AMBASSADOR,
      signedSessionEvidenceHash: sessionEvidence("a-to-b"),
      now: NOW,
    });

    await expect(
      acceptDirectAmbassadorAttribution(repository, {
        referredWallet: AMBASSADOR,
        ambassadorWallet: REFERRED,
        signedSessionEvidenceHash: sessionEvidence("b-to-a"),
        now: NOW,
      })
    ).rejects.toThrow(/referencia circular/);
    expect(repository.attributions.size).toBe(1);
  });

  it("rechaza ciclos largos que combinan preventa y una atribucion nueva", async () => {
    const repository = new MemoryAmbassadorRepository();
    repository.presale.set(REFERRED, {
      referredWalletNormalized: REFERRED,
      ambassadorWalletNormalized: AMBASSADOR,
      lockedAt: new Date("2026-06-24T21:49:03.000Z"),
      sourceReferenceHash: stableAmbassadorHash({ presale: "a-to-b" }),
    });
    repository.presale.set(AMBASSADOR, {
      referredWalletNormalized: AMBASSADOR,
      ambassadorWalletNormalized: OTHER,
      lockedAt: new Date("2026-06-25T14:10:26.000Z"),
      sourceReferenceHash: stableAmbassadorHash({ presale: "b-to-c" }),
    });

    await expect(
      acceptDirectAmbassadorAttribution(repository, {
        referredWallet: OTHER,
        ambassadorWallet: REFERRED,
        signedSessionEvidenceHash: sessionEvidence("c-to-a"),
        now: NOW,
      })
    ).rejects.toThrow(/referencia circular/);
    expect(repository.attributions.size).toBe(2);
    expect(
      [...repository.attributions.values()].every(
        (attribution) => attribution.source === "presale_locked"
      )
    ).toBe(true);
  });

  it("no permite atribuir despues a una wallet que ya compro en preventa", async () => {
    const repository = new MemoryAmbassadorRepository();
    repository.presalePurchases.add(REFERRED);

    await expect(
      acceptDirectAmbassadorAttribution(repository, {
        referredWallet: REFERRED,
        ambassadorWallet: AMBASSADOR,
        signedSessionEvidenceHash: sessionEvidence("late-presale-attribution"),
        now: NOW,
      })
    ).rejects.toThrow(/registrada durante la preventa/);
    expect(repository.attributions.size).toBe(0);
  });

  it("materializa el sponsor bloqueado de preventa y le da precedencia", async () => {
    const repository = new MemoryAmbassadorRepository();
    repository.presale.set(REFERRED, {
      referredWalletNormalized: REFERRED,
      ambassadorWalletNormalized: AMBASSADOR,
      lockedAt: new Date("2026-03-31T00:00:00.000Z"),
      sourceReferenceHash: stableAmbassadorHash({ presale: "purchase-1" }),
    });

    const preserved = await resolveAmbassadorAttribution(
      repository,
      REFERRED,
      NOW
    );
    expect(preserved).toMatchObject({
      source: "presale_locked",
      ambassadorWalletNormalized: AMBASSADOR,
      acceptedAt: new Date("2026-03-31T00:00:00.000Z"),
    });
    await expect(
      acceptDirectAmbassadorAttribution(repository, {
        referredWallet: REFERRED,
        ambassadorWallet: OTHER,
        signedSessionEvidenceHash: sessionEvidence(),
        now: NOW,
      })
    ).rejects.toThrow(/preventa tiene precedencia/);
    await expect(
      acceptDirectAmbassadorAttribution(repository, {
        referredWallet: REFERRED,
        ambassadorWallet: AMBASSADOR,
        signedSessionEvidenceHash: sessionEvidence(),
        now: NOW,
      })
    ).resolves.toEqual(preserved);
  });

  it("rechaza autorreferencia y evidencia de sesion no canonica", async () => {
    const repository = new MemoryAmbassadorRepository();
    await expect(
      acceptDirectAmbassadorAttribution(repository, {
        referredWallet: REFERRED,
        ambassadorWallet: REFERRED,
        signedSessionEvidenceHash: sessionEvidence(),
        now: NOW,
      })
    ).rejects.toThrow(/propio embajador/);
    await expect(
      acceptDirectAmbassadorAttribution(repository, {
        referredWallet: REFERRED,
        ambassadorWallet: AMBASSADOR,
        signedSessionEvidenceHash: "not-a-hash",
        now: NOW,
      })
    ).rejects.toThrow(/sha256 canonico/);
  });

  it("falla cerrado si la proyeccion contradice un sponsor de preventa", async () => {
    const repository = new MemoryAmbassadorRepository();
    await acceptDirectAmbassadorAttribution(repository, {
      referredWallet: REFERRED,
      ambassadorWallet: OTHER,
      signedSessionEvidenceHash: sessionEvidence(),
      now: NOW,
    });
    repository.presale.set(REFERRED, {
      referredWalletNormalized: REFERRED,
      ambassadorWalletNormalized: AMBASSADOR,
      lockedAt: new Date("2026-03-31T00:00:00.000Z"),
      sourceReferenceHash: stableAmbassadorHash({ presale: "purchase-1" }),
    });

    await expect(
      resolveAmbassadorAttribution(repository, REFERRED, NOW)
    ).rejects.toThrow(/contradice el sponsor bloqueado/);
  });

  it("detecta una mutacion posterior aunque el sponsor no cambie", async () => {
    const repository = new MemoryAmbassadorRepository();
    const attribution = await acceptDirectAmbassadorAttribution(repository, {
      referredWallet: REFERRED,
      ambassadorWallet: AMBASSADOR,
      signedSessionEvidenceHash: sessionEvidence(),
      now: NOW,
    });
    repository.attributions.set(REFERRED, {
      ...attribution,
      updatedAt: new Date("2026-08-30T12:00:01.000Z"),
    });

    await expect(
      resolveAmbassadorAttribution(repository, REFERRED, NOW)
    ).rejects.toThrow(/no coincide con su evidencia/);
  });

  it("rechaza wallets persistidas fuera de su forma canonica", () => {
    const attribution = buildAmbassadorAttribution({
      referredWallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ambassadorWallet: AMBASSADOR,
      source: "signed_wallet_session",
      sourceReferenceHash: sessionEvidence(),
      acceptedAt: NOW,
      now: NOW,
    });

    expect(() =>
      assertAmbassadorAttribution({
        ...attribution,
        referredWalletNormalized: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      })
    ).toThrow(/no coincide con su evidencia/);
  });
});
