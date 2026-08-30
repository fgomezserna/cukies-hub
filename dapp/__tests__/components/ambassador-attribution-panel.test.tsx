import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AmbassadorAttributionPanel } from '@/components/wallet/ambassador-attribution-panel';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';

jest.mock('@/providers/auth-provider');
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: () => <button type="button">Conectar wallet</button>,
}));
jest.mock('lucide-react', () => ({
  AlertTriangle: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  CheckCircle2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Copy: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Link2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Loader2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  ShieldCheck: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  UserPlus: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const fetchMock = jest.fn();
const writeText = jest.fn();
const wallet = '0x1111111111111111111111111111111111111111';
const ambassador = '0x2222222222222222222222222222222222222222';

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

function response(attribution: null | Record<string, unknown>, ok = true) {
  return {
    ok,
    json: async () => ({
      status: ok ? 'ok' : 'error',
      policy: { version: 'ambassador-direct-staging-v1', commissionBps: 500, levels: 1 },
      attribution,
      ...(!ok ? { code: 'INTERNAL_ERROR' } : {}),
    }),
  };
}

function attribution(source: 'presale_locked' | 'signed_wallet_session' = 'signed_wallet_session') {
  return {
    attributionId: `ambassador-attribution:${wallet}`,
    referredWalletNormalized: wallet,
    ambassadorWalletNormalized: ambassador,
    source,
    policyVersion: 'ambassador-direct-staging-v1',
    commissionBps: 500,
    levels: 1,
    acceptedAt: '2026-08-30T12:00:00.000Z',
  };
}

describe('AmbassadorAttributionPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/wallet');
    mockUseAuth.mockReturnValue(authValue());
    global.fetch = fetchMock;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    writeText.mockResolvedValue(undefined);
  });

  it('no consulta datos privados y solicita una firma EVM sin sesión', () => {
    mockUseAuth.mockReturnValue(authValue({ user: null, walletType: null }));

    render(<AmbassadorAttributionPanel />);

    expect(screen.getByText('Firma una wallet EVM')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar wallet' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('precarga el enlace, fija el embajador y muestra la política inmutable', async () => {
    window.history.replaceState({}, '', `/wallet?ambassador=${ambassador}`);
    fetchMock
      .mockResolvedValueOnce(response(null))
      .mockResolvedValueOnce(response(attribution()));

    render(<AmbassadorAttributionPanel />);

    const input = await screen.findByLabelText('Wallet de tu embajador');
    expect(input).toHaveValue(ambassador);
    fireEvent.click(screen.getByRole('button', { name: 'Fijar embajador' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]).toEqual([
      '/api/economy/v1/ambassadors/attribution',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ ambassadorWalletAddress: ambassador }),
      }),
    ]);
    expect(await screen.findByText('Atribución inmutable activa')).toBeInTheDocument();
    expect(screen.getByText('5% · 1 nivel')).toBeInTheDocument();
  });

  it('conserva y explica el sponsor bloqueado durante la preventa', async () => {
    fetchMock.mockResolvedValue(response(attribution('presale_locked')));

    render(<AmbassadorAttributionPanel />);

    expect(await screen.findByText(/Sponsor conservado desde la preventa/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Wallet de tu embajador')).not.toBeInTheDocument();
    expect(screen.getByText('Atribución inmutable activa')).toBeInTheDocument();
  });

  it('rechaza la autoatribución antes de llamar a la API', async () => {
    fetchMock.mockResolvedValue(response(null));

    render(<AmbassadorAttributionPanel />);

    const input = await screen.findByLabelText('Wallet de tu embajador');
    fireEvent.change(input, { target: { value: wallet } });
    fireEvent.click(screen.getByRole('button', { name: 'Fijar embajador' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no puede asignarse a sí misma/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('copia un enlace que solo precarga la wallet y requiere aceptación del invitado', async () => {
    fetchMock.mockResolvedValue(response(null));

    render(<AmbassadorAttributionPanel />);

    await screen.findByLabelText('Wallet de tu embajador');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      `http://localhost/wallet?ambassador=${wallet}`,
    ));
    expect(screen.getByRole('button', { name: 'Enlace copiado' })).toBeInTheDocument();
  });
});
