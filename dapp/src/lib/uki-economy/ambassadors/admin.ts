import type { ClientSession, Db } from "mongodb";

import { DomainConflictError, DomainValidationError } from "../errors";
import {
  AMBASSADOR_ATTRIBUTION_POLICIES,
  AMBASSADOR_ATTRIBUTION_POLICY,
  type AmbassadorAttribution,
} from "./types";
import {
  createMongoAmbassadorAttributionRepository,
  resolveMongoAmbassadorAttribution,
} from "./repository";
import {
  getDefaultAmbassadorWallet,
  stableAmbassadorHash,
  validAmbassadorWallet,
} from "./rules";
import { assertAmbassadorAttribution, buildAmbassadorAttribution } from "./rules";
import { assertAttributionDoesNotCreateCycle } from "./service";

/**
 * Eventos append-only que sustituyen la atribución efectiva a partir de
 * `effectiveAt`. La fila canónica de `ambassador_attributions` se conserva
 * para que los cierres anteriores sigan siendo reproducibles.
 */
export const AMBASSADOR_OVERRIDE_COLLECTION = "ambassador_attribution_overrides";

export async function ensureMongoAmbassadorOverrideIndexes(db: Db) {
  const collection = overrideCollection(db);
  await Promise.all([
    collection.createIndex({ idempotencyKey: 1 }, { unique: true, name: "ambassador_override_idempotency_unique" }),
    collection.createIndex({ referredWalletNormalized: 1, effectiveAt: -1, createdAt: -1 }, { name: "ambassador_override_effective" }),
  ]);
}

type AmbassadorOverrideRecord = {
  _id: string;
  overrideId: string;
  referredWalletNormalized: string;
  ambassadorWalletNormalized: string;
  expectedCurrentSponsorNormalized: string | null;
  effectiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
  reason: string;
  idempotencyKey: string;
  actor: string;
  keyId: string;
  source: "admin_override";
  sourceReferenceHash: string;
  payloadHash: string;
  evidenceHash: string;
  policyVersion: keyof typeof AMBASSADOR_ATTRIBUTION_POLICIES;
  commissionBpsSnapshot: number;
  levelsSnapshot: number;
};

type AdminAttribution = Omit<AmbassadorAttribution, "source"> & {
  source: "admin_override";
};

export type ChangeCanonicalAmbassadorSponsorInput = {
  referredWallet: string;
  sponsorWallet: string;
  /** Must be present. null means that no current relation is expected. */
  expectedCurrentSponsor: string | null;
  reason: string;
  idempotencyKey: string;
  /** Derived from the authenticated internal HMAC key, never from the body. */
  actor: string;
  keyId: string;
  /** Server clock injection for tests; HTTP callers never provide this. */
  now?: Date;
  session?: ClientSession;
};

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new DomainValidationError(`${label} es obligatorio.`);
  }
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new DomainValidationError(`${label} es obligatorio y no puede superar ${maxLength} caracteres.`);
  }
  return normalized;
}

function assertValidInput(input: ChangeCanonicalAmbassadorSponsorInput) {
  if (!Object.prototype.hasOwnProperty.call(input, "expectedCurrentSponsor")) {
    throw new DomainValidationError("expectedCurrentSponsor debe incluirse explícitamente; usa null si no existe relación.");
  }
  const referredWalletNormalized = validAmbassadorWallet(input.referredWallet, "referredWallet");
  const sponsorWalletNormalized = validAmbassadorWallet(input.sponsorWallet, "sponsorWallet");
  const expectedCurrentSponsorNormalized = input.expectedCurrentSponsor === null
    ? null
    : validAmbassadorWallet(input.expectedCurrentSponsor, "expectedCurrentSponsor");
  if (referredWalletNormalized === sponsorWalletNormalized) {
    throw new DomainConflictError("Una wallet no puede ser su propio embajador.", { reason: "AMBASSADOR_CYCLE" });
  }
  const reason = requiredText(input.reason, "reason", 2_000);
  const idempotencyKey = requiredText(input.idempotencyKey, "idempotencyKey", 256);
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new DomainValidationError("idempotencyKey tiene un formato inválido.");
  }
  const actor = requiredText(input.actor, "actor", 128);
  const keyId = requiredText(input.keyId, "keyId", 64);
  if (!ACTOR.test(actor) || !ACTOR.test(keyId)) {
    throw new DomainValidationError("actor/keyId tienen un formato inválido.");
  }
  const now = input.now ?? new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new DomainValidationError("now debe ser una fecha válida.");
  }
  return {
    referredWalletNormalized,
    sponsorWalletNormalized,
    expectedCurrentSponsorNormalized,
    reason,
    idempotencyKey,
    actor,
    keyId,
    session: input.session,
    now: new Date(now.getTime()),
  };
}

