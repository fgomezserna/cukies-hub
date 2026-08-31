'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { formatUnits, type Address, type Hex } from 'viem';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Gift,
  Loader2,
  RefreshCw,
  Sparkles,
  Trophy,
  Wallet,
} from 'lucide-react';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';

import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { rewardsDistributorAbi } from '@/lib/contracts/rewards-distributor';
import { useAuth } from '@/providers/auth-provider';

type RewardAllocation = {
  allocationId: string;
  periodId: string;
  category: string;
  amountRaw: string;
  status: 'allocated' | 'blocked';
  createdAt: string;
};

type RewardClaim = {
  batchId: Hex;
  amountRaw: string;
  transactionHash: Hex;
  indexedAt: string;
};

type ClaimableReward = {
  batch: {
    batchId: Hex;
    periodId: string;
    chainId: 56 | 97;
    distributorAddress: Address;
    amountRaw: string;
    startsAt: string;
    expiresAt: string;
  };
  proof: {
    siblings: Hex[];
  };
  onChainStatus: 'scheduled' | 'claimable' | 'expired';
};

type RewardStatus = {
  walletNormalized: string;
  allocations: RewardAllocation[];
  claims: RewardClaim[];
  pageAllocatedRaw: string;
  claimableRaw: string;
  claimPublished: boolean;
  claimables: ClaimableReward[];
  publishedRewards: ClaimableReward[];
  blockedAllocations: number;
  healthy: boolean;
};

type RequestState = 'idle' | 'loading' | 'ready' | 'unavailable';

