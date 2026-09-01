import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AmbassadorProgram } from '@/components/ambassadors/ambassador-program';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';

jest.mock('@/providers/auth-provider');
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: () => <button type="button">Conectar wallet</button>,
}));
jest.mock('@/components/landing/primitives', () => ({
  Panel: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
    <section className={className}>{children}</section>
  ),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const fetchMock = jest.fn();
const writeText = jest.fn();
const wallet = '0x1111111111111111111111111111111111111111';

function authValue(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  return {
    user: { walletAddress: wallet } as User,
    isLoading: false,
    isWaitingForApproval: false,
    walletType: 'evm' as const,
    fetchUser: jest.fn(),
    ...overrides,
  };
}

function dashboardResponse() {
  return {
    ok: true,
    json: async () => ({
      status: 'ok',
      policy: { version: 'ambassador-direct-v1', commissionBps: 500, levels: 1 },
      dashboard: {
        walletNormalized: wallet,
        profile: { invitationCode: 'cw-123456789abc' },
        ownAttribution: null,
        referrals: [{
          attributionId: 'ambassador-attribution:presale-wallet',
          referredWalletMasked: '0x2222…2222',
          source: 'presale_locked',
          acceptedAt: '2026-08-20T12:00:00.000Z',
        }],
        commissions: {
          totals: {
            totalRaw: '1000000000000000000',
            pendingRaw: '1000000000000000000',
            claimableRaw: '0',
            claimedRaw: '0',
            expiredRaw: '0',
          },
          history: [],
        },
      },
    }),
  };
}

describe('AmbassadorProgram', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue(authValue());
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue(dashboardResponse());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    writeText.mockResolvedValue(undefined);
  });

  it('no consulta datos privados si no hay wallet EVM firmada', () => {
    mockUseAuth.mockReturnValue(authValue({ user: null, walletType: null }));

    render(<AmbassadorProgram />);

    expect(screen.getByText('Conecta tu wallet para abrir tu programa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar wallet' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('muestra automáticamente los referidos confirmados en preventa', async () => {
    const { container } = render(<AmbassadorProgram />);

    expect(await screen.findByText('Tus invitados')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('[background:transparent]');
    expect(screen.getByText('0x2222…2222')).toBeInTheDocument();
    expect(screen.getByText('Vinculado automáticamente desde la preventa')).toBeInTheDocument();
    expect(screen.getByText(/Recibes el 5% de los premios elegibles/)).toBeInTheDocument();
  });

  it('comparte un código opaco y no expone la wallet en el enlace', async () => {
    render(<AmbassadorProgram />);

    fireEvent.click(await screen.findByRole('button', { name: 'Copiar enlace' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      'http://localhost/embajadores/cw-123456789abc',
    ));
    expect(writeText.mock.calls[0][0]).not.toContain(wallet);
  });
});
