import type { ChainEvent, ChainName, ContractAlias, EventName, JsonRecord } from './types.js';
import { getNumber, getString, normalizeAddress, tokenIdFromArgs, toJsonRecord } from './utils/json.js';

const zeroBscAddress = '0x0000000000000000000000000000000000000000';
const zeroTronAddress = 'T9YD14NJ9J7XAB4DBGEIX9H8UNKKHXUWWB';

function baseNormalized(chain: ChainName, args: Record<string, unknown>) {
  const tokenId =
    tokenIdFromArgs(args) ??
    tokenIdFromArgs(args, 'result') ??
    tokenIdFromArgs(args, 'parent1');
  const user =
    getString(args.user) ??
    getString(args.owner) ??
    getString(args.newOwner) ??
    getString(args.originOwner) ??
    getString(args.destOwner) ??
    getString(args.to);

  return {
    tokenId,
    user,
    userNormalized: normalizeAddress(chain, user),
  };
}

function normalizePrice(chain: ChainName, value: unknown) {
  const raw = getString(value);
  const numeric = getNumber(value);

  if (raw === null || numeric === null) return { priceRaw: raw, price: null };

  return {
    priceRaw: raw,
    price: chain === 'BSC' ? numeric / 1e14 : numeric / 1e6,
  };
}

export function normalizeDomainEvent(
  chain: ChainName,
  eventName: EventName,
  contractAlias: ContractAlias,
  args: Record<string, unknown>,
): JsonRecord {
  const base = baseNormalized(chain, args);

  if (eventName === 'Transfer') {
    const from = getString(args.from);
    const to = getString(args.to);
    const fromNormalized = normalizeAddress(chain, from);
    const toNormalized = normalizeAddress(chain, to);
    const zeroAddress = chain === 'BSC' ? zeroBscAddress : zeroTronAddress;
    const isMint = fromNormalized === normalizeAddress(chain, zeroAddress);

    return toJsonRecord({
      ...base,
      from,
      to,
      fromNormalized,
      toNormalized,
      isMint,
      state: 'available',
      txType: isMint ? 'Mint' : 'Gift',
    });
  }

  if (eventName === 'TokenOnSale') {
    const price = normalizePrice(chain, args.price);

    return toJsonRecord({
      ...base,
      owner: getString(args.owner),
      ownerNormalized: normalizeAddress(chain, args.owner),
      ...price,
      feeRaw: getString(args.fee),
      state: 'onSale',
    });
  }

  if (eventName === 'MarketTokenPriceChanged') {
    const price = normalizePrice(chain, args.newPrice ?? args.price);

    return toJsonRecord({
      ...base,
      ...price,
      feeRaw: getString(args.newFee),
      state: 'onSale',
    });
  }

  if (eventName === 'TokenBought') {
    return toJsonRecord({
      ...base,
      to: getString(args.newOwner),
      toNormalized: normalizeAddress(chain, args.newOwner),
      state: 'available',
      txType: 'Buy',
    });
  }

  if (eventName === 'MarketTokenSaleCancelled') {
    return toJsonRecord({
      ...base,
      state: 'available',
      txType: 'CancelSale',
    });
  }

  if (eventName === 'Stake' || eventName === 'Unstake') {
    return toJsonRecord({
      ...base,
      owner: getString(args.user),
      ownerNormalized: normalizeAddress(chain, args.user),
      pointsRaw: getString(args.points),
      state: eventName === 'Stake' ? 'staking' : 'available',
    });
  }

  if (eventName === 'Mint' || eventName === 'Burn') {
    const points = getNumber(args.points) ?? 0;

    return toJsonRecord({
      ...base,
      address: getString(args.user),
      addressNormalized: normalizeAddress(chain, args.user),
      points: eventName === 'Burn' ? -Math.abs(points) : points,
      pointType: eventName === 'Burn' ? 'Breeding' : 'Unstake',
    });
  }

  if (eventName === 'BreedStart') {
    return toJsonRecord({
      ...base,
      parent1: getString(args.parent1),
      parent2: getString(args.parent2),
      state: 'breeding',
    });
  }

  if (eventName === 'BreedFinish') {
    return toJsonRecord({
      ...base,
      tokenId: getString(args.result ?? args.tokenId),
      parent1: getString(args.parent1),
      parent2: getString(args.parent2),
      owner: getString(args.user),
      ownerNormalized: normalizeAddress(chain, args.user),
      state: 'available',
      txType: 'Breed',
      needsMetadata: true,
    });
  }

  if (eventName === 'JumpInBridge') {
    return toJsonRecord({
      ...base,
      from: getString(args.originOwner),
      to: getString(args.destOwner),
      fromNormalized: normalizeAddress(chain, args.originOwner),
      toNormalized: normalizeAddress(chain, args.destOwner),
      destinationNetwork: getString(args.network),
      state: 'inBridge',
      txType: 'Bridge',
    });
  }

  if (eventName === 'JumpOutBridge') {
    return toJsonRecord({
      ...base,
      to: getString(args.destOwner),
      toNormalized: normalizeAddress(chain, args.destOwner),
      state: 'available',
      txType: 'Bridge',
    });
  }

  if (eventName === 'Purchased') {
    const buyer = getString(args.buyer);

    return toJsonRecord({
      ...base,
      buyer,
      buyerNormalized: normalizeAddress(chain, buyer),
      asmAmountRaw: getString(args.asmAmount),
      ukiAmountRaw: getString(args.ukiAmount),
      totalBuyerAsmRaw: getString(args.totalBuyerAsm),
      totalBuyerUkiRaw: getString(args.totalBuyerUki),
      txType: 'PresalePurchase',
    });
  }

  return toJsonRecord({
    ...base,
    contractAlias,
  });
}

export function sortChainEvents(events: ChainEvent[]) {
  return events.sort((a, b) => {
    if (a.timestampMs !== b.timestampMs) return a.timestampMs - b.timestampMs;
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return a.logIndex - b.logIndex;
  });
}
