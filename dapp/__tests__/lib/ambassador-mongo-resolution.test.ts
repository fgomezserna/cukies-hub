import type { ClientSession, Db } from "mongodb";

import {
  createMongoAmbassadorAttributionRepository,
  getOrCreateMongoAmbassadorProfile,
  materializeLockedPresaleAmbassadorAttributions,
  resolveMongoAmbassadorAttributionsForWallets,
} from "@/lib/uki-economy/ambassadors/repository";
import {
  buildAmbassadorAttribution,
  stableAmbassadorHash,
} from "@/lib/uki-economy/ambassadors/rules";
import type {
  AmbassadorAttribution,
  AmbassadorProfile,
} from "@/lib/uki-economy/ambassadors/types";

const REFERRED = "0x1111111111111111111111111111111111111111";
const AMBASSADOR = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";
const NOW = new Date("2026-08-30T12:00:00.000Z");

type PresaleRow = {
  normalizedWalletAddress: string;
  lockedSponsorWalletAddress?: string | null;
  sponsorLockedAt?: Date | null;
  firstPurchaseAt?: Date | null;
};

type FakeFilter = {
  referredWalletNormalized?: { $in: string[] };
  normalizedWalletAddress?: { $in: string[] };
  acceptedAt?: { $lte: Date };
  lockedSponsorWalletAddress?:
    | { $type: "string" }
    | { $regex: string; $options: string };
};

function fakeDb(input: {
  attributions?: AmbassadorAttribution[];
  presale?: PresaleRow[];
}) {
  const attributions = [...(input.attributions ?? [])];
  const presale = [...(input.presale ?? [])];
  const collection = (name: string) => {
    const rows = name === "ambassador_attributions" ? attributions : presale;
    return {
      find(filter: FakeFilter) {
        return {
          async toArray() {
            return rows.filter((row) => {
              const sponsorFilter = filter.lockedSponsorWalletAddress;
              const wallet =
                "referredWalletNormalized" in row
                  ? row.referredWalletNormalized
                  : row.normalizedWalletAddress;
              if (
                filter.referredWalletNormalized?.$in &&
                !filter.referredWalletNormalized.$in.includes(wallet)
              )
                return false;
              if (
                filter.normalizedWalletAddress?.$in &&
                !filter.normalizedWalletAddress.$in.includes(wallet)
              )
                return false;
              if (
                filter.acceptedAt?.$lte &&
                (!("acceptedAt" in row) ||
                  row.acceptedAt > filter.acceptedAt.$lte)
              ) {
                return false;
              }
              if (
                sponsorFilter &&
                "$type" in sponsorFilter &&
                sponsorFilter.$type === "string" &&
                (!("lockedSponsorWalletAddress" in row) ||
                  typeof row.lockedSponsorWalletAddress !== "string")
              )
                return false;
              if (
                sponsorFilter &&
                "$regex" in sponsorFilter &&
                (!("lockedSponsorWalletAddress" in row) ||
                  typeof row.lockedSponsorWalletAddress !== "string" ||
                  !new RegExp(
                    sponsorFilter.$regex,
                    sponsorFilter.$options
                  ).test(row.lockedSponsorWalletAddress))
              )
                return false;
              return true;
            });
          },
        };
      },
      async bulkWrite(
        operations: Array<{
          updateOne: {
            filter: { _id?: string; referredWalletNormalized?: string };
            update: { $setOnInsert: AmbassadorAttribution };
          };
        }>
      ) {
        let upsertedCount = 0;
        for (const operation of operations) {
          const { _id, referredWalletNormalized } = operation.updateOne.filter;
          if (
            !attributions.some(
              (row) =>
                (_id && row._id === _id) ||
                (referredWalletNormalized &&
                  row.referredWalletNormalized === referredWalletNormalized)
            )
          ) {
            attributions.push(operation.updateOne.update.$setOnInsert);
            upsertedCount += 1;
          }
        }
        return { upsertedCount };
      },
    };
  };
  return {
    db: { collection } as unknown as Db,
    attributions,
  };
}

