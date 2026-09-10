'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { rewardsDistributorAbi } from '@/lib/contracts/rewards-distributor';
import { useAuth } from '@/providers/auth-provider';
import {
  FALLBACK_COORDINATOR,
  useWalletCoordinator,
} from '@/providers/wallet-coordinator-context';
import {
  isTransactionRefreshAborted,
  retryTransactionRefresh,
  TransactionReplacementError,
  TransactionReplacementPendingError,
  waitForConfirmedEvmTransaction,
} from '@/lib/transaction-refresh';

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
  ambassadorAllocations?: Array<{
    allocationId: string;
    periodId: string;
    category: 'ambassador_ordinary' | 'ambassador_weekly';
    amountRaw: string;
    status: 'allocated_offchain';
    availableAt: string;
    createdAt: string;
  }>;
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

type RewardTab = 'claimable' | 'history';

type PendingClaim = {
  batchId: Hex;
  hash: Hex;
  wallet: string;
  chainId: 56 | 97;
  receiptConfirmed?: boolean;
};

function readRewardNavigation(): {
  tab: RewardTab;
  ambassadorOnly: boolean;
} {
  if (typeof window === 'undefined') {
    return { tab: 'claimable', ambassadorOnly: false };
  }

  const params = new URLSearchParams(window.location.search);
  const category = params.get('category')?.toLowerCase();
  const hash = window.location.hash.replace(/^#/, '').toLowerCase();
  const historyHash = new Set(['historial-premios', 'reward-history-title']);

  let tab: RewardTab = 'claimable';
  if (hash === 'cobrar-premios') tab = 'claimable';
  else if (historyHash.has(hash)) tab = 'history';
  else if (category === 'ambassador') tab = 'history';

  return { tab, ambassadorOnly: category === 'ambassador' };
}

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
    return '—';
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
    case 'ambassador_ordinary':
      return 'Comisión de embajador';
    case 'ambassador_weekly':
      return 'Comisión semanal de embajador';
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

function hasPositiveRaw(value: string | null | undefined) {
  try {
    return BigInt(value ?? '') > BigInt(0);
  } catch {
    return false;
  }
}

function transactionUrl(chainId: 56 | 97, hash: Hex) {
  const explorer =
    chainId === 97 ? 'https://testnet.bscscan.com' : 'https://bscscan.com';
  return `${explorer}/tx/${hash}`;
}

export function PremiosContent() {
  const { user, isLoading: authLoading } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: switchingChain } = useSwitchChain();
  const { requestWallet, evm: evmWallet } = useWalletCoordinator();
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
  const mountedRef = useRef(true);
  const contextRef = useRef<{ address: string | null; chainId: number | null }>({
    address: address ?? null,
    chainId: chainId ?? null,
  });
  const pendingClaimRef = useRef<PendingClaim | null>(null);
  const [pendingClaim, setPendingClaim] = useState<PendingClaim | null>(null);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const loadRequestIdRef = useRef(0);
  contextRef.current = { address: address ?? null, chainId: chainId ?? null };
  const [navigation, setNavigation] = useState<{
    tab: RewardTab;
    ambassadorOnly: boolean;
  }>({ tab: 'claimable', ambassadorOnly: false });
  const { tab: activeTab, ambassadorOnly } = navigation;
  const [anchorToReveal, setAnchorToReveal] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      refreshAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const pending = pendingClaimRef.current;
    const matches = Boolean(
      pending
      && address
      && sameAddress(pending.wallet, address)
      && pending.chainId === chainId,
    );
    if (matches && pending) {
      setPendingClaim(pending);
      return;
    }
    refreshAbortRef.current?.abort();
    setPendingClaim(null);
    setClaimingBatch(null);
    setClaimFeedback((current) => current?.transactionHash ? null : current);
  }, [address, chainId]);

  function assertLiveClaimContext(expectedAddress: string, expectedChainId: 56 | 97) {
    if (
      !mountedRef.current
      || !contextRef.current.address
      || !sameAddress(contextRef.current.address, expectedAddress)
      || contextRef.current.chainId !== expectedChainId
    ) {
      throw new Error('WALLET_CONTEXT_CHANGED');
    }
  }

  function pendingBelongsToCurrent() {
    const pending = pendingClaimRef.current;
    return Boolean(
      pending
      && address
      && sameAddress(pending.wallet, address)
      && pending.chainId === chainId,
    );
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncNavigation = () => {
      setNavigation(readRewardNavigation());
      const hash = window.location.hash.slice(1);
      setAnchorToReveal(
        hash === 'cobrar-premios'
          ? 'claimable-rewards-title'
          : hash === 'historial-premios' || hash === 'reward-history-title'
            ? 'reward-history-title'
            : null,
      );
    };
    syncNavigation();
    window.addEventListener('popstate', syncNavigation);
    window.addEventListener('hashchange', syncNavigation);
    return () => {
      window.removeEventListener('popstate', syncNavigation);
      window.removeEventListener('hashchange', syncNavigation);
    };
  }, []);

  useEffect(() => {
    if (!status || !anchorToReveal) return;
    const target = document.getElementById(anchorToReveal);
    if (!target || target.closest('[hidden]')) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: 'start' });
    setAnchorToReveal(null);
  }, [activeTab, anchorToReveal, status]);

  const updateRewardLocation = useCallback(
    (next: { tab?: RewardTab; ambassadorOnly?: boolean }) => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      const nextTab = next.tab ?? activeTab;
      const nextAmbassadorOnly = next.ambassadorOnly ?? ambassadorOnly;

      if (nextAmbassadorOnly) url.searchParams.set('category', 'ambassador');
      else url.searchParams.delete('category');
      url.hash = nextTab === 'history' ? 'historial-premios' : 'cobrar-premios';

      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.pushState(window.history.state, '', nextUrl);
    },
    [activeTab, ambassadorOnly],
  );

  const selectTab = useCallback(
    (nextTab: RewardTab, options?: { scroll?: boolean }) => {
      setNavigation((current) => ({ ...current, tab: nextTab }));
      if (typeof window !== 'undefined') {
        const currentNavigation = readRewardNavigation();
        const hash =
          nextTab === 'history' ? 'historial-premios' : 'cobrar-premios';
        if (window.location.hash.replace(/^#/, '').toLowerCase() !== hash) {
          updateRewardLocation({
            tab: nextTab,
            ambassadorOnly: currentNavigation.ambassadorOnly,
          });
        }
      }

      if (options?.scroll && typeof document !== 'undefined') {
        window.setTimeout(() => {
          const targetId =
            nextTab === 'history' ? 'reward-history-title' : 'claimable-rewards-title';
          const target = document.getElementById(targetId);
          if (target && typeof target.scrollIntoView === 'function') {
            target.focus({ preventScroll: true });
            target.scrollIntoView({ block: 'start' });
          }
        }, 0);
      }
    },
    [updateRewardLocation],
  );

  const clearAmbassadorFilter = useCallback(() => {
    setNavigation((current) => ({ ...current, ambassadorOnly: false }));
    updateRewardLocation({ ambassadorOnly: false });
  }, [updateRewardLocation]);

  const load = useCallback(
    async (options?: {
      cursor?: string;
      append?: boolean;
      background?: boolean;
      signal?: AbortSignal;
      expectedAddress?: string;
      expectedChainId?: 56 | 97;
    }) => {
      if (!walletAddress) return null;
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      const append = Boolean(options?.append);
      const background = Boolean(options?.background);
      if (append) {
        if (mountedRef.current) setLoadingMore(true);
      } else if (!background && mountedRef.current) setRequestState('loading');
      try {
        const params = new URLSearchParams({ walletAddress, limit: '50' });
        if (options?.cursor) params.set('cursor', options.cursor);
        const response = await fetch(
          `/api/economy/v1/rewards?${params.toString()}`,
          {
            cache: 'no-store',
            credentials: 'same-origin',
            signal: options?.signal,
          },
        );
        const body = (await response.json()) as {
          status?: string;
          data?: RewardStatus;
        };
        if (options?.signal?.aborted) throw new Error('TRANSACTION_REFRESH_ABORTED');
        if (requestId !== loadRequestIdRef.current || !mountedRef.current) return null;
        if (options?.expectedAddress && options.expectedChainId !== undefined) {
          assertLiveClaimContext(options.expectedAddress, options.expectedChainId);
        }
        if (!response.ok || body.status !== 'ok' || !body.data)
          throw new Error('REWARDS_UNAVAILABLE');
        setStatus((current) => {
          if (!mountedRef.current) return current;
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
        if (mountedRef.current) setRequestState('ready');
        return body.data;
      } finally {
        if (append && mountedRef.current) setLoadingMore(false);
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
    const controller = new AbortController();
    load({ signal: controller.signal }).catch(() => {
      if (!active) return;
      setStatus(null);
      setRequestState('unavailable');
    });
    return () => {
      active = false;
      controller.abort();
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
        category: 'reward' as const,
        transactionHash: null,
        transactionChainId: null,
      })),
      ...(status.ambassadorAllocations ?? []).map((allocation) => ({
        id: `ambassador-allocation:${allocation.allocationId}`,
        date: allocation.createdAt,
        title: rewardLabel(allocation.category),
        helper: periodLabel(allocation.periodId),
        amountRaw: allocation.amountRaw,
        state: 'Comisión registrada' as const,
        kind: 'earned' as const,
        category: 'ambassador' as const,
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
        category: 'claim' as const,
        transactionHash: claim.transactionHash,
        transactionChainId: claim.chainId,
      })),
    ]
      .filter(
        (item) =>
          !ambassadorOnly ||
          item.category === 'ambassador' ||
          item.category === 'claim',
      )
      .sort(
        (left, right) =>
          new Date(right.date).getTime() - new Date(left.date).getTime(),
      );
  }, [ambassadorOnly, status]);

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

  async function refreshClaimProjection(pending: PendingClaim) {
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    try {
      const converged = await retryTransactionRefresh(
        async () => {
          assertLiveClaimContext(pending.wallet, pending.chainId);
          try {
            const next = await load({
              background: true,
              signal: controller.signal,
              expectedAddress: pending.wallet,
              expectedChainId: pending.chainId,
            });
            assertLiveClaimContext(pending.wallet, pending.chainId);
            return Boolean(next?.claims.some((claim) => (
              claim.batchId.toLowerCase() === pending.batchId.toLowerCase()
                || claim.transactionHash.toLowerCase() === pending.hash.toLowerCase()
            )));
          } catch (reason) {
            if (isTransactionRefreshAborted(reason)) throw reason;
            return false;
          }
        },
        { signal: controller.signal },
      );
      if (converged && mountedRef.current) {
        pendingClaimRef.current = null;
        setPendingClaim(null);
        setClaimFeedback((current) => current?.kind === 'success'
          ? { ...current, message: 'Cobro confirmado. Los UKI ya están en tu wallet y el historial está actualizado.' }
          : current);
      }
    } catch (reason) {
      if (isTransactionRefreshAborted(reason) || (reason instanceof Error && reason.message === 'WALLET_CONTEXT_CHANGED')) return;
      // Receipt success is authoritative; a slow rewards API remains a delayed projection.
    } finally {
      if (refreshAbortRef.current === controller) refreshAbortRef.current = null;
    }
  }

  async function recheckPendingClaim() {
    const pending = pendingClaimRef.current;
    if (!pending || claimingBatch) return;
    if (!publicClient) {
      setClaimFeedback({
        kind: 'error',
        message: 'No podemos consultar la confirmación todavía. Conservamos el hash para volver a comprobarlo.',
        transactionHash: pending.hash,
        chainId: pending.chainId,
      });
      return;
    }
    try {
      assertLiveClaimContext(pending.wallet, pending.chainId);
    } catch {
      setClaimFeedback({
        kind: 'error',
        message: 'La wallet o la red cambió. Vuelve a conectar la cuenta original para comprobar este cobro.',
        transactionHash: pending.hash,
        chainId: pending.chainId,
      });
      return;
    }
    setClaimingBatch(pending.batchId);
    try {
      const confirmed = await waitForConfirmedEvmTransaction(publicClient, pending.hash);
      const receipt = confirmed.receipt;
      if (receipt.status !== 'success') throw new Error('CLAIM_REVERTED');
      assertLiveClaimContext(pending.wallet, pending.chainId);
      const confirmedHash = confirmed.hash;
      const confirmedPending = {
        ...pending,
        hash: confirmedHash,
        receiptConfirmed: true,
      } satisfies PendingClaim;
      pendingClaimRef.current = confirmedPending;
      if (mountedRef.current) setPendingClaim(confirmedPending);
      setClaimFeedback({
        kind: 'success',
        message: 'Cobro confirmado. Los UKI ya están en tu wallet.',
        transactionHash: confirmedHash,
        chainId: pending.chainId,
      });
      window.dispatchEvent(new CustomEvent('cukies:rewards:refresh', { detail: { hash: confirmedHash, batchId: pending.batchId } }));
      void refreshClaimProjection(confirmedPending);
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      if (error instanceof Error && error.message === 'CLAIM_REVERTED') {
        pendingClaimRef.current = null;
        setPendingClaim(null);
        setClaimFeedback({
          kind: 'error',
          message: 'El cobro no se ha completado: la transacción fue revertida. No se ha descontado ningún premio y puedes volver a intentarlo.',
        });
      } else if (error instanceof TransactionReplacementPendingError) {
        const updated = { ...pending, hash: error.hash } satisfies PendingClaim;
        pendingClaimRef.current = updated;
        setPendingClaim(updated);
        setClaimFeedback({
          kind: 'error',
          message: 'La transacción fue repriciada y sigue pendiente. Conservamos el hash nuevo; compruébala sin firmar otra vez.',
          transactionHash: error.hash,
          chainId: pending.chainId,
        });
      } else if (error instanceof TransactionReplacementError) {
        pendingClaimRef.current = null;
        setPendingClaim(null);
        setClaimFeedback({
          kind: 'error',
          message: error.reason === 'cancelled'
            ? 'La transacción fue cancelada en la wallet. No se ha descontado ningún premio.'
            : 'La transacción fue reemplazada por otra operación. No se ha descontado ningún premio.',
        });
      } else {
        setClaimFeedback({
          kind: 'error',
          message: 'El cobro sigue pendiente. Puedes volver a comprobarlo sin firmar otra vez.',
          transactionHash: pending.hash,
          chainId: pending.chainId,
        });
      }
    } finally {
      if (mountedRef.current) setClaimingBatch(null);
    }
  }

  async function claimReward(reward: PublishedReward) {
    if (
      !publicClient ||
      claimingBatch ||
      pendingClaimRef.current ||
      !address ||
      !walletMatches ||
      chainId !== reward.batch.chainId
    )
      return;
    setClaimFeedback(null);
    setClaimingBatch(reward.batch.batchId);
    const expectedAddress = address;
    const expectedChainId = reward.batch.chainId;
    let submittedHash: Hex | null = null;
    try {
      assertLiveClaimContext(expectedAddress, expectedChainId);
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
      submittedHash = hash;
      let receipt;
      let confirmedHash = hash;
      try {
        const confirmed = await waitForConfirmedEvmTransaction(publicClient, hash);
        receipt = confirmed.receipt;
        confirmedHash = confirmed.hash;
      } catch (reason) {
        if (reason instanceof TransactionReplacementError || reason instanceof TransactionReplacementPendingError) throw reason;
        const pending = {
          batchId: reward.batch.batchId,
          hash,
          wallet: expectedAddress,
          chainId: expectedChainId,
        } satisfies PendingClaim;
        pendingClaimRef.current = pending;
        if (mountedRef.current) setPendingClaim(pending);
        setClaimFeedback({
          kind: 'error',
          message: 'Cobro enviado. La confirmación aún no llega; compruébalo sin firmar otra vez.',
          transactionHash: hash,
          chainId: expectedChainId,
        });
        return;
      }
      if (receipt.status !== 'success') throw new Error('CLAIM_REVERTED');
      assertLiveClaimContext(expectedAddress, expectedChainId);
      const confirmedPending = {
        batchId: reward.batch.batchId,
        hash: confirmedHash,
        wallet: expectedAddress,
        chainId: expectedChainId,
        receiptConfirmed: true,
      } satisfies PendingClaim;
      pendingClaimRef.current = confirmedPending;
      if (mountedRef.current) setPendingClaim(confirmedPending);
      setClaimFeedback({
        kind: 'success',
        message: 'Cobro confirmado. Los UKI ya están en tu wallet.',
        transactionHash: confirmedHash,
        chainId: reward.batch.chainId,
      });
      window.dispatchEvent(new CustomEvent('cukies:rewards:refresh', { detail: { hash: confirmedHash, batchId: reward.batch.batchId } }));
      void refreshClaimProjection(confirmedPending);
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      if (error instanceof Error && error.message === 'WALLET_CONTEXT_CHANGED') {
        if (submittedHash) {
          const pending = {
            batchId: reward.batch.batchId,
            hash: submittedHash,
            wallet: expectedAddress,
            chainId: expectedChainId,
            receiptConfirmed: true,
          } satisfies PendingClaim;
          pendingClaimRef.current = pending;
          if (walletMatches) setPendingClaim(pending);
        }
        setClaimFeedback({
          kind: 'success',
          message: 'Cobro confirmado en la cadena. La wallet o la red cambió antes de actualizar esta vista.',
          transactionHash: submittedHash ?? undefined,
          chainId: expectedChainId,
        });
        return;
      }
      if (error instanceof Error && error.message === 'CLAIM_REVERTED') {
        setClaimFeedback({
          kind: 'error',
          message: 'El cobro no se ha completado: la transacción fue revertida. No se ha descontado ningún premio y puedes volver a intentarlo.',
        });
        return;
      }
      if (error instanceof TransactionReplacementPendingError) {
        const pending = {
          batchId: reward.batch.batchId,
          hash: error.hash,
          wallet: expectedAddress,
          chainId: expectedChainId,
        } satisfies PendingClaim;
        pendingClaimRef.current = pending;
        setPendingClaim(pending);
        setClaimFeedback({
          kind: 'error',
          message: 'La transacción fue repriciada y sigue pendiente. Conservamos el hash nuevo; compruébala sin firmar otra vez.',
          transactionHash: error.hash,
          chainId: expectedChainId,
        });
        return;
      }
      if (error instanceof TransactionReplacementError) {
        setClaimFeedback({
          kind: 'error',
          message: error.reason === 'cancelled'
            ? 'La transacción fue cancelada en la wallet. No se ha descontado ningún premio.'
            : 'La transacción fue reemplazada por otra operación. No se ha descontado ningún premio.',
        });
        return;
      }
      setClaimFeedback({
        kind: 'error',
        message:
          'El cobro no se ha completado. No se ha descontado ningún premio y puedes volver a intentarlo.',
      });
    } finally {
      if (mountedRef.current) setClaimingBatch(null);
    }
  }

  function prepareRewardNetwork(targetChainId: 56 | 97) {
    if (requestWallet === FALLBACK_COORDINATOR.requestWallet) {
      switchChain({ chainId: targetChainId });
      return;
    }
    void requestWallet({
      kind: 'evm',
      targetChainId,
      reason: 'Cambia la wallet a la red del premio antes de firmar el cobro.',
    }).catch((error: unknown) => {
      setClaimFeedback({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'No se pudo preparar la red para cobrar.',
      });
    });
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
      <section className="mx-auto w-full max-w-[760px] rounded-[16px] border border-[var(--uki-lilac-border)] bg-[#09060f] p-6 sm:p-9">
        <p className="flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)]">
          <Gift className="h-4 w-4" /> Tus premios
        </p>
        <h1 className="mt-3 max-w-2xl font-headline text-3xl font-black leading-tight tracking-[-0.03em] text-[var(--uki-cream)] sm:text-4xl">
          Consulta y cobra tus recompensas
        </h1>
        <p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">
          Conecta tu wallet para ver lo que has ganado en partidas y pools, y
          cobrar los premios que ya estén disponibles.
        </p>
        <LandingWalletConnectButton
          evmOnly
          className="mt-6 min-h-12 w-full px-5 sm:w-fit"
          label="Conectar wallet"
          compactLabel="Conectar wallet"
          showCompactText={false}
        />
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1480px] pb-10">
      <header className="border-b border-white/10 pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)]">
              <Gift className="h-4 w-4" /> Premios
            </p>
            <h1 className="mt-2 text-balance font-headline text-3xl font-black leading-tight tracking-[-0.03em] text-[var(--uki-cream)] sm:text-4xl">
              Tus premios UKI
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              Comprueba tu saldo, cobra lo disponible y revisa cada movimiento.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshRewards}
            disabled={requestState === 'loading'}
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-[9px] border border-[rgba(228,92,255,0.35)] px-4 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-lilac)] transition hover:border-[rgba(228,92,255,0.60)] hover:bg-[rgba(228,92,255,0.08)] disabled:cursor-wait disabled:opacity-50 sm:w-auto"
          >
            <RefreshCw
              className={
                requestState === 'loading' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'
              }
            />{' '}
            Actualizar
          </button>
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
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-white/15 px-4 text-xs font-black uppercase tracking-[0.07em] text-[var(--uki-cream)]"
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
          <section
            aria-labelledby="reward-balance-title"
            className="mt-5 overflow-hidden rounded-[16px] border border-[var(--uki-lilac-border)] bg-[rgba(228,92,255,0.06)]"
          >
            <h2 id="reward-balance-title" className="sr-only">Tu saldo en UKI</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4">
              {[
                ['Listo para cobrar', status.claimableRaw, 'Disponible ahora'],
                [
                  'En preparación',
                  status.pendingRaw,
                  'Registrado y todavía no habilitado',
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
                  className={`min-w-0 p-4 sm:p-5 ${
                    index === 0 ? 'bg-[rgba(228,92,255,0.10)]' : ''
                  } ${index % 2 === 1 ? 'border-l border-white/10' : ''} ${
                    index > 1
                      ? 'border-t border-white/10 sm:border-t-0 sm:border-l'
                      : ''
                  }`}
                >
                  <p className="text-[0.68rem] font-black uppercase leading-tight tracking-[0.1em] text-[var(--uki-muted)]">
                    {label}
                  </p>
                  <p
                    className={`mt-2 break-words font-headline text-xl font-black sm:text-2xl ${
                      index === 0
                        ? 'text-[var(--uki-lilac)]'
                        : 'text-[var(--uki-gold)]'
                    }`}
                  >
                    {formatRaw(value)} UKI
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                    {helper}
                  </p>
                </div>
              ))}
            </div>
            {hasPositiveRaw(status.claimableRaw) ? (
              <div className="border-t border-white/10 p-3 sm:p-4">
                <button
                  type="button"
                  onClick={() => selectTab('claimable', { scroll: true })}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[9px] bg-[var(--uki-lilac)] px-4 font-headline text-sm font-black text-[#09060f] transition hover:brightness-110 sm:w-auto"
                >
                  <Wallet className="h-4 w-4" /> Ver premios disponibles
                </button>
              </div>
            ) : null}
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

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value === 'claimable' || value === 'history') {
                selectTab(value);
              }
            }}
            aria-label="Secciones de premios"
            className="mt-5 min-w-0"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TabsList
                aria-label="Secciones de premios"
                className="grid h-auto w-full max-w-full grid-cols-2 gap-1 rounded-[10px] border border-[var(--uki-lilac-border)] bg-[rgba(228,92,255,0.06)] p-1 sm:max-w-md"
              >
                <TabsTrigger
                  value="claimable"
                  className="min-h-11 min-w-0 gap-2 rounded-[8px] px-3 text-xs font-black uppercase tracking-[0.06em] text-[var(--uki-muted)] focus-visible:ring-[var(--uki-lilac)] data-[state=active]:bg-[var(--uki-lilac)] data-[state=active]:text-[#09060f] sm:text-sm"
                >
                  <Wallet className="h-4 w-4 shrink-0" />
                  <span>Por cobrar</span>
                  <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[0.65rem] tabular-nums">
                    {status.claimables.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="min-h-11 min-w-0 gap-2 rounded-[8px] px-3 text-xs font-black uppercase tracking-[0.06em] text-[var(--uki-muted)] focus-visible:ring-[var(--uki-lilac)] data-[state=active]:bg-[var(--uki-lilac)] data-[state=active]:text-[#09060f] sm:text-sm"
                >
                  <History className="h-4 w-4 shrink-0" />
                  <span>Historial</span>
                </TabsTrigger>
              </TabsList>
              <p className="text-xs font-semibold text-[var(--uki-muted)]">
                {activeTab === 'claimable'
                  ? 'Revisa y confirma los premios disponibles.'
                  : ambassadorOnly
                  ? 'Filtro de comisiones de embajador activo.'
                  : 'Consulta todos tus movimientos.'}
              </p>
            </div>

            {claimingBatch ? (
              <div
                role="status"
                className="mt-4 flex items-center gap-2 rounded-[12px] border border-[rgba(228,92,255,0.30)] bg-[rgba(228,92,255,0.08)] p-4 text-sm font-black text-[var(--uki-cream)]"
              >
                <Loader2 className="h-4 w-4 animate-spin text-[var(--uki-lilac)]" />
                Confirmando cobro… No cierres esta pantalla.
              </div>
            ) : null}

            {claimFeedback ? (
              <div
                role={claimFeedback.kind === 'error' ? 'alert' : 'status'}
                className={`mt-4 rounded-[12px] border p-4 ${
                  claimFeedback.kind === 'success'
                    ? 'border-[rgba(228,92,255,0.30)] bg-[rgba(228,92,255,0.10)]'
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
                    className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-[0.07em] text-[var(--uki-lilac)] underline underline-offset-4"
                  >
                    Ver transacción <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            ) : null}

            <TabsContent
              value="claimable"
              forceMount
              hidden={activeTab !== 'claimable'}
              className="scroll-mt-24 mt-4 min-w-0"
            >
              <div id="cobrar-premios" className="scroll-mt-24" />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2
                    id="claimable-rewards-title"
                    tabIndex={-1}
                    className="font-headline text-2xl font-black text-[var(--uki-cream)] sm:text-3xl"
                  >
                    Premios para tu wallet
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                    Verás el importe, desde cuándo está disponible y hasta qué
                    día puedes cobrarlo.
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

              {status.claimables.length > 0 &&
              (!isConnected || !walletMatches) ? (
                <div className="mt-5 flex flex-col gap-4 rounded-[12px] border border-amber-300/25 bg-amber-300/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-black text-[var(--uki-cream)]">
                      Conecta la wallet asociada a estos premios
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">
                      La wallet activa debe coincidir con{' '}
                      {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}{' '}
                      antes de cobrar.
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
                    const isPending = pendingClaim?.batchId === reward.batch.batchId;
                    const claimDisabled =
                      Boolean(claimingBatch) || Boolean(pendingClaim) || !walletMatches || !isConnected;
                    return (
                      <article
                        key={reward.batch.batchId}
                        className="rounded-[16px] border border-[rgba(228,92,255,0.30)] bg-black/25 p-5 sm:p-6"
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
                          <span className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(228,92,255,0.30)] bg-[rgba(228,92,255,0.10)]">
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
                        {isPending ? (
                          <button
                            type="button"
                            onClick={() => void recheckPendingClaim()}
                            disabled={Boolean(claimingBatch)}
                            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[9px] border border-amber-200/35 bg-amber-200/[0.08] px-5 font-headline text-sm font-black uppercase tracking-[0.07em] text-amber-100 disabled:opacity-50"
                          >
                            {isClaiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            {isClaiming ? 'Comprobando cobro…' : 'Comprobar cobro enviado'}
                          </button>
                        ) : wrongChain && walletMatches ? (
                          <button
                            type="button"
                            onClick={() =>
                              prepareRewardNetwork(reward.batch.chainId)
                            }
                            disabled={
                              switchingChain ||
                              evmWallet.isConnecting ||
                              Boolean(claimingBatch)
                            }
                            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[9px] bg-[var(--uki-lilac)] px-5 font-headline text-sm font-black uppercase tracking-[0.07em] text-[#09060f] disabled:opacity-50"
                          >
                            <Wallet className="h-4 w-4" />{' '}
                            {switchingChain || evmWallet.isConnecting
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
                              : `Cobrar ${formatRaw(
                                  reward.batch.amountRaw,
                                )} UKI`}
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5 rounded-[16px] border border-white/10 bg-black/25 p-7 sm:p-8">
                  {hasPositiveRaw(status.pendingRaw) ? (
                    <Clock3 className="h-7 w-7 text-[var(--uki-lilac)]" />
                  ) : (
                    <Sparkles className="h-7 w-7 text-[var(--uki-lilac)]" />
                  )}
                  <h3 className="mt-4 font-headline text-xl font-black text-[var(--uki-cream)]">
                    {hasPositiveRaw(status.pendingRaw)
                      ? `${formatRaw(
                          status.pendingRaw,
                        )} UKI se están preparando`
                      : 'Ahora mismo no tienes premios para cobrar'}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                    {hasPositiveRaw(status.pendingRaw)
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
            </TabsContent>

            <TabsContent
              value="history"
              forceMount
              hidden={activeTab !== 'history'}
              className="scroll-mt-24 mt-4 min-w-0"
            >
              <div id="historial-premios" className="scroll-mt-24" />
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2
                    id="reward-history-title"
                    tabIndex={-1}
                    className="font-headline text-2xl font-black text-[var(--uki-cream)] sm:text-3xl"
                  >
                    Historial de premios
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                    Cada fila indica si el premio se registró, necesita revisión
                    o ya llegó a tu wallet.
                  </p>
                </div>
                {hasActivity ? (
                  <History className="hidden h-6 w-6 text-[var(--uki-lilac)] sm:block" />
                ) : null}
              </div>
              {activity.length > 0 ? (
                ambassadorOnly ? (
                  <div className="mt-5 flex flex-col gap-3 rounded-[12px] border border-[var(--uki-lilac-border)] bg-[rgba(228,92,255,0.06)] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-black text-[var(--uki-cream)]">
                        Mostrando comisiones de embajador
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">
                        Los cobros confirmados pueden agrupar varios tipos de
                        premio en una misma transacción.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearAmbassadorFilter}
                      className="min-h-11 text-left text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-lilac)]"
                    >
                      Ver todo el historial
                    </button>
                  </div>
                ) : null
              ) : null}
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
                                : 'border-[var(--uki-lilac-border)] bg-[rgba(228,92,255,0.08)]'
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
                                    : 'bg-[rgba(228,92,255,0.10)] text-[var(--uki-lilac)]'
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
                                className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-black text-[var(--uki-lilac)] underline underline-offset-4"
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
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-white/15 px-4 text-xs font-black uppercase tracking-[0.07em] text-[var(--uki-cream)] disabled:opacity-50"
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
            </TabsContent>
          </Tabs>

          <details className="group mt-6 rounded-[14px] border border-white/10 bg-black/20 p-4 sm:p-5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-headline text-base font-black text-[var(--uki-cream)] sm:text-lg">
              ¿Necesitas ayuda con un estado?{' '}
              <ChevronDown className="h-5 w-5 text-[var(--uki-lilac)] transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 md:grid-cols-3">
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
