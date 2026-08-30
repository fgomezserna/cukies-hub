'use client';

import { useEffect, useState } from 'react';
import {
  ArrowClockwise,
  CheckCircle,
  Clock,
  Cube,
  ShieldCheck,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import type {
  UkiMarketplaceOrderView,
  UkiMarketplaceOrdersResponse,
} from '@/lib/uki-marketplace';

const PAGE_LIMIT = 24;

type FeedState =
  | { kind: 'loading' }
  | { kind: 'ready'; orders: UkiMarketplaceOrderView[] }
  | { kind: 'unavailable' }
  | { kind: 'error' };

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatUkiAmount(raw: string) {
  if (!/^\d+$/.test(raw)) return '—';
  const padded = raw.padStart(19, '0');
  const integer = padded.slice(0, -18).replace(/^0+(?=\d)/, '');
  const fraction = padded.slice(-18).slice(0, 4).replace(/0+$/, '');
  const grouped = BigInt(integer || '0').toLocaleString('es-ES');
  return fraction ? `${grouped},${fraction}` : grouped;
}

function formatExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date);
}

function LoadingFeed() {
  return (
    <div aria-label="Cargando anuncios UKI" className="divide-y divide-white/10">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="grid animate-pulse gap-4 px-4 py-5 sm:grid-cols-[4rem_minmax(0,1fr)_10rem] sm:items-center">
          <div className="h-16 w-16 rounded-[8px] bg-white/[0.06]" />
          <div className="grid gap-2">
            <div className="h-4 w-36 rounded bg-white/[0.07]" />
            <div className="h-3 w-56 max-w-full rounded bg-white/[0.05]" />
          </div>
          <div className="h-8 w-28 rounded bg-white/[0.06] sm:justify-self-end" />
        </div>
      ))}
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="grid min-h-56 place-items-center px-6 py-12 text-center">
      <div className="max-w-md">
        <Cube aria-hidden className="mx-auto h-8 w-8 text-cyan-200" weight="duotone" />
        <h3 className="mt-4 font-headline text-xl font-bold text-white">
          Todavía no hay Cukies publicados en UKI
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Los anuncios aparecerán aquí únicamente después de validarse contra el
          contrato, el propietario actual y los permisos del NFT.
        </p>
      </div>
    </div>
  );
}

function OrderRow({ order }: { order: UkiMarketplaceOrderView }) {
  return (
    <article className="grid gap-4 px-4 py-5 transition duration-300 ease-out hover:bg-cyan-300/[0.035] sm:grid-cols-[4rem_minmax(0,1fr)_minmax(10rem,auto)] sm:items-center sm:px-5">
      <div className="grid h-16 w-16 place-items-center rounded-[8px] border border-cyan-200/15 bg-cyan-200/[0.055] text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <Cube aria-hidden className="h-7 w-7" weight="duotone" />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-headline text-lg font-bold text-white">
            Cukie #{order.tokenId}
          </h3>
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200/20 bg-cyan-200/[0.06] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-100">
            <CheckCircle aria-hidden className="h-3.5 w-3.5" weight="fill" />
            Validado en vivo
          </span>
        </div>
        <p className="mt-1 truncate font-mono text-xs text-slate-500">
          Colección {shortAddress(order.collectionAddress)} · vendedor {shortAddress(order.seller)}
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-400">
          <Clock aria-hidden className="h-3.5 w-3.5" />
          Expira {formatExpiry(order.expiresAt)}
        </p>
      </div>

      <div className="sm:text-right">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Precio del vendedor
        </p>
        <p className="mt-1 font-mono text-xl font-bold tabular-nums text-white">
          {formatUkiAmount(order.ukiPriceRaw)} <span className="text-sm text-cyan-100">UKI</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Pago: UKI, BNB o USDT
        </p>
      </div>
    </article>
  );
}

export function UkiMarketplaceClient() {
  const [state, setState] = useState<FeedState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });

    fetch(`/api/marketplace/v1/orders?scope=public&limit=${PAGE_LIMIT}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json() as UkiMarketplaceOrdersResponse;
        if (controller.signal.aborted) return;
        if (response.status === 503) {
          setState({ kind: 'unavailable' });
          return;
        }
        if (!response.ok || payload.status !== 'ok') {
          setState({ kind: 'error' });
          return;
        }
        setState({ kind: 'ready', orders: payload.data.orders });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof Error && error.name === 'AbortError') return;
        setState({ kind: 'error' });
      });

    return () => controller.abort();
  }, [reloadKey]);

  return (
    <div className="overflow-hidden rounded-[8px] border border-white/10 bg-[#0c1514]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-100">
            <ShieldCheck aria-hidden className="h-4 w-4" weight="duotone" />
            BSC Testnet · chain 97
          </div>
          <h2 className="mt-1 font-headline text-2xl font-bold text-white">
            Marketplace UKI
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Precio fijado en UKI. El Cukie permanece en la wallet del vendedor hasta
            que una compra válida se complete de forma atómica.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setReloadKey((value) => value + 1)}
          disabled={state.kind === 'loading'}
          className="border-white/10 bg-white/[0.03] active:scale-[0.98]"
        >
          <ArrowClockwise aria-hidden className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {state.kind === 'loading' && <LoadingFeed />}
      {state.kind === 'ready' && state.orders.length === 0 && <EmptyFeed />}
      {state.kind === 'ready' && state.orders.length > 0 && (
        <div className="divide-y divide-white/10">
          {state.orders.map((order) => <OrderRow key={order.orderId} order={order} />)}
        </div>
      )}
      {(state.kind === 'unavailable' || state.kind === 'error') && (
        <div className="grid min-h-56 place-items-center px-6 py-12 text-center">
          <div className="max-w-lg">
            <ShieldCheck aria-hidden className="mx-auto h-8 w-8 text-cyan-200" weight="duotone" />
            <h3 className="mt-4 font-headline text-xl font-bold text-white">
              {state.kind === 'unavailable'
                ? 'El marketplace UKI aún no está activo en este Stage'
                : 'No se pudo consultar el marketplace UKI'}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              No se publica inventario si falta la dirección verificada del contrato o
              no puede comprobarse el estado on-chain. El mercado Legacy permanece separado.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
