import { act, renderHook, waitFor } from '@testing-library/react';

import { useTreasureHuntCompetitionHistory } from '@/hooks/use-treasure-hunt-competition-history';

function manifest(campaignId: string) {
  return {
    schemaVersion: 1,
    campaignId,
    rulesVersion: 'presale-v1',
    eligibilityKind: 'presale',
    startsAt: '2026-07-01T00:00:00.000Z',
    endsAt: '2026-07-31T23:59:59.000Z',
    stage: 'provisional',
    createdAt: '2026-08-01T12:00:00.000Z',
    pool: {
      status: 'provisional',
      totalUkiRaw: '1000000000000000000',
      playerUkiRaw: null,
      sponsorUkiRaw: null,
    },
    rewardMetadata: null,
    totalRankedEntries: 1,
    totalParticipants: 1,
    totalWallets: 1,
    source: {
      kind: 'sanitized_json',
      reference: 'audit-only',
      exportedAt: '2026-08-01T10:00:00.000Z',
    },
    inputHash: `sha256:${'a'.repeat(64)}`,
    outputHash: `sha256:${'b'.repeat(64)}`,
    publicationStatus: 'ready',
  } as const;
}

const entry = {
  rank: 1,
  walletRank: 1,
  publicEntryId: 'entry-1',
  attemptId: null,
  playerAlias: 'PlayerOne',
  score: 10_000,
  elapsedMs: 45_000,
  finishedAt: '2026-07-20T12:00:00.000Z',
  reviewStatus: 'pending',
  estimatedRewardUkiRaw: null,
  finalRewardUkiRaw: null,
  rewardStatus: 'pending',
  tickets: null,
} as const;

function jsonResponse(value: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('useTreasureHuntCompetitionHistory', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('selecciona la primera edición y pagina el detalle por los endpoints congelados', async () => {
    const archive = manifest('campaign-1');
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/history?page=1&pageSize=100')) {
        return jsonResponse({
          success: true,
          archives: [archive],
          pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        });
      }
      return jsonResponse({
        success: true,
        archive,
        entries: [entry],
        pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
      });
    });
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() => useTreasureHuntCompetitionHistory({
      page: 2,
      pageSize: 10,
    }));

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.selectedCampaignId).toBe('campaign-1');
    expect(result.current.pagination).toEqual({ page: 2, pageSize: 10, total: 11, totalPages: 2 });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/games/treasure-hunt/competition/history?page=1&pageSize=100',
      '/api/games/treasure-hunt/competition/history/campaign-1?page=2&pageSize=10',
    ]);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('leaderboard'))).toBe(false);
  });

  it('rechaza una respuesta incompleta aunque tenga success true', async () => {
    global.fetch = jest.fn(() => jsonResponse({
      success: true,
      archives: [{ campaignId: 'campaign-without-manifest' }],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    })) as typeof fetch;

    const { result } = renderHook(() => useTreasureHuntCompetitionHistory());

    await waitFor(() => expect(result.current.listError).toBe(
      'No se pudieron cargar las ediciones finalizadas.',
    ));
    expect(result.current.archives).toEqual([]);
    expect(result.current.selectedCampaignId).toBeNull();
  });

  it('vuelve a la primera edición si la selección desaparece al recargar', async () => {
    const first = manifest('campaign-1');
    const removed = manifest('campaign-2');
    let listCalls = 0;
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/history?page=1&pageSize=100')) {
        listCalls += 1;
        const archives = listCalls === 1 ? [first, removed] : [first];
        return jsonResponse({
          success: true,
          archives,
          pagination: { page: 1, pageSize: 100, total: archives.length, totalPages: 1 },
        });
      }
      const archive = url.includes('campaign-2') ? removed : first;
      return jsonResponse({
        success: true,
        archive,
        entries: [entry],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });
    });
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() => useTreasureHuntCompetitionHistory());
    await waitFor(() => expect(result.current.archive?.campaignId).toBe('campaign-1'));

    act(() => result.current.selectCampaign('campaign-2'));
    await waitFor(() => expect(result.current.archive?.campaignId).toBe('campaign-2'));

    act(() => result.current.reloadList());
    await waitFor(() => expect(result.current.selectedCampaignId).toBe('campaign-1'));
    await waitFor(() => expect(result.current.archive?.campaignId).toBe('campaign-1'));
    expect(result.current.archives.map((item) => item.campaignId)).toEqual(['campaign-1']);
  });
});
