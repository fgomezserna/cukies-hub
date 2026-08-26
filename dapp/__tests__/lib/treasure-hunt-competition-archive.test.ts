import {
  prepareCompetitionRankingArchiveImport,
  type PreparedCompetitionRankingArchive,
} from '@/lib/treasure-hunt-competition/archive';
import {
  COMPETITION_RANKING_ARCHIVE_ENTRY_INDEXES,
  COMPETITION_RANKING_ARCHIVE_INDEXES,
  CompetitionRankingArchiveBuildInProgressError,
  CompetitionRankingArchiveConflictError,
  CompetitionRankingArchiveCorruptError,
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
        estimatedRewardUkiRaw: '1000' as string | null,
        finalRewardUkiRaw: null as string | null,
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
        estimatedRewardUkiRaw: '500' as string | null,
        finalRewardUkiRaw: null as string | null,
        rewardStatus: 'pending',
      },
    ],
    ...overrides,
  };
}

function prepared(value = input()) {
  return prepareCompetitionRankingArchiveImport(value, { now: NOW });
}

function finalInput() {
  const value = input();
  value.stage = 'final';
  value.pool.status = 'final';
  value.entries = value.entries.map((entry, index) => ({
    ...entry,
    reviewStatus: 'valid',
    estimatedRewardUkiRaw: null,
    finalRewardUkiRaw: index === 0 ? '1000' : null,
    rewardStatus: index === 0 ? 'final' : 'not_applicable',
  }));
  return value;
}

function matchesMongoFilter(
  record: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') {
      return (expected as Record<string, unknown>[]).some((candidate) => (
        matchesMongoFilter(record, candidate)
      ));
    }
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const operators = expected as { $lte?: unknown; $exists?: boolean };
      if ('$lte' in operators) {
        return typeof record[key] === 'string'
          && typeof operators.$lte === 'string'
          && record[key] <= operators.$lte;
      }
      if ('$exists' in operators) {
        return (record[key] !== undefined) === operators.$exists;
      }
    }
    return record[key] === expected;
  });
}

