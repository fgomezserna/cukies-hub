import type { ClientSession, Db } from "mongodb";

import { DomainConflictError } from "../errors";
import {
  ambassadorInvitationCode,
  assertAmbassadorInvitationCode,
  assertAmbassadorAttribution,
  buildAmbassadorAttribution,
  getDefaultAmbassadorWallet,
  stableAmbassadorHash,
  AMBASSADOR_ELIGIBILITY_UNAVAILABLE,
  validAmbassadorWallet,
} from "./rules";
import type {
  AmbassadorAttribution,
  AmbassadorEnrollment,
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

type HubUserPublicIdentity = {
  _id?: unknown;
  walletAddress?: unknown;
  username?: unknown;
};

type HubUserWalletIdentity = {
  userId?: unknown;
  normalizedAddress?: unknown;
};

const PUBLIC_NAME_LOOKUP_TIMEOUT_MS = 1_500;

function publicUsername(row: HubUserPublicIdentity | null, walletNormalized: string) {
  const username = typeof row?.username === "string" ? row.username.trim() : "";
  if (!username || username.toLowerCase() === walletNormalized.toLowerCase()) return null;
  return username;
}

function duplicateKey(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
  );
}

async function findMongoAmbassadorOverride(
  db: Db,
  referredWalletNormalized: string,
  effectiveAt: Date,
  session?: ClientSession,
) {
  const { resolveMongoAmbassadorOverride } = await import("./admin");
  return resolveMongoAmbassadorOverride(
    db,
    referredWalletNormalized,
    effectiveAt,
    session,
  );
}

