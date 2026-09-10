import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MarketplaceClient } from '@/components/legacy-marketplace/marketplace-client';

jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return { ChevronDown: Icon, Filter: Icon, RefreshCw: Icon, Search: Icon, ShieldCheck: Icon };
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
    expect(screen.getByText('Red BSC · Colección 0x000000…001002')).toBeInTheDocument();
    expect(screen.getByText('Precio fijado en UKI')).toBeInTheDocument();
    expect(screen.queryByText(/BSC Testnet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pago: UKI, BNB o USDT/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Comprar' }));
    expect(await screen.findByTestId('uki-checkout')).toHaveTextContent('Checkout UKI disponible');
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
});
