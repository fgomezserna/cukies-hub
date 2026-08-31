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

function response(items: unknown[]) {
  return {
    ok: true,
    json: async () => ({
      source: 'mongo',
      items,
      total: items.length,
      offset: 0,
      limit: 100,
      facets: { states: [], networks: [], types: [], generations: [] },
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
    fetchMock.mockResolvedValue(response([{
      id: 'cuki-5',
      tokenId: '98000005',
      cukiNumber: 5,
      owner: wallet,
      network: 'BSC',
      origin: null,
      birthNetwork: 'BSC',
      imageUrl: 'https://assets.example/cukie-5.png',
      type: 5,
      state: 'available',
      price: null,
      priceOriginal: null,
      skills: { generation: 1 },
      childrenCount: 0,
      childrenCountTron: 0,
      childrenCountBsc: 0,
      parents: [],
      children: [],
      history: [],
      timestamp: null,
    }]));

    render(<MyCukiesPanel />);

    expect(await screen.findByRole('heading', { name: 'Cukie #5' })).toBeInTheDocument();
    expect(screen.getByAltText('Cukie #5')).toBeInTheDocument();
    expect(screen.getByText('Disponible')).toBeInTheDocument();
    expect(screen.getByText('Original · Legendario')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver ficha/i })).toHaveAttribute('href', '/marketplace/98000005');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('owner=' + wallet), expect.any(Object));
  });

  it('muestra un vacío útil cuando la wallet no tiene Cukies', async () => {
    fetchMock.mockResolvedValue(response([]));
    render(<MyCukiesPanel />);

    expect(await screen.findByRole('heading', { name: 'Aún no hay Cukies en esta wallet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explorar marketplace/i })).toHaveAttribute('href', '/marketplace');
  });
});
