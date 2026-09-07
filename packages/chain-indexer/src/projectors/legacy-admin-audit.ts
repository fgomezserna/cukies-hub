import type { IndexerStore } from '../storage/index.js';
import type { ChainEvent, ContractAlias } from '../types.js';
import { TronWeb } from 'tronweb';
import { getString, normalizeAddress, now } from '../utils/json.js';
import { monotonicAbsoluteUpdate } from './monotonic.js';
import { projectRawAuditEvent } from './legacy-events.js';

export type LegacyAdminClassification = 'admin' | 'config' | 'role' | 'erc20';

export type LegacyAdminEventDescriptor = {
  classification: LegacyAdminClassification;
  entityKey: string;
  preserveDomain: boolean;
};

export type LegacyAdminProjectionResult = LegacyAdminEventDescriptor & {
  eventId: string;
  materialized: boolean;
  reason?: 'source-unverified';
};

const vaultAliases = new Set<ContractAlias>([
  'CUKIE_MASTER_NFT_VAULT',
  'CUKIE_POOL_NFT_VAULT',
]);

const vaultDomainEvents = new Set([
  'CollectionAllowedUpdated',
  'CukieMasterCollectionAllowedUpdated',
  'CukiePoolCollectionAllowedUpdated',
  'CukiePoolCalendarVersionScheduled',
  'UntrackedERC721Recovered',
  'CukieMasterUntrackedERC721Recovered',
  'CukiePoolUntrackedERC721Recovered',
]);

const ownershipEvents = new Set([
  'OwnershipRenounced',
  'OwnershipTransferred',
  'UkiTokenOwnershipTransferred',
]);

const pauseEvents = new Set(['Paused', 'Unpaused', 'UkiTokenPaused', 'UkiTokenUnpaused']);

const roleEvents = new Set(['RoleAdminChanged', 'RoleGranted', 'RoleRevoked']);

const configEvents = new Set([
  'MinterAdded',
  'MinterRemoved',
  'PaymentTokenAllowedUpdated',
  'NativePaymentAllowedUpdated',
  'FeeConfigUpdated',
  'NativeFeesClaimed',
  'MinPurchaseUpdated',
  'SaleEnabledUpdated',
  'SaleWindowUpdated',
  'TotalUkiForSaleUpdated',
  'TreasuryUpdated',
  'UkiPerAsmUpdated',
  'PresaleVestingConfigFrozen',
  'PresaleVestingConfigUpdated',
  'UnallocatedWithdrawn',
  'ExcessRecovered',
  'RelayerUpdated',
  'BridgePriceUpdated',
  'FeeRecipientUpdated',
  'UntrackedERC721Recovered',
  'CollectionAllowedUpdated',
  'CukieMasterCollectionAllowedUpdated',
  'CukieMasterUntrackedERC721Recovered',
  'CukiePoolCollectionAllowedUpdated',
  'CukiePoolCalendarVersionScheduled',
  'CukiePoolUntrackedERC721Recovered',
]);

const erc20Events = new Set(['UkiTokenApproval', 'UkiTokenTransfer']);

function collection(store: IndexerStore, name: string) {
  return store.db.collection<any>(name);
}

function value(event: ChainEvent, ...names: string[]) {
  for (const name of names) {
    if (event.normalized[name] !== undefined && event.normalized[name] !== null) {
      return event.normalized[name];
    }
    if (event.args[name] !== undefined && event.args[name] !== null) return event.args[name];
  }
  return undefined;
}

function raw(event: ChainEvent, ...names: string[]) {
  return getString(value(event, ...names));
}

function contractKey(event: ChainEvent) {
  const address = event.chain === 'BSC'
    ? event.contractAddress.toLowerCase()
    : event.contractAddress;
  return `${event.chain}:${event.chainId ?? 'mainnet'}:${event.contractAlias}:${address}`;
}

function addressPart(event: ChainEvent, ...names: string[]) {
  const address = raw(event, ...names);
  return normalizeAddress(event.chain, address) ?? address ?? 'unknown';
}

function domainPreserved(event: ChainEvent) {
  return vaultAliases.has(event.contractAlias) && vaultDomainEvents.has(event.eventName);
}

