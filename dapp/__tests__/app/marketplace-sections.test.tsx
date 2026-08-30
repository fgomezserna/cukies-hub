import { render, screen } from '@testing-library/react';

import MarketplacePage from '@/app/(app)/marketplace/page';

jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return {
    ArrowUpRight: Icon,
    Heart: Icon,
    Search: Icon,
    ShoppingCart: Icon,
    Wallet: Icon,
  };
});
jest.mock('@/components/uki-marketplace/marketplace-client', () => ({
  UkiMarketplaceClient: () => <div data-testid="uki-marketplace" />,
}));
jest.mock('@/components/uki-marketplace/seller-panel', () => ({
  UkiMarketplaceSellerPanel: () => <div data-testid="uki-marketplace-seller" />,
}));
jest.mock('@/components/legacy-marketplace/marketplace-client', () => ({
  MarketplaceClient: () => <div data-testid="legacy-marketplace" />,
}));

describe('separación del marketplace', () => {
  it('presenta UKI como mercado principal y Legacy como sección independiente', () => {
    render(<MarketplacePage />);

    expect(screen.getByTestId('uki-marketplace')).toBeInTheDocument();
    expect(screen.getByTestId('uki-marketplace-seller')).toBeInTheDocument();
    expect(screen.getByTestId('legacy-marketplace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Marketplace UKI' })).toHaveAttribute(
      'href',
      '#marketplace-uki',
    );
    expect(screen.getByRole('link', { name: 'Marketplace Legacy' })).toHaveAttribute(
      'href',
      '#marketplace-legacy',
    );
    expect(screen.getByText('Marketplace Legacy · BNB y TRX')).toBeInTheDocument();
  });
});
