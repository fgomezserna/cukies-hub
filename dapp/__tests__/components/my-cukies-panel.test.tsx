import { fireEvent, render, screen } from '@testing-library/react';

import { MyCukiesPanel } from '@/components/cukies/my-cukies-panel';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
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
    marketplaceSurface: 'uki',
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

  it('muestra acciones de estado y permite filtrar la colección', async () => {
    fetchMock.mockResolvedValue(response([
      item({ state: 'listed', saleKind: 'legacy', marketplaceSurface: 'legacy', network: 'BSC', chainId: 56, assetId: `56:${legacyMarketplaceContracts.bsc.contracts.token.toLowerCase()}:98000005`, collectionAddress: legacyMarketplaceContracts.bsc.contracts.token, availableActions: ['cancel_sale'] }),
      item({ assetId: '97:0x3333333333333333333333333333333333333333:98000006', tokenId: '98000006', availableActions: ['deposit_pool', 'sell', 'stake_master'] }),
    ]));

    render(<MyCukiesPanel />);

    expect(await screen.findByRole('link', { name: /Cancelar venta/i })).toHaveAttribute(
      'href',
      `/marketplace/98000005?source=legacy&network=BSC&collection=${legacyMarketplaceContracts.bsc.contracts.token}`,
    );
    expect(screen.getByRole('link', { name: 'Hacer staking Master' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar colección' }), { target: { value: 'listed' } });
    expect(screen.getByRole('heading', { name: 'Cukie #98000005' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cukie #98000006' })).not.toBeInTheDocument();
  });

  it('dirige vender a la superficie cuya identidad está resuelta', async () => {
    fetchMock.mockResolvedValue(response([
      item({
        tokenId: '56',
        assetId: `56:${legacyMarketplaceContracts.bsc.contracts.token.toLowerCase()}:56`,
        chainId: 56,
        network: 'BSC',
        collectionAddress: legacyMarketplaceContracts.bsc.contracts.token,
        marketplaceSurface: 'legacy',
        availableActions: ['sell'],
      }),
      item({
        tokenId: '97',
        assetId: '97:0x3333333333333333333333333333333333333333:97',
        chainId: 97,
        network: 'BSC',
        collectionAddress: '0x3333333333333333333333333333333333333333',
        marketplaceSurface: 'uki',
        availableActions: ['sell'],
      }),
    ]));

    render(<MyCukiesPanel />);

    await screen.findByRole('heading', { name: 'Cukie #56' });
    const sellLinks = (await screen.findAllByRole('link', { name: /Vender/i }))
      .filter((link) => link.getAttribute('href')?.includes('tokenId=') || link.getAttribute('href')?.includes('/marketplace/56'));
    expect(sellLinks[0]).toHaveAttribute(
      'href',
      `/marketplace/56?source=legacy&network=BSC&collection=${legacyMarketplaceContracts.bsc.contracts.token}`,
    );
    expect(sellLinks[1]).toHaveAttribute(
      'href',
      '/marketplace?tokenId=97&collection=0x3333333333333333333333333333333333333333&chainId=97#mis-anuncios',
    );
  });

  it('mantiene visible una custodia Pool histórica con acceso contextual', async () => {
    fetchMock.mockResolvedValue(response([item({
      tokenId: '98000001',
      assetId: '97:0x3333333333333333333333333333333333333333:98000001',
      state: 'in_pool',
      custody: 'cukie_pool_recovery',
      collectionAddress: '0x3333333333333333333333333333333333333333',
      recoveryVaultAddress: '0x4444444444444444444444444444444444444444',
      recoveryWithdrawableAt: String(Math.floor(Date.now() / 1_000) + 86_400),
      availableActions: [],
    })]));

    render(<MyCukiesPanel />);

    expect(await screen.findByRole('heading', { name: 'Cukie #98000001' })).toBeInTheDocument();
    expect(screen.getAllByText('Estado pendiente de confirmar')).not.toHaveLength(0);
    expect(screen.queryByText('Retirada disponible')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Consultar posición/i })).toHaveAttribute(
      'href',
      '/cukie-hodler/recuperar?tokenId=98000001&recoveryVault=0x4444444444444444444444444444444444444444&collection=0x3333333333333333333333333333333333333333#pool-recovery',
    );
  });

  it('muestra un depósito previo sin solicitud como posición en el Pool', async () => {
    fetchMock.mockResolvedValue(response([item({
      tokenId: '98000004',
      assetId: '97:0x3333333333333333333333333333333333333333:98000004',
      state: 'in_pool',
      custody: 'cukie_pool_recovery',
      recoveryExitRequestedAt: '0',
      recoveryWithdrawableAt: '0',
      availableActions: [],
    })]));

    render(<MyCukiesPanel />);

    expect((await screen.findAllByText('En el Pool')).length).toBeGreaterThan(0);
    expect(screen.getByText('Puedes solicitar la retirada de este Cukie cuando quieras.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Solicitar retirada' })).toBeInTheDocument();
  });

  it('distingue una salida solicitada y muestra la fecha verificable', async () => {
    const withdrawableAt = String(Math.floor(Date.now() / 1_000) + 86_400);
    fetchMock.mockResolvedValue(response([item({
      tokenId: '98000002',
      assetId: '97:0x3333333333333333333333333333333333333333:98000002',
      state: 'in_pool',
      custody: 'cukie_pool_recovery',
      recoveryExitRequestedAt: String(Math.floor(Date.now() / 1_000) - 120),
      recoveryWithdrawableAt: withdrawableAt,
      availableActions: [],
    })]));

    render(<MyCukiesPanel />);

    expect((await screen.findAllByText('Salida solicitada')).length).toBeGreaterThan(0);
    expect(screen.getByText(/La retirada estará disponible desde/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver retirada' })).toBeInTheDocument();
  });

  it('solo marca la retirada disponible cuando hay solicitud y fecha ya vencida', async () => {
    fetchMock.mockResolvedValue(response([item({
      tokenId: '98000003',
      assetId: '97:0x3333333333333333333333333333333333333333:98000003',
      state: 'in_pool',
      custody: 'cukie_pool_recovery',
      recoveryExitRequestedAt: String(Math.floor(Date.now() / 1_000) - 86_400),
      recoveryWithdrawableAt: String(Math.floor(Date.now() / 1_000) - 3_600),
      availableActions: [],
    })]));

    render(<MyCukiesPanel />);

    expect((await screen.findAllByText('Retirada disponible')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Puedes retirarlo desde/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retirar Cukie' })).toBeInTheDocument();
  });
});
