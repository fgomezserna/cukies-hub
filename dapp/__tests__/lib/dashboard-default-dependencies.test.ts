import { dashboardSummaryDependencies } from '@/lib/dashboard/default-dependencies';
import { buildDashboardSummary } from '@/lib/dashboard/summary';
import { readWalletVestingStatus } from '@/lib/vesting-onchain';
import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';
import { getCukieMasterWalletStatus } from '@/lib/uki-economy/cukie-master';
import { publicCukieMasterRouteStatus } from '@/lib/uki-economy/cukie-master/public-view';
import { listCukiePoolWalletPositions } from '@/lib/uki-economy/cukie-pool';
import { getCompetitionCreditWalletStatus } from '@/lib/uki-economy/credits';
import { listWalletRewardStatus } from '@/lib/uki-economy/rewards';
import { listSellerUkiMarketplaceOrders } from '@/lib/uki-marketplace';
import { listUkiMarketplaceSellerInventory } from '@/lib/uki-marketplace/inventory';

jest.mock('@/lib/vesting-onchain', () => ({ readWalletVestingStatus: jest.fn() }));
jest.mock('@/lib/treasure-hunt-competition/server/default-service', () => ({ getCompetitionService: jest.fn() }));
jest.mock('@/lib/uki-economy/cukie-master', () => ({ getCukieMasterWalletStatus: jest.fn() }));
jest.mock('@/lib/uki-economy/cukie-master/public-view', () => ({ publicCukieMasterRouteStatus: jest.fn() }));
jest.mock('@/lib/uki-economy/cukie-pool', () => ({ listCukiePoolWalletPositions: jest.fn() }));
jest.mock('@/lib/uki-economy/credits', () => ({ getCompetitionCreditWalletStatus: jest.fn() }));
jest.mock('@/lib/uki-economy/rewards', () => ({ listWalletRewardStatus: jest.fn() }));
jest.mock('@/lib/uki-marketplace', () => ({ listSellerUkiMarketplaceOrders: jest.fn() }));
jest.mock('@/lib/uki-marketplace/inventory', () => ({ listUkiMarketplaceSellerInventory: jest.fn() }));

const mockVesting = readWalletVestingStatus as jest.MockedFunction<typeof readWalletVestingStatus>;
const mockCompetitionService = getCompetitionService as jest.MockedFunction<typeof getCompetitionService>;
const mockMasterStatus = getCukieMasterWalletStatus as jest.MockedFunction<typeof getCukieMasterWalletStatus>;
const mockPublicMasterRoute = publicCukieMasterRouteStatus as jest.MockedFunction<typeof publicCukieMasterRouteStatus>;
const mockPool = listCukiePoolWalletPositions as jest.MockedFunction<typeof listCukiePoolWalletPositions>;
const mockCredits = getCompetitionCreditWalletStatus as jest.MockedFunction<typeof getCompetitionCreditWalletStatus>;
const mockRewards = listWalletRewardStatus as jest.MockedFunction<typeof listWalletRewardStatus>;
const mockOrders = listSellerUkiMarketplaceOrders as jest.MockedFunction<typeof listSellerUkiMarketplaceOrders>;
const mockInventory = listUkiMarketplaceSellerInventory as jest.MockedFunction<typeof listUkiMarketplaceSellerInventory>;

const wallet = '0x1111111111111111111111111111111111111111';
const now = new Date('2026-08-30T12:00:00.000Z');

function publicRoute(allocatedSlots: number) {
  return {
    position: {
      allocatedSlots,
      desiredSlots: allocatedSlots,
    },
    source: { complete: true },
    projectionFresh: true,
    synchronizing: false,
  } as ReturnType<typeof publicCukieMasterRouteStatus>;
}

