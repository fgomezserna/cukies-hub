import { render, screen } from '@testing-library/react';

import { MyCukiesPanel } from '@/components/cukies/my-cukies-panel';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';

jest.mock('@/providers/auth-provider');
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: () => <button type="button">Conectar wallet</button>,
}));
jest.mock('@/components/legacy-marketplace/cuki-image', () => ({
  CukiImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));
jest.mock('lucide-react', () => {
  const Icon = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />;
  return {
    ArrowRight: Icon,
    Cookie: Icon,
    Layers3: Icon,
    Loader2: Icon,
    RefreshCw: Icon,
    Store: Icon,
  };
});

const wallet = '0x2222222222222222222222222222222222222222';
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const fetchMock = jest.fn();

function authValue(user: User | null = { walletAddress: wallet } as User) {
  return {
    user,
    isLoading: false,
    isWaitingForApproval: false,
    walletType: user ? 'evm' as const : null,
    fetchUser: jest.fn(),
  };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    assetId: '97:0x3333333333333333333333333333333333333333:98000005',
    tokenId: '98000005',
    imageUrl: 'https://assets.example/cukie-5.png',
    generation: 'original',
    rarity: 'legendary',
    state: 'available',
    custody: 'wallet',
    poolStatus: null,
    ...overrides,
  };
}

function response(items: ReturnType<typeof item>[]) {
  const inWallet = items.filter((cukie) => cukie.custody === 'wallet').length;
  const inPool = items.filter((cukie) => cukie.custody === 'cukie_pool').length;
  const inCukieMaster = items.filter((cukie) => cukie.custody === 'cukie_master').length;
  return {
    ok: true,
    json: async () => ({
      status: 'ok',
      data: {
        walletNormalized: wallet,
        items,
        summary: {
          total: items.length,
          inWallet,
          available: items.filter((cukie) => cukie.state === 'available').length,
          onSale: items.filter((cukie) => cukie.state === 'listed').length,
          inPool,
          inCukieMaster,
          otherInUse: 0,
        },
      },
    }),
  };
}

describe('MyCukiesPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    mockUseAuth.mockReturnValue(authValue());
  });

  it('pide conectar la wallet antes de mostrar una colección', () => {
    mockUseAuth.mockReturnValue(authValue(null));
    render(<MyCukiesPanel />);

    expect(screen.getByRole('heading', { name: 'Consulta y gestiona tus Cukies' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar wallet' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('muestra únicamente los Cukies de la wallet con imagen, estado y acción', async () => {
    fetchMock.mockResolvedValue(response([item()]));

    render(<MyCukiesPanel />);

    expect(await screen.findByRole('heading', { name: 'Cukie #98000005' })).toBeInTheDocument();
    expect(screen.getByAltText('Cukie #98000005')).toBeInTheDocument();
    expect(screen.getAllByText('Disponible')).not.toHaveLength(0);
    expect(screen.getByText('Original · Legendario')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Aportar al pool/i })).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: expect.stringContaining('/cukie-hodler#cukies-disponibles') }),
    ]));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('walletAddress=' + wallet), expect.any(Object));
  });

  it('separa la custodia de wallet, pool y Cukie Master en el total real', async () => {
    fetchMock.mockResolvedValue(response([
      item(),
      item({
        assetId: '97:0x3333333333333333333333333333333333333333:98000001',
        tokenId: '98000001',
        state: 'in_pool',
        custody: 'cukie_pool',
        poolStatus: 'active',
      }),
      item({
        assetId: '97:0x3333333333333333333333333333333333333333:98000002',
        tokenId: '98000002',
        state: 'cukie_master',
        custody: 'cukie_master',
      }),
    ]));

    render(<MyCukiesPanel />);

    expect(await screen.findByRole('heading', { name: '3 Cukies' })).toBeInTheDocument();
    expect(screen.getByText('En el pool')).toBeInTheDocument();
    expect(screen.getAllByText('En Cukie Master')).not.toHaveLength(0);
    expect(screen.getByRole('link', { name: /Gestionar en el pool/i })).toHaveAttribute('href', '/cukie-hodler#mis-cukies-aportados');
    expect(screen.getByRole('link', { name: /Gestionar Cukie Master/i })).toHaveAttribute('href', '/cukie-master#cukie-master-nft-staking');
  });

  it('muestra un vacío útil cuando la wallet no tiene Cukies', async () => {
    fetchMock.mockResolvedValue(response([]));
    render(<MyCukiesPanel />);

    expect(await screen.findByRole('heading', { name: 'Aún no hay Cukies en esta wallet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explorar marketplace/i })).toHaveAttribute('href', '/marketplace');
  });
});
