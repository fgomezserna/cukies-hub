import type { Document, Filter } from 'mongodb';

import { getContractEventConfigs } from '../config/contracts.js';
import type { LegacyIndexerConfig } from '../config/legacy-env.js';
import type { ChainCursor, ChainEvent, ContractEventConfig } from '../types.js';
import { now } from '../utils/json.js';
import { runtimeScopedStorageId } from '../storage/runtime-scope.js';
import { importLegacyCukiesMetadata } from './importer.js';
import {
  LEGACY_CONTRACT_ALIASES,
  type LegacyContractAlias,
} from './contracts.js';
import type { LegacyIndexerStore } from './storage/mongo.js';

type LegacyBootstrapCursorFields = Partial<ChainCursor> & {
  legacyBootstrapSourceCursorId: string;
  legacyBootstrapSourceCursorUpdatedAt?: Date;
  legacyBootstrapImportedAt: Date;
  legacyBootstrapEventCount: number;
};

function exactAddressFilter(config: ContractEventConfig) {
  if (config.chain === 'TRON') return config.contractAddress;
  const escaped = config.contractAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

function isSameAddress(config: ContractEventConfig, candidate: unknown) {
  return typeof candidate === 'string'
    && (config.chain === 'BSC'
      ? candidate.toLowerCase() === config.contractAddress.toLowerCase()
      : candidate === config.contractAddress);
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function historicalDefaultEventFilter(
  config: ContractEventConfig,
  sourceCursor?: Pick<ChainCursor, 'nextBlock' | 'nextTimestampMs' | 'fingerprint'> | null,
): Filter<ChainEvent> {
  const boundaries: Document[] = [];
  if (config.chain === 'BSC' && safeInteger(sourceCursor?.nextBlock)) {
    boundaries.push({ blockNumber: { $lt: sourceCursor.nextBlock } });
  }
  if (config.chain === 'TRON' && safeInteger(sourceCursor?.nextTimestampMs)) {
    // TronGrid's fingerprint is an opaque continuation token, not a durable
    // event identity.  The bootstrap therefore copies only rows strictly
    // before the timestamp frontier and restarts the legacy cursor at that
    // timestamp when a fingerprint is present.  That replay is idempotent and
    // covers every event within the frontier without relying on createdAt.
    boundaries.push({ timestampMs: { $lt: sourceCursor.nextTimestampMs } });
  }

  return {
    $and: [
      {
        chain: config.chain,
        contractAlias: config.contractAlias,
        contractAddress: exactAddressFilter(config),
        eventName: config.eventName,
      },
      {
        $or: [
          { runtimeScope: { $exists: false } },
          { runtimeScope: 'default' },
        ],
      },
      ...boundaries,
    ],
  } as Filter<ChainEvent>;
}

/**
 * Rebuilds the durable identity instead of trusting an old document _id. The
 * cloned row is always projected again by the legacy projector and is safe to
 * replay through Mongo's unique _id.
 */
export function cloneHistoricalEventForLegacy(
  source: ChainEvent,
  config: ContractEventConfig,
  importedAt = now(),
): ChainEvent {
  if (
    source.runtimeScope === 'legacy'
    || source.chain !== config.chain
    || source.contractAlias !== config.contractAlias
    || source.eventName !== config.eventName
    || !isSameAddress(config, source.contractAddress)
    || typeof source.txHash !== 'string'
    || source.txHash.trim() === ''
    || !safeInteger(source.logIndex)
    || !safeInteger(source.blockNumber)
    || !safeInteger(source.timestampMs)
  ) {
    throw new Error(`Evento historico incompatible con ${config.chain}:${config.contractAlias}:${config.eventName}.`);
  }

  const {
    _id: ignoredId,
    runtimeScope: ignoredRuntimeScope,
    chainId: ignoredChainId,
    status: ignoredStatus,
    attempts: ignoredAttempts,
    lockedAt: ignoredLockedAt,
    projectedAt: ignoredProjectedAt,
    lastError: ignoredLastError,
    ...durablePayload
  } = source;
  void ignoredId;
  void ignoredRuntimeScope;
  void ignoredChainId;
  void ignoredStatus;
  void ignoredAttempts;
  void ignoredLockedAt;
  void ignoredProjectedAt;
  void ignoredLastError;

  const baseId = `${config.chain}:${config.contractAlias}:${config.eventName}:${source.txHash}:${source.logIndex}`;
  return {
    ...durablePayload,
    _id: runtimeScopedStorageId('legacy', baseId),
    runtimeScope: 'legacy',
    ...(config.chain === 'BSC' ? { chainId: 56 as const } : {}),
    status: 'ingested',
    attempts: 0,
    createdAt: source.createdAt instanceof Date ? source.createdAt : importedAt,
    updatedAt: importedAt,
  };
}

export function legacyBootstrapCursorFields(
  config: ContractEventConfig,
  source: ChainCursor,
  importedAt: Date,
  eventCount: number,
): LegacyBootstrapCursorFields {
  const expectedId = runtimeScopedStorageId('default', `${config.chain}:${config.contractAlias}:${config.eventName}`);
  if (
    source._id !== expectedId
    || source.chain !== config.chain
    || source.contractAlias !== config.contractAlias
    || source.eventName !== config.eventName
    || !isSameAddress(config, source.contractAddress)
  ) {
    throw new Error(`Cursor historico incompatible con ${expectedId}.`);
  }

  const progress: Partial<ChainCursor> = {};
  if (config.chain === 'BSC') {
    if (!safeInteger(source.nextBlock)) {
      throw new Error(`Cursor historico ${expectedId} sin nextBlock BSC valido.`);
    }
    progress.nextBlock = source.nextBlock;
    if (safeInteger(source.safeBlock)) progress.safeBlock = source.safeBlock;
    if (safeInteger(source.adaptiveRange)) progress.adaptiveRange = source.adaptiveRange;
    if (safeInteger(source.adaptiveSuccesses)) progress.adaptiveSuccesses = source.adaptiveSuccesses;
  } else {
    if (!safeInteger(source.nextTimestampMs)) {
      throw new Error(`Cursor historico ${expectedId} sin nextTimestampMs TRON valido.`);
    }
    progress.nextTimestampMs = source.nextTimestampMs;
    // A TRON fingerprint cannot be mapped to a row in the historical
    // chain_events collection.  Replaying from the timestamp frontier is the
    // only durable boundary that preserves events at that timestamp.
    progress.fingerprint = null;
  }

  return {
    ...progress,
    legacyBootstrapSourceCursorId: expectedId,
    ...(source.updatedAt instanceof Date
      ? { legacyBootstrapSourceCursorUpdatedAt: source.updatedAt }
      : {}),
    legacyBootstrapImportedAt: importedAt,
    legacyBootstrapEventCount: eventCount,
  };
}

async function sourceCursor(store: LegacyIndexerStore, config: ContractEventConfig) {
  const id = runtimeScopedStorageId('default', `${config.chain}:${config.contractAlias}:${config.eventName}`);
  return store.cursors().findOne({
    _id: id,
    $or: [
      { runtimeScope: { $exists: false } },
      { runtimeScope: 'default' },
    ],
  });
}

async function bootstrapContractEvent(
  store: LegacyIndexerStore,
  config: ContractEventConfig,
  importedAt: Date,
) {
  const existingLegacyCursor = await store.getCursor(config);
  if (existingLegacyCursor) {
    return {
      cursorId: runtimeScopedStorageId('legacy', `${config.chain}:${config.contractAlias}:${config.eventName}`),
      sourceCursorId: null,
      scanned: 0,
      inserted: 0,
      cursorImported: false,
      existingCursorPreserved: true,
    };
  }

  const cursor = await sourceCursor(store, config);
  const rows = store.events()
    .find(historicalDefaultEventFilter(config, cursor))
    .sort({ timestampMs: 1, blockNumber: 1, logIndex: 1, _id: 1 });
  let scanned = 0;
  let inserted = 0;
  let batch: ChainEvent[] = [];

  async function flush() {
    if (batch.length === 0) return;
    const result = await store.upsertEvents(batch);
    inserted += result.inserted;
    batch = [];
  }

  for await (const row of rows) {
    scanned += 1;
    batch.push(cloneHistoricalEventForLegacy(row, config, importedAt));
    if (batch.length >= 1000) await flush();
  }
  await flush();

  // The source cursor is copied only after every event preceding its snapshot
  // has been durably upserted. A failure therefore leaves the legacy cursor at
  // its previous position and the operation can be replayed safely.
  if (cursor) {
    await store.updateCursor(
      config,
      legacyBootstrapCursorFields(config, cursor, importedAt, scanned),
    );
  }

  return {
    cursorId: runtimeScopedStorageId('legacy', `${config.chain}:${config.contractAlias}:${config.eventName}`),
    sourceCursorId: cursor?._id ?? null,
    scanned,
    inserted,
    cursorImported: Boolean(cursor),
    existingCursorPreserved: false,
  };
}

export async function bootstrapLegacyRuntimeFromDefault(
  store: LegacyIndexerStore,
  config: LegacyIndexerConfig,
) {
  const importedAt = now();
  const contractEvents = getContractEventConfigs(
    ['BSC', 'TRON'],
    { contractAliases: [...LEGACY_CONTRACT_ALIASES] },
  ).filter((event) => config.legacyContractAliases.includes(event.contractAlias as LegacyContractAlias));
  const results = [];

  for (const contractEvent of contractEvents) {
    results.push(await bootstrapContractEvent(store, contractEvent, importedAt));
  }

  return {
    scanned: results.reduce((sum, result) => sum + result.scanned, 0),
    inserted: results.reduce((sum, result) => sum + result.inserted, 0),
    cursorsImported: results.filter((result) => result.cursorImported).length,
    existingCursorsPreserved: results.filter((result) => result.existingCursorPreserved).length,
    contractEvents: results.length,
    results,
  };
}

export async function bootstrapLegacyProjectionSources(
  store: LegacyIndexerStore,
  config: LegacyIndexerConfig,
) {
  // Import metadata first so event projection updates ownership/state without
  // replacing immutable image, rarity or family relationships with defaults.
  const metadata = await importLegacyCukiesMetadata(
    store,
    config.mongoUrl,
    0,
    config.dbName,
  );
  const runtime = await bootstrapLegacyRuntimeFromDefault(store, config);
  return { metadata, runtime };
}
