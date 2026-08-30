import { render, screen, within } from '@testing-library/react';

import { HoldingsOverviewPanel } from '@/components/wallet/holdings-overview-panel';
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
  Loader2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  LockKeyhole: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  RefreshCw: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Store: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
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
  if (url.startsWith('/api/marketplace/v1/inventory')) {
    return ok({
      items: [
        { assetId: 'asset-1', state: 'available', listingEligible: true },
        { assetId: 'asset-2', state: 'cukie_pool', listingEligible: false },
      ],
    });
  }
  if (url.startsWith('/api/marketplace/v1/orders')) {
    return ok({
      orders: [
        { orderId: 'order-1', status: 'active' },
        { orderId: 'order-2', status: 'requires_attention' },
      ],
    });
  }
  if (url.startsWith('/api/vesting/v1/status')) {
    return ok({
      chainId: 97,
      configFrozen: true,
      hasPosition: true,
      totalAmountRaw: '10000000000000000000000',
      releasedAmountRaw: '2000000000000000000000',
      releasableRaw: '500000000000000000000',
      lockedAmountRaw: '7500000000000000000000',
      progressBps: 2500,
    });
  }
  throw new Error(`unexpected URL ${url}`);
}

describe('HoldingsOverviewPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue(authValue());
    global.fetch = fetchMock;
    fetchMock.mockImplementation((url: string) => Promise.resolve(responseFor(url)));
  });

  it('no solicita inventario ni vesting sin una wallet EVM firmada', () => {
    mockUseAuth.mockReturnValue(authValue({ user: null, walletType: null }));

    render(<HoldingsOverviewPanel />);

    expect(screen.getByText('Firma una wallet EVM para ver tus activos')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resume inventario, anuncios y calendario on-chain de Testnet', async () => {
    render(<HoldingsOverviewPanel />);

    const marketplace = (await screen.findByRole('heading', { name: 'Marketplace' })).closest('article');
    const vesting = screen.getByRole('heading', { name: 'Vesting de preventa' }).closest('article');
    expect(await within(marketplace!).findByText('2')).toBeInTheDocument();
    expect(within(marketplace!).getByText(/1 disponibles para listar/i)).toBeInTheDocument();
    expect(within(marketplace!).getByText(/1 anuncios activos/i)).toBeInTheDocument();
    expect(within(marketplace!).getByText(/1 anuncios requieren atención/i)).toBeInTheDocument();
    expect(within(vesting!).getByText('10.000 UKI')).toBeInTheDocument();
    expect(within(vesting!).getByText(/500 UKI disponibles ahora/i)).toBeInTheDocument();
    expect(within(vesting!).getByText(/Chain 97 · calendario congelado/i)).toBeInTheDocument();
    expect(within(vesting!).getByRole('progressbar', { name: 'Progreso de vesting' }))
      .toHaveAttribute('aria-valuenow', '25');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('mantiene el vesting confirmado si marketplace no está disponible', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/marketplace/v1/inventory')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ status: 'error', code: 'UKI_MARKETPLACE_UNAVAILABLE' }),
        });
      }
      return Promise.resolve(responseFor(url));
    });

    render(<HoldingsOverviewPanel />);

    const marketplace = (await screen.findByRole('heading', { name: 'Marketplace' })).closest('article');
    const vesting = screen.getByRole('heading', { name: 'Vesting de preventa' }).closest('article');
    expect(await within(marketplace!).findByText('No disponible')).toBeInTheDocument();
    expect(within(vesting!).getByText('10.000 UKI')).toBeInTheDocument();
  });

  it('rechaza un vesting cuya suma no coincide con la asignación', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/vesting/v1/status')) {
        return Promise.resolve(ok({
          chainId: 97,
          configFrozen: true,
          hasPosition: true,
          totalAmountRaw: '1000',
          releasedAmountRaw: '900',
          releasableRaw: '500',
          lockedAmountRaw: '0',
          progressBps: 10000,
        }));
      }
      return Promise.resolve(responseFor(url));
    });

    render(<HoldingsOverviewPanel />);

    const vesting = (await screen.findByRole('heading', { name: 'Vesting de preventa' })).closest('article');
    expect(await within(vesting!).findByText('No disponible')).toBeInTheDocument();
    expect(within(vesting!).queryByText(/1.000 UKI/)).not.toBeInTheDocument();
  });
});
