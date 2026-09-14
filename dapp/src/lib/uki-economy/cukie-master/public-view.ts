import type { CukieMasterWalletStatus } from './types';

const NON_RETRYABLE_NFT_INDEXER_WARNING_FRAGMENTS = [
  'dead letters',
  'incidente canonico',
  'no coincide con la configuracion publica',
  'no esta activo',
  'es invalido',
  'es invalida',
  'no esta completa',
] as const;

export function publicCukieMasterNftIndexerStatus(
  completeness: CukieMasterWalletStatus['routes']['nft']['sourceCompleteness'],
) {
  if (completeness.complete) return 'ready' as const;
  const hasExplicitFailure = completeness.warnings.some((warning) => {
    const normalized = warning.toLowerCase();
    return NON_RETRYABLE_NFT_INDEXER_WARNING_FRAGMENTS.some((fragment) => (
      normalized.includes(fragment)
    ));
  });
  return hasExplicitFailure ? 'unavailable' as const : 'syncing' as const;
}

export function visibleCukieMasterNftInventory<T extends {
  blockers: string[];
  custody: 'wallet' | 'cukie_master_nft_vault';
  canWithdraw: boolean;
}>(inventory: T[]) {
  return inventory.filter((asset) => (
    !asset.blockers.includes('second_generation')
    || asset.custody === 'cukie_master_nft_vault'
    || asset.canWithdraw
  ));
}

export function publicCukieMasterRouteStatus(
  route: CukieMasterWalletStatus['routes']['uki'],
) {
  const position = route.position;
  const qualifiedSlots = (() => {
    try {
      const available = route.source.route === 'uki'
        ? BigInt(route.source.totalUkiRaw)
        : BigInt(route.source.originalCukiePoints);
      const requirement = route.nextSlotRequirement.route === 'uki'
        ? BigInt(route.nextSlotRequirement.ukiRaw)
        : BigInt(route.nextSlotRequirement.nftPoints);
      if (requirement <= BigInt(0)) return null;
      return Number(available / requirement > BigInt(5) ? BigInt(5) : available / requirement);
    } catch {
      return null;
    }
  })();
  const balanceQualifiedSlots = route.source.route === 'uki'
    && route.source.completeness.complete
    ? qualifiedSlots
    : null;
  const previewSlots = route.sourceCompleteness.complete
    ? qualifiedSlots
    : null;
  const publicSourceComplete = route.source.route === 'uki'
    ? route.source.completeness.complete
    : route.sourceCompleteness.complete;
  const positionShapeValid = position
    ? previewSlots !== null
      && Number.isSafeInteger(position.desiredSlots)
      && Number.isSafeInteger(position.allocatedSlots)
      && Number.isSafeInteger(position.protectedSlots)
      && position.desiredSlots === previewSlots
      && position.desiredSlots >= 0
      && position.desiredSlots <= 5
      && position.allocatedSlots >= 0
      && position.allocatedSlots <= 5
      && position.protectedSlots >= 0
      && position.protectedSlots <= position.allocatedSlots
      && position.allocatedSlots <= Math.max(position.desiredSlots, position.protectedSlots)
    : previewSlots === 0;
  const positionMatchesSource = position
    ? positionShapeValid
      && position.sourceHash === route.source.sourceHash
      && position.roundId === route.roundId
      && position.ruleVersion === route.ruleVersion
    : positionShapeValid;
  const liveSlots = route.slots.filter((slot) => slot.status !== 'inactive');
  const liveOrdinals = new Set(liveSlots.map((slot) => slot.ordinal));
  const slotsMatchSource = liveSlots.length === (position?.allocatedSlots ?? 0)
    && liveOrdinals.size === liveSlots.length
    && liveSlots.every((slot) => (
      slot.ordinal >= 1
      && slot.ordinal <= (position?.allocatedSlots ?? 0)
      && slot.sourceHash === route.source.sourceHash
      && slot.roundId === route.roundId
      && slot.ruleVersion === route.ruleVersion
    ));
  const projectionFresh = route.sourceCompleteness.complete
    && positionMatchesSource
    && slotsMatchSource;
  const synchronizing = route.sourceCompleteness.complete && !projectionFresh;
  const publicPosition = projectionFresh ? position : null;
  const publicSlots = projectionFresh ? liveSlots : [];
  return {
    position: publicPosition ? {
      route: publicPosition.route,
      status: publicPosition.status,
      desiredSlots: publicPosition.desiredSlots,
      allocatedSlots: publicPosition.allocatedSlots,
      protectedSlots: publicPosition.protectedSlots,
      qualifiedSince: publicPosition.qualifiedSince ?? null,
      activeFrom: publicPosition.activeFrom ?? null,
      waitlistedAt: publicPosition.waitlistedAt ?? null,
      inactiveAt: publicPosition.inactiveAt ?? null,
      graceEndsAt: publicPosition.graceEndsAt ?? null,
      requirement: publicPosition.requirementSnapshot,
      pendingRequirement: publicPosition.pendingRequirementSnapshot ?? null,
      ruleVersion: publicPosition.ruleVersion,
      roundId: publicPosition.roundId,
    } : null,
    slots: publicSlots.map((slot) => ({
      route: slot.route,
      ordinal: slot.ordinal,
      eligibilityEpoch: slot.eligibilityEpoch,
      status: slot.status,
      qualifiedSince: slot.qualifiedSince,
      creditEligibleFrom: slot.creditEligibleFrom,
      inactiveAt: slot.inactiveAt ?? null,
      graceEndsAt: slot.graceEndsAt ?? null,
      ruleVersion: slot.ruleVersion,
      roundId: slot.roundId,
    })),
    nextSlotRequirement: route.nextSlotRequirement,
    currentRequirement: route.currentRequirement,
    pendingRequirement: route.pendingRequirement,
    requirementGraceEndsAt: route.requirementGraceEndsAt,
    deficitToNextSlot: route.deficitToNextSlot,
    deficitToPreserveSlots: projectionFresh ? route.deficitToPreserveSlots : null,
    countdownEndsAt: projectionFresh ? route.countdownEndsAt : null,
    projectionFresh,
    synchronizing,
    previewSlots,
    balanceQualifiedSlots,
    source: {
      complete: publicSourceComplete,
      status: publicSourceComplete ? 'available' : 'unavailable',
      route: route.source.route,
      ...(route.source.route === 'uki' ? {
        totalUkiRaw: route.source.totalUkiRaw,
        presaleLockedRaw: route.source.presaleLockedRaw,
        stakedUkiRaw: route.source.stakedUkiRaw,
      } : {
        originalCukiePoints: route.source.originalCukiePoints,
      }),
    },
  };
}
