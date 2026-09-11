'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Gamepad2,
  Loader2,
  Lock,
  LogOut,
  RefreshCw,
  Unlock,
  WalletCards,
} from 'lucide-react';
import { isAddress, type Address, type Hash } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';

import { Panel } from '@/components/landing/primitives';
import { useAppRuntime, useAppRuntimeResource, useGuardedOperation } from '@/providers/app-runtime-provider';
import { CukiImage } from '@/components/legacy-marketplace/cuki-image';
import {
  cukiePoolNftVaultAbi,
  ukiNftVaults,
} from '@/lib/contracts/uki-nft-vaults';
import {
  canonicalNftVaultAssetId,
  clearPendingNftVaultOperation,
  getNftVaultBrowserStorage,
  getNftVaultStorageSnapshot,
  loadPendingNftVaultOperations,
  pendingNftVaultOperationAssetKey,
  pendingNftVaultOperationMatches,
  pendingNftVaultOperationMatchesAsset,
  pendingNftVaultOperationMatchesPosition,
  pendingNftVaultStorageKey,
  savePendingNftVaultOperation,
  type NftVaultPendingAction,
  type NftVaultPendingContext,
  type NftVaultPendingOperation,
  type NftVaultPendingPhase,
} from '@/lib/nft-vault/pending-operations';
import {
  depositedEpochFromReceipt,
  inspectPoolDepositPosition,
  withdrawnEpochFromReceipt,
} from '@/lib/nft-vault/pending-reconciliation';
import {
  executeNftTransaction,
  nftTransactionContextFromNullable,
  nftTransactionContextMatches,
  retainNftVaultLists,
  type NftTransactionClient,
  type NftTransactionContext,
} from '@/lib/nft-vault/transaction-lifecycle';
import { useAuth } from '@/providers/auth-provider';
import { useWalletCoordinator } from '@/providers/wallet-coordinator-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const erc721CustodyAbi = [
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'getApproved', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'isApprovedForAll', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] },
] as const;

type PoolGeneration = 'original' | 'second_generation';
type PoolRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'goat';
type PoolPositionStatus = 'pending' | 'active' | 'recovery' | 'exit_requested' | 'withdrawable' | 'withdrawn';

type AvailableAsset = {
  assetId: string;
  chain: 'BSC';
  chainId: 56 | 97;
  collectionAddress: string;
  tokenId: string;
  imageUrl: string | null;
  generation: PoolGeneration;
  rarity: PoolRarity;
  custody: 'wallet';
  status: 'available';
  canDeposit: true;
};

type CustodialPosition = {
  source: 'custodial_vault' | 'recovery_vault';
  positionId: string;
  assetId: string;
  chain: 'BSC';
  chainId: 56 | 97;
  collectionAddress: string;
  tokenId: string;
  imageUrl: string | null;
  generation: PoolGeneration | null;
  rarity: PoolRarity | null;
  vaultAddress: string;
  beneficiaryNormalized: string;
  depositEpoch: string;
  status: PoolPositionStatus;
  lifecycleOpen: boolean;
  custody: 'cukie_pool_nft_vault' | 'cukie_pool_recovery' | 'wallet';
  ownerRewardEligible: boolean;
  depositedAt: string | null;
  activationAt: string | null;
  depositCalendarVersion: string | null;
  exitRequestedAt: string | null;
  withdrawableAt: string | null;
  exitCalendarVersion: string | null;
  withdrawnAt: string | null;
  sourceHealthy: boolean;
};

type PoolCustody = {
  mode: 'custodial';
  chainId: 56 | 97;
  vaultAddress: string;
  collectionAddresses: string[];
  indexer: { status: 'ready' | 'unavailable' };
};

type CustodialStatus = {
  mode: 'custodial_vault';
  walletNormalized: string;
  nftCustody: PoolCustody;
  positions: CustodialPosition[];
  recoveryAssets?: CustodialPosition[];
  availableAssets: AvailableAsset[];
  availability?: {
    status: 'complete' | 'partial';
    unknownAssets: number;
    unknownAssetIds?: string[];
  };
  sourceHealthy: boolean;
};

type LegacyStatus = {
  mode: 'legacy_mongo';
  walletNormalized: string;
  positions: unknown[];
  sourceHealthy: boolean;
};

type PoolStatus = CustodialStatus | LegacyStatus;
type MutationPhase = 'idle' | 'approving' | 'depositing' | 'requesting_exit' | 'withdrawing' | 'syncing';
type PendingAsset = Pick<AvailableAsset, 'assetId' | 'chainId' | 'collectionAddress' | 'tokenId'> & {
  depositEpoch?: string;
};
type PoolTab = 'pool' | 'available';
type PoolRequestedIdentity = {
  tokenId: string | null;
  chainId: 56 | 97 | null;
  chainIdInvalid: boolean;
  collection: string | null;
  collectionInvalid: boolean;
  vault: string | null;
  vaultInvalid: boolean;
  hasIdentityQuery: boolean;
};

type PoolOnChainConfirmation = {
  context: NftVaultPendingContext;
  assetId: string;
  collectionAddress: string;
  tokenId: string;
  action: 'deposit' | 'request_exit' | 'withdraw';
  txHash: Hash;
  depositEpoch?: string;
  confirmedAt: number;
};

type PoolPositionIdentityInput = {
  chainId: number;
  collectionAddress: string;
  tokenId: string;
  vaultAddress: string;
};

type EphemeralPendingEntry = {
  operation: NftVaultPendingOperation;
  storageRaw: string | null;
};

function receiptBlockNumber(receipt: unknown) {
  if (!receipt || typeof receipt !== 'object') return null;
  const value = (receipt as { blockNumber?: unknown }).blockNumber;
  try {
    if (typeof value === 'bigint' && value >= BigInt(0)) return value;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    if (typeof value === 'string' && /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) return BigInt(value);
  } catch {
    return null;
  }
  return null;
}

function poolTabFromHash(hash: string) {
  if (hash === 'mi-cukie-pool' || hash === 'mis-cukies-aportados' || hash.startsWith('pool-cukie-')) return 'pool' as const;
  if (hash === 'cukies-disponibles' || hash.startsWith('pool-available-')) return 'available' as const;
  return null;
}

function poolTabHash(tab: PoolTab) {
  return tab === 'pool' ? 'mis-cukies-aportados' : 'cukies-disponibles';
}


function sameAddress(left: string | undefined | null, right: string | undefined | null) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function sameAddressSet(left: string[], right: readonly string[]) {
  return left.map((item) => item.toLowerCase()).sort().join(',')
    === [...right].map((item) => item.toLowerCase()).sort().join(',');
}

