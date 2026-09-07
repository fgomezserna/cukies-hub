import type { ClientSession } from 'mongodb';

import type { IndexerStore } from '../storage/index.js';
import type { ChainEvent } from '../types.js';
import { getString, normalizeAddress, now } from '../utils/json.js';
import { isMongoDuplicateKey, monotonicAbsoluteUpdate } from './monotonic.js';

function collection(store: IndexerStore, name: string) {
  return store.db.collection<any>(name);
}

function field(event: ChainEvent, name: string) {
  return event.normalized[name] ?? event.args[name];
}

function stringField(event: ChainEvent, name: string) {
  return getString(field(event, name));
}

function contractKey(event: ChainEvent) {
  const address = event.chain === 'BSC'
    ? event.contractAddress.toLowerCase()
    : event.contractAddress;
  return `${event.chain}:${event.chainId ?? 'mainnet'}:${event.contractAlias}:${address}`;
}

function eventEvidence(event: ChainEvent) {
  return {
    eventId: event._id,
    txHash: event.txHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    blockHash: event.blockHash,
    timestampMs: event.timestampMs,
    date: new Date(event.timestampMs),
  };
}

const approvalEvents = new Set(['Approval', 'ApprovalForAll']);
const adminEvents = new Set([
  'MinterAdded',
  'MinterRemoved',
  'OwnershipRenounced',
  'OwnershipTransferred',
  'OwnershipTransferStarted',
  'Paused',
  'Unpaused',
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

export function isLegacyAuditEvent(event: ChainEvent) {
  return approvalEvents.has(event.eventName) || adminEvents.has(event.eventName);
}

/**
 * Admin and approval events are useful audit inputs even when they have no
 * domain projection. They are deliberately kept outside points/economy.
 */
export async function projectLegacyAuditEvent(store: IndexerStore, event: ChainEvent) {
  if (approvalEvents.has(event.eventName)) {
    if (event.eventName === 'Approval') {
      const owner = stringField(event, 'owner');
      const tokenId = stringField(event, 'tokenId');
      if (!owner || !tokenId) {
        await projectRawAuditEvent(store, event, 'approval-invalid');
        return null;
      }
      const approved = stringField(event, 'approved');
      const id = `${contractKey(event)}:approval:${normalizeAddress(event.chain, owner)}:${tokenId}`;
      const approvals = collection(store, 'nft_approvals');
      await monotonicAbsoluteUpdate(
        approvals,
        id,
        { blockNumber: event.blockNumber, logIndex: event.logIndex },
        {
          chain: event.chain,
          chainId: event.chainId,
          contractAlias: event.contractAlias,
          contractAddress: event.contractAddress,
          tokenId,
          owner,
          ownerNormalized: normalizeAddress(event.chain, owner),
          approved,
          approvedNormalized: normalizeAddress(event.chain, approved),
          state: event.normalized.approvalState ?? 'active',
          rawArgs: event.args,
          ...eventEvidence(event),
          updatedAt: now(),
        },
        now(),
      );
      return null;
    }

    const owner = stringField(event, 'owner');
    const operator = stringField(event, 'operator');
    if (!owner || !operator) {
      await projectRawAuditEvent(store, event, 'approval-for-all-invalid');
      return null;
    }
    const id = `${contractKey(event)}:approval-for-all:${normalizeAddress(event.chain, owner)}:${normalizeAddress(event.chain, operator)}`;
    const approvals = collection(store, 'nft_operator_approvals');
    await monotonicAbsoluteUpdate(
      approvals,
      id,
      { blockNumber: event.blockNumber, logIndex: event.logIndex },
      {
        chain: event.chain,
        chainId: event.chainId,
        contractAlias: event.contractAlias,
        contractAddress: event.contractAddress,
        owner,
        ownerNormalized: normalizeAddress(event.chain, owner),
        operator,
        operatorNormalized: normalizeAddress(event.chain, operator),
        approved: field(event, 'approved') === true,
        state: event.normalized.approvalState ?? (field(event, 'approved') === true ? 'active' : 'revoked'),
        rawArgs: event.args,
        ...eventEvidence(event),
        updatedAt: now(),
      },
      now(),
    );
    return null;
  }

  if (adminEvents.has(event.eventName)) {
    await projectRawAuditEvent(store, event, 'admin');

    const stateSuffix = event.eventName === 'OwnershipTransferred'
      || event.eventName === 'OwnershipRenounced'
      || event.eventName === 'OwnershipTransferStarted'
      ? 'ownership'
      : event.eventName === 'Paused' || event.eventName === 'Unpaused'
        ? 'pause'
        : `config:${event.eventName}`;
    const key = `${contractKey(event)}:${stateSuffix}`;
    const state: Record<string, unknown> = {
      chain: event.chain,
      chainId: event.chainId,
      contractAlias: event.contractAlias,
      contractAddress: event.contractAddress,
      lastEventName: event.eventName,
      lastEventId: event._id,
      rawArgs: event.args,
      lastBlockNumber: event.blockNumber,
      lastLogIndex: event.logIndex,
      updatedAt: now(),
    };
    if (event.eventName === 'OwnershipTransferred' || event.eventName === 'OwnershipRenounced') {
      state.owner = stringField(event, 'newOwner') ?? null;
      state.ownerNormalized = normalizeAddress(event.chain, state.owner);
      state.ownershipState = event.eventName === 'OwnershipRenounced' ? 'renounced' : 'active';
    }
    if (event.eventName === 'OwnershipTransferStarted') {
      state.pendingOwner = stringField(event, 'newOwner');
      state.pendingOwnerNormalized = normalizeAddress(event.chain, state.pendingOwner);
    }
    if (event.eventName === 'Paused' || event.eventName === 'Unpaused') {
      state.paused = event.eventName === 'Paused';
    }
    await monotonicAbsoluteUpdate(
      collection(store, 'contract_admin_state'),
      key,
      { blockNumber: event.blockNumber, logIndex: event.logIndex },
      state,
      now(),
    );
    return null;
  }

  return undefined;
}

export async function projectRawAuditEvent(store: IndexerStore, event: ChainEvent, classification: string) {
  await collection(store, 'chain_event_audit').updateOne(
    { _id: event._id },
    {
      $setOnInsert: {
        _id: event._id,
        chain: event.chain,
        chainId: event.chainId,
        contractAlias: event.contractAlias,
        contractAddress: event.contractAddress,
        eventName: event.eventName,
        classification,
        rawArgs: event.args,
        rawEvent: event.raw,
        ...eventEvidence(event),
        createdAt: now(),
      },
    },
    { upsert: true },
  );
}

async function projectBridgeAudit(
  store: IndexerStore,
  event: ChainEvent,
  classification: string,
  details: Record<string, unknown> = {},
) {
  await projectRawAuditEvent(store, event, classification);
  await collection(store, 'chain_event_audit').updateOne(
    { _id: event._id },
    {
      $set: {
        transferId: stringField(event, 'transferId'),
        bridgeFamily: 'endpoint-v2',
        ...details,
        updatedAt: now(),
      },
    },
  );
}

export async function projectReferralEvent(store: IndexerStore, event: ChainEvent) {
  if (event.eventName !== 'MintReferral') return undefined;
  const user = stringField(event, 'user');
  const sponsor = stringField(event, 'sponsor');
  await collection(store, 'referral_events').updateOne(
    { _id: event._id },
    {
      $setOnInsert: {
        _id: event._id,
        chain: event.chain,
        contractAlias: event.contractAlias,
        contractAddress: event.contractAddress,
        user,
        userNormalized: normalizeAddress(event.chain, user),
        sponsor,
        sponsorNormalized: normalizeAddress(event.chain, sponsor),
        numRaw: stringField(event, 'numRaw'),
        valueRaw: stringField(event, 'valueRaw'),
        commissionRaw: stringField(event, 'commissionRaw'),
        comissionRaw: stringField(event, 'comissionRaw'),
        levelRaw: stringField(event, 'levelRaw'),
        rawArgs: event.args,
        ...eventEvidence(event),
        createdAt: now(),
      },
    },
    { upsert: true },
  );
  return null;
}

type BreedingLedgerEvent = {
  _id: string;
  eventName: 'BreedStart' | 'BreedFinish';
  familyKey: string;
  chain: ChainEvent['chain'];
  chainId?: ChainEvent['chainId'];
  contractAlias: string;
  contractAddress: string;
  contractKey: string;
  owner: string;
  ownerNormalized: string;
  parent1: string;
  parent2: string;
  childId?: string;
  resultRaw?: string;
  dateRaw?: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  timestampMs: number;
  blockHash?: string;
};

type BreedingOperation = {
  _id: string;
  baseKey: string;
  chain: ChainEvent['chain'];
  chainId?: ChainEvent['chainId'];
  contractAlias: string;
  contractAddress: string;
  owner: string;
  ownerNormalized: string;
  parent1: string;
  parent2: string;
  status: 'started' | 'completed' | 'orphan_finish';
  correlationStatus: 'pending' | 'matched_start' | 'orphan_finish';
  startEventId?: string;
  startTxHash?: string;
  startDateRaw?: string;
  startEvidence?: Record<string, unknown>;
  finishEventId?: string;
  finishTxHash?: string;
  resultRaw?: string;
  childId?: string;
  childIdentity?: string;
  finishDateRaw?: string;
  finishEvidence?: Record<string, unknown>;
  updatedAt: Date;
  createdAt: Date;
};

type BreedingChild = {
  _id: string;
  familyKey: string;
  chain: ChainEvent['chain'];
  chainId?: ChainEvent['chainId'];
  contractAlias: string;
  contractAddress: string;
  childId: string;
  owner: string;
  ownerNormalized: string;
  parent1: string;
  parent2: string;
  operationId: string;
  orphanFinish: boolean;
  eventId: string;
  updatedAt: Date;
  createdAt: Date;
};

function compareBreedingEvents(left: BreedingLedgerEvent, right: BreedingLedgerEvent) {
  return left.blockNumber - right.blockNumber
    || left.logIndex - right.logIndex
    || left._id.localeCompare(right._id);
}

function breedingOperationId(familyKey: string, event: BreedingLedgerEvent, kind: 'start' | 'finish') {
  return `${familyKey}:operation:${kind}:${event._id}`;
}

function breedingEvidence(event: BreedingLedgerEvent) {
  return {
    eventId: event._id,
    txHash: event.txHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    blockHash: event.blockHash,
    timestampMs: event.timestampMs,
    date: new Date(event.timestampMs),
  };
}

function breedingEventToOperation(
  familyKey: string,
  start: BreedingLedgerEvent | undefined,
  finish: BreedingLedgerEvent | undefined,
): BreedingOperation {
  const source = start ?? finish as BreedingLedgerEvent;
  const operation: BreedingOperation = {
    _id: breedingOperationId(familyKey, finish ?? start as BreedingLedgerEvent, finish ? 'finish' : 'start'),
    baseKey: familyKey,
    chain: source.chain,
    chainId: source.chainId,
    contractAlias: source.contractAlias,
    contractAddress: source.contractAddress,
    owner: source.owner,
    ownerNormalized: source.ownerNormalized,
    parent1: source.parent1,
    parent2: source.parent2,
    status: finish ? (start ? 'completed' : 'orphan_finish') : 'started',
    correlationStatus: finish ? (start ? 'matched_start' : 'orphan_finish') : 'pending',
    updatedAt: now(),
    createdAt: now(),
  };
  if (start) {
    operation.startEventId = start._id;
    operation.startTxHash = start.txHash;
    operation.startDateRaw = start.dateRaw;
    operation.startEvidence = breedingEvidence(start);
  }
  if (finish) {
    operation.finishEventId = finish._id;
    operation.finishTxHash = finish.txHash;
    operation.resultRaw = finish.resultRaw;
    operation.childId = finish.childId;
    operation.childIdentity = `${finish.contractKey}:${finish.childId}`;
    operation.finishDateRaw = finish.dateRaw;
    operation.finishEvidence = breedingEvidence(finish);
  }
  return operation;
}

async function removeFamilyRows(target: any, filter: Record<string, unknown>, session?: ClientSession) {
  if (typeof target.deleteMany === 'function') {
    await target.deleteMany(filter, { session });
    return;
  }
  if (typeof target.find !== 'function' || typeof target.deleteOne !== 'function') return;
  const rows = await target.find(filter).toArray();
  for (const row of rows) await target.deleteOne({ _id: row._id }, { session });
}

async function rebuildBreedingFamily(
  store: IndexerStore,
  familyKey: string,
  session?: ClientSession,
) {
  const ledger = collection(store, 'breeding_event_ledger');
  const events = (await ledger.find({ familyKey }, { session }).toArray()) as BreedingLedgerEvent[];
  events.sort(compareBreedingEvents);

  const openStarts: BreedingLedgerEvent[] = [];
  const matches = new Map<string, BreedingLedgerEvent>();
  for (const ledgerEvent of events) {
    if (ledgerEvent.eventName === 'BreedStart') {
      openStarts.push(ledgerEvent);
      continue;
    }
    const startIndex = openStarts.findIndex((start) => compareBreedingEvents(start, ledgerEvent) <= 0);
    if (startIndex < 0) continue;
    const [start] = openStarts.splice(startIndex, 1);
    matches.set(ledgerEvent._id, start);
  }

  const desiredOperations = new Map<string, BreedingOperation>();
  const desiredChildren = new Map<string, BreedingChild>();
  for (const ledgerEvent of events) {
    if (ledgerEvent.eventName === 'BreedStart') {
      if (![...matches.values()].some((start) => start._id === ledgerEvent._id)) {
        const operation = breedingEventToOperation(familyKey, ledgerEvent, undefined);
        desiredOperations.set(operation._id, operation);
      }
      continue;
    }
    const start = matches.get(ledgerEvent._id);
    const operation = breedingEventToOperation(familyKey, start, ledgerEvent);
    desiredOperations.set(operation._id, operation);
    const childIdentity = `${ledgerEvent.contractKey}:${ledgerEvent.childId}`;
    desiredChildren.set(childIdentity, {
      _id: childIdentity,
      familyKey,
      chain: ledgerEvent.chain,
      chainId: ledgerEvent.chainId,
      contractAlias: ledgerEvent.contractAlias,
      contractAddress: ledgerEvent.contractAddress,
      childId: ledgerEvent.childId as string,
      owner: ledgerEvent.owner,
      ownerNormalized: ledgerEvent.ownerNormalized,
      parent1: ledgerEvent.parent1,
      parent2: ledgerEvent.parent2,
      operationId: operation._id,
      orphanFinish: !start,
      eventId: ledgerEvent._id,
      updatedAt: now(),
      createdAt: now(),
    });
  }
  const operations = collection(store, 'breeding_operations');
  const children = collection(store, 'breeding_children');
  await removeFamilyRows(operations, { baseKey: familyKey }, session);
  await removeFamilyRows(children, { familyKey }, session);
  for (const operation of desiredOperations.values()) {
    const { _id: operationId, createdAt, ...operationValues } = operation;
    await operations.updateOne(
      { _id: operationId },
      { $set: operationValues, $setOnInsert: { _id: operationId, createdAt } },
      { upsert: true, session },
    );
  }
  for (const child of desiredChildren.values()) {
    const { _id: childId, createdAt, ...childValues } = child;
    await children.updateOne(
      { _id: childId },
      { $set: childValues, $setOnInsert: { _id: childId, createdAt } },
      { upsert: true, session },
    );
  }
}

const breedingFamilyLocks = new WeakMap<object, Map<string, Promise<void>>>();

async function withBreedingFamilyLock<T>(store: IndexerStore, familyKey: string, work: () => Promise<T>) {
  const storeKey = store as unknown as object;
  let locks = breedingFamilyLocks.get(storeKey);
  if (!locks) {
    locks = new Map<string, Promise<void>>();
    breedingFamilyLocks.set(storeKey, locks);
  }
  const previous = locks.get(familyKey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  locks.set(familyKey, current);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (locks.get(familyKey) === current) locks.delete(familyKey);
  }
}

async function withOptionalTransaction<T>(store: IndexerStore, work: (session?: ClientSession) => Promise<T>) {
  const client = (store.db as any).client;
  if (!client || typeof client.startSession !== 'function') return work();
  const session = client.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}

export async function projectBreedingLedger(store: IndexerStore, event: ChainEvent) {
  if (event.eventName !== 'BreedStart' && event.eventName !== 'BreedFinish') return undefined;
  const parent1 = stringField(event, 'parent1');
  const parent2 = stringField(event, 'parent2');
  const owner = stringField(event, 'user') ?? stringField(event, 'owner');
  const childId = event.eventName === 'BreedFinish' ? stringField(event, 'tokenId') : undefined;
  if (!parent1 || !parent2 || !owner) {
    await projectRawAuditEvent(store, event, 'breeding-invalid');
    return null;
  }
  if (event.eventName === 'BreedFinish' && !childId) {
    await projectRawAuditEvent(store, event, 'breeding-finish-invalid');
    return null;
  }
  const familyKey = [
    contractKey(event),
    'breeding',
    normalizeAddress(event.chain, owner),
    parent1,
    parent2,
  ].join(':');
  const ownerNormalized = normalizeAddress(event.chain, owner) ?? owner;
  const dateRaw = stringField(event, 'dateRaw');
  const ledgerEvent: BreedingLedgerEvent = {
    _id: event._id,
    eventName: event.eventName,
    familyKey,
    chain: event.chain,
    chainId: event.chainId,
    contractAlias: event.contractAlias,
    contractAddress: event.contractAddress,
    contractKey: contractKey(event),
    owner,
    ownerNormalized,
    parent1,
    parent2,
    ...(childId ? { childId, resultRaw: childId } : {}),
    ...(dateRaw ? { dateRaw } : {}),
    txHash: event.txHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    timestampMs: event.timestampMs,
    blockHash: event.blockHash,
  };

  return withBreedingFamilyLock(store, familyKey, async () => withOptionalTransaction(store, async (session) => {
    await collection(store, 'breeding_event_ledger').updateOne(
      { _id: event._id },
      { $setOnInsert: ledgerEvent },
      { upsert: true, session },
    );
    await rebuildBreedingFamily(store, familyKey, session);
    return null;
  }));
}

export async function projectBridgeLifecycle(store: IndexerStore, event: ChainEvent) {
  if (event.eventName !== 'BridgeRequested' && event.eventName !== 'BridgeCompleted') return undefined;
  if (event.contractAlias !== 'BRIDGE_ENDPOINT') {
    await projectBridgeAudit(store, event, 'bridge-protocol-mismatch');
    return `Evento bridge v2 fuera de BRIDGE_ENDPOINT: ${event.contractAlias}:${event.eventName}`;
  }

  const transferId = stringField(event, 'transferId');
  const tokenId = stringField(event, 'tokenId');
  const metadataHash = stringField(event, 'metadataHash');
  const sourceNetworkRaw = stringField(event, 'sourceNetworkRaw');
  const destinationNetworkRaw = stringField(event, 'destinationNetworkRaw');
  if (!transferId || !tokenId || !metadataHash || !sourceNetworkRaw || !destinationNetworkRaw) {
    await projectBridgeAudit(store, event, 'bridge-invalid');
    return null;
  }

  const bridgeRoute = `${sourceNetworkRaw}>${destinationNetworkRaw}`;
  const bridgeFamily = 'endpoint-v2';
  const id = `${bridgeFamily}:${transferId}`;
  const transfers = collection(store, 'bridge_transfers');
  const evidence = eventEvidence(event);
  const requestPayload = {
    requestChain: event.chain,
    requestChainId: event.chainId,
    requestContractAlias: event.contractAlias,
    requestContractAddress: event.contractAddress,
    requestTokenId: tokenId,
    requestSourceOwner: stringField(event, 'sourceOwner'),
    requestDestinationOwner: stringField(event, 'destinationOwner'),
    requestDestinationOwnerRaw: stringField(event, 'destinationOwnerRaw'),
    requestSourceNetworkRaw: sourceNetworkRaw,
    requestDestinationNetworkRaw: destinationNetworkRaw,
    requestNonceRaw: stringField(event, 'nonceRaw'),
    requestFeePaidRaw: stringField(event, 'feePaidRaw'),
    requestMetadataHash: metadataHash,
    requestEventId: event._id,
    requestEvidence: evidence,
    bridgeFamily,
    bridgeRoute,
    updatedAt: now(),
  };

  const createIfAbsent = async (values: Record<string, unknown>) => {
    try {
      await transfers.updateOne(
        { _id: id },
        { $setOnInsert: { _id: id, ...values, createdAt: now() } },
        { upsert: true },
      );
    } catch (error) {
      if (!isMongoDuplicateKey(error)) throw error;
    }
    return transfers.findOne({ _id: id });
  };

  let current = await transfers.findOne({ _id: id });
  if (current && current.bridgeRoute !== bridgeRoute) {
    await projectBridgeAudit(store, event, 'bridge-route-mismatch', {
      existingRoute: current.bridgeRoute,
      incomingRoute: bridgeRoute,
      existingTokenId: current.tokenId,
      incomingTokenId: tokenId,
      existingMetadataHash: current.metadataHash,
      incomingMetadataHash: metadataHash,
    });
    return null;
  }

  if (event.eventName === 'BridgeRequested') {
    if (!current) {
      current = await createIfAbsent({
        bridgeFamily,
        bridgeRoute,
        chain: event.chain,
        chainId: event.chainId,
        contractAlias: event.contractAlias,
        contractAddress: event.contractAddress,
        eventId: event._id,
        transferId,
        tokenId,
        metadataHash,
        sourceNetworkRaw,
        destinationNetworkRaw,
        requestChain: event.chain,
        requestChainId: event.chainId,
        requestContractAlias: event.contractAlias,
        requestContractAddress: event.contractAddress,
        requestTokenId: tokenId,
        requestSourceOwner: stringField(event, 'sourceOwner'),
        requestDestinationOwner: stringField(event, 'destinationOwner'),
        requestDestinationOwnerRaw: stringField(event, 'destinationOwnerRaw'),
        requestSourceNetworkRaw: sourceNetworkRaw,
        requestDestinationNetworkRaw: destinationNetworkRaw,
        requestNonceRaw: stringField(event, 'nonceRaw'),
        requestFeePaidRaw: stringField(event, 'feePaidRaw'),
        requestMetadataHash: metadataHash,
        requestEventId: event._id,
        requestEvidence: evidence,
        status: 'requested',
        orphanCompletion: false,
        updatedAt: now(),
      });
      if (!current) return null;
    }
    if (current.bridgeRoute !== bridgeRoute) {
      await projectBridgeAudit(store, event, 'bridge-route-mismatch', {
        existingRoute: current.bridgeRoute,
        incomingRoute: bridgeRoute,
        existingTokenId: current.tokenId,
        incomingTokenId: tokenId,
        existingMetadataHash: current.metadataHash,
        incomingMetadataHash: metadataHash,
      });
      return null;
    }

    const payloadMatches = String(current.tokenId) === tokenId
      && String(current.metadataHash) === metadataHash
      && current.bridgeRoute === bridgeRoute;
    if (current.status === 'completed') {
      if (!current.requestEventId && payloadMatches) {
        await transfers.updateOne(
          {
            _id: id,
            bridgeFamily,
            bridgeRoute,
            transferId,
            status: 'completed',
            tokenId,
            metadataHash,
            completionEventId: { $exists: true },
            requestEventId: { $exists: false },
            orphanCompletion: true,
          },
          {
            $set: {
              ...requestPayload,
              orphanCompletion: false,
            },
          },
          { upsert: false },
        );
      } else if (current.requestEventId) {
        await transfers.updateOne(
          {
            _id: id,
            status: 'completed',
            requestEventId: current.requestEventId,
            lateRequestEventId: { $exists: false },
          },
          {
            $set: {
              lateRequestEventId: event._id,
              lateRequestEvidence: evidence,
              lateRequestTokenId: tokenId,
              lateRequestMetadataHash: metadataHash,
              updatedAt: now(),
            },
          },
          { upsert: false },
        );
      }
      await projectBridgeAudit(
        store,
        event,
        payloadMatches ? 'bridge-request-replay-after-completion' : 'bridge-terminal-request-mismatch',
        {
          integrity: payloadMatches ? 'consistent_replay' : 'conflict',
          existingTokenId: current.tokenId,
          incomingTokenId: tokenId,
          existingMetadataHash: current.metadataHash,
          incomingMetadataHash: metadataHash,
          existingRoute: current.bridgeRoute,
          incomingRoute: bridgeRoute,
          terminalCompletionEventId: current.completionEventId,
        },
      );
      return null;
    }
    if (!payloadMatches) {
      await projectBridgeAudit(store, event, 'bridge-request-payload-conflict', {
        integrity: 'conflict',
        existingTokenId: current.tokenId,
        incomingTokenId: tokenId,
        existingMetadataHash: current.metadataHash,
        incomingMetadataHash: metadataHash,
      });
    }
    return null;
  }

  if (!current) {
    current = await createIfAbsent({
      bridgeFamily,
      bridgeRoute,
      chain: event.chain,
      chainId: event.chainId,
      contractAlias: event.contractAlias,
      contractAddress: event.contractAddress,
      eventId: event._id,
      transferId,
      tokenId,
      metadataHash,
      sourceNetworkRaw,
      destinationNetworkRaw,
      orphanCompletion: true,
      completionChain: event.chain,
      completionChainId: event.chainId,
      completionContractAlias: event.contractAlias,
      completionContractAddress: event.contractAddress,
      completionTokenId: tokenId,
      completionDestinationOwner: stringField(event, 'destinationOwner'),
      completionSourceNetworkRaw: sourceNetworkRaw,
      completionDestinationNetworkRaw: destinationNetworkRaw,
      minted: field(event, 'minted'),
      completionMetadataHash: metadataHash,
      completionEventId: event._id,
      completionEvidence: evidence,
      status: 'completed',
      updatedAt: now(),
    });
    if (!current) return null;
    if (current.bridgeRoute !== bridgeRoute) {
      await projectBridgeAudit(store, event, 'bridge-route-mismatch', {
        existingRoute: current.bridgeRoute,
        incomingRoute: bridgeRoute,
        existingTokenId: current.tokenId,
        incomingTokenId: tokenId,
        existingMetadataHash: current.metadataHash,
        incomingMetadataHash: metadataHash,
      });
      return null;
    }
  }

  const payloadMatches = String(current.tokenId) === tokenId
    && String(current.metadataHash) === metadataHash
    && current.bridgeRoute === bridgeRoute;
  if (current.status === 'completed') {
    if (current.completionEventId === event._id) return null;
    await projectBridgeAudit(
      store,
      event,
      payloadMatches ? 'bridge-completion-replay' : 'bridge-completion-payload-conflict',
      {
        integrity: payloadMatches ? 'consistent_replay' : 'conflict',
        existingCompletionEventId: current.completionEventId,
        incomingCompletionEventId: event._id,
        existingTokenId: current.tokenId,
        incomingTokenId: tokenId,
        existingMetadataHash: current.metadataHash,
        incomingMetadataHash: metadataHash,
      },
    );
    return null;
  }
  if (!payloadMatches) {
    await projectBridgeAudit(store, event, 'bridge-completion-payload-conflict', {
      integrity: 'conflict',
      existingTokenId: current.tokenId,
      incomingTokenId: tokenId,
      existingMetadataHash: current.metadataHash,
      incomingMetadataHash: metadataHash,
    });
    return null;
  }

  const transition = await transfers.updateOne(
    {
      _id: id,
      bridgeFamily,
      bridgeRoute,
      transferId,
      status: 'requested',
      tokenId,
      metadataHash,
      requestEventId: current.requestEventId,
      requestTokenId: tokenId,
      requestMetadataHash: metadataHash,
      orphanCompletion: false,
      completionEventId: { $exists: false },
    },
    {
      $set: {
        completionChain: event.chain,
        completionChainId: event.chainId,
        completionContractAlias: event.contractAlias,
        completionContractAddress: event.contractAddress,
        completionTokenId: tokenId,
        completionDestinationOwner: stringField(event, 'destinationOwner'),
        completionSourceNetworkRaw: sourceNetworkRaw,
        completionDestinationNetworkRaw: destinationNetworkRaw,
        minted: field(event, 'minted'),
        completionMetadataHash: metadataHash,
        completionEventId: event._id,
        completionEvidence: evidence,
        status: 'completed',
        orphanCompletion: false,
        updatedAt: now(),
      },
    },
    { upsert: false },
  );
  if (transition.matchedCount > 0) return null;

  current = await transfers.findOne({ _id: id });
  if (current?.status === 'completed' && current.completionEventId === event._id) return null;
  await projectBridgeAudit(store, event, 'bridge-completion-cas-race', {
    integrity: 'conflict',
    existingCompletionEventId: current?.completionEventId,
    incomingCompletionEventId: event._id,
    existingTokenId: current?.tokenId,
    incomingTokenId: tokenId,
    existingMetadataHash: current?.metadataHash,
    incomingMetadataHash: metadataHash,
  });
  return null;
}

export async function projectGenericAuditEvent(store: IndexerStore, event: ChainEvent) {
  await projectRawAuditEvent(store, event, 'unclassified');
  return `Evento ABI sin clasificacion de negocio: ${event.contractAlias}:${event.eventName}`;
}