function lockedPresaleAmbassador(
  row: PresaleParticipant | null
): LockedPresaleAmbassador | null {
  if (!row?.lockedSponsorWalletAddress) return null;
  const referredWalletNormalized = validAmbassadorWallet(
    row.normalizedWalletAddress,
    "presale.normalizedWalletAddress"
  );
  const ambassadorWalletNormalized = validAmbassadorWallet(
    row.lockedSponsorWalletAddress,
    "presale.lockedSponsorWalletAddress"
  );
  const lockedAt =
    row.sponsorLockedAt instanceof Date &&
    !Number.isNaN(row.sponsorLockedAt.getTime())
      ? row.sponsorLockedAt
      : row.firstPurchaseAt instanceof Date &&
        !Number.isNaN(row.firstPurchaseAt.getTime())
      ? row.firstPurchaseAt
      : null;
  if (!lockedAt) {
    throw new DomainConflictError(
      `El sponsor bloqueado de preventa no tiene fecha canonica para ${referredWalletNormalized}.`
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
  session?: ClientSession
): AmbassadorAttributionRepository {
  const options = session ? { session } : {};
  const attributions = db.collection<AmbassadorAttribution>(
    "ambassador_attributions"
  );
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
    async findAttribution(referredWalletNormalized, effectiveAt = new Date()) {
      const row = await attributions.findOne(
        { referredWalletNormalized },
        options
      );
      const base = row ? assertAmbassadorAttribution(row) : null;
      const override = await findMongoAmbassadorOverride(
        db,
        referredWalletNormalized,
        effectiveAt,
        session,
      );
      return override ?? base;
    },
    async hasPresaleParticipation(referredWalletNormalized) {
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
        }
      );
      if (
        row?.firstPurchaseAt instanceof Date &&
        !Number.isNaN(row.firstPurchaseAt.getTime())
      ) {
        return true;
      }
      return lockedPresaleAmbassador(row) !== null;
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
        }
      );
      return lockedPresaleAmbassador(row);
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
  materializedAt = new Date()
) {
  const normalized = [
    ...new Set(wallets.map((wallet) => validAmbassadorWallet(wallet))),
  ].sort();
  const resolved = new Map<string, AmbassadorAttribution | null>();
  if (normalized.length === 0) return resolved;
  const options = session ? { session } : {};
  const attributions = db.collection<AmbassadorAttribution>(
    "ambassador_attributions"
  );
  const [existingRows, presaleRows] = await Promise.all([
    attributions
      .find(
        {
          referredWalletNormalized: { $in: normalized },
          acceptedAt: { $lte: effectiveAt },
        },
        options
      )
      .toArray(),
    db
      .collection<PresaleParticipant>("presale_participants")
      .find(
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
        }
      )
      .toArray(),
  ]);
  const overrides = await Promise.all(normalized.map(async (wallet) => [
    wallet,
    await findMongoAmbassadorOverride(db, wallet, effectiveAt, session),
  ] as const));
  const overrideByWallet = new Map(overrides);
  const existing = new Map(
    existingRows.map((row) => [
      row.referredWalletNormalized,
      assertAmbassadorAttribution(row),
    ])
  );
  const locked = new Map(
    presaleRows.flatMap((row) => {
      const value = lockedPresaleAmbassador(row);
      if (!value)
        throw new DomainConflictError(
          "El sponsor de preventa no pudo normalizarse."
        );
      return value.lockedAt.getTime() <= effectiveAt.getTime()
        ? [[value.referredWalletNormalized, value] as const]
        : [];
    })
  );
  const missingPresale = [...locked.values()]
    .filter((value) => !existing.has(value.referredWalletNormalized))
    .map((value) =>
      buildAmbassadorAttribution({
        referredWallet: value.referredWalletNormalized,
        ambassadorWallet: value.ambassadorWalletNormalized,
        source: "presale_locked",
        sourceReferenceHash: value.sourceReferenceHash,
        acceptedAt: value.lockedAt,
        now: materializedAt,
      })
    );
  if (missingPresale.length > 0) {
    await attributions.bulkWrite(
      missingPresale.map((attribution) => ({
        updateOne: {
          filter: { _id: attribution._id },
          update: { $setOnInsert: attribution },
          upsert: true,
        },
      })),
      { ...options, ordered: false }
    );
    const insertedOrRaced = await attributions
      .find(
        {
          referredWalletNormalized: {
            $in: missingPresale.map((row) => row.referredWalletNormalized),
          },
          acceptedAt: { $lte: effectiveAt },
        },
        options
      )
      .toArray();
    for (const row of insertedOrRaced) {
      existing.set(
        row.referredWalletNormalized,
        assertAmbassadorAttribution(row)
      );
    }
  }
  for (const wallet of normalized) {
    const override = overrideByWallet.get(wallet) ?? null;
    const attribution = override ?? existing.get(wallet) ?? null;
    const presaleAttribution = locked.get(wallet);
    if (
      !override &&
      presaleAttribution &&
      attribution?.ambassadorWalletNormalized !==
        presaleAttribution.ambassadorWalletNormalized
    ) {
      throw new DomainConflictError(
        `La atribucion ambassador contradice el sponsor de preventa para ${wallet}.`
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
  materializedAt = new Date()
) {
  const walletNormalized = validAmbassadorWallet(wallet);
  return (
    (
      await resolveMongoAmbassadorAttributionsForWallets(
        db,
        [walletNormalized],
        effectiveAt,
        session,
        materializedAt
      )
    ).get(walletNormalized) ?? null
  );
}

export async function getOrCreateMongoAmbassadorProfile(
  db: Db,
  wallet: string,
  now = new Date(),
  session?: ClientSession
) {
  const walletNormalized = validAmbassadorWallet(wallet);
  const enrollment = await getMongoAmbassadorEnrollment(db, walletNormalized, new Date(), session);
  if (!enrollment.canInvite) return null;
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
      { ...options, upsert: true }
    );
  } catch (error) {
    if (!duplicateKey(error)) throw error;
  }
  const stored = await collection.findOne({ _id: profile._id }, options);
  if (
    !stored ||
    stored.walletNormalized !== walletNormalized ||
    stored.invitationCode !== invitationCode
  ) {
    throw new DomainConflictError(
      "El codigo de invitacion entra en conflicto con otro embajador."
    );
  }
  return stored;
}

