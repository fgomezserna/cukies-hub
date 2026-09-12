import { decodeEventLog, isAddress, type Hex } from 'viem';

import {
  cukieMasterNftVaultAbi,
  cukiePoolNftVaultAbi,
} from '@/lib/contracts/uki-nft-vaults';
import {
  canonicalNftVaultAssetId,
  projectionMatchesPendingOperation,
  type NftVaultPendingOperation,
} from './pending-operations';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function tupleField(value: unknown, name: string, index: number) {
  if (Array.isArray(value)) return value[index];
  if (value && typeof value === 'object' && name in value) {
    return (value as Record<string, unknown>)[name];
  }
  return undefined;
}

function uintText(value: unknown) {
  if (typeof value === 'bigint' && value >= BigInt(0)) return value.toString();
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) return value;
  return null;
}

function addressText(value: unknown) {
  return typeof value === 'string' && isAddress(value, { strict: false })
    ? value.toLowerCase()
    : null;
}

function sameAddress(left: unknown, right: string) {
  const normalized = addressText(left);
  return Boolean(normalized && normalized === right.toLowerCase());
}

function normalizedTokenId(value: unknown) {
  const text = uintText(value);
  if (text === null) return null;
  try {
    return BigInt(text).toString();
  } catch {
    return null;
  }
}

/**
 * Extracts the epoch from the Deposited event emitted by this operation's
 * vault. An absent or malformed event is inconclusive and returns null.
 */
function depositedEpochFromReceiptWithAbi(
  receipt: unknown,
  operation: Pick<NftVaultPendingOperation, 'vaultAddress' | 'collectionAddress' | 'tokenId' | 'walletAddress'>,
  abi: typeof cukiePoolNftVaultAbi,
) {
  if (!receipt || typeof receipt !== 'object') return null;
  const logs = (receipt as { logs?: unknown }).logs;
  if (!Array.isArray(logs)) return null;
  const expectedTokenId = normalizedTokenId(operation.tokenId);
  if (expectedTokenId === null) return null;

  for (const log of logs) {
    if (!log || typeof log !== 'object') continue;
    const candidate = log as { address?: unknown; data?: unknown; topics?: unknown };
    if (!sameAddress(candidate.address, operation.vaultAddress)) continue;
    if (
      typeof candidate.data !== 'string'
      || !Array.isArray(candidate.topics)
      || candidate.topics.length === 0
    ) continue;

    let decoded: { eventName?: string; args?: unknown };
    try {
      decoded = decodeEventLog({
        abi,
        data: candidate.data as Hex,
        topics: candidate.topics as [Hex, ...Hex[]],
      }) as unknown as { eventName?: string; args?: unknown };
    } catch {
      continue;
    }
    if (decoded.eventName !== 'Deposited') continue;
    const args = decoded.args;
    const collection = tupleField(args, 'collection', 0);
    const tokenId = normalizedTokenId(tupleField(args, 'tokenId', 1));
    const beneficiary = tupleField(args, 'beneficiary', 2);
    const depositEpoch = normalizedTokenId(tupleField(args, 'depositEpoch', 3));
    if (
      !sameAddress(collection, operation.collectionAddress)
      || tokenId !== expectedTokenId
      || !sameAddress(beneficiary, operation.walletAddress)
      || depositEpoch === null
      || depositEpoch === '0'
    ) continue;
    return depositEpoch;
  }
  return null;
}

/**
 * Extracts the epoch from the Withdrawn event emitted by this operation's
 * vault. Withdraw deletes the stored position, so the receipt event is the
 * only on-chain source that can bind a known pending epoch to the transfer.
 */
function withdrawnEpochFromReceiptWithAbi(
  receipt: unknown,
  operation: Pick<NftVaultPendingOperation, 'vaultAddress' | 'collectionAddress' | 'tokenId' | 'walletAddress'>,
  abi: typeof cukiePoolNftVaultAbi,
) {
  if (!receipt || typeof receipt !== 'object') return null;
  const logs = (receipt as { logs?: unknown }).logs;
  if (!Array.isArray(logs)) return null;
  const expectedTokenId = normalizedTokenId(operation.tokenId);
  if (expectedTokenId === null) return null;

  for (const log of logs) {
    if (!log || typeof log !== 'object') continue;
    const candidate = log as {
      address?: unknown;
      data?: unknown;
      topics?: unknown;
      eventName?: unknown;
      args?: unknown;
    };
    if (!sameAddress(candidate.address, operation.vaultAddress)) continue;
    let eventName = candidate.eventName;
    let args = candidate.args;
    if (eventName !== 'Withdrawn') {
      if (
        typeof candidate.data !== 'string'
        || !Array.isArray(candidate.topics)
        || candidate.topics.length === 0
      ) continue;
      let decoded: { eventName?: string; args?: unknown };
      try {
        decoded = decodeEventLog({
          abi,
          data: candidate.data as Hex,
          topics: candidate.topics as [Hex, ...Hex[]],
        }) as unknown as { eventName?: string; args?: unknown };
      } catch {
        continue;
      }
      eventName = decoded.eventName;
      args = decoded.args;
    }
    if (eventName !== 'Withdrawn') continue;
    const collection = tupleField(args, 'collection', 0);
    const tokenId = normalizedTokenId(tupleField(args, 'tokenId', 1));
    const beneficiary = tupleField(args, 'beneficiary', 2);
    const depositEpoch = normalizedTokenId(tupleField(args, 'depositEpoch', 3));
    if (
      !sameAddress(collection, operation.collectionAddress)
      || tokenId !== expectedTokenId
      || !sameAddress(beneficiary, operation.walletAddress)
      || depositEpoch === null
      || depositEpoch === '0'
    ) continue;
    return depositEpoch;
  }
  return null;
}

