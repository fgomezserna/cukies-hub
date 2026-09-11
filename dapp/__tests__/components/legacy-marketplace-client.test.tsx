import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockWalletAddress: string | null = null;

jest.mock('wagmi', () => ({
  useAccount: () => ({ address: mockWalletAddress }),
}));

import { MarketplaceClient } from '@/components/legacy-marketplace/marketplace-client';

jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return { ChevronDown: Icon, Filter: Icon, RefreshCw: Icon, Search: Icon, ShieldCheck: Icon, X: Icon };
});
jest.mock('@/components/uki-marketplace/buyer-checkout', () => ({
  UkiMarketplaceBuyerCheckout: () => <div data-testid="uki-checkout">Checkout UKI disponible</div>,
}));

const emptyResponse = {
  source: 'mongo',
  items: [],
  total: 0,
  offset: 0,
  limit: 24,
  facets: { states: [], networks: [], types: [], generations: [] },
};

const baseUkiOrder = {
  orderId: `0x${'7'.repeat(64)}`,
  chainId: 97 as const,
  marketplaceAddress: '0x0000000000000000000000000000000000001001',
  collectionAddress: '0x0000000000000000000000000000000000001002',
  tokenId: '73',
  seller: '0x00000000000000000000000000000000000000aa',
  ukiPriceRaw: '1000000000000000000000',
  expiresAt: '2026-09-15T14:00:00.000Z',
  nonceRaw: '1',
  feeBps: 1_000,
  status: 'active' as const,
  attentionReason: null,
  buyer: null,
  paymentToken: null,
  paymentAmountRaw: null,
  feeAmountRaw: null,
  listedAt: '2026-08-30T10:00:00.000Z',
  soldAt: null,
  cancelledAt: null,
  expiredAt: null,
  invalidatedAt: null,
};