function formatRaw(value: string) {
  try {
    const numeric = Number(formatUnits(BigInt(value), 18));
    if (!Number.isFinite(numeric)) return '0';
    return numeric.toLocaleString('es-ES', { maximumFractionDigits: 4 });
  } catch {
    return '0';
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha pendiente';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function rewardLabel(category: string) {
  switch (category) {
    case 'player':
      return 'Premio de partida';
    case 'credit_pool_daily':
      return 'Pool de créditos';
    case 'cukie_pool_original_distribution':
      return 'Pool de Cukies Originales';
    case 'cukie_pool_second_plus_distribution':
      return 'Pool de Cukies';
    case 'treasury':
      return 'Tesorería';
    case 'marketing':
      return 'Marketing';
    case 'development':
      return 'Desarrollo';
    case 'marketing_development':
      return 'Marketing y desarrollo';
    case 'supply_reduction':
      return 'Reducción de suministro';
    default:
      return 'Premio Cukies';
  }
}

export function PremiosContent() {
  const { user, isLoading: authLoading } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const { chainId } = useAccount();
  const publicClient = usePublicClient();
  const { switchChain, isPending: switchingChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<RewardStatus | null>(null);
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [claimingBatch, setClaimingBatch] = useState<Hex | null>(null);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!walletAddress) return;
    setRequestState('loading');
    const response = await fetch(
      '/api/economy/v1/rewards?walletAddress=' + encodeURIComponent(walletAddress),
      { cache: 'no-store', credentials: 'same-origin', signal },
    );
    const body = await response.json() as { status?: string; data?: RewardStatus };
    if (!response.ok || body.status !== 'ok' || !body.data) throw new Error('REWARDS_UNAVAILABLE');
    setStatus(body.data);
    setRequestState('ready');
  }, [walletAddress]);

  useEffect(() => {
    if (authLoading) return;
    if (!walletAddress) {
      setStatus(null);
      setRequestState('idle');
      return;
    }
    const controller = new AbortController();
    load(controller.signal).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus(null);
      setRequestState('unavailable');
    });
    return () => controller.abort();
  }, [authLoading, load, walletAddress]);

  const claimedRaw = useMemo(() => (
    status?.claims.reduce((sum, claim) => sum + BigInt(claim.amountRaw), BigInt(0)).toString() ?? '0'
  ), [status]);

  async function claimReward(reward: ClaimableReward) {
    if (!publicClient || claimingBatch) return;
    setClaimMessage(null);
    setClaimingBatch(reward.batch.batchId);
    try {
      const hash = await writeContractAsync({
        chainId: reward.batch.chainId,
        address: reward.batch.distributorAddress,
        abi: rewardsDistributorAbi,
        functionName: 'claim',
        args: [
          reward.batch.batchId,
          BigInt(reward.batch.amountRaw),
          reward.proof.siblings,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setClaimMessage('Cobro confirmado. Tus UKI ya están en tu wallet.');
      await load();
    } catch {
      setClaimMessage('El cobro no se ha completado. Puedes volver a intentarlo.');
    } finally {
      setClaimingBatch(null);
    }
  }

  if (authLoading) {
    return (
      <div role="status" className="flex min-h-[24rem] items-center justify-center text-sm font-semibold text-[var(--uki-muted)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--uki-lilac)]" />
        Preparando tus premios…
      </div>
    );
  }

  if (!walletAddress) {
    return (
      <section className="grid min-h-[34rem] overflow-hidden rounded-[20px] border border-[var(--uki-lilac)]/25 bg-[#09060f] lg:grid-cols-[1fr_0.9fr]">
        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-14">
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)]"><Gift className="h-4 w-4" /> Tus premios</p>
          <h1 className="mt-3 max-w-2xl text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">Consulta y cobra tus recompensas</h1>
          <p className="mt-4 max-w-xl text-base font-semibold leading-relaxed text-[var(--uki-text)]">Conecta tu wallet para ver lo que has ganado en partidas y pools, y cobrar los premios que ya estén disponibles.</p>
          <LandingWalletConnectButton evmOnly className="mt-7 min-h-12 w-fit px-5" label="Conectar wallet" compactLabel="Conectar wallet" showCompactText={false} />
        </div>
        <div className="relative min-h-[22rem] overflow-hidden border-t border-white/10 lg:border-l lg:border-t-0">
          <Image src="/brand/generated/uki-premios-cukies-rewards-hero-v5.png" alt="Cukies celebrando sus premios" fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#09060f] via-transparent to-transparent lg:bg-gradient-to-r lg:from-[#09060f]/35 lg:via-transparent lg:to-transparent" />
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1480px] pb-10">
      <header className="grid overflow-hidden rounded-[20px] border border-[var(--uki-lilac)]/25 bg-[#09060f] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-12">
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)]"><Gift className="h-4 w-4" /> Tus premios</p>
          <h1 className="mt-3 text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">Lo que has ganado, en un solo lugar</h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">Tus recompensas se acumulan por periodos. Cuando una esté lista para cobrar, aparecerá aquí con su importe y fecha límite.</p>
          <button type="button" onClick={() => load().catch(() => setRequestState('unavailable'))} disabled={requestState === 'loading'} className="mt-6 inline-flex w-fit items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-lilac)] disabled:opacity-50">
            <RefreshCw className={requestState === 'loading' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Actualizar premios
          </button>
        </div>
        <div className="relative min-h-[20rem] overflow-hidden border-t border-white/10 lg:border-l lg:border-t-0">
          <Image src="/brand/generated/uki-premios-cukies-rewards-hero-v5.png" alt="Cukies celebrando sus premios" fill priority sizes="(min-width: 1024px) 46vw, 100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#09060f] via-transparent to-transparent lg:bg-gradient-to-r lg:from-[#09060f]/35 lg:via-transparent lg:to-transparent" />
        </div>
      </header>

      {requestState === 'unavailable' ? (
        <div role="alert" className="mt-6 rounded-[12px] border border-white/10 bg-black/25 p-5">
          <p className="font-black text-[var(--uki-cream)]">No podemos cargar tus premios ahora</p>
          <p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">Vuelve a intentarlo en unos instantes.</p>
        </div>
      ) : requestState === 'loading' && !status ? (
        <div role="status" className="flex min-h-[18rem] items-center justify-center text-sm font-semibold text-[var(--uki-muted)]"><Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--uki-lilac)]" /> Cargando tus premios…</div>
      ) : status ? (
        <>
          <section aria-label="Resumen de premios" className="grid overflow-hidden rounded-[16px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/[0.07] sm:grid-cols-3">
            {[
              ['Disponible para cobrar', formatRaw(status.claimableRaw), 'UKI que puedes enviar a tu wallet'],
              ['Asignado', formatRaw(status.pageAllocatedRaw), 'Premios registrados en tu historial'],
              ['Cobrado', formatRaw(claimedRaw), 'UKI que ya has reclamado'],
            ].map(([label, value, helper], index) => (
              <div key={label} className={index === 0 ? 'p-5 sm:p-6' : 'border-t border-white/10 p-5 sm:border-l sm:border-t-0 sm:p-6'}>
                <p className="text-xs font-black uppercase tracking-[0.13em] text-[var(--uki-muted)]">{label}</p>
                <p className="mt-2 font-headline text-3xl font-black text-[var(--uki-lilac)]">{value} UKI</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">{helper}</p>
              </div>
            ))}
          </section>

          {claimMessage ? <p role="status" className="mt-5 rounded-[10px] border border-[var(--uki-lilac)]/30 bg-[var(--uki-lilac)]/10 p-4 text-sm font-black text-[var(--uki-cream)]">{claimMessage}</p> : null}

          <section aria-labelledby="claimable-rewards-title" className="pt-9">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-lilac)]">Listos para tu wallet</p>
              <h2 id="claimable-rewards-title" className="mt-2 font-headline text-2xl font-black text-[var(--uki-cream)] sm:text-3xl">Premios disponibles</h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">No pierdes un premio por no entrar durante una semana. Cada cobro publicado conserva su propia fecha límite, que verás siempre en esta pantalla.</p>
            </div>

            {status.claimables.length > 0 ? (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {status.claimables.map((reward) => {
                  const wrongChain = chainId !== reward.batch.chainId;
                  const isClaiming = claimingBatch === reward.batch.batchId;
                  return (
                    <article key={reward.batch.batchId} className="rounded-[16px] border border-[var(--uki-lilac)]/30 bg-black/25 p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div><p className="text-xs font-black uppercase tracking-[0.13em] text-[var(--uki-muted)]">Disponible ahora</p><p className="mt-2 font-headline text-3xl font-black text-[var(--uki-cream)]">{formatRaw(reward.batch.amountRaw)} UKI</p></div>
                        <CheckCircle2 className="h-5 w-5 text-[var(--uki-lilac)]" />
                      </div>
                      <div className="mt-5 flex items-start gap-3 rounded-[10px] border border-white/10 bg-white/[0.035] p-4">
                        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-lilac)]" />
                        <div><p className="text-xs font-black text-[var(--uki-cream)]">Puedes cobrarlo hasta</p><p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">{formatDate(reward.batch.expiresAt)}</p></div>
                      </div>
                      {wrongChain ? (
                        <button type="button" onClick={() => switchChain({ chainId: reward.batch.chainId })} disabled={switchingChain} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[9px] bg-[var(--uki-lilac)] px-5 font-headline text-sm font-black uppercase tracking-[0.07em] text-[#09060f] disabled:opacity-50">
                          <Wallet className="h-4 w-4" /> {switchingChain ? 'Cambiando red…' : 'Cambiar de red para cobrar'}
                        </button>
                      ) : (
                        <button type="button" onClick={() => claimReward(reward)} disabled={Boolean(claimingBatch)} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[9px] bg-[var(--uki-lilac)] px-5 font-headline text-sm font-black uppercase tracking-[0.07em] text-[#09060f] disabled:opacity-50">
                          {isClaiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />} {isClaiming ? 'Confirmando cobro…' : 'Cobrar premio'}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-[16px] border border-white/10 bg-black/25 p-7">
                <Sparkles className="h-7 w-7 text-[var(--uki-lilac)]" />
                <h3 className="mt-4 font-headline text-xl font-black text-[var(--uki-cream)]">No tienes premios pendientes de cobro</h3>
                <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">Los premios asignados aparecerán aquí cuando estén listos para cobrar.</p>
              </div>
            )}
          </section>

          <section aria-labelledby="reward-history-title" className="pt-10">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-lilac)]">Tu actividad</p>
            <h2 id="reward-history-title" className="mt-2 font-headline text-2xl font-black text-[var(--uki-cream)] sm:text-3xl">Historial de premios</h2>
            {status.allocations.length > 0 ? (
              <div className="mt-5 divide-y divide-white/10 overflow-hidden rounded-[14px] border border-white/10 bg-black/25">
                {status.allocations.map((allocation) => (
                  <div key={allocation.allocationId} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
                    <div className="flex items-start gap-3"><Trophy className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-lilac)]" /><div><p className="font-black text-[var(--uki-cream)]">{rewardLabel(allocation.category)}</p><p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">{formatDate(allocation.createdAt)}</p></div></div>
                    <p className="font-headline text-lg font-black text-[var(--uki-cream)]">{formatRaw(allocation.amountRaw)} UKI</p>
                  </div>
                ))}
              </div>
            ) : <p className="mt-5 rounded-[14px] border border-white/10 bg-black/25 p-5 text-sm font-semibold text-[var(--uki-muted)]">Todavía no hay premios registrados en esta wallet.</p>}
          </section>

          <section aria-labelledby="reward-process-title" className="pt-10">
            <h2 id="reward-process-title" className="font-headline text-2xl font-black text-[var(--uki-cream)]">Cómo llega un premio a tu wallet</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                ['01', 'Se registra', 'Tu resultado en una partida o pool genera una recompensa asociada a tu wallet.'],
                ['02', 'Se prepara el cobro', 'La recompensa se agrupa y se publica para que puedas reclamarla.'],
                ['03', 'La cobras', 'Confirmas una transacción y los UKI llegan directamente a tu wallet.'],
              ].map(([number, title, body]) => (
                <div key={number} className="rounded-[14px] border border-white/10 bg-black/25 p-5"><p className="font-headline text-sm font-black text-[var(--uki-lilac)]">{number}</p><h3 className="mt-4 font-headline text-xl font-black text-[var(--uki-cream)]">{title}</h3><p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">{body}</p><ArrowRight className="mt-5 h-4 w-4 text-[var(--uki-lilac)]" /></div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
