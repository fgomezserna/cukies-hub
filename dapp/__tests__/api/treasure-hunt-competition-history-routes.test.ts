import { getCompetitionRankingArchiveService } from '@/lib/treasure-hunt-competition/server/archive-service';
import { GET as getHistory } from '@/app/api/games/treasure-hunt/competition/history/route';
import { GET as getHistoryDetail } from '@/app/api/games/treasure-hunt/competition/history/[campaignId]/route';

jest.mock('@/lib/treasure-hunt-competition/server/archive-service', () => {
  class CompetitionRankingArchiveNotFoundError extends Error {}
  return {
    CompetitionRankingArchiveNotFoundError,
    getCompetitionRankingArchiveService: jest.fn(),
  };
});

const mockGetService = getCompetitionRankingArchiveService as jest.MockedFunction<
  typeof getCompetitionRankingArchiveService
>;
const service = {
  listHistory: jest.fn(),
  getHistory: jest.fn(),
};

describe('Treasure Hunt competition history routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetService.mockReturnValue(service as never);
    service.listHistory.mockResolvedValue({ archives: [], pagination: { total: 0 } });
    service.getHistory.mockResolvedValue({
      archive: { campaignId: 'campaign-1', stage: 'provisional' },
      entries: [{ rank: 1, playerAlias: 'Public-Alias' }],
      pagination: { page: 2, pageSize: 25, total: 30, totalPages: 2 },
    });
  });

  it('lists only archive service manifests with validated paging and stage', async () => {
    const response = await getHistory(new Request(
      'https://hub.test/api/games/treasure-hunt/competition/history?page=2&pageSize=10&stage=final',
    ));

    expect(response.status).toBe(200);
    expect(service.listHistory).toHaveBeenCalledWith({ page: 2, pageSize: 10, stage: 'final' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('gets paginated frozen detail without invoking the live competition service', async () => {
    const response = await getHistoryDetail(
      new Request('https://hub.test/api/history/campaign-1?page=2&pageSize=25'),
      { params: Promise.resolve({ campaignId: 'campaign-1' }) },
    );

    expect(response.status).toBe(200);
    expect(service.getHistory).toHaveBeenCalledWith({
      campaignId: 'campaign-1',
      page: 2,
      pageSize: 25,
      stage: undefined,
    });
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      success: true,
      archive: expect.objectContaining({ stage: 'provisional' }),
      entries: [{ rank: 1, playerAlias: 'Public-Alias' }],
    }));
  });

  it.each([
    ['?page=0', 400],
    ['?pageSize=101', 400],
    ['?stage=building', 400],
    ['?page=1.5', 400],
  ])('rejects invalid public query %s', async (query, status) => {
    const response = await getHistory(new Request(`https://hub.test/api/history${query}`));
    expect(response.status).toBe(status);
    expect(service.listHistory).not.toHaveBeenCalled();
  });
});
