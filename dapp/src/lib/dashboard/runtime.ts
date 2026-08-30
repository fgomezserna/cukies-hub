export function assertDashboardStagingRuntime(
  environment: Record<string, string | undefined>,
) {
  if (
    environment.APP_ENV !== 'staging'
    || environment.NEXT_PUBLIC_APP_ENV !== 'staging'
    || environment.STAGING_ONLY_GUARD !== 'true'
    || environment.NEXT_PUBLIC_UKI_CHAIN_ID !== '97'
    || environment.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID !== '97'
  ) {
    throw new TypeError('DASHBOARD_STAGING_RUNTIME_REQUIRED');
  }
  return { environment: 'staging' as const, chainId: 97 as const };
}
