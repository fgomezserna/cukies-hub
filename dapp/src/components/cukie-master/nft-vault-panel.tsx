'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, LockKeyhole, Unlock } from 'lucide-react';
import { isAddress, type Address, type Hash } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';

import { CukiImage } from '@/components/legacy-marketplace/cuki-image';
import { Panel } from '@/components/landing/primitives';
import { useAppRuntime, useAppRuntimeResource, useGuardedOperation } from '@/providers/app-runtime-provider';
import { NftVaultRecoveryPanel } from '@/components/nft-vault/recovery-panel';
import {
  cukieMasterNftVaultAbi,
  ukiNftVaults,
  type UkiNftVaultMode,
} from '@/lib/contracts/uki-nft-vaults';
import {
  clearPendingNftVaultOperation,
  canonicalNftVaultAssetId,
  getNftVaultBrowserStorage,
  getNftVaultStorageSnapshot,
  loadPendingNftVaultOperations,
  pendingNftVaultOperationAssetKey,
  pendingNftVaultOperationMatches,
  pendingNftVaultOperationMatchesAsset,
  pendingNftVaultStorageKey,
  savePendingNftVaultOperation,
  type NftVaultPendingAction,
  type NftVaultPendingContext,
  type NftVaultPendingOperation,
  type NftVaultPendingPhase,
} from '@/lib/nft-vault/pending-operations';
import {
  depositedEpochFromMasterReceipt,
  inspectMasterDepositPosition,
  masterProjectionMatchesPendingOperation,
} from '@/lib/nft-vault/pending-reconciliation';
import {
  executeNftTransaction,
  nftTransactionContextFromNullable,
  nftTransactionContextMatches,
  type NftTransactionReceipt,
  type NftTransactionClient,
  type NftTransactionContext,
} from '@/lib/nft-vault/transaction-lifecycle';
import { useAuth } from '@/providers/auth-provider';

const erc721CustodyAbi = [
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'getApproved', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'isApprovedForAll', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] },
] as const;


type PublicNft = {
  assetId: string;
  canonicalAssetId: string | null;
  collectionAddress: string | null;
  tokenId: string | null;
  imageUrl: string | null;
  rarity: string;
  rarityPoints: number | null;
  state: string;
  blockers: string[];
  custody: 'wallet' | 'cukie_master_nft_vault';
  depositEpoch?: string | null;
  canDeposit: boolean;
  canWithdraw: boolean;
};

type PublicNftCustody = {
  mode: UkiNftVaultMode;
  chainId: 56 | 97 | null;
  vaultAddress: string | null;
  collectionAddresses: string[];
  explorerBaseUrl: string | null;
  indexer: { status: 'ready' | 'syncing' | 'unavailable' };
};

type PublicStatus = {
  nftInventory: PublicNft[];
  nftCustody: PublicNftCustody;
};

type Operation = 'deposit' | 'withdraw';
type Phase = 'idle' | 'approving' | 'depositing' | 'withdrawing' | 'syncing';

type MasterOnChainConfirmation = {
  context: NftVaultPendingContext;
  assetId: string;
  collectionAddress: string;
  tokenId: string;
  action: 'deposit' | 'withdraw';
  txHash: Hash;
  depositEpoch?: string;
  confirmedAt: number;
};

type EphemeralPendingEntry = {
  operation: NftVaultPendingOperation;
  storageRaw: string | null;
};

