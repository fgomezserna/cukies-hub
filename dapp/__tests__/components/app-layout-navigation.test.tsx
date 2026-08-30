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

jest.mock('lucide-react', () => ({
  PanelLeft: () => null,
  LayoutDashboard: () => null,
  Gamepad2: () => null,
  Trophy: () => null,
  LockKeyhole: () => null,
  Crown: () => null,
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const mockUseMobileGameShell = useMobileGameShell as jest.MockedFunction<
  typeof useMobileGameShell
>;

describe('AppLayout launch navigation', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/games/treasure-hunt');
    mockUseMobileGameShell.mockReturnValue(false);
  });

  it('shows the five launch destinations and hides community links', () => {
    render(<AppLayout><div>Contenido</div></AppLayout>);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.getByRole('link', { name: 'Jugar' })).toHaveAttribute(
      'href',
      '/games/treasure-hunt',
    );
    expect(screen.getByRole('link', { name: 'Vesting' })).toHaveAttribute('href', '/vesting');
    expect(screen.getByRole('link', { name: 'Premios' })).toHaveAttribute('href', '/premios');
    expect(screen.getByRole('link', { name: 'Cukie Master' })).toHaveAttribute(
      'href',
      '/cukie-master',
    );

    for (const hiddenLabel of [
      'Inicio',
      'Preventa UKI',
      'Juegos',
      'Ranking',
      'Misiones',
      'Puntos',
      'Cukies',
      'Indexer',
      'Twitter',
      'Telegram',
      'Discord',
    ]) {
      expect(screen.queryByText(hiddenLabel)).not.toBeInTheDocument();
    }

    expect(document.querySelector('[data-app-ambient-effects]')).not.toBeInTheDocument();
  });

  it('keeps ambient effects outside Treasure Hunt', () => {
    mockUsePathname.mockReturnValue('/vesting');

    render(<AppLayout><div>Contenido</div></AppLayout>);

    expect(document.querySelector('[data-app-ambient-effects]')).toBeInTheDocument();
  });
});
