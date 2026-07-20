'use client';

import type { ReactNode } from 'react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface TreasureHuntCompetitionBannerProps {
  readonly children: ReactNode;
}

export default function TreasureHuntCompetitionBanner({
  children,
}: TreasureHuntCompetitionBannerProps) {
  return (
    <Sheet>
      <aside
        aria-labelledby="treasure-hunt-competition-banner-title"
        className="overflow-hidden rounded-[14px] border border-primary/30 bg-card/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
      >
        <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(27rem,0.85fr)] lg:items-center lg:px-5">
          <div className="min-w-0 border-l-2 border-primary pl-4">
            <p className="font-mono text-[0.66rem] font-black uppercase tracking-[0.2em] text-primary">
              Competición oficial · Preventa UKI
            </p>
            <h2
              id="treasure-hunt-competition-banner-title"
              className="mt-1 font-headline text-lg font-black tracking-tight text-foreground sm:text-xl"
            >
              Tus partidas 1P pueden generar premios en UKI
            </h2>
            <p className="mt-1 hidden max-w-[62ch] text-xs leading-relaxed text-muted-foreground xl:block">
              Puedes jugar sin comprar. Si clasificas, cada partida premiada toma como referencia
              los UKI comprados durante la preventa.
            </p>
          </div>

          <div className="min-w-0">
            <dl className="grid grid-cols-4 divide-x divide-border/70 rounded-[10px] border border-border/80 bg-background/35">
              <div className="px-2 py-2 text-center">
                <dt className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Pool
                </dt>
                <dd className="mt-0.5 font-mono text-base font-black text-primary">25%</dd>
              </div>
              <div className="px-2 py-2 text-center">
                <dt className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Por partida
                </dt>
                <dd className="mt-0.5 font-mono text-base font-black text-primary">10%</dd>
              </div>
              <div className="px-2 py-2 text-center">
                <dt className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Partidas máx.
                </dt>
                <dd className="mt-0.5 font-mono text-base font-black text-primary">5</dd>
              </div>
              <div className="px-2 py-2 text-center">
                <dt className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Sponsor
                </dt>
                <dd className="mt-0.5 font-mono text-base font-black text-primary">25%</dd>
              </div>
            </dl>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="inline-flex min-h-9 items-center rounded-[8px] border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px"
                >
                  Ver reglas, alias y ranking
                </button>
              </SheetTrigger>
              <p className="text-xs font-medium text-muted-foreground">
                Premios en UKI · 9 meses de cliff + 6 de vesting
              </p>
            </div>
          </div>
        </div>
      </aside>

      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-l border-border/80 bg-background/98 p-4 text-foreground shadow-[-20px_0_48px_-28px_rgba(3,18,17,0.7)] sm:max-w-3xl sm:p-6"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Competición oficial de preventa UKI</SheetTitle>
          <SheetDescription>
            Reglas, identidad de juego y ranking de Treasure Hunt.
          </SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
