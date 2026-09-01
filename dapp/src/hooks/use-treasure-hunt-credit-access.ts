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
    availableCredits: number;
    reservedCredits: number;
    blocked: boolean;
  };
};

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
    && Number.isSafeInteger(candidate.balance.availableCredits)
    && candidate.balance.availableCredits >= 0
    && Number.isSafeInteger(candidate.balance.reservedCredits)
    && candidate.balance.reservedCredits >= 0
    && typeof candidate.balance.blocked === 'boolean'
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
    refetchOnWindowFocus: true,
  });
  const cost = query.data?.rule.costs.find((candidate) => (
    candidate.active && candidate.costCode === TREASURE_HUNT_START_COST_CODE
  ));
  const costCredits = cost?.credits ?? null;
  const availableCredits = query.data?.balance.availableCredits ?? null;
  const blocked = query.data?.balance.blocked ?? false;
  const ready = Boolean(query.data && costCredits !== null);

  return {
    walletConnected: Boolean(walletAddress),
    isLoading: authLoading || (Boolean(walletAddress) && query.isLoading),
    isError: Boolean(walletAddress) && (query.isError || (query.isSuccess && !ready)),
    ready,
    blocked,
    costCredits,
    availableCredits,
    reservedCredits: query.data?.balance.reservedCredits ?? null,
    canPlay: Boolean(
      ready
      && !blocked
      && costCredits !== null
      && availableCredits !== null
      && availableCredits >= costCredits
    ),
    missingCredits: ready && costCredits !== null && availableCredits !== null
      ? Math.max(0, costCredits - availableCredits)
      : null,
    reload: query.refetch,
  };
}
