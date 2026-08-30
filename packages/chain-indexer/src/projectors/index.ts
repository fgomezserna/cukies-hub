import { formatUnits, isAddress } from 'viem';
import type { ClientSession } from 'mongodb';

import { getMonitoredContractAddresses } from '../config/contracts.js';
import type {
  ChainEvent,
  JsonValue,
  VerifiedBscContractAlias,
} from '../types.js';
import { getNumber, getString, normalizeAddress, now } from '../utils/json.js';
import type { IndexerStore } from '../storage/index.js';
import { enqueueCukieMasterRecalculation } from './cukie-master-outbox.js';
import { projectNftVaultEvent } from './nft-vaults.js';

function collection(store: IndexerStore, name: string) {
  return store.db.collection<any>(name);
}

function isMongoDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

type MonotonicTuple = { blockNumber: number; logIndex: number };
type MonotonicCollection = {
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<{ matchedCount: number }>;
  insertOne(document: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
};

function monotonicTupleFilter(id: string, tuple: MonotonicTuple) {
  return {
    _id: id,
    $or: [
      { lastBlockNumber: { $exists: false } },
      { lastBlockNumber: { $lt: tuple.blockNumber } },
      { lastBlockNumber: tuple.blockNumber, lastLogIndex: { $lte: tuple.logIndex } },
    ],
  };
}

export async function monotonicAbsoluteUpdate(
  target: MonotonicCollection,
  id: string,
  tuple: MonotonicTuple,
  values: Record<string, unknown>,
  createdAt: Date,
  session?: ClientSession,
) {
  const set = {
    ...values,
    lastBlockNumber: tuple.blockNumber,
    lastLogIndex: tuple.logIndex,
  };
  const updateExisting = () => target.updateOne(
    monotonicTupleFilter(id, tuple),
    { $set: set },
    { upsert: false, session },
  );
  const updated = await updateExisting();
  if (updated.matchedCount > 0) return true;

  try {
    await target.insertOne({ _id: id, ...set, createdAt }, { session });
    return true;
  } catch (error) {
    if (!isMongoDuplicateKey(error)) throw error;
    return (await updateExisting()).matchedCount > 0;
  }
}

function field(event: ChainEvent, key: string) {
  return event.normalized[key] ?? event.args[key];
}

function stringField(event: ChainEvent, key: string) {
  return getString(field(event, key));
}

function numberField(event: ChainEvent, key: string) {
  return getNumber(field(event, key));
}

function bigintField(event: ChainEvent, key: string) {
  const value = field(event, key);
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function tokenId(event: ChainEvent) {
  return stringField(event, 'tokenId');
}

function bscNftMaterializationIdentity(event: ChainEvent) {
  if (event.chain !== 'BSC') return null;
  if (event.chainId !== 56 && event.chainId !== 97) {
    throw new Error(`${event.eventName} no tiene chainId BSC 56/97 en la evidencia canonica.`);
  }
  if (!isAddress(event.contractAddress) || /^0x0{40}$/i.test(event.contractAddress)) {
    throw new Error(`${event.eventName} no tiene collection address BSC valida.`);
  }
  return {
    chainId: event.chainId,
    collectionAddressNormalized: event.contractAddress.toLowerCase(),
  };
}

function nftDocumentId(event: ChainEvent, id: string) {
  if (event.chain !== 'BSC' || event.contractAlias !== 'TOKEN_V2') return id;
  const identity = bscNftMaterializationIdentity(event)!;
  return `${identity.chainId}:${identity.collectionAddressNormalized}:${id}`;
}

function eventDate(event: ChainEvent) {
  return new Date(event.timestampMs);
}

function tokenAmount(event: ChainEvent, key: string) {
  const raw = bigintField(event, key);
  if (raw === null) return { raw: null, value: null };

  return {
    raw: raw.toString(),
    value: Number(formatUnits(raw, 18)),
  };
}

function isMonitoredContractAddress(event: ChainEvent, value: string | null) {
  if (!value) return false;
  const addresses = getMonitoredContractAddresses({
    tokenAddress: process.env.CHAIN_INDEXER_TOKEN_ADDRESS,
    tokenV2Address: process.env.CHAIN_INDEXER_TOKEN_V2_ADDRESS,
    marketplaceAddress: process.env.CHAIN_INDEXER_MARKETPLACE_ADDRESS,
    ukiMarketplaceAddress: process.env.CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS
      ?? process.env.NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS,
    bridgeAddress: process.env.CHAIN_INDEXER_BRIDGE_ADDRESS,
    presaleAddress: process.env.CHAIN_INDEXER_PRESALE_ADDRESS,
    ukiStakingAddress: process.env.CHAIN_INDEXER_UKI_STAKING_ADDRESS,
    vestingVaultAddress: process.env.CHAIN_INDEXER_VESTING_VAULT_ADDRESS,
    rewardsDistributorAddress: process.env.CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS,
    cukieMasterNftVaultAddress: process.env.CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_ADDRESS,
    cukiePoolNftVaultAddress: process.env.CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_ADDRESS,
  })[event.chain];
  const normalized = normalizeAddress(event.chain, value);

  return Object.entries(addresses).some(
    ([alias, address]) => alias !== 'UKI_MARKETPLACE'
      && normalizeAddress(event.chain, address) === normalized,
  );
}

function isZeroAddress(event: ChainEvent, value: string | null) {
  const normalized = normalizeAddress(event.chain, value);

  if (event.chain === 'BSC') {
    return normalized === '0x0000000000000000000000000000000000000000';
  }

  return normalized === 'T9YD14NJ9J7XAB4DBGEIX9H8UNKKHXUWWB';
}

function nftTx(event: ChainEvent, extra: Record<string, JsonValue>) {
  return {
    _id: event._id,
    eventId: event._id,
    chain: event.chain,
    network: event.chain,
    eventName: event.eventName,
    contractAlias: event.contractAlias,
    txHash: event.txHash,
    transactionId: event.txHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    timestampMs: event.timestampMs,
    date: eventDate(event),
    createdAt: now(),
    ...extra,
  };
}

async function insertNftTx(store: IndexerStore, event: ChainEvent, extra: Record<string, JsonValue>) {
  await collection(store, 'tx_nfts').updateOne(
    { _id: event._id },
    {
      $setOnInsert: nftTx(event, extra),
    },
    { upsert: true },
  );
}

type MarketplaceInvalidationReason = 'transfer' | 'staking' | 'breeding' | 'bridge';

async function invalidateActiveMarketplaceListing(
  store: IndexerStore,
  event: ChainEvent,
  id: string,
  reason: MarketplaceInvalidationReason,
  documentId = id,
) {
  const invalidatedAt = eventDate(event);

  await Promise.all([
    collection(store, 'cukies').updateOne(
      {
        _id: documentId,
        $or: [
          { marketplaceListingStatus: 'active' },
          { state: 'onSale' },
        ],
      },
      {
        $set: {
          marketplaceListingStatus: 'invalid',
          marketplaceListingInvalidReason: reason,
          marketplaceListingInvalidatedAt: invalidatedAt,
          marketplaceListingEventId: event._id,
          price: 0,
          priceOriginal: '0',
          updatedAt: now(),
        },
      },
    ),
    collection(store, 'marketplace_listings').updateOne(
      { tokenId: id, status: 'active' },
      {
        $set: {
          status: 'invalid',
          invalidReason: reason,
          invalidatedAt,
          updatedAt: now(),
          lastEventId: event._id,
        },
      },
    ),
  ]);
}

async function projectTransfer(store: IndexerStore, event: ChainEvent) {
  if (event.chain === 'BSC') {
    if (event.contractAlias !== 'TOKEN' && event.contractAlias !== 'TOKEN_V2') {
      return `Transfer BSC fuera de una coleccion NFT soportada: ${event.contractAlias}`;
    }
    await verifiedContractCursor(store, event, event.contractAlias);
  }
  const id = tokenId(event);
  if (!id) return 'Transfer sin tokenId';
  const documentId = nftDocumentId(event, id);
  const bscIdentity = bscNftMaterializationIdentity(event);

  const from = stringField(event, 'from');
  const to = stringField(event, 'to');
  const isMint = field(event, 'isMint') === true;

  if (event.chain === 'BSC' && isZeroAddress(event, to)) {
    return 'Transfer BSC burn interno; lo resuelve bridge/marketplace/staking';
  }

  if (event.chain === 'TRON' && isZeroAddress(event, to)) {
    return 'Transfer TRON burn interno';
  }

  if (!isMint && (isMonitoredContractAddress(event, from) || isMonitoredContractAddress(event, to))) {
    return 'Transfer interno de contrato monitorizado';
  }

  await invalidateActiveMarketplaceListing(store, event, id, 'transfer', documentId);

  await collection(store, 'cukies').updateOne(
    { _id: documentId },
    {
      $set: {
        tokenId: id,
        ...(bscIdentity ?? {}),
        user: to,
        owner: to,
        ownerNormalized: normalizeAddress(event.chain, to),
        network: event.chain,
        state: 'available',
        price: 0,
        priceOriginal: '0',
        updatedAt: now(),
        timeStamp: event.timestampMs,
        lastEventId: event._id,
        ...(isMint ? {
          origin: 'mint',
          mintEventId: event._id,
          mintTransactionHash: event.txHash.toLowerCase(),
          mintBlockNumber: event.blockNumber,
          mintLogIndex: event.logIndex,
          mintTimestampMs: event.timestampMs,
          ...(event.blockHash ? { mintBlockHash: event.blockHash.toLowerCase() } : {}),
        } : {}),
      },
      $setOnInsert: {
        _id: documentId,
        ...(!isMint ? { origin: 'transfer' } : {}),
        birthNetwork: event.chain,
        price: 0,
        children: [],
        parents: [null, null],
        history: [],
        createdAt: now(),
      },
    },
    { upsert: true },
  );

  await insertNftTx(store, event, {
    nftType: 'CUKI',
    tokenId: id,
    from,
    to,
    type: isMint ? 'Mint' : 'Gift',
    price: 0,
  });

  return null;
}

async function projectCukieMetadata(store: IndexerStore, event: ChainEvent) {
  if (
    event.chain !== 'BSC'
    || (event.contractAlias !== 'TOKEN' && event.contractAlias !== 'TOKEN_V2')
  ) {
    return 'CukieMetadataConfigured solo se soporta para TOKEN/TOKEN_V2 en BSC';
  }
  await verifiedContractCursor(store, event, event.contractAlias);
  const id = tokenId(event);
  const rarity = numberField(event, 'rarity');
  const generation = numberField(event, 'generation');
  if (!id) return 'CukieMetadataConfigured sin tokenId';
  if (rarity === null || !Number.isInteger(rarity) || rarity < 1 || rarity > 6) {
    return 'CukieMetadataConfigured con rareza invalida';
  }
  if (generation !== 1 && generation !== 2) {
    return 'CukieMetadataConfigured con generacion invalida';
  }
  const documentId = nftDocumentId(event, id);
  const identity = bscNftMaterializationIdentity(event)!;
  const cukies = collection(store, 'cukies');
  if (event.contractAlias === 'TOKEN_V2') {
    const projectedMint = await cukies.findOne({
      _id: documentId,
      ...identity,
      mintTransactionHash: event.txHash.toLowerCase(),
    });
    if (
      typeof projectedMint?.mintEventId !== 'string'
      || projectedMint.mintBlockNumber !== event.blockNumber
      || !Number.isSafeInteger(projectedMint.mintLogIndex)
      || Number(projectedMint.mintLogIndex) >= event.logIndex
    ) {
      throw new Error(
        `CukieMetadataConfigured ${documentId} no tiene Transfer mint predecessor en la misma transaccion.`,
      );
    }
  }
  const updated = await cukies.updateOne(
    { _id: documentId, ...identity },
    {
      $set: {
        tokenId: id,
        ...identity,
        rarity,
        generation,
        metadataEventId: event._id,
        metadataTransactionHash: event.txHash.toLowerCase(),
        metadataBlockNumber: event.blockNumber,
        metadataLogIndex: event.logIndex,
        metadataTimestampMs: event.timestampMs,
        metadataContractAddressNormalized: identity.collectionAddressNormalized,
        ...(event.blockHash ? { metadataBlockHash: event.blockHash.toLowerCase() } : {}),
        updatedAt: now(),
      },
    },
  );
  if (updated.matchedCount === 0) {
    throw new Error(`CukieMetadataConfigured ${id} no tiene Transfer mint proyectado.`);
  }
  return null;
}

async function projectMarketplace(store: IndexerStore, event: ChainEvent) {
  if (event.chain === 'BSC') await verifiedContractCursor(store, event, 'MARKETPLACE');
  const id = tokenId(event);
  if (!id) return `${event.eventName} sin tokenId`;

  if (event.eventName === 'TokenOnSale' || event.eventName === 'MarketTokenPriceChanged') {
    const price = numberField(event, 'price');
    const priceRaw = stringField(event, 'priceRaw');
    const current = await collection(store, 'cukies').findOne({ _id: id });
    const owner = stringField(event, 'owner')
      ?? getString(current?.owner ?? current?.user);
    const ownerNormalized = normalizeAddress(event.chain, owner);

    await collection(store, 'cukies').updateOne(
      { _id: id },
      {
        $set: {
          tokenId: id,
          ...(owner ? { user: owner, owner, ownerNormalized } : {}),
          network: event.chain,
          state: 'onSale',
          price: price ?? 0,
          priceOriginal: priceRaw,
          marketplaceListingStatus: 'active',
          marketplaceListingChain: event.chain,
          marketplaceListingOwnerNormalized: ownerNormalized,
          marketplaceListingEventId: event._id,
          updatedAt: now(),
          timeStamp: event.timestampMs,
          lastEventId: event._id,
        },
        $setOnInsert: {
          _id: id,
          origin: 'indexed',
          birthNetwork: event.chain,
          createdAt: now(),
        },
      },
      { upsert: true },
    );

    await collection(store, 'marketplace_listings').updateOne(
      { tokenId: id },
      {
        $set: {
          tokenId: id,
          chain: event.chain,
          ...(owner ? { owner, ownerNormalized } : {}),
          price: price ?? 0,
          priceRaw,
          status: 'active',
          ...(event.eventName === 'TokenOnSale' ? { listedAt: eventDate(event) } : {}),
          updatedAt: now(),
          lastEventId: event._id,
        },
        $setOnInsert: {
          createdAt: now(),
        },
      },
      { upsert: true },
    );

    return null;
  }

  if (event.eventName === 'TokenBought') {
    const to = stringField(event, 'to');
    const previous = await collection(store, 'cukies').findOne({ _id: id });

    await collection(store, 'cukies').updateOne(
      { _id: id },
      {
        $set: {
          tokenId: id,
          user: to,
          owner: to,
          ownerNormalized: normalizeAddress(event.chain, to),
          network: event.chain,
          state: 'available',
          price: 0,
          priceOriginal: '0',
          marketplaceListingStatus: 'sold',
          marketplaceListingChain: event.chain,
          marketplaceListingEventId: event._id,
          updatedAt: now(),
          timeStamp: event.timestampMs,
          lastEventId: event._id,
        },
        $setOnInsert: {
          _id: id,
          origin: 'indexed',
          birthNetwork: event.chain,
          createdAt: now(),
        },
      },
      { upsert: true },
    );

    await collection(store, 'marketplace_listings').updateOne(
      { tokenId: id },
      {
        $set: {
          tokenId: id,
          chain: event.chain,
          buyer: to,
          buyerNormalized: normalizeAddress(event.chain, to),
          status: 'sold',
          soldAt: eventDate(event),
          updatedAt: now(),
          lastEventId: event._id,
        },
        $setOnInsert: {
          createdAt: now(),
        },
      },
      { upsert: true },
    );

    await insertNftTx(store, event, {
      nftType: 'CUKI',
      tokenId: id,
      from: getString(previous?.owner ?? previous?.user),
      to,
      type: 'Buy',
      price: getNumber(previous?.price) ?? 0,
    });

    return null;
  }

  if (event.eventName === 'MarketTokenSaleCancelled') {
    await collection(store, 'cukies').updateOne(
      { _id: id },
      {
        $set: {
          tokenId: id,
          state: 'available',
          price: 0,
          priceOriginal: '0',
          marketplaceListingStatus: 'cancelled',
          marketplaceListingChain: event.chain,
          marketplaceListingEventId: event._id,
          updatedAt: now(),
          timeStamp: event.timestampMs,
          lastEventId: event._id,
        },
        $setOnInsert: {
          _id: id,
          origin: 'indexed',
          birthNetwork: event.chain,
          network: event.chain,
          createdAt: now(),
        },
      },
      { upsert: true },
    );

    await collection(store, 'marketplace_listings').updateOne(
      { tokenId: id },
      {
        $set: {
          tokenId: id,
          chain: event.chain,
          status: 'cancelled',
          cancelledAt: eventDate(event),
          updatedAt: now(),
          lastEventId: event._id,
        },
        $setOnInsert: {
          createdAt: now(),
        },
      },
      { upsert: true },
    );

    await insertNftTx(store, event, {
      nftType: 'CUKI',
      tokenId: id,
      type: 'CancelSale',
      price: 0,
    });

    return null;
  }

  return null;
}

type UkiMarketplaceTerminalStatus = 'sold' | 'cancelled' | 'expired' | 'invalid';

function bytes32Field(event: ChainEvent, key: string) {
  const value = stringField(event, key)?.toLowerCase() ?? null;
  return value && /^0x[0-9a-f]{64}$/.test(value) ? value : null;
}

function uintStringField(event: ChainEvent, key: string) {
  const value = stringField(event, key);
  return value && /^\d+$/.test(value) ? value : null;
}

function ukiMarketplaceOrderDocumentId(event: ChainEvent, orderId: string) {
  if (event.chainId !== 56 && event.chainId !== 97) {
    throw new Error(`${event.eventName} no tiene chainId BSC 56/97.`);
  }
  return `${event.chainId}:${event.contractAddress.toLowerCase()}:${orderId}`;
}

function ukiMarketplaceEventEvidence(event: ChainEvent) {
  return {
    eventId: event._id,
    transactionHash: event.txHash.toLowerCase(),
    blockNumber: event.blockNumber,
    logIndex: event.logIndex,
    observedAt: eventDate(event),
    ...(event.blockHash ? { blockHash: event.blockHash.toLowerCase() } : {}),
  };
}

async function transitionUkiMarketplaceOrder(input: {
  store: IndexerStore;
  event: ChainEvent;
  orderId: string;
  status: UkiMarketplaceTerminalStatus;
  values: Record<string, unknown>;
}) {
  const orders = collection(input.store, 'uki_marketplace_orders');
  const documentId = ukiMarketplaceOrderDocumentId(input.event, input.orderId);
  const current = await orders.findOne({ _id: documentId });
  if (!current) {
    throw new Error(`${input.event.eventName} ${input.orderId} no tiene OrderCreated proyectado.`);
  }
  if (current.status === input.status && current.stateEventId === input.event._id) return;
  if (current.status !== 'active') {
    throw new Error(
      `${input.event.eventName} ${input.orderId} contradice el estado ${String(current.status)}.`,
    );
  }

  const result = await orders.updateOne(
    { _id: documentId, status: 'active' },
    {
      $set: {
        status: input.status,
        ...input.values,
        stateEventId: input.event._id,
        updatedAt: now(),
      },
    },
  );
  if (result.matchedCount !== 1) {
    throw new Error(`${input.event.eventName} ${input.orderId} perdio la transicion atomica.`);
  }
}

export async function projectUkiMarketplaceEvent(
  store: IndexerStore,
  event: ChainEvent,
) {
  if (event.chain !== 'BSC' || event.contractAlias !== 'UKI_MARKETPLACE') {
    return `${event.eventName} fuera de UKI_MARKETPLACE BSC`;
  }
  await verifiedContractCursor(store, event, 'UKI_MARKETPLACE');
  if (event.chainId !== 56 && event.chainId !== 97) {
    return `${event.eventName} sin chainId BSC valido`;
  }
  if (!isAddress(event.contractAddress) || /^0x0{40}$/i.test(event.contractAddress)) {
    return `${event.eventName} sin marketplace address BSC valida`;
  }

  if (event.eventName === 'UkiMarketplaceTokenNonceInvalidated') {
    const collectionAddress = stringField(event, 'collection');
    const collectionAddressNormalized = stringField(event, 'collectionNormalized');
    const owner = stringField(event, 'owner');
    const ownerNormalized = stringField(event, 'ownerNormalized');
    const id = tokenId(event);
    const nonceRaw = uintStringField(event, 'nonceRaw');
    if (
      !collectionAddress
      || !collectionAddressNormalized
      || !isAddress(collectionAddress)
      || !owner
      || !ownerNormalized
      || !isAddress(owner)
      || !id
      || !/^\d+$/.test(id)
      || !nonceRaw
    ) {
      return 'TokenNonceInvalidated UKI con evidencia invalida';
    }
    const documentId = [
      event.chainId,
      event.contractAddress.toLowerCase(),
      collectionAddressNormalized,
      id,
    ].join(':');
    await monotonicAbsoluteUpdate(
      collection(store, 'uki_marketplace_token_nonces'),
      documentId,
      { blockNumber: event.blockNumber, logIndex: event.logIndex },
      {
        chain: 'BSC',
        chainId: event.chainId,
        marketplaceAddressNormalized: event.contractAddress.toLowerCase(),
        collectionAddress,
        collectionAddressNormalized,
        tokenId: id,
        nonceRaw,
        owner,
        ownerNormalized,
        invalidationEventId: event._id,
        invalidatedAt: eventDate(event),
        updatedAt: now(),
      },
      now(),
    );
    return null;
  }

  const orderId = bytes32Field(event, 'orderId');
  if (!orderId) return `${event.eventName} sin orderId bytes32 valido`;

  if (event.eventName === 'UkiMarketplaceOrderCreated') {
    const collectionAddress = stringField(event, 'collection');
    const collectionAddressNormalized = stringField(event, 'collectionNormalized');
    const seller = stringField(event, 'seller');
    const sellerNormalized = stringField(event, 'sellerNormalized');
    const id = tokenId(event);
    const ukiPriceRaw = uintStringField(event, 'ukiPriceRaw');
    const expiresAtRaw = uintStringField(event, 'expiresAtRaw');
    const nonceRaw = uintStringField(event, 'nonceRaw');
    const feeBpsRaw = uintStringField(event, 'feeBpsRaw');
    if (
      !collectionAddress
      || !collectionAddressNormalized
      || !isAddress(collectionAddress)
      || !seller
      || !sellerNormalized
      || !isAddress(seller)
      || !id
      || !/^\d+$/.test(id)
      || !ukiPriceRaw
      || BigInt(ukiPriceRaw) === 0n
      || !expiresAtRaw
      || BigInt(expiresAtRaw) <= BigInt(Math.floor(event.timestampMs / 1_000))
      || !nonceRaw
      || BigInt(nonceRaw) === 0n
      || !feeBpsRaw
      || BigInt(feeBpsRaw) > 1_000n
    ) {
      return 'OrderCreated UKI con evidencia invalida';
    }
    const expiresAtMs = BigInt(expiresAtRaw) * 1_000n;
    if (expiresAtMs > BigInt(Number.MAX_SAFE_INTEGER)) {
      return 'OrderCreated UKI con expiracion fuera de rango';
    }
    const documentId = ukiMarketplaceOrderDocumentId(event, orderId);
    const orders = collection(store, 'uki_marketplace_orders');
    const current = await orders.findOne({ _id: documentId });
    if (current) {
      if (current.createdEventId === event._id) return null;
      throw new Error(`OrderCreated UKI duplicado para ${orderId}.`);
    }
    await orders.updateOne(
      { _id: documentId },
      {
        $setOnInsert: {
          _id: documentId,
          orderId,
          chain: 'BSC',
          chainId: event.chainId,
          marketplaceAddressNormalized: event.contractAddress.toLowerCase(),
          collectionAddress,
          collectionAddressNormalized,
          tokenId: id,
          seller,
          sellerNormalized,
          ukiPriceRaw,
          expiresAtRaw,
          expiresAt: new Date(Number(expiresAtMs)),
          nonceRaw,
          feeBps: Number(feeBpsRaw),
          status: 'active',
          createdEventId: event._id,
          stateEventId: event._id,
          createdEvidence: ukiMarketplaceEventEvidence(event),
          listedAt: eventDate(event),
          createdAt: now(),
          updatedAt: now(),
        },
      },
      { upsert: true },
    );
    return null;
  }

  if (event.eventName === 'UkiMarketplaceOrderCancelled') {
    const seller = stringField(event, 'seller');
    const sellerNormalized = stringField(event, 'sellerNormalized');
    const documentId = ukiMarketplaceOrderDocumentId(event, orderId);
    const current = await collection(store, 'uki_marketplace_orders').findOne({ _id: documentId });
    if (
      !seller
      || !sellerNormalized
      || !isAddress(seller)
      || (current && current.sellerNormalized !== sellerNormalized)
    ) {
      return 'OrderCancelled UKI con seller invalido';
    }
    await transitionUkiMarketplaceOrder({
      store,
      event,
      orderId,
      status: 'cancelled',
      values: {
        cancelledAt: eventDate(event),
        cancelledEvidence: ukiMarketplaceEventEvidence(event),
      },
    });
    return null;
  }

  if (event.eventName === 'UkiMarketplaceOrderExpired') {
    await transitionUkiMarketplaceOrder({
      store,
      event,
      orderId,
      status: 'expired',
      values: {
        expiredAt: eventDate(event),
        expiredEvidence: ukiMarketplaceEventEvidence(event),
      },
    });
    return null;
  }

  if (event.eventName === 'UkiMarketplaceOrderInvalidated') {
    const reason = bytes32Field(event, 'reason');
    if (!reason) return 'OrderInvalidated UKI sin reason bytes32 valido';
    await transitionUkiMarketplaceOrder({
      store,
      event,
      orderId,
      status: 'invalid',
      values: {
        invalidReason: reason,
        invalidatedAt: eventDate(event),
        invalidatedEvidence: ukiMarketplaceEventEvidence(event),
      },
    });
    return null;
  }

  if (event.eventName === 'UkiMarketplaceOrderFilled') {
    const buyer = stringField(event, 'buyer');
    const buyerNormalized = stringField(event, 'buyerNormalized');
    const paymentToken = stringField(event, 'paymentToken');
    const paymentTokenNormalized = stringField(event, 'paymentTokenNormalized');
    const paymentAmountRaw = uintStringField(event, 'paymentAmountRaw');
    const feeAmountRaw = uintStringField(event, 'feeAmountRaw');
    const ukiPriceRaw = uintStringField(event, 'ukiPriceRaw');
    const documentId = ukiMarketplaceOrderDocumentId(event, orderId);
    const current = await collection(store, 'uki_marketplace_orders').findOne({ _id: documentId });
    if (
      !buyer
      || !buyerNormalized
      || !isAddress(buyer)
      || !paymentToken
      || !paymentTokenNormalized
      || !isAddress(paymentToken)
      || !paymentAmountRaw
      || !feeAmountRaw
      || !ukiPriceRaw
      || (current && current.ukiPriceRaw !== ukiPriceRaw)
    ) {
      return 'OrderFilled UKI con evidencia de pago invalida';
    }
    await transitionUkiMarketplaceOrder({
      store,
      event,
      orderId,
      status: 'sold',
      values: {
        buyer,
        buyerNormalized,
        paymentToken,
        paymentTokenNormalized,
        paymentAmountRaw,
        feeAmountRaw,
        soldAt: eventDate(event),
        soldEvidence: ukiMarketplaceEventEvidence(event),
      },
    });
    return null;
  }

  return `Evento UKI marketplace no soportado: ${event.eventName}`;
}

async function projectStaking(store: IndexerStore, event: ChainEvent) {
  const id = tokenId(event);
  if (!id) return `${event.eventName} sin tokenId`;

  const owner = stringField(event, 'owner');

  await invalidateActiveMarketplaceListing(store, event, id, 'staking');

  await collection(store, 'cukies').updateOne(
    { _id: id },
    {
      $set: {
        tokenId: id,
        ...(owner ? { user: owner, owner, ownerNormalized: normalizeAddress(event.chain, owner) } : {}),
        network: event.chain,
        state: event.eventName === 'Stake' ? 'staking' : 'available',
        price: 0,
        priceOriginal: '0',
        updatedAt: now(),
        timeStamp: event.timestampMs,
        lastEventId: event._id,
      },
      $setOnInsert: {
        _id: id,
        origin: 'indexed',
        birthNetwork: event.chain,
        createdAt: now(),
      },
    },
    { upsert: true },
  );

  return null;
}

async function projectPoints(store: IndexerStore, event: ChainEvent) {
  const address = stringField(event, 'address');
  const addressNormalized = stringField(event, 'addressNormalized');
  const points = numberField(event, 'points') ?? 0;

  if (!address || !addressNormalized) return `${event.eventName} sin address`;

  const session = store.db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const transactions = collection(store, 'point_transactions');
      await transactions.updateOne(
        { _id: event._id },
        {
          $setOnInsert: {
            _id: event._id,
            eventId: event._id,
            chain: event.chain,
            chainId: event.chainId,
            address,
            addressNormalized,
            points,
            type: stringField(event, 'pointType'),
            txHash: event.txHash,
            blockNumber: event.blockNumber,
            timestampMs: event.timestampMs,
            date: eventDate(event),
            createdAt: now(),
          },
        },
        { upsert: true, session },
      );

      const [summary] = await transactions.aggregate<{ points: number }>([
        { $match: { addressNormalized } },
        { $group: { _id: null, points: { $sum: '$points' } } },
      ], { session }).toArray();

      await collection(store, 'point_balances').updateOne(
        { addressNormalized },
        {
          $set: {
            address,
            points: summary?.points ?? 0,
            lastEventId: event._id,
            updatedAt: now(),
          },
          $setOnInsert: {
            createdAt: now(),
          },
        },
        { upsert: true, session },
      );
    });
  } finally {
    await session.endSession();
  }

  return null;
}

