import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithRuntime as render } from '../../test-utils/runtime-test-wrapper';

import { CompetitionCreditPanel } from '@/components/cukie-master/credit-panel';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';
import { useAccount, useSwitchChain } from 'wagmi';
import { usePathname } from 'next/navigation';

jest.mock('@/providers/auth-provider');
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useSwitchChain: jest.fn(),
}));
jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));
jest.mock('lucide-react', () => ({
  ArrowRight: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Lock: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
}));
jest.mock('@phosphor-icons/react', () => ({
  CheckCircle: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  ArrowCounterClockwise: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  ClockCountdown: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Coin: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Diamond: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  FloppyDisk: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  GameController: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Minus: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Plus: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  SpinnerGap: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Trophy: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Warning: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUseSwitchChain = useSwitchChain as jest.MockedFunction<typeof useSwitchChain>;
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const fetchMock = jest.fn();
const wallet = '0x1111111111111111111111111111111111111111';

function setVisibilityState(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
}

function authValue() {
  return {
    user: { walletAddress: wallet } as User,
    isLoading: false,
    isWaitingForApproval: false,
    walletType: 'evm' as const,
    fetchUser: jest.fn(),
  };
}

function statusResponse() {
  return {
    ok: true,
    json: async () => ({
      status: 'ok',
      data: {
        walletNormalized: wallet,
        rule: { version: 'credits-v1', creditsPerSlot: 100, cutoffHourUtc: 12, cutoffMinuteUtc: 0 },
        period: {
          cutoff: '2026-07-10T12:00:00.000Z',
          nextCutoff: '2026-07-11T12:00:00.000Z',
        },
        balance: {
          availableCredits: 80,
          reservedCredits: 10,
          spentCredits: 10,
          poolDepositedCredits: 20,
          expiredCredits: 45,
          blocked: false,
        },
        pool: { availableCredits: 400, reservedCredits: 10, blocked: false },
        routes: {
          uki: {
            balance: { blocked: false },
            pool: { blocked: false },
            grants: { healthy: true, sourceObservedThrough: '2026-07-10T12:01:00.000Z', openIncidents: 0 },
          },
          nft: {
            balance: { blocked: false },
            pool: { blocked: false },
            grants: { healthy: true, sourceObservedThrough: '2026-07-10T12:01:00.000Z', openIncidents: 0 },
          },
        },
        configurations: [{
          slotId: 'slot-1',
          route: 'uki',
          ordinal: 1,
          status: 'active',
          poolCreditsPerSlot: 20,
          effectiveCutoff: '2026-07-11T12:00:00.000Z',
        }],
        activeReservations: 1,
        grants: { healthy: true, sourceObservedThrough: '2026-07-10T12:01:00.000Z', openIncidents: 0 },
        history: {
          available: true,
          page: 0,
          pageSize: 20,
          hasMore: false,
          totals: {
            receivedCredits: 500,
            spentCredits: 10,
            poolContributedCredits: 100,
            expiredCredits: 0,
          },
          nextExpiry: { credits: 80, at: '2026-07-11T12:00:00.000Z' },
          entries: [{
            eventId: 'grant:own:item-1',
            operation: 'grant',
            bucket: 'own',
            amountCredits: 100,
            route: 'uki',
            slotOrdinal: 1,
            occurredAt: '2026-07-10T12:01:00.000Z',
            expiresAt: '2026-07-11T12:00:00.000Z',
            periodId: 'period-1',
          }, {
            eventId: 'spend:own:reservation-1',
            operation: 'spend',
            bucket: 'own',
            amountCredits: 10,
            route: 'uki',
            slotOrdinal: 1,
            occurredAt: '2026-07-10T14:30:00.000Z',
            expiresAt: '2026-07-11T12:00:00.000Z',
            periodId: 'period-1',
          }],
        },
      },
    }),
  };
}

describe('CompetitionCreditPanel', () => {
  afterEach(() => {
    jest.useRealTimers();
    setVisibilityState('visible');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    mockUseAuth.mockReturnValue(authValue());
    mockUseAccount.mockReturnValue({ address: wallet, isConnected: true, chainId: 97 } as unknown as ReturnType<typeof useAccount>);
    mockUseSwitchChain.mockReturnValue({ switchChainAsync: jest.fn() } as unknown as ReturnType<typeof useSwitchChain>);
    mockUsePathname.mockReturnValue('/credits');
    global.fetch = fetchMock;
    setVisibilityState('visible');
  });

  it('renders persisted balances and saves a multiple-of-ten pool configuration', async () => {
    fetchMock
      .mockResolvedValueOnce(statusResponse())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok' }) })
      .mockResolvedValueOnce(statusResponse());

    render(<CompetitionCreditPanel />);

    await waitFor(() => expect(screen.getByText('Lo que ya tienes hoy')).toBeInTheDocument());
    expect(screen.getAllByText('80').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Historial de créditos' })).toBeInTheDocument();
    expect(screen.getByText('Créditos recibidos')).toBeInTheDocument();
    expect(screen.getByText('Partida jugada')).toBeInTheDocument();
    expect(screen.getByText('Próxima caducidad')).toBeInTheDocument();
    const [currentPoolBalance] = screen.getAllByText('Aportados al pool');
    expect(currentPoolBalance.parentElement).toHaveTextContent('20');
    expect(screen.getAllByText('Caducados')[0].parentElement).toHaveTextContent('45');
    expect(screen.queryByText('credits-v1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {
      name: 'Aumentar aportación al pool de UKI, cupo 1',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar 1 cambio' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [, post] = fetchMock.mock.calls;
    expect(post[0]).toBe('/api/economy/v1/credits');
    expect(post[1]).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(JSON.parse(post[1].body)).toEqual({
      walletAddress: wallet,
      slotId: 'slot-1',
      poolCreditsPerSlot: 30,
    });
    expect(post[1].headers['idempotency-key']).toMatch(/^credit-config:slot-1:/);
    expect(await screen.findByText(/Reparto guardado\. Se aplicará/i)).toBeInTheDocument();
  });

  it('fails closed without balances or controls when the ledger is unavailable', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ status: 'error', code: 'CREDIT_SERVICE_UNAVAILABLE' }),
    });

    render(<CompetitionCreditPanel />);

    expect(await screen.findByText(/no están disponibles ahora/i)).toBeInTheDocument();
    expect(screen.queryByText('Para jugar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar/i })).not.toBeInTheDocument();
  });

  it('permite configurar la ruta UKI aunque la ruta Cukies esté bloqueada', async () => {
    const partialStatus = statusResponse();
    const body = await partialStatus.json();
    body.data.grants.healthy = false;
    body.data.grants.openIncidents = 1;
    body.data.routes.nft.grants.healthy = false;
    body.data.routes.nft.grants.openIncidents = 1;
    body.data.configurations.push({
      slotId: 'slot-nft-1',
      route: 'nft',
      ordinal: 1,
      status: 'active',
      poolCreditsPerSlot: 0,
      effectiveCutoff: '2026-07-11T12:00:00.000Z',
    });

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => body })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok' }) })
      .mockResolvedValueOnce(statusResponse());

    render(<CompetitionCreditPanel />);

    const ukiIncrease = await screen.findByRole('button', {
      name: 'Aumentar aportación al pool de UKI, cupo 1',
    });
    const nftIncrease = screen.getByLabelText('Aumentar aportación al pool de Cukies, cupo 1');
    expect(ukiIncrease).toBeEnabled();
    expect(nftIncrease).toBeDisabled();
    expect(screen.getByText(/vigencia actual de tus cupos de Cukies está pendiente/i)).toBeInTheDocument();

    fireEvent.click(ukiIncrease);
    const saveButton = screen.getByRole('button', { name: 'Guardar 1 cambio' });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      slotId: 'slot-1',
      poolCreditsPerSlot: 30,
    });
  });

  it('mantiene el último estado confirmado como pendiente cuando ninguna fuente está actualizada', async () => {
    const staleStatus = statusResponse();
    const body = await staleStatus.json();
    body.data.grants.healthy = false;
    body.data.routes.uki.grants.healthy = false;
    body.data.routes.nft.grants.healthy = false;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => body });

    render(<CompetitionCreditPanel />);

    expect(await screen.findAllByText('Pendiente')).toHaveLength(2);
    expect(screen.getByText(/vigencia actual de tus cupos UKI y tus cupos de Cukies está pendiente/i)).toBeInTheDocument();
    expect(screen.queryByText('Repartes 100 créditos entre tus cupos activos.')).not.toBeInTheDocument();
  });

  it('refresca al recuperar el foco y cada 30 segundos sin pisar un draft', async () => {
    jest.useFakeTimers();
    const refreshedResponse = statusResponse();
    const refreshed = await refreshedResponse.json();
    refreshed.data.balance.expiredCredits = 99;
    fetchMock
      .mockResolvedValueOnce(statusResponse())
      .mockResolvedValueOnce({ ok: true, json: async () => refreshed })
      .mockResolvedValueOnce({ ok: true, json: async () => refreshed });

    render(<CompetitionCreditPanel />);
    await screen.findByRole('heading', { name: 'Historial de créditos' });
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar aportación al pool de UKI, cupo 1' }));

    await act(async () => { jest.advanceTimersByTime(30_000); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Guardar 1 cambio' })).toBeEnabled();
    await waitFor(() => expect(screen.getAllByText('99')[0]).toBeInTheDocument());

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('conserva la página abierta del historial durante un refresco en foco', async () => {
    jest.useFakeTimers();
    const initialResponse = statusResponse();
    const initial = await initialResponse.json();
    initial.data.history.hasMore = true;
    const olderResponse = statusResponse();
    const older = await olderResponse.json();
    older.data.history.page = 1;
    older.data.history.hasMore = false;
    older.data.history.entries = [{
      ...older.data.history.entries[0],
      eventId: 'grant:own:older',
      amountCredits: 40,
    }];
    const refreshedResponse = statusResponse();
    const refreshed = await refreshedResponse.json();
    refreshed.data.history.hasMore = true;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => initial })
      .mockResolvedValueOnce({ ok: true, json: async () => older })
      .mockResolvedValueOnce({ ok: true, json: async () => refreshed });

    render(<CompetitionCreditPanel />);
    await screen.findByRole('button', { name: 'Cargar movimientos anteriores' });
    fireEvent.click(screen.getByRole('button', { name: 'Cargar movimientos anteriores' }));
    expect(await screen.findByText('+40')).toBeInTheDocument();

    await act(async () => { jest.advanceTimersByTime(30_000); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.getByText('+40')).toBeInTheDocument();
  });

  it('no solapa refrescos de foco mientras la petición anterior sigue abierta', async () => {
    jest.useFakeTimers();
    let resolveRefresh: ((value: unknown) => void) | undefined;
    fetchMock
      .mockResolvedValueOnce(statusResponse())
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRefresh = resolve;
      }));

    render(<CompetitionCreditPanel />);
    await screen.findByRole('heading', { name: 'Historial de créditos' });
    await act(async () => { jest.advanceTimersByTime(30_000); });
    await act(async () => { jest.advanceTimersByTime(30_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveRefresh?.(statusResponse());
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('Tu reparto está guardado.')).toBeInTheDocument());
  });

  it('fuerza una lectura posterior al guardado aunque haya un GET de foco en vuelo', async () => {
    jest.useFakeTimers();
    let resolveRefresh: ((value: unknown) => void) | undefined;
    const savedResponse = statusResponse();
    const saved = await savedResponse.json();
    saved.data.configurations[0].poolCreditsPerSlot = 30;
    fetchMock
      .mockResolvedValueOnce(statusResponse())
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRefresh = resolve;
      }))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => saved });

    render(<CompetitionCreditPanel />);
    await screen.findByRole('button', { name: 'Aumentar aportación al pool de UKI, cupo 1' });
    await act(async () => { jest.advanceTimersByTime(30_000); });
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar aportación al pool de UKI, cupo 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar 1 cambio' }));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    await act(async () => {
      resolveRefresh?.(statusResponse());
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(screen.getByText(/Reparto guardado\. Se aplicará/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Guardar 1 cambio' })).not.toBeInTheDocument();
  });

  it('descarta una respuesta tardía al cambiar de wallet y reinicia operaciones locales', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const newWalletResponse = statusResponse();
    const newWalletBody = await newWalletResponse.json();
    newWalletBody.data.walletNormalized = '0x2222222222222222222222222222222222222222';
    fetchMock
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce({ ok: true, json: async () => newWalletBody });

    const view = render(<CompetitionCreditPanel />);
    mockUseAuth.mockReturnValue({
      ...authValue(),
      user: { walletAddress: '0x2222222222222222222222222222222222222222' } as User,
    });
    mockUseAccount.mockReturnValue({
      address: '0x2222222222222222222222222222222222222222',
      isConnected: true,
      chainId: 97,
    } as unknown as ReturnType<typeof useAccount>);
    view.rerender(<CompetitionCreditPanel />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await screen.findByText('Lo que ya tienes hoy');
    resolveFirst?.(statusResponse());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getAllByText('80').length).toBeGreaterThan(0);
  });

  it('muestra asignación parcial por fuente cuando una ruta es desconocida', async () => {
    const partialResponse = statusResponse();
    const partial = await partialResponse.json();
    const partialRoutes = partial.data.routes as Partial<typeof partial.data.routes>;
    delete partialRoutes.nft;
    partial.data.routes = partialRoutes as typeof partial.data.routes;
    partial.data.configurations.push({
      slotId: 'slot-nft-1',
      route: 'nft',
      ordinal: 1,
      status: 'active',
      poolCreditsPerSlot: 0,
      effectiveCutoff: '2026-07-11T12:00:00.000Z',
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => partial });

    render(<CompetitionCreditPanel />);

    await screen.findByText(/Cukies sin confirmar; mostramos solo la parte confirmada/i);
    expect(screen.queryByText('Repartes 200 créditos entre tus cupos activos.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Aumentar aportación al pool de UKI, cupo 1')).toBeEnabled();
    expect(screen.getByLabelText('Aumentar aportación al pool de Cukies, cupo 1')).toBeDisabled();
  });

  it('no presenta ausencia de cupos mientras ambas fuentes siguen desconocidas', async () => {
    const pendingResponse = statusResponse();
    const original = await pendingResponse.json();
    const pending = {
      ...original,
      data: { ...original.data, routes: {}, configurations: [] },
    };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => pending });

    render(<CompetitionCreditPanel />);

    expect(await screen.findByText(/Todavía no podemos confirmar tus cupos/i)).toBeInTheDocument();
    expect(screen.getByText(/sigue pendiente/i)).toBeInTheDocument();
    expect(screen.queryByText('Todavía no tienes cupos configurables')).not.toBeInTheDocument();
  });

  it('aplica un reparto visual a todos los cupos sin desplegables', async () => {
    fetchMock.mockResolvedValueOnce(statusResponse());

    render(<CompetitionCreditPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /Todo al pool/i }));

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar 1 cambio' })).toBeEnabled();
    expect(screen.getAllByText('100').length).toBeGreaterThan(0);
  });

  it('filters the ledger without exposing technical operation names', async () => {
    fetchMock.mockResolvedValueOnce(statusResponse());

    render(<CompetitionCreditPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Gastados' }));

    expect(screen.getByText('Partida jugada')).toBeInTheDocument();
    expect(screen.queryByText('Créditos recibidos')).not.toBeInTheDocument();
    expect(screen.queryByText('grant')).not.toBeInTheDocument();
    expect(screen.queryByText('spend')).not.toBeInTheDocument();
  });
});
