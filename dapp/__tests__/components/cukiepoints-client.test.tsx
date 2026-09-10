import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return {
    ArrowUpRight: Icon,
    ChevronDown: Icon,
    Coins: Icon,
    Database: Icon,
    Flame: Icon,
    Loader2: Icon,
    Network: Icon,
    RefreshCcw: Icon,
    Sparkles: Icon,
    Wallet: Icon,
  };
});
jest.mock('wagmi', () => ({
  useAccount: jest.fn(() => ({ address: '0x00000000000000000000000000000000000000aa' })),
  useReadContract: jest.fn(() => ({ data: undefined, isLoading: false })),
}));
jest.mock('@/hooks/use-tronlink', () => ({
  useTronLink: jest.fn(() => ({
    address: null,
    connect: jest.fn(),
    isConnected: false,
    isInstalled: false,
  })),
}));

import { CukiePointsClient } from '@/components/legacy-marketplace/cukiepoints-client';

const emptyPayload = {
  source: 'mongo',
  items: [],
  total: 0,
  offset: 0,
  limit: 24,
  summary: {
    totalPoints: 0,
    totalTransactions: 0,
    facets: { networks: [], types: [] },
  },
};

function pointsPayload(id: string, network = 'BSC', type = 'Breeding') {
  return {
    ...emptyPayload,
    items: [{
      id,
      address: '0x00000000000000000000000000000000000000aa',
      points: 12,
      type,
      date: Date.now(),
      txId: null,
      network,
      description: null,
      explorerUrl: null,
    }],
    total: 1,
    summary: {
      ...emptyPayload.summary,
      totalPoints: 12,
      totalTransactions: 1,
      facets: { networks: [{ value: network, count: 1 }], types: [{ value: type, count: 1 }] },
    },
  };
}

describe('CukiePointsClient', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as never;
  });

  it('separa indisponibilidad HTTP de una consulta vacía verificada', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    render(<CukiePointsClient />);

    expect(await screen.findByText(/No se puede verificar la actividad/)).toBeInTheDocument();
    expect(screen.queryByText('No hay actividad de Cukie Points para estos filtros.')).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => emptyPayload });
    const retryButtons = screen.getAllByRole('button', { name: 'Reintentar' });
    fireEvent.click(retryButtons[retryButtons.length - 1]);
    expect(await screen.findByText('No hay actividad de Cukie Points para estos filtros.')).toBeInTheDocument();
  });

  it('ignora la respuesta tardía de una consulta anterior al cambiar la red', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    let resolveSecond: ((value: unknown) => void) | undefined;
    fetchMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    render(<CukiePointsClient />);

    fireEvent.click(screen.getByRole('button', { name: 'BSC' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolveFirst?.({ ok: true, json: async () => pointsPayload('old', 'TRON', 'Old activity') });
    resolveSecond?.({ ok: true, json: async () => pointsPayload('new', 'BSC', 'New activity') });

    await waitFor(() => expect(screen.getAllByText('New activity').length).toBeGreaterThan(0));
    expect(screen.queryByText('Old activity')).not.toBeInTheDocument();
  });

  it('muestra el alcance parcial del historial Legacy sin presentarlo como actividad actual completa', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...pointsPayload('legacy-1', 'BSC', 'Mint'),
        source: 'legacy',
        status: 'partial',
        coverage: 'legacy-historical',
      }),
    });

    render(<CukiePointsClient />);

    expect(await screen.findByText(
      'Mostramos el historial disponible de Legacy. Algunos movimientos pueden faltar mientras completamos la migración.',
    )).toBeInTheDocument();
    expect(screen.getAllByText('Mint').length).toBeGreaterThan(0);
  });
});