function fakeDb(initialManifest: Record<string, unknown> | null = null) {
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  let manifest: Record<string, unknown> | null = initialManifest && clone(initialManifest);
  let entries: Record<string, unknown>[] = [];
  const manifestCollection = {
    createIndexes: jest.fn().mockResolvedValue([]),
    insertOne: jest.fn(async (document: Record<string, unknown>) => {
      if (manifest) throw { code: 11000 };
      manifest = clone(document);
      return { acknowledged: true };
    }),
    findOne: jest.fn(async () => manifest && clone(manifest)),
    updateOne: jest.fn(async (
      filter: Record<string, unknown>,
      update: { $set: Record<string, unknown> },
    ) => {
      if (!manifest || !matchesMongoFilter(manifest, filter)) return { modifiedCount: 0 };
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

  it('accepts a final no-prize row as resolved with not_applicable and no amount', () => {
    expect(() => prepared(finalInput())).not.toThrow();
  });

  it('rejects final reward status without a fixed amount independently of review', () => {
    const value = finalInput();
    value.entries[0].finalRewardUkiRaw = null;
    expect(() => prepared(value)).toThrow(/requires a fixed reward/);
  });

  it.each(['pending', 'estimated', 'partial', 'draw_pending'] as const)(
    'rejects unresolved %s reward status in a final archive',
    (rewardStatus) => {
      const value = finalInput();
      value.entries[1].rewardStatus = rewardStatus;
      expect(() => prepared(value)).toThrow(/unresolved reward/);
    },
  );

  it.each(['no_purchase', 'pool_exhausted', 'reward_rounds_to_zero', 'not_applicable'] as const)(
    'accepts resolved no-prize status %s in a final archive',
    (rewardStatus) => {
      const value = finalInput();
      value.entries[1].rewardStatus = rewardStatus;
      value.entries[1].finalRewardUkiRaw = '0';
      expect(() => prepared(value)).not.toThrow();
    },
  );

  it.each([
    ['export before close', () => input({
      source: { ...input().source, exportedAt: '2026-08-24T22:59:59.999Z' },
    }), /export cannot predate/],
    ['creation before close', () => input({
      createdAt: '2026-08-24T22:59:59.999Z',
      source: { ...input().source, exportedAt: '2026-08-24T23:00:00.000Z' },
    }), /creation cannot predate/],
    ['creation before export', () => input({
      createdAt: '2026-08-26T08:59:59.999Z',
    }), /creation cannot predate/],
    ['creation in the future', () => input({
      createdAt: '2026-08-26T12:00:00.001Z',
    }), /cannot be in the future/],
    ['export and creation in the future', () => input({
      createdAt: '2026-08-26T12:00:00.002Z',
      source: { ...input().source, exportedAt: '2026-08-26T12:00:00.001Z' },
    }), /cannot be in the future/],
  ])('rejects incoherent snapshot chronology: %s', (_label, build, expected) => {
    expect(() => prepared(build())).toThrow(expected);
  });

  it.each([
    ['pool sum', () => input({
      pool: { ...input().pool, totalUkiRaw: '1' },
    }), /must sum/],
    ['metadata player pool', () => input({
      rewardMetadata: { ...input().rewardMetadata, playerPoolUkiRaw: '1' },
    }), /metadata player pool differs/],
    ['incomplete presale pools', () => input({
      pool: { ...input().pool, playerUkiRaw: null },
      rewardMetadata: { ...input().rewardMetadata, playerPoolUkiRaw: null },
    }), /requires complete/],
    ['staking sponsor pool', () => input({
      eligibilityKind: 'uki_staking',
      pool: {
        status: 'provisional',
        totalUkiRaw: '100',
        playerUkiRaw: '90',
        sponsorUkiRaw: '10',
      },
      rewardMetadata: {
        model: 'staking_draw',
        playerPoolUkiRaw: '90',
        sponsorPoolUkiRaw: '10',
        prizePerWinnerUkiRaw: '5',
      },
    }), /non-zero sponsor/],
  ])('rejects contradictory archive header: %s', (_label, build, expected) => {
    expect(() => prepared(build())).toThrow(expected);
  });

  it('reconciles ranked wallets with aliases while allowing more campaign participants', () => {
    const value = input({ totalParticipants: 500, totalWallets: 1 });
    expect(() => prepared(value)).not.toThrow();
    expect(() => prepared(input({ totalParticipants: 1, totalWallets: 2 })))
      .toThrow(/ranked-wallet total/);
  });

  it('accepts an empty final ranking with registered participants but no ranked wallet', () => {
    const value = finalInput();
    value.entries = [];
    value.totalRankedEntries = 0;
    value.totalParticipants = 241;
    value.totalWallets = 0;
    expect(() => prepared(value)).not.toThrow();

    value.totalWallets = 1;
    expect(() => prepared(value)).toThrow(/cannot exceed ranked entries/);
  });

  it('represents the real presale shape with 952 rows, 214 ranked aliases and 241 participants', () => {
    const walletRanks = new Map<string, number>();
    const statuses = [
      ...Array(208).fill('estimated'),
      ...Array(390).fill('no_purchase'),
      'partial',
      ...Array(353).fill('pool_exhausted'),
    ];
    const entries = statuses.map((rewardStatus, index) => {
      const playerAlias = `Player-${String(index % 214).padStart(3, '0')}`;
      const walletRank = (walletRanks.get(playerAlias) ?? 0) + 1;
      walletRanks.set(playerAlias, walletRank);
      return {
        rank: index + 1,
        walletRank,
        publicEntryId: `entry-${index + 1}`,
        attemptId: `attempt-${index + 1}`,
        playerAlias,
        score: 2_000 - index,
        elapsedMs: 20_000 + index,
        finishedAt: '2026-08-20T00:00:20.000Z',
        reviewStatus: 'review',
        estimatedRewardUkiRaw: rewardStatus === 'estimated' || rewardStatus === 'partial'
          ? '1000'
          : '0',
        finalRewardUkiRaw: null,
        rewardStatus,
      };
    });

    const archive = prepared(input({
      totalRankedEntries: 952,
      totalParticipants: 241,
      totalWallets: 214,
      entries,
    }));
    expect(archive.entries).toHaveLength(952);
    expect(archive.manifest).toMatchObject({ totalParticipants: 241, totalWallets: 214 });
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
    const database = fakeDb({
      ...archive.manifest,
      publicationStatus: 'building',
      buildId: archive.manifest.outputHash,
      writerToken: 'other-writer',
      leaseExpiresAt: '2099-01-01T00:00:00.000Z',
    });
    const repository = new MongoCompetitionRankingArchiveRepository(
      async () => database.db as never,
    );

    await expect(repository.writeSnapshot(archive)).rejects.toBeInstanceOf(
      CompetitionRankingArchiveBuildInProgressError,
    );
    expect(database.manifestCollection.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationStatus: 'building',
        $or: expect.any(Array),
      }),
      expect.objectContaining({ $set: expect.objectContaining({ writerToken: expect.any(String) }) }),
    );
    expect(database.getManifest()).toMatchObject({ writerToken: 'other-writer' });
    expect(database.getEntries()).toHaveLength(0);
  });

  it('takes over an expired build and publishes only with the new writer token', async () => {
    const archive = prepared();
    const database = fakeDb({
      ...archive.manifest,
      publicationStatus: 'building',
      buildId: archive.manifest.outputHash,
      writerToken: 'expired-writer',
      leaseExpiresAt: '1970-01-01T00:00:00.000Z',
    });
    const repository = new MongoCompetitionRankingArchiveRepository(
      async () => database.db as never,
    );

    await expect(repository.writeSnapshot(archive)).resolves.toMatchObject({ created: true });
    const stored = database.getManifest();
    expect(stored).toMatchObject({ publicationStatus: 'ready' });
    expect(stored?.writerToken).not.toBe('expired-writer');
    const publicationCall = database.manifestCollection.updateOne.mock.calls.find(
      ([, update]) => update.$set.publicationStatus === 'ready',
    );
    expect(publicationCall?.[0]).toEqual(expect.objectContaining({
      writerToken: stored?.writerToken,
      publicationStatus: 'building',
    }));
    expect(database.getEntries()).toHaveLength(2);
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

  it('defaults only a missing legacy eligibility kind to presale when reading Mongo', async () => {
    const archive = prepared();
    const { eligibilityKind: _omitted, ...legacyManifest } = archive.manifest;
    const cursor = {
      sort: jest.fn(),
      toArray: jest.fn(async () => [{ ...legacyManifest, publicationStatus: 'ready' }]),
    };
    cursor.sort.mockReturnValue(cursor);
    const repository = new MongoCompetitionRankingArchiveRepository(async () => ({
      collection: jest.fn(() => ({ find: jest.fn(() => cursor) })),
    }) as never);

    await expect(repository.listReadyManifests()).resolves.toEqual([
      expect.objectContaining({ eligibilityKind: 'presale' }),
    ]);
  });

  it('fails closed instead of publishing an unknown stored eligibility kind', async () => {
    const archive = prepared();
    const cursor = {
      sort: jest.fn(),
      toArray: jest.fn(async () => [{
        ...archive.manifest,
        eligibilityKind: 'mystery_formula',
        publicationStatus: 'ready',
      }]),
    };
    cursor.sort.mockReturnValue(cursor);
    const repository = new MongoCompetitionRankingArchiveRepository(async () => ({
      collection: jest.fn(() => ({ find: jest.fn(() => cursor) })),
    }) as never);

    await expect(repository.listReadyManifests()).rejects.toBeInstanceOf(
      CompetitionRankingArchiveCorruptError,
    );
  });
});
