import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';

import TreasureHuntExperienceShell from '@/components/games/treasure-hunt-experience-shell';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('@/components/layout/header', () => ({
  __esModule: true,
  default: () => <div data-testid="treasure-wallet-controls" />,
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

describe('TreasureHuntExperienceShell', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/games/treasure-hunt/competitions');
  });

  it('mantiene el hero y las pestañas fuera de un único viewport vertical desplazable', () => {
    render(
      <TreasureHuntExperienceShell>
        <div style={{ height: 1600 }}>Contenido largo</div>
      </TreasureHuntExperienceShell>,
    );

    const shell = document.querySelector('[data-treasure-hunt-shell]');
    const viewport = document.querySelector('[data-treasure-hunt-content]');

    expect(shell).toHaveClass('h-full', 'min-h-0', 'overflow-hidden');
    expect(viewport).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(screen.getByRole('link', { name: 'Competiciones' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('Contenido largo')).toBeInTheDocument();
    expect(screen.getByTestId('treasure-wallet-controls')).toBeInTheDocument();
  });
});
