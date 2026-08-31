import type { DashboardRuntime } from './summary';

export function assertDashboardRuntime(
  environment: Record<string, string | undefined>,
): DashboardRuntime {
  const appEnvironment = environment.APP_ENV;
  const publicEnvironment = environment.NEXT_PUBLIC_APP_ENV;
  const expectedChainId = appEnvironment === 'staging'
    ? 97
    : appEnvironment === 'production'
      ? 56
      : null;
  const expectedGuard = appEnvironment === 'staging' ? 'true' : 'false';

  if (
    expectedChainId === null
    || publicEnvironment !== appEnvironment
    || environment.STAGING_ONLY_GUARD !== expectedGuard
    || environment.NEXT_PUBLIC_UKI_CHAIN_ID !== String(expectedChainId)
    || environment.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID !== String(expectedChainId)
  ) {
    throw new TypeError('DASHBOARD_RUNTIME_INVALID');
  }

  return {
    environment: appEnvironment,
    chainId: expectedChainId,
  } as DashboardRuntime;
}
