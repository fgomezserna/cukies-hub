import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CompetitionCreditPanel } from '@/components/cukie-master/credit-panel';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types';

jest.mock('@/providers/auth-provider');
jest.mock('lucide-react', () => ({
  AlertTriangle: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  CheckCircle2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Loader2: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Save: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
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

    await waitFor(() => expect(screen.getByText('Disponibles')).toBeInTheDocument());
    expect(screen.getAllByText('80').length).toBeGreaterThan(0);
    const select = screen.getByLabelText('Créditos al pool para slot-1');
    fireEvent.change(select, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/i }));

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
    expect(await screen.findByText(/Configuración registrada/i)).toBeInTheDocument();
  });

  it('fails closed without balances or controls when the ledger is unavailable', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ status: 'error', code: 'CREDIT_SERVICE_UNAVAILABLE' }),
    });

    render(<CompetitionCreditPanel />);

    expect(await screen.findByText(/no está disponible con garantías/i)).toBeInTheDocument();
    expect(screen.queryByText('Disponibles')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar/i })).not.toBeInTheDocument();
  });
});
