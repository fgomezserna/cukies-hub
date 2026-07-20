import type { Db } from 'mongodb';

jest.mock('@/lib/indexer-db/mongodb', () => ({ getIndexerDb: jest.fn() }));

import {
  createCompetitionConfig,
  generatePrivateCompetitionAlias,
  validateCompetitionAlias,
} from '@/lib/treasure-hunt-competition';
import {
  CompetitionCampaignDriftError,
  MongoCompetitionRepository,
} from '@/lib/treasure-hunt-competition/server/mongo-repository';

const PRESALE = `0x${'9'.repeat(40)}`;
const campaign = createCompetitionConfig({
  campaignId: 'uki-presale-2026',
  rulesVersion: '1',
  presaleContractAddress: PRESALE,
  startsAt: '2026-07-10T00:00:00.000Z',
  endsAt: '2026-07-20T00:00:00.000Z',
});
const aliasSecret = 'competition-private-alias-secret-123456789';

function databaseWith(collections: Record<string, unknown>) {
  return {
    collection: jest.fn((name: string) => collections[name]),
  } as unknown as Db;
}

describe('Treasure Hunt competition persistence integrity', () => {
  it.each([
    ['2026-02-30T00:00:00.000Z', '2026-03-02T00:00:00.000Z'],
    ['2025-02-29T00:00:00Z', '2025-03-01T00:00:00Z'],
    ['2026-07-10T24:00:00.000Z', '2026-07-12T00:00:00.000Z'],
  ])('rejects an impossible campaign boundary %s', (startsAt, endsAt) => {
    expect(() => createCompetitionConfig({
      campaignId: 'impossible-date',
      rulesVersion: '1',
      presaleContractAddress: PRESALE,
      startsAt,
      endsAt,
    })).toThrow(/real calendar date/);
  });

  it('resolves the production alias secret lazily before the first participant write', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAliasSecret = process.env.TREASURE_HUNT_COMPETITION_ALIAS_SECRET;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    delete process.env.TREASURE_HUNT_COMPETITION_ALIAS_SECRET;
    const updateOne = jest.fn();
    const repository = new MongoCompetitionRepository(
      async () => databaseWith({ presale_game_participants: { updateOne } }),
    );

    expect(() => repository.assertReadyForParticipantWrites()).toThrow(
      /TREASURE_HUNT_COMPETITION_ALIAS_SECRET/,
    );
    await expect(repository.getOrCreateParticipant({
      campaignId: campaign.campaignId,
      walletAddress: '0x1111111111111111111111111111111111111111',
      generatedAlias: 'Hunter-PUBLIC',
      now: '2026-07-12T00:00:00.000Z',
    })).rejects.toThrow(/TREASURE_HUNT_COMPETITION_ALIAS_SECRET/);
    expect(updateOne).not.toHaveBeenCalled();

    Object.defineProperty(process.env, 'NODE_ENV', {
      value: previousNodeEnv,
      configurable: true,
    });
    if (previousAliasSecret === undefined) {
      delete process.env.TREASURE_HUNT_COMPETITION_ALIAS_SECRET;
    } else {
      process.env.TREASURE_HUNT_COMPETITION_ALIAS_SECRET = previousAliasSecret;
    }
  });

  it('generates a secret-bound 65-bit default alias that still validates publicly', () => {
    const input = {
      campaignId: campaign.campaignId,
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      secret: aliasSecret,
    };
    const first = generatePrivateCompetitionAlias(input);

    expect(first).toBe(generatePrivateCompetitionAlias(input));
    expect(first).not.toBe(generatePrivateCompetitionAlias({
      ...input,
      secret: 'different-private-alias-secret-123456789',
    }));
    expect(first).toMatch(/^Hunter-[A-Z2-7]{13}$/);
    expect(validateCompetitionAlias(first)).toMatchObject({ valid: true });
    expect(first.toLowerCase()).not.toContain(input.walletAddress.slice(2, 8));
  });

  it('creates a campaign once and fails closed without overwriting immutable drift', async () => {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    const findOne = jest.fn().mockResolvedValue({ ...campaign });
    const repository = new MongoCompetitionRepository(
      async () => databaseWith({ presale_game_campaigns: { updateOne, findOne } }),
      aliasSecret,
    );

    await repository.syncCampaign(campaign, '2026-07-01T00:00:00.000Z');

    expect(updateOne).toHaveBeenCalledWith(
      { campaignId: campaign.campaignId },
      {
        $setOnInsert: {
          ...campaign,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      },
      { upsert: true },
    );
    expect(updateOne.mock.calls[0]?.[1]).not.toHaveProperty('$set');

    findOne.mockResolvedValueOnce({
      ...campaign,
      presaleContractAddress: `0x${'8'.repeat(40)}`,
      endsAt: '2026-07-21T00:00:00.000Z',
      poolBps: 3_000,
    });
    await expect(repository.syncCampaign(campaign, '2026-07-02T00:00:00.000Z'))
      .rejects.toEqual(expect.objectContaining<Partial<CompetitionCampaignDriftError>>({
        name: 'CompetitionCampaignDriftError',
        fields: ['presaleContractAddress', 'endsAt', 'poolBps'],
      }));
    expect(updateOne.mock.calls[1]?.[1]).not.toHaveProperty('$set');
  });

  it('uses a private alias and retries an E11000 collision with a new nonce', async () => {
    const walletAddress = '0x1111111111111111111111111111111111111111';
    const expectedAlias = generatePrivateCompetitionAlias({
      campaignId: campaign.campaignId,
      walletAddress,
      secret: aliasSecret,
      collisionNonce: 1,
    });
    const updateOne = jest.fn()
      .mockRejectedValueOnce({ code: 11000 })
      .mockResolvedValueOnce({ acknowledged: true });
    const findOne = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        campaignId: campaign.campaignId,
        walletAddress,
        alias: expectedAlias,
        canonicalAlias: expectedAlias.toLowerCase(),
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:00:00.000Z',
      });
    const repository = new MongoCompetitionRepository(
      async () => databaseWith({ presale_game_participants: { updateOne, findOne } }),
      aliasSecret,
    );

    await expect(repository.getOrCreateParticipant({
      campaignId: campaign.campaignId,
      walletAddress,
      generatedAlias: 'Hunter-PUBLIC',
      now: '2026-07-12T00:00:00.000Z',
    })).resolves.toMatchObject({ alias: expectedAlias });

    expect(updateOne).toHaveBeenCalledTimes(2);
    expect(updateOne.mock.calls[0]?.[1].$setOnInsert.alias).not.toBe('Hunter-PUBLIC');
    expect(updateOne.mock.calls[1]?.[1].$setOnInsert.alias).toBe(expectedAlias);
  });

  it('uses an ordered MongoDB 4.4-compatible cursor for leaderboard attempts', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const cursor = {
      close,
      sort: jest.fn(),
      async *[Symbol.asyncIterator]() {
        // An empty cursor is enough here; selection limits are covered by the ranking unit tests.
      },
    };
    cursor.sort.mockReturnValue(cursor);
    const find = jest.fn().mockReturnValue(cursor);
    const repository = new MongoCompetitionRepository(
      async () => databaseWith({ presale_game_attempts: { find } }),
      aliasSecret,
    );

    await repository.listValidAttempts(campaign.campaignId, 500);

    expect(find).toHaveBeenCalledWith({
      campaignId: campaign.campaignId,
      status: { $in: ['review', 'valid'] },
    });
    expect(cursor.sort).toHaveBeenCalledWith({
      score: -1,
      gameTimeMs: 1,
      finishedAt: 1,
      attemptId: 1,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('shares one index creation promise across repository instances for the same database', async () => {
    const createIndexes = jest.fn().mockResolvedValue([]);
    const database = databaseWith({
      presale_game_campaigns: { createIndexes },
      presale_game_participants: { createIndexes },
      presale_game_attempts: { createIndexes },
    });
    const first = new MongoCompetitionRepository(async () => database, aliasSecret);
    const second = new MongoCompetitionRepository(async () => database, aliasSecret);

    await Promise.all([first.ensureIndexes(), second.ensureIndexes()]);

    expect(createIndexes).toHaveBeenCalledTimes(3);
  });

  it('caps evidence growth and keeps finish pending until an exact finalization CAS', async () => {
    const findOneAndUpdate = jest.fn()
      .mockResolvedValueOnce({ attemptId: 'attempt-1', status: 'active' })
      .mockResolvedValueOnce({ attemptId: 'attempt-1', status: 'review' });
    const repository = new MongoCompetitionRepository(
      async () => databaseWith({ presale_game_attempts: { findOneAndUpdate } }),
      aliasSecret,
    );
    const evidence = {
      sequence: 1,
      kind: 'finish' as const,
      score: 200,
      gameTimeMs: 10_000,
      clientTimestampMs: null,
      receivedAt: '2026-07-12T00:00:10.000Z',
      previousDigest: 'digest-1',
      digest: 'digest-2',
    };

    await repository.appendEvidence({
      attemptId: 'attempt-1',
      walletAddress: '0x1111111111111111111111111111111111111111',
      expectedSequence: 1,
      expectedPreviousDigest: 'digest-1',
      point: evidence,
      finishPendingAuthority: true,
    });
    expect(findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        status: 'active',
        finishPendingAuthority: { $ne: true },
        nextSequence: 1,
        lastDigest: 'digest-1',
        $expr: {
          $lt: [
            { $size: { $ifNull: ['$evidence', []] } },
            720,
          ],
        },
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ finishPendingAuthority: true }),
        $inc: { nextSequence: 1 },
        $push: { evidence },
      }),
      { returnDocument: 'after', includeResultMetadata: false },
    );

    await repository.finalizeAttemptForReview({
      attemptId: 'attempt-1',
      walletAddress: '0x1111111111111111111111111111111111111111',
      expectedSequence: 2,
      expectedPreviousDigest: 'digest-2',
      now: '2026-07-12T00:00:10.000Z',
    });
    expect(findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'active',
        finishPendingAuthority: true,
        nextSequence: 2,
        lastDigest: 'digest-2',
      }),
      {
        $set: {
          status: 'review',
          finishPendingAuthority: false,
          reviewQueuedAt: '2026-07-12T00:00:10.000Z',
          updatedAt: '2026-07-12T00:00:10.000Z',
        },
      },
      { returnDocument: 'after', includeResultMetadata: false },
    );

    await expect(repository.appendEvidence({
      attemptId: 'attempt-1',
      walletAddress: '0x1111111111111111111111111111111111111111',
      expectedSequence: 720,
      expectedPreviousDigest: 'digest-720',
      point: { ...evidence, sequence: 720 },
    })).resolves.toBeNull();
    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('never abandons an active attempt whose finish authority is pending', async () => {
    const updateMany = jest.fn().mockResolvedValue({ matchedCount: 0 });
    const repository = new MongoCompetitionRepository(
      async () => databaseWith({ presale_game_attempts: { updateMany } }),
      aliasSecret,
    );

    await repository.abandonActiveAttempts(
      campaign.campaignId,
      '0x1111111111111111111111111111111111111111',
      '2026-07-12T00:00:10.000Z',
    );

    expect(updateMany).toHaveBeenCalledWith(
      {
        campaignId: campaign.campaignId,
        walletAddress: '0x1111111111111111111111111111111111111111',
        status: 'active',
        finishPendingAuthority: { $ne: true },
      },
      {
        $set: {
          status: 'abandoned',
          finishedAt: '2026-07-12T00:00:10.000Z',
          updatedAt: '2026-07-12T00:00:10.000Z',
        },
      },
    );
  });

  it('adjudicates review with a single immutable audit CAS', async () => {
    const findOneAndUpdate = jest.fn().mockResolvedValue({
      attemptId: 'attempt-1',
      status: 'valid',
      reviewDecision: 'valid',
    });
    const repository = new MongoCompetitionRepository(
      async () => databaseWith({ presale_game_attempts: { findOneAndUpdate } }),
      aliasSecret,
    );

    await repository.adjudicateAttempt({
      campaignId: campaign.campaignId,
      attemptId: 'attempt-1',
      decision: 'valid',
      reason: 'Evidence verified',
      reviewer: 'ops@example.test',
      reviewedAt: '2026-07-12T00:01:00.000Z',
    });

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        campaignId: campaign.campaignId,
        attemptId: 'attempt-1',
        status: 'review',
        $or: [
          { reviewDecision: { $exists: false } },
          { reviewDecision: null },
        ],
      },
      {
        $set: {
          status: 'valid',
          reviewDecision: 'valid',
          reviewReason: 'Evidence verified',
          reviewedAt: '2026-07-12T00:01:00.000Z',
          reviewer: 'ops@example.test',
          updatedAt: '2026-07-12T00:01:00.000Z',
        },
      },
      { returnDocument: 'after', includeResultMetadata: false },
    );
  });
});