async function projectBreeding(store: IndexerStore, event: ChainEvent) {
  const parent1 = stringField(event, 'parent1');
  const parent2 = stringField(event, 'parent2');

  if (!parent1 || !parent2) return `${event.eventName} sin parent1/parent2`;

  if (event.eventName === 'BreedStart') {
    await Promise.all([
      invalidateActiveMarketplaceListing(store, event, parent1, 'breeding'),
      invalidateActiveMarketplaceListing(store, event, parent2, 'breeding'),
    ]);
    await collection(store, 'cukies').updateMany(
      { _id: { $in: [parent1, parent2] } },
      {
        $set: {
          state: 'breeding',
          price: 0,
          priceOriginal: '0',
          updatedAt: now(),
          timeStamp: event.timestampMs,
          lastEventId: event._id,
        },
      },
    );

    return null;
  }

  const id = tokenId(event);
  const owner = stringField(event, 'owner');

  if (!id) return 'BreedFinish sin tokenId/result';

  await collection(store, 'cukies').updateOne(
    { _id: id },
    {
      $set: {
        tokenId: id,
        user: owner,
        owner,
        ownerNormalized: normalizeAddress(event.chain, owner),
        origin: 'breed',
        network: event.chain,
        birthNetwork: event.chain,
        parents: [parent1, parent2],
        state: 'available',
        needsMetadata: true,
        updatedAt: now(),
        timeStamp: event.timestampMs,
        lastEventId: event._id,
      },
      $setOnInsert: {
        _id: id,
        children: [],
        history: [],
        price: 0,
        createdAt: now(),
      },
    },
    { upsert: true },
  );

  await collection(store, 'cukies').updateMany(
    { _id: { $in: [parent1, parent2] } },
    {
      $set: {
        state: 'available',
        updatedAt: now(),
        timeStamp: event.timestampMs,
        lastEventId: event._id,
      },
      $addToSet: {
        children: id,
      },
    },
  );

  await insertNftTx(store, event, {
    nftType: 'CUKI',
    tokenId: id,
    to: owner,
    from: '',
    type: 'Breed',
    price: 0,
    parent1,
    parent2,
  });

  return null;
}