function overrideToAttribution(row: AmbassadorOverrideRecord): AdminAttribution {
  if (!row || typeof row !== "object") {
    throw new DomainConflictError("El override de ambassador no tiene una forma válida.");
  }
  const policy = AMBASSADOR_ATTRIBUTION_POLICIES[row.policyVersion];
  if (!policy || row.source !== "admin_override" || row.policyVersion !== policy.version) {
    throw new DomainConflictError("El override de ambassador tiene una política inválida.");
  }
  const effectiveAt = row.effectiveAt instanceof Date && !Number.isNaN(row.effectiveAt.getTime())
    ? new Date(row.effectiveAt.getTime())
    : null;
  const createdAt = row.createdAt instanceof Date && !Number.isNaN(row.createdAt.getTime())
    ? new Date(row.createdAt.getTime())
    : null;
  const updatedAt = row.updatedAt instanceof Date && !Number.isNaN(row.updatedAt.getTime())
    ? new Date(row.updatedAt.getTime())
    : null;
  if (!effectiveAt || !createdAt || !updatedAt || createdAt.getTime() < effectiveAt.getTime() || updatedAt.getTime() !== createdAt.getTime()) {
    throw new DomainConflictError("El override de ambassador tiene fechas inválidas.");
  }
  if (typeof row.overrideId !== "string" || row._id !== row.overrideId || row.overrideId !== `ambassador-override:${row.idempotencyKey}`) {
    throw new DomainConflictError("El override de ambassador tiene un identificador inválido.");
  }
  const expectedCurrentSponsorNormalized = row.expectedCurrentSponsorNormalized === null
    ? null
    : validAmbassadorWallet(row.expectedCurrentSponsorNormalized, "override.expectedCurrentSponsor");
  const referredWalletNormalized = validAmbassadorWallet(row.referredWalletNormalized, "override.referredWallet");
  const ambassadorWalletNormalized = validAmbassadorWallet(row.ambassadorWalletNormalized, "override.ambassadorWallet");
  const reason = requiredText(row.reason, "override.reason", 2_000);
  const idempotencyKey = requiredText(row.idempotencyKey, "override.idempotencyKey", 256);
  if (!IDEMPOTENCY_KEY.test(idempotencyKey) || !ACTOR.test(row.actor) || !ACTOR.test(row.keyId)) {
    throw new DomainConflictError("El override de ambassador tiene campos de auditoría inválidos.");
  }
  if (typeof row.sourceReferenceHash !== "string" || !/^[0-9a-f]{64}$/.test(row.sourceReferenceHash)) {
    throw new DomainConflictError("El override de ambassador tiene una referencia de evidencia inválida.");
  }
  const expectedPayloadHash = stableAmbassadorHash({
    kind: "ambassador-admin-override-v1",
    referredWalletNormalized,
    sponsorWalletNormalized: ambassadorWalletNormalized,
    expectedCurrentSponsorNormalized,
    reason,
    idempotencyKey,
  });
  if (row.payloadHash !== expectedPayloadHash) {
    throw new DomainConflictError("El payload del override de ambassador no coincide con su evidencia.");
  }
  const attribution = buildAmbassadorAttribution({
    referredWallet: referredWalletNormalized,
    ambassadorWallet: ambassadorWalletNormalized,
    source: "admin_override",
    sourceReferenceHash: row.sourceReferenceHash,
    policyVersion: policy.version,
    acceptedAt: effectiveAt,
    now: createdAt,
  });
  if (row.commissionBpsSnapshot !== policy.commissionBps || row.levelsSnapshot !== policy.levels || row.evidenceHash !== attribution.evidenceHash) {
    throw new DomainConflictError("Los snapshots o la evidencia del override no coinciden con la política.");
  }
  assertAmbassadorAttribution(attribution);
  return { ...attribution, source: "admin_override" };
}

