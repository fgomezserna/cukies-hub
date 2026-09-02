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
  Home: () => null,
  Gamepad2: () => null,
  Trophy: () => null,
  LockKeyhole: () => null,
  Crown: () => null,
  UsersRound: () => null,
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const mockUseMobileGameShell = useMobileGameShell as jest.MockedFunction<
  typeof useMobileGameShell
>;

describe('AppLayout launch navigation', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_AMBASSADORS_VISIBLE = 'true';
    mockUsePathname.mockReturnValue('/games/treasure-hunt');
    mockUseMobileGameShell.mockReturnValue(false);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AMBASSADORS_VISIBLE;
  });

  it('shows the launch destinations including Ambassadors and hides community links', () => {
    render(<AppLayout><div>Contenido</div></AppLayout>);

    expect(screen.getByRole('link', { name: 'Preventa UKI' })).toHaveAttribute('href', '/');
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
    expect(screen.getByRole('link', { name: 'Embajadores' })).toHaveAttribute(
      'href',
      '/embajadores',
    );

    for (const hiddenLabel of [
      'Inicio',
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
  });

  it('hides Ambassadors when public listing is disabled', () => {
    process.env.NEXT_PUBLIC_AMBASSADORS_VISIBLE = 'false';

    render(<AppLayout><div>Contenido</div></AppLayout>);

    expect(screen.queryByRole('link', { name: 'Embajadores' })).not.toBeInTheDocument();
  });
});
