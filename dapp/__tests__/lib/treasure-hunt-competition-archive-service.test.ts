import type {
  CompetitionRankingArchiveEntry,
  CompetitionRankingArchiveManifest,
} from '@/lib/treasure-hunt-competition/archive';

jest.mock('@/lib/indexer-db/mongodb', () => ({ getIndexerDb: jest.fn() }));
import type { CompetitionRankingArchiveRepository } from '@/lib/treasure-hunt-competition/server/archive-repository';
import { createCompetitionRankingArchiveService } from '@/lib/treasure-hunt-competition/server/archive-service';

function manifest(
  stage: 'provisional' | 'final',
  overrides: Partial<CompetitionRankingArchiveManifest> = {},
): CompetitionRankingArchiveManifest {
  return {
    schemaVersion: 1,
    campaignId: 'campaign-1',
    rulesVersion: '1',
    eligibilityKind: 'presale',
    startsAt: '2026-07-01T00:00:00.000Z',
    endsAt: '2026-07-31T00:00:00.000Z',
    stage,
    createdAt: stage === 'final'
      ? '2026-08-03T00:00:00.000Z'
      : '2026-08-01T00:00:00.000Z',
    pool: { status: stage, totalUkiRaw: '100', playerUkiRaw: '80', sponsorUkiRaw: '20' },
    rewardMetadata: null,
    totalRankedEntries: 45,
    totalParticipants: 20,
    totalWallets: 20,
    source: {
      kind: 'sanitized_json',
      reference: `${stage}-export`,
      exportedAt: '2026-08-01T00:00:00.000Z',
    },
    inputHash: `sha256:${stage === 'final' ? 'f' : 'a'}`.padEnd(71, stage === 'final' ? 'f' : 'a'),
    outputHash: `sha256:${stage === 'final' ? 'e' : 'b'}`.padEnd(71, stage === 'final' ? 'e' : 'b'),
    publicationStatus: 'ready',
    ...overrides,
  };
}

function repository(
  manifests: CompetitionRankingArchiveManifest[],
  entries: CompetitionRankingArchiveEntry[] = [],
) {
  return {
    ensureIndexes: jest.fn(),
    writeSnapshot: jest.fn(),
    listReadyManifests: jest.fn(async () => manifests),
    findReadyManifests: jest.fn(async (campaignId: string, stage?: string) => (
      manifests.filter((item) => item.campaignId === campaignId && (!stage || item.stage === stage))
    )),
    listReadyEntries: jest.fn(async ({ offset, limit }) => entries.slice(offset, offset + limit)),
  } as jest.Mocked<CompetitionRankingArchiveRepository>;
}

describe('Competition ranking archive read service', () => {
  it('prefers final over provisional for the same campaign', async () => {
    const source = repository([manifest('provisional'), manifest('final')]);
    const service = createCompetitionRankingArchiveService(source);

    await expect(service.listHistory()).resolves.toMatchObject({
      archives: [{ campaignId: 'campaign-1', stage: 'final' }],
      pagination: { total: 1 },
    });
    await expect(service.getHistory({ campaignId: 'campaign-1' })).resolves.toMatchObject({
      archive: { stage: 'final' },
    });
    expect(source.listReadyEntries).toHaveBeenCalledWith(expect.objectContaining({
      manifest: expect.objectContaining({ stage: 'final' }),
    }));
  });

  it('allows an explicit safe stage and validates bounded pagination', async () => {
    const source = repository([manifest('provisional'), manifest('final')]);
    const service = createCompetitionRankingArchiveService(source);

    await expect(service.getHistory({
      campaignId: 'campaign-1',
      stage: 'provisional',
      page: 3,
      pageSize: 20,
    })).resolves.toMatchObject({
      archive: { stage: 'provisional' },
      pagination: { page: 3, pageSize: 20, total: 45, totalPages: 3 },
    });
    expect(source.listReadyEntries).toHaveBeenLastCalledWith(expect.objectContaining({
      offset: 40,
      limit: 20,
    }));
    await expect(service.getHistory({
      campaignId: 'campaign-1',
      pageSize: 101,
    })).rejects.toBeInstanceOf(RangeError);
  });

  it('has no attempts source and obtains detail rows exclusively from the archive repository', async () => {
    const source = repository([manifest('provisional')]);
    const service = createCompetitionRankingArchiveService(source);

    await service.getHistory({ campaignId: 'campaign-1' });

    expect(source.findReadyManifests).toHaveBeenCalledWith('campaign-1', undefined);
    expect(source.listReadyEntries).toHaveBeenCalledTimes(1);
    expect(Object.keys(source)).not.toContain('listAttempts');
  });
});
