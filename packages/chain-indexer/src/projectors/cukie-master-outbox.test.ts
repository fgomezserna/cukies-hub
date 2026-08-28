import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ChainEvent } from '../types.js';
import {
  cukieMasterRecalculationJobId,
  enqueueCukieMasterRecalculation,
  normalizeCukieMasterJobWallet,
} from './cukie-master-outbox.js';

const wallet = '0x00000000000000000000000000000000000000AA';

function event(): ChainEvent {
  const timestamp = new Date('2026-08-16T10:00:00.000Z');
  return {
    _id: 'BSC:UKI_STAKING:Staked:0xtx:1',
    chain: 'BSC',
    chainId: 97,
    contractAlias: 'UKI_STAKING',
    contractAddress: '0x00000000000000000000000000000000000000bb',
    eventName: 'Staked',
    txHash: `0x${'a'.repeat(64)}`,
    logIndex: 1,
    blockNumber: 100,
    timestampMs: timestamp.getTime(),
    args: {},
    normalized: {},
    raw: {},
    status: 'projecting',
    attempts: 1,
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('Cukie Master chain-event outbox', () => {
  it('normaliza la wallet y genera una identidad distinta por ruta', () => {
    assert.equal(normalizeCukieMasterJobWallet(wallet), wallet.toLowerCase());
    assert.notEqual(
      cukieMasterRecalculationJobId(event()._id, wallet, 'uki'),
      cukieMasterRecalculationJobId(event()._id, wallet, 'nft'),
    );
    assert.throws(() => normalizeCukieMasterJobWallet('0x0000000000000000000000000000000000000000'));
  });

  it('encola un job idempotente con la ruta que consume el scheduler', async () => {
    const writes: Array<{ filter: unknown; update: any; options: any }> = [];
    const store = {
      db: {
        collection(name: string) {
          assert.equal(name, 'cukie_master_recalculation_jobs');
          return {
            async updateOne(filter: unknown, update: unknown, options: unknown) {
              writes.push({ filter, update, options });
              return { upsertedCount: 1 };
            },
          };
        },
      },
    };

    await enqueueCukieMasterRecalculation({
      store: store as never,
      event: event(),
      wallet,
      route: 'uki',
    });

    assert.equal(writes.length, 1);
    assert.equal(writes[0].update.$setOnInsert.walletNormalized, wallet.toLowerCase());
    assert.equal(writes[0].update.$setOnInsert.route, 'uki');
    assert.equal(writes[0].update.$setOnInsert.status, 'pending');
    assert.equal(writes[0].update.$setOnInsert.sourceType, 'chain_event');
    assert.equal(writes[0].options.upsert, true);
  });
});
