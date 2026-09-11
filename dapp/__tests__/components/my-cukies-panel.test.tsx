import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MyCukiesPanel } from '@/components/cukies/my-cukies-panel';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';

jest.mock('@/providers/auth-provider');
jest.mock('@/providers/wallet-coordinator-context', () => ({
  useWalletCoordinator: jest.fn(() => ({
    evm: {
      address: '0x2222222222222222222222222222222222222222',
      chainId: 97,
      isConnected: true,
    },
    requestWallet: jest.fn(async ({ targetChainId }: { targetChainId: 56 | 97 }) => ({
      kind: 'evm',
      address: '0x2222222222222222222222222222222222222222',
      chainId: targetChainId,
    })),
    openWalletSelector: jest.fn(),
  })),
}));
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: () => <button type="button">Conectar wallet</button>,
}));
jest.mock('@/components/legacy-marketplace/cuki-image', () => ({
  CukiImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));
jest.mock('@/components/uki-marketplace/cancel-order', () => ({
  useUkiMarketplaceCancelController: jest.fn(() => ({
    canCancel: true,
    busy: false,
    pending: null,
    notice: null,
    error: null,
    cancelOrder: jest.fn(async () => true),
    recheckPending: jest.fn(async () => false),
    clearFeedback: jest.fn(),
  })),
}));
jest.mock('@/components/uki-marketplace/cancel-sheet', () => ({
  UkiMarketplaceCancelSheet: ({
    order,
    open,
  }: {
    order: { orderId: string } | null;
    open: boolean;
  }) => open && order ? (
    <div role="dialog" data-order-id={order.orderId}>
      Cancelar anuncio de Cukie
    </div>
  ) : null,
}));
jest.mock('lucide-react', () => {
  const Icon = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />;
  return {
    History: Icon,
    ChevronRight: Icon,
    CircleAlert: Icon,
    CircleCheck: Icon,
    CircleDot: Icon,
    CircleX: Icon,
    Cookie: Icon,
    Crown: Icon,
    Eye: Icon,
    Gem: Icon,
    Hexagon: Icon,
    Info: Icon,
    Layers3: Icon,
    Loader2: Icon,
    LogOut: Icon,
    Network: Icon,
    RefreshCw: Icon,
    Sparkles: Icon,
    Store: Icon,
    Tag: Icon,
    Unlock: Icon,
    Zap: Icon,
  };
});

const wallet = '0x2222222222222222222222222222222222222222';
const otherWallet = '0x5555555555555555555555555555555555555555';
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
    chainId: 97,
    collectionAddress: '0x3333333333333333333333333333333333333333',
    marketplaceSurface: 'uki',
    ...overrides,
  };
}

