import 'server-only';

import { normalizeWalletAddress } from '@/lib/wallet-address';

import { DomainConflictError, DomainValidationError } from '../errors';
import { addRawAmounts, formatRawAmount, parseRawAmount } from '../money';
import type { CukieMasterRoute } from '../rules';
import {
  assertStrictRequirementIncrease,
  calculateRouteSlotTarget,
  candidateRequirement,
  CUKIE_MASTER_MAX_CAPACITY,
  firstCreditAt,
  initialRequirement,
  requirementGraceEndsAt,
  routeGraceIsOpen,
  stableCukieMasterHash,
} from './rules';
import {
  mongoCukieMasterTransactionRunner,
  type CukieMasterRepository,
  type CukieMasterTransactionRunner,
  type PresaleParticipantRawDocument,
  type UkiStakingPositionRawDocument,
  type UkiVestingPositionRawDocument,
} from './repository';
import type {
  CukieMasterNftSource,
  CukieMasterPosition,
  CukieMasterPositionEvent,
  CukieMasterRecalculationResult,
  CukieMasterRequirement,
  CukieMasterRouteCapacity,
  CukieMasterRouteRound,
  CukieMasterRouteSource,
  CukieMasterSourceCompleteness,
  CukieMasterSourceRef,
  CukieMasterSlot,
  CukieMasterUkiSource,
  CukieMasterWalletStatus,
} from './types';

const ROUTES: CukieMasterRoute[] = ['uki', 'nft'];
const ZERO_RAW = '0';
const ROUTE_SCAN_PAGE_SIZE = 250;

function validDate(value: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainValidationError('now debe ser una fecha valida.');
  }
  return new Date(value.getTime());
}

function validIdempotencyKey(value: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainValidationError('idempotencyKey no puede estar vacio.');
  }
  return value.trim();
}

function isMongoDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

function validRouteCapacity(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > CUKIE_MASTER_MAX_CAPACITY) {
    throw new DomainValidationError(
      `capacitySlots debe ser un entero entre 1 y ${CUKIE_MASTER_MAX_CAPACITY}.`,
    );
  }
  return value;
}

function validCukieMasterRoute(value: CukieMasterRoute) {
  if (value !== 'uki' && value !== 'nft') {
    throw new DomainValidationError('route no es valida.');
  }
  return value;
}

async function listAllAllocatedRoutePositions(
  repository: CukieMasterRepository,
  route: CukieMasterRoute,
) {
  const positions: CukieMasterPosition[] = [];
  let after: { id: string; waitlistedAt: Date } | undefined;
  while (positions.length <= CUKIE_MASTER_MAX_CAPACITY) {
    const page = await repository.listRoutePositions({
      route,
      allocatedOnly: true,
      ...(after ? { after } : {}),
      limit: ROUTE_SCAN_PAGE_SIZE,
    });
    positions.push(...page);
    if (page.length < ROUTE_SCAN_PAGE_SIZE) break;
    const tail = page.at(-1)!;
    after = { id: tail._id, waitlistedAt: tail.waitlistedAt ?? new Date(0) };
  }
  if (positions.length > CUKIE_MASTER_MAX_CAPACITY) {
    throw new DomainConflictError(
      `La ruta ${route} supera el maximo operativo de ${CUKIE_MASTER_MAX_CAPACITY} posiciones.`,
    );
  }
  return positions;
}

async function retryDuplicateWinner<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (!isMongoDuplicateKey(error)) throw error;
    return operation();
  }
}

function rawField(
  document: PresaleParticipantRawDocument | UkiStakingPositionRawDocument | UkiVestingPositionRawDocument | null,
  field: 'totalUkiPurchasedRaw' | 'accountBalanceRaw' | 'totalAllocatedRaw' | 'releasedRaw',
  warning: string,
  missingIsComplete = false,
) {
  if (!document) return {
    raw: ZERO_RAW,
    complete: missingIsComplete,
    warning: missingIsComplete ? null : warning,
  };
  const value = (document as Record<string, unknown>)[field];
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return { raw: ZERO_RAW, complete: false, warning };
  }
  try {
    return { raw: formatRawAmount(parseRawAmount(value)), complete: true, warning: null };
  } catch {
    return { raw: ZERO_RAW, complete: false, warning };
  }
}

function documentId(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toString' in value) return String(value);
  return null;
}

