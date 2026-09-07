jest.mock('@/lib/indexer-db/mongodb', () => ({ getEconomyDb: jest.fn() }));

import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { getCompetitionCreditWalletStatus } from '@/lib/uki-economy/credits/public';
import { testCompetitionCreditRule } from '@/lib/uki-economy/credits/testing';

const wallet = '0x1111111111111111111111111111111111111111';
const now = new Date('2026-09-07T08:35:37.000Z');

function mockCollections(rows: Record<string, unknown[]>) {
  (getEconomyDb as jest.Mock).mockResolvedValue({
    collection: jest.fn((name: string) => {
      const cursor = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(rows[name] ?? []),
      };
      return {
        find: jest.fn().mockReturnValue(cursor),
        countDocuments: jest.fn().mockResolvedValue(0),
      };
    }),
  });
}

describe('competition credit public status conflicts', () => {
  it.each([
    { rules: [], reason: 'CREDIT_RULE_MISSING' },
    { rules: [testCompetitionCreditRule(), testCompetitionCreditRule()], reason: 'CREDIT_RULE_OVERLAP' },
  ])('identifies $reason and does not invent a wallet balance', async ({ rules, reason }) => {
    mockCollections({ economy_rule_versions: rules });

    await expect(getCompetitionCreditWalletStatus(wallet, now)).rejects.toMatchObject({
      code: 'CONFLICT', details: { reason },
    });
  });

  it('identifies duplicate pool routes even for a wallet without accounts or slots', async () => {
    mockCollections({
      economy_rule_versions: [testCompetitionCreditRule()],
      competition_credit_pool_periods: [{ route: 'uki' }, { route: 'nft' }, { route: 'uki' }],
    });

    await expect(getCompetitionCreditWalletStatus(wallet, now)).rejects.toMatchObject({
      code: 'CONFLICT', details: { reason: 'CREDIT_PROJECTION_DUPLICATE_ROUTES' },
    });
  });
});
