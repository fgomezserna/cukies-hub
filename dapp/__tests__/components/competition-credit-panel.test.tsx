import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CompetitionCreditPanel } from '@/components/cukie-master/credit-panel';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';

jest.mock('@/providers/auth-provider');
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
const fetchMock = jest.fn();
const wallet = '0x1111111111111111111111111111111111111111';

function authValue() {
  return {
    user: { walletAddress: wallet } as User,
    isLoading: false,
    isWaitingForApproval: false,
    walletType: null,
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue(authValue());
    global.fetch = fetchMock;
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
    expect(screen.getByText(/asignación de tus cupos de Cukies está temporalmente pausada/i)).toBeInTheDocument();

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
