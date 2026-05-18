import { monitoredContractAddresses } from '../config/contracts.js';
import type { ChainEvent, JsonValue } from '../types.js';
import { getNumber, getString, normalizeAddress, now } from '../utils/json.js';
import type { IndexerStore } from '../storage/index.js';

function collection(store: IndexerStore, name: string) {
  return store.db.collection<any>(name);
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

function tokenId(event: ChainEvent) {
  return stringField(event, 'tokenId');
}

function eventDate(event: ChainEvent) {
  return new Date(event.timestampMs);
}

function isMonitoredContractAddress(event: ChainEvent, value: string | null) {
  if (!value) return false;
  const addresses = monitoredContractAddresses[event.chain];
  const normalized = normalizeAddress(event.chain, value);

  return Object.values(addresses).some(
    (address) => normalizeAddress(event.chain, address) === normalized,
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

async function projectTransfer(store: IndexerStore, event: ChainEvent) {
  const id = tokenId(event);
  if (!id) return 'Transfer sin tokenId';

  const from = stringField(event, 'from');
  const to = stringField(event, 'to');
  const isMint = field(event, 'isMint') === true;

  if (event.chain === 'BSC' && (isZeroAddress(event, from) || isZeroAddress(event, to))) {
    return 'Transfer BSC mint/burn interno; lo resuelve bridge/marketplace/staking';
  }

  if (event.chain === 'TRON' && isZeroAddress(event, to)) {
    return 'Transfer TRON burn interno';
  }

  if (!isMint && (isMonitoredContractAddress(event, from) || isMonitoredContractAddress(event, to))) {
    return 'Transfer interno de contrato monitorizado';
  }

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
        updatedAt: now(),
        timeStamp: event.timestampMs,
        lastEventId: event._id,
      },
      $setOnInsert: {
        _id: id,
        origin: isMint ? 'mint' : 'transfer',
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

async function projectMarketplace(store: IndexerStore, event: ChainEvent) {
  const id = tokenId(event);
  if (!id) return `${event.eventName} sin tokenId`;

  if (event.eventName === 'TokenOnSale' || event.eventName === 'MarketTokenPriceChanged') {
    const price = numberField(event, 'price');
    const priceRaw = stringField(event, 'priceRaw');
    const owner = stringField(event, 'owner');

    await collection(store, 'cukies').updateOne(
      { _id: id },
      {
        $set: {
          tokenId: id,
          ...(owner ? { user: owner, owner, ownerNormalized: normalizeAddress(event.chain, owner) } : {}),
          network: event.chain,
          state: 'onSale',
          price: price ?? 0,
          priceOriginal: priceRaw,
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
          owner,
          ownerNormalized: normalizeAddress(event.chain, owner),
          price: price ?? 0,
          priceRaw,
          status: 'active',
          listedAt: event.eventName === 'TokenOnSale' ? eventDate(event) : undefined,
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

async function projectStaking(store: IndexerStore, event: ChainEvent) {
  const id = tokenId(event);
  if (!id) return `${event.eventName} sin tokenId`;

  const owner = stringField(event, 'owner');

  await collection(store, 'cukies').updateOne(
    { _id: id },
    {
      $set: {
        tokenId: id,
        ...(owner ? { user: owner, owner, ownerNormalized: normalizeAddress(event.chain, owner) } : {}),
        network: event.chain,
        state: event.eventName === 'Stake' ? 'staking' : 'available',
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

  await collection(store, 'point_transactions').updateOne(
    { _id: event._id },
    {
      $setOnInsert: {
        _id: event._id,
        eventId: event._id,
        chain: event.chain,
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
    { upsert: true },
  );

  await collection(store, 'point_balances').updateOne(
    { addressNormalized },
    {
      $set: {
        address,
        updatedAt: now(),
      },
      $inc: {
        points,
      },
      $setOnInsert: {
        createdAt: now(),
      },
    },
    { upsert: true },
  );

  return null;
}

async function projectBreeding(store: IndexerStore, event: ChainEvent) {
  const parent1 = stringField(event, 'parent1');
  const parent2 = stringField(event, 'parent2');

  if (!parent1 || !parent2) return `${event.eventName} sin parent1/parent2`;

  if (event.eventName === 'BreedStart') {
    await collection(store, 'cukies').updateMany(
      { _id: { $in: [parent1, parent2] } },
      {
        $set: {
          state: 'breeding',
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
  const id = tokenId(event);
  if (!id) return `${event.eventName} sin tokenId`;

  const from = stringField(event, 'from');
  const to = stringField(event, 'to');

  if (event.eventName === 'JumpInBridge') {
    await collection(store, 'cukies').updateOne(
      { _id: id },
      {
        $set: {
          tokenId: id,
          state: 'inBridge',
          network: event.chain,
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

export async function projectEvent(store: IndexerStore, event: ChainEvent) {
  if (event.eventName === 'Transfer') return projectTransfer(store, event);

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
