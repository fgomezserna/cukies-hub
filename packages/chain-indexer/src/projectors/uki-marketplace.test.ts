import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeDomainEvent } from '../normalize.js';
import type { ChainEvent, EventName } from '../types.js';
import { projectEvent } from './index.js';

type Document = { _id: string; [key: string]: any };
type Update = {
  $set?: Record<string, any>;
  $setOnInsert?: Record<string, any>;
};

function matches(document: Document, filter: Record<string, any>) {
  return Object.entries(filter).every(([key, expected]) => document[key] === expected);
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
      Object.assign(existing, structuredClone(update.$set ?? {}));
      return { matchedCount: 1, upsertedCount: 0 };
    }
    if (!options.upsert) return { matchedCount: 0, upsertedCount: 0 };

    this.sequence += 1;
    const id = String(filter._id ?? update.$setOnInsert?._id ?? `${this.name}:${this.sequence}`);
    const inserted: Document = { _id: id };
    for (const [key, value] of Object.entries(filter)) {
      if (typeof value !== 'object' || value === null) inserted[key] = value;
    }
    Object.assign(inserted, structuredClone(update.$setOnInsert ?? {}));
    Object.assign(inserted, structuredClone(update.$set ?? {}));
    this.documents.set(id, inserted);
    return { matchedCount: 0, upsertedCount: 1 };
  }

  async insertOne(document: Record<string, unknown>) {
    const id = String(document._id);
    if (this.documents.has(id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    this.documents.set(id, structuredClone(document) as Document);
    return { acknowledged: true };
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
  return {
    collections,
    store: {
      db: { collection: getCollection },
      cursors: () => getCollection('chain_cursors'),
    },
  };
}

const marketplaceAddress = '0x0000000000000000000000000000000000002001';
const collectionAddress = '0x0000000000000000000000000000000000002002';
const seller = '0x00000000000000000000000000000000000000AA';
const buyer = '0x00000000000000000000000000000000000000bb';
const usdt = '0x00000000000000000000000000000000000000cc';
const nativeToken = '0x0000000000000000000000000000000000000000';
const orderOne = `0x${'1'.repeat(64)}`;
const orderTwo = `0x${'2'.repeat(64)}`;
const invalidReason = `0x${'3'.repeat(64)}`;
const baseTimestampMs = 1_700_000_000_000;

function stageEvent(input: {
  eventName: EventName;
  args: Record<string, unknown>;
  blockNumber: number;
  logIndex?: number;
}): ChainEvent {
  const logIndex = input.logIndex ?? 0;
  return {
    _id: `BSC:97:UKI_MARKETPLACE:${input.eventName}:${input.blockNumber}:${logIndex}`,
    chain: 'BSC',
    chainId: 97,
    contractAlias: 'UKI_MARKETPLACE',
    contractAddress: marketplaceAddress,
    eventName: input.eventName,
    txHash: `0x${input.blockNumber.toString(16).padStart(64, '0')}`,
    logIndex,
    blockNumber: input.blockNumber,
    blockHash: `0x${(input.blockNumber + 10).toString(16).padStart(64, '0')}`,
    timestampMs: baseTimestampMs + input.blockNumber * 1_000,
    args: input.args as never,
    normalized: normalizeDomainEvent(
      'BSC',
      input.eventName,
      'UKI_MARKETPLACE',
      input.args,
    ),
    raw: {},
    status: 'projecting',
    attempts: 1,
    schemaVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function seedVerifiedCursor(context: ReturnType<typeof memoryStore>, event: ChainEvent) {
  context.store.cursors().documents.set(event._id, {
    _id: event._id,
    chain: 'BSC',
    contractAlias: 'UKI_MARKETPLACE',
    contractAddress: marketplaceAddress,
    eventName: event.eventName,
    bootstrapStatus: 'verified',
    bootstrapVerifiedAt: new Date(),
    verifiedChainId: 97,
    contractCodeHash: `0x${'4'.repeat(64)}`,
    contractConfigHash: `0x${'5'.repeat(64)}`,
    contractDeploymentTxHash: `0x${'6'.repeat(64)}`,
    contractDeploymentBlock: 1,
    bootstrapStartBlock: 1,
  });
}

async function projectStage(context: ReturnType<typeof memoryStore>, event: ChainEvent) {
  seedVerifiedCursor(context, event);
  return projectEvent(context.store as never, event);
}

function created(orderId: string, tokenId: bigint, blockNumber: number, nonce: bigint) {
  return stageEvent({
    eventName: 'UkiMarketplaceOrderCreated',
    blockNumber,
    args: {
      orderId,
      collection: collectionAddress,
      tokenId,
      seller,
      ukiPrice: 1_000_000_000_000_000_000_000n,
      expiresAt: 1_800_000_000n,
      nonce,
      feeBps: 1_000n,
    },
  });
}

describe('UKI marketplace Stage projectors', () => {
  it('normalizes lossless order, wallet and payment evidence on chain 97', () => {
    const normalized = normalizeDomainEvent(
      'BSC',
      'UkiMarketplaceOrderCreated',
      'UKI_MARKETPLACE',
      {
        orderId: orderOne,
        collection: collectionAddress,
        tokenId: 7n,
        seller,
        ukiPrice: 1_000_000_000_000_000_000_000n,
        expiresAt: 1_800_000_000n,
        nonce: 1n,
        feeBps: 1_000n,
      },
    );
    assert.equal(normalized.orderId, orderOne);
    assert.equal(normalized.collectionNormalized, collectionAddress.toLowerCase());
    assert.equal(normalized.sellerNormalized, seller.toLowerCase());
    assert.equal(normalized.ukiPriceRaw, '1000000000000000000000');
    assert.equal(normalized.expiresAtRaw, '1800000000');
    assert.equal(normalized.nonceRaw, '1');
    assert.equal(normalized.feeBpsRaw, '1000');
    assert.equal(normalized.status, 'active');

    const filled = normalizeDomainEvent('BSC', 'UkiMarketplaceOrderFilled', 'UKI_MARKETPLACE', {
      orderId: orderOne,
      buyer,
      paymentToken: nativeToken,
      paymentAmount: 2_000n,
      feeAmount: 200n,
      ukiPrice: 1_000n,
    });
    assert.equal(filled.buyerNormalized, buyer.toLowerCase());
    assert.equal(filled.paymentTokenNormalized, nativeToken);
    assert.equal(filled.paymentAmountRaw, '2000');
    assert.equal(filled.feeAmountRaw, '200');
    assert.equal(filled.status, 'sold');
  });

  it('keeps the NFT available while recording a non-custodial active order', async () => {
    const context = memoryStore();
    context.store.db.collection('cukies').documents.set('7', {
      _id: '7',
      tokenId: '7',
      owner: seller,
      ownerNormalized: seller.toLowerCase(),
      state: 'available',
    });

    const createEvent = created(orderOne, 7n, 10, 1n);
    assert.equal(await projectStage(context, createEvent), null);
    assert.equal(await projectStage(context, createEvent), null);

    const documentId = `97:${marketplaceAddress}:${orderOne}`;
    const order = context.collections.get('uki_marketplace_orders')!.documents.get(documentId)!;
    assert.equal(order.status, 'active');
    assert.equal(order.chainId, 97);
    assert.equal(order.collectionAddressNormalized, collectionAddress.toLowerCase());
    assert.equal(order.tokenId, '7');
    assert.equal(order.sellerNormalized, seller.toLowerCase());
    assert.equal(order.ukiPriceRaw, '1000000000000000000000');
    assert.equal(order.feeBps, 1_000);
    assert.equal(order.createdEventId, createEvent._id);
    assert.equal(context.collections.get('cukies')!.documents.get('7')!.state, 'available');
  });

  it('projects a sale exactly once with buyer-currency fee evidence', async () => {
    const context = memoryStore();
    await projectStage(context, created(orderOne, 8n, 20, 1n));
    const filled = stageEvent({
      eventName: 'UkiMarketplaceOrderFilled',
      blockNumber: 21,
      args: {
        orderId: orderOne,
        buyer,
        paymentToken: usdt,
        paymentAmount: 2_200_000n,
        feeAmount: 200_000n,
        ukiPrice: 1_000_000_000_000_000_000_000n,
      },
    });
    assert.equal(await projectStage(context, filled), null);
    assert.equal(await projectStage(context, filled), null);

    const order = context.collections.get('uki_marketplace_orders')!
      .documents.get(`97:${marketplaceAddress}:${orderOne}`)!;
    assert.equal(order.status, 'sold');
    assert.equal(order.buyerNormalized, buyer.toLowerCase());
    assert.equal(order.paymentTokenNormalized, usdt.toLowerCase());
    assert.equal(order.paymentAmountRaw, '2200000');
    assert.equal(order.feeAmountRaw, '200000');
    assert.equal(order.soldEvidence.eventId, filled._id);
  });

  it('keeps independent history when an owner cancels and relists the same Cukie', async () => {
    const context = memoryStore();
    await projectStage(context, created(orderOne, 9n, 30, 1n));
    await projectStage(context, stageEvent({
      eventName: 'UkiMarketplaceOrderCancelled',
      blockNumber: 31,
      args: { orderId: orderOne, seller },
    }));
    await projectStage(context, created(orderTwo, 9n, 32, 2n));

    const orders = context.collections.get('uki_marketplace_orders')!.documents;
    assert.equal(orders.get(`97:${marketplaceAddress}:${orderOne}`)!.status, 'cancelled');
    assert.equal(orders.get(`97:${marketplaceAddress}:${orderTwo}`)!.status, 'active');
    assert.equal(orders.get(`97:${marketplaceAddress}:${orderTwo}`)!.nonceRaw, '2');

    const nonceEvent = stageEvent({
      eventName: 'UkiMarketplaceTokenNonceInvalidated',
      blockNumber: 33,
      args: { collection: collectionAddress, tokenId: 9n, nonce: 3n, owner: seller },
    });
    await projectStage(context, nonceEvent);
    const nonce = [...context.collections.get('uki_marketplace_token_nonces')!.documents.values()][0]!;
    assert.equal(nonce.tokenId, '9');
    assert.equal(nonce.nonceRaw, '3');
    assert.equal(nonce.ownerNormalized, seller.toLowerCase());
  });

  it('projects explicit invalid and expired states without exposing them as active', async () => {
    const context = memoryStore();
    await projectStage(context, created(orderOne, 10n, 40, 1n));
    await projectStage(context, stageEvent({
      eventName: 'UkiMarketplaceOrderInvalidated',
      blockNumber: 41,
      args: { orderId: orderOne, reason: invalidReason },
    }));
    await projectStage(context, created(orderTwo, 11n, 42, 1n));
    await projectStage(context, stageEvent({
      eventName: 'UkiMarketplaceOrderExpired',
      blockNumber: 43,
      args: { orderId: orderTwo },
    }));

    const orders = context.collections.get('uki_marketplace_orders')!.documents;
    const invalid = orders.get(`97:${marketplaceAddress}:${orderOne}`)!;
    const expired = orders.get(`97:${marketplaceAddress}:${orderTwo}`)!;
    assert.equal(invalid.status, 'invalid');
    assert.equal(invalid.invalidReason, invalidReason);
    assert.equal(expired.status, 'expired');
  });

  it('fails closed on missing creation, contradictory terminals and unverified cursors', async () => {
    const context = memoryStore();
    const missing = stageEvent({
      eventName: 'UkiMarketplaceOrderExpired',
      blockNumber: 50,
      args: { orderId: orderOne },
    });
    await assert.rejects(
      () => projectStage(context, missing),
      /no tiene OrderCreated proyectado/,
    );

    await projectStage(context, created(orderOne, 12n, 51, 1n));
    await projectStage(context, stageEvent({
      eventName: 'UkiMarketplaceOrderCancelled',
      blockNumber: 52,
      args: { orderId: orderOne, seller },
    }));
    await assert.rejects(
      () => projectStage(context, stageEvent({
        eventName: 'UkiMarketplaceOrderFilled',
        blockNumber: 53,
        args: {
          orderId: orderOne,
          buyer,
          paymentToken: usdt,
          paymentAmount: 2_200n,
          feeAmount: 200n,
          ukiPrice: 1_000_000_000_000_000_000_000n,
        },
      })),
      /contradice el estado cancelled/,
    );

    const withoutCursor = memoryStore();
    await assert.rejects(
      () => projectEvent(withoutCursor.store as never, created(orderTwo, 13n, 54, 1n)),
      /no tiene cursor contractual verificado/,
    );
  });
});
