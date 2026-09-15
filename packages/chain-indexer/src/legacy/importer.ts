import { MongoClient, type Document } from 'mongodb';

import { getContractAliasByAddress } from '../config/contracts.js';
import { resolveMongoDatabaseNameFromUrl } from '../config/env.js';
import { normalizeDomainEvent } from '../normalize.js';
import type { ChainEvent, ChainName, EventName } from '../types.js';
import type { IndexerStore } from '../storage/index.js';
import { runtimeScopedStorageId } from '../storage/runtime-scope.js';
import {
  normalizeLegacyNetwork,
  tryLegacyCukieIdentity,
} from './identity.js';
import {
  normalizeTronArgs,
  now,
  toJsonRecord,
} from '../utils/json.js';

const supportedEventNames = new Set<EventName>([
  'Transfer',
  'Approval',
  'ApprovalForAll',
  'MinterAdded',
  'MinterRemoved',
  'OwnershipRenounced',
  'OwnershipTransferred',
  'OwnershipTransferStarted',
  'Paused',
  'Unpaused',
  'Mint',
  'Burn',
  'Stake',
  'Unstake',
  'BreedStart',
  'BreedFinish',
  'TokenOnSale',
  'TokenBought',
  'MarketTokenSaleCancelled',
  'MarketTokenPriceChanged',
  'JumpInBridge',
  'JumpOutBridge',
  'MintReferral',
  'BridgeRequested',
  'BridgeCompleted',
  'RelayerUpdated',
  'BridgePriceUpdated',
  'FeeRecipientUpdated',
  'UntrackedERC721Recovered',
  'CollectionAllowedUpdated',
  'PaymentTokenAllowedUpdated',
  'NativePaymentAllowedUpdated',
  'FeeConfigUpdated',
  'NativeFeesClaimed',
]);

type LegacyProcessedEvent = {
  _id: string;
  blockNumber?: number | string;
  contractAddress?: string;
  data?: Record<string, unknown>;
  eventName?: string;
  network?: string;
  timeStamp?: number | string;
  transactionId?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type LegacyCukiDocument = {
  _id: string | number;
  img?: unknown;
  type?: unknown;
  cukiNumber?: unknown;
  skills?: unknown;
  children?: unknown;
  parents?: unknown;
  numChildren?: unknown;
  numChildrenTron?: unknown;
  numChildrenBsc?: unknown;
  origin?: unknown;
  birthNetwork?: unknown;
  user?: unknown;
  network?: unknown;
  state?: unknown;
  price?: unknown;
  priceOriginal?: unknown;
  timeStamp?: unknown;
};

const legacyMetadataNetworks = ['BSC', 'TRON', 'bsc', 'tron'] as const;

function asChain(value: unknown): ChainName | null {
  return normalizeLegacyNetwork(value);
}

function asEventName(value: unknown): EventName | null {
  if (typeof value !== 'string') return null;
  return supportedEventNames.has(value as EventName) ? (value as EventName) : null;
}

function normalizeTimestampMs(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed < 10_000_000_000 ? parsed * 1000 : parsed;

    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.getTime();
  }

  return Date.now();
}

function parseLogIndex(document: LegacyProcessedEvent) {
  const match = String(document._id).match(/_(\d+)$/);
  if (match) return Number(match[1]);
  return 0;
}

export function convertLegacyEvent(document: LegacyProcessedEvent): ChainEvent | null {
  const chain = asChain(document.network);
  const eventName = asEventName(document.eventName);
  const contractAddress = document.contractAddress;
  const txHash = document.transactionId;

  if (!chain || !eventName || !contractAddress || !txHash) return null;

  const contractAlias = getContractAliasByAddress(chain, contractAddress);
  if (!contractAlias) return null;

  const logIndex = parseLogIndex(document);
  const rawArgs = document.data ?? {};
  const argsRaw = chain === 'TRON' ? normalizeTronArgs(rawArgs) : rawArgs;
  const args = toJsonRecord(argsRaw);
  const timestampMs = normalizeTimestampMs(document.timeStamp);
  const createdAt = now();

  return {
    _id: runtimeScopedStorageId(
      'legacy',
      `${chain}:${contractAlias}:${eventName}:${txHash}:${logIndex}`,
    ),
    chain,
    contractAlias,
    contractAddress,
    eventName,
    txHash,
    logIndex,
    blockNumber: Number(document.blockNumber ?? 0),
    timestampMs,
    args,
    normalized: normalizeDomainEvent(chain, eventName, contractAlias, argsRaw),
    raw: toJsonRecord({
      source: 'legacy.processedEvents',
      legacyId: String(document._id),
      ...document,
    }),
    runtimeScope: 'legacy',
    status: 'ingested',
    attempts: 0,
    schemaVersion: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

export async function importLegacyProcessedEvents(
  store: IndexerStore,
  legacyMongoUrl: string,
  limit: number,
  networks?: ChainName[],
  configuredLegacyDbName?: string,
) {
  const legacyDbName = configuredLegacyDbName
    ?? resolveMongoDatabaseNameFromUrl(legacyMongoUrl, 'CUKIES_DATABASE_URL');
  const client = new MongoClient(legacyMongoUrl);
  await client.connect();

  try {
    const legacyDb = client.db(legacyDbName);
    const filter = networks?.length ? { network: { $in: networks } } : {};
    const cursor = legacyDb
      .collection<LegacyProcessedEvent & Document>('processedEvents')
      .find(filter)
      .sort({ timeStamp: 1, _id: 1 })
      .limit(limit);

    let scanned = 0;
    let skipped = 0;
    let inserted = 0;
    let batch: ChainEvent[] = [];

    for await (const document of cursor) {
      scanned += 1;
      const event = convertLegacyEvent(document);

      if (!event) {
        skipped += 1;
        continue;
      }

      batch.push(event);

      if (batch.length >= 1000) {
        const result = await store.upsertEvents(batch);
        inserted += result.inserted;
        batch = [];
      }
    }

    if (batch.length > 0) {
      const result = await store.upsertEvents(batch);
      inserted += result.inserted;
    }

    return { scanned, inserted, skipped };
  } finally {
    await client.close();
  }
}

function relationIds(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const ids = value
    .map((item) => {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'bigint') {
        return String(item);
      }

      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const id = record._id ?? record.tokenId ?? record.id;
        if (typeof id === 'string' || typeof id === 'number' || typeof id === 'bigint') {
          return String(id);
        }
      }

      return null;
    })
    .filter((item): item is string => item !== null);

  return ids.length > 0 ? ids : undefined;
}