async function projectBridge(store: IndexerStore, event: ChainEvent) {
  if (event.chain === 'BSC') await verifiedContractCursor(store, event, 'BRIDGE');
  const id = tokenId(event);
  if (!id) return `${event.eventName} sin tokenId`;

  const from = stringField(event, 'from');
  const to = stringField(event, 'to');

  await invalidateActiveMarketplaceListing(store, event, id, 'bridge');

  if (event.eventName === 'JumpInBridge') {
    await collection(store, 'cukies').updateOne(
      { _id: id },
      {
        $set: {
          tokenId: id,
          state: 'inBridge',
          network: event.chain,
          price: 0,
          priceOriginal: '0',
          updatedAt: now(),
          timeStamp: event.timestampMs,
          lastEventId: event._id,
        },
        $setOnInsert: {
          _id: id,
          origin: 'indexed',
          birthNetwork: event.chain,
          createdAt: now(),
        },
      },
      { upsert: true },
    );
  }

  if (event.eventName === 'JumpOutBridge') {
    await collection(store, 'cukies').updateOne(
      { _id: id },
      {
        $set: {
          tokenId: id,
          user: to,
          owner: to,
          ownerNormalized: normalizeAddress(event.chain, to),
          state: 'available',
          network: event.chain,
          price: 0,
          priceOriginal: '0',
          updatedAt: now(),
          timeStamp: event.timestampMs,
          lastEventId: event._id,
        },
        $setOnInsert: {
          _id: id,
          origin: 'indexed',
          birthNetwork: event.chain,
          createdAt: now(),
        },
      },
      { upsert: true },
    );
  }

  await collection(store, 'bridge_transfers').updateOne(
    { eventId: event._id },
    {
      $setOnInsert: {
        _id: event._id,
        eventId: event._id,
        chain: event.chain,
        eventName: event.eventName,
        direction: event.eventName === 'JumpInBridge' ? 'in' : 'out',
        tokenId: id,
        from,
        to,
        txHash: event.txHash,
        blockNumber: event.blockNumber,
        timestampMs: event.timestampMs,
        createdAt: now(),
      },
    },
    { upsert: true },
  );

  await insertNftTx(store, event, {
    nftType: 'CUKI',
    tokenId: id,
    from,
    to,
    type: 'Bridge',
    price: 0,
  });

  return null;
}

