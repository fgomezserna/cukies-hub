import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { formatArchiveReward } from '@/components/games/treasure-hunt-history-view';
import TreasureHuntRankingsView, {
  calculateAvailablePrizeSlots,
} from '@/components/games/treasure-hunt-rankings-view';
import type { TreasureHuntCompetitionArchiveEntry } from '@/hooks/use-treasure-hunt-competition-history';

jest.mock('lucide-react', () => ({
  Archive: () => null,
  ArrowRight: () => null,
  Clock3: () => null,
  Medal: () => null,
}));

jest.mock('@/hooks/use-treasure-hunt-competition-overview', () => ({
  formatTreasureHuntDuration: (elapsedMs: number) => `${elapsedMs / 1_000} s`,
  useTreasureHuntCompetitionOverview: () => ({
    status: {
      campaign: {
        topAttemptsPerWallet: 10,
        pointsPerTicket: 100,
        prizePerWinnerUkiRaw: '10000000000000000000000',
      },
      eligibility: { topAttemptsCount: 1, provisionalTickets: 125 },
    },
    leaderboard: [],
    leaderboardMeta: {
      poolUkiRaw: '71484000000000000000000',
      myAttempts: 1,
      pagination: { page: 1, pageSize: 20, totalEntries: 0, totalPages: 0 },
    },
    isLoading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

const manifest = {
  schemaVersion: 1,
  campaignId: 'uki-presale-treasure-hunt-production-20260729',
  rulesVersion: 'presale-v1',
  eligibilityKind: 'presale',
  startsAt: '2026-07-29T00:00:00.000Z',
  endsAt: '2026-08-05T23:59:59.000Z',
  stage: 'provisional',
  createdAt: '2026-08-06T12:00:00.000Z',
  pool: {
    status: 'provisional',
    totalUkiRaw: '554127451200000000000000',
    playerUkiRaw: '443301960960000000000000',
    sponsorUkiRaw: '110825490240000000000000',
  },
  rewardMetadata: {
    model: 'presale_pool',
    playerPoolUkiRaw: '443301960960000000000000',
    sponsorPoolUkiRaw: '110825490240000000000000',
    prizePerWinnerUkiRaw: null,
  },
  totalRankedEntries: 952,
  totalParticipants: 241,
  totalWallets: 214,
  source: {
    kind: 'sanitized_json',
    reference: 'private-audit-source',
    exportedAt: '2026-08-06T10:00:00.000Z',
  },
  inputHash: `sha256:${'a'.repeat(64)}`,
  outputHash: `sha256:${'b'.repeat(64)}`,
  publicationStatus: 'ready',
} as const;

const entry: TreasureHuntCompetitionArchiveEntry = {
  rank: 1,
  walletRank: 1,
  publicEntryId: 'public-entry-1',
  attemptId: 'private-attempt-1',
  playerAlias: 'CukieLegend',
  score: 12_500,
  elapsedMs: 42_000,
  finishedAt: '2026-07-30T12:00:00.000Z',
  reviewStatus: 'pending',
  estimatedRewardUkiRaw: '2500000000000000000000',
  finalRewardUkiRaw: null,
  rewardStatus: 'partial',
  tickets: null,
};

function jsonResponse(value: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function installSuccessfulHistoryFetch(entries: readonly TreasureHuntCompetitionArchiveEntry[] = [entry]) {
  const fetchMock = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/games/treasure-hunt/competition/history?page=1&pageSize=100') {
      return jsonResponse({
        success: true,
        archives: [manifest],
        pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      });
    }
    if (url.includes('/competition/history/uki-presale-treasure-hunt-production-20260729')) {
      return jsonResponse({
        success: true,
        archive: manifest,
        entries,
        pagination: { page: 1, pageSize: 20, total: manifest.totalRankedEntries, totalPages: 48 },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  global.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

describe('histórico de Rankings de Treasure Hunt', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('mantiene En curso inicialmente y carga lista y detalle solo al elegir Finalizadas', async () => {
    const fetchMock = installSuccessfulHistoryFetch();
    render(<TreasureHuntRankingsView />);

    expect(screen.getByRole('button', { name: 'En curso' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Finalizadas' }));

    expect(await screen.findByRole('combobox', { name: 'Edición finalizada' })).toHaveValue(
      manifest.campaignId,
    );
    expect(await screen.findByRole('heading', { name: 'Treasure Hunt · Torneo de preventa' })).toBeInTheDocument();
    expect(screen.getByText('Provisional')).toBeInTheDocument();
    expect(screen.getByText(/Clasificación congelada al cierre/)).toHaveTextContent(
      'Los premios son todavía estimados y están pendientes de revisión.',
    );
    expect(screen.getByText('554.127,45 UKI')).toBeInTheDocument();
    expect(screen.getByText('952', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('241')).toBeInTheDocument();
    expect(screen.getAllByText('CukieLegend')).toHaveLength(2);
    expect(screen.queryByText('private-attempt-1')).not.toBeInTheDocument();
    expect(screen.queryByText('private-audit-source')).not.toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((item) => item.textContent)).toEqual([
      'Pos.',
      'Jugador',
      'Puntuación',
      'Tiempo',
      'Premio/resultado',
    ]);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/games/treasure-hunt/competition/history?page=1&pageSize=100',
      '/api/games/treasure-hunt/competition/history/uki-presale-treasure-hunt-production-20260729?page=1&pageSize=20',
    ]);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/leaderboard'))).toBe(false);
  });

  it('muestra el estado vacío del histórico', async () => {
    global.fetch = jest.fn(() => jsonResponse({
      success: true,
      archives: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    })) as typeof fetch;
    render(<TreasureHuntRankingsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Finalizadas' }));

    expect(await screen.findByText('Aún no hay ediciones publicadas')).toBeInTheDocument();
  });

  it('muestra un error validado y permite reintentar la lista', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => jsonResponse({ success: false }, 500))
      .mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('?page=1&pageSize=100')) {
          return jsonResponse({
            success: true,
            archives: [manifest],
            pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
          });
        }
        return jsonResponse({
          success: true,
          archive: manifest,
          entries: [entry],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        });
      });
    global.fetch = fetchMock as typeof fetch;
    render(<TreasureHuntRankingsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Finalizadas' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudieron cargar las ediciones finalizadas.');

    fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Provisional')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('conserva las etiquetas de recompensa de archivos legacy', () => {
    const variants: Array<[TreasureHuntCompetitionArchiveEntry['rewardStatus'], string]> = [
      ['no_purchase', 'Sin compra elegible'],
      ['pool_exhausted', 'Pool agotado'],
      ['reward_rounds_to_zero', 'Sin premio'],
      ['draw_pending', 'Sorteo pendiente'],
      ['partial', '2500 UKI · Parcial'],
      ['estimated', '2500 UKI'],
      ['final', '3000 UKI'],
      ['not_applicable', 'Sin premio'],
      ['pending', 'Pendiente'],
    ];

    for (const [rewardStatus, expected] of variants) {
      expect(formatArchiveReward({
        ...entry,
        rewardStatus,
        finalRewardUkiRaw: '3000000000000000000000',
      })).toBe(expected);
    }
  });

  it('calcula Premios disponibles con BigInt y protege divisor cero o desconocido', () => {
    expect(calculateAvailablePrizeSlots('554127451200000000000000', '10000000000000000000000'))
      .toBe(BigInt(55));
    expect(calculateAvailablePrizeSlots('554127451200000000000000', '0')).toBeNull();
    expect(calculateAvailablePrizeSlots('554127451200000000000000', undefined)).toBeNull();
  });
});
