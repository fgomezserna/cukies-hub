'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Cookie, Layers3, Loader2, RefreshCw, Store } from 'lucide-react';

import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { CukiImage } from '@/components/legacy-marketplace/cuki-image';
import type {
  MyCukieCollectionData,
  MyCukieCollectionItem,
  MyCukieCollectionResponse,
} from '@/lib/cukies-data/my-collection-types';
import { useAuth } from '@/providers/auth-provider';

type LoadState = 'idle' | 'loading' | 'ready' | 'unavailable';

function generationLabel(cukie: MyCukieCollectionItem) {
  if (cukie.generation === 'original') return 'Original';
  if (cukie.generation === 'second_generation') return 'Segunda generación';
  return 'Generación sin identificar';
}

function rarityLabel(cukie: MyCukieCollectionItem) {
  return ({
    common: 'Común',
    uncommon: 'No común',
    rare: 'Raro',
    epic: 'Épico',
    legendary: 'Legendario',
    goat: 'Goat',
    unknown: 'Rareza sin identificar',
  } as const)[cukie.rarity];
}

function stateLabel(cukie: MyCukieCollectionItem) {
  if (cukie.state === 'cukie_master') return 'En Cukie Master';
  if (cukie.state === 'in_pool') {
    if (cukie.poolStatus === 'pending') return 'Activándose en el pool';
    if (cukie.poolStatus === 'exit_requested') return 'Saliendo del pool';
    if (cukie.poolStatus === 'withdrawable') return 'Listo para retirar';
    return 'Disponible para partidas';
  }
  return ({
    available: 'Disponible',
    listed: 'En venta',
    bridging: 'En transferencia',
    soft_staked: 'En staking',
    assigned_to_game: 'En una partida',
    invalidated: 'No disponible',
    unknown: 'Estado pendiente',
  } as const)[cukie.state] ?? 'En uso';
}

function itemAction(cukie: MyCukieCollectionItem) {
  if (cukie.custody === 'cukie_pool') {
    return { href: '/cukie-hodler#mis-cukies-aportados', label: 'Gestionar en el pool' };
  }
  if (cukie.custody === 'cukie_master') {
    return { href: '/cukie-master#cukie-master-nft-staking', label: 'Gestionar Cukie Master' };
  }
  if (cukie.state === 'available') {
    return { href: '/cukie-hodler#cukies-disponibles', label: 'Aportar al pool' };
  }
  return { href: `/marketplace/${cukie.tokenId}`, label: 'Ver ficha' };
}

