'use client';

import { useCallback, useState } from 'react';

import { CompetitionCreditPanel } from '@/components/cukie-master/credit-panel';
import { CukieMasterNftVaultPanel } from '@/components/cukie-master/nft-vault-panel';
import { CukieMasterStatusPanel } from '@/components/cukie-master/status-panel';
import type { UkiRoutePreview } from '@/components/cukie-master/types';
import { UkiStakingPanel } from '@/components/cukie-master/uki-staking-panel';

export function CukieMasterWorkspace({ testnetOnly = false }: { testnetOnly?: boolean }) {
  const [routePreview, setRoutePreview] = useState<UkiRoutePreview | null>(null);
  const handleRoutePreview = useCallback((preview: UkiRoutePreview | null) => {
    setRoutePreview(preview);
  }, []);

  return (
    <>
      <CukieMasterStatusPanel ukiOnly onUkiRouteData={handleRoutePreview} />
      <UkiStakingPanel testnetOnly={testnetOnly} routePreview={routePreview} />
      <section className="relative z-[2] w-full min-w-0 pb-5 pt-2">
        <p className="uki-label">Gestión complementaria</p>
        <h2 className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)] sm:text-3xl">
          Cukies Originales y créditos
        </h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
          Aquí también puedes gestionar tus Cukies Originales y decidir cuántos créditos conservas
          para jugar y cuántos aportas al pool.
        </p>
      </section>
      <CukieMasterNftVaultPanel />
      <CompetitionCreditPanel />
    </>
  );
}