export function depositedEpochFromReceipt(
  receipt: unknown,
  operation: Pick<NftVaultPendingOperation, 'vaultAddress' | 'collectionAddress' | 'tokenId' | 'walletAddress'>,
) {
  return depositedEpochFromReceiptWithAbi(receipt, operation, cukiePoolNftVaultAbi);
}

export function withdrawnEpochFromReceipt(
  receipt: unknown,
  operation: Pick<NftVaultPendingOperation, 'vaultAddress' | 'collectionAddress' | 'tokenId' | 'walletAddress'>,
) {
  return withdrawnEpochFromReceiptWithAbi(receipt, operation, cukiePoolNftVaultAbi);
}

/**
 * Extracts the epoch from the Deposited event emitted by Cukie Master.
 * Master and Pool intentionally keep separate ABI decoders: both events have
 * the same field names, but the contract ABI is the source of truth for the
 * indexed/non-indexed topic layout.
 */
export function depositedEpochFromMasterReceipt(
  receipt: unknown,
  operation: Pick<NftVaultPendingOperation, 'vaultAddress' | 'collectionAddress' | 'tokenId' | 'walletAddress'>,
) {
  return depositedEpochFromReceiptWithAbi(receipt, operation, cukieMasterNftVaultAbi);
}

export function withdrawnEpochFromMasterReceipt(
  receipt: unknown,
  operation: Pick<NftVaultPendingOperation, 'vaultAddress' | 'collectionAddress' | 'tokenId' | 'walletAddress'>,
) {
  return withdrawnEpochFromReceiptWithAbi(receipt, operation, cukieMasterNftVaultAbi);
}

/**
 * Checks the current on-chain position against a receipt epoch. This is a
 * proof of the same collection/token/beneficiary deposit, not merely proof
 * that some position exists for the token.
 */
export function inspectPoolDepositPosition(
  operation: Pick<NftVaultPendingOperation, 'chainId' | 'walletAddress' | 'vaultAddress' | 'collectionAddress' | 'tokenId' | 'assetId' | 'depositEpoch'>,
  rawPosition: unknown,
) {
  const expectedAssetId = canonicalNftVaultAssetId({
    chainId: operation.chainId,
    collectionAddress: operation.collectionAddress,
    tokenId: operation.tokenId,
  });
  if (!expectedAssetId) return null;

  const beneficialOwner = addressText(tupleField(rawPosition, 'beneficialOwner', 0));
  const depositEpoch = normalizedTokenId(tupleField(rawPosition, 'depositEpoch', 1));
  const depositedAt = normalizedTokenId(tupleField(rawPosition, 'depositedAt', 2));
  const activationAt = normalizedTokenId(tupleField(rawPosition, 'activationAt', 3));
  if (
    !beneficialOwner
    || beneficialOwner === ZERO_ADDRESS
    || !sameAddress(beneficialOwner, operation.walletAddress)
    || depositEpoch === null
    || depositEpoch === '0'
    || depositedAt === null
    || depositedAt === '0'
    || activationAt === null
    || activationAt === '0'
  ) return null;

  let depositEpochFromOperation: string | null = null;
  if (operation.depositEpoch !== undefined) {
    depositEpochFromOperation = normalizedTokenId(operation.depositEpoch);
    if (depositEpochFromOperation === null || depositEpochFromOperation !== depositEpoch) return null;
  }
  if (BigInt(activationAt) < BigInt(depositedAt)) return null;
  return { depositEpoch };
}

/**
 * Checks a Cukie Master position against the operation identity and receipt
 * epoch. Master positions have no Pool activation timestamp, so this proof
 * deliberately validates only the fields that Master actually exposes.
 */
