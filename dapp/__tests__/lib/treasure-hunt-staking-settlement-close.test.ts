import {
  createCompetitionConfig,
  generateCompetitionAlias,
  type CompetitionAttemptStatus,
} from '@/lib/treasure-hunt-competition';
import type { CompetitionRuntime } from '@/lib/treasure-hunt-competition/server/runtime';
import {
  closeTreasureHuntStakingCompetition,
  InMemoryCompetitionStakingSettlementRepository,
  type CompetitionStakingSettlementCloseSource,
} from '@/lib/treasure-hunt-competition/server/staking-settlement-close';
import type { SettlementAttemptRecord } from '@/lib/treasure-hunt-competition/server/settlement-close';

const campaign = createCompetitionConfig({
  campaignId: 'uki-staking-testnet-2026-08',
  rulesVersion: '1',
  eligibilityKind: 'uki_staking',
  stakingContractAddress: `0x${'8'.repeat(40)}`,
  stakingChainId: 97,
  startsAt: '2026-08-26T00:00:00.000Z',
  endsAt: '2026-09-15T15:00:00.000Z',
});
const runtime: CompetitionRuntime = {
  configured: true,
  enabled: true,
  phase: 'closed',
  campaign,
  issues: [],
};
const now = new Date('2026-09-16T12:00:00.000Z');
const drawSeed = `0x${'b2'.repeat(32)}`;

function wallet(index: number) {
  return `0x${index.toString(16).padStart(40, '0')}`;
}

function attempt(
  id: string,
  walletAddress: string,
  score: number,
  status: CompetitionAttemptStatus = 'valid',
): SettlementAttemptRecord {
  return {
    attemptId: id,
    campaignId: campaign.campaignId,
    rulesVersion: campaign.rulesVersion,
    gameId: campaign.gameId,
    mode: campaign.mode,
    walletAddress,
    playerAlias: generateCompetitionAlias(walletAddress),
    score,
    gameTimeMs: 30_000,
    startedAt: '2026-08-27T12:00:00.000Z',
    finishedAt: '2026-08-27T12:00:30.000Z',
    status,
  };
}

function source(options: {
  attempts?: readonly SettlementAttemptRecord[];
  disqualified?: readonly string[];
} = {}): CompetitionStakingSettlementCloseSource {
  return {
    assertReady: jest.fn(async () => undefined),
    listAttempts: jest.fn(async () => options.attempts ?? []),
    getCloseState: jest.fn(async () => ({
      totalStakedUkiRaw: '100000000000000000000000',
      totalStakedSourceBlock: 129_999_990,
      totalStakedSourceBlockHash: `0x${'a'.repeat(64)}`,
      totalStakedSourceEventId: 'event-at-close',
      indexedThroughBlock: 130_000_000,
      indexedAt: '2026-09-16T11:59:30.000Z',
      disqualifiedWalletAddresses: options.disqualified ?? [],
    })),
  };
}

describe('Treasure Hunt staking settlement close', () => {
  it('persists one auditable weighted draw and creates 9+6 vesting plans', async () => {
    const attempts = Array.from({ length: 7 }, (_, index) => (
      attempt(`attempt-${index + 1}`, wallet(index + 1), 1_000 + index * 100)
    ));
    const disqualified = wallet(7);
    const repository = new InMemoryCompetitionStakingSettlementRepository();
    const settlementSource = source({ attempts, disqualified: [disqualified] });

    const result = await closeTreasureHuntStakingCompetition({
      runtime,
      source: settlementSource,
      repository,
      drawSeed,
      now,
    });

    expect(result.created).toBe(true);
    expect(result.snapshot.draw.winnerCount).toBe(6);
    expect(result.snapshot.draw.winners).not.toContainEqual(
      expect.objectContaining({ walletAddress: disqualified }),
    );
    expect(result.snapshot.vestingPlan).toHaveLength(6);
    expect(result.snapshot.vestingPlan[0]).toMatchObject({
      amountUkiRaw: '10000000000000000000000',
      transactionStatus: 'not_submitted',
      schedule: {
        startAt: campaign.endsAt,
        cliffAt: '2027-06-15T15:00:00.000Z',
        endAt: '2027-12-15T15:00:00.000Z',
      },
    });
    expect(result.snapshot.inputHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.snapshot.outputHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const replaySource = source({ attempts: [attempt('different', wallet(20), 999_999)] });
    const replay = await closeTreasureHuntStakingCompetition({
      runtime,
      source: replaySource,
      repository,
      drawSeed: `0x${'c3'.repeat(32)}`,
      now: new Date('2026-09-17T12:00:00.000Z'),
    });
    expect(replay.created).toBe(false);
    expect(replay.snapshot).toEqual(result.snapshot);
    expect(replaySource.assertReady).not.toHaveBeenCalled();
  });

  it('blocks close while a potentially ranked eligible attempt awaits review', async () => {
    await expect(closeTreasureHuntStakingCompetition({
      runtime,
      source: source({
        attempts: [attempt('pending-review', wallet(1), 10_000, 'review')],
      }),
      repository: new InMemoryCompetitionStakingSettlementRepository(),
      drawSeed,
      now,
    })).rejects.toMatchObject({ code: 'settlement_source_not_ready' });
  });

  it('does not let a disqualified review attempt block settlement', async () => {
    const disqualified = wallet(1);
    await expect(closeTreasureHuntStakingCompetition({
      runtime,
      source: source({
        attempts: [attempt('pending-disqualified', disqualified, 10_000, 'review')],
        disqualified: [disqualified],
      }),
      repository: new InMemoryCompetitionStakingSettlementRepository(),
      drawSeed,
      now,
    })).resolves.toMatchObject({
      snapshot: { draw: { winnerCount: 0 } },
    });
  });
});
