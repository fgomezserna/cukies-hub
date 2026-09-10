'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAddress, zeroAddress, type Address, type Hash } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';

import {
  cukieMasterNftVaultAbi,
  cukiePoolNftVaultAbi,
  getNftVaultExplorerTxUrl,
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
  pendingNftVaultStorageKey,
  savePendingNftVaultOperation,
  type NftVaultPendingAction,
  type NftVaultPendingContext,
  type NftVaultPendingOperation,
} from '@/lib/nft-vault/pending-operations';
import {
  executeNftTransaction,
  nftTransactionContextFromNullable,
  nftTransactionContextMatches,
  type NftTransactionClient,
  type NftTransactionContext,
} from '@/lib/nft-vault/transaction-lifecycle';
import {
  withdrawnEpochFromMasterReceipt,
  withdrawnEpochFromReceipt,
} from '@/lib/nft-vault/pending-reconciliation';
import { useAppRuntime, useGuardedOperation } from '@/providers/app-runtime-provider';

type VaultKind = 'cukie_master' | 'cukie_pool';
type MutationPhase = 'idle' | 'checking' | 'requesting_exit' | 'withdrawing';

type OnChainPosition = {
  collection: Address;
  tokenId: bigint;
  collectionCurrentlyAllowed: boolean;
  beneficialOwner: Address;
  depositEpoch: bigint;
  depositedAt: bigint;
  exitRequestedAt: bigint;
  withdrawableAt: bigint;
};

type QueryResult =
  | { kind: 'idle' }
  | { kind: 'not_found' }
  | { kind: 'wrong_owner'; beneficialOwner: Address }
  | { kind: 'position'; position: OnChainPosition }
  | { kind: 'error'; message: string };

type RequestedPoolLink = {
  tokenId: string | null;
  collection: string | null;
  recoveryVault: string | null;
  chainId: number | null;
  chainIdInvalid: boolean;
};

const ZERO_ADDRESS = zeroAddress.toLowerCase();
const READ_CONTEXT_CHANGED = 'RECOVERY_READ_CONTEXT_CHANGED';
const INSPECT_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000] as const;

type EphemeralPendingEntry = {
  operation: NftVaultPendingOperation;
  storageRaw: string | null;
};

