'use client';

import { useEffect, useMemo, useState } from 'react';
import { Filter, RefreshCw, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LegacyMarketplaceListResponse } from '@/lib/legacy-marketplace/types';

import { CukiCard } from './cuki-card';

const PAGE_SIZE = 24;

const initialData: LegacyMarketplaceListResponse = {
  source: 'empty',
  items: [],
  total: 0,
  offset: 0,
  limit: PAGE_SIZE,
  facets: {
    states: [],
    networks: [],
    types: [],
  },
};

export function MarketplaceClient() {
  const [data, setData] = useState<LegacyMarketplaceListResponse>(initialData);
  const [search, setSearch] = useState('');
  const [network, setNetwork] = useState('all');
  const [state, setState] = useState('onSale');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('newest');
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      sort,
    });

    if (search.trim()) params.set('search', search.trim());
    if (network !== 'all') params.set('network', network);
    if (state !== 'all') params.set('state', state);
    if (type !== 'all') params.set('type', type);

    return params.toString();
  }, [network, offset, search, sort, state, type]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);

    fetch(`/api/legacy-marketplace/cukies?${queryString}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as LegacyMarketplaceListResponse;
        setData(payload);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setData({
          ...initialData,
          error: error instanceof Error ? error.message : 'Marketplace error',
        });
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [queryString, reloadKey]);

  function resetFilters() {
    setSearch('');
    setNetwork('all');
    setState('onSale');
    setType('all');
    setSort('newest');
    setOffset(0);
  }

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(Math.ceil(data.total / PAGE_SIZE), 1);

  return (
    <section className="grid gap-5">
      <div className="rounded-[8px] border border-white/10 bg-black/30 p-4 backdrop-blur">
        <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto_auto]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setOffset(0);
              }}
              placeholder="Search token ID, number, owner or type"
              className="pl-9"
            />
          </div>

          <select
            value={network}
            onChange={(event) => {
              setNetwork(event.target.value);
              setOffset(0);
            }}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="all">All networks</option>
            {data.facets.networks.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.value} ({facet.count})
              </option>
            ))}
          </select>

          <select
            value={state}
            onChange={(event) => {
              setState(event.target.value);
              setOffset(0);
            }}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="all">All states</option>
            {data.facets.states.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.value} ({facet.count})
              </option>
            ))}
          </select>

          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setOffset(0);
            }}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="all">All types</option>
            {data.facets.types.map((facet) => (
              <option key={facet.value} value={facet.value}>
                Type {facet.value} ({facet.count})
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setOffset(0);
            }}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="newest">Newest</option>
            <option value="number-asc">Number asc</option>
            <option value="number-desc">Number desc</option>
            <option value="price-asc">Price asc</option>
            <option value="price-desc">Price desc</option>
          </select>

          <Button
            onClick={resetFilters}
            variant="outline"
            className="border-white/10 bg-white/[0.03]"
          >
            <Filter className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-headline text-2xl font-bold text-white">
            Cukies marketplace
          </h2>
          <p className="text-sm text-slate-400">
            {isLoading
              ? 'Loading legacy inventory...'
              : `${data.total.toLocaleString()} results · source ${data.source}`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Button
            onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
            disabled={offset === 0 || isLoading}
            variant="outline"
            className="border-white/10 bg-white/[0.03]"
          >
            Previous
          </Button>
          <span className="min-w-24 text-center">
            {currentPage} / {totalPages}
          </span>
          <Button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= data.total || isLoading}
            variant="outline"
            className="border-white/10 bg-white/[0.03]"
          >
            Next
          </Button>
        </div>
      </div>

      {data.error && (
        <div className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
          {data.error}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="aspect-[0.78] animate-pulse rounded-[8px] border border-white/10 bg-white/[0.04]"
            />
          ))}
        </div>
      ) : data.items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {data.items.map((cuki) => (
            <CukiCard key={cuki.tokenId} cuki={cuki} />
          ))}
        </div>
      ) : (
        <div className="rounded-[8px] border border-white/10 bg-black/30 p-8 text-center text-slate-400">
          No Cukies match these filters.
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={() => {
            setOffset(0);
            setData(initialData);
            setReloadKey((value) => value + 1);
          }}
          variant="ghost"
          className="text-slate-400 hover:text-white"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh data
        </Button>
      </div>
    </section>
  );
}
