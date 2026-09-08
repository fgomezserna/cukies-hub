'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LegacyMarketplaceCukiItem } from '@/lib/legacy-marketplace/types';
import type { UkiMarketplaceOrderView } from '@/lib/uki-marketplace/types';
import { UkiMarketplaceBuyerCheckout } from '@/components/uki-marketplace/buyer-checkout';

import { CukiCard } from './cuki-card';

const PAGE_SIZE = 24;
type MarketplaceScope = 'all' | 'legacy' | 'uki';
type CursorState = { legacyOffset: number; ukiCursor: string | null };
type CatalogItem =
  | { source: 'legacy'; item: LegacyMarketplaceCukiItem }
  | { source: 'uki'; item: UkiMarketplaceOrderView };
type CatalogResponse = {
  status: 'ok' | 'error';
  data?: {
    items: CatalogItem[];
    cursors: CursorState;
    hasMore: boolean;
    legacyFacets?: {
      states: { value: string; count: number }[];
      networks: { value: string; count: number }[];
      types: { value: string; count: number }[];
      generations: { value: string; count: number }[];
    };
    sources: { legacy: 'ready' | 'unavailable'; uki: 'ready' | 'unavailable' };
  };
  code?: string;
};
type MarketplaceClientProps = { heading?: string; description?: string };

function canSortByPrice(scope: MarketplaceScope, network: string) {
  return scope === 'legacy' && network !== 'all';
}

function formatUkiAmount(raw: string) {
  if (!/^\d+$/.test(raw)) return 'Precio UKI no disponible';
  const padded = raw.padStart(19, '0');
  const integer = padded.slice(0, -18).replace(/^0+(?=\d)/, '');
  const fraction = padded.slice(-18).slice(0, 4).replace(/0+$/, '');
  return `${BigInt(integer || '0').toLocaleString('es-ES')}${
    fraction ? `,${fraction}` : ''
  } UKI`;
}

