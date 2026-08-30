import { render, screen, waitFor } from '@testing-library/react';

import { MarketplaceClient } from '@/components/legacy-marketplace/marketplace-client';

jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return { Filter: Icon, RefreshCw: Icon, Search: Icon };
});

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

  it('solicita siempre el scope marketplace y no permite mostrar todos los estados', async () => {
    render(<MarketplaceClient />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const requestUrl = String(fetchMock.mock.calls[0][0]);
    const query = new URL(requestUrl, 'https://stage.local').searchParams;

    expect(query.get('scope')).toBe('marketplace');
    expect(query.has('state')).toBe(false);
    expect(screen.queryByRole('option', { name: 'All states' })).not.toBeInTheDocument();
  });
});
