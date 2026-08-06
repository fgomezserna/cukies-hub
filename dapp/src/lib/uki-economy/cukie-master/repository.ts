import 'server-only';

import type { ClientSession, Db, OptionalUnlessRequiredId } from 'mongodb';
import { keccak256, stringToHex } from 'viem';

import {
  getCukieMasterNftEntitlementFromDb,
  type CukieMasterNftRouteSummary,
} from '@/lib/nft-inventory';

import { DomainConflictError } from '../errors';
import type { CukieMasterRoute } from '../rules';
import {
  CUKIE_MASTER_PRESALE_VESTING_SCHEDULE_ID,
  createInitialRouteRound,
} from './rules';
import type {
  CukieMasterPosition,
  CukieMasterPositionEvent,
  CukieMasterIndexerHealth,
  CukieMasterRouteCapacity,
  CukieMasterRouteRound,
  CukieMasterSlot,
} from './types';

export type PresaleParticipantRawDocument = {
  _id?: unknown;
  normalizedWalletAddress?: string;
  totalUkiPurchasedRaw?: unknown;
  updatedAt?: unknown;
  lastPurchaseEventId?: unknown;
};

export type UkiStakingPositionRawDocument = {
  _id?: unknown;
  walletNormalized?: string;
  accountBalanceRaw?: unknown;
  updatedAt?: unknown;
  lastEventId?: unknown;
};

export type UkiStakingStateRawDocument = {
  _id: string;
  totalStakedRaw?: unknown;
  updatedAt?: unknown;
  lastEventId?: unknown;
  bootstrapVerifiedAt?: unknown;
  bootstrapSafeBlock?: unknown;
  bootstrapSafeBlockHash?: unknown;
  verifiedChainId?: unknown;
  contractCodeHash?: unknown;
  contractConfigHash?: unknown;
  contractDeploymentBlock?: unknown;
  bootstrapStartBlock?: unknown;
  contractAddressNormalized?: unknown;
  materializationStatus?: unknown;
  materializedTotalRaw?: unknown;
  materializedThroughEventId?: unknown;
  materializedThroughBlockNumber?: unknown;
  materializedThroughLogIndex?: unknown;
  materializedThroughSafeBlock?: unknown;
  materializedThroughSafeBlockHash?: unknown;
};

export type ExpectedIndexerContractConfig = {
  contractAddress: string;
  bootstrapStartBlock: number;
  contractDeploymentBlock: number;
  contractCodeHash: string;
  contractConfigHash: string;
};

const CUKIE_MASTER_NFT_ADDRESSES = {
  TOKEN: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
  MARKETPLACE: '0x2C291aD4C491aCA75Fb3fb5a17465bBC871FBF91',
  BRIDGE: '0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E',
} as const;

