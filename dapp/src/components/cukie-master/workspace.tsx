'use client';

import { useCallback, useState } from 'react';

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
    </>
  );
}
