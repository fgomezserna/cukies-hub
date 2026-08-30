'use client';

import { AmbassadorAttributionPanel } from '@/components/wallet/ambassador-attribution-panel';
import { EconomyOverviewPanel } from '@/components/wallet/economy-overview-panel';

export function WalletDashboardWorkspace() {
  return (
    <>
      <EconomyOverviewPanel />
      <AmbassadorAttributionPanel />
    </>
  );
}