function utcLabel(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function generationLabel(value: PoolGeneration) {
  return value === 'original' ? 'Original' : 'Segunda generación';
}

function rarityLabel(value: PoolRarity) {
  return ({
    common: 'Común',
    uncommon: 'No común',
    rare: 'Raro',
    epic: 'Épico',
    legendary: 'Legendario',
    goat: 'Goat',
  } as const)[value];
}

function dailyGamesCapacity(generation: PoolGeneration, rarity: PoolRarity) {
  const quota = {
    original: { common: 2, uncommon: 4, rare: 6, epic: 8, legendary: 10, goat: 12 },
    second_generation: { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, goat: 6 },
  } as const;
  return quota[generation][rarity];
}

function statusLabel(value: PoolPositionStatus) {
  if (value === 'pending') return 'Activándose';
  if (value === 'active') return 'Disponible para partidas';
  if (value === 'recovery') return 'En recuperación';
  if (value === 'exit_requested') return 'Salida solicitada';
  if (value === 'withdrawable') return 'Listo para retirar';
  return 'Retirado';
}

function poolGuardLabel(input: {
  identityReady: boolean;
  depositsReady: boolean;
  pendingHydrated: boolean;
  pending?: NftVaultPendingOperation;
  correctChain: boolean;
  walletMatches: boolean;
  canonical: boolean;
  busy?: boolean;
}) {
  if (input.busy) return 'Ya hay otra operación en curso; espera a que termine antes de repetirla.';
  if (!input.canonical) return 'El inventario de este Cukie está pendiente de sincronizar; actualiza el estado antes de aportar.';
  if (!input.walletMatches) return 'Conecta la misma wallet con la que has iniciado sesión para aportar este Cukie.';
  if (!input.correctChain) return 'Cambia tu wallet a la red configurada para este Pool antes de aportar.';
  if (!input.identityReady) return 'No podemos verificar la configuración y la custodia del Pool; la operación permanece bloqueada.';
  if (!input.depositsReady) return 'El indexador está actualizando el inventario; el depósito se habilitará cuando el estado sea verificable.';
  if (!input.pendingHydrated) return 'Estamos recuperando el estado de operaciones anteriores; espera un momento.';
  if (input.pending && input.pending.phase !== 'approval_confirmed') return 'Este Cukie ya tiene una operación pendiente; espera a que se confirme antes de repetirla.';
  return null;
}

function poolTransactionError(reason: unknown) {
  const raw = reason instanceof Error ? reason.message : String(reason ?? '');
  const message = raw.toLowerCase();
  if (message.includes('simulation_unavailable')) {
    return 'No se pudo ejecutar la simulación previa del Pool. No se ha enviado ninguna transacción; actualiza la página o inténtalo cuando el RPC esté disponible.';
  }
  if (message.includes('simulation_rejected')) {
    if (message.includes('collectionnotallowed') || message.includes('invalidcollection')) {
      return 'El contrato no permite esta colección en el Pool configurado. No se ha movido ningún NFT.';
    }
    return 'La simulación del contrato ha rechazado la operación. No se ha enviado ninguna transacción; revisa el estado antes de firmar.';
  }
  if (message.includes('user rejected') || message.includes('user denied')) {
    return 'La wallet canceló la firma. No se ha cambiado ninguna posición.';
  }
  if (raw.startsWith('POOL_OPERATION_')) {
    const code = raw.slice('POOL_OPERATION_'.length);
    return ({
      WRONG_CHAIN: 'Cambia tu wallet a la red configurada para este Pool.',
      WALLET_MISMATCH: 'Conecta la misma wallet con la que has iniciado sesión.',
      PUBLIC_CLIENT_UNAVAILABLE: 'No podemos comprobar la red ahora. Actualiza el estado y vuelve a intentarlo.',
      CONTEXT_CHANGED: 'La wallet, la red o el vault cambiaron durante la comprobación. No se ha enviado ninguna transacción; actualiza el estado antes de reintentarlo.',
    } as Record<string, string>)[code] ?? 'La operación permanece bloqueada porque no se puede verificar su contexto.';
  }
  if (message.includes('wallet_is_not_owner') || message.includes('not token owner')) {
    return 'Este Cukie ya no está en tu wallet. El inventario puede estar desactualizado; actualiza el estado antes de volver a intentarlo.';
  }
  if (message.includes('collectionnotallowed') || message.includes('invalidcollection')) {
    return 'El contrato no permite esta colección en el Pool configurado. No se ha movido ningún NFT.';
  }
  if (message.includes('positionalreadyexists') || message.includes('registeredposition')) {
    return 'Este Cukie ya tiene una posición registrada en el Pool. Actualiza el estado para verla.';
  }
  if (message.includes('withdrawalnotready') || message.includes('exitnotrequested')) {
    return 'La salida todavía no está disponible para esta posición. Revisa la fecha indicada y actualiza el estado.';
  }
  if (message.includes('exitalreadyrequested')) {
    return 'La salida de este Cukie ya está solicitada. Actualiza el estado para ver cuándo puedes retirarlo.';
  }
  if (message.includes('enforcedpause')) {
    return 'El Pool está pausado temporalmente. No se ha cambiado ninguna posición; vuelve a intentarlo cuando se habilite.';
  }
  if (message.includes('transaction_reverted') || message.includes('reverted')) {
    return 'El contrato ha rechazado la operación (revert). Revisa la red, la colección y el estado del Cukie antes de reintentarlo.';
  }
  if (message.includes('simulation')) {
    return 'La simulación del contrato ha rechazado la operación. Revisa la red, la colección y el estado del Cukie antes de firmar.';
  }
  return 'No se pudo completar la operación del Pool. Actualiza el estado y vuelve a intentarlo.';
}

function pendingLabel(operation: NftVaultPendingOperation, confirmedOnChain = false) {
  if (operation.phase === 'approval_confirmed') return 'Continuar depósito';
  if (operation.phase === 'syncing_projection') {
    if (confirmedOnChain) {
      if (operation.action === 'deposit') return 'Depósito confirmado · actualizando inventario…';
      if (operation.action === 'request_exit') return 'Salida confirmada · actualizando inventario…';
      return 'Retirada confirmada · actualizando colección…';
    }
    if (operation.action === 'deposit') return 'Actualizando depósito…';
    if (operation.action === 'request_exit') return 'Actualizando salida…';
    return 'Retirada confirmada · actualizando colección…';
  }
  return ({
    approval: 'Confirmando aprobación…',
    deposit: 'Confirmando depósito…',
    request_exit: 'Confirmando solicitud…',
    withdraw: 'Confirmando retirada…',
  } as const)[operation.action];
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
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  return null;
}

function poolPositionMatchesOperation(
  operation: NftVaultPendingOperation,
  rawPosition: unknown,
  action: 'request_exit' | 'withdraw',
) {
  const owner = tupleField(rawPosition, 'beneficialOwner', 0);
  const epoch = uintText(tupleField(rawPosition, 'depositEpoch', 1));
  if (!sameAddress(owner as string | null | undefined, operation.walletAddress) || !epoch || epoch === '0') {
    if (action !== 'withdraw' || !sameAddress(owner as string | null | undefined, '0x0000000000000000000000000000000000000000')) return false;
  }
  if (action === 'request_exit') {
    const exitRequestedAt = uintText(tupleField(rawPosition, 'exitRequestedAt', 4));
    const withdrawableAt = uintText(tupleField(rawPosition, 'withdrawableAt', 5));
    return Boolean(
      sameAddress(owner as string | null | undefined, operation.walletAddress)
      && epoch
      && epoch !== '0'
      && (!operation.depositEpoch || operation.depositEpoch === epoch)
      && ((exitRequestedAt && exitRequestedAt !== '0') || (withdrawableAt && withdrawableAt !== '0')),
    );
  }
  return sameAddress(owner as string | null | undefined, '0x0000000000000000000000000000000000000000');
}

function projectionMatchesPoolOperation(
  operation: NftVaultPendingOperation,
  status: PoolStatus,
) {
  if (
    operation.phase !== 'syncing_projection'
    || status.mode !== 'custodial_vault'
    || !status.sourceHealthy
    || status.walletNormalized.toLowerCase() !== operation.walletAddress.toLowerCase()
    || status.nftCustody.chainId !== operation.chainId
    || !sameAddress(status.nftCustody.vaultAddress, operation.vaultAddress)
  ) return false;
  const position = status.positions.find((item) => (
    item.assetId === operation.assetId
    || pendingNftVaultOperationAssetKey(operation) === item.assetId
  ));
  if (
    position
    && (!sameAddress(position.collectionAddress, operation.collectionAddress)
      || position.tokenId !== operation.tokenId)
  ) return false;
  if (operation.action === 'deposit') {
    // A position with the same token is not enough: an old local operation
    // may refer to epoch 1 while the vault already contains epoch 2. The
    // receipt reconciliation fills depositEpoch before this guard can clear.
    return Boolean(
      position?.lifecycleOpen
      && pendingNftVaultOperationMatchesPosition(operation, position)
    );
  }
  if (operation.depositEpoch && position && !pendingNftVaultOperationMatchesPosition(operation, position)) return false;
  if (operation.action === 'request_exit') {
    return Boolean(position && (
      position.status === 'exit_requested'
      || position.status === 'withdrawable'
      || position.status === 'withdrawn'
    ));
  }
  if (operation.action === 'withdraw') {
    if (status.availability?.status === 'partial') return false;
    return !position || position.status === 'withdrawn' || !position.lifecycleOpen;
  }
  return false;
}

function mergePendingPoolAssets(
  status: PoolStatus,
  previous: PoolStatus | null,
  pendingByAsset: Record<string, NftVaultPendingOperation>,
) {
  if (status.mode !== 'custodial_vault' || !previous || previous.mode !== 'custodial_vault') return status;
  const availableAssets = [...status.availableAssets];
  for (const operation of Object.values(pendingByAsset)) {
    if (
      operation.action !== 'deposit'
      || operation.walletAddress.toLowerCase() !== status.walletNormalized.toLowerCase()
      || operation.chainId !== status.nftCustody.chainId
      || operation.vaultAddress.toLowerCase() !== status.nftCustody.vaultAddress.toLowerCase()
      || !availableAssets.every((asset) => !(
        asset.assetId === operation.assetId
        || pendingNftVaultOperationAssetKey(operation) === asset.assetId
      ))
    ) continue;
    if ([...status.positions, ...(status.recoveryAssets ?? [])].some((position) => (
      position.assetId === operation.assetId
      || pendingNftVaultOperationAssetKey(operation) === position.assetId
    ))) continue;
    const previousAsset = previous.availableAssets.find((asset) => (
      asset.assetId === operation.assetId
      || pendingNftVaultOperationAssetKey(operation) === asset.assetId
    ));
    if (previousAsset) availableAssets.push(previousAsset);
  }
  return availableAssets.length === status.availableAssets.length
    ? status
    : { ...status, availableAssets };
}

function samePoolStatusIdentity(current: PoolStatus, previous: PoolStatus | null) {
  if (
    !previous
    || current.mode !== 'custodial_vault'
    || previous.mode !== 'custodial_vault'
  ) return false;
  return current.walletNormalized.toLowerCase() === previous.walletNormalized.toLowerCase()
    && current.nftCustody.chainId === previous.nftCustody.chainId
    && sameAddress(current.nftCustody.vaultAddress, previous.nftCustody.vaultAddress)
    && sameAddressSet(current.nftCustody.collectionAddresses, previous.nftCustody.collectionAddresses);
}

function withoutTerminalWithdrawals(
  status: PoolStatus,
  terminalWithdrawals: ReadonlySet<string>,
) {
  if (status.mode !== 'custodial_vault' || terminalWithdrawals.size === 0) return status;
  return {
    ...status,
    positions: status.positions.filter((position) => (
      !terminalWithdrawals.has(poolPositionIdentityKey(position))
    )),
    ...(status.recoveryAssets
      ? {
        recoveryAssets: status.recoveryAssets.filter((position) => (
          !terminalWithdrawals.has(poolPositionIdentityKey(position))
        )),
      }
      : {}),
  };
}

function retainPoolLists(
  current: PoolStatus,
  previous: PoolStatus | null,
  terminalWithdrawals: ReadonlySet<string> = new Set(),
) {
  const currentVisible = withoutTerminalWithdrawals(current, terminalWithdrawals);
  const previousVisible = previous
    ? withoutTerminalWithdrawals(previous, terminalWithdrawals)
    : null;
  if (!samePoolStatusIdentity(currentVisible, previousVisible)) return currentVisible;
  const retained = retainNftVaultLists(currentVisible, previousVisible);
  const retainedVisible = withoutTerminalWithdrawals(retained, terminalWithdrawals);
  if (
    currentVisible.mode !== 'custodial_vault'
    || previousVisible?.mode !== 'custodial_vault'
    || !Array.isArray(currentVisible.recoveryAssets)
    || !Array.isArray(previousVisible.recoveryAssets)
    || previousVisible.recoveryAssets.length === 0
  ) return retainedVisible;
  if (!currentVisible.sourceHealthy) {
    return currentVisible.recoveryAssets.length > 0
      ? retainedVisible
      : {
        ...retainedVisible,
        recoveryAssets: previousVisible.recoveryAssets,
      };
  }
  if (currentVisible.availability?.status !== 'partial') return retainedVisible;
  const unknownAssetIds = new Set(currentVisible.availability.unknownAssetIds ?? []);
  if (unknownAssetIds.size === 0) return retainedVisible;
  const currentAssetIds = new Set(currentVisible.recoveryAssets.map((asset) => asset.assetId));
  const recoveryAssets = [
    ...currentVisible.recoveryAssets,
    ...previousVisible.recoveryAssets.filter((asset) => (
      unknownAssetIds.has(asset.assetId) && !currentAssetIds.has(asset.assetId)
    )),
  ];
  return recoveryAssets.length === currentVisible.recoveryAssets.length
    ? retainedVisible
    : { ...retainedVisible, recoveryAssets };
}

function mergePoolPositions(status: CustodialStatus) {
  const positions: CustodialPosition[] = [];
  const seenAssets = new Set<string>();
  for (const position of status.positions) {
    if (!position.lifecycleOpen || seenAssets.has(position.assetId)) continue;
    seenAssets.add(position.assetId);
    positions.push(position);
  }
  for (const position of status.recoveryAssets ?? []) {
    if (!position.lifecycleOpen || seenAssets.has(position.assetId)) continue;
    seenAssets.add(position.assetId);
    positions.push(position);
  }
  return positions;
}

function recoveryHref(position: CustodialPosition) {
  const query = new URLSearchParams({
    tokenId: position.tokenId,
    chainId: String(position.chainId),
    collection: position.collectionAddress,
    recoveryVault: position.vaultAddress,
  });
  return `/cukie-hodler/recuperar?${query.toString()}#pool-recovery`;
}

function poolPositionTarget(position: CustodialPosition) {
  return [
    'pool-cukie',
    position.chainId,
    position.collectionAddress.toLowerCase(),
    position.tokenId,
    position.vaultAddress.toLowerCase(),
    position.depositEpoch,
  ].join('-');
}

function poolPositionIdentityPrefix(input: PoolPositionIdentityInput) {
  return [
    input.chainId,
    input.collectionAddress.toLowerCase(),
    input.tokenId,
    input.vaultAddress.toLowerCase(),
  ].join(':');
}

function poolPositionIdentityKey(position: PoolPositionIdentityInput & { depositEpoch: string }) {
  return `${poolPositionIdentityPrefix(position)}:${position.depositEpoch}`;
}

function poolAvailableTarget(asset: AvailableAsset) {
  return [
    'pool-available',
    asset.chainId,
    asset.collectionAddress.toLowerCase(),
    asset.tokenId,
  ].join('-');
}

function poolTargetElement(target: string) {
  return document.getElementById(target)
    ?? [...document.querySelectorAll<HTMLElement>('[data-pool-target]')]
      .find((element) => element.dataset.poolTarget === target)
    ?? null;
}

function scheduleSummary(position: CustodialPosition) {
  if (position.custody === 'cukie_pool_recovery') {
    if (position.status === 'withdrawable') {
      return {
        label: 'Retirada disponible desde',
        timestamp: position.withdrawableAt,
        detail: 'La espera terminó. Abre la retirada para que este Cukie vuelva a tu wallet.',
      };
    }
    if (position.status === 'exit_requested') {
      return {
        label: 'Podrás retirarlo desde',
        timestamp: position.withdrawableAt,
        detail: 'Este Cukie sigue protegido y no está disponible para partidas mientras termina la espera.',
      };
    }
    return {
      label: 'Recuperación pendiente',
      timestamp: null,
      detail: 'Este Cukie sigue protegido y no está disponible para partidas. Abre su estado para continuar.',
    };
  }
  if (position.status === 'pending') {
    return {
      label: 'Disponible para partidas desde',
      timestamp: position.activationAt,
      detail: 'Hasta entonces permanece protegido, pero todavía no puede usarse ni generar reparto.',
    };
  }
  if (position.status === 'active') {
    return {
      label: 'Participando desde',
      timestamp: position.activationAt,
      detail: 'Puede entrar en partidas. Si se usa en partidas válidas, opta al reparto de su generación.',
    };
  }
  if (position.status === 'exit_requested') {
    return {
      label: 'Podrás retirarlo desde',
      timestamp: position.withdrawableAt,
      detail: 'Sigue disponible para partidas hasta ese momento, pero ya no opta al reparto de este periodo.',
    };
  }
  if (position.status === 'withdrawable') {
    return {
      label: 'Retirada disponible desde',
      timestamp: position.withdrawableAt,
      detail: 'El corte ya terminó y puedes retirar el NFT ahora.',
    };
  }
  return {
    label: 'NFT retirado el',
    timestamp: position.withdrawnAt,
    detail: 'La posición está cerrada y el NFT volvió a tu wallet.',
  };
}

function PositionSchedule({ position }: { position: CustodialPosition }) {
  const schedule = scheduleSummary(position);
  return (
    <div className="mt-4 border-t border-white/10 pt-3">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">
        Depósito registrado
      </p>
      <p className="mt-1 text-sm font-bold text-[var(--uki-text)]">
        {utcLabel(position.depositedAt)} UTC
      </p>
      <p className="mt-3 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">
        {schedule.label}
      </p>
      <p className="mt-1 font-headline text-base font-black text-[var(--uki-cream)]">
        {utcLabel(schedule.timestamp)} UTC
      </p>
      <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
        {schedule.detail}
      </p>
    </div>
  );
}

function JourneyStep({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-headline text-sm font-black text-[var(--uki-lilac)]">{number}</span>
      <span className="h-px w-8 bg-[rgba(228,92,255,0.45)]" aria-hidden="true" />
      <p className="text-sm font-bold text-[var(--uki-text)]">{label}</p>
    </div>
  );
}

export function CukiePoolStatusPanel() {
  const { user, isLoading: authLoading, walletType } = useAuth();
  const runtime = useAppRuntime();
  const { address, chainId, isConnected } = useAccount();
  const { requestWallet, openWalletSelector, evm: evmWallet } = useWalletCoordinator();
  const publicClient = usePublicClient({ chainId: ukiNftVaults.chainId ?? undefined });
  const { writeContractAsync } = useWriteContract();
  const operationGuard = useGuardedOperation('pool-write');
  const operationGuardRef = useRef(operationGuard);
  operationGuardRef.current = operationGuard;
  const writeContextRef = useRef({
    wallet: address ?? null,
    chainId: chainId ?? null,
    vault: ukiNftVaults.cukiePoolNftVaultAddress ?? null,
  });
  writeContextRef.current = {
    wallet: address ?? null,
    chainId: chainId ?? null,
    vault: ukiNftVaults.cukiePoolNftVaultAddress ?? null,
  };
  const [mutatingAssetId, setMutatingAssetId] = useState<string | null>(null);
  const [phase, setPhase] = useState<MutationPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exitConfirmationId, setExitConfirmationId] = useState<string | null>(null);
  const [latestTxHash, setLatestTxHash] = useState<Hash | null>(null);
  const [activeTab, setActiveTab] = useState<PoolTab>('pool');
  const [visitedTabs, setVisitedTabs] = useState<Set<PoolTab>>(() => new Set());
  const [navigationReady, setNavigationReady] = useState(false);
  const [hashTarget, setHashTarget] = useState<string | null>(null);
  const hashScrollHandledRef = useRef<string | null>(null);
  const validatedHashTargetRef = useRef<string | null>(null);
  const [requestedIdentity, setRequestedIdentity] = useState<PoolRequestedIdentity>({
    tokenId: null,
    chainId: null,
    chainIdInvalid: false,
    collection: null,
    collectionInvalid: false,
    vault: null,
    vaultInvalid: false,
    hasIdentityQuery: false,
  });
  const [pendingByAsset, setPendingByAsset] = useState<Record<string, NftVaultPendingOperation>>({});
  const pendingByAssetRef = useRef(pendingByAsset);
  pendingByAssetRef.current = pendingByAsset;
  const pendingEphemeralByContextRef = useRef(new Map<string, Record<string, EphemeralPendingEntry>>());
  const [onChainByAsset, setOnChainByAsset] = useState<Record<string, PoolOnChainConfirmation>>({});
  const [terminalWithdrawals, setTerminalWithdrawals] = useState<Set<string>>(() => new Set());
  const confirmedReceiptByHashRef = useRef(new Map<string, { status: string; transactionHash?: Hash; logs?: unknown; blockNumber?: bigint | number | string }>());
  const [hydratedPendingKey, setHydratedPendingKey] = useState<string | null>(null);
  const operationLocksRef = useRef(new Set<string>());
  const walletOperationLockRef = useRef(false);
  const statusResource = useAppRuntimeResource<PoolStatus>('pool', {
    enabled: Boolean(user?.walletAddress) && !authLoading,
    validate: (value): value is PoolStatus => Boolean(
      value
      && typeof value === 'object'
      && 'walletNormalized' in value
      && typeof value.walletNormalized === 'string'
      && runtime.address
      && value.walletNormalized.toLowerCase() === runtime.address.toLowerCase(),
    ),
  });
  const fetchedStatus = statusResource.data ?? null;
  const statusIdentityKey = [
    user?.walletAddress?.toLowerCase() ?? '',
    chainId ?? '',
    ukiNftVaults.cukiePoolNftVaultAddress?.toLowerCase() ?? '',
  ].join(':');
  const lastStatusIdentityRef = useRef(statusIdentityKey);
  const lastHealthyStatusRef = useRef<PoolStatus | null>(null);
  if (lastStatusIdentityRef.current !== statusIdentityKey) {
    lastStatusIdentityRef.current = statusIdentityKey;
    lastHealthyStatusRef.current = null;
  }
  const status = useMemo(() => {
    if (!fetchedStatus) return null;
    const retained = retainPoolLists(fetchedStatus, lastHealthyStatusRef.current, terminalWithdrawals);
    return mergePendingPoolAssets(retained, lastHealthyStatusRef.current, pendingByAsset);
  }, [fetchedStatus, pendingByAsset, terminalWithdrawals]);
  useEffect(() => {
    if (
      fetchedStatus?.sourceHealthy
      && fetchedStatus.mode === 'custodial_vault'
      && fetchedStatus.availability?.status !== 'partial'
    ) {
      lastHealthyStatusRef.current = mergePendingPoolAssets(fetchedStatus, lastHealthyStatusRef.current, pendingByAsset);
    }
  }, [fetchedStatus, pendingByAsset]);
  const loadState = statusResource.state === 'stale' ? 'ready' : statusResource.state;
  const refreshStatusQuery = statusResource.refresh;
  const statusWasFetching = statusResource.isFetching;

  useEffect(() => {
    const syncTabFromLocation = () => {
      const target = window.location.hash.slice(1);
      const tab = poolTabFromHash(target) ?? 'pool';
      const params = new URLSearchParams(window.location.search);
      const tokenId = params.get('tokenId');
      const rawChainId = params.get('chainId');
      const chainId = rawChainId === '56' || rawChainId === '97' ? Number(rawChainId) as 56 | 97 : null;
      const rawCollection = params.get('collection');
      const collection = rawCollection?.trim() || null;
      const rawVault = params.get('vault');
      const rawRecoveryVault = params.get('recoveryVault');
      const vault = (rawVault ?? rawRecoveryVault)?.trim() || null;
      const vaultConflict = rawVault !== null
        && rawRecoveryVault !== null
        && !sameAddress(rawVault, rawRecoveryVault);
      const collectionInvalid = rawCollection !== null
        && (!collection || !isAddress(collection, { strict: false }));
      const vaultInvalid = rawVault !== null || rawRecoveryVault !== null
        ? !vault || vaultConflict || !isAddress(vault, { strict: false })
        : false;
      const hasIdentityQuery = params.has('tokenId')
        || params.has('chainId')
        || params.has('collection')
        || params.has('vault')
        || params.has('recoveryVault');
      hashScrollHandledRef.current = null;
      validatedHashTargetRef.current = null;
      setHashTarget(hasIdentityQuery ? null : target || null);
      setRequestedIdentity({
        tokenId,
        chainId,
        chainIdInvalid: rawChainId !== null && chainId === null,
        collection,
        collectionInvalid,
        vault,
        vaultInvalid,
        hasIdentityQuery,
      });
      if (tab) {
        setActiveTab(tab);
        setVisitedTabs((current) => current.has(tab) ? current : new Set([...current, tab]));
      }
    };
    syncTabFromLocation();
    const initialTarget = window.location.hash.slice(1);
    const initialTokenId = new URLSearchParams(window.location.search).get('tokenId');
    if (!poolTabFromHash(initialTarget) && !initialTokenId) {
      setActiveTab('pool');
      setVisitedTabs(new Set(['pool']));
    }
    setNavigationReady(true);
    window.addEventListener('hashchange', syncTabFromLocation);
    window.addEventListener('popstate', syncTabFromLocation);
    return () => {
      window.removeEventListener('hashchange', syncTabFromLocation);
      window.removeEventListener('popstate', syncTabFromLocation);
    };
  }, []);

  useEffect(() => {
    if (!hashTarget || hashTarget === hashScrollHandledRef.current) return;
    let disposed = false;
    let observer: MutationObserver | null = null;
    const scrollToTarget = () => {
      if (disposed) return false;
      if (
        requestedIdentity.hasIdentityQuery
        && hashTarget !== validatedHashTargetRef.current
      ) return false;
      const target = poolTargetElement(hashTarget);
      if (!target || target.closest('[hidden]')) return false;
      target.scrollIntoView?.({ block: 'start' });
      hashScrollHandledRef.current = hashTarget;
      observer?.disconnect();
      return true;
    };
    if (!scrollToTarget()) {
      observer = new MutationObserver(() => scrollToTarget());
      observer.observe(document.body, { childList: true, subtree: true });
    }
    const timeout = window.setTimeout(() => observer?.disconnect(), 5_000);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.clearTimeout(timeout);
    };
  }, [activeTab, authLoading, hashTarget, loadState, requestedIdentity.hasIdentityQuery, status]);

  function selectTab(tab: PoolTab) {
    setActiveTab(tab);
    setVisitedTabs((current) => current.has(tab) ? current : new Set([...current, tab]));
    const hash = `#${poolTabHash(tab)}`;
    setHashTarget(hash.slice(1));
    hashScrollHandledRef.current = hash.slice(1);
    if (window.location.hash !== hash) window.history.pushState(window.history.state, '', hash);
  }

  useEffect(() => {
    setPhase('idle');
    setMutatingAssetId(null);
    setLatestTxHash(null);
    setError(null);
    setNotice(null);
    setOnChainByAsset({});
    setTerminalWithdrawals(new Set());
    confirmedReceiptByHashRef.current.clear();
    walletOperationLockRef.current = false;
  }, [address, chainId]);

  function refreshStatus() {
    void refreshStatusQuery();
  }

  const custody = status?.mode === 'custodial_vault' ? status.nftCustody : null;
  const configMatches = Boolean(
    custody
    && ukiNftVaults.mode.cukiePool === 'custodial'
    && custody.chainId === ukiNftVaults.chainId
    && sameAddress(custody.vaultAddress, ukiNftVaults.cukiePoolNftVaultAddress)
    && sameAddressSet(custody.collectionAddresses, ukiNftVaults.collectionAddresses),
  );
  const walletMatches = Boolean(
    walletType === 'evm'
    && isConnected
    && address
    && user?.walletAddress
    && sameAddress(address, user.walletAddress),
  );
  const correctChain = Boolean(ukiNftVaults.chainId && chainId === ukiNftVaults.chainId);
  const identityReady = Boolean(
    custody
    && ukiNftVaults.ready.cukiePool
    && configMatches
    && walletMatches
    && correctChain
    && publicClient,
  );
  const depositsReady = Boolean(identityReady && custody?.indexer.status === 'ready');

  function preparePoolWallet() {
    const targetChainId = ukiNftVaults.chainId;
    if (!targetChainId) {
      setError('La red del Pool aún no está configurada; la operación permanece bloqueada.');
      return;
    }
    if (!walletMatches) {
      openWalletSelector('evm', 'Conecta la misma wallet con la que has iniciado sesión para operar el Pool.');
      return;
    }
    void requestWallet({
      kind: 'evm',
      targetChainId,
      reason: 'Cambia la wallet a la red configurada para operar el Pool.',
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'No se pudo preparar la wallet para el Pool.');
    });
  }

  const pendingContext = useMemo<NftVaultPendingContext | null>(() => {
    if (!ukiNftVaults.chainId || !ukiNftVaults.cukiePoolNftVaultAddress || !user?.walletAddress) return null;
    return {
      chainId: ukiNftVaults.chainId,
      walletAddress: user.walletAddress,
      vaultAddress: ukiNftVaults.cukiePoolNftVaultAddress,
    };
  }, [user?.walletAddress]);
  const pendingContextRef = useRef<NftVaultPendingContext | null>(pendingContext);
  pendingContextRef.current = pendingContext;
  const pendingKey = useMemo(
    () => pendingContext ? pendingNftVaultStorageKey(pendingContext) : null,
    [pendingContext],
  );
  const pendingHydrated = Boolean(pendingKey && hydratedPendingKey === pendingKey);

  const pendingOperationsForContext = useCallback((context: NftVaultPendingContext) => {
    const storage = getNftVaultBrowserStorage();
    const storageSnapshot = getNftVaultStorageSnapshot(storage, context);
    const persisted = loadPendingNftVaultOperations(storage, context);
    const contextKey = pendingNftVaultStorageKey(context);
    const ephemeral = pendingEphemeralByContextRef.current.get(contextKey) ?? {};
    const merged = new Map<string, NftVaultPendingOperation>(
      persisted.map((operation) => [pendingNftVaultOperationAssetKey(operation), operation]),
    );
    const nextEphemeral = { ...ephemeral };
    let ephemeralChanged = false;
    for (const [key, entry] of Object.entries(ephemeral)) {
      const storageUnchanged = !storageSnapshot.readable || entry.storageRaw === storageSnapshot.raw;
      if (storageUnchanged) continue;
      delete nextEphemeral[key];
      ephemeralChanged = true;
    }
    if (ephemeralChanged) {
      if (Object.keys(nextEphemeral).length === 0) pendingEphemeralByContextRef.current.delete(contextKey);
      else pendingEphemeralByContextRef.current.set(contextKey, nextEphemeral);
    }
    for (const [key, entry] of Object.entries(ephemeralChanged ? nextEphemeral : ephemeral)) {
      merged.set(key, entry.operation);
    }
    return [...merged.values()];
  }, []);

  const pendingOperationForAsset = useCallback((asset: PendingAsset) => {
    const key = pendingNftVaultOperationAssetKey({
      assetId: asset.assetId,
      chainId: pendingContext?.chainId ?? asset.chainId,
      collectionAddress: asset.collectionAddress,
      tokenId: asset.tokenId,
    });
    const operation = pendingByAsset[key] ?? (pendingContext
      ? pendingOperationsForContext(pendingContext).find((item) => pendingNftVaultOperationAssetKey(item) === key)
      : undefined);
    if (!operation || !pendingContext) return undefined;
    return operation.chainId === pendingContext.chainId
      && sameAddress(operation.walletAddress, pendingContext.walletAddress)
      && sameAddress(operation.vaultAddress, pendingContext.vaultAddress)
      && chainId === pendingContext.chainId
      && sameAddress(address, pendingContext.walletAddress)
      ? operation
      : undefined;
  }, [address, chainId, pendingByAsset, pendingContext, pendingOperationsForContext]);

  const onChainConfirmationForAsset = useCallback((asset: PendingAsset) => {
    const key = pendingNftVaultOperationAssetKey({
      assetId: asset.assetId,
      chainId: pendingContext?.chainId ?? asset.chainId,
      collectionAddress: asset.collectionAddress,
      tokenId: asset.tokenId,
    });
    const pending = pendingOperationForAsset(asset);
    const confirmation = onChainByAsset[key];
    if (
      !pending
      || !confirmation
      || !pendingContext
      || confirmation.context.chainId !== pendingContext.chainId
      || !sameAddress(confirmation.context.walletAddress, pendingContext.walletAddress)
      || !sameAddress(confirmation.context.vaultAddress, pendingContext.vaultAddress)
      || confirmation.assetId !== key
      || confirmation.txHash.toLowerCase() !== pending.txHash.toLowerCase()
      || confirmation.action !== pending.action
    ) return null;
    return confirmation;
  }, [onChainByAsset, pendingContext, pendingOperationForAsset]);

  const persistPending = useCallback((input: {
    asset: PendingAsset;
    action: NftVaultPendingAction;
    phase: NftVaultPendingPhase;
    txHash: Hash;
    depositEpoch?: string;
    receiptBlockNumber?: string;
    context?: NftTransactionContext;
    expectedOperation?: NftVaultPendingOperation;
    isCurrent?: () => boolean;
    updateUi?: boolean;
  }) => {
    const storageContext = input.context
      ? {
        chainId: input.context.chainId,
        walletAddress: input.context.wallet,
        vaultAddress: input.context.vault,
      }
      : pendingContext;
    if (!storageContext || (input.isCurrent && !input.isCurrent())) return null;
    const now = Date.now();
    const storage = getNftVaultBrowserStorage();
    const canonicalAssetId = canonicalNftVaultAssetId({
      chainId: storageContext.chainId,
      collectionAddress: input.asset.collectionAddress,
      tokenId: input.asset.tokenId,
    });
    if (!canonicalAssetId) return null;
    const operationAssetKey = pendingNftVaultOperationAssetKey({
      assetId: canonicalAssetId,
      chainId: storageContext.chainId,
      collectionAddress: input.asset.collectionAddress,
      tokenId: input.asset.tokenId,
    });
    const currentOperations = pendingOperationsForContext(storageContext);
    const previous = currentOperations
      .find((operation) => pendingNftVaultOperationAssetKey(operation) === operationAssetKey);
    if (input.expectedOperation && !pendingNftVaultOperationMatches(previous, input.expectedOperation)) return null;
    const depositEpoch = input.depositEpoch ?? previous?.depositEpoch;
    const receiptBlockNumber = input.receiptBlockNumber ?? previous?.receiptBlockNumber;
    const operation: NftVaultPendingOperation = {
      version: 1,
      ...storageContext,
      assetId: canonicalAssetId,
      collectionAddress: input.asset.collectionAddress,
      tokenId: input.asset.tokenId,
      action: input.action,
      phase: input.phase,
      txHash: input.txHash,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      ...(depositEpoch ? { depositEpoch } : {}),
      ...(receiptBlockNumber ? { receiptBlockNumber } : {}),
    };
    const persisted = savePendingNftVaultOperation(storage, operation);
    const contextStorageKey = pendingNftVaultStorageKey(storageContext);
    const contextEphemeral = pendingEphemeralByContextRef.current.get(contextStorageKey);
    if (persisted) {
      if (contextEphemeral) {
        const next = { ...contextEphemeral };
        delete next[operationAssetKey];
        if (Object.keys(next).length === 0) pendingEphemeralByContextRef.current.delete(contextStorageKey);
        else pendingEphemeralByContextRef.current.set(contextStorageKey, next);
      }
    } else {
      pendingEphemeralByContextRef.current.set(contextStorageKey, {
        ...(contextEphemeral ?? {}),
        [operationAssetKey]: {
          operation,
          storageRaw: getNftVaultStorageSnapshot(storage, storageContext).raw,
        },
      });
    }
    if (input.updateUi !== false) {
      setPendingByAsset((current) => {
        if (input.isCurrent && !input.isCurrent()) return current;
        if (input.expectedOperation) {
          const currentOperation = Object.values(current)
            .find((item) => pendingNftVaultOperationAssetKey(item) === operationAssetKey);
          if (!pendingNftVaultOperationMatches(currentOperation, input.expectedOperation)) return current;
        }
        return { ...current, [operationAssetKey]: operation };
      });
    }
    return operation;
  }, [pendingContext, pendingOperationsForContext]);

  const clearPending = useCallback((assetId: string, input: {
    context?: NftTransactionContext;
    expectedOperation?: NftVaultPendingOperation;
    isCurrent?: () => boolean;
    updateUi?: boolean;
  } = {}) => {
    const storageContext = input.context
      ? {
        chainId: input.context.chainId,
        walletAddress: input.context.wallet,
        vaultAddress: input.context.vault,
      }
    : pendingContext;
    if (input.isCurrent && !input.isCurrent()) return;
    if (storageContext) {
      const storage = getNftVaultBrowserStorage();
      const expectedOperation = input.expectedOperation;
      if (expectedOperation) {
        const storedOperation = pendingOperationsForContext(storageContext)
          .find((operation) => pendingNftVaultOperationAssetKey(operation) === pendingNftVaultOperationAssetKey(expectedOperation));
        if (storedOperation && !pendingNftVaultOperationMatches(storedOperation, expectedOperation)) return;
      }
      clearPendingNftVaultOperation(
        storage,
        storageContext,
        assetId,
        expectedOperation,
      );
      if (expectedOperation) {
        const contextStorageKey = pendingNftVaultStorageKey(storageContext);
        const contextEphemeral = pendingEphemeralByContextRef.current.get(contextStorageKey);
        if (contextEphemeral) {
          const operationKey = pendingNftVaultOperationAssetKey(expectedOperation);
          const currentEphemeral = contextEphemeral[operationKey]?.operation;
          if (pendingNftVaultOperationMatches(currentEphemeral, expectedOperation)) {
            const next = { ...contextEphemeral };
            delete next[operationKey];
            if (Object.keys(next).length === 0) pendingEphemeralByContextRef.current.delete(contextStorageKey);
            else pendingEphemeralByContextRef.current.set(contextStorageKey, next);
          }
        }
      }
    }
    if (input.updateUi === false) return;
    setPendingByAsset((current) => {
      if (input.isCurrent && !input.isCurrent()) return current;
      const next = { ...current };
      for (const [key, operation] of Object.entries(current)) {
        if (
          (input.expectedOperation && !pendingNftVaultOperationMatches(operation, input.expectedOperation))
          || (
            !input.expectedOperation
            && key !== assetId
            && operation.assetId !== assetId
            && pendingNftVaultOperationAssetKey(operation) !== assetId
          )
        ) continue;
        if (
          !input.expectedOperation
          || key === assetId
          || operation.assetId === assetId
          || pendingNftVaultOperationAssetKey(operation) === assetId
        ) delete next[key];
      }
      return next;
    });
  }, [pendingContext, pendingOperationsForContext]);

  useEffect(() => {
    operationLocksRef.current.clear();
    setHydratedPendingKey(null);
    if (!pendingContext || !pendingKey) {
      setPendingByAsset({});
      return;
    }
    const operations = pendingOperationsForContext(pendingContext);
    setPendingByAsset(Object.fromEntries(operations.map((operation) => [
      pendingNftVaultOperationAssetKey(operation),
      operation,
    ])));
    setHydratedPendingKey(pendingKey);
  }, [pendingContext, pendingKey, pendingOperationsForContext]);

  useEffect(() => {
    if (!pendingContext || !pendingKey) return;
    const syncPendingFromStorage = (event: StorageEvent) => {
      if (event.key !== pendingKey) return;
      pendingEphemeralByContextRef.current.delete(pendingKey);
      const operations = pendingOperationsForContext(pendingContext);
      setPendingByAsset(Object.fromEntries(operations.map((operation) => [
        pendingNftVaultOperationAssetKey(operation),
        operation,
      ])));
    };
    window.addEventListener('storage', syncPendingFromStorage);
    return () => window.removeEventListener('storage', syncPendingFromStorage);
  }, [pendingContext, pendingKey, pendingOperationsForContext]);

  useEffect(() => {
    if (!status) return;
    const reconciliationContext = pendingContext;
    const reconciliationKey = reconciliationContext ? pendingNftVaultStorageKey(reconciliationContext) : null;
    const isCurrent = () => Boolean(
      reconciliationContext
      && reconciliationKey
      && pendingContextRef.current
      && pendingNftVaultStorageKey(pendingContextRef.current) === reconciliationKey
      && nftTransactionContextMatches(
        {
          wallet: reconciliationContext.walletAddress,
          chainId: reconciliationContext.chainId,
          vault: reconciliationContext.vaultAddress,
        },
        nftTransactionContextFromNullable(writeContextRef.current),
      ),
    );
    for (const operation of Object.values(pendingByAsset)) {
      if (!isCurrent() || !projectionMatchesPoolOperation(operation, status)) continue;
      const storedOperation = reconciliationContext
        ? pendingOperationsForContext(reconciliationContext)
          .find((item) => pendingNftVaultOperationAssetKey(item) === pendingNftVaultOperationAssetKey(operation))
        : null;
      if (storedOperation && !pendingNftVaultOperationMatches(storedOperation, operation)) continue;
      const inMemoryOperation = pendingByAssetRef.current[pendingNftVaultOperationAssetKey(operation)];
      if (!storedOperation && !pendingNftVaultOperationMatches(inMemoryOperation, operation)) continue;
      clearPending(operation.assetId, { expectedOperation: operation, isCurrent });
      const operationKey = pendingNftVaultOperationAssetKey(operation);
      setOnChainByAsset((current) => {
        const confirmation = current[operationKey];
        if (!confirmation || confirmation.txHash.toLowerCase() !== operation.txHash.toLowerCase()) return current;
        const next = { ...current };
        delete next[operationKey];
        return next;
      });
      const replacement = reconciliationContext
        ? pendingOperationsForContext(reconciliationContext)
          .find((item) => pendingNftVaultOperationAssetKey(item) === operationKey)
        : null;
      if (!replacement && isCurrent()) {
        setNotice((current) => current && /actualizando/i.test(current)
          ? 'Operación confirmada y reflejada en el inventario.'
          : current);
      }
    }
  }, [clearPending, pendingByAsset, pendingContext, pendingOperationsForContext, status]);

  useEffect(() => {
    if (!pendingHydrated || !pendingContext || !publicClient || !user?.walletAddress) return;
    if (Object.keys(pendingByAsset).length === 0) return;
    let disposed = false;
    let running = false;
    const reconciliationContext = pendingContext;
    const reconciliationKey = pendingKey;
    const isReconciliationCurrent = () => {
      if (disposed || !reconciliationKey) return false;
      const currentContext = pendingContextRef.current;
      if (!currentContext || pendingNftVaultStorageKey(currentContext) !== reconciliationKey) return false;
      return nftTransactionContextMatches(
        {
          wallet: reconciliationContext.walletAddress,
          chainId: reconciliationContext.chainId,
          vault: reconciliationContext.vaultAddress,
        },
        nftTransactionContextFromNullable(writeContextRef.current),
      );
    };
    const currentOperation = (snapshot: NftVaultPendingOperation) => {
      if (!isReconciliationCurrent()) return null;
      const candidate = pendingOperationsForContext(reconciliationContext)
        .find((item) => pendingNftVaultOperationAssetKey(item) === pendingNftVaultOperationAssetKey(snapshot));
      return pendingNftVaultOperationMatches(candidate, snapshot) ? candidate : null;
    };
    const operationAsset = (operation: NftVaultPendingOperation): PendingAsset => ({
      assetId: pendingNftVaultOperationAssetKey(operation),
      collectionAddress: operation.collectionAddress,
      tokenId: operation.tokenId,
      chainId: operation.chainId as 56 | 97,
      ...(operation.depositEpoch ? { depositEpoch: operation.depositEpoch } : {}),
    });
    const markOnChainConfirmation = (operation: NftVaultPendingOperation, depositEpoch?: string) => {
      if (!isReconciliationCurrent()) return;
      const operationKey = pendingNftVaultOperationAssetKey(operation);
      setOnChainByAsset((current) => ({
        ...current,
        [operationKey]: {
          context: reconciliationContext,
          assetId: operationKey,
          collectionAddress: operation.collectionAddress,
          tokenId: operation.tokenId,
          action: operation.action as 'deposit' | 'request_exit' | 'withdraw',
          txHash: operation.txHash,
          ...(depositEpoch ? { depositEpoch } : {}),
          confirmedAt: Date.now(),
        },
      }));
      setNotice('Transacción confirmada en cadena. Actualizando inventario; no repitas la operación.');
    };
    const inspectConfirmedOperation = async (
      snapshot: NftVaultPendingOperation,
      receipt?: { status: string; logs?: unknown; blockNumber?: bigint | number | string },
    ) => {
      let operation = currentOperation(snapshot);
      if (!operation || typeof publicClient.readContract !== 'function') return;
      if (operation.action === 'approval') return;
      let resolvedReceipt = receipt;
      if (!resolvedReceipt) {
        if (typeof publicClient.getTransactionReceipt !== 'function') return;
        resolvedReceipt = await publicClient.getTransactionReceipt({ hash: operation.txHash });
        if (!isReconciliationCurrent()) return;
        operation = currentOperation(operation);
        if (!operation) return;
      }
      if (!operation) return;
      const confirmedOperation = operation;
      if (resolvedReceipt.status === 'reverted') {
        clearPending(confirmedOperation.assetId, { expectedOperation: confirmedOperation, isCurrent: isReconciliationCurrent });
        if (isReconciliationCurrent()) setError(`La transacción del Cukie #${confirmedOperation.tokenId} fue revertida. Puedes intentarlo de nuevo.`);
        return;
      }
      if (resolvedReceipt.status !== 'success') return;
      if (
        confirmedOperation.chainId !== ukiNftVaults.chainId
        || !ukiNftVaults.cukiePoolNftVaultAddress
        || !sameAddress(confirmedOperation.vaultAddress, ukiNftVaults.cukiePoolNftVaultAddress)
        || !sameAddress(confirmedOperation.walletAddress, reconciliationContext.walletAddress)
        || !ukiNftVaults.collectionAddresses.some((collection) => sameAddress(collection, confirmedOperation.collectionAddress))
      ) return;
      const receiptBlock = receiptBlockNumber(resolvedReceipt)
        ?? receiptBlockNumber({ blockNumber: confirmedOperation.receiptBlockNumber });
      if (receiptBlock === null || typeof publicClient.getBlockNumber !== 'function') return;
      let latestBlock: bigint;
      try {
        latestBlock = await publicClient.getBlockNumber();
      } catch {
        return;
      }
      if (latestBlock < receiptBlock) return;
      // Deposit/exit confirmation must resolve the current contract state:
      // a receipt block can still show the position before a later withdrawal.
      // Withdraw confirmation remains receipt-scoped so its epoch cannot be
      // confused with a newer deposit of the same NFT.
      const stateBlock = confirmedOperation.action === 'withdraw'
        ? receiptBlock
        : latestBlock;
      if (confirmedOperation.action === 'deposit') {
        const receiptEpoch = depositedEpochFromReceipt(resolvedReceipt, confirmedOperation);
        const depositEpoch = receiptEpoch ?? confirmedOperation.depositEpoch;
        if (!depositEpoch) return;
        if (receiptEpoch && confirmedOperation.depositEpoch !== depositEpoch) {
          const updated = persistPending({
            asset: operationAsset(confirmedOperation),
            action: confirmedOperation.action,
            phase: confirmedOperation.phase,
            txHash: confirmedOperation.txHash,
            depositEpoch,
            context: {
              wallet: reconciliationContext.walletAddress,
              chainId: reconciliationContext.chainId,
              vault: reconciliationContext.vaultAddress,
            },
            expectedOperation: confirmedOperation,
            isCurrent: isReconciliationCurrent,
          });
          if (!updated) return;
          operation = updated;
        }
        if (!operation.depositEpoch || !isReconciliationCurrent()) return;
        let rawPosition: unknown = null;
        try {
          rawPosition = await publicClient.readContract({
            address: operation.vaultAddress as Address,
            abi: cukiePoolNftVaultAbi,
            functionName: 'positionOf',
            args: [operation.collectionAddress as Address, BigInt(operation.tokenId)],
            blockNumber: stateBlock,
          });
        } catch {
          // A withdrawn/terminal position can make positionOf revert. The
          // collection owner read below is the only fallback that may close
          // this exact receipt-scoped pending deposit.
        }
        if (!isReconciliationCurrent()) return;
        const current = currentOperation(operation);
        if (!current) return;
        if (inspectPoolDepositPosition(current, rawPosition)) {
          markOnChainConfirmation(current, current.depositEpoch);
          return;
        }
        let owner: unknown;
        try {
          owner = await publicClient.readContract({
            address: current.collectionAddress as Address,
            abi: erc721CustodyAbi,
            functionName: 'ownerOf',
            args: [BigInt(current.tokenId)],
            blockNumber: stateBlock,
          });
        } catch {
          return;
        }
        if (!isReconciliationCurrent()) return;
        const latest = currentOperation(current);
        if (!latest || !sameAddress(owner as string, latest.walletAddress)) return;
        clearPending(latest.assetId, {
          expectedOperation: latest,
          isCurrent: isReconciliationCurrent,
        });
        if (isReconciliationCurrent()) {
          setNotice('La lectura actual confirma que el Cukie está en tu wallet; se ha liberado la operación pendiente.');
        }
        return;
      }
      if (operation.action === 'request_exit') {
        const rawPosition = await publicClient.readContract({
          address: operation.vaultAddress as Address,
          abi: cukiePoolNftVaultAbi,
          functionName: 'positionOf',
          args: [operation.collectionAddress as Address, BigInt(operation.tokenId)],
          blockNumber: stateBlock,
        });
        if (!isReconciliationCurrent()) return;
        const current = currentOperation(operation);
        if (current && poolPositionMatchesOperation(current, rawPosition, 'request_exit')) markOnChainConfirmation(current);
        return;
      }
      const withdrawnEpoch = withdrawnEpochFromReceipt(resolvedReceipt, operation);
      if (operation.depositEpoch && withdrawnEpoch !== operation.depositEpoch) return;
      if (operation.action === 'withdraw' && !operation.depositEpoch && !withdrawnEpoch) return;
      const owner = await publicClient.readContract({
        address: operation.collectionAddress as Address,
        abi: erc721CustodyAbi,
        functionName: 'ownerOf',
        args: [BigInt(operation.tokenId)],
        blockNumber: receiptBlock,
      });
      if (!isReconciliationCurrent()) return;
      const current = currentOperation(operation);
      if (current && sameAddress(owner as string, current.walletAddress)) {
        markOnChainConfirmation(current);
        // ownerOf(wallet) is a terminal custody proof even if the indexed
        // projection is still partial. Do not leave a confirmed withdrawal
        // replayable while waiting for an eventually-consistent row.
        if (current.action === 'withdraw') {
          const terminalEpoch = current.depositEpoch ?? withdrawnEpoch;
          if (terminalEpoch) {
            const terminalIdentity = poolPositionIdentityKey({
              chainId: current.chainId,
              collectionAddress: current.collectionAddress,
              tokenId: current.tokenId,
              vaultAddress: current.vaultAddress,
              depositEpoch: terminalEpoch,
            });
            setTerminalWithdrawals((identities) => {
              if (identities.has(terminalIdentity)) return identities;
              return new Set([...identities, terminalIdentity]);
            });
          }
          clearPending(current.assetId, {
            expectedOperation: current,
            isCurrent: isReconciliationCurrent,
          });
          if (isReconciliationCurrent()) {
            setNotice('Retirada confirmada y reflejada en tu wallet.');
          }
        }
      }
    };

    const reconcile = async () => {
      if (running || disposed) return;
      running = true;
      try {
        const operations = Object.values(pendingByAsset);
        const transitioned: NftVaultPendingOperation[] = [];
        for (const snapshot of operations) {
          let operation = currentOperation(snapshot);
          if (!operation) continue;
          try {
            if (operation.phase === 'awaiting_receipt') {
              if (typeof publicClient.getTransactionReceipt !== 'function') continue;
              const receipt = await publicClient.getTransactionReceipt({ hash: operation.txHash });
              if (!isReconciliationCurrent()) return;
              operation = currentOperation(operation);
              if (!operation) continue;
              if (receipt.status === 'reverted') {
                clearPending(operation.assetId, { expectedOperation: operation, isCurrent: isReconciliationCurrent });
                if (isReconciliationCurrent()) setError(`La transacción del Cukie #${operation.tokenId} fue revertida. Puedes intentarlo de nuevo.`);
                continue;
              }
              if (receipt.status !== 'success') continue;
              const transitionedOperation = persistPending({
                asset: operationAsset(operation),
                action: operation.action,
                phase: operation.action === 'approval' ? 'approval_confirmed' : 'syncing_projection',
                txHash: operation.txHash,
                depositEpoch: operation.action === 'deposit'
                  ? depositedEpochFromReceipt(receipt, operation) ?? undefined
                  : undefined,
                ...(receiptBlockNumber(receipt) !== null
                  ? { receiptBlockNumber: receiptBlockNumber(receipt)!.toString() }
                  : {}),
                context: {
                  wallet: reconciliationContext.walletAddress,
                  chainId: reconciliationContext.chainId,
                  vault: reconciliationContext.vaultAddress,
                },
                expectedOperation: operation,
                isCurrent: isReconciliationCurrent,
              });
              if (!transitionedOperation) continue;
              operation = transitionedOperation;
              if (operation.action === 'approval') continue;
              transitioned.push(operation);
              await inspectConfirmedOperation(operation, receipt);
              if (!isReconciliationCurrent()) return;
              continue;
            }
            await inspectConfirmedOperation(
              operation,
              confirmedReceiptByHashRef.current.get(operation.txHash.toLowerCase()),
            );
          } catch {
            // RPC/read failures are inconclusive; keep the lock and retry.
          }
        }
        if (transitioned.length > 0 || operations.some((item) => item.phase === 'syncing_projection')) {
          if (isReconciliationCurrent() && !statusWasFetching) void refreshStatusQuery().catch(() => undefined);
        }
      } finally {
        running = false;
      }
    };

    void reconcile();
    const interval = window.setInterval(() => void reconcile(), 4_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [clearPending, pendingByAsset, pendingContext, pendingHydrated, pendingKey, pendingOperationsForContext, persistPending, publicClient, refreshStatusQuery, statusWasFetching, user?.walletAddress]);

  async function writeAndConfirm(
    input: Parameters<typeof writeContractAsync>[0],
    asset: PendingAsset,
    action: NftVaultPendingAction,
    expectedOperation?: NftVaultPendingOperation,
  ) {
    const currentGuard = operationGuardRef.current;
    if (!publicClient) throw new Error('PUBLIC_CLIENT_UNAVAILABLE');
    if (!address || !ukiNftVaults.chainId || !ukiNftVaults.cukiePoolNftVaultAddress) {
      throw new Error('POOL_OPERATION_CONTEXT_CHANGED');
    }
    const expectedWallet = address;
    const expectedChainId = ukiNftVaults.chainId;
    const expectedVault = ukiNftVaults.cukiePoolNftVaultAddress;
    if (!expectedWallet || !expectedChainId || !expectedVault) {
      throw new Error('POOL_OPERATION_CONTEXT_CHANGED');
    }
    const expectedContext: NftTransactionContext = {
      wallet: expectedWallet,
      chainId: expectedChainId,
      vault: expectedVault,
    };
    let submittedHash: Hash | null = null;
    let submittedOperation: NftVaultPendingOperation | null = null;
    const isCurrentContext = (callbackCurrent: boolean) => (
      callbackCurrent && nftTransactionContextMatches(expectedContext, writeContextRef.current)
    );
    const operationForSubmittedHash = () => {
      if (!submittedHash) return expectedOperation;
      const storageContext: NftVaultPendingContext = {
        chainId: expectedContext.chainId,
        walletAddress: expectedContext.wallet,
        vaultAddress: expectedContext.vault,
      };
      const storageSnapshot = getNftVaultStorageSnapshot(
        getNftVaultBrowserStorage(),
        storageContext,
      );
      const assetKey = canonicalNftVaultAssetId({
        chainId: storageContext.chainId,
        collectionAddress: asset.collectionAddress,
        tokenId: asset.tokenId,
      });
      const operation = pendingOperationsForContext(storageContext)
        .find((candidate) => (
          (!assetKey || pendingNftVaultOperationAssetKey(candidate) === assetKey)
          && candidate.txHash.toLowerCase() === submittedHash?.toLowerCase()
        ));
      if (operation) return operation;
      if (
        !storageSnapshot.readable
        &&
        submittedOperation
        && (!assetKey || pendingNftVaultOperationAssetKey(submittedOperation) === assetKey)
        && submittedOperation.txHash.toLowerCase() === submittedHash.toLowerCase()
        && pendingNftVaultOperationMatchesAsset(submittedOperation, {
          chainId: storageContext.chainId,
          collectionAddress: asset.collectionAddress,
          tokenId: asset.tokenId,
          assetId: assetKey ?? '',
        })
      ) return submittedOperation;
      return undefined;
    };
    return executeNftTransaction({
      request: input as Record<string, unknown>,
      client: publicClient as unknown as NftTransactionClient,
      guard: currentGuard,
      expectedContext,
      currentContext: () => nftTransactionContextFromNullable(writeContextRef.current),
      isReady: () => operationGuardRef.current.ready,
      write: (request) => writeContractAsync(request as Parameters<typeof writeContractAsync>[0]),
      errorPrefix: 'POOL_OPERATION',
      onSubmitted: (hash, isCurrent) => {
        submittedHash = hash;
        if (isCurrentContext(isCurrent)) setLatestTxHash(hash);
        submittedOperation = persistPending({
          asset,
          action,
          phase: 'awaiting_receipt',
          txHash: hash,
          depositEpoch: asset.depositEpoch,
          context: expectedContext,
          expectedOperation,
          updateUi: isCurrentContext(isCurrent),
        });
      },
      onReverted: (isCurrent) => {
        const operation = operationForSubmittedHash();
        if (!operation) return;
        clearPending(asset.assetId, {
          context: expectedContext,
          expectedOperation: operation,
          updateUi: isCurrentContext(isCurrent),
        });
      },
      onReplaced: (replacement, isCurrent) => {
        if (replacement.reason !== 'repriced') return;
        const originalOperation = operationForSubmittedHash();
        if (!originalOperation) return;
        submittedHash = replacement.replacementHash;
        if (isCurrentContext(isCurrent)) setLatestTxHash(replacement.replacementHash);
        submittedOperation = persistPending({
          asset,
          action,
          phase: 'awaiting_receipt',
          txHash: replacement.replacementHash,
          depositEpoch: asset.depositEpoch,
          ...(receiptBlockNumber(replacement.receipt) !== null
            ? { receiptBlockNumber: receiptBlockNumber(replacement.receipt)!.toString() }
            : {}),
          context: expectedContext,
          expectedOperation: originalOperation,
          updateUi: isCurrentContext(isCurrent),
        });
      },
      onConfirmed: (hash, isCurrent, receipt) => {
        confirmedReceiptByHashRef.current.set(hash.toLowerCase(), receipt);
        const operation = operationForSubmittedHash();
        if (!operation) return;
        submittedOperation = persistPending({
          asset,
          action,
          phase: action === 'approval' ? 'approval_confirmed' : 'syncing_projection',
          txHash: hash,
          depositEpoch: asset.depositEpoch,
          ...(receiptBlockNumber(receipt) !== null
            ? { receiptBlockNumber: receiptBlockNumber(receipt)!.toString() }
            : {}),
          context: expectedContext,
          expectedOperation: operation,
          updateUi: isCurrentContext(isCurrent),
        });
      },
    });
  }

  function canonicalIdentity(asset: Pick<AvailableAsset, 'assetId' | 'chainId' | 'collectionAddress' | 'tokenId'>) {
    const collection = asset.collectionAddress.toLowerCase();
    const expectedAssetId = `${asset.chainId}:${collection}:${asset.tokenId}`;
    if (
      asset.chainId !== ukiNftVaults.chainId
      || !isAddress(asset.collectionAddress)
      || !/^\d+$/.test(asset.tokenId)
      || asset.assetId !== expectedAssetId
      || !ukiNftVaults.collectionAddresses.some((item) => sameAddress(item, collection))
    ) return null;
    return {
      collection: asset.collectionAddress as Address,
      tokenId: BigInt(asset.tokenId),
    };
  }

  async function deposit(asset: AvailableAsset) {
    const identity = canonicalIdentity(asset);
    const vaultAddress = ukiNftVaults.cukiePoolNftVaultAddress;
    const assetKey = pendingNftVaultOperationAssetKey(asset);
    const existingPending = pendingOperationForAsset(asset);
    if (
      !user?.walletAddress
      || !address
      || !depositsReady
      || mutatingAssetId
      || walletOperationLockRef.current
      || operationLocksRef.current.has(assetKey)
      || (existingPending && existingPending.phase !== 'approval_confirmed')
      || !pendingHydrated
      || !identity
      || !vaultAddress
      || !ukiNftVaults.chainId
      || !publicClient
    ) {
      setError(poolGuardLabel({
        identityReady,
        depositsReady,
        pendingHydrated,
        pending: existingPending,
        correctChain,
        walletMatches,
        canonical: Boolean(identity),
        busy: Boolean(mutatingAssetId || walletOperationLockRef.current || operationLocksRef.current.has(assetKey)),
      }));
      return;
    }
    walletOperationLockRef.current = true;
    operationLocksRef.current.add(assetKey);
    setMutatingAssetId(assetKey);
    setError(null);
    setNotice(null);
    setLatestTxHash(null);
    const operationContext: NftTransactionContext = {
      wallet: address,
      chainId: ukiNftVaults.chainId,
      vault: vaultAddress,
    };
    const identityMatches = () => nftTransactionContextMatches(operationContext, writeContextRef.current);
    const operationReady = () => operationGuardRef.current.ready && identityMatches();
    try {
      const [owner, approved, operatorApproved] = await Promise.all([
        publicClient.readContract({
          address: identity.collection,
          abi: erc721CustodyAbi,
          functionName: 'ownerOf',
          args: [identity.tokenId],
        }),
        publicClient.readContract({
          address: identity.collection,
          abi: erc721CustodyAbi,
          functionName: 'getApproved',
          args: [identity.tokenId],
        }),
        publicClient.readContract({
          address: identity.collection,
          abi: erc721CustodyAbi,
          functionName: 'isApprovedForAll',
          args: [address, vaultAddress],
        }),
      ]);
      if (!sameAddress(owner, address)) throw new Error('WALLET_IS_NOT_OWNER');
      if (!sameAddress(approved, vaultAddress) && operatorApproved !== true) {
        setPhase('approving');
        await writeAndConfirm({
          chainId: ukiNftVaults.chainId,
          address: identity.collection,
          abi: erc721CustodyAbi,
          functionName: 'approve',
          args: [vaultAddress, identity.tokenId],
          }, asset, 'approval', existingPending);
      }
      if (!operationReady()) throw new Error('POOL_OPERATION_CONTEXT_CHANGED');
      setPhase('depositing');
      await writeAndConfirm({
        chainId: ukiNftVaults.chainId,
        address: vaultAddress,
        abi: cukiePoolNftVaultAbi,
        functionName: 'deposit',
        args: [identity.collection, identity.tokenId],
      }, asset, 'deposit', pendingContext
        ? pendingOperationsForContext(pendingContext)
          .find((item) => pendingNftVaultOperationAssetKey(item) === assetKey)
        : existingPending);
      if (!operationReady()) throw new Error('POOL_OPERATION_CONTEXT_CHANGED_AFTER_RECEIPT');
      const terminalPrefix = `${poolPositionIdentityPrefix({
        chainId: asset.chainId,
        collectionAddress: asset.collectionAddress,
        tokenId: asset.tokenId,
        vaultAddress,
      })}:`;
      setTerminalWithdrawals((identities) => {
        const next = new Set([...identities].filter((identity) => !identity.startsWith(terminalPrefix)));
        return next.size === identities.size ? identities : next;
      });
      setPhase('idle');
      setMutatingAssetId(null);
      setNotice('Depósito confirmado en BSC. Este Cukie seguirá bloqueado mientras actualizamos el inventario; ya puedes operar con otro.');
      void runtime.refreshAfterTransaction('pool').catch(() => undefined);
    } catch (reason) {
      if (!identityMatches()) return;
      const persisted = pendingContext
        ? pendingOperationsForContext(pendingContext)
          .find((item) => pendingNftVaultOperationAssetKey(item) === assetKey)
        : null;
      if (persisted) {
        setNotice(persisted.phase === 'approval_confirmed'
          ? 'La aprobación quedó confirmada. Pulsa «Continuar depósito» cuando quieras reanudar.'
          : 'La operación ya tiene transacción. Seguiremos comprobándola automáticamente; no la repitas.');
      } else {
        setError(poolTransactionError(reason));
        if (reason instanceof Error && reason.message.includes('WALLET_IS_NOT_OWNER')) {
          void refreshStatusQuery();
        }
      }
    } finally {
      if (identityMatches()) {
        setPhase('idle');
        setMutatingAssetId(null);
      }
      operationLocksRef.current.delete(assetKey);
      walletOperationLockRef.current = false;
    }
  }

  async function mutatePosition(
    position: CustodialPosition,
    operation: 'request_exit' | 'withdraw',
  ) {
    const identity = canonicalIdentity(position);
    const vaultAddress = ukiNftVaults.cukiePoolNftVaultAddress;
    const assetKey = pendingNftVaultOperationAssetKey(position);
    const existingPending = pendingOperationForAsset(position);
    if (
      !user?.walletAddress
      || !address
      || !identityReady
      || mutatingAssetId
      || walletOperationLockRef.current
      || operationLocksRef.current.has(assetKey)
      || Boolean(existingPending)
      || !pendingHydrated
      || !identity
      || !vaultAddress
      || !ukiNftVaults.chainId
    ) {
      setError(poolGuardLabel({
        identityReady,
        depositsReady: true,
        pendingHydrated,
        pending: existingPending,
        correctChain,
        walletMatches,
        canonical: Boolean(identity),
        busy: Boolean(mutatingAssetId || walletOperationLockRef.current || operationLocksRef.current.has(assetKey)),
      }));
      return;
    }
    walletOperationLockRef.current = true;
    operationLocksRef.current.add(assetKey);
    setExitConfirmationId(null);
    setMutatingAssetId(assetKey);
    setError(null);
    setNotice(null);
    setLatestTxHash(null);
    const operationContext: NftTransactionContext = {
      wallet: address,
      chainId: ukiNftVaults.chainId,
      vault: vaultAddress,
    };
    const identityMatches = () => nftTransactionContextMatches(operationContext, writeContextRef.current);
    const operationReady = () => operationGuardRef.current.ready && identityMatches();
    try {
      setPhase(operation === 'request_exit' ? 'requesting_exit' : 'withdrawing');
      await writeAndConfirm({
        chainId: ukiNftVaults.chainId,
        address: vaultAddress,
        abi: cukiePoolNftVaultAbi,
        functionName: operation === 'request_exit' ? 'requestExit' : 'withdraw',
        args: [identity.collection, identity.tokenId],
      }, { ...position, depositEpoch: position.depositEpoch }, operation, existingPending);
      if (!operationReady()) throw new Error('POOL_OPERATION_CONTEXT_CHANGED_AFTER_RECEIPT');
      setPhase('idle');
      setMutatingAssetId(null);
      setNotice(operation === 'request_exit'
        ? 'Salida confirmada en BSC. Este Cukie ya no participa en el reparto y seguirá bloqueado mientras actualizamos su estado.'
        : 'Retirada confirmada en BSC. Estamos actualizando el inventario; ya puedes operar con otro Cukie.');
      void runtime.refreshAfterTransaction('pool').catch(() => undefined);
    } catch (reason) {
      if (!identityMatches()) return;
      const persisted = pendingContext
        ? pendingOperationsForContext(pendingContext)
          .find((item) => pendingNftVaultOperationAssetKey(item) === assetKey)
        : null;
      if (persisted) {
        setNotice('La operación ya tiene transacción. Seguiremos comprobándola automáticamente; no la repitas.');
      } else {
        setError(poolTransactionError(reason));
      }
    } finally {
      if (identityMatches()) {
        setPhase('idle');
        setMutatingAssetId(null);
      }
      operationLocksRef.current.delete(assetKey);
      walletOperationLockRef.current = false;
    }
  }

  const custodialStatus = status?.mode === 'custodial_vault' ? status : null;
  const openPositions = useMemo(
    () => custodialStatus ? mergePoolPositions(custodialStatus) : [],
    [custodialStatus],
  );
  const confirmedWithdrawalCount = openPositions.filter((item) => {
    const pending = pendingOperationForAsset(item);
    return pending?.action === 'withdraw' && pending.phase === 'syncing_projection';
  }).length;
  const poolPositionCount = openPositions.length - confirmedWithdrawalCount;
  const activeCount = openPositions.filter((item) => item.status === 'active' && item.ownerRewardEligible).length;
  const activatingCount = openPositions.filter((item) => item.status === 'pending').length;
  const leavingCount = openPositions.filter((item) => item.status === 'exit_requested').length;
  const withdrawableCount = openPositions.filter((item) => (
    item.status === 'withdrawable'
    && !(
      pendingOperationForAsset(item)?.action === 'withdraw'
      && pendingOperationForAsset(item)?.phase === 'syncing_projection'
    )
  )).length;
  const poolUnknownAssetIds = new Set(
    custodialStatus?.availability?.status === 'partial'
      ? custodialStatus.availability.unknownAssetIds ?? []
      : [],
  );
  const poolUnknownCount = custodialStatus?.availability?.status === 'partial'
    ? custodialStatus.availability.unknownAssets
    : 0;
  const unknownVisiblePoolCount = openPositions.filter((item) => poolUnknownAssetIds.has(item.assetId)).length;
  const poolConfirmedCount = Math.max(0, poolPositionCount - unknownVisiblePoolCount);
  const poolSummaryCount = poolUnknownCount > 0
    ? `${poolConfirmedCount} confirmados · ${poolUnknownCount} por comprobar`
    : `${poolPositionCount} en total`;
  const availableOriginalCount = custodialStatus?.availableAssets.filter((item) => item.generation === 'original').length ?? 0;
  const availableSecondGenerationCount = (custodialStatus?.availableAssets.length ?? 0) - availableOriginalCount;

  useEffect(() => {
    const { tokenId: requestedTokenId } = requestedIdentity;
    if (
      !requestedTokenId
      || !custodialStatus
      || requestedIdentity.chainIdInvalid
      || requestedIdentity.collectionInvalid
      || requestedIdentity.vaultInvalid
    ) return;
    if (!/^\d+$/.test(requestedTokenId)) return;
    const matchesIdentity = (item: { chainId: number; collectionAddress: string; vaultAddress?: string }) => (
      item.chainId === (requestedIdentity.chainId ?? item.chainId)
      && (!requestedIdentity.collection || sameAddress(item.collectionAddress, requestedIdentity.collection))
      && (!requestedIdentity.vault || sameAddress(item.vaultAddress, requestedIdentity.vault))
    );
    const availableMatches = custodialStatus.availableAssets.filter((asset) => (
      asset.tokenId === requestedTokenId && matchesIdentity(asset)
    ));
    const poolMatches = openPositions.filter((position) => (
      position.tokenId === requestedTokenId && matchesIdentity(position)
    ));
    const matches = [...availableMatches, ...poolMatches];
    if (matches.length === 0) {
      setActiveTab('pool');
      setVisitedTabs((current) => current.has('pool') ? current : new Set([...current, 'pool']));
      return;
    }
    if (matches.length > 1) return;
    const [match] = matches;
    const available = availableMatches.length === 1;
    const tab: PoolTab = available ? 'available' : 'pool';
    const target = requestedIdentity.chainId || requestedIdentity.collection || requestedIdentity.vault
      ? available
      ? poolAvailableTarget(match as AvailableAsset)
        : poolPositionTarget(match as CustodialPosition)
      : available
        ? `pool-available-${requestedTokenId}`
        : `pool-cukie-${requestedTokenId}`;
    setActiveTab(tab);
    setVisitedTabs((current) => current.has(tab) ? current : new Set([...current, tab]));
    validatedHashTargetRef.current = target;
    setHashTarget(target);
  }, [custodialStatus, openPositions, requestedIdentity]);

  return (
    <section id="mi-cukie-pool" className="relative z-[2] w-full pb-10 pt-7">
      <JourneyStep number="01" label="Comprueba tu posición" />
      <Panel className="mt-4" innerClassName="p-4 sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="uki-label">Tu estado personal</p>
            <h2 className="mt-2 font-headline text-2xl font-black text-[var(--uki-cream)]">
              Tu pool de un vistazo
            </h2>
          </div>
          {status ? (
            <button
              type="button"
              onClick={refreshStatus}
              className="text-xs font-black uppercase text-[var(--uki-lilac)]"
            >
              Actualizar estado
            </button>
          ) : null}
        </div>

        {authLoading || loadState === 'loading' ? (
          <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-[var(--uki-text)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--uki-lilac)]" />
            Comprobando tu cuenta y tus Cukies…
          </p>
        ) : null}

        {!authLoading && loadState === 'idle' ? (
          <p className="mt-6 text-sm font-semibold text-[var(--uki-text)]">
            Conecta tu wallet para ver qué Cukies puedes aportar y cuáles están ya en el pool.
          </p>
        ) : null}

        {loadState === 'unavailable' ? (
          <div className="mt-6 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
            <p className="text-sm font-semibold text-[var(--uki-text)]">
              No podemos actualizar tus Cukies ahora. No se habilitarán operaciones hasta que la información esté completa.
            </p>
          </div>
        ) : null}

        {loadState === 'ready' && status?.mode === 'legacy_mongo' ? (
          <div className="mt-6 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
            <p className="text-sm font-semibold text-[var(--uki-text)]">
              El Pool de Cukies no está disponible ahora. Tus Cukies no se moverán hasta que puedas completar la operación con seguridad.
            </p>
          </div>
        ) : null}

        {loadState === 'ready' && status?.mode === 'custodial_vault' ? (
          <div className="mt-6 space-y-5">
            {!configMatches ? (
              <p role="alert" className="text-sm font-semibold text-amber-300">
                El Pool de Cukies no está disponible ahora. Las operaciones permanecen bloqueadas por seguridad.
              </p>
            ) : null}
            {status.nftCustody.indexer.status !== 'ready' ? (
              <p role="alert" className="text-sm font-semibold text-amber-300">
                Estamos actualizando tus Cukies. Los depósitos están bloqueados; aún puedes solicitar la salida o retirar una posición conocida.
              </p>
            ) : null}
            {status.availability?.status === 'partial' && status.availability.unknownAssets > 0 ? (
              <p role="status" className="text-sm font-semibold text-amber-200">
                No hemos podido comprobar {status.availability.unknownAssets === 1 ? 'un Cukie' : `${status.availability.unknownAssets} Cukies`} ahora. Mostramos el resto del inventario; ese estado seguirá bloqueado hasta que la lectura de la red sea concluyente.
              </p>
            ) : null}
            {!walletMatches ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-3">
                <p role="alert" className="text-sm font-semibold text-amber-300">
                  Conecta la misma wallet con la que has iniciado sesión.
                </p>
                <button
                  type="button"
                  onClick={preparePoolWallet}
                  disabled={evmWallet.isConnecting}
                  className="inline-flex min-h-10 items-center gap-2 rounded-[8px] bg-[var(--uki-lilac)] px-3 text-xs font-black uppercase text-black disabled:opacity-50"
                >
                  {evmWallet.isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
                  Conectar wallet
                </button>
              </div>
            ) : null}
            {walletMatches && !correctChain ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-3">
                <p role="alert" className="text-sm font-semibold text-amber-300">
                  Cambia tu wallet a la red correcta para continuar.
                </p>
                <button
                  type="button"
                  onClick={preparePoolWallet}
                  disabled={evmWallet.isConnecting}
                  className="inline-flex min-h-10 items-center gap-2 rounded-[8px] bg-[var(--uki-lilac)] px-3 text-xs font-black uppercase text-black disabled:opacity-50"
                >
                  {evmWallet.isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
                  Cambiar red
                </button>
              </div>
            ) : null}
            {error ? <p role="alert" className="text-sm font-semibold text-amber-300">{error}</p> : null}
            {notice ? (
              <p role="status" className="text-sm font-semibold text-[var(--uki-lilac)]">
                {notice}
                {latestTxHash && status.nftCustody.vaultAddress && ukiNftVaults.explorerBaseUrl ? (
                  <> {' '}<a
                    href={`${ukiNftVaults.explorerBaseUrl}/tx/${latestTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >Ver transacción</a></>
                ) : null}
              </p>
            ) : null}

            <div className="grid min-w-0 gap-px overflow-hidden rounded-[12px] border border-white/10 bg-white/10 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
              <section className="min-w-0 bg-[#120a1c] p-4 sm:p-6">
                <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] text-[var(--uki-lilac)]">
                    <Gamepad2 className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">
                      En el pool · {poolSummaryCount}
                    </p>
                    <h3 className="mt-2 min-w-0 text-balance font-headline text-xl font-black leading-tight text-[var(--uki-cream)] sm:text-3xl">
                      {activeCount === 0
                        ? 'Ningún Cukie puede entrar en partidas ahora'
                        : `${activeCount} ${activeCount === 1 ? 'Cukie está disponible' : 'Cukies están disponibles'} para partidas`}
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                      {activeCount === 0
                        ? 'Revisa si están activándose, saliendo o listos para volver a tu wallet.'
                        : 'Pueden ser elegidos para jugar y optan al reparto de su generación cuando se utilizan en partidas válidas.'}
                    </p>
                  </div>
                </div>
              </section>

              <section className="min-w-0 bg-[#0d0914] p-4 sm:p-6">
                <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-[var(--uki-lilac)]">
                    <WalletCards className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">En tu wallet</p>
                    <h3 className="mt-2 min-w-0 font-headline text-xl font-black leading-tight text-[var(--uki-cream)] sm:text-3xl">
                      {status.availableAssets.length} {status.availableAssets.length === 1 ? 'Cukie para aportar' : 'Cukies para aportar'}
                    </h3>
                    <p className="mt-2 text-sm font-semibold text-[var(--uki-muted)]">
                      {availableOriginalCount} {availableOriginalCount === 1 ? 'Original' : 'Originales'} · {availableSecondGenerationCount} de Segunda Generación
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <Tabs value={activeTab} onValueChange={(value) => selectTab(value as PoolTab)} className="mt-6 min-w-0">
              <TabsList aria-label="Secciones del Cukie Pool" className="grid h-auto w-full min-w-0 grid-cols-2 gap-1 rounded-[10px] border border-white/10 bg-black/20 p-1">
                <TabsTrigger
                  value="pool"
                  className="min-h-11 min-w-0 rounded-[8px] px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)] focus-visible:ring-[var(--uki-lilac)] data-[state=active]:bg-[var(--uki-lilac-soft)] data-[state=active]:text-[var(--uki-cream)] sm:text-sm"
                >
                  En el pool
                </TabsTrigger>
                <TabsTrigger
                  value="available"
                  className="min-h-11 min-w-0 rounded-[8px] px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)] focus-visible:ring-[var(--uki-lilac)] data-[state=active]:bg-[var(--uki-lilac-soft)] data-[state=active]:text-[var(--uki-cream)] sm:text-sm"
                >
                  Aportar Cukies
                </TabsTrigger>
              </TabsList>

              <TabsContent value="available" forceMount hidden={activeTab !== 'available'} className="min-w-0 data-[state=inactive]:hidden">
                {navigationReady && visitedTabs.has('available') ? (
            <div id="cukies-disponibles" className="scroll-mt-24 border-t border-white/10 pt-6">
              <JourneyStep number="02" label="Elige qué Cukies quieres aportar" />
              <div className="flex items-center justify-between gap-3">
                <div className="mt-4">
                  <h3 className="font-headline text-xl font-black text-[var(--uki-cream)]">
                    Cukies listos para aportar
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                    Al añadir uno, sale de tu wallet y queda protegido en el pool hasta que completes su salida.
                  </p>
                </div>
                <span className="shrink-0 text-xs font-bold text-[var(--uki-muted)]">
                  {status.availableAssets.length} disponibles
                </span>
              </div>
              {status.availableAssets.length === 0 ? (
                <p className="mt-4 text-sm font-semibold text-[var(--uki-muted)]">
                  {status.nftCustody.indexer.status === 'ready'
                    ? 'Ahora mismo no tienes Cukies que puedan añadirse al pool.'
                    : 'Mostraremos tu inventario cuando termine la actualización.'}
                </p>
              ) : (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {status.availableAssets.map((asset) => {
                    const working = mutatingAssetId === asset.assetId;
                    const pending = pendingOperationForAsset(asset);
                    const onChainConfirmation = onChainConfirmationForAsset(asset);
                    const pendingLocked = Boolean(pending && pending.phase !== 'approval_confirmed');
                    const gamesPerDay = dailyGamesCapacity(asset.generation, asset.rarity);
                    const guardMessage = poolGuardLabel({
                      identityReady,
                      depositsReady,
                      pendingHydrated,
                      pending,
                      correctChain,
                      walletMatches,
                      canonical: Boolean(canonicalIdentity(asset)),
                      busy: Boolean(mutatingAssetId && mutatingAssetId !== asset.assetId),
                    });
                    return (
                    <article
                      id={status.availableAssets.filter((candidate) => candidate.tokenId === asset.tokenId).length === 1
                        ? `pool-available-${asset.tokenId}`
                        : undefined}
                      data-pool-target={poolAvailableTarget(asset)}
                      key={asset.assetId}
                      className="min-w-0 scroll-mt-24 overflow-hidden rounded-[12px] border border-white/10 bg-[#0d0914] transition-transform duration-200 active:scale-[0.99] sm:grid sm:grid-cols-[11rem_minmax(0,1fr)]"
                    >
                      <div className="relative aspect-[4/3] min-w-0 overflow-hidden border-b border-white/10 bg-[#160d21] sm:aspect-auto sm:min-h-[13.5rem] sm:border-b-0 sm:border-r">
                        <CukiImage
                          src={asset.imageUrl}
                          alt={`Cukie #${asset.tokenId}`}
                          sizes="(min-width: 1024px) 176px, (min-width: 640px) 35vw, 92vw"
                          className="object-contain p-3"
                        />
                        <span className="absolute left-3 top-3 rounded-full border border-[var(--uki-lilac-border)] bg-[#160a22]/95 px-2.5 py-1 text-[11px] font-black text-[var(--uki-lilac)]">
                          {generationLabel(asset.generation)}
                        </span>
                      </div>

                      <div className="flex min-w-0 flex-col p-4">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="truncate font-headline text-lg font-black text-[var(--uki-cream)]">Cukie #{asset.tokenId}</h4>
                            <p className="mt-1 text-xs font-bold text-[var(--uki-muted)]">Rareza {rarityLabel(asset.rarity)}</p>
                          </div>
                          <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-black text-[var(--uki-text)]">
                            {gamesPerDay} {gamesPerDay === 1 ? 'partida' : 'partidas'}/día
                          </span>
                        </div>

                        <p className="mt-3 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                          Al aportarlo quedará protegido y empezará a estar disponible para partidas en el siguiente periodo.
                        </p>

                        <button
                          type="button"
                          disabled={Boolean(mutatingAssetId) || pendingLocked || !pendingHydrated || !depositsReady}
                          onClick={() => void deposit(asset)}
                          className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--uki-lilac)] px-4 py-2 text-xs font-black uppercase text-black transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {working || pendingLocked ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                          {working && phase === 'approving'
                            ? 'Aprobando'
                            : working && phase === 'depositing'
                              ? 'Añadiendo'
                              : pending
                                ? pendingLabel(pending, Boolean(onChainConfirmation))
                                : 'Aportar este Cukie'}
                        </button>
                        {guardMessage && !working && !pendingLocked ? (
                          <p className="mt-2 text-center text-[11px] font-semibold leading-relaxed text-amber-200">{guardMessage}</p>
                        ) : null}
                        {pending?.txHash && ukiNftVaults.explorerBaseUrl ? (
                          <a
                            href={`${ukiNftVaults.explorerBaseUrl}/tx/${pending.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block text-center text-xs font-black text-[var(--uki-lilac)] underline"
                          >
                            Ver transacción
                          </a>
                        ) : null}
                      </div>
                    </article>
                    );
                  })}
                </div>
              )}
            </div>

                ) : null}
              </TabsContent>

              <TabsContent value="pool" forceMount hidden={activeTab !== 'pool'} className="min-w-0 data-[state=inactive]:hidden">
                {navigationReady && visitedTabs.has('pool') ? (
            <div id="mis-cukies-aportados" className="scroll-mt-24 border-t border-white/10 pt-6">
              <JourneyStep number="03" label="Gestiona los Cukies que ya aportaste" />
              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-headline text-xl font-black text-[var(--uki-cream)]">
                    Tus Cukies en el pool
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                    Cada estado te indica si el Cukie puede entrar en partidas y cuándo puedes retirarlo.
                  </p>
                </div>
                <span className="shrink-0 text-xs font-bold text-[var(--uki-muted)]">
                  {poolUnknownCount > 0
                    ? `${poolConfirmedCount} confirmados · ${poolUnknownCount} por comprobar`
                    : `${poolPositionCount} en el pool${confirmedWithdrawalCount > 0 ? ` · ${confirmedWithdrawalCount} actualizando colección` : ''}`}
                </span>
              </div>
              {openPositions.length === 0 ? (
                <p className="mt-4 text-sm font-semibold text-[var(--uki-muted)]">Todavía no has aportado ningún Cukie al pool.</p>
              ) : (
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {openPositions.map((position) => {
                    const working = mutatingAssetId === position.assetId;
                    const pending = pendingOperationForAsset(position);
                    const onChainConfirmation = onChainConfirmationForAsset(position);
                    const withdrawalConfirmed = pending?.action === 'withdraw'
                      && pending.phase === 'syncing_projection';
                    const confirmingExit = exitConfirmationId === position.positionId;
                    return (
                    <article
                      id={openPositions.filter((candidate) => candidate.tokenId === position.tokenId).length === 1
                        ? `pool-cukie-${position.tokenId}`
                        : undefined}
                      data-pool-target={poolPositionTarget(position)}
                      key={position.positionId}
                      className="min-w-0 scroll-mt-24 overflow-hidden rounded-[12px] border border-white/10 bg-[#0d0914]"
                    >
                      <div className="grid min-w-0 sm:grid-cols-[10.5rem_minmax(0,1fr)]">
                        <div className="relative aspect-[4/3] min-w-0 overflow-hidden border-b border-white/10 bg-[#160d21] sm:aspect-auto sm:min-h-[15.5rem] sm:border-b-0 sm:border-r">
                          <CukiImage
                            src={position.imageUrl}
                            alt={`Cukie #${position.tokenId}`}
                            sizes="(min-width: 1280px) 168px, (min-width: 640px) 30vw, 92vw"
                            className="object-contain p-3"
                          />
                          <span className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${positionStatusClass(position.status)}`}>
                            {withdrawalConfirmed ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                            {!withdrawalConfirmed && position.status === 'active' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                            {!withdrawalConfirmed && (position.status === 'pending' || position.status === 'recovery' || position.status === 'exit_requested') ? <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                            {!withdrawalConfirmed && position.status === 'withdrawable' ? <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                            {withdrawalConfirmed ? 'Retirada confirmada' : statusLabel(position.status)}
                          </span>
                        </div>

                        <div className="min-w-0 p-4 sm:p-5">
                          <h4 className="truncate font-headline text-lg font-black text-[var(--uki-cream)]">Cukie #{position.tokenId}</h4>
                          <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">
                            {position.generation && position.rarity
                              ? `${generationLabel(position.generation)} · ${rarityLabel(position.rarity)}`
                              : 'NFT de tu colección'}
                          </p>
                          {withdrawalConfirmed ? null : <PositionSchedule position={position} />}
                        </div>
                      </div>

                      <div className="min-w-0 border-t border-white/10 bg-white/[0.025] p-4 sm:p-5">
                        {withdrawalConfirmed ? (
                          <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                            Retirada confirmada en BSC. Estamos actualizando tu colección; no tienes que volver a firmar.
                          </p>
                        ) : position.custody === 'cukie_pool_recovery' ? (
                          <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                            Este Cukie sigue protegido y no está disponible para partidas. Abre su estado para gestionar la retirada.
                          </p>
                        ) : position.status === 'active' && position.ownerRewardEligible ? (
                          <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                            Está disponible para partidas. Si se utiliza en una partida válida, optará al reparto de su generación.
                          </p>
                        ) : position.status === 'pending' ? (
                          <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                            Está protegido, pero todavía no puede entrar en partidas. Se activará automáticamente.
                          </p>
                        ) : position.status === 'exit_requested' ? (
                          <p className="text-sm font-semibold leading-relaxed text-amber-200">
                            La devolución ya está solicitada. No tienes que hacer nada hasta la fecha indicada.
                          </p>
                        ) : (
                          <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                            La espera terminó. Retira este Cukie para que vuelva a tu wallet.
                          </p>
                        )}

                        {position.custody === 'cukie_pool_recovery' ? (
                          <Link
                            href={recoveryHref(position)}
                            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--uki-lilac)] px-4 py-2 text-xs font-black uppercase text-black transition-transform active:scale-[0.98]"
                          >
                            <Unlock className="h-3.5 w-3.5" />
                            {position.status === 'withdrawable'
                              ? 'Retirar del Cukie Pool'
                              : position.status === 'exit_requested'
                                ? 'Ver salida del Cukie Pool'
                                : 'Solicitar salida del Cukie Pool'}
                          </Link>
                        ) : position.lifecycleOpen && (position.status === 'pending' || position.status === 'active') ? (
                          confirmingExit ? (
                            <div className="mt-4 rounded-[8px] border border-amber-300/25 bg-amber-300/[0.06] p-3">
                              <p className="text-sm font-semibold leading-relaxed text-amber-100">
                                La devolución no se puede cancelar. Al confirmarla, este Cukie dejará de optar al reparto del periodo actual.
                              </p>
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setExitConfirmationId(null)}
                                  className="min-h-11 rounded-[7px] border border-white/15 px-3 text-xs font-black text-[var(--uki-text)] transition-transform active:scale-[0.98]"
                                >
                                  Mantener en el pool
                                </button>
                                <button
                                  type="button"
                                  disabled={Boolean(mutatingAssetId) || Boolean(pending) || !pendingHydrated || !identityReady}
                                  onClick={() => void mutatePosition(position, 'request_exit')}
                                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[7px] border border-amber-300/40 bg-amber-300/10 px-3 text-xs font-black text-amber-100 transition-transform active:scale-[0.98] disabled:opacity-50"
                                >
                                  {working || pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                                  {pending ? pendingLabel(pending, Boolean(onChainConfirmation)) : working ? 'Confirmando salida' : 'Confirmar salida'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={Boolean(mutatingAssetId) || Boolean(pending) || !pendingHydrated || !identityReady}
                              onClick={() => setExitConfirmationId(position.positionId)}
                              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-white/15 px-4 text-xs font-black text-[var(--uki-text)] transition-colors hover:border-[var(--uki-lilac-border)] hover:text-[var(--uki-lilac)] active:scale-[0.99] disabled:opacity-50"
                            >
                              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                              {pending ? pendingLabel(pending, Boolean(onChainConfirmation)) : position.status === 'pending' ? 'Cancelar aportación al Cukie Pool' : 'Solicitar devolución del Cukie Pool'}
                            </button>
                          )
                        ) : position.lifecycleOpen && position.status === 'withdrawable' ? (
                          <button
                            type="button"
                            disabled={Boolean(mutatingAssetId) || Boolean(pending) || !pendingHydrated || !identityReady}
                            onClick={() => void mutatePosition(position, 'withdraw')}
                            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--uki-lilac)] px-4 text-xs font-black uppercase text-black transition-transform active:scale-[0.98] disabled:opacity-50"
                          >
                            {working || pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                            {pending ? pendingLabel(pending, Boolean(onChainConfirmation)) : working ? 'Confirmando retirada' : 'Retirar a mi wallet desde el Cukie Pool'}
                          </button>
                        ) : null}
                        {pending?.txHash && ukiNftVaults.explorerBaseUrl ? (
                          <a
                            href={`${ukiNftVaults.explorerBaseUrl}/tx/${pending.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 block text-center text-xs font-black text-[var(--uki-lilac)] underline"
                          >
                            Ver transacción
                          </a>
                        ) : null}
                      </div>
                    </article>
                    );
                  })}
                </div>
              )}
            </div>

                ) : null}
              </TabsContent>
            </Tabs>

            <p className="text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
              Este resumen muestra los Cukies que puedes gestionar desde el pool, incluidos los que
              están en proceso de recuperación, y los que puedes aportar desde tu wallet. Los
              depositados en Cukie Master aparecen en <Link href="/cukies" className="font-black text-[var(--uki-lilac)] underline decoration-[var(--uki-lilac)]/45 underline-offset-4">Mis Cukies</Link>.
            </p>

            <PoolMovements
              activating={activatingCount}
              leaving={leavingCount}
              withdrawable={withdrawableCount}
              confirmedWithdrawals={confirmedWithdrawalCount}
            />

            <section className="rounded-[10px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] p-4 sm:p-5">
              <p className="text-xs font-black text-[var(--uki-lilac)]">Tu siguiente paso</p>
              {withdrawableCount > 0 ? (
                <NextAction
                  title={`${withdrawableCount === 1 ? 'Tienes un Cukie listo' : `Tienes ${withdrawableCount} Cukies listos`} para volver a tu wallet`}
                  description="La espera ya terminó. Retíralo desde la sección de Cukies aportados."
                  href="#mis-cukies-aportados"
                  label="Ir a retirar"
                />
              ) : confirmedWithdrawalCount > 0 ? (
                <NextAction
                  title={`${confirmedWithdrawalCount === 1 ? 'Retirada confirmada' : 'Retiradas confirmadas'}, actualizando colección`}
                  description="La transacción ya está confirmada en BSC. Estamos actualizando tu colección; no tienes que volver a firmar."
                  href="#mis-cukies-aportados"
                  label="Ver estado"
                />
              ) : leavingCount > 0 ? (
                <NextAction
                  title="Tu salida está programada"
                  description="No tienes que repetir la operación. En cada Cukie verás la fecha exacta desde la que podrás retirarlo."
                  href="#mis-cukies-aportados"
                  label="Ver la salida"
                />
              ) : activatingCount > 0 ? (
                <NextAction
                  title="Tienes Cukies preparándose para entrar"
                  description="No necesitas hacer nada. Empezarán a estar disponibles para partidas en la fecha indicada."
                  href="#mis-cukies-aportados"
                  label="Ver activación"
                />
              ) : status.availableAssets.length > 0 ? (
                <NextAction
                  title={`Puedes aportar ${status.availableAssets.length === 1 ? 'un Cukie' : `${status.availableAssets.length} Cukies`}`}
                  description="Elige uno y revisa su generación, rareza y capacidad diaria antes de confirmar el depósito."
                  href="#cukies-disponibles"
                  label="Elegir Cukie"
                />
              ) : activeCount > 0 ? (
                <NextAction
                  title="Tus Cukies ya están disponibles para partidas"
                  description="Optarán al reparto de su generación cuando se utilicen en partidas válidas."
                  href="#mis-cukies-aportados"
                  label="Ver mis Cukies"
                />
              ) : (
                <NextAction
                  title="No tienes Cukies disponibles para aportar"
                  description="Puedes revisar tu colección o volver a actualizar el estado de esta pantalla."
                  href="/cukies"
                  label="Ver mi colección"
                />
              )}
            </section>


          </div>
        ) : null}
      </Panel>
    </section>
  );
}

