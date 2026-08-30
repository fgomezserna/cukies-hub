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
      <section className="uki-container relative z-[2] min-w-0 pb-5 pt-2">
        <p className="uki-label">Gestión complementaria</p>
        <h2 className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)] sm:text-3xl">
          Cukies Originales y créditos
        </h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
          La lectura principal se centra en UKI. El vault custodial de Cukies y la decisión entre
          créditos propios o pool siguen disponibles y usan el mismo estado económico verificado.
        </p>
      </section>
      <CukieMasterNftVaultPanel />
      <CompetitionCreditPanel />
    </>
  );
}