function entityPart(event: ChainEvent, classification: LegacyAdminClassification) {
  if (ownershipEvents.has(event.eventName) || event.eventName === 'OwnershipTransferStarted') {
    return 'ownership';
  }
  if (pauseEvents.has(event.eventName)) return 'pause';
  switch (event.eventName) {
    case 'RelayerUpdated':
      return `relayer:${addressPart(event, 'relayer')}`;
    case 'FeeRecipientUpdated':
      return 'feeRecipient';
    case 'TreasuryUpdated':
      return 'treasury';
    case 'CollectionAllowedUpdated':
    case 'CukieMasterCollectionAllowedUpdated':
    case 'CukiePoolCollectionAllowedUpdated':
      return `collection:${addressPart(event, 'collection')}`;
    case 'PaymentTokenAllowedUpdated':
      return `paymentToken:${addressPart(event, 'paymentToken')}`;
    case 'MinterAdded':
    case 'MinterRemoved':
      return `minter:${addressPart(event, 'account')}`;
    case 'NativePaymentAllowedUpdated':
      return 'nativePayment';
    case 'FeeConfigUpdated':
      return 'feeConfig';
    case 'RoleAdminChanged':
      return `role:${raw(event, 'role') ?? 'unknown'}`;
    case 'RoleGranted':
    case 'RoleRevoked':
      return `role:${raw(event, 'role') ?? 'unknown'}:account:${addressPart(event, 'account')}`;
    case 'UkiTokenApproval':
      return `allowance:${addressPart(event, 'owner')}:${addressPart(event, 'spender')}`;
    case 'UkiTokenTransfer':
      return `transfer:${event._id}`;
    case 'UntrackedERC721Recovered':
    case 'CukieMasterUntrackedERC721Recovered':
    case 'CukiePoolUntrackedERC721Recovered':
      return `recovery:${raw(event, 'tokenId') ?? 'unknown'}:${addressPart(event, 'recipient')}`;
    case 'UnallocatedWithdrawn':
    case 'ExcessRecovered':
    case 'NativeFeesClaimed':
      return `withdrawal:${addressPart(event, 'to', 'recipient')}`;
    case 'CukiePoolCalendarVersionScheduled':
      return `calendar:${raw(event, 'version') ?? 'unknown'}`;
    default:
      return classification === 'erc20' ? `erc20:${event.eventName}` : event.eventName;
  }
}

export function classifyLegacyAdminEvent(event: ChainEvent): LegacyAdminEventDescriptor | undefined {
  let classification: LegacyAdminClassification | undefined;
  if (event.eventName === 'UkiTokenOwnershipTransferred' || event.eventName === 'UkiTokenPaused'
    || event.eventName === 'UkiTokenUnpaused') {
    if (event.contractAlias !== 'UKI_TOKEN') return undefined;
    classification = 'erc20';
  } else if (event.eventName === 'UkiTokenApproval' || event.eventName === 'UkiTokenTransfer') {
    if (event.contractAlias !== 'UKI_TOKEN') return undefined;
    classification = 'erc20';
  } else if (event.eventName === 'OwnershipTransferStarted'
    || ownershipEvents.has(event.eventName) || pauseEvents.has(event.eventName)) {
    classification = 'admin';
  } else if (roleEvents.has(event.eventName)) {
    classification = 'role';
  } else if (configEvents.has(event.eventName)) {
    classification = 'config';
  } else if (erc20Events.has(event.eventName)) {
    if (event.contractAlias !== 'UKI_TOKEN') return undefined;
    classification = 'erc20';
  }
  if (!classification) return undefined;
  return {
    classification,
    entityKey: entityPart(event, classification),
    preserveDomain: domainPreserved(event),
  };
}

const tronZeroAddress = TronWeb.address.fromHex(`41${'0'.repeat(40)}`).toUpperCase();

function isZeroAddress(event: ChainEvent, address: string | null) {
  if (!address) return false;
  const normalized = normalizeAddress(event.chain, address);
  return event.chain === 'BSC'
    ? normalized === '0x0000000000000000000000000000000000000000'
    : normalized === tronZeroAddress;
}

function evidence(event: ChainEvent, descriptor: LegacyAdminEventDescriptor) {
  return {
    eventId: event._id,
    eventName: event.eventName,
    classification: descriptor.classification,
    entityKey: descriptor.entityKey,
    chain: event.chain,
    chainId: event.chainId,
    contractAlias: event.contractAlias,
    contractAddress: event.contractAddress,
    txHash: event.txHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    blockHash: event.blockHash,
    timestampMs: event.timestampMs,
    rawArgs: event.args,
    rawEvent: event.raw,
    updatedAt: now(),
  };
}

