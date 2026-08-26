import {
  prepareCompetitionRankingArchiveImport,
  type PreparedCompetitionRankingArchive,
} from '@/lib/treasure-hunt-competition/archive';
import {
  COMPETITION_RANKING_ARCHIVE_ENTRY_INDEXES,
  COMPETITION_RANKING_ARCHIVE_INDEXES,
  CompetitionRankingArchiveBuildInProgressError,
  CompetitionRankingArchiveConflictError,
  MongoCompetitionRankingArchiveRepository,
} from '@/lib/treasure-hunt-competition/server/archive-repository';

const NOW = new Date('2026-08-26T12:00:00.000Z');

function input(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    campaignId: 'uki-presale-closed',
    rulesVersion: '1',
    startsAt: '2026-07-29T00:00:00.000Z',
    endsAt: '2026-08-24T23:00:00.000Z',
    stage: 'provisional',
    createdAt: '2026-08-26T10:00:00.000Z',
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
    totalRankedEntries: 2,
    totalParticipants: 1,
    totalWallets: 1,
    source: {
      kind: 'sanitized_json',
      reference: 'production-export-2026-08-26',
      exportedAt: '2026-08-26T09:00:00.000Z',
    },
    entries: [
      {
        rank: 1,
        walletRank: 1,
        publicEntryId: 'entry-1',
        attemptId: 'attempt-1',
        playerAlias: 'Amber-FOX2',
        score: 900,
        elapsedMs: 20_000,
        finishedAt: '2026-08-20T00:00:20.000Z',
        reviewStatus: 'review',
        estimatedRewardUkiRaw: '1000',
        finalRewardUkiRaw: null,
        rewardStatus: 'estimated',
      },
      {
        rank: 2,
        walletRank: 2,
        publicEntryId: 'entry-2',
        attemptId: 'attempt-2',
        playerAlias: 'Amber-FOX2',
        score: 800,
        elapsedMs: 21_000,
        finishedAt: '2026-08-20T00:00:21.000Z',
        reviewStatus: 'pending',
        estimatedRewardUkiRaw: '500',
        finalRewardUkiRaw: null,
        rewardStatus: 'pending',
      },
    ],
    ...overrides,
  };
}

function prepared(value = input()) {
  return prepareCompetitionRankingArchiveImport(value, { now: NOW });
}

function fakeDb() {
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  let manifest: Record<string, unknown> | null = null;
  let entries: Record<string, unknown>[] = [];
  const manifestCollection = {
    createIndexes: jest.fn().mockResolvedValue([]),
    insertOne: jest.fn(async (document: Record<string, unknown>) => {
      if (manifest) throw { code: 11000 };
      manifest = clone(document);
      return { acknowledged: true };
    }),
    findOne: jest.fn(async () => manifest && clone(manifest)),
    updateOne: jest.fn(async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
      if (!manifest || manifest.publicationStatus !== 'building') return { modifiedCount: 0 };
      manifest = { ...manifest, ...update.$set };
      return { modifiedCount: 1 };
    }),
  };
  const entryCollection = {
    createIndexes: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn(async (filter: Record<string, unknown>) => {
      entries = entries.filter((entry) => !Object.entries(filter).every(
        ([key, value]) => entry[key] === value,
      ));
      return { acknowledged: true };
    }),
    insertMany: jest.fn(async (documents: Record<string, unknown>[]) => {
      entries.push(...clone(documents));
      return { acknowledged: true };
    }),
  };
  const db = {
    collection: jest.fn((name: string) => (
      name === 'competition_ranking_archives' ? manifestCollection : entryCollection
    )),
  };
  return { db, manifestCollection, entryCollection, getManifest: () => manifest, getEntries: () => entries };
}

