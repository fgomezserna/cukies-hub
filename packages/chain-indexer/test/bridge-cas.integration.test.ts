import assert from 'node:assert/strict';
import test from 'node:test';
import { MongoClient } from 'mongodb';

import { projectBridgeLifecycle } from '../src/projectors/legacy-events.js';
import type { ChainEvent } from '../src/types.js';

const mongoUrl = process.env.CHAIN_INDEXER_TEST_MONGO_URL;
const transferId = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const requestTransferId = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const metadataA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const metadataB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const metadataR = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const metadataW = '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
const metadataOld = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

function bridgeEvent(
  eventName: 'BridgeRequested' | 'BridgeCompleted',
  eventId: string,
  blockNumber: number,
  tokenId = '42',
  metadataHash = metadataA,
  sourceNetworkRaw = '1',
  destinationNetworkRaw = '2',
  requestedTransferId = transferId,
): ChainEvent {
  const args = {
    transferId: requestedTransferId,
    tokenId,
    metadataHash,
    sourceNetworkRaw,
    destinationNetworkRaw,
    sourceOwner: '0x1111111111111111111111111111111111111111',
    destinationOwnerRaw: '0x2222222222222222222222222222222222222222',
    destinationOwner: '0x2222222222222222222222222222222222222222',
    nonceRaw: '7',
    feePaidRaw: '9',
    minted: true,
  };
  return {
    _id: eventId,
    chain: 'BSC',
    chainId: 56,
    contractAlias: 'BRIDGE_ENDPOINT',
    contractAddress: '0x3333333333333333333333333333333333333333',
    eventName,
    txHash: `0x${eventId.slice(2).padEnd(64, '0')}`,
    logIndex: 0,
    blockNumber,
    blockHash: `0x${String(blockNumber).padStart(64, '0')}`,
    timestampMs: blockNumber * 1_000,
    args,
    normalized: { ...args },
    raw: { args },
    status: 'projecting',
    attempts: 1,
    schemaVersion: 1,
    createdAt: new Date(blockNumber * 1_000),
    updatedAt: new Date(blockNumber * 1_000),
  };
}

function barrierCollection(native: any, state: {
  transferId: string;
  reads: number;
  barrier?: Promise<void>;
  release?: () => void;
}) {
  if (!state.barrier) {
    state.barrier = new Promise<void>((resolve) => { state.release = resolve; });
  }
  return {
    updateOne: (...args: any[]) => native.updateOne(...args),
    find: (...args: any[]) => native.find(...args),
    findOne: async (filter: any) => {
      const result = await native.findOne(filter);
      if (filter?._id === `endpoint-v2:${state.transferId}` && state.reads < 2) {
        state.reads += 1;
        if (state.reads === 2) state.release?.();
        await state.barrier;
      }
      return result;
    },
  };
}

