import type { ClientSession } from 'mongodb';

import type { ChainEvent } from '../types.js';
import { getString, now } from '../utils/json.js';
import type { IndexerStore } from '../storage/index.js';

type VaultAlias = 'CUKIE_MASTER_NFT_VAULT' | 'CUKIE_POOL_NFT_VAULT';

export type CukiePoolVaultLifecycle =
  | 'pending_activation'
  | 'active'
  | 'exit_requested'
  | 'withdrawable'
  | 'withdrawn';

export class NftVaultProjectionError extends Error {
  readonly code = 'NFT_VAULT_PROJECTION_INTEGRITY' as const;

  constructor(message: string) {
    super(message);
    this.name = 'NftVaultProjectionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function collection(store: IndexerStore, name: string) {
  return store.db.collection<{ _id: string; [key: string]: any }>(name);
}

function value(event: ChainEvent, key: string) {
  return event.normalized[key] ?? event.args[key];
}

function requiredText(event: ChainEvent, key: string) {
  const resolved = getString(value(event, key));
  if (!resolved) throw new NftVaultProjectionError(`${event.eventName} sin ${key}.`);
  return resolved;
}

function requiredDecimal(event: ChainEvent, key: string) {
  const resolved = requiredText(event, key);
  if (!/^\d+$/.test(resolved)) {
    throw new NftVaultProjectionError(`${event.eventName} contiene ${key} no decimal.`);
  }
  return resolved;
}

function requiredBscAddress(event: ChainEvent, key: string) {
  const resolved = requiredText(event, key).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(resolved) || /^0x0{40}$/.test(resolved)) {
    throw new NftVaultProjectionError(`${event.eventName} contiene ${key} invalida.`);
  }
  return resolved;
}

function requireChainId(event: ChainEvent): 56 | 97 {
  if (event.chain !== 'BSC' || (event.chainId !== 56 && event.chainId !== 97)) {
    throw new NftVaultProjectionError(
      `${event.eventName} requiere chainId BSC 56 o 97 en la evidencia canonica.`,
    );
  }
  return event.chainId;
}

function assetIdentity(event: ChainEvent) {
  const chainId = requireChainId(event);
  const collectionAddressNormalized = requiredBscAddress(event, 'collectionNormalized');
  const tokenId = requiredDecimal(event, 'tokenId');
  return {
    chainId,
    collectionAddressNormalized,
    tokenId,
    assetId: `${chainId}:${collectionAddressNormalized}:${tokenId}`,
  };
}

function evidence(event: ChainEvent) {
  return {
    eventId: event._id,
    txHash: event.txHash.toLowerCase(),
    blockNumber: event.blockNumber,
    blockHash: event.blockHash?.toLowerCase() ?? null,
    logIndex: event.logIndex,
    observedAt: new Date(event.timestampMs),
  };
}

function positionId(assetId: string, depositEpoch: string) {
  return `${assetId}:epoch:${depositEpoch}`;
}

function sameStoredDeposit(
  stored: Record<string, any> | null,
  input: { assetId: string; depositEpoch: string; beneficiaryNormalized: string; eventId: string },
) {
  return Boolean(
    stored
    && stored.assetId === input.assetId
    && stored.depositEpoch === input.depositEpoch
    && stored.beneficiaryNormalized === input.beneficiaryNormalized
    && stored.depositEvidence?.eventId === input.eventId,
  );
}

