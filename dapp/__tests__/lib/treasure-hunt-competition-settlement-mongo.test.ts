import type { Db } from 'mongodb';

jest.mock('@/lib/indexer-db/mongodb', () => ({ getIndexerDb: jest.fn() }));

import type { CompetitionSettlementSnapshot } from '@/lib/treasure-hunt-competition/server/settlement-close';
import { createCompetitionConfig } from '@/lib/treasure-hunt-competition';
import {
  MongoCompetitionSettlementRepository,
  MongoCompetitionSettlementSource,
} from '@/lib/treasure-hunt-competition/server/settlement-mongo';

const PLAYER = `0x${'1'.repeat(40)}`;
const SPONSOR = `0x${'2'.repeat(40)}`;
const PRESALE = `0x${'9'.repeat(40)}`;
const campaign = createCompetitionConfig({
  campaignId: 'uki-presale-2026',
  rulesVersion: 'rules-1',
  presaleContractAddress: PRESALE,
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2026-03-31T00:00:00.000Z',
});

function cursor(rows: readonly unknown[]) {
  const value = {
    project: jest.fn(),
    toArray: jest.fn(async () => rows),
  };
  value.project.mockReturnValue(value);
  return value;
}

function databaseWith(collections: Record<string, unknown>) {
  return {
    collection: jest.fn((name: string) => collections[name]),
  } as unknown as Db;
}

function snapshot(inputHash = 'sha256:original') {
  return {
    campaignId: 'uki-presale-2026',
    rulesVersion: 'rules-1',
    createdAt: '2026-04-01T00:00:00.000Z',
    manifest: {
      schemaVersion: 2,
      algorithmVersion: 'treasure-hunt-presale-v1',
      campaignId: 'uki-presale-2026',
      rulesVersion: 'rules-1',
      presaleContractAddress: PRESALE,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-03-31T00:00:00.000Z',
      inputHash,
      outputHash: 'sha256:output',
      attemptsHash: 'sha256:attempts',
      purchasesHash: 'sha256:purchases',
      participantsHash: 'sha256:participants',
      attemptRecordCount: 0,
      eligibleAttemptCount: 0,
      rankedAttemptCount: 0,
      purchaseEventCount: 0,
      participantCount: 0,
    },
    settlement: {
      campaignId: 'uki-presale-2026',
      totalPurchasedUkiRaw: '0',
      poolUkiRaw: '0',
      playerPoolUkiRaw: '0',
      sponsorPoolUkiRaw: '0',
      playerRewardsUkiRaw: '0',
      sponsorRewardsUkiRaw: '0',
      spentUkiRaw: '0',
      remainingUkiRaw: '0',
      roundingDustUkiRaw: '0',
      awards: [],
      skipped: [],
    },
    allocations: [],
    vestingPlan: [],
  } satisfies CompetitionSettlementSnapshot;
}

