import { validateCompetitionDrawBlock } from '@/lib/treasure-hunt-competition/server/draw-seed-source';

const seed = `0x${'ab'.repeat(32)}` as const;
const endsAt = '2026-08-28T15:00:00.000Z';
const cutoff = BigInt(Date.parse(endsAt) / 1_000);

function evidence(overrides: Partial<Parameters<typeof validateCompetitionDrawBlock>[0]> = {}) {
  return {
    endsAt,
    configuredSeed: seed,
    configuredSourceBlock: BigInt(100),
    latestBlockNumber: BigInt(111),
    confirmations: 12,
    previousBlock: {
      number: BigInt(99),
      hash: `0x${'99'.repeat(32)}` as const,
      timestamp: cutoff,
    },
    sourceBlock: {
      number: BigInt(100),
      hash: seed,
      timestamp: cutoff + BigInt(3),
    },
    ...overrides,
  };
}

function expectCloseError(run: () => unknown, code: string) {
  try {
    run();
    throw new Error('Expected draw source validation to fail');
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe('Treasure Hunt staking draw source', () => {
  it('accepts only the confirmed first BSC block strictly after the close', () => {
    expect(validateCompetitionDrawBlock(evidence())).toBe(seed);
  });

  it('waits for twelve confirmations before exposing the seed', () => {
    expectCloseError(
      () => validateCompetitionDrawBlock(evidence({ latestBlockNumber: BigInt(110) })),
      'settlement_source_not_ready',
    );
  });

  it('rejects a later operator-selected block even when its hash matches', () => {
    expectCloseError(
      () => validateCompetitionDrawBlock(evidence({
        previousBlock: {
          number: BigInt(99),
          hash: `0x${'99'.repeat(32)}`,
          timestamp: cutoff + BigInt(1),
        },
      })),
      'invalid_settlement_input',
    );
  });

  it('rejects a manually substituted seed', () => {
    expectCloseError(
      () => validateCompetitionDrawBlock(evidence({
        configuredSeed: `0x${'cd'.repeat(32)}`,
      })),
      'invalid_settlement_input',
    );
  });
});