async function projectCollectionAllowed(
  store: IndexerStore,
  event: ChainEvent,
  session?: ClientSession,
) {
  const chainId = requireChainId(event);
  const vaultAlias = event.contractAlias as VaultAlias;
  const vaultAddressNormalized = event.contractAddress.toLowerCase();
  const collectionAddressNormalized = requiredBscAddress(event, 'collectionNormalized');
  const allowed = value(event, 'allowed');
  if (typeof allowed !== 'boolean') {
    throw new NftVaultProjectionError(`${event.eventName} sin allowed booleano.`);
  }
  const id = `${chainId}:${vaultAddressNormalized}:${collectionAddressNormalized}`;
  const target = collection(store, 'nft_vault_collections');
  const current = await target.findOne({ _id: id }, { session });
  if (current?.lastEventId === event._id) return null;
  if (
    current
    && (
      Number(current.lastBlockNumber) > event.blockNumber
      || (
        Number(current.lastBlockNumber) === event.blockNumber
        && Number(current.lastLogIndex) >= event.logIndex
      )
    )
  ) return null;

  await target.updateOne(
    { _id: id },
    {
      $set: {
        chain: 'BSC',
        chainId,
        vaultAlias,
        vaultAddressNormalized,
        collectionAddressNormalized,
        allowed,
        lastEventId: event._id,
        lastBlockNumber: event.blockNumber,
        lastLogIndex: event.logIndex,
        updatedAt: now(),
      },
      $setOnInsert: { _id: id, createdAt: now() },
    },
    { upsert: true, session },
  );
  return null;
}

async function projectRecoveryAudit(
  store: IndexerStore,
  event: ChainEvent,
  session?: ClientSession,
) {
  const identity = assetIdentity(event);
  const recipientNormalized = requiredBscAddress(event, 'recipientNormalized');
  const recoveredAt = requiredDecimal(event, 'recoveredAtRaw');
  await collection(store, 'nft_vault_recovery_audit').updateOne(
    { _id: event._id },
    {
      $setOnInsert: {
        _id: event._id,
        ...identity,
        vaultAlias: event.contractAlias,
        vaultAddressNormalized: event.contractAddress.toLowerCase(),
        recipientNormalized,
        recoveredAt,
        evidence: evidence(event),
        createdAt: now(),
      },
    },
    { upsert: true, session },
  );
  return null;
}

async function projectMasterDeposit(
  store: IndexerStore,
  event: ChainEvent,
  session?: ClientSession,
) {
  const identity = assetIdentity(event);
  const beneficiaryNormalized = requiredBscAddress(event, 'beneficiaryNormalized');
  const depositEpoch = requiredDecimal(event, 'depositEpochRaw');
  const depositedAt = requiredDecimal(event, 'depositedAtRaw');
  const id = positionId(identity.assetId, depositEpoch);
  const target = collection(store, 'cukie_master_nft_positions');
  const existing = await target.findOne({ _id: id }, { session });
  if (existing) {
    if (sameStoredDeposit(existing, {
      assetId: identity.assetId,
      depositEpoch,
      beneficiaryNormalized,
      eventId: event._id,
    })) return null;
    throw new NftVaultProjectionError(`Deposito Cukie Master conflictivo para ${id}.`);
  }

  await target.insertOne({
    _id: id,
    positionId: id,
    ...identity,
    vaultAlias: 'CUKIE_MASTER_NFT_VAULT',
    vaultAddressNormalized: event.contractAddress.toLowerCase(),
    beneficiaryNormalized,
    depositEpoch,
    depositedAt,
    lifecycle: 'custodied',
    lifecycleOpen: true,
    custody: 'cukie_master_nft_vault',
    rewardEligible: true,
    depositEvidence: evidence(event),
    lastEventId: event._id,
    lastBlockNumber: event.blockNumber,
    lastLogIndex: event.logIndex,
    createdAt: now(),
    updatedAt: now(),
  }, { session });
  return null;
}

async function projectMasterWithdrawal(
  store: IndexerStore,
  event: ChainEvent,
  session?: ClientSession,
) {
  const identity = assetIdentity(event);
  const beneficiaryNormalized = requiredBscAddress(event, 'beneficiaryNormalized');
  const depositEpoch = requiredDecimal(event, 'depositEpochRaw');
  const withdrawnAt = requiredDecimal(event, 'withdrawnAtRaw');
  const id = positionId(identity.assetId, depositEpoch);
  const target = collection(store, 'cukie_master_nft_positions');
  const existing = await target.findOne({ _id: id }, { session });
  if (existing?.withdrawalEvidence?.eventId === event._id) return null;
  if (
    !existing
    || existing.lifecycleOpen !== true
    || existing.beneficiaryNormalized !== beneficiaryNormalized
  ) {
    throw new NftVaultProjectionError(`Retirada Cukie Master sin deposito abierto para ${id}.`);
  }
  const result = await target.updateOne(
    {
      _id: id,
      lifecycleOpen: true,
      beneficiaryNormalized,
      depositEpoch,
    },
    {
      $set: {
        lifecycle: 'withdrawn',
        lifecycleOpen: false,
        custody: 'wallet',
        rewardEligible: false,
        withdrawnAt,
        withdrawalEvidence: evidence(event),
        lastEventId: event._id,
        lastBlockNumber: event.blockNumber,
        lastLogIndex: event.logIndex,
        updatedAt: now(),
      },
    },
    { session },
  );
  if (result.matchedCount !== 1) {
    throw new NftVaultProjectionError(`Carrera al cerrar Cukie Master ${id}.`);
  }
  return null;
}

