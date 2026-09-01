'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { formatUnits, type Address, type Hex } from 'viem';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  Gift,
  History,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trophy,
  Wallet,
} from 'lucide-react';
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';

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
  chainId: 56 | 97;
  amountRaw: string;
  transactionHash: Hex;
  indexedAt: string;
};

type PublishedReward = {
  batch: {
    batchId: Hex;
    periodId: string;
    chainId: 56 | 97;
    distributorAddress: Address;
    amountRaw: string;
    startsAt: string;
    expiresAt: string;
  };
  proof: { siblings: Hex[] };
  onChainStatus: 'scheduled' | 'claimable' | 'expired';
};

type RewardStatus = {
  walletNormalized: string;
  allocations: RewardAllocation[];
  claims: RewardClaim[];
  pageAllocatedRaw: string;
  totalAllocatedRaw: string;
  totalClaimedRaw: string;
  pendingRaw: string;
  claimableRaw: string;
  scheduledRaw: string;
  expiredRaw: string;
  allocationCount: number;
  claimCount: number;
  claimPublished: boolean;
  claimables: PublishedReward[];
  publishedRewards: PublishedReward[];
  blockedAllocations: number;
  healthy: boolean;
  nextCursor: string | null;
};

type RequestState = 'idle' | 'loading' | 'ready' | 'unavailable';
type ClaimFeedback = {
  kind: 'success' | 'error';
  message: string;
  transactionHash?: Hex;
  chainId?: 56 | 97;
};

