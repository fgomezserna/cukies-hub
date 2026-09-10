import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithRuntime as render } from '../../test-utils/runtime-test-wrapper';

import { DashboardOverviewPanel } from '@/components/wallet/dashboard-overview-panel';
import type { DashboardSummary } from '@/lib/dashboard/summary';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';
import { useAccount, useSwitchChain } from 'wagmi';
import { usePathname } from 'next/navigation';

jest.mock('@/providers/auth-provider');
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useSwitchChain: jest.fn(),
}));
jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));
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
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const fetchMock = jest.fn();
const switchChain = jest.fn();
const wallet = '0x1111111111111111111111111111111111111111';
const otherWallet = '0x2222222222222222222222222222222222222222';

function setVisibilityState(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
}

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

function summary(
  overrides: Partial<DashboardSummary['modules']> = {},
  identityWallet = wallet,
  generatedAt = '2026-08-30T12:00:00.000Z',
): DashboardSummary {
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
    generatedAt,
    overallState: alerts.length === 0 ? 'ready' : 'partial',
    identity: {
      username: 'tester',
      walletNormalized: identityWallet,
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
    fetchMock.mockReset();
    global.fetch = fetchMock;
    mockUseAuth.mockReturnValue(authValue());
    mockUseAccount.mockReturnValue({ address: wallet, chainId: 97, isConnected: true } as unknown as ReturnType<typeof useAccount>);
    mockUseSwitchChain.mockReturnValue({ switchChain, isPending: false } as unknown as ReturnType<typeof useSwitchChain>);
    mockUsePathname.mockReturnValue('/dashboard');
    fetchMock.mockResolvedValue(response(summary()));
    setVisibilityState('visible');
  });

  afterEach(() => {
    jest.useRealTimers();
    setVisibilityState('visible');
  });

  it('no consulta datos privados sin sesión EVM firmada', () => {
    mockUseAuth.mockReturnValue(authValue(null));

    render(<DashboardOverviewPanel />);

    expect(screen.getAllByText('Firma tu wallet').length).toBeGreaterThanOrEqual(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consume una sola API agregada y muestra identidad y módulos sin detalles técnicos', async () => {
    render(<DashboardOverviewPanel />);

    expect(await screen.findByText('tester')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/v1/summary', expect.objectContaining({
      cache: 'no-store',
      credentials: 'same-origin',
    }));
    expect(screen.getByText('0x1111…1111')).toBeInTheDocument();
    expect(screen.getAllByText('200').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/Actualizado/)).toBeInTheDocument();
    expect(screen.getByText(/Actualizado/)).toHaveAttribute('dateTime', '2026-08-30T12:00:00.000Z');
    expect(screen.getByRole('link', { name: /Usar o aportar/i })).toHaveAttribute('href', '/credits');
    expect(screen.getByRole('link', { name: /Ver mis premios/i })).toHaveAttribute('href', '/premios');
  });

  it('elige una acción principal basada en los datos disponibles', async () => {
    render(<DashboardOverviewPanel />);

    const primaryAction = await screen.findByRole('link', { name: /Jugar ahora/i });
    expect(primaryAction).toHaveAttribute('href', '/games/treasure-hunt');
    expect(screen.getByText('Tienes una partida lista')).toBeInTheDocument();
  });

  it.each(['uki', 'nft'] as const)('mantiene los cupos como desconocidos si la ruta %s no está reconciliada', async (route) => {
    fetchMock.mockResolvedValue(response(summary({
      cukieMaster: module({
        allocatedSlots: 5,
        desiredSlots: 5,
        maxPotentialSlots: 10,
        routes: {
          uki: { allocatedSlots: 5, desiredSlots: 5, sourceComplete: true, projectionFresh: route !== 'uki', synchronizing: false },
          nft: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: route !== 'nft', synchronizing: false },
        },
      }),
    })));

    render(<DashboardOverviewPanel />);

    await screen.findByText('tester');
    const metric = screen.getByText('Cupos activos').closest('div') as HTMLElement;
    expect(within(metric).getByText('No disponible')).toBeInTheDocument();
    expect(within(metric).queryByText('5 / 10')).not.toBeInTheDocument();
  });

  it('conserva la lectura lista y evita peticiones duplicadas al actualizar', async () => {
    const refreshed = summary({}, wallet, '2026-08-30T12:30:00.000Z');
    let resolveRefresh!: (value: ReturnType<typeof response>) => void;
    fetchMock
      .mockResolvedValueOnce(response(summary()))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));

    render(<DashboardOverviewPanel />);
    const masterCard = (await screen.findByText('Cukie Master')).closest('article') as HTMLElement;
    expect(within(masterCard).getByText('2')).toBeInTheDocument();

    const refreshButton = screen.getByRole('button', { name: 'Actualizar' });
    expect(refreshButton).toBeEnabled();
    await act(async () => {
      fireEvent.click(refreshButton);
      fireEvent.click(refreshButton);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(within(masterCard).getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeDisabled();

    await act(async () => {
      resolveRefresh(response(refreshed));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText(/Actualizado/)).toHaveAttribute('dateTime', '2026-08-30T12:30:00.000Z'));
  });

  it('no ofrece reclamar si el premio aún no está publicado con juego y créditos agotados', async () => {
    fetchMock.mockResolvedValue(response(summary({
      game: module({
        configured: true,
        enabled: true,
        phase: 'active',
        campaignId: 'stage-campaign',
        eligibilityKind: 'uki_staking',
        attemptsGranted: 0,
        attemptsUsed: 0,
        attemptsRemaining: 0,
        bestRank: null,
        totalTickets: 0,
      }),
      credits: module({
        availableCredits: 0,
        reservedCredits: 0,
        spentCredits: 0,
        poolDepositedCredits: 0,
        poolAvailableCredits: 0,
        activeReservations: 0,
      }),
      rewards: module({ claimableRaw: '1000000000000000000', allocations: 1, claims: 0, claimPublished: false, blockedAllocations: 0 }),
      vesting: module({
        chainId: 97,
        configFrozen: true,
        hasPosition: false,
        totalAmountRaw: '0',
        releasedAmountRaw: '0',
        releasableRaw: '0',
        lockedAmountRaw: '0',
        progressBps: 0,
      }),
    })));

    render(<DashboardOverviewPanel />);

    expect(await screen.findByRole('link', { name: /Consultar premios/i })).toHaveAttribute('href', '/premios');
    expect(screen.queryByRole('link', { name: /Reclamar premios/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Tienes premios confirmados')).not.toBeInTheDocument();
  });

  it('no ofrece liberar si el calendario no está congelado con juego y créditos agotados', async () => {
    fetchMock.mockResolvedValue(response(summary({
      game: module({
        configured: true,
        enabled: true,
        phase: 'active',
        campaignId: 'stage-campaign',
        eligibilityKind: 'uki_staking',
        attemptsGranted: 0,
        attemptsUsed: 0,
        attemptsRemaining: 0,
        bestRank: null,
        totalTickets: 0,
      }),
      credits: module({
        availableCredits: 0,
        reservedCredits: 0,
        spentCredits: 0,
        poolDepositedCredits: 0,
        poolAvailableCredits: 0,
        activeReservations: 0,
      }),
      rewards: module({ claimableRaw: '0', allocations: 0, claims: 0, claimPublished: true, blockedAllocations: 0 }),
      vesting: module({
        chainId: 97,
        configFrozen: false,
        hasPosition: true,
        totalAmountRaw: '100000000000000000000',
        releasedAmountRaw: '0',
        releasableRaw: '1000000000000000000',
        lockedAmountRaw: '99000000000000000000',
        progressBps: 0,
      }),
    })));

    render(<DashboardOverviewPanel />);

    expect(await screen.findByRole('link', { name: /Consultar vesting/i })).toHaveAttribute('href', '/vesting');
    expect(screen.queryByRole('link', { name: /Ver desbloqueo/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Hay UKI disponibles para liberar')).not.toBeInTheDocument();
  });

  it('prioriza revisar el estado cuando la fuente de premios está degradada', async () => {
    fetchMock.mockResolvedValue(response(summary({
      game: module({
        configured: true,
        enabled: true,
        phase: 'active',
        campaignId: 'stage-campaign',
        eligibilityKind: 'uki_staking',
        attemptsGranted: 0,
        attemptsUsed: 0,
        attemptsRemaining: 0,
        bestRank: null,
        totalTickets: 0,
      }),
      credits: module({
        availableCredits: 0,
        reservedCredits: 0,
        spentCredits: 0,
        poolDepositedCredits: 0,
        poolAvailableCredits: 0,
        activeReservations: 0,
      }),
      rewards: module({ claimableRaw: '1000000000000000000', allocations: 1, claims: 0, claimPublished: true, blockedAllocations: 0 }, 'degraded'),
      vesting: module({
        chainId: 97,
        configFrozen: true,
        hasPosition: false,
        totalAmountRaw: '0',
        releasedAmountRaw: '0',
        releasableRaw: '0',
        lockedAmountRaw: '0',
        progressBps: 0,
      }),
    })));

    render(<DashboardOverviewPanel />);

    expect(await screen.findByRole('link', { name: /Revisar estado/i })).toHaveAttribute('href', '#dashboard-data-status');
    expect(screen.queryByRole('link', { name: /Reclamar premios/i })).not.toBeInTheDocument();
  });

  it('no muestra la wallet completa como texto duplicado', async () => {
    render(<DashboardOverviewPanel />);

    await screen.findByText('tester');
    expect(screen.queryByText(wallet)).not.toBeInTheDocument();
    expect(screen.getByText('0x1111…1111')).toHaveAttribute('title', wallet);
  });

  it('ancla los avisos a la sección afectada', async () => {
    const data = summary({
      marketplace: {
        state: 'unavailable' as const,
        generatedAt: '2026-08-30T12:00:00.000Z',
        sourceObservedAt: null,
        issues: ['MODULE_UNAVAILABLE'] as ['MODULE_UNAVAILABLE'],
        data: null,
      },
    });
    fetchMock.mockResolvedValue(response(data));

    render(<DashboardOverviewPanel />);

    expect(await screen.findByText('Algunos datos no están disponibles')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver Marketplace/i })).toHaveAttribute('href', '#dashboard-module-marketplace');
  });

  it('mantiene geometría estable mientras llega la primera lectura', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));

    render(<DashboardOverviewPanel />);

    expect(screen.getByTestId('dashboard-skeleton')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Cargando tu cuenta…')).toBeInTheDocument();
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
    expect(screen.getAllByText('200').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('No disponible').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Puedes seguir usando el resto de tu cuenta/)).toBeInTheDocument();
  });

  it('muestra la lectura agregada aunque la wallet esté en otra red', async () => {
    mockUseAccount.mockReturnValue({ address: wallet, chainId: 56, isConnected: true } as unknown as ReturnType<typeof useAccount>);

    render(<DashboardOverviewPanel />);

    expect(await screen.findByText('tester')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cambiar de red' })).not.toBeInTheDocument();
    expect(switchChain).not.toHaveBeenCalled();
  });

  it('distinguishes a calendar awaiting confirmation from missing financial data', async () => {
    const data = summary();
    const vesting = data.modules.vesting;
    if (vesting.state === 'unavailable') throw new Error('fixture');
    fetchMock.mockResolvedValue(response(summary({
      vesting: module({ ...vesting.data, configFrozen: false }, 'degraded'),
    })));

    render(<DashboardOverviewPanel />);

    expect(await screen.findByText('Algunos datos requieren atención')).toBeInTheDocument();
    expect(screen.getByText('El calendario de liberación está pendiente de confirmación')).toBeInTheDocument();
    expect(screen.getByText('100 UKI')).toBeInTheDocument();
    expect(screen.queryByText('Algunos datos no están disponibles')).not.toBeInTheDocument();
    expect(screen.queryByText('No disponible')).not.toBeInTheDocument();
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

  it('actualiza los datos al recuperar el foco de la pestaña', async () => {
    jest.useFakeTimers();
    const initial = summary({
      cukieMaster: module({
        allocatedSlots: 5,
        desiredSlots: 5,
        maxPotentialSlots: 10,
        routes: {
          uki: { allocatedSlots: 5, desiredSlots: 5, sourceComplete: true, projectionFresh: true, synchronizing: false },
          nft: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
        },
      }),
    });
    const refreshed = summary({
      cukieMaster: module({
        allocatedSlots: 0,
        desiredSlots: 0,
        maxPotentialSlots: 10,
        routes: {
          uki: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
          nft: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
        },
      }),
    }, wallet, '2026-08-30T12:30:00.000Z');
    fetchMock.mockResolvedValueOnce(response(initial)).mockResolvedValueOnce(response(refreshed));

    render(<DashboardOverviewPanel />);
    const masterCard = (await screen.findByText('Cukie Master')).closest('article') as HTMLElement;
    expect(await within(masterCard).findByText('5')).toBeInTheDocument();

    await act(async () => { jest.advanceTimersByTime(30_000); });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(masterCard).getByText('0')).toBeInTheDocument());
    expect(screen.getByText(/Actualizado/)).toHaveAttribute('dateTime', '2026-08-30T12:30:00.000Z');
  });

  it('mantiene el polling solo visible, detiene el intervalo oculto y evita solapamientos', async () => {
    jest.useFakeTimers();
    let resolveRefresh!: (value: ReturnType<typeof response>) => void;
    fetchMock
      .mockResolvedValueOnce(response(summary()))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));

    render(<DashboardOverviewPanel />);
    expect(await screen.findByText('tester')).toBeInTheDocument();

    await act(async () => { jest.advanceTimersByTime(30_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { jest.advanceTimersByTime(10_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    setVisibilityState('hidden');
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolveRefresh(response(summary({ cukieMaster: module({
      allocatedSlots: 0,
      desiredSlots: 0,
      maxPotentialSlots: 10,
      routes: {
        uki: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
        nft: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
      },
    }) })));
    await act(async () => { await Promise.resolve(); });

    setVisibilityState('visible');
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it('ignora una respuesta pendiente cuando cambia la identidad de wallet', async () => {
    let resolveOld!: (value: ReturnType<typeof response>) => void;
    const oldSummary = summary({ cukieMaster: module({
      allocatedSlots: 5,
      desiredSlots: 5,
      maxPotentialSlots: 10,
      routes: {
        uki: { allocatedSlots: 5, desiredSlots: 5, sourceComplete: true, projectionFresh: true, synchronizing: false },
        nft: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
      },
    }) });
    const newSummary = summary({ cukieMaster: module({
      allocatedSlots: 3,
      desiredSlots: 3,
      maxPotentialSlots: 10,
      routes: {
        uki: { allocatedSlots: 3, desiredSlots: 3, sourceComplete: true, projectionFresh: true, synchronizing: false },
        nft: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
      },
    }) }, otherWallet);
    fetchMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(response(newSummary));

    const view = render(<DashboardOverviewPanel />);
    mockUseAuth.mockReturnValue(authValue({ walletAddress: otherWallet } as User));
    mockUseAccount.mockReturnValue({ address: otherWallet, chainId: 97, isConnected: true } as unknown as ReturnType<typeof useAccount>);
    view.rerender(<DashboardOverviewPanel />);

    const masterCard = (await screen.findByText('Cukie Master')).closest('article') as HTMLElement;
    await waitFor(() => expect(within(masterCard).getByText('3')).toBeInTheDocument());
    await act(async () => {
      resolveOld(response(oldSummary));
      await Promise.resolve();
    });
    expect(within(masterCard).getByText('3')).toBeInTheDocument();
    expect(within(masterCard).queryByText('5')).not.toBeInTheDocument();
  });

  it('retira la última lectura mientras cambia la sesión y descarta la respuesta antigua', async () => {
    jest.useFakeTimers();
    let resolveOld!: (value: ReturnType<typeof response>) => void;
    fetchMock
      .mockResolvedValueOnce(response(summary()))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));

    const view = render(<DashboardOverviewPanel />);
    const masterCard = (await screen.findByText('Cukie Master')).closest('article') as HTMLElement;
    expect(await within(masterCard).findByText('2')).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(30_000); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    mockUseAuth.mockReturnValue({ ...authValue(null), isLoading: true });
    view.rerender(<DashboardOverviewPanel />);
    expect(screen.queryByText('tester')).not.toBeInTheDocument();

    await act(async () => {
      resolveOld(response(summary({ cukieMaster: module({
        allocatedSlots: 5,
        desiredSlots: 5,
        maxPotentialSlots: 10,
        routes: {
          uki: { allocatedSlots: 5, desiredSlots: 5, sourceComplete: true, projectionFresh: true, synchronizing: false },
          nft: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
        },
      }) })));
      await Promise.resolve();
    });
    expect(screen.queryByText('tester')).not.toBeInTheDocument();
  });

  it('conserva la última lectura si falla un refresco y se recupera después', async () => {
    jest.useFakeTimers();
    const recovered = summary({ cukieMaster: module({
      allocatedSlots: 0,
      desiredSlots: 0,
      maxPotentialSlots: 10,
      routes: {
        uki: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
        nft: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
      },
    }) });
    fetchMock
      .mockResolvedValueOnce(response(summary()))
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(response(recovered));

    render(<DashboardOverviewPanel />);
    const masterCard = (await screen.findByText('Cukie Master')).closest('article') as HTMLElement;
    expect(await within(masterCard).findByText('2')).toBeInTheDocument();

    await act(async () => { jest.advanceTimersByTime(30_005); });
    await waitFor(() => expect(screen.getByText('No hemos podido actualizar tu cuenta')).toBeInTheDocument());
    expect(within(masterCard).getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('200').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/última lectura disponible/i)).toBeInTheDocument();

    await act(async () => { jest.advanceTimersByTime(30_000); });
    await waitFor(() => expect(within(masterCard).getByText('0')).toBeInTheDocument());
    expect(screen.queryByText('No hemos podido actualizar tu cuenta')).not.toBeInTheDocument();
  });

  it('libera una petición bloqueada por timeout para que el siguiente polling se recupere', async () => {
    jest.useFakeTimers();
    const recovered = summary({ cukieMaster: module({
      allocatedSlots: 0,
      desiredSlots: 0,
      maxPotentialSlots: 10,
      routes: {
        uki: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
        nft: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
      },
    }) });
    const aborted = (_input: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
    fetchMock
      .mockImplementationOnce(aborted)
      .mockImplementationOnce(aborted)
      .mockImplementationOnce(aborted)
      .mockResolvedValueOnce(response(recovered));

    render(<DashboardOverviewPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => { await jest.advanceTimersByTimeAsync(20_005); });
    await act(async () => { await jest.advanceTimersByTimeAsync(20_005); });
    await act(async () => { await jest.advanceTimersByTimeAsync(20_005); });
    expect(screen.getByRole('alert')).toHaveTextContent('No podemos cargar tu cuenta ahora');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const masterCard = (await screen.findByText('Cukie Master')).closest('article') as HTMLElement;
    await waitFor(() => expect(within(masterCard).getByText('0')).toBeInTheDocument());
  });

  it('descarta un JSON que llega después del deadline y acepta el siguiente polling', async () => {
    jest.useFakeTimers();
    let resolveJson!: (value: unknown) => void;
    const recovered = summary({ cukieMaster: module({
      allocatedSlots: 0,
      desiredSlots: 0,
      maxPotentialSlots: 10,
      routes: {
        uki: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
        nft: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
      },
    }) });
    const lateResponse = {
      ok: true,
      json: () => new Promise((resolve) => { resolveJson = resolve; }),
    };
    fetchMock
      .mockResolvedValueOnce(lateResponse)
      .mockResolvedValueOnce(lateResponse)
      .mockResolvedValueOnce(lateResponse)
      .mockResolvedValueOnce(response(recovered));

    render(<DashboardOverviewPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => { await jest.advanceTimersByTimeAsync(20_005); });
    await act(async () => { await jest.advanceTimersByTimeAsync(20_005); });
    await act(async () => { await jest.advanceTimersByTimeAsync(20_005); });
    expect(screen.getByRole('alert')).toHaveTextContent('No podemos cargar tu cuenta ahora');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const masterCard = (await screen.findByText('Cukie Master')).closest('article') as HTMLElement;
    await waitFor(() => expect(within(masterCard).getByText('0')).toBeInTheDocument());

    await act(async () => {
      resolveJson({ status: 'ok', data: summary({ cukieMaster: module({
        allocatedSlots: 5,
        desiredSlots: 5,
        maxPotentialSlots: 10,
        routes: {
          uki: { allocatedSlots: 5, desiredSlots: 5, sourceComplete: true, projectionFresh: true, synchronizing: false },
          nft: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
        },
      }) }) });
      await Promise.resolve();
    });
    expect(within(masterCard).getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('No podemos cargar tu cuenta ahora')).not.toBeInTheDocument();
  });
});