async function projectPoolCalendar(
  store: IndexerStore,
  event: ChainEvent,
  session?: ClientSession,
) {
  const chainId = requireChainId(event);
  const version = requiredDecimal(event, 'versionRaw');
  const document = {
    chain: 'BSC',
    chainId,
    vaultAddressNormalized: event.contractAddress.toLowerCase(),
    calendarVersion: version,
    effectiveAt: requiredDecimal(event, 'effectiveAtRaw'),
    firstCutoffAt: requiredDecimal(event, 'firstCutoffAtRaw'),
    firstPeriodId: requiredDecimal(event, 'firstPeriodIdRaw'),
    periodAnchorSeconds: requiredDecimal(event, 'periodAnchorSecondsRaw'),
    evidence: evidence(event),
  };
  const id = `${chainId}:${document.vaultAddressNormalized}:calendar:${version}`;
  const target = collection(store, 'cukie_pool_calendar_versions');
  const existing = await target.findOne({ _id: id }, { session });
  if (existing) {
    if (
      existing.evidence?.eventId === event._id
      && existing.effectiveAt === document.effectiveAt
      && existing.firstCutoffAt === document.firstCutoffAt
      && existing.firstPeriodId === document.firstPeriodId
      && existing.periodAnchorSeconds === document.periodAnchorSeconds
    ) return null;
    throw new NftVaultProjectionError(`Version de calendario conflictiva ${id}.`);
  }
  await target.insertOne({ _id: id, ...document, createdAt: now(), updatedAt: now() }, { session });
  return null;
}

async function projectPoolDeposit(
  store: IndexerStore,
  event: ChainEvent,
  session?: ClientSession,
) {
  const identity = assetIdentity(event);
  const beneficiaryNormalized = requiredBscAddress(event, 'beneficiaryNormalized');
  const depositEpoch = requiredDecimal(event, 'depositEpochRaw');
  const depositedAt = requiredDecimal(event, 'depositedAtRaw');
  const id = positionId(identity.assetId, depositEpoch);
  const target = collection(store, 'cukie_pool_nft_vault_positions');
  const existing = await target.findOne({ _id: id }, { session });
  if (existing) {
    if (sameStoredDeposit(existing, {
      assetId: identity.assetId,
      depositEpoch,
      beneficiaryNormalized,
      eventId: event._id,
    })) return null;
    throw new NftVaultProjectionError(`Deposito Cukie Pool conflictivo para ${id}.`);
  }

  await target.insertOne({
    _id: id,
    positionId: id,
    ...identity,
    vaultAlias: 'CUKIE_POOL_NFT_VAULT',
    vaultAddressNormalized: event.contractAddress.toLowerCase(),
    beneficiaryNormalized,
    depositEpoch,
    depositedAt,
    depositPeriodId: requiredDecimal(event, 'depositPeriodIdRaw'),
    activationAt: requiredDecimal(event, 'activationAtRaw'),
    activationPeriodId: requiredDecimal(event, 'activationPeriodIdRaw'),
    depositCalendarVersion: requiredDecimal(event, 'calendarVersionRaw'),
    lifecycle: 'pending_activation',
    lifecycleOpen: true,
    custody: 'cukie_pool_nft_vault',
    ownerRewardEligible: true,
    depositEvidence: evidence(event),
    lastEventId: event._id,
    lastBlockNumber: event.blockNumber,
    lastLogIndex: event.logIndex,
    createdAt: now(),
    updatedAt: now(),
  }, { session });
  return null;
}

