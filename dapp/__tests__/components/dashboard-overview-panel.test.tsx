import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DashboardOverviewPanel } from '@/components/wallet/dashboard-overview-panel';
import type { DashboardSummary } from '@/lib/dashboard/summary';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';
import { useAccount, useSwitchChain } from 'wagmi';

jest.mock('@/providers/auth-provider');
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useSwitchChain: jest.fn(),
}));
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: () => <button type="button">Conectar wallet</button>,
}));
jest.mock('lucide-react', () => {
  const Icon = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />;
  return {
    AlertTriangle: Icon,
    ArrowRight: Icon,
    CheckCircle2: Icon,
    Coins: Icon,
    Crown: Icon,
    Gamepad2: Icon,
    Gift: Icon,
    Layers3: Icon,
    Loader2: Icon,
    LockKeyhole: Icon,
    RefreshCw: Icon,
    Store: Icon,
  };
});

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUseSwitchChain = useSwitchChain as jest.MockedFunction<typeof useSwitchChain>;
const fetchMock = jest.fn();
const switchChain = jest.fn();
const wallet = '0x1111111111111111111111111111111111111111';

function authValue(user: User | null = { walletAddress: wallet } as User) {
  return {
    user,
    isLoading: false,
    isWaitingForApproval: false,
    walletType: user ? 'evm' as const : null,
    fetchUser: jest.fn(),
  };
}

function module<T>(data: T, state: 'ready' | 'degraded' = 'ready') {
  return {
    state,
    generatedAt: '2026-08-30T12:00:00.000Z',
    sourceObservedAt: '2026-08-30T11:59:00.000Z',
    issues: state === 'degraded' ? ['SOURCE_NOT_FRESH'] : [],
    data,
  };
}

function summary(overrides: Partial<DashboardSummary['modules']> = {}): DashboardSummary {
  const modules: DashboardSummary['modules'] = {
    cukieMaster: module({
      allocatedSlots: 2,
      desiredSlots: 2,
      maxPotentialSlots: 10,
      routes: {
        uki: { allocatedSlots: 2, desiredSlots: 2, sourceComplete: true, projectionFresh: true, synchronizing: false },
        nft: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
      },
    }),
    credits: module({
      availableCredits: 200,
      reservedCredits: 0,
      spentCredits: 25,
      poolDepositedCredits: 50,
      poolAvailableCredits: 700,
      activeReservations: 0,
    }),
    cukiePool: module({ positions: 2, activePositions: 1, gamesRemaining: 4 }),
    rewards: module({ claimableRaw: '1000000000000000000', allocations: 2, claims: 1, claimPublished: true, blockedAllocations: 0 }),
    marketplace: module({ inventory: 3, listingEligible: 2, activeListings: 1, attentionListings: 0 }),
    vesting: module({
      chainId: 97,
      configFrozen: true,
      hasPosition: true,
      totalAmountRaw: '100000000000000000000',
      releasedAmountRaw: '20000000000000000000',
      releasableRaw: '10000000000000000000',
      lockedAmountRaw: '70000000000000000000',
      progressBps: 3000,
    }),
    game: module({
      configured: true,
      enabled: true,
      phase: 'active',
      campaignId: 'stage-campaign',
      eligibilityKind: 'uki_staking',
      attemptsGranted: 3,
      attemptsUsed: 1,
      attemptsRemaining: 2,
      bestRank: 5,
      totalTickets: 12,
    }),
    ...overrides,
  };
  const alerts = Object.entries(modules).flatMap(([key, value]) => (
    value.state === 'ready'
      ? []
      : [{
        module: key as keyof typeof modules,
        severity: value.state === 'unavailable' ? 'error' as const : 'warning' as const,
        code: value.state === 'unavailable' ? 'MODULE_UNAVAILABLE' as const : 'MODULE_DEGRADED' as const,
      }]
  ));
  return {
    schemaVersion: 'dashboard-v1',
    generatedAt: '2026-08-30T12:00:00.000Z',
    overallState: alerts.length === 0 ? 'ready' : 'partial',
    identity: {
      username: 'tester',
      walletNormalized: wallet,
      sessionExpiresAt: '2026-09-30T12:00:00.000Z',
    },
    network: { environment: 'staging', chainId: 97 },
    alerts,
    modules,
  };
}

function response(data: DashboardSummary, ok = true) {
  return {
    ok,
    json: async () => ok ? { status: 'ok', data } : { status: 'error' },
  };
}

describe('DashboardOverviewPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    mockUseAuth.mockReturnValue(authValue());
    mockUseAccount.mockReturnValue({ chainId: 97, isConnected: true } as ReturnType<typeof useAccount>);
    mockUseSwitchChain.mockReturnValue({ switchChain, isPending: false } as unknown as ReturnType<typeof useSwitchChain>);
    fetchMock.mockResolvedValue(response(summary()));
  });

  it('no consulta datos privados sin sesión EVM firmada', () => {
    mockUseAuth.mockReturnValue(authValue(null));

    render(<DashboardOverviewPanel />);

    expect(screen.getAllByText('Conecta tu wallet').length).toBeGreaterThanOrEqual(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consume una sola API agregada y muestra identidad, módulos y actualización', async () => {
    render(<DashboardOverviewPanel />);

    expect(await screen.findByText('tester')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/v1/summary', expect.objectContaining({
      cache: 'no-store',
      credentials: 'same-origin',
    }));
    expect(screen.getByText('0x1111…1111')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getAllByText(/Actualizado/).length).toBeGreaterThanOrEqual(7);
  });

  it('conserva módulos válidos cuando otra fuente queda indisponible', async () => {
    const unavailableRewards = {
      state: 'unavailable' as const,
      generatedAt: '2026-08-30T12:00:00.000Z',
      sourceObservedAt: null,
      issues: ['MODULE_UNAVAILABLE'] as ['MODULE_UNAVAILABLE'],
      data: null,
    };
    fetchMock.mockResolvedValue(response(summary({ rewards: unavailableRewards })));

    render(<DashboardOverviewPanel />);

    expect(await screen.findByText('Algunos datos no están disponibles')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getAllByText('No disponible').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Puedes seguir usando el resto de tu cuenta/)).toBeInTheDocument();
  });

  it('detecta la red del navegador y permite cambiar a la configurada', async () => {
    mockUseAccount.mockReturnValue({ chainId: 56, isConnected: true } as ReturnType<typeof useAccount>);

    render(<DashboardOverviewPanel />);

    const button = await screen.findByRole('button', { name: 'Cambiar de red' });
    fireEvent.click(button);
    expect(switchChain).toHaveBeenCalledWith({ chainId: 97 });
  });

  it('falla cerrado si el contrato agregado no tiene el esquema esperado', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', data: { chainId: 97 } }) });

    render(<DashboardOverviewPanel />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No podemos cargar tu cuenta ahora'));
    expect(screen.queryByText('200')).not.toBeInTheDocument();
  });

  it('falla cerrado si un módulo declara datos incompletos', async () => {
    const corrupt = summary();
    corrupt.modules.cukieMaster = module({ allocatedSlots: 2 }) as never;
    fetchMock.mockResolvedValue(response(corrupt));

    render(<DashboardOverviewPanel />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No podemos cargar tu cuenta ahora'));
    expect(screen.queryByText('200')).not.toBeInTheDocument();
  });
});
