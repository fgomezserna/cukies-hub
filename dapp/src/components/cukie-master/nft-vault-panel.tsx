'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, LockKeyhole, Unlock } from 'lucide-react';
import { isAddress, type Address, type Hash } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';

import { CukiImage } from '@/components/legacy-marketplace/cuki-image';
import { Panel } from '@/components/landing/primitives';
import { NftVaultRecoveryPanel } from '@/components/nft-vault/recovery-panel';
import {
  cukieMasterNftVaultAbi,
  ukiNftVaults,
  type UkiNftVaultMode,
} from '@/lib/contracts/uki-nft-vaults';
import {
  clearPendingNftVaultOperation,
  getNftVaultBrowserStorage,
  loadPendingNftVaultOperations,
  pendingNftVaultStorageKey,
  projectionMatchesPendingOperation,
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
  canDeposit: boolean;
  canWithdraw: boolean;
};

type PublicNftCustody = {
  mode: UkiNftVaultMode;
  chainId: 56 | 97 | null;
  vaultAddress: string | null;
  collectionAddresses: string[];
  explorerBaseUrl: string | null;
  indexer: { status: 'ready' | 'unavailable' };
};

type PublicStatus = {
  nftInventory: PublicNft[];
  nftCustody: PublicNftCustody;
};

type Operation = 'deposit' | 'withdraw';
type Phase = 'idle' | 'approving' | 'depositing' | 'withdrawing' | 'syncing';

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
    owner_mismatch: 'La propiedad on-chain no coincide con esta wallet',
    unknown_owner: 'Propietario pendiente de verificar',
  } as Record<string, string>)[blocker ?? ''] ?? 'Este Cukie no es apto para la ruta Cukie Master';
}

function pendingLabel(operation: NftVaultPendingOperation) {
  if (operation.phase === 'approval_confirmed') return 'Continuar staking';
  if (operation.phase === 'syncing_projection') {
    return operation.action === 'withdraw' ? 'Actualizando retirada…' : 'Actualizando staking…';
  }
  return ({
    approval: 'Confirmando aprobación…',
    deposit: 'Confirmando depósito…',
    request_exit: 'Confirmando solicitud de salida…',
    withdraw: 'Confirmando retirada…',
  } as const)[operation.action];
}

async function requestStatus(walletAddress: string, signal?: AbortSignal) {
  const response = await fetch(
    `/api/economy/v1/cukie-master?walletAddress=${encodeURIComponent(walletAddress)}`,
    { cache: 'no-store', credentials: 'same-origin', signal },
  );
  const body = await response.json() as { data?: PublicStatus };
  if (!response.ok || !body.data) throw new Error('CUKIE_MASTER_UNAVAILABLE');
  return body.data;
}