function formatRaw(value: string) {
  try {
    const [whole, decimal = ''] = formatUnits(BigInt(value), 18).split('.');
    const wholeLabel = BigInt(whole).toLocaleString('es-ES');
    const decimalLabel = decimal.slice(0, 4).replace(/0+$/, '');
    if (decimalLabel) return `${wholeLabel},${decimalLabel}`;
    if (BigInt(value) > BigInt(0) && BigInt(whole) === BigInt(0))
      return '<0,0001';
    return wholeLabel;
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

function periodLabel(periodId: string) {
  const week = /^(\d{4})-W(\d{1,2})$/i.exec(periodId);
  if (week) return `Semana ${Number(week[2])} de ${week[1]}`;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(periodId);
  if (day) {
    return new Intl.DateTimeFormat('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${periodId}T00:00:00.000Z`));
  }
  return 'Recompensa acumulada';
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

function sameAddress(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function transactionUrl(chainId: 56 | 97, hash: Hex) {
  const explorer =
    chainId === 97 ? 'https://testnet.bscscan.com' : 'https://bscscan.com';
  return `${explorer}/tx/${hash}`;
}

function StepHeading({
  number,
  children,
}: {
  number: string;
  children: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-4">
      <span className="font-headline text-sm font-black text-[var(--uki-lilac)]">
        {number}
      </span>
      <span className="h-px w-12 bg-[var(--uki-lilac)]/40" />
      <p className="text-sm font-black text-[var(--uki-cream)]">{children}</p>
    </div>
  );
}

export function PremiosContent() {
  const { user, isLoading: authLoading } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: switchingChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<RewardStatus | null>(null);
  const rewardChainId = status?.publishedRewards[0]?.batch.chainId;
  const publicClient = usePublicClient({ chainId: rewardChainId });
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [loadingMore, setLoadingMore] = useState(false);
  const [claimingBatch, setClaimingBatch] = useState<Hex | null>(null);
  const [claimFeedback, setClaimFeedback] = useState<ClaimFeedback | null>(
    null,
  );

  const load = useCallback(
    async (options?: { cursor?: string; append?: boolean }) => {
      if (!walletAddress) return;
      const append = Boolean(options?.append);
      if (append) setLoadingMore(true);
      else setRequestState('loading');
      try {
        const params = new URLSearchParams({ walletAddress, limit: '50' });
        if (options?.cursor) params.set('cursor', options.cursor);
        const response = await fetch(
          `/api/economy/v1/rewards?${params.toString()}`,
          {
            cache: 'no-store',
            credentials: 'same-origin',
          },
        );
        const body = (await response.json()) as {
          status?: string;
          data?: RewardStatus;
        };
        if (!response.ok || body.status !== 'ok' || !body.data)
          throw new Error('REWARDS_UNAVAILABLE');
        setStatus((current) => {
          if (!append || !current) return body.data!;
          const known = new Set(
            current.allocations.map((item) => item.allocationId),
          );
          return {
            ...body.data!,
            allocations: [
              ...current.allocations,
              ...body.data!.allocations.filter(
                (item) => !known.has(item.allocationId),
              ),
            ],
          };
        });
        setRequestState('ready');
      } finally {
        if (append) setLoadingMore(false);
      }
    },
    [walletAddress],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!walletAddress) {
      setStatus(null);
      setRequestState('idle');
      return;
    }
    setStatus(null);
    let active = true;
    load().catch(() => {
      if (!active) return;
      setStatus(null);
      setRequestState('unavailable');
    });
    return () => {
      active = false;
    };
  }, [authLoading, load, walletAddress]);

  const scheduledRewards = useMemo(
    () =>
      status?.publishedRewards.filter(
        (reward) => reward.onChainStatus === 'scheduled',
      ) ?? [],
    [status],
  );
  const expiredRewards = useMemo(
    () =>
      status?.publishedRewards.filter(
        (reward) => reward.onChainStatus === 'expired',
      ) ?? [],
    [status],
  );
  const walletMatches = sameAddress(walletAddress, address);
  const hasActivity = Boolean(
    status &&
      (status.allocationCount > 0 ||
        status.claimCount > 0 ||
        status.publishedRewards.length > 0),
  );
  const activity = useMemo(() => {
    if (!status) return [];
    return [
      ...status.allocations.map((allocation) => ({
        id: `allocation:${allocation.allocationId}`,
        date: allocation.createdAt,
        title: rewardLabel(allocation.category),
        helper: periodLabel(allocation.periodId),
        amountRaw: allocation.amountRaw,
        state:
          allocation.status === 'blocked' ? 'En revisión' : 'Premio registrado',
        kind:
          allocation.status === 'blocked'
            ? ('warning' as const)
            : ('earned' as const),
        transactionHash: null,
        transactionChainId: null,
      })),
      ...status.claims.map((claim) => ({
        id: `claim:${claim.batchId}`,
        date: claim.indexedAt,
        title: 'Premio cobrado',
        helper: 'Los UKI se enviaron a tu wallet',
        amountRaw: claim.amountRaw,
        state: 'Cobrado' as const,
        kind: 'claimed' as const,
        transactionHash: claim.transactionHash,
        transactionChainId: claim.chainId,
      })),
    ].sort(
      (left, right) =>
        new Date(right.date).getTime() - new Date(left.date).getTime(),
    );
  }, [status]);

  async function refreshRewards() {
    setClaimFeedback(null);
    try {
      await load();
    } catch {
      setRequestState('unavailable');
    }
  }

  async function loadMoreRewards() {
    if (!status?.nextCursor) return;
    try {
      await load({ cursor: status.nextCursor, append: true });
    } catch {
      setClaimFeedback({
        kind: 'error',
        message:
          'No hemos podido cargar más movimientos. Puedes volver a intentarlo.',
      });
    }
  }

  async function claimReward(reward: PublishedReward) {
    if (
      !publicClient ||
      claimingBatch ||
      !walletMatches ||
      chainId !== reward.batch.chainId
    )
      return;
    setClaimFeedback(null);
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
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('CLAIM_REVERTED');
      setClaimFeedback({
        kind: 'success',
        message: 'Cobro confirmado. Los UKI ya están en tu wallet.',
        transactionHash: hash,
        chainId: reward.batch.chainId,
      });
      await load();
    } catch {
      setClaimFeedback({
        kind: 'error',
        message:
          'El cobro no se ha completado. No se ha descontado ningún premio y puedes volver a intentarlo.',
      });
    } finally {
      setClaimingBatch(null);
    }
  }

  if (authLoading) {
    return (
      <div
        role="status"
        className="flex min-h-[24rem] items-center justify-center text-sm font-semibold text-[var(--uki-muted)]"
      >
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--uki-lilac)]" />{' '}
        Preparando tus premios…
      </div>
    );
  }

  if (!walletAddress) {
    return (
      <section className="grid min-h-[34rem] overflow-hidden rounded-[20px] border border-[var(--uki-lilac)]/25 bg-[#09060f] lg:grid-cols-[1fr_0.9fr]">
        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-14">
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)]">
            <Gift className="h-4 w-4" /> Tus premios
          </p>
          <h1 className="mt-3 max-w-2xl text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">
            Consulta y cobra tus recompensas
          </h1>
          <p className="mt-4 max-w-xl text-base font-semibold leading-relaxed text-[var(--uki-text)]">
            Conecta tu wallet para ver lo que has ganado en partidas y pools, y
            cobrar los premios que ya estén disponibles.
          </p>
          <LandingWalletConnectButton
            evmOnly
            className="mt-7 min-h-12 w-fit px-5"
            label="Conectar wallet"
            compactLabel="Conectar wallet"
            showCompactText={false}
          />
        </div>
        <div className="relative min-h-[22rem] overflow-hidden border-t border-white/10 lg:border-l lg:border-t-0">
          <Image
            src="/brand/generated/uki-premios-cukies-rewards-hero-v5.png"
            alt="Cukies celebrando sus premios"
            fill
            priority
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#09060f] via-transparent to-transparent lg:bg-gradient-to-r lg:from-[#09060f]/35 lg:via-transparent lg:to-transparent" />
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1480px] pb-10">
      <header className="grid overflow-hidden rounded-[20px] border border-[var(--uki-lilac)]/25 bg-[#09060f] lg:grid-cols-[1.15fr_0.85fr]">
        <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-11">
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)]">
            <Gift className="h-4 w-4" /> Premios
          </p>
          <h1 className="mt-3 text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">
            Tus premios UKI
          </h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">
            Comprueba cuánto tienes preparado, cobra lo disponible y revisa cada
            movimiento con todos los pasos explicados.
          </p>
          <button
            type="button"
            onClick={refreshRewards}
            disabled={requestState === 'loading'}
            className="mt-6 inline-flex w-fit items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-lilac)] disabled:opacity-50"
          >
            <RefreshCw
              className={
                requestState === 'loading' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'
              }
            />{' '}
            Actualizar premios
          </button>
        </div>
        <div className="relative min-h-[16rem] overflow-hidden border-t border-white/10 lg:border-l lg:border-t-0">
          <Image
            src="/brand/generated/uki-premios-cukies-rewards-hero-v5.png"
            alt="Cukies celebrando sus premios"
            fill
            priority
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#09060f] via-transparent to-transparent lg:bg-gradient-to-r lg:from-[#09060f]/35 lg:via-transparent lg:to-transparent" />
        </div>
      </header>

      {requestState === 'unavailable' ? (
        <div
          role="alert"
          className="mt-5 flex flex-col gap-4 rounded-[12px] border border-amber-300/25 bg-amber-300/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-black text-[var(--uki-cream)]">
              No podemos actualizar tus premios ahora
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">
              Si ya había información en pantalla, sigue siendo la última
              lectura válida.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshRewards}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border border-white/15 px-4 text-xs font-black uppercase tracking-[0.07em] text-[var(--uki-cream)]"
          >
            <RefreshCw className="h-4 w-4" /> Reintentar
          </button>
        </div>
      ) : null}

      {requestState === 'loading' && !status ? (
        <div
          role="status"
          className="flex min-h-[20rem] items-center justify-center text-sm font-semibold text-[var(--uki-muted)]"
        >
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--uki-lilac)]" />{' '}
          Cargando tus premios…
        </div>
      ) : null}

      {status ? (
        <>
          <section aria-labelledby="reward-balance-title" className="pt-9">
            <StepHeading number="01">Comprueba tu saldo</StepHeading>
            <div className="grid overflow-hidden rounded-[18px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/[0.06] lg:grid-cols-[1.15fr_0.85fr]">
              <div className="flex flex-col justify-between p-6 sm:p-8 lg:min-h-[19rem]">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-lilac)]">
                    Listo para cobrar
                  </p>
                  <h2
                    id="reward-balance-title"
                    className="mt-3 font-headline text-5xl font-black tracking-[-0.04em] text-[var(--uki-cream)] sm:text-6xl"
                  >
                    {formatRaw(status.claimableRaw)}{' '}
                    <span className="text-2xl text-[var(--uki-lilac)] sm:text-3xl">
                      UKI
                    </span>
                  </h2>
                  <p className="mt-4 max-w-xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                    {BigInt(status.claimableRaw) > BigInt(0)
                      ? 'Este importe ya se puede enviar a tu wallet. Cada premio mantiene visible su fecha límite.'
                      : BigInt(status.pendingRaw) > BigInt(0)
                      ? 'Ahora no tienes UKI para cobrar, pero ya hay premios registrados que se están preparando.'
                      : 'Ahora mismo no tienes UKI pendientes de cobro.'}
                  </p>
                </div>
                {BigInt(status.claimableRaw) > BigInt(0) ? (
                  <button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById('cobrar-premios')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                    className="mt-6 inline-flex min-h-12 w-fit items-center justify-center gap-2 rounded-[9px] bg-[var(--uki-lilac)] px-5 font-headline text-sm font-black uppercase tracking-[0.07em] text-[#09060f]"
                  >
                    <Wallet className="h-4 w-4" /> Ver premios disponibles
                  </button>
                ) : null}
              </div>
              <div className="grid border-t border-white/10 sm:grid-cols-3 lg:grid-cols-1 lg:border-l lg:border-t-0">
                {[
                  [
                    'En preparación',
                    status.pendingRaw,
                    'Registrado y todavía no habilitado para cobro',
                  ],
                  [
                    'Ya cobrado',
                    status.totalClaimedRaw,
                    `${status.claimCount} ${
                      status.claimCount === 1
                        ? 'cobro confirmado'
                        : 'cobros confirmados'
                    }`,
                  ],
                  [
                    'Ganado en total',
                    status.totalAllocatedRaw,
                    `${status.allocationCount} ${
                      status.allocationCount === 1
                        ? 'premio registrado'
                        : 'premios registrados'
                    }`,
                  ],
                ].map(([label, value, helper], index) => (
                  <div
                    key={label}
                    className={`p-5 sm:p-6 ${
                      index > 0
                        ? 'border-t border-white/10 sm:border-l sm:border-t-0 lg:border-l-0 lg:border-t'
                        : ''
                    }`}
                  >
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">
                      {label}
                    </p>
                    <p className="mt-2 font-headline text-2xl font-black text-[var(--uki-lilac)]">
                      {formatRaw(value)} UKI
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                      {helper}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            {status.blockedAllocations > 0 || !status.healthy ? (
              <div className="mt-4 flex items-start gap-3 rounded-[12px] border border-amber-300/25 bg-amber-300/[0.07] p-4">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
                <div>
                  <p className="font-black text-[var(--uki-cream)]">
                    Hay premios que necesitan revisión
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">
                    No tienes que repetir ninguna acción. Los importes afectados
                    no se habilitarán hasta que la comprobación termine.
                  </p>
                </div>
              </div>
            ) : null}
          </section>

          <section
            id="cobrar-premios"
            aria-labelledby="claimable-rewards-title"
            className="scroll-mt-24 pt-11"
          >
            <StepHeading number="02">Cobra lo disponible</StepHeading>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2
                  id="claimable-rewards-title"
                  className="font-headline text-2xl font-black text-[var(--uki-cream)] sm:text-3xl"
                >
                  Premios para tu wallet
                </h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                  Verás el importe, desde cuándo está disponible y hasta qué día
                  puedes cobrarlo.
                </p>
              </div>
              {status.claimables.length > 0 ? (
                <p className="text-sm font-black text-[var(--uki-lilac)]">
                  {status.claimables.length}{' '}
                  {status.claimables.length === 1
                    ? 'premio disponible'
                    : 'premios disponibles'}
                </p>
              ) : null}
            </div>

            {claimFeedback ? (
              <div
                role={claimFeedback.kind === 'error' ? 'alert' : 'status'}
                className={`mt-5 rounded-[12px] border p-4 ${
                  claimFeedback.kind === 'success'
                    ? 'border-[var(--uki-lilac)]/30 bg-[var(--uki-lilac)]/10'
                    : 'border-amber-300/25 bg-amber-300/[0.07]'
                }`}
              >
                <p className="flex items-center gap-2 text-sm font-black text-[var(--uki-cream)]">
                  {claimFeedback.kind === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-[var(--uki-lilac)]" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-200" />
                  )}
                  {claimFeedback.message}
                </p>
                {claimFeedback.transactionHash && claimFeedback.chainId ? (
                  <a
                    href={transactionUrl(
                      claimFeedback.chainId,
                      claimFeedback.transactionHash,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.07em] text-[var(--uki-lilac)] underline underline-offset-4"
                  >
                    Ver transacción <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            ) : null}

            {status.claimables.length > 0 &&
            (!isConnected || !walletMatches) ? (
              <div className="mt-5 flex flex-col gap-4 rounded-[12px] border border-amber-300/25 bg-amber-300/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-black text-[var(--uki-cream)]">
                    Conecta la wallet asociada a estos premios
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">
                    La wallet activa debe coincidir con{' '}
                    {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)} antes
                    de cobrar.
                  </p>
                </div>
                <LandingWalletConnectButton
                  evmOnly
                  className="min-h-11 shrink-0 px-4"
                  label="Cambiar wallet"
                  compactLabel="Cambiar wallet"
                  showCompactText={false}
                />
              </div>
            ) : null}

            {status.claimables.length > 0 ? (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {status.claimables.map((reward) => {
                  const wrongChain = chainId !== reward.batch.chainId;
                  const isClaiming = claimingBatch === reward.batch.batchId;
                  const claimDisabled =
                    Boolean(claimingBatch) || !walletMatches || !isConnected;
                  return (
                    <article
                      key={reward.batch.batchId}
                      className="rounded-[16px] border border-[var(--uki-lilac)]/30 bg-black/25 p-5 sm:p-6"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.13em] text-[var(--uki-lilac)]">
                            Disponible ahora
                          </p>
                          <h3 className="mt-2 font-headline text-3xl font-black text-[var(--uki-cream)]">
                            {formatRaw(reward.batch.amountRaw)} UKI
                          </h3>
                          <p className="mt-2 text-sm font-semibold text-[var(--uki-muted)]">
                            {periodLabel(reward.batch.periodId)}
                          </p>
                        </div>
                        <span className="grid h-10 w-10 place-items-center rounded-full border border-[var(--uki-lilac)]/30 bg-[var(--uki-lilac)]/10">
                          <Gift className="h-5 w-5 text-[var(--uki-lilac)]" />
                        </span>
                      </div>
                      <div className="mt-5 flex items-start gap-3 rounded-[10px] border border-white/10 bg-white/[0.035] p-4">
                        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-lilac)]" />
                        <div>
                          <p className="text-xs font-black text-[var(--uki-cream)]">
                            Puedes cobrarlo hasta
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">
                            {formatDate(reward.batch.expiresAt)}
                          </p>
                        </div>
                      </div>
                      {wrongChain && walletMatches ? (
                        <button
                          type="button"
                          onClick={() =>
                            switchChain({ chainId: reward.batch.chainId })
                          }
                          disabled={switchingChain || Boolean(claimingBatch)}
                          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[9px] bg-[var(--uki-lilac)] px-5 font-headline text-sm font-black uppercase tracking-[0.07em] text-[#09060f] disabled:opacity-50"
                        >
                          <Wallet className="h-4 w-4" />{' '}
                          {switchingChain
                            ? 'Cambiando red…'
                            : 'Cambiar de red para cobrar'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => claimReward(reward)}
                          disabled={claimDisabled || wrongChain}
                          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[9px] bg-[var(--uki-lilac)] px-5 font-headline text-sm font-black uppercase tracking-[0.07em] text-[#09060f] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isClaiming ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wallet className="h-4 w-4" />
                          )}{' '}
                          {isClaiming
                            ? 'Confirmando cobro…'
                            : `Cobrar ${formatRaw(reward.batch.amountRaw)} UKI`}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-[16px] border border-white/10 bg-black/25 p-7 sm:p-8">
                {BigInt(status.pendingRaw) > BigInt(0) ? (
                  <Clock3 className="h-7 w-7 text-[var(--uki-lilac)]" />
                ) : (
                  <Sparkles className="h-7 w-7 text-[var(--uki-lilac)]" />
                )}
                <h3 className="mt-4 font-headline text-xl font-black text-[var(--uki-cream)]">
                  {BigInt(status.pendingRaw) > BigInt(0)
                    ? `${formatRaw(status.pendingRaw)} UKI se están preparando`
                    : 'Ahora mismo no tienes premios para cobrar'}
                </h3>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                  {BigInt(status.pendingRaw) > BigInt(0)
                    ? 'No tienes que hacer nada. Cuando el cobro esté habilitado aparecerá aquí con su fecha límite.'
                    : 'Cuando ganes UKI en partidas o pools, podrás seguir su estado y cobrarlos desde esta pantalla.'}
                </p>
              </div>
            )}

            {scheduledRewards.length > 0 ? (
              <div className="mt-5 rounded-[16px] border border-white/10 bg-black/20 p-5 sm:p-6">
                <h3 className="flex items-center gap-2 font-headline text-xl font-black text-[var(--uki-cream)]">
                  <Clock3 className="h-5 w-5 text-[var(--uki-lilac)]" />{' '}
                  Próximos cobros
                </h3>
                <div className="mt-4 divide-y divide-white/10">
                  {scheduledRewards.map((reward) => (
                    <div
                      key={reward.batch.batchId}
                      className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-black text-[var(--uki-cream)]">
                          {formatRaw(reward.batch.amountRaw)} UKI
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">
                          {periodLabel(reward.batch.periodId)}
                        </p>
                      </div>
                      <p className="text-sm font-black text-[var(--uki-lilac)]">
                        Disponible el {formatDate(reward.batch.startsAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {expiredRewards.length > 0 ? (
              <div className="mt-5 rounded-[16px] border border-white/10 bg-black/20 p-5 sm:p-6">
                <h3 className="flex items-center gap-2 font-headline text-lg font-black text-[var(--uki-cream)]">
                  <AlertCircle className="h-5 w-5 text-[var(--uki-muted)]" />{' '}
                  Plazos finalizados
                </h3>
                <p className="mt-2 text-sm font-semibold text-[var(--uki-muted)]">
                  Estos premios ya no se pueden cobrar porque terminó su fecha
                  límite.
                </p>
                <div className="mt-3 divide-y divide-white/10">
                  {expiredRewards.map((reward) => (
                    <div
                      key={reward.batch.batchId}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <span className="text-sm font-semibold text-[var(--uki-muted)]">
                        {periodLabel(reward.batch.periodId)}
                      </span>
                      <span className="font-black text-[var(--uki-cream)]">
                        {formatRaw(reward.batch.amountRaw)} UKI
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="reward-history-title" className="pt-11">
            <StepHeading number="03">Revisa tus movimientos</StepHeading>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2
                  id="reward-history-title"
                  className="font-headline text-2xl font-black text-[var(--uki-cream)] sm:text-3xl"
                >
                  Historial de premios
                </h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                  Cada fila indica si el premio se registró, necesita revisión o
                  ya llegó a tu wallet.
                </p>
              </div>
              {hasActivity ? (
                <History className="hidden h-6 w-6 text-[var(--uki-lilac)] sm:block" />
              ) : null}
            </div>
            {activity.length > 0 ? (
              <div className="mt-5 overflow-hidden rounded-[14px] border border-white/10 bg-black/25">
                <div className="divide-y divide-white/10">
                  {activity.map((item) => (
                    <article
                      key={item.id}
                      className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border ${
                            item.kind === 'warning'
                              ? 'border-amber-300/25 bg-amber-300/[0.07]'
                              : 'border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/[0.08]'
                          }`}
                        >
                          {item.kind === 'claimed' ? (
                            <CheckCircle2 className="h-4 w-4 text-[var(--uki-lilac)]" />
                          ) : item.kind === 'warning' ? (
                            <ShieldAlert className="h-4 w-4 text-amber-200" />
                          ) : (
                            <Trophy className="h-4 w-4 text-[var(--uki-lilac)]" />
                          )}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-black text-[var(--uki-cream)]">
                              {item.title}
                            </h3>
                            <span
                              className={`rounded-full px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.08em] ${
                                item.kind === 'warning'
                                  ? 'bg-amber-300/10 text-amber-100'
                                  : 'bg-[var(--uki-lilac)]/10 text-[var(--uki-lilac)]'
                              }`}
                            >
                              {item.state}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">
                            {item.helper} · {formatDate(item.date)}
                          </p>
                          {item.transactionHash && item.transactionChainId ? (
                            <a
                              href={transactionUrl(
                                item.transactionChainId,
                                item.transactionHash,
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs font-black text-[var(--uki-lilac)] underline underline-offset-4"
                            >
                              Ver transacción{' '}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                        </div>
                      </div>
                      <p className="font-headline text-lg font-black text-[var(--uki-cream)]">
                        {formatRaw(item.amountRaw)} UKI
                      </p>
                    </article>
                  ))}
                </div>
                {status.nextCursor ? (
                  <div className="border-t border-white/10 p-4 text-center">
                    <button
                      type="button"
                      onClick={loadMoreRewards}
                      disabled={loadingMore}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border border-white/15 px-4 text-xs font-black uppercase tracking-[0.07em] text-[var(--uki-cream)] disabled:opacity-50"
                    >
                      {loadingMore ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <History className="h-4 w-4" />
                      )}{' '}
                      {loadingMore ? 'Cargando…' : 'Ver más movimientos'}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-5 rounded-[14px] border border-white/10 bg-black/25 p-6">
                <Trophy className="h-6 w-6 text-[var(--uki-lilac)]" />
                <h3 className="mt-3 font-headline text-lg font-black text-[var(--uki-cream)]">
                  Tu historial está vacío
                </h3>
                <p className="mt-2 text-sm font-semibold text-[var(--uki-muted)]">
                  Aquí aparecerán tus premios de partidas y pools cuando se
                  registren.
                </p>
              </div>
            )}
          </section>

          <details className="group mt-10 rounded-[14px] border border-white/10 bg-black/20 p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-headline text-lg font-black text-[var(--uki-cream)]">
              Qué significa cada estado{' '}
              <ChevronDown className="h-5 w-5 text-[var(--uki-lilac)] transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 md:grid-cols-3">
              {[
                [
                  'En preparación',
                  'El premio ya está registrado. No tienes que hacer nada hasta que se habilite el cobro.',
                ],
                [
                  'Disponible',
                  'Puedes confirmar el cobro desde esta pantalla antes de la fecha indicada.',
                ],
                [
                  'Cobrado',
                  'La transacción se confirmó y los UKI llegaron a tu wallet.',
                ],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-[10px] border border-white/10 bg-white/[0.025] p-4"
                >
                  <p className="font-black text-[var(--uki-lilac)]">{title}</p>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}
