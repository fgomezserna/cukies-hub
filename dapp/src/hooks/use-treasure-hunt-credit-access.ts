'use client';

import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/providers/auth-provider';

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
  currentRun?: {
    routes: Array<{
      status: string;
    }>;
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
    && (!candidate.currentRun || (
      Array.isArray(candidate.currentRun.routes)
      && candidate.currentRun.routes.every((run) => (
        run && typeof run.status === 'string'
      ))
    ))
  );
}

async function loadCreditStatus(walletAddress: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/economy/v1/credits?walletAddress=${encodeURIComponent(walletAddress)}`,
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
  const cost = queryHasError ? undefined : query.data?.rule.costs.find((candidate) => (
    candidate.active && candidate.costCode === TREASURE_HUNT_START_COST_CODE
  ));
  const costCredits = cost?.credits ?? null;
  const ownAvailableCredits = queryHasError ? null : query.data?.balance.availableCredits ?? null;
  const poolAvailableCredits = queryHasError ? null : query.data?.pool.availableCredits ?? null;
  const creditSource = nextTreasureHuntCreditSource({
    costCredits,
    ownAvailableCredits,
    poolAvailableCredits,
  });
  const currentRunStatuses = queryHasError
    ? []
    : query.data?.currentRun?.routes.map((run) => run.status) ?? [];
  const currentRunBlocked = currentRunStatuses.length > 0
    && currentRunStatuses.every((status) => status === 'blocked');
  const currentRunPending = currentRunStatuses.some((status) => (
    status === 'missing' || status === 'snapshotted' || status === 'processing'
  ));
  const blocked = Boolean(
    queryHasError
    || (!queryHasError && query.data?.balance.blocked)
    || (!queryHasError && creditSource === 'pool' && query.data?.pool.blocked)
    || currentRunBlocked
  );
  const ready = Boolean(!queryHasError && query.data && costCredits !== null);
  const bestAvailableSource = Math.max(ownAvailableCredits ?? 0, poolAvailableCredits ?? 0);
  const availabilityReason = ready && !blocked && !creditSource
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
    poolContributedCredits: queryHasError ? null : query.data?.balance.poolDepositedCredits ?? null,
    spentCredits: queryHasError ? null : query.data?.balance.spentCredits ?? null,
    creditSource,
    availabilityReason,
    reservedCredits: queryHasError ? null : query.data?.balance.reservedCredits ?? null,
    poolReservedCredits: queryHasError ? null : query.data?.pool.reservedCredits ?? null,
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
