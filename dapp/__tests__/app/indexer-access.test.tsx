const mockHasAdminPageAccess = jest.fn();
const mockGetIndexerDb = jest.fn();
const mockNotFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('lucide-react', () => ({
  AlertTriangle: () => null,
  Database: () => null,
  RefreshCw: () => null,
  Search: () => null,
}));
jest.mock('@/lib/operational-access', () => ({
  hasAdminPageAccess: (...args: unknown[]) => mockHasAdminPageAccess(...args),
}));
jest.mock('@/lib/indexer-db/mongodb', () => ({
  getIndexerDb: (...args: unknown[]) => mockGetIndexerDb(...args),
  getIndexerDbName: () => 'test-indexer-db',
}));
jest.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

import IndexerPage from '@/app/(app)/indexer/page';

describe('/indexer operational access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hides the page and never opens Mongo when the wallet is not an admin', async () => {
    mockHasAdminPageAccess.mockResolvedValue(false);

    await expect(IndexerPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );

    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockGetIndexerDb).not.toHaveBeenCalled();
  });

  it('checks access before awaiting attacker-controlled search params', async () => {
    mockHasAdminPageAccess.mockResolvedValue(false);
    const searchParams = Promise.resolve({ collection: 'presale_purchases' });
    const paramsThen = jest.spyOn(searchParams, 'then');

    await expect(IndexerPage({ searchParams })).rejects.toThrow('NEXT_NOT_FOUND');

    expect(paramsThen).not.toHaveBeenCalled();
    expect(mockGetIndexerDb).not.toHaveBeenCalled();
  });
});
