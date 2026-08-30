import { spawnSync } from 'node:child_process';

const stageEnvironment = {
  ...process.env,
  APP_ENV: 'staging',
  NEXT_PUBLIC_APP_ENV: 'staging',
  STAGING_ONLY_GUARD: 'true',
  NEXT_PUBLIC_UKI_CHAIN_ID: '97',
  CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97',
  LOCAL_EVM_CHAIN_ID: '97',
  CUKIE_MASTER_RUNTIME_ENABLED: 'false',
  CREDIT_DAILY_RUNTIME_ENABLED: 'false',
  CUKIE_POOL_RUNTIME_ENABLED: 'false',
  REWARD_ACCOUNTING_RUNTIME_ENABLED: 'false',
};

const checks = [
  {
    label: 'Reglas Stage y BSC Testnet chain 97',
    args: ['staging:economy:rules:test'],
  },
  {
    label: 'Ruta canónica, alias legacy y navegación',
    args: [
      '--filter',
      'dapp',
      'test',
      '--runInBand',
      '__tests__/app/dashboard-routes.test.tsx',
      '__tests__/components/app-layout-navigation.test.tsx',
      '__tests__/components/landing-header.test.tsx',
    ],
  },
  {
    label: 'Módulos económicos con estados parciales y sesión firmada',
    args: [
      '--filter',
      'dapp',
      'test',
      '--runInBand',
      '__tests__/components/economy-overview-panel.test.tsx',
      '__tests__/components/holdings-overview-panel.test.tsx',
      '__tests__/components/ambassador-attribution-panel.test.tsx',
    ],
  },
  {
    label: 'APIs privadas que alimentan el dashboard',
    args: [
      '--filter',
      'dapp',
      'test',
      '--runInBand',
      '__tests__/api/economy-cukie-master.test.ts',
      '__tests__/api/economy-credits.test.ts',
      '__tests__/api/economy-cukie-pool.test.ts',
      '__tests__/api/economy-rewards.test.ts',
      '__tests__/api/uki-marketplace-inventory-route.test.ts',
      '__tests__/api/uki-marketplace-orders.test.ts',
      '__tests__/api/vesting-status-route.test.ts',
      '__tests__/api/ambassador-attribution-route.test.ts',
    ],
  },
  {
    label: 'DApp TypeScript',
    args: ['--filter', 'dapp', 'typecheck'],
  },
];

for (const check of checks) {
  process.stdout.write(`\n[stage dashboard local] ${check.label}\n`);
  const result = spawnSync('pnpm', check.args, {
    cwd: process.cwd(),
    env: stageEnvironment,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write(
  '\n[stage dashboard local] OK: Stage y chainId 97 emuladas; no se ha desplegado, firmado ni escrito en Stage.\n',
);
