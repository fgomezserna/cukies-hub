import {
  buildCompetitionRanking,
  createCompetitionConfig,
  generateCompetitionAlias,
  type CompetitionAttempt,
} from '@/lib/treasure-hunt-competition';
import { settleStakingCompetitionDraw } from '@/lib/treasure-hunt-competition/staking-draw';

const campaign = createCompetitionConfig({
  campaignId: 'uki-staking-testnet-2026-08',
  rulesVersion: '1',
  eligibilityKind: 'uki_staking',
  stakingContractAddress: `0x${'8'.repeat(40)}`,
  stakingChainId: 97,
  startsAt: '2026-08-26T00:00:00.000Z',
  endsAt: '2026-09-15T15:00:00.000Z',
});

const drawSeed = `0x${'a1'.repeat(32)}`;

function wallet(index: number) {
  return `0x${index.toString(16).padStart(40, '0')}`;
}

function attempt(id: string, walletAddress: string, score: number): CompetitionAttempt {
  return {
    attemptId: id,
    campaignId: campaign.campaignId,
    gameId: campaign.gameId,
    mode: campaign.mode,
    walletAddress,
    playerAlias: generateCompetitionAlias(walletAddress),
    score,
    gameTimeMs: 30_000,
    startedAt: '2026-08-27T12:00:00.000Z',
    finishedAt: '2026-08-27T12:00:30.000Z',
    status: 'valid',
  };
}

describe('Treasure Hunt staking weighted draw', () => {
  it('creates an auditable deterministic weighted draw without duplicate wallet winners', () => {
    const attempts = [
      attempt('wallet-1-a', wallet(1), 1_250),
      attempt('wallet-1-b', wallet(1), 550),
      ...Array.from({ length: 6 }, (_, index) => (
        attempt(`wallet-${index + 2}`, wallet(index + 2), 1_000 + index * 100)
      )),
    ];
    const ranking = buildCompetitionRanking(attempts, campaign);
    const input = {
      campaign,
      ranking,
      totalStakedUkiRaw: '100000000000000000000000',
      disqualifiedWalletAddresses: [] as string[],
      drawSeed,
    };

    const first = settleStakingCompetitionDraw(input);
    const replay = settleStakingCompetitionDraw(input);

    expect(replay).toEqual(first);
    expect(first.algorithmVersion).toBe('treasure-hunt-staking-weighted-v1');
    expect(first.settlement.poolUkiRaw).toBe('60000000000000000000000');
    expect(first.winnerCount).toBe(6);
    expect(new Set(first.winners.map((winner) => winner.walletAddress)).size).toBe(6);
    expect(first.settlement.awards).toHaveLength(6);
    expect(first.settlement.awards.every(
      (award) => award.playerRewardUkiRaw === '10000000000000000000000',
    )).toBe(true);
    expect(first.settlement.spentUkiRaw).toBe('60000000000000000000000');
    expect(first.settlement.remainingUkiRaw).toBe('0');
  });

  it('aggregates tickets from the top attempts and excludes disqualified or zero-ticket wallets', () => {
    const disqualified = wallet(2);
    const ranking = buildCompetitionRanking([
      attempt('one-a', wallet(1), 250),
      attempt('one-b', wallet(1), 199),
      attempt('disqualified', disqualified, 100_000),
      attempt('zero-ticket', wallet(3), 99),
    ], campaign);

    const result = settleStakingCompetitionDraw({
      campaign,
      ranking,
      totalStakedUkiRaw: '0',
      disqualifiedWalletAddresses: [disqualified.toUpperCase()],
      drawSeed,
    });

    expect(result.totalTickets).toBe(3);
    expect(result.winners).toEqual([
      expect.objectContaining({ walletAddress: wallet(1), tickets: 3 }),
    ]);
    expect(result.settlement.remainingUkiRaw).toBe('40000000000000000000000');
  });

  it('rejects a seed that is not an explicit 32-byte value', () => {
    expect(() => settleStakingCompetitionDraw({
      campaign,
      ranking: [],
      totalStakedUkiRaw: '0',
      disqualifiedWalletAddresses: [],
      drawSeed: 'predictable',
    })).toThrow(/32-byte/);
  });
});
