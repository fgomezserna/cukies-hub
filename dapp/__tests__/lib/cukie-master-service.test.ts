import {
  normalizeCukiesInventoryDocument,
  summarizeCukieMasterNftEntitlement,
  type CukieMasterNftRouteSummary,
} from '@/lib/nft-inventory';
import {
  createCukieMasterService,
  getCukieMasterWalletStatus,
  listCreditEligibleCukieMasterPositions,
  readCukieMasterSources,
} from '@/lib/uki-economy/cukie-master/service';
import {
  createCukieMasterActivationJobs,
  createCukieMasterWaitlistJobs,
} from '@/lib/uki-economy/cukie-master/jobs';
import {
  EXPECTED_CUSTODIAL_NFT_CURSOR_IDS,
  EXPECTED_NFT_CURSOR_IDS,
  cukieMasterNftHealthScope,
  expectedBscChainId,
  operationalIndexerHealthWarnings,
  projectionSafetyWarnings,
  stakingBalancesMatchState,
  stakingMaterializationMatchesState,
  vestingLedgerMatchesPositions,
} from '@/lib/uki-economy/cukie-master/repository';
import type {
  CukieMasterRepository,
  PresaleParticipantRawDocument,
  UkiStakingPositionRawDocument,
  UkiVestingPositionRawDocument,
} from '@/lib/uki-economy/cukie-master/repository';
import { createInitialRouteRound } from '@/lib/uki-economy/cukie-master/rules';
import type {
  CukieMasterPosition,
  CukieMasterPositionEvent,
  CukieMasterRouteCapacity,
  CukieMasterRouteRound,
  CukieMasterSlot,
} from '@/lib/uki-economy/cukie-master/types';
import type { CukieMasterRoute } from '@/lib/uki-economy/rules';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-07-10T00:00:00.000Z');
const rawUki = (value: number) => (BigInt(value) * (BigInt(10) ** BigInt(18))).toString();
const mutableAllocationSnapshot = (state: Pick<MemoryState, 'positions' | 'slots' | 'capacities'>) => (
  JSON.stringify({
    positions: [...state.positions.entries()],
    slots: [...state.slots.entries()],
    capacities: [...state.capacities.entries()],
  })
);

type MemoryState = {
  rounds: Map<CukieMasterRoute, CukieMasterRouteRound>;
  capacities: Map<CukieMasterRoute, CukieMasterRouteCapacity>;
  positions: Map<string, CukieMasterPosition>;
  slots: Map<string, CukieMasterSlot>;
  events: Map<string, CukieMasterPositionEvent>;
  presale: Map<string, PresaleParticipantRawDocument>;
  staking: Map<string, UkiStakingPositionRawDocument>;
  vesting: Map<string, UkiVestingPositionRawDocument>;
  nftPoints: Map<string, number>;
  nftSummaries: Map<string, CukieMasterNftRouteSummary>;
  ukiIndexerHealthy: boolean;
  nftIndexerHealthy: boolean;
  fenceRoundHook?: (route: CukieMasterRoute) => void;
};

function emptyNftSummary(walletAddress: string, points: number): CukieMasterNftRouteSummary {
  return {
    walletAddress,
    walletNormalized: walletAddress.toLowerCase(),
    originalCukiePoints: points,
    nftAssetIds: [],
    eligibleAssets: [],
    rejectedAssets: [],
    slotPreview: {
      ukiSlots: 0,
      nftSlots: Math.min(Math.floor(points / 3), 5),
      totalSlots: Math.min(Math.floor(points / 3), 5),
      maxTotalSlots: 10,
    },
  };
}

