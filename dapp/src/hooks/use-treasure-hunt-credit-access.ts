'use client';

import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/providers/auth-provider';
import type { CreditMaterializationState } from '@/lib/uki-economy/credits/materialization';

const TREASURE_HUNT_START_COST_CODE = 'treasure-hunt:start';

type CreditCost = {
  costCode: string;
  credits: number;
  active: boolean;
};

type CreditStatus = {
  rule: {
    version: string;
    costs: CreditCost[];
  };
  balance: {
    poolDepositedCredits: number | null;
    availableCredits: number;
    reservedCredits: number | null;
    spentCredits: number | null;
    blocked: boolean;
  };
  pool: {
    availableCredits: number;
    reservedCredits: number | null;
    blocked: boolean;
  };
  materialization: {
    balance: CreditMaterializationState;
    pool: CreditMaterializationState;
  };
  currentRun?: {
    routes: Array<{
      status: string;
    }>;
  };
  ownCukie?: {
    status: 'ready' | 'unknown';
    periodId: string | null;
    periodStartsAt: string | null;
    periodEndsAt: string | null;
    totalGamesRemaining: number | null;
    eligibleCukies: number | null;
    unknownCukies: number;
  };
};

export function nextTreasureHuntCreditSource(input: {
  costCredits: number | null;
  ownAvailableCredits: number | null;
  poolAvailableCredits: number | null;
}) {
  if (input.costCredits === null || input.ownAvailableCredits === null || input.poolAvailableCredits === null) {
    return null;
  }
  if (input.ownAvailableCredits >= input.costCredits) return 'own' as const;
  if (input.poolAvailableCredits >= input.costCredits) return 'pool' as const;
  return null;
}

function isCreditStatus(value: unknown): value is CreditStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<CreditStatus>;
  const nullableNonNegativeInteger = (number: unknown) => (
    number === null
    || (typeof number === 'number' && Number.isSafeInteger(number) && number >= 0)
  );
  const materializationStates = new Set<CreditMaterializationState>([
    'ready',
    'blocked',
    'unknown',
    'too_large',
    'stale',
  ]);
  return Boolean(
    candidate.rule
    && typeof candidate.rule.version === 'string'
    && Array.isArray(candidate.rule.costs)
    && candidate.rule.costs.every((cost) => (
      cost
      && typeof cost.costCode === 'string'
      && Number.isSafeInteger(cost.credits)
      && cost.credits > 0
      && typeof cost.active === 'boolean'
    ))
    && candidate.balance
    && nullableNonNegativeInteger(candidate.balance.poolDepositedCredits)
    && Number.isSafeInteger(candidate.balance.availableCredits)
    && candidate.balance.availableCredits >= 0
    && nullableNonNegativeInteger(candidate.balance.reservedCredits)
    && nullableNonNegativeInteger(candidate.balance.spentCredits)
    && typeof candidate.balance.blocked === 'boolean'
    && candidate.pool
    && Number.isSafeInteger(candidate.pool.availableCredits)
    && candidate.pool.availableCredits >= 0
    && nullableNonNegativeInteger(candidate.pool.reservedCredits)
    && typeof candidate.pool.blocked === 'boolean'
    && candidate.materialization
    && materializationStates.has(candidate.materialization.balance)
    && materializationStates.has(candidate.materialization.pool)
    && (!candidate.currentRun || (
      Array.isArray(candidate.currentRun.routes)
      && candidate.currentRun.routes.every((run) => (
        run && typeof run.status === 'string'
      ))
    ))
    && (!candidate.ownCukie || (
      (candidate.ownCukie.status === 'ready' || candidate.ownCukie.status === 'unknown')
      && (candidate.ownCukie.periodId === null || typeof candidate.ownCukie.periodId === 'string')
      && (candidate.ownCukie.periodStartsAt === null || typeof candidate.ownCukie.periodStartsAt === 'string')
      && (candidate.ownCukie.periodEndsAt === null || typeof candidate.ownCukie.periodEndsAt === 'string')
      && (candidate.ownCukie.totalGamesRemaining === null
        || (Number.isSafeInteger(candidate.ownCukie.totalGamesRemaining)
          && candidate.ownCukie.totalGamesRemaining >= 0))
      && (candidate.ownCukie.eligibleCukies === null
        || (Number.isSafeInteger(candidate.ownCukie.eligibleCukies)
          && candidate.ownCukie.eligibleCukies >= 0))
      && Number.isSafeInteger(candidate.ownCukie.unknownCukies)
      && candidate.ownCukie.unknownCukies >= 0
    ))
  );
}

