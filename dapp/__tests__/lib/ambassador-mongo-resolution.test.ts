import type { Db } from "mongodb";

import {
  resolveMongoAmbassadorAttributionsForWallets,
} from "@/lib/uki-economy/ambassadors/repository";
import {
  buildAmbassadorAttribution,
  stableAmbassadorHash,
} from "@/lib/uki-economy/ambassadors/rules";
import type { AmbassadorAttribution } from "@/lib/uki-economy/ambassadors/types";

const REFERRED = "0x1111111111111111111111111111111111111111";
const AMBASSADOR = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";

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
  lockedSponsorWalletAddress?: { $type: "string" };
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
              const wallet = "referredWalletNormalized" in row
                ? row.referredWalletNormalized
                : row.normalizedWalletAddress;
              if (filter.referredWalletNormalized?.$in &&
                  !filter.referredWalletNormalized.$in.includes(wallet)) return false;
              if (filter.normalizedWalletAddress?.$in &&
                  !filter.normalizedWalletAddress.$in.includes(wallet)) return false;
              if (filter.acceptedAt?.$lte &&
                  (!("acceptedAt" in row) || row.acceptedAt > filter.acceptedAt.$lte)) {
                return false;
              }
              if (filter.lockedSponsorWalletAddress?.$type === "string" &&
                  (!("lockedSponsorWalletAddress" in row) ||
                    typeof row.lockedSponsorWalletAddress !== "string")) return false;
              return true;
            });
          },
        };
      },
      async bulkWrite(operations: Array<{ updateOne: { filter: { _id: string }; update: { $setOnInsert: AmbassadorAttribution } } }>) {
        for (const operation of operations) {
          if (!attributions.some((row) => row._id === operation.updateOne.filter._id)) {
            attributions.push(operation.updateOne.update.$setOnInsert);
          }
        }
      },
    };
  };
  return {
    db: { collection } as unknown as Db,
    attributions,
  };
}

describe("Mongo ambassador canonical resolution", () => {
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
      new Date("2026-08-30T12:59:59.999Z"),
    );
    const after = await resolveMongoAmbassadorAttributionsForWallets(
      db,
      [REFERRED],
      new Date("2026-08-30T13:00:00.000Z"),
    );

    expect(before.get(REFERRED)).toBeNull();
    expect(after.get(REFERRED)).toEqual(direct);
  });

  it("materializa el sponsor bloqueado de preventa en la fuente canonica", async () => {
    const lockedAt = new Date("2026-03-31T00:00:00.000Z");
    const { db, attributions } = fakeDb({
      presale: [{
        normalizedWalletAddress: REFERRED,
        lockedSponsorWalletAddress: AMBASSADOR,
        sponsorLockedAt: lockedAt,
      }],
    });

    const resolved = await resolveMongoAmbassadorAttributionsForWallets(
      db,
      [REFERRED],
      new Date("2026-08-30T12:00:00.000Z"),
      undefined,
      new Date("2026-08-30T12:00:01.000Z"),
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
      presale: [{
        normalizedWalletAddress: REFERRED,
        lockedSponsorWalletAddress: AMBASSADOR,
        sponsorLockedAt: new Date("2026-03-31T00:00:00.000Z"),
      }],
    });

    await expect(resolveMongoAmbassadorAttributionsForWallets(
      db,
      [REFERRED],
      new Date("2026-08-30T12:00:00.000Z"),
    )).rejects.toThrow(/contradice el sponsor de preventa/);
  });

  it("no inventa una fecha historica si la proyeccion bloqueada esta incompleta", async () => {
    const { db } = fakeDb({
      presale: [{
        normalizedWalletAddress: REFERRED,
        lockedSponsorWalletAddress: AMBASSADOR,
      }],
    });

    await expect(resolveMongoAmbassadorAttributionsForWallets(
      db,
      [REFERRED],
      new Date("2026-08-30T12:00:00.000Z"),
    )).rejects.toThrow(/no tiene fecha canonica/);
  });
});