describe('Competition ranking archive integrity', () => {
  it('defines unique identity and rank indexes for immutable archive keys', () => {
    expect(COMPETITION_RANKING_ARCHIVE_INDEXES).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: { campaignId: 1, rulesVersion: 1, stage: 1 },
        unique: true,
      }),
    ]));
    expect(COMPETITION_RANKING_ARCHIVE_ENTRY_INDEXES).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: { campaignId: 1, rulesVersion: 1, stage: 1, rank: 1 },
        unique: true,
      }),
    ]));
  });

  it('defaults legacy eligibilityKind to presale and emits only the public entry contract', () => {
    const archive = prepared();

    expect(archive.manifest.eligibilityKind).toBe('presale');
    expect(archive.manifest.stage).toBe('provisional');
    expect(archive.entries[0]).toEqual({
      rank: 1,
      walletRank: 1,
      publicEntryId: 'entry-1',
      attemptId: 'attempt-1',
      playerAlias: 'Amber-FOX2',
      score: 900,
      elapsedMs: 20_000,
      finishedAt: '2026-08-20T00:00:20.000Z',
      reviewStatus: 'review',
      estimatedRewardUkiRaw: '1000',
      finalRewardUkiRaw: null,
      rewardStatus: 'estimated',
      tickets: null,
    });
    expect(JSON.stringify(archive)).not.toMatch(/walletAddress|userId|gameSessionId|evidence/);
  });

  it('rejects private fields rather than silently stripping them', () => {
    const unsafe = input();
    (unsafe.entries[0] as Record<string, unknown>).walletAddress = `0x${'1'.repeat(40)}`;
    expect(() => prepared(unsafe)).toThrow();
  });

  it.each([
    ['non-contiguous rank', () => {
      const value = input();
      value.entries[1].rank = 3;
      return value;
    }],
    ['duplicate public id', () => {
      const value = input();
      value.entries[1].publicEntryId = 'entry-1';
      return value;
    }],
    ['duplicate attempt id', () => {
      const value = input();
      value.entries[1].attemptId = 'attempt-1';
      return value;
    }],
  ])('rejects %s', (_label, build) => {
    expect(() => prepared(build())).toThrow();
  });

  it('rejects a final snapshot while review and rewards remain provisional', () => {
    const value = input({
      stage: 'final',
      pool: { ...input().pool, status: 'final' },
    });
    expect(() => prepared(value)).toThrow(/pending review/);
  });

  it('computes deterministic hashes and validates declared hashes before apply', () => {
    const first = prepared();
    const second = prepared();
    expect(first.manifest.inputHash).toBe(second.manifest.inputHash);
    expect(first.manifest.outputHash).toBe(second.manifest.outputHash);

    const declared = input({
      hashes: { input: first.manifest.inputHash, output: first.manifest.outputHash },
    });
    expect(() => prepareCompetitionRankingArchiveImport(declared, {
      now: NOW,
      requireDeclaredHashes: true,
    })).not.toThrow();
    expect(() => prepareCompetitionRankingArchiveImport(input(), {
      now: NOW,
      requireDeclaredHashes: true,
    })).toThrow(/requires declared/);
  });

  it('publishes building to ready, is idempotent, and conflicts on changed hashes', async () => {
    const database = fakeDb();
    const repository = new MongoCompetitionRankingArchiveRepository(
      async () => database.db as never,
    );
    const archive = prepared();

    await expect(repository.writeSnapshot(archive)).resolves.toMatchObject({ created: true });
    expect(database.getManifest()).toMatchObject({ publicationStatus: 'ready' });
    expect(database.getEntries()).toHaveLength(2);
    await expect(repository.writeSnapshot(archive)).resolves.toMatchObject({ created: false });
    expect(database.getEntries()).toHaveLength(2);

    const changedInput = input();
    changedInput.entries[0].score = 901;
    const changed = prepared(changedInput) as PreparedCompetitionRankingArchive;
    await expect(repository.writeSnapshot(changed)).rejects.toBeInstanceOf(
      CompetitionRankingArchiveConflictError,
    );
    expect(database.getEntries()).toHaveLength(2);
  });

  it('never marks a partial entry write ready', async () => {
    const database = fakeDb();
    database.entryCollection.insertMany.mockRejectedValueOnce(new Error('interrupted'));
    const repository = new MongoCompetitionRankingArchiveRepository(
      async () => database.db as never,
    );

    await expect(repository.writeSnapshot(prepared())).rejects.toThrow('interrupted');
    expect(database.getManifest()).toMatchObject({ publicationStatus: 'building' });
    expect(database.manifestCollection.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ publicationStatus: 'building' }),
      { $set: { leaseExpiresAt: '1970-01-01T00:00:00.000Z' } },
    );
  });

  it('retries only the same interrupted build and then publishes it', async () => {
    const database = fakeDb();
    database.entryCollection.insertMany.mockRejectedValueOnce(new Error('interrupted'));
    const repository = new MongoCompetitionRankingArchiveRepository(
      async () => database.db as never,
    );
    const archive = prepared();

    await expect(repository.writeSnapshot(archive)).rejects.toThrow('interrupted');
    await expect(repository.writeSnapshot(archive)).resolves.toMatchObject({
      created: true,
      manifest: { publicationStatus: 'ready' },
    });
    expect(database.entryCollection.deleteMany).toHaveBeenCalledTimes(2);
    expect(database.getEntries()).toHaveLength(2);
  });

  it('does not let a concurrent writer take over an active identical build', async () => {
    const archive = prepared();
    const insertOne = jest.fn().mockRejectedValue({ code: 11000 });
    const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 0 });
    const repository = new MongoCompetitionRankingArchiveRepository(async () => ({
      collection: jest.fn((name: string) => (
        name === 'competition_ranking_archives'
          ? {
            createIndexes: jest.fn(),
            insertOne,
            findOne: jest.fn(async () => ({
              ...archive.manifest,
              publicationStatus: 'building',
              buildId: archive.manifest.outputHash,
              writerToken: 'other-writer',
              leaseExpiresAt: '2099-01-01T00:00:00.000Z',
            })),
            updateOne,
          }
          : { createIndexes: jest.fn() }
      )),
    }) as never);

    await expect(repository.writeSnapshot(archive)).rejects.toBeInstanceOf(
      CompetitionRankingArchiveBuildInProgressError,
    );
    expect(updateOne).toHaveBeenCalledTimes(1);
  });

  it('uses an allowlist projection and strips unexpected private Mongo fields on reads', async () => {
    const archive = prepared();
    const row = {
      ...archive.entries[0],
      campaignId: archive.manifest.campaignId,
      rulesVersion: archive.manifest.rulesVersion,
      stage: archive.manifest.stage,
      buildId: archive.manifest.outputHash,
      outputHash: archive.manifest.outputHash,
      walletAddress: `0x${'1'.repeat(40)}`,
      userId: 'private-user',
      gameSessionId: 'private-session',
      evidence: [{ private: true }],
    };
    const cursor = {
      sort: jest.fn(),
      skip: jest.fn(),
      limit: jest.fn(),
      toArray: jest.fn(async () => [row]),
    };
    cursor.sort.mockReturnValue(cursor);
    cursor.skip.mockReturnValue(cursor);
    cursor.limit.mockReturnValue(cursor);
    const find = jest.fn((_filter: unknown, _options: unknown) => cursor);
    const repository = new MongoCompetitionRankingArchiveRepository(async () => ({
      collection: jest.fn(() => ({ find })),
    }) as never);

    const result = await repository.listReadyEntries({
      manifest: { ...archive.manifest, publicationStatus: 'ready' },
      offset: 0,
      limit: 20,
    });

    expect(result).toEqual([archive.entries[0]]);
    expect(JSON.stringify(result)).not.toMatch(/walletAddress|private-user|private-session|evidence/);
    expect(find.mock.calls[0]?.[1]).toEqual({ projection: expect.objectContaining({
      rank: 1,
      playerAlias: 1,
      rewardStatus: 1,
    }) });
  });
});
