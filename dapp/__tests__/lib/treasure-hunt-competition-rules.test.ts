import {
  buildCompetitionRanking,
  createCompetitionConfig,
  createCompetitionVestingSchedule,
  generateCompetitionAlias,
  normalizeCompetitionAlias,
  parseUkiRaw,
  validateCompetitionAlias,
  type CompetitionAttempt,
} from '@/lib/treasure-hunt-competition';

const PRESALE = `0x${'9'.repeat(40)}`;
const campaign = createCompetitionConfig({
  campaignId: 'uki-presale-2026',
  rulesVersion: '1',
  presaleContractAddress: PRESALE,
  startsAt: '2026-07-01T00:00:00.000Z',
  endsAt: '2026-07-31T23:59:59.999Z',
});

function attempt(
  attemptId: string,
  walletAddress: string,
  score: number,
  overrides: Partial<CompetitionAttempt> = {},
): CompetitionAttempt {
  return {
    attemptId,
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
    ...overrides,
  };
}

describe('Treasure Hunt presale competition rules', () => {
  it('uses the approved immutable defaults', () => {
    expect(campaign).toMatchObject({
      gameId: 'treasure-hunt',
      mode: 'presale_competition',
      poolBps: 2_500,
      playerRewardBps: 1_000,
      sponsorRewardBps: 2_500,
      maxWinningAttemptsPerWallet: 5,
      cliffMonths: 9,
      vestingMonths: 6,
    });
  });

  it.each(['00', '01', '-1', '+1', '1.0', ' 1', '1 ', '1e18', '']) (
    'rejects non-canonical UKI raw value %p',
    (value) => {
      expect(() => parseUkiRaw(value)).toThrow();
    },
  );

  it('parses canonical uint256 values and rejects overflow', () => {
    const uint256Max = BigInt(
      '115792089237316195423570985008687907853269984665640564039457584007913129639935',
    );

    expect(parseUkiRaw('0')).toBe(BigInt(0));
    expect(parseUkiRaw(uint256Max.toString())).toBe(uint256Max);
    expect(() => parseUkiRaw((uint256Max + BigInt(1)).toString())).toThrow();
    expect(() => parseUkiRaw('9'.repeat(100_000))).toThrow();
  });

  it('requires explicit UTC timestamps for campaign boundaries', () => {
    expect(() => createCompetitionConfig({
      campaignId: 'ambiguous',
      rulesVersion: '1',
      presaleContractAddress: PRESALE,
      startsAt: '2026-07-01T00:00:00',
      endsAt: '2026-07-31T00:00:00Z',
    })).toThrow(/UTC/);
  });

  it('normalizes and requires a non-zero presale contract address', () => {
    expect(campaign.presaleContractAddress).toBe(PRESALE);
    expect(() => createCompetitionConfig({
      campaignId: 'invalid-contract',
      rulesVersion: '1',
      presaleContractAddress: `0x${'0'.repeat(40)}`,
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T00:00:00.000Z',
    })).toThrow(/non-zero EVM address/);
  });

  it('keeps only five valid in-window attempts per wallet before global ordering', () => {
    const walletA = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const walletB = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    const rows = [
      attempt('a-low', walletA, 10),
      attempt('a-1', walletA, 100),
      attempt('a-2', walletA, 90),
      attempt('a-3', walletA, 80),
      attempt('a-4', walletA, 70),
      attempt('a-5', walletA, 60),
      attempt('b-1', walletB, 95),
      attempt('invalid', walletB, 999, { status: 'invalid' }),
      attempt('wrong-mode', walletB, 999, { mode: 'staging_unranked' }),
      attempt('late', walletB, 999, { finishedAt: '2026-08-01T00:00:00.000Z' }),
    ];

    const ranking = buildCompetitionRanking(rows, campaign);

    expect(ranking.map((row) => row.attemptId)).toEqual([
      'a-1',
      'b-1',
      'a-2',
      'a-3',
      'a-4',
      'a-5',
    ]);
    expect(ranking.filter((row) => row.walletAddress.toLowerCase() === walletA.toLowerCase()))
      .toHaveLength(5);
    expect(ranking.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('uses deterministic tie breakers and does not require a purchase to rank', () => {
    const wallet = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    const ranking = buildCompetitionRanking([
      attempt('later-id', wallet, 100, {
        gameTimeMs: 20_000,
        finishedAt: '2026-07-10T12:01:00.000Z',
      }),
      attempt('first-id', wallet, 100, {
        gameTimeMs: 20_000,
        finishedAt: '2026-07-10T12:00:59.000Z',
      }),
      attempt('fastest', wallet, 100, { gameTimeMs: 19_999 }),
    ], campaign);

    expect(ranking.map((row) => row.attemptId)).toEqual(['fastest', 'first-id', 'later-id']);
  });

  it('excludes duplicate attempt ids and the zero EVM address', () => {
    const wallet = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    const duplicate = attempt('duplicate', wallet, 100);
    const ranking = buildCompetitionRanking([
      duplicate,
      { ...duplicate },
      attempt('zero-wallet', `0x${'0'.repeat(40)}`, 200),
      attempt('valid', wallet, 50),
    ], campaign);

    expect(ranking.map((row) => row.attemptId)).toEqual(['valid']);
  });

  it('generates a stable public alias without exposing a wallet fragment', () => {
    const wallet = '0x1234567890abcdef1234567890abcdef12345678';
    const alias = generateCompetitionAlias(wallet);

    expect(alias).toMatch(/^Hunter-[A-F0-9]{6}$/);
    expect(generateCompetitionAlias(wallet.toUpperCase())).toBe(alias);
    expect(alias.toLowerCase()).not.toContain(wallet.slice(2, 8).toLowerCase());
    expect(alias.toLowerCase()).not.toContain(wallet.slice(-6).toLowerCase());
  });

  it('validates aliases with a case-insensitive canonical key', () => {
    expect(validateCompetitionAlias('Cukie_Hunter-7')).toEqual({
      valid: true,
      alias: 'Cukie_Hunter-7',
      canonicalAlias: 'cukie_hunter-7',
    });
    expect(normalizeCompetitionAlias('  Alice  ')).toBe('alice');
    expect(validateCompetitionAlias('0x1234567890abcdef')).toMatchObject({ valid: false });
    expect(validateCompetitionAlias('ab')).toMatchObject({ valid: false });
    expect(validateCompetitionAlias('name with spaces')).toMatchObject({ valid: false });
  });

  it('builds a nine-month cliff plus six calendar months of linear vesting in UTC', () => {
    const schedule = createCompetitionVestingSchedule('2026-05-31T20:15:00.000Z', campaign);

    expect(schedule).toEqual({
      startAt: '2026-05-31T20:15:00.000Z',
      cliffAt: '2027-02-28T20:15:00.000Z',
      endAt: '2027-08-28T20:15:00.000Z',
      durationSeconds: 15_638_400,
    });
  });
});
