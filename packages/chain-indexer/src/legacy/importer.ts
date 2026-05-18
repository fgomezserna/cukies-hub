import { MongoClient, type Document } from 'mongodb';

import { getContractAliasByAddress } from '../config/contracts.js';
import { normalizeDomainEvent } from '../normalize.js';
import type { ChainEvent, ChainName, EventName } from '../types.js';
import type { IndexerStore } from '../storage/index.js';
import {
  normalizeTronArgs,
  now,
  toJsonRecord,
} from '../utils/json.js';

const supportedEventNames = new Set<EventName>([
  'Transfer',
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
  _id: string;
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

function asChain(value: unknown): ChainName | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase();
  if (normalized === 'BSC' || normalized === 'TRON') return normalized;
  return null;
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

function convertLegacyEvent(document: LegacyProcessedEvent): ChainEvent | null {
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
    _id: `${chain}:${contractAlias}:${eventName}:${txHash}:${logIndex}`,
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
) {
  const client = new MongoClient(legacyMongoUrl);
  await client.connect();

  try {
    const legacyDb = client.db('cukies');
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

function metadataSet(document: LegacyCukiDocument) {
  return Object.fromEntries(
    Object.entries({
      tokenId: String(document._id),
      img: document.img,
      type: document.type,
      cukiNumber: document.cukiNumber,
      skills: document.skills,
      parents: relationIds(document.parents),
      children: relationIds(document.children),
      numChildren: document.numChildren,
      numChildrenTron: document.numChildrenTron,
      numChildrenBsc: document.numChildrenBsc,
      origin: document.origin,
      birthNetwork: document.birthNetwork,
      needsMetadata: false,
      metadataSource: 'legacy.cukies',
      metadataImportedAt: now(),
      updatedAt: now(),
    }).filter(([, value]) => value !== undefined),
  );
}

function normalizeLegacyOwner(network: unknown, owner: unknown) {
  if (typeof owner !== 'string' || owner.length === 0) return undefined;
  if (typeof network === 'string' && network.toUpperCase() === 'BSC') return owner.toLowerCase();
  return owner.toUpperCase();
}

function legacyStateSet(document: LegacyCukiDocument) {
  const owner = document.user;

  return Object.fromEntries(
    Object.entries({
      user: owner,
      owner,
      ownerNormalized: normalizeLegacyOwner(document.network, owner),
      network: document.network,
      state: document.state,
      price: document.price,
      priceOriginal: document.priceOriginal,
      timeStamp: document.timeStamp,
    }).filter(([, value]) => value !== undefined),
  );
}

export async function importLegacyCukiesMetadata(
  store: IndexerStore,
  legacyMongoUrl: string,
  limit: number,
) {
  const client = new MongoClient(legacyMongoUrl);
  await client.connect();

  try {
    const legacyDb = client.db('cukies');
    const cursor = legacyDb
      .collection<LegacyCukiDocument & Document>('cukies')
      .find({})
      .sort({ _id: 1 })
      .limit(limit);

    let scanned = 0;
    let matched = 0;
    let modified = 0;
    let upserted = 0;
    let batch: Array<LegacyCukiDocument & Document> = [];

    async function flush() {
      if (batch.length === 0) return;

      const result = await store.db.collection<{ _id: string }>('cukies').bulkWrite(
        batch.flatMap((document) => [
          {
            updateOne: {
              filter: { _id: String(document._id) },
              update: {
                $set: metadataSet(document),
                $setOnInsert: {
                  _id: String(document._id),
                  createdAt: now(),
                  ...legacyStateSet(document),
                },
              },
              upsert: true,
            },
          },
          {
            updateOne: {
              filter: { _id: String(document._id), lastEventId: { $exists: false } },
              update: {
                $set: legacyStateSet(document),
              },
            },
          },
        ]),
        { ordered: true },
      );

      matched += result.matchedCount;
      modified += result.modifiedCount;
      upserted += result.upsertedCount;
      batch = [];
    }

    for await (const document of cursor) {
      scanned += 1;
      batch.push(document);

      if (batch.length >= 1000) {
        await flush();
      }
    }

    await flush();

    return { scanned, matched, modified, upserted };
  } finally {
    await client.close();
  }
}