function memoryRepository() {
  const state: MemoryState = {
    rounds: new Map(),
    capacities: new Map(),
    positions: new Map(),
    slots: new Map(),
    events: new Map(),
    presale: new Map(),
    staking: new Map(),
    vesting: new Map(),
    nftPoints: new Map(),
    nftSummaries: new Map(),
    ukiIndexerHealthy: true,
    nftIndexerHealthy: true,
  };
  const positionKey = (wallet: string, route: CukieMasterRoute) => `${wallet}:${route}`;
  const repo: CukieMasterRepository = {
    async findActiveRound(route) {
      return state.rounds.get(route) ?? null;
    },
    async ensureActiveRound(route, timestamp) {
      const existing = state.rounds.get(route);
      if (existing) return existing;
      const created = createInitialRouteRound(route, timestamp);
      state.rounds.set(route, created);
      return created;
    },
    async replaceRound(route, revision, next) {
      if (state.rounds.get(route)?.revision !== revision) return null;
      state.rounds.set(route, next);
      return next;
    },
    async fenceRound(route, revision, roundId, timestamp) {
      state.fenceRoundHook?.(route);
      const current = state.rounds.get(route);
      if (
        !current
        || current.status !== 'active'
        || current.revision !== revision
        || current.roundId !== roundId
      ) return false;
      state.rounds.set(route, {
        ...current,
        fenceToken: (current.fenceToken ?? 0) + 1,
        lastFencedAt: timestamp,
      });
      return true;
    },
    async ensureCapacity(route, roundId, totalSlots, timestamp) {
      const existing = state.capacities.get(route);
      if (existing) return existing;
      const created: CukieMasterRouteCapacity = {
        _id: route,
        route,
        roundId,
        totalSlots,
        allocatedSlots: 0,
        revision: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.capacities.set(route, created);
      return created;
    },
    async replaceCapacity(route, revision, next) {
      if (state.capacities.get(route)?.revision !== revision) return null;
      state.capacities.set(route, next);
      return next;
    },
    async findPosition(wallet, route) {
      return state.positions.get(positionKey(wallet, route)) ?? null;
    },
    async replacePosition(previous, next) {
      const key = positionKey(next.walletNormalized, next.route);
      const current = state.positions.get(key);
      if (previous && current?.revision !== previous.revision) return null;
      if (!previous && current) return null;
      state.positions.set(key, next);
      return next;
    },
    async findEvent(key) {
      return state.events.get(key) ?? null;
    },
    async insertEvent(event) {
      if (state.events.has(event.idempotencyKey)) throw new Error('duplicate event');
      state.events.set(event.idempotencyKey, event);
    },
    async findPresaleParticipant(wallet) {
      return state.presale.get(wallet) ?? null;
    },
    async findUkiStakingPosition(wallet) {
      return state.staking.get(wallet) ?? null;
    },
    async findPresaleVestingPosition(wallet) {
      return state.vesting.get(wallet) ?? null;
    },
    async getUkiIndexerHealth(_wallet, checkedAt) {
      return {
        healthy: state.ukiIndexerHealthy,
        warnings: state.ukiIndexerHealthy ? [] : ['UKI integrity incident open'],
        checkedAt,
      };
    },
    async getNftIndexerHealth(checkedAt) {
      return {
        healthy: state.nftIndexerHealthy,
        warnings: state.nftIndexerHealthy ? [] : ['NFT pipeline stale'],
        checkedAt,
      };
    },
    async getNftEntitlement(walletAddress) {
      return state.nftSummaries.get(walletAddress.toLowerCase())
        ?? emptyNftSummary(walletAddress, state.nftPoints.get(walletAddress.toLowerCase()) ?? 0);
    },
    async listWalletPositions(wallet) {
      return [...state.positions.values()].filter((item) => item.walletNormalized === wallet);
    },
    async findFirstWaitlisted(route) {
      return [...state.positions.values()]
        .filter((item) => (
          item.route === route
          && item.desiredSlots > item.allocatedSlots
          && item.waitlistedAt
        ))
        .sort((left, right) => (
          left.waitlistedAt!.getTime() - right.waitlistedAt!.getTime()
          || left._id.localeCompare(right._id)
        ))[0] ?? null;
    },
    async findWalletRouteSlots(wallet, route) {
      return [...state.slots.values()]
        .filter((item) => item.walletNormalized === wallet && item.route === route)
        .sort((left, right) => left.ordinal - right.ordinal);
    },
    async findSlot(slotId) {
      return state.slots.get(slotId) ?? null;
    },
    async replaceSlot(previous, next) {
      const current = state.slots.get(next._id);
      if (previous && current?.revision !== previous.revision) return null;
      if (!previous && current) return null;
      state.slots.set(next._id, next);
      return next;
    },
    async listCreditEligible(periodStart) {
      return [...state.slots.values()].filter((item) => (
        item.creditEligibleFrom <= periodStart
        && (
          ((item.status === 'active' || item.status === 'qualifying')
            && (!item.graceEndsAt || item.graceEndsAt > periodStart))
          || (item.status === 'grace' && Boolean(item.graceEndsAt && item.graceEndsAt > periodStart))
        )
      ));
    },
    async listAllocatedRoutePositions(route, limit) {
      return [...state.positions.values()]
        .filter((item) => item.route === route && item.allocatedSlots > 0)
        .sort((left, right) => left.walletNormalized.localeCompare(right.walletNormalized))
        .slice(0, limit);
    },
    async listMaturedQualifyingSlots({ now: maturedAt, afterId, limit }) {
      return [...state.slots.values()]
        .filter((item) => (
          item.status === 'qualifying'
          && item.creditEligibleFrom <= maturedAt
          && (!afterId || item._id > afterId)
        ))
        .sort((left, right) => left._id.localeCompare(right._id))
        .slice(0, limit);
    },
    async listRoutePositions({ route, allocatedOnly, after, limit }) {
      return [...state.positions.values()]
        .filter((item) => item.route === route)
        .filter((item) => allocatedOnly
          ? item.allocatedSlots > 0
          : item.desiredSlots > item.allocatedSlots && Boolean(item.waitlistedAt))
        .sort((left, right) => allocatedOnly
          ? left._id.localeCompare(right._id)
          : (left.waitlistedAt?.getTime() ?? 0) - (right.waitlistedAt?.getTime() ?? 0)
            || left.walletNormalized.localeCompare(right.walletNormalized))
        .filter((item) => !after || (
          allocatedOnly
            ? item._id > after.id
            : item.waitlistedAt!.getTime() > after.waitlistedAt.getTime()
              || (item.waitlistedAt!.getTime() === after.waitlistedAt.getTime() && item._id > after.id)
        ))
        .slice(0, limit);
    },
  };
  return { repo, state };
}

describe('Cukie Master canonical sources', () => {
  it('no presupone mainnet cuando falta la identidad de cadena', () => {
    const previous = process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID;
    try {
      delete process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID;
      expect(expectedBscChainId()).toBeUndefined();
      process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = '97';
      expect(expectedBscChainId()).toBe(97);
    } finally {
      if (previous === undefined) delete process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID;
      else process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = previous;
    }
  });

  it('blocks consumption of a ledger/position partial write until chain_events is projected', () => {
    expect(projectionSafetyWarnings({
      pendingEvents: 1,
      lastEventsProjected: false,
      vestingLedgerConsistent: false,
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('sin status projected'),
      expect.stringContaining('lastEventId'),
      expect.stringContaining('ultimo ledger'),
    ]));
  });

  it('rejects a corrupt vesting aggregate even when lastEventId still matches', () => {
    const ledger = [
      {
        eventId: 'vesting-created', beneficiaryNormalized: '0xabc', scheduleId: 'schedule',
        allocatedAmountRaw: '100', releasedAmountRaw: '0', blockNumber: 10, logIndex: 0,
      },
      {
        eventId: 'tokens-released', beneficiaryNormalized: '0xabc', scheduleId: 'schedule',
        allocatedAmountRaw: '0', releasedAmountRaw: '40', blockNumber: 12, logIndex: 1,
      },
    ];
    const canonical = {
      walletNormalized: '0xabc',
      scheduleId: 'schedule',
      lastEventId: 'tokens-released',
      lastBlockNumber: 12,
      lastLogIndex: 1,
      ledgerEventCount: 2,
      totalAllocatedRaw: '100',
      releasedRaw: '40',
      lockedRaw: '60',
    };
    expect(vestingLedgerMatchesPositions(ledger, [canonical])).toBe(true);
    expect(vestingLedgerMatchesPositions(ledger, [{
      ...canonical,
      totalAllocatedRaw: '999',
      lockedRaw: '959',
    }])).toBe(false);
    expect(vestingLedgerMatchesPositions(ledger, [{
      ...canonical,
      ledgerEventCount: 1,
    }])).toBe(false);
    expect(vestingLedgerMatchesPositions([
      ...ledger,
      {
        eventId: 'other-wallet', beneficiaryNormalized: '0xdef', scheduleId: 'schedule',
        allocatedAmountRaw: '25', releasedAmountRaw: '0', blockNumber: 13, logIndex: 0,
      },
    ], [
      canonical,
      {
        ...canonical,
        walletNormalized: '0xdef',
        lastEventId: 'other-wallet',
        lastBlockNumber: 13,
        lastLogIndex: 0,
        ledgerEventCount: 1,
        totalAllocatedRaw: '25',
        releasedRaw: '0',
        lockedRaw: '25',
      },
    ])).toBe(true);
  });
  it('counts locked vesting plus stake exactly, never total purchases plus stake', async () => {
    const { repo, state } = memoryRepository();
    const wallet = '0xABC';
    state.presale.set(wallet.toLowerCase(), {
      _id: 'presale',
      totalUkiPurchasedRaw: rawUki(100),
    });
    state.vesting.set(wallet.toLowerCase(), {
      _id: 'vesting',
      totalAllocatedRaw: rawUki(100),
      releasedRaw: rawUki(40),
    });
    state.staking.set(wallet.toLowerCase(), {
      _id: 'staking',
      accountBalanceRaw: rawUki(20),
    });

    const sources = await readCukieMasterSources(repo, wallet, wallet.toLowerCase(), now);

    expect(sources.uki.totalUkiRaw).toBe(
      rawUki(80),
    );
    expect(sources.uki.presaleLockedRaw).toBe(rawUki(60));
    expect(sources.uki.completeness.complete).toBe(true);

    state.vesting.set(wallet.toLowerCase(), {
      _id: 'vesting', totalAllocatedRaw: rawUki(100), releasedRaw: rawUki(100),
    });
    state.staking.set(wallet.toLowerCase(), { _id: 'staking', accountBalanceRaw: rawUki(100) });
    const restaked = await readCukieMasterSources(repo, wallet, wallet.toLowerCase(), now);
    expect(restaked.uki.totalUkiRaw).toBe(rawUki(100));
    expect(restaked.uki.presaleLockedRaw).toBe('0');
  });

  it('does not require vesting for referral-only rows but fails closed for a direct buyer', async () => {
    const { repo, state } = memoryRepository();
    state.presale.set('0xsponsor', { _id: 'sponsor-row' });
    state.staking.set('0xsponsor', { accountBalanceRaw: rawUki(20_000) });
    const sponsor = await readCukieMasterSources(repo, '0xSponsor', '0xsponsor', now);
    expect(sponsor.uki).toMatchObject({
      totalUkiRaw: rawUki(20_000),
      completeness: { complete: true },
    });

    state.presale.set('0xinvalid', { _id: 'invalid-row', totalUkiPurchasedRaw: 'invalid' });
    state.staking.set('0xinvalid', { accountBalanceRaw: rawUki(20_000) });
    const invalidDirect = await readCukieMasterSources(repo, '0xInvalid', '0xinvalid', now);
    expect(invalidDirect.uki.completeness).toMatchObject({
      complete: false,
      presaleRaw: false,
    });
    expect(invalidDirect.uki.completeness.warnings[0]).toContain('totalUkiPurchasedRaw');
    expect(invalidDirect.uki.totalUkiRaw).toBe('0');

    state.presale.set('0xbuyer', { _id: 'buyer-row', totalUkiPurchasedRaw: rawUki(20_000) });
    state.staking.set('0xbuyer', { accountBalanceRaw: rawUki(20_000) });
    const buyer = await readCukieMasterSources(repo, '0xBuyer', '0xbuyer', now);
    expect(buyer.uki.completeness.complete).toBe(false);
    expect(buyer.uki.totalUkiRaw).toBe('0');
  });

  it('uses zero and records incompleteness when a present canonical raw field is invalid', async () => {
    const { repo, state } = memoryRepository();
    state.presale.set('0xabc', { _id: 'presale', totalUkiPurchasedRaw: rawUki(20_000) });
    state.vesting.set('0xabc', { _id: 'vesting', totalAllocatedRaw: 20_000, releasedRaw: '0' });

    const sources = await readCukieMasterSources(repo, '0xABC', '0xabc', now);

    expect(sources.uki.presaleLockedRaw).toBe('0');
    expect(sources.uki.completeness.complete).toBe(false);
    expect(sources.uki.completeness.warnings[0]).toContain('totalAllocatedRaw');
  });

  it('fails closed when indexer projection health is incomplete', async () => {
    const { repo, state } = memoryRepository();
    state.vesting.set('0xabc', { totalAllocatedRaw: rawUki(100_000), releasedRaw: '0' });
    state.ukiIndexerHealthy = false;
    const sources = await readCukieMasterSources(repo, '0xABC', '0xabc', now);
    expect(sources.uki.totalUkiRaw).toBe('0');
    expect(sources.uki.completeness).toMatchObject({ complete: false, indexerHealth: false });
    expect(sources.uki.completeness.warnings).toContain('UKI integrity incident open');
    expect(sources.nft).toMatchObject({
      originalCukiePoints: 0,
      nftAssetIds: [],
      completeness: { complete: true, indexerHealth: true },
    });

    state.ukiIndexerHealthy = true;
    state.nftIndexerHealthy = false;
    const nftFailure = await readCukieMasterSources(repo, '0xABC', '0xabc', now);
    expect(nftFailure.uki.completeness.indexerHealth).toBe(true);
    expect(nftFailure.nft.completeness).toMatchObject({ complete: false, indexerHealth: false });
    expect(nftFailure.nft.completeness.warnings).toContain('NFT pipeline stale');
  });

  it('marks a newer loop error, backlog, or pending future bootstrap unhealthy', () => {
    const checkpoint = {
      checkedAt: now,
      safeBlockNumber: 100,
      safeBlockHash: `0x${'a'.repeat(64)}`,
    };
    const addresses = {
      UKI_STAKING: '0x00000000000000000000000000000000000000aa',
      VESTING_VAULT: '0x00000000000000000000000000000000000000bb',
    } as const;
    const expectedContractConfigs = Object.fromEntries(
      Object.entries(addresses).map(([alias, contractAddress]) => [alias, {
        contractAddress,
        bootstrapStartBlock: 1,
        contractDeploymentBlock: 1,
        contractCodeHash: `0x${'1'.repeat(64)}`,
        contractDeploymentTxHash: `0x${'4'.repeat(64)}`,
        contractConfigHash: `0x${'2'.repeat(64)}`,
      }]),
    );
    const expectedIdentity = { expectedChainId: 56 as const, expectedContractConfigs };
    const cursors = [
      ['UKI_STAKING', 'Staked'],
      ['UKI_STAKING', 'Unstaked'],
      ['VESTING_VAULT', 'VestingCreated'],
      ['VESTING_VAULT', 'TokensReleased'],
    ].map(([contractAlias, eventName]) => ({
      chain: 'BSC',
      contractAlias,
      contractAddress: addresses[contractAlias as keyof typeof addresses],
      eventName,
      updatedAt: now,
      safeBlock: 100,
      nextBlock: 101,
      bootstrapStatus: 'verified',
      bootstrapStartBlock: 1,
      bootstrapVerifiedAt: now,
      verifiedChainId: 56,
      contractCodeHash: `0x${'1'.repeat(64)}`,
      contractDeploymentBlock: 1,
      contractDeploymentTxHash: `0x${'4'.repeat(64)}`,
      contractConfigHash: `0x${'2'.repeat(64)}`,
    }));
    expect(operationalIndexerHealthWarnings({
      checkedAt: now,
      latestSuccessEndedAt: new Date(now.getTime() - 2_000),
      latestErrorEndedAt: new Date(now.getTime() - 1_000),
      checkpoint,
      cursors,
      ...expectedIdentity,
    })).toContain('El ultimo run BSC no es reciente o saludable.');
    cursors[0].nextBlock = 100;
    expect(operationalIndexerHealthWarnings({
      checkedAt: now,
      latestSuccessEndedAt: now,
      latestErrorEndedAt: null,
      checkpoint,
      cursors,
      ...expectedIdentity,
    })).toContain('Cursor BSC UKI_STAKING:Staked ausente, stale, sin verificacion o con backlog.');
    cursors[0].nextBlock = 1_000;
    cursors[0].bootstrapStatus = 'pending';
    expect(operationalIndexerHealthWarnings({
      checkedAt: now,
      latestSuccessEndedAt: now,
      latestErrorEndedAt: null,
      checkpoint,
      cursors,
      ...expectedIdentity,
    })).toContain('Cursor BSC UKI_STAKING:Staked ausente, stale, sin verificacion o con backlog.');

    cursors[0].bootstrapStatus = 'verified';
    cursors[0].chain = 'TRON';
    expect(operationalIndexerHealthWarnings({
      checkedAt: now,
      latestSuccessEndedAt: now,
      latestErrorEndedAt: null,
      checkpoint,
      cursors,
      ...expectedIdentity,
    })).toContain('Cursor BSC UKI_STAKING:Staked ausente, stale, sin verificacion o con backlog.');
    cursors[0].chain = 'BSC';
    cursors[0].contractAddress = addresses.VESTING_VAULT;
    expect(operationalIndexerHealthWarnings({
      checkedAt: now,
      latestSuccessEndedAt: now,
      latestErrorEndedAt: null,
      checkpoint,
      cursors,
      ...expectedIdentity,
    })).toContain('Cursor BSC UKI_STAKING:Staked ausente, stale, sin verificacion o con backlog.');
    cursors[0].contractAddress = addresses.UKI_STAKING;
    cursors[0].contractConfigHash = `0x${'3'.repeat(64)}`;
    expect(operationalIndexerHealthWarnings({
      checkedAt: now,
      latestSuccessEndedAt: now,
      latestErrorEndedAt: null,
      checkpoint,
      cursors,
      ...expectedIdentity,
    })).toContain('Cursor BSC UKI_STAKING:Staked ausente, stale, sin verificacion o con backlog.');
    cursors[0].contractConfigHash = `0x${'2'.repeat(64)}`;
    cursors[0].safeBlock = 99;
    expect(operationalIndexerHealthWarnings({
      checkedAt: now,
      latestSuccessEndedAt: now,
      latestErrorEndedAt: null,
      checkpoint,
      cursors,
      ...expectedIdentity,
    })).toContain('Cursor BSC UKI_STAKING:Staked ausente, stale, sin verificacion o con backlog.');
  });

  it('marks a brand-new NFT database unhealthy until every verified history cursor exists', () => {
    const checkpoint = {
      checkedAt: now,
      safeBlockNumber: 100,
      safeBlockHash: `0x${'a'.repeat(64)}`,
    };
    const expectedContractConfigs = Object.fromEntries(
      ['TOKEN', 'MARKETPLACE', 'BRIDGE'].map((alias, index) => [alias, {
        contractAddress: `0x${String(index + 1).repeat(40)}`,
        bootstrapStartBlock: 1,
        contractDeploymentBlock: 1,
        contractCodeHash: `0x${'1'.repeat(64)}`,
        contractDeploymentTxHash: `0x${'4'.repeat(64)}`,
        contractConfigHash: `0x${'2'.repeat(64)}`,
      }]),
    );
    const warnings = operationalIndexerHealthWarnings({
      checkedAt: now,
      latestSuccessEndedAt: now,
      latestErrorEndedAt: null,
      checkpoint,
      cursors: [],
      expectedChainId: 56,
      expectedContractConfigs,
      expectedCursorIds: EXPECTED_NFT_CURSOR_IDS,
    });
    expect(warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('TOKEN:Transfer'),
      expect.stringContaining('MARKETPLACE:TokenOnSale'),
      expect.stringContaining('BRIDGE:JumpOutBridge'),
    ]));
  });

  it('uses TOKEN_V2 for custodial NFT health and never accepts TOKEN as a substitute', () => {
    expect(cukieMasterNftHealthScope('custodial')).toEqual({
      aliases: ['TOKEN_V2', 'CUKIE_MASTER_NFT_VAULT'],
      cursorIds: EXPECTED_CUSTODIAL_NFT_CURSOR_IDS,
    });
    const contractAddress = '0x00000000000000000000000000000000000000cc';
    const deploymentTxHash = `0x${'4'.repeat(64)}`;
    const expectedContractConfigs = {
      TOKEN_V2: {
        contractAddress,
        bootstrapStartBlock: 10,
        contractDeploymentBlock: 10,
        contractCodeHash: `0x${'1'.repeat(64)}`,
        contractDeploymentTxHash: deploymentTxHash,
        contractConfigHash: `0x${'2'.repeat(64)}`,
      },
    };
    const cursor = {
      chain: 'BSC',
      contractAlias: 'TOKEN',
      contractAddress,
      eventName: 'Transfer',
      updatedAt: now,
      safeBlock: 100,
      nextBlock: 101,
      bootstrapStatus: 'verified',
      bootstrapStartBlock: 10,
      bootstrapVerifiedAt: now,
      verifiedChainId: 97,
      contractCodeHash: `0x${'1'.repeat(64)}`,
      contractDeploymentBlock: 10,
      contractDeploymentTxHash: deploymentTxHash,
      contractConfigHash: `0x${'2'.repeat(64)}`,
    };
    const input = {
      checkedAt: now,
      latestSuccessEndedAt: now,
      latestErrorEndedAt: null,
      checkpoint: {
        checkedAt: now,
        safeBlockNumber: 100,
        safeBlockHash: `0x${'a'.repeat(64)}`,
      },
      expectedChainId: 97 as const,
      expectedContractConfigs,
      expectedCursorIds: ['TOKEN_V2:Transfer'] as const,
    };
    expect(operationalIndexerHealthWarnings({ ...input, cursors: [cursor] })).toContain(
      'Cursor BSC TOKEN_V2:Transfer ausente, stale, sin verificacion o con backlog.',
    );
    expect(operationalIndexerHealthWarnings({
      ...input,
      cursors: [{ ...cursor, contractAlias: 'TOKEN_V2', contractDeploymentTxHash: `0x${'5'.repeat(64)}` }],
    })).toContain(
      'Cursor BSC TOKEN_V2:Transfer ausente, stale, sin verificacion o con backlog.',
    );
    expect(operationalIndexerHealthWarnings({
      ...input,
      cursors: [{ ...cursor, contractAlias: 'TOKEN_V2' }],
    })).toEqual([]);
  });

  it('marks NFT sources incomplete for unknown attributes but accepts quiet old assets', async () => {
    const { repo, state } = memoryRepository();
    const wallet = '0xABC';
    const unknown = normalizeCukiesInventoryDocument({
      _id: 'unknown', owner: wallet, ownerNormalized: wallet.toLowerCase(),
      tokenId: '1', state: 'available', timeStamp: now,
    }, [], now);
    state.nftSummaries.set(wallet.toLowerCase(), summarizeCukieMasterNftEntitlement({
      walletAddress: wallet,
      assets: [unknown],
    }));
    const unknownSource = await readCukieMasterSources(repo, wallet, wallet.toLowerCase(), now);
    expect(unknownSource.nft.completeness.complete).toBe(false);
    expect(unknownSource.nft.completeness.warnings[0]).toContain('unknown');

    const stale = normalizeCukiesInventoryDocument({
      _id: 'stale', owner: wallet, ownerNormalized: wallet.toLowerCase(),
      tokenId: '2', network: 'BSC', state: 'available', type: 'rare',
      skills: { generation: 1 }, timeStamp: new Date(now.getTime() - 2 * DAY),
    }, [{
      _id: 'lock', assetId: 'cukies:stale', status: 'active', reason: 'soft_stake',
      ownerNormalized: wallet.toLowerCase(), updatedAt: now,
    }], now);
    state.nftSummaries.set(wallet.toLowerCase(), summarizeCukieMasterNftEntitlement({
      walletAddress: wallet,
      assets: [stale],
    }));
    const staleSource = await readCukieMasterSources(repo, wallet, wallet.toLowerCase(), now);
    expect(staleSource.nft.completeness.complete).toBe(true);
    expect(staleSource.nft.originalCukiePoints).toBeGreaterThan(0);

    const knownRejected = normalizeCukiesInventoryDocument({
      _id: 'tron', owner: wallet, ownerNormalized: wallet.toLowerCase(), tokenId: '3',
      network: 'TRON', state: 'available', type: 'rare', origin: 'mint', timeStamp: now,
    }, [], now);
    state.nftSummaries.set(wallet.toLowerCase(), summarizeCukieMasterNftEntitlement({
      walletAddress: wallet,
      assets: [knownRejected],
    }));
    const knownRejectedSource = await readCukieMasterSources(repo, wallet, wallet.toLowerCase(), now);
    expect(knownRejectedSource.nft.completeness.complete).toBe(true);
  });

  it('compares the exact staking position sum with global totalStakedRaw', () => {
    expect(stakingBalancesMatchState([], {
      _id: 'staking',
      totalStakedRaw: '0',
      bootstrapVerifiedAt: now,
      bootstrapSafeBlock: 100,
      bootstrapSafeBlockHash: `0x${'a'.repeat(64)}`,
      verifiedChainId: 56,
      contractCodeHash: `0x${'1'.repeat(64)}`,
      contractDeploymentTxHash: `0x${'4'.repeat(64)}`,
      contractConfigHash: `0x${'2'.repeat(64)}`,
    })).toBe(true);
    expect(stakingBalancesMatchState([], { _id: 'staking', totalStakedRaw: '0' })).toBe(false);
    expect(stakingBalancesMatchState([
      { accountBalanceRaw: '10' },
      { accountBalanceRaw: '20' },
    ], { _id: 'global', totalStakedRaw: '30' })).toBe(true);
    expect(stakingBalancesMatchState([
      { accountBalanceRaw: '10' },
      { accountBalanceRaw: '20' },
    ], { _id: 'global', totalStakedRaw: '29' })).toBe(false);
    expect(stakingBalancesMatchState([{ accountBalanceRaw: 'invalid' }], {
      _id: 'global', totalStakedRaw: '0',
    })).toBe(false);
  });

  it('binds the O(1) staking watermark to the configured contract identity', () => {
    const expected = {
      contractAddress: '0x00000000000000000000000000000000000000aa',
      bootstrapStartBlock: 10,
      contractDeploymentBlock: 10,
      contractCodeHash: `0x${'1'.repeat(64)}`,
      contractDeploymentTxHash: `0x${'4'.repeat(64)}`,
      contractConfigHash: `0x${'2'.repeat(64)}`,
    };
    const state = {
      _id: expected.contractAddress,
      contractAddressNormalized: expected.contractAddress,
      totalStakedRaw: '123',
      materializationStatus: 'consistent',
      materializedTotalRaw: '123',
      lastEventId: 'event-1',
      materializedThroughEventId: 'event-1',
      materializedThroughBlockNumber: 100,
      materializedThroughLogIndex: 1,
      verifiedChainId: 56,
      bootstrapStartBlock: 10,
      contractDeploymentBlock: 10,
      contractCodeHash: expected.contractCodeHash,
      contractDeploymentTxHash: expected.contractDeploymentTxHash,
      contractConfigHash: expected.contractConfigHash,
    };
    expect(stakingMaterializationMatchesState(state, expected, 56)).toBe(true);
    expect(stakingMaterializationMatchesState({
      ...state,
      contractConfigHash: `0x${'3'.repeat(64)}`,
    }, expected, 56)).toBe(false);
  });
});