function environmentInteger(name: string) {
  const value = process.env[name]?.trim();
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function environmentCodeHash(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  return value && /^0x[0-9a-f]{64}$/.test(value) ? value : undefined;
}

function firstEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function expectedContractConfig(input: {
  chainId: 56 | 97;
  address?: string;
  startBlock?: number;
  deploymentBlock?: number;
  codeHash?: string;
}): ExpectedIndexerContractConfig | undefined {
  if (
    !input.address
    || !/^0x[0-9a-f]{40}$/i.test(input.address)
    || /^0x0{40}$/i.test(input.address)
    || !Number.isSafeInteger(input.startBlock)
    || !Number.isSafeInteger(input.deploymentBlock)
    || input.startBlock !== input.deploymentBlock
    || !input.codeHash
  ) return undefined;
  const contractAddress = input.address.toLowerCase();
  const contractCodeHash = input.codeHash.toLowerCase();
  return {
    contractAddress,
    bootstrapStartBlock: input.startBlock!,
    contractDeploymentBlock: input.deploymentBlock!,
    contractCodeHash,
    contractConfigHash: keccak256(stringToHex(JSON.stringify({
      chainId: input.chainId,
      address: contractAddress,
      deploymentBlock: input.deploymentBlock,
      contractCodeHash,
    }))).toLowerCase(),
  };
}

export function expectedBscChainId(): 56 | 97 | undefined {
  const value = environmentInteger('CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID');
  return value === 56 || value === 97 ? value : undefined;
}

function expectedUkiContractConfigs(chainId: 56 | 97) {
  return {
    UKI_STAKING: expectedContractConfig({
      chainId,
      address: firstEnvironmentValue(
        'CHAIN_INDEXER_UKI_STAKING_ADDRESS',
        'NEXT_PUBLIC_UKI_STAKING_ADDRESS',
      ),
      startBlock: environmentInteger('CHAIN_INDEXER_UKI_STAKING_START_BSC_BLOCK'),
      deploymentBlock: environmentInteger('CHAIN_INDEXER_UKI_STAKING_DEPLOYMENT_BSC_BLOCK'),
      codeHash: environmentCodeHash('CHAIN_INDEXER_UKI_STAKING_RUNTIME_CODE_HASH'),
    }),
    VESTING_VAULT: expectedContractConfig({
      chainId,
      address: firstEnvironmentValue(
        'CHAIN_INDEXER_VESTING_VAULT_ADDRESS',
        'NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS',
        'NEXT_PUBLIC_VESTING_VAULT_ADDRESS',
      ),
      startBlock: environmentInteger('CHAIN_INDEXER_VESTING_VAULT_START_BSC_BLOCK'),
      deploymentBlock: environmentInteger('CHAIN_INDEXER_VESTING_VAULT_DEPLOYMENT_BSC_BLOCK'),
      codeHash: environmentCodeHash('CHAIN_INDEXER_VESTING_VAULT_RUNTIME_CODE_HASH'),
    }),
  };
}

function expectedNftContractConfigs(chainId: 56 | 97) {
  return {
    TOKEN: expectedContractConfig({
      chainId,
      address: CUKIE_MASTER_NFT_ADDRESSES.TOKEN,
      startBlock: environmentInteger('CHAIN_INDEXER_TOKEN_START_BSC_BLOCK'),
      deploymentBlock: environmentInteger('CHAIN_INDEXER_TOKEN_DEPLOYMENT_BSC_BLOCK'),
      codeHash: environmentCodeHash('CHAIN_INDEXER_TOKEN_RUNTIME_CODE_HASH'),
    }),
    MARKETPLACE: expectedContractConfig({
      chainId,
      address: CUKIE_MASTER_NFT_ADDRESSES.MARKETPLACE,
      startBlock: environmentInteger('CHAIN_INDEXER_MARKETPLACE_START_BSC_BLOCK'),
      deploymentBlock: environmentInteger('CHAIN_INDEXER_MARKETPLACE_DEPLOYMENT_BSC_BLOCK'),
      codeHash: environmentCodeHash('CHAIN_INDEXER_MARKETPLACE_RUNTIME_CODE_HASH'),
    }),
    BRIDGE: expectedContractConfig({
      chainId,
      address: CUKIE_MASTER_NFT_ADDRESSES.BRIDGE,
      startBlock: environmentInteger('CHAIN_INDEXER_BRIDGE_START_BSC_BLOCK'),
      deploymentBlock: environmentInteger('CHAIN_INDEXER_BRIDGE_DEPLOYMENT_BSC_BLOCK'),
      codeHash: environmentCodeHash('CHAIN_INDEXER_BRIDGE_RUNTIME_CODE_HASH'),
    }),
  };
}

export function stakingMaterializationMatchesState(
  state: UkiStakingStateRawDocument | null,
  expected: ExpectedIndexerContractConfig,
  expectedChainId: 56 | 97,
) {
  if (!state || state._id.toLowerCase() !== expected.contractAddress) return false;
  const total = typeof state.totalStakedRaw === 'string' && /^\d+$/.test(state.totalStakedRaw)
    ? state.totalStakedRaw
    : null;
  if (
    total === null
    || state.materializationStatus !== 'consistent'
    || state.materializedTotalRaw !== total
    || state.verifiedChainId !== expectedChainId
    || state.contractAddressNormalized !== expected.contractAddress
    || state.bootstrapStartBlock !== expected.bootstrapStartBlock
    || state.contractDeploymentBlock !== expected.contractDeploymentBlock
    || state.contractCodeHash !== expected.contractCodeHash
    || state.contractConfigHash !== expected.contractConfigHash
  ) return false;
  if (typeof state.lastEventId === 'string') {
    return state.materializedThroughEventId === state.lastEventId
      && Number.isSafeInteger(state.materializedThroughBlockNumber)
      && Number.isSafeInteger(state.materializedThroughLogIndex);
  }
  return total === '0'
    && state.bootstrapVerifiedAt instanceof Date
    && Number.isSafeInteger(state.materializedThroughSafeBlock)
    && typeof state.materializedThroughSafeBlockHash === 'string'
    && /^0x[0-9a-f]{64}$/i.test(state.materializedThroughSafeBlockHash);
}

export function stakingBalancesMatchState(
  positions: UkiStakingPositionRawDocument[],
  state: UkiStakingStateRawDocument | null,
) {
  if (!state || typeof state.totalStakedRaw !== 'string' || !/^\d+$/.test(state.totalStakedRaw)) {
    return false;
  }
  let total = BigInt(0);
  for (const position of positions) {
    if (typeof position.accountBalanceRaw !== 'string' || !/^\d+$/.test(position.accountBalanceRaw)) {
      return false;
    }
    total += BigInt(position.accountBalanceRaw);
  }
  if (total !== BigInt(state.totalStakedRaw)) return false;
  if (positions.length > 0 || state.totalStakedRaw !== '0' || typeof state.lastEventId === 'string') {
    return true;
  }
  return state.bootstrapVerifiedAt instanceof Date
    && Number.isSafeInteger(state.bootstrapSafeBlock)
    && typeof state.bootstrapSafeBlockHash === 'string'
    && /^0x[0-9a-f]{64}$/i.test(state.bootstrapSafeBlockHash)
    && (state.verifiedChainId === 56 || state.verifiedChainId === 97)
    && typeof state.contractCodeHash === 'string'
    && /^0x[0-9a-f]{64}$/i.test(state.contractCodeHash)
    && typeof state.contractConfigHash === 'string'
    && /^0x[0-9a-f]{64}$/i.test(state.contractConfigHash);
}

export type UkiVestingLedgerHealthDocument = {
  eventId?: unknown;
  beneficiaryNormalized?: unknown;
  scheduleId?: unknown;
  allocatedAmountRaw?: unknown;
  releasedAmountRaw?: unknown;
  blockNumber?: unknown;
  logIndex?: unknown;
};

function safeInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

export function vestingLedgerMatchesPositions(
  ledger: UkiVestingLedgerHealthDocument[],
  positions: UkiVestingPositionRawDocument[],
) {
  const aggregates = new Map<string, {
    count: number;
    totalAllocated: bigint;
    totalReleased: bigint;
    latestEventId: string;
    latestBlockNumber: number;
    latestLogIndex: number;
  }>();
  for (const item of ledger) {
    const scheduleId = typeof item.scheduleId === 'string' ? item.scheduleId : null;
    const eventId = typeof item.eventId === 'string' ? item.eventId : null;
    const allocatedRaw = typeof item.allocatedAmountRaw === 'string'
      && /^\d+$/.test(item.allocatedAmountRaw)
      ? item.allocatedAmountRaw
      : null;
    const releasedRaw = typeof item.releasedAmountRaw === 'string'
      && /^\d+$/.test(item.releasedAmountRaw)
      ? item.releasedAmountRaw
      : null;
    const blockNumber = safeInteger(item.blockNumber);
    const logIndex = safeInteger(item.logIndex);
    if (
      !scheduleId
      || !eventId
      || allocatedRaw === null
      || releasedRaw === null
      || blockNumber === null
      || logIndex === null
    ) return false;
    const current = aggregates.get(scheduleId);
    const isLatest = !current
      || blockNumber > current.latestBlockNumber
      || (blockNumber === current.latestBlockNumber && logIndex > current.latestLogIndex);
    aggregates.set(scheduleId, {
      count: (current?.count ?? 0) + 1,
      totalAllocated: (current?.totalAllocated ?? BigInt(0)) + BigInt(allocatedRaw),
      totalReleased: (current?.totalReleased ?? BigInt(0)) + BigInt(releasedRaw),
      latestEventId: isLatest ? eventId : current!.latestEventId,
      latestBlockNumber: isLatest ? blockNumber : current!.latestBlockNumber,
      latestLogIndex: isLatest ? logIndex : current!.latestLogIndex,
    });
  }

  const matchedSchedules = new Set<string>();
  for (const position of positions) {
    const scheduleId = typeof position.scheduleId === 'string' ? position.scheduleId : null;
    if (!scheduleId || matchedSchedules.has(scheduleId)) return false;
    const aggregate = aggregates.get(scheduleId);
    if (!aggregate || aggregate.totalReleased > aggregate.totalAllocated) return false;
    if (
      position.lastEventId !== aggregate.latestEventId
      || position.ledgerEventCount !== aggregate.count
      || position.lastBlockNumber !== aggregate.latestBlockNumber
      || position.lastLogIndex !== aggregate.latestLogIndex
      || position.totalAllocatedRaw !== aggregate.totalAllocated.toString()
      || position.releasedRaw !== aggregate.totalReleased.toString()
      || position.lockedRaw !== (aggregate.totalAllocated - aggregate.totalReleased).toString()
    ) return false;
    matchedSchedules.add(scheduleId);
  }
  return matchedSchedules.size === aggregates.size;
}

export type UkiVestingPositionRawDocument = {
  _id?: unknown;
  walletNormalized?: string;
  scheduleId?: string;
  totalAllocatedRaw?: unknown;
  releasedRaw?: unknown;
  lockedRaw?: unknown;
  updatedAt?: unknown;
  lastEventId?: unknown;
  lastBlockNumber?: unknown;
  lastLogIndex?: unknown;
  ledgerEventCount?: unknown;
};

export function projectionSafetyWarnings(input: {
  pendingEvents: number;
  lastEventsProjected: boolean;
  vestingLedgerConsistent: boolean;
}) {
  const warnings: string[] = [];
  if (input.pendingEvents > 0) warnings.push('Existen eventos UKI sin status projected.');
  if (!input.lastEventsProjected) {
    warnings.push('El lastEventId de una fuente UKI no esta projected.');
  }
  if (!input.vestingLedgerConsistent) {
    warnings.push('Una posicion vesting no refleja el ultimo ledger.');
  }
  return warnings;
}

export const EXPECTED_UKI_CURSOR_IDS = [
  'UKI_STAKING:Staked',
  'UKI_STAKING:Unstaked',
  'VESTING_VAULT:VestingCreated',
  'VESTING_VAULT:TokensReleased',
] as const;

export const EXPECTED_NFT_CURSOR_IDS = [
  'TOKEN:Transfer',
  'MARKETPLACE:TokenOnSale',
  'MARKETPLACE:TokenBought',
  'MARKETPLACE:MarketTokenSaleCancelled',
  'MARKETPLACE:MarketTokenPriceChanged',
  'BRIDGE:JumpInBridge',
  'BRIDGE:JumpOutBridge',
] as const;

export function operationalIndexerHealthWarnings(input: {
  checkedAt: Date;
  latestSuccessEndedAt: Date | null;
  latestErrorEndedAt: Date | null;
  checkpoint: {
    checkedAt?: Date;
    safeBlockNumber?: number;
    safeBlockHash?: string;
  } | null;
  cursors: Array<{
    chain?: unknown;
    contractAlias?: unknown;
    contractAddress?: unknown;
    eventName?: unknown;
    updatedAt?: unknown;
    safeBlock?: unknown;
    nextBlock?: unknown;
    bootstrapStatus?: unknown;
    bootstrapStartBlock?: unknown;
    bootstrapVerifiedAt?: unknown;
    verifiedChainId?: unknown;
    contractCodeHash?: unknown;
    contractDeploymentBlock?: unknown;
    contractConfigHash?: unknown;
  }>;
  expectedChainId: 56 | 97 | undefined;
  expectedContractConfigs: Record<string, ExpectedIndexerContractConfig | undefined>;
  expectedCursorIds?: readonly string[];
}) {
  const warnings: string[] = [];
  const freshnessCutoff = new Date(input.checkedAt.getTime() - 15 * 60 * 1000);
  const checkpointHealthy = input.checkpoint?.checkedAt instanceof Date
    && input.checkpoint.checkedAt >= freshnessCutoff
    && Number.isSafeInteger(input.checkpoint.safeBlockNumber)
    && typeof input.checkpoint.safeBlockHash === 'string'
    && /^0x[0-9a-f]{64}$/i.test(input.checkpoint.safeBlockHash);
  if (
    !input.latestSuccessEndedAt
    || input.latestSuccessEndedAt < freshnessCutoff
    || (
      input.latestErrorEndedAt
      && input.latestErrorEndedAt > input.latestSuccessEndedAt
    )
  ) warnings.push('El ultimo run BSC no es reciente o saludable.');

  const healthyCursors = new Set(input.cursors
    .filter((cursor) => {
      const alias = typeof cursor.contractAlias === 'string' ? cursor.contractAlias : '';
      const expected = input.expectedContractConfigs[alias];
      return Boolean(expected)
        && cursor.chain === 'BSC'
        && cursor.updatedAt instanceof Date
        && cursor.updatedAt >= freshnessCutoff
        && cursor.safeBlock === input.checkpoint?.safeBlockNumber
        && Number.isSafeInteger(cursor.nextBlock)
        && Number(cursor.nextBlock) > Number(input.checkpoint?.safeBlockNumber)
        && cursor.bootstrapStatus === 'verified'
        && cursor.bootstrapStartBlock === expected!.bootstrapStartBlock
        && cursor.bootstrapVerifiedAt instanceof Date
        && cursor.verifiedChainId === input.expectedChainId
        && typeof cursor.contractAddress === 'string'
        && cursor.contractAddress.toLowerCase() === expected!.contractAddress
        && cursor.contractCodeHash === expected!.contractCodeHash
        && cursor.contractDeploymentBlock === expected!.contractDeploymentBlock
        && cursor.contractConfigHash === expected!.contractConfigHash
        && checkpointHealthy;
    })
    .map((cursor) => `${String(cursor.contractAlias)}:${String(cursor.eventName)}`));
  for (const cursorId of input.expectedCursorIds ?? EXPECTED_UKI_CURSOR_IDS) {
    if (!healthyCursors.has(cursorId)) {
      warnings.push(`Cursor BSC ${cursorId} ausente, stale, sin verificacion o con backlog.`);
    }
  }
  if (!checkpointHealthy) warnings.push('Checkpoint canonico BSC ausente o stale.');
  return warnings;
}

export interface CukieMasterRepository {
  findActiveRound(route: CukieMasterRoute): Promise<CukieMasterRouteRound | null>;
  ensureActiveRound(route: CukieMasterRoute, now: Date): Promise<CukieMasterRouteRound>;
  replaceRound(
    route: CukieMasterRoute,
    expectedRevision: number,
    next: CukieMasterRouteRound,
  ): Promise<CukieMasterRouteRound | null>;
  fenceRound(
    route: CukieMasterRoute,
    expectedRevision: number,
    expectedRoundId: string,
    now: Date,
  ): Promise<boolean>;
  ensureCapacity(
    route: CukieMasterRoute,
    roundId: string,
    totalSlots: number,
    now: Date,
  ): Promise<CukieMasterRouteCapacity>;
  replaceCapacity(
    route: CukieMasterRoute,
    expectedRevision: number,
    next: CukieMasterRouteCapacity,
  ): Promise<CukieMasterRouteCapacity | null>;
  findPosition(
    walletNormalized: string,
    route: CukieMasterRoute,
  ): Promise<CukieMasterPosition | null>;
  replacePosition(
    previous: CukieMasterPosition | null,
    next: CukieMasterPosition,
  ): Promise<CukieMasterPosition | null>;
  findEvent(idempotencyKey: string): Promise<CukieMasterPositionEvent | null>;
  insertEvent(event: CukieMasterPositionEvent): Promise<void>;
  findPresaleParticipant(walletNormalized: string): Promise<PresaleParticipantRawDocument | null>;
  findUkiStakingPosition(walletNormalized: string): Promise<UkiStakingPositionRawDocument | null>;
  findPresaleVestingPosition(
    walletNormalized: string,
  ): Promise<UkiVestingPositionRawDocument | null>;
  getUkiIndexerHealth(walletNormalized: string, now: Date): Promise<CukieMasterIndexerHealth>;
  getNftIndexerHealth(now: Date): Promise<CukieMasterIndexerHealth>;
  getNftEntitlement(
    walletAddress: string,
    now: Date,
  ): Promise<CukieMasterNftRouteSummary>;
  listWalletPositions(walletNormalized: string): Promise<CukieMasterPosition[]>;
  findFirstWaitlisted(route: CukieMasterRoute): Promise<CukieMasterPosition | null>;
  findWalletRouteSlots(
    walletNormalized: string,
    route: CukieMasterRoute,
  ): Promise<CukieMasterSlot[]>;
  findSlot(slotId: string): Promise<CukieMasterSlot | null>;
  replaceSlot(previous: CukieMasterSlot | null, next: CukieMasterSlot): Promise<CukieMasterSlot | null>;
  listCreditEligible(periodStart: Date): Promise<CukieMasterSlot[]>;
  listAllocatedRoutePositions(
    route: CukieMasterRoute,
    limit: number,
  ): Promise<CukieMasterPosition[]>;
  listMaturedQualifyingSlots(input: {
    now: Date;
    afterId?: string;
    limit: number;
  }): Promise<CukieMasterSlot[]>;
  listRoutePositions(input: {
    route: CukieMasterRoute;
    allocatedOnly: boolean;
    after?: { id: string; waitlistedAt: Date };
    limit: number;
  }): Promise<CukieMasterPosition[]>;
}

export type CukieMasterTransactionRunner = <T>(
  work: (repository: CukieMasterRepository) => Promise<T>,
) => Promise<T>;

function mongoOptions(session?: ClientSession) {
  return session ? { session } : {};
}

export function createMongoCukieMasterRepository(
  db: Db,
  session?: ClientSession,
): CukieMasterRepository {
  const rounds = db.collection<CukieMasterRouteRound>('cukie_master_route_rounds');
  const capacities = db.collection<CukieMasterRouteCapacity>('cukie_master_route_capacity');
  const positions = db.collection<CukieMasterPosition>('cukie_master_positions');
  const slots = db.collection<CukieMasterSlot>('cukie_master_slots');
  const events = db.collection<CukieMasterPositionEvent>('cukie_master_position_events');
  const options = mongoOptions(session);

  return {
    findActiveRound: (route) => rounds.findOne({ _id: route, status: 'active' }, options),
    async ensureActiveRound(route, now) {
      const initial = createInitialRouteRound(route, now);
      await rounds.updateOne(
        { _id: route },
        { $setOnInsert: initial },
        { ...options, upsert: true },
      );
      const round = await rounds.findOne({ _id: route, status: 'active' }, options);
      if (!round) throw new DomainConflictError(`No existe ronda activa para ${route}.`);
      return round;
    },
    async replaceRound(route, expectedRevision, next) {
      const { _id: _id, ...replacement } = next;
      return rounds.findOneAndReplace(
        { _id: route, status: 'active', revision: expectedRevision },
        replacement as OptionalUnlessRequiredId<CukieMasterRouteRound>,
        { ...options, returnDocument: 'after' },
      );
    },
    async fenceRound(route, expectedRevision, expectedRoundId, now) {
      const result = await rounds.updateOne(
        {
          _id: route,
          status: 'active',
          revision: expectedRevision,
          roundId: expectedRoundId,
        },
        {
          $inc: { fenceToken: 1 },
          $set: { lastFencedAt: now },
        },
        options,
      );
      return result.matchedCount === 1;
    },
    async ensureCapacity(route, roundId, totalSlots, now) {
      const initial: CukieMasterRouteCapacity = {
        _id: route,
        route,
        roundId,
        totalSlots,
        allocatedSlots: 0,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      };
      await capacities.updateOne(
        { _id: route },
        { $setOnInsert: initial },
        { ...options, upsert: true },
      );
      const capacity = await capacities.findOne({ _id: route }, options);
      if (!capacity) throw new DomainConflictError(`No existe capacidad para ${route}.`);
      if (capacity.roundId !== roundId || capacity.totalSlots !== totalSlots) {
        throw new DomainConflictError(`La capacidad de ${route} no corresponde a la ronda activa.`);
      }
      return capacity;
    },
    async replaceCapacity(route, expectedRevision, next) {
      const { _id: _id, ...replacement } = next;
      return capacities.findOneAndReplace(
        { _id: route, revision: expectedRevision },
        replacement as OptionalUnlessRequiredId<CukieMasterRouteCapacity>,
        { ...options, returnDocument: 'after' },
      );
    },
    findPosition: (walletNormalized, route) => positions.findOne(
      { walletNormalized, route },
      options,
    ),
    async replacePosition(previous, next) {
      if (!previous) {
        await positions.insertOne(next, options);
        return next;
      }
      const { _id: _id, ...replacement } = next;
      return positions.findOneAndReplace(
        { _id: previous._id, revision: previous.revision },
        replacement as OptionalUnlessRequiredId<CukieMasterPosition>,
        { ...options, returnDocument: 'after' },
      );
    },
    findEvent: (idempotencyKey) => events.findOne({ idempotencyKey }, options),
    async insertEvent(event) {
      await events.insertOne(event, options);
    },
    findPresaleParticipant: (walletNormalized) => db
      .collection<PresaleParticipantRawDocument>('presale_participants')
      .findOne({ normalizedWalletAddress: walletNormalized }, options),
    findUkiStakingPosition: (walletNormalized) => db
      .collection<UkiStakingPositionRawDocument>('uki_staking_positions')
      .findOne({ walletNormalized }, options),
    findPresaleVestingPosition: (walletNormalized) => db
      .collection<UkiVestingPositionRawDocument>('uki_vesting_positions')
      .findOne({
        walletNormalized,
        scheduleId: CUKIE_MASTER_PRESALE_VESTING_SCHEDULE_ID,
      }, options),
    async getUkiIndexerHealth(walletNormalized, checkedAt) {
      const aliases = ['UKI_STAKING', 'VESTING_VAULT'];
      const chainId = expectedBscChainId();
      const expectedConfigs: Record<string, ExpectedIndexerContractConfig | undefined> = chainId
        ? expectedUkiContractConfigs(chainId)
        : {};
      const latestSuccess = await db.collection('chain_indexer_runs').findOne(
        { type: { $in: ['loop', 'ingest-once'] } },
        { ...options, sort: { endedAt: -1 } },
      );
      const latestError = await db.collection('chain_indexer_runs').findOne(
        { type: 'loop-error', failedContractAliases: { $in: aliases } },
        { ...options, sort: { endedAt: -1 } },
      );
      const cursors = await db.collection<{
        chain?: unknown;
        contractAlias?: unknown;
        contractAddress?: unknown;
        eventName?: unknown;
        updatedAt?: unknown;
        safeBlock?: unknown;
        nextBlock?: unknown;
        bootstrapStatus?: unknown;
        bootstrapStartBlock?: unknown;
        bootstrapVerifiedAt?: unknown;
        verifiedChainId?: unknown;
        contractCodeHash?: unknown;
        contractDeploymentBlock?: unknown;
        contractConfigHash?: unknown;
      }>('chain_cursors').find({
          chain: 'BSC',
          contractAlias: { $in: aliases },
        }, { ...options, maxTimeMS: 2_000 }).limit(EXPECTED_UKI_CURSOR_IDS.length + 1).toArray();
      const deadLetter = await db.collection('chain_dead_letters').findOne({
        contractAlias: { $in: aliases },
      }, { ...options, projection: { _id: 1 }, maxTimeMS: 2_000 });
      const pendingEvent = await db.collection('chain_events').findOne({
          contractAlias: { $in: aliases },
          status: { $ne: 'projected' },
        }, { ...options, projection: { _id: 1 }, maxTimeMS: 2_000 });
      const incident = await db.collection('chain_integrity_incidents')
        .findOne({
          status: 'open',
          $or: [
            { contractAlias: { $in: aliases } },
            {
              chain: 'BSC',
              type: {
                $in: [
                  'canonical_checkpoint_mismatch',
                  'canonical_range_mismatch',
                  'canonical_progress_conflict',
                  'economy_progress_conflict',
                  'economy_transaction_failure',
                ],
              },
            },
          ],
        }, { ...options, projection: { _id: 1 }, maxTimeMS: 2_000 });
      const checkpoint = await db.collection<{
        _id: string;
        checkedAt?: Date;
        safeBlockNumber?: number;
        safeBlockHash?: string;
      }>('chain_bsc_checkpoints')
        .findOne({ _id: 'canonical-safe' }, options);
      const staking = await db.collection<UkiStakingPositionRawDocument>('uki_staking_positions')
        .findOne({ walletNormalized }, options);
      const expectedStaking = expectedConfigs.UKI_STAKING;
      const stakingState = expectedStaking
        ? await db.collection<UkiStakingStateRawDocument>('uki_staking_state')
            .findOne({ _id: expectedStaking.contractAddress }, options)
        : null;
      const vesting = await db.collection<UkiVestingPositionRawDocument>('uki_vesting_positions')
        .find({ walletNormalized }, { ...options, maxTimeMS: 2_000 })
        .limit(1_001)
        .toArray();
      const ledger = await db.collection<UkiVestingLedgerHealthDocument>('uki_vesting_events')
        .find({ beneficiaryNormalized: walletNormalized }, options)
        .sort({ blockNumber: -1, logIndex: -1 })
        .limit(10_001)
        .maxTimeMS(2_000)
        .toArray();
      const endedAt = latestSuccess?.endedAt instanceof Date ? latestSuccess.endedAt : null;
      const errorEndedAt = latestError?.endedAt instanceof Date ? latestError.endedAt : null;
      const warnings = operationalIndexerHealthWarnings({
        checkedAt,
        latestSuccessEndedAt: endedAt,
        latestErrorEndedAt: errorEndedAt,
        checkpoint,
        cursors,
        expectedChainId: chainId,
        expectedContractConfigs: expectedConfigs,
      });
      if (!chainId) warnings.push('CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID es invalido.');
      if (!expectedConfigs.UKI_STAKING || !expectedConfigs.VESTING_VAULT) {
        warnings.push('La identidad/configuracion historica UKI no esta completa.');
      }
      if (deadLetter) warnings.push('Existen dead letters de economia UKI.');
      if (incident) warnings.push('Existe un incidente de integridad abierto.');
      if (
        !chainId
        || !expectedStaking
        || !stakingMaterializationMatchesState(stakingState, expectedStaking, chainId)
      ) {
        warnings.push('uki_staking_state no tiene una materializacion consistente para el contrato configurado.');
      }
      const lastEventIds = [
        typeof stakingState?.lastEventId === 'string' ? stakingState.lastEventId : null,
        typeof staking?.lastEventId === 'string' ? staking.lastEventId : null,
        ...vesting.map((item) => typeof item.lastEventId === 'string' ? item.lastEventId : null),
      ].filter((item): item is string => Boolean(item));
      let lastEventsProjected = !staking || typeof staking.lastEventId === 'string';
      if (lastEventIds.length > 0) {
        const projected = await db.collection<{ _id: string; status: string }>('chain_events').countDocuments({
          _id: { $in: [...new Set(lastEventIds)] },
          status: 'projected',
        }, options);
        if (projected !== new Set(lastEventIds).size) {
          lastEventsProjected = false;
        }
      }
      const vestingLedgerConsistent = ledger.length <= 10_000
        && vesting.length <= 1_000
        && vestingLedgerMatchesPositions(ledger, vesting);
      warnings.push(...projectionSafetyWarnings({
        pendingEvents: pendingEvent ? 1 : 0,
        lastEventsProjected,
        vestingLedgerConsistent,
      }));
      return { healthy: warnings.length === 0, warnings, checkedAt };
    },
    async getNftIndexerHealth(checkedAt) {
      const aliases = ['TOKEN', 'MARKETPLACE', 'BRIDGE'];
      const chainId = expectedBscChainId();
      const expectedConfigs: Record<string, ExpectedIndexerContractConfig | undefined> = chainId
        ? expectedNftContractConfigs(chainId)
        : {};
      const cukieMasterEnabled = process.env.CHAIN_INDEXER_CUKIE_MASTER_ENABLED
        ?.trim().toLowerCase() === 'true';
      const latestSuccess = await db.collection('chain_indexer_runs').findOne(
        { type: { $in: ['loop', 'ingest-once'] } },
        { ...options, sort: { endedAt: -1 } },
      );
      const latestError = await db.collection('chain_indexer_runs').findOne(
        { type: 'loop-error', failedContractAliases: { $in: aliases } },
        { ...options, sort: { endedAt: -1 } },
      );
      const cursors = await db.collection<{
        chain?: unknown;
        contractAlias?: unknown;
        contractAddress?: unknown;
        eventName?: unknown;
        updatedAt?: unknown;
        safeBlock?: unknown;
        nextBlock?: unknown;
        bootstrapStatus?: unknown;
        bootstrapStartBlock?: unknown;
        bootstrapVerifiedAt?: unknown;
        verifiedChainId?: unknown;
        contractCodeHash?: unknown;
        contractDeploymentBlock?: unknown;
        contractConfigHash?: unknown;
      }>('chain_cursors').find({
        chain: 'BSC',
        contractAlias: { $in: aliases },
      }, { ...options, maxTimeMS: 2_000 }).limit(EXPECTED_NFT_CURSOR_IDS.length + 1).toArray();
      const deadLetter = await db.collection('chain_dead_letters').findOne({
        contractAlias: { $in: aliases },
      }, { ...options, projection: { _id: 1 }, maxTimeMS: 2_000 });
      const pendingEvent = await db.collection('chain_events').findOne({
        contractAlias: { $in: aliases },
        status: { $in: ['ingested', 'projecting', 'failed'] },
      }, { ...options, projection: { _id: 1 }, maxTimeMS: 2_000 });
      const commonCanonicalIncident = await db.collection('chain_integrity_incidents')
        .findOne({
          status: 'open',
          $or: [
            { chain: 'BSC', contractAlias: { $in: aliases } },
            {
              chain: 'BSC',
              type: {
                $in: [
                  'canonical_checkpoint_mismatch',
                  'canonical_range_mismatch',
                  'canonical_progress_conflict',
                  'economy_progress_conflict',
                  'economy_transaction_failure',
                ],
              },
            },
          ],
        }, { ...options, projection: { _id: 1 }, maxTimeMS: 2_000 });
      const checkpoint = await db.collection<{
        _id: string;
        checkedAt?: Date;
        safeBlockNumber?: number;
        safeBlockHash?: string;
      }>('chain_bsc_checkpoints').findOne({ _id: 'canonical-safe' }, options);
      const warnings = operationalIndexerHealthWarnings({
        checkedAt,
        latestSuccessEndedAt: latestSuccess?.endedAt instanceof Date ? latestSuccess.endedAt : null,
        latestErrorEndedAt: latestError?.endedAt instanceof Date ? latestError.endedAt : null,
        checkpoint,
        cursors,
        expectedChainId: chainId,
        expectedContractConfigs: expectedConfigs,
        expectedCursorIds: EXPECTED_NFT_CURSOR_IDS,
      });
      if (!cukieMasterEnabled) {
        warnings.push('CHAIN_INDEXER_CUKIE_MASTER_ENABLED no esta activo.');
      }
      if (!chainId) warnings.push('CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID es invalido.');
      if (!expectedConfigs.TOKEN || !expectedConfigs.MARKETPLACE || !expectedConfigs.BRIDGE) {
        warnings.push('La identidad/configuracion historica NFT de Cukie Master no esta completa.');
      }
      if (deadLetter) warnings.push('Existen dead letters del pipeline NFT.');
      if (pendingEvent) warnings.push('Existen eventos NFT pendientes de proyeccion.');
      if (commonCanonicalIncident) {
        warnings.push('Existe un incidente canonico BSC que afecta al pipeline NFT.');
      }
      return { healthy: warnings.length === 0, warnings, checkedAt };
    },
    getNftEntitlement: (walletAddress, now) => getCukieMasterNftEntitlementFromDb({
      walletAddress,
      now,
      db,
      session,
    }),
    listWalletPositions: (walletNormalized) => positions
      .find({ walletNormalized }, options)
      .sort({ route: 1 })
      .toArray(),
    findFirstWaitlisted: (route) => positions.findOne(
      {
        route,
        waitlistedAt: { $type: 'date' },
        $expr: { $gt: ['$desiredSlots', '$allocatedSlots'] },
      },
      { ...options, sort: { waitlistedAt: 1, _id: 1 } },
    ),
    findWalletRouteSlots: (walletNormalized, route) => slots
      .find({ walletNormalized, route }, options)
      .sort({ ordinal: 1 })
      .toArray(),
    findSlot: (slotId) => slots.findOne({ _id: slotId }, options),
    async replaceSlot(previous, next) {
      if (!previous) {
        await slots.insertOne(next, options);
        return next;
      }
      const { _id: _id, ...replacement } = next;
      return slots.findOneAndReplace(
        { _id: previous._id, revision: previous.revision },
        replacement as OptionalUnlessRequiredId<CukieMasterSlot>,
        { ...options, returnDocument: 'after' },
      );
    },
    listCreditEligible: (periodStart) => slots.find({
      creditEligibleFrom: { $lte: periodStart },
      $or: [
        {
          status: { $in: ['active', 'qualifying'] },
          $or: [
            { graceEndsAt: { $exists: false } },
            { graceEndsAt: { $gt: periodStart } },
          ],
        },
        { status: 'grace', graceEndsAt: { $gt: periodStart } },
      ],
    }, options).sort({ walletNormalized: 1, route: 1, ordinal: 1 }).toArray(),
    listAllocatedRoutePositions: (route, limit) => positions
      .find({ route, allocatedSlots: { $gt: 0 } }, options)
      .sort({ walletNormalized: 1 })
      .limit(limit)
      .toArray(),
    listMaturedQualifyingSlots: ({ now, afterId, limit }) => slots
      .find({
        status: 'qualifying',
        creditEligibleFrom: { $lte: now },
        ...(afterId ? { _id: { $gt: afterId } } : {}),
      }, options)
      .sort({ _id: 1 })
      .limit(limit)
      .toArray(),
    listRoutePositions: ({ route, allocatedOnly, after, limit }) => positions.find({
      route,
      ...(allocatedOnly ? { allocatedSlots: { $gt: 0 } } : {
        waitlistedAt: { $type: 'date' },
        $expr: { $gt: ['$desiredSlots', '$allocatedSlots'] },
      }),
      ...(after && allocatedOnly ? { _id: { $gt: after.id } } : {}),
      ...(after && !allocatedOnly ? {
        $or: [
          { waitlistedAt: { $gt: after.waitlistedAt } },
          { waitlistedAt: after.waitlistedAt, _id: { $gt: after.id } },
        ],
      } : {}),
    }, options).sort(
      allocatedOnly
        ? { _id: 1 }
        : { waitlistedAt: 1, _id: 1 },
    ).limit(limit).toArray(),
  };
}

export const mongoCukieMasterTransactionRunner: CukieMasterTransactionRunner = async (work) => {
  const { withEconomyTransaction } = await import('@/lib/indexer-db/mongodb');
  return withEconomyTransaction((db, session) => work(createMongoCukieMasterRepository(db, session)));
};

export async function createReadonlyMongoCukieMasterRepository() {
  const { getEconomyDb } = await import('@/lib/indexer-db/mongodb');
  return createMongoCukieMasterRepository(await getEconomyDb());
}