export async function findMongoAmbassadorByInvitationCode(
  db: Db,
  code: string,
  session?: ClientSession
) {
  const invitationCode = assertAmbassadorInvitationCode(code);
  const row = await db
    .collection<AmbassadorProfile>("ambassador_profiles")
    .findOne({ invitationCode }, session ? { session } : {});
  if (!row) return null;
  const walletNormalized = validAmbassadorWallet(row.walletNormalized);
  if (row.invitationCode !== ambassadorInvitationCode(walletNormalized)) {
    throw new DomainConflictError("El codigo de invitacion no coincide con su embajador.");
  }
  const enrollment = await getMongoAmbassadorEnrollment(db, walletNormalized, new Date(), session);
  if (!enrollment.canInvite) {
    // El perfil puede conservarse después de perder Cukie Master. Es una
    // invalidación cierta para el enlace; una lectura desconocida es temporal
    // y debe seguir siendo reintentable.
    if (enrollment.isCukieMaster === null) {
      throw new TypeError(AMBASSADOR_ELIGIBILITY_UNAVAILABLE);
    }
    return null;
  }
  return {
    ...row,
    walletNormalized,
    invitationCode: assertAmbassadorInvitationCode(row.invitationCode),
  };
}

/**
 * Lee solo la identidad pública asociada a la wallet exacta del patrocinador.
 * El perfil de competición y User.username son fuentes distintas: no se
 * resuelve un alias de otra campaña ni se elige una wallet arbitraria.
 *
 * El nombre es opcional para el flujo de embajadores. Si la base de usuarios
 * no está disponible o no existe una identidad pública, el llamador conserva
 * la wallet abreviada como fallback honesto.
 */
export async function findMongoAmbassadorPublicName(wallet: string) {
  const walletNormalized = validAmbassadorWallet(wallet);
  if (!process.env.DATABASE_URL?.trim()) return null;

  const read = async () => {
    const { getHubDb } = await import("@/lib/mongodb-hub");
    const db = await getHubDb();
    const users = db.collection<HubUserPublicIdentity>("User");
    const projection = { projection: { _id: 1, walletAddress: 1, username: 1 } };
    const primary = await users.findOne({ walletAddress: walletNormalized }, projection);
    const primaryName = publicUsername(primary, walletNormalized);
    if (primary) return primaryName;

    // Una cuenta puede conservar la wallet como UserWallet tras importar otra
    // wallet. El vínculo por userId sigue siendo exacto y no expone el resto
    // del perfil.
    const linkedWallet = await db
      .collection<HubUserWalletIdentity>("UserWallet")
      .findOne(
        { normalizedAddress: walletNormalized },
        { projection: { _id: 0, userId: 1, normalizedAddress: 1 } },
      );
    if (linkedWallet?.userId === undefined || linkedWallet.userId === null) return null;

    return publicUsername(
      await users.findOne(
        { _id: linkedWallet.userId },
        projection,
      ),
      walletNormalized,
    );
  };
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), PUBLIC_NAME_LOOKUP_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // La identidad es una mejora de presentación; nunca debe convertir una
    // invitación válida o una relación confirmada en un error de servicio.
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function getMongoAmbassadorEnrollment(
  db: Db,
  wallet: string,
  now = new Date(),
  session?: ClientSession
): Promise<AmbassadorEnrollment> {
  const walletNormalized = validAmbassadorWallet(wallet);
  const repository = createMongoAmbassadorAttributionRepository(db, session);
  const [isPresaleParticipant, attribution, locked] = await Promise.all([
    repository.hasPresaleParticipation(walletNormalized),
    repository.findAttribution(walletNormalized, now),
    repository.findLockedPresaleAmbassador(walletNormalized),
  ]);
  const { getAmbassadorEligibility } = await import("./eligibility");
  const eligibility = await getAmbassadorEligibility(walletNormalized, now);
  const isDefaultAmbassador =
    Boolean(process.env.AMBASSADOR_DEFAULT_WALLET_ADDRESS?.trim()) &&
    walletNormalized === getDefaultAmbassadorWallet();
  const hasConfirmedSponsor = isDefaultAmbassador || attribution !== null || locked !== null;
  const canInvite = isDefaultAmbassador || (
    eligibility.isCukieMaster === true && hasConfirmedSponsor
  );
  return {
    isPresaleParticipant,
    isCukieMaster: isDefaultAmbassador ? null : eligibility.isCukieMaster,
    hasConfirmedSponsor,
    canChooseSponsor: !isPresaleParticipant && !hasConfirmedSponsor && !isDefaultAmbassador,
    canInvite,
    eligibilityReason: isDefaultAmbassador ? "CUKIE_WORLD_ROOT_EXEMPT" : eligibility.reason,
  };
}