export function MyCukiesPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const [state, setState] = useState<LoadState>('idle');
  const [collection, setCollection] = useState<MyCukieCollectionData | null>(null);
  const items = useMemo(() => collection?.items ?? [], [collection]);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!walletAddress) return;
    setState('loading');
    const params = new URLSearchParams({ walletAddress });
    const response = await fetch('/api/cukies/mine?' + params.toString(), {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    const body = await response.json() as MyCukieCollectionResponse;
    if (!response.ok || body.status !== 'ok') throw new Error('CUKIES_UNAVAILABLE');
    setCollection(body.data);
    setState('ready');
  }, [walletAddress]);

  useEffect(() => {
    if (authLoading) return;
    if (!walletAddress) {
      setCollection(null);
      setState('idle');
      return;
    }
    const controller = new AbortController();
    load(controller.signal).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setCollection(null);
      setState('unavailable');
    });
    return () => controller.abort();
  }, [authLoading, load, walletAddress]);

  if (authLoading) {
    return (
      <div role="status" className="flex min-h-[24rem] items-center justify-center text-sm font-semibold text-[var(--uki-muted)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--uki-lilac)]" />
        Preparando tu colección…
      </div>
    );
  }

  if (!walletAddress) {
    return (
      <section className="grid min-h-[34rem] overflow-hidden rounded-[20px] border border-[var(--uki-lilac)]/25 bg-[#09060f] lg:grid-cols-[1fr_0.8fr]">
        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-14">
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)]"><Cookie className="h-4 w-4" /> Tu colección</p>
          <h1 className="mt-3 max-w-2xl text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">Consulta y gestiona tus Cukies</h1>
          <p className="mt-4 max-w-xl text-base font-semibold leading-relaxed text-[var(--uki-text)]">Conecta tu wallet para ver tus Cukies, su estado actual y las acciones disponibles para cada uno.</p>
          <LandingWalletConnectButton evmOnly className="mt-7 min-h-12 w-fit px-5" label="Conectar wallet" compactLabel="Conectar wallet" showCompactText={false} />
        </div>
        <div className="flex min-h-[20rem] items-center justify-center border-t border-white/10 bg-[radial-gradient(circle_at_center,rgba(228,92,255,0.18),transparent_60%)] lg:border-l lg:border-t-0">
          <Cookie className="h-28 w-28 text-[var(--uki-lilac)]/60" aria-hidden="true" />
        </div>
      </section>
    );
  }

  return (
    <div className="pb-10">
      <header className="border-b border-white/10 pb-7 pt-1 sm:pb-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)]"><Cookie className="h-4 w-4" /> Tu colección</p>
            <h1 className="mt-2 text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">Mis Cukies</h1>
            <p className="mt-4 max-w-2xl text-pretty text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">Aquí aparecen los Cukies asociados a tu wallet. Abre una ficha para ver sus datos o elige una acción para utilizarlos.</p>
          </div>
          <button type="button" onClick={() => load().catch(() => setState('unavailable'))} disabled={state === 'loading'} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-lilac)] disabled:opacity-50">
            <RefreshCw className={state === 'loading' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Actualizar colección
          </button>
        </div>
      </header>

      <section aria-labelledby="collection-summary-title" className="pt-7">
        <div className="grid overflow-hidden rounded-[16px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/[0.07] sm:grid-cols-[1.25fr_repeat(3,0.75fr)]">
          <div className="p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-muted)]">Tu colección</p>
            <h2 id="collection-summary-title" className="mt-2 font-headline text-3xl font-black text-[var(--uki-cream)]">{collection?.summary.total ?? 0} Cukies</h2>
            <p className="mt-2 text-sm font-semibold text-[var(--uki-muted)]">Total real entre tu wallet, el pool y Cukie Master.</p>
          </div>
          {[
            ['En tu wallet', collection?.summary.inWallet ?? 0, `${collection?.summary.available ?? 0} disponibles${collection?.summary.onSale ? ` · ${collection.summary.onSale} en venta` : ''}`],
            ['En el pool', collection?.summary.inPool ?? 0, 'Aportados para participar en partidas'],
            ['Cukie Master', collection?.summary.inCukieMaster ?? 0, 'Depositados para generar cupos'],
          ].map(([label, value, helper]) => (
            <div key={String(label)} className="border-t border-white/10 p-5 sm:border-l sm:border-t-0 sm:p-6">
              <p className="font-headline text-3xl font-black text-[var(--uki-lilac)]">{value}</p>
              <p className="mt-1 text-sm font-black text-[var(--uki-cream)]">{label}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">{helper}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Acciones de tu colección" className="grid gap-3 pt-6 sm:grid-cols-2">
        <Link href="/cukie-hodler#mi-cukie-pool" className="group flex min-h-20 items-center justify-between gap-4 rounded-[13px] border border-white/10 bg-black/25 px-5 py-4 transition hover:border-[var(--uki-lilac)]/40">
          <span className="flex items-center gap-3"><Layers3 className="h-5 w-5 text-[var(--uki-lilac)]" /><span><span className="block font-black text-[var(--uki-cream)]">Aportar al pool</span><span className="mt-1 block text-xs font-semibold text-[var(--uki-muted)]">Elige un Cukie y participa en partidas</span></span></span>
          <ArrowRight className="h-4 w-4 text-[var(--uki-lilac)] transition-transform group-hover:translate-x-1" />
        </Link>
        <Link href="/marketplace" className="group flex min-h-20 items-center justify-between gap-4 rounded-[13px] border border-white/10 bg-black/25 px-5 py-4 transition hover:border-[var(--uki-lilac)]/40">
          <span className="flex items-center gap-3"><Store className="h-5 w-5 text-[var(--uki-lilac)]" /><span><span className="block font-black text-[var(--uki-cream)]">Comprar o vender</span><span className="mt-1 block text-xs font-semibold text-[var(--uki-muted)]">Abre el marketplace de Cukies</span></span></span>
          <ArrowRight className="h-4 w-4 text-[var(--uki-lilac)] transition-transform group-hover:translate-x-1" />
        </Link>
      </section>

      {state === 'unavailable' ? (
        <div role="alert" className="mt-6 rounded-[12px] border border-white/10 bg-black/25 p-5">
          <p className="font-black text-[var(--uki-cream)]">No podemos cargar tu colección ahora</p>
          <p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">Vuelve a intentarlo en unos instantes.</p>
        </div>
      ) : state === 'loading' && items.length === 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-[16px] border border-white/10 bg-white/[0.04]" />)}
        </div>
      ) : items.length > 0 ? (
        <section aria-labelledby="collection-list-title" className="pt-8">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-lilac)]">Inventario</p><h2 id="collection-list-title" className="mt-2 font-headline text-2xl font-black text-[var(--uki-cream)] sm:text-3xl">Tus Cukies</h2></div>
            <p className="text-sm font-semibold text-[var(--uki-muted)]">{items.length} en total</p>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((cukie) => (
              <article key={cukie.assetId} className="group overflow-hidden rounded-[16px] border border-white/10 bg-black/25">
                <div className="relative aspect-[4/5] bg-[#0d0914]">
                  <CukiImage src={cukie.imageUrl} alt={`Cukie #${cukie.tokenId}`} sizes="(min-width: 1280px) 30vw, (min-width: 640px) 50vw, 100vw" className="object-contain p-3 transition-transform duration-300 group-hover:scale-[1.015]" />
                  <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/75 px-3 py-1 text-xs font-black text-[var(--uki-cream)] backdrop-blur">BSC</span>
                  <span className="absolute right-3 top-3 rounded-full border border-[var(--uki-lilac)]/35 bg-[#130b19]/85 px-3 py-1 text-xs font-black text-[var(--uki-lilac)] backdrop-blur">{stateLabel(cukie)}</span>
                </div>
                <div className="p-5">
                  <h3 className="font-headline text-xl font-black text-[var(--uki-cream)]">Cukie #{cukie.tokenId}</h3>
                  <p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">{generationLabel(cukie)} · {rarityLabel(cukie)}</p>
                  <p className="mt-3 text-xs font-bold text-[var(--uki-lilac)]">{stateLabel(cukie)}</p>
                  <Link href={itemAction(cukie).href} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[9px] border border-[var(--uki-lilac)]/45 bg-[var(--uki-lilac)]/10 px-4 text-sm font-black text-[var(--uki-cream)] transition hover:bg-[var(--uki-lilac)]/18">
                    {itemAction(cukie).label} <ArrowRight className="h-4 w-4 text-[var(--uki-lilac)]" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : state === 'ready' ? (
        <div className="mt-6 rounded-[16px] border border-white/10 bg-black/25 p-8 text-center">
          <Cookie className="mx-auto h-10 w-10 text-[var(--uki-lilac)]" />
          <h2 className="mt-4 font-headline text-2xl font-black text-[var(--uki-cream)]">Aún no hay Cukies en esta wallet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">Cuando tengas uno, aparecerá aquí con su imagen, estado y acciones disponibles.</p>
          <Link href="/marketplace" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[9px] bg-[var(--uki-lilac)] px-5 text-sm font-black text-[#09060f]">Explorar marketplace <ArrowRight className="h-4 w-4" /></Link>
        </div>
      ) : null}
    </div>
  );
}
