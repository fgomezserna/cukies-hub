'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { TreasureHuntWeeklyOverview } from '@/lib/uki-economy/game-economy/treasure-hunt-weekly-public';

const AUTO_REFRESH_MS = 15_000;

export function useTreasureHuntWeeklyOverview(options?: {
  page?: number;
  pageSize?: number;
  mineOnly?: boolean;
  autoRefresh?: boolean;
}) {
  const [data, setData] = useState<TreasureHuntWeeklyOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 20;
  const mineOnly = options?.mineOnly ?? false;

  const reload = useCallback(async (silent = false) => {
    const requestId = ++requestIdRef.current;
    if (!silent) setIsLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      ...(mineOnly ? { mine: '1' } : {}),
    });
    try {
      const response = await fetch(`/api/games/treasure-hunt/weekly?${params}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json() as ({ success?: boolean } & TreasureHuntWeeklyOverview);
      if (!response.ok || payload.success !== true) throw new Error('WEEKLY_OVERVIEW_UNAVAILABLE');
      if (requestId !== requestIdRef.current) return;
      setData(payload);
      setError(null);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setError('No hemos podido actualizar la competición semanal.');
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [mineOnly, page, pageSize]);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  useEffect(() => {
    if (options?.autoRefresh === false) return undefined;
    const interval = window.setInterval(() => void reload(true), AUTO_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [options?.autoRefresh, reload]);

  return { data, isLoading, error, reload: () => reload(false) };
}