export async function materializeLockedPresaleAmbassadorAttributions(
  db: Db,
  input: {
    ambassadorWallet?: string;
    referredWallet?: string;
    now?: Date;
    session?: ClientSession;
    dryRun?: boolean;
  } = {}
) {
  const now = input.now ?? new Date();
  const ambassadorWalletNormalized = input.ambassadorWallet
    ? validAmbassadorWallet(input.ambassadorWallet)
    : null;
  const options = input.session ? { session: input.session } : {};
  const defaultWallet = process.env.AMBASSADOR_DEFAULT_WALLET_ADDRESS?.trim()
    ? getDefaultAmbassadorWallet()
    : null;
  const presaleRows = await db
    .collection<PresaleParticipant>("presale_participants")
    .find(input.referredWallet
      ? { normalizedWalletAddress: validAmbassadorWallet(input.referredWallet) }
      : {}, {
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
  const candidates = presaleRows.flatMap((row) => {
    const locked = row.lockedSponsorWalletAddress
      ? lockedPresaleAmbassador(row)
      : null;
    if (locked) {
      if (ambassadorWalletNormalized && locked.ambassadorWalletNormalized !== ambassadorWalletNormalized) {
        return [];
      }
      return [buildAmbassadorAttribution({
        referredWallet: locked.referredWalletNormalized,
        ambassadorWallet: locked.ambassadorWalletNormalized,
        source: "presale_locked",
        sourceReferenceHash: locked.sourceReferenceHash,
        acceptedAt: locked.lockedAt,
        now,
      })];
    }
    if (!defaultWallet || (ambassadorWalletNormalized && defaultWallet !== ambassadorWalletNormalized)) {
      return [];
    }
    // La autoatribucion CW es una escritura del grafo y solo se ejecuta en la
    // transaccion de materializacion; el dashboard no abre una transaccion.
    if (!input.session && !input.dryRun) return [];
    if (!(row.firstPurchaseAt instanceof Date) || Number.isNaN(row.firstPurchaseAt.getTime())) {
      return [];
    }
    const referredWalletNormalized = validAmbassadorWallet(
      row.normalizedWalletAddress,
      "presale.normalizedWalletAddress",
    );
    if (referredWalletNormalized === defaultWallet) return [];
    return [buildAmbassadorAttribution({
      referredWallet: referredWalletNormalized,
      ambassadorWallet: defaultWallet,
      source: "presale_default",
      sourceReferenceHash: stableAmbassadorHash({
        collection: "presale_participants",
        kind: "presale-default-ambassador-v1",
        referredWalletNormalized,
        firstPurchaseAt: row.firstPurchaseAt,
      }),
      // El fallback CW empieza a generar comisiones desde la migracion; no
      // reabre ni recalcula el sistema historico de referidos de preventa.
      acceptedAt: now,
      now,
    })];
  });
  if (candidates.length === 0) return { scanned: 0, materialized: 0 };
  const attributions = db.collection<AmbassadorAttribution>(
    "ambassador_attributions"
  );
  const existing = await attributions.find({
    referredWalletNormalized: {
      $in: candidates.map((row) => row.referredWalletNormalized),
    },
  }, options).toArray();
  const existingWallets = new Set(existing.map((row) => row.referredWalletNormalized));
  const defaultCandidates = candidates.filter((candidate) => candidate.source === "presale_default");
  const hasDefaultCandidates = defaultCandidates.length > 0;
  const { resolveMongoAmbassadorOverride } = await import("./admin");
  const overrides = await Promise.all(defaultCandidates.map(async (candidate) => ({
    wallet: candidate.referredWalletNormalized,
    attribution: await resolveMongoAmbassadorOverride(
      db,
      candidate.referredWalletNormalized,
      now,
      input.session,
    ),
  })));
  const overriddenWallets = new Set(
    overrides.filter((entry) => entry.attribution !== null).map((entry) => entry.wallet),
  );
  const preservedExisting = defaultCandidates.filter((candidate) =>
    existingWallets.has(candidate.referredWalletNormalized) ||
    overriddenWallets.has(candidate.referredWalletNormalized),
  ).length;
  const materializationCandidates = candidates.filter((candidate) =>
    candidate.source !== "presale_default" || (
      !existingWallets.has(candidate.referredWalletNormalized) &&
      !overriddenWallets.has(candidate.referredWalletNormalized)
    ),
  );
  const defaultMissing = materializationCandidates.filter(
    (candidate) => candidate.source === "presale_default",
  ).length;
  if (defaultMissing > 0 && input.session) {
    const graphRepository = createMongoAmbassadorAttributionRepository(db, input.session);
    await graphRepository.acquireGraphWriteFence(now);
    const { assertAttributionDoesNotCreateCycle } = await import("./service");
    for (const candidate of materializationCandidates.filter((row) => row.source === "presale_default")) {
      await assertAttributionDoesNotCreateCycle(
        graphRepository,
        candidate.referredWalletNormalized,
        candidate.ambassadorWalletNormalized,
        now,
      );
    }
  }
  if (input.dryRun) {
    if (!hasDefaultCandidates) return { scanned: candidates.length, materialized: 0 };
    return {
      scanned: candidates.length,
      preservedExisting,
      defaultMissing,
      materialized: defaultMissing,
    };
  }
  if (materializationCandidates.length === 0) {
    if (!hasDefaultCandidates) return { scanned: candidates.length, materialized: 0 };
    return { scanned: candidates.length, preservedExisting, defaultMissing, materialized: 0 };
  }
  const result = await attributions.bulkWrite(
    materializationCandidates.map((attribution) => ({
      updateOne: {
        filter: {
          referredWalletNormalized: attribution.referredWalletNormalized,
        },
        update: { $setOnInsert: attribution },
        upsert: true,
      },
    })),
    { ...options, ordered: false }
  );
  const stored = await attributions
    .find(
      {
        referredWalletNormalized: {
          $in: materializationCandidates.map((row) => row.referredWalletNormalized),
        },
      },
      options
    )
    .toArray();
  const expectedByWallet = new Map(
    materializationCandidates.map((row) => [row.referredWalletNormalized, row])
  );
  for (const row of stored) {
    const expected = expectedByWallet.get(row.referredWalletNormalized);
    if (
      !expected ||
      row.ambassadorWalletNormalized !== expected.ambassadorWalletNormalized
    ) {
      throw new DomainConflictError(
        `La atribucion existente contradice la preventa para ${row.referredWalletNormalized}.`
      );
    }
  }
  if (!hasDefaultCandidates) return { scanned: candidates.length, materialized: result.upsertedCount };
  return { scanned: candidates.length, preservedExisting, defaultMissing, materialized: result.upsertedCount };
}