async function projectErc20(store: IndexerStore, event: ChainEvent, descriptor: LegacyAdminEventDescriptor) {
  const ledger = collection(store, 'erc20_event_ledger');
  await ledger.updateOne(
    { _id: event._id },
    { $setOnInsert: { _id: event._id, ...evidence(event, descriptor), createdAt: now() } },
    { upsert: true },
  );
  if (event.eventName === 'UkiTokenApproval') {
    await monotonicAbsoluteUpdate(
      collection(store, 'erc20_allowance_state'),
      `${contractKey(event)}:${descriptor.entityKey}`,
      { blockNumber: event.blockNumber, logIndex: event.logIndex },
      {
        ...evidence(event, descriptor),
        owner: raw(event, 'owner'),
        ownerNormalized: addressPart(event, 'owner'),
        spender: raw(event, 'spender'),
        spenderNormalized: addressPart(event, 'spender'),
        valueRaw: raw(event, 'value'),
        state: raw(event, 'value') === '0' ? 'revoked' : 'active',
      },
      now(),
    );
  } else if (event.eventName !== 'UkiTokenTransfer') {
    await projectAdminState(store, event, descriptor);
  }
}

async function projectAdminState(store: IndexerStore, event: ChainEvent, descriptor: LegacyAdminEventDescriptor) {
  const state: Record<string, unknown> = evidence(event, descriptor);
  if (ownershipEvents.has(event.eventName)) {
    const newOwner = raw(event, 'newOwner', 'owner');
    state.owner = newOwner;
    state.ownerNormalized = normalizeAddress(event.chain, newOwner);
    state.pendingOwner = null;
    state.pendingOwnerNormalized = null;
    state.ownershipState = event.eventName === 'OwnershipRenounced' || isZeroAddress(event, newOwner)
      ? 'renounced'
      : 'active';
  } else if (event.eventName === 'OwnershipTransferStarted') {
    const pendingOwner = raw(event, 'newOwner', 'pendingOwner');
    state.pendingOwner = pendingOwner;
    state.pendingOwnerNormalized = normalizeAddress(event.chain, pendingOwner);
  } else if (pauseEvents.has(event.eventName)) {
    state.paused = event.eventName === 'Paused' || event.eventName === 'UkiTokenPaused';
  } else {
    state.entity = descriptor.entityKey;
    state.valueRaw = raw(event, 'value', 'enabled', 'allowed', 'amount', 'newPrice', 'nextUkiPerAsm');
    if (event.eventName === 'FeeRecipientUpdated') {
      const recipient = raw(event, 'newRecipient', 'nextRecipient', 'recipient');
      state.feeRecipient = recipient;
      state.feeRecipientNormalized = normalizeAddress(event.chain, recipient);
    } else if (event.eventName === 'TreasuryUpdated') {
      const treasury = raw(event, 'nextTreasury', 'newTreasury', 'treasury');
      state.treasury = treasury;
      state.treasuryNormalized = normalizeAddress(event.chain, treasury);
    } else if (event.eventName === 'FeeConfigUpdated') {
      const recipient = raw(event, 'recipient', 'newRecipient');
      state.feeRecipient = recipient;
      state.feeRecipientNormalized = normalizeAddress(event.chain, recipient);
      state.feeBpsRaw = raw(event, 'feeBps');
    }
  }
  await monotonicAbsoluteUpdate(
    collection(store, 'contract_admin_state'),
    `${contractKey(event)}:${descriptor.classification}:${descriptor.entityKey}`,
    { blockNumber: event.blockNumber, logIndex: event.logIndex },
    state,
    now(),
  );
}

/**
 * Classifies and optionally materializes new legacy admin/ERC20 events.
 * The caller must provide verified source evidence; false only preserves raw audit.
 */
export async function projectLegacyAdminAudit(
  store: IndexerStore,
  event: ChainEvent,
  options: { sourceVerified: boolean },
): Promise<LegacyAdminProjectionResult | undefined> {
  const descriptor = classifyLegacyAdminEvent(event);
  if (!descriptor) return undefined;
  await projectRawAuditEvent(store, event, descriptor.classification);
  if (!options.sourceVerified) {
    return { ...descriptor, eventId: event._id, materialized: false, reason: 'source-unverified' };
  }
  if (descriptor.classification === 'erc20') {
    await projectErc20(store, event, descriptor);
  } else {
    await projectAdminState(store, event, descriptor);
  }
  return { ...descriptor, eventId: event._id, materialized: true };
}
