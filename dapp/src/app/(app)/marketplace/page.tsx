import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Cookie, Store } from 'lucide-react';

import { MarketplaceClient } from '@/components/legacy-marketplace/marketplace-client';
import { MarketplaceSections } from '@/components/legacy-marketplace/marketplace-sections';
import { LegacyMarketplaceSellerPanel } from '@/components/legacy-marketplace/seller-panel';
import { UkiMarketplaceSellerPanel } from '@/components/uki-marketplace/seller-panel';
import { ukiMarketplacePublicConfig } from '@/lib/uki-marketplace/public-config';

export const metadata: Metadata = {
  title: 'Marketplace | Cukies World',
  description: 'Explora los Cukies disponibles y gestiona tus anuncios.',
};

export default function MarketplacePage() {
  const ukiMarketplaceReady = ukiMarketplacePublicConfig.ready;

  return (
    <div className="uki-theme mx-auto flex min-h-full w-full max-w-[1480px] flex-col pb-10 text-[var(--uki-cream)]">
      <header className="border-b border-white/10 pb-5 pt-1 sm:pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)]"><Store className="h-4 w-4" /> Marketplace</p>
            <h1 className="mt-2 text-balance font-headline text-3xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-4xl">Encuentra tu próximo Cukie</h1>
            <p className="mt-3 max-w-2xl text-pretty text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">Busca por número, tipo o generación. Abre una ficha para revisar todos los datos antes de comprar.</p>
          </div>
          <Link href="/cukies" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-[9px] border border-[var(--uki-lilac)]/45 bg-[var(--uki-lilac)]/10 px-4 text-sm font-black text-[var(--uki-cream)] transition hover:bg-[var(--uki-lilac)]/18">
            <Cookie className="h-4 w-4 text-[var(--uki-lilac)]" />
            Ver mis Cukies
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <div className="pt-5">
        <MarketplaceSections
          buy={(
            <section id="cukies-disponibles" className="scroll-mt-24">
              <MarketplaceClient heading="Cukies disponibles" description="explora Legacy y V2 · UKI con filtros por red, tipo y generación" />
              {ukiMarketplaceReady ? <span data-testid="uki-marketplace" className="sr-only" aria-hidden="true" /> : null}
            </section>
          )}
          sell={(
            <section id="mis-anuncios" className="scroll-mt-24 border-t border-white/10 pt-8">
              <div className="mb-5 max-w-2xl">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-lilac)]">Tu espacio de venta</p>
                <h2 className="mt-2 font-headline text-2xl font-black text-[var(--uki-cream)] sm:text-3xl">Gestiona tus anuncios</h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">Elige un Cukie de tu colección, fija el precio y revisa tus anuncios activos.</p>
              </div>
              <div className="grid gap-5">
                <LegacyMarketplaceSellerPanel />
                <div className="rounded-[14px] border border-white/10 bg-black/25 p-5 sm:p-6">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-lilac)]">V2 · UKI</p>
                  {!ukiMarketplaceReady && (
                    <p className="mt-2 text-sm font-semibold text-amber-100">
                      La venta directa en UKI todavía no está disponible. Puedes seguir explorando el catálogo mientras tanto.
                    </p>
                  )}
                  <div className="mt-4"><UkiMarketplaceSellerPanel /></div>
                </div>
              </div>
            </section>
          )}
        />
      </div>
    </div>
  );
}
