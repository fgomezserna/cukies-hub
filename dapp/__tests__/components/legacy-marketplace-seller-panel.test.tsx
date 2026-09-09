import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { LegacyMarketplaceSellerPanel } from '@/components/legacy-marketplace/seller-panel';
import type { LegacyMarketplaceCukiItem } from '@/lib/legacy-marketplace/types';

jest.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x00000000000000000000000000000000000000aa' }),
}));
jest.mock('@/hooks/use-tronlink', () => ({
  useTronLink: () => ({ address: null, connect: jest.fn(), isInstalled: false }),
}));
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: () => <button type="button">Conectar BSC</button>,
}));
jest.mock('@/components/legacy-marketplace/cuki-card', () => ({
  CukiCard: ({ cuki }: { cuki: LegacyMarketplaceCukiItem }) => (
    <div data-testid="seller-cuki">{cuki.tokenId}</div>
  ),
}));
jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return { Loader2: Icon, RefreshCw: Icon, Wallet: Icon };
});

function item(tokenId: string): LegacyMarketplaceCukiItem {
  return {
    id: tokenId,
    tokenId,
    chainId: 56,
    collectionAddress: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
    cukiNumber: Number(tokenId),
    owner: '0x00000000000000000000000000000000000000aa',
    network: 'BSC',
    origin: 'original',
    birthNetwork: 'BSC',
    imageUrl: null,
    type: 1,
    state: 'available',
    price: 0,
    priceOriginal: '0',
    skills: {},
    childrenCount: 0,
    childrenCountTron: 0,
    childrenCountBsc: 0,
    parents: [],
    children: [],
    history: [],
    timestamp: null,
  };
}

function response(items: LegacyMarketplaceCukiItem[], offset: number, total: number) {
  return {
    source: 'mongo',
    items,
    total,
    offset,
    limit: 60,
    facets: { states: [], networks: [], types: [], generations: [] },
  };
}

describe('inventario de venta Legacy', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    global.fetch = fetchMock as never;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('pagina una wallet con más de 60 Cukies sin ocultar los restantes', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => response(
          Array.from({ length: 60 }, (_, index) => item(String(index + 1))),
          0,
          61,
        ),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => response([item('61')], 60, 61),
      });

    render(<LegacyMarketplaceSellerPanel />);

    expect(await screen.findAllByTestId('seller-cuki')).toHaveLength(60);
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más Cukies' }));
    await waitFor(() => expect(screen.getAllByTestId('seller-cuki')).toHaveLength(61));
    expect(String(fetchMock.mock.calls[1][0])).toContain('offset=60');
    expect(screen.queryByRole('button', { name: 'Cargar más Cukies' })).not.toBeInTheDocument();
  });

  it('no convierte una fuente no disponible en una colección vacía', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });

    render(<LegacyMarketplaceSellerPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo consultar tu inventario Legacy',
    );
    expect(screen.queryByText(/No hay Cukies Legacy disponibles/)).not.toBeInTheDocument();
  });
});
