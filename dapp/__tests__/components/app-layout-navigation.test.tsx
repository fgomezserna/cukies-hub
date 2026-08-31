import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AppLayout from '@/components/layout/app-layout';
import { useMobileGameShell } from '@/hooks/use-mobile-game-shell';
import { usePathname } from 'next/navigation';

jest.mock('next/link', () => {
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: React.forwardRef(
      ({ onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>, ref: React.Ref<HTMLAnchorElement>) => (
        <a
          ref={ref}
          onClick={(event) => {
            event.preventDefault();
            onClick?.(event);
          }}
          {...props}
        />
      ),
    ),
  };
});

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('@/hooks/use-mobile-game-shell', () => ({
  useMobileGameShell: jest.fn(),
}));

jest.mock('@/components/layout/header', () => ({
  __esModule: true,
  default: () => {
    const { SidebarTrigger } = jest.requireActual('@/components/ui/sidebar');
    return <header><SidebarTrigger /></header>;
  },
}));

jest.mock('lucide-react', () => ({
  PanelLeft: () => null,
  X: () => null,
  LayoutDashboard: () => null,
  Gamepad2: () => null,
  Cookie: () => null,
  Layers3: () => null,
  Store: () => null,
  LockKeyhole: () => null,
  Crown: () => null,
  Coins: () => null,
  Gift: () => null,
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const mockUseMobileGameShell = useMobileGameShell as jest.MockedFunction<
  typeof useMobileGameShell
>;

describe('AppLayout launch navigation', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    mockUsePathname.mockReturnValue('/games/treasure-hunt');
    mockUseMobileGameShell.mockReturnValue(false);
  });

  afterAll(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it('muestra una navegación plana orientada a tareas', () => {
    render(<AppLayout><div>Contenido</div></AppLayout>);

    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute(
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
    expect(screen.getByRole('link', { name: 'Créditos' })).toHaveAttribute(
      'href',
      '/cukie-master#competition-credits',
    );
    expect(screen.getByRole('link', { name: 'Pool de Cukies' })).toHaveAttribute(
      'href',
      '/cukie-hodler#mi-cukie-pool',
    );
    expect(screen.getByRole('link', { name: 'Mis Cukies' })).toHaveAttribute('href', '/cukies');
    expect(screen.getByRole('link', { name: 'Marketplace' })).toHaveAttribute(
      'href',
      '/marketplace',
    );
    expect(screen.getByRole('link', { name: 'Premios' })).toHaveAttribute(
      'href',
      '/dashboard#rewards-summary',
    );
    expect(screen.getByRole('link', { name: 'Vesting' })).toHaveAttribute('href', '/vesting');

    for (const hiddenLabel of [
      'Resumen',
      'Recursos',
      'Activos',
      'Recompensas',
      'Externo',
      'Ranking',
      'Preventa UKI',
      'Juegos',
      'Misiones',
      'Puntos',
      'Indexer',
      'Twitter',
      'Telegram',
      'Discord',
    ]) {
      expect(screen.queryByText(hiddenLabel)).not.toBeInTheDocument();
    }

    expect(document.querySelector('[data-app-ambient-effects]')).not.toBeInTheDocument();
  });

  it('mantiene Jugar activo también dentro del ranking', () => {
    mockUsePathname.mockReturnValue('/games/treasure-hunt/rankings/weekly');

    render(<AppLayout><div>Contenido</div></AppLayout>);

    expect(screen.getByRole('link', { name: 'Jugar' })).toHaveAttribute('data-active', 'true');
    expect(screen.queryByRole('link', { name: 'Ranking' })).not.toBeInTheDocument();
  });

  it('keeps the app header on mobile rankings but reserves immersive mode for the game', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    mockUseMobileGameShell.mockReturnValue(true);
    mockUsePathname.mockReturnValue('/games/treasure-hunt/rankings');

    const view = render(<AppLayout><div>Ranking</div></AppLayout>);

    expect(screen.getByRole('button', { name: 'Toggle Sidebar' })).toBeInTheDocument();

    mockUsePathname.mockReturnValue('/games/treasure-hunt');
    view.rerender(<AppLayout><div>Juego</div></AppLayout>);

    expect(screen.queryByRole('button', { name: 'Toggle Sidebar' })).not.toBeInTheDocument();
  });

  it('closes the mobile navigation after choosing a destination', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    mockUsePathname.mockReturnValue('/dashboard');

    render(<AppLayout><div>Contenido</div></AppLayout>);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
    expect(await screen.findByRole('dialog', { name: 'Navegación principal' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Cukie Master' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Navegación principal' })).not.toBeInTheDocument();
    });
  });

  it('keeps ambient effects outside Treasure Hunt', () => {
    mockUsePathname.mockReturnValue('/vesting');

    render(<AppLayout><div>Contenido</div></AppLayout>);

    expect(document.querySelector('[data-app-ambient-effects]')).toBeInTheDocument();
  });
});