describe('Cukie Master transactional allocation', () => {
  it('aborts before touching an active position, slots, or capacity when a source is unhealthy', async () => {
    const { repo, state } = memoryRepository();
    state.vesting.set('0xabc', { totalAllocatedRaw: rawUki(20_000), releasedRaw: '0' });
    state.nftPoints.set('0xabc', 3);
    const service = createCukieMasterService((work) => work(repo));
    await service.recalculateCukieMasterWallet('0xABC', now, 'healthy-initial');
    await service.recalculateCukieMasterWallet('0xABC', new Date(now.getTime() + DAY), 'active');
    const before = mutableAllocationSnapshot(state);

    state.ukiIndexerHealthy = false;
    await expect(service.recalculateCukieMasterWallet(
      '0xABC',
      new Date(now.getTime() + 2 * DAY),
      'must-fail-closed',
    )).rejects.toThrow('fuentes incompletas');
    expect(mutableAllocationSnapshot(state)).toBe(before);
  });

  it('does not revoke or rewrite an existing allocation when presale raw becomes malformed', async () => {
    const { repo, state } = memoryRepository();
    state.presale.set('0xabc', { totalUkiPurchasedRaw: rawUki(20_000) });
    state.vesting.set('0xabc', { totalAllocatedRaw: rawUki(20_000), releasedRaw: '0' });
    const service = createCukieMasterService((work) => work(repo));
    await service.recalculateCukieMasterWallet('0xABC', now, 'valid-presale');
    await service.recalculateCukieMasterWallet(
      '0xABC',
      new Date(now.getTime() + DAY),
      'valid-presale-active',
    );
    const before = mutableAllocationSnapshot(state);
    state.presale.set('0xabc', { totalUkiPurchasedRaw: 'invalid' });

    await expect(service.recalculateCukieMasterWallet(
      '0xABC',
      new Date(now.getTime() + 2 * DAY),
      'invalid-presale',
    )).rejects.toThrow('fuentes incompletas');
    expect(mutableAllocationSnapshot(state)).toBe(before);
  });

  it('fences the active round before persisting a stale recalculation', async () => {
    const { repo, state } = memoryRepository();
    state.vesting.set('0xabc', { totalAllocatedRaw: rawUki(20_000), releasedRaw: '0' });
    const service = createCukieMasterService((work) => work(repo));
    await service.recalculateCukieMasterWallet('0xABC', now, 'round-fence-initial');
    const before = mutableAllocationSnapshot(state);
    state.fenceRoundHook = (route) => {
      if (route !== 'uki') return;
      const current = state.rounds.get(route)!;
      state.rounds.set(route, {
        ...current,
        status: 'closed',
        revision: current.revision + 1,
        closedAt: new Date(now.getTime() + 1),
      });
      state.fenceRoundHook = undefined;
    };

    await expect(service.recalculateCukieMasterWallet(
      '0xABC',
      new Date(now.getTime() + 1),
      'round-fence-stale',
    )).rejects.toThrow('ronda uki cambio');
    expect(mutableAllocationSnapshot(state)).toBe(before);
  });
  it('allocates up to 5 per route and serializes concurrent idempotent retries', async () => {
    const { repo, state } = memoryRepository();
    state.vesting.set('0xabc', { totalAllocatedRaw: rawUki(100_000), releasedRaw: '0' });
    state.nftPoints.set('0xabc', 15);
    let transactions = 0;
    let transactionQueue = Promise.resolve();
    const service = createCukieMasterService(<T>(work: (repository: CukieMasterRepository) => Promise<T>) => {
      transactions += 1;
      const transaction = transactionQueue.then(() => work(repo));
      transactionQueue = transaction.then(() => undefined, () => undefined);
      return transaction;
    });

    const [first, duplicate] = await Promise.all([
      service.recalculateCukieMasterWallet('0xABC', now, 'req-1'),
      service.recalculateCukieMasterWallet('0xABC', now, 'req-1'),
    ]);

    expect(first.positions.uki.allocatedSlots).toBe(5);
    expect(first.positions.nft.allocatedSlots).toBe(5);
    expect(first.positions.uki.status).toBe('qualifying');
    expect(first.positions.uki.activeFrom).toEqual(new Date(now.getTime() + DAY));
    expect(duplicate.positions.uki.revision).toBe(first.positions.uki.revision);
    expect(state.capacities.get('uki')?.allocatedSlots).toBe(5);
    expect(state.capacities.get('nft')?.allocatedSlots).toBe(5);
    expect(state.slots.size).toBe(10);
    expect(state.events.size).toBe(12);
    expect(transactions).toBe(2);

    const active = await service.recalculateCukieMasterWallet(
      '0xABC',
      new Date(now.getTime() + DAY),
      'req-2',
    );
    expect(active.positions.uki.status).toBe('active');
  });

  it('keeps the NFT slot epoch and 24h maturity during a retained soft-stake game assignment', async () => {
    const { repo, state } = memoryRepository();
    const wallet = '0xABC';
    const walletNormalized = wallet.toLowerCase();
    const nft = (lock: Record<string, unknown>) => normalizeCukiesInventoryDocument({
      _id: 'retained-game',
      owner: wallet,
      ownerNormalized: walletNormalized,
      tokenId: '77',
      network: 'BSC',
      state: 'available',
      type: 'rare',
      skills: { generation: 1 },
      timeStamp: now,
    }, [lock], now);
    state.nftSummaries.set(walletNormalized, summarizeCukieMasterNftEntitlement({
      walletAddress: wallet,
      assets: [nft({
        _id: 'soft-lock',
        assetId: 'cukies:retained-game',
        status: 'active',
        reason: 'soft_stake',
        ownerNormalized: walletNormalized,
        updatedAt: now,
      })],
    }));
    const service = createCukieMasterService((work) => work(repo));
    await service.recalculateCukieMasterWallet(wallet, now, 'retained-initial');
    const maturedAt = new Date(now.getTime() + DAY);
    await service.recalculateCukieMasterWallet(wallet, maturedAt, 'retained-matured');
    const before = state.slots.get(`${walletNormalized}:nft:1`)!;
    expect(before).toMatchObject({ status: 'active', eligibilityEpoch: 1 });

    state.nftSummaries.set(walletNormalized, summarizeCukieMasterNftEntitlement({
      walletAddress: wallet,
      assets: [nft({
        _id: 'soft-lock',
        assetId: 'cukies:retained-game',
        status: 'active',
        reason: 'game_assignment',
        ownerNormalized: walletNormalized,
        sessionId: 'game-session-1',
        retainsSoftStakeEntitlement: true,
        expiresAt: new Date(maturedAt.getTime() + DAY),
        updatedAt: maturedAt,
      })],
    }));
    const duringGame = await service.recalculateCukieMasterWallet(
      wallet,
      new Date(maturedAt.getTime() + 1_000),
      'retained-during-game',
    );
    const after = state.slots.get(`${walletNormalized}:nft:1`)!;

    expect(duringGame.positions.nft).toMatchObject({ allocatedSlots: 1, status: 'active' });
    expect(after.eligibilityEpoch).toBe(before.eligibilityEpoch);
    expect(after.creditEligibleFrom).toEqual(before.creditEligibleFrom);
    expect(after.status).toBe('active');

    state.nftSummaries.set(walletNormalized, summarizeCukieMasterNftEntitlement({
      walletAddress: wallet,
      assets: [nft({
        _id: 'soft-lock',
        assetId: 'cukies:retained-game',
        status: 'active',
        reason: 'soft_stake',
        ownerNormalized: walletNormalized,
        updatedAt: new Date(maturedAt.getTime() + 2_000),
      })],
    }));
    await service.recalculateCukieMasterWallet(
      wallet,
      new Date(maturedAt.getTime() + 2_000),
      'retained-after-game',
    );
    const restored = state.slots.get(`${walletNormalized}:nft:1`)!;
    expect(restored).toMatchObject({
      status: 'active',
      eligibilityEpoch: before.eligibilityEpoch,
      creditEligibleFrom: before.creditEligibleFrom,
    });
  });

  it('waitlists at 500, releases capacity, and restarts the 24h countdown', async () => {
    const { repo, state } = memoryRepository();
    const service = createCukieMasterService((work) => work(repo));
    const ukiRound = createInitialRouteRound('uki', now);
    state.rounds.set('uki', ukiRound);
    state.capacities.set('uki', {
      _id: 'uki', route: 'uki', roundId: ukiRound.roundId,
      totalSlots: 500, allocatedSlots: 499, revision: 0, createdAt: now, updatedAt: now,
    });
    state.vesting.set('0xaaa', { totalAllocatedRaw: rawUki(100_000), releasedRaw: '0' });
    state.vesting.set('0xbbb', { totalAllocatedRaw: rawUki(20_000), releasedRaw: '0' });
    state.vesting.set('0xccc', { totalAllocatedRaw: rawUki(20_000), releasedRaw: '0' });

    const partial = await service.recalculateCukieMasterWallet('0xAAA', now, 'partial');
    const waiting = await service.recalculateCukieMasterWallet('0xBBB', now, 'waiting');
    expect(partial.positions.uki.allocatedSlots).toBe(1);
    expect(partial.positions.uki.desiredSlots).toBe(5);
    expect(waiting.positions.uki.status).toBe('waitlisted');

    state.vesting.set('0xaaa', { totalAllocatedRaw: '0', releasedRaw: '0' });
    await service.recalculateCukieMasterWallet('0xAAA', new Date(now.getTime() + DAY), 'release');
    const laterCandidate = await service.recalculateCukieMasterWallet(
      '0xCCC',
      new Date(now.getTime() + DAY),
      'later-candidate',
    );
    expect(laterCandidate.positions.uki.status).toBe('waitlisted');
    const waitlistJobs = createCukieMasterWaitlistJobs({
      getRepository: async () => repo,
      recalculate: service.recalculateCukieMasterWallet,
    });
    const promotion = await waitlistJobs.promoteCukieMasterWaitlist(
      'uki',
      new Date(now.getTime() + DAY),
      'fifo-job',
      undefined,
      10,
    );
    const admitted = state.positions.get('0xbbb:uki')!;
    expect(promotion.promoted).toBe(1);
    expect(promotion.slotsAllocated).toBe(1);
    expect(admitted.allocatedSlots).toBe(1);
    expect(admitted.status).toBe('qualifying');
    expect(admitted.activeFrom).toEqual(new Date(now.getTime() + 2 * DAY));
    expect(state.positions.get('0xccc:uki')?.status).toBe('waitlisted');
  });

  it('keeps a partially allocated FIFO head ahead across successive single-slot releases', async () => {
    const { repo, state } = memoryRepository();
    const service = createCukieMasterService((work) => work(repo));
    const round = createInitialRouteRound('uki', now);
    state.rounds.set('uki', round);
    state.capacities.set('uki', {
      _id: 'uki', route: 'uki', roundId: round.roundId,
      totalSlots: 500, allocatedSlots: 499, revision: 0, createdAt: now, updatedAt: now,
    });
    state.vesting.set('0xaaa', { totalAllocatedRaw: rawUki(100_000), releasedRaw: '0' });
    state.vesting.set('0xbbb', { totalAllocatedRaw: rawUki(100_000), releasedRaw: '0' });
    await service.recalculateCukieMasterWallet('0xAAA', now, 'fifo-head');
    await service.recalculateCukieMasterWallet(
      '0xBBB',
      new Date(now.getTime() + 1_000),
      'fifo-later',
    );
    expect(state.positions.get('0xaaa:uki')).toMatchObject({
      allocatedSlots: 1,
      desiredSlots: 5,
      waitlistedAt: now,
    });

    const jobs = createCukieMasterWaitlistJobs({
      getRepository: async () => repo,
      recalculate: service.recalculateCukieMasterWallet,
    });
    for (let release = 1; release <= 2; release += 1) {
      const capacity = state.capacities.get('uki')!;
      state.capacities.set('uki', {
        ...capacity,
        allocatedSlots: capacity.allocatedSlots - 1,
        revision: capacity.revision + 1,
      });
      const result = await jobs.promoteCukieMasterWaitlist(
        'uki',
        new Date(now.getTime() + release * 2_000),
        `fifo-release-${release}`,
        undefined,
        10,
      );
      expect(result).toMatchObject({ promoted: 1, slotsAllocated: 1, scanned: 1, done: true });
      expect(state.positions.get('0xaaa:uki')?.allocatedSlots).toBe(1 + release);
      expect(state.positions.get('0xaaa:uki')?.waitlistedAt).toEqual(now);
      expect(state.positions.get('0xbbb:uki')?.allocatedSlots).toBe(0);
    }
  });

  it('activates matured qualifying positions without a manual recalc and retries without duplicates', async () => {
    const { repo, state } = memoryRepository();
    state.vesting.set('0xabc', { totalAllocatedRaw: rawUki(20_000), releasedRaw: '0' });
    const service = createCukieMasterService((work) => work(repo));
    await service.recalculateCukieMasterWallet('0xABC', now, 'initial-maturity');
    const maturedAt = new Date(now.getTime() + DAY);

    expect(await listCreditEligibleCukieMasterPositions(
      new Date(maturedAt.getTime() - 1),
      repo,
    )).toHaveLength(0);
    expect(await listCreditEligibleCukieMasterPositions(maturedAt, repo)).toHaveLength(1);
    expect((await getCukieMasterWalletStatus('0xABC', maturedAt, repo)).routes.uki.position?.status)
      .toBe('active');

    const jobs = createCukieMasterActivationJobs({
      getRepository: async () => repo,
      activate: service.activateMaturedPosition,
    });
    const first = await jobs.activateMaturedCukieMasterPositions(
      maturedAt,
      'activation-job',
      {},
      100,
    );
    const eventCount = state.events.size;
    const retry = await jobs.activateMaturedCukieMasterPositions(
      maturedAt,
      'activation-job',
      {},
      100,
    );

    expect(first).toMatchObject({ scanned: 1, activated: 1, done: true });
    expect(state.slots.get('0xabc:uki:1')?.status).toBe('active');
    expect(retry).toMatchObject({ scanned: 0, activated: 0, done: true });
    expect(state.events.size).toBe(eventCount);
    expect([...state.events.values()].filter((event) => event.eventType === 'slot_activated'))
      .toHaveLength(1);
    expect(await listCreditEligibleCukieMasterPositions(maturedAt, repo)).toHaveLength(1);
  });

  it('protects existing slots for a fixed 48h strict requirement grace', async () => {
    const { repo, state } = memoryRepository();
    const service = createCukieMasterService((work) => work(repo));
    state.vesting.set('0xabc', { totalAllocatedRaw: rawUki(100_000), releasedRaw: '0' });
    await service.recalculateCukieMasterWallet('0xABC', now, 'initial');
    const capacity = state.capacities.get('uki')!;
    state.capacities.set('uki', { ...capacity, allocatedSlots: 500 });
    const nextRequirement = { route: 'uki' as const, ukiRaw: rawUki(30_000) };

    const round = await service.proposeRequirementIncrease('uki', nextRequirement, now, 'increase');
    expect(round.graceEndsAt).toEqual(new Date(now.getTime() + 2 * DAY));
    expect(round.gracePositionCount).toBe(1);
    expect(state.positions.get('0xabc:uki')).toMatchObject({
      status: 'grace',
      protectedSlots: 5,
      pendingRequirementSnapshot: nextRequirement,
      graceEndsAt: new Date(now.getTime() + 2 * DAY),
    });
    expect((await getCukieMasterWalletStatus('0xABC', now, repo)).routes.uki.countdownEndsAt)
      .toEqual(new Date(now.getTime() + DAY));
    const equivalent = await service.proposeRequirementIncrease(
      'uki', nextRequirement, now, 'equivalent-key',
    );
    expect(equivalent.roundId).toBe(round.roundId);
    expect(state.events.has('cukie-master:requirement:equivalent-key:uki')).toBe(true);
    await expect(service.proposeRequirementIncrease(
      'uki',
      { route: 'uki', ukiRaw: rawUki(10_000) },
      now,
      'not-strict',
    )).rejects.toThrow('incremento estricto');

    const protectedResult = await service.recalculateCukieMasterWallet(
      '0xABC',
      new Date(now.getTime() + DAY),
      'during-grace',
    );
    expect(protectedResult.positions.uki.desiredSlots).toBe(3);
    expect(protectedResult.positions.uki.protectedSlots).toBe(5);
    expect(protectedResult.positions.uki.allocatedSlots).toBe(5);
    expect(protectedResult.positions.uki.status).toBe('grace');
    const graceStatus = await getCukieMasterWalletStatus(
      '0xABC',
      new Date(now.getTime() + DAY),
      repo,
    );
    expect(graceStatus.routes.uki.deficitToPreserveSlots).toEqual({
      route: 'uki',
      ukiRaw: rawUki(50_000),
    });
    expect(await listCreditEligibleCukieMasterPositions(
      new Date(now.getTime() + DAY),
      repo,
    )).toHaveLength(5);
    expect((await listCreditEligibleCukieMasterPositions(
      new Date(now.getTime() + 2 * DAY),
      repo,
    )).some((item) => item.route === 'uki')).toBe(false);

    const afterGrace = await service.recalculateCukieMasterWallet(
      '0xABC',
      new Date(now.getTime() + 2 * DAY),
      'after-grace',
    );
    expect(afterGrace.positions.uki.allocatedSlots).toBe(3);
    const revisionBeforeFinalize = state.positions.get('0xabc:uki')?.revision;
    const closeTransition = state.events.get('cukie-master:recalculate:after-grace:uki');
    expect(closeTransition).toMatchObject({
      eventType: 'position_recalculated',
      previous: { status: 'grace' },
      next: { status: 'active', allocatedSlots: 3 },
    });

    const closed = await service.finalizeRequirementGrace(
      'uki',
      new Date(now.getTime() + 2 * DAY),
      'close-job',
    );
    const duplicateClose = await service.finalizeRequirementGrace(
      'uki',
      new Date(now.getTime() + 3 * DAY),
      'close-job',
    );
    expect(closed.requirement).toEqual(nextRequirement);
    expect(closed.graceEndsAt).toBeUndefined();
    expect(duplicateClose.roundId).toBe(closed.roundId);
    const equivalentRetryAfterClose = await service.proposeRequirementIncrease(
      'uki', nextRequirement, new Date(now.getTime() + 3 * DAY), 'equivalent-key',
    );
    expect(equivalentRetryAfterClose.roundId).toBe(closed.roundId);
    expect(state.positions.get('0xabc:uki')?.graceEndsAt).toBeUndefined();
    expect(state.positions.get('0xabc:uki')?.status).toBe('active');
    expect(state.positions.get('0xabc:uki')?.protectedSlots).toBe(0);
    expect(state.positions.get('0xabc:uki')?.revision).toBe(revisionBeforeFinalize);
  });

  it('creates unique grace slot events for two wallets in the same proposal', async () => {
    const { repo, state } = memoryRepository();
    const service = createCukieMasterService((work) => work(repo));
    state.vesting.set('0xaaa', { totalAllocatedRaw: rawUki(20_000), releasedRaw: '0' });
    state.vesting.set('0xbbb', { totalAllocatedRaw: rawUki(20_000), releasedRaw: '0' });
    await service.recalculateCukieMasterWallet('0xAAA', now, 'multi-a');
    await service.recalculateCukieMasterWallet('0xBBB', now, 'multi-b');
    const capacity = state.capacities.get('uki')!;
    state.capacities.set('uki', { ...capacity, allocatedSlots: capacity.totalSlots });

    await service.proposeRequirementIncrease(
      'uki',
      { route: 'uki', ukiRaw: rawUki(30_000) },
      now,
      'multi-wallet-grace',
    );
    const slotEvents = [...state.events.values()].filter((event) => (
      event.eventType === 'slot_transitioned'
      && event.requestIdempotencyKey === 'requirement:multi-wallet-grace'
    ));
    expect(slotEvents).toHaveLength(2);
    expect(new Set(slotEvents.map((event) => event.eventId)).size).toBe(2);
    expect(slotEvents.map((event) => event.walletNormalized).sort()).toEqual(['0xaaa', '0xbbb']);
  });

  it('materializes ordinal slots with independent 24h epochs across 1→3 and 3→1→3', async () => {
    const { repo, state } = memoryRepository();
    const service = createCukieMasterService((work) => work(repo));
    state.vesting.set('0xabc', { totalAllocatedRaw: rawUki(20_000), releasedRaw: '0' });
    await service.recalculateCukieMasterWallet('0xABC', now, 'slots-1');
    expect(state.slots.get('0xabc:uki:1')).toMatchObject({
      ordinal: 1, eligibilityEpoch: 1, status: 'qualifying',
      creditEligibleFrom: new Date(now.getTime() + DAY),
    });

    const halfDay = new Date(now.getTime() + DAY / 2);
    state.vesting.set('0xabc', { totalAllocatedRaw: rawUki(60_000), releasedRaw: '0' });
    await service.recalculateCukieMasterWallet('0xABC', halfDay, 'slots-3');
    expect(state.slots.get('0xabc:uki:1')?.creditEligibleFrom).toEqual(new Date(now.getTime() + DAY));
    expect(state.slots.get('0xabc:uki:2')?.creditEligibleFrom)
      .toEqual(new Date(halfDay.getTime() + DAY));
    expect(await listCreditEligibleCukieMasterPositions(new Date(now.getTime() + DAY), repo))
      .toHaveLength(1);
    expect(await listCreditEligibleCukieMasterPositions(new Date(halfDay.getTime() + DAY), repo))
      .toHaveLength(3);

    const dayTwo = new Date(now.getTime() + 2 * DAY);
    state.vesting.set('0xabc', { totalAllocatedRaw: rawUki(20_000), releasedRaw: '0' });
    await service.recalculateCukieMasterWallet('0xABC', dayTwo, 'slots-down');
    expect(state.slots.get('0xabc:uki:2')?.status).toBe('inactive');
    state.vesting.set('0xabc', { totalAllocatedRaw: rawUki(60_000), releasedRaw: '0' });
    const recovered = await service.recalculateCukieMasterWallet('0xABC', dayTwo, 'slots-up-again');
    const eventCount = state.events.size;
    await service.recalculateCukieMasterWallet('0xABC', dayTwo, 'slots-up-again');
    expect(recovered.positions.uki.allocatedSlots).toBe(3);
    expect(state.slots.get('0xabc:uki:2')).toMatchObject({
      eligibilityEpoch: 2,
      status: 'qualifying',
      creditEligibleFrom: new Date(now.getTime() + 3 * DAY),
    });
    expect(state.events.size).toBe(eventCount);
  });

  it('expands route capacity with CAS, idempotency and a hard 5000 ceiling', async () => {
    const { repo, state } = memoryRepository();
    const service = createCukieMasterService((work) => work(repo));
    const round = createInitialRouteRound('nft', now);
    state.rounds.set('nft', round);
    state.capacities.set('nft', {
      _id: 'nft',
      route: 'nft',
      roundId: round.roundId,
      totalSlots: 500,
      allocatedSlots: 500,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    });

    const first = await service.expandRouteCapacity('nft', 1_250, now, 'capacity-1250');
    const replay = await service.expandRouteCapacity('nft', 1_250, now, 'capacity-1250');

    expect(first.capacity).toMatchObject({ totalSlots: 1_250, allocatedSlots: 500, revision: 1 });
    expect(first.round.capacitySlots).toBe(1_250);
    expect(replay.capacity.revision).toBe(1);
    expect(state.events.get('cukie-master:capacity:capacity-1250:nft')).toMatchObject({
      eventType: 'capacity_expanded',
      previousCapacity: { totalSlots: 500 },
      nextCapacity: { totalSlots: 1_250 },
    });
    await expect(service.expandRouteCapacity('nft', 1_000, now, 'capacity-reduce'))
      .rejects.toThrow('solo puede ampliarse');
    expect(() => service.expandRouteCapacity('nft', 5_001, now, 'capacity-overflow'))
      .toThrow('entre 1 y 5000');
  });
});
