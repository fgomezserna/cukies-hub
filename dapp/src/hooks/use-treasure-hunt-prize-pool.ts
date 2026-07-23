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

function finiteNumber(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

      setValue(calculateTreasureHuntPrizePoolUki({
        totalAsmRaised,
        ukiPerAsm,
        poolBps,
      }));
      setError(null);
    } catch (caught) {
      if (signal?.aborted) return;
      setValue(null);
      setError(caught instanceof Error ? caught.message : 'Prize pool is unavailable');
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [poolBps]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const interval = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [load]);

  return { value, isLoading, error, reload: load } as const;
}
