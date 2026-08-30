'use client';

import { AmbassadorAttributionPanel } from '@/components/wallet/ambassador-attribution-panel';
import { DashboardOverviewPanel } from '@/components/wallet/dashboard-overview-panel';

export function WalletDashboardWorkspace() {
  return (
    <>
      <DashboardOverviewPanel />
      <AmbassadorAttributionPanel />
    </>
  );
}