describe('marketplace publico', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue({
      json: async () => emptyResponse,
    });
    global.fetch = fetchMock as never;
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockWalletAddress = null;
  });

  it('consulta el catálogo conjunto y no expone filtros de estado legacy', async () => {
    render(<MarketplaceClient />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const requestUrl = String(fetchMock.mock.calls[0][0]);
    const query = new URL(requestUrl, 'https://stage.local').searchParams;

    expect(query.get('scope')).toBe('all');
    expect(query.get('legacyOffset')).toBe('0');
    expect(query.has('state')).toBe(false);
    expect(screen.queryByRole('option', { name: 'All states' })).not.toBeInTheDocument();
  });

  it('mantiene accesible la acción de compra UKI dentro de la tarjeta conjunta', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        status: 'ok',
        data: {
          items: [{
            source: 'uki',
            item: {
              orderId: `0x${'1'.repeat(64)}`,
              chainId: 97,
              collectionAddress: '0x0000000000000000000000000000000000001002',
              tokenId: '7',
              seller: '0x00000000000000000000000000000000000000aa',
              ukiPriceRaw: '1000000000000000000',
              expiresAt: '2027-01-01T00:00:00.000Z',
              nonceRaw: '1',
              feeBps: 100,
              status: 'active',
              attentionReason: null,
              buyer: null,
              paymentToken: null,
              paymentAmountRaw: null,
              feeAmountRaw: null,
              listedAt: '2026-09-08T00:00:00.000Z',
              soldAt: null,
              cancelledAt: null,
              expiredAt: null,
              invalidatedAt: null,
            },
          }],
          cursors: { legacyOffset: 0, ukiCursor: null },
          hasMore: false,
          legacyFacets: { states: [], networks: [], types: [], generations: [] },
          sources: { legacy: 'ready', uki: 'ready' },
        },
      }),
    });

    render(<MarketplaceClient />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Comprar' })).toBeInTheDocument());
    expect(screen.getByText('V2 · UKI')).toBeInTheDocument();
    expect(screen.getByText('Red BSC Testnet · anuncio UKI')).toBeInTheDocument();
    expect(screen.getByText('Precio fijado en UKI')).toBeInTheDocument();
    expect(screen.queryByText(/Pago: UKI, BNB o USDT/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Comprar' }));
    expect(await screen.findByTestId('uki-checkout')).toHaveTextContent('Checkout UKI disponible');
  });

  it('muestra gestión del anuncio en la tarjeta propia en vez de ofrecer compra propia', async () => {
    mockWalletAddress = baseUkiOrder.seller;
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        status: 'ok',
        data: {
          items: [{ source: 'uki', item: baseUkiOrder }],
          cursors: { legacyOffset: 0, ukiCursor: null },
          hasMore: false,
          legacyFacets: { states: [], networks: [], types: [], generations: [] },
          sources: { legacy: 'ready', uki: 'ready' },
        },
      }),
    });

    render(<MarketplaceClient />);
    expect(await screen.findByRole('link', { name: 'Gestionar anuncio' })).toHaveAttribute(
      'href',
      expect.stringContaining(`orderId=${baseUkiOrder.orderId}`),
    );
    expect(screen.queryByRole('button', { name: 'Comprar' })).not.toBeInTheDocument();
  });

  it('cambia a Solo Legacy antes de aplicar tipo y generación sin metadatos V2', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        status: 'ok',
        data: {
          items: [],
          cursors: { legacyOffset: 0, ukiCursor: null },
          hasMore: false,
          legacyFacets: {
            states: [],
            networks: [],
            types: [{ value: '3', count: 1 }],
            generations: [{ value: '2', count: 1 }],
          },
          sources: { legacy: 'ready', uki: 'ready' },
        },
      }),
    });

    render(<MarketplaceClient />);
    await screen.findByRole('option', { name: 'Tipo 3' });
    expect(screen.getByText(/al elegir uno se mostrará solo ese catálogo/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Tipo de Cukie' }), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Generación' }), {
      target: { value: '2' },
    });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2));
    const requestUrl = String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]);
    const query = new URL(requestUrl, 'https://stage.local').searchParams;
    expect(query.get('scope')).toBe('legacy');
    expect(query.get('type')).toBe('3');
    expect(query.get('generation')).toBe('2');
    expect(screen.getByRole('combobox', { name: 'Origen del anuncio' })).toHaveValue('legacy');
  });

  it('evita combinar la red TRON con el catálogo V2 · UKI', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        status: 'ok',
        data: {
          items: [],
          cursors: { legacyOffset: 0, ukiCursor: null },
          hasMore: false,
          legacyFacets: { states: [], networks: [], types: [], generations: [] },
          sources: { legacy: 'ready', uki: 'ready' },
        },
      }),
    });

    render(<MarketplaceClient />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('combobox', { name: 'Red' }), {
      target: { value: 'TRON' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Origen del anuncio' }), {
      target: { value: 'uki' },
    });

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Red' })).toHaveValue('all'));
    expect(screen.queryByRole('option', { name: 'TRON' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Tipo de Cukie' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Generación' })).not.toBeInTheDocument();
  });

  it('distingue catálogo no disponible de catálogo vacío', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        status: 'ok',
        data: {
          items: [],
          cursors: { legacyOffset: 0, ukiCursor: null },
          hasMore: false,
          legacyFacets: { states: [], networks: [], types: [], generations: [] },
          sources: { legacy: 'unavailable', uki: 'unavailable' },
        },
      }),
    });

    render(<MarketplaceClient />);
    expect(await screen.findByText(/Los catálogos Legacy y UKI no están disponibles/)).toBeInTheDocument();
    expect(screen.queryByText('No hay Cukies que coincidan con estos filtros.')).not.toBeInTheDocument();
  });

  it('muestra un error de catálogo seguro sin publicar códigos ni mensajes crudos', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        status: 'error',
        code: 'MARKETPLACE_CATALOG_UNAVAILABLE',
        message: 'Failed to fetch internal catalog details',
      }),
    });

    render(<MarketplaceClient />);

    expect(
      await screen.findByText('No se pudo consultar el catálogo. Inténtalo de nuevo.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('MARKETPLACE_CATALOG_UNAVAILABLE')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed to fetch internal catalog details')).not.toBeInTheDocument();
  });

  it('mantiene filtros y catálogo visible mientras la reconciliación tarda y corta el retry al cambiar los datos', async () => {
    const order = {
      orderId: `0x${'7'.repeat(64)}`,
      chainId: 97,
      marketplaceAddress: '0x0000000000000000000000000000000000001001',
      collectionAddress: '0x0000000000000000000000000000000000001002',
      tokenId: '73',
      seller: '0x00000000000000000000000000000000000000aa',
      ukiPriceRaw: '1000000000000000000000',
      expiresAt: '2026-09-15T14:00:00.000Z',
      nonceRaw: '1',
      feeBps: 1_000,
      status: 'active',
      attentionReason: null,
      buyer: null,
      paymentToken: null,
      paymentAmountRaw: null,
      feeAmountRaw: null,
      listedAt: '2026-08-30T10:00:00.000Z',
      soldAt: null,
      cancelledAt: null,
      expiredAt: null,
      invalidatedAt: null,
    };
    let resolveRefresh!: (value: unknown) => void;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          data: {
            items: [{ source: 'uki', item: order }],
            cursors: { legacyOffset: 0, ukiCursor: null },
            hasMore: false,
            legacyFacets: { states: [], networks: [], types: [], generations: [] },
            sources: { legacy: 'ready', uki: 'ready' },
          },
        }),
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRefresh = resolve;
      }));

    render(<MarketplaceClient />);
    await waitFor(() => expect(screen.getByText('Cukie #73')).toBeInTheDocument());
    jest.useFakeTimers();
    try {
    act(() => {
      window.dispatchEvent(new CustomEvent('cukies:uki-marketplace:refresh', {
        detail: { hash: `0x${'8'.repeat(64)}`, orderId: order.orderId },
      }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Cukie #73')).toBeInTheDocument();
    expect(screen.queryByText('Cargando Cukies…')).not.toBeInTheDocument();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_500);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolveRefresh({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        data: {
          items: [],
          cursors: { legacyOffset: 0, ukiCursor: null },
          hasMore: false,
          legacyFacets: { states: [], networks: [], types: [], generations: [] },
          sources: { legacy: 'ready', uki: 'ready' },
        },
      }),
    });
    await waitFor(() => expect(screen.getByText('No hay Cukies que coincidan con estos filtros.')).toBeInTheDocument());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(62_500);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('no detiene la reconciliación por un anuncio ajeno al orderId confirmado', async () => {
    const order = baseUkiOrder;
    const otherOrder = {
      ...order,
      orderId: `0x${'9'.repeat(64)}`,
      tokenId: '74',
    };
    const unrelatedChanged = {
      ...otherOrder,
      ukiPriceRaw: '2000000000000000000000',
    };
    const targetChanged = {
      ...order,
      status: 'sold' as 'active',
    };
    const payload = (items: (typeof order)[]) => ({
      status: 'ok',
      data: {
        items: items.map((item) => ({ source: 'uki' as const, item })),
        cursors: { legacyOffset: 0, ukiCursor: null },
        hasMore: false,
        legacyFacets: { states: [], networks: [], types: [], generations: [] },
        sources: { legacy: 'ready' as const, uki: 'ready' as const },
      },
    });
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload([order, otherOrder]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload([order, unrelatedChanged]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload([targetChanged, unrelatedChanged]) });

    render(<MarketplaceClient />);
    await waitFor(() => expect(screen.getAllByText('Cukie #73')).toHaveLength(1));
    jest.useFakeTimers();
    try {
      act(() => {
        window.dispatchEvent(new CustomEvent('cukies:uki-marketplace:refresh', {
          detail: { hash: `0x${'4'.repeat(64)}`, orderId: order.orderId },
        }));
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(500);
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    } finally {
      jest.useRealTimers();
    }
  });
});
