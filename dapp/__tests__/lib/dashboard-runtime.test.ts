import { assertDashboardStagingRuntime } from '@/lib/dashboard/runtime';

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    APP_ENV: 'staging',
    NEXT_PUBLIC_APP_ENV: 'staging',
    STAGING_ONLY_GUARD: 'true',
    NEXT_PUBLIC_UKI_CHAIN_ID: '97',
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97',
    ...overrides,
  };
}

describe('dashboard Stage runtime', () => {
  it('acepta únicamente Stage aislado sobre BSC Testnet 97', () => {
    expect(assertDashboardStagingRuntime(environment())).toEqual({
      environment: 'staging',
      chainId: 97,
    });
  });

  it.each([
    ['APP_ENV', 'production'],
    ['NEXT_PUBLIC_APP_ENV', 'production'],
    ['STAGING_ONLY_GUARD', 'false'],
    ['NEXT_PUBLIC_UKI_CHAIN_ID', '56'],
    ['CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID', '56'],
  ])('rechaza %s fuera de la frontera Stage/Testnet', (key, value) => {
    expect(() => assertDashboardStagingRuntime(environment({ [key]: value }))).toThrow(
      'DASHBOARD_STAGING_RUNTIME_REQUIRED',
    );
  });
});
