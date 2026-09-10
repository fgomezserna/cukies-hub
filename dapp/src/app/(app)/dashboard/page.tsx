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
        <header className="mb-3 px-1">
          <h1 className="font-headline text-2xl font-black uppercase tracking-[-0.03em] text-[var(--uki-cream)] sm:text-3xl">
            Resumen
          </h1>
        </header>

        <WalletDashboardWorkspace />
      </div>
    </div>
  );
}
