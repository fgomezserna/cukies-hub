import { createHash } from 'node:crypto';

export const STAGING_ECONOMY_RULESET = Object.freeze({
  id: 'staging-test-v4',
  activeFrom: '2026-08-10T00:00:00.000Z',
  rewardVersion: 'rewards-staging-test-v3',
  creditVersion: 'credits-staging-test-v4',
  gameId: 'treasure-hunt',
  gameVersion: 'staging-test-v4',
  rankingVersion: 'weekly-ranking-staging-test-v1',
});

export const STAGING_ECONOMY_CONFIRMATION = 'APPLY_STAGING_TESTNET_97_RULES_V4';

const STAGING_RESOURCE_UUID = 'u4s804o4wwcckowgk0woo4wg';
const STAGING_DATABASE = 'cukieshub-new-staging';
const FALSE_RUNTIME_GATES = [
  'CHAIN_INDEXER_CUKIE_MASTER_ENABLED',
  'COMPETITION_CREDITS_RUNTIME_ENABLED',
  'GAME_ECONOMY_RUNTIME_ENABLED',
  'CUKIE_POOL_RUNTIME_ENABLED',
  'WEEKLY_RANKING_RUNTIME_ENABLED',
  'REWARD_ACCOUNTING_RUNTIME_ENABLED',
  'REWARD_DAILY_ACCOUNTING_ENABLED',
  'REWARD_WEEKLY_PAYOUT_ENABLED',
  'REWARD_POOL_TRANCHES_ENABLED',
  'REWARD_BATCH_PUBLISHER_ENABLED',
];

const SOURCE_ENVIRONMENT_KEYS = Object.freeze({
  UKI_STAKING: 'CHAIN_INDEXER_UKI_STAKING_ADDRESS',
  VESTING_VAULT: 'CHAIN_INDEXER_VESTING_VAULT_ADDRESS',
  TOKEN: 'CHAIN_INDEXER_TOKEN_ADDRESS',
  TOKEN_V2: 'CHAIN_INDEXER_TOKEN_V2_ADDRESS',
  MARKETPLACE: 'CHAIN_INDEXER_MARKETPLACE_ADDRESS',
  BRIDGE: 'CHAIN_INDEXER_BRIDGE_ADDRESS',
  CUKIE_MASTER_NFT_VAULT: 'CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_ADDRESS',
  CUKIE_POOL_NFT_VAULT: 'CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_ADDRESS',
});

export const STAGING_ECONOMY_CURSOR_EVENTS = Object.freeze({
  UKI_STAKING: ['Staked', 'Unstaked'],
  VESTING_VAULT: ['VestingCreated', 'TokensReleased'],
  TOKEN: ['Transfer', 'CukieMetadataConfigured'],
  TOKEN_V2: ['Transfer', 'CukieMetadataConfigured'],
  MARKETPLACE: [
    'TokenOnSale',
    'TokenBought',
    'MarketTokenSaleCancelled',
    'MarketTokenPriceChanged',
  ],
  BRIDGE: ['JumpInBridge', 'JumpOutBridge'],
  CUKIE_MASTER_NFT_VAULT: [
    'CukieMasterCollectionAllowedUpdated',
    'CukieMasterDeposited',
    'CukieMasterWithdrawn',
    'CukieMasterUntrackedERC721Recovered',
  ],
  CUKIE_POOL_NFT_VAULT: [
    'CukiePoolCollectionAllowedUpdated',
    'CukiePoolCalendarVersionScheduled',
    'CukiePoolDeposited',
    'CukiePoolExitRequested',
    'CukiePoolWithdrawableAtAdvanced',
    'CukiePoolWithdrawn',
    'CukiePoolUntrackedERC721Recovered',
  ],
});

const TEST_ONLY_DESTINATIONS = Object.freeze({
  creditPool: '0x9700000000000000000000000000000000000001',
  cukiePoolOriginal: '0x9700000000000000000000000000000000000002',
  cukiePoolSecondPlus: '0x9700000000000000000000000000000000000003',
  treasury: '0x9700000000000000000000000000000000000004',
  marketing: '0x9700000000000000000000000000000000000005',
  development: '0x9700000000000000000000000000000000000006',
  marketingDevelopment: '0x9700000000000000000000000000000000000005',
  supplyReduction: '0x9700000000000000000000000000000000000007',
});

