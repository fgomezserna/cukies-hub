import type { Metadata } from 'next';

import { WalletDashboardWorkspace } from '@/components/wallet/dashboard-workspace';

export const metadata: Metadata = {
  title: 'Mi cuenta | Cukies World',
  description: 'Consulta tus Cukies, créditos y premios desde un único lugar.',
};

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return (
    <div className="uki-landing min-h-full w-full bg-transparent">
      <div className="relative z-[2] mx-auto w-full max-w-[1440px] pb-8">
        <header className="mb-5 max-w-3xl">
          <p className="uki-label">Tu cuenta</p>
          <h1 className="mt-2 font-headline text-3xl font-black uppercase tracking-[-0.03em] text-[var(--uki-cream)] sm:text-4xl">
            Resumen
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">
            Consulta tus créditos, Cukies y premios, y decide qué hacer ahora con cada saldo y estado en su propio contexto.
          </p>
        </header>

        <WalletDashboardWorkspace />
      </div>
    </div>
  );
}