function payloadHash(input: ReturnType<typeof assertValidInput>) {
  return stableAmbassadorHash({
    kind: "ambassador-admin-override-v1",
    referredWalletNormalized: input.referredWalletNormalized,
    sponsorWalletNormalized: input.sponsorWalletNormalized,
    expectedCurrentSponsorNormalized: input.expectedCurrentSponsorNormalized,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
  });
}

function overrideCollection(db: Db) {
  return db.collection<AmbassadorOverrideRecord>(AMBASSADOR_OVERRIDE_COLLECTION);
}

async function findOverrideByIdempotency(db: Db, idempotencyKey: string, session?: ClientSession) {
  return overrideCollection(db).findOne({ idempotencyKey }, session ? { session } : undefined);
}

/**
 * Resolves only administrative history. A null result means no override was
 * found; callers should then resolve the immutable base/presale attribution.
 */
export async function resolveMongoAmbassadorOverride(
  db: Db,
  wallet: string,
  effectiveAt: Date,
  session?: ClientSession,
): Promise<AmbassadorAttribution | null> {
  const walletNormalized = validAmbassadorWallet(wallet);
  if (!(effectiveAt instanceof Date) || Number.isNaN(effectiveAt.getTime())) {
    throw new DomainValidationError("effectiveAt debe ser una fecha válida.");
  }
  const collection = overrideCollection(db);
  // Some read-only adapters do not expose the optional override collection.
  // They represent "no override"; the canonical reader remains this function.
  if (typeof collection.findOne !== "function") return null;
  const row = await collection.findOne(
    {
      referredWalletNormalized: walletNormalized,
      effectiveAt: { $lte: effectiveAt },
    },
    {
      ...(session ? { session } : {}),
      sort: { effectiveAt: -1, createdAt: -1, _id: -1 },
    },
  );
  return row ? overrideToAttribution(row) : null;
}

async function currentAttribution(
  db: Db,
  wallet: string,
  effectiveAt: Date,
  session?: ClientSession,
) {
  return (await resolveMongoAmbassadorOverride(db, wallet, effectiveAt, session))
    ?? (await resolveMongoAmbassadorAttribution(db, wallet, effectiveAt, session));
}

async function assertGraphWithoutOverride(
  db: Db,
  session: ClientSession | undefined,
  referredWalletNormalized: string,
  sponsorWalletNormalized: string,
  now: Date,
) {
  const baseRepository = createMongoAmbassadorAttributionRepository(db, session);
  const repository = {
    ...baseRepository,
    findAttribution: (wallet: string) => currentAttribution(db, wallet, now, session),
  };
  await assertAttributionDoesNotCreateCycle(
    repository,
    referredWalletNormalized,
    sponsorWalletNormalized,
    now,
  );
}

/**
 * Creates an append-only administrative correction. `effectiveAt` is always
 * the server clock (`now` here only exists as a test seam); no backdating is
 * accepted. The base attribution is never updated or deleted.
 */
