'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
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
import { NftVaultRecoveryPanel } from '@/components/nft-vault/recovery-panel';
import {
  cukiePoolNftVaultAbi,
  ukiNftVaults,
} from '@/lib/contracts/uki-nft-vaults';
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

function statusLabel(value: PoolPositionStatus) {
  if (value === 'pending') return 'Pendiente del próximo periodo';
  if (value === 'active') return 'Activo en el pool';
  if (value === 'exit_requested') return 'Salida solicitada';
  if (value === 'withdrawable') return 'Listo para retirar';
  return 'Retirado';
}

function scheduleSummary(position: CustodialPosition) {
  if (position.status === 'pending') {
    return {
      label: 'Próximo corte y activación',
      timestamp: position.activationAt,
      detail: 'Desde ese corte podrá prestarse y empezará su primer periodo elegible.',
    };
  }
  if (position.status === 'active') {
    return {
      label: 'Activo desde el corte',
      timestamp: position.activationAt,
      detail: 'Ya puede prestarse y participa en el reparto mientras siga elegible.',
    };
  }
  if (position.status === 'exit_requested') {
    return {
      label: 'Próximo corte y retirada',
      timestamp: position.withdrawableAt,
      detail: 'Puede seguir prestándose hasta ese corte, pero ya no participa en el reparto del periodo.',
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
    <>
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
      <dl className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-[var(--uki-muted)]">
        <div className="rounded-full border border-white/10 px-2.5 py-1">
          <dt className="sr-only">Versión del calendario de depósito</dt>
          <dd>Calendario de depósito v{position.depositCalendarVersion}</dd>
        </div>
        {position.exitCalendarVersion ? (
          <div className="rounded-full border border-white/10 px-2.5 py-1">
            <dt className="sr-only">Versión del calendario de salida</dt>
            <dd>Calendario de salida v{position.exitCalendarVersion}</dd>
          </div>
        ) : null}
      </dl>
    </>
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

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
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
  const [latestTxHash, setLatestTxHash] = useState<Hash | null>(null);

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

  async function writeAndConfirm(input: Parameters<typeof writeContractAsync>[0]) {
    if (!publicClient) throw new Error('PUBLIC_CLIENT_UNAVAILABLE');
    const hash = await writeContractAsync(input);
    setLatestTxHash(hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('TRANSACTION_REVERTED');
    return hash;
  }

  async function waitForProjection(input: {
    walletAddress: string;
    assetId: string;
    expected: 'deposited' | 'exit_requested' | 'withdrawn';
  }) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (attempt > 0) await wait(2_000);
      const refreshed = await requestPoolStatus(input.walletAddress);
      setStatus(refreshed);
      if (refreshed.mode !== 'custodial_vault') continue;
      const position = refreshed.positions.find((item) => item.assetId === input.assetId);
      if (input.expected === 'deposited' && position?.lifecycleOpen) return true;
      if (
        input.expected === 'exit_requested'
        && position
        && (position.status === 'exit_requested' || position.status === 'withdrawable')
      ) return true;
      if (
        input.expected === 'withdrawn'
        && (!position || position.status === 'withdrawn' || !position.lifecycleOpen)
      ) return true;
    }
    return false;
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
      || !identity
      || !vaultAddress
      || !ukiNftVaults.chainId
      || !publicClient
    ) return;
    setMutatingAssetId(asset.assetId);
    setError(null);
    setNotice(null);
    setLatestTxHash(null);
    let confirmed = false;
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
        });
      }
      setPhase('depositing');
      await writeAndConfirm({
        chainId: ukiNftVaults.chainId,
        address: vaultAddress,
        abi: cukiePoolNftVaultAbi,
        functionName: 'deposit',
        args: [identity.collection, identity.tokenId],
      });
      confirmed = true;
      setPhase('syncing');
      setNotice('Depósito confirmado. Esperando la proyección canónica del vault…');
      const projected = await waitForProjection({
        walletAddress: user.walletAddress,
        assetId: asset.assetId,
        expected: 'deposited',
      });
      if (!projected) {
        setNotice('El depósito está confirmado en BSC, pero aún no aparece en el indexador. No repitas la operación; actualiza en unos minutos.');
        return;
      }
      setNotice('NFT depositado. Su fecha de activación queda fijada por el calendario vigente del vault.');
      setPhase('idle');
      setMutatingAssetId(null);
    } catch {
      if (confirmed) {
        setPhase('syncing');
        setNotice('El depósito está confirmado en BSC, pero su proyección sigue pendiente. No repitas la operación.');
        return;
      }
      setPhase('idle');
      setMutatingAssetId(null);
      setError('La wallet rechazó la operación o la transacción no pudo confirmarse.');
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
      || !identity
      || !vaultAddress
      || !ukiNftVaults.chainId
    ) return;
    setMutatingAssetId(position.assetId);
    setError(null);
    setNotice(null);
    setLatestTxHash(null);
    let confirmed = false;
    try {
      setPhase(operation === 'request_exit' ? 'requesting_exit' : 'withdrawing');
      await writeAndConfirm({
        chainId: ukiNftVaults.chainId,
        address: vaultAddress,
        abi: cukiePoolNftVaultAbi,
        functionName: operation === 'request_exit' ? 'requestExit' : 'withdraw',
        args: [identity.collection, identity.tokenId],
      });
      confirmed = true;
      setPhase('syncing');
      setNotice('Transacción confirmada. Esperando la proyección canónica del vault…');
      const projected = await waitForProjection({
        walletAddress: user.walletAddress,
        assetId: position.assetId,
        expected: operation === 'request_exit' ? 'exit_requested' : 'withdrawn',
      });
      if (!projected) {
        setNotice('La transacción está confirmada en BSC, pero el indexador aún no la ha proyectado. No repitas la operación; actualiza en unos minutos.');
        return;
      }
      setNotice(operation === 'request_exit'
        ? 'Salida solicitada. Este Cukie ya no participa en el reparto del periodo y podrá retirarse al corte indicado.'
        : 'NFT retirado correctamente a tu wallet.');
      setPhase('idle');
      setMutatingAssetId(null);
    } catch {
      if (confirmed) {
        setPhase('syncing');
        setNotice('La transacción está confirmada en BSC, pero su proyección sigue pendiente. No repitas la operación.');
        return;
      }
      setPhase('idle');
      setMutatingAssetId(null);
      setError('La wallet rechazó la operación o el contrato no permitió completarla.');
    }
  }

  return (
    <section id="mi-cukie-pool" className="uki-container relative z-[2] pb-10">
      <Panel innerClassName="p-5 sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="uki-label">Staking custodial NFT</p>
            <h2 className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)]">
              Mis Cukies en el pool
            </h2>
          </div>
          {status ? (
            <button
              type="button"
              onClick={() => setReloadNonce((value) => value + 1)}
              className="text-xs font-black uppercase text-[var(--uki-cyan)]"
            >
              Actualizar estado
            </button>
          ) : null}
        </div>

        {authLoading || loadState === 'loading' ? (
          <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-[var(--uki-text)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--uki-cyan)]" />
            Verificando wallet, vault y proyección…
          </p>
        ) : null}

        {!authLoading && loadState === 'idle' ? (
          <p className="mt-6 text-sm font-semibold text-[var(--uki-text)]">
            Conecta y autentica tu wallet EVM para depositar o recuperar Cukies.
          </p>
        ) : null}

        {loadState === 'unavailable' ? (
          <div className="mt-6 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
            <p className="text-sm font-semibold text-[var(--uki-text)]">
              No se puede consultar el estado custodial con garantías. No se habilitarán depósitos ni firmas basadas en datos incompletos.
            </p>
          </div>
        ) : null}

        {loadState === 'ready' && status?.mode === 'legacy_mongo' ? (
          <div className="mt-6 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
            <p className="text-sm font-semibold text-[var(--uki-text)]">
              El vault custodial todavía no está configurado en este entorno. El flujo Mongo anterior permanece visible solo como compatibilidad y no se ofrece como staking definitivo.
            </p>
          </div>
        ) : null}

        {loadState === 'ready' && status?.mode === 'custodial_vault' ? (
          <div className="mt-6 space-y-5">
            {!configMatches ? (
              <p role="alert" className="text-sm font-semibold text-amber-300">
                La configuración servida por la API no coincide con la incluida en la DApp. Todas las firmas están bloqueadas.
              </p>
            ) : null}
            {status.nftCustody.indexer.status !== 'ready' ? (
              <p role="alert" className="text-sm font-semibold text-amber-300">
                El indexador no está saludable. Los depósitos están bloqueados; solicitar salida o retirar una posición ya conocida sigue disponible on-chain.
              </p>
            ) : null}
            {!walletMatches ? (
              <p role="alert" className="text-sm font-semibold text-amber-300">
                La wallet EVM conectada debe coincidir con la wallet autenticada.
              </p>
            ) : null}
            {walletMatches && !correctChain ? (
              <p role="alert" className="text-sm font-semibold text-amber-300">
                Cambia tu wallet a la red BSC configurada para operar.
              </p>
            ) : null}
            {error ? <p role="alert" className="text-sm font-semibold text-amber-300">{error}</p> : null}
            {notice ? (
              <p role="status" className="text-sm font-semibold text-[var(--uki-cyan)]">
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

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-headline text-xl font-black uppercase text-[var(--uki-cream)]">
                  Disponibles en tu wallet
                </h3>
                <span className="text-xs font-bold text-[var(--uki-muted)]">
                  {status.availableAssets.length} NFT
                </span>
              </div>
              {status.availableAssets.length === 0 ? (
                <p className="mt-3 text-sm font-semibold text-[var(--uki-muted)]">
                  {status.nftCustody.indexer.status === 'ready'
                    ? 'No hay Cukies elegibles disponibles para depositar.'
                    : 'Inventario oculto hasta recuperar una proyección saludable.'}
                </p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {status.availableAssets.map((asset) => (
                    <article key={asset.assetId} className="rounded-[8px] border border-white/10 bg-black/20 p-4">
                      <p className="font-bold text-[var(--uki-cream)]">Cukie #{asset.tokenId}</p>
                      <p className="mt-1 text-xs font-semibold capitalize text-[var(--uki-muted)]">
                        {generationLabel(asset.generation)} · {asset.rarity}
                      </p>
                      <button
                        type="button"
                        disabled={Boolean(mutatingAssetId) || !depositsReady}
                        onClick={() => void deposit(asset)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-[7px] bg-[var(--uki-cyan)] px-3 py-2 text-xs font-black uppercase text-black disabled:opacity-50"
                      >
                        {mutatingAssetId === asset.assetId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                        {mutatingAssetId === asset.assetId && phase === 'approving'
                          ? 'Aprobando'
                          : mutatingAssetId === asset.assetId && phase === 'depositing'
                            ? 'Depositando'
                            : mutatingAssetId === asset.assetId && phase === 'syncing'
                              ? 'Sincronizando'
                              : 'Depositar'}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-headline text-xl font-black uppercase text-[var(--uki-cream)]">
                  Posiciones del vault
                </h3>
                <span className="text-xs font-bold text-[var(--uki-muted)]">
                  {status.positions.filter((item) => item.lifecycleOpen).length} abiertas
                </span>
              </div>
              {status.positions.length === 0 ? (
                <p className="mt-3 text-sm font-semibold text-[var(--uki-muted)]">Todavía no tienes posiciones en este vault.</p>
              ) : (
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {status.positions.map((position) => (
                    <article key={position.positionId} className="rounded-[8px] border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-[var(--uki-cream)]">Cukie #{position.tokenId}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">
                            Epoch {position.depositEpoch} · {statusLabel(position.status)}
                          </p>
                        </div>
                        {position.status === 'active' ? <CheckCircle2 className="h-5 w-5 text-[var(--uki-cyan)]" /> : null}
                        {position.status === 'pending' || position.status === 'exit_requested' ? <Clock3 className="h-5 w-5 text-amber-300" /> : null}
                        {position.status === 'withdrawable' ? <Unlock className="h-5 w-5 text-[var(--uki-cyan)]" /> : null}
                      </div>
                      <PositionSchedule position={position} />
                      {position.ownerRewardEligible ? (
                        <p className="mt-3 text-xs font-semibold text-[var(--uki-cyan)]">Participa en el reparto mientras complete partidas válidas.</p>
                      ) : position.lifecycleOpen ? (
                        <p className="mt-3 text-xs font-semibold text-amber-300">No participa en el reparto del periodo de salida.</p>
                      ) : null}
                      {position.lifecycleOpen && (position.status === 'pending' || position.status === 'active') ? (
                        <button
                          type="button"
                          disabled={Boolean(mutatingAssetId) || !identityReady}
                          onClick={() => void mutatePosition(position, 'request_exit')}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-[7px] border border-white/15 px-3 py-2 text-xs font-black uppercase text-[var(--uki-text)] disabled:opacity-50"
                        >
                          {mutatingAssetId === position.assetId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                          {mutatingAssetId === position.assetId && phase === 'syncing' ? 'Sincronizando' : 'Solicitar salida'}
                        </button>
                      ) : position.lifecycleOpen && position.status === 'withdrawable' ? (
                        <button
                          type="button"
                          disabled={Boolean(mutatingAssetId) || !identityReady}
                          onClick={() => void mutatePosition(position, 'withdraw')}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-[7px] bg-[var(--uki-cyan)] px-3 py-2 text-xs font-black uppercase text-black disabled:opacity-50"
                        >
                          {mutatingAssetId === position.assetId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                          {mutatingAssetId === position.assetId && phase === 'syncing' ? 'Sincronizando' : 'Retirar NFT'}
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
        <NftVaultRecoveryPanel kind="cukie_pool" />
      </Panel>
    </section>
  );
}
