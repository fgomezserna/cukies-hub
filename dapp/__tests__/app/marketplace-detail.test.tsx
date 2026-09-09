import { render, screen } from '@testing-library/react';

jest.mock('server-only', () => ({}));
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return {
    Activity: Icon,
    ArrowLeft: Icon,
    BookOpen: Icon,
    CalendarDays: Icon,
    ExternalLink: Icon,
    Network: Icon,
    Shield: Icon,
    Sparkles: Icon,
    Users: Icon,
    Zap: Icon,
  };
});
jest.mock('@/lib/legacy-marketplace/data', () => ({
  getLegacyMarketplaceCuki: jest.fn(),
}));
jest.mock('@/lib/legacy-marketplace/live-marketplace', () => ({
  readLegacyMarketplaceLiveState: jest.fn(),
}));
jest.mock('@/components/legacy-marketplace/marketplace-actions', () => ({
  MarketplaceActions: () => <div data-testid="marketplace-actions" />,
}));
jest.mock('@/components/legacy-marketplace/cuki-image', () => ({
  CukiImage: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

import MarketplaceDetailPage from '@/app/(app)/marketplace/[tokenId]/page';
import { getLegacyMarketplaceCuki } from '@/lib/legacy-marketplace/data';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import { readLegacyMarketplaceLiveState } from '@/lib/legacy-marketplace/live-marketplace';
import type { LegacyMarketplaceCukiItem } from '@/lib/legacy-marketplace/types';

const detail = {
  id: '4000000008733',
  tokenId: '4000000008733',
  chainId: null,
  collectionAddress: legacyMarketplaceContracts.tron.contracts.token,
  cukiNumber: 8733,
  owner: 'TNHx123',
  network: 'TRON',
  origin: 'mint',
  birthNetwork: 'TRON',
  imageUrl: '/cukie.png',
  type: 3,
  state: 'available',
  price: 0,
  priceOriginal: null,
  skills: { miner: 3, generation: 1 },
  childrenCount: 1,
  childrenCountTron: 1,
  childrenCountBsc: 0,
  parents: [],
  children: [],
  history: [],
  timestamp: 1_788_000_000,
} satisfies LegacyMarketplaceCukiItem;

describe('ficha del Marketplace Legacy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getLegacyMarketplaceCuki as jest.Mock).mockResolvedValue(detail);
    (readLegacyMarketplaceLiveState as jest.Mock).mockResolvedValue({
      network: 'TRON',
      owner: detail.owner,
      isOnSale: false,
      paused: false,
      price: 0,
      priceOriginal: '0',
    });
  });

  it('recupera la ficha rica desde la fuente Legacy para la URL histórica', async () => {
    render(await MarketplaceDetailPage({
      params: Promise.resolve({ tokenId: detail.tokenId }),
      searchParams: Promise.resolve({}),
    }));

    expect(screen.getByRole('heading', { name: 'Cukie #8733' })).toBeInTheDocument();
    expect(screen.getByText(/Legacy · TRON/)).toBeInTheDocument();
    expect(screen.getByText(legacyMarketplaceContracts.tron.contracts.token, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Habilidades' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Familia' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Historial' })).toBeInTheDocument();
    expect(screen.getByTestId('marketplace-actions')).toBeInTheDocument();
  });

  it('rechaza una identidad de red o colección que no corresponde al token', async () => {
    await expect(MarketplaceDetailPage({
      params: Promise.resolve({ tokenId: detail.tokenId }),
      searchParams: Promise.resolve({ source: 'legacy', network: 'BSC' }),
    })).rejects.toThrow('NOT_FOUND');
  });
});
