import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Coins, Crown, Gamepad2 } from 'lucide-react';

import { CompetitionCreditPanel } from '@/components/cukie-master/credit-panel';

export const metadata: Metadata = {
  title: 'Mis créditos | Cukies World',
  description: 'Consulta tus créditos por periodo y decide cuánto usar para jugar y cuánto aportar al pool.',
};

export default function CreditsPage() {
  return (
    <div className="uki-theme mx-auto min-h-full w-full max-w-[1480px] text-[var(--uki-cream)]">
      <header className="relative overflow-hidden border-b border-white/10 pb-5 pt-1 sm:pb-6">
        <div className="pointer-events-none absolute -right-16 -top-28 h-64 w-64 rounded-full bg-[rgba(228,92,255,0.1)] blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--uki-lilac)]">
              <Coins className="h-4 w-4" aria-hidden="true" />
              Tus créditos
            </p>
            <h1 className="mt-2 text-balance font-headline text-3xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-4xl">
              Créditos por periodo
            </h1>
            <p className="mt-2 max-w-xl text-pretty text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              Consulta tu saldo, ajusta el reparto y revisa tus movimientos.
            </p>
          </div>

          <nav aria-label="Acciones relacionadas" className="flex flex-wrap gap-2">
            <Link href="/games" className="inline-flex min-h-11 items-center gap-2 rounded-[9px] border border-[var(--uki-lilac)] bg-[var(--uki-lilac)] px-4 text-sm font-black text-[#09060f] transition hover:brightness-110">
              <Gamepad2 className="h-4 w-4" aria-hidden="true" />
              Ir a jugar
            </Link>
            <Link href="/cukie-master" className="inline-flex min-h-11 items-center gap-2 rounded-[9px] border border-white/15 bg-white/[0.04] px-4 text-sm font-black text-[var(--uki-cream)] transition hover:border-[var(--uki-lilac)]/50">
              <Crown className="h-4 w-4 text-[var(--uki-lilac)]" aria-hidden="true" />
              Ver mis cupos
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <div className="pt-7">
        <CompetitionCreditPanel />
      </div>
    </div>
  );
}
