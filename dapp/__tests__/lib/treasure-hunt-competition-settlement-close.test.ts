import {
  InMemoryCompetitionSettlementRepository,
  closeTreasureHuntCompetition,
  type CompetitionSettlementCloseSource,
  type SettlementAttemptRecord,
  type SettlementParticipantRecord,
  type SettlementPurchaseRecord,
} from '@/lib/treasure-hunt-competition/server/settlement-close';
import {
  createCompetitionConfig,
  type CompetitionAttempt,
} from '@/lib/treasure-hunt-competition';
import type { CompetitionRuntime } from '@/lib/treasure-hunt-competition/server/runtime';

const PLAYER_A = `0x${'1'.repeat(40)}`;
const PLAYER_B = `0x${'2'.repeat(40)}`;
const SPONSOR = `0x${'3'.repeat(40)}`;
const PRESALE = `0x${'9'.repeat(40)}`;

const campaign = createCompetitionConfig({
  campaignId: 'uki-presale-2026',
  rulesVersion: 'rules-1',
  presaleContractAddress: PRESALE,
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2026-03-31T00:00:00.000Z',
});

function runtime(phase: CompetitionRuntime['phase'] = 'closed'): CompetitionRuntime {
  return {
    configured: true,
    enabled: true,
    phase,
    campaign,
    issues: [],
  };
}

function attempt(
  attemptId: string,
  walletAddress = PLAYER_A,
  score = 1_000,
  overrides: Partial<CompetitionAttempt & { rulesVersion: string }> = {},
): SettlementAttemptRecord {
  return {
    attemptId,
    campaignId: campaign.campaignId,
    rulesVersion: campaign.rulesVersion,
    gameId: campaign.gameId,
    mode: campaign.mode,
    walletAddress,
    playerAlias: walletAddress === PLAYER_A ? 'Alpha' : 'Bravo',
    score,
    gameTimeMs: 30_000,
    startedAt: '2026-02-01T10:00:00.000Z',
    finishedAt: '2026-02-01T10:00:30.000Z',
    status: 'valid',
    ...overrides,
  };
}

class MutableSource implements CompetitionSettlementCloseSource {
  attempts: SettlementAttemptRecord[] = [];
  purchases: SettlementPurchaseRecord[] = [];
  participants: SettlementParticipantRecord[] = [];

  assertReady = jest.fn(async () => undefined);
  listAttempts = jest.fn(async () => this.attempts);
  listPurchases = jest.fn(async () => this.purchases);
  listParticipants = jest.fn(async () => this.participants);
}

