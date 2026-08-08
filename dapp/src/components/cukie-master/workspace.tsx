'use client';

import { useCallback, useState } from 'react';

import { CukieMasterStatusPanel } from '@/components/cukie-master/status-panel';
import type { UkiRoutePreview } from '@/components/cukie-master/types';
import { UkiStakingPanel } from '@/components/cukie-master/uki-staking-panel';

export function CukieMasterWorkspace({ testnetOnly = false }: { testnetOnly?: boolean }) {
  const [ukiRoutePreview, setUkiRoutePreview] = useState<UkiRoutePreview | null>(null);
  const updatePreview = useCallback((preview: UkiRoutePreview | null) => {
    setUkiRoutePreview(preview);
  }, []);

  return (
    <>
      <CukieMasterStatusPanel onUkiRouteData={updatePreview} />
      <UkiStakingPanel routePreview={ukiRoutePreview} testnetOnly={testnetOnly} />
    </>
  );
}
