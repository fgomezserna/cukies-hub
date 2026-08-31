import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Cookie, Store } from 'lucide-react';

import { MarketplaceClient } from '@/components/legacy-marketplace/marketplace-client';
import { UkiMarketplaceClient } from '@/components/uki-marketplace/marketplace-client';
import { UkiMarketplaceSellerPanel } from '@/components/uki-marketplace/seller-panel';
import { ukiMarketplacePublicConfig } from '@/lib/uki-marketplace/public-config';

export const metadata: Metadata = {
  title: 'Marketplace | Cukies World',
  description: 'Explora los Cukies disponibles y gestiona tus anuncios.',
};

export default function MarketplacePage() {
  const ukiMarketplaceReady = ukiMarketplacePublicConfig.ready;

  return (
    <div className="uki-landing mx-auto flex min-h-full w-full max-w-[1480px] flex-col bg-transparent pb-10 text-[var(--uki-cream)]">
      <header className="border-b border-white/10 pb-7 pt-1 sm:pb-9">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)]"><Store className="h-4 w-4" /> Marketplace</p>
            <h1 className="mt-2 text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">Encuentra tu próximo Cukie</h1>
            <p className="mt-4 max-w-2xl text-pretty text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">Busca por número, rareza o generación. Abre una ficha para revisar todos los datos antes de comprar.</p>
          </div>
          <Link href="/cukies" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-[9px] border border-[var(--uki-lilac)]/45 bg-[var(--uki-lilac)]/10 px-4 text-sm font-black text-[var(--uki-cream)] transition hover:bg-[var(--uki-lilac)]/18">
            <Cookie className="h-4 w-4 text-[var(--uki-lilac)]" />
            Ver mis Cukies
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <nav aria-label="Secciones del marketplace" className="flex flex-wrap gap-2 py-6">
        <Link href="#cukies-disponibles" className="rounded-[9px] border border-[var(--uki-lilac)]/45 bg-[var(--uki-lilac)]/10 px-4 py-2 text-sm font-black text-[var(--uki-cream)]">Comprar Cukies</Link>
        {ukiMarketplaceReady ? <Link href="#mis-anuncios" className="rounded-[9px] border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-black text-[var(--uki-text)]">Mis anuncios</Link> : null}
      </nav>

      <section id="cukies-disponibles" className="scroll-mt-24">
        {ukiMarketplaceReady ? <UkiMarketplaceClient /> : <MarketplaceClient heading="Cukies disponibles" description="abre una ficha para comprobar precio y propietario" />}
      </section>

      {ukiMarketplaceReady ? (
        <section id="mis-anuncios" className="mt-10 scroll-mt-24 border-t border-white/10 pt-8">
          <div className="mb-5 max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-lilac)]">Tu espacio de venta</p>
            <h2 className="mt-2 font-headline text-2xl font-black text-[var(--uki-cream)] sm:text-3xl">Gestiona tus anuncios</h2>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">Elige un Cukie de tu colección, fija el precio y revisa tus anuncios activos.</p>
          </div>
          <UkiMarketplaceSellerPanel />
        </section>
      ) : null}
    </div>
  );
}
