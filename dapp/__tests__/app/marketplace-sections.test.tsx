import { render, screen } from '@testing-library/react';

import MarketplacePage from '@/app/(app)/marketplace/page';
import { ukiMarketplacePublicConfig } from '@/lib/uki-marketplace/public-config';

jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return { ArrowRight: Icon, Cookie: Icon, Store: Icon };
});
jest.mock('@/lib/uki-marketplace/public-config', () => ({
  ukiMarketplacePublicConfig: { ready: false },
}));
jest.mock('@/components/uki-marketplace/marketplace-client', () => ({
  UkiMarketplaceClient: () => <div data-testid="uki-marketplace" />,
}));
jest.mock('@/components/uki-marketplace/seller-panel', () => ({
  UkiMarketplaceSellerPanel: () => <div data-testid="uki-marketplace-seller" />,
}));
jest.mock('@/components/legacy-marketplace/marketplace-client', () => ({
  MarketplaceClient: () => <div data-testid="legacy-marketplace" />,
}));
jest.mock('@/components/legacy-marketplace/seller-panel', () => ({
  LegacyMarketplaceSellerPanel: () => <div data-testid="legacy-marketplace-seller" />,
}));

describe('marketplace orientado al cliente', () => {
  const mockMarketplacePublicConfig = ukiMarketplacePublicConfig as { ready: boolean };

  beforeEach(() => {
    mockMarketplacePublicConfig.ready = false;
  });

  it('muestra compra y venta Legacy y mantiene un estado público cuando UKI no está disponible', () => {
    render(<MarketplacePage />);

    expect(screen.getByTestId('legacy-marketplace')).toBeInTheDocument();
    expect(screen.queryByTestId('uki-marketplace')).not.toBeInTheDocument();
    expect(screen.getByTestId('legacy-marketplace-seller')).toBeInTheDocument();
    expect(screen.getByTestId('uki-marketplace-seller')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Comprar Cukies' })).toHaveAttribute('href', '#cukies-disponibles');
    expect(screen.getByRole('link', { name: 'Vender / mis anuncios' })).toHaveAttribute('href', '#mis-anuncios');
    expect(screen.getByText(/La venta directa en UKI todavía no está disponible/i)).toBeInTheDocument();
    expect(screen.queryByText(/controles ficticios/i)).not.toBeInTheDocument();
  });

  it('activa compra y anuncios únicamente mediante configuración de entorno', () => {
    mockMarketplacePublicConfig.ready = true;
    render(<MarketplacePage />);

    expect(screen.getByTestId('uki-marketplace')).toBeInTheDocument();
    expect(screen.getByTestId('uki-marketplace-seller')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vender / mis anuncios' })).toHaveAttribute('href', '#mis-anuncios');
  });
});
