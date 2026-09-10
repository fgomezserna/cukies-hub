import { decodeEventLog, isAddress, type Hex } from 'viem';

import { cukiePoolNftVaultAbi } from '@/lib/contracts/uki-nft-vaults';
import {
  canonicalNftVaultAssetId,
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
export function depositedEpochFromReceipt(
  receipt: unknown,
  operation: Pick<NftVaultPendingOperation, 'vaultAddress' | 'collectionAddress' | 'tokenId' | 'walletAddress'>,
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
        abi: cukiePoolNftVaultAbi,
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