function metadataSet(document: LegacyCukiDocument, identity: NonNullable<ReturnType<typeof tryLegacyCukieIdentity>>) {
  return Object.fromEntries(
    Object.entries({
      chain: identity.chain,
      ...(identity.chainId === undefined ? {} : { chainId: identity.chainId }),
      network: identity.network,
      collectionAddress: identity.collectionAddress,
      collectionAddressNormalized: identity.collectionAddressNormalized,
      tokenId: identity.tokenId,
      img: document.img,
      type: document.type,
      cukiNumber: document.cukiNumber,
      skills: document.skills,
      numChildren: document.numChildren,
      numChildrenTron: document.numChildrenTron,
      numChildrenBsc: document.numChildrenBsc,
      needsMetadata: false,
      metadataSource: 'legacy.cukies',
      legacyProjectionKind: 'canonical',
    }).filter(([, value]) => value !== undefined),
  );
}

function metadataInsertSet(document: LegacyCukiDocument) {
  return Object.fromEntries(
    Object.entries({
      // These are source metadata defaults only. $setOnInsert is deliberate:
      // a runtime event projection owns them once the canonical document exists.
      parents: relationIds(document.parents),
      children: relationIds(document.children),
      origin: document.origin,
      birthNetwork: document.birthNetwork,
    }).filter(([, value]) => value !== undefined),
  );
}

export type LegacyCukieMetadataUpdate = {
  updateOne: {
    filter: { _id: string };
    update: {
      $set: Record<string, unknown>;
      $setOnInsert: Record<string, unknown>;
    };
    upsert: true;
  };
};

/**
 * Build the destination upsert for one validated numeric legacy source row.
 * Ownership/state/event fields intentionally never occur in either update
 * operator; callers can safely replay this operation against a projected NFT.
 */
export function buildLegacyCukieMetadataUpdate(
  document: LegacyCukiDocument,
  importedAt = now(),
): LegacyCukieMetadataUpdate | null {
  const identity = tryLegacyCukieIdentity(document.network, document._id);
  if (!identity) return null;

  return {
    updateOne: {
      filter: { _id: identity.documentId },
      update: {
        $set: metadataSet(document, identity),
        $setOnInsert: {
          _id: identity.documentId,
          createdAt: importedAt,
          metadataImportedAt: importedAt,
          ...metadataInsertSet(document),
        },
      },
      upsert: true,
    },
  };
}

export function legacyMetadataSourceFilter(): Document {
  return {
    network: { $in: legacyMetadataNetworks },
    // The unified database contains destination documents with compound ids.
    // Only numeric source snapshots are eligible, so a same-DB run cannot
    // feed its own `${chain}:${network}:${collection}:${tokenId}` documents
    // back into the importer.
    $or: [
      { _id: { $type: 'number' } },
      { _id: { $type: 'string', $regex: /^\d+$/ } },
    ],
  };
}

export async function importLegacyCukiesMetadata(
  store: IndexerStore,
  legacyMongoUrl: string,
  limit: number,
  configuredLegacyDbName?: string,
) {
  const legacyDbName = configuredLegacyDbName
    ?? resolveMongoDatabaseNameFromUrl(legacyMongoUrl, 'CUKIES_DATABASE_URL');
  const client = new MongoClient(legacyMongoUrl);
  await client.connect();

  try {
    const legacyDb = client.db(legacyDbName);
    const cursor = legacyDb
      .collection<LegacyCukiDocument & Document>('cukies')
      .find(legacyMetadataSourceFilter())
      .sort({ _id: 1 })
      .limit(limit);

    let scanned = 0;
    let matched = 0;
    let modified = 0;
    let upserted = 0;
    let skipped = 0;
    let batch: Array<LegacyCukieMetadataUpdate> = [];

    async function flush() {
      if (batch.length === 0) return;

      const result = await store.db.collection<{ _id: string }>('cukies').bulkWrite(
        batch,
        { ordered: true },
      );

      matched += result.matchedCount;
      modified += result.modifiedCount;
      upserted += result.upsertedCount;
      batch = [];
    }

    for await (const document of cursor) {
      scanned += 1;
      const update = buildLegacyCukieMetadataUpdate(document);
      if (!update) {
        skipped += 1;
        continue;
      }
      batch.push(update);

      if (batch.length >= 1000) {
        await flush();
      }
    }

    await flush();

    return { scanned, matched, modified, upserted, skipped };
  } finally {
    await client.close();
  }
}
