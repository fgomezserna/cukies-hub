import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChainCursor, ChainEvent, ContractEventConfig } from '../types.js';
import {
  cloneHistoricalEventForLegacy,
  historicalDefaultEventFilter,
  legacyBootstrapCursorFields,
} from './bootstrap.js';

const config: ContractEventConfig = {
  chain: 'BSC',
  contractAlias: 'TOKEN',
  contractAddress: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
  eventName: 'Transfer',
};

function historicalEvent(): ChainEvent {
  return {
    _id: `BSC:TOKEN:Transfer:0x${'1'.repeat(64)}:7`,
    chain: 'BSC',
    contractAlias: 'TOKEN',
    contractAddress: config.contractAddress.toLowerCase(),
    eventName: 'Transfer',
    txHash: `0x${'1'.repeat(64)}`,
    logIndex: 7,
    blockNumber: 120,
    timestampMs: 1_700_000_000_000,
    args: { tokenId: '42' },
    normalized: { tokenId: '42' },
    raw: {},
    status: 'ignored',
    attempts: 5,
    lockedAt: new Date('2026-09-14T00:00:00.000Z'),
    projectedAt: new Date('2026-09-14T00:01:00.000Z'),
    lastError: 'unsupported projector',
    schemaVersion: 1,
    createdAt: new Date('2026-09-14T00:00:00.000Z'),
    updatedAt: new Date('2026-09-14T00:01:00.000Z'),
  };
}

test('historical event clone replays through an isolated, idempotent legacy identity', () => {
  const importedAt = new Date('2026-09-15T10:00:00.000Z');
  const cloned = cloneHistoricalEventForLegacy(historicalEvent(), config, importedAt);

  assert.equal(cloned._id, `legacy:BSC:TOKEN:Transfer:0x${'1'.repeat(64)}:7`);
  assert.equal(cloned.runtimeScope, 'legacy');
  assert.equal(cloned.chainId, 56);
  assert.equal(cloned.status, 'ingested');
  assert.equal(cloned.attempts, 0);
  assert.equal(cloned.lockedAt, undefined);
  assert.equal(cloned.projectedAt, undefined);
  assert.equal(cloned.lastError, undefined);
  assert.equal(cloned.updatedAt, importedAt);

  const replay = cloneHistoricalEventForLegacy(historicalEvent(), config, importedAt);
  assert.deepEqual(replay, cloned);
});

test('historical event filter cannot read legacy rows or events beyond its cursor snapshot', () => {
  const cursorUpdatedAt = new Date('2026-09-15T09:00:00.000Z');
  const filter = historicalDefaultEventFilter(config, {
    nextBlock: 500,
    updatedAt: cursorUpdatedAt,
  }) as { $and: Array<Record<string, unknown>> };

  assert.equal(filter.$and.length, 4);
  assert.deepEqual(filter.$and[1], {
    $or: [
      { runtimeScope: { $exists: false } },
      { runtimeScope: 'default' },
    ],
  });
  assert.deepEqual(filter.$and[2], { blockNumber: { $lt: 500 } });
  assert.deepEqual(filter.$and[3], {
    $or: [
      { createdAt: { $lte: cursorUpdatedAt } },
      { createdAt: { $exists: false } },
    ],
  });
});

test('legacy cursor bootstrap preserves exact progress only after validating source identity', () => {
  const importedAt = new Date('2026-09-15T10:00:00.000Z');
  const sourceUpdatedAt = new Date('2026-06-11T11:41:25.408Z');
  const source: ChainCursor = {
    _id: 'BSC:TOKEN:Transfer',
    chain: 'BSC',
    contractAlias: 'TOKEN',
    contractAddress: config.contractAddress,
    eventName: 'Transfer',
    nextBlock: 103_600_442,
    updatedAt: sourceUpdatedAt,
  };

  assert.deepEqual(legacyBootstrapCursorFields(config, source, importedAt, 15_471), {
    nextBlock: 103_600_442,
    legacyBootstrapSourceCursorId: 'BSC:TOKEN:Transfer',
    legacyBootstrapSourceCursorUpdatedAt: sourceUpdatedAt,
    legacyBootstrapImportedAt: importedAt,
    legacyBootstrapEventCount: 15_471,
  });

  assert.throws(
    () => legacyBootstrapCursorFields(config, {
      ...source,
      contractAddress: `0x${'2'.repeat(40)}`,
    }, importedAt, 0),
    /Cursor historico incompatible/,
  );
});