describe("Mongo ambassador canonical resolution", () => {
  it("serializa las escrituras del grafo dentro de la transaccion Mongo", async () => {
    const session = {} as ClientSession;
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    const db = {
      collection: (name: string) =>
        name === "ambassador_graph_state"
          ? { updateOne }
          : {},
    } as unknown as Db;
    const repository = createMongoAmbassadorAttributionRepository(db, session);

    await repository.acquireGraphWriteFence(NOW);

    expect(updateOne).toHaveBeenCalledWith(
      { _id: "ambassador-attribution-graph" },
      {
        $inc: { revision: 1 },
        $set: { updatedAt: NOW },
        $setOnInsert: { createdAt: NOW },
      },
      { session, upsert: true }
    );
  });

  it("no permite atribuciones Mongo fuera de una transaccion", async () => {
    const db = { collection: () => ({}) } as unknown as Db;
    const repository = createMongoAmbassadorAttributionRepository(db);

    await expect(repository.acquireGraphWriteFence(NOW)).rejects.toThrow(
      "AMBASSADOR_ATTRIBUTION_TRANSACTION_REQUIRED"
    );
  });

  it("considera registrada una wallet que ya compro durante la preventa", async () => {
    const findOne = jest.fn().mockResolvedValue({ _id: "presale-row" });
    const db = {
      collection: (name: string) =>
        name === "presale_participants" ? { findOne } : {},
    } as unknown as Db;
    const repository = createMongoAmbassadorAttributionRepository(
      db,
      {} as ClientSession
    );

    await expect(repository.hasPresalePurchase(REFERRED)).resolves.toBe(true);
    expect(findOne).toHaveBeenCalledWith(
      {
        normalizedWalletAddress: REFERRED,
        firstPurchaseAt: { $exists: true, $ne: null },
      },
      {
        session: expect.any(Object),
        projection: { _id: 1 },
      }
    );
  });

  it("crea el perfil sin actualizar una ruta incluida en setOnInsert", async () => {
    const profiles: AmbassadorProfile[] = [];
    const updateOne = jest.fn(
      async (
        filter: { _id: string },
        update: {
          $setOnInsert: AmbassadorProfile;
          $set?: Partial<AmbassadorProfile>;
        }
      ) => {
        const overlappingPaths = Object.keys(update.$set ?? {}).filter((path) =>
          Object.hasOwn(update.$setOnInsert, path)
        );
        if (overlappingPaths.length > 0) {
          throw new Error(
            `Mongo update path conflict: ${overlappingPaths.join(", ")}`
          );
        }
        if (!profiles.some((profile) => profile._id === filter._id)) {
          profiles.push(update.$setOnInsert);
        }
      }
    );
    const db = {
      collection: () => ({
        updateOne,
        findOne: async (filter: { _id: string }) =>
          profiles.find((profile) => profile._id === filter._id) ?? null,
      }),
    } as unknown as Db;

    const profile = await getOrCreateMongoAmbassadorProfile(
      db,
      AMBASSADOR,
      NOW
    );

    expect(profile).toMatchObject({
      walletNormalized: AMBASSADOR,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(updateOne).toHaveBeenCalledWith(
      { _id: `ambassador-profile:${AMBASSADOR}` },
      {
        $setOnInsert: expect.objectContaining({ walletNormalized: AMBASSADOR }),
      },
      { upsert: true }
    );
  });

  it("no aplica una atribucion firmada de forma retroactiva", async () => {
    const acceptedAt = new Date("2026-08-30T13:00:00.000Z");
    const direct = buildAmbassadorAttribution({
      referredWallet: REFERRED,
      ambassadorWallet: AMBASSADOR,
      source: "signed_wallet_session",
      sourceReferenceHash: stableAmbassadorHash({ session: 1 }),
      acceptedAt,
      now: acceptedAt,
    });
    const { db } = fakeDb({ attributions: [direct] });

    const before = await resolveMongoAmbassadorAttributionsForWallets(
      db,
      [REFERRED],
      new Date("2026-08-30T12:59:59.999Z")
    );
    const after = await resolveMongoAmbassadorAttributionsForWallets(
      db,
      [REFERRED],
      new Date("2026-08-30T13:00:00.000Z")
    );

    expect(before.get(REFERRED)).toBeNull();
    expect(after.get(REFERRED)).toEqual(direct);
  });

  it("materializa el sponsor bloqueado de preventa en la fuente canonica", async () => {
    const lockedAt = new Date("2026-03-31T00:00:00.000Z");
    const { db, attributions } = fakeDb({
      presale: [
        {
          normalizedWalletAddress: REFERRED,
          lockedSponsorWalletAddress: AMBASSADOR,
          sponsorLockedAt: lockedAt,
        },
      ],
    });

    const resolved = await resolveMongoAmbassadorAttributionsForWallets(
      db,
      [REFERRED],
      new Date("2026-08-30T12:00:00.000Z"),
      undefined,
      new Date("2026-08-30T12:00:01.000Z")
    );

    expect(resolved.get(REFERRED)).toMatchObject({
      source: "presale_locked",
      ambassadorWalletNormalized: AMBASSADOR,
      acceptedAt: lockedAt,
      commissionBpsSnapshot: 500,
      levelsSnapshot: 1,
    });
    expect(attributions).toHaveLength(1);
  });

  it("migra todos los sponsors bloqueados sin nueva firma y permite reejecutar", async () => {
    const lockedAt = new Date("2026-03-31T00:00:00.000Z");
    const { db, attributions } = fakeDb({
      presale: [
        {
          normalizedWalletAddress: REFERRED,
          lockedSponsorWalletAddress: AMBASSADOR,
          sponsorLockedAt: lockedAt,
        },
      ],
    });

    await expect(
      materializeLockedPresaleAmbassadorAttributions(db, { now: NOW })
    ).resolves.toEqual({ scanned: 1, materialized: 1 });
    await expect(
      materializeLockedPresaleAmbassadorAttributions(db, { now: NOW })
    ).resolves.toEqual({ scanned: 1, materialized: 0 });
    expect(attributions).toHaveLength(1);
    expect(attributions[0]).toMatchObject({
      source: "presale_locked",
      acceptedAt: lockedAt,
      policyVersion: "ambassador-direct-v1",
    });
  });

  it("falla cerrado si una proyeccion contradice preventa", async () => {
    const acceptedAt = new Date("2026-03-01T00:00:00.000Z");
    const direct = buildAmbassadorAttribution({
      referredWallet: REFERRED,
      ambassadorWallet: OTHER,
      source: "signed_wallet_session",
      sourceReferenceHash: stableAmbassadorHash({ session: 1 }),
      acceptedAt,
      now: acceptedAt,
    });
    const { db } = fakeDb({
      attributions: [direct],
      presale: [
        {
          normalizedWalletAddress: REFERRED,
          lockedSponsorWalletAddress: AMBASSADOR,
          sponsorLockedAt: new Date("2026-03-31T00:00:00.000Z"),
        },
      ],
    });

    await expect(
      resolveMongoAmbassadorAttributionsForWallets(
        db,
        [REFERRED],
        new Date("2026-08-30T12:00:00.000Z")
      )
    ).rejects.toThrow(/contradice el sponsor de preventa/);
  });

  it("no inventa una fecha historica si la proyeccion bloqueada esta incompleta", async () => {
    const { db } = fakeDb({
      presale: [
        {
          normalizedWalletAddress: REFERRED,
          lockedSponsorWalletAddress: AMBASSADOR,
        },
      ],
    });

    await expect(
      resolveMongoAmbassadorAttributionsForWallets(
        db,
        [REFERRED],
        new Date("2026-08-30T12:00:00.000Z")
      )
    ).rejects.toThrow(/no tiene fecha canonica/);
  });
});