async function loadCreditStatus(walletAddress: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/economy/v1/credits?walletAddress=${encodeURIComponent(walletAddress)}&includeOwnCukie=1`,
    {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    },
  );
  const payload = await response.json() as { data?: unknown };
  if (!response.ok || !isCreditStatus(payload.data)) {
    throw new Error('TREASURE_HUNT_CREDIT_STATUS_UNAVAILABLE');
  }
  return payload.data;
}

export function useTreasureHuntCreditAccess() {
  const { user, isLoading: authLoading } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const query = useQuery({
    queryKey: ['treasure-hunt-credit-access', walletAddress],
    queryFn: ({ signal }) => loadCreditStatus(walletAddress!, signal),
    enabled: Boolean(walletAddress) && !authLoading,
    staleTime: 10_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
  const queryHasError = Boolean(walletAddress)
    && (query.isError || query.isRefetchError || Boolean(query.error));
  const materializationUnavailable = Boolean(
    !queryHasError
    && query.data
    && (
      query.data.materialization.balance !== 'ready'
      || query.data.materialization.pool !== 'ready'
    )
  );
  const statusUnavailable = queryHasError || materializationUnavailable;
  const cost = statusUnavailable ? undefined : query.data?.rule.costs.find((candidate) => (
    candidate.active && candidate.costCode === TREASURE_HUNT_START_COST_CODE
  ));
  const costCredits = cost?.credits ?? null;
  const ownAvailableCredits = statusUnavailable ? null : query.data?.balance.availableCredits ?? null;
  const poolAvailableCredits = statusUnavailable ? null : query.data?.pool.availableCredits ?? null;
  const candidateCreditSource = nextTreasureHuntCreditSource({
    costCredits,
    ownAvailableCredits,
    poolAvailableCredits,
  });
  const currentRunStatuses = statusUnavailable
    ? []
    : query.data?.currentRun?.routes.map((run) => run.status) ?? [];
  const currentRunBlocked = currentRunStatuses.length > 0
    && currentRunStatuses.every((status) => status === 'blocked');
  const currentRunPending = currentRunStatuses.some((status) => (
    status === 'missing' || status === 'snapshotted' || status === 'processing'
  ));
  const blocked = Boolean(
    queryHasError
    || materializationUnavailable
    || (!statusUnavailable && query.data?.balance.blocked)
    || (!statusUnavailable && candidateCreditSource === 'pool' && query.data?.pool.blocked)
    || currentRunBlocked
  );
  // Keep raw balances available for diagnostics, but never expose a source as
  // selected while an account/run/pool incident blocks the access decision.
  const creditSource = blocked ? null : candidateCreditSource;
  const ready = Boolean(!statusUnavailable && query.data && costCredits !== null);
  const bestAvailableSource = Math.max(ownAvailableCredits ?? 0, poolAvailableCredits ?? 0);
  const availabilityReason = materializationUnavailable
    ? 'projection_unavailable' as const
    : ready && !blocked && !creditSource
      ? currentRunPending ? 'run_pending' as const : 'insufficient' as const
      : null;

  return {
    walletConnected: Boolean(walletAddress),
    isLoading: authLoading || (Boolean(walletAddress) && query.isLoading),
    isError: Boolean(walletAddress) && (query.isError || (query.isSuccess && !ready)),
    ready,
    blocked,
    costCredits,
    // Alias conservado para consumidores existentes: representa el saldo personal.
    availableCredits: ownAvailableCredits,
    ownAvailableCredits,
    poolAvailableCredits,
    poolContributedCredits: statusUnavailable ? null : query.data?.balance.poolDepositedCredits ?? null,
    spentCredits: statusUnavailable ? null : query.data?.balance.spentCredits ?? null,
    // Credits and NFT games are independent resources: a stale credit
    // projection must not turn a verified OWN quota into zero/unknown.
    ownCukieAvailability: queryHasError ? null : query.data?.ownCukie ?? null,
    creditSource,
    availabilityReason,
    reservedCredits: statusUnavailable ? null : query.data?.balance.reservedCredits ?? null,
    poolReservedCredits: statusUnavailable ? null : query.data?.pool.reservedCredits ?? null,
    canPlay: Boolean(
      !queryHasError
      && ready
      && !blocked
      && creditSource
    ),
    missingCredits: ready && costCredits !== null
      ? Math.max(0, costCredits - bestAvailableSource)
      : null,
    reload: query.refetch,
  };
}
