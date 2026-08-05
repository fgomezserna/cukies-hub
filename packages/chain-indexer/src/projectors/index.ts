import { formatUnits } from 'viem';
import type { ClientSession } from 'mongodb';

import { monitoredContractAddresses } from '../config/contracts.js';
import type { ChainEvent, JsonValue } from '../types.js';
import { getNumber, getString, normalizeAddress, now } from '../utils/json.js';
import type { IndexerStore } from '../storage/index.js';

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
      updatedAt: observedAt,
    },
    observedAt,
    session,
  );

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
    if (existing && Object.entries(immutable).some(([key, value]) => existing[key] !== value)) {
      throw new Error(`BatchPublished ${batchId} contradice el lote ya indexado.`);
    }
    await collection(store, 'reward_claim_batches').updateOne(
      { batchId },
      {
        $setOnInsert: {
          _id: batchId,
          batchId,
          chain: event.chain,
          contractAddress: event.contractAddress,
          ...immutable,
          status: 'published',
          publicationEventId: event._id,
          publicationTransactionHash: event.txHash,
          publicationBlockNumber: event.blockNumber,
          publishedAt: observedAt,
          createdAt: now(),
        },
      },
      { upsert: true },
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
          batchId,
          walletAddress: account,
          walletNormalized: accountNormalized,
          amountRaw,
          transactionHash: event.txHash,
          logIndex: event.logIndex,
          blockNumber: event.blockNumber,
          claimedAt: observedAt,
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

  if (event.eventName === 'Purchased') {
    return projectPresalePurchase(store, event);
  }

  if (event.eventName === 'Staked' || event.eventName === 'Unstaked') {
    return projectUkiStakingPosition(store, event);
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