export async function changeCanonicalAmbassadorSponsor(
  db: Db,
  input: ChangeCanonicalAmbassadorSponsorInput,
) {
  const normalized = assertValidInput(input);
  const collection = overrideCollection(db);
  const existing = await findOverrideByIdempotency(db, normalized.idempotencyKey, normalized.session);
  const hash = payloadHash(normalized);
  if (existing) {
    if (existing.payloadHash !== hash) {
      throw new DomainConflictError("La idempotencyKey ya se usó con otro cambio de sponsor.", { reason: "IDEMPOTENCY_KEY_CONFLICT" });
    }
    return { attribution: overrideToAttribution(existing), changed: false, overrideId: existing.overrideId };
  }

  const repository = createMongoAmbassadorAttributionRepository(db, normalized.session);
  await repository.acquireGraphWriteFence(normalized.now);
  const current = await currentAttribution(
    db,
    normalized.referredWalletNormalized,
    normalized.now,
    normalized.session,
  );
  const currentSponsor = current?.ambassadorWalletNormalized ?? null;
  if (currentSponsor !== normalized.expectedCurrentSponsorNormalized) {
    throw new DomainConflictError("El sponsor actual no coincide con expectedCurrentSponsor.", {
      reason: "AMBASSADOR_EXPECTED_SPONSOR_CONFLICT",
      expectedCurrentSponsor: normalized.expectedCurrentSponsorNormalized,
      currentSponsor,
    });
  }
  const defaultWallet = process.env.AMBASSADOR_DEFAULT_WALLET_ADDRESS?.trim()
    ? getDefaultAmbassadorWallet()
    : null;
  if (defaultWallet && normalized.referredWalletNormalized === defaultWallet) {
    throw new DomainConflictError("La raíz institucional no puede recibir un sponsor.", { reason: "AMBASSADOR_ROOT_PROTECTED" });
  }
  await assertGraphWithoutOverride(
    db,
    normalized.session,
    normalized.referredWalletNormalized,
    normalized.sponsorWalletNormalized,
    normalized.now,
  );

  const policy = AMBASSADOR_ATTRIBUTION_POLICY;
  const overrideId = `ambassador-override:${normalized.idempotencyKey}`;
  const sourceReferenceHash = stableAmbassadorHash({
    kind: "ambassador-admin-override-v1",
    overrideId,
    actor: normalized.actor,
    keyId: normalized.keyId,
    reason: normalized.reason,
  });
  const attribution = buildAmbassadorAttribution({
    referredWallet: normalized.referredWalletNormalized,
    ambassadorWallet: normalized.sponsorWalletNormalized,
    source: "admin_override",
    sourceReferenceHash,
    policyVersion: policy.version,
    acceptedAt: normalized.now,
    now: normalized.now,
  });
  const row: AmbassadorOverrideRecord = {
    _id: overrideId,
    overrideId,
    referredWalletNormalized: normalized.referredWalletNormalized,
    ambassadorWalletNormalized: normalized.sponsorWalletNormalized,
    expectedCurrentSponsorNormalized: normalized.expectedCurrentSponsorNormalized,
    effectiveAt: normalized.now,
    createdAt: normalized.now,
    updatedAt: normalized.now,
    reason: normalized.reason,
    idempotencyKey: normalized.idempotencyKey,
    actor: normalized.actor,
    keyId: normalized.keyId,
    source: "admin_override",
    sourceReferenceHash,
    payloadHash: hash,
    evidenceHash: attribution.evidenceHash,
    policyVersion: policy.version,
    commissionBpsSnapshot: policy.commissionBps,
    levelsSnapshot: policy.levels,
  };
  const latest = await collection.findOne(
    { referredWalletNormalized: normalized.referredWalletNormalized },
    {
      ...(normalized.session ? { session: normalized.session } : {}),
      sort: { effectiveAt: -1, createdAt: -1, _id: -1 },
    },
  );
  if (latest && latest.effectiveAt.getTime() >= normalized.now.getTime()) {
    throw new DomainConflictError("El reloj del servidor no avanzó para registrar otro override.", { reason: "AMBASSADOR_OVERRIDE_TIME_NOT_ADVANCED" });
  }
  try {
    await collection.insertOne(row, normalized.session ? { session: normalized.session } : undefined);
    return { attribution: overrideToAttribution(row), changed: true, overrideId };
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || Number(error.code) !== 11000) throw error;
    const raced = await findOverrideByIdempotency(db, normalized.idempotencyKey, normalized.session);
    if (!raced || raced.payloadHash !== hash) {
      throw new DomainConflictError("El cambio de sponsor concurrió con otro payload.", { reason: "IDEMPOTENCY_KEY_CONFLICT" });
    }
    return { attribution: overrideToAttribution(raced), changed: false, overrideId: raced.overrideId };
  }
}
