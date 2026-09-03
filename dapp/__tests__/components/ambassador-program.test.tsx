import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';

import { AmbassadorProgram } from '@/components/ambassadors/ambassador-program';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';

jest.mock('@/providers/auth-provider');
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: () => <button type="button">Conectar wallet</button>,
}));
jest.mock('@/components/landing/primitives', () => ({
  Panel: ({ children, className }: PropsWithChildren<{ className?: string }>) => (
    <section className={className}>{children}</section>
  ),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const fetchMock = jest.fn();
const wallet = '0x1111111111111111111111111111111111111111';
const invitationCode = 'cw-aaaaaaaaaaaa';

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
    status: 'ok',
    policy: { version: 'ambassador-direct-v1', commissionBps: 500, levels: 1 },
    dashboard: {
      walletNormalized: wallet,
      profile: { invitationCode: 'cw-123456789abc' },
      ownAttribution: null,
      referrals: [],
      commissions: {
        totals: {
          totalRaw: '0',
          pendingRaw: '0',
          claimableRaw: '0',
          claimedRaw: '0',
          expiredRaw: '0',
        },
        history: [],
      },
    },
  };
}

describe('AmbassadorProgram', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue(authValue());
    global.fetch = fetchMock;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/invitations/')) {
        return {
          ok: true,
          json: async () => ({
            status: 'ok',
            invitation: {
              invitationCode,
              ambassadorWalletMasked: '0x2222…2222',
            },
          }),
        } as Response;
      }
      if (url.endsWith('/attribution') && init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({ status: 'ok' }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => dashboardResponse(),
      } as Response;
    });
  });

  it('no consulta datos privados si no hay wallet EVM firmada', () => {
    mockUseAuth.mockReturnValue(authValue({ user: null, walletType: null }));

    render(<AmbassadorProgram />);

    expect(screen.getByText('Conecta tu wallet para abrir tu programa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar wallet' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('permite a una cuenta ya autenticada confirmar desde el enlace de invitacion', async () => {
    render(<AmbassadorProgram initialInvitationCode={invitationCode} />);

    expect(await screen.findByText('0x2222…2222')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'Confirmar embajador' });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(confirmButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/economy/v1/ambassadors/attribution',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ invitationCode }),
      }),
    ));
    expect(await screen.findByText(/Embajador confirmado/)).toBeInTheDocument();
  });
});
