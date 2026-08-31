import type { Metadata } from 'next';
import { ChevronDown, Layers3, Sparkles } from 'lucide-react';

import { CukiePoolStatusPanel } from '@/components/cukie-pool/status-panel';
import { Panel } from '@/components/landing/primitives';

export const metadata: Metadata = {
  title: 'Pool de Cukies | Cukies World',
  description: 'Aporta tus Cukies al pool, consulta cuáles participan y gestiona su salida.',
};

export const dynamic = 'force-dynamic';

export default function CukieHodlerPage() {
  return (
    <div className="uki-landing min-h-full w-full overflow-x-clip bg-transparent text-[var(--uki-cream)]">
      <div className="mx-auto w-full max-w-[1480px]">
        <header className="relative overflow-hidden border-b border-white/10 pb-7 pt-1 sm:pb-9">
          <div className="pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full bg-[var(--uki-lilac)]/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-bold text-[var(--uki-lilac)]">Tu Pool de Cukies</p>
              <h1 className="mt-2 text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">
                Aporta tus Cukies y participa en lo que generen
              </h1>
              <p className="mt-4 max-w-2xl text-pretty text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">
                Consulta cuáles puedes aportar, cuáles están disponibles para partidas y qué tienes que hacer para recuperarlos.
              </p>
            </div>

            <div className="flex max-w-sm shrink-0 items-start gap-3 border-l-2 border-[var(--uki-lilac)] pl-4">
              <Layers3 className="mt-0.5 h-6 w-6 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
              <div>
                <p className="font-headline text-lg font-black text-[var(--uki-cream)]">Dos repartos independientes</p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                  Originales y Segunda Generación comparten la misma custodia, pero cada grupo reparte solo lo generado por sus partidas.
                </p>
              </div>
            </div>
          </div>
        </header>

        <CukiePoolStatusPanel />

        <section id="reglas-del-pool" className="pb-10">
          <Panel innerClassName="overflow-hidden">
            <details className="group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left sm:px-7">
                <div className="flex min-w-0 items-start gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Antes de aportar</p>
                    <h2 className="mt-1 font-headline text-xl font-black text-[var(--uki-cream)]">Entiende cómo funciona el pool</h2>
                  </div>
                </div>
                <ChevronDown className="h-5 w-5 shrink-0 text-[var(--uki-lilac)] transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>

              <div className="grid gap-px border-t border-white/10 bg-white/10 lg:grid-cols-3">
                <Rule
                  number="01"
                  title="Empieza en el siguiente periodo"
                  description="Al depositarlo queda custodiado y espera al siguiente inicio diario. Hasta entonces no puede entrar en partidas ni generar reparto."
                />
                <Rule
                  number="02"
                  title="Participa cuando se usa"
                  description="Estar activo no garantiza un premio. El reparto se forma con las partidas válidas que hayan usado Cukies de su misma generación."
                />
                <Rule
                  number="03"
                  title="La salida necesita un cierre"
                  description="Al pedir la salida deja de optar al reparto de ese periodo. Cuando llegue la fecha indicada podrás devolverlo a tu wallet."
                />
              </div>
            </details>
          </Panel>
        </section>
      </div>
    </div>
  );
}

function Rule({
  description,
  number,
  title,
}: {
  description: string;
  number: string;
  title: string;
}) {
  return (
    <article className="min-w-0 bg-[#0d0914] p-5 sm:p-6">
      <p className="font-headline text-sm font-black text-[var(--uki-lilac)]">{number}</p>
      <h3 className="mt-3 font-headline text-lg font-black text-[var(--uki-cream)]">{title}</h3>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">{description}</p>
    </article>
  );
}
