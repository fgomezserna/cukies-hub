'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  Lock,
  LogOut,
  Unlock,
} from 'lucide-react';
import { isAddress, type Address, type Hash } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';

import { Panel } from '@/components/landing/primitives';
import {
  cukiePoolNftVaultAbi,
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
  type NftVaultPendingPhase,
} from '@/lib/nft-vault/pending-operations';
import { useAuth } from '@/providers/auth-provider';

const erc721CustodyAbi = [
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'getApproved', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'isApprovedForAll', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] },
] as const;

type PoolGeneration = 'original' | 'second_generation';
type PoolRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'goat';
type PoolPositionStatus = 'pending' | 'active' | 'exit_requested' | 'withdrawable' | 'withdrawn';

type AvailableAsset = {
  assetId: string;
  chain: 'BSC';
  chainId: 56 | 97;
  collectionAddress: string;
  tokenId: string;
  generation: PoolGeneration;
  rarity: PoolRarity;
  custody: 'wallet';
  status: 'available';
  canDeposit: true;
};

type CustodialPosition = {
  source: 'custodial_vault';
  positionId: string;
  assetId: string;
  chain: 'BSC';
  chainId: 56 | 97;
  collectionAddress: string;
  tokenId: string;
  vaultAddress: string;
  beneficiaryNormalized: string;
  depositEpoch: string;
  status: PoolPositionStatus;
  lifecycleOpen: boolean;
  custody: 'cukie_pool_nft_vault' | 'wallet';
  ownerRewardEligible: boolean;
  depositedAt: string;
  activationAt: string;
  depositCalendarVersion: string;
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
  availableAssets: AvailableAsset[];
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
type PendingAsset = Pick<AvailableAsset, 'assetId' | 'collectionAddress' | 'tokenId'>;

const POOL_STATUS_RETRY_MS = 10_000;
const POOL_STATUS_RETRY_WINDOW_MS = 180_000;

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
  if (value === 'exit_requested') return 'Salida programada';
  if (value === 'withdrawable') return 'Listo para retirar';
  return 'Retirado';
}

function pendingLabel(operation: NftVaultPendingOperation) {
  if (operation.phase === 'approval_confirmed') return 'Continuar depósito';
  if (operation.phase === 'syncing_projection') {
    if (operation.action === 'deposit') return 'Actualizando depósito…';
    if (operation.action === 'request_exit') return 'Actualizando salida…';
    return 'Actualizando retirada…';
  }
  return ({
    approval: 'Confirmando aprobación…',
    deposit: 'Confirmando depósito…',
    request_exit: 'Confirmando solicitud…',
    withdraw: 'Confirmando retirada…',
  } as const)[operation.action];
}

function projectionMatchesPoolOperation(
  operation: NftVaultPendingOperation,
  status: PoolStatus,
) {
  if (operation.phase !== 'syncing_projection' || status.mode !== 'custodial_vault') return false;
  const position = status.positions.find((item) => item.assetId === operation.assetId);
  if (operation.action === 'deposit') return Boolean(position?.lifecycleOpen);
  if (operation.action === 'request_exit') {
    return Boolean(position && (
      position.status === 'exit_requested'
      || position.status === 'withdrawable'
      || position.status === 'withdrawn'
    ));
  }
  if (operation.action === 'withdraw') {
    return !position || position.status === 'withdrawn' || !position.lifecycleOpen;
  }
  return false;
}

function scheduleSummary(position: CustodialPosition) {
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
      detail: 'El corte ya terminó y puedes recuperar el NFT ahora.',
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
    <div className="mt-3 rounded-[7px] border border-white/10 bg-white/[0.03] p-3">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">
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
      <span className="h-px w-8 bg-[var(--uki-lilac)]/45" aria-hidden="true" />
      <p className="text-sm font-bold text-[var(--uki-text)]">{label}</p>
    </div>
  );
}