type PresaleCampaignConfig = {
  minimumUkiToUnlockLink: number;
  levelOneWeight: number;
  levelTwoWeight: number;
  levelThreeWeight: number;
};

const defaultPresaleCampaignConfig: PresaleCampaignConfig = {
  minimumUkiToUnlockLink: 0,
  levelOneWeight: 1,
  levelTwoWeight: 0.5,
  levelThreeWeight: 0.25,
};

async function getPresaleCampaignConfig(store: IndexerStore) {
  const config = await collection(store, 'presale_referral_campaign_config').findOne(
    { active: true },
    { sort: { updatedAt: -1, createdAt: -1 } },
  );

  return {
    minimumUkiToUnlockLink:
      getNumber(config?.minimumUkiToUnlockLink) ??
      defaultPresaleCampaignConfig.minimumUkiToUnlockLink,
    levelOneWeight: getNumber(config?.levelOneWeight) ?? defaultPresaleCampaignConfig.levelOneWeight,
    levelTwoWeight: getNumber(config?.levelTwoWeight) ?? defaultPresaleCampaignConfig.levelTwoWeight,
    levelThreeWeight:
      getNumber(config?.levelThreeWeight) ?? defaultPresaleCampaignConfig.levelThreeWeight,
  };
}

function levelWeight(config: PresaleCampaignConfig, level: number) {
  if (level === 1) return config.levelOneWeight;
  if (level === 2) return config.levelTwoWeight;
  return config.levelThreeWeight;
}

