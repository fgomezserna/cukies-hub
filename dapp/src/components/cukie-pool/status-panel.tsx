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
import { CukiImage } from '@/components/legacy-marketplace/cuki-image';
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
  imageUrl: string | null;
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
  imageUrl: string | null;
  generation: PoolGeneration | null;
  rarity: PoolRarity | null;
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
    <div className="mt-4 border-t border-white/10 pt-3">
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

            <div className="grid min-w-0 gap-px overflow-hidden rounded-[12px] border border-white/10 bg-white/10 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
              <section className="min-w-0 bg-[#120a1c] p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] text-[var(--uki-lilac)]">
                    <Gamepad2 className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">
                      En el pool · {openPositions.length} en total
                    </p>
                    <h3 className="mt-2 text-balance font-headline text-2xl font-black leading-tight text-[var(--uki-cream)] sm:text-3xl">
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

              <section className="min-w-0 bg-[#0d0914] p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-[var(--uki-lilac)]">
                    <WalletCards className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">En tu wallet</p>
                    <h3 className="mt-2 font-headline text-2xl font-black leading-tight text-[var(--uki-cream)] sm:text-3xl">
                      {status.availableAssets.length} {status.availableAssets.length === 1 ? 'Cukie para aportar' : 'Cukies para aportar'}
                    </h3>
                    <p className="mt-2 text-sm font-semibold text-[var(--uki-muted)]">
                      {availableOriginalCount} {availableOriginalCount === 1 ? 'Original' : 'Originales'} · {availableSecondGenerationCount} de Segunda Generación
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <PoolMovements
              activating={activatingCount}
              leaving={leavingCount}
              withdrawable={withdrawableCount}
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
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {status.availableAssets.map((asset) => {
                    const working = mutatingAssetId === asset.assetId;
                    const pending = pendingByAsset[asset.assetId];
                    const pendingLocked = Boolean(pending && pending.phase !== 'approval_confirmed');
                    const gamesPerDay = dailyGamesCapacity(asset.generation, asset.rarity);
                    return (
                    <article key={asset.assetId} className="min-w-0 overflow-hidden rounded-[12px] border border-white/10 bg-[#0d0914] transition-transform duration-200 active:scale-[0.99] sm:grid sm:grid-cols-[11rem_minmax(0,1fr)]">
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
                                ? pendingLabel(pending)
                                : 'Aportar este Cukie'}
                        </button>
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
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {openPositions.map((position) => {
                    const working = mutatingAssetId === position.assetId;
                    const pending = pendingByAsset[position.assetId];
                    const confirmingExit = exitConfirmationId === position.positionId;
                    return (
                    <article key={position.positionId} className="min-w-0 overflow-hidden rounded-[12px] border border-white/10 bg-[#0d0914]">
                      <div className="grid min-w-0 sm:grid-cols-[10.5rem_minmax(0,1fr)]">
                        <div className="relative aspect-[4/3] min-w-0 overflow-hidden border-b border-white/10 bg-[#160d21] sm:aspect-auto sm:min-h-[15.5rem] sm:border-b-0 sm:border-r">
                          <CukiImage
                            src={position.imageUrl}
                            alt={`Cukie #${position.tokenId}`}
                            sizes="(min-width: 1280px) 168px, (min-width: 640px) 30vw, 92vw"
                            className="object-contain p-3"
                          />
                          <span className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${positionStatusClass(position.status)}`}>
                            {position.status === 'active' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                            {position.status === 'pending' || position.status === 'exit_requested' ? <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                            {position.status === 'withdrawable' ? <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                            {statusLabel(position.status)}
                          </span>
                        </div>

                        <div className="min-w-0 p-4 sm:p-5">
                          <h4 className="truncate font-headline text-lg font-black text-[var(--uki-cream)]">Cukie #{position.tokenId}</h4>
                          <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">
                            {position.generation && position.rarity
                              ? `${generationLabel(position.generation)} · ${rarityLabel(position.rarity)}`
                              : 'NFT de tu colección'}
                          </p>
                          <PositionSchedule position={position} />
                        </div>
                      </div>

                      <div className="min-w-0 border-t border-white/10 bg-white/[0.025] p-4 sm:p-5">
                        {position.status === 'active' && position.ownerRewardEligible ? (
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

                        {position.lifecycleOpen && (position.status === 'pending' || position.status === 'active') ? (
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
                                  {pending ? pendingLabel(pending) : working ? 'Confirmando salida' : 'Confirmar salida'}
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
                              {pending ? pendingLabel(pending) : position.status === 'pending' ? 'Cancelar aportación' : 'Solicitar devolución'}
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
                            {pending ? pendingLabel(pending) : working ? 'Confirmando retirada' : 'Retirar a mi wallet'}
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
}: {
  activating: number;
  leaving: number;
  withdrawable: number;
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
