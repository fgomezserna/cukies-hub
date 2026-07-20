import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAccount } from 'wagmi';

import TreasureHuntCompetitionPanel from '@/components/games/treasure-hunt-competition-panel';

const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
const mockFetchUser = jest.fn();
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ fetchUser: mockFetchUser }),
}));

const campaign = {
  campaignId: 'uki-presale-2026',
  startsAt: '2026-08-01T12:00:00.000Z',
  endsAt: '2026-08-31T20:00:00.000Z',
  poolBps: 2_500,
  playerRewardBps: 1_000,
  sponsorRewardBps: 2_500,
  maxWinningAttemptsPerWallet: 5,
  cliffMonths: 9,
  vestingMonths: 6,
};

const participant = {
  alias: 'Hunter-A1B2C3',
  canonicalAlias: 'hunter-a1b2c3',
  aliasChangedAt: null,
  createdAt: '2026-08-01T12:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockConfiguredCompetition() {
  fetchMock.mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/leaderboard')) {
      return jsonResponse({
        success: true,
        campaignId: campaign.campaignId,
        entries: [
          {
            rank: 1,
            walletRank: 1,
            attemptId: 'attempt-1',
            alias: 'CipherFox',
            score: 12_345,
            gameTimeMs: 45_600,
            finishedAt: '2026-08-05T12:30:00.000Z',
            reviewStatus: 'pending',
            isMe: false,
          },
        ],
      });
    }
    return jsonResponse({
      success: true,
      configured: true,
      enabled: true,
      phase: 'active',
      campaign,
      participant,
    });
  });
}

describe('TreasureHuntCompetitionPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mockFetchUser.mockReset();
    mockFetchUser.mockResolvedValue(undefined);
    mockUseAccount.mockReturnValue({
      address: '0x1111111111111111111111111111111111111111',
      connector: { id: 'injected' },
      isConnected: true,
    } as never);
  });

  it('shows the campaign rules, signed participant and public alias leaderboard', async () => {
    mockConfiguredCompetition();

    render(<TreasureHuntCompetitionPanel />);

    expect(await screen.findByText('En curso')).toBeInTheDocument();
    expect(screen.getByText('Pool de recompensas')).toBeInTheDocument();
    expect(screen.getByText('Premio por partida')).toBeInTheDocument();
    expect(screen.getByText('Recompensa del sponsor')).toBeInTheDocument();
    expect(screen.getByText('9 meses de cliff y 6 meses de vesting lineal')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre en el ranking')).toHaveValue('Hunter-A1B2C3');
    expect(screen.getByText('Wallet firmada')).toBeInTheDocument();
    expect(screen.getByText('CipherFox')).toBeInTheDocument();
    expect(screen.getByText('12.345')).toBeInTheDocument();
    expect(screen.getByText('En revisión')).toBeInTheDocument();
    expect(screen.queryByText(/0x[a-f0-9]{6,}/i)).not.toBeInTheDocument();
  });

  it('updates the public alias through the signed participant endpoint', async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/leaderboard')) {
        return jsonResponse({
          success: true,
          campaignId: campaign.campaignId,
          entries: [{
            rank: 1,
            walletRank: 1,
            attemptId: 'my-attempt',
            alias: participant.alias,
            score: 500,
            gameTimeMs: 10_000,
            finishedAt: '2026-08-05T12:30:00.000Z',
            reviewStatus: 'approved',
            isMe: true,
          }],
        });
      }
      if (url.endsWith('/participant') && init?.method === 'PATCH') {
        return jsonResponse({
          success: true,
          participant: { ...participant, alias: 'VaultRunner', canonicalAlias: 'vaultrunner' },
        });
      }
      return jsonResponse({
        success: true,
        configured: true,
        enabled: true,
        phase: 'active',
        campaign,
        participant,
      });
    });

    render(<TreasureHuntCompetitionPanel />);
    const input = await screen.findByLabelText('Nombre en el ranking');
    fireEvent.change(input, { target: { value: 'VaultRunner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    expect(await screen.findByText('Nombre actualizado. Se usará en el ranking público.')).toBeInTheDocument();
    expect(input).toHaveValue('VaultRunner');
    expect(screen.getByText('VaultRunner')).toBeInTheDocument();
    expect(screen.queryByText(participant.alias)).not.toBeInTheDocument();
    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith('/participant') && init?.method === 'PATCH',
    );
    expect(patchCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ alias: 'VaultRunner' }),
      }),
    );
  });

  it('turns an expired signed session into a wallet signature call to action', async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/leaderboard')) {
        return jsonResponse({ success: true, campaignId: campaign.campaignId, entries: [] });
      }
      if (url.endsWith('/participant') && init?.method === 'PATCH') {
        return jsonResponse({ success: false, error: 'UNAUTHORIZED' }, 401);
      }
      return jsonResponse({
        success: true,
        configured: true,
        enabled: true,
        phase: 'active',
        campaign,
        participant,
      });
    });

    render(<TreasureHuntCompetitionPanel />);
    fireEvent.change(await screen.findByLabelText('Nombre en el ranking'), {
      target: { value: 'VaultRunner' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    expect(await screen.findByText('Firma la wallet EVM conectada')).toBeInTheDocument();
    expect(screen.getByText(/No se reutilizará la sesión de otra wallet ni una sesión TRON/i)).toBeInTheDocument();
    expect(screen.getByText(/tu sesión ha caducado/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Firmar wallet EVM' }));

    await waitFor(() => {
      expect(mockFetchUser).toHaveBeenCalledWith(
        '0x1111111111111111111111111111111111111111',
        expect.objectContaining({
          promptForSignature: true,
          requireSignedWallet: true,
          walletType: 'evm',
        }),
      );
    });
    expect(await screen.findByText('Wallet firmada')).toBeInTheDocument();
  });

  it('does not invent campaign dates when runtime is unconfigured', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse({
        success: true,
        configured: false,
        enabled: false,
        phase: 'unconfigured',
        campaign: null,
        participant: null,
      }),
    );

    render(<TreasureHuntCompetitionPanel />);

    expect(await screen.findByText('Pendiente de configurar')).toBeInTheDocument();
    expect(screen.getByText('Las fechas se anunciarán cuando la campaña quede configurada.')).toBeInTheDocument();
    expect(screen.queryByText(/UTC/)).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('shows the definitive alias as locked after the competition closes', async () => {
    fetchMock.mockImplementation((input) => {
      if (String(input).includes('/leaderboard')) {
        return jsonResponse({ success: true, campaignId: campaign.campaignId, entries: [] });
      }
      return jsonResponse({
        success: true,
        configured: true,
        enabled: true,
        phase: 'closed',
        campaign,
        participant,
      });
    });

    render(<TreasureHuntCompetitionPanel />);

    expect(await screen.findByText('Cerrada')).toBeInTheDocument();
    expect(screen.getByText(/Nombre definitivo:/)).toHaveTextContent(participant.alias);
    expect(screen.queryByLabelText('Nombre en el ranking')).not.toBeInTheDocument();
    expect(screen.queryByText('Firma la wallet EVM conectada')).not.toBeInTheDocument();
  });
});
