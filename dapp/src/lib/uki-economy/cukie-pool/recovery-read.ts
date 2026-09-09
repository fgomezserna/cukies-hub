import 'server-only';

import {
  createPublicClient,
  isAddress,
  type Address,
  type ContractFunctionParameters,
} from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { bscReadTransport, parseBscReadRpcUrls } from '@/lib/bsc-read-rpc';
import {
  cukiePoolNftVaultAbi,
  ukiNftVaults,
  type UkiPoolRecoveryVault,
} from '@/lib/contracts/uki-nft-vaults';

const nftOwnerAbi = [{
  type: 'function',
  name: 'ownerOf',
  stateMutability: 'view',
  inputs: [{ name: 'tokenId', type: 'uint256' }],
  outputs: [{ name: '', type: 'address' }],
}] as const;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MAX_RECOVERY_VAULTS = 8;
const MAX_RECOVERY_ASSETS = 200;

export type PoolRecoveryAssetInput = {
  chainId: 56 | 97;
  collectionAddress: string;
  tokenId: string;
};

export type PoolRecoveryInspection = {
  assetId: string;
  status: 'custodied' | 'current_custody' | 'not_found' | 'unknown';
  vaultAddress: string | null;
  beneficialOwner: string | null;
  exitRequestedAt: string | null;
  withdrawableAt: string | null;
  reason?: string;
};

/**
 * Combines reads from several explicitly allowlisted former vaults without
 * allowing a later inconclusive read to hide a confirmed custody result.
 */
export function mergePoolRecoveryInspection(
  previous: PoolRecoveryInspection | undefined,
  next: PoolRecoveryInspection,
): PoolRecoveryInspection {
  if (!previous) return next;
  if (previous.status === 'current_custody') {
    if (next.status === 'custodied') {
      return unknownResult(next.assetId, 'POOL_RECOVERY_VAULT_AMBIGUOUS');
    }
    return previous;
  }
  if (previous.status === 'custodied') {
    if (next.status === 'current_custody') {
      return unknownResult(next.assetId, 'POOL_RECOVERY_VAULT_AMBIGUOUS');
    }
    if (
      next.status === 'custodied'
      && previous.vaultAddress
      && next.vaultAddress
      && previous.vaultAddress.toLowerCase() !== next.vaultAddress.toLowerCase()
    ) return unknownResult(next.assetId, 'POOL_RECOVERY_VAULT_AMBIGUOUS');
    return previous;
  }
  if (next.status === 'custodied' || next.status === 'current_custody') return next;
  return previous;
}

function successfulResult(value: unknown) {
  if (!value || typeof value !== 'object' || !('status' in value)) return null;
  const result = value as { status: string; result?: unknown };
  return result.status === 'success' ? result.result : null;
}

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

function rpcUrls(chainId: 56 | 97) {
  const configured = chainId === 97
    ? process.env.CHAIN_INDEXER_BSC_TESTNET_RPC_URLS
      ?? process.env.CHAIN_INDEXER_BSC_TESTNET_RPC_URL
      ?? process.env.BSC_TESTNET_RPC_URL
      ?? process.env.CHAIN_INDEXER_BSC_RPC_URLS
      ?? process.env.CHAIN_INDEXER_BSC_RPC_URL
      ?? process.env.BSC_RPC_URL
    : process.env.CHAIN_INDEXER_BSC_RPC_URLS
      ?? process.env.CHAIN_INDEXER_BSC_RPC_URL
      ?? process.env.BSC_RPC_URL;
  return parseBscReadRpcUrls(configured);
}

function unknownResult(assetId: string, reason: string): PoolRecoveryInspection {
  return {
    assetId,
    status: 'unknown',
    vaultAddress: null,
    beneficialOwner: null,
    exitRequestedAt: null,
    withdrawableAt: null,
    reason,
  };
}

function recoveryAssetId(input: PoolRecoveryAssetInput) {
  return `${input.chainId}:${input.collectionAddress.toLowerCase()}:${input.tokenId}`;
}

