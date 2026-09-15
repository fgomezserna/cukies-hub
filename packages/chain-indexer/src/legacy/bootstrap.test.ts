import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChainCursor, ChainEvent, ContractEventConfig } from '../types.js';
import type { LegacyIndexerConfig } from '../config/legacy-env.js';
import {
  bootstrapLegacyRuntimeFromDefault,
  cloneHistoricalEventForLegacy,
  historicalDefaultEventFilter,
  legacyBootstrapCursorFields,
} from './bootstrap.js';
import { LEGACY_CONTRACT_ALIASES } from './contracts.js';
import type { LegacyIndexerStore } from './storage/mongo.js';

const config: ContractEventConfig = {
  chain: 'BSC',
  contractAlias: 'TOKEN',
  contractAddress: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
  eventName: 'Transfer',
};

const tronConfig: ContractEventConfig = {
  chain: 'TRON',
  contractAlias: 'TOKEN',
  contractAddress: 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
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

test('BSC historical filter uses block progress, not mutable ingestion createdAt', () => {
  const filter = historicalDefaultEventFilter(config, {
    nextBlock: 500,
  }) as { $and: Array<Record<string, unknown>> };

  assert.equal(filter.$and.length, 3);
  assert.deepEqual(filter.$and[1], {
    $or: [
      { runtimeScope: { $exists: false } },
      { runtimeScope: 'default' },
    ],
  });
  assert.deepEqual(filter.$and[2], { blockNumber: { $lt: 500 } });
  assert.equal(JSON.stringify(filter).includes('createdAt'), false);

  // A historical event may have arrived in Mongo after the cursor was saved;
  // its block is still before the durable frontier and must be imported.
  const beforeCursor = { blockNumber: 499, createdAt: new Date('2026-09-15T10:00:00.000Z') };
  const afterCursor = { blockNumber: 500, createdAt: new Date('2026-09-14T00:00:00.000Z') };
  assert.equal(beforeCursor.blockNumber < 500, true);
  assert.equal(afterCursor.blockNumber < 500, false);
});

test('TRON historical filter uses an exclusive timestamp frontier and never createdAt', () => {
  const filter = historicalDefaultEventFilter(tronConfig, {
    nextTimestampMs: 5_000,
    fingerprint: 'opaque-page-token',
  }) as { $and: Array<Record<string, unknown>> };

  assert.equal(filter.$and.length, 3);
  assert.deepEqual(filter.$and[2], { timestampMs: { $lt: 5_000 } });
  assert.equal(JSON.stringify(filter).includes('createdAt'), false);
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

test('legacy TRON bootstrap restarts an opaque fingerprint at its timestamp frontier', () => {
  const importedAt = new Date('2026-09-15T10:00:00.000Z');
  const source: ChainCursor = {
    _id: 'TRON:TOKEN:Transfer',
    chain: 'TRON',
    contractAlias: 'TOKEN',
    contractAddress: tronConfig.contractAddress,
    eventName: 'Transfer',
    nextTimestampMs: 5_000,
    fingerprint: 'opaque-page-token',
    updatedAt: new Date('2026-06-11T11:41:25.408Z'),
  };

  assert.deepEqual(legacyBootstrapCursorFields(tronConfig, source, importedAt, 7), {
    nextTimestampMs: 5_000,
    fingerprint: null,
    legacyBootstrapSourceCursorId: 'TRON:TOKEN:Transfer',
    legacyBootstrapSourceCursorUpdatedAt: source.updatedAt,
    legacyBootstrapImportedAt: importedAt,
    legacyBootstrapEventCount: 7,
  });
});

test('legacy bootstrap resolves canonical BSC and TRON sources without env addresses', async () => {
  const seen: string[] = [];
  const store = {
    getCursor: async (event: ContractEventConfig) => {
      seen.push(`${event.chain}:${event.contractAlias}:${event.eventName}`);
      return { _id: `legacy:${event.chain}:${event.contractAlias}:${event.eventName}` };
    },
  } as unknown as LegacyIndexerStore;
  const legacyConfig = {
    legacyContractAliases: [...LEGACY_CONTRACT_ALIASES],
  } as unknown as LegacyIndexerConfig;

  const result = await bootstrapLegacyRuntimeFromDefault(store, legacyConfig);

  assert.equal(result.contractEvents, seen.length);
  assert.equal(result.existingCursorsPreserved, seen.length);
  assert.equal(result.cursorsImported, 0);
  assert.ok(seen.some((identity) => identity.startsWith('BSC:TOKEN:')));
  assert.ok(seen.some((identity) => identity.startsWith('TRON:MINT:')));
});
