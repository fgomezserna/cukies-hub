import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeDomainEvent } from '../normalize.js';
import type { ChainEvent, ContractAlias, EventName } from '../types.js';
import { projectEvent } from './index.js';

type Document = { _id: string; [key: string]: any };
type Update = {
  $set?: Record<string, any>;
  $setOnInsert?: Record<string, any>;
  $unset?: Record<string, any>;
  $inc?: Record<string, number>;
  $addToSet?: Record<string, any>;
};

function matches(document: Document, filter: Record<string, any>): boolean {
  if (Array.isArray(filter.$or)) {
    const { $or, ...rest } = filter;
    return matches(document, rest) && $or.some((item: Record<string, any>) => matches(document, item));
  }

  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$exists' in expected) return (actual !== undefined) === expected.$exists;
      if ('$in' in expected) return expected.$in.includes(actual);
    }
    return actual === expected;
  });
}

function applyUpdate(document: Document, update: Update, inserting: boolean) {
  if (inserting) Object.assign(document, structuredClone(update.$setOnInsert ?? {}));
  Object.assign(document, structuredClone(update.$set ?? {}));
  for (const key of Object.keys(update.$unset ?? {})) delete document[key];
  for (const [key, value] of Object.entries(update.$inc ?? {})) {
    document[key] = Number(document[key] ?? 0) + value;
  }
  for (const [key, value] of Object.entries(update.$addToSet ?? {})) {
    const current = Array.isArray(document[key]) ? document[key] : [];
    if (!current.some((item: unknown) => item === value)) current.push(structuredClone(value));
    document[key] = current;
  }
}

class MemoryCollection {
  readonly documents = new Map<string, Document>();
  private sequence = 0;

  constructor(private readonly name: string) {}

  async findOne(filter: Record<string, any>) {
    return [...this.documents.values()].find((document) => matches(document, filter)) ?? null;
  }

  async updateOne(
    filter: Record<string, any>,
    update: Update,
    options: { upsert?: boolean } = {},
  ) {
    const existing = [...this.documents.values()].find((document) => matches(document, filter));
    if (existing) {
      applyUpdate(existing, update, false);
      return { matchedCount: 1, upsertedCount: 0 };
    }
    if (!options.upsert) return { matchedCount: 0, upsertedCount: 0 };

    this.sequence += 1;
    const id = String(
      filter._id
      ?? update.$setOnInsert?._id
      ?? filter.tokenId
      ?? filter.addressNormalized
      ?? `${this.name}:${this.sequence}`,
    );
    const inserted: Document = { _id: id };
    for (const [key, value] of Object.entries(filter)) {
      if (!key.startsWith('$') && (typeof value !== 'object' || value === null)) inserted[key] = value;
    }
    applyUpdate(inserted, update, true);
    this.documents.set(id, inserted);
    return { matchedCount: 0, upsertedCount: 1 };
  }

  async updateMany(filter: Record<string, any>, update: Update) {
    const documents = [...this.documents.values()].filter((document) => matches(document, filter));
    for (const document of documents) applyUpdate(document, update, false);
    return { matchedCount: documents.length, modifiedCount: documents.length };
  }

  aggregate<T>(pipeline: Array<Record<string, any>>) {
    let rows = [...this.documents.values()];
    for (const stage of pipeline) {
      if (stage.$match) rows = rows.filter((document) => matches(document, stage.$match));
      if (stage.$group?.points?.$sum === '$points') {
        const points = rows.reduce((total, document) => total + Number(document.points ?? 0), 0);
        rows = rows.length > 0 ? [{ _id: 'summary', points }] : [];
      }
    }
    return { toArray: async () => structuredClone(rows) as T[] };
  }
}

function memoryStore() {
  const collections = new Map<string, MemoryCollection>();
  const getCollection = (name: string) => {
    const existing = collections.get(name);
    if (existing) return existing;
    const created = new MemoryCollection(name);
    collections.set(name, created);
    return created;
  };
  const session = {
    withTransaction: async (work: () => Promise<unknown>) => work(),
    endSession: async () => undefined,
  };

  return {
    collections,
    store: {
      db: {
        client: { startSession: () => session },
        collection: getCollection,
      },
      cursors: () => getCollection('chain_cursors'),
    },
  };
}

