import 'server-only';

import { createHash, randomUUID } from 'node:crypto';

import { DomainValidationError } from '@/lib/uki-economy/errors';
import { normalizeWalletAddress } from '@/lib/wallet-address';

export const NFT_ASSET_LOCK_REASONS = [
  'soft_stake',
  'pool_deposit',
  'game_assignment',
  'ops_hold',
  'reconciliation',
] as const;

export const SYSTEM_NFT_LOCK_IDEMPOTENCY_PREFIX = 'system:nft-lock:';

export type NftAssetLockReason = (typeof NFT_ASSET_LOCK_REASONS)[number];
export type NftAssetLockStatus = 'active' | 'released' | 'expired' | 'invalidated';
export type NftAssetLockOperation =
  | 'acquire'
  | 'transition'
  | 'release'
  | 'expire'
  | 'invalidate_ownership'
  | 'invalidate_integrity';

export type NftAssetLockDocument = {
  _id: string;
  lockId: string;
  assetId: string;
  ownerNormalized: string;
  reason: NftAssetLockReason;
  status: NftAssetLockStatus;
  fencingToken: number;
  createdBy: string;
  idempotencyKey: string;
  payloadHash: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  sessionId?: string;
  /**
   * El lock era un soft-stake antes de pasar temporalmente a game_assignment.
   * Mantiene el entitlement Cukie Master, pero no convierte el NFT en disponible
   * ni en prestable mientras la partida conserva el lock.
   */
  retainsSoftStakeEntitlement?: true;
  releaseReason?: string;
};

export type NftAssetLockEventDocument = {
  _id: string;
  eventId: string;
  idempotencyKey: string;
  operation: NftAssetLockOperation;
  payloadHash: string;
  lockId: string;
  assetId: string;
  fromStatus: NftAssetLockStatus | null;
  toStatus: NftAssetLockStatus;
  fromReason: NftAssetLockReason | null;
  toReason: NftAssetLockReason;
  fencingToken: number;
  actor: string;
  reason: string;
  timestamp: Date;
  createdAt: Date;
  resultingLock: NftAssetLockDocument;
  outcome?: 'owner_matches' | 'invalidated';
};

export type NftAssetLockOwnerInput = {
  owner?: string;
  ownerWallet?: string;
  ownerNormalized?: string;
  wallet?: string;
};

export type AcquireNftAssetLockInput = NftAssetLockOwnerInput & {
  assetId: string;
  reason: NftAssetLockReason;
  createdBy: string;
  idempotencyKey: string;
  expiresAt?: Date;
  sessionId?: string;
  now?: Date;
};

export type TransitionNftAssetLockInput = {
  lockId: string;
  expectedFencingToken: number;
  reason: NftAssetLockReason;
  actor: string;
  idempotencyKey: string;
  transitionReason?: string;
  expiresAt?: Date | null;
  sessionId?: string | null;
  retainsSoftStakeEntitlement?: boolean;
  now?: Date;
};

export type ReleaseNftAssetLockInput = {
  lockId: string;
  expectedFencingToken: number;
  actor: string;
  releaseReason: string;
  idempotencyKey: string;
  now?: Date;
};

export type InvalidateNftAssetLockOwnershipInput = {
  lockId: string;
  expectedFencingToken: number;
  currentOwner: string;
  actor: string;
  reason: string;
  idempotencyKey: string;
  now?: Date;
};

export type InvalidateNftAssetLockOwnershipResult = {
  outcome: 'owner_matches' | 'invalidated';
  lock: NftAssetLockDocument;
};

export type InvalidateNftAssetLockIntegrityInput = {
  lockId: string;
  expectedFencingToken: number;
  actor: string;
  reason: string;
  idempotencyKey: string;
  now?: Date;
};

export type ExpireNftAssetLocksInput = {
  now?: Date;
  limit?: number;
  actor?: string;
  excludeReasons?: NftAssetLockReason[];
};

export type ExpireNftAssetLocksResult = {
  scanned: number;
  expired: number;
  skipped: number;
};

export function requiredText(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainValidationError(`${label} no puede estar vacio.`);
  }

  return value.trim();
}

export function validNow(value?: Date) {
  const now = value ?? new Date();

  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new DomainValidationError('now debe ser una fecha valida.');
  }

  return new Date(now.getTime());
}

export function validFutureExpiry(value: Date, now: Date) {
  const expiry = validExpiryDate(value);

  if (expiry.getTime() <= now.getTime()) {
    throw new DomainValidationError('expiresAt debe estar en el futuro.');
  }

  return expiry;
}

export function validExpiryDate(value: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainValidationError('expiresAt debe ser una fecha valida.');
  }

  return new Date(value.getTime());
}

export function validFencingToken(value: number, label = 'expectedFencingToken') {
  if (!Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER) {
    throw new DomainValidationError(
      `${label} debe ser un entero seguro entre 1 y MAX_SAFE_INTEGER - 1.`,
    );
  }

  return value;
}

export function incrementFencingToken(value: number) {
  return validFencingToken(value, 'fencingToken') + 1;
}

export function validExternalIdempotencyKey(value: unknown) {
  const key = requiredText(value, 'idempotencyKey');

  if (key.startsWith(SYSTEM_NFT_LOCK_IDEMPOTENCY_PREFIX)) {
    throw new DomainValidationError(
      `idempotencyKey no puede usar el namespace reservado ${SYSTEM_NFT_LOCK_IDEMPOTENCY_PREFIX}.`,
    );
  }

  return key;
}