export function CukieMasterNftVaultPanel() {
  const { user, isLoading: authLoading, walletType } = useAuth();
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: ukiNftVaults.chainId ?? undefined });
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestTxHash, setLatestTxHash] = useState<Hash | null>(null);
  const [pendingByAsset, setPendingByAsset] = useState<Record<string, NftVaultPendingOperation>>({});
  const [hydratedPendingKey, setHydratedPendingKey] = useState<string | null>(null);
  const operationLocksRef = useRef(new Set<string>());
  const refreshRequestIdRef = useRef(0);

  const refresh = useCallback(async (signal?: AbortSignal, background = false) => {
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    if (!user?.walletAddress) {
      setStatus(null);
      return null;
    }
    if (!background) setLoading(true);
    try {
      const nextStatus = await requestStatus(user.walletAddress, signal);
      if (refreshRequestIdRef.current !== requestId) return null;
      setStatus(nextStatus);
      return nextStatus;
    } catch (reason) {
      if (
        refreshRequestIdRef.current === requestId
        && !(reason instanceof DOMException && reason.name === 'AbortError')
      ) setStatus(null);
      throw reason;
    } finally {
      if (refreshRequestIdRef.current === requestId) setLoading(false);
    }
  }, [user?.walletAddress]);

  useEffect(() => {
    if (authLoading || !user?.walletAddress) return;
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [authLoading, refresh, user?.walletAddress]);

  const assets = useMemo(() => status?.nftInventory ?? [], [status?.nftInventory]);
  const eligibleAssetCount = useMemo(
    () => assets.filter((asset) => asset.canDeposit || asset.canWithdraw).length,
    [assets],
  );
  const pendingWithoutInventory = useMemo(
    () => Object.values(pendingByAsset).filter((operation) => (
      !assets.some((asset) => asset.assetId === operation.assetId)
    )),
    [assets, pendingByAsset],
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
  const pendingContext = useMemo<NftVaultPendingContext | null>(() => {
    if (!ukiNftVaults.chainId || !ukiNftVaults.cukieMasterNftVaultAddress || !user?.walletAddress) return null;
    return {
      chainId: ukiNftVaults.chainId,
      walletAddress: user.walletAddress,
      vaultAddress: ukiNftVaults.cukieMasterNftVaultAddress,
    };
  }, [user?.walletAddress]);
  const pendingKey = useMemo(
    () => pendingContext ? pendingNftVaultStorageKey(pendingContext) : null,
    [pendingContext],
  );
  const pendingHydrated = Boolean(pendingKey && hydratedPendingKey === pendingKey);
  const identityReady = Boolean(
    configMatches
    && walletMatches
    && correctChain
    && publicClient
    && ukiNftVaults.cukieMasterNftVaultAddress,
  );
  const depositsReady = Boolean(identityReady && serverConfig?.indexer.status === 'ready');

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

  const persistPending = useCallback((input: {
    asset: PublicNft;
    action: NftVaultPendingAction;
    phase: NftVaultPendingPhase;
    txHash: Hash;
  }) => {
    if (!pendingContext || !input.asset.collectionAddress || !input.asset.tokenId) return null;
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
    if (!status) return;
    for (const operation of Object.values(pendingByAsset)) {
      const asset = status.nftInventory.find((candidate) => candidate.assetId === operation.assetId);
      if (projectionMatchesPendingOperation(operation, asset)) clearPending(operation.assetId);
    }
  }, [clearPending, pendingByAsset, status]);

  useEffect(() => {
    if (!pendingHydrated || !pendingContext || !publicClient || !user?.walletAddress) return;
    const operations = Object.values(pendingByAsset);
    if (operations.length === 0) return;
    let disposed = false;
    let running = false;

    const reconcile = async () => {
      if (running || disposed) return;
      running = true;
      try {
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
              asset: {
                assetId: operation.assetId,
                canonicalAssetId: operation.assetId,
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
              },
              action: operation.action,
              phase: operation.action === 'approval' ? 'approval_confirmed' : 'syncing_projection',
              txHash: operation.txHash,
            });
          } catch {
            // A receipt that is not available yet remains pending and is retried.
          }
        }

        if (operations.some((item) => item.phase === 'syncing_projection')) {
          try {
            if (!disposed) await refresh(undefined, true);
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
  }, [clearPending, pendingByAsset, pendingContext, pendingHydrated, persistPending, publicClient, refresh, user?.walletAddress]);

  async function writeAndConfirm(
    input: Parameters<typeof writeContractAsync>[0],
    asset: PublicNft,
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

  async function mutate(asset: PublicNft, operation: Operation) {
    if (
      !user?.walletAddress
      || !address
      || operationLocksRef.current.has(asset.assetId)
      || (pendingByAsset[asset.assetId] && pendingByAsset[asset.assetId].phase !== 'approval_confirmed')
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
      setError('La identidad on-chain no es verificable; la operación permanece bloqueada.');
      return;
    }

    const collection = asset.collectionAddress as Address;
    const vaultAddress = ukiNftVaults.cukieMasterNftVaultAddress;
    const tokenId = BigInt(asset.tokenId);
    operationLocksRef.current.add(asset.assetId);
    setActiveAssetId(asset.assetId);
    setError(null);
    setNotice(null);
    setLatestTxHash(null);
    try {
      if (operation === 'deposit') {
        if (!asset.canDeposit || !publicClient) throw new Error('DEPOSIT_NOT_ALLOWED');
        const [owner, approved, approvedForAll] = await Promise.all([
          publicClient.readContract({ address: collection, abi: erc721CustodyAbi, functionName: 'ownerOf', args: [tokenId] }),
          publicClient.readContract({ address: collection, abi: erc721CustodyAbi, functionName: 'getApproved', args: [tokenId] }),
          publicClient.readContract({ address: collection, abi: erc721CustodyAbi, functionName: 'isApprovedForAll', args: [address, vaultAddress] }),
        ]);
        if (!sameAddress(owner, address)) throw new Error('WALLET_IS_NOT_OWNER');
        if (!sameAddress(approved, vaultAddress) && approvedForAll !== true) {
          setPhase('approving');
          await writeAndConfirm({
            chainId: ukiNftVaults.chainId,
            address: collection,
            abi: erc721CustodyAbi,
            functionName: 'approve',
            args: [vaultAddress, tokenId],
          }, asset, 'approval');
        }
        setPhase('depositing');
        await writeAndConfirm({
          chainId: ukiNftVaults.chainId,
          address: vaultAddress,
          abi: cukieMasterNftVaultAbi,
          functionName: 'deposit',
          args: [collection, tokenId],
        }, asset, 'deposit');
      } else {
        if (!asset.canWithdraw) throw new Error('WITHDRAW_NOT_ALLOWED');
        setPhase('withdrawing');
        await writeAndConfirm({
          chainId: ukiNftVaults.chainId,
          address: vaultAddress,
          abi: cukieMasterNftVaultAbi,
          functionName: 'withdraw',
          args: [collection, tokenId],
        }, asset, 'withdraw');
      }
      setPhase('syncing');
      setNotice('Transacción confirmada en BSC. Actualizando el estado indexado…');
      const nextStatus = await refresh(undefined, true);
      window.dispatchEvent(new Event('cukies:cukie-master:refresh'));
      const persisted = loadPendingNftVaultOperations(getNftVaultBrowserStorage(), pendingContext)
        .find((item) => item.assetId === asset.assetId);
      const projected = Boolean(
        persisted
        && nextStatus
        && projectionMatchesPendingOperation(
          persisted,
          nextStatus.nftInventory.find((candidate) => candidate.assetId === asset.assetId),
        )
      );
      if (projected) clearPending(asset.assetId);
      setNotice(projected
        ? 'Operación confirmada y reflejada en el inventario.'
        : 'Transacción confirmada. Estamos actualizando el inventario; no repitas la operación.');
    } catch {
      const persisted = pendingContext
        ? loadPendingNftVaultOperations(getNftVaultBrowserStorage(), pendingContext)
          .find((item) => item.assetId === asset.assetId)
        : null;
      if (persisted) {
        setNotice(persisted.phase === 'approval_confirmed'
          ? 'La aprobación quedó confirmada. Pulsa «Continuar staking» cuando quieras reanudar el depósito.'
          : 'La operación ya tiene transacción. Seguiremos comprobándola automáticamente; no la repitas.');
      } else {
        setError('La wallet rechazó la operación antes de crear una transacción, o la transacción fue revertida.');
      }
    } finally {
      setPhase('idle');
      setActiveAssetId(null);
      operationLocksRef.current.delete(asset.assetId);
    }
  }

  if (ukiNftVaults.mode.cukieMaster === 'legacy') return null;

  return (
    <section id="cukie-master-nft-staking" className="uki-container relative z-[2] min-w-0 scroll-mt-28 pb-8">
      <Panel className="min-w-0" innerClassName="min-w-0 p-5 sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Custodia NFT</p>
        <h2 className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)] sm:text-3xl">
          Staking de Cukies para Cukie Master
        </h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
          El Cukie entra físicamente en el contrato y deja de poder venderse, transferirse o jugarse. La retirada es inmediata y los créditos ya ganados se conservan.
        </p>
        {status ? (
          <p className="mt-3 text-xs font-semibold text-[var(--uki-muted)]">
            {assets.length} Cukies detectados · {eligibleAssetCount} aptos para esta ruta
          </p>
        ) : null}

        {serverConfig && !configMatches ? (
          <p role="alert" className="mt-5 flex gap-2 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-semibold text-amber-100">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
            La configuración pública y la del servidor no coinciden. Los depósitos están bloqueados.
          </p>
        ) : null}
        {serverConfig?.indexer.status === 'unavailable' ? (
          <p role="alert" className="mt-4 flex gap-2 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-semibold text-amber-100">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
            El indexador NFT no está saludable. No se permiten nuevos depósitos; la recuperación on-chain sigue disponible.
          </p>
        ) : null}
        {configMatches && !walletMatches ? (
          <p className="mt-4 text-sm font-semibold text-[var(--uki-text)]">Conecta en EVM la misma wallet autenticada para operar.</p>
        ) : null}
        {walletMatches && !correctChain ? (
          <p className="mt-4 text-sm font-semibold text-amber-200">Cambia tu wallet a BSC Testnet para operar.</p>
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
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando inventario custodial…
            </p>
          ) : !user?.walletAddress ? (
            <p className="text-sm font-semibold text-[var(--uki-text)]">
              Conecta y autentica tu wallet EVM para consultar tus Cukies y gestionar el staking NFT.
            </p>
          ) : status && assets.length === 0 ? (
            <p className="text-sm font-semibold text-[var(--uki-muted)]">No hay Cukies Originales disponibles o depositados para esta wallet.</p>
          ) : !status ? (
            <p role="alert" className="text-sm font-semibold text-amber-200">
              No se pudo verificar el inventario custodial. Los depósitos permanecen bloqueados; la recuperación on-chain sigue disponible.
            </p>
          ) : assets.map((asset) => {
            const working = activeAssetId === asset.assetId;
            const pending = pendingByAsset[asset.assetId];
            const pendingLocked = Boolean(pending && pending.phase !== 'approval_confirmed');
            return (
              <article key={asset.assetId} className="overflow-hidden rounded-[10px] border border-white/10 bg-[#07131d]">
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
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      {pendingLabel(pending)}
                    </button>
                  ) : asset.canDeposit ? (
                    <button type="button" disabled={!depositsReady || !pendingHydrated || Boolean(activeAssetId)} onClick={() => void mutate(asset, 'deposit')} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[7px] border border-[var(--uki-cyan-border)] px-3 text-xs font-black uppercase text-[var(--uki-cyan)] disabled:cursor-not-allowed disabled:opacity-50">
                      {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4" aria-hidden="true" />}
                      {working && phase === 'approving'
                        ? 'Aprobando'
                        : working
                          ? 'Depositando'
                          : pending
                            ? pendingLabel(pending)
                            : 'Hacer staking'}
                    </button>
                  ) : asset.canWithdraw ? (
                    <button type="button" disabled={!identityReady || !pendingHydrated || Boolean(activeAssetId)} onClick={() => void mutate(asset, 'withdraw')} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[7px] border border-white/15 px-3 text-xs font-black uppercase text-[var(--uki-text)] disabled:cursor-not-allowed disabled:opacity-50">
                      {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Unlock className="h-4 w-4" aria-hidden="true" />}
                      {working ? 'Retirando' : 'Retirar inmediatamente'}
                    </button>
                  ) : (
                    <p className="mt-4 flex min-h-11 w-full items-center justify-center rounded-[7px] border border-white/10 px-3 text-center text-xs font-black text-[var(--uki-muted)]">
                      {blockerLabel(asset.blockers[0])}
                    </p>
                  )}
                  {pending?.txHash && serverConfig?.explorerBaseUrl ? (
                    <a href={`${serverConfig.explorerBaseUrl}/tx/${pending.txHash}`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-black text-[var(--uki-cyan)] underline">
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
            {pendingWithoutInventory.map((pending) => (
              <p key={pending.assetId}>
                Cukie #{pending.tokenId}: {pendingLabel(pending)}. Sigue bloqueado mientras confirmamos su estado.
                {serverConfig?.explorerBaseUrl ? (
                  <> {' '}<a href={`${serverConfig.explorerBaseUrl}/tx/${pending.txHash}`} target="_blank" rel="noreferrer" className="font-black text-[var(--uki-cyan)] underline">Ver transacción</a></>
                ) : null}
              </p>
            ))}
          </div>
        ) : null}

        {latestTxHash && serverConfig?.explorerBaseUrl ? (
          <a href={`${serverConfig.explorerBaseUrl}/tx/${latestTxHash}`} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-black text-[var(--uki-cyan)] underline">
            Ver última transacción
          </a>
        ) : null}
      </Panel>
      <NftVaultRecoveryPanel kind="cukie_master" />
    </section>
  );
}