function sameAddress(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function tupleField(value: unknown, name: string, index: number) {
  if (Array.isArray(value)) return value[index];
  if (value && typeof value === 'object' && name in value) {
    return (value as Record<string, unknown>)[name];
  }
  return undefined;
}

function uintField(value: unknown, name: string, index: number) {
  const field = tupleField(value, name, index);
  if (typeof field === 'bigint') return field;
  if (typeof field === 'number' && Number.isSafeInteger(field) && field >= 0) return BigInt(field);
  if (typeof field === 'string' && /^\d+$/.test(field)) return BigInt(field);
  return null;
}

function parsePosition(
  kind: VaultKind,
  collection: Address,
  tokenId: bigint,
  value: unknown,
  collectionCurrentlyAllowed: boolean,
): OnChainPosition | null {
  const ownerValue = tupleField(value, 'beneficialOwner', 0);
  const depositEpoch = uintField(value, 'depositEpoch', 1);
  const depositedAt = uintField(value, 'depositedAt', 2);
  const exitRequestedAt = kind === 'cukie_pool'
    ? uintField(value, 'exitRequestedAt', 4)
    : BigInt(0);
  const withdrawableAt = kind === 'cukie_pool'
    ? uintField(value, 'withdrawableAt', 5)
    : BigInt(0);

  if (
    typeof ownerValue !== 'string'
    || !isAddress(ownerValue)
    || depositEpoch === null
    || depositedAt === null
    || exitRequestedAt === null
    || withdrawableAt === null
  ) return null;

  return {
    collection,
    tokenId,
    collectionCurrentlyAllowed,
    beneficialOwner: ownerValue,
    depositEpoch,
    depositedAt,
    exitRequestedAt,
    withdrawableAt,
  };
}

function utcTimestampLabel(timestamp: bigint) {
  const milliseconds = Number(timestamp) * 1_000;
  if (!Number.isSafeInteger(milliseconds)) return 'fecha no representable';
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return 'fecha no representable';
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function recoveryTransactionError(reason: unknown) {
  const raw = reason instanceof Error ? reason.message : String(reason ?? '');
  const message = raw.toLowerCase();
  if (message.includes('pool_simulation_unavailable')) {
    return 'No se pudo ejecutar la simulación previa. No se ha enviado ninguna transacción; actualiza la página o inténtalo cuando el RPC esté disponible.';
  }
  if (message.includes('simulation_rejected')) {
    return 'La simulación del contrato ha rechazado la operación. No se ha enviado ninguna transacción; vuelve a comprobar la posición antes de firmar.';
  }
  if (raw.startsWith('RECOVERY_OPERATION_')) {
    return 'La wallet, la red o el vault cambiaron durante la comprobación. No se ha enviado ninguna transacción; vuelve a comprobar la posición antes de reintentarlo.';
  }
  if (message.includes('user rejected') || message.includes('user denied')) {
    return 'La wallet canceló la firma. No se ha cambiado ninguna posición.';
  }
  if (message.includes('withdrawalnotready') || message.includes('exitnotrequested')) {
    return 'La salida aún no está disponible según el calendario de esta posición. Vuelve a comprobarla más adelante.';
  }
  if (message.includes('exitalreadyrequested')) {
    return 'La salida ya estaba solicitada. Vuelve a comprobar la posición para ver su fecha de retirada.';
  }
  if (message.includes('revert')) {
    return 'El contrato rechazó la operación. Revisa la fecha del calendario y vuelve a comprobar la posición.';
  }
  return 'No se pudo completar la operación. Vuelve a comprobar la posición antes de reintentarlo.';
}

export function NftVaultRecoveryPanel({ kind }: { kind: VaultKind }) {
  const { address, chainId, isConnected } = useAccount();
  const runtime = useAppRuntime();
  const publicClient = usePublicClient({ chainId: ukiNftVaults.chainId ?? undefined });
  const { writeContractAsync } = useWriteContract();
  const operationGuard = useGuardedOperation('recovery-write');
  const operationGuardRef = useRef(operationGuard);
  operationGuardRef.current = operationGuard;
  const configuredCollections = ukiNftVaults.recoveryCollectionAddresses;
  const previousPoolVaults = useMemo(
    () => kind === 'cukie_pool' ? ukiNftVaults.poolRecoveryVaults ?? [] : [],
    [kind],
  );
  const [recoveryVaultInput, setRecoveryVaultInput] = useState('active');
  const configuredCollectionKey = configuredCollections
    .map((collection) => collection.toLowerCase())
    .join(',');
  const [collectionInput, setCollectionInput] = useState<string>(configuredCollections[0] ?? '');
  const [tokenIdInput, setTokenIdInput] = useState('');
  const [result, setResult] = useState<QueryResult>({ kind: 'idle' });
  const [phase, setPhase] = useState<MutationPhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [latestTxHash, setLatestTxHash] = useState<Hash | null>(null);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1_000));
  const [chainTimeVerified, setChainTimeVerified] = useState(false);
  const [pendingByAsset, setPendingByAsset] = useState<Record<string, NftVaultPendingOperation>>({});
  const pendingByAssetRef = useRef(pendingByAsset);
  pendingByAssetRef.current = pendingByAsset;
  const pendingEphemeralByContextRef = useRef(new Map<string, Record<string, EphemeralPendingEntry>>());
  const operationLockRef = useRef(false);
  const [requestedTokenId, setRequestedTokenId] = useState<string | null>(null);
  const [requestedPoolLink, setRequestedPoolLink] = useState<RequestedPoolLink>({
    tokenId: null,
    collection: null,
    recoveryVault: null,
    chainId: null,
    chainIdInvalid: false,
  });
  const [manualOpen, setManualOpen] = useState(false);
  const autoInspectKeyRef = useRef<string | null>(null);
  const readGenerationRef = useRef(0);
  const inspectRetryTimerRef = useRef<number | null>(null);
  const inspectRetryAttemptRef = useRef(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTokenId = params.get('tokenId');
    const requestedRecoveryVault = params.get('recoveryVault');
    const requestedCollection = params.get('collection');
    const rawChainId = params.get('chainId');
    const parsedChainId = rawChainId === '56' || rawChainId === '97' ? Number(rawChainId) : null;
    setRequestedPoolLink({
      tokenId: requestedTokenId,
      collection: requestedCollection,
      recoveryVault: requestedRecoveryVault,
      chainId: parsedChainId,
      chainIdInvalid: rawChainId !== null && parsedChainId === null,
    });
    setRequestedTokenId(null);
    setTokenIdInput('');
    setRecoveryVaultInput('active');
    setCollectionInput(configuredCollections[0] ?? '');
    if (requestedTokenId && /^\d+$/.test(requestedTokenId)) {
      setRequestedTokenId(requestedTokenId);
      setTokenIdInput(requestedTokenId);
    }
    if (kind === 'cukie_pool' && requestedRecoveryVault && previousPoolVaults.some((vault) => (
      sameAddress(vault.vaultAddress, requestedRecoveryVault)
    ))) setRecoveryVaultInput(requestedRecoveryVault);
    if (requestedCollection && configuredCollections.some((collection) => (
      sameAddress(collection, requestedCollection)
    ))) setCollectionInput(requestedCollection);
  }, [configuredCollectionKey, configuredCollections, kind, previousPoolVaults]);

  const activeVaultAddress = kind === 'cukie_master'
    ? ukiNftVaults.cukieMasterNftVaultAddress
    : ukiNftVaults.cukiePoolNftVaultAddress;
  const selectedPreviousVault = previousPoolVaults.find((vault) => (
    sameAddress(vault.vaultAddress, recoveryVaultInput)
  )) ?? null;
  const vaultAddress = selectedPreviousVault?.vaultAddress ?? activeVaultAddress;
  const writeContextRef = useRef({
    wallet: address ?? null,
    chainId: chainId ?? null,
    vault: vaultAddress ?? null,
  });
  writeContextRef.current = {
    wallet: address ?? null,
    chainId: chainId ?? null,
    vault: vaultAddress ?? null,
  };
  const vaultAbi = kind === 'cukie_master'
    ? cukieMasterNftVaultAbi
    : cukiePoolNftVaultAbi;
  const configuredMode = selectedPreviousVault
    ? 'custodial'
    : kind === 'cukie_master'
    ? ukiNftVaults.mode.cukieMaster
    : ukiNftVaults.mode.cukiePool;
  const configuredReady = selectedPreviousVault
    ? Boolean(ukiNftVaults.chainId && previousPoolVaults.length > 0)
    : kind === 'cukie_master'
    ? ukiNftVaults.ready.cukieMaster
    : ukiNftVaults.ready.cukiePool;
  const pendingContext = useMemo<NftVaultPendingContext | null>(() => {
    if (!ukiNftVaults.chainId || !address || !vaultAddress) return null;
    return {
      chainId: ukiNftVaults.chainId,
      walletAddress: address,
      vaultAddress,
    };
  }, [address, vaultAddress]);
  const pendingKey = pendingContext ? pendingNftVaultStorageKey(pendingContext) : null;

  const pendingOperationsForContext = useCallback((context: NftVaultPendingContext) => {
    const storage = getNftVaultBrowserStorage();
    const storageSnapshot = getNftVaultStorageSnapshot(storage, context);
    const persisted = loadPendingNftVaultOperations(storage, context)
      .filter((operation) => operation.action === 'request_exit' || operation.action === 'withdraw');
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

  const publicConfigReady = Boolean(
    configuredMode === 'custodial'
    && configuredReady
    && ukiNftVaults.chainId
    && vaultAddress
    && isAddress(vaultAddress)
    && ukiNftVaults.collectionConfigInvalid !== true
    && ukiNftVaults.recoveryCollectionConfigInvalid !== true
    && (kind !== 'cukie_pool' || ukiNftVaults.poolRecoveryVaultConfigInvalid !== true)
    && configuredCollections.length > 0
    && configuredCollections.every((collection) => isAddress(collection)),
  );
  const connectedWalletReady = Boolean(isConnected && address && isAddress(address));
  const correctChain = Boolean(
    ukiNftVaults.chainId && chainId === ukiNftVaults.chainId,
  );
  const selectedCollection = useMemo(() => configuredCollections.find((collection) => (
    sameAddress(collection, collectionInput)
  )) ?? null, [collectionInput, configuredCollectionKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tokenIdValid = /^\d+$/.test(tokenIdInput);
  const requestedActivePoolVault = kind === 'cukie_pool'
    && Boolean(
      requestedPoolLink.recoveryVault
      && activeVaultAddress
      && sameAddress(requestedPoolLink.recoveryVault, activeVaultAddress),
    );
  const requestedPreviousPoolVault = kind === 'cukie_pool'
    && Boolean(
      selectedPreviousVault
      && selectedPreviousVault.chainId === ukiNftVaults.chainId
      && requestedPoolLink.recoveryVault
      && sameAddress(requestedPoolLink.recoveryVault, selectedPreviousVault.vaultAddress),
    );
  const linkedPoolPosition = kind !== 'cukie_pool' || Boolean(
    requestedPoolLink.tokenId
    && /^\d+$/.test(requestedPoolLink.tokenId)
    && requestedPoolLink.collection
    && !requestedPoolLink.chainIdInvalid
    && (!requestedPoolLink.chainId || requestedPoolLink.chainId === ukiNftVaults.chainId)
    && selectedCollection
    && sameAddress(requestedPoolLink.collection, selectedCollection)
    && (requestedActivePoolVault || requestedPreviousPoolVault)
  );
  const selectedAssetId = selectedCollection && tokenIdValid && ukiNftVaults.chainId
    ? `${ukiNftVaults.chainId}:${selectedCollection.toLowerCase()}:${tokenIdInput}`
    : null;
  const selectedPendingCandidate = selectedAssetId ? pendingByAsset[selectedAssetId] : null;
  const selectedPending = selectedPendingCandidate
    && (selectedPendingCandidate.action === 'request_exit' || selectedPendingCandidate.action === 'withdraw')
    ? selectedPendingCandidate
    : null;
  const canInspect = Boolean(
    publicConfigReady
    && connectedWalletReady
    && correctChain
    && selectedCollection
    && tokenIdValid
    && !requestedPoolLink.chainIdInvalid
    && (!requestedPoolLink.chainId || requestedPoolLink.chainId === ukiNftVaults.chainId)
    && linkedPoolPosition
    && publicClient
    && !operationLockRef.current
    && phase === 'idle',
  );
  const hasKnownIdentity = Boolean(requestedTokenId && tokenIdValid);
  const readContextKey = [
    kind,
    address ?? '',
    isConnected ? 'connected' : 'disconnected',
    chainId ?? '',
    ukiNftVaults.chainId ?? '',
    vaultAddress ?? '',
    selectedCollection?.toLowerCase() ?? '',
    tokenIdInput,
    requestedPoolLink.tokenId ?? '',
    requestedPoolLink.collection?.toLowerCase() ?? '',
    requestedPoolLink.recoveryVault?.toLowerCase() ?? '',
    requestedPoolLink.chainId ?? '',
    requestedPoolLink.chainIdInvalid ? 'invalid-chain' : '',
  ].join(':');

  useEffect(() => {
    if (configuredCollections.some((collection) => sameAddress(collection, collectionInput))) return;
    setCollectionInput(configuredCollections[0] ?? '');
  }, [collectionInput, configuredCollectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (recoveryVaultInput === 'active' || previousPoolVaults.some((vault) => (
      sameAddress(vault.vaultAddress, recoveryVaultInput)
    ))) return;
    setRecoveryVaultInput('active');
  }, [previousPoolVaults, recoveryVaultInput]);

  useEffect(() => {
    operationLockRef.current = false;
    if (!pendingContext) {
      setPendingByAsset({});
      return;
    }
    const load = () => {
      const operations = pendingOperationsForContext(pendingContext);
      setPendingByAsset(Object.fromEntries(operations.map((operation) => [
        pendingNftVaultOperationAssetKey(operation),
        operation,
      ])));
    };
    load();
    const sync = (event: StorageEvent) => {
      if (event.key !== pendingKey) return;
      pendingEphemeralByContextRef.current.delete(pendingKey!);
      load();
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [pendingContext, pendingKey, pendingOperationsForContext]);

  const persistPending = useCallback((input: {
    action: NftVaultPendingAction;
    phase: NftVaultPendingOperation['phase'];
    assetId: string;
    collectionAddress: Address;
    tokenId: bigint;
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
    if (!storageContext || (input.isCurrent && !input.isCurrent())) return null;
    const canonicalAssetId = canonicalNftVaultAssetId({
      chainId: storageContext.chainId,
      collectionAddress: input.collectionAddress,
      tokenId: input.tokenId.toString(),
    });
    if (!canonicalAssetId || canonicalAssetId !== input.assetId) return null;
    const storage = getNftVaultBrowserStorage();
    const operationKey = pendingNftVaultOperationAssetKey({
      assetId: canonicalAssetId,
      chainId: storageContext.chainId,
      collectionAddress: input.collectionAddress,
      tokenId: input.tokenId.toString(),
    });
    const previous = pendingOperationsForContext(storageContext)
      .find((operation) => pendingNftVaultOperationAssetKey(operation) === operationKey);
    if (input.expectedOperation && !pendingNftVaultOperationMatches(previous, input.expectedOperation)) return null;
    const operation: NftVaultPendingOperation = {
      version: 1,
      ...storageContext,
      assetId: canonicalAssetId,
      collectionAddress: input.collectionAddress,
      tokenId: input.tokenId.toString(),
      action: input.action,
      phase: input.phase,
      txHash: input.txHash,
      createdAt: previous?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      ...(input.depositEpoch ?? previous?.depositEpoch
        ? { depositEpoch: input.depositEpoch ?? previous?.depositEpoch }
        : {}),
    };
    const persisted = savePendingNftVaultOperation(storage, operation);
    const contextKey = pendingNftVaultStorageKey(storageContext);
    const contextEphemeral = pendingEphemeralByContextRef.current.get(contextKey);
    if (persisted) {
      if (contextEphemeral) {
        const next = { ...contextEphemeral };
        delete next[operationKey];
        if (Object.keys(next).length === 0) pendingEphemeralByContextRef.current.delete(contextKey);
        else pendingEphemeralByContextRef.current.set(contextKey, next);
      }
    } else {
      pendingEphemeralByContextRef.current.set(contextKey, {
        ...(contextEphemeral ?? {}),
        [operationKey]: {
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
            .find((item) => pendingNftVaultOperationAssetKey(item) === operationKey);
          if (!pendingNftVaultOperationMatches(currentOperation, input.expectedOperation)) return current;
        }
        return { ...current, [operationKey]: operation };
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
        const contextKey = pendingNftVaultStorageKey(storageContext);
        const contextEphemeral = pendingEphemeralByContextRef.current.get(contextKey);
        if (contextEphemeral) {
          const operationKey = pendingNftVaultOperationAssetKey(input.expectedOperation);
          const mirror = contextEphemeral[operationKey]?.operation;
          if (pendingNftVaultOperationMatches(mirror, input.expectedOperation)) {
            const next = { ...contextEphemeral };
            delete next[operationKey];
            if (Object.keys(next).length === 0) pendingEphemeralByContextRef.current.delete(contextKey);
            else pendingEphemeralByContextRef.current.set(contextKey, next);
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
    readGenerationRef.current += 1;
    autoInspectKeyRef.current = null;
    inspectRetryAttemptRef.current = 0;
    if (inspectRetryTimerRef.current !== null) {
      window.clearTimeout(inspectRetryTimerRef.current);
      inspectRetryTimerRef.current = null;
    }
    setResult({ kind: 'idle' });
    setPhase('idle');
    setNotice(null);
    setLatestTxHash(null);
    setChainTimeVerified(false);
  }, [readContextKey]);

  useEffect(() => () => {
    readGenerationRef.current += 1;
    autoInspectKeyRef.current = null;
    if (inspectRetryTimerRef.current !== null) window.clearTimeout(inspectRetryTimerRef.current);
  }, []);

  const withdrawableAt = result.kind === 'position'
    ? result.position.withdrawableAt
    : BigInt(0);
  useEffect(() => {
    if (
      kind !== 'cukie_pool'
      || withdrawableAt === BigInt(0)
      || BigInt(nowSeconds) >= withdrawableAt
    ) return;
    if (!publicClient || typeof publicClient.getBlock !== 'function') return;
    const secondsUntilCutoff = Number(withdrawableAt - BigInt(nowSeconds));
    const timer = window.setTimeout(() => {
      publicClient.getBlock({ blockTag: 'latest' })
        .then((block) => {
          const blockSeconds = Number(block.timestamp);
          if (!Number.isSafeInteger(blockSeconds)) return;
          setNowSeconds(blockSeconds);
          setChainTimeVerified(true);
        })
        .catch(() => setChainTimeVerified(false));
    }, Math.min(Math.max(secondsUntilCutoff, 1), 15) * 1_000);
    return () => window.clearTimeout(timer);
  }, [kind, nowSeconds, publicClient, withdrawableAt]);

  async function readPosition(
    identity: { collection: Address; tokenId: bigint },
    isCurrent: () => boolean = () => true,
  ) {
    if (!publicClient || !vaultAddress) throw new Error('CLIENT_NOT_READY');
    if (!isCurrent()) throw new Error(READ_CONTEXT_CHANGED);
    const allowed = await publicClient.readContract({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: 'collectionAllowed',
      args: [identity.collection],
    });
    if (!isCurrent()) throw new Error(READ_CONTEXT_CHANGED);
    if (typeof allowed !== 'boolean') throw new Error('INVALID_ALLOWLIST_RESPONSE');

    const rawPosition = await publicClient.readContract({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: 'positionOf',
      args: [identity.collection, identity.tokenId],
    });
    if (!isCurrent()) throw new Error(READ_CONTEXT_CHANGED);
    const position = parsePosition(
      kind,
      identity.collection,
      identity.tokenId,
      rawPosition,
      allowed,
    );
    if (!position) throw new Error('INVALID_POSITION_RESPONSE');

    if (typeof publicClient.getBlock === 'function') {
      try {
        const block = await publicClient.getBlock({ blockTag: 'latest' });
        if (!isCurrent()) throw new Error(READ_CONTEXT_CHANGED);
        const blockSeconds = Number(block.timestamp);
        if (Number.isSafeInteger(blockSeconds)) {
          setNowSeconds(blockSeconds);
          setChainTimeVerified(true);
        }
      } catch {
        if (!isCurrent()) throw new Error(READ_CONTEXT_CHANGED);
        setNowSeconds(Math.floor(Date.now() / 1_000));
        setChainTimeVerified(false);
      }
    } else {
      if (!isCurrent()) throw new Error(READ_CONTEXT_CHANGED);
      setNowSeconds(Math.floor(Date.now() / 1_000));
      setChainTimeVerified(false);
    }
    return position;
  }

  function applyPosition(position: OnChainPosition) {
    if (position.beneficialOwner.toLowerCase() === ZERO_ADDRESS) {
      setResult({ kind: 'not_found' });
      return;
    }
    if (!sameAddress(position.beneficialOwner, address)) {
      setResult({ kind: 'wrong_owner', beneficialOwner: position.beneficialOwner });
      return;
    }
    setResult({ kind: 'position', position });
  }

  function scheduleInspectRetry(readGeneration: number) {
    if (inspectRetryTimerRef.current !== null || readGenerationRef.current !== readGeneration) return;
    const delay = INSPECT_RETRY_DELAYS_MS[Math.min(
      inspectRetryAttemptRef.current,
      INSPECT_RETRY_DELAYS_MS.length - 1,
    )];
    inspectRetryAttemptRef.current += 1;
    inspectRetryTimerRef.current = window.setTimeout(() => {
      inspectRetryTimerRef.current = null;
      if (readGenerationRef.current !== readGeneration || !canInspect) return;
      autoInspectKeyRef.current = autoInspectKey;
      void inspectPosition();
    }, delay);
  }

  function cancelInspectRetry() {
    inspectRetryAttemptRef.current = 0;
    if (inspectRetryTimerRef.current !== null) {
      window.clearTimeout(inspectRetryTimerRef.current);
      inspectRetryTimerRef.current = null;
    }
  }

  async function inspectPosition() {
    if (!canInspect || !selectedCollection || !tokenIdValid) return;
    const readGeneration = readGenerationRef.current;
    const isCurrentRead = () => readGenerationRef.current === readGeneration;
    const identity = { collection: selectedCollection, tokenId: BigInt(tokenIdInput) };
    if (!isCurrentRead()) return;
    setPhase('checking');
    setNotice(null);
    setLatestTxHash(selectedPending?.txHash ?? null);
    try {
      let pending = selectedPending;
      let receiptConfirmed = pending?.phase === 'syncing_projection';
      let receiptEpochVerified = !pending?.depositEpoch;
      if (pending?.phase === 'awaiting_receipt') {
        try {
          const receipt = await publicClient!.getTransactionReceipt({ hash: pending.txHash });
          if (!isCurrentRead()) return;
          if (receipt.status === 'reverted') {
            clearPending(pending.assetId, {
              context: {
                wallet: pending.walletAddress,
                chainId: pending.chainId,
                vault: pending.vaultAddress,
              },
              expectedOperation: pending,
              isCurrent: isCurrentRead,
            });
            pending = null;
            setNotice('La transacción pendiente fue revertida. Ya puedes volver a intentarlo.');
          } else if (receipt.status === 'success') {
            if (pending.action !== 'withdraw' || !pending.depositEpoch) receiptEpochVerified = true;
            if (pending.action === 'withdraw' && pending.depositEpoch) {
              const withdrawnEpoch = kind === 'cukie_master'
                ? withdrawnEpochFromMasterReceipt(receipt, pending)
                : withdrawnEpochFromReceipt(receipt, pending);
              receiptEpochVerified = withdrawnEpoch === pending.depositEpoch;
            }
            const pendingCanonicalAssetId = canonicalNftVaultAssetId({
              chainId: pending.chainId,
              collectionAddress: pending.collectionAddress,
              tokenId: pending.tokenId,
            }) ?? pending.assetId;
            if (receiptEpochVerified) {
              pending = persistPending({
                action: pending.action,
                phase: 'syncing_projection',
                assetId: pendingCanonicalAssetId,
                collectionAddress: pending.collectionAddress as Address,
                tokenId: BigInt(pending.tokenId),
                txHash: pending.txHash,
                depositEpoch: pending.depositEpoch,
                context: {
                  wallet: pending.walletAddress,
                  chainId: pending.chainId,
                  vault: pending.vaultAddress,
                },
                expectedOperation: pending,
                isCurrent: isCurrentRead,
              }) ?? pending;
              receiptConfirmed = true;
            }
          } else {
            receiptConfirmed = false;
          }
        } catch {
          if (!isCurrentRead()) return;
          setNotice('La transacción sigue pendiente o aún no tiene recibo. No repitas la operación.');
        }
      }
      if (
        pending?.phase === 'syncing_projection'
        && pending.action === 'withdraw'
      ) {
        try {
          if (typeof publicClient!.getTransactionReceipt !== 'function') {
            receiptEpochVerified = false;
          } else {
            const receipt = await publicClient!.getTransactionReceipt({ hash: pending.txHash });
            if (!isCurrentRead()) return;
            if (receipt.status === 'reverted') {
              clearPending(pending.assetId, {
                context: {
                  wallet: pending.walletAddress,
                  chainId: pending.chainId,
                  vault: pending.vaultAddress,
                },
                expectedOperation: pending,
                isCurrent: isCurrentRead,
              });
              pending = null;
              receiptConfirmed = false;
              receiptEpochVerified = false;
              setNotice('La transacción pendiente fue revertida. Ya puedes volver a intentarlo.');
            } else if (receipt.status === 'success' && pending.depositEpoch) {
              const withdrawnEpoch = kind === 'cukie_master'
                ? withdrawnEpochFromMasterReceipt(receipt, pending)
                : withdrawnEpochFromReceipt(receipt, pending);
              receiptEpochVerified = withdrawnEpoch === pending.depositEpoch;
            } else {
              receiptEpochVerified = receipt.status === 'success';
            }
          }
        } catch {
          if (!isCurrentRead()) return;
          receiptEpochVerified = false;
        }
      }
      const position = await readPosition(identity, isCurrentRead);
      if (!isCurrentRead()) return;
      applyPosition(position);
      if (pending) {
        const sameEpoch = !pending.depositEpoch
          || pending.action === 'withdraw' && position.beneficialOwner.toLowerCase() === ZERO_ADDRESS
          || pending.depositEpoch === position.depositEpoch.toString();
        const reflected = pending.action === 'withdraw'
          ? receiptConfirmed && receiptEpochVerified && position.beneficialOwner.toLowerCase() === ZERO_ADDRESS && sameEpoch
          : receiptConfirmed && position.withdrawableAt > BigInt(0) && sameEpoch;
        if (reflected) {
          cancelInspectRetry();
          clearPending(pending.assetId, {
            context: {
              wallet: pending.walletAddress,
              chainId: pending.chainId,
              vault: pending.vaultAddress,
            },
            expectedOperation: pending,
            isCurrent: isCurrentRead,
          });
          setNotice(pending.action === 'withdraw'
            ? 'La retirada pendiente ya está confirmada en el contrato.'
            : 'La solicitud de salida pendiente ya está confirmada en el contrato.');
        } else if (pending.phase === 'syncing_projection') {
          scheduleInspectRetry(readGeneration);
          setNotice('La transacción está confirmada, pero el estado del vault aún no refleja el cambio. No la repitas.');
        } else if (pending.phase === 'awaiting_receipt') {
          scheduleInspectRetry(readGeneration);
          setNotice('La transacción sigue pendiente o aún no tiene recibo. No repitas la operación.');
        }
      } else {
        cancelInspectRetry();
      }
    } catch (caught) {
      if (!isCurrentRead()) return;
      setResult({
        kind: 'error',
        message: 'No se pudo validar la posición directamente en el contrato. No se habilita ninguna firma.',
      });
      scheduleInspectRetry(readGeneration);
    } finally {
      if (isCurrentRead()) setPhase('idle');
    }
  }

  const autoInspectKey = [
    kind,
    address ?? '',
    chainId ?? '',
    vaultAddress ?? '',
    selectedCollection?.toLowerCase() ?? '',
    requestedTokenId ?? '',
    selectedPending?.txHash ?? '',
  ].join(':');

  useEffect(() => {
    if (!hasKnownIdentity || !canInspect || !selectedCollection || !requestedTokenId || phase !== 'idle') return;
    if (autoInspectKeyRef.current === autoInspectKey) return;
    autoInspectKeyRef.current = autoInspectKey;
    void inspectPosition();
    // The key ref prevents duplicate reads under Strict Mode and while the
    // requested card settles its wallet/configuration context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, autoInspectKey, canInspect, hasKnownIdentity, phase, requestedTokenId, selectedCollection]);

  function retryKnownPosition() {
    if (!hasKnownIdentity || !canInspect) return;
    cancelInspectRetry();
    autoInspectKeyRef.current = autoInspectKey;
    void inspectPosition();
  }

  function knownPositionRefreshButton(label: string) {
    return (
      <button
        type="button"
        disabled={!canInspect || phase !== 'idle'}
        onClick={retryKnownPosition}
        className="min-h-9 rounded-[7px] border border-[var(--uki-lilac-border)] px-3 text-xs font-black uppercase text-[var(--uki-lilac)] disabled:opacity-50"
      >
        {label}
      </button>
    );
  }

  async function execute(operation: 'request_exit' | 'withdraw') {
    const currentGuard = operationGuardRef.current;
    if (
      result.kind !== 'position'
      || !publicConfigReady
      || !connectedWalletReady
      || !correctChain
      || !publicClient
      || !vaultAddress
      || !ukiNftVaults.chainId
      || phase !== 'idle'
      || operationLockRef.current
      || !selectedAssetId
      || Boolean(selectedPending)
      || !sameAddress(result.position.beneficialOwner, address)
    ) return;

    const isPool = kind === 'cukie_pool';
    const expectedPosition = result.position;
    const expectedAssetId = selectedAssetId;
    const expectedCollection = expectedPosition.collection;
    const expectedTokenId = expectedPosition.tokenId;
    const expectedDepositEpoch = expectedPosition.depositEpoch.toString();
    const exitRequested = expectedPosition.withdrawableAt > BigInt(0);
    let withdrawalReady = exitRequested
      && chainTimeVerified
      && BigInt(nowSeconds) >= expectedPosition.withdrawableAt;
    if (
      (operation === 'request_exit' && (!isPool || exitRequested))
      || (operation === 'withdraw' && isPool && !withdrawalReady)
    ) return;

    operationLockRef.current = true;
    let submittedHash: Hash | null = null;
    let submittedOperation: NftVaultPendingOperation | null = null;
    let submittedReceipt: { status: string; transactionHash?: Hash; logs?: unknown } | null = null;
    let transactionReverted = false;
    try {
      if (
        operation === 'withdraw'
        && isPool
        && typeof publicClient.getBlock === 'function'
      ) {
        try {
          const latestBlock = await publicClient.getBlock({ blockTag: 'latest' });
          const latestBlockSeconds = Number(latestBlock.timestamp);
          if (!Number.isSafeInteger(latestBlockSeconds)) return;
          setNowSeconds(latestBlockSeconds);
          setChainTimeVerified(true);
          withdrawalReady = BigInt(latestBlockSeconds) >= expectedPosition.withdrawableAt;
          if (!withdrawalReady) return;
        } catch {
          setChainTimeVerified(false);
          setNotice('No pudimos verificar la hora del último bloque. No se ha enviado ninguna transacción.');
          return;
        }
      }

      setPhase(operation === 'request_exit' ? 'requesting_exit' : 'withdrawing');
      setNotice(null);
      setLatestTxHash(null);
      if (!address || !ukiNftVaults.chainId || !vaultAddress) {
        throw new Error('RECOVERY_OPERATION_CONTEXT_CHANGED');
      }
      const expectedContext: NftTransactionContext = {
        wallet: address,
        chainId: ukiNftVaults.chainId,
        vault: vaultAddress,
      };
      const identityMatches = () => nftTransactionContextMatches(expectedContext, writeContextRef.current);
      const operationReady = () => operationGuardRef.current.ready && identityMatches();
      const isCurrentContext = (callbackCurrent: boolean) => (
        callbackCurrent && identityMatches()
      );
      const operationForSubmittedHash = () => {
        if (!submittedHash) return selectedPending ?? undefined;
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
          collectionAddress: expectedCollection,
          tokenId: expectedTokenId.toString(),
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
            collectionAddress: expectedCollection,
            tokenId: expectedTokenId.toString(),
            assetId: assetKey ?? '',
          })
        ) return submittedOperation;
        return undefined;
      };
      const request = {
        chainId: ukiNftVaults.chainId,
        address: vaultAddress,
        abi: vaultAbi,
        functionName: operation === 'request_exit' ? 'requestExit' : 'withdraw',
        args: [expectedCollection, expectedTokenId],
        account: expectedContext.wallet,
      };
      await executeNftTransaction({
        request,
        client: publicClient as unknown as NftTransactionClient,
        guard: currentGuard,
        expectedContext,
        currentContext: () => nftTransactionContextFromNullable(writeContextRef.current),
        isReady: () => operationGuardRef.current.ready,
        write: (nextRequest) => writeContractAsync(nextRequest as Parameters<typeof writeContractAsync>[0]),
        errorPrefix: 'RECOVERY_OPERATION',
        onSubmitted: (hash, isCurrent) => {
          submittedHash = hash;
          if (isCurrentContext(isCurrent)) setLatestTxHash(hash);
          submittedOperation = persistPending({
            action: operation,
            phase: 'awaiting_receipt',
            assetId: expectedAssetId,
            collectionAddress: expectedCollection,
            tokenId: expectedTokenId,
            txHash: hash,
            depositEpoch: expectedDepositEpoch,
            context: expectedContext,
            updateUi: isCurrentContext(isCurrent),
          });
        },
        onReverted: (isCurrent) => {
          transactionReverted = true;
          const operationForClear = operationForSubmittedHash();
          if (!operationForClear) return;
          clearPending(expectedAssetId, {
            context: expectedContext,
            expectedOperation: operationForClear,
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
            action: operation,
            phase: 'awaiting_receipt',
            assetId: expectedAssetId,
            collectionAddress: expectedCollection,
            tokenId: expectedTokenId,
            txHash: replacement.replacementHash,
            depositEpoch: expectedDepositEpoch,
            context: expectedContext,
            expectedOperation: originalOperation,
            updateUi: isCurrentContext(isCurrent),
          });
        },
        onConfirmed: (hash, isCurrent, receipt) => {
          submittedReceipt = receipt;
          const operationForConfirm = operationForSubmittedHash();
          if (!operationForConfirm) return;
          submittedOperation = persistPending({
            action: operation,
            phase: 'syncing_projection',
            assetId: expectedAssetId,
            collectionAddress: expectedCollection,
            tokenId: expectedTokenId,
            txHash: hash,
            depositEpoch: expectedDepositEpoch,
            context: expectedContext,
            expectedOperation: operationForConfirm,
            updateUi: isCurrentContext(isCurrent),
          });
        },
      });
      if (!operationReady()) throw new Error('RECOVERY_OPERATION_CONTEXT_CHANGED_AFTER_RECEIPT');
      setPhase('idle');
      setNotice(operation === 'request_exit'
        ? 'Salida confirmada en BSC. Comprobando directamente la fecha de retirada; no repitas la operación.'
        : 'Retirada confirmada en BSC. Comprobando que el NFT volvió a tu wallet; no repitas la operación.');
      void runtime.refreshAfterTransaction(isPool ? 'pool' : 'master').catch(() => undefined);
      try {
        const position = await readPosition({
          collection: expectedCollection,
          tokenId: expectedTokenId,
        }, identityMatches);
        if (!identityMatches()) throw new Error('RECOVERY_OPERATION_CONTEXT_CHANGED');
        applyPosition(position);
        const settledHash: Hash | null = submittedHash as Hash | null;
        const settledReceipt = submittedReceipt as { status: string; transactionHash?: Hash; logs?: unknown } | null;
        const currentPending = pendingOperationsForContext({
          walletAddress: expectedContext.wallet,
          chainId: expectedContext.chainId,
          vaultAddress: expectedContext.vault,
        }).find((candidate) => (
          pendingNftVaultOperationAssetKey(candidate) === expectedAssetId
          && settledHash
          && candidate.txHash.toLowerCase() === settledHash.toLowerCase()
        ));
        let withdrawalEpochVerified = !currentPending?.depositEpoch;
        if (operation === 'withdraw' && currentPending?.depositEpoch) {
          const receiptForVerification = settledReceipt
            && settledReceipt.transactionHash?.toLowerCase() === settledHash?.toLowerCase()
            ? settledReceipt
            : null;
          if (receiptForVerification) {
            const withdrawnEpoch = kind === 'cukie_master'
              ? withdrawnEpochFromMasterReceipt(receiptForVerification, currentPending)
              : withdrawnEpochFromReceipt(receiptForVerification, currentPending);
            withdrawalEpochVerified = withdrawnEpoch === currentPending.depositEpoch;
          } else if (typeof publicClient.getTransactionReceipt === 'function' && settledHash) {
            try {
              const receipt = await publicClient.getTransactionReceipt({ hash: settledHash });
              if (!identityMatches()) throw new Error('RECOVERY_OPERATION_CONTEXT_CHANGED');
              const withdrawnEpoch = kind === 'cukie_master'
                ? withdrawnEpochFromMasterReceipt(receipt, currentPending)
                : withdrawnEpochFromReceipt(receipt, currentPending);
              withdrawalEpochVerified = withdrawnEpoch === currentPending.depositEpoch;
            } catch (caught) {
              if (!identityMatches()) throw caught;
              withdrawalEpochVerified = false;
            }
          }
        }
        const sameEpoch = !currentPending?.depositEpoch
          || operation === 'withdraw'
          || currentPending.depositEpoch === position.depositEpoch.toString();
        const reflected = operation === 'withdraw'
          ? withdrawalEpochVerified && position.beneficialOwner.toLowerCase() === ZERO_ADDRESS && sameEpoch
          : position.withdrawableAt > BigInt(0) && sameEpoch;
        if (reflected && currentPending) {
          clearPending(expectedAssetId, {
            context: expectedContext,
            expectedOperation: currentPending,
            isCurrent: identityMatches,
          });
        }
        if (reflected) {
          setNotice(operation === 'request_exit'
            ? 'Salida confirmada en BSC. La fecha retirable se ha leído directamente del contrato.'
            : 'Retirada confirmada en BSC. El NFT ha vuelto a tu wallet.');
        }
        else setNotice('La transacción está confirmada, pero el estado del vault aún no refleja el cambio. No la repitas.');
      } catch {
        if (!identityMatches()) throw new Error('RECOVERY_OPERATION_CONTEXT_CHANGED');
        scheduleInspectRetry(readGenerationRef.current);
        setNotice('La transacción está confirmada, pero no pudimos releer el vault. Queda bloqueada hasta que vuelvas a comprobarla.');
      }
    } catch (reason) {
      if (!address || !vaultAddress || !ukiNftVaults.chainId
        || !nftTransactionContextMatches({ wallet: address, chainId: ukiNftVaults.chainId, vault: vaultAddress }, writeContextRef.current)) return;
      if (submittedHash && !transactionReverted) {
        setNotice('La transacción ya fue enviada y sigue pendiente de comprobación. No la repitas.');
      } else {
        setResult({
          kind: 'error',
          message: transactionReverted
            ? 'La transacción fue revertida por el contrato. Ya puedes volver a comprobar e intentarlo.'
            : recoveryTransactionError(reason),
        });
      }
    } finally {
      if (address && ukiNftVaults.chainId && vaultAddress
        && nftTransactionContextMatches({ wallet: address, chainId: ukiNftVaults.chainId, vault: vaultAddress }, writeContextRef.current)) {
        setPhase('idle');
      }
      operationLockRef.current = false;
    }
  }

  const exitRequested = result.kind === 'position'
    && result.position.withdrawableAt > BigInt(0);
  const withdrawalReady = exitRequested
    && result.kind === 'position'
    && chainTimeVerified
    && BigInt(nowSeconds) >= result.position.withdrawableAt;
  const explorerTxUrl = latestTxHash ? getNftVaultExplorerTxUrl(latestTxHash) : null;

  return (
    <details
      id={kind === 'cukie_pool' ? 'pool-recovery' : 'master-recovery'}
      open={Boolean(requestedTokenId) || manualOpen}
      onToggle={(event) => {
        setManualOpen(event.currentTarget.open);
        if (!event.currentTarget.open) setRequestedTokenId(null);
      }}
      className="group mt-6 rounded-[8px] border border-[var(--uki-lilac-border)] bg-black/25 p-5"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="uki-label">{kind === 'cukie_pool' ? 'Salida del Cukie Pool' : 'Posición existente'}</span>
          <span className="mt-2 block font-headline text-lg font-black uppercase text-[var(--uki-cream)]">
            {kind === 'cukie_master' ? 'Gestionar un Cukie de Cukie Master' : 'Retirar del Cukie Pool'}
          </span>
        </span>
        <span aria-hidden="true" className="text-xl font-black text-[var(--uki-lilac)] transition-transform group-open:rotate-45">
          +
        </span>
      </summary>

      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
          Comprueba el estado de una posición depositada y solicita su salida o retírala cuando esté disponible.
        </p>

      {requestedPoolLink.chainIdInvalid ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-amber-300">
          Este enlace no identifica una red BSC válida. Vuelve a abrir la posición desde Mis Cukies.
        </p>
      ) : !publicConfigReady ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-amber-300">
          No podemos verificar esta posición o la red. La operación permanece bloqueada.
        </p>
      ) : !connectedWalletReady ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-amber-300">
          Conecta la wallet EVM propietaria de la posición para continuar.
        </p>
      ) : !correctChain ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-amber-300">
          Cambia tu wallet a la red BSC configurada antes de consultar o firmar.
        </p>
      ) : null}

      {kind === 'cukie_pool' && !linkedPoolPosition ? (
        requestedPoolLink.chainIdInvalid ? null : (
          <p role="alert" className="mt-4 text-sm font-semibold text-amber-300">
            Abre esta pantalla desde la ficha del Cukie en Mis Cukies para consultar su posición.
          </p>
        )
      ) : (
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)_auto] sm:items-end">
        {kind === 'cukie_pool' ? (
          <div className="grid gap-1.5 text-xs font-black uppercase text-[var(--uki-muted)]">
            Cukie
            <div className="flex min-h-11 items-center rounded-[7px] border border-white/15 bg-black/25 px-3 text-sm font-semibold normal-case text-[var(--uki-text)]">
              #{tokenIdInput}
            </div>
          </div>
        ) : configuredCollections.length === 1 ? (
          <div className="grid gap-1.5 text-xs font-black uppercase text-[var(--uki-muted)]">
            Colección
            <div
              aria-label="Colección NFT"
              className="flex min-h-11 items-center rounded-[7px] border border-white/15 bg-black/25 px-3 font-mono text-xs font-semibold normal-case text-[var(--uki-text)]"
            >
              <span className="break-all">{configuredCollections[0]}</span>
            </div>
          </div>
        ) : (
          <label className="grid gap-1.5 text-xs font-black uppercase text-[var(--uki-muted)]">
            Colección
            <select
              aria-label="Colección NFT"
              value={collectionInput}
              disabled={!publicConfigReady || phase !== 'idle'}
              onChange={(event) => setCollectionInput(event.target.value)}
              className="h-11 rounded-[7px] border border-white/15 bg-black/40 px-3 text-sm font-semibold normal-case text-[var(--uki-text)] disabled:opacity-50"
            >
              {configuredCollections.map((collection) => (
                <option key={collection.toLowerCase()} value={collection}>
                  {shortAddress(collection)}
                </option>
              ))}
            </select>
          </label>
        )}
        {hasKnownIdentity ? (
          <div className="sm:col-span-2 flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-[7px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] px-3 py-2 text-sm font-semibold text-[var(--uki-text)]" role="status" aria-live="polite">
            {phase === 'checking' ? (
              <span>Consultando automáticamente esta posición…</span>
            ) : result.kind === 'idle' && requestedPoolLink.chainIdInvalid ? (
              <span>El enlace no identifica una red BSC válida.</span>
            ) : result.kind === 'idle' && !publicConfigReady ? (
              <span>Esperando una configuración pública válida para consultar.</span>
            ) : result.kind === 'idle' && !connectedWalletReady ? (
              <span>Esperando que conectes la wallet propietaria.</span>
            ) : result.kind === 'idle' && !correctChain ? (
              <span>Esperando que cambies a la red BSC configurada.</span>
            ) : result.kind === 'idle' ? (
              <span>Preparando la consulta automática de esta posición…</span>
            ) : result.kind === 'error' ? (
              <>
                <span>No se pudo cargar esta posición.</span>
                {knownPositionRefreshButton('Reintentar consulta')}
              </>
            ) : result.kind === 'not_found' ? (
              <>
                <span>No hay una posición abierta para este Cukie.</span>
                {knownPositionRefreshButton('Actualizar posición')}
              </>
            ) : result.kind === 'wrong_owner' ? (
              <>
                <span>La posición está vinculada a otra wallet.</span>
                {knownPositionRefreshButton('Actualizar posición')}
              </>
            ) : (
              <>
                <span>Posición cargada desde tu Cukie seleccionado.</span>
                {knownPositionRefreshButton('Actualizar posición')}
              </>
            )}
          </div>
        ) : (
          <>
            <label className="grid gap-1.5 text-xs font-black uppercase text-[var(--uki-muted)]">
              Número del Cukie (Token ID)
              <input
                aria-label="Número del Cukie (Token ID)"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={tokenIdInput}
                readOnly={kind === 'cukie_pool'}
                disabled={!publicConfigReady || phase !== 'idle'}
                onChange={(event) => setTokenIdInput(event.target.value.trim())}
                className="h-11 rounded-[7px] border border-white/15 bg-black/40 px-3 text-sm font-semibold normal-case text-[var(--uki-text)] disabled:opacity-50"
              />
            </label>
            <button
              type="button"
              disabled={!canInspect}
              onClick={() => void inspectPosition()}
              className="h-11 rounded-[7px] border border-[var(--uki-lilac-border)] px-4 text-xs font-black uppercase text-[var(--uki-lilac)] disabled:opacity-50"
            >
              {phase === 'checking' ? 'Comprobando…' : 'Comprobar posición'}
            </button>
          </>
        )}
      </div>
      )}

      {result.kind === 'not_found' ? (
        <p role="status" className="mt-4 text-sm font-semibold text-[var(--uki-muted)]">
          Ese NFT no tiene una posición abierta en este vault.
        </p>
      ) : null}
      {result.kind === 'wrong_owner' ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-amber-300">
          La posición pertenece a otra wallet ({shortAddress(result.beneficialOwner)}). No se habilita ninguna firma.
        </p>
      ) : null}
      {result.kind === 'error' ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-amber-300">{result.message}</p>
      ) : null}
      {result.kind === 'position' ? (
        <div className="mt-4 rounded-[7px] border border-white/10 bg-black/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-[var(--uki-cream)]">Cukie #{result.position.tokenId.toString()}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">
                Propietario verificado
              </p>
              {!result.position.collectionCurrentlyAllowed ? (
                <p className="mt-1 text-xs font-semibold text-amber-300">
                  La colección ya no admite depósitos, pero la salida de esta posición sigue disponible.
                </p>
              ) : null}
            </div>
            {kind === 'cukie_master' ? (
              <button
                type="button"
                disabled={phase !== 'idle' || !correctChain || !connectedWalletReady || Boolean(selectedPending)}
                onClick={() => void execute('withdraw')}
                className="rounded-[7px] bg-[var(--uki-lilac)] px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-50"
              >
                {phase === 'withdrawing' ? 'Retirando…' : 'Retirar de Cukie Master'}
              </button>
            ) : !exitRequested ? (
              <button
                type="button"
                disabled={phase !== 'idle' || !correctChain || !connectedWalletReady || Boolean(selectedPending)}
                onClick={() => void execute('request_exit')}
                className="rounded-[7px] border border-white/15 px-4 py-2 text-xs font-black uppercase text-[var(--uki-text)] disabled:opacity-50"
              >
                {phase === 'requesting_exit' ? 'Solicitando…' : 'Solicitar salida del Cukie Pool'}
              </button>
            ) : withdrawalReady ? (
              <button
                type="button"
                disabled={phase !== 'idle' || !correctChain || !connectedWalletReady || Boolean(selectedPending)}
                onClick={() => void execute('withdraw')}
                className="rounded-[7px] bg-[var(--uki-lilac)] px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-50"
              >
                {phase === 'withdrawing' ? 'Retirando…' : 'Retirar del Cukie Pool'}
              </button>
            ) : (
              <div className="max-w-xs text-right text-xs text-amber-300">
                <span className="font-black uppercase">
                  {chainTimeVerified
                    ? `Retirable desde ${utcTimestampLabel(result.position.withdrawableAt)} UTC`
                    : 'No se pudo verificar la hora del último bloque; vuelve a comprobar la posición.'}
                </span>
                {chainTimeVerified && result.position.exitRequestedAt > BigInt(0) ? (
                  <span className="mt-1 block font-semibold normal-case text-[var(--uki-muted)]">
                    Solicitud registrada el {utcTimestampLabel(result.position.exitRequestedAt)} UTC. El plazo se fijó al solicitar la salida; podrás retirarlo desde la fecha indicada.
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {Object.values(pendingByAsset).length > 0 ? (
        <div role="status" aria-live="polite" className="mt-4 grid gap-2 rounded-[7px] border border-amber-300/25 bg-amber-300/5 p-3 text-xs font-semibold text-amber-100">
          {Object.values(pendingByAsset).map((pending) => (
            <p key={pending.assetId}>
              Cukie #{pending.tokenId}: {pending.phase === 'syncing_projection'
                ? 'operación confirmada en cadena y bloqueada hasta comprobar el estado final.'
                : 'operación enviada y bloqueada hasta comprobar su resultado.'}
              {' '}<a href={getNftVaultExplorerTxUrl(pending.txHash) ?? '#'} target="_blank" rel="noreferrer" className="font-black text-[var(--uki-lilac)] underline">Ver transacción</a>.
              {' '}{hasKnownIdentity && pending.tokenId === requestedTokenId
                ? 'Esta posición se volverá a comprobar automáticamente.'
                : 'Introduce ese Token ID y pulsa «Comprobar posición» para reconciliarla.'}
            </p>
          ))}
        </div>
      ) : null}

      {notice ? (
        <p role="status" className="mt-4 text-sm font-semibold text-[var(--uki-lilac)]">
          {notice}
          {explorerTxUrl ? (
            <> {' '}<a href={explorerTxUrl} target="_blank" rel="noreferrer" className="underline">Ver transacción</a></>
          ) : null}
        </p>
      ) : null}
      </div>
    </details>
  );
}