const marketplaceAddress = '0x0000000000000000000000000000000000001001';
const tokenAddress = '0x0000000000000000000000000000000000001002';
const pointsAddress = '0x0000000000000000000000000000000000001003';
const stakingAddress = '0x0000000000000000000000000000000000001004';
const seller = '0x00000000000000000000000000000000000000AA';
const buyer = '0x00000000000000000000000000000000000000BB';

function contractAddress(alias: ContractAlias) {
  if (alias === 'MARKETPLACE') return marketplaceAddress;
  if (alias === 'POINTS') return pointsAddress;
  if (alias === 'STAKING_POINTS') return stakingAddress;
  return tokenAddress;
}

function stageEvent(input: {
  eventName: EventName;
  alias: ContractAlias;
  args: Record<string, unknown>;
  blockNumber: number;
  logIndex?: number;
}): ChainEvent {
  const logIndex = input.logIndex ?? 0;
  return {
    _id: `BSC:97:${input.alias}:${input.eventName}:${input.blockNumber}:${logIndex}`,
    chain: 'BSC',
    chainId: 97,
    contractAlias: input.alias,
    contractAddress: contractAddress(input.alias),
    eventName: input.eventName,
    txHash: `0x${input.blockNumber.toString(16).padStart(64, '0')}`,
    logIndex,
    blockNumber: input.blockNumber,
    blockHash: `0x${(input.blockNumber + 1).toString(16).padStart(64, '0')}`,
    timestampMs: input.blockNumber * 1_000,
    args: input.args as never,
    normalized: normalizeDomainEvent('BSC', input.eventName, input.alias, input.args),
    raw: {},
    status: 'projecting',
    attempts: 1,
    schemaVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function seedVerifiedCursor(context: ReturnType<typeof memoryStore>, event: ChainEvent) {
  const cursors = context.store.cursors();
  cursors.documents.set(`${event.contractAlias}:${event.eventName}`, {
    _id: `${event.contractAlias}:${event.eventName}`,
    chain: 'BSC',
    contractAlias: event.contractAlias,
    eventName: event.eventName,
    contractAddress: event.contractAddress,
    bootstrapStatus: 'verified',
    bootstrapVerifiedAt: new Date(),
    verifiedChainId: 97,
    contractCodeHash: `0x${'1'.repeat(64)}`,
    contractConfigHash: `0x${'2'.repeat(64)}`,
    contractDeploymentTxHash: `0x${'3'.repeat(64)}`,
    contractDeploymentBlock: 1,
    bootstrapStartBlock: 1,
  });
}

async function projectStage(context: ReturnType<typeof memoryStore>, event: ChainEvent) {
  if (event.contractAlias === 'MARKETPLACE' || event.contractAlias === 'TOKEN') {
    seedVerifiedCursor(context, event);
  }
  assert.equal(await projectEvent(context.store as never, event), null);
}

function listingEvent(tokenId: string, blockNumber: number) {
  return stageEvent({
    eventName: 'TokenOnSale',
    alias: 'MARKETPLACE',
    blockNumber,
    args: { tokenId, owner: seller, price: 1_000_000_000_000_000_000n, fee: 0n },
  });
}

describe('legacy marketplace Stage projectors', () => {
  it('requires active owner-bound evidence and invalidates a listing when the Cukie is staked', async () => {
    const context = memoryStore();
    await projectStage(context, listingEvent('1', 10));

    const listed = context.collections.get('cukies')!.documents.get('1')!;
    assert.equal(listed.state, 'onSale');
    assert.equal(listed.marketplaceListingStatus, 'active');
    assert.equal(listed.marketplaceListingChain, 'BSC');
    assert.equal(listed.marketplaceListingOwnerNormalized, seller.toLowerCase());

    await projectStage(context, stageEvent({
      eventName: 'Stake',
      alias: 'STAKING_POINTS',
      blockNumber: 11,
      args: { tokenId: 1n, user: seller, points: 100n },
    }));

    assert.equal(listed.state, 'staking');
    assert.equal(listed.price, 0);
    assert.equal(listed.marketplaceListingStatus, 'invalid');
    assert.equal(listed.marketplaceListingInvalidReason, 'staking');
    assert.equal(context.collections.get('marketplace_listings')!.documents.get('1')!.status, 'invalid');
  });

  it('retains listing ownership on price changes and invalidates a wallet transfer', async () => {
    const context = memoryStore();
    await projectStage(context, listingEvent('2', 20));
    await projectStage(context, stageEvent({
      eventName: 'MarketTokenPriceChanged',
      alias: 'MARKETPLACE',
      blockNumber: 21,
      args: { tokenId: 2n, newPrice: 2_000_000_000_000_000_000n, newFee: 0n },
    }));

    const listed = context.collections.get('cukies')!.documents.get('2')!;
    assert.equal(listed.ownerNormalized, seller.toLowerCase());
    assert.equal(listed.marketplaceListingOwnerNormalized, seller.toLowerCase());
    assert.equal(listed.marketplaceListingStatus, 'active');

    await projectStage(context, stageEvent({
      eventName: 'Transfer',
      alias: 'TOKEN',
      blockNumber: 22,
      args: { tokenId: 2n, from: seller, to: buyer },
    }));

    assert.equal(listed.ownerNormalized, buyer.toLowerCase());
    assert.equal(listed.state, 'available');
    assert.equal(listed.marketplaceListingStatus, 'invalid');
    assert.equal(listed.marketplaceListingInvalidReason, 'transfer');
  });

  it('materializes cancellation and purchase as terminal listing states', async () => {
    const context = memoryStore();
    await projectStage(context, listingEvent('3', 30));
    await projectStage(context, stageEvent({
      eventName: 'MarketTokenSaleCancelled',
      alias: 'MARKETPLACE',
      blockNumber: 31,
      args: { tokenId: 3n },
    }));
    assert.equal(context.collections.get('cukies')!.documents.get('3')!.marketplaceListingStatus, 'cancelled');
    assert.equal(context.collections.get('marketplace_listings')!.documents.get('3')!.status, 'cancelled');

    await projectStage(context, listingEvent('4', 32));
    await projectStage(context, stageEvent({
      eventName: 'TokenBought',
      alias: 'MARKETPLACE',
      blockNumber: 33,
      args: { tokenId: 4n, newOwner: buyer },
    }));
    const sold = context.collections.get('cukies')!.documents.get('4')!;
    assert.equal(sold.marketplaceListingStatus, 'sold');
    assert.equal(sold.ownerNormalized, buyer.toLowerCase());
    assert.equal(context.collections.get('marketplace_listings')!.documents.get('4')!.status, 'sold');
  });

  it('recomputes CukiePoints absolutely on replay and repairs a missing balance', async () => {
    const context = memoryStore();
    const mint = stageEvent({
      eventName: 'Mint',
      alias: 'POINTS',
      blockNumber: 40,
      args: { user: seller, points: 500n },
    });
    await projectStage(context, mint);
    await projectStage(context, mint);

    const transactions = context.collections.get('point_transactions')!;
    const balances = context.collections.get('point_balances')!;
    assert.equal(transactions.documents.size, 1);
    assert.equal(balances.documents.get(seller.toLowerCase())!.points, 500);
    assert.equal(transactions.documents.get(mint._id)!.chainId, 97);

    balances.documents.clear();
    await projectStage(context, mint);
    assert.equal(balances.documents.get(seller.toLowerCase())!.points, 500);

    const burn = stageEvent({
      eventName: 'Burn',
      alias: 'POINTS',
      blockNumber: 41,
      args: { user: seller, points: 200n },
    });
    await projectStage(context, burn);
    await projectStage(context, burn);
    assert.equal(transactions.documents.size, 2);
    assert.equal(balances.documents.get(seller.toLowerCase())!.points, 300);
  });
});
