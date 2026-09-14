import { assertDashboardRuntime } from '@/lib/dashboard/runtime';

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

describe('dashboard runtime', () => {
  it('acepta staging aislado sobre BSC Testnet 97', () => {
    expect(assertDashboardRuntime(environment())).toEqual({
      environment: 'staging',
      chainId: 97,
    });
  });

  it('acepta producción sobre BSC Mainnet 56 con el mismo contrato de datos', () => {
    expect(assertDashboardRuntime(environment({
      APP_ENV: 'production',
      NEXT_PUBLIC_APP_ENV: 'production',
      STAGING_ONLY_GUARD: 'false',
      NEXT_PUBLIC_UKI_CHAIN_ID: '56',
      CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '56',
    }))).toEqual({
      environment: 'production',
      chainId: 56,
    });
  });

  it.each([
    ['NEXT_PUBLIC_APP_ENV', 'production'],
    ['STAGING_ONLY_GUARD', 'false'],
    ['NEXT_PUBLIC_UKI_CHAIN_ID', '56'],
    ['CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID', '56'],
  ])('rechaza una configuración incoherente en %s', (key, value) => {
    expect(() => assertDashboardRuntime(environment({ [key]: value }))).toThrow(
      'DASHBOARD_RUNTIME_INVALID',
    );
  });
});
