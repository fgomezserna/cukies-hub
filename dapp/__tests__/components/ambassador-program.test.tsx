import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { useSignMessage } from 'wagmi';

import { AmbassadorProgram } from '@/components/ambassadors/ambassador-program';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';

jest.mock('wagmi', () => ({ useSignMessage: jest.fn() }));
jest.mock('@/providers/auth-provider');
jest.mock('@/components/landing/wallet-connect-dynamic', () => ({
  LandingWalletConnectButton: () => <button type="button">Conectar wallet</button>,
}));
jest.mock('@/components/landing/primitives', () => ({
  Panel: ({ children, className }: PropsWithChildren<{ className?: string }>) => (
    <section className={className}>{children}</section>
  ),
}));

const mockUseAuth = jest.mocked(useAuth);
const fetchMock = jest.fn();
const writeText = jest.fn();
const signMessageAsync = jest.fn();
const wallet = '0x1111111111111111111111111111111111111111';
const otherWallet = '0x4444444444444444444444444444444444444444';
const invitationCode = 'cw-aaaaaaaaaaaa';
const pendingInvitationKey = 'cukies:ambassador:pending-invitation';

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

type DashboardPayloadOptions = {
  presale?: boolean;
  confirmed?: boolean;
  configuredDefault?: boolean;
  legacyProfile?: boolean;
  walletAddress?: string;
  isCukiesWorld?: boolean;
  attributionSource?: 'presale_locked' | 'presale_default' | 'signed_wallet_session' | 'admin_override';
  isCukieMaster?: boolean | null;
  hasConfirmedSponsor?: boolean;
  canInvite?: boolean;
  eligibilityReason?: string | null;
};