describe('Treasure Hunt competition Mongo settlement wiring', () => {
  it('reduces unlimited attempts to the top five per wallet before materializing them', async () => {
    const rows = [{
      _id: 'mongo-id',
      attemptId: 'attempt-1',
      campaignId: 'uki-presale-2026',
      rulesVersion: 'rules-1',
      gameId: 'treasure-hunt',
      mode: 'presale_competition',
      walletAddress: PLAYER,
      playerAlias: 'Alpha',
      score: 123,
      gameTimeMs: 30_000,
      startedAt: '2026-02-01T00:00:00.000Z',
      finishedAt: '2026-02-01T00:00:30.000Z',
      status: 'valid',
      evidence: [{ shouldNotLeak: true }],
    }];
    const attemptsCursor = { toArray: jest.fn(async () => rows) };
    const aggregate = jest.fn((_pipeline: unknown[], _options: unknown) => attemptsCursor);
    const source = new MongoCompetitionSettlementSource(async () => databaseWith({
      presale_game_attempts: { aggregate },
    }));

    await expect(source.listAttempts({
      campaignId: campaign.campaignId,
      rulesVersion: campaign.rulesVersion,
      gameId: campaign.gameId,
      mode: campaign.mode,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      maxWinningAttemptsPerWallet: campaign.maxWinningAttemptsPerWallet,
    })).resolves.toEqual([{
      attemptId: 'attempt-1',
      campaignId: 'uki-presale-2026',
      rulesVersion: 'rules-1',
      gameId: 'treasure-hunt',
      mode: 'presale_competition',
      walletAddress: PLAYER,
      playerAlias: 'Alpha',
      score: 123,
      gameTimeMs: 30_000,
      startedAt: '2026-02-01T00:00:00.000Z',
      finishedAt: '2026-02-01T00:00:30.000Z',
      status: 'valid',
    }]);

    const [pipeline, options] = aggregate.mock.calls[0];
    expect(pipeline[0]).toEqual(expect.objectContaining({
      $match: expect.objectContaining({ status: { $in: ['review', 'valid'] } }),
    }));
    expect(pipeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        $setWindowFields: expect.objectContaining({
          partitionBy: '$__normalizedWallet',
        }),
      }),
      { $match: { __walletRank: { $lte: 5 } } },
      expect.objectContaining({
        $lookup: expect.objectContaining({ from: 'presale_game_participants' }),
      }),
      { $project: expect.objectContaining({ _id: 0, attemptId: 1, rulesVersion: 1 }) },
    ]));
    expect(options).toEqual({ allowDiskUse: true });
  });

  it('requires the immutable campaign, a post-close BSC watermark and no pending purchases', async () => {
    const campaignFindOne = jest.fn().mockResolvedValue({ ...campaign });
    const cursorFindOne = jest.fn().mockResolvedValue({
      processedFromBlock: 100,
      processedFromTimestampMs: Date.parse(campaign.startsAt) - 3_000,
      processedThroughBlock: 123,
      processedThroughTimestampMs: Date.parse(campaign.endsAt) + 3_000,
    });
    const eventFindOne = jest.fn().mockResolvedValue(null);
    const attemptUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
    const attemptFindOne = jest.fn().mockResolvedValue(null);
    const source = new MongoCompetitionSettlementSource(async () => databaseWith({
      presale_game_campaigns: { findOne: campaignFindOne },
      chain_cursors: { findOne: cursorFindOne },
      chain_events: { findOne: eventFindOne },
      presale_game_attempts: { updateMany: attemptUpdateMany, findOne: attemptFindOne },
    }));

    await expect(source.assertReady(campaign)).resolves.toBeUndefined();
    expect(cursorFindOne).toHaveBeenCalledWith({
      chain: 'BSC',
      contractAlias: 'PRESALE',
      contractAddress: { $regex: `^${PRESALE}$`, $options: 'i' },
      eventName: 'Purchased',
    });
    expect(eventFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: { $regex: `^${PRESALE}$`, $options: 'i' },
        timestampMs: {
          $gte: Date.parse(campaign.startsAt),
          $lte: Date.parse(campaign.endsAt),
        },
        status: { $ne: 'projected' },
      }),
      { projection: { _id: 1 } },
    );
    expect(attemptUpdateMany).toHaveBeenCalledWith(
      {
        campaignId: campaign.campaignId,
        status: 'active',
        finishPendingAuthority: { $ne: true },
      },
      { $set: expect.objectContaining({ status: 'abandoned' }) },
    );
    expect(attemptFindOne).toHaveBeenCalledWith(
      {
        campaignId: campaign.campaignId,
        status: 'active',
        finishPendingAuthority: true,
      },
      { projection: { _id: 1 } },
    );
  });

  it('fails closed while the indexer watermark has not passed the campaign end', async () => {
    const source = new MongoCompetitionSettlementSource(async () => databaseWith({
      presale_game_campaigns: { findOne: jest.fn().mockResolvedValue({ ...campaign }) },
      chain_cursors: { findOne: jest.fn().mockResolvedValue({
        processedFromBlock: 100,
        processedFromTimestampMs: Date.parse(campaign.startsAt) - 3_000,
        processedThroughBlock: 123,
        processedThroughTimestampMs: Date.parse(campaign.endsAt),
      }) },
      chain_events: { findOne: jest.fn().mockResolvedValue(null) },
      presale_game_attempts: { updateMany: jest.fn(), findOne: jest.fn() },
    }));

    await expect(source.assertReady(campaign)).rejects.toMatchObject({
      code: 'settlement_source_not_ready',
    });
  });

  it('fails closed when indexer coverage starts after the campaign window', async () => {
    const source = new MongoCompetitionSettlementSource(async () => databaseWith({
      presale_game_campaigns: { findOne: jest.fn().mockResolvedValue({ ...campaign }) },
      chain_cursors: { findOne: jest.fn().mockResolvedValue({
        processedFromBlock: 120,
        processedFromTimestampMs: Date.parse(campaign.startsAt) + 1,
        processedThroughBlock: 124,
        processedThroughTimestampMs: Date.parse(campaign.endsAt) + 3_000,
      }) },
      chain_events: { findOne: jest.fn().mockResolvedValue(null) },
      presale_game_attempts: { updateMany: jest.fn(), findOne: jest.fn() },
    }));

    await expect(source.assertReady(campaign)).rejects.toMatchObject({
      code: 'settlement_source_not_ready',
    });
  });

  it('rejects environment drift from the immutable stored campaign', async () => {
    const source = new MongoCompetitionSettlementSource(async () => databaseWith({
      presale_game_campaigns: { findOne: jest.fn().mockResolvedValue({
        ...campaign,
        endsAt: '2026-04-01T00:00:00.000Z',
      }) },
      chain_cursors: { findOne: jest.fn() },
      chain_events: { findOne: jest.fn() },
      presale_game_attempts: { updateMany: jest.fn(), findOne: jest.fn() },
    }));

    await expect(source.assertReady(campaign)).rejects.toMatchObject({
      code: 'settlement_input_conflict',
    });
  });

  it('fails closed when a purchase in the campaign window is not projected', async () => {
    const source = new MongoCompetitionSettlementSource(async () => databaseWith({
      presale_game_campaigns: { findOne: jest.fn().mockResolvedValue({ ...campaign }) },
      chain_cursors: { findOne: jest.fn().mockResolvedValue({
        processedFromBlock: 100,
        processedFromTimestampMs: Date.parse(campaign.startsAt) - 3_000,
        processedThroughBlock: 124,
        processedThroughTimestampMs: Date.parse(campaign.endsAt) + 3_000,
      }) },
      chain_events: { findOne: jest.fn().mockResolvedValue({ _id: 'pending-purchase' }) },
      presale_game_attempts: { updateMany: jest.fn(), findOne: jest.fn() },
    }));

    await expect(source.assertReady(campaign)).rejects.toMatchObject({
      code: 'settlement_source_not_ready',
    });
  });

  it('rejects any malformed adjudicated attempt before fencing or top-five reduction', async () => {
    const attemptFindOne = jest.fn().mockResolvedValue({ attemptId: 'broken-attempt' });
    const attemptUpdateMany = jest.fn();
    const source = new MongoCompetitionSettlementSource(async () => databaseWith({
      presale_game_campaigns: { findOne: jest.fn().mockResolvedValue({ ...campaign }) },
      chain_cursors: { findOne: jest.fn().mockResolvedValue({
        processedFromBlock: 100,
        processedFromTimestampMs: Date.parse(campaign.startsAt) - 3_000,
        processedThroughBlock: 124,
        processedThroughTimestampMs: Date.parse(campaign.endsAt) + 3_000,
      }) },
      chain_events: { findOne: jest.fn().mockResolvedValue(null) },
      presale_game_attempts: { updateMany: attemptUpdateMany, findOne: attemptFindOne },
    }));

    await expect(source.assertReady(campaign)).rejects.toMatchObject({
      code: 'invalid_settlement_input',
      message: 'Malformed adjudicated attempt: broken-attempt',
    });
    expect(attemptFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: campaign.campaignId,
        status: { $in: ['review', 'valid'] },
        $nor: [expect.objectContaining({ rulesVersion: campaign.rulesVersion })],
      }),
      { projection: { _id: 0, attemptId: 1 } },
    );
    expect(attemptUpdateMany).not.toHaveBeenCalled();
  });

  it('fences unfinished attempts but blocks while a durable finish still needs recovery', async () => {
    const attemptUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 2 });
    const source = new MongoCompetitionSettlementSource(async () => databaseWith({
      presale_game_campaigns: { findOne: jest.fn().mockResolvedValue({ ...campaign }) },
      chain_cursors: { findOne: jest.fn().mockResolvedValue({
        processedFromBlock: 100,
        processedFromTimestampMs: Date.parse(campaign.startsAt) - 3_000,
        processedThroughBlock: 124,
        processedThroughTimestampMs: Date.parse(campaign.endsAt) + 3_000,
      }) },
      chain_events: { findOne: jest.fn().mockResolvedValue(null) },
      presale_game_attempts: {
        updateMany: attemptUpdateMany,
        findOne: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ _id: 'pending-finish' }),
      },
    }));

    await expect(source.assertReady(campaign)).rejects.toMatchObject({
      code: 'settlement_source_not_ready',
    });
    expect(attemptUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('queries confirmed purchases with inclusive Date boundaries and maps raw audit fields', async () => {
    const confirmedAt = new Date('2026-02-15T12:00:00.000Z');
    const purchasesCursor = cursor([{
      eventId: 'bsc:0xabc:1',
      buyerWalletAddress: PLAYER,
      ukiAmountRaw: '1000000000000000000',
      confirmedAt,
      txHash: 'must-not-leak',
    }]);
    const find = jest.fn(() => purchasesCursor);
    const source = new MongoCompetitionSettlementSource(async () => databaseWith({
      presale_purchases: { find },
    }));

    await expect(source.listPurchases({
      presaleContractAddress: PRESALE,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-03-31T00:00:00.000Z',
    })).resolves.toEqual([{
      eventId: 'bsc:0xabc:1',
      walletAddress: PLAYER,
      ukiPurchasedRaw: '1000000000000000000',
      confirmedAt: confirmedAt.toISOString(),
    }]);

    expect(find).toHaveBeenCalledWith({
      contractAddress: { $regex: `^${PRESALE}$`, $options: 'i' },
      confirmedAt: {
        $gte: new Date('2026-01-01T00:00:00.000Z'),
        $lte: new Date('2026-03-31T00:00:00.000Z'),
      },
    });
    expect(purchasesCursor.project).toHaveBeenCalledWith({
      _id: 0,
      eventId: 1,
      buyerWalletAddress: 1,
      ukiAmountRaw: 1,
      confirmedAt: 1,
    });
  });

  it('loads exactly the purchased wallets through normalizedWalletAddress', async () => {
    const participantsCursor = cursor([{
      normalizedWalletAddress: PLAYER,
      lockedSponsorWalletAddress: SPONSOR,
      pendingSponsorWalletAddress: `0x${'9'.repeat(40)}`,
    }]);
    const find = jest.fn(() => participantsCursor);
    const source = new MongoCompetitionSettlementSource(async () => databaseWith({
      presale_participants: { find },
    }));

    await expect(source.listParticipants({
      walletAddresses: [PLAYER.toUpperCase(), PLAYER],
    })).resolves.toEqual([{
      walletAddress: PLAYER,
      lockedSponsorWalletAddress: SPONSOR,
    }]);

    expect(find).toHaveBeenCalledWith({ normalizedWalletAddress: { $in: [PLAYER] } });
    expect(participantsCursor.project).toHaveBeenCalledWith({
      _id: 0,
      normalizedWalletAddress: 1,
      lockedSponsorWalletAddress: 1,
    });
  });

  it('creates a unique campaign/rules index and atomically stores a new snapshot', async () => {
    const createIndex = jest.fn().mockResolvedValue('uniq_campaign_rules');
    const insertOne = jest.fn().mockResolvedValue({ acknowledged: true });
    const collection = { createIndex, insertOne, findOne: jest.fn() };
    const repository = new MongoCompetitionSettlementRepository(
      async () => databaseWith({ presale_game_settlements: collection }),
    );
    const candidate = snapshot();

    await expect(repository.saveIfAbsent(candidate)).resolves.toEqual({
      created: true,
      snapshot: candidate,
    });

    expect(createIndex).toHaveBeenCalledWith(
      { campaignId: 1, rulesVersion: 1 },
      { unique: true, name: 'uniq_presale_game_settlement_campaign_rules' },
    );
    expect(insertOne).toHaveBeenCalledTimes(1);
  });

  it('handles an E11000 race by reading back and returning the durable original', async () => {
    const original = snapshot('sha256:first-writer');
    const candidate = snapshot('sha256:racing-writer');
    const collection = {
      createIndex: jest.fn().mockResolvedValue('uniq_campaign_rules'),
      insertOne: jest.fn().mockRejectedValue({ code: 11000 }),
      findOne: jest.fn().mockResolvedValue({ _id: 'mongo-id', ...original }),
    };
    const repository = new MongoCompetitionSettlementRepository(
      async () => databaseWith({ presale_game_settlements: collection }),
    );

    await expect(repository.saveIfAbsent(candidate)).resolves.toEqual({
      created: false,
      snapshot: original,
    });
    expect(collection.findOne).toHaveBeenCalledWith(
      { campaignId: candidate.campaignId, rulesVersion: candidate.rulesVersion },
      { projection: { _id: 0 } },
    );
  });
});