function sameAddress(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function sameAddressSet(left: readonly string[], right: readonly string[]) {
  return left.map((item) => item.toLowerCase()).sort().join(',')
    === [...right].map((item) => item.toLowerCase()).sort().join(',');
}

function rarityLabel(rarity: string) {
  return ({
    common: 'Común',
    uncommon: 'No común',
    rare: 'Raro',
    epic: 'Épico',
    legendary: 'Legendario',
    goat: 'Goat',
  } as Record<string, string>)[rarity] ?? 'Sin verificar';
}

function blockerLabel(blocker?: string) {
  return ({
    second_generation: 'Solo cuentan Cukies Originales',
    missing_generation: 'Generación pendiente de verificar',
    missing_rarity: 'Rareza pendiente de verificar',
    listed: 'Retíralo del marketplace para hacer staking',
    bridging: 'Espera a que termine el bridge',
    already_locked: 'Ya está reservado para otro uso',
    in_pool: 'Ya está depositado en el Cukie Pool',
    assigned_to_game: 'Está asignado temporalmente a una partida',
    invalidated: 'Requiere revisión del inventario',
    owner_mismatch: 'El Cukie no aparece en esta wallet',
    unknown_owner: 'Propietario pendiente de verificar',
  } as Record<string, string>)[blocker ?? ''] ?? 'Este Cukie no es apto para la ruta Cukie Master';
}

function isVisibleCukieMasterAsset(asset: PublicNft) {
  return !asset.blockers.includes('second_generation')
    || asset.custody === 'cukie_master_nft_vault'
    || asset.canWithdraw;
}

function pendingLabel(operation: NftVaultPendingOperation, confirmedOnChain = false) {
  if (operation.phase === 'approval_confirmed') return 'Continuar staking';
  if (operation.phase === 'syncing_projection') {
    if (confirmedOnChain) {
      return operation.action === 'withdraw'
        ? 'Retirada confirmada · actualizando inventario…'
        : 'Depósito confirmado · actualizando inventario…';
    }
    return operation.action === 'withdraw' ? 'Actualizando retirada…' : 'Actualizando staking…';
  }
  return ({
    approval: 'Confirmando aprobación…',
    deposit: 'Confirmando depósito…',
    request_exit: 'Confirmando solicitud de salida…',
    withdraw: 'Confirmando retirada…',
  } as const)[operation.action];
}

function nftTransactionError(reason: unknown) {
  const raw = reason instanceof Error ? reason.message : String(reason ?? '');
  const message = raw.toLowerCase();
  if (message.includes('simulation_unavailable') || message.includes('simulation')) {
    return 'No se pudo simular la operación. No se ha enviado ninguna transacción; actualiza el estado y vuelve a intentarlo cuando el RPC esté disponible.';
  }
  if (raw.startsWith('NFT_OPERATION_CONTEXT_CHANGED')) {
    return 'La wallet, la red o el vault cambiaron durante la comprobación. No se ha enviado ninguna transacción; actualiza el estado antes de reintentarlo.';
  }
  if (message.includes('user rejected') || message.includes('user denied') || message.includes('rejected')) {
    return 'La wallet canceló la firma. No se ha cambiado ninguna posición.';
  }
  if (message.includes('transaction_reverted') || message.includes('reverted')) {
    return 'El contrato ha rechazado la operación. Revisa la colección, la red y el estado del Cukie antes de volver a intentarlo.';
  }
  if (message.includes('transaction_cancelled') || message.includes('transaction_replaced')) {
    return 'La transacción fue sustituida o cancelada. No se ha confirmado ningún cambio; revisa la wallet antes de volver a intentarlo.';
  }
  return 'No se pudo completar la operación. Actualiza el estado y vuelve a intentarlo.';
}

export function CukieMasterNftVaultPanel() {
  const { user, isLoading: authLoading, walletType } = useAuth();
  const runtime = useAppRuntime();
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: ukiNftVaults.chainId ?? undefined });
  const { writeContractAsync } = useWriteContract();
  const operationGuard = useGuardedOperation('nft-write');
  const operationGuardRef = useRef(operationGuard);
  operationGuardRef.current = operationGuard;
  const writeContextRef = useRef({
    wallet: address ?? null,
    chainId: chainId ?? null,
    vault: ukiNftVaults.cukieMasterNftVaultAddress ?? null,
  });
  writeContextRef.current = {
    wallet: address ?? null,
    chainId: chainId ?? null,
    vault: ukiNftVaults.cukieMasterNftVaultAddress ?? null,
  };
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestTxHash, setLatestTxHash] = useState<Hash | null>(null);
  const [indexerSyncRetryExhausted, setIndexerSyncRetryExhausted] = useState(false);
  const [pendingByAsset, setPendingByAsset] = useState<Record<string, NftVaultPendingOperation>>({});
  // Keep a tab-local fallback when privacy mode or a browser policy rejects
  // localStorage. The in-memory operation still fences duplicate writes until
  // the receipt/projection converges.
  const pendingByAssetRef = useRef(pendingByAsset);
  pendingByAssetRef.current = pendingByAsset;
  const pendingEphemeralByContextRef = useRef(new Map<string, Record<string, EphemeralPendingEntry>>());
  const [onChainByAsset, setOnChainByAsset] = useState<Record<string, MasterOnChainConfirmation>>({});
  const [hydratedPendingKey, setHydratedPendingKey] = useState<string | null>(null);
  const operationLocksRef = useRef(new Set<string>());
  const statusResource = useAppRuntimeResource<PublicStatus>('master-nft', {
    enabled: Boolean(user?.walletAddress) && !authLoading,
    validate: (value): value is PublicStatus => Boolean(
      value
      && typeof value === 'object'
      && 'walletNormalized' in value
      && typeof value.walletNormalized === 'string'
      && runtime.address
      && value.walletNormalized.toLowerCase() === runtime.address.toLowerCase(),
    ),
  });
  const status = statusResource.data ?? null;
  const loading = statusResource.state === 'loading';
  const refreshStatus = statusResource.refresh;
  const refresh = useCallback(async (_signal?: AbortSignal, _background = false) => {
    const result = await refreshStatus();
    return result.data ?? null;
  }, [refreshStatus]);
  const pendingContext = useMemo<NftVaultPendingContext | null>(() => {
    if (!ukiNftVaults.chainId || !ukiNftVaults.cukieMasterNftVaultAddress || !user?.walletAddress) return null;
    return {
      chainId: ukiNftVaults.chainId,
      walletAddress: user.walletAddress,
      vaultAddress: ukiNftVaults.cukieMasterNftVaultAddress,
    };
  }, [user?.walletAddress]);
  const pendingContextRef = useRef<NftVaultPendingContext | null>(pendingContext);
  pendingContextRef.current = pendingContext;
  const pendingOperationsForContext = useCallback((context: NftVaultPendingContext) => {
    const storage = getNftVaultBrowserStorage();
    const storageSnapshot = getNftVaultStorageSnapshot(storage, context);
    const persisted = loadPendingNftVaultOperations(storage, context);
    const contextKey = pendingNftVaultStorageKey(context);
    const ephemeral = pendingEphemeralByContextRef.current.get(contextKey) ?? {};
    const merged = new Map<string, NftVaultPendingOperation>(
      persisted.map((operation) => [pendingNftVaultOperationAssetKey(operation), operation]),
    );
    for (const [key, entry] of Object.entries(ephemeral)) {
      const storageUnchanged = !storageSnapshot.readable || entry.storageRaw === storageSnapshot.raw;
      if (storageUnchanged) {
        merged.set(key, entry.operation);
        continue;
      }
      const next = { ...ephemeral };
      delete next[key];
      if (Object.keys(next).length === 0) pendingEphemeralByContextRef.current.delete(contextKey);
      else pendingEphemeralByContextRef.current.set(contextKey, next);
    }
    return [...merged.values()];
  }, []);

  const apiAssets = useMemo(
    () => (status?.nftInventory ?? []).filter(isVisibleCukieMasterAsset),
    [status?.nftInventory],
  );
  const assetPendingKey = useCallback((asset: Pick<PublicNft, 'assetId' | 'collectionAddress' | 'tokenId'>) => {
    if (!asset.collectionAddress || !asset.tokenId || !ukiNftVaults.chainId) return asset.assetId;
    return canonicalNftVaultAssetId({
      chainId: ukiNftVaults.chainId,
      collectionAddress: asset.collectionAddress,
      tokenId: asset.tokenId,
    }) ?? asset.assetId;
  }, []);
  const assets = useMemo(() => apiAssets.map((asset) => {
    const key = assetPendingKey(asset);
    const pending = pendingByAsset[key];
    const confirmation = onChainByAsset[key];
    if (
      !pending
      || !confirmation
      || !pendingContext
      || !address
      || chainId !== pendingContext.chainId
      || !sameAddress(address, pendingContext.walletAddress)
      || pending.chainId !== pendingContext.chainId
      || !sameAddress(pending.walletAddress, pendingContext.walletAddress)
      || !sameAddress(pending.vaultAddress, pendingContext.vaultAddress)
      || confirmation.context.chainId !== pendingContext.chainId
      || !sameAddress(confirmation.context.walletAddress, pendingContext.walletAddress)
      || !sameAddress(confirmation.context.vaultAddress, pendingContext.vaultAddress)
      || confirmation.assetId !== key
      || confirmation.txHash.toLowerCase() !== pending.txHash.toLowerCase()
      || confirmation.action !== pending.action
    ) return asset;
    if (confirmation.action === 'deposit') {
      return {
        ...asset,
        state: 'custodied',
        custody: 'cukie_master_nft_vault' as const,
        depositEpoch: confirmation.depositEpoch ?? asset.depositEpoch ?? null,
        canDeposit: false,
        canWithdraw: false,
      };
    }
    return {
      ...asset,
      state: 'available',
      custody: 'wallet' as const,
      canDeposit: false,
      canWithdraw: false,
    };
  }), [address, apiAssets, assetPendingKey, chainId, onChainByAsset, pendingByAsset, pendingContext]);
  const eligibleAssetCount = useMemo(
    () => assets.filter((asset) => asset.canDeposit || asset.canWithdraw).length,
    [assets],
  );
  const pendingWithoutInventory = useMemo(
    () => Object.values(pendingByAsset).filter((operation) => (
      !assets.some((asset) => assetPendingKey(asset) === pendingNftVaultOperationAssetKey(operation))
    )),
    [assetPendingKey, assets, pendingByAsset],
  );
  const serverConfig = status?.nftCustody;
  const configMatches = Boolean(
    serverConfig
    && serverConfig.mode === 'custodial'
    && serverConfig.chainId === ukiNftVaults.chainId
    && sameAddress(serverConfig.vaultAddress, ukiNftVaults.cukieMasterNftVaultAddress)
    && sameAddressSet(serverConfig.collectionAddresses, ukiNftVaults.collectionAddresses),
  );
  const walletMatches = Boolean(
    walletType === 'evm'
    && isConnected
    && address
    && user?.walletAddress
    && sameAddress(address, user.walletAddress),
  );
  const correctChain = Boolean(ukiNftVaults.chainId && chainId === ukiNftVaults.chainId);
  const pendingKey = useMemo(
    () => pendingContext ? pendingNftVaultStorageKey(pendingContext) : null,
    [pendingContext],
  );
  const pendingHydrated = Boolean(pendingKey && hydratedPendingKey === pendingKey);
  const pendingOperationForAsset = useCallback((asset: Pick<PublicNft, 'assetId' | 'collectionAddress' | 'tokenId'>) => {
    const operation = pendingByAsset[assetPendingKey(asset)];
    if (!operation || !pendingContext) return undefined;
    return operation.chainId === pendingContext.chainId
      && sameAddress(operation.walletAddress, pendingContext.walletAddress)
      && sameAddress(operation.vaultAddress, pendingContext.vaultAddress)
      && chainId === pendingContext.chainId
      && sameAddress(address, pendingContext.walletAddress)
      ? operation
      : undefined;
  }, [address, assetPendingKey, chainId, pendingByAsset, pendingContext]);
  const onChainConfirmationForAsset = useCallback((asset: Pick<PublicNft, 'assetId' | 'collectionAddress' | 'tokenId'>) => {
    const key = assetPendingKey(asset);
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
  }, [assetPendingKey, onChainByAsset, pendingContext, pendingOperationForAsset]);
  const identityReady = Boolean(
    configMatches
    && walletMatches
    && correctChain
    && publicClient
    && ukiNftVaults.cukieMasterNftVaultAddress,
  );
  const depositsReady = Boolean(identityReady && serverConfig?.indexer.status === 'ready');

  useEffect(() => {
    setIndexerSyncRetryExhausted(false);
  }, [serverConfig?.indexer.status]);

  useEffect(() => {
    setPhase('idle');
    setActiveAssetId(null);
    setLatestTxHash(null);
    setError(null);
    setNotice(null);
    setOnChainByAsset({});
  }, [address, chainId]);

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
      // A storage event is authoritative evidence that another tab changed
      // this context. Drop any failed-write mirror before merging the new
      // value, including an explicit clear (newValue === null).
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

  const persistPending = useCallback((input: {
    asset: PublicNft;
    action: NftVaultPendingAction;
    phase: NftVaultPendingPhase;
    txHash: Hash;
    depositEpoch?: string;
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
    if (!storageContext || !input.asset.collectionAddress || !input.asset.tokenId) return null;
    if (input.isCurrent && !input.isCurrent()) return null;
    const canonicalAssetId = canonicalNftVaultAssetId({
      chainId: storageContext.chainId,
      collectionAddress: input.asset.collectionAddress,
      tokenId: input.asset.tokenId,
    });
    if (!canonicalAssetId) return null;
    const now = Date.now();
    const storage = getNftVaultBrowserStorage();
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
    const depositEpoch = input.action === 'deposit'
      ? input.depositEpoch ?? (previous?.action === 'deposit' ? previous.depositEpoch : undefined)
      : undefined;
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
      if (input.expectedOperation) {
        const storedOperation = pendingOperationsForContext(storageContext)
          .find((operation) => pendingNftVaultOperationAssetKey(operation) === pendingNftVaultOperationAssetKey(input.expectedOperation!));
        if (storedOperation && !pendingNftVaultOperationMatches(storedOperation, input.expectedOperation)) return;
      }
      clearPendingNftVaultOperation(storage, storageContext, assetId, input.expectedOperation);
      if (input.expectedOperation) {
        const contextStorageKey = pendingNftVaultStorageKey(storageContext);
        const contextEphemeral = pendingEphemeralByContextRef.current.get(contextStorageKey);
        if (contextEphemeral) {
          const operationKey = pendingNftVaultOperationAssetKey(input.expectedOperation);
          const currentEphemeral = contextEphemeral[operationKey]?.operation;
          if (pendingNftVaultOperationMatches(currentEphemeral, input.expectedOperation)) {
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
        const matches = input.expectedOperation
          ? pendingNftVaultOperationMatches(operation, input.expectedOperation)
          : key === assetId
            || operation.assetId === assetId
            || pendingNftVaultOperationAssetKey(operation) === assetId;
        if (matches) delete next[key];
      }
      return next;
    });
  }, [pendingContext, pendingOperationsForContext]);

  useEffect(() => {
    if (!status) return;
    const reconciliationContext = pendingContext;
    const reconciliationKey = reconciliationContext ? pendingNftVaultStorageKey(reconciliationContext) : null;
    const isReconciliationCurrent = () => {
      const currentContext = pendingContextRef.current;
      return Boolean(
        reconciliationKey
        && currentContext
        && pendingNftVaultStorageKey(currentContext) === reconciliationKey
        && reconciliationContext
        && nftTransactionContextMatches(
          {
            wallet: reconciliationContext.walletAddress,
            chainId: reconciliationContext.chainId,
            vault: reconciliationContext.vaultAddress,
          },
          nftTransactionContextFromNullable(writeContextRef.current),
        ),
      );
    };
    for (const operation of Object.values(pendingByAsset)) {
      if (!isReconciliationCurrent()) return;
      if (!masterProjectionMatchesPendingOperation(operation, status)) continue;
      const storedOperation = pendingContext
        ? pendingOperationsForContext(pendingContext)
          .find((item) => pendingNftVaultOperationAssetKey(item) === pendingNftVaultOperationAssetKey(operation))
        : null;
      if (storedOperation && !pendingNftVaultOperationMatches(storedOperation, operation)) continue;
      const inMemoryOperation = pendingByAssetRef.current[pendingNftVaultOperationAssetKey(operation)];
      if (!storedOperation && !pendingNftVaultOperationMatches(inMemoryOperation, operation)) continue;
      clearPending(operation.assetId, { expectedOperation: operation, isCurrent: isReconciliationCurrent });
      const operationKey = pendingNftVaultOperationAssetKey(operation);
      setOnChainByAsset((current) => {
        if (!isReconciliationCurrent()) return current;
        const confirmation = current[operationKey];
        if (!confirmation || confirmation.txHash.toLowerCase() !== operation.txHash.toLowerCase()) return current;
        const next = { ...current };
        delete next[operationKey];
        return next;
      });
      const replacement = pendingContext
        ? pendingOperationsForContext(pendingContext)
          .find((item) => pendingNftVaultOperationAssetKey(item) === operationKey)
        : null;
      if (!replacement) {
        if (!isReconciliationCurrent()) return;
        setNotice((current) => current && /actualizando/i.test(current)
          ? 'Operación confirmada y reflejada en el inventario.'
          : current);
      }
    }
  }, [clearPending, pendingByAsset, pendingContext, pendingOperationsForContext, status]);

  useEffect(() => {
    if (!pendingHydrated || !pendingContext || !publicClient || !user?.walletAddress) return;
    if (Object.keys(pendingByAsset).length === 0) return;
    const reconciliationContext = pendingContext;
    const reconciliationKey = pendingKey;
    let disposed = false;
    let running = false;

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

    const operationAsset = (operation: NftVaultPendingOperation): PublicNft => ({
      assetId: canonicalNftVaultAssetId({
        chainId: operation.chainId,
        collectionAddress: operation.collectionAddress,
        tokenId: operation.tokenId,
      }) ?? operation.assetId,
      canonicalAssetId: canonicalNftVaultAssetId({
        chainId: operation.chainId,
        collectionAddress: operation.collectionAddress,
        tokenId: operation.tokenId,
      }) ?? operation.assetId,
      collectionAddress: operation.collectionAddress,
      tokenId: operation.tokenId,
      imageUrl: null,
      rarity: 'unknown',
      rarityPoints: null,
      state: 'unknown',
      blockers: [],
      custody: operation.action === 'withdraw' ? 'cukie_master_nft_vault' : 'wallet',
      canDeposit: false,
      canWithdraw: false,
    });

    const markOnChainConfirmation = (operation: NftVaultPendingOperation, input: {
      depositEpoch?: string;
    }) => {
      if (!isReconciliationCurrent()) return false;
      const operationKey = pendingNftVaultOperationAssetKey(operation);
      setOnChainByAsset((current) => {
        if (!isReconciliationCurrent()) return current;
        return {
          ...current,
          [operationKey]: {
            context: reconciliationContext,
            assetId: operationKey,
            collectionAddress: operation.collectionAddress,
            tokenId: operation.tokenId,
            action: operation.action as 'deposit' | 'withdraw',
            txHash: operation.txHash,
            ...(input.depositEpoch ? { depositEpoch: input.depositEpoch } : {}),
            confirmedAt: Date.now(),
          },
        };
      });
      if (isReconciliationCurrent()) {
        setNotice('Transacción confirmada en cadena. Actualizando inventario; no repitas la operación.');
      }
      return true;
    };

    const inspectConfirmedOperation = async (
      snapshot: NftVaultPendingOperation,
      receipt?: NftTransactionReceipt,
    ) => {
      let operation = currentOperation(snapshot);
      if (!operation || !publicClient.getTransactionReceipt || !publicClient.readContract) return;
      const resolvedReceipt: NftTransactionReceipt = receipt ?? await publicClient.getTransactionReceipt({ hash: operation.txHash });
      if (!isReconciliationCurrent()) return;
      if (!receipt) {
        operation = currentOperation(operation);
        if (!operation) return;
      }
      if (resolvedReceipt.status === 'reverted') {
        clearPending(operation.assetId, {
          context: {
            wallet: reconciliationContext.walletAddress,
            chainId: reconciliationContext.chainId,
            vault: reconciliationContext.vaultAddress,
          },
          expectedOperation: operation,
          isCurrent: isReconciliationCurrent,
        });
        if (isReconciliationCurrent()) {
          setError(`La transacción del Cukie #${operation.tokenId} fue revertida. Puedes intentarlo de nuevo.`);
        }
        return;
      }
      if (resolvedReceipt.status !== 'success') return;

      if (operation.action === 'deposit') {
        const depositEpoch = depositedEpochFromMasterReceipt(resolvedReceipt, operation);
        if (!depositEpoch) return;
        if (operation.depositEpoch !== depositEpoch) {
          const updated = persistPending({
            asset: operationAsset(operation),
            action: operation.action,
            phase: 'syncing_projection',
            txHash: operation.txHash,
            depositEpoch,
            context: {
              wallet: reconciliationContext.walletAddress,
              chainId: reconciliationContext.chainId,
              vault: reconciliationContext.vaultAddress,
            },
            expectedOperation: operation,
            isCurrent: isReconciliationCurrent,
          });
          if (!updated) return;
          operation = updated;
        }
        if (!operation.depositEpoch || !isReconciliationCurrent()) return;
        const rawPosition = await publicClient.readContract({
          address: operation.vaultAddress as Address,
          abi: cukieMasterNftVaultAbi,
          functionName: 'positionOf',
          args: [operation.collectionAddress as Address, BigInt(operation.tokenId)],
        });
        if (!isReconciliationCurrent()) return;
        const current = currentOperation(operation);
        if (!current || !inspectMasterDepositPosition(current, rawPosition)) return;
        markOnChainConfirmation(current, { depositEpoch: current.depositEpoch });
        return;
      }

      const owner = await publicClient.readContract({
        address: operation.collectionAddress as Address,
        abi: erc721CustodyAbi,
        functionName: 'ownerOf',
        args: [BigInt(operation.tokenId)],
      });
      if (!isReconciliationCurrent()) return;
      const current = currentOperation(operation);
      if (!current || !sameAddress(owner, current.walletAddress)) return;
      markOnChainConfirmation(current, {});
    };

    const reconcile = async () => {
      if (running || disposed) return;
      running = true;
      try {
        const snapshots = Object.values(pendingByAsset);
        let transitionedToSyncing = false;
        for (const snapshot of snapshots) {
          let operation = currentOperation(snapshot);
          if (!operation) continue;
          try {
            if (operation.phase === 'awaiting_receipt') {
              if (!publicClient.getTransactionReceipt) continue;
              const receipt = await publicClient.getTransactionReceipt({ hash: operation.txHash });
              if (!isReconciliationCurrent()) return;
              operation = currentOperation(operation);
              if (!operation) continue;
              if (receipt.status === 'reverted') {
                clearPending(operation.assetId, {
                  context: {
                    wallet: reconciliationContext.walletAddress,
                    chainId: reconciliationContext.chainId,
                    vault: reconciliationContext.vaultAddress,
                  },
                  expectedOperation: operation,
                  isCurrent: isReconciliationCurrent,
                });
                if (isReconciliationCurrent()) {
                  setError(`La transacción del Cukie #${operation.tokenId} fue revertida. Puedes intentarlo de nuevo.`);
                }
                continue;
              }
              if (receipt.status !== 'success') continue;
              const transitioned = persistPending({
                asset: operationAsset(operation),
                action: operation.action,
                phase: operation.action === 'approval' ? 'approval_confirmed' : 'syncing_projection',
                txHash: operation.txHash,
                depositEpoch: operation.action === 'deposit'
                  ? depositedEpochFromMasterReceipt(receipt, operation) ?? undefined
                  : undefined,
                context: {
                  wallet: reconciliationContext.walletAddress,
                  chainId: reconciliationContext.chainId,
                  vault: reconciliationContext.vaultAddress,
                },
                expectedOperation: operation,
                isCurrent: isReconciliationCurrent,
              });
              if (!transitioned) continue;
              operation = transitioned;
              if (operation.action === 'approval') continue;
              transitionedToSyncing = true;
              await inspectConfirmedOperation(operation, receipt);
              if (!isReconciliationCurrent()) return;
              continue;
            }
            await inspectConfirmedOperation(operation);
          } catch {
            // RPC/read failures are inconclusive; retaining the pending lock is safer
            // than deleting it or reverting the optimistic on-chain confirmation.
          }
        }

        if (transitionedToSyncing || snapshots.some((item) => item.phase === 'syncing_projection')) {
          try {
            if (isReconciliationCurrent()) await refresh(undefined, true);
          } catch {
            // The indexer/API can recover later; keeping the operation blocks duplicates.
          }
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
  }, [clearPending, pendingByAsset, pendingContext, pendingHydrated, pendingKey, pendingOperationsForContext, persistPending, publicClient, refresh, user?.walletAddress]);

  async function writeAndConfirm(
    input: Parameters<typeof writeContractAsync>[0],
    asset: PublicNft,
    action: NftVaultPendingAction,
    expectedOperation?: NftVaultPendingOperation,
  ) {
    const currentGuard = operationGuardRef.current;
    if (!publicClient) throw new Error('NFT_OPERATION_PUBLIC_CLIENT_UNAVAILABLE');
    const expectedWallet = address;
    const expectedChainId = ukiNftVaults.chainId;
    const expectedVault = ukiNftVaults.cukieMasterNftVaultAddress;
    if (!expectedWallet || !expectedChainId || !expectedVault) {
      throw new Error('NFT_OPERATION_CONTEXT_CHANGED');
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
      const assetKey = canonicalNftVaultAssetId({
        chainId: storageContext.chainId,
        collectionAddress: asset.collectionAddress ?? '',
        tokenId: asset.tokenId ?? '',
      });
      const operation = pendingOperationsForContext(storageContext)
        .find((operation) => (
          (!assetKey || pendingNftVaultOperationAssetKey(operation) === assetKey)
          && operation.txHash.toLowerCase() === submittedHash?.toLowerCase()
        ));
      if (operation) return operation;
      if (
        submittedOperation
        && (!assetKey || pendingNftVaultOperationAssetKey(submittedOperation) === assetKey)
        && submittedOperation.txHash.toLowerCase() === submittedHash.toLowerCase()
        && pendingNftVaultOperationMatchesAsset(submittedOperation, {
          chainId: storageContext.chainId,
          collectionAddress: asset.collectionAddress ?? '',
          tokenId: asset.tokenId ?? '',
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
      errorPrefix: 'NFT_OPERATION',
      onSubmitted: (hash, isCurrent) => {
        submittedHash = hash;
        if (isCurrent) setLatestTxHash(hash);
        submittedOperation = persistPending({
          asset,
          action,
          phase: 'awaiting_receipt',
          txHash: hash,
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
          context: expectedContext,
          expectedOperation: originalOperation,
          updateUi: isCurrentContext(isCurrent),
        });
      },
      onConfirmed: (hash, isCurrent) => {
        const operation = operationForSubmittedHash();
        if (!operation) return;
        submittedOperation = persistPending({
          asset,
          action,
          phase: action === 'approval' ? 'approval_confirmed' : 'syncing_projection',
          txHash: hash,
          context: expectedContext,
          expectedOperation: operation,
          updateUi: isCurrentContext(isCurrent),
        });
      },
    });
  }

  async function mutate(asset: PublicNft, operation: Operation) {
    const assetKey = assetPendingKey(asset);
    const existingPending = pendingOperationForAsset(asset);
    if (
      !user?.walletAddress
      || !address
      || operationLocksRef.current.has(assetKey)
      || (existingPending && existingPending.phase !== 'approval_confirmed')
      || !pendingHydrated
      || !pendingContext
      || !identityReady
      || (operation === 'deposit' && !depositsReady)
      || !asset.collectionAddress
      || !isAddress(asset.collectionAddress)
      || !asset.tokenId
      || !/^\d+$/.test(asset.tokenId)
      || !asset.canonicalAssetId
      || asset.canonicalAssetId !== `${ukiNftVaults.chainId}:${asset.collectionAddress.toLowerCase()}:${asset.tokenId}`
      || !ukiNftVaults.collectionAddresses.some((collection) => sameAddress(collection, asset.collectionAddress))
      || !ukiNftVaults.cukieMasterNftVaultAddress
      || !ukiNftVaults.chainId
    ) {
      setError('No podemos comprobar el Cukie; la operación permanece bloqueada.');
      return;
    }

    const collection = asset.collectionAddress as Address;
    const vaultAddress = ukiNftVaults.cukieMasterNftVaultAddress;
    const tokenId = BigInt(asset.tokenId);
    operationLocksRef.current.add(assetKey);
    setActiveAssetId(assetKey);
    setError(null);
    setNotice(null);
    setLatestTxHash(null);
    const operationContext: NftTransactionContext = {
      wallet: address,
      chainId: ukiNftVaults.chainId,
      vault: ukiNftVaults.cukieMasterNftVaultAddress,
    };
    const identityMatches = () => nftTransactionContextMatches(operationContext, writeContextRef.current);
    const operationReady = () => operationGuardRef.current.ready && identityMatches();
    let pendingForNext = existingPending;
    try {
      if (operation === 'deposit') {
        if (!asset.canDeposit || !publicClient) throw new Error('DEPOSIT_NOT_ALLOWED');
        const [owner, approved, approvedForAll] = await Promise.all([
          publicClient.readContract({ address: collection, abi: erc721CustodyAbi, functionName: 'ownerOf', args: [tokenId] }),
          publicClient.readContract({ address: collection, abi: erc721CustodyAbi, functionName: 'getApproved', args: [tokenId] }),
          publicClient.readContract({ address: collection, abi: erc721CustodyAbi, functionName: 'isApprovedForAll', args: [address, vaultAddress] }),
        ]);
        if (!operationReady()) throw new Error('NFT_OPERATION_CONTEXT_CHANGED');
        if (!sameAddress(owner, address)) throw new Error('WALLET_IS_NOT_OWNER');
        if (!sameAddress(approved, vaultAddress) && approvedForAll !== true) {
          setPhase('approving');
          await writeAndConfirm({
            chainId: ukiNftVaults.chainId,
            address: collection,
            abi: erc721CustodyAbi,
            functionName: 'approve',
            args: [vaultAddress, tokenId],
          }, asset, 'approval', existingPending);
          pendingForNext = pendingContext
            ? pendingOperationsForContext(pendingContext)
              .find((item) => pendingNftVaultOperationAssetKey(item) === assetKey)
            : undefined;
        }
        if (!operationReady()) throw new Error('NFT_OPERATION_CONTEXT_CHANGED');
        setPhase('depositing');
        await writeAndConfirm({
          chainId: ukiNftVaults.chainId,
          address: vaultAddress,
          abi: cukieMasterNftVaultAbi,
          functionName: 'deposit',
          args: [collection, tokenId],
        }, asset, 'deposit', pendingForNext);
      } else {
        if (!asset.canWithdraw) throw new Error('WITHDRAW_NOT_ALLOWED');
        setPhase('withdrawing');
        await writeAndConfirm({
          chainId: ukiNftVaults.chainId,
          address: vaultAddress,
          abi: cukieMasterNftVaultAbi,
          functionName: 'withdraw',
          args: [collection, tokenId],
        }, asset, 'withdraw', existingPending);
      }
      if (!operationReady()) throw new Error('NFT_OPERATION_CONTEXT_CHANGED_AFTER_RECEIPT');
      // The receipt is the write boundary. Release this card (and every other
      // card's visual spinner) immediately; the pending operation itself keeps
      // this NFT locked until receipt proof and API convergence complete.
      setPhase('idle');
      setActiveAssetId(null);
      setNotice('Transacción confirmada. Estamos actualizando el inventario; no repitas la operación.');
      void runtime.refreshAfterTransaction('master-nft').catch(() => undefined);
    } catch (reason) {
      if (!identityMatches()) return;
      const persisted = pendingContext
        ? pendingOperationsForContext(pendingContext)
          .find((item) => pendingNftVaultOperationAssetKey(item) === assetKey)
        : null;
      if (persisted) {
        setNotice(persisted.phase === 'approval_confirmed'
          ? 'La aprobación quedó confirmada. Pulsa «Continuar staking» cuando quieras reanudar el depósito.'
          : 'La operación ya tiene transacción. Seguiremos comprobándola automáticamente; no la repitas.');
      } else {
        setError(nftTransactionError(reason));
      }
    } finally {
      if (identityMatches()) {
        setPhase('idle');
        setActiveAssetId(null);
      }
      operationLocksRef.current.delete(assetKey);
    }
  }

  if (ukiNftVaults.mode.cukieMaster === 'legacy') return null;

  return (
    <section id="cukie-master-nft-staking" className="relative z-[2] w-full min-w-0 scroll-mt-24 pb-8">
      <Panel className="min-w-0" innerClassName="min-w-0 p-5 sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Cukies Originales</p>
        <h2 className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)] sm:text-3xl">
          Staking de Cukies para Cukie Master
        </h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
          Solo puedes depositar Cukies Originales. Mientras estén depositados no podrás venderlos, transferirlos ni usarlos para jugar; puedes retirarlos y conservar los créditos ya ganados.
        </p>
        {status ? (
          <p className="mt-3 text-xs font-semibold text-[var(--uki-muted)]">
            {assets.length} Cukies Originales en tu colección · {eligibleAssetCount} con una acción disponible
          </p>
        ) : null}

        {serverConfig && !configMatches ? (
          <p role="alert" className="mt-5 flex gap-2 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-semibold text-amber-100">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
            El servicio no está disponible ahora. Los depósitos permanecen bloqueados por seguridad.
          </p>
        ) : null}
        {serverConfig?.indexer.status === 'syncing' && !indexerSyncRetryExhausted ? (
          <p role="status" aria-live="polite" className="mt-4 flex gap-2 rounded-[8px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] p-4 text-sm font-semibold text-[var(--uki-text)]">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--uki-lilac)]" aria-hidden="true" />
            Estamos actualizando tus Cukies. Reintentaremos automáticamente; mientras tanto no se habilitan nuevos depósitos y tus posiciones siguen visibles.
          </p>
        ) : null}
        {serverConfig?.indexer.status === 'unavailable' || indexerSyncRetryExhausted ? (
          <p role="alert" className="mt-4 flex gap-2 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-semibold text-amber-100">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
            {indexerSyncRetryExhausted
              ? 'No hemos podido completar la actualización. Los depósitos siguen bloqueados y tus posiciones permanecen visibles.'
              : 'No podemos actualizar tus Cukies ahora. No se permiten nuevos depósitos y tus posiciones permanecen visibles.'}
          </p>
        ) : null}
        {configMatches && !walletMatches ? (
          <p className="mt-4 text-sm font-semibold text-[var(--uki-text)]">Conecta la misma wallet con la que has iniciado sesión.</p>
        ) : null}
        {walletMatches && !correctChain ? (
          <p className="mt-4 text-sm font-semibold text-amber-200">Cambia tu wallet a la red correcta para continuar.</p>
        ) : null}
        {notice ? (
          <p role="status" className="mt-4 flex gap-2 rounded-[8px] border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm font-semibold text-emerald-100">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" /> {notice}
          </p>
        ) : null}
        {error ? <p role="alert" className="mt-4 text-sm font-semibold text-amber-200">{error}</p> : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {authLoading || loading ? (
            <p role="status" className="flex items-center gap-2 text-sm font-semibold text-[var(--uki-text)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando tus Cukies…
            </p>
          ) : !user?.walletAddress ? (
            <p className="text-sm font-semibold text-[var(--uki-text)]">
              Conecta tu wallet para consultar tus Cukies y gestionar el staking.
            </p>
          ) : status && assets.length === 0 ? (
            <p className="text-sm font-semibold text-[var(--uki-muted)]">No tienes Cukies Originales disponibles ni depositados con esta wallet. Los Cukies de Segunda Generación no se muestran en esta sección.</p>
          ) : !status ? (
            <p role="alert" className="text-sm font-semibold text-amber-200">
              No hemos podido actualizar tus Cukies. Reintentaremos automáticamente; los depósitos permanecen bloqueados y las posiciones conocidas siguen protegidas.
            </p>
          ) : assets.map((asset) => {
            const assetKey = assetPendingKey(asset);
            const working = activeAssetId === assetKey;
            const pending = pendingOperationForAsset(asset);
            const onChainConfirmation = onChainConfirmationForAsset(asset);
            const pendingLocked = Boolean(pending && pending.phase !== 'approval_confirmed');
            return (
              <article id={`cukie-master-cukie-${asset.tokenId ?? ''}`} key={asset.assetId} className="scroll-mt-24 overflow-hidden rounded-[10px] border border-white/10 bg-[#07131d]">
                <div className="relative aspect-[4/3] bg-black/25">
                  <CukiImage src={asset.imageUrl} alt={`Cukie #${asset.tokenId ?? ''}`} sizes="(min-width: 1280px) 24vw, 90vw" className="object-contain p-3" />
                  <span className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/70 px-2.5 py-1 text-xs font-black uppercase text-[var(--uki-text)]">
                    {rarityLabel(asset.rarity)}
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-[var(--uki-cream)]">Cukie #{asset.tokenId ?? '—'}</p>
                    <p className="text-sm font-black text-[var(--uki-gold)]">{asset.rarityPoints ?? '—'} pts</p>
                  </div>
                  {pendingLocked && pending ? (
                    <button type="button" disabled className="mt-4 inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-[7px] border border-amber-300/25 bg-amber-300/5 px-3 text-xs font-black uppercase text-amber-100 opacity-80">
                      {onChainConfirmation ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {pendingLabel(pending, Boolean(onChainConfirmation))}
                    </button>
                  ) : asset.canDeposit ? (
                    <button type="button" disabled={!depositsReady || !pendingHydrated || Boolean(activeAssetId)} onClick={() => void mutate(asset, 'deposit')} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[7px] border border-[var(--uki-lilac-border)] px-3 text-xs font-black uppercase text-[var(--uki-lilac)] disabled:cursor-not-allowed disabled:opacity-50">
                      {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4" aria-hidden="true" />}
                      {working && phase === 'approving'
                        ? 'Aprobando'
                        : working
                            ? 'Depositando'
                          : pending
                            ? pendingLabel(pending, Boolean(onChainConfirmation))
                            : 'Hacer staking'}
                    </button>
                  ) : asset.canWithdraw ? (
                    <button type="button" disabled={!identityReady || !pendingHydrated || Boolean(activeAssetId)} onClick={() => void mutate(asset, 'withdraw')} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[7px] border border-white/15 px-3 text-xs font-black uppercase text-[var(--uki-text)] disabled:cursor-not-allowed disabled:opacity-50">
                      {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Unlock className="h-4 w-4" aria-hidden="true" />}
                      {working ? 'Retirando' : 'Retirar inmediatamente de Cukie Master'}
                    </button>
                  ) : (
                    <p className="mt-4 flex min-h-11 w-full items-center justify-center rounded-[7px] border border-white/10 px-3 text-center text-xs font-black text-[var(--uki-muted)]">
                      {blockerLabel(asset.blockers[0])}
                    </p>
                  )}
                  {pending?.txHash && serverConfig?.explorerBaseUrl ? (
                    <a href={`${serverConfig.explorerBaseUrl}/tx/${pending.txHash}`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-black text-[var(--uki-lilac)] underline">
                      Ver transacción de esta operación
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        {pendingWithoutInventory.length > 0 ? (
          <div role="status" aria-live="polite" className="mt-4 grid gap-2 rounded-[8px] border border-amber-300/25 bg-amber-300/5 p-4 text-xs font-semibold text-amber-100">
            {pendingWithoutInventory.map((pending) => {
              const confirmation = onChainConfirmationForAsset({
                assetId: pending.assetId,
                collectionAddress: pending.collectionAddress,
                tokenId: pending.tokenId,
              });
              return (
              <p key={pendingNftVaultOperationAssetKey(pending)}>
                Cukie #{pending.tokenId}: {pendingLabel(pending, Boolean(confirmation))}. Sigue bloqueado mientras actualizamos el inventario.
                {serverConfig?.explorerBaseUrl ? (
                  <> {' '}<a href={`${serverConfig.explorerBaseUrl}/tx/${pending.txHash}`} target="_blank" rel="noreferrer" className="font-black text-[var(--uki-lilac)] underline">Ver transacción</a></>
                ) : null}
              </p>
              );
            })}
          </div>
        ) : null}

        {latestTxHash && serverConfig?.explorerBaseUrl ? (
          <a href={`${serverConfig.explorerBaseUrl}/tx/${latestTxHash}`} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-black text-[var(--uki-lilac)] underline">
            Ver última transacción
          </a>
        ) : null}
      </Panel>
      <NftVaultRecoveryPanel kind="cukie_master" />
    </section>
  );
}