const CURRENT_WEEKLY_RANKING_TIERS = Object.freeze([
  { rank: 1, rewardBps: 10_000, promotionAboveBps: null, demotionBelowBps: 7_000 },
  { rank: 2, rewardBps: 9_000, promotionAboveBps: 8_000, demotionBelowBps: 6_000 },
  { rank: 3, rewardBps: 8_000, promotionAboveBps: 7_000, demotionBelowBps: 5_000 },
  { rank: 4, rewardBps: 7_000, promotionAboveBps: 6_000, demotionBelowBps: 4_000 },
  { rank: 5, rewardBps: 6_000, promotionAboveBps: 5_000, demotionBelowBps: 3_000 },
  { rank: 6, rewardBps: 5_000, promotionAboveBps: 4_000, demotionBelowBps: 2_000 },
  { rank: 7, rewardBps: 4_000, promotionAboveBps: 3_000, demotionBelowBps: 1_000 },
  { rank: 8, rewardBps: 3_000, promotionAboveBps: 2_000, demotionBelowBps: 500 },
  { rank: 9, rewardBps: 2_000, promotionAboveBps: 1_000, demotionBelowBps: null },
]);

export class StagingEconomyRulesError extends Error {
  constructor(blockers) {
    super(`Staging economy rules rejected:\n- ${blockers.join('\n- ')}`);
    this.name = 'StagingEconomyRulesError';
    this.blockers = blockers;
  }
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key.normalize('NFC'), stableValue(child)]),
    );
  }
  return typeof value === 'string' ? value.normalize('NFC') : value;
}

export function stableStagingEconomyHash(value) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function databaseName(value, key, blockers) {
  if (!value) {
    blockers.push(`${key} is required`);
    return null;
  }
  try {
    const parsed = new URL(value);
    if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
      blockers.push(`${key} must be a MongoDB URL`);
      return null;
    }
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, '')).trim();
    if (!name) blockers.push(`${key} must include a database name`);
    return name || null;
  } catch {
    blockers.push(`${key} is not a valid MongoDB URL`);
    return null;
  }
}

function canonicalAddress(value, label, blockers) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^0x[0-9a-f]{40}$/.test(normalized) || /^0x0{40}$/.test(normalized)) {
    blockers.push(`${label} must be a non-zero EVM address`);
    return null;
  }
  return normalized;
}

function canonicalHash(value, label, blockers) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    blockers.push(`${label} must be a canonical 32-byte hash`);
    return null;
  }
  return normalized;
}