describe('Treasure Hunt competition settlement close', () => {
  it.each(['unconfigured', 'disabled', 'scheduled', 'active'] as const)(
    'rejects settlement while runtime phase is %s',
    async (phase) => {
      const source = new MutableSource();

      await expect(closeTreasureHuntCompetition({
        runtime: runtime(phase),
        source,
        repository: new InMemoryCompetitionSettlementRepository(),
        now: new Date('2026-04-01T00:00:00.000Z'),
      })).rejects.toMatchObject({ code: 'competition_not_closed' });

      expect(source.listAttempts).not.toHaveBeenCalled();
      expect(source.listPurchases).not.toHaveBeenCalled();
      expect(source.assertReady).not.toHaveBeenCalled();
    },
  );

  it('uses authoritative ranking, same-window purchases and locked participant sponsors', async () => {
    const source = new MutableSource();
    source.attempts = [attempt('attempt-a')];
    source.purchases = [
      {
        eventId: 'purchase-before',
        walletAddress: PLAYER_A,
        ukiPurchasedRaw: '999999',
        confirmedAt: '2025-12-31T23:59:59.999Z',
      },
      {
        eventId: 'purchase-in-window',
        walletAddress: PLAYER_A.toUpperCase(),
        ukiPurchasedRaw: '10000',
        confirmedAt: '2026-02-15T12:00:00.000Z',
      },
      {
        eventId: 'purchase-after',
        walletAddress: PLAYER_A,
        ukiPurchasedRaw: '999999',
        confirmedAt: '2026-03-31T00:00:00.001Z',
      },
    ];
    source.participants = [{
      walletAddress: PLAYER_A,
      lockedSponsorWalletAddress: SPONSOR,
    }];

    const result = await closeTreasureHuntCompetition({
      runtime: runtime(),
      source,
      repository: new InMemoryCompetitionSettlementRepository(),
      now: new Date('2026-04-01T00:00:00.000Z'),
    });

    expect(source.listAttempts).toHaveBeenCalledWith({
      campaignId: campaign.campaignId,
      rulesVersion: campaign.rulesVersion,
      gameId: campaign.gameId,
      mode: campaign.mode,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      maxWinningAttemptsPerWallet: campaign.maxWinningAttemptsPerWallet,
    });
    expect(source.assertReady).toHaveBeenCalledWith(campaign);
    expect(source.listPurchases).toHaveBeenCalledWith({
      presaleContractAddress: campaign.presaleContractAddress,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
    });
    expect(source.listParticipants).toHaveBeenCalledWith({
      walletAddresses: [PLAYER_A],
    });
    expect(result.created).toBe(true);
    expect(result.snapshot.settlement).toMatchObject({
      totalPurchasedUkiRaw: '10000',
      poolUkiRaw: '2500',
      playerRewardsUkiRaw: '1000',
      sponsorRewardsUkiRaw: '250',
      spentUkiRaw: '1250',
      remainingUkiRaw: '1250',
    });
    expect(result.snapshot.settlement.awards).toHaveLength(1);
    expect(result.snapshot.settlement.awards[0]).toMatchObject({
      attemptId: 'attempt-a',
      walletAddress: PLAYER_A,
      sponsorWalletAddress: SPONSOR,
    });
    expect(result.snapshot.allocations).toEqual([
      expect.objectContaining({
        walletAddress: PLAYER_A,
        playerRewardUkiRaw: '1000',
        sponsorRewardUkiRaw: '0',
        totalRewardUkiRaw: '1000',
        playerAwardCount: 1,
        sponsoredAwardCount: 0,
      }),
      expect.objectContaining({
        walletAddress: SPONSOR,
        playerRewardUkiRaw: '0',
        sponsorRewardUkiRaw: '250',
        totalRewardUkiRaw: '250',
        playerAwardCount: 0,
        sponsoredAwardCount: 1,
      }),
    ]);
    expect(result.snapshot.vestingPlan).toEqual([
      expect.objectContaining({
        beneficiaryWalletAddress: PLAYER_A,
        amountUkiRaw: '1000',
        transactionStatus: 'not_submitted',
        schedule: {
          startAt: campaign.endsAt,
          cliffAt: '2026-12-31T00:00:00.000Z',
          endAt: '2027-06-30T00:00:00.000Z',
          durationSeconds: 15_638_400,
        },
      }),
      expect.objectContaining({ beneficiaryWalletAddress: SPONSOR, amountUkiRaw: '250' }),
    ]);
    expect(result.snapshot.manifest).toMatchObject({
      schemaVersion: 2,
      algorithmVersion: 'treasure-hunt-presale-v1',
      campaignId: campaign.campaignId,
      rulesVersion: campaign.rulesVersion,
      presaleContractAddress: PRESALE,
      eligibleAttemptCount: 1,
      purchaseEventCount: 1,
      participantCount: 1,
      rankedAttemptCount: 1,
    });
    expect(result.snapshot.manifest.inputHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.snapshot.manifest.outputHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is idempotent for the same campaign/rules input and preserves the original snapshot', async () => {
    const source = new MutableSource();
    source.attempts = [attempt('attempt-a'), attempt('attempt-b', PLAYER_A, 900)];
    source.purchases = [
      {
        eventId: 'purchase-a',
        walletAddress: PLAYER_A,
        ukiPurchasedRaw: '10000',
        confirmedAt: '2026-02-01T00:00:00.000Z',
      },
      {
        eventId: 'purchase-b',
        walletAddress: PLAYER_A,
        ukiPurchasedRaw: '5000',
        confirmedAt: '2026-02-02T00:00:00.000Z',
      },
    ];
    source.participants = [{ walletAddress: PLAYER_A, lockedSponsorWalletAddress: null }];
    const repository = new InMemoryCompetitionSettlementRepository();
    const prepareSource = jest.fn(async () => undefined);

    const first = await closeTreasureHuntCompetition({
      runtime: runtime(),
      source,
      repository,
      prepareSource,
      now: new Date('2026-04-01T00:00:00.000Z'),
    });
    const sourceCallCounts = {
      assertReady: source.assertReady.mock.calls.length,
      attempts: source.listAttempts.mock.calls.length,
      purchases: source.listPurchases.mock.calls.length,
      participants: source.listParticipants.mock.calls.length,
    };
    source.attempts.reverse();
    source.purchases.reverse();
    const replay = await closeTreasureHuntCompetition({
      runtime: runtime(),
      source,
      repository,
      prepareSource,
      now: new Date('2026-04-02T00:00:00.000Z'),
    });

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.snapshot).toEqual(first.snapshot);
    expect(replay.snapshot.createdAt).toBe('2026-04-01T00:00:00.000Z');
    expect(await repository.find(campaign.campaignId, campaign.rulesVersion)).toEqual(first.snapshot);
    expect(source.assertReady).toHaveBeenCalledTimes(sourceCallCounts.assertReady);
    expect(source.listAttempts).toHaveBeenCalledTimes(sourceCallCounts.attempts);
    expect(source.listPurchases).toHaveBeenCalledTimes(sourceCallCounts.purchases);
    expect(source.listParticipants).toHaveBeenCalledTimes(sourceCallCounts.participants);
    expect(prepareSource).toHaveBeenCalledTimes(1);
  });

  it('returns the verified durable snapshot before rereading a changed source', async () => {
    const source = new MutableSource();
    source.attempts = [attempt('attempt-a')];
    source.purchases = [{
      eventId: 'purchase-a',
      walletAddress: PLAYER_A,
      ukiPurchasedRaw: '10000',
      confirmedAt: '2026-02-01T00:00:00.000Z',
    }];
    source.participants = [{ walletAddress: PLAYER_A, lockedSponsorWalletAddress: null }];
    const repository = new InMemoryCompetitionSettlementRepository();
    const first = await closeTreasureHuntCompetition({
      runtime: runtime(),
      source,
      repository,
      now: new Date('2026-04-01T00:00:00.000Z'),
    });

    source.purchases[0] = { ...source.purchases[0], ukiPurchasedRaw: '20000' };
    const replay = await closeTreasureHuntCompetition({
      runtime: runtime(),
      source,
      repository,
      now: new Date('2026-04-02T00:00:00.000Z'),
    });

    expect(replay).toEqual({ created: false, snapshot: first.snapshot });
    expect(await repository.find(campaign.campaignId, campaign.rulesVersion)).toEqual(first.snapshot);
    expect(source.listPurchases).toHaveBeenCalledTimes(1);
  });

  it('rejects a durable snapshot if the immutable presale contract changes', async () => {
    const source = new MutableSource();
    source.attempts = [attempt('attempt-a')];
    source.purchases = [{
      eventId: 'purchase-a',
      walletAddress: PLAYER_A,
      ukiPurchasedRaw: '10000',
      confirmedAt: '2026-02-01T00:00:00.000Z',
    }];
    source.participants = [{ walletAddress: PLAYER_A, lockedSponsorWalletAddress: null }];
    const repository = new InMemoryCompetitionSettlementRepository();
    await closeTreasureHuntCompetition({
      runtime: runtime(),
      source,
      repository,
      now: new Date('2026-04-01T00:00:00.000Z'),
    });

    await expect(closeTreasureHuntCompetition({
      runtime: {
        ...runtime(),
        campaign: { ...campaign, presaleContractAddress: `0x${'8'.repeat(40)}` },
      },
      source,
      repository,
      now: new Date('2026-04-02T00:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'settlement_input_conflict' });
    expect(source.listPurchases).toHaveBeenCalledTimes(1);
  });

  it('rejects a persisted snapshot whose declared output no longer matches its contents', async () => {
    const source = new MutableSource();
    source.attempts = [attempt('attempt-a')];
    source.purchases = [{
      eventId: 'purchase-a',
      walletAddress: PLAYER_A,
      ukiPurchasedRaw: '10000',
      confirmedAt: '2026-02-01T00:00:00.000Z',
    }];
    source.participants = [{ walletAddress: PLAYER_A, lockedSponsorWalletAddress: null }];
    let stored: Awaited<ReturnType<typeof closeTreasureHuntCompetition>>['snapshot'] | null = null;
    let corruptOnRead = false;
    const repository = {
      find: jest.fn(async () => (
        stored && corruptOnRead
          ? { ...stored, settlement: { ...stored.settlement, spentUkiRaw: '999' } }
          : stored
      )),
      saveIfAbsent: jest.fn(async (candidate: NonNullable<typeof stored>) => {
        if (!stored) {
          stored = candidate;
          return { created: true, snapshot: candidate };
        }
        return { created: false, snapshot: stored };
      }),
    };

    await closeTreasureHuntCompetition({
      runtime: runtime(), source, repository, now: new Date('2026-04-01T00:00:00.000Z'),
    });
    corruptOnRead = true;
    await expect(closeTreasureHuntCompetition({
      runtime: runtime(), source, repository, now: new Date('2026-04-02T00:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'settlement_input_conflict' });
  });

  it('rejects a malformed adjudicated attempt even when it would fall below the wallet top five', async () => {
    const source = new MutableSource();
    source.attempts = [
      attempt('attempt-1', PLAYER_A, 1_000),
      attempt('attempt-2', PLAYER_A, 900),
      attempt('attempt-3', PLAYER_A, 800),
      attempt('attempt-4', PLAYER_A, 700),
      attempt('attempt-5', PLAYER_A, 600),
      attempt('malformed-below-top-five', PLAYER_A, 1, { gameTimeMs: 1.5 }),
    ];
    source.purchases = [{
      eventId: 'purchase-a',
      walletAddress: PLAYER_A,
      ukiPurchasedRaw: '10000',
      confirmedAt: '2026-02-01T00:00:00.000Z',
    }];

    await expect(closeTreasureHuntCompetition({
      runtime: runtime(),
      source,
      repository: new InMemoryCompetitionSettlementRepository(),
      now: new Date('2026-04-01T00:00:00.000Z'),
    })).rejects.toMatchObject({
      code: 'invalid_settlement_input',
      message: 'Attempt malformed-below-top-five has an invalid game time',
    });
  });

  it('aggregates player and sponsor rewards into one vesting allocation per wallet', async () => {
    const source = new MutableSource();
    source.attempts = [
      attempt('a-1', PLAYER_A, 3_000),
      attempt('b-1', PLAYER_B, 2_000),
      attempt('a-2', PLAYER_A, 1_000),
    ];
    source.purchases = [
      {
        eventId: 'purchase-a',
        walletAddress: PLAYER_A,
        ukiPurchasedRaw: '10000',
        confirmedAt: '2026-02-01T00:00:00.000Z',
      },
      {
        eventId: 'purchase-b',
        walletAddress: PLAYER_B,
        ukiPurchasedRaw: '20000',
        confirmedAt: '2026-02-01T00:00:01.000Z',
      },
    ];
    source.participants = [
      { walletAddress: PLAYER_A, lockedSponsorWalletAddress: SPONSOR },
      { walletAddress: PLAYER_B, lockedSponsorWalletAddress: PLAYER_A },
    ];

    const result = await closeTreasureHuntCompetition({
      runtime: runtime(),
      source,
      repository: new InMemoryCompetitionSettlementRepository(),
      now: new Date('2026-04-01T00:00:00.000Z'),
    });

    expect(result.snapshot.allocations).toEqual([
      expect.objectContaining({
        walletAddress: PLAYER_A,
        playerRewardUkiRaw: '2000',
        sponsorRewardUkiRaw: '500',
        totalRewardUkiRaw: '2500',
        playerAwardCount: 2,
        sponsoredAwardCount: 1,
      }),
      expect.objectContaining({
        walletAddress: PLAYER_B,
        playerRewardUkiRaw: '2000',
        sponsorRewardUkiRaw: '0',
        totalRewardUkiRaw: '2000',
        playerAwardCount: 1,
        sponsoredAwardCount: 0,
      }),
      expect.objectContaining({
        walletAddress: SPONSOR,
        playerRewardUkiRaw: '0',
        sponsorRewardUkiRaw: '500',
        totalRewardUkiRaw: '500',
        playerAwardCount: 0,
        sponsoredAwardCount: 2,
      }),
    ]);
    expect(result.snapshot.vestingPlan).toHaveLength(3);
  });

  it('rejects duplicate purchase event ids before calculating the pool', async () => {
    const source = new MutableSource();
    source.attempts = [attempt('attempt-a')];
    source.purchases = [
      {
        eventId: 'same-event',
        walletAddress: PLAYER_A,
        ukiPurchasedRaw: '10000',
        confirmedAt: '2026-02-01T00:00:00.000Z',
      },
      {
        eventId: 'same-event',
        walletAddress: PLAYER_A,
        ukiPurchasedRaw: '10000',
        confirmedAt: '2026-02-01T00:00:00.000Z',
      },
    ];

    await expect(closeTreasureHuntCompetition({
      runtime: runtime(),
      source,
      repository: new InMemoryCompetitionSettlementRepository(),
      now: new Date('2026-04-01T00:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'invalid_settlement_input' });
  });

  it('rejects invalid locked sponsor attribution instead of silently changing rewards', async () => {
    const source = new MutableSource();
    source.attempts = [attempt('attempt-a')];
    source.purchases = [{
      eventId: 'purchase-a',
      walletAddress: PLAYER_A,
      ukiPurchasedRaw: '10000',
      confirmedAt: '2026-02-01T00:00:00.000Z',
    }];
    source.participants = [{
      walletAddress: PLAYER_A,
      lockedSponsorWalletAddress: PLAYER_A,
    }];

    await expect(closeTreasureHuntCompetition({
      runtime: runtime(),
      source,
      repository: new InMemoryCompetitionSettlementRepository(),
      now: new Date('2026-04-01T00:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'invalid_settlement_input' });
  });

  it('blocks economic settlement while a purchased wallet has a top-five attempt in review', async () => {
    const source = new MutableSource();
    source.attempts = [attempt('pending-review', PLAYER_A, 1_000, { status: 'review' })];
    source.purchases = [{
      eventId: 'purchase-a',
      walletAddress: PLAYER_A,
      ukiPurchasedRaw: '10000',
      confirmedAt: '2026-02-01T00:00:00.000Z',
    }];
    source.participants = [{ walletAddress: PLAYER_A, lockedSponsorWalletAddress: null }];

    await expect(closeTreasureHuntCompetition({
      runtime: runtime(),
      source,
      repository: new InMemoryCompetitionSettlementRepository(),
      now: new Date('2026-04-01T00:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'settlement_source_not_ready' });

    source.attempts = [{ ...source.attempts[0], status: 'valid' }];
    await expect(closeTreasureHuntCompetition({
      runtime: runtime(),
      source,
      repository: new InMemoryCompetitionSettlementRepository(),
      now: new Date('2026-04-01T00:00:00.000Z'),
    })).resolves.toMatchObject({
      snapshot: { settlement: { awards: [expect.objectContaining({ attemptId: 'pending-review' })] } },
    });
  });

  it.each([
    {
      label: 'missing buyer participant',
      participants: [] as SettlementParticipantRecord[],
      message: `Missing presale participant for ${PLAYER_A}`,
    },
    {
      label: 'duplicate buyer participant',
      participants: [
        { walletAddress: PLAYER_A, lockedSponsorWalletAddress: null },
        { walletAddress: PLAYER_A, lockedSponsorWalletAddress: null },
      ],
      message: `Duplicate presale participant for ${PLAYER_A}`,
    },
    {
      label: 'unexpected participant outside the requested buyers',
      participants: [
        { walletAddress: PLAYER_A, lockedSponsorWalletAddress: null },
        { walletAddress: PLAYER_B, lockedSponsorWalletAddress: null },
      ],
      message: `Unexpected presale participant for ${PLAYER_B}`,
    },
  ])('rejects $label', async ({ participants, message }) => {
    const source = new MutableSource();
    source.attempts = [attempt('attempt-a')];
    source.purchases = [{
      eventId: 'purchase-a',
      walletAddress: PLAYER_A,
      ukiPurchasedRaw: '10000',
      confirmedAt: '2026-02-01T00:00:00.000Z',
    }];
    source.participants = participants;

    await expect(closeTreasureHuntCompetition({
      runtime: runtime(),
      source,
      repository: new InMemoryCompetitionSettlementRepository(),
      now: new Date('2026-04-01T00:00:00.000Z'),
    })).rejects.toMatchObject({
      code: 'invalid_settlement_input',
      message,
    });
  });

  it('keeps concurrent identical closes atomic and creates one snapshot', async () => {
    const source = new MutableSource();
    source.attempts = [attempt('attempt-a')];
    source.purchases = [{
      eventId: 'purchase-a',
      walletAddress: PLAYER_A,
      ukiPurchasedRaw: '10000',
      confirmedAt: '2026-02-01T00:00:00.000Z',
    }];
    source.participants = [{ walletAddress: PLAYER_A, lockedSponsorWalletAddress: null }];
    const repository = new InMemoryCompetitionSettlementRepository();

    const results = await Promise.all([
      closeTreasureHuntCompetition({
        runtime: runtime(), source, repository, now: new Date('2026-04-01T00:00:00.000Z'),
      }),
      closeTreasureHuntCompetition({
        runtime: runtime(), source, repository, now: new Date('2026-04-01T00:00:00.000Z'),
      }),
    ]);

    expect(results.map((result) => result.created).sort()).toEqual([false, true]);
    expect(results[0].snapshot).toEqual(results[1].snapshot);
  });
});
