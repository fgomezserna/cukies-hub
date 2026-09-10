import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

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
  UkiMarketplaceSellerPanel: () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const [draft, setDraft] = React.useState('');
    return (
      <div data-testid="uki-marketplace-seller">
        <label>Draft UKI<input aria-label="Draft UKI" value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
      </div>
    );
  },
}));
jest.mock('@/components/legacy-marketplace/marketplace-client', () => ({
  MarketplaceClient: () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const [filter, setFilter] = React.useState('');
    return (
      <div data-testid="legacy-marketplace">
        <label>Catálogo<input aria-label="Catálogo filtro" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
      </div>
    );
  },
}));
jest.mock('@/components/legacy-marketplace/seller-panel', () => ({
  LegacyMarketplaceSellerPanel: () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const [draft, setDraft] = React.useState('');
    return (
      <div data-testid="legacy-marketplace-seller">
        <label>Draft Legacy<input aria-label="Draft Legacy" value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
      </div>
    );
  },
}));

describe('marketplace orientado al cliente', () => {
  const mockMarketplacePublicConfig = ukiMarketplacePublicConfig as { ready: boolean };

  function activateTab(name: string) {
    fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });
  }

  beforeEach(() => {
    mockMarketplacePublicConfig.ready = false;
    window.history.replaceState(window.history.state, '', '/marketplace');
  });

  it('muestra compra y venta Legacy y mantiene un estado público cuando UKI no está disponible', () => {
    render(<MarketplacePage />);

    expect(screen.getByTestId('legacy-marketplace')).toBeInTheDocument();
    expect(screen.queryByTestId('uki-marketplace')).not.toBeInTheDocument();
    expect(screen.getByTestId('legacy-marketplace-seller')).toBeInTheDocument();
    expect(screen.getByTestId('uki-marketplace-seller')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Comprar' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Mis anuncios' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText(/La venta directa en UKI todavía no está disponible/i)).toBeInTheDocument();
    expect(screen.queryByText(/controles ficticios/i)).not.toBeInTheDocument();
  });

  it('activa compra y anuncios únicamente mediante configuración de entorno', () => {
    mockMarketplacePublicConfig.ready = true;
    render(<MarketplacePage />);

    expect(screen.getByTestId('uki-marketplace')).toBeInTheDocument();
    expect(screen.getByTestId('uki-marketplace-seller')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Mis anuncios' })).toHaveAttribute('aria-selected', 'false');
  });

  it('conserva filtros y borradores al cambiar de pestaña y al volver atrás', async () => {
    render(<MarketplacePage />);

    fireEvent.change(screen.getByLabelText('Catálogo filtro'), { target: { value: 'generation-3' } });
    activateTab('Mis anuncios');
    expect(window.location.hash).toBe('#mis-anuncios');
    expect(screen.getByRole('tab', { name: 'Mis anuncios' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Catálogo filtro')).toHaveValue('generation-3');

    fireEvent.change(screen.getByLabelText('Draft Legacy'), { target: { value: '0xlisting-draft' } });
    fireEvent.change(screen.getByLabelText('Draft UKI'), { target: { value: 'uki-price-draft' } });
    activateTab('Comprar');
    expect(window.location.hash).toBe('#cukies-disponibles');
    expect(screen.getByLabelText('Draft Legacy')).toHaveValue('0xlisting-draft');
    expect(screen.getByLabelText('Draft UKI')).toHaveValue('uki-price-draft');
    expect(screen.getByLabelText('Catálogo filtro')).toHaveValue('generation-3');

    window.history.back();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(window.location.hash).toBe('#mis-anuncios'));
    expect(screen.getByRole('tab', { name: 'Mis anuncios' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Draft Legacy')).toHaveValue('0xlisting-draft');
  });

  it('abre la vista de anuncios desde el hash heredado', () => {
    window.history.replaceState(window.history.state, '', '/marketplace#mis-anuncios');
    render(<MarketplacePage />);

    expect(screen.getByRole('tab', { name: 'Mis anuncios' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Mis anuncios' })).not.toHaveAttribute('hidden');
    const buyPanelId = screen.getByRole('tab', { name: 'Comprar' }).getAttribute('aria-controls');
    expect(buyPanelId).toBeTruthy();
    expect(document.getElementById(buyPanelId!)).toHaveAttribute('hidden');
  });
});