function positionStatusClass(status: PoolPositionStatus) {
  if (status === 'active' || status === 'withdrawable') {
    return 'border-[var(--uki-lilac-border)] bg-[#160a22]/95 text-[var(--uki-lilac)]';
  }
  return 'border-amber-300/30 bg-[#21170d]/95 text-amber-200';
}

function PoolMovements({
  activating,
  leaving,
  withdrawable,
  confirmedWithdrawals,
}: {
  activating: number;
  leaving: number;
  withdrawable: number;
  confirmedWithdrawals: number;
}) {
  const movements = [
    {
      key: 'activating',
      value: activating,
      label: 'Activándose',
      detail: 'Entrarán en partidas en la fecha indicada.',
    },
    {
      key: 'leaving',
      value: leaving,
      label: 'Devolución solicitada',
      detail: 'Esperan a que se habilite la retirada.',
    },
    {
      key: 'withdrawable',
      value: withdrawable,
      label: 'Listos para retirar',
      detail: 'Necesitan que los devuelvas a tu wallet.',
    },
    {
      key: 'withdrawal-confirmed',
      value: confirmedWithdrawals,
      label: 'Retirada confirmada',
      detail: 'Estamos actualizando tu colección; no tienes que firmar de nuevo.',
    },
  ].filter((movement) => movement.value > 0);

  if (movements.length === 0) {
    return (
      <div className="flex items-start gap-3 border-t border-white/10 pt-4 text-sm font-semibold text-[var(--uki-muted)]">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
        <p><strong className="text-[var(--uki-text)]">Todo al día.</strong> No tienes Cukies esperando activación, devolución o retirada.</p>
      </div>
    );
  }

  return (
    <section className="border-t border-white/10 pt-4">
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-[var(--uki-lilac)]" aria-hidden="true" />
        <h3 className="text-sm font-black text-[var(--uki-cream)]">Movimientos pendientes</h3>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {movements.map((movement) => (
          <div key={movement.key} className="flex min-w-0 items-start gap-3 rounded-[8px] border border-white/10 bg-white/[0.025] p-3">
            <span className="font-headline text-xl font-black tabular-nums text-[var(--uki-lilac)]">{movement.value}</span>
            <div className="min-w-0">
              <p className="text-xs font-black text-[var(--uki-text)]">{movement.label}</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">{movement.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NextAction({
  description,
  href,
  label,
  title,
}: {
  description: string;
  href: string;
  label: string;
  title: string;
}) {
  return (
    <div className="mt-2 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-balance font-headline text-xl font-black text-[var(--uki-cream)] sm:text-2xl">{title}</h3>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">{description}</p>
      </div>
      <a
        href={href}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-[var(--uki-lilac)] px-4 text-xs font-black uppercase text-black"
      >
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </a>
    </div>
  );
}
