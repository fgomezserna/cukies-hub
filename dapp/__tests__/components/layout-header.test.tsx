import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Header, { getAvatarFallback } from '@/components/layout/header';
import { SidebarProvider } from '@/components/ui/sidebar';

jest.mock('lucide-react', () => ({
  LogOut: () => null,
  PanelLeft: () => null,
  Settings2: () => null,
  UserRound: () => null,
  Wallet: () => null,
  X: () => null,
}));

jest.mock('next/link', () => {
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: React.forwardRef(({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>, ref: React.Ref<HTMLAnchorElement>) => (
      <a ref={ref} {...props}>{children}</a>
    )),
  };
});

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      walletAddress: '0x26789b9743d187174c3e3a87729730824a4d0c13',
      username: 'Alice',
      profilePictureUrl: null,
      xp: 0,
    },
    isLoading: false,
    isWaitingForApproval: false,
    fetchUser: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-has-mounted', () => ({ useHasMounted: () => true }));
jest.mock('@/hooks/use-tronlink', () => ({
  useTronLink: () => ({
    address: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    error: null,
    isConnected: false,
    isInstalled: false,
    isLoading: false,
  }),
}));
jest.mock('@/components/layout/header-wallet-dialog', () => ({
  HeaderWalletDialog: () => null,
}));

describe('Header account and notifications', () => {
  it('identifica wallets sin nombre con sus dos últimos caracteres o CW', () => {
    expect(getAvatarFallback('0x26789b9743d187174c3e3a87729730824a4d0c13', '0x26789b9743d187174c3e3a87729730824a4d0c13')).toBe('13');
    expect(getAvatarFallback(null, null)).toBe('CW');
  });

  it('no muestra una campana mientras no exista una fuente de notificaciones', () => {
    render(
      <SidebarProvider>
        <Header />
      </SidebarProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Notificaciones' })).not.toBeInTheDocument();
    expect(screen.queryByText(/mensaje sin leer/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver todo' })).not.toBeInTheDocument();
  });

  it('usa iniciales de la cuenta cuando no hay avatar remoto y muestra sus destinos', async () => {
    render(
      <SidebarProvider>
        <Header />
      </SidebarProvider>,
    );

    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Avatar de cuenta' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('AL').closest('button')!);

    expect(screen.getByRole('menuitem', { name: 'Mi cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Ajustes de perfil' })).toBeInTheDocument();
    expect(screen.getByText('Wallet conectada')).toBeInTheDocument();
  });
});