function dashboardPayload(options: DashboardPayloadOptions = {}) {
  const {
    presale = true,
    confirmed = false,
    configuredDefault = true,
    legacyProfile = false,
    walletAddress = wallet,
    isCukiesWorld = false,
    attributionSource = 'signed_wallet_session',
    isCukieMaster = null,
    hasConfirmedSponsor = confirmed || presale,
    canInvite = presale || confirmed,
    eligibilityReason = null,
  } = options;
  return {
    status: 'ok',
    policy: { version: 'ambassador-direct-v1', commissionBps: 500, levels: 1 },
    dashboard: {
      walletNormalized: walletAddress,
      profile: presale || confirmed || legacyProfile ? { invitationCode: 'cw-123456789abc' } : null,
      enrollment: {
        isPresaleParticipant: presale,
        isCukieMaster,
        hasConfirmedSponsor,
        eligibilityReason,
        canChooseSponsor: !presale && !confirmed,
        canInvite,
      },
      defaultAmbassador: configuredDefault ? { ambassadorWalletMasked: '0x5555…5555' } : null,
      ownAttribution: confirmed ? {
        attributionId: 'ambassador-attribution:confirmed-wallet',
        ambassadorWalletMasked: isCukiesWorld ? '0x5555…5555' : '0x2222…2222',
        isCukiesWorld,
        source: attributionSource,
        acceptedAt: '2026-09-07T12:00:00.000Z',
        commissionBps: 500,
        levels: 1,
      } : null,
      referrals: [{
        attributionId: 'ambassador-attribution:presale-wallet',
        referredWalletMasked: '0x3333…3333',
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
  };
}

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function attributionCalls() {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/attribution'));
}

async function confirmSponsor() {
  const button = await screen.findByRole('button', { name: 'Confirmar embajador' });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(button);
}

let payload: ReturnType<typeof dashboardPayload>;

describe('AmbassadorProgram', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    payload = dashboardPayload();
    mockUseAuth.mockReturnValue(authValue());
    jest.mocked(useSignMessage).mockReturnValue({ signMessageAsync } as unknown as ReturnType<typeof useSignMessage>);
    signMessageAsync.mockResolvedValue('0xsigned-message');
    global.fetch = fetchMock;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/invitations/')) {
        return response({
          status: 'ok',
          invitation: {
            invitationCode: url.split('/').at(-1),
            ambassadorWalletMasked: '0x2222…2222',
          },
        });
      }
      if (url.endsWith('/confirmation')) return response({ status: 'ok', message: 'Confirmo mi embajador. Nonce: test-nonce' });
      if (url.endsWith('/attribution') && init?.method === 'POST') {
        const target = JSON.parse(String(init.body));
        payload = dashboardPayload({ presale: false, confirmed: true, isCukiesWorld: target.sponsor === 'cukies_world' });
        return response({ status: 'ok' }, 201);
      }
      return response(payload);
    });
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
    expect(screen.getByText('0x3333…3333')).toBeInTheDocument();
    expect(screen.getByText('Vinculado automáticamente desde la preventa')).toBeInTheDocument();
    expect(screen.getByText(/Recibes el 5% de los premios elegibles/)).toBeInTheDocument();
  });

  it('conserva el enlace de preventa pero impide asignar un patrocinador aunque abra una invitación', async () => {
    render(<AmbassadorProgram initialInvitationCode={invitationCode} />);
    expect(await screen.findByRole('button', { name: 'Copiar enlace' })).toBeInTheDocument();
    expect(screen.getByText('Participaste en la preventa y ya no puedes asignarte un embajador. Conservas tu enlace para invitar.')).toBeInTheDocument();
    expect(await screen.findByText('Wallet que te invita')).toBeInTheDocument();
    expect(screen.queryByText('Será tu embajador directo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar embajador' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(attributionCalls()).toHaveLength(0);
    expect(signMessageAsync).not.toHaveBeenCalled();
  });

  it('comparte un código opaco y no expone la wallet en el enlace', async () => {
    render(<AmbassadorProgram />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copiar enlace' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost/embajadores/cw-123456789abc'));
    expect(writeText.mock.calls[0][0]).not.toContain(wallet);
  });

  it('oculta enlaces nuevos o heredados hasta confirmar y ofrece Cukies World por defecto', async () => {
    payload = dashboardPayload({ presale: false, legacyProfile: true });
    render(<AmbassadorProgram />);
    expect(await screen.findByText('Cukies World')).toBeInTheDocument();
    expect(screen.getByText('0x5555…5555')).toBeInTheDocument();
    expect(screen.getByText('Confirmación de embajador pendiente')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compartir' })).not.toBeInTheDocument();
    expect(screen.queryByText(/localhost\/embajadores/)).not.toBeInTheDocument();
    expect(screen.queryByText('Lo que ya has generado')).not.toBeInTheDocument();
    expect(screen.queryByText('Cómo funciona')).not.toBeInTheDocument();
    expect(attributionCalls()).toHaveLength(0);
  });

  it('firma un reto específico sin gas antes de confirmar la invitación y activar el enlace propio', async () => {
    payload = dashboardPayload({ presale: false });
    render(<AmbassadorProgram initialInvitationCode={invitationCode} />);
    expect(await screen.findByText('0x2222…2222')).toBeInTheDocument();
    expect(screen.queryByText('Cukies World')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
    await confirmSponsor();
    await waitFor(() => expect(signMessageAsync).toHaveBeenCalledWith({ account: wallet, message: 'Confirmo mi embajador. Nonce: test-nonce' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/economy/v1/ambassadors/confirmation', expect.objectContaining({ method: 'POST', body: JSON.stringify({ invitationCode }) }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/economy/v1/ambassadors/attribution', expect.objectContaining({ method: 'POST', body: JSON.stringify({ invitationCode, signature: '0xsigned-message' }) })));
    expect(await screen.findByText(/Embajador confirmado/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Copiar enlace' })).toBeInTheDocument();
    expect(sessionStorage.getItem(pendingInvitationKey)).toBeNull();
  });

  it('confirma explícitamente Cukies World usando el destino configurado del backend', async () => {
    payload = dashboardPayload({ presale: false });
    render(<AmbassadorProgram />);
    await confirmSponsor();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/economy/v1/ambassadors/attribution', expect.objectContaining({ method: 'POST', body: JSON.stringify({ sponsor: 'cukies_world', signature: '0xsigned-message' }) })));
    expect(await screen.findByRole('button', { name: 'Copiar enlace' })).toBeInTheDocument();
    expect(screen.getByText('Cukies World')).toBeInTheDocument();
    expect(screen.getByText('Confirmado con tu wallet')).toBeInTheDocument();
  });

  it('no ofrece confirmar un patrocinador por defecto si no está configurado', async () => {
    payload = dashboardPayload({ presale: false, configuredDefault: false });
    render(<AmbassadorProgram />);
    expect(await screen.findByText('Ahora no podemos ofrecerte un embajador. Puedes seguir navegando y volver a intentarlo más adelante.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar embajador' })).not.toBeInTheDocument();
  });

  it('mantiene el gate aunque la wallet sea Cukie Master sin sponsor confirmado', async () => {
    payload = dashboardPayload({ presale: false, configuredDefault: true, isCukieMaster: true, hasConfirmedSponsor: false });
    render(<AmbassadorProgram />);
    expect(await screen.findByText('Confirmación de embajador pendiente')).toBeInTheDocument();
    expect(screen.queryByText('Lo que ya has generado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
    expect(screen.queryByText('Cómo funciona')).not.toBeInTheDocument();
  });

  it('conserva referidos e historial al perder Cukie Master y ofrece reactivar el mismo enlace', async () => {
    payload = dashboardPayload({ presale: false, confirmed: true, isCukieMaster: false, canInvite: false });
    render(<AmbassadorProgram />);
    expect(await screen.findByText('Tus invitados')).toBeInTheDocument();
    expect(screen.getByText('0x3333…3333')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
    expect(screen.queryByText(/localhost\/embajadores/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Activar Cukie Master/ })).toHaveAttribute('href', '/cukie-master');
    expect(screen.getByText(/Tus referidos, tu código y el historial de comisiones se conservan/)).toBeInTheDocument();
    expect(screen.queryByText('Confirmación de embajador pendiente')).not.toBeInTheDocument();
  });

  it('trata la elegibilidad desconocida como estado recuperable y no como pérdida del rol', async () => {
    payload = dashboardPayload({ presale: false, confirmed: true, isCukieMaster: null, hasConfirmedSponsor: true, canInvite: false, eligibilityReason: 'UNKNOWN' });
    render(<AmbassadorProgram />);
    expect(await screen.findByText('Tus invitados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
    expect(screen.getByText(/No se puede comprobar ahora si cumples el requisito Cukie Master/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    expect(screen.queryByText(/Activa Cukie Master para volver/)).not.toBeInTheDocument();
    expect(screen.queryByText(/5%/)).not.toBeInTheDocument();
    expect(screen.queryByText('Confirmación de embajador pendiente')).not.toBeInTheDocument();
  });

  it('etiqueta un override administrativo sin presentarlo como firma de wallet', async () => {
    payload = dashboardPayload({ presale: false, confirmed: true, attributionSource: 'admin_override' });
    render(<AmbassadorProgram />);
    expect(await screen.findByText('Asignado por administración')).toBeInTheDocument();
    expect(screen.queryByText('Confirmado con tu wallet')).not.toBeInTheDocument();
  });

  it('conserva la invitación al conectar la wallet y al volver después de navegar', async () => {
    payload = dashboardPayload({ presale: false });
    mockUseAuth.mockReturnValue(authValue({ user: null, walletType: null }));
    const firstVisit = render(<AmbassadorProgram initialInvitationCode={invitationCode} />);
    expect(await screen.findByText('0x2222…2222')).toBeInTheDocument();
    expect(sessionStorage.getItem(pendingInvitationKey)).toBe(invitationCode);
    mockUseAuth.mockReturnValue(authValue());
    firstVisit.rerender(<AmbassadorProgram initialInvitationCode={invitationCode} />);
    expect(await screen.findByRole('button', { name: 'Confirmar embajador' })).toBeDisabled();
    expect(attributionCalls()).toHaveLength(0);
    expect(signMessageAsync).not.toHaveBeenCalled();
    firstVisit.unmount();
    render(<AmbassadorProgram />);
    expect(await screen.findByText('0x2222…2222')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Confirmar embajador' })).toBeDisabled();
    expect(screen.queryByText('Cukies World')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(pendingInvitationKey)).toBe(invitationCode);
  });

  it('cancelar la firma no guarda atribución ni elimina la invitación pendiente', async () => {
    payload = dashboardPayload({ presale: false });
    signMessageAsync.mockRejectedValueOnce(new Error('User rejected the request'));
    render(<AmbassadorProgram initialInvitationCode={invitationCode} />);
    await confirmSponsor();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se ha completado la firma');
    expect(attributionCalls()).toHaveLength(0);
    expect(sessionStorage.getItem(pendingInvitationKey)).toBe(invitationCode);
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar embajador' })).toBeEnabled();
  });

  it.each([
    ['AMBASSADOR_CYCLE', 'No puedes registrarte con este embajador porque formarías un ciclo.'],
    ['PRESALE_SPONSOR_LOCKED', 'Participaste en la preventa y ya no puedes asignarte un embajador.'],
    ['AMBASSADOR_ALREADY_CONFIRMED', 'Esta wallet ya tiene un embajador confirmado y no puede cambiarlo.'],
    ['INVALID_SIGNATURE', 'No hemos podido validar la firma. Vuelve a confirmar con tu wallet.'],
    ['AMBASSADOR_CONFIRMATION_REQUIRED', 'Confirma tu embajador con una firma en tu wallet.'],
    ['AMBASSADOR_DEFAULT_WALLET_NOT_CONFIGURED', 'Ahora no podemos confirmar a Cukies World como embajador. Tu selección se conserva; inténtalo más tarde.'],
    ['AMBASSADOR_CONFIRMATION_SECRET_NOT_CONFIGURED', 'La confirmación de embajador no está disponible ahora. Tu selección se conserva; inténtalo más tarde.'],
  ])('distingue el error %s y conserva la invitación', async (code, message) => {
    payload = dashboardPayload({ presale: false });
    const defaultFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) => String(input).endsWith('/attribution') ? Promise.resolve(response({ status: 'error', code }, 409)) : defaultFetch(input, init));
    render(<AmbassadorProgram initialInvitationCode={invitationCode} />);
    await confirmSponsor();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(sessionStorage.getItem(pendingInvitationKey)).toBe(invitationCode);
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
  });

  it('un enlace inválido no se sustituye por Cukies World ni se elimina', async () => {
    payload = dashboardPayload({ presale: false });
    const defaultFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) => String(input).includes('/invitations/') ? Promise.resolve(response({ status: 'error', code: 'NOT_FOUND' }, 404)) : defaultFetch(input, init));
    render(<AmbassadorProgram initialInvitationCode={invitationCode} />);
    expect(await screen.findByText(/Esta invitación no existe/)).toBeInTheDocument();
    expect(screen.queryByText('Cukies World')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar embajador' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem(pendingInvitationKey)).toBe(invitationCode);
  });

  it('descarta una firma resuelta después de cambiar la cuenta', async () => {
    payload = dashboardPayload({ presale: false });
    const signature = deferred<string>();
    signMessageAsync.mockReturnValueOnce(signature.promise);
    const view = render(<AmbassadorProgram initialInvitationCode={invitationCode} />);
    await confirmSponsor();
    await waitFor(() => expect(signMessageAsync).toHaveBeenCalledTimes(1));
    payload = dashboardPayload({ presale: false, walletAddress: otherWallet });
    mockUseAuth.mockReturnValue(authValue({ user: { walletAddress: otherWallet } as User }));
    view.rerender(<AmbassadorProgram initialInvitationCode={invitationCode} />);
    await act(async () => { signature.resolve('0xold-signature'); });
    expect(attributionCalls()).toHaveLength(0);
    expect(sessionStorage.getItem(pendingInvitationKey)).toBe(invitationCode);
    expect(await screen.findByRole('button', { name: 'Confirmar embajador' })).toBeDisabled();
  });

  it('descarta una firma resuelta después de abrir otra invitación', async () => {
    payload = dashboardPayload({ presale: false });
    const signature = deferred<string>();
    signMessageAsync.mockReturnValueOnce(signature.promise);
    const view = render(<AmbassadorProgram initialInvitationCode={invitationCode} />);
    await confirmSponsor();
    await waitFor(() => expect(signMessageAsync).toHaveBeenCalledTimes(1));
    view.rerender(<AmbassadorProgram initialInvitationCode="cw-bbbbbbbbbbbb" />);
    await act(async () => { signature.resolve('0xold-signature'); });
    expect(attributionCalls()).toHaveLength(0);
    expect(sessionStorage.getItem(pendingInvitationKey)).toBe('cw-bbbbbbbbbbbb');
    expect(await screen.findByRole('button', { name: 'Confirmar embajador' })).toBeDisabled();
  });

  it('descarta un resumen de la cuenta anterior que llega después del nuevo', async () => {
    const oldSummary = deferred<Response>();
    fetchMock.mockImplementationOnce(() => oldSummary.promise);
    const view = render(<AmbassadorProgram />);
    payload = dashboardPayload({ presale: false, walletAddress: otherWallet });
    mockUseAuth.mockReturnValue(authValue({ user: { walletAddress: otherWallet } as User }));
    view.rerender(<AmbassadorProgram />);
    expect(await screen.findByText('Confirmación de embajador pendiente')).toBeInTheDocument();
    await act(async () => { oldSummary.resolve(response(dashboardPayload())); });
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
    expect(screen.getByText('Confirmación de embajador pendiente')).toBeInTheDocument();
  });
});