function response(items: ReturnType<typeof item>[], walletNormalized = wallet) {
  const inWallet = items.filter((cukie) => cukie.custody === 'wallet').length;
  const inPool = items.filter((cukie) => cukie.custody === 'cukie_pool').length;
  const inCukieMaster = items.filter((cukie) => cukie.custody === 'cukie_master').length;
  return {
    ok: true,
    json: async () => ({
      status: 'ok',
      data: {
        walletNormalized,
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
    fetchMock.mockReset();
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
    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(screen.getByText('Legendario')).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'Hacer staking Master' })).toHaveAttribute(
      'href',
      '/cukie-master?tokenId=98000006&collection=0x3333333333333333333333333333333333333333&chainId=97#cukie-master-cukie-98000006',
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar colección' }), { target: { value: 'listed' } });
    expect(screen.getByRole('heading', { name: 'Cukie #98000005' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cukie #98000006' })).not.toBeInTheDocument();
  });

  it('conserva un NFT en Todos y En venta mientras el índice confirma la publicación', async () => {
    const available = item({
      saleKind: null,
      marketplaceSurface: 'uki',
      availableActions: ['sell'],
    });
    const listed = {
      ...available,
      state: 'listed',
      saleKind: 'uki',
      availableActions: ['cancel_sale'],
      saleOrderId: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    };
    fetchMock
      .mockResolvedValueOnce(response([available]))
      .mockResolvedValueOnce(response([available]))
      .mockResolvedValueOnce(response([listed]));

    render(<MyCukiesPanel />);
    await screen.findByRole('heading', { name: 'Cukie #98000005' });
    jest.useFakeTimers();
    try {
      act(() => {
        window.dispatchEvent(new CustomEvent('cukies:uki-marketplace:refresh', {
          detail: {
            assetId: available.assetId,
            tokenId: available.tokenId,
            collectionAddress: available.collectionAddress,
            expectedState: 'listed',
          },
        }));
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar colección' }), { target: { value: 'listed' } });
      expect(screen.getByRole('heading', { name: 'Cukie #98000005' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'En venta (1)' })).toBeInTheDocument();
      expect(screen.getAllByRole('status').some((node) => node.textContent?.includes('Actualizando estado'))).toBe(true);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(500);
      });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar venta' })).toBeInTheDocument());
    } finally {
      jest.useRealTimers();
    }
  });

  it('abre la cancelación UKI con el orderId exacto y no inventa una ficha V2', async () => {
    const orderId = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
    fetchMock
      .mockResolvedValueOnce(response([item({
        state: 'listed',
        saleKind: 'uki',
        marketplaceSurface: 'uki',
        network: 'BSC',
        saleOrderId: orderId,
        availableActions: ['cancel_sale'],
      })]))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'ok',
          data: {
            orders: [{
              orderId,
              chainId: 97,
              marketplaceAddress: '0x4444444444444444444444444444444444444444',
              collectionAddress: '0x3333333333333333333333333333333333333333',
              tokenId: '98000005',
              seller: wallet,
              ukiPriceRaw: '1000000000000000000',
              expiresAt: '2030-01-01T00:00:00.000Z',
              nonceRaw: '1',
              feeBps: 250,
              status: 'active',
              attentionReason: null,
              buyer: null,
              paymentToken: null,
              paymentAmountRaw: null,
              feeAmountRaw: null,
              listedAt: '2026-01-01T00:00:00.000Z',
              soldAt: null,
              cancelledAt: null,
              expiredAt: null,
              invalidatedAt: null,
            }],
          },
        }),
      });

    render(<MyCukiesPanel />);

    const cancel = await screen.findByRole('button', { name: 'Cancelar venta' });
    fireEvent.click(cancel);
    expect(await screen.findByRole('dialog')).toHaveAttribute('data-order-id', orderId);
    expect(screen.queryByRole('link', { name: 'Ver marketplace' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/marketplace/v1/orders?scope=seller&walletAddress=${encodeURIComponent(wallet)}&limit=50`,
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('descarta la respuesta de órdenes si la wallet cambia durante la comprobación', async () => {
    const orderId = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const listed = item({
      state: 'listed',
      saleKind: 'uki',
      marketplaceSurface: 'uki',
      network: 'BSC',
      saleOrderId: orderId,
      availableActions: ['cancel_sale'],
    });
    let resolveSeller: ((value: unknown) => void) | undefined;
    const sellerPending = new Promise((resolve) => {
      resolveSeller = resolve;
    });
    fetchMock
      .mockResolvedValueOnce(response([listed]))
      .mockImplementationOnce(() => sellerPending);

    const { rerender } = render(<MyCukiesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar venta' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fetchMock.mockResolvedValueOnce(response([], otherWallet));
    mockUseAuth.mockReturnValue(authValue({ walletAddress: otherWallet } as User));
    rerender(<MyCukiesPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    resolveSeller?.({
      ok: true,
      json: async () => ({ status: 'ok', data: { orders: [] } }),
    });
    await act(async () => {
      await sellerPending;
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
        sellSurfaces: ['legacy', 'uki'],
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
      .filter((link) => link.getAttribute('href')?.startsWith('/marketplace/56') || link.getAttribute('href')?.includes('tokenId=97'));
    expect(sellLinks[0]).toHaveAttribute(
      'href',
      `/marketplace/56?source=legacy&network=BSC&collection=${legacyMarketplaceContracts.bsc.contracts.token}`,
    );
    expect(sellLinks[1]).toHaveAttribute(
      'href',
      '/marketplace?tokenId=97&collection=0x3333333333333333333333333333333333333333&chainId=97#mis-anuncios',
    );
    expect(screen.getByRole('link', { name: /Vender en UKI/i })).toHaveAttribute(
      'href',
      `/marketplace?tokenId=56&collection=${legacyMarketplaceContracts.bsc.contracts.token}&chainId=56#mis-anuncios`,
    );
  });

  it('mantiene solo Legacy cuando V2 no está disponible para la colección compartida', async () => {
    fetchMock.mockResolvedValue(response([item({
      tokenId: '56',
      assetId: `56:${legacyMarketplaceContracts.bsc.contracts.token.toLowerCase()}:56`,
      chainId: 56,
      network: 'BSC',
      collectionAddress: legacyMarketplaceContracts.bsc.contracts.token,
      marketplaceSurface: 'legacy',
      sellSurfaces: ['legacy'],
      availableActions: ['sell'],
    })]));

    render(<MyCukiesPanel />);

    await screen.findByRole('heading', { name: 'Cukie #56' });
    expect(screen.queryByRole('link', { name: /Vender en UKI/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vender' })).toHaveAttribute(
      'href',
      `/marketplace/56?source=legacy&network=BSC&collection=${legacyMarketplaceContracts.bsc.contracts.token}`,
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
    expect(screen.getByRole('link', { name: /Consultar salida del Cukie Pool/i })).toHaveAttribute(
      'href',
      '/cukie-hodler/recuperar?tokenId=98000001&chainId=97&recoveryVault=0x4444444444444444444444444444444444444444&collection=0x3333333333333333333333333333333333333333#pool-recovery',
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

    expect((await screen.findAllByText('Depósito en el Pool')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Este Cukie sigue depositado en el Pool/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Solicitar salida del Cukie Pool' })).toBeInTheDocument();
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
    expect(screen.getByText(/Podrás retirarlo desde/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver salida del Cukie Pool' })).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'Retirar del Cukie Pool' })).toBeInTheDocument();
  });

  it('conserva la tarjeta mientras reconcilia una venta confirmada y desbloquea al converger sin recargar', async () => {
    const available = item({
      assetId: `56:${legacyMarketplaceContracts.bsc.contracts.token.toLowerCase()}:98000005`,
      chainId: 56,
      network: 'BSC',
      collectionAddress: legacyMarketplaceContracts.bsc.contracts.token,
      marketplaceSurface: 'legacy',
      saleKind: null,
      sellSurfaces: ['legacy', 'uki'],
      availableActions: ['sell'],
      generation: 'original',
      rarity: 'legendary',
    });
    const listed = item({
      assetId: available.assetId,
      chainId: 56,
      network: 'BSC',
      collectionAddress: legacyMarketplaceContracts.bsc.contracts.token,
      marketplaceSurface: 'legacy',
      saleKind: 'legacy',
      state: 'listed',
      sellSurfaces: ['legacy', 'uki'],
      availableActions: ['cancel_sale'],
      generation: 'second_generation',
      rarity: 'rare',
    });
    fetchMock
      .mockResolvedValueOnce(response([available]))
      .mockResolvedValueOnce(response([available]))
      .mockResolvedValueOnce(response([listed]));

    render(<MyCukiesPanel />);
    await screen.findByRole('heading', { name: 'Cukie #98000005' });

    jest.useFakeTimers();
    try {
      act(() => {
        window.dispatchEvent(new CustomEvent('cukies:uki-marketplace:refresh', {
          detail: {
            assetId: available.assetId,
            tokenId: available.tokenId,
            collectionAddress: available.collectionAddress,
            expectedState: 'listed',
          },
        }));
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(screen.getByRole('heading', { name: 'Cukie #98000005' })).toBeInTheDocument();
      expect(screen.getByText('Original')).toBeInTheDocument();
      expect(screen.getByText('Legendario')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Vender' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Vender en UKI' })).not.toBeInTheDocument();
      expect(screen.getAllByText('Actualizando estado…')).toHaveLength(2);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(500);
      });
      await waitFor(() => expect(screen.getByRole('link', { name: 'Cancelar venta' })).toBeInTheDocument());
      expect(screen.getByText('Segunda generación')).toBeInTheDocument();
      expect(screen.getByText('Raro')).toBeInTheDocument();
      expect(screen.queryByText('Actualizando estado…')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('libera saleA cuando llega el snapshot de saleA aunque saleB haya iniciado otra reconciliación', async () => {
    const saleA = item({
      tokenId: '98000005',
      assetId: '97:0x3333333333333333333333333333333333333333:98000005',
      network: 'BSC',
      saleKind: null,
      availableActions: ['sell'],
    });
    const saleB = item({
      tokenId: '98000006',
      assetId: '97:0x3333333333333333333333333333333333333333:98000006',
      network: 'BSC',
      saleKind: null,
      availableActions: ['sell'],
    });
    const listedA = { ...saleA, state: 'listed', saleKind: 'uki', availableActions: ['cancel_sale'] };
    const listedB = { ...saleB, state: 'listed', saleKind: 'uki', availableActions: ['cancel_sale'] };
    fetchMock
      .mockResolvedValueOnce(response([saleA, saleB]))
      .mockResolvedValueOnce(response([saleA, saleB]))
      .mockResolvedValueOnce(response([listedA, saleB]))
      .mockResolvedValueOnce(response([listedA, listedB]));

    render(<MyCukiesPanel />);
    await screen.findByRole('heading', { name: 'Cukie #98000005' });
    jest.useFakeTimers();
    try {
      act(() => {
        window.dispatchEvent(new CustomEvent('cukies:uki-marketplace:refresh', {
          detail: { assetId: saleA.assetId, tokenId: saleA.tokenId, collectionAddress: saleA.collectionAddress, expectedState: 'listed' },
        }));
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(screen.getAllByText('Actualizando estado…')).toHaveLength(1);

      act(() => {
        window.dispatchEvent(new CustomEvent('cukies:uki-marketplace:refresh', {
          detail: { assetId: saleB.assetId, tokenId: saleB.tokenId, collectionAddress: saleB.collectionAddress, expectedState: 'listed' },
        }));
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar venta' })).toBeInTheDocument());
      expect(screen.getAllByText('Actualizando estado…')).toHaveLength(1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(500);
      });
      await waitFor(() => expect(screen.getAllByRole('button', { name: 'Cancelar venta' })).toHaveLength(2));
      expect(screen.queryByText('Actualizando estado…')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('no desbloquea por un anuncio ajeno con el mismo tokenId y exige el assetId exacto', async () => {
    const target = item({
      network: 'BSC',
      saleKind: null,
      availableActions: ['sell'],
    });
    const foreign = item({
      assetId: '97:0x9999999999999999999999999999999999999999:98000005',
      network: 'BSC',
      collectionAddress: '0x9999999999999999999999999999999999999999',
      saleKind: 'uki',
      state: 'listed',
      availableActions: ['cancel_sale'],
    });
    const listedTarget = { ...target, state: 'listed', saleKind: 'uki', availableActions: ['cancel_sale'] };
    fetchMock
      .mockResolvedValueOnce(response([target]))
      .mockResolvedValueOnce(response([target, foreign]))
      .mockResolvedValueOnce(response([listedTarget, foreign]));

    render(<MyCukiesPanel />);
    await screen.findByRole('heading', { name: 'Cukie #98000005' });
    jest.useFakeTimers();
    try {
      act(() => {
        window.dispatchEvent(new CustomEvent('cukies:uki-marketplace:refresh', {
          detail: { assetId: target.assetId, tokenId: target.tokenId, collectionAddress: target.collectionAddress, expectedState: 'listed' },
        }));
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(screen.getAllByText('Actualizando estado…')).toHaveLength(1);
      const foreignCancel = screen.getAllByRole('button', { name: 'Cancelar venta' });
      expect(foreignCancel).toHaveLength(1);
      expect(foreignCancel[0]).not.toHaveAttribute('href');

      await act(async () => {
        await jest.advanceTimersByTimeAsync(500);
      });
      await waitFor(() => {
        const cancelLinks = screen.getAllByRole('button', { name: 'Cancelar venta' });
        expect(cancelLinks).toHaveLength(2);
      });
      expect(screen.queryByText('Actualizando estado…')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('limpia colección y bloqueos al cambiar de wallet aunque la API de la nueva wallet falle', async () => {
    const initial = item({ network: 'BSC', saleKind: null, availableActions: ['sell'] });
    fetchMock
      .mockResolvedValueOnce(response([initial]))
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce({ ok: false, json: async () => ({ status: 'error' }) });

    const { rerender } = render(<MyCukiesPanel />);
    await screen.findByRole('heading', { name: 'Cukie #98000005' });
    act(() => {
      window.dispatchEvent(new CustomEvent('cukies:uki-marketplace:refresh', {
        detail: { assetId: initial.assetId, tokenId: initial.tokenId, collectionAddress: initial.collectionAddress, expectedState: 'listed' },
      }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText('Actualizando estado…')).toHaveLength(1);

    mockUseAuth.mockReturnValue(authValue({ walletAddress: otherWallet } as User));
    rerender(<MyCukiesPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(await screen.findByRole('alert')).toHaveTextContent('No podemos cargar tu colección ahora');
    expect(screen.queryByRole('heading', { name: 'Cukie #98000005' })).not.toBeInTheDocument();
    expect(screen.queryByText('Actualizando estado…')).not.toBeInTheDocument();
  });
});
