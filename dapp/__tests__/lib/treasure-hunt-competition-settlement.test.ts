import {
  buildCompetitionRanking,
  createCompetitionConfig,
  generateCompetitionAlias,
  settleCompetition,
  type CompetitionAttempt,
  type CompetitionPurchase,
} from '@/lib/treasure-hunt-competition';

const PRESALE = `0x${'9'.repeat(40)}`;
const campaign = createCompetitionConfig({
  campaignId: 'uki-presale-2026',
  rulesVersion: '1',
  presaleContractAddress: PRESALE,
  startsAt: '2026-07-01T00:00:00.000Z',
  endsAt: '2026-07-31T23:59:59.999Z',
});

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
    startedAt: '2026-07-10T12:00:00.000Z',
    finishedAt: '2026-07-10T12:00:30.000Z',
    status: 'valid',
  };
}

function purchase(
  walletAddress: string,
  ukiPurchasedRaw: string,
  sponsorWalletAddress: string | null = null,
): CompetitionPurchase {
  return { walletAddress, ukiPurchasedRaw, sponsorWalletAddress };
}

describe('Treasure Hunt presale competition settlement', () => {
  it('matches the published 2M pool and 20K/two-attempt example', () => {
    const winner = '0x1111111111111111111111111111111111111111';
    const sponsor = '0x2222222222222222222222222222222222222222';
    const filler = '0x3333333333333333333333333333333333333333';
    const purchases = [
      purchase(winner, '20000', sponsor),
      purchase(filler, '1980000'),
    ];
    const ranking = buildCompetitionRanking([
      attempt('winner-1', winner, 500),
      attempt('winner-2', winner, 400),
    ], campaign);

    const settlement = settleCompetition({ campaign, ranking, purchases });

    expect(settlement.totalPurchasedUkiRaw).toBe('2000000');
    expect(settlement.poolUkiRaw).toBe('500000');
    expect(settlement.awards).toHaveLength(2);
    expect(settlement.awards[0]).toMatchObject({
      playerRewardUkiRaw: '2000',
      sponsorRewardUkiRaw: '500',
      totalRewardUkiRaw: '2500',
      partial: false,
    });
    expect(settlement.playerRewardsUkiRaw).toBe('4000');
    expect(settlement.sponsorRewardsUkiRaw).toBe('1000');
    expect(settlement.spentUkiRaw).toBe('5000');
    expect(settlement.remainingUkiRaw).toBe('495000');
  });

  it('keeps a zero-purchase wallet visible but skips it without consuming pool', () => {
    const freePlayer = '0x4444444444444444444444444444444444444444';
    const buyer = '0x5555555555555555555555555555555555555555';
    const ranking = buildCompetitionRanking([
      attempt('free', freePlayer, 1_000),
      attempt('buyer', buyer, 900),
    ], campaign);

    const settlement = settleCompetition({
      campaign,
      ranking,
      purchases: [purchase(buyer, '10000')],
    });

    expect(settlement.skipped).toContainEqual({
      attemptId: 'free',
      rank: 1,
      walletAddress: freePlayer.toLowerCase(),
      reason: 'no_purchase',
    });
    expect(settlement.awards).toHaveLength(1);
    expect(settlement.awards[0]).toMatchObject({
      attemptId: 'buyer',
      rank: 2,
      playerRewardUkiRaw: '1000',
      sponsorRewardUkiRaw: '0',
    });
    expect(settlement.spentUkiRaw).toBe('1000');
  });

  it('caps rewarded attempts at five even if an untrusted ranking contains more', () => {
    const wallet = '0x6666666666666666666666666666666666666666';
    const filler = '0x6F6F6F6F6F6F6F6F6F6F6F6F6F6F6F6F6F6F6F6F';
    const ranking = Array.from({ length: 6 }, (_, index) => ({
      ...attempt(`attempt-${index}`, wallet, 600 - index),
      rank: index + 1,
      walletRank: index + 1,
    }));

    const settlement = settleCompetition({
      campaign,
      ranking,
      purchases: [purchase(wallet, '100000'), purchase(filler, '200000')],
    });

    expect(settlement.awards).toHaveLength(5);
    expect(settlement.awards.map((award) => award.attemptId))
      .toEqual(['attempt-0', 'attempt-1', 'attempt-2', 'attempt-3', 'attempt-4']);
  });

  it('uses a proportional last partial award and never exceeds the pool', () => {
    const first = '0x7777777777777777777777777777777777777777';
    const filler = '0x8888888888888888888888888888888888888888';
    const sponsor = '0x9999999999999999999999999999999999999999';
    const ranking = buildCompetitionRanking([
      attempt('first', first, 1_000),
      attempt('second', first, 900),
      attempt('partial', first, 800),
    ], campaign);

    const settlement = settleCompetition({
      campaign,
      ranking,
      purchases: [
        purchase(first, '1000', sponsor),
        purchase(filler, '100'),
      ],
    });

    expect(settlement.poolUkiRaw).toBe('275');
    expect(settlement.awards[0]).toMatchObject({
      playerRewardUkiRaw: '100',
      sponsorRewardUkiRaw: '25',
      partial: false,
    });
    expect(settlement.awards[1]).toMatchObject({
      playerRewardUkiRaw: '100',
      sponsorRewardUkiRaw: '25',
      partial: false,
    });
    expect(settlement.awards[2]).toMatchObject({
      playerRewardUkiRaw: '20',
      sponsorRewardUkiRaw: '5',
      totalRewardUkiRaw: '25',
      partial: true,
    });
    expect(settlement.spentUkiRaw).toBe('275');
    expect(settlement.remainingUkiRaw).toBe('0');
    expect(BigInt(settlement.spentUkiRaw)).toBeLessThanOrEqual(BigInt(settlement.poolUkiRaw));
  });

  it('does not reward a self sponsor and reports the remaining pool explicitly', () => {
    const wallet = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const filler = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    const ranking = buildCompetitionRanking([attempt('self', wallet, 1)], campaign);
    const settlement = settleCompetition({
      campaign,
      ranking,
      purchases: [purchase(wallet, '1000', wallet), purchase(filler, '1000')],
    });

    expect(settlement.poolUkiRaw).toBe('500');
    expect(settlement.awards[0]).toMatchObject({
      sponsorWalletAddress: null,
      sponsorRewardUkiRaw: '0',
      playerRewardUkiRaw: '100',
    });
    expect(settlement.remainingUkiRaw).toBe('400');
    expect(settlement.roundingDustUkiRaw).toBe('0');
  });

  it('reserves 80% of the pool for players and never reallocates sponsor capacity', () => {
    const wallet = '0xABABABABABABABABABABABABABABABABABABABAB';
    const ranking = buildCompetitionRanking([
      attempt('no-sponsor-1', wallet, 300),
      attempt('no-sponsor-2', wallet, 200),
      attempt('no-sponsor-3', wallet, 100),
    ], campaign);
    const settlement = settleCompetition({
      campaign,
      ranking,
      purchases: [purchase(wallet, '1000')],
    });

    expect(settlement).toMatchObject({
      poolUkiRaw: '250',
      playerPoolUkiRaw: '200',
      sponsorPoolUkiRaw: '50',
      playerRewardsUkiRaw: '200',
      sponsorRewardsUkiRaw: '0',
      spentUkiRaw: '200',
      remainingUkiRaw: '50',
    });
    expect(settlement.awards).toHaveLength(2);
  });

  it('ignores a malformed sponsor wallet', () => {
    const wallet = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    const filler = '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD';
    const settlement = settleCompetition({
      campaign,
      ranking: buildCompetitionRanking([attempt('winner', wallet, 10)], campaign),
      purchases: [purchase(wallet, '1000', 'not-a-wallet'), purchase(filler, '1000')],
    });

    expect(settlement.awards[0]).toMatchObject({
      sponsorWalletAddress: null,
      sponsorRewardUkiRaw: '0',
    });
  });

  it('rebuilds ranking authority instead of trusting supplied order, ranks or status', () => {
    const first = '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
    const second = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
    const validLow = { ...attempt('low', first, 10), rank: 1, walletRank: 1 };
    const validHigh = { ...attempt('high', second, 20), rank: 999, walletRank: 999 };
    const fabricated = {
      ...attempt('fabricated', first, 1_000_000),
      status: 'invalid' as const,
      rank: 0,
      walletRank: 0,
    };

    const settlement = settleCompetition({
      campaign,
      ranking: [validLow, fabricated, validHigh],
      purchases: [purchase(first, '1000'), purchase(second, '1000')],
    });

    expect(settlement.awards.map((award) => [award.attemptId, award.rank]))
      .toEqual([['high', 1], ['low', 2]]);
  });

  it('excludes a duplicated attempt id from settlement', () => {
    const wallet = '0x1212121212121212121212121212121212121212';
    const row = { ...attempt('duplicate', wallet, 100), rank: 1, walletRank: 1 };
    const settlement = settleCompetition({
      campaign,
      ranking: [row, { ...row, rank: 2 }],
      purchases: [purchase(wallet, '1000')],
    });

    expect(settlement.awards).toHaveLength(0);
  });

  it('rejects conflicting positive-purchase sponsors regardless of input order', () => {
    const wallet = '0x1313131313131313131313131313131313131313';
    const sponsorA = '0x1414141414141414141414141414141414141414';
    const sponsorB = '0x1515151515151515151515151515151515151515';
    const ranking = buildCompetitionRanking([attempt('winner', wallet, 100)], campaign);

    expect(() => settleCompetition({
      campaign,
      ranking,
      purchases: [purchase(wallet, '500', sponsorA), purchase(wallet, '500', sponsorB)],
    })).toThrow(/Conflicting sponsor/);
  });

  it('does not let a zero-value row preselect the sponsor', () => {
    const wallet = '0x1616161616161616161616161616161616161616';
    const ignoredSponsor = '0x1717171717171717171717171717171717171717';
    const lockedSponsor = '0x1818181818181818181818181818181818181818';
    const filler = '0x1919191919191919191919191919191919191919';
    const settlement = settleCompetition({
      campaign,
      ranking: buildCompetitionRanking([attempt('winner', wallet, 100)], campaign),
      purchases: [
        purchase(wallet, '0', ignoredSponsor),
        purchase(wallet, '1000', lockedSponsor),
        purchase(filler, '1000'),
      ],
    });

    expect(settlement.awards[0].sponsorWalletAddress).toBe(lockedSponsor);
  });

  it('rejects aggregate purchase overflow across otherwise valid uint256 rows', () => {
    const max = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
    expect(() => settleCompetition({
      campaign,
      ranking: [],
      purchases: [
        purchase('0x2020202020202020202020202020202020202020', max),
        purchase('0x2121212121212121212121212121212121212121', '1'),
      ],
    })).toThrow(/exceeds uint256/);
  });
});
