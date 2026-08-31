import { render, screen, waitFor } from '@testing-library/react';

import { UkiMarketplaceClient } from '@/components/uki-marketplace/marketplace-client';

const order = {
  orderId: `0x${'1'.repeat(64)}`,
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

describe('Marketplace UKI público', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    global.fetch = fetchMock as never;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('muestra únicamente el mercado UKI disponible', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', data: { orders: [order] } }),
    });

    render(<UkiMarketplaceClient />);

    await waitFor(() => expect(screen.getByText('Cukie #73')).toBeInTheDocument());
    expect(screen.getByText('Validado en vivo')).toBeInTheDocument();
    expect(screen.getByText((_, element) => (
      element?.tagName === 'P' && element.textContent === '1000 UKI'
    ))).toBeInTheDocument();
    expect(screen.getByText('Pago: UKI, BNB o USDT')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/marketplace/v1/orders?scope=public&limit=24',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('no sustituye el mercado UKI por el mercado anterior si el servicio no está disponible', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ status: 'error', code: 'UKI_MARKETPLACE_UNAVAILABLE' }),
    });

    render(<UkiMarketplaceClient />);

    await waitFor(() => {
      expect(
        screen.getByText('El marketplace UKI no está disponible ahora'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Cukie #73')).not.toBeInTheDocument();
  });

  it('explica el estado vacío sin inventar anuncios', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', data: { orders: [] } }),
    });

    render(<UkiMarketplaceClient />);

    await waitFor(() => {
      expect(
        screen.getByText('Todavía no hay Cukies publicados en UKI'),
      ).toBeInTheDocument();
    });
  });

  it('muestra un error controlado ante una respuesta inesperada', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 'error', code: 'UNEXPECTED_ERROR' }),
    });

    render(<UkiMarketplaceClient />);

    await waitFor(() => {
      expect(
        screen.getByText('No se pudo consultar el marketplace UKI'),
      ).toBeInTheDocument();
    });
  });
});
