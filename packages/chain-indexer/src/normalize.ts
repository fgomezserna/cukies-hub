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

  if (eventName === 'CukieMetadataConfigured') {
    return toJsonRecord({
      ...base,
      rarity: getNumber(args.rarity),
      rarityRaw: getString(args.rarity),
      generation: getNumber(args.generation),
      generationRaw: getString(args.generation),
      txType: eventName,
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

  if (eventName === 'Staked' || eventName === 'Unstaked') {
    const account = getString(args.account);
    return toJsonRecord({
      account,
      accountNormalized: normalizeAddress(chain, account),
      amountRaw: getString(args.amount),
      accountBalanceRaw: getString(args.accountBalance),
      totalStakedRaw: getString(args.totalStaked),
      txType: eventName,
    });
  }

  if (eventName === 'VestingCreated' || eventName === 'TokensReleased') {
    const beneficiary = getString(args.beneficiary);
    return toJsonRecord({
      beneficiary,
      beneficiaryNormalized: normalizeAddress(chain, beneficiary),
      scheduleId: getString(args.scheduleId)?.toLowerCase() ?? null,
      amountRaw: getString(args.amount),
      allocatedAmountRaw: eventName === 'VestingCreated' ? getString(args.amount) : '0',
      releasedAmountRaw: eventName === 'TokensReleased' ? getString(args.amount) : '0',
      startRaw: eventName === 'VestingCreated' ? getString(args.start) : null,
      cliffRaw: eventName === 'VestingCreated' ? getString(args.cliff) : null,
      durationRaw: eventName === 'VestingCreated' ? getString(args.duration) : null,
      txType: eventName,
    });
  }

  if (eventName === 'BatchPublished') {
    return toJsonRecord({
      batchId: getString(args.batchId)?.toLowerCase() ?? null,
      merkleRoot: getString(args.merkleRoot)?.toLowerCase() ?? null,
      inputHash: getString(args.inputHash)?.toLowerCase() ?? null,
      metadataHash: getString(args.metadataHash)?.toLowerCase() ?? null,
      totalAllocatedRaw: getString(args.totalAllocated),
      startsAtRaw: getString(args.startsAt),
      expiresAtRaw: getString(args.expiresAt),
      txType: eventName,
    });
  }

  if (eventName === 'RewardClaimed') {
    const account = getString(args.account);
    return toJsonRecord({
      batchId: getString(args.batchId)?.toLowerCase() ?? null,
      account,
      accountNormalized: normalizeAddress(chain, account),
      amountRaw: getString(args.amount),
      txType: eventName,
    });
  }

  if (eventName === 'BatchClosed') {
    return toJsonRecord({
      batchId: getString(args.batchId)?.toLowerCase() ?? null,
      unclaimedAmountRaw: getString(args.unclaimedAmount),
      txType: eventName,
    });
  }

  if (
    contractAlias === 'CUKIE_MASTER_NFT_VAULT'
    || contractAlias === 'CUKIE_POOL_NFT_VAULT'
  ) {
    const collection = getString(args.collection);
    const beneficiary = getString(args.beneficiary);
    const recipient = getString(args.recipient);
    const lifecycle = eventName === 'CukieMasterDeposited'
      ? 'custodied'
      : eventName === 'CukieMasterWithdrawn'
        ? 'withdrawn'
        : eventName === 'CukiePoolDeposited'
          ? 'pending_activation'
          : eventName === 'CukiePoolExitRequested'
            ? 'exit_requested'
            : eventName === 'CukiePoolWithdrawn'
              ? 'withdrawn'
              : null;

    return toJsonRecord({
      ...base,
      collection,
      collectionNormalized: normalizeAddress(chain, collection),
      beneficiary,
      beneficiaryNormalized: normalizeAddress(chain, beneficiary),
      recipient,
      recipientNormalized: normalizeAddress(chain, recipient),
      allowed: typeof args.allowed === 'boolean' ? args.allowed : null,
      depositEpochRaw: getString(args.depositEpoch),
      depositedAtRaw: getString(args.depositedAt),
      withdrawnAtRaw: getString(args.withdrawnAt),
      recoveredAtRaw: getString(args.recoveredAt),
      requestedAtRaw: getString(args.requestedAt),
      depositPeriodIdRaw: getString(args.depositPeriodId),
      activationAtRaw: getString(args.activationAt),
      activationPeriodIdRaw: getString(args.activationPeriodId),
      exitPeriodIdRaw: getString(args.exitPeriodId),
      withdrawableAtRaw: getString(args.withdrawableAt),
      previousWithdrawableAtRaw: getString(args.previousWithdrawableAt),
      newWithdrawableAtRaw: getString(args.newWithdrawableAt),
      calendarVersionRaw: getString(args.calendarVersion),
      versionRaw: getString(args.version),
      effectiveAtRaw: getString(args.effectiveAt),
      firstCutoffAtRaw: getString(args.firstCutoffAt),
      firstPeriodIdRaw: getString(args.firstPeriodId),
      periodAnchorSecondsRaw: getString(args.periodAnchorSeconds),
      lifecycle,
      txType: eventName,
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
