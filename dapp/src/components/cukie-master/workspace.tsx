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
      <CukieMasterStatusPanel overview onUkiRouteData={handleRoutePreview} />
      <UkiStakingPanel testnetOnly={testnetOnly} routePreview={routePreview} />
      <CukieMasterNftVaultPanel />
      <CompetitionCreditPanel />
    </>
  );
}