function levelTotalField(level: number) {
  return `referralLevel${level}UkiAmount`;
}

function levelScoreField(level: number) {
  return `referralLevel${level}WeightedScore`;
}

function definedFields<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}

async function projectPresalePurchase(store: IndexerStore, event: ChainEvent) {
  const buyer = stringField(event, 'buyer');
  const buyerNormalized = stringField(event, 'buyerNormalized');

  if (!buyer || !buyerNormalized) return 'Purchased sin buyer';

  const asmAmount = tokenAmount(event, 'asmAmountRaw');
  const ukiAmount = tokenAmount(event, 'ukiAmountRaw');
  const totalBuyerAsm = tokenAmount(event, 'totalBuyerAsmRaw');
  const totalBuyerUki = tokenAmount(event, 'totalBuyerUkiRaw');

  if (ukiAmount.value === null) return 'Purchased sin ukiAmount';

  const config = await getPresaleCampaignConfig(store);
  const confirmedAt = eventDate(event);
  const current = await collection(store, 'presale_participants').findOne({
    normalizedWalletAddress: buyerNormalized,
  });
  const isFirstPurchase = !current?.firstPurchaseAt;
  const lockedSponsorWalletAddress = getString(current?.lockedSponsorWalletAddress);
  const pendingSponsorWalletAddress = getString(current?.pendingSponsorWalletAddress);
  const pendingSponsorWalletNormalized = getString(current?.pendingSponsorWalletNormalized);
  const sponsorToLock = isFirstPurchase && !lockedSponsorWalletAddress
    ? pendingSponsorWalletAddress
    : null;
  const sponsorToLockNormalized = isFirstPurchase && !lockedSponsorWalletAddress
    ? pendingSponsorWalletNormalized
    : null;
  const effectiveSponsorWalletAddress = lockedSponsorWalletAddress ?? sponsorToLock;
  const effectiveSponsorWalletNormalized =
    getString(current?.lockedSponsorWalletNormalized) ?? sponsorToLockNormalized;

  await collection(store, 'presale_purchases').updateOne(
    { _id: event._id },
    {
      $setOnInsert: {
        _id: event._id,
        eventId: event._id,
        chain: event.chain,
        contractAddress: event.contractAddress,
        buyerWalletAddress: buyer,
        buyerNormalized,
        asmAmountRaw: asmAmount.raw,
        asmAmount: asmAmount.value,
        ukiAmountRaw: ukiAmount.raw,
        ukiAmount: ukiAmount.value,
        totalBuyerAsmRaw: totalBuyerAsm.raw,
        totalBuyerAsm: totalBuyerAsm.value,
        totalBuyerUkiRaw: totalBuyerUki.raw,
        totalBuyerUki: totalBuyerUki.value,
        txHash: event.txHash,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        blockHash: event.blockHash,
        timestampMs: event.timestampMs,
        confirmedAt,
        createdAt: now(),
      },
    },
    { upsert: true },
  );

  const participantSet: Record<string, unknown> = {
    walletAddress: buyer,
    normalizedWalletAddress: buyerNormalized,
    totalAsmPurchased: totalBuyerAsm.value ?? 0,
    totalAsmPurchasedRaw: totalBuyerAsm.raw,
    totalUkiPurchased: totalBuyerUki.value ?? ukiAmount.value,
    totalUkiPurchasedRaw: totalBuyerUki.raw ?? ukiAmount.raw,
    referralUnlockedAt:
      (totalBuyerUki.value ?? ukiAmount.value) >= config.minimumUkiToUnlockLink
        ? current?.referralUnlockedAt ?? confirmedAt
        : current?.referralUnlockedAt,
    referralMinimumUkiSnapshot:
      (totalBuyerUki.value ?? ukiAmount.value) >= config.minimumUkiToUnlockLink
        ? getNumber(current?.referralMinimumUkiSnapshot) ?? config.minimumUkiToUnlockLink
        : current?.referralMinimumUkiSnapshot,
    updatedAt: now(),
    lastPurchaseEventId: event._id,
  };

  if (isFirstPurchase) {
    participantSet.firstPurchaseAt = confirmedAt;
  }

  if (sponsorToLock && sponsorToLockNormalized) {
    participantSet.lockedSponsorWalletAddress = sponsorToLock;
    participantSet.lockedSponsorWalletNormalized = sponsorToLockNormalized;
    participantSet.sponsorLockedAt = confirmedAt;
  }

  await collection(store, 'presale_participants').updateOne(
    { normalizedWalletAddress: buyerNormalized },
    {
      $set: definedFields(participantSet),
      $setOnInsert: {
        createdAt: now(),
      },
    },
    { upsert: true },
  );

  let directSponsorWalletAddress = effectiveSponsorWalletAddress;
  let sponsorWalletAddress = effectiveSponsorWalletAddress;
  let sponsorWalletNormalized = effectiveSponsorWalletNormalized;

  for (let level = 1; level <= 3; level += 1) {
    if (!sponsorWalletAddress || !sponsorWalletNormalized) break;

    if (sponsorWalletNormalized === buyerNormalized) break;

    const weight = levelWeight(config, level);
    const weightedScore = ukiAmount.value * weight;
    const contributionId = `${event._id}:L${level}`;

    const contributionResult = await collection(store, 'presale_referral_contributions').updateOne(
      { _id: contributionId },
      {
        $setOnInsert: {
          _id: contributionId,
          eventId: event._id,
          purchaseId: event._id,
          buyerWalletAddress: buyer,
          buyerWalletNormalized: buyerNormalized,
          directSponsorWalletAddress,
          directSponsorWalletNormalized: effectiveSponsorWalletNormalized,
          sponsorWalletAddress,
          sponsorWalletNormalized,
          level,
          levelWeightSnapshot: weight,
          ukiAmountRaw: ukiAmount.raw,
          ukiAmount: ukiAmount.value,
          weightedScore,
          asmAmountRaw: asmAmount.raw,
          asmAmount: asmAmount.value,
          txHash: event.txHash,
          logIndex: event.logIndex,
          blockNumber: event.blockNumber,
          confirmedAt,
          createdAt: now(),
        },
      },
      { upsert: true },
    );

    if (contributionResult.upsertedCount > 0) {
      await collection(store, 'presale_participants').updateOne(
        { normalizedWalletAddress: sponsorWalletNormalized },
        {
          $set: {
            updatedAt: now(),
          },
          $inc: {
            [levelTotalField(level)]: ukiAmount.value,
            [levelScoreField(level)]: weightedScore,
            referralTotalUkiAmount: ukiAmount.value,
            referralWeightedScore: weightedScore,
          },
          $setOnInsert: {
            walletAddress: sponsorWalletAddress,
            normalizedWalletAddress: sponsorWalletNormalized,
            createdAt: now(),
          },
        },
        { upsert: true },
      );
    }

    const sponsor = await collection(store, 'presale_participants').findOne({
      normalizedWalletAddress: sponsorWalletNormalized,
    });

    sponsorWalletAddress = getString(sponsor?.lockedSponsorWalletAddress);
    sponsorWalletNormalized = getString(sponsor?.lockedSponsorWalletNormalized);
  }

  return null;
}

