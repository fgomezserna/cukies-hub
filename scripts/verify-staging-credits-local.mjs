import { spawnSync } from 'node:child_process';

const stageEnvironment = {
  ...process.env,
  APP_ENV: 'staging',
  NEXT_PUBLIC_APP_ENV: 'staging',
  NEXT_PUBLIC_UKI_CHAIN_ID: '97',
  CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97',
  LOCAL_EVM_CHAIN_ID: '97',
};

const checks = [
  {
    label: 'Reglas de economía Stage: chain 97, 100 créditos por cupo y cortes versionados',
    args: ['staging:economy:rules:test'],
  },
  {
    label: 'Créditos: grants UKI/NFT, pool, juego, caducidad, replay y recuperación',
    args: [
      '--filter',
      'dapp',
      'test',
      '--runInBand',
      '__tests__/lib/competition-credit-rules.test.ts',
      '__tests__/lib/competition-credit-flow.test.ts',
      '__tests__/lib/competition-credit-runtime.test.ts',
      '__tests__/lib/competition-credit-source-recovery.test.ts',
      '__tests__/api/economy-credits.test.ts',
      '__tests__/api/economy-credits-tick.test.ts',
      '__tests__/components/competition-credit-panel.test.tsx',
    ],
  },
  {
    label: 'Scheduler privado: opt-in, HMAC y base aislada de Stage',
    args: [
      '--filter',
      'dapp',
      'exec',
      'node',
      '--test',
      'scripts/competition-credit-scheduler-policy.test.mjs',
    ],
  },
  {
    label: 'Indexer: índices del ledger y cortes canónicos',
    args: [
      '--filter',
      '@cukies/chain-indexer',
      'exec',
      'node',
      '--import',
      'tsx',
      '--test',
      'src/storage/credit-economy-indexes.test.ts',
      'test/mongo-credit-cutoffs.test.ts',
    ],
  },
  {
    label: 'DApp TypeScript',
    args: ['--filter', 'dapp', 'typecheck'],
  },
  {
    label: 'Indexer TypeScript',
    args: ['--filter', '@cukies/chain-indexer', 'typecheck'],
  },
];

for (const check of checks) {
  process.stdout.write(`\n[stage credits local] ${check.label}\n`);
  const result = spawnSync('pnpm', check.args, {
    cwd: process.cwd(),
    env: stageEnvironment,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write(
  '\n[stage credits local] OK: Stage y chainId 97 emuladas; no se ha desplegado, firmado ni escrito en Stage.\n',
);
