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
    legacyNetworks: {
      BSC: 'ready' | 'unavailable' | 'paused';
      TRON: 'ready' | 'unavailable' | 'paused';
    };
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
          V2 · UKI
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
            Red BSC · Colección {order.collectionAddress.slice(0, 8)}…
            {order.collectionAddress.slice(-6)}
          </p>
          <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
            Orden {order.orderId.slice(0, 8)}…
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
        <p className="text-xs text-slate-400">Precio fijado en UKI</p>
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
    if (scope !== 'uki' && type !== 'all') params.set('type', type);
    if (scope !== 'uki' && generation !== 'all')
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
  function applyLegacyFacet(
    setter: (value: string) => void,
    value: string,
  ) {
    if (scope === 'all' && value !== 'all') {
      setScope('legacy');
      setSelectedUkiOrderId(null);
    }
    setter(value);
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
          <label className="grid min-w-0 gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Buscar</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                aria-label="Buscar en el catálogo"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPagination();
                }}
                placeholder="Número o wallet"
                className="pl-9"
              />
            </span>
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Catálogo</span>
            <select
              aria-label="Origen del anuncio"
              value={scope}
              onChange={(event) => {
                const nextScope = event.target.value as MarketplaceScope;
                setScope(nextScope);
                if (nextScope === 'uki' && network === 'TRON') setNetwork('all');
                setType('all');
                setGeneration('all');
                if (nextScope !== 'legacy') setSort('newest');
                setSelectedUkiOrderId(null);
                resetPagination();
              }}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="all">Todos los catálogos</option>
              <option value="legacy">Solo Legacy</option>
              <option value="uki">Solo V2 · UKI</option>
            </select>
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Red</span>
            <select
              aria-label="Red"
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
              {scope !== 'uki' && <option value="TRON">TRON</option>}
            </select>
          </label>
          {scope !== 'uki' && (
            <>
              <label className="grid min-w-0 gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tipo</span>
                <select
                  aria-label="Tipo de Cukie"
                  value={type}
                  onChange={(event) => {
                    applyLegacyFacet(setType, event.target.value);
                  }}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="all">Todos los tipos</option>
                  {typeOptions.map((value) => (
                    <option key={value} value={String(value)}>
                      Tipo {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Generación</span>
                <select
                  aria-label="Generación"
                  value={generation}
                  onChange={(event) => {
                    applyLegacyFacet(setGeneration, event.target.value);
                  }}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="all">Todas las generaciones</option>
                  {generationOptions.map((value) => (
                    <option key={value} value={String(value)}>
                      Generación {value}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="grid min-w-0 gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ordenar por</span>
            <select
              aria-label="Ordenar resultados"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                resetPagination();
              }}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="newest">Más recientes</option>
              {scope === 'legacy' && (
                <>
                  <option value="number-asc">Número ascendente</option>
                  <option value="number-desc">Número descendente</option>
                </>
              )}
              {priceSortAllowed && (
                <>
                  <option value="price-asc">Precio más bajo</option>
                  <option value="price-desc">Precio más alto</option>
                </>
              )}
            </select>
          </label>
          {!priceSortAllowed && (
            <p className="col-span-full text-xs text-amber-100">
              El precio se puede ordenar cuando muestras solo Legacy y una red.
            </p>
          )}
          {scope === 'all' && (
            <p className="col-span-full text-xs text-slate-400">
              Tipo y generación pertenecen al catálogo Legacy; al elegir uno se mostrará solo ese catálogo.
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
      {catalog?.sources.legacy === 'ready' &&
        catalog.legacyNetworks?.BSC === 'unavailable' &&
        scope !== 'uki' &&
        network !== 'TRON' && (
          <div className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            BSC no ha podido verificarse ahora. Se conservan únicamente los anuncios TRON comprobados; no se interpreta como cero anuncios BSC.
          </div>
        )}
      {catalog?.sources.legacy === 'ready' &&
        catalog.legacyNetworks?.TRON === 'unavailable' &&
        scope !== 'uki' &&
        network !== 'BSC' && (
          <div className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            TRON no ha podido verificarse ahora. Se conservan únicamente los anuncios BSC comprobados; no se interpreta como cero anuncios TRON.
          </div>
        )}
      {catalog?.sources.legacy === 'ready' &&
        (catalog.legacyNetworks?.BSC === 'paused' ||
          catalog.legacyNetworks?.TRON === 'paused') &&
        scope !== 'uki' && (
          <div className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            {catalog.legacyNetworks.BSC === 'paused' ? 'BSC' : 'TRON'} está en
            pausa contractual. Sus anuncios se conservan y no se interpretan
            como cancelados, pero no se muestran como comprables mientras dure
            la pausa.
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
