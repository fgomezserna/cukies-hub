'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!user?.walletAddress) {
      setStatus(null);
      return;
    }
    setLoading(true);
    try {
      setStatus(await requestStatus(user.walletAddress, signal));
    } finally {
      setLoading(false);
    }
  }, [user?.walletAddress]);

  useEffect(() => {
    if (authLoading || !user?.walletAddress) return;
    const controller = new AbortController();
    void refresh(controller.signal).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) setStatus(null);
    });
    return () => controller.abort();
  }, [authLoading, refresh, user?.walletAddress]);

  const assets = useMemo(() => (status?.nftInventory ?? []).filter((asset) => (
    asset.canDeposit || asset.canWithdraw || asset.custody === 'cukie_master_nft_vault'
  )), [status?.nftInventory]);
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
  const identityReady = Boolean(
    configMatches
    && walletMatches
    && correctChain
    && publicClient
    && ukiNftVaults.cukieMasterNftVaultAddress,
  );
  const depositsReady = Boolean(identityReady && serverConfig?.indexer.status === 'ready');

  async function writeAndConfirm(input: Parameters<typeof writeContractAsync>[0]) {
    if (!publicClient) throw new Error('PUBLIC_CLIENT_UNAVAILABLE');
    const hash = await writeContractAsync(input);
    setLatestTxHash(hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('TRANSACTION_REVERTED');
    return hash;
  }

  async function mutate(asset: PublicNft, operation: Operation) {
    if (
      !user?.walletAddress
      || !address
      || activeAssetId
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
    let confirmed = false;
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
          });
        }
        setPhase('depositing');
        await writeAndConfirm({
          chainId: ukiNftVaults.chainId,
          address: vaultAddress,
          abi: cukieMasterNftVaultAbi,
          functionName: 'deposit',
          args: [collection, tokenId],
        });
      } else {
        if (!asset.canWithdraw) throw new Error('WITHDRAW_NOT_ALLOWED');
        setPhase('withdrawing');
        await writeAndConfirm({
          chainId: ukiNftVaults.chainId,
          address: vaultAddress,
          abi: cukieMasterNftVaultAbi,
          functionName: 'withdraw',
          args: [collection, tokenId],
        });
      }
      confirmed = true;
      setPhase('syncing');
      setNotice('Transacción confirmada en BSC. Actualizando el estado indexado…');
      await refresh();
      window.dispatchEvent(new Event('cukies:cukie-master:refresh'));
      setNotice('Transacción confirmada. Si el indexador aún no la muestra, actualiza en unos segundos; no repitas la operación.');
    } catch {
      setError(confirmed
        ? 'La transacción está confirmada, pero aún no puede verificarse su proyección. No la repitas.'
        : 'La wallet rechazó la operación o la transacción no pudo confirmarse.');
    } finally {
      setPhase('idle');
      setActiveAssetId(null);
    }
  }

  if (ukiNftVaults.mode.cukieMaster === 'legacy') return null;

  return (
    <section className="uki-container relative z-[2] min-w-0 pb-8">
      <Panel className="min-w-0" innerClassName="min-w-0 p-5 sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Custodia NFT</p>
        <h2 className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)] sm:text-3xl">
          Staking de Cukies para Cukie Master
        </h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
          El Cukie entra físicamente en el contrato y deja de poder venderse, transferirse o jugarse. La retirada es inmediata y los créditos ya ganados se conservan.
        </p>

        {!configMatches ? (
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
          {loading ? (
            <p role="status" className="flex items-center gap-2 text-sm font-semibold text-[var(--uki-text)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando inventario custodial…
            </p>
          ) : assets.length === 0 ? (
            <p className="text-sm font-semibold text-[var(--uki-muted)]">No hay Cukies Originales disponibles o depositados para esta wallet.</p>
          ) : assets.map((asset) => {
            const working = activeAssetId === asset.assetId;
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
                  {asset.canDeposit ? (
                    <button type="button" disabled={!depositsReady || Boolean(activeAssetId)} onClick={() => void mutate(asset, 'deposit')} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[7px] border border-[var(--uki-cyan-border)] px-3 text-xs font-black uppercase text-[var(--uki-cyan)] disabled:cursor-not-allowed disabled:opacity-50">
                      {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4" aria-hidden="true" />}
                      {working && phase === 'approving' ? 'Aprobando' : working ? 'Depositando' : 'Hacer staking'}
                    </button>
                  ) : asset.canWithdraw ? (
                    <button type="button" disabled={!identityReady || Boolean(activeAssetId)} onClick={() => void mutate(asset, 'withdraw')} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[7px] border border-white/15 px-3 text-xs font-black uppercase text-[var(--uki-text)] disabled:cursor-not-allowed disabled:opacity-50">
                      {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Unlock className="h-4 w-4" aria-hidden="true" />}
                      {working ? 'Retirando' : 'Retirar inmediatamente'}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

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
