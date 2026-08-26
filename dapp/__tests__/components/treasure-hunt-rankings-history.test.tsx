import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { formatArchiveReward } from '@/components/games/treasure-hunt-history-view';
import TreasureHuntRankingsView, {
  calculateAvailablePrizeSlots,
} from '@/components/games/treasure-hunt-rankings-view';
import type { TreasureHuntCompetitionArchiveEntry } from '@/hooks/use-treasure-hunt-competition-history';

let mockActiveEligibilityKind: 'presale' | 'uki_staking' = 'uki_staking';

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
        eligibilityKind: mockActiveEligibilityKind,
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

const stakingManifest = {
  ...manifest,
  campaignId: 'uki-staking-treasure-hunt-202608',
  rulesVersion: 'staking-v1',
  eligibilityKind: 'uki_staking',
  pool: {
    status: 'provisional',
    totalUkiRaw: '10000000000000000000000',
    playerUkiRaw: '10000000000000000000000',
    sponsorUkiRaw: '0',
  },
  rewardMetadata: {
    model: 'staking_draw',
    playerPoolUkiRaw: '10000000000000000000000',
    sponsorPoolUkiRaw: '0',
    prizePerWinnerUkiRaw: '1000000000000000000000',
  },
  totalRankedEntries: 1,
  totalParticipants: 1,
  totalWallets: 1,
} as const;

function pageEntries(page: number) {
  const offset = (page - 1) * 20;
  return Array.from({ length: 20 }, (_, index): TreasureHuntCompetitionArchiveEntry => {
    const rank = offset + index + 1;
    return {
      ...entry,
      rank,
      publicEntryId: `public-entry-${rank}`,
      attemptId: rank === 1 ? 'private-attempt-1' : null,
      playerAlias: rank === 1 ? 'CukieLegend' : `Player${rank}`,
    };
  });
}