function observedAt(value: unknown) {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function presalePurchaseRaw(document: PresaleParticipantRawDocument | null) {
  if (!document || !Object.prototype.hasOwnProperty.call(document, 'totalUkiPurchasedRaw')) {
    return { raw: ZERO_RAW, complete: true, warning: null };
  }
  try {
    return {
      raw: formatRawAmount(parseRawAmount(document.totalUkiPurchasedRaw as string)),
      complete: true,
      warning: null,
    };
  } catch {
    return {
      raw: ZERO_RAW,
      complete: false,
      warning: 'presale_participants.totalUkiPurchasedRaw presente pero no es uint256 raw valido.',
    };
  }
}

async function readCukieMasterUkiSource(
  repository: CukieMasterRepository,
  walletNormalized: string,
  now: Date,
): Promise<CukieMasterUkiSource> {
  const [presale, staking, vesting, ukiIndexerHealth] = await Promise.all([
    repository.findPresaleParticipant(walletNormalized),
    repository.findUkiStakingPosition(walletNormalized),
    repository.findPresaleVestingPosition(walletNormalized),
    repository.getUkiIndexerHealth(walletNormalized, now),
  ]);
  const purchase = presalePurchaseRaw(presale);
  const requiresVesting = purchase.complete && parseRawAmount(purchase.raw) > BigInt(0);
  const vestingAllocated = rawField(
    vesting,
    'totalAllocatedRaw',
    'uki_vesting_positions.totalAllocatedRaw ausente o invalido; locked se usa 0.',
    !requiresVesting,
  );
  const vestingReleased = rawField(
    vesting,
    'releasedRaw',
    'uki_vesting_positions.releasedRaw ausente o invalido; locked se usa 0.',
    !requiresVesting,
  );
  const stakingValue = rawField(
    staking,
    'accountBalanceRaw',
    'uki_staking_positions.accountBalanceRaw ausente o invalido; se usa 0.',
    true,
  );
  const lockedRaw = formatRawAmount(
    parseRawAmount(vestingAllocated.raw) > parseRawAmount(vestingReleased.raw)
      ? parseRawAmount(vestingAllocated.raw) - parseRawAmount(vestingReleased.raw)
      : BigInt(0),
  );
  const warnings = [
    purchase.warning,
    vestingAllocated.warning,
    vestingReleased.warning,
    stakingValue.warning,
    ...ukiIndexerHealth.warnings,
  ].filter(
    (item): item is string => Boolean(item),
  );
  const vestingComplete = vestingAllocated.complete && vestingReleased.complete;
  const completeness: CukieMasterSourceCompleteness = {
    complete: warnings.length === 0 && ukiIndexerHealth.healthy,
    warnings,
    presaleRaw: purchase.complete,
    vestingRaw: vestingComplete,
    stakingRaw: stakingValue.complete,
    nftInventory: true,
    indexerHealth: ukiIndexerHealth.healthy,
  };
  const effectiveLockedRaw = completeness.complete ? lockedRaw : ZERO_RAW;
  const effectiveStakingRaw = completeness.complete ? stakingValue.raw : ZERO_RAW;
  const ukiRefs: CukieMasterSourceRef[] = [
    {
      source: 'presale',
      collection: 'presale_participants',
      documentId: documentId(presale?._id),
      valueRaw: purchase.complete ? purchase.raw : undefined,
      observedAt: observedAt(presale?.updatedAt),
    },
    {
      source: 'vesting',
      collection: 'uki_vesting_positions',
      documentId: documentId(vesting?._id),
      valueRaw: effectiveLockedRaw,
      observedAt: observedAt(vesting?.updatedAt),
    },
    {
      source: 'uki_staking',
      collection: 'uki_staking_positions',
      documentId: documentId(staking?._id),
      valueRaw: effectiveStakingRaw,
      observedAt: observedAt(staking?.updatedAt),
    },
  ];
  const ukiWithoutHash = {
    route: 'uki' as const,
    totalUkiRaw: formatRawAmount(addRawAmounts(
      parseRawAmount(effectiveLockedRaw),
      parseRawAmount(effectiveStakingRaw),
    )),
    presaleLockedRaw: effectiveLockedRaw,
    stakedUkiRaw: effectiveStakingRaw,
    refs: ukiRefs,
    completeness,
  };
  return {
    ...ukiWithoutHash,
    sourceHash: stableCukieMasterHash(ukiWithoutHash),
  };
}

async function readCukieMasterNftSource(
  repository: CukieMasterRepository,
  walletAddress: string,
  walletNormalized: string,
  now: Date,
): Promise<CukieMasterNftSource> {
  const [nft, nftIndexerHealth] = await Promise.all([
    repository.getNftEntitlement(walletAddress, now),
    repository.getNftIndexerHealth(now),
  ]);
  const nftAssets = nft.eligibleAssets.map((asset) => {
    const lock = asset.activeLocks.find((item) => (
      (item.reason === 'soft_stake'
        || (item.reason === 'game_assignment' && item.retainsSoftStakeEntitlement === true))
      && item.ownerNormalized?.toLowerCase() === walletNormalized.toLowerCase()
    ));
    return {
      assetId: asset.assetId,
      tokenId: asset.tokenId,
      rarity: asset.rarity,
      rarityPoints: asset.rarityPoints,
      lockId: lock?.lockId ?? null,
      sourceRefs: asset.sourceRefs.map((ref) => ({
        source: ref.source,
        collection: ref.collection,
        documentId: ref.documentId,
        observedAt: ref.observedAt,
      })),
    };
  });
  const nftRefs = nftAssets.flatMap((asset) => asset.sourceRefs);
  const incompleteNftBlockers = new Set([
    'unknown_owner',
    'unknown_network',
    'missing_rarity',
    'missing_generation',
  ]);
  const nftInventoryWarnings: string[] = [];
  if (nft.rejectedAssets.some((item) => item.blockers.some((blocker) => (
    incompleteNftBlockers.has(blocker)
  )))) nftInventoryWarnings.push('El inventario NFT contiene atributos canónicos unknown.');
  const nftWarnings = [...nftInventoryWarnings, ...nftIndexerHealth.warnings];
  const nftCompleteness: CukieMasterSourceCompleteness = {
    complete: nftWarnings.length === 0 && nftIndexerHealth.healthy,
    warnings: nftWarnings,
    presaleRaw: true,
    vestingRaw: true,
    stakingRaw: true,
    nftInventory: nftInventoryWarnings.length === 0,
    indexerHealth: nftIndexerHealth.healthy,
  };
  const nftWithoutHash = {
    route: 'nft' as const,
    originalCukiePoints: nftCompleteness.complete ? nft.originalCukiePoints : 0,
    nftAssetIds: nftCompleteness.complete ? nft.nftAssetIds : [],
    assets: nftCompleteness.complete ? nftAssets : [],
    refs: nftRefs,
    completeness: nftCompleteness,
  };
  return {
    ...nftWithoutHash,
    sourceHash: stableCukieMasterHash(nftWithoutHash),
  };
}

export async function readCukieMasterRouteSource(
  repository: CukieMasterRepository,
  walletAddress: string,
  walletNormalized: string,
  now: Date,
  route: CukieMasterRoute,
): Promise<CukieMasterRouteSource> {
  return route === 'uki'
    ? readCukieMasterUkiSource(repository, walletNormalized, now)
    : readCukieMasterNftSource(repository, walletAddress, walletNormalized, now);
}

export async function readCukieMasterSources(
  repository: CukieMasterRepository,
  walletAddress: string,
  walletNormalized: string,
  now: Date,
): Promise<{ uki: CukieMasterUkiSource; nft: CukieMasterNftSource }> {
  const [uki, nft] = await Promise.all([
    readCukieMasterUkiSource(repository, walletNormalized, now),
    readCukieMasterNftSource(repository, walletAddress, walletNormalized, now),
  ]);
  return { uki, nft };
}

function nextCapacity(
  capacity: CukieMasterRouteCapacity,
  currentSlots: number,
  targetSlots: number,
  now: Date,
  allowIncrease = true,
) {
  const available = allowIncrease ? capacity.totalSlots - capacity.allocatedSlots : 0;
  const allocatedSlots = targetSlots <= currentSlots
    ? targetSlots
    : currentSlots + Math.min(targetSlots - currentSlots, available);
  const delta = allocatedSlots - currentSlots;
  return {
    allocatedSlots,
    capacity: delta === 0 ? capacity : {
      ...capacity,
      allocatedSlots: capacity.allocatedSlots + delta,
      revision: capacity.revision + 1,
      updatedAt: now,
    },
  };
}

function buildNextPosition(input: {
  walletAddress: string;
  walletNormalized: string;
  route: CukieMasterRoute;
  source: CukieMasterRouteSource;
  round: CukieMasterRouteRound;
  previous: CukieMasterPosition | null;
  capacity: CukieMasterRouteCapacity;
  now: Date;
  allowCapacityIncrease?: boolean;
}) {
  const graceOpen = routeGraceIsOpen(input.round, input.now);
  const closingRequirement = input.round.pendingRequirement && !graceOpen
    ? input.round.pendingRequirement
    : null;
  const closingRuleVersion = closingRequirement
    ? `cukie-master-${input.route}-${stableCukieMasterHash(closingRequirement).slice(0, 12)}`
    : input.round.ruleVersion;
  const closingRoundId = closingRequirement
    ? `${input.route}:${closingRuleVersion}`
    : input.round.roundId;
  const { desiredSlots, protectedSlots, targetSlots } = calculateRouteSlotTarget({
    source: input.source,
    round: input.round,
    currentAllocatedSlots: input.previous?.allocatedSlots ?? 0,
    now: input.now,
  });
  const allocation = nextCapacity(
    input.capacity,
    input.previous?.allocatedSlots ?? 0,
    targetSlots,
    input.now,
    input.allowCapacityIncrease,
  );
  const gainedEligibility = allocation.allocatedSlots > 0
    && (!input.previous || input.previous.allocatedSlots === 0);
  const qualifiedSince = gainedEligibility
    ? input.now
    : allocation.allocatedSlots > 0
      ? input.previous?.qualifiedSince ?? input.now
      : undefined;
  const activeFrom = gainedEligibility
    ? firstCreditAt(input.now)
    : allocation.allocatedSlots > 0
      ? input.previous?.activeFrom ?? firstCreditAt(input.now)
      : undefined;
  const status = allocation.allocatedSlots === 0
    ? targetSlots > 0 ? 'waitlisted' as const : 'inactive' as const
    : graceOpen && protectedSlots > 0
      ? 'grace' as const
    : activeFrom && activeFrom.getTime() <= input.now.getTime()
      ? 'active' as const
      : 'qualifying' as const;
  const next: CukieMasterPosition = {
    _id: `${input.walletNormalized}:${input.route}`,
    walletAddress: input.walletAddress,
    walletNormalized: input.walletNormalized,
    route: input.route,
    status,
    desiredSlots,
    allocatedSlots: allocation.allocatedSlots,
    protectedSlots,
    ...(qualifiedSince ? { qualifiedSince } : {}),
    ...(activeFrom ? { activeFrom } : {}),
    ...(desiredSlots > allocation.allocatedSlots
      ? { waitlistedAt: input.previous?.waitlistedAt ?? input.now }
      : {}),
    ...(status === 'inactive' ? { inactiveAt: input.now } : {}),
    requirementSnapshot: closingRequirement ?? input.round.requirement,
    ...(graceOpen && input.round.pendingRequirement
      ? { pendingRequirementSnapshot: input.round.pendingRequirement }
      : {}),
    ...(graceOpen && input.round.graceEndsAt ? { graceEndsAt: input.round.graceEndsAt } : {}),
    source: input.source,
    sourceHash: input.source.sourceHash,
    ruleVersion: closingRuleVersion,
    roundId: closingRoundId,
    revision: (input.previous?.revision ?? 0) + 1,
    createdAt: input.previous?.createdAt ?? input.now,
    updatedAt: input.now,
  };
  return { next, nextCapacity: allocation.capacity };
}

async function syncPositionSlots(
  repository: CukieMasterRepository,
  previousPosition: CukieMasterPosition | null,
  nextPosition: CukieMasterPosition,
  now: Date,
  requestIdempotencyKey: string,
) {
  const currentSlots = new Map(
    (await repository.findWalletRouteSlots(
      nextPosition.walletNormalized,
      nextPosition.route,
    )).map((slot) => [slot.ordinal, slot]),
  );
  const persisted: CukieMasterSlot[] = [];
  for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
    const previous = currentSlots.get(ordinal) ?? null;
    const shouldBeAllocated = ordinal <= nextPosition.allocatedSlots;
    if (!shouldBeAllocated && !previous) continue;
    const startsNewEpoch = shouldBeAllocated && (!previous || previous.status === 'inactive');
    const qualifiedSince = startsNewEpoch ? now : previous?.qualifiedSince ?? now;
    const creditEligibleFrom = startsNewEpoch
      ? firstCreditAt(now)
      : previous?.creditEligibleFrom ?? firstCreditAt(now);
    const status = !shouldBeAllocated
      ? 'inactive' as const
      : nextPosition.status === 'grace' && ordinal <= nextPosition.protectedSlots
        ? 'grace' as const
        : creditEligibleFrom.getTime() <= now.getTime()
          ? 'active' as const
          : 'qualifying' as const;
    const next: CukieMasterSlot = {
      _id: `${nextPosition.walletNormalized}:${nextPosition.route}:${ordinal}`,
      walletAddress: nextPosition.walletAddress,
      walletNormalized: nextPosition.walletNormalized,
      route: nextPosition.route,
      ordinal,
      eligibilityEpoch: startsNewEpoch
        ? (previous?.eligibilityEpoch ?? 0) + 1
        : previous?.eligibilityEpoch ?? 1,
      status,
      qualifiedSince,
      creditEligibleFrom,
      ...(status === 'inactive' ? { inactiveAt: now } : {}),
      ...(status === 'grace' && nextPosition.graceEndsAt
        ? { graceEndsAt: nextPosition.graceEndsAt }
        : {}),
      roundId: nextPosition.roundId,
      ruleVersion: nextPosition.ruleVersion,
      sourceHash: nextPosition.sourceHash,
      revision: (previous?.revision ?? 0) + 1,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    const materiallySame = previous
      && previous.status === next.status
      && previous.sourceHash === next.sourceHash
      && previous.roundId === next.roundId
      && previous.eligibilityEpoch === next.eligibilityEpoch
      && previous.graceEndsAt?.getTime() === next.graceEndsAt?.getTime();
    if (materiallySame) {
      persisted.push(previous);
      continue;
    }
    const winner = await repository.replaceSlot(previous, next);
    if (!winner) throw new DomainConflictError(`CAS de slot ${next._id} perdido.`);
    const eventKey = `cukie-master:slot:${requestIdempotencyKey}:${next._id}`;
    await repository.insertEvent({
      _id: eventKey,
      eventId: eventKey,
      eventType: 'slot_transitioned',
      idempotencyKey: eventKey,
      requestIdempotencyKey,
      payloadHash: stableCukieMasterHash({ previous, next: winner }),
      walletNormalized: next.walletNormalized,
      route: next.route,
      reason: startsNewEpoch
        ? 'slot_eligibility_epoch_started'
        : status === 'inactive'
          ? 'slot_eligibility_lost'
          : 'slot_state_changed',
      sourceHash: next.sourceHash,
      previous: previousPosition,
      next: nextPosition,
      previousSlot: previous,
      nextSlot: winner,
      createdAt: now,
    });
    persisted.push(winner);
  }
  return persisted;
}

function reasonForChange(previous: CukieMasterPosition | null, next: CukieMasterPosition) {
  if (!previous) return next.status === 'waitlisted' ? 'waitlisted_capacity_full' : 'eligibility_created';
  if (previous.sourceHash !== next.sourceHash) return 'canonical_source_changed';
  if (previous.allocatedSlots !== next.allocatedSlots) return 'slot_allocation_changed';
  if (previous.status !== next.status) return 'status_changed';
  return 'recalculated_no_material_change';
}

export type CukieMasterRouteRecalculationResult = {
  walletAddress: string;
  walletNormalized: string;
  route: CukieMasterRoute;
  position: CukieMasterPosition;
};

function recalculationEventKey(requestIdempotencyKey: string, route: CukieMasterRoute) {
  return `cukie-master:recalculate:${requestIdempotencyKey}:${route}`;
}

function assertCompleteRouteSource(source: CukieMasterRouteSource) {
  if (source.completeness.complete) return;
  const warnings = source.completeness.warnings.map((warning) => `${source.route}: ${warning}`);
  throw new DomainConflictError(
    `Recalculo Cukie Master abortado: fuentes incompletas (${warnings.join('; ')}).`,
  );
}

async function persistRouteRecalculation(
  repository: CukieMasterRepository,
  walletAddress: string,
  walletNormalized: string,
  route: CukieMasterRoute,
  source: CukieMasterRouteSource,
  now: Date,
  requestIdempotencyKey: string,
): Promise<CukieMasterPosition> {
  const round = await repository.ensureActiveRound(route, now);
  const fenced = await repository.fenceRound(route, round.revision, round.roundId, now);
  if (!fenced) throw new DomainConflictError(`La ronda ${route} cambio durante el recalculo.`);
  const capacity = await repository.ensureCapacity(
    route,
    round.roundId,
    round.capacitySlots,
    now,
  );
  const previous = await repository.findPosition(walletNormalized, route);
  const firstWaitlisted = await repository.findFirstWaitlisted(route);
  const allowCapacityIncrease = !firstWaitlisted
    || firstWaitlisted.walletNormalized === walletNormalized;
  const built = buildNextPosition({
    walletAddress,
    walletNormalized,
    route,
    source,
    round,
    previous,
    capacity,
    now,
    allowCapacityIncrease,
  });
  if (built.nextCapacity !== capacity) {
    const capacityWinner = await repository.replaceCapacity(
      route,
      capacity.revision,
      built.nextCapacity,
    );
    if (!capacityWinner) throw new DomainConflictError(`CAS de capacidad ${route} perdido.`);
  }
  const persisted = await repository.replacePosition(previous, built.next);
  if (!persisted) throw new DomainConflictError(`CAS de posicion ${route} perdido.`);
  await syncPositionSlots(repository, previous, persisted, now, requestIdempotencyKey);
  const eventKey = recalculationEventKey(requestIdempotencyKey, route);
  const payloadHash = stableCukieMasterHash({
    walletNormalized,
    route,
    now,
    sourceHash: source.sourceHash,
    roundId: round.roundId,
    requestIdempotencyKey,
  });
  const event: CukieMasterPositionEvent = {
    _id: eventKey,
    eventId: eventKey,
    eventType: 'position_recalculated',
    idempotencyKey: eventKey,
    requestIdempotencyKey,
    payloadHash,
    walletNormalized,
    route,
    reason: reasonForChange(previous, persisted),
    sourceHash: source.sourceHash,
    previous,
    next: persisted,
    createdAt: now,
  };
  await repository.insertEvent(event);
  return persisted;
}

async function recalculateRouteInsideTransaction(
  repository: CukieMasterRepository,
  walletAddress: string,
  route: CukieMasterRoute,
  now: Date,
  requestIdempotencyKey: string,
): Promise<CukieMasterRouteRecalculationResult> {
  const walletNormalized = normalizeWalletAddress(walletAddress);
  if (!walletNormalized) throw new DomainValidationError('wallet no se pudo normalizar.');
  const eventKey = recalculationEventKey(requestIdempotencyKey, route);
  const existing = await repository.findEvent(eventKey);
  if (existing) {
    if (
      existing.walletNormalized !== walletNormalized
      || existing.route !== route
      || !existing.next
    ) throw new DomainConflictError('La idempotencyKey ya pertenece a otra recalculacion.');
    return { walletAddress, walletNormalized, route, position: existing.next };
  }

  const source = await readCukieMasterRouteSource(
    repository,
    walletAddress,
    walletNormalized,
    now,
    route,
  );
  assertCompleteRouteSource(source);
  const position = await persistRouteRecalculation(
    repository,
    walletAddress,
    walletNormalized,
    route,
    source,
    now,
    requestIdempotencyKey,
  );
  return { walletAddress, walletNormalized, route, position };
}

async function recalculateInsideTransaction(
  repository: CukieMasterRepository,
  walletAddress: string,
  now: Date,
  requestIdempotencyKey: string,
): Promise<CukieMasterRecalculationResult> {
  const walletNormalized = normalizeWalletAddress(walletAddress);
  if (!walletNormalized) throw new DomainValidationError('wallet no se pudo normalizar.');
  const eventKeys = Object.fromEntries(ROUTES.map((route) => [
    route,
    recalculationEventKey(requestIdempotencyKey, route),
  ])) as Record<CukieMasterRoute, string>;
  const existingEvents = await Promise.all(ROUTES.map((route) => repository.findEvent(eventKeys[route])));
  if (existingEvents.every(Boolean)) {
    const [ukiEvent, nftEvent] = existingEvents as [CukieMasterPositionEvent, CukieMasterPositionEvent];
    if (
      ukiEvent.walletNormalized !== walletNormalized
      || nftEvent.walletNormalized !== walletNormalized
      || !ukiEvent.next
      || !nftEvent.next
    ) throw new DomainConflictError('La idempotencyKey ya pertenece a otra recalculacion.');
    return {
      walletAddress,
      walletNormalized,
      positions: { uki: ukiEvent.next, nft: nftEvent.next },
    };
  }
  if (existingEvents.some(Boolean)) {
    throw new DomainConflictError('La recalculacion idempotente quedo parcialmente registrada.');
  }

  const sources = await readCukieMasterSources(repository, walletAddress, walletNormalized, now);
  for (const route of ROUTES) assertCompleteRouteSource(sources[route]);
  const positions = {} as Record<CukieMasterRoute, CukieMasterPosition>;

  for (const route of ROUTES) {
    positions[route] = await persistRouteRecalculation(
      repository,
      walletAddress,
      walletNormalized,
      route,
      sources[route],
      now,
      requestIdempotencyKey,
    );
  }

  return { walletAddress, walletNormalized, positions };
}

export type ActivateMaturedPositionResult = {
  slot: CukieMasterSlot | null;
  activated: boolean;
};

async function activateMaturedPositionInsideTransaction(
  repository: CukieMasterRepository,
  slotId: string,
  now: Date,
  requestIdempotencyKey: string,
): Promise<ActivateMaturedPositionResult> {
  const eventKey = `cukie-master:activate:${requestIdempotencyKey}:${slotId}`;
  const prior = await repository.findEvent(eventKey);
  if (prior) {
    if (!prior.nextSlot || prior.nextSlot._id !== slotId) {
      throw new DomainConflictError('La activacion idempotente previa no corresponde al slot.');
    }
    return { slot: prior.nextSlot, activated: false };
  }

  const previous = await repository.findSlot(slotId);
  if (
    !previous
    || previous.status !== 'qualifying'
    || previous.creditEligibleFrom.getTime() > now.getTime()
  ) {
    return { slot: previous, activated: false };
  }

  const next: CukieMasterSlot = {
    ...previous,
    status: 'active',
    revision: previous.revision + 1,
    updatedAt: now,
  };
  const persisted = await repository.replaceSlot(previous, next);
  if (!persisted) throw new DomainConflictError(`CAS de activacion ${previous._id} perdido.`);
  const payloadHash = stableCukieMasterHash({
    slotId: previous._id,
    creditEligibleFrom: previous.creditEligibleFrom,
    now,
    requestIdempotencyKey,
  });
  await repository.insertEvent({
    _id: eventKey,
    eventId: eventKey,
    eventType: 'slot_activated',
    idempotencyKey: eventKey,
    requestIdempotencyKey,
    payloadHash,
    walletNormalized: previous.walletNormalized,
    route: previous.route,
    reason: 'qualification_matured',
    sourceHash: previous.sourceHash,
    previous: null,
    next: null,
    previousSlot: previous,
    nextSlot: persisted,
    createdAt: now,
  });
  return { slot: persisted, activated: true };
}

export function createCukieMasterService(runner: CukieMasterTransactionRunner) {
  return {
    recalculateCukieMasterRoute(
      wallet: string,
      route: CukieMasterRoute,
      now: Date,
      idempotencyKey: string,
    ) {
      const timestamp = validDate(now);
      const targetRoute = validCukieMasterRoute(route);
      const key = validIdempotencyKey(idempotencyKey);
      return retryDuplicateWinner(() => runner((repository) => recalculateRouteInsideTransaction(
        repository,
        wallet,
        targetRoute,
        timestamp,
        key,
      )));
    },
    recalculateCukieMasterWallet(wallet: string, now: Date, idempotencyKey: string) {
      const timestamp = validDate(now);
      const key = validIdempotencyKey(idempotencyKey);
      return retryDuplicateWinner(() => runner((repository) => recalculateInsideTransaction(
          repository,
          wallet,
          timestamp,
          key,
        )));
    },
    activateMaturedPosition(
      slotId: string,
      now: Date,
      idempotencyKey: string,
    ) {
      const timestamp = validDate(now);
      const key = validIdempotencyKey(idempotencyKey);
      return retryDuplicateWinner(() => runner((repository) => (
        activateMaturedPositionInsideTransaction(
          repository,
          slotId,
          timestamp,
          key,
        )
      )));
    },
    expandRouteCapacity(
      route: CukieMasterRoute,
      capacitySlots: number,
      now: Date,
      idempotencyKey: string,
    ) {
      const timestamp = validDate(now);
      const nextTotal = validRouteCapacity(capacitySlots);
      const key = validIdempotencyKey(idempotencyKey);
      return retryDuplicateWinner(() => runner(async (repository) => {
        const eventKey = `cukie-master:capacity:${key}:${route}`;
        const payloadHash = stableCukieMasterHash({ route, capacitySlots: nextTotal });
        const prior = await repository.findEvent(eventKey);
        if (prior) {
          if (prior.payloadHash !== payloadHash || !prior.nextCapacity || !prior.nextRound) {
            throw new DomainConflictError('La idempotencyKey de capacidad ya tiene otro payload.');
          }
          return { round: prior.nextRound, capacity: prior.nextCapacity };
        }
        const round = await repository.ensureActiveRound(route, timestamp);
        const capacity = await repository.ensureCapacity(
          route,
          round.roundId,
          round.capacitySlots,
          timestamp,
        );
        if (nextTotal <= capacity.totalSlots || nextTotal <= round.capacitySlots) {
          throw new DomainValidationError('La capacidad solo puede ampliarse de forma estricta.');
        }
        if (nextTotal < capacity.allocatedSlots) {
          throw new DomainConflictError('La capacidad no puede quedar por debajo de los cupos asignados.');
        }
        const nextRound: CukieMasterRouteRound = {
          ...round,
          capacitySlots: nextTotal,
          revision: round.revision + 1,
          updatedAt: timestamp,
        };
        const nextCapacity: CukieMasterRouteCapacity = {
          ...capacity,
          totalSlots: nextTotal,
          revision: capacity.revision + 1,
          updatedAt: timestamp,
        };
        const persistedRound = await repository.replaceRound(route, round.revision, nextRound);
        if (!persistedRound) throw new DomainConflictError(`CAS de ronda ${route} perdido.`);
        const persistedCapacity = await repository.replaceCapacity(
          route,
          capacity.revision,
          nextCapacity,
        );
        if (!persistedCapacity) throw new DomainConflictError(`CAS de capacidad ${route} perdido.`);
        await repository.insertEvent({
          _id: eventKey,
          eventId: eventKey,
          eventType: 'capacity_expanded',
          idempotencyKey: eventKey,
          requestIdempotencyKey: key,
          payloadHash,
          walletNormalized: null,
          route,
          reason: 'route_capacity_expanded',
          sourceHash: null,
          previous: null,
          next: null,
          previousRound: round,
          nextRound: persistedRound,
          previousCapacity: capacity,
          nextCapacity: persistedCapacity,
          createdAt: timestamp,
        });
        return { round: persistedRound, capacity: persistedCapacity };
      }));
    },
    proposeRequirementIncrease(
      route: CukieMasterRoute,
      newRequirement: CukieMasterRequirement,
      now: Date,
      idempotencyKey: string,
    ) {
      const timestamp = validDate(now);
      const key = validIdempotencyKey(idempotencyKey);
      return retryDuplicateWinner(() => runner(async (repository) => {
        const eventKey = `cukie-master:requirement:${key}:${route}`;
        const payloadHash = stableCukieMasterHash({ route, newRequirement });
        const round = await repository.ensureActiveRound(route, timestamp);
        const prior = await repository.findEvent(eventKey);
        if (prior) {
          if (prior.payloadHash !== payloadHash || !prior.nextRound) {
            throw new DomainConflictError('La idempotencyKey de requisito ya tiene otro payload.');
          }
          const currentMatches = stableCukieMasterHash(round.requirement)
            === stableCukieMasterHash(newRequirement);
          const pendingMatches = round.pendingRequirement
            && stableCukieMasterHash(round.pendingRequirement)
              === stableCukieMasterHash(newRequirement);
          return currentMatches || pendingMatches ? round : prior.nextRound;
        }
        const currentMatches = stableCukieMasterHash(round.requirement)
          === stableCukieMasterHash(newRequirement);
        const pendingMatches = round.pendingRequirement
          && stableCukieMasterHash(round.pendingRequirement)
            === stableCukieMasterHash(newRequirement);
        if (currentMatches || pendingMatches) {
          await repository.insertEvent({
            _id: eventKey,
            eventId: eventKey,
            eventType: 'requirement_proposed',
            idempotencyKey: eventKey,
            requestIdempotencyKey: key,
            payloadHash,
            walletNormalized: null,
            route,
            reason: 'equivalent_requirement_acknowledged',
            sourceHash: null,
            previous: null,
            next: null,
            previousRound: round,
            nextRound: round,
            createdAt: timestamp,
          });
          return round;
        }
        const capacity = await repository.ensureCapacity(
          route,
          round.roundId,
          round.capacitySlots,
          timestamp,
        );
        if (capacity.allocatedSlots !== capacity.totalSlots) {
          throw new DomainConflictError('Solo se puede aumentar el requisito con la capacidad llena.');
        }
        assertStrictRequirementIncrease(round.requirement, newRequirement);
        if (round.pendingRequirement) {
          throw new DomainConflictError('Ya existe una propuesta distinta en gracia; no se cancela ni reemplaza.');
        }
        const allocatedPositions = await listAllAllocatedRoutePositions(repository, route);
        const nextRound: CukieMasterRouteRound = {
          ...round,
          pendingRequirement: newRequirement,
          requirementProposedAt: timestamp,
          graceEndsAt: requirementGraceEndsAt(timestamp),
          proposalIdempotencyKey: key,
          gracePositionCount: allocatedPositions.length,
          revision: round.revision + 1,
          updatedAt: timestamp,
        };
        const persisted = await repository.replaceRound(route, round.revision, nextRound);
        if (!persisted) throw new DomainConflictError(`CAS de ronda ${route} perdido.`);
        for (const previous of allocatedPositions) {
          const next: CukieMasterPosition = {
            ...previous,
            status: 'grace',
            protectedSlots: previous.allocatedSlots,
            pendingRequirementSnapshot: newRequirement,
            graceEndsAt: nextRound.graceEndsAt,
            revision: previous.revision + 1,
            updatedAt: timestamp,
          };
          const positionWinner = await repository.replacePosition(previous, next);
          if (!positionWinner) {
            throw new DomainConflictError(`CAS de grace para ${previous._id} perdido.`);
          }
          await syncPositionSlots(
            repository,
            previous,
            positionWinner,
            timestamp,
            `requirement:${key}`,
          );
          const positionEventKey = `${eventKey}:position:${previous._id}`;
          await repository.insertEvent({
            _id: positionEventKey,
            eventId: positionEventKey,
            eventType: 'position_grace_started',
            idempotencyKey: positionEventKey,
            requestIdempotencyKey: key,
            payloadHash: stableCukieMasterHash({
              positionId: previous._id,
              newRequirement,
              graceEndsAt: nextRound.graceEndsAt,
            }),
            walletNormalized: previous.walletNormalized,
            route,
            reason: 'requirement_increase_grace_started',
            sourceHash: previous.sourceHash,
            previous,
            next: positionWinner,
            previousRound: round,
            nextRound: persisted,
            createdAt: timestamp,
          });
        }
        await repository.insertEvent({
          _id: eventKey,
          eventId: eventKey,
          eventType: 'requirement_proposed',
          idempotencyKey: eventKey,
          requestIdempotencyKey: key,
          payloadHash,
          walletNormalized: null,
          route,
          reason: 'strict_requirement_increase_proposed',
          sourceHash: null,
          previous: null,
          next: null,
          previousRound: round,
          nextRound: persisted,
          createdAt: timestamp,
        });
        return persisted;
      }));
    },
    finalizeRequirementGrace(
      route: CukieMasterRoute,
      now: Date,
      jobRunId: string,
    ) {
      const timestamp = validDate(now);
      const key = validIdempotencyKey(jobRunId);
      return retryDuplicateWinner(() => runner(async (repository) => {
        const eventKey = `cukie-master:grace-close:${key}:${route}`;
        const prior = await repository.findEvent(eventKey);
        if (prior) {
          if (!prior.nextRound) throw new DomainConflictError('El cierre previo no contiene ronda.');
          return prior.nextRound;
        }
        const round = await repository.ensureActiveRound(route, timestamp);
        if (!round.pendingRequirement || !round.graceEndsAt) {
          throw new DomainConflictError(`La ruta ${route} no tiene una gracia pendiente.`);
        }
        if (timestamp.getTime() < round.graceEndsAt.getTime()) {
          throw new DomainConflictError(`La gracia de ${route} todavia no ha terminado.`);
        }
        const residualGrace = (await listAllAllocatedRoutePositions(repository, route))
          .find((position) => position.status === 'grace');
        if (residualGrace) {
          throw new DomainConflictError(
            `La posicion ${residualGrace._id} sigue en grace; ejecuta el barrido antes de finalizar.`,
          );
        }
        const requirementHash = stableCukieMasterHash(round.pendingRequirement).slice(0, 12);
        const nextRuleVersion = `cukie-master-${route}-${requirementHash}`;
        const nextRound: CukieMasterRouteRound = {
          ...round,
          roundId: `${route}:${nextRuleVersion}`,
          ruleVersion: nextRuleVersion,
          requirement: round.pendingRequirement,
          revision: round.revision + 1,
          updatedAt: timestamp,
        };
        delete nextRound.pendingRequirement;
        delete nextRound.requirementProposedAt;
        delete nextRound.graceEndsAt;
        delete nextRound.proposalIdempotencyKey;
        delete nextRound.gracePositionCount;

        const capacity = await repository.ensureCapacity(
          route,
          round.roundId,
          round.capacitySlots,
          timestamp,
        );
        const persistedRound = await repository.replaceRound(route, round.revision, nextRound);
        if (!persistedRound) throw new DomainConflictError(`CAS de cierre de ronda ${route} perdido.`);
        const capacityWinner = await repository.replaceCapacity(route, capacity.revision, {
          ...capacity,
          roundId: nextRound.roundId,
          revision: capacity.revision + 1,
          updatedAt: timestamp,
        });
        if (!capacityWinner) throw new DomainConflictError(`CAS de capacidad ${route} al cerrar gracia perdido.`);
        const payloadHash = stableCukieMasterHash({
          route,
          previousRoundId: round.roundId,
          nextRoundId: persistedRound.roundId,
          jobRunId: key,
        });
        await repository.insertEvent({
          _id: eventKey,
          eventId: eventKey,
          eventType: 'grace_closed',
          idempotencyKey: eventKey,
          requestIdempotencyKey: key,
          payloadHash,
          walletNormalized: null,
          route,
          reason: 'requirement_grace_closed',
          sourceHash: null,
          previous: null,
          next: null,
          previousRound: round,
          nextRound: persistedRound,
          createdAt: timestamp,
        });
        return persistedRound;
      }));
    },
  };
}

const defaultService = createCukieMasterService(mongoCukieMasterTransactionRunner);

export const recalculateCukieMasterWallet = defaultService.recalculateCukieMasterWallet;
export const recalculateCukieMasterRoute = defaultService.recalculateCukieMasterRoute;
export const activateMaturedPosition = defaultService.activateMaturedPosition;
export const proposeRequirementIncrease = defaultService.proposeRequirementIncrease;
export const expandCukieMasterRouteCapacity = defaultService.expandRouteCapacity;
export const finalizeRequirementGrace = defaultService.finalizeRequirementGrace;

export async function getCukieMasterWalletStatus(
  walletAddress: string,
  now = new Date(),
  repository?: CukieMasterRepository,
): Promise<CukieMasterWalletStatus> {
  const timestamp = validDate(now);
  const walletNormalized = normalizeWalletAddress(walletAddress);
  if (!walletNormalized) throw new DomainValidationError('wallet no se pudo normalizar.');
  const read = async (repo: CukieMasterRepository) => {
  const positions = await repo.listWalletPositions(walletNormalized);
  const sources = await readCukieMasterSources(repo, walletAddress, walletNormalized, timestamp);
  const ukiRound = await repo.findActiveRound('uki');
  const nftRound = await repo.findActiveRound('nft');
  const ukiSlots = await repo.findWalletRouteSlots(walletNormalized, 'uki');
  const nftSlots = await repo.findWalletRouteSlots(walletNormalized, 'nft');
  const byRoute = Object.fromEntries(positions.map((position) => [position.route, position])) as (
    Partial<Record<CukieMasterRoute, CukieMasterPosition>>
  );
  const rounds = { uki: ukiRound, nft: nftRound };
  const slotsByRoute = { uki: ukiSlots, nft: nftSlots };

  return {
    walletAddress,
    walletNormalized,
    routes: Object.fromEntries(ROUTES.map((route) => {
      const storedPosition = byRoute[route] ?? null;
      const expiredGrace = storedPosition?.status === 'grace'
        && storedPosition.graceEndsAt
        && storedPosition.graceEndsAt.getTime() <= timestamp.getTime();
      const position = expiredGrace
        ? { ...storedPosition, status: 'inactive' as const, allocatedSlots: 0, protectedSlots: 0 }
        : storedPosition?.status === 'qualifying'
        && storedPosition.activeFrom
        && storedPosition.activeFrom.getTime() <= timestamp.getTime()
        && (!storedPosition.graceEndsAt
          || storedPosition.graceEndsAt.getTime() > timestamp.getTime())
        ? { ...storedPosition, status: 'active' as const }
        : storedPosition;
      const routeSlots = slotsByRoute[route].map((slot) => (
        slot.status === 'grace'
        && slot.graceEndsAt
        && slot.graceEndsAt.getTime() <= timestamp.getTime()
          ? { ...slot, status: 'inactive' as const }
          : slot.status === 'qualifying'
            && slot.creditEligibleFrom.getTime() <= timestamp.getTime()
            ? { ...slot, status: 'active' as const }
            : slot
      ));
      const nextMaturity = routeSlots
        .filter((slot) => slot.status === 'qualifying' || slot.status === 'grace')
        .map((slot) => slot.creditEligibleFrom)
        .filter((date) => date.getTime() > timestamp.getTime())
        .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
      const round = rounds[route];
      const source = sources[route];
      const requirement = round ? candidateRequirement(round) : initialRequirement(route);
      const available = source.route === 'uki'
        ? BigInt(source.totalUkiRaw)
        : BigInt(source.originalCukiePoints);
      const unit = requirement.route === 'uki'
        ? BigInt(requirement.ukiRaw)
        : BigInt(requirement.nftPoints);
      const achieved = available / unit;
      const maxReached = achieved >= BigInt(5);
      const deficit = maxReached ? BigInt(0) : ((achieved + BigInt(1)) * unit) - available;
      const protectedTarget = BigInt(storedPosition?.protectedSlots ?? 0);
      const preserveDeficit = protectedTarget > achieved
        ? (protectedTarget * unit) - available
        : BigInt(0);
      const requirementDeficit = (value: bigint): CukieMasterRequirement => (
        requirement.route === 'uki'
          ? { route: 'uki', ukiRaw: value.toString() }
          : { route: 'nft', nftPoints: Number(value) }
      );
      return [route, {
        position,
        slots: routeSlots,
        nextSlotRequirement: requirement,
        currentRequirement: round?.requirement ?? initialRequirement(route),
        pendingRequirement: round?.pendingRequirement ?? null,
        requirementGraceEndsAt: round?.graceEndsAt ?? null,
        deficitToNextSlot: !source.completeness.complete || maxReached
          ? null
          : requirementDeficit(deficit),
        deficitToPreserveSlots: !source.completeness.complete || preserveDeficit === BigInt(0)
          ? null
          : requirementDeficit(preserveDeficit),
        countdownEndsAt: nextMaturity,
        source,
        sourceCompleteness: sources[route].completeness,
      }];
    })) as CukieMasterWalletStatus['routes'],
    totals: {
      desiredSlots: positions.reduce((sum, item) => sum + item.desiredSlots, 0),
      allocatedSlots: ROUTES.reduce((sum, route) => {
        const position = byRoute[route];
        return sum + (position?.status === 'grace'
          && position.graceEndsAt
          && position.graceEndsAt <= timestamp ? 0 : position?.allocatedSlots ?? 0);
      }, 0),
      maxPotentialSlots: 10 as const,
    },
  };
  };

  if (repository) return read(repository);
  return mongoCukieMasterTransactionRunner(read);
}

export async function listCreditEligibleCukieMasterSlots(
  periodStart: Date,
  repository?: CukieMasterRepository,
) {
  const timestamp = validDate(periodStart);
  if (repository) return repository.listCreditEligible(timestamp);
  return mongoCukieMasterTransactionRunner((repo) => repo.listCreditEligible(timestamp));
}

export const listCreditEligibleCukieMasterPositions = listCreditEligibleCukieMasterSlots;