async function verifiedContractCursor(
  store: IndexerStore,
  event: ChainEvent,
  alias: VerifiedBscContractAlias,
) {
  const cursor = await store.cursors().findOne({
    chain: event.chain,
    contractAlias: alias,
    eventName: event.eventName,
    contractAddress: event.contractAddress,
    bootstrapStatus: 'verified',
  });
  if (
    !cursor
    || !(cursor.bootstrapVerifiedAt instanceof Date)
    || event.chain !== 'BSC'
    || (cursor.verifiedChainId !== 56 && cursor.verifiedChainId !== 97)
    || typeof cursor.contractAddress !== 'string'
    || cursor.contractAddress.toLowerCase() !== event.contractAddress.toLowerCase()
    || typeof cursor.contractCodeHash !== 'string'
    || !/^0x[0-9a-f]{64}$/.test(cursor.contractCodeHash)
    || typeof cursor.contractConfigHash !== 'string'
    || !/^0x[0-9a-f]{64}$/.test(cursor.contractConfigHash)
    || typeof cursor.contractDeploymentTxHash !== 'string'
    || !/^0x[0-9a-f]{64}$/.test(cursor.contractDeploymentTxHash)
    || !Number.isSafeInteger(cursor.contractDeploymentBlock)
    || !Number.isSafeInteger(cursor.bootstrapStartBlock)
    || cursor.bootstrapStartBlock !== cursor.contractDeploymentBlock
  ) {
    throw new Error(`${event.eventName} no tiene cursor contractual verificado.`);
  }
  return cursor;
}