export function validLockLimit(value = 100) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000) {
    throw new DomainValidationError('limit debe ser un entero entre 1 y 1000.');
  }

  return value;
}

export function validLockReason(value: NftAssetLockReason) {
  if (!NFT_ASSET_LOCK_REASONS.includes(value)) {
    throw new DomainValidationError(`Reason de lock no permitido: ${String(value)}.`);
  }

  return value;
}

export function normalizeLockOwner(input: NftAssetLockOwnerInput) {
  const owner = requiredText(
    input.ownerNormalized ?? input.ownerWallet ?? input.owner ?? input.wallet,
    'owner',
  );
  const normalized = normalizeWalletAddress(owner);

  if (!normalized) {
    throw new DomainValidationError('owner no se pudo normalizar.');
  }

  return normalized;
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }

  return value;
}

export function buildNftLockPayloadHash(
  operation: NftAssetLockOperation,
  payload: Record<string, unknown>,
) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue({ operation, payload })))
    .digest('hex');
}

export const buildNftLockIdempotencyPayloadHash = buildNftLockPayloadHash;

export function cloneNftAssetLock(lock: NftAssetLockDocument): NftAssetLockDocument {
  return {
    ...lock,
    createdAt: new Date(lock.createdAt.getTime()),
    updatedAt: new Date(lock.updatedAt.getTime()),
    ...(lock.expiresAt ? { expiresAt: new Date(lock.expiresAt.getTime()) } : {}),
  };
}

export type NormalizedAcquireNftAssetLockInput = {
  assetId: string;
  ownerNormalized: string;
  reason: NftAssetLockReason;
  createdBy: string;
  idempotencyKey: string;
  expiresAt?: Date;
  sessionId?: string;
  now: Date;
  payloadHash: string;
};

export function normalizeAcquireNftAssetLockInput(
  input: AcquireNftAssetLockInput,
  options: { validateTemporal?: boolean } = {},
): NormalizedAcquireNftAssetLockInput {
  const nowCandidate = input.now ?? new Date();
  const assetId = requiredText(input.assetId, 'assetId');
  const ownerNormalized = normalizeLockOwner(input);
  const reason = validLockReason(input.reason);
  const createdBy = requiredText(input.createdBy, 'createdBy');
  const idempotencyKey = validExternalIdempotencyKey(input.idempotencyKey);
  const expiryCandidate = input.expiresAt ? validExpiryDate(input.expiresAt) : undefined;
  const sessionId = input.sessionId === undefined
    ? undefined
    : requiredText(input.sessionId, 'sessionId');
  const now = options.validateTemporal === false ? nowCandidate : validNow(nowCandidate);
  const expiresAt = expiryCandidate && options.validateTemporal !== false
    ? validFutureExpiry(expiryCandidate, now)
    : expiryCandidate;
  const payloadHash = buildNftLockPayloadHash('acquire', {
    assetId,
    ownerNormalized,
    reason,
    createdBy,
    idempotencyKey,
    expiresAt,
    sessionId,
  });

  return {
    assetId,
    ownerNormalized,
    reason,
    createdBy,
    idempotencyKey,
    expiresAt,
    sessionId,
    now,
    payloadHash,
  };
}

export function buildNftAssetLockDocument(
  input: AcquireNftAssetLockInput,
  lockId: string = randomUUID(),
) {
  const normalized = normalizeAcquireNftAssetLockInput(input);
  const normalizedLockId = requiredText(lockId, 'lockId');

  return {
    _id: normalizedLockId,
    lockId: normalizedLockId,
    assetId: normalized.assetId,
    ownerNormalized: normalized.ownerNormalized,
    reason: normalized.reason,
    status: 'active',
    fencingToken: 1,
    createdBy: normalized.createdBy,
    idempotencyKey: normalized.idempotencyKey,
    payloadHash: normalized.payloadHash,
    createdAt: normalized.now,
    updatedAt: normalized.now,
    ...(normalized.expiresAt ? { expiresAt: normalized.expiresAt } : {}),
    ...(normalized.sessionId ? { sessionId: normalized.sessionId } : {}),
  } satisfies NftAssetLockDocument;
}

export type BuildNftAssetLockEventInput = {
  operation: NftAssetLockOperation;
  idempotencyKey: string;
  payloadHash: string;
  previous: NftAssetLockDocument | null;
  resulting: NftAssetLockDocument;
  actor: string;
  reason: string;
  timestamp: Date;
  eventId?: string;
  outcome?: 'owner_matches' | 'invalidated';
};

export function buildNftAssetLockEvent(
  input: BuildNftAssetLockEventInput,
): NftAssetLockEventDocument {
  const eventId = requiredText(input.eventId ?? randomUUID(), 'eventId');

  return {
    _id: eventId,
    eventId,
    idempotencyKey: requiredText(input.idempotencyKey, 'idempotencyKey'),
    operation: input.operation,
    payloadHash: requiredText(input.payloadHash, 'payloadHash'),
    lockId: input.resulting.lockId,
    assetId: input.resulting.assetId,
    fromStatus: input.previous?.status ?? null,
    toStatus: input.resulting.status,
    fromReason: input.previous?.reason ?? null,
    toReason: input.resulting.reason,
    fencingToken: input.resulting.fencingToken,
    actor: requiredText(input.actor, 'actor'),
    reason: requiredText(input.reason, 'event reason'),
    timestamp: validNow(input.timestamp),
    createdAt: validNow(input.timestamp),
    resultingLock: cloneNftAssetLock(input.resulting),
    ...(input.outcome ? { outcome: input.outcome } : {}),
  };
}
