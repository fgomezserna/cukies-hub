import assert from 'node:assert/strict';
import test from 'node:test';

import { IndexerStore } from '../src/storage/mongo.js';
import type { VerifiedBscContractIdentity } from '../src/types.js';

const ADDRESS = `0x${'a'.repeat(40)}`;
const identity: VerifiedBscContractIdentity = {
  alias: 'UKI_STAKING',
  chainId: 97,
  address: ADDRESS,
  startBlock: 123,
  deploymentBlock: 123,
  deploymentTxHash: `0x${'b'.repeat(64)}`,
  runtimeCodeHash: `0x${'c'.repeat(64)}`,
  configHash: `0x${'d'.repeat(64)}`,
};

function storeWithDocuments(input: {
  positions?: Array<Record<string, unknown>>;
  state?: Record<string, unknown> | null;
  latestEvent?: Record<string, unknown> | null;
}) {
  let state = input.state ?? null;
  const updates: Array<Record<string, unknown>> = [];
  const positions = {
    find() {
      return {
        limit() {
          return {
            async toArray() {
              return input.positions ?? [];
            },
          };
        },
      };
    },
  };
  const states = {
    async findOne() {
      return state;
    },
    async updateOne(
      _filter: Record<string, unknown>,
      update: Record<string, Record<string, unknown>>,
    ) {
      updates.push(update);
      state = { ...(state ?? {}), ...update.$setOnInsert, ...update.$set };
      return { acknowledged: true };
    },
  };
  const events = {
    async findOne() {
      return input.latestEvent ?? null;
    },
  };
  const store = Object.create(IndexerStore.prototype) as IndexerStore;
  Object.defineProperty(store, 'db', {
    value: {
      collection(name: string) {
        if (name === 'uki_staking_positions') return positions;
        if (name === 'uki_staking_state') return states;
        throw new Error(`Coleccion inesperada: ${name}`);
      },
    },
  });
  Object.defineProperty(store, 'events', { value: () => events });
  return { store, updates, readState: () => state };
}

test('seals an empty verified staking bootstrap against a canonical safe block', async () => {
  const { store, readState } = storeWithDocuments({});
  const verifiedAt = new Date('2026-08-06T10:00:00.000Z');

  await store.reconcileVerifiedUkiStakingBootstrap({
    identity,
    safeBlockNumber: 200,
    safeBlockHash: `0x${'e'.repeat(64)}`,
    verifiedAt,
  });

  const state = readState();
  assert.equal(state?._id, ADDRESS);
  assert.equal(state?.totalStakedRaw, '0');
  assert.equal(state?.materializationStatus, 'consistent');
  assert.equal(state?.materializedTotalRaw, '0');
  assert.equal(state?.materializedThroughSafeBlock, 200);
  assert.equal(state?.bootstrapStatus, 'verified');
  assert.equal(state?.verifiedChainId, 97);
  assert.equal(state?.contractConfigHash, identity.configHash);
});

test('marks staking materialization inconsistent when positions diverge from state', async () => {
  const { store, readState } = storeWithDocuments({
    positions: [{ accountBalanceRaw: '40' }, { accountBalanceRaw: '3' }],
    state: { _id: ADDRESS, totalStakedRaw: '42', lastEventId: 'old-event' },
    latestEvent: { _id: 'latest-event', blockNumber: 190, logIndex: 2 },
  });

  await store.reconcileVerifiedUkiStakingBootstrap({
    identity,
    safeBlockNumber: 200,
    safeBlockHash: `0x${'e'.repeat(64)}`,
    verifiedAt: new Date('2026-08-06T10:00:00.000Z'),
  });

  const state = readState();
  assert.equal(state?.materializationStatus, 'inconsistent');
  assert.equal(state?.materializedTotalRaw, '43');
  assert.equal(state?.materializedThroughEventId, 'latest-event');
  assert.equal(state?.materializedThroughBlockNumber, 190);
  assert.equal(state?.materializedThroughLogIndex, 2);
});

test('rejects malformed staking balances instead of sealing an unverifiable state', async () => {
  const { store, updates } = storeWithDocuments({
    positions: [{ accountBalanceRaw: '-1' }],
  });

  await assert.rejects(
    store.reconcileVerifiedUkiStakingBootstrap({
      identity,
      safeBlockNumber: 200,
      safeBlockHash: `0x${'e'.repeat(64)}`,
      verifiedAt: new Date('2026-08-06T10:00:00.000Z'),
    }),
    /raw invalido/,
  );
  assert.deepEqual(updates, []);
});