function UkiMarketplaceCard({
  order,
  expanded,
  onToggle,
  onPurchased,
}: {
  order: UkiMarketplaceOrderView;
  expanded: boolean;
  onToggle: () => void;
  onPurchased: () => void;
}) {
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-[8px] border border-lilac-200/20 bg-[#0d121d] shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:border-lilac-300/45">
      <div className="relative grid aspect-[4/5] min-h-[22rem] place-items-center bg-[radial-gradient(circle_at_center,rgba(228,92,255,0.2),transparent_65%)]">
        <ShieldCheck aria-hidden className="h-14 w-14 text-lilac-100/70" />
        <div className="absolute left-3 top-3 rounded-full border border-lilac-200/30 bg-lilac-200/15 px-2.5 py-1 text-xs font-bold text-lilac-100 backdrop-blur">
          UKI · BSC
        </div>
        <div className="absolute right-3 top-3 rounded-full border border-emerald-200/30 bg-emerald-200/15 px-2.5 py-1 text-xs font-bold text-emerald-100 backdrop-blur">
          Anuncio validado
        </div>
      </div>
      <div className="grid gap-3 p-4">
        <div>
          <h3 className="font-headline text-lg font-bold text-white">
            Cukie #{order.tokenId}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Tipo no disponible en el catálogo UKI · Red BSC
          </p>
          <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
            Colección {order.collectionAddress.slice(0, 8)}…
            {order.collectionAddress.slice(-6)} · Orden{' '}
            {order.orderId.slice(0, 8)}…
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="uppercase tracking-wide text-slate-500">Precio</p>
            <p className="mt-1 font-semibold text-lilac-100">
              {formatUkiAmount(order.ukiPriceRaw)}
            </p>
          </div>
          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="uppercase tracking-wide text-slate-500">Estado</p>
            <p className="mt-1 font-semibold text-white">
              {order.status === 'active' ? 'Activo' : 'Revisar'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="bg-lilac-200 text-[#0d0914] hover:bg-lilac-100"
        >
          {expanded ? 'Cerrar compra' : 'Comprar'}
          <ChevronDown
            className={`ml-2 h-4 w-4 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </Button>
        {expanded && (
          <UkiMarketplaceBuyerCheckout
            order={order}
            onPurchased={onPurchased}
          />
        )}
      </div>
    </article>
  );
}

export function MarketplaceClient({
  heading = 'Cukies disponibles',
  description,
}: MarketplaceClientProps = {}) {
  const [scope, setScope] = useState<MarketplaceScope>('all');
  const [search, setSearch] = useState('');
  const [network, setNetwork] = useState('all');
  const [type, setType] = useState('all');
  const [generation, setGeneration] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(0);
  const [history, setHistory] = useState<CursorState[]>([
    { legacyOffset: 0, ukiCursor: null },
  ]);
  const [catalog, setCatalog] = useState<CatalogResponse['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedUkiOrderId, setSelectedUkiOrderId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const requestIdRef = useRef(0);
  const cursor = history[page] ?? history[0];
  const priceSortAllowed = canSortByPrice(scope, network);
  const typeOptions = useMemo(
    () => catalog?.legacyFacets?.types.map((facet) => facet.value) ?? [],
    [catalog?.legacyFacets?.types],
  );
  const generationOptions = useMemo(
    () => catalog?.legacyFacets?.generations.map((facet) => facet.value) ?? [],
    [catalog?.legacyFacets?.generations],
  );

  const query = useMemo(() => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      scope,
      legacyOffset: String(cursor.legacyOffset),
      sort: sort.startsWith('price-') && !priceSortAllowed ? 'newest' : sort,
    });
    if (cursor.ukiCursor) params.set('ukiCursor', cursor.ukiCursor);
    if (search.trim()) params.set('search', search.trim());
    if (network !== 'all') params.set('network', network);
    if (scope === 'legacy' && type !== 'all') params.set('type', type);
    if (scope === 'legacy' && generation !== 'all')
      params.set('generation', generation);
    return params.toString();
  }, [
    cursor.legacyOffset,
    cursor.ukiCursor,
    generation,
    network,
    priceSortAllowed,
    scope,
    search,
    sort,
    type,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    fetch(`/api/marketplace/v1/catalog?${query}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => (await response.json()) as CatalogResponse)
      .then((payload) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current)
          return;
        if (payload.status !== 'ok' || !payload.data) {
          setCatalog(null);
          setError('No se pudo consultar el catálogo. Inténtalo de nuevo.');
          return;
        }
        setCatalog(payload.data);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current)
          return;
        setCatalog(null);
        setError('No se pudo consultar el catálogo. Inténtalo de nuevo.');
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId === requestIdRef.current)
          setIsLoading(false);
      });
    return () => controller.abort();
  }, [query, reloadKey]);

  function resetPagination() {
    setPage(0);
    setHistory([{ legacyOffset: 0, ukiCursor: null }]);
  }
  function resetFilters() {
    setSearch('');
    setScope('all');
    setNetwork('all');
    setType('all');
    setGeneration('all');
    setSort('newest');
    setSelectedUkiOrderId(null);
    resetPagination();
  }
  function nextPage() {
    if (!catalog?.hasMore) return;
    setHistory((current) => [...current.slice(0, page + 1), catalog.cursors]);
    setPage((current) => current + 1);
  }

  return (
    <section className="grid gap-5">
      <div className="rounded-[8px] border border-white/10 bg-black/30 p-4 backdrop-blur">
        <div className="grid gap-3 xl:grid-cols-3 2xl:grid-cols-[minmax(18rem,1fr)_repeat(5,minmax(9rem,auto))]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPagination();
              }}
              placeholder="Busca un Cukie"
              className="pl-9"
            />
          </div>
          <select
            aria-label="Origen del anuncio"
            value={scope}
            onChange={(event) => {
              const nextScope = event.target.value as MarketplaceScope;
              setScope(nextScope);
              if (nextScope !== 'legacy') setSort('newest');
              setSelectedUkiOrderId(null);
              resetPagination();
            }}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="all">Todos los catálogos</option>
            <option value="legacy">Solo Legacy</option>
            <option value="uki">Solo UKI</option>
          </select>
          <select
            value={network}
            onChange={(event) => {
              const nextNetwork = event.target.value;
              setNetwork(nextNetwork);
              if (nextNetwork === 'all' && sort.startsWith('price-')) {
                setSort('newest');
              }
              resetPagination();
            }}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="all">Todas las redes</option>
            <option value="BSC">BSC</option>
            <option value="TRON">TRON</option>
          </select>
          <select
            aria-label="Tipo (solo Legacy)"
            disabled={scope !== 'legacy'}
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              resetPagination();
            }}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="all">
              Todos los tipos {scope !== 'legacy' ? '(solo Legacy)' : ''}
            </option>
            {typeOptions.map((value) => (
              <option key={value} value={String(value)}>
                Tipo {value}
              </option>
            ))}
          </select>
          <select
            aria-label="Generación (solo Legacy)"
            disabled={scope !== 'legacy'}
            value={generation}
            onChange={(event) => {
              setGeneration(event.target.value);
              resetPagination();
            }}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="all">
              Todas las generaciones {scope !== 'legacy' ? '(solo Legacy)' : ''}
            </option>
            {generationOptions.map((value) => (
              <option key={value} value={String(value)}>
                Generación {value}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              resetPagination();
            }}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="newest">Más recientes</option>
            <option value="number-asc" disabled={scope !== 'legacy'}>
              Número: menor a mayor (Legacy)
            </option>
            <option value="number-desc" disabled={scope !== 'legacy'}>
              Número: mayor a menor (Legacy)
            </option>
            <option value="price-asc" disabled={!priceSortAllowed}>
              Precio: menor a mayor (Legacy + red)
            </option>
            <option value="price-desc" disabled={!priceSortAllowed}>
              Precio: mayor a menor (Legacy + red)
            </option>
          </select>
          {!priceSortAllowed && (
            <p className="col-span-full text-xs text-amber-100">
              Los filtros avanzados y el precio solo están disponibles en
              Legacy; Todos/UKI mantienen búsqueda global por ID/wallet y orden
              reciente.
            </p>
          )}
          <Button
            onClick={resetFilters}
            variant="outline"
            className="border-white/10 bg-white/[0.03]"
          >
            <Filter className="mr-2 h-4 w-4" />
            Limpiar filtros
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-headline text-2xl font-bold text-white">
            {heading}
          </h2>
          <p className="text-sm text-slate-400">
            {isLoading
              ? 'Cargando Cukies…'
              : `${description ? `${description} · ` : ''}Página ${page + 1}`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Button
            onClick={() => setPage((current) => Math.max(current - 1, 0))}
            disabled={page === 0 || isLoading}
            variant="outline"
            className="border-white/10 bg-white/[0.03]"
          >
            Anterior
          </Button>
          <span className="min-w-20 text-center">{page + 1}</span>
          <Button
            onClick={nextPage}
            disabled={!catalog?.hasMore || isLoading}
            variant="outline"
            className="border-white/10 bg-white/[0.03]"
          >
            Siguiente
          </Button>
        </div>
      </div>
      {error && (
        <div className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
          {error}
        </div>
      )}
      {catalog?.sources.legacy === 'unavailable' && scope !== 'uki' && (
        <div className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
          El catálogo Legacy no está disponible; se muestran los anuncios UKI
          que sí respondieron.
        </div>
      )}
      {catalog?.sources.uki === 'unavailable' && scope !== 'legacy' && (
        <div className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
          El catálogo UKI no está disponible; se muestran los anuncios Legacy
          que sí respondieron.
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
      ) : catalog?.items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {catalog.items.map((entry) =>
            entry.source === 'legacy' ? (
              <CukiCard
                key={`legacy-${entry.item.network}-${entry.item.tokenId}`}
                cuki={entry.item}
              />
            ) : (
              <UkiMarketplaceCard
                key={`uki-${entry.item.chainId}-${entry.item.collectionAddress}-${entry.item.tokenId}-${entry.item.orderId}`}
                order={entry.item}
                expanded={selectedUkiOrderId === entry.item.orderId}
                onToggle={() =>
                  setSelectedUkiOrderId((current) =>
                    current === entry.item.orderId ? null : entry.item.orderId,
                  )
                }
                onPurchased={() => {
                  setSelectedUkiOrderId(null);
                  setReloadKey((value) => value + 1);
                }}
              />
            ),
          )}
        </div>
      ) : catalog?.sources.legacy === 'unavailable' &&
        catalog.sources.uki === 'unavailable' ? (
        <div className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-8 text-center text-amber-100">
          Los catálogos Legacy y UKI no están disponibles ahora. Inténtalo de
          nuevo más tarde.
        </div>
      ) : (
        <div className="rounded-[8px] border border-white/10 bg-black/30 p-8 text-center text-slate-400">
          No hay Cukies que coincidan con estos filtros.
        </div>
      )}
      <div className="flex justify-end">
        <Button
          onClick={() => {
            resetPagination();
            setCatalog(null);
            setReloadKey((value) => value + 1);
          }}
          variant="ghost"
          className="text-slate-400 hover:text-white"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>
    </section>
  );
}