async function withRecoveryTimeout<T>(promise: Promise<T>, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('POOL_RECOVERY_RPC_TIMEOUT')), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function classifyPoolRecoveryRead(input: {
  assetId: string;
  walletNormalized: string;
  vaultAddress: string;
  activeVaultAddress?: string | null;
  activeVaultAddresses?: string[];
  owner: unknown;
  rawPosition: unknown;
}): PoolRecoveryInspection {
  const ownerNormalized = typeof input.owner === 'string' && isAddress(input.owner, { strict: false })
    ? input.owner.toLowerCase()
    : null;
  // `multicall(..., allowFailure: true)` reports a reverted ownerOf as an
  // absent result. It is a source read failure, not proof that this asset is
  // owned by somebody else; callers must not turn it into a healthy omission.
  if (!ownerNormalized) {
    return unknownResult(input.assetId, 'POOL_RECOVERY_RPC_READ_FAILED');
  }
  if (ownerNormalized === input.walletNormalized.toLowerCase()) {
    return {
      assetId: input.assetId,
      status: 'not_found',
      vaultAddress: null,
      beneficialOwner: null,
      exitRequestedAt: null,
      withdrawableAt: null,
    };
  }
  const activeVaultAddresses = [
    ...(input.activeVaultAddress ? [input.activeVaultAddress] : []),
    ...(input.activeVaultAddresses ?? []),
  ].map((address) => address.toLowerCase());
  if (ownerNormalized && activeVaultAddresses.includes(ownerNormalized)) {
    return {
      assetId: input.assetId,
      status: 'current_custody',
      vaultAddress: ownerNormalized,
      beneficialOwner: null,
      exitRequestedAt: null,
      withdrawableAt: null,
    };
  }
  if (ownerNormalized !== input.vaultAddress.toLowerCase()) {
    return unknownResult(input.assetId, 'POOL_RECOVERY_OWNER_MISMATCH');
  }
  const beneficialOwner = tupleField(input.rawPosition, 'beneficialOwner', 0);
  const beneficialOwnerNormalized = typeof beneficialOwner === 'string'
    && isAddress(beneficialOwner, { strict: false })
    ? beneficialOwner.toLowerCase()
    : null;
  const depositEpoch = uintText(tupleField(input.rawPosition, 'depositEpoch', 1));
  const exitRequestedAt = uintText(tupleField(input.rawPosition, 'exitRequestedAt', 4));
  const withdrawableAt = uintText(tupleField(input.rawPosition, 'withdrawableAt', 5));
  if (
    !beneficialOwnerNormalized
    || beneficialOwnerNormalized === ZERO_ADDRESS
    || !depositEpoch
    || !exitRequestedAt
    || !withdrawableAt
  ) return unknownResult(
    input.assetId,
    input.rawPosition == null
      ? 'POOL_RECOVERY_RPC_READ_FAILED'
      : 'POOL_RECOVERY_POSITION_INVALID',
  );
  if (beneficialOwnerNormalized !== input.walletNormalized.toLowerCase()) {
    return unknownResult(input.assetId, 'POOL_RECOVERY_OWNER_MISMATCH');
  }
  return {
    assetId: input.assetId,
    status: 'custodied',
    vaultAddress: input.vaultAddress.toLowerCase(),
    beneficialOwner: beneficialOwnerNormalized,
    exitRequestedAt: exitRequestedAt === '0' ? null : exitRequestedAt,
    withdrawableAt: withdrawableAt === '0' ? null : withdrawableAt,
  };
}

/**
 * Reads current vaults for receipt/projection transitions and only explicitly
 * configured former Pool vaults for recovery. A failed read is kept as
 * `unknown` so callers never turn a custody check into an empty inventory.
 */