export async function projectUkiStakingPosition(
  store: IndexerStore,
  event: ChainEvent,
  session?: ClientSession,
) {
  const account = stringField(event, 'account');
  const accountNormalized = stringField(event, 'accountNormalized');
  const amountRaw = stringField(event, 'amountRaw');
  const accountBalanceRaw = stringField(event, 'accountBalanceRaw');
  const totalStakedRaw = stringField(event, 'totalStakedRaw');

  if (!account || !accountNormalized) return `${event.eventName} sin account`;
  if (
    !amountRaw
    || !accountBalanceRaw
    || !totalStakedRaw
    || ![amountRaw, accountBalanceRaw, totalStakedRaw].every((value) => /^\d+$/.test(value))
  ) {
    return `${event.eventName} con montos raw invalidos`;
  }

  const observedAt = eventDate(event);
  const cursor = await verifiedContractCursor(store, event, 'UKI_STAKING');
  const tuple = { blockNumber: event.blockNumber, logIndex: event.logIndex };
  await monotonicAbsoluteUpdate(
    collection(store, 'uki_staking_positions'),
    accountNormalized,
    tuple,
    {
      walletAddress: account,
      walletNormalized: accountNormalized,
      accountBalanceRaw,
      lastAmountRaw: amountRaw,
      lastEventName: event.eventName,
      lastEventId: event._id,
      lastTxHash: event.txHash,
      observedAt,
      bootstrapStatus: cursor.bootstrapStatus,
      bootstrapStartBlock: cursor.bootstrapStartBlock,
      bootstrapVerifiedAt: cursor.bootstrapVerifiedAt,
      verifiedChainId: cursor.verifiedChainId,
      contractCodeHash: cursor.contractCodeHash,
      contractDeploymentBlock: cursor.contractDeploymentBlock,
      contractDeploymentTxHash: cursor.contractDeploymentTxHash,
      contractConfigHash: cursor.contractConfigHash,
      updatedAt: observedAt,
    },
    observedAt,
    session,
  );

  await monotonicAbsoluteUpdate(
    collection(store, 'uki_staking_state'),
    event.contractAddress.toLowerCase(),
    tuple,
    {
      chain: event.chain,
      contractAddress: event.contractAddress,
      contractAddressNormalized: event.contractAddress.toLowerCase(),
      totalStakedRaw,
      lastEventName: event.eventName,
      lastEventId: event._id,
      lastTxHash: event.txHash,
      observedAt,
      bootstrapStatus: cursor.bootstrapStatus,
      bootstrapStartBlock: cursor.bootstrapStartBlock,
      bootstrapVerifiedAt: cursor.bootstrapVerifiedAt,
      verifiedChainId: cursor.verifiedChainId,
      contractCodeHash: cursor.contractCodeHash,
      contractDeploymentBlock: cursor.contractDeploymentBlock,
      contractDeploymentTxHash: cursor.contractDeploymentTxHash,
      contractConfigHash: cursor.contractConfigHash,
      materializationStatus: 'consistent',
      materializedTotalRaw: totalStakedRaw,
      materializedThroughEventId: event._id,
      materializedThroughBlockNumber: event.blockNumber,
      materializedThroughLogIndex: event.logIndex,
      updatedAt: observedAt,
    },
    observedAt,
    session,
  );

  await enqueueCukieMasterRecalculation({
    store,
    event,
    wallet: accountNormalized,
    route: 'uki',
    session,
  });

  return null;
}

type VestingLedgerProjection = {
  _id: string;
  eventId: string;
  eventName: 'VestingCreated' | 'TokensReleased';
  beneficiary: string;
  beneficiaryNormalized: string;
  scheduleId: string;
  allocatedAmountRaw: string;
  releasedAmountRaw: string;
  startRaw: string | null;
  cliffRaw: string | null;
  durationRaw: string | null;
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
  observedAt: Date;
  createdAt: Date;
};

function sameVestingLedgerProjection(
  left: Record<string, unknown>,
  right: VestingLedgerProjection,
) {
  return Object.entries(right).every(([key, value]) => {
    const current = left[key];
    return current instanceof Date && value instanceof Date
      ? current.getTime() === value.getTime()
      : current === value;
  });
}

export async function projectUkiVestingPosition(
  store: IndexerStore,
  event: ChainEvent,
) {
  await verifiedContractCursor(store, event, 'VESTING_VAULT');
  const beneficiary = stringField(event, 'beneficiary');
  const beneficiaryNormalized = stringField(event, 'beneficiaryNormalized');
  const scheduleId = canonicalBytes32(event, 'scheduleId');
  const allocatedAmountRaw = stringField(event, 'allocatedAmountRaw');
  const releasedAmountRaw = stringField(event, 'releasedAmountRaw');
  if (!beneficiary || !beneficiaryNormalized) {
    return `${event.eventName} sin beneficiary`;
  }
  if (!scheduleId) return `${event.eventName} sin scheduleId valido`;
  if (
    !allocatedAmountRaw
    || !releasedAmountRaw
    || !/^\d+$/.test(allocatedAmountRaw)
    || !/^\d+$/.test(releasedAmountRaw)
  ) {
    return `${event.eventName} con montos raw invalidos`;
  }
  const optionalRaw = (key: string) => {
    const value = stringField(event, key);
    return value && /^\d+$/.test(value) ? value : null;
  };
  const observedAt = eventDate(event);
  const ledgerEntry: VestingLedgerProjection = {
    _id: event._id,
    eventId: event._id,
    eventName: event.eventName as VestingLedgerProjection['eventName'],
    beneficiary,
    beneficiaryNormalized,
    scheduleId,
    allocatedAmountRaw,
    releasedAmountRaw,
    startRaw: optionalRaw('startRaw'),
    cliffRaw: optionalRaw('cliffRaw'),
    durationRaw: optionalRaw('durationRaw'),
    transactionHash: event.txHash,
    blockNumber: event.blockNumber,
    logIndex: event.logIndex,
    observedAt,
    createdAt: observedAt,
  };
  const ledger = collection(store, 'uki_vesting_events');
  const existing = await ledger.findOne({ _id: event._id });
  if (existing && !sameVestingLedgerProjection(existing, ledgerEntry)) {
    throw new Error(`El evento vesting ${event._id} contradice el ledger.`);
  }
  if (!existing) {
    try {
      await ledger.insertOne(ledgerEntry);
    } catch (error) {
      if (!isMongoDuplicateKey(error)) throw error;
      const replay = await ledger.findOne({ _id: event._id });
      if (!replay || !sameVestingLedgerProjection(replay, ledgerEntry)) {
        throw new Error(`El replay vesting ${event._id} no coincide con el ledger.`);
      }
    }
  }

  const entries = await ledger.find({ beneficiaryNormalized, scheduleId })
    .sort({ blockNumber: 1, logIndex: 1, _id: 1 })
    .toArray() as VestingLedgerProjection[];
  let allocated = BigInt(0);
  let released = BigInt(0);
  for (const item of entries) {
    allocated += BigInt(item.allocatedAmountRaw);
    released += BigInt(item.releasedAmountRaw);
  }
  if (released > allocated) {
    throw new Error(`El schedule ${scheduleId} libera mas UKI del asignado.`);
  }
  const latest = entries.at(-1);
  if (!latest) throw new Error(`El ledger vesting ${scheduleId} no se pudo releer.`);
  const positionId = `${beneficiaryNormalized}:${scheduleId}`;
  await monotonicAbsoluteUpdate(
    collection(store, 'uki_vesting_positions'),
    positionId,
    { blockNumber: latest.blockNumber, logIndex: latest.logIndex },
    {
      walletAddress: beneficiary,
      walletNormalized: beneficiaryNormalized,
      scheduleId,
      totalAllocatedRaw: allocated.toString(10),
      releasedRaw: released.toString(10),
      lockedRaw: (allocated - released).toString(10),
      ledgerEventCount: entries.length,
      lastEventId: latest.eventId,
      lastEventName: latest.eventName,
      lastTxHash: latest.transactionHash,
      observedAt: latest.observedAt,
      updatedAt: latest.observedAt,
    },
    entries[0].observedAt,
  );
  await enqueueCukieMasterRecalculation({
    store,
    event,
    wallet: beneficiaryNormalized,
    route: 'uki',
  });
  return null;
}

function canonicalBytes32(event: ChainEvent, key: string) {
  const value = stringField(event, key)?.toLowerCase();
  return value && /^0x[0-9a-f]{64}$/.test(value) ? value : null;
}