async function projectPoolExitRequested(
  store: IndexerStore,
  event: ChainEvent,
  session?: ClientSession,
) {
  const identity = assetIdentity(event);
  const beneficiaryNormalized = requiredBscAddress(event, 'beneficiaryNormalized');
  const depositEpoch = requiredDecimal(event, 'depositEpochRaw');
  const id = positionId(identity.assetId, depositEpoch);
  const target = collection(store, 'cukie_pool_nft_vault_positions');
  const existing = await target.findOne({ _id: id }, { session });
  if (existing?.exitRequestEvidence?.eventId === event._id) return null;
  if (
    !existing
    || existing.lifecycleOpen !== true
    || existing.beneficiaryNormalized !== beneficiaryNormalized
    || existing.exitRequestedAt
  ) {
    throw new NftVaultProjectionError(`Solicitud de salida sin posicion Pool abierta para ${id}.`);
  }
  const result = await target.updateOne(
    { _id: id, lifecycleOpen: true, beneficiaryNormalized, exitRequestedAt: { $exists: false } },
    {
      $set: {
        lifecycle: 'exit_requested',
        exitRequestedAt: requiredDecimal(event, 'requestedAtRaw'),
        exitPeriodId: requiredDecimal(event, 'exitPeriodIdRaw'),
        withdrawableAt: requiredDecimal(event, 'withdrawableAtRaw'),
        exitCalendarVersion: requiredDecimal(event, 'calendarVersionRaw'),
        ownerRewardEligible: false,
        exitRequestEvidence: evidence(event),
        lastEventId: event._id,
        lastBlockNumber: event.blockNumber,
        lastLogIndex: event.logIndex,
        updatedAt: now(),
      },
    },
    { session },
  );
  if (result.matchedCount !== 1) {
    throw new NftVaultProjectionError(`Carrera al solicitar salida Pool ${id}.`);
  }
  return null;
}

async function projectPoolWithdrawableAdvanced(
  store: IndexerStore,
  event: ChainEvent,
  session?: ClientSession,
) {
  const identity = assetIdentity(event);
  const beneficiaryNormalized = requiredBscAddress(event, 'beneficiaryNormalized');
  const depositEpoch = requiredDecimal(event, 'depositEpochRaw');
  const previousWithdrawableAt = requiredDecimal(event, 'previousWithdrawableAtRaw');
  const newWithdrawableAt = requiredDecimal(event, 'newWithdrawableAtRaw');
  if (BigInt(newWithdrawableAt) >= BigInt(previousWithdrawableAt)) {
    throw new NftVaultProjectionError(`${event.eventName} no adelanta withdrawableAt.`);
  }
  const id = positionId(identity.assetId, depositEpoch);
  const target = collection(store, 'cukie_pool_nft_vault_positions');
  const existing = await target.findOne({ _id: id }, { session });
  if (existing?.withdrawableAdvanceEvidence?.eventId === event._id) return null;
  if (
    !existing
    || existing.lifecycleOpen !== true
    || existing.beneficiaryNormalized !== beneficiaryNormalized
    || existing.withdrawableAt !== previousWithdrawableAt
  ) {
    throw new NftVaultProjectionError(`Adelanto withdrawableAt incoherente para ${id}.`);
  }
  const result = await target.updateOne(
    { _id: id, lifecycleOpen: true, beneficiaryNormalized, withdrawableAt: previousWithdrawableAt },
    {
      $set: {
        withdrawableAt: newWithdrawableAt,
        withdrawableAdvanceEvidence: evidence(event),
        lastEventId: event._id,
        lastBlockNumber: event.blockNumber,
        lastLogIndex: event.logIndex,
        updatedAt: now(),
      },
    },
    { session },
  );
  if (result.matchedCount !== 1) {
    throw new NftVaultProjectionError(`Carrera al adelantar withdrawableAt ${id}.`);
  }
  return null;
}