export async function readPoolRecoveryPositions(input: {
  walletNormalized: string;
  assets: PoolRecoveryAssetInput[];
  vaults?: UkiPoolRecoveryVault[];
  activeVaultAddress?: string | null;
  activeVaultAddresses?: string[];
  activeVaultChainId?: 56 | 97;
}): Promise<PoolRecoveryInspection[]> {
  const vaults = input.vaults ?? ukiNftVaults.poolRecoveryVaults ?? [];
  const assets = input.assets
    .map((asset) => ({ ...asset, assetId: recoveryAssetId(asset) }));
  if (assets.length === 0) return [];
  if (ukiNftVaults.poolRecoveryVaultConfigInvalid) {
    return assets.map((asset) => unknownResult(asset.assetId, 'POOL_RECOVERY_CONFIG_INVALID'));
  }
  const configuredVaults = vaults.filter((vault) => (
    (vault.chainId === 56 || vault.chainId === 97) && isAddress(vault.vaultAddress)
  ));
  const hasActiveProbe = Boolean(
    input.activeVaultChainId
    && [
      ...(input.activeVaultAddress ? [input.activeVaultAddress] : []),
      ...(input.activeVaultAddresses ?? []),
    ].some((address) => isAddress(address)),
  );
  const activeVaultAddresses = [
    ...(input.activeVaultAddress ? [input.activeVaultAddress] : []),
    ...(input.activeVaultAddresses ?? []),
  ].filter((address) => isAddress(address));
  if (configuredVaults.length === 0 && !hasActiveProbe) {
    return assets.map((asset) => ({
      assetId: asset.assetId,
      status: 'not_found' as const,
      vaultAddress: null,
      beneficialOwner: null,
      exitRequestedAt: null,
      withdrawableAt: null,
    }));
  }
  const recoveryChainIds = new Set(configuredVaults.map((vault) => vault.chainId));
  if (hasActiveProbe) recoveryChainIds.add(input.activeVaultChainId!);
  const assetsRequiringRecovery = assets.filter((asset) => recoveryChainIds.has(asset.chainId));
  // The historical probe is bounded because it may include one ownerOf and
  // positionOf pair per configured former vault. An active-vault-only probe
  // remains useful during the receipt/projection race and must not change the
  // existing 500-row collection limit when no former vault is configured.
  if (configuredVaults.length > 0 && assetsRequiringRecovery.length > MAX_RECOVERY_ASSETS) {
    const oversized = new Set(assetsRequiringRecovery.map((asset) => asset.assetId));
    return assets.map((asset) => oversized.has(asset.assetId)
      ? unknownResult(asset.assetId, 'POOL_RECOVERY_ASSET_LIMIT')
      : {
          assetId: asset.assetId,
          status: 'not_found' as const,
          vaultAddress: null,
          beneficialOwner: null,
          exitRequestedAt: null,
          withdrawableAt: null,
        });
  }
  if (configuredVaults.length > MAX_RECOVERY_VAULTS) {
    return assets.map((asset) => recoveryChainIds.has(asset.chainId)
      ? unknownResult(asset.assetId, 'POOL_RECOVERY_VAULT_LIMIT')
      : {
          assetId: asset.assetId,
          status: 'not_found' as const,
          vaultAddress: null,
          beneficialOwner: null,
          exitRequestedAt: null,
          withdrawableAt: null,
        });
  }

  const inspections = new Map<string, PoolRecoveryInspection>();
  for (const chainId of [56, 97] as const) {
    const chainVaults = configuredVaults.filter((vault) => vault.chainId === chainId);
    const chainAssets = assets.filter((asset) => asset.chainId === chainId);
    const activeAssets = hasActiveProbe && input.activeVaultChainId === chainId
      ? chainAssets
      : [];
    // No allowlisted former vault on this chain means there is no historical
    // custody source to inspect; keep the asset available for normal flow.
    if (chainAssets.length === 0) continue;
    if (chainVaults.length === 0 && activeAssets.length === 0) {
      chainAssets.forEach((asset) => inspections.set(asset.assetId, {
        assetId: asset.assetId,
        status: 'not_found',
        vaultAddress: null,
        beneficialOwner: null,
        exitRequestedAt: null,
        withdrawableAt: null,
      }));
      continue;
    }
    const urls = rpcUrls(chainId);
    if (urls.length === 0) {
      chainAssets.forEach((asset) => inspections.set(
        asset.assetId,
        unknownResult(asset.assetId, 'POOL_RECOVERY_RPC_NOT_CONFIGURED'),
      ));
      continue;
    }
    const contracts: ContractFunctionParameters[] = [];
    const lookups: Array<{
      asset: typeof chainAssets[number];
      vault: typeof chainVaults[number] | null;
      active: boolean;
    }> = [];
    for (const asset of activeAssets) {
      contracts.push({
        address: asset.collectionAddress as Address,
        abi: nftOwnerAbi,
        functionName: 'ownerOf',
        args: [BigInt(asset.tokenId)],
      });
      lookups.push({ asset, vault: null, active: true });
    }
    for (const vault of chainVaults) {
      for (const asset of chainAssets) {
        contracts.push(
          {
            address: asset.collectionAddress as Address,
            abi: nftOwnerAbi,
            functionName: 'ownerOf',
            args: [BigInt(asset.tokenId)],
          },
          {
            address: vault.vaultAddress,
            abi: cukiePoolNftVaultAbi,
            functionName: 'positionOf',
            args: [asset.collectionAddress as Address, BigInt(asset.tokenId)],
          },
        );
        lookups.push({ asset, vault, active: false });
      }
    }
    try {
      const client = createPublicClient({
        chain: chainId === 97 ? bscTestnet : bsc,
        transport: bscReadTransport(urls, chainId),
      });
      const results = await withRecoveryTimeout(
        client.multicall({ contracts, allowFailure: true }),
        12_000,
      );
      lookups.forEach(({ asset, vault }, index) => {
        const active = lookups[index].active;
        const resultOffset = active
          ? index
          : activeAssets.length + (index - activeAssets.length) * 2;
        const owner = successfulResult(results[resultOffset]);
        const rawPosition = active ? null : successfulResult(results[resultOffset + 1]);
        const classified = classifyPoolRecoveryRead({
          assetId: asset.assetId,
          walletNormalized: input.walletNormalized,
          vaultAddress: active
            ? input.activeVaultAddress ?? activeVaultAddresses[0]!
            : vault!.vaultAddress,
          // Never apply a chain-97 active-vault identity while inspecting a
          // historical chain-56 vault (or vice versa).
          activeVaultAddress: active && input.activeVaultChainId === chainId
            ? input.activeVaultAddress
            : null,
          activeVaultAddresses: active && input.activeVaultChainId === chainId
            ? activeVaultAddresses
            : [],
          owner,
          rawPosition,
        });
        inspections.set(
          asset.assetId,
          mergePoolRecoveryInspection(inspections.get(asset.assetId), classified),
        );
      });
    } catch {
      chainAssets.forEach((asset) => inspections.set(
        asset.assetId,
        unknownResult(asset.assetId, 'POOL_RECOVERY_RPC_READ_FAILED'),
      ));
    }
  }
  return assets.map((asset) => inspections.get(asset.assetId) ?? unknownResult(
    asset.assetId,
    'POOL_RECOVERY_READ_INCOMPLETE',
  ));
}