function exactEnvironment(environment, key, expected, blockers, unquote = false) {
  const raw = environment[key]?.trim();
  const value = unquote ? raw?.replace(/^(['"])(.*)\1$/, '$2') : raw;
  if (!value) blockers.push(`${key} is required`);
  else if (value !== expected) blockers.push(`${key} must equal ${expected}`);
  return value;
}

export function validateStagingEconomyEnvironment(environment = process.env) {
  const blockers = [];
  exactEnvironment(environment, 'APP_ENV', 'staging', blockers);
  exactEnvironment(environment, 'STAGING_ONLY_GUARD', 'true', blockers);
  exactEnvironment(environment, 'COOLIFY_BRANCH', 'staging', blockers, true);
  exactEnvironment(environment, 'COOLIFY_RESOURCE_UUID', STAGING_RESOURCE_UUID, blockers);
  exactEnvironment(environment, 'NEXT_PUBLIC_UKI_CHAIN_ID', '97', blockers);
  exactEnvironment(environment, 'CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID', '97', blockers);
  exactEnvironment(environment, 'CHAIN_INDEXER_DB_NAME', STAGING_DATABASE, blockers);

  const mongoName = databaseName(
    environment.CHAIN_INDEXER_MONGO_URL,
    'CHAIN_INDEXER_MONGO_URL',
    blockers,
  );
  if (mongoName && mongoName !== STAGING_DATABASE) {
    blockers.push(`CHAIN_INDEXER_MONGO_URL must target ${STAGING_DATABASE}`);
  }

  for (const gate of FALSE_RUNTIME_GATES) {
    exactEnvironment(environment, gate, 'false', blockers);
  }

  const configuredAliases = new Set(
    (environment.CHAIN_INDEXER_CONTRACT_ALIASES ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  for (const alias of Object.keys(SOURCE_ENVIRONMENT_KEYS)) {
    if (!configuredAliases.has(alias)) {
      blockers.push(`CHAIN_INDEXER_CONTRACT_ALIASES must include ${alias}`);
    }
  }

  const sourceContractAddresses = {};
  for (const [alias, key] of Object.entries(SOURCE_ENVIRONMENT_KEYS)) {
    const address = canonicalAddress(environment[key], key, blockers);
    if (address) sourceContractAddresses[alias] = address;
  }
  const addresses = Object.values(sourceContractAddresses);
  if (new Set(addresses).size !== addresses.length) {
    blockers.push('staging source contract addresses must be distinct');
  }

  if (blockers.length > 0) throw new StagingEconomyRulesError(blockers);
  return { sourceContractAddresses };
}

function buildVerifiedSources(cursors, sourceContractAddresses, now) {
  const blockers = [];
  const identities = {};
  const freshnessCutoff = new Date(now.getTime() - 15 * 60 * 1000);
  if (!Array.isArray(cursors)) {
    throw new StagingEconomyRulesError(['chain_cursors must be an array']);
  }

  for (const [alias, expectedEvents] of Object.entries(STAGING_ECONOMY_CURSOR_EVENTS)) {
    const aliasCursors = cursors.filter((cursor) => cursor.contractAlias === alias);
    const expectedIds = expectedEvents.map((eventName) => `${alias}:${eventName}`).sort();
    const actualIds = aliasCursors
      .map((cursor) => `${String(cursor.contractAlias)}:${String(cursor.eventName)}`)
      .sort();
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      blockers.push(`${alias} cursor set is incomplete or duplicated`);
      continue;
    }

    const expectedAddress = sourceContractAddresses[alias];
    const first = aliasCursors[0];
    const runtimeCodeHash = canonicalHash(
      first?.contractCodeHash,
      `${alias}.contractCodeHash`,
      blockers,
    );
    const configHash = canonicalHash(
      first?.contractConfigHash,
      `${alias}.contractConfigHash`,
      blockers,
    );
    const deploymentTxHash = canonicalHash(
      first?.contractDeploymentTxHash,
      `${alias}.contractDeploymentTxHash`,
      blockers,
    );
    const deploymentBlock = first?.contractDeploymentBlock;
    if (!Number.isSafeInteger(deploymentBlock) || deploymentBlock < 0) {
      blockers.push(`${alias}.contractDeploymentBlock must be a non-negative integer`);
    }

    for (const cursor of aliasCursors) {
      const address = canonicalAddress(
        cursor.contractAddress,
        `${alias}.${cursor.eventName}.contractAddress`,
        blockers,
      );
      if (
        address !== expectedAddress
        || cursor.bootstrapStatus !== 'verified'
        || cursor.verifiedChainId !== 97
        || cursor.contractCodeHash?.toLowerCase() !== runtimeCodeHash
        || cursor.contractConfigHash?.toLowerCase() !== configHash
        || cursor.contractDeploymentTxHash?.toLowerCase() !== deploymentTxHash
        || cursor.contractDeploymentBlock !== deploymentBlock
        || cursor.bootstrapStartBlock !== deploymentBlock
        || !(cursor.bootstrapVerifiedAt instanceof Date)
        || !(cursor.updatedAt instanceof Date)
        || cursor.updatedAt < freshnessCutoff
        || !Number.isSafeInteger(cursor.safeBlock)
        || !Number.isSafeInteger(cursor.nextBlock)
        || cursor.nextBlock <= cursor.safeBlock
      ) {
        blockers.push(`${alias}:${cursor.eventName} is not a fresh verified chain-97 cursor`);
      }
    }

    if (runtimeCodeHash && configHash && deploymentTxHash && Number.isSafeInteger(deploymentBlock)) {
      identities[alias] = { runtimeCodeHash, configHash, deploymentTxHash, deploymentBlock };
    }
  }

  if (blockers.length > 0) throw new StagingEconomyRulesError([...new Set(blockers)]);
  return identities;
}

function buildRewardRule(activeFrom, programStartsAt, now) {
  const base = {
    _id: `reward_allocations:${STAGING_ECONOMY_RULESET.rewardVersion}`,
    scope: 'reward_allocations',
    version: STAGING_ECONOMY_RULESET.rewardVersion,
    active: true,
    activeFrom,
    tokenDecimals: 18,
    runCredits: {
      unitScale: 10,
      totalUnits: 100,
      weeklyReserveUnits: 20,
      ambassadorReserveUnits: 5,
      ambassadorOrdinaryUnits: 4,
      ambassadorWeeklyUnits: 1,
      convertibleUnits: 75,
    },
    settlementBps: {
      poolCredits: 5_000,
      poolCukieWithOwnCredits: 5_000,
      poolCukieWithPoolCredits: 2_500,
    },
    rankingPlayerBps: {
      '1': 10_000,
      '2': 9_000,
      '3': 8_000,
      '4': 7_000,
      '5': 6_000,
      '6': 5_000,
      '7': 4_000,
      '8': 3_000,
      '9': 2_000,
    },
    creditPoolDaily: {
      sourceShareBps: 10_000,
      floorEnabled: true,
      floorCreditsStep: 10,
      floorAmountRaw: '750000000000000000',
    },
    emissionBudget: {
      programStartsAt,
      dayBoundarySecondUtc: 14 * 60 * 60,
      lateReservationGraceSeconds: 86_400,
      dailyCapRaw: '500000000000000000000000',
      lifetimeCapRaw: '450000000000000000000000000',
      unusedDailyCapacity: 'materialize_undistributed',
      overflowPolicy: 'block',
    },
    cukiePool: {
      cumulativeTierCount: 6,
      cumulativeTierBps: /** @type {[number, number, number, number, number, number]} */ (
        [4_500, 2_000, 1_500, 1_200, 700, 100]
      ),
    },
    undistributedBps: {
      treasury: 8_000,
      marketing: 0,
      development: 0,
      marketingDevelopment: 1_000,
      supplyReduction: 1_000,
    },
    destinations: { ...TEST_ONLY_DESTINATIONS },
  };
  return {
    ...base,
    configHash: stableStagingEconomyHash({
      scope: base.scope,
      version: base.version,
      active: base.active,
      activeFrom: base.activeFrom,
      tokenDecimals: base.tokenDecimals,
      runCredits: base.runCredits,
      settlementBps: base.settlementBps,
      rankingPlayerBps: base.rankingPlayerBps,
      creditPoolDaily: base.creditPoolDaily,
      emissionBudget: base.emissionBudget,
      cukiePool: base.cukiePool,
      undistributedBps: base.undistributedBps,
      destinations: base.destinations,
    }),
    createdAt: now,
    updatedAt: now,
  };
}

function buildCreditRule(activeFrom, now, sourceContractAddresses, identities) {
  const base = {
    _id: `competition_credits:${STAGING_ECONOMY_RULESET.creditVersion}`,
    scope: 'competition_credits',
    version: STAGING_ECONOMY_RULESET.creditVersion,
    active: true,
    activeFrom,
    cutoffHourUtc: 14,
    cutoffMinuteUtc: 0,
    // Competition credits become spendable at the 14:00 UTC boundary. UKI,
    // pool and accounting settlement remains a separate 16:00 UTC process.
    settlementHourUtc: 14,
    settlementMinuteUtc: 0,
    maxSnapshotLatenessMs: 30 * 60 * 1000,
    sourceFreshnessMs: 15 * 60 * 1000,
    expectedBscChainId: 97,
    sourceContractAddresses,
    verifiedSourceIdentities: {
      UKI_STAKING: identities.UKI_STAKING,
      VESTING_VAULT: identities.VESTING_VAULT,
    },
    creditsPerSlot: 100,
    maxSnapshotSlots: 5_000,
    maxBatchSize: 50,
    leaseDurationMs: 5 * 60 * 1000,
    reservationTtlMs: 10 * 60 * 1000,
    costs: [{ costCode: 'treasure-hunt:start', credits: 10, active: true }],
  };
  return {
    ...base,
    configHash: stableStagingEconomyHash({
      scope: base.scope,
      version: base.version,
      active: base.active,
      activeFrom: base.activeFrom,
      cutoffHourUtc: base.cutoffHourUtc,
      cutoffMinuteUtc: base.cutoffMinuteUtc,
      settlementHourUtc: base.settlementHourUtc,
      settlementMinuteUtc: base.settlementMinuteUtc,
      maxSnapshotLatenessMs: base.maxSnapshotLatenessMs,
      sourceFreshnessMs: base.sourceFreshnessMs,
      expectedBscChainId: base.expectedBscChainId,
      sourceContractAddresses: base.sourceContractAddresses,
      verifiedSourceIdentities: base.verifiedSourceIdentities,
      creditsPerSlot: base.creditsPerSlot,
      maxSnapshotSlots: base.maxSnapshotSlots,
      maxBatchSize: base.maxBatchSize,
      leaseDurationMs: base.leaseDurationMs,
      reservationTtlMs: base.reservationTtlMs,
      costs: base.costs,
    }),
    createdAt: now,
    updatedAt: now,
  };
}

function buildGameRule(activeFrom, now, rewardRule, creditRule) {
  const snapshot = {
    gameId: STAGING_ECONOMY_RULESET.gameId,
    version: STAGING_ECONOMY_RULESET.gameVersion,
    sessionTtlMs: 10 * 60 * 1000,
    operationLeaseMs: 30_000,
    credit: {
      required: true,
      consumeOnSettle: true,
      costCode: 'treasure-hunt:start',
      creditRuleVersion: creditRule.version,
      creditRuleConfigHash: creditRule.configHash,
    },
    reward: {
      rewardRuleVersion: rewardRule.version,
      rewardRuleConfigHash: rewardRule.configHash,
      maxConvertibleRaw: '7500000000000000000',
    },
    cukie: {
      required: true,
      consumeOnSettle: true,
      minAssets: 0,
      maxAssets: 0,
      role: 'own_or_pool',
      selectionPolicy: 'owned_bsc_quota_then_pool_v1',
    },
    calculation: {
      scoreCapRaw: '3000',
      weightNumeratorRaw: '2500000000000000',
      weightDenominatorRaw: '1',
    },
  };
  return {
    _id: `${snapshot.gameId}:${snapshot.version}`,
    scope: 'game_economy',
    ...snapshot,
    configHash: stableStagingEconomyHash(snapshot),
    active: true,
    activeFrom,
    createdAt: now,
    updatedAt: now,
  };
}

function buildRankingRule(activeFrom, now) {
  const base = {
    _id: `weekly_arena_ranking:${STAGING_ECONOMY_RULESET.rankingVersion}`,
    scope: 'weekly_arena_ranking',
    version: STAGING_ECONOMY_RULESET.rankingVersion,
    active: true,
    activeFrom,
    initialRank: 5,
    minPromotionGames: 20,
    minDemotionGames: 10,
    maxWeeklyMovement: 2,
    performanceBasis: 'sum_capped_score_over_sum_score_cap',
    eligibleCreditBucket: 'pool',
    tiers: CURRENT_WEEKLY_RANKING_TIERS.map((tier) => ({ ...tier })),
  };
  return {
    ...base,
    configHash: stableStagingEconomyHash({
      scope: base.scope,
      version: base.version,
      active: base.active,
      activeFrom: base.activeFrom,
      activeUntil: null,
      initialRank: base.initialRank,
      minPromotionGames: base.minPromotionGames,
      minDemotionGames: base.minDemotionGames,
      maxWeeklyMovement: base.maxWeeklyMovement,
      performanceBasis: base.performanceBasis,
      eligibleCreditBucket: base.eligibleCreditBucket,
      tiers: base.tiers,
    }),
    createdAt: now,
    updatedAt: now,
  };
}

export function buildStagingEconomyRuleSet({
  environment = process.env,
  cursors,
  now = new Date(),
  creditBaselineAt = now,
}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new StagingEconomyRulesError(['now must be a valid Date']);
  }
  const { sourceContractAddresses } = validateStagingEconomyEnvironment(environment);
  const identities = buildVerifiedSources(cursors, sourceContractAddresses, now);
  const activeFrom = new Date(STAGING_ECONOMY_RULESET.activeFrom);
  if (!(creditBaselineAt instanceof Date) || Number.isNaN(creditBaselineAt.getTime())) {
    throw new StagingEconomyRulesError(['creditBaselineAt must be a valid Date']);
  }
  const creditBaseline = new Date(Math.max(activeFrom.getTime(), creditBaselineAt.getTime()));
  let creditActiveFrom = new Date(Date.UTC(
    creditBaseline.getUTCFullYear(),
    creditBaseline.getUTCMonth(),
    creditBaseline.getUTCDate(),
    14,
    0,
  ));
  if (creditActiveFrom < creditBaseline) {
    creditActiveFrom = new Date(creditActiveFrom.getTime() + 86_400_000);
  }
  const reward = buildRewardRule(creditActiveFrom, activeFrom, now);
  const credit = buildCreditRule(creditActiveFrom, now, sourceContractAddresses, identities);
  const game = buildGameRule(creditActiveFrom, now, reward, credit);
  const ranking = buildRankingRule(activeFrom, now);
  return { reward, credit, game, ranking };
}

export function ruleSemanticHash(kind, rule) {
  if (kind === 'reward' || kind === 'credit' || kind === 'ranking') {
    return stableStagingEconomyHash({
      _id: rule._id,
      scope: rule.scope,
      version: rule.version,
      active: rule.active,
      activeFrom: rule.activeFrom,
      activeUntil: rule.activeUntil ?? null,
      configHash: rule.configHash,
    });
  }
  if (kind === 'game') {
    return stableStagingEconomyHash({
      _id: rule._id,
      scope: rule.scope,
      gameId: rule.gameId,
      version: rule.version,
      active: rule.active,
      activeFrom: rule.activeFrom,
      activeUntil: rule.activeUntil ?? null,
      configHash: rule.configHash,
    });
  }
  throw new StagingEconomyRulesError([`unknown rule kind ${kind}`]);
}