export async function projectRewardsDistributorEvent(store: IndexerStore, event: ChainEvent) {
  const batchId = canonicalBytes32(event, 'batchId');
  if (!batchId) return `${event.eventName} sin batchId valido`;
  const observedAt = eventDate(event);

  if (event.eventName === 'BatchPublished') {
    const immutable = {
      merkleRoot: canonicalBytes32(event, 'merkleRoot'),
      inputHash: canonicalBytes32(event, 'inputHash'),
      metadataHash: canonicalBytes32(event, 'metadataHash'),
      totalAllocatedRaw: stringField(event, 'totalAllocatedRaw'),
      startsAtRaw: stringField(event, 'startsAtRaw'),
      expiresAtRaw: stringField(event, 'expiresAtRaw'),
    };
    if (
      !immutable.merkleRoot
      || !immutable.inputHash
      || !immutable.metadataHash
      || ![immutable.totalAllocatedRaw, immutable.startsAtRaw, immutable.expiresAtRaw]
        .every((value) => value && /^\d+$/.test(value))
    ) return 'BatchPublished con campos invalidos';

    const existing = await collection(store, 'reward_claim_batches').findOne({ batchId });
    if (!existing) {
      throw new Error(`BatchPublished ${batchId} no tiene draft autorizado en Mongo.`);
    }
    if (
      existing.publishAuthorized !== true
      || existing.previewOnly !== false
      || existing.publishedProofSetHash !== existing.proofSetHash
      || existing.publishedPeriodSealId !== existing.periodSealId
      || existing.merkleRoot !== immutable.merkleRoot
      || existing.canonicalInputHash !== immutable.inputHash
      || existing.metadataHash !== immutable.metadataHash
      || existing.totalAllocatedRaw !== immutable.totalAllocatedRaw
      || existing.startsAtRaw !== immutable.startsAtRaw
      || existing.expiresAtRaw !== immutable.expiresAtRaw
    ) {
      throw new Error(`BatchPublished ${batchId} contradice el lote ya indexado.`);
    }
    const publication = {
      status: existing.status === 'closed' ? 'closed' : 'published',
      previewOnly: false,
      publishAuthorized: true,
      signature: null,
      transactionHash: event.txHash,
      publicationEventId: event._id,
      publicationTransactionHash: event.txHash,
      publicationBlockNumber: event.blockNumber,
      publicationBlockHash: event.blockHash,
      publicationLogIndex: event.logIndex,
      publishedAt: observedAt,
      publishedBatchId: batchId,
      publishedMerkleRoot: immutable.merkleRoot,
      publishedInputHash: immutable.inputHash,
      publishedMetadataHash: immutable.metadataHash,
      publishedTotalAllocatedRaw: immutable.totalAllocatedRaw,
      startsAtRaw: immutable.startsAtRaw,
      expiresAtRaw: immutable.expiresAtRaw,
      startsAt: new Date(Number(immutable.startsAtRaw) * 1_000),
      expiresAt: new Date(Number(immutable.expiresAtRaw) * 1_000),
      totalClaimedRaw: existing?.totalClaimedRaw ?? '0',
      claimedCount: existing?.claimedCount ?? 0,
      closed: existing.status === 'closed' ? true : false,
      updatedAt: now(),
    };
    await collection(store, 'reward_claim_batches').updateOne(
      { batchId },
      {
        $set: publication,
      },
    );
    return null;
  }

  if (event.eventName === 'RewardClaimed') {
    const account = stringField(event, 'account');
    const accountNormalized = stringField(event, 'accountNormalized');
    const amountRaw = stringField(event, 'amountRaw');
    if (!account || !accountNormalized || !amountRaw || !/^\d+$/.test(amountRaw)) {
      return 'RewardClaimed con campos invalidos';
    }
    if (!await collection(store, 'reward_claim_batches').findOne({ batchId })) {
      throw new Error(`RewardClaimed ${batchId} no tiene BatchPublished proyectado.`);
    }
    await collection(store, 'reward_claims').updateOne(
      { _id: event._id },
      {
        $setOnInsert: {
          _id: event._id,
          eventId: event._id,
          chain: event.chain,
          contractAddress: event.contractAddress,
          batchId,
          walletAddress: account,
          walletNormalized: accountNormalized,
          amountRaw,
          transactionHash: event.txHash,
          logIndex: event.logIndex,
          blockNumber: event.blockNumber,
          blockHash: event.blockHash,
          indexedAt: observedAt,
          createdAt: now(),
        },
      },
      { upsert: true },
    );
    return null;
  }

  if (event.eventName === 'BatchClosed') {
    const unclaimedAmountRaw = stringField(event, 'unclaimedAmountRaw');
    if (!unclaimedAmountRaw || !/^\d+$/.test(unclaimedAmountRaw)) {
      return 'BatchClosed sin unclaimedAmount valido';
    }
    const updated = await collection(store, 'reward_claim_batches').updateOne(
      { batchId },
      {
        $set: {
          status: 'closed',
          unclaimedAmountRaw,
          closeEventId: event._id,
          closeTransactionHash: event.txHash,
          closeBlockNumber: event.blockNumber,
          closedAt: observedAt,
          updatedAt: now(),
        },
      },
    );
    if (updated.matchedCount === 0) {
      throw new Error(`BatchClosed ${batchId} no tiene BatchPublished proyectado.`);
    }
    return null;
  }

  return `Evento RewardsDistributor no soportado: ${event.eventName}`;
}

export async function projectEvent(store: IndexerStore, event: ChainEvent) {
  if (
    event.contractAlias === 'CUKIE_MASTER_NFT_VAULT'
    || event.contractAlias === 'CUKIE_POOL_NFT_VAULT'
  ) {
    await verifiedContractCursor(store, event, event.contractAlias);
    return projectNftVaultEvent(store, event);
  }

  if (event.eventName === 'Transfer') return projectTransfer(store, event);

  if (event.eventName === 'CukieMetadataConfigured') {
    return projectCukieMetadata(store, event);
  }

  if (event.contractAlias === 'UKI_MARKETPLACE') {
    return projectUkiMarketplaceEvent(store, event);
  }

  if (
    event.eventName === 'TokenOnSale' ||
    event.eventName === 'TokenBought' ||
    event.eventName === 'MarketTokenSaleCancelled' ||
    event.eventName === 'MarketTokenPriceChanged'
  ) {
    return projectMarketplace(store, event);
  }

  if (event.eventName === 'Stake' || event.eventName === 'Unstake') {
    return projectStaking(store, event);
  }

  if (event.eventName === 'Mint' || event.eventName === 'Burn') {
    return projectPoints(store, event);
  }

  if (event.eventName === 'BreedStart' || event.eventName === 'BreedFinish') {
    return projectBreeding(store, event);
  }

  if (event.eventName === 'JumpInBridge' || event.eventName === 'JumpOutBridge') {
    return projectBridge(store, event);
  }

  if (event.eventName === 'Purchased') {
    return projectPresalePurchase(store, event);
  }

  if (event.eventName === 'Staked' || event.eventName === 'Unstaked') {
    return projectUkiStakingPosition(store, event);
  }

  if (event.eventName === 'VestingCreated' || event.eventName === 'TokensReleased') {
    return projectUkiVestingPosition(store, event);
  }

  if (
    event.eventName === 'BatchPublished'
    || event.eventName === 'RewardClaimed'
    || event.eventName === 'BatchClosed'
  ) {
    return projectRewardsDistributorEvent(store, event);
  }

  return `Evento sin projector: ${event.eventName}`;
}

export async function projectOnce(store: IndexerStore, batchSize: number) {
  let projected = 0;
  let ignored = 0;
  let failed = 0;

  for (let index = 0; index < batchSize; index += 1) {
    const event = await store.claimNextEvent();
    if (!event) break;

    try {
      const ignoreReason = await projectEvent(store, event);

      if (ignoreReason) {
        await store.markIgnored(event._id, ignoreReason);
        ignored += 1;
      } else {
        await store.markProjected(event._id);
        projected += 1;
      }
    } catch (error) {
      await store.markFailed(event, error);
      failed += 1;
    }
  }

  return { projected, ignored, failed };
}
