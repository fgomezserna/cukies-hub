'use client';

import { useCallback, useEffect, useState } from 'react';

import { calculateTreasureHuntPrizePoolUki } from '@/lib/treasure-hunt-prize-pool';

interface PresaleStatusResponse {
  readonly price?: {
    readonly ukiPerAsmFormatted?: string | null;
  };
  readonly totals?: {
    readonly totalAsmRaisedFormatted?: string | null;
  };
}

const REFRESH_INTERVAL_MS = 60_000;
const PRIZE_POOL_CACHE_KEY = 'cukies:treasure-hunt:prize-pool:v1';

interface CachedPrizePool {
  readonly poolBps: number;
  readonly value: number;
}

function finiteNumber(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readCachedPrizePool(poolBps: number) {
  if (typeof window === 'undefined') return null;
  try {
    const cached = JSON.parse(window.localStorage.getItem(PRIZE_POOL_CACHE_KEY) ?? 'null') as
      | CachedPrizePool
      | null;
    if (
      cached?.poolBps !== poolBps ||
      !Number.isFinite(cached.value) ||
      cached.value < 0
    ) {
      return null;
    }
    return cached.value;
  } catch {
    return null;
  }
}

function cachePrizePool(poolBps: number, value: number) {
  try {
    window.localStorage.setItem(
      PRIZE_POOL_CACHE_KEY,
      JSON.stringify({ poolBps, value } satisfies CachedPrizePool),
    );
  } catch {
    // Storage can be unavailable in private wallet browsers.
  }
}

export function useTreasureHuntPrizePool(poolBps = 2_500) {
  const [value, setValue] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/presale/status', {
        cache: 'no-store',
        signal,
      });
      if (!response.ok) throw new Error('Presale status is unavailable');

      const body = await response.json() as PresaleStatusResponse;
      const totalAsmRaised = finiteNumber(body.totals?.totalAsmRaisedFormatted);
      const ukiPerAsm = finiteNumber(body.price?.ukiPerAsmFormatted);
      if (totalAsmRaised === null) throw new Error('Presale totals are unavailable');

      const nextValue = calculateTreasureHuntPrizePoolUki({
        totalAsmRaised,
        ukiPerAsm,
        poolBps,
      });
      setValue(nextValue);
      cachePrizePool(poolBps, nextValue);
      setError(null);
    } catch (caught) {
      if (signal?.aborted) return;
      setValue((current) => current ?? readCachedPrizePool(poolBps));
      setError(caught instanceof Error ? caught.message : 'Prize pool is unavailable');
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [poolBps]);

  useEffect(() => {
    const cachedValue = readCachedPrizePool(poolBps);
    if (cachedValue !== null) {
      setValue(cachedValue);
      setIsLoading(false);
    }
    const controller = new AbortController();
    void load(controller.signal);
    const interval = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [load, poolBps]);

  return { value, isLoading, error, reload: load } as const;
}
