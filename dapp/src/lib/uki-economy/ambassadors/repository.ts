import type { ClientSession, Db } from "mongodb";

import { DomainConflictError } from "../errors";
import {
  ambassadorInvitationCode,
  assertAmbassadorInvitationCode,
  assertAmbassadorAttribution,
  buildAmbassadorAttribution,
  stableAmbassadorHash,
  validAmbassadorWallet,
} from "./rules";
import type {
  AmbassadorAttribution,
  AmbassadorProfile,
  AmbassadorAttributionRepository,
  LockedPresaleAmbassador,
} from "./types";

type PresaleParticipant = {
  normalizedWalletAddress: string;
  lockedSponsorWalletAddress?: string | null;
  sponsorLockedAt?: Date | null;
  firstPurchaseAt?: Date | null;
};

type AmbassadorGraphState = {
  _id: "ambassador-attribution-graph";
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

function duplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

function lockedPresaleAmbassador(
  row: PresaleParticipant | null,
): LockedPresaleAmbassador | null {
  if (!row?.lockedSponsorWalletAddress) return null;
  const referredWalletNormalized = validAmbassadorWallet(
    row.normalizedWalletAddress,
    "presale.normalizedWalletAddress",
  );
  const ambassadorWalletNormalized = validAmbassadorWallet(
    row.lockedSponsorWalletAddress,
    "presale.lockedSponsorWalletAddress",
  );
  const lockedAt = row.sponsorLockedAt instanceof Date && !Number.isNaN(row.sponsorLockedAt.getTime())
    ? row.sponsorLockedAt
    : row.firstPurchaseAt instanceof Date && !Number.isNaN(row.firstPurchaseAt.getTime())
      ? row.firstPurchaseAt
      : null;
  if (!lockedAt) {
    throw new DomainConflictError(
      `El sponsor bloqueado de preventa no tiene fecha canonica para ${referredWalletNormalized}.`,
    );
  }
  return {
    referredWalletNormalized,
    ambassadorWalletNormalized,
    lockedAt,
    sourceReferenceHash: stableAmbassadorHash({
      collection: "presale_participants",
      referredWalletNormalized,
      ambassadorWalletNormalized,
      lockedAt,
    }),
  };
}

export function createMongoAmbassadorAttributionRepository(
  db: Db,
  session?: ClientSession,
): AmbassadorAttributionRepository {
  const options = session ? { session } : {};
  const attributions = db.collection<AmbassadorAttribution>("ambassador_attributions");
  const presale = db.collection<PresaleParticipant>("presale_participants");
  return {
    async acquireGraphWriteFence(now) {
      if (!session) {
        throw new TypeError("AMBASSADOR_ATTRIBUTION_TRANSACTION_REQUIRED");
      }
      await db.collection<AmbassadorGraphState>("ambassador_graph_state").updateOne(
        { _id: "ambassador-attribution-graph" },
        {
          $inc: { revision: 1 },
          $set: { updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { session, upsert: true }
      );
    },
    async findAttribution(referredWalletNormalized) {
      const row = await attributions.findOne(
        { referredWalletNormalized },
        options,
      );
      return row ? assertAmbassadorAttribution(row) : null;
    },
    async findLockedPresaleAmbassador(referredWalletNormalized) {
      const row = await presale.findOne(
        { normalizedWalletAddress: referredWalletNormalized },
        {
          ...options,
          projection: {
            _id: 0,
            normalizedWalletAddress: 1,
            lockedSponsorWalletAddress: 1,
            sponsorLockedAt: 1,
            firstPurchaseAt: 1,
          },
        },
      );
      return lockedPresaleAmbassador(row);
    },
    async hasPresalePurchase(referredWalletNormalized) {
      const row = await presale.findOne(
        {
          normalizedWalletAddress: referredWalletNormalized,
          firstPurchaseAt: { $exists: true, $ne: null },
        },
        {
          ...options,
          projection: { _id: 1 },
        }
      );
      return Boolean(row);
    },
    async insertAttribution(attribution) {
      assertAmbassadorAttribution(attribution);
      try {
        await attributions.insertOne(attribution, options);
        return "inserted";
      } catch (error) {
        if (duplicateKey(error)) return "duplicate";
        throw error;
      }
    },
  };
}

export async function resolveMongoAmbassadorAttributionsForWallets(
  db: Db,
  wallets: readonly string[],
  effectiveAt: Date,
  session?: ClientSession,
  materializedAt = new Date(),
) {
  const normalized = [...new Set(wallets.map((wallet) => validAmbassadorWallet(wallet)))].sort();
  const resolved = new Map<string, AmbassadorAttribution | null>();
  if (normalized.length === 0) return resolved;
  const options = session ? { session } : {};
  const attributions = db.collection<AmbassadorAttribution>("ambassador_attributions");
  const [existingRows, presaleRows] = await Promise.all([
    attributions.find({
      referredWalletNormalized: { $in: normalized },
      acceptedAt: { $lte: effectiveAt },
    }, options).toArray(),
    db.collection<PresaleParticipant>("presale_participants").find(
      {
        normalizedWalletAddress: { $in: normalized },
        lockedSponsorWalletAddress: { $type: "string" },
      },
      {
        ...options,
        projection: {
          _id: 0,
          normalizedWalletAddress: 1,
          lockedSponsorWalletAddress: 1,
          sponsorLockedAt: 1,
          firstPurchaseAt: 1,
        },
      },
    ).toArray(),
  ]);
  const existing = new Map(existingRows.map((row) => [
    row.referredWalletNormalized,
    assertAmbassadorAttribution(row),
  ]));
  const locked = new Map(presaleRows.flatMap((row) => {
    const value = lockedPresaleAmbassador(row);
    if (!value) throw new DomainConflictError("El sponsor de preventa no pudo normalizarse.");
    return value.lockedAt.getTime() <= effectiveAt.getTime()
      ? [[value.referredWalletNormalized, value] as const]
      : [];
  }));
  const missingPresale = [...locked.values()]
    .filter((value) => !existing.has(value.referredWalletNormalized))
    .map((value) => buildAmbassadorAttribution({
      referredWallet: value.referredWalletNormalized,
      ambassadorWallet: value.ambassadorWalletNormalized,
      source: "presale_locked",
      sourceReferenceHash: value.sourceReferenceHash,
      acceptedAt: value.lockedAt,
      now: materializedAt,
    }));
  if (missingPresale.length > 0) {
    await attributions.bulkWrite(
      missingPresale.map((attribution) => ({
        updateOne: {
          filter: { _id: attribution._id },
          update: { $setOnInsert: attribution },
          upsert: true,
        },
      })),
      { ...options, ordered: false },
    );
    const insertedOrRaced = await attributions.find(
      {
        referredWalletNormalized: { $in: missingPresale.map((row) => row.referredWalletNormalized) },
        acceptedAt: { $lte: effectiveAt },
      },
      options,
    ).toArray();
    for (const row of insertedOrRaced) {
      existing.set(row.referredWalletNormalized, assertAmbassadorAttribution(row));
    }
  }
  for (const wallet of normalized) {
    const attribution = existing.get(wallet) ?? null;
    const presaleAttribution = locked.get(wallet);
    if (
      presaleAttribution &&
      attribution?.ambassadorWalletNormalized !== presaleAttribution.ambassadorWalletNormalized
    ) {
      throw new DomainConflictError(
        `La atribucion ambassador contradice el sponsor de preventa para ${wallet}.`,
      );
    }
    resolved.set(wallet, attribution);
  }
  return resolved;
}

export async function resolveMongoAmbassadorAttribution(
  db: Db,
  wallet: string,
  effectiveAt: Date,
  session?: ClientSession,
  materializedAt = new Date(),
) {
  const walletNormalized = validAmbassadorWallet(wallet);
  return (await resolveMongoAmbassadorAttributionsForWallets(
    db,
    [walletNormalized],
    effectiveAt,
    session,
    materializedAt,
  )).get(walletNormalized) ?? null;
}

export async function getOrCreateMongoAmbassadorProfile(
  db: Db,
  wallet: string,
  now = new Date(),
  session?: ClientSession,
) {
  const walletNormalized = validAmbassadorWallet(wallet);
  const invitationCode = ambassadorInvitationCode(walletNormalized);
  const profile: AmbassadorProfile = {
    _id: `ambassador-profile:${walletNormalized}`,
    walletNormalized,
    invitationCode,
    createdAt: now,
    updatedAt: now,
  };
  const collection = db.collection<AmbassadorProfile>("ambassador_profiles");
  const options = session ? { session } : {};
  try {
    await collection.updateOne(
      { _id: profile._id },
      { $setOnInsert: profile },
      { ...options, upsert: true },
    );
  } catch (error) {
    if (!duplicateKey(error)) throw error;
  }
  const stored = await collection.findOne({ _id: profile._id }, options);
  if (
    !stored
    || stored.walletNormalized !== walletNormalized
    || stored.invitationCode !== invitationCode
  ) {
    throw new DomainConflictError("El codigo de invitacion entra en conflicto con otro embajador.");
  }
  return stored;
}

export async function findMongoAmbassadorByInvitationCode(
  db: Db,
  code: string,
  session?: ClientSession,
) {
  const invitationCode = assertAmbassadorInvitationCode(code);
  const row = await db.collection<AmbassadorProfile>("ambassador_profiles").findOne(
    { invitationCode },
    session ? { session } : {},
  );
  if (!row) return null;
  return {
    ...row,
    walletNormalized: validAmbassadorWallet(row.walletNormalized),
    invitationCode: assertAmbassadorInvitationCode(row.invitationCode),
  };
}

export async function materializeLockedPresaleAmbassadorAttributions(
  db: Db,
  input: {
    ambassadorWallet?: string;
    now?: Date;
    session?: ClientSession;
  } = {},
) {
  const now = input.now ?? new Date();
  const ambassadorWalletNormalized = input.ambassadorWallet
    ? validAmbassadorWallet(input.ambassadorWallet)
    : null;
  const options = input.session ? { session: input.session } : {};
  const query: Record<string, unknown> = {
    lockedSponsorWalletAddress: { $type: "string" },
  };
  if (ambassadorWalletNormalized) {
    query.lockedSponsorWalletAddress = { $regex: `^${ambassadorWalletNormalized}$`, $options: "i" };
  }
  const presaleRows = await db.collection<PresaleParticipant>("presale_participants")
    .find(query, {
      ...options,
      projection: {
        _id: 0,
        normalizedWalletAddress: 1,
        lockedSponsorWalletAddress: 1,
        sponsorLockedAt: 1,
        firstPurchaseAt: 1,
      },
    })
    .toArray();
  const candidates = presaleRows.map((row) => {
    const locked = lockedPresaleAmbassador(row);
    if (!locked) throw new DomainConflictError("Un referido confirmado de preventa no pudo normalizarse.");
    return buildAmbassadorAttribution({
      referredWallet: locked.referredWalletNormalized,
      ambassadorWallet: locked.ambassadorWalletNormalized,
      source: "presale_locked",
      sourceReferenceHash: locked.sourceReferenceHash,
      acceptedAt: locked.lockedAt,
      now,
    });
  });
  if (candidates.length === 0) return { scanned: 0, materialized: 0 };
  const attributions = db.collection<AmbassadorAttribution>("ambassador_attributions");
  const result = await attributions.bulkWrite(
    candidates.map((attribution) => ({
      updateOne: {
        filter: { referredWalletNormalized: attribution.referredWalletNormalized },
        update: { $setOnInsert: attribution },
        upsert: true,
      },
    })),
    { ...options, ordered: false },
  );
  const stored = await attributions.find(
    { referredWalletNormalized: { $in: candidates.map((row) => row.referredWalletNormalized) } },
    options,
  ).toArray();
  const expectedByWallet = new Map(candidates.map((row) => [row.referredWalletNormalized, row]));
  for (const row of stored) {
    const expected = expectedByWallet.get(row.referredWalletNormalized);
    if (!expected || row.ambassadorWalletNormalized !== expected.ambassadorWalletNormalized) {
      throw new DomainConflictError(
        `La atribucion existente contradice la preventa para ${row.referredWalletNormalized}.`,
      );
    }
  }
  return { scanned: candidates.length, materialized: result.upsertedCount };
}