async function requestPoolStatus(walletAddress: string, signal?: AbortSignal) {
  const response = await fetch(
    `/api/economy/v1/cukie-pool?walletAddress=${encodeURIComponent(walletAddress)}`,
    { cache: 'no-store', credentials: 'same-origin', signal },
  );
  const body = await response.json() as { data?: PoolStatus };
  if (!response.ok || !body.data) throw new Error('CUKIE_POOL_UNAVAILABLE');
  return body.data;
}

export function CukiePoolStatusPanel() {
  const { user, isLoading: authLoading, walletType } = useAuth();
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: ukiNftVaults.chainId ?? undefined });
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<PoolStatus | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [mutatingAssetId, setMutatingAssetId] = useState<string | null>(null);
  const [phase, setPhase] = useState<MutationPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exitConfirmationId, setExitConfirmationId] = useState<string | null>(null);
  const [latestTxHash, setLatestTxHash] = useState<Hash | null>(null);
  const [pendingByAsset, setPendingByAsset] = useState<Record<string, NftVaultPendingOperation>>({});
  const [hydratedPendingKey, setHydratedPendingKey] = useState<string | null>(null);
  const retryStartedAtRef = useRef<number | null>(null);
  const operationLocksRef = useRef(new Set<string>());
  const walletOperationLockRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.walletAddress) {
      setStatus(null);
      setLoadState('idle');
      return;
    }
    const controller = new AbortController();
    setLoadState('loading');
    requestPoolStatus(user.walletAddress, controller.signal)
      .then((result) => {
        setStatus(result);
        setLoadState('ready');
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setStatus(null);
        setLoadState('unavailable');
      });
    return () => controller.abort();
  }, [authLoading, reloadNonce, user?.walletAddress]);

  useEffect(() => {
    const shouldRetry = loadState === 'unavailable'
      || (
        loadState === 'ready'
        && status?.mode === 'custodial_vault'
        && status.nftCustody.indexer.status !== 'ready'
      );
    if (authLoading || !user?.walletAddress) {
      retryStartedAtRef.current = null;
      return;
    }
    if (loadState === 'loading') return;
    if (!shouldRetry) {
      retryStartedAtRef.current = null;
      return;
    }
    const startedAt = retryStartedAtRef.current ?? Date.now();
    retryStartedAtRef.current = startedAt;
    if (Date.now() - startedAt >= POOL_STATUS_RETRY_WINDOW_MS) return;
    const timer = window.setTimeout(
      () => setReloadNonce((value) => value + 1),
      POOL_STATUS_RETRY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [authLoading, loadState, status, user?.walletAddress]);

  function refreshStatus() {
    retryStartedAtRef.current = Date.now();
    setReloadNonce((value) => value + 1);
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

  const pendingContext = useMemo<NftVaultPendingContext | null>(() => {
    if (!ukiNftVaults.chainId || !ukiNftVaults.cukiePoolNftVaultAddress || !user?.walletAddress) return null;
    return {
      chainId: ukiNftVaults.chainId,
      walletAddress: user.walletAddress,
      vaultAddress: ukiNftVaults.cukiePoolNftVaultAddress,
    };
  }, [user?.walletAddress]);
  const pendingKey = useMemo(
    () => pendingContext ? pendingNftVaultStorageKey(pendingContext) : null,
    [pendingContext],
  );
  const pendingHydrated = Boolean(pendingKey && hydratedPendingKey === pendingKey);

  const persistPending = useCallback((input: {
    asset: PendingAsset;
    action: NftVaultPendingAction;
    phase: NftVaultPendingPhase;
    txHash: Hash;
  }) => {
    if (!pendingContext) return null;
    const now = Date.now();
    const storage = getNftVaultBrowserStorage();
    const previous = loadPendingNftVaultOperations(storage, pendingContext)
      .find((operation) => operation.assetId === input.asset.assetId);
    const operation: NftVaultPendingOperation = {
      version: 1,
      ...pendingContext,
      assetId: input.asset.assetId,
      collectionAddress: input.asset.collectionAddress,
      tokenId: input.asset.tokenId,
      action: input.action,
      phase: input.phase,
      txHash: input.txHash,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    savePendingNftVaultOperation(storage, operation);
    setPendingByAsset((current) => ({ ...current, [operation.assetId]: operation }));
    return operation;
  }, [pendingContext]);

  const clearPending = useCallback((assetId: string) => {
    if (pendingContext) {
      clearPendingNftVaultOperation(getNftVaultBrowserStorage(), pendingContext, assetId);
    }
    setPendingByAsset((current) => {
      if (!current[assetId]) return current;
      const next = { ...current };
      delete next[assetId];
      return next;
    });
  }, [pendingContext]);

  useEffect(() => {
    operationLocksRef.current.clear();
    setHydratedPendingKey(null);
    if (!pendingContext || !pendingKey) {
      setPendingByAsset({});
      return;
    }
    const operations = loadPendingNftVaultOperations(getNftVaultBrowserStorage(), pendingContext);
    setPendingByAsset(Object.fromEntries(operations.map((operation) => [operation.assetId, operation])));
    setHydratedPendingKey(pendingKey);
  }, [pendingContext, pendingKey]);

  useEffect(() => {
    if (!pendingContext || !pendingKey) return;
    const syncPendingFromStorage = (event: StorageEvent) => {
      if (event.key !== pendingKey) return;
      const operations = loadPendingNftVaultOperations(getNftVaultBrowserStorage(), pendingContext);
      setPendingByAsset(Object.fromEntries(operations.map((operation) => [operation.assetId, operation])));
    };
    window.addEventListener('storage', syncPendingFromStorage);
    return () => window.removeEventListener('storage', syncPendingFromStorage);
  }, [pendingContext, pendingKey]);

  useEffect(() => {
    if (!status) return;
    for (const operation of Object.values(pendingByAsset)) {
      if (projectionMatchesPoolOperation(operation, status)) clearPending(operation.assetId);
    }
  }, [clearPending, pendingByAsset, status]);

  useEffect(() => {
    if (!pendingHydrated || !pendingContext || !publicClient || !user?.walletAddress) return;
    if (Object.keys(pendingByAsset).length === 0) return;
    let disposed = false;
    let running = false;

    const reconcile = async () => {
      if (running || disposed) return;
      running = true;
      try {
        const operations = Object.values(pendingByAsset);
        for (const operation of operations.filter((item) => item.phase === 'awaiting_receipt')) {
          try {
            const receipt = await publicClient.getTransactionReceipt({ hash: operation.txHash });
            if (disposed) return;
            if (receipt.status === 'reverted') {
              clearPending(operation.assetId);
              setError(`La transacción del Cukie #${operation.tokenId} fue revertida. Puedes intentarlo de nuevo.`);
              continue;
            }
            persistPending({
              asset: operation,
              action: operation.action,
              phase: operation.action === 'approval' ? 'approval_confirmed' : 'syncing_projection',
              txHash: operation.txHash,
            });
          } catch {
            // El receipt aún no está disponible y se volverá a consultar.
          }
        }

        if (operations.some((item) => item.phase === 'syncing_projection')) {
          try {
            const refreshed = await requestPoolStatus(user.walletAddress);
            if (disposed) return;
            setStatus(refreshed);
            for (const operation of operations) {
              if (projectionMatchesPoolOperation(operation, refreshed)) {
                clearPending(operation.assetId);
              }
            }
          } catch {
            // La operación confirmada permanece persistida hasta recuperar la proyección.
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
  }, [clearPending, pendingByAsset, pendingContext, pendingHydrated, persistPending, publicClient, user?.walletAddress]);

  async function writeAndConfirm(
    input: Parameters<typeof writeContractAsync>[0],
    asset: PendingAsset,
    action: NftVaultPendingAction,
  ) {
    if (!publicClient) throw new Error('PUBLIC_CLIENT_UNAVAILABLE');
    const hash = await writeContractAsync(input);
    setLatestTxHash(hash);
    persistPending({ asset, action, phase: 'awaiting_receipt', txHash: hash });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      clearPending(asset.assetId);
      throw new Error('TRANSACTION_REVERTED');
    }
    persistPending({
      asset,
      action,
      phase: action === 'approval' ? 'approval_confirmed' : 'syncing_projection',
      txHash: hash,
    });
    return hash;
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
    if (
      !user?.walletAddress
      || !address
      || !depositsReady
      || mutatingAssetId
      || walletOperationLockRef.current
      || operationLocksRef.current.has(asset.assetId)
      || (pendingByAsset[asset.assetId] && pendingByAsset[asset.assetId].phase !== 'approval_confirmed')
      || !pendingHydrated
      || !identity
      || !vaultAddress
      || !ukiNftVaults.chainId
      || !publicClient
    ) return;
    walletOperationLockRef.current = true;
    operationLocksRef.current.add(asset.assetId);
    setMutatingAssetId(asset.assetId);
    setError(null);
    setNotice(null);
    setLatestTxHash(null);
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
        }, asset, 'approval');
      }
      setPhase('depositing');
      await writeAndConfirm({
        chainId: ukiNftVaults.chainId,
        address: vaultAddress,
        abi: cukiePoolNftVaultAbi,
        functionName: 'deposit',
        args: [identity.collection, identity.tokenId],
      }, asset, 'deposit');
      setPhase('syncing');
      setNotice('Depósito confirmado en BSC. Este Cukie seguirá bloqueado mientras actualizamos el inventario; ya puedes operar con otro.');
    } catch {
      const persisted = pendingContext
        ? loadPendingNftVaultOperations(getNftVaultBrowserStorage(), pendingContext)
          .find((item) => item.assetId === asset.assetId)
        : null;
      if (persisted) {
        setNotice(persisted.phase === 'approval_confirmed'
          ? 'La aprobación quedó confirmada. Pulsa «Continuar depósito» cuando quieras reanudar.'
          : 'La operación ya tiene transacción. Seguiremos comprobándola automáticamente; no la repitas.');
      } else {
        setError('La wallet rechazó la operación antes de crear una transacción, o la transacción fue revertida.');
      }
    } finally {
      setPhase('idle');
      setMutatingAssetId(null);
      operationLocksRef.current.delete(asset.assetId);
      walletOperationLockRef.current = false;
    }
  }

  async function mutatePosition(
    position: CustodialPosition,
    operation: 'request_exit' | 'withdraw',
  ) {
    const identity = canonicalIdentity(position);
    const vaultAddress = ukiNftVaults.cukiePoolNftVaultAddress;
    if (
      !user?.walletAddress
      || !identityReady
      || mutatingAssetId
      || walletOperationLockRef.current
      || operationLocksRef.current.has(position.assetId)
      || Boolean(pendingByAsset[position.assetId])
      || !pendingHydrated
      || !identity
      || !vaultAddress
      || !ukiNftVaults.chainId
    ) return;
    walletOperationLockRef.current = true;
    operationLocksRef.current.add(position.assetId);
    setExitConfirmationId(null);
    setMutatingAssetId(position.assetId);
    setError(null);
    setNotice(null);
    setLatestTxHash(null);
    try {
      setPhase(operation === 'request_exit' ? 'requesting_exit' : 'withdrawing');
      await writeAndConfirm({
        chainId: ukiNftVaults.chainId,
        address: vaultAddress,
        abi: cukiePoolNftVaultAbi,
        functionName: operation === 'request_exit' ? 'requestExit' : 'withdraw',
        args: [identity.collection, identity.tokenId],
      }, position, operation);
      setPhase('syncing');
      setNotice(operation === 'request_exit'
        ? 'Salida confirmada en BSC. Este Cukie ya no participa en el reparto y seguirá bloqueado mientras actualizamos su estado.'
        : 'Retirada confirmada en BSC. Estamos actualizando el inventario; ya puedes operar con otro Cukie.');
    } catch {
      const persisted = pendingContext
        ? loadPendingNftVaultOperations(getNftVaultBrowserStorage(), pendingContext)
          .find((item) => item.assetId === position.assetId)
        : null;
      if (persisted) {
        setNotice('La operación ya tiene transacción. Seguiremos comprobándola automáticamente; no la repitas.');
      } else {
        setError('La wallet rechazó la operación o el contrato no permitió completarla.');
      }
    } finally {
      setPhase('idle');
      setMutatingAssetId(null);
      operationLocksRef.current.delete(position.assetId);
      walletOperationLockRef.current = false;
    }
  }

  const custodialStatus = status?.mode === 'custodial_vault' ? status : null;
  const openPositions = custodialStatus?.positions.filter((item) => item.lifecycleOpen) ?? [];
  const activeCount = openPositions.filter((item) => item.status === 'active' && item.ownerRewardEligible).length;
  const activatingCount = openPositions.filter((item) => item.status === 'pending').length;
  const leavingCount = openPositions.filter((item) => item.status === 'exit_requested').length;
  const withdrawableCount = openPositions.filter((item) => item.status === 'withdrawable').length;
  const availableOriginalCount = custodialStatus?.availableAssets.filter((item) => item.generation === 'original').length ?? 0;
  const availableSecondGenerationCount = (custodialStatus?.availableAssets.length ?? 0) - availableOriginalCount;

  return (
    <section id="mi-cukie-pool" className="relative z-[2] w-full pb-10 pt-7">
      <JourneyStep number="01" label="Comprueba tu posición" />
      <Panel className="mt-4" innerClassName="p-5 sm:p-7">
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
            {!walletMatches ? (
              <p role="alert" className="text-sm font-semibold text-amber-300">
                Conecta la misma wallet con la que has iniciado sesión.
              </p>
            ) : null}
            {walletMatches && !correctChain ? (
              <p role="alert" className="text-sm font-semibold text-amber-300">
                Cambia tu wallet a la red correcta para continuar.
              </p>
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

            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
              <section className="min-w-0 rounded-[10px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] p-4 sm:p-5">
                <div className="flex min-w-0 items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Tus Cukies aportados</p>
                    <h3 className="mt-1 text-sm font-bold text-[var(--uki-cream)]">Qué está ocurriendo con ellos</h3>
                  </div>
                  <p className="shrink-0 font-headline text-3xl font-black tabular-nums text-[var(--uki-lilac)]">
                    {openPositions.length}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-white/10 bg-white/10 sm:grid-cols-4">
                  <PoolStateMetric label="Disponibles" value={activeCount} />
                  <PoolStateMetric label="Activándose" value={activatingCount} />
                  <PoolStateMetric label="Saliendo" value={leavingCount} />
                  <PoolStateMetric label="Para retirar" value={withdrawableCount} />
                </div>
              </section>

              <section className="min-w-0 rounded-[10px] border border-white/10 bg-black/20 p-4 sm:p-5">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Listos para aportar</p>
                <p className="mt-2 font-headline text-3xl font-black tabular-nums text-[var(--uki-cream)]">
                  {status.availableAssets.length}
                </p>
                <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-xs font-semibold text-[var(--uki-muted)]">
                  <p className="flex items-center justify-between gap-3"><span>Originales</span><strong className="text-[var(--uki-cream)]">{availableOriginalCount}</strong></p>
                  <p className="flex items-center justify-between gap-3"><span>Segunda Generación</span><strong className="text-[var(--uki-cream)]">{availableSecondGenerationCount}</strong></p>
                </div>
              </section>
            </div>

            <section className="rounded-[10px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] p-4 sm:p-5">
              <p className="text-xs font-black text-[var(--uki-lilac)]">Tu siguiente paso</p>
              {withdrawableCount > 0 ? (
                <NextAction
                  title={`${withdrawableCount === 1 ? 'Tienes un Cukie listo' : `Tienes ${withdrawableCount} Cukies listos`} para volver a tu wallet`}
                  description="La espera ya terminó. Retíralo desde la sección de Cukies aportados."
                  href="#mis-cukies-aportados"
                  label="Ir a retirar"
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
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {status.availableAssets.map((asset) => {
                    const working = mutatingAssetId === asset.assetId;
                    const pending = pendingByAsset[asset.assetId];
                    const pendingLocked = Boolean(pending && pending.phase !== 'approval_confirmed');
                    const gamesPerDay = dailyGamesCapacity(asset.generation, asset.rarity);
                    return (
                    <article key={asset.assetId} className="grid min-w-0 gap-4 rounded-[10px] border border-white/10 bg-black/20 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                      <span className="grid h-12 w-12 place-items-center rounded-full border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] font-headline text-sm font-black text-[var(--uki-lilac)]">
                        #{asset.tokenId.slice(-2)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-[var(--uki-cream)]">Cukie #{asset.tokenId}</p>
                        <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">
                          {generationLabel(asset.generation)} · {rarityLabel(asset.rarity)}
                        </p>
                        <p className="mt-2 text-xs font-bold text-[var(--uki-lilac)]">
                          Hasta {gamesPerDay} {gamesPerDay === 1 ? 'partida' : 'partidas'} por periodo diario
                        </p>
                      </div>
                      <div className="sm:text-right">
                        <button
                          type="button"
                          disabled={Boolean(mutatingAssetId) || pendingLocked || !pendingHydrated || !depositsReady}
                          onClick={() => void deposit(asset)}
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[7px] bg-[var(--uki-lilac)] px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-50"
                        >
                          {working || pendingLocked ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                          {working && phase === 'approving'
                            ? 'Aprobando'
                            : working && phase === 'depositing'
                              ? 'Añadiendo'
                              : pending
                                ? pendingLabel(pending)
                                : 'Añadir al pool'}
                        </button>
                        {pending?.txHash && ukiNftVaults.explorerBaseUrl ? (
                          <a
                            href={`${ukiNftVaults.explorerBaseUrl}/tx/${pending.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block text-xs font-black text-[var(--uki-lilac)] underline"
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

            <div id="mis-cukies-aportados" className="scroll-mt-24 border-t border-white/10 pt-6">
              <JourneyStep number="03" label="Gestiona los Cukies que ya aportaste" />
              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-headline text-xl font-black text-[var(--uki-cream)]">
                    Tus Cukies en el pool
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                    Cada estado te indica si el Cukie puede entrar en partidas y cuándo puedes recuperarlo.
                  </p>
                </div>
                <span className="shrink-0 text-xs font-bold text-[var(--uki-muted)]">
                  {openPositions.length} en el pool
                </span>
              </div>
              {openPositions.length === 0 ? (
                <p className="mt-4 text-sm font-semibold text-[var(--uki-muted)]">Todavía no has aportado ningún Cukie al pool.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {openPositions.map((position) => {
                    const working = mutatingAssetId === position.assetId;
                    const pending = pendingByAsset[position.assetId];
                    const confirmingExit = exitConfirmationId === position.positionId;
                    return (
                    <article key={position.positionId} className="grid min-w-0 gap-4 rounded-[10px] border border-white/10 bg-black/20 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.48fr)] lg:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-[var(--uki-cream)]">Cukie #{position.tokenId}</p>
                            <p className={`mt-1 text-xs font-black ${position.status === 'active' || position.status === 'withdrawable' ? 'text-[var(--uki-lilac)]' : 'text-amber-300'}`}>
                              {statusLabel(position.status)}
                            </p>
                          </div>
                          {position.status === 'active' ? <CheckCircle2 className="h-5 w-5 text-[var(--uki-lilac)]" aria-hidden="true" /> : null}
                          {position.status === 'pending' || position.status === 'exit_requested' ? <Clock3 className="h-5 w-5 text-amber-300" aria-hidden="true" /> : null}
                          {position.status === 'withdrawable' ? <Unlock className="h-5 w-5 text-[var(--uki-lilac)]" aria-hidden="true" /> : null}
                        </div>
                        <PositionSchedule position={position} />
                      </div>

                      <div className="min-w-0 rounded-[8px] border border-white/10 bg-white/[0.025] p-4">
                        {position.status === 'active' && position.ownerRewardEligible ? (
                          <p className="text-xs font-semibold leading-relaxed text-[var(--uki-text)]">
                            Opta al reparto cuando se use en partidas válidas. El importe no es fijo y depende de lo generado por su grupo.
                          </p>
                        ) : position.status === 'pending' ? (
                          <p className="text-xs font-semibold leading-relaxed text-[var(--uki-text)]">
                            Aún no participa. Se activará automáticamente en la fecha indicada.
                          </p>
                        ) : position.status === 'exit_requested' ? (
                          <p className="text-xs font-semibold leading-relaxed text-amber-200">
                            La salida ya está confirmada. No repitas la operación; espera hasta que se habilite la retirada.
                          </p>
                        ) : (
                          <p className="text-xs font-semibold leading-relaxed text-[var(--uki-text)]">
                            Ya puedes devolver este Cukie a tu wallet.
                          </p>
                        )}

                        {position.lifecycleOpen && (position.status === 'pending' || position.status === 'active') ? (
                          confirmingExit ? (
                            <div className="mt-4 border-t border-amber-300/20 pt-4">
                              <p className="text-xs font-semibold leading-relaxed text-amber-200">
                                La salida no se puede cancelar. Desde que la confirmes, este Cukie deja de optar al reparto del periodo actual.
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setExitConfirmationId(null)}
                                  className="min-h-10 rounded-[7px] border border-white/15 px-3 text-xs font-black text-[var(--uki-text)]"
                                >
                                  Volver
                                </button>
                                <button
                                  type="button"
                                  disabled={Boolean(mutatingAssetId) || Boolean(pending) || !pendingHydrated || !identityReady}
                                  onClick={() => void mutatePosition(position, 'request_exit')}
                                  className="inline-flex min-h-10 items-center gap-1.5 rounded-[7px] border border-amber-300/40 bg-amber-300/10 px-3 text-xs font-black text-amber-100 disabled:opacity-50"
                                >
                                  {working || pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                                  {pending ? pendingLabel(pending) : working ? 'Confirmando salida' : 'Confirmar salida'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={Boolean(mutatingAssetId) || Boolean(pending) || !pendingHydrated || !identityReady}
                              onClick={() => setExitConfirmationId(position.positionId)}
                              className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-[7px] border border-white/15 px-3 text-xs font-black text-[var(--uki-text)] disabled:opacity-50"
                            >
                              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                              {pending ? pendingLabel(pending) : position.status === 'pending' ? 'Cancelar aportación' : 'Dejar el pool'}
                            </button>
                          )
                        ) : position.lifecycleOpen && position.status === 'withdrawable' ? (
                          <button
                            type="button"
                            disabled={Boolean(mutatingAssetId) || Boolean(pending) || !pendingHydrated || !identityReady}
                            onClick={() => void mutatePosition(position, 'withdraw')}
                            className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-[7px] bg-[var(--uki-lilac)] px-4 text-xs font-black uppercase text-black disabled:opacity-50"
                          >
                            {working || pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                            {pending ? pendingLabel(pending) : working ? 'Confirmando retirada' : 'Retirar a mi wallet'}
                          </button>
                        ) : null}
                        {pending?.txHash && ukiNftVaults.explorerBaseUrl ? (
                          <a
                            href={`${ukiNftVaults.explorerBaseUrl}/tx/${pending.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block text-xs font-black text-[var(--uki-lilac)] underline"
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

            <div className="border-t border-white/10 pt-5 text-sm font-semibold text-[var(--uki-muted)]">
              ¿Depositaste un Cukie y no aparece aquí?{' '}
              <Link href="/cukie-hodler/recuperar" className="font-black text-[var(--uki-lilac)] hover:underline">
                Abrir la herramienta de recuperación
              </Link>
            </div>

          </div>
        ) : null}
      </Panel>
    </section>
  );
}

function PoolStateMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 bg-[#0d0914] px-3 py-3 text-center">
      <p className="font-headline text-xl font-black tabular-nums text-[var(--uki-cream)]">{value}</p>
      <p className="mt-1 truncate text-[11px] font-bold text-[var(--uki-muted)]">{label}</p>
    </div>
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