async function projectPoolWithdrawal(
  store: IndexerStore,
  event: ChainEvent,
  session?: ClientSession,
) {
  const identity = assetIdentity(event);
  const beneficiaryNormalized = requiredBscAddress(event, 'beneficiaryNormalized');
  const depositEpoch = requiredDecimal(event, 'depositEpochRaw');
  const id = positionId(identity.assetId, depositEpoch);
  const target = collection(store, 'cukie_pool_nft_vault_positions');
  const existing = await target.findOne({ _id: id }, { session });
  if (existing?.withdrawalEvidence?.eventId === event._id) return null;
  if (
    !existing
    || existing.lifecycleOpen !== true
    || existing.beneficiaryNormalized !== beneficiaryNormalized
    || !existing.exitRequestedAt
  ) {
    throw new NftVaultProjectionError(`Retirada Pool sin salida abierta para ${id}.`);
  }
  const result = await target.updateOne(
    { _id: id, lifecycleOpen: true, beneficiaryNormalized, depositEpoch },
    {
      $set: {
        lifecycle: 'withdrawn',
        lifecycleOpen: false,
        custody: 'wallet',
        ownerRewardEligible: false,
        withdrawnAt: requiredDecimal(event, 'withdrawnAtRaw'),
        withdrawalEvidence: evidence(event),
        lastEventId: event._id,
        lastBlockNumber: event.blockNumber,
        lastLogIndex: event.logIndex,
        updatedAt: now(),
      },
    },
    { session },
  );
  if (result.matchedCount !== 1) {
    throw new NftVaultProjectionError(`Carrera al cerrar Cukie Pool ${id}.`);
  }
  return null;
}

export function deriveCukiePoolVaultLifecycle(
  position: {
    lifecycleOpen: boolean;
    activationAt: string;
    exitRequestedAt?: string;
    withdrawableAt?: string;
  },
  timestampSeconds: bigint,
): CukiePoolVaultLifecycle {
  if (!position.lifecycleOpen) return 'withdrawn';
  if (position.exitRequestedAt && position.withdrawableAt) {
    return timestampSeconds >= BigInt(position.withdrawableAt)
      ? 'withdrawable'
      : 'exit_requested';
  }
  return timestampSeconds >= BigInt(position.activationAt) ? 'active' : 'pending_activation';
}

export async function projectNftVaultEvent(
  store: IndexerStore,
  event: ChainEvent,
  session?: ClientSession,
) {
  if (event.contractAlias === 'CUKIE_MASTER_NFT_VAULT') {
    if (event.eventName === 'CukieMasterCollectionAllowedUpdated') {
      return projectCollectionAllowed(store, event, session);
    }
    if (event.eventName === 'CukieMasterDeposited') {
      return projectMasterDeposit(store, event, session);
    }
    if (event.eventName === 'CukieMasterWithdrawn') {
      return projectMasterWithdrawal(store, event, session);
    }
    if (event.eventName === 'CukieMasterUntrackedERC721Recovered') {
      return projectRecoveryAudit(store, event, session);
    }
  }

  if (event.contractAlias === 'CUKIE_POOL_NFT_VAULT') {
    if (event.eventName === 'CukiePoolCollectionAllowedUpdated') {
      return projectCollectionAllowed(store, event, session);
    }
    if (event.eventName === 'CukiePoolCalendarVersionScheduled') {
      return projectPoolCalendar(store, event, session);
    }
    if (event.eventName === 'CukiePoolDeposited') {
      return projectPoolDeposit(store, event, session);
    }
    if (event.eventName === 'CukiePoolExitRequested') {
      return projectPoolExitRequested(store, event, session);
    }
    if (event.eventName === 'CukiePoolWithdrawableAtAdvanced') {
      return projectPoolWithdrawableAdvanced(store, event, session);
    }
    if (event.eventName === 'CukiePoolWithdrawn') {
      return projectPoolWithdrawal(store, event, session);
    }
    if (event.eventName === 'CukiePoolUntrackedERC721Recovered') {
      return projectRecoveryAudit(store, event, session);
    }
  }

  return `Evento fuera de los vaults NFT: ${event.contractAlias}:${event.eventName}`;
}