export function inspectMasterDepositPosition(
  operation: Pick<NftVaultPendingOperation, 'chainId' | 'walletAddress' | 'vaultAddress' | 'collectionAddress' | 'tokenId' | 'assetId' | 'depositEpoch'>,
  rawPosition: unknown,
) {
  const expectedAssetId = canonicalNftVaultAssetId({
    chainId: operation.chainId,
    collectionAddress: operation.collectionAddress,
    tokenId: operation.tokenId,
  });
  if (!expectedAssetId) return null;

  const beneficialOwner = addressText(tupleField(rawPosition, 'beneficialOwner', 0));
  const depositEpoch = normalizedTokenId(tupleField(rawPosition, 'depositEpoch', 1));
  const depositedAt = normalizedTokenId(tupleField(rawPosition, 'depositedAt', 2));
  if (
    !beneficialOwner
    || beneficialOwner === ZERO_ADDRESS
    || !sameAddress(beneficialOwner, operation.walletAddress)
    || depositEpoch === null
    || depositEpoch === '0'
    || depositedAt === null
    || depositedAt === '0'
  ) return null;

  if (operation.depositEpoch !== undefined) {
    const operationEpoch = normalizedTokenId(operation.depositEpoch);
    if (operationEpoch === null || operationEpoch !== depositEpoch) return null;
  }
  return { depositEpoch };
}

type MasterProjectionStatus = {
  walletNormalized?: unknown;
  nftCustody?: {
    mode?: unknown;
    chainId?: unknown;
    vaultAddress?: unknown;
    collectionAddresses?: unknown;
  };
  nftInventory?: unknown;
};

export type NftVaultProjectionExpectation = Pick<
  NftVaultPendingOperation,
  | 'chainId'
  | 'walletAddress'
  | 'vaultAddress'
  | 'assetId'
  | 'collectionAddress'
  | 'tokenId'
  | 'depositEpoch'
  | 'action'
  | 'phase'
>;

/**
 * Clears a Master pending operation only when the API response belongs to the
 * same wallet/chain/vault and carries the exact canonical asset and epoch.
 * A token id plus custody alone is intentionally insufficient because an old
 * snapshot can be returned while a newer transaction is still pending.
 */
export function masterProjectionMatchesPendingOperation(
  operation: NftVaultProjectionExpectation,
  status: MasterProjectionStatus | null | undefined,
) {
  if (
    operation.phase !== 'syncing_projection'
    || !status
    || typeof status.walletNormalized !== 'string'
    || !sameAddress(status.walletNormalized, operation.walletAddress)
    || status.nftCustody?.mode !== 'custodial'
    || status.nftCustody.chainId !== operation.chainId
    || !sameAddress(status.nftCustody.vaultAddress, operation.vaultAddress)
    || !Array.isArray(status.nftCustody.collectionAddresses)
    || !status.nftCustody.collectionAddresses.some((collection) => sameAddress(collection, operation.collectionAddress))
    || !Array.isArray(status.nftInventory)
  ) return false;

  const expectedAssetId = canonicalNftVaultAssetId({
    chainId: operation.chainId,
    collectionAddress: operation.collectionAddress,
    tokenId: operation.tokenId,
  });
  if (!expectedAssetId) return false;
  const candidate = status.nftInventory.find((item) => {
    if (!item || typeof item !== 'object') return false;
    const asset = item as {
      assetId?: unknown;
      collectionAddress?: unknown;
      tokenId?: unknown;
      custody?: unknown;
      depositEpoch?: unknown;
    };
    const assetId = typeof asset.assetId === 'string' ? asset.assetId : null;
    const candidateAssetId = asset.collectionAddress && typeof asset.tokenId === 'string'
      ? canonicalNftVaultAssetId({
        chainId: operation.chainId,
        collectionAddress: String(asset.collectionAddress),
        tokenId: asset.tokenId,
      })
      : assetId;
    return candidateAssetId === expectedAssetId && assetId === expectedAssetId;
  });
  if (!candidate || typeof candidate !== 'object') return false;
  const asset = candidate as {
    assetId?: unknown;
    custody?: unknown;
    collectionAddress?: unknown;
    tokenId?: unknown;
    depositEpoch?: unknown;
  };
  if (!projectionMatchesPendingOperation(operation, {
    assetId: typeof asset.assetId === 'string' ? asset.assetId : '',
    custody: typeof asset.custody === 'string' ? asset.custody : '',
    collectionAddress: typeof asset.collectionAddress === 'string' ? asset.collectionAddress : undefined,
    tokenId: typeof asset.tokenId === 'string' ? asset.tokenId : undefined,
    chainId: operation.chainId,
    depositEpoch: typeof asset.depositEpoch === 'string' ? asset.depositEpoch : null,
  })) return false;
  if (operation.action === 'deposit') {
    if (!operation.depositEpoch || typeof asset.depositEpoch !== 'string') return false;
    return normalizedTokenId(asset.depositEpoch) === normalizedTokenId(operation.depositEpoch);
  }
  return operation.action === 'withdraw';
}
