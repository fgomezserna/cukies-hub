import { createHash } from 'node:crypto';

import { normalizeWalletAddress } from '@/lib/wallet-address';

import { DomainValidationError } from '../errors';
import { economyCycleDurationMs, loadEconomyCycleCalendar } from '../cycle-calendar';
import type {
  CukiePoolAssignment,
  CukiePoolGeneration,
  CukiePoolPosition,
  CukiePoolRarity,
} from './types';

export const CUKIE_POOL_MATURITY_MS = 24 * 60 * 60 * 1000;
export const CUKIE_POOL_ASSIGNMENT_PAGE_SIZE = 100;
export const CUKIE_POOL_SYSTEM_IDEMPOTENCY_PREFIX = 'system:cukie-pool:';

export const CUKIE_POOL_GAMES_QUOTA = {
  original: {
    common: 2,
    uncommon: 4,
    rare: 6,
    epic: 8,
    legendary: 10,
    goat: 12,
  },
  second_generation: {
    common: 1,
    uncommon: 2,
    rare: 3,
    epic: 4,
    legendary: 5,
    goat: 6,
  },
} as const satisfies Record<CukiePoolGeneration, Record<CukiePoolRarity, number>>;

export function stableCukiePoolHash(value: unknown) {
  const normalize = (item: unknown): unknown => {
    if (item instanceof Date) return item.toISOString();
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .filter(([, child]) => child !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return item;
  };

  return createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
}

export function requiredPoolText(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainValidationError(`${label} no puede estar vacio.`);
  }
  return value.trim();
}

export function validPoolDate(value: Date | undefined, label: string, fallback?: Date) {
  const date = value ?? fallback;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new DomainValidationError(`${label} debe ser una fecha valida.`);
  }
  return new Date(date.getTime());
}

export function validPoolRevision(value: number, label = 'expectedRevision') {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) {
    throw new DomainValidationError(`${label} debe ser un entero seguro no negativo.`);
  }
  return value;
}

export function validPoolLimit(value = 100) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw new DomainValidationError('limit debe ser un entero entre 1 y 1000.');
  }
  return value;
}

export function normalizePoolWallet(value: string) {
  const wallet = normalizeWalletAddress(requiredPoolText(value, 'walletAddress'));
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
    throw new DomainValidationError('walletAddress debe ser una wallet BSC valida para el pool.');
  }
  return wallet;
}

export function validPoolIdempotencyKey(value: string, allowSystem = false) {
  const key = requiredPoolText(value, 'idempotencyKey');
  if (!allowSystem && key.startsWith(CUKIE_POOL_SYSTEM_IDEMPOTENCY_PREFIX)) {
    throw new DomainValidationError(
      `idempotencyKey no puede usar ${CUKIE_POOL_SYSTEM_IDEMPOTENCY_PREFIX}.`,
    );
  }
  return key;
}

export function poolPriority(generation: CukiePoolGeneration): 0 | 1 {
  return generation === 'original' ? 0 : 1;
}

export function gamesQuota(
  generation: CukiePoolGeneration,
  rarity: CukiePoolRarity,
) {
  return CUKIE_POOL_GAMES_QUOTA[generation][rarity];
}

export function firstPoolEligibilityAt(stakedAt: Date) {
  const value = validPoolDate(stakedAt, 'stakedAt');
  return new Date(value.getTime() + economyCycleDurationMs(loadEconomyCycleCalendar()));
}

export function deterministicSeikuAssetId(sessionId: string) {
  return `seiku:${stableCukiePoolHash({ kind: 'seiku', sessionId: requiredPoolText(sessionId, 'sessionId') })}`;
}

export function clonePoolPosition(position: CukiePoolPosition): CukiePoolPosition {
  return {
    ...position,
    stakedAt: new Date(position.stakedAt),
    eligibleAt: new Date(position.eligibleAt),
    createdAt: new Date(position.createdAt),
    updatedAt: new Date(position.updatedAt),
    ...(position.assignmentExpiresAt
      ? { assignmentExpiresAt: new Date(position.assignmentExpiresAt) }
      : {}),
    ...(position.withdrawalRequestedAt
      ? { withdrawalRequestedAt: new Date(position.withdrawalRequestedAt) }
      : {}),
    ...(position.withdrawnAt ? { withdrawnAt: new Date(position.withdrawnAt) } : {}),
    ...(position.exhaustedAt ? { exhaustedAt: new Date(position.exhaustedAt) } : {}),
    ...(position.invalidatedAt ? { invalidatedAt: new Date(position.invalidatedAt) } : {}),
  };
}

export function clonePoolAssignment(assignment: CukiePoolAssignment): CukiePoolAssignment {
  return {
    ...assignment,
    assignedAt: new Date(assignment.assignedAt),
    expiresAt: new Date(assignment.expiresAt),
    updatedAt: new Date(assignment.updatedAt),
    ...(assignment.periodStartsAt
      ? { periodStartsAt: new Date(assignment.periodStartsAt) }
      : {}),
    ...(assignment.periodEndsAt ? { periodEndsAt: new Date(assignment.periodEndsAt) } : {}),
    ...(assignment.releasedAt ? { releasedAt: new Date(assignment.releasedAt) } : {}),
  };
}
