import Link from 'next/link';
import { ArrowUpRight, Heart, Search, ShoppingCart, Wallet } from 'lucide-react';

import { MarketplaceClient } from '@/components/legacy-marketplace/marketplace-client';
import { UkiMarketplaceClient } from '@/components/uki-marketplace/marketplace-client';

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
              El nuevo mercado usa UKI como precio de referencia y mantiene el NFT en
              la wallet del vendedor. Los anuncios anteriores siguen disponibles en
              una sección Legacy independiente.
            </p>
            <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
              {[
                [Search, 'Filtra y revisa anuncios válidos'],
                [ShoppingCart, 'Confirma precio, vendedor y caducidad'],
                [Wallet, 'El NFT permanece con el vendedor'],
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

      <nav aria-label="Secciones del marketplace" className="flex flex-wrap gap-2">
        <Link
          href="#marketplace-uki"
          className="rounded-[8px] border border-cyan-200/25 bg-cyan-200/[0.07] px-4 py-2 text-sm font-semibold text-cyan-100 transition duration-300 ease-out hover:bg-cyan-200/[0.11] active:scale-[0.98]"
        >
          Marketplace UKI
        </Link>
        <Link
          href="#marketplace-legacy"
          className="rounded-[8px] border border-white/10 bg-white/[0.025] px-4 py-2 text-sm font-semibold text-slate-300 transition duration-300 ease-out hover:border-white/20 hover:text-white active:scale-[0.98]"
        >
          Marketplace Legacy
        </Link>
      </nav>

      <section id="marketplace-uki" className="scroll-mt-24">
        <UkiMarketplaceClient />
      </section>

      <section id="marketplace-legacy" className="grid scroll-mt-24 gap-4 border-t border-white/10 pt-6">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Compatibilidad histórica
          </p>
          <h2 className="mt-1 font-headline text-2xl font-bold text-white">
            Marketplace Legacy · BNB y TRX
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Conserva los anuncios y condiciones anteriores. En Stage/Testnet las
            operaciones Legacy permanecen desactivadas y solo se consulta el inventario.
          </p>
        </div>
        <MarketplaceClient
          heading="Inventario Legacy"
          description="anuncios BNB/TRX indexados"
        />
      </section>
    </div>
  );
}
