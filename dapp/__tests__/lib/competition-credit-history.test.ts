jest.mock('@/lib/indexer-db/mongodb', () => ({ getEconomyDb: jest.fn() }));

import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { getCompetitionCreditWalletHistory } from '@/lib/uki-economy/credits/history';

const wallet = '0x1111111111111111111111111111111111111111';

function cursor<T>(rows: T[]) {
  const value = {
    sort: jest.fn(),
    limit: jest.fn(),
    toArray: jest.fn().mockResolvedValue(rows),
  };
  value.sort.mockReturnValue(value);
  value.limit.mockReturnValue(value);
  return value;
}

describe('competition credit public history', () => {
  it('groups game allocations, removes the duplicated pool mirror and reports the next exact expiry', async () => {
    const firstExpiry = new Date('2026-07-11T12:00:00.000Z');
    const laterExpiry = new Date('2026-07-12T12:00:00.000Z');
    const occurredAt = new Date('2026-07-10T14:30:00.000Z');
    const aggregate = jest.fn()
      .mockReturnValueOnce(cursor([{
        _id: { operation: 'spend', bucket: 'own', logicalId: 'reservation-1' },
        amountCredits: 10,
        occurredAt,
        periodId: 'period-1',
        lotIds: ['lot-own-1', 'lot-own-2'],
        runItemIds: ['item-1', 'item-2'],
      }, {
        _id: { operation: 'grant', bucket: 'own', logicalId: 'item-1' },
        amountCredits: 100,
        occurredAt: new Date('2026-07-10T12:01:00.000Z'),
        periodId: 'period-1',
        lotIds: ['lot-own-1'],
        runItemIds: ['item-1'],
      }]))
      .mockReturnValueOnce(cursor([{
        _id: { operation: 'grant', bucket: 'own' },
        amountCredits: 500,
      }, {
        _id: { operation: 'spend', bucket: 'own' },
        amountCredits: 30,
      }, {
        _id: { operation: 'pool_deposit', bucket: 'own' },
        amountCredits: 100,
      }, {
        _id: { operation: 'expire', bucket: 'own' },
        amountCredits: 20,
      }]));
    const pageLots = [{
      lotId: 'lot-own-1',
      route: 'uki',
      expiresAt: firstExpiry,
    }, {
      lotId: 'lot-own-2',
      route: 'nft',
      expiresAt: laterExpiry,
    }];
    const expiringLots = [{
      lotId: 'lot-own-1',
      availableCredits: 30,
      expiresAt: firstExpiry,
    }, {
      lotId: 'lot-own-2',
      availableCredits: 50,
      expiresAt: laterExpiry,
    }];
    const ownFind = jest.fn()
      .mockReturnValueOnce(cursor(expiringLots))
      .mockReturnValueOnce(cursor(pageLots));
    const collections = {
      competition_credit_ledger: { aggregate },
      competition_credit_lots: { find: ownFind },
      competition_credit_pool_lots: { find: jest.fn().mockReturnValue(cursor([])) },
      competition_credit_run_items: {
        find: jest.fn().mockReturnValue(cursor([{
          itemId: 'item-1',
          slotRoute: 'uki',
          slotOrdinal: 1,
        }, {
          itemId: 'item-2',
          slotRoute: 'nft',
          slotOrdinal: 2,
        }])),
      },
    };
    (getEconomyDb as jest.Mock).mockResolvedValue({
      collection: jest.fn((name: keyof typeof collections) => collections[name]),
    });

    const result = await getCompetitionCreditWalletHistory(
      wallet,
      0,
      new Date('2026-07-10T15:00:00.000Z'),
    );

    expect(result.totals).toEqual({
      receivedCredits: 500,
      spentCredits: 30,
      poolContributedCredits: 100,
      expiredCredits: 20,
    });
    expect(result.nextExpiry).toEqual({ credits: 30, at: firstExpiry });
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      eventId: 'spend:own:reservation-1',
      amountCredits: 10,
      route: 'mixed',
      slotOrdinal: null,
      expiresAt: firstExpiry,
    });
    expect(result.entries[1]).toMatchObject({
      eventId: 'grant:own:item-1',
      route: 'uki',
      slotOrdinal: 1,
    });
    expect(aggregate.mock.calls[0][0][0]).toEqual({
      $match: {
        walletNormalized: wallet,
        $nor: [{ operation: 'pool_deposit', bucket: 'pool' }],
      },
    });
  });
});