function jsonResponse(value: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function installSuccessfulHistoryFetch() {
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
      const page = Number(new URL(url, 'https://cukies.test').searchParams.get('page'));
      return jsonResponse({
        success: true,
        archive: manifest,
        entries: pageEntries(page),
        pagination: { page, pageSize: 20, total: manifest.totalRankedEntries, totalPages: 48 },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  global.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

describe('histórico de Rankings de Treasure Hunt', () => {
  beforeEach(() => {
    mockActiveEligibilityKind = 'uki_staking';
  });

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
    expect(screen.queryByText('Mi resultado')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bganadores?\b/i);

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

    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/games/treasure-hunt/competition/history/uki-presale-treasure-hunt-production-20260729?page=2&pageSize=20',
      expect.any(Object),
    ));
    expect(await screen.findAllByText('Player21')).toHaveLength(2);
  });

  it('no aplica semántica de staking ni slots a una competición activa de preventa', () => {
    mockActiveEligibilityKind = 'presale';
    render(<TreasureHuntRankingsView />);

    expect(screen.getByRole('heading', { name: 'Treasure Hunt · Torneo de preventa' })).toBeInTheDocument();
    expect(screen.getByText('Premio acumulado')).toBeInTheDocument();
    expect(screen.queryByText('Premios disponibles')).not.toBeInTheDocument();
    expect(screen.queryByText('Bote provisional')).not.toBeInTheDocument();
    expect(screen.queryByText('Tus tickets')).not.toBeInTheDocument();
    expect(screen.queryByText(/Staking UKI/)).not.toBeInTheDocument();
    expect(screen.queryByText(/genera un ticket/)).not.toBeInTheDocument();
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

  it('anuncia visual y semánticamente la carga del histórico', async () => {
    let resolveList!: (response: Response) => void;
    const pendingList = new Promise<Response>((resolve) => {
      resolveList = resolve;
    });
    global.fetch = jest.fn(() => pendingList) as typeof fetch;
    render(<TreasureHuntRankingsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Finalizadas' }));

    expect(screen.getByRole('status', {
      name: 'Cargando histórico de clasificaciones',
    })).toBeInTheDocument();

    await act(async () => {
      resolveList(new Response(JSON.stringify({
        success: true,
        archives: [],
        pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    expect(await screen.findByText('Aún no hay ediciones publicadas')).toBeInTheDocument();
  });

  it('selecciona la primera edición y permite cambiar a otra', async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/history?page=1&pageSize=100')) {
        return jsonResponse({
          success: true,
          archives: [manifest, stakingManifest],
          pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
        });
      }
      if (url.includes(stakingManifest.campaignId)) {
        return jsonResponse({
          success: true,
          archive: stakingManifest,
          entries: [{ ...entry, rewardStatus: 'draw_pending', tickets: 25 }],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        });
      }
      return jsonResponse({
        success: true,
        archive: manifest,
        entries: pageEntries(1),
        pagination: { page: 1, pageSize: 20, total: 952, totalPages: 48 },
      });
    });
    global.fetch = fetchMock as typeof fetch;
    render(<TreasureHuntRankingsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Finalizadas' }));

    const selector = await screen.findByRole('combobox', { name: 'Edición finalizada' });
    expect(selector).toHaveValue(manifest.campaignId);
    expect(await screen.findByRole('heading', { name: 'Treasure Hunt · Torneo de preventa' })).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: stakingManifest.campaignId } });
    expect(await screen.findByRole('heading', { name: 'Treasure Hunt · Staking UKI' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/games/treasure-hunt/competition/history/${stakingManifest.campaignId}?page=1&pageSize=20`,
      expect.any(Object),
    );
  });

  it('cambia desde página 2 sin pedir la página antigua ni mostrar el detalle previo', async () => {
    let resolveStaking!: (response: Response) => void;
    let resolvePresalePageTwo!: (response: Response) => void;
    let presalePageTwoSignal: AbortSignal | undefined;
    const pendingStaking = new Promise<Response>((resolve) => {
      resolveStaking = resolve;
    });
    const pendingPresalePageTwo = new Promise<Response>((resolve) => {
      resolvePresalePageTwo = resolve;
    });
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/history?page=1&pageSize=100')) {
        return jsonResponse({
          success: true,
          archives: [manifest, stakingManifest],
          pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
        });
      }
      if (url.includes(stakingManifest.campaignId)) return pendingStaking;
      const page = Number(new URL(url, 'https://cukies.test').searchParams.get('page'));
      if (page === 2) {
        presalePageTwoSignal = init?.signal ?? undefined;
        return pendingPresalePageTwo;
      }
      return jsonResponse({
        success: true,
        archive: manifest,
        entries: pageEntries(page),
        pagination: { page, pageSize: 20, total: 952, totalPages: 48 },
      });
    });
    global.fetch = fetchMock as typeof fetch;
    render(<TreasureHuntRankingsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Finalizadas' }));
    expect(await screen.findAllByText('CukieLegend')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }));
    await waitFor(() => expect(presalePageTwoSignal).toBeDefined());
    expect(screen.queryByText('CukieLegend')).not.toBeInTheDocument();
    const selector = screen.getByRole('combobox', { name: 'Edición finalizada' });
    fireEvent.change(selector, { target: { value: stakingManifest.campaignId } });

    expect(presalePageTwoSignal?.aborted).toBe(true);
    expect(selector).toHaveValue(stakingManifest.campaignId);
    expect(screen.queryByRole('heading', { name: 'Treasure Hunt · Torneo de preventa' })).not.toBeInTheDocument();
    expect(screen.queryByText('Player21')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Cargando histórico de clasificaciones' })).toBeInTheDocument();
    await waitFor(() => expect(
      fetchMock.mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.includes(stakingManifest.campaignId)),
    ).toEqual([
      `/api/games/treasure-hunt/competition/history/${stakingManifest.campaignId}?page=1&pageSize=20`,
    ]));

    await act(async () => {
      resolveStaking(new Response(JSON.stringify({
        success: true,
        archive: stakingManifest,
        entries: [{ ...entry, rewardStatus: 'draw_pending', tickets: 25 }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    expect(await screen.findByRole('heading', { name: 'Treasure Hunt · Staking UKI' })).toBeInTheDocument();

    await act(async () => {
      resolvePresalePageTwo(new Response(JSON.stringify({
        success: true,
        archive: manifest,
        entries: pageEntries(2),
        pagination: { page: 2, pageSize: 20, total: 952, totalPages: 48 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    expect(screen.getByRole('heading', { name: 'Treasure Hunt · Staking UKI' })).toBeInTheDocument();
    expect(screen.queryByText('Player21')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Treasure Hunt · Torneo de preventa' })).not.toBeInTheDocument();
  });

  it('oculta inmediatamente las filas anteriores mientras carga otra página', async () => {
    let resolvePageTwo!: (response: Response) => void;
    const pendingPageTwo = new Promise<Response>((resolve) => {
      resolvePageTwo = resolve;
    });
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/history?page=1&pageSize=100')) {
        return jsonResponse({
          success: true,
          archives: [manifest],
          pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        });
      }
      const page = Number(new URL(url, 'https://cukies.test').searchParams.get('page'));
      if (page === 2) return pendingPageTwo;
      return jsonResponse({
        success: true,
        archive: manifest,
        entries: pageEntries(1),
        pagination: { page: 1, pageSize: 20, total: 952, totalPages: 48 },
      });
    });
    global.fetch = fetchMock as typeof fetch;
    render(<TreasureHuntRankingsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Finalizadas' }));
    expect(await screen.findAllByText('CukieLegend')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }));

    expect(screen.queryByText('CukieLegend')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Cargando histórico de clasificaciones' })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/games/treasure-hunt/competition/history/${manifest.campaignId}?page=2&pageSize=20`,
      expect.any(Object),
    ));

    await act(async () => {
      resolvePageTwo(new Response(JSON.stringify({
        success: true,
        archive: manifest,
        entries: pageEntries(2),
        pagination: { page: 2, pageSize: 20, total: 952, totalPages: 48 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    expect(await screen.findAllByText('Player21')).toHaveLength(2);
  });

  it('distingue resultados finales de una clasificación provisional', async () => {
    const finalManifest = {
      ...manifest,
      campaignId: 'presale-final',
      stage: 'final',
      pool: { ...manifest.pool, status: 'final' },
      totalRankedEntries: 1,
      totalParticipants: 1,
      totalWallets: 1,
    } as const;
    const finalEntry = {
      ...entry,
      reviewStatus: 'valid',
      rewardStatus: 'final',
      finalRewardUkiRaw: '2500000000000000000000',
    } as const;
    global.fetch = jest.fn((input: RequestInfo | URL) => (
      String(input).endsWith('/history?page=1&pageSize=100')
        ? jsonResponse({
          success: true,
          archives: [finalManifest],
          pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        })
        : jsonResponse({
          success: true,
          archive: finalManifest,
          entries: [finalEntry],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        })
    )) as typeof fetch;
    render(<TreasureHuntRankingsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Finalizadas' }));

    expect(await screen.findByText('Final')).toBeInTheDocument();
    expect(screen.getByText(/Resultados definitivos de la edición/)).toBeInTheDocument();
    expect(screen.queryByText('Provisional')).not.toBeInTheDocument();
    expect(screen.queryByText(/Clasificación congelada al cierre/)).not.toBeInTheDocument();
  });

  it('muestra una edición válida sin entradas', async () => {
    const emptyManifest = {
      ...manifest,
      campaignId: 'empty-campaign',
      totalRankedEntries: 0,
      totalParticipants: 0,
      totalWallets: 0,
    } as const;
    global.fetch = jest.fn((input: RequestInfo | URL) => (
      String(input).endsWith('/history?page=1&pageSize=100')
        ? jsonResponse({
          success: true,
          archives: [emptyManifest],
          pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        })
        : jsonResponse({
          success: true,
          archive: emptyManifest,
          entries: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        })
    )) as typeof fetch;
    render(<TreasureHuntRankingsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Finalizadas' }));

    expect(await screen.findByText('Esta edición no tiene entradas clasificadas')).toBeInTheDocument();
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
          entries: pageEntries(1),
          pagination: { page: 1, pageSize: 20, total: 952, totalPages: 48 },
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

  it('muestra el error de detalle y Reintentar recupera la clasificación', async () => {
    let detailCalls = 0;
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/history?page=1&pageSize=100')) {
        return jsonResponse({
          success: true,
          archives: [manifest],
          pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        });
      }
      detailCalls += 1;
      if (detailCalls === 1) return jsonResponse({ success: false }, 500);
      return jsonResponse({
        success: true,
        archive: manifest,
        entries: pageEntries(1),
        pagination: { page: 1, pageSize: 20, total: 952, totalPages: 48 },
      });
    });
    global.fetch = fetchMock as typeof fetch;
    render(<TreasureHuntRankingsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Finalizadas' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo cargar la clasificación de esta edición.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Provisional')).toBeInTheDocument();
    expect(screen.getAllByText('CukieLegend')).toHaveLength(2);
    expect(detailCalls).toBe(2);
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
