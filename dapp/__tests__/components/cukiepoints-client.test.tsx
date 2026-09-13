import { render, screen, waitFor } from '@testing-library/react';

jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return {
    ArrowUpRight: Icon,
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
  useAccount: jest.fn(() => ({ address: undefined })),
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

describe('CukiePointsClient', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as never;
  });

  it('hace visible que la actividad publicada es histórica y parcial', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        source: 'mongo',
        status: 'partial',
        coverage: 'legacy-historical',
        items: [],
        total: 0,
        offset: 0,
        limit: 24,
        summary: {
          totalPoints: 0,
          totalTransactions: 0,
          facets: { networks: [], types: [] },
        },
      }),
    });

    render(<CukiePointsClient />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      'Mostramos el historial disponible de Legacy',
    ));
    expect(screen.getByRole('status')).toHaveTextContent('no habilita transferencia ni reclamación');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/cukies/points?'),
      { cache: 'no-store' },
    );
  });
});
