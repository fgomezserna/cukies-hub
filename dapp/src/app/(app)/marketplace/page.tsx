import Link from 'next/link';
import { ArrowUpRight, Heart, Search, ShoppingCart, Wallet } from 'lucide-react';

import { MarketplaceClient } from '@/components/legacy-marketplace/marketplace-client';

export default function MarketplacePage() {
  return (
    <div className="mx-auto flex min-w-0 w-full max-w-7xl flex-col gap-6 overflow-hidden text-foreground">
      <section className="min-w-0 overflow-hidden rounded-[8px] border border-cyan-300/20 bg-black/30 px-4 py-4 shadow-lg shadow-cyan-950/20 backdrop-blur sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-100">
              <Heart className="h-3.5 w-3.5" />
              Cukies collection
            </div>
            <h1 className="font-headline text-3xl font-bold leading-tight text-white sm:text-4xl">
              Marketplace Cukies
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-5 text-slate-300">
              Usa esta pantalla como entrada de compra: filtra Cukies en venta,
              abre una ficha y confirma precio, red y propietario antes de operar.
            </p>
            <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
              {[
                [Search, 'Filtra por red, tipo o estado'],
                [ShoppingCart, 'Abre la ficha antes de comprar'],
                [Wallet, 'Conecta la wallet de la red correcta'],
              ].map(([Icon, label]) => (
                <div key={String(label)} className="flex items-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2">
                  <Icon className="h-3.5 w-3.5 text-cyan-200" />
                  <span>{label as string}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/breeding"
              className="inline-flex items-center gap-2 rounded-[8px] border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-300/15"
            >
              Breeding
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              href="/cukiepoints"
              className="inline-flex items-center gap-2 rounded-[8px] border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200/60 hover:bg-emerald-300/15"
            >
              CukiePoints
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              href="/bridge"
              className="inline-flex items-center gap-2 rounded-[8px] border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-200/60 hover:bg-amber-300/15"
            >
              Bridge
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <MarketplaceClient />
    </div>
  );
}