test('bridge CAS preserves one terminal payload under empty-collection concurrent completion', { timeout: 5_000 }, async (t) => {
  if (!mongoUrl) {
    t.skip('Mongo integration opt-in: define CHAIN_INDEXER_TEST_MONGO_URL');
    return;
  }
  const client = new MongoClient(mongoUrl, {
    serverSelectionTimeoutMS: 1_000,
    connectTimeoutMS: 1_000,
  });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(`Mongo integration opt-in failed: ${String(error)}`);
  }

  try {
  const databaseName = decodeURIComponent(new URL(mongoUrl).pathname.replace(/^\/+/, ''))
    || 'cukies-legacy-events-test';
  const db = client.db(databaseName);
  await db.collection('bridge_transfers').deleteMany({ _id: `endpoint-v2:${transferId}` });
  await db.collection('bridge_transfers').deleteMany({ _id: `endpoint-v2:${requestTransferId}` });
  await db.collection('chain_event_audit').deleteMany({
    _id: { $in: ['completion-a', 'completion-b', 'request-late', 'request-late-older', 'request-route'] },
  });
  const makeStore = (state: { transferId: string; reads: number; barrier?: Promise<void>; release?: () => void }) => ({
    db: {
      collection(name: string) {
        const native = db.collection(name);
        return name === 'bridge_transfers' ? barrierCollection(native, state) : native;
      },
    },
  }) as any;
  const state = { transferId, reads: 0 };
  const store = makeStore(state);

  const [first, second] = await Promise.all([
    projectBridgeLifecycle(store, bridgeEvent('BridgeCompleted', 'completion-a', 100)),
    projectBridgeLifecycle(store, bridgeEvent('BridgeCompleted', 'completion-b', 101)),
  ]);
  assert.equal(first, null);
  assert.equal(second, null);
  const transfer = await db.collection('bridge_transfers').findOne({ _id: `endpoint-v2:${transferId}` });
  assert.equal(transfer?.status, 'completed');
  assert.equal(transfer?.tokenId, '42');
  assert.equal(transfer?.metadataHash, metadataA);
  assert.ok(['completion-a', 'completion-b'].includes(transfer?.completionEventId));
  assert.equal(await db.collection('bridge_transfers').countDocuments({ _id: `endpoint-v2:${transferId}` }), 1);
  assert.equal(
    await db.collection('chain_event_audit').countDocuments({
      classification: 'bridge-completion-replay',
      transferId,
    }),
    1,
  );

  const lateMismatch = bridgeEvent('BridgeRequested', 'request-late', 102, '99', metadataB);
  await projectBridgeLifecycle(store, lateMismatch);
  const afterLate = await db.collection('bridge_transfers').findOne({ _id: `endpoint-v2:${transferId}` });
  assert.equal(afterLate?.tokenId, '42');
  assert.equal(afterLate?.metadataHash, metadataA);
  assert.equal(afterLate?.status, 'completed');
  assert.equal(afterLate?.requestEventId, undefined);
  assert.equal(afterLate?.requestTokenId, undefined);
  assert.equal(
    await db.collection('chain_event_audit').countDocuments({
      classification: 'bridge-terminal-request-mismatch',
      transferId,
    }),
    1,
  );

  const requestState = { transferId: requestTransferId, reads: 0 };
  const requestStore = makeStore(requestState);
  await Promise.all([
    projectBridgeLifecycle(requestStore, bridgeEvent('BridgeRequested', 'request-a', 200, '7', metadataR, '1', '2', requestTransferId)),
    projectBridgeLifecycle(requestStore, bridgeEvent('BridgeRequested', 'request-b', 201, '7', metadataR, '1', '2', requestTransferId)),
  ]);
  const requested = await db.collection('bridge_transfers').findOne({ _id: `endpoint-v2:${requestTransferId}` });
  assert.equal(requested?.status, 'requested');
  assert.equal(requested?.tokenId, '7');
  assert.equal(await db.collection('bridge_transfers').countDocuments({ _id: `endpoint-v2:${requestTransferId}` }), 1);
  await projectBridgeLifecycle(requestStore, bridgeEvent('BridgeCompleted', 'request-completion', 202, '7', metadataR, '1', '2', requestTransferId));
  await projectBridgeLifecycle(requestStore, bridgeEvent('BridgeCompleted', 'request-completion', 202, '7', metadataR, '1', '2', requestTransferId));
  const completedRequest = await db.collection('bridge_transfers').findOne({ _id: `endpoint-v2:${requestTransferId}` });
  assert.equal(completedRequest?.status, 'completed');
  assert.equal(completedRequest?.completionEventId, 'request-completion');
  await projectBridgeLifecycle(requestStore, bridgeEvent('BridgeRequested', 'request-late-2', 203, '999', metadataW, '1', '2', requestTransferId));
  await projectBridgeLifecycle(requestStore, bridgeEvent('BridgeRequested', 'request-older-2', 199, '1000', metadataOld, '1', '2', requestTransferId));
  const terminalRequest = await db.collection('bridge_transfers').findOne({ _id: `endpoint-v2:${requestTransferId}` });
  assert.equal(terminalRequest?.tokenId, '7');
  assert.equal(terminalRequest?.metadataHash, metadataR);
  assert.equal(terminalRequest?.lateRequestEventId, 'request-late-2');
  assert.equal(
    await db.collection('chain_event_audit').countDocuments({
      classification: 'bridge-terminal-request-mismatch',
      transferId: requestTransferId,
    }),
    2,
  );

  const routeMismatch = bridgeEvent('BridgeRequested', 'request-route', 103, '42', metadataA, '9', '10');
  await projectBridgeLifecycle(store, routeMismatch);
  const afterRoute = await db.collection('bridge_transfers').findOne({ _id: `endpoint-v2:${transferId}` });
  assert.equal(afterRoute?.bridgeRoute, '1>2');
  assert.equal(
    await db.collection('chain_event_audit').countDocuments({
      classification: 'bridge-route-mismatch',
      transferId,
    }),
    1,
  );
  } finally {
    await client.close();
  }
});
