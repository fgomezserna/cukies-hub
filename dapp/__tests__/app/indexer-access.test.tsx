import IndexerPage from '@/app/(app)/indexer/page';
import { getIndexerDb } from '@/lib/indexer-db/mongodb';
import { readWalletSession } from '@/lib/wallet-auth';

const mockNotFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

jest.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

jest.mock('lucide-react', () => ({
  AlertTriangle: () => null,
  Database: () => null,
  RefreshCw: () => null,
  Search: () => null,
}));

jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: jest.fn(),
}));

jest.mock('@/lib/indexer-db/mongodb', () => ({
  getIndexerDb: jest.fn(),
  getIndexerDbName: jest.fn(() => 'test-indexer'),
}));

const mockReadWalletSession = readWalletSession as jest.MockedFunction<typeof readWalletSession>;
const mockGetIndexerDb = getIndexerDb as jest.MockedFunction<typeof getIndexerDb>;

describe('/indexer admin access', () => {
  const originalAllowlist = process.env.ADMIN_WALLET_ALLOWLIST;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ADMIN_WALLET_ALLOWLIST;
    mockReadWalletSession.mockResolvedValue(null);
  });

  afterAll(() => {
    if (originalAllowlist === undefined) delete process.env.ADMIN_WALLET_ALLOWLIST;
    else process.env.ADMIN_WALLET_ALLOWLIST = originalAllowlist;
  });

  it('does not open Mongo without a signed allowlisted wallet', async () => {
    await expect(IndexerPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );

    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockGetIndexerDb).not.toHaveBeenCalled();
  });
});
