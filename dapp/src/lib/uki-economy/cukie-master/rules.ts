import { createHash } from 'node:crypto';

import { DomainValidationError } from '../errors';
import {
  CUKIE_MASTER_FIRST_CREDIT_DELAY_HOURS,
  CUKIE_MASTER_REQUIREMENT_GRACE_HOURS,
  CUKIE_MASTER_ROUTE_RULES,
  CUKIE_MASTER_RULE_VERSION,
  CUKIE_MASTER_UKI_REQUIREMENT_RAW,
  type CukieMasterRoute,
} from '../rules';
import type {
  CukieMasterRequirement,
  CukieMasterRouteRound,
  CukieMasterRouteSource,
} from './types';

export const CUKIE_MASTER_INITIAL_CAPACITY = 500;
export const CUKIE_MASTER_MAX_CAPACITY = 5_000;
export const CUKIE_MASTER_MAX_SLOTS_PER_ROUTE = 5;
// keccak256("PRESALE"), matching VestingVault.PRESALE_SCHEDULE_ID.
export const CUKIE_MASTER_PRESALE_VESTING_SCHEDULE_ID =
  '0x98eba5a7b13808f833eca52bd365421b449cde4b74525a6913b19b0a84be9002';

export function stableCukieMasterHash(value: unknown) {
  const normalize = (item: unknown): unknown => {
    if (item instanceof Date) return item.toISOString();
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]));
    }
    return item;
  };

  return createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
}

export function initialRequirement(route: CukieMasterRoute): CukieMasterRequirement {
  return route === 'uki'
    ? { route, ukiRaw: CUKIE_MASTER_UKI_REQUIREMENT_RAW }
    : { route, nftPoints: CUKIE_MASTER_ROUTE_RULES.nft.requirementPerSlot };
}

export function createInitialRouteRound(route: CukieMasterRoute, now: Date): CukieMasterRouteRound {
  return {
    _id: route,
    roundId: `${route}:${CUKIE_MASTER_RULE_VERSION}`,
    route,
    status: 'active',
    ruleVersion: CUKIE_MASTER_RULE_VERSION,
    requirement: initialRequirement(route),
    capacitySlots: CUKIE_MASTER_INITIAL_CAPACITY,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function requirementValue(requirement: CukieMasterRequirement) {
  return requirement.route === 'uki' ? BigInt(requirement.ukiRaw) : BigInt(requirement.nftPoints);
}

export function assertRequirement(route: CukieMasterRoute, requirement: CukieMasterRequirement) {
  if (requirement.route !== route) {
    throw new DomainValidationError(`El requisito ${requirement.route} no corresponde a ${route}.`);
  }
  const value = requirementValue(requirement);
  if (value <= BigInt(0)) throw new DomainValidationError('El requisito debe ser mayor que cero.');
  if (route === 'nft' && (!Number.isSafeInteger((requirement as { nftPoints: number }).nftPoints))) {
    throw new DomainValidationError('El requisito NFT debe ser un entero seguro.');
  }
  return requirement;
}

export function assertStrictRequirementIncrease(
  current: CukieMasterRequirement,
  next: CukieMasterRequirement,
) {
  assertRequirement(current.route, next);
  if (requirementValue(next) <= requirementValue(current)) {
    throw new DomainValidationError('El nuevo requisito debe ser un incremento estricto.');
  }
  return next;
}

export function desiredSlotsForSource(
  source: CukieMasterRouteSource,
  requirement: CukieMasterRequirement,
) {
  assertRequirement(source.route, requirement);
  const available = source.route === 'uki'
    ? BigInt(source.totalUkiRaw)
    : BigInt(source.originalCukiePoints);
  const slots = available / requirementValue(requirement);
  return Math.min(Number(slots), CUKIE_MASTER_MAX_SLOTS_PER_ROUTE);
}

export function routeGraceIsOpen(round: CukieMasterRouteRound, now: Date) {
  return Boolean(
    round.pendingRequirement
    && round.graceEndsAt
    && now.getTime() < round.graceEndsAt.getTime(),
  );
}

export function candidateRequirement(round: CukieMasterRouteRound) {
  return round.pendingRequirement ?? round.requirement;
}

export function calculateRouteSlotTarget(input: {
  source: CukieMasterRouteSource;
  round: CukieMasterRouteRound;
  currentAllocatedSlots: number;
  now: Date;
}) {
  const desiredSlots = desiredSlotsForSource(input.source, candidateRequirement(input.round));
  const oldDesiredSlots = desiredSlotsForSource(input.source, input.round.requirement);
  const protectedSlots = routeGraceIsOpen(input.round, input.now)
    ? Math.min(input.currentAllocatedSlots, oldDesiredSlots)
    : 0;

  return {
    desiredSlots,
    protectedSlots,
    targetSlots: Math.max(desiredSlots, protectedSlots),
  };
}

export function firstCreditAt(now: Date) {
  return new Date(now.getTime() + CUKIE_MASTER_FIRST_CREDIT_DELAY_HOURS * 60 * 60 * 1000);
}

export function requirementGraceEndsAt(now: Date) {
  return new Date(now.getTime() + CUKIE_MASTER_REQUIREMENT_GRACE_HOURS * 60 * 60 * 1000);
}