describe('dashboard default dependencies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMasterStatus.mockResolvedValue({ routes: { uki: { route: 'uki' }, nft: { route: 'nft' } } } as never);
    mockPublicMasterRoute
      .mockReturnValueOnce(publicRoute(2))
      .mockReturnValueOnce(publicRoute(1));
    mockCredits.mockResolvedValue({
      balance: {
        availableCredits: 250,
        reservedCredits: 10,
        spentCredits: 20,
        poolDepositedCredits: 30,
        blocked: false,
      },
      pool: { availableCredits: 900, blocked: false },
      activeReservations: 1,
      grants: {
        healthy: true,
        sourceObservedThrough: new Date('2026-08-30T11:59:00.000Z'),
      },
    } as never);
    mockPool.mockResolvedValue({
      sourceHealthy: true,
      positions: [
        { status: 'active', source: 'custodial_vault' },
        { status: 'active', source: 'legacy_mongo', gamesRemaining: 6 },
      ],
    } as never);
    mockRewards.mockResolvedValue({
      claimableRaw: '5000',
      allocations: [{ allocationId: 'a' }],
      claims: [],
      claimPublished: true,
      blockedAllocations: 0,
      openIncidents: 0,
      healthy: true,
    } as never);
    mockInventory.mockResolvedValue([
      { listingEligible: true },
      { listingEligible: false },
    ] as never);
    mockOrders.mockResolvedValue([
      { status: 'active' },
      { status: 'requires_attention' },
    ] as never);
    mockVesting.mockResolvedValue({
      chainId: 97,
      configFrozen: true,
      hasPosition: true,
      totalAmountRaw: '10000',
      releasedAmountRaw: '1000',
      releasableRaw: '2000',
      lockedAmountRaw: '7000',
      progressBps: 3000,
    } as never);
    mockCompetitionService.mockReturnValue({
      getRuntime: () => ({
        configured: true,
        enabled: true,
        phase: 'active',
        campaign: { campaignId: 'stage-campaign', eligibilityKind: 'uki_staking' },
      }),
      getStakingEligibility: jest.fn(async () => ({
        ready: true,
        attemptsGranted: 4,
        attemptsUsed: 1,
        attemptsRemaining: 3,
        totalTickets: 12,
        indexedAt: '2026-08-30T11:58:00.000Z',
        issues: [],
      })),
      getLeaderboard: jest.fn(async () => ({
        entries: [
          { rank: 8, isMe: true },
          { rank: 3, isMe: true },
          { rank: 1, isMe: false },
        ],
      })),
    } as never);
  });

  it('proyecta todos los dominios sin perder el modo custodial del Cukie Pool', async () => {
    const dependencies = dashboardSummaryDependencies();
    dependencies.now = () => now;
    const result = await buildDashboardSummary({
      identity: {
        username: 'tester',
        walletNormalized: wallet,
        sessionExpiresAt: '2026-09-30T12:00:00.000Z',
      },
      runtime: { environment: 'staging', chainId: 97 },
      dependencies,
    });

    expect(result.modules.cukieMaster).toMatchObject({
      state: 'ready',
      data: { allocatedSlots: 3, routes: { uki: { allocatedSlots: 2 }, nft: { allocatedSlots: 1 } } },
    });
    expect(result.modules.credits).toMatchObject({
      state: 'ready',
      sourceObservedAt: '2026-08-30T11:59:00.000Z',
      data: { availableCredits: 250, poolAvailableCredits: 900 },
    });
    expect(result.modules.cukiePool).toMatchObject({
      state: 'ready',
      data: { positions: 2, activePositions: 2, gamesRemaining: 6 },
    });
    expect(result.modules.marketplace).toMatchObject({
      state: 'degraded',
      data: { inventory: 2, listingEligible: 1, activeListings: 1, attentionListings: 1 },
    });
    expect(result.modules.game).toMatchObject({
      state: 'ready',
      sourceObservedAt: '2026-08-30T11:58:00.000Z',
      data: { attemptsRemaining: 3, bestRank: 3, totalTickets: 12 },
    });
    expect(mockCredits).toHaveBeenCalledWith(wallet, now);
    expect(mockPool).toHaveBeenCalledWith({ walletAddress: wallet, limit: 50, now });
  });

  it('aísla un fallo de rewards sin ocultar los demás dominios', async () => {
    mockRewards.mockRejectedValue(new Error('reward db unavailable'));
    const dependencies = dashboardSummaryDependencies();
    dependencies.now = () => now;

    const result = await buildDashboardSummary({
      identity: { username: null, walletNormalized: wallet, sessionExpiresAt: now.toISOString() },
      runtime: { environment: 'staging', chainId: 97 },
      dependencies,
    });

    expect(result.overallState).toBe('partial');
    expect(result.modules.rewards.state).toBe('unavailable');
    expect(result.modules.credits.state).toBe('ready');
  });

  it('rechaza una lectura de vesting que proceda de mainnet', async () => {
    mockVesting.mockResolvedValue({ chainId: 56 } as never);
    const dependencies = dashboardSummaryDependencies();

    await expect(dependencies.loadVesting(wallet, now)).rejects.toThrow(
      'DASHBOARD_VESTING_CHAIN_MISMATCH',
    );
  });
});
