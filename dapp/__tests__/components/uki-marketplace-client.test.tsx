import { act, render, screen, waitFor } from '@testing-library/react';

let mockWalletAddress: string | null = null;

jest.mock('wagmi', () => ({
  useAccount: () => ({ address: mockWalletAddress }),
}));

jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return { X: Icon };
});

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
    mockWalletAddress = null;
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
    expect(screen.getByText('Precio fijado en UKI')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/marketplace/v1/orders?scope=public&limit=24',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('muestra gestión del anuncio en la fila propia en vez de ofrecer compra propia', async () => {
    mockWalletAddress = order.seller;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', data: { orders: [order] } }),
    });

    render(<UkiMarketplaceClient />);

    expect(await screen.findByRole('link', { name: 'Gestionar anuncio' })).toHaveAttribute(
      'href',
      expect.stringContaining(`orderId=${order.orderId}`),
    );
    expect(screen.queryByRole('button', { name: 'Comprar' })).not.toBeInTheDocument();
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

  it('mantiene el catálogo visible mientras una lectura post-receipt tarda y detiene el retry al converger', async () => {
    let resolveRefresh!: (value: unknown) => void;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', data: { orders: [order] } }),
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRefresh = resolve;
      }));

    render(<UkiMarketplaceClient />);
    await waitFor(() => expect(screen.getByText('Cukie #73')).toBeInTheDocument());
    jest.useFakeTimers();
    try {

    act(() => {
      window.dispatchEvent(new CustomEvent('cukies:uki-marketplace:refresh', {
        detail: { hash: `0x${'2'.repeat(64)}`, orderId: order.orderId },
      }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Cukie #73')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cargando anuncios UKI')).not.toBeInTheDocument();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_500);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolveRefresh({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', data: { orders: [] } }),
    });
    await waitFor(() => expect(screen.getByText('Todavía no hay Cukies publicados en UKI')).toBeInTheDocument());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(62_500);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('no detiene el retry por un cambio ajeno al anuncio afectado', async () => {
    const unrelated = {
      ...order,
      orderId: `0x${'2'.repeat(64)}`,
      tokenId: '74',
    };
    const unrelatedChanged = {
      ...unrelated,
      ukiPriceRaw: '2000000000000000000000',
    };
    const targetChanged = {
      ...order,
      status: 'sold' as const,
    };
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', data: { orders: [order, unrelated] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', data: { orders: [order, unrelatedChanged] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', data: { orders: [targetChanged, unrelatedChanged] } }),
      });

    render(<UkiMarketplaceClient />);
    await waitFor(() => expect(screen.getByText('Cukie #73')).toBeInTheDocument());
    jest.useFakeTimers();
    try {
      act(() => {
        window.dispatchEvent(new CustomEvent('cukies:uki-marketplace:refresh', {
          detail: { hash: `0x${'3'.repeat(64)}`, orderId: order.orderId },
        }));
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(500);
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });
});
