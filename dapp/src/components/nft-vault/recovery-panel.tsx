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
  clearPendingNftVaultOperation,
  getNftVaultBrowserStorage,
  loadPendingNftVaultOperations,
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
      const operations = loadPendingNftVaultOperations(getNftVaultBrowserStorage(), pendingContext)
        .filter((operation) => operation.action === 'request_exit' || operation.action === 'withdraw');
      setPendingByAsset(Object.fromEntries(operations.map((operation) => [operation.assetId, operation])));
    };
    load();
    const sync = (event: StorageEvent) => {
      if (event.key === pendingKey) load();
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [pendingContext, pendingKey]);

  const persistPending = useCallback((input: {
    action: NftVaultPendingAction;
    phase: NftVaultPendingOperation['phase'];
    assetId: string;
    collectionAddress: Address;
    tokenId: bigint;
    txHash: Hash;
    context?: NftTransactionContext;
    updateUi?: boolean;
  }) => {
    const storageContext = input.context
      ? {
        chainId: input.context.chainId,
        walletAddress: input.context.wallet,
        vaultAddress: input.context.vault,
      }
      : pendingContext;
    if (!storageContext) return null;
    const previous = input.context
      ? loadPendingNftVaultOperations(getNftVaultBrowserStorage(), storageContext)
        .find((operation) => operation.assetId === input.assetId)
      : pendingByAsset[input.assetId];
    const operation: NftVaultPendingOperation = {
      version: 1,
      ...storageContext,
      assetId: input.assetId,
      collectionAddress: input.collectionAddress,
      tokenId: input.tokenId.toString(),
      action: input.action,
      phase: input.phase,
      txHash: input.txHash,
      createdAt: previous?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    savePendingNftVaultOperation(getNftVaultBrowserStorage(), operation);
    if (input.updateUi !== false) {
      setPendingByAsset((current) => ({ ...current, [operation.assetId]: operation }));
    }
    return operation;
  }, [pendingByAsset, pendingContext]);

  const clearPending = useCallback((assetId: string, input: { context?: NftTransactionContext; updateUi?: boolean } = {}) => {
    const storageContext = input.context
      ? {
        chainId: input.context.chainId,
        walletAddress: input.context.wallet,
        vaultAddress: input.context.vault,
      }
      : pendingContext;
    if (storageContext) {
      clearPendingNftVaultOperation(getNftVaultBrowserStorage(), storageContext, assetId);
    }
    if (input.updateUi === false) return;
    setPendingByAsset((current) => {
      const next = { ...current };
      delete next[assetId];
      return next;
    });
  }, [pendingContext]);

  useEffect(() => {
    readGenerationRef.current += 1;
    autoInspectKeyRef.current = null;
    setResult({ kind: 'idle' });
    setPhase('idle');
    setNotice(null);
    setLatestTxHash(null);
    setChainTimeVerified(false);
  }, [readContextKey]);

  useEffect(() => () => {
    readGenerationRef.current += 1;
    autoInspectKeyRef.current = null;
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
      if (pending?.phase === 'awaiting_receipt') {
        try {
          const receipt = await publicClient!.getTransactionReceipt({ hash: pending.txHash });
          if (!isCurrentRead()) return;
          if (receipt.status === 'reverted') {
            clearPending(pending.assetId);
            pending = null;
            setNotice('La transacción pendiente fue revertida. Ya puedes volver a intentarlo.');
          } else {
            pending = persistPending({
              action: pending.action,
              phase: 'syncing_projection',
              assetId: pending.assetId,
              collectionAddress: pending.collectionAddress as Address,
              tokenId: BigInt(pending.tokenId),
              txHash: pending.txHash,
            }) ?? pending;
          }
        } catch {
          if (!isCurrentRead()) return;
          setNotice('La transacción sigue pendiente o aún no tiene recibo. No repitas la operación.');
        }
      }
      const position = await readPosition(identity, isCurrentRead);
      if (!isCurrentRead()) return;
      applyPosition(position);
      if (pending) {
        const reflected = pending.action === 'withdraw'
          ? position.beneficialOwner.toLowerCase() === ZERO_ADDRESS
          : position.withdrawableAt > BigInt(0);
        if (reflected) {
          clearPending(pending.assetId);
          setNotice(pending.action === 'withdraw'
            ? 'La retirada pendiente ya está confirmada en el contrato.'
            : 'La solicitud de salida pendiente ya está confirmada en el contrato.');
        } else if (pending.phase === 'syncing_projection') {
          setNotice('La transacción está confirmada, pero el estado del vault aún no refleja el cambio. No la repitas.');
        }
      }
    } catch (caught) {
      if (!isCurrentRead()) return;
      setResult({
        kind: 'error',
        message: 'No se pudo validar la posición directamente en el contrato. No se habilita ninguna firma.',
      });
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
    const exitRequested = result.position.withdrawableAt > BigInt(0);
    let withdrawalReady = exitRequested
      && chainTimeVerified
      && BigInt(nowSeconds) >= result.position.withdrawableAt;
    if (
      (operation === 'request_exit' && (!isPool || exitRequested))
      || (operation === 'withdraw' && isPool && !withdrawalReady)
    ) return;

    operationLockRef.current = true;
    let submittedHash: Hash | null = null;
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
          withdrawalReady = BigInt(latestBlockSeconds) >= result.position.withdrawableAt;
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
      const request = {
        chainId: ukiNftVaults.chainId,
        address: vaultAddress,
        abi: vaultAbi,
        functionName: operation === 'request_exit' ? 'requestExit' : 'withdraw',
        args: [result.position.collection, result.position.tokenId],
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
          if (isCurrent) setLatestTxHash(hash);
          persistPending({
            action: operation,
            phase: 'awaiting_receipt',
            assetId: selectedAssetId,
            collectionAddress: result.position.collection,
            tokenId: result.position.tokenId,
            txHash: hash,
            context: expectedContext,
            updateUi: isCurrent,
          });
        },
        onReverted: (isCurrent) => {
          transactionReverted = true;
          clearPending(selectedAssetId, { context: expectedContext, updateUi: isCurrent });
        },
        onConfirmed: (hash, isCurrent) => persistPending({
          action: operation,
          phase: 'syncing_projection',
          assetId: selectedAssetId,
          collectionAddress: result.position.collection,
          tokenId: result.position.tokenId,
          txHash: hash,
          context: expectedContext,
          updateUi: isCurrent,
        }),
      });
      if (!operationReady()) throw new Error('RECOVERY_OPERATION_CONTEXT_CHANGED_AFTER_RECEIPT');
      try {
        await runtime.refreshAfterTransaction(isPool ? 'pool' : 'master');
      } catch {
        // La comprobación directa del contrato sigue siendo la fuente de verdad
        // de la posición aunque la proyección compartida no esté disponible.
      }
      if (!identityMatches()) throw new Error('RECOVERY_OPERATION_CONTEXT_CHANGED');
      if (!operationReady()) throw new Error('RECOVERY_OPERATION_CONTEXT_NOT_READY');

      setNotice(operation === 'request_exit'
        ? 'Salida confirmada en BSC. La fecha retirable se ha vuelto a leer directamente del contrato.'
        : 'Retirada confirmada en BSC. El NFT ha vuelto a tu wallet.');
      try {
        const position = await readPosition({
          collection: result.position.collection,
          tokenId: result.position.tokenId,
        }, identityMatches);
        if (!identityMatches()) throw new Error('RECOVERY_OPERATION_CONTEXT_CHANGED');
        applyPosition(position);
        const reflected = operation === 'withdraw'
          ? position.beneficialOwner.toLowerCase() === ZERO_ADDRESS
          : position.withdrawableAt > BigInt(0);
        if (reflected) clearPending(selectedAssetId);
        else setNotice('La transacción está confirmada, pero el estado del vault aún no refleja el cambio. No la repitas.');
      } catch {
        if (!identityMatches()) throw new Error('RECOVERY_OPERATION_CONTEXT_CHANGED');
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
              Cukie #{pending.tokenId}: operación enviada y bloqueada hasta comprobar su resultado.
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
