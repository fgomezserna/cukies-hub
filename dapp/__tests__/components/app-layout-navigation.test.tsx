import { render, screen } from '@testing-library/react';

import AppLayout from '@/components/layout/app-layout';
import { useMobileGameShell } from '@/hooks/use-mobile-game-shell';
import { usePathname } from 'next/navigation';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('@/hooks/use-mobile-game-shell', () => ({
  useMobileGameShell: jest.fn(),
}));

jest.mock('@/components/layout/header', () => ({
  __esModule: true,
  default: () => <header>Cabecera</header>,
}));

jest.mock('lucide-react', () => {
  const Icon = () => null;
  return {
    Crown: Icon,
    Gamepad2: Icon,
    Layers3: Icon,
    LayoutDashboard: Icon,
    LockKeyhole: Icon,
    PanelLeft: Icon,
    Trophy: Icon,
  };
});

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const mockUseMobileGameShell = useMobileGameShell as jest.MockedFunction<
  typeof useMobileGameShell
>;

describe('AppLayout launch navigation', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/marketplace');
    mockUseMobileGameShell.mockReturnValue(false);
  });

  it('keeps the core navigation while hiding Cukies and Marketplace from the sidebar', () => {
    render(<AppLayout><div>Contenido</div></AppLayout>);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.getByRole('link', { name: 'Jugar' })).toHaveAttribute(
      'href',
      '/games/treasure-hunt',
    );
    expect(screen.getByRole('link', { name: 'Cukie Master' })).toHaveAttribute(
      'href',
      '/cukie-master',
    );
    expect(screen.getByRole('link', { name: 'Pool de Cukies' })).toHaveAttribute(
      'href',
      '/cukie-hodler#mi-cukie-pool',
    );
    expect(screen.getByRole('link', { name: 'Ranking' })).toHaveAttribute(
      'href',
      '/games/treasure-hunt/rankings',
    );
    expect(screen.getByRole('link', { name: 'Vesting' })).toHaveAttribute(
      'href',
      '/vesting',
    );

    expect(screen.queryByRole('link', { name: 'Cukies' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Marketplace' })).not.toBeInTheDocument();
    expect(screen.queryByText('Activos')).not.toBeInTheDocument();
  });
});
