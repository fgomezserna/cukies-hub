import { spawnSync } from 'node:child_process';

const stageEnvironment = {
  ...process.env,
  APP_ENV: 'staging',
  NEXT_PUBLIC_APP_ENV: 'staging',
  NEXT_PUBLIC_UKI_CHAIN_ID: '97',
  NEXT_PUBLIC_CUKIES_BRIDGE_MODE: 'disabled',
};

const checks = [
  {
    label: 'Bridge contracts: ida, vuelta, custodia, replay y recovery',
    args: [
      '--filter',
      '@cukies/contracts',
      'exec',
      'hardhat',
      'test',
      'test/cukies-bridge-endpoint.test.cjs',
    ],
  },
  {
    label: 'Bridge UI/config: Stage 97, Nile y mainnet fail-closed',
    args: [
      '--filter',
      'dapp',
      'test',
      '--',
      '--runInBand',
      '__tests__/lib/cukies-bridge-runtime.test.ts',
      '__tests__/components/cukies-bridge-client-safety.test.tsx',
    ],
  },
  {
    label: 'DApp TypeScript',
    args: ['--filter', 'dapp', 'typecheck'],
  },
];

for (const check of checks) {
  process.stdout.write(`\n[stage bridge local] ${check.label}\n`);
  const result = spawnSync('pnpm', check.args, {
    cwd: process.cwd(),
    env: stageEnvironment,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write('\n[stage bridge local] OK: no se ha desplegado ni firmado ninguna transaccion.\n');
