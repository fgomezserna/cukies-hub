import { render, screen, waitFor, within } from '@testing-library/react';

import { EconomyOverviewPanel } from '@/components/wallet/economy-overview-panel';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';

jest.mock('@/providers/auth-provider');
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: () => <button type="button">Conectar wallet</button>,
}));
jest.mock('lucide-react', () => ({
  AlertTriangle: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  ArrowRight: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  CheckCircle2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Coins: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Crown: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Gift: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Layers3: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Loader2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  RefreshCw: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const fetchMock = jest.fn();
const wallet = '0x1111111111111111111111111111111111111111';

function authValue(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  return {
    user: { walletAddress: wallet } as User,
    isLoading: false,
    isWaitingForApproval: false,
    walletType: 'evm' as const,
    fetchUser: jest.fn(),
    ...overrides,
  };
}

function ok(data: unknown) {
  return { ok: true, json: async () => ({ status: 'ok', data }) };
}

function responseFor(url: string) {
  if (url.startsWith('/api/economy/v1/cukie-master')) {
    return ok({
      totals: { allocatedSlots: 3, desiredSlots: 4, maxPotentialSlots: 10 },
      routes: {
        uki: { source: { complete: true }, synchronizing: false },
        nft: { source: { complete: true }, synchronizing: false },
      },
    });
  }
  if (url.startsWith('/api/economy/v1/credits')) {
    return ok({
      balance: {
        availableCredits: 180,
        spentCredits: 20,
        poolDepositedCredits: 100,
        blocked: false,
      },
      pool: { availableCredits: 900, blocked: false },
      grants: { healthy: true },
    });
  }
  if (url.startsWith('/api/economy/v1/cukie-pool')) {
    return ok({
      positions: [
        { status: 'active', gamesRemaining: 5 },
        { status: 'withdrawal_pending', gamesRemaining: 0 },
      ],
      sourceHealthy: true,
    });
  }
  if (url.startsWith('/api/economy/v1/rewards')) {
    return ok({
      claimableRaw: '2500000000000000000',
      allocations: [{ allocationId: 'allocation-1' }, { allocationId: 'allocation-2' }],
      claims: [{ eventId: 'claim-1' }],
      claimPublished: true,
      healthy: true,
    });
  }
  throw new Error(`unexpected URL ${url}`);
}

describe('EconomyOverviewPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue(authValue());
    global.fetch = fetchMock;
    fetchMock.mockImplementation((url: string) => Promise.resolve(responseFor(url)));
  });

  it('no consulta balances privados sin una sesión EVM firmada', () => {
    mockUseAuth.mockReturnValue(authValue({ user: null, walletType: null }));

    render(<EconomyOverviewPanel />);

    expect(screen.getByText('Conecta y firma una wallet EVM')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resume las cuatro fuentes canónicas sin mezclar datos estimados', async () => {
    render(<EconomyOverviewPanel />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      `/api/economy/v1/cukie-master?walletAddress=${wallet}`,
      `/api/economy/v1/credits?walletAddress=${wallet}`,
      `/api/economy/v1/cukie-pool?walletAddress=${wallet}&limit=50`,
      `/api/economy/v1/rewards?walletAddress=${wallet}&limit=50`,
    ]));
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toMatchObject({ cache: 'no-store', credentials: 'same-origin' });
    }

    const masterCard = screen.getByRole('heading', { name: 'Cukie Master' }).closest('article');
    const creditCard = screen.getByRole('heading', { name: 'Créditos' }).closest('article');
    const poolCard = screen.getByRole('heading', { name: 'Pool de Cukies' }).closest('article');
    const rewardCard = screen.getByRole('heading', { name: 'Rewards' }).closest('article');
    expect(masterCard).not.toBeNull();
    expect(creditCard).not.toBeNull();
    expect(poolCard).not.toBeNull();
    expect(rewardCard).not.toBeNull();
    expect(await within(masterCard!).findByText('3 / 10')).toBeInTheDocument();
    expect(within(creditCard!).getByText('180')).toBeInTheDocument();
    expect(within(creditCard!).getByText(/900 disponibles en el pool/i)).toBeInTheDocument();
    expect(within(poolCard!).getByText('1')).toBeInTheDocument();
    expect(within(poolCard!).getByText(/5 partidas restantes/i)).toBeInTheDocument();
    expect(within(rewardCard!).getByText('2,5 UKI')).toBeInTheDocument();
    expect(within(rewardCard!).getByText(/2 asignaciones visibles/i)).toBeInTheDocument();
  });

  it('aísla una fuente caída y mantiene visibles los demás módulos confirmados', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/economy/v1/credits')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ status: 'error', code: 'CREDIT_SERVICE_UNAVAILABLE' }),
        });
      }
      return Promise.resolve(responseFor(url));
    });

    render(<EconomyOverviewPanel />);

    const creditCard = (await screen.findByRole('heading', { name: 'Créditos' })).closest('article');
    const rewardCard = screen.getByRole('heading', { name: 'Rewards' }).closest('article');
    expect(await within(creditCard!).findByText('No disponible')).toBeInTheDocument();
    expect(within(creditCard!).queryByText('180')).not.toBeInTheDocument();
    expect(within(rewardCard!).getByText('2,5 UKI')).toBeInTheDocument();
  });

  it('rechaza una respuesta manipulada en vez de renderizar cifras parciales', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/economy/v1/cukie-pool')) {
        return Promise.resolve(ok({ positions: [{ status: 'active', gamesRemaining: -4 }], sourceHealthy: true }));
      }
      return Promise.resolve(responseFor(url));
    });

    render(<EconomyOverviewPanel />);

    const poolCard = (await screen.findByRole('heading', { name: 'Pool de Cukies' })).closest('article');
    expect(await within(poolCard!).findByText('No disponible')).toBeInTheDocument();
    expect(within(poolCard!).queryByText('-4')).not.toBeInTheDocument();
  });
});
