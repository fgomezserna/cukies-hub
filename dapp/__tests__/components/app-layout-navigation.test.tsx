import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithRuntime as render } from '../../test-utils/runtime-test-wrapper';

import AppLayout from '@/components/layout/app-layout';
import { useMobileGameShell } from '@/hooks/use-mobile-game-shell';
import { useAuth } from '@/providers/auth-provider';
import { usePathname } from 'next/navigation';
import { useAccount, useSwitchChain } from 'wagmi';

jest.mock('@/providers/auth-provider');
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useConnect: jest.fn(() => ({ connectAsync: jest.fn(), connectors: [], isPending: false })),
  useDisconnect: jest.fn(() => ({ disconnect: jest.fn() })),
  useSignMessage: jest.fn(() => ({ signMessageAsync: jest.fn() })),
  useSwitchChain: jest.fn(),
}));

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
  default: ({ hideDisconnectedWalletTrigger }: { hideDisconnectedWalletTrigger?: boolean }) => {
    const { SidebarTrigger } = jest.requireActual('@/components/ui/sidebar');
    return (
      <header data-hide-disconnected-wallet-trigger={String(Boolean(hideDisconnectedWalletTrigger))}>
        <SidebarTrigger />
      </header>
    );
  },
}));

jest.mock('lucide-react', () => ({
  AlertTriangle: () => null,
  CheckCircle2: () => null,
  ShieldAlert: () => null,
  Wallet: () => null,
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
  UsersRound: () => null,
  CloudOff: () => null,
  Wifi: () => null,
  Loader2: () => null,
  RefreshCw: () => null,
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const mockUseMobileGameShell = useMobileGameShell as jest.MockedFunction<
  typeof useMobileGameShell
>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUseSwitchChain = useSwitchChain as jest.MockedFunction<typeof useSwitchChain>;

describe('AppLayout launch navigation', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_AMBASSADORS_VISIBLE = 'true';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    mockUsePathname.mockReturnValue('/games/treasure-hunt');
    mockUseMobileGameShell.mockReturnValue(false);
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isWaitingForApproval: false, walletType: null, fetchUser: jest.fn() });
    mockUseAccount.mockReturnValue({ address: undefined, isConnected: false, chainId: undefined } as unknown as ReturnType<typeof useAccount>);
    mockUseSwitchChain.mockReturnValue({ switchChainAsync: jest.fn() } as unknown as ReturnType<typeof useSwitchChain>);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AMBASSADORS_VISIBLE;
  });

  afterAll(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it('muestra una navegación agrupada orientada a tareas', () => {
    render(<AppLayout><div>Contenido</div></AppLayout>);

    expect(screen.getByRole('link', { name: 'Volver a la landing' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Resumen' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Jugar' })).toHaveAttribute(
      'href',
      '/games',
    );
    expect(screen.getByRole('link', { name: 'Cukie Master' })).toHaveAttribute(
      'href',
      '/cukie-master',
    );
    expect(screen.getByRole('link', { name: 'Créditos' })).toHaveAttribute(
      'href',
      '/credits',
    );
    expect(screen.getByRole('link', { name: 'Embajadores' })).toHaveAttribute(
      'href',
      '/embajadores',
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
      '/premios',
    );
    expect(screen.getByRole('link', { name: 'Vesting' })).toHaveAttribute('href', '/vesting');

    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Como jugar' })).toHaveAttribute('href', '/como-jugar');

    for (const groupLabel of ['Acceso principal', 'Recursos', 'Colección', 'Cobros', 'Invitaciones', 'Cuenta y ayuda']) {
      expect(screen.getByText(groupLabel)).toBeInTheDocument();
    }

    expect(document.querySelector('[data-app-ambient-effects]')).not.toBeInTheDocument();
  });

  it('oculta Embajadores cuando la publicación está desactivada', () => {
    process.env.NEXT_PUBLIC_AMBASSADORS_VISIBLE = 'false';

    render(<AppLayout><div>Contenido</div></AppLayout>);

    expect(screen.queryByRole('link', { name: 'Embajadores' })).not.toBeInTheDocument();
  });

  it('mantiene Jugar activo también dentro del ranking', () => {
    mockUsePathname.mockReturnValue('/games/treasure-hunt/rankings/weekly');

    render(<AppLayout><div>Contenido</div></AppLayout>);

    expect(screen.getByRole('link', { name: 'Jugar' })).toHaveAttribute('data-active', 'true');
  });

  it('keeps the app header on mobile rankings but reserves immersive mode for the game', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    mockUseMobileGameShell.mockReturnValue(true);
    mockUsePathname.mockReturnValue('/games/treasure-hunt/rankings');

    const view = render(<AppLayout><div>Ranking</div></AppLayout>);

    expect(screen.getByRole('button', { name: 'Alternar barra lateral' })).toBeInTheDocument();

    mockUsePathname.mockReturnValue('/games/treasure-hunt');
    view.rerender(<AppLayout><div>Juego</div></AppLayout>);

    expect(screen.queryByRole('button', { name: 'Alternar barra lateral' })).not.toBeInTheDocument();
  });

  it('closes the mobile navigation after choosing a destination', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    mockUsePathname.mockReturnValue('/dashboard');

    render(<AppLayout><div>Contenido</div></AppLayout>);

    fireEvent.click(screen.getByRole('button', { name: 'Alternar barra lateral' }));
    expect(await screen.findByRole('dialog', { name: 'Navegación principal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar menú' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Cukie Master' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Navegación principal' })).not.toBeInTheDocument();
    });
  });

  it('devuelve el foco al activador al cerrar el menú móvil', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    mockUsePathname.mockReturnValue('/dashboard');

    render(<AppLayout><div>Contenido</div></AppLayout>);

    const trigger = screen.getByRole('button', { name: 'Alternar barra lateral' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar menú' }));

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('dirige el foco al contenido al cambiar de ruta desde el menú móvil', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    mockUsePathname.mockReturnValue('/dashboard');

    const view = render(<AppLayout><div>Contenido</div></AppLayout>);
    fireEvent.click(screen.getByRole('button', { name: 'Alternar barra lateral' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Cukie Master' }));

    mockUsePathname.mockReturnValue('/cukie-master');
    view.rerender(<AppLayout><div>Destino</div></AppLayout>);

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('app-main'));
    });
  });

  it('dirige el foco al contenido al elegir un ancla de la ruta actual', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    mockUsePathname.mockReturnValue('/cukie-hodler');

    render(<AppLayout><div>Contenido</div></AppLayout>);

    fireEvent.click(screen.getByRole('button', { name: 'Alternar barra lateral' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Pool de Cukies' }));

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('app-main'));
    });
  });

  it('keeps ambient effects outside Treasure Hunt', () => {
    mockUsePathname.mockReturnValue('/vesting');

    render(<AppLayout><div>Contenido</div></AppLayout>);

    expect(document.querySelector('[data-app-ambient-effects]')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveAttribute('data-hide-disconnected-wallet-trigger', 'false');
  });

  it('deja una única conexión visible dentro de Cukie Master', () => {
    mockUsePathname.mockReturnValue('/cukie-master');

    render(<AppLayout><div>Cukie Master</div></AppLayout>);

    expect(screen.getByRole('banner')).toHaveAttribute('data-hide-disconnected-wallet-trigger', 'true');
  });
});
