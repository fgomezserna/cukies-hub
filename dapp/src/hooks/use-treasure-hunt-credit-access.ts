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
    poolDepositedCredits: number;
    availableCredits: number;
    reservedCredits: number;
    spentCredits: number;
    blocked: boolean;
  };
  pool: {
    availableCredits: number;
    reservedCredits: number;
    blocked: boolean;
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
    && Number.isSafeInteger(candidate.balance.poolDepositedCredits)
    && candidate.balance.poolDepositedCredits >= 0
    && Number.isSafeInteger(candidate.balance.availableCredits)
    && candidate.balance.availableCredits >= 0
    && Number.isSafeInteger(candidate.balance.reservedCredits)
    && candidate.balance.reservedCredits >= 0
    && Number.isSafeInteger(candidate.balance.spentCredits)
    && candidate.balance.spentCredits >= 0
    && typeof candidate.balance.blocked === 'boolean'
    && candidate.pool
    && Number.isSafeInteger(candidate.pool.availableCredits)
    && candidate.pool.availableCredits >= 0
    && Number.isSafeInteger(candidate.pool.reservedCredits)
    && candidate.pool.reservedCredits >= 0
    && typeof candidate.pool.blocked === 'boolean'
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
  const cost = query.data?.rule.costs.find((candidate) => (
    candidate.active && candidate.costCode === TREASURE_HUNT_START_COST_CODE
  ));
  const costCredits = cost?.credits ?? null;
  const ownAvailableCredits = query.data?.balance.availableCredits ?? null;
  const poolAvailableCredits = query.data?.pool.availableCredits ?? null;
  const creditSource = nextTreasureHuntCreditSource({
    costCredits,
    ownAvailableCredits,
    poolAvailableCredits,
  });
  const blocked = Boolean(
    query.data?.balance.blocked
    || (creditSource === 'pool' && query.data?.pool.blocked)
  );
  const ready = Boolean(query.data && costCredits !== null);
  const bestAvailableSource = Math.max(ownAvailableCredits ?? 0, poolAvailableCredits ?? 0);

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
    poolContributedCredits: query.data?.balance.poolDepositedCredits ?? null,
    spentCredits: query.data?.balance.spentCredits ?? null,
    creditSource,
    reservedCredits: query.data?.balance.reservedCredits ?? null,
    poolReservedCredits: query.data?.pool.reservedCredits ?? null,
    canPlay: Boolean(
      ready
      && !blocked
      && creditSource
    ),
    missingCredits: ready && costCredits !== null
      ? Math.max(0, costCredits - bestAvailableSource)
      : null,
    reload: query.refetch,
  };
}
