import { spawnSync } from 'node:child_process';

const stageEnvironment = {
  ...process.env,
  APP_ENV: 'staging',
  NEXT_PUBLIC_APP_ENV: 'staging',
  STAGING_ONLY_GUARD: 'true',
  NEXT_PUBLIC_UKI_CHAIN_ID: '97',
  CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97',
  LOCAL_EVM_CHAIN_ID: '97',
  WEEKLY_RANKING_RUNTIME_ENABLED: 'false',
  REWARD_ACCOUNTING_RUNTIME_ENABLED: 'false',
  REWARD_DAILY_ACCOUNTING_ENABLED: 'false',
  REWARD_WEEKLY_PAYOUT_ENABLED: 'false',
  REWARD_POOL_TRANCHES_ENABLED: 'false',
};

const checks = [
  {
    label: 'Reglas Stage: ranking, reparto, embajadores y chain 97',
    args: ['staging:economy:rules:test'],
  },
  {
    label: 'Ranking semanal: solo pool, persistencia, catch-up y sellado',
    args: [
      '--filter',
      'dapp',
      'test',
      '--runInBand',
      '__tests__/lib/arena-ranking.test.ts',
      '__tests__/lib/weekly-ranking-rules.test.ts',
      '__tests__/lib/weekly-ranking-service.test.ts',
      '__tests__/lib/weekly-ranking-runtime.test.ts',
      '__tests__/lib/weekly-ranking-index-definitions.test.ts',
    ],
  },
  {
    label: 'Semanal y no distribuido: mínimos, siete tramos y conservación',
    args: [
      '--filter',
      'dapp',
      'test',
      '--runInBand',
      '__tests__/lib/reward-accounting.test.ts',
      '__tests__/lib/reward-accounting-repository.test.ts',
      '__tests__/lib/reward-calculation.test.ts',
      '__tests__/lib/reward-emission-budget.test.ts',
      '__tests__/lib/reward-rule-service.test.ts',
      '__tests__/lib/reward-claim-batch.test.ts',
      '__tests__/lib/reward-public.test.ts',
    ],
  },
  {
    label: 'Embajadores: firma, preventa, 5%, un nivel y pago simultáneo',
    args: [
      '--filter',
      'dapp',
      'test',
      '--runInBand',
      '__tests__/lib/ambassador-attribution.test.ts',
      '__tests__/lib/ambassador-mongo-resolution.test.ts',
      '__tests__/lib/ambassador-index-definitions.test.ts',
      '__tests__/components/ambassador-attribution-panel.test.tsx',
      '__tests__/api/ambassador-attribution-route.test.ts',
    ],
  },
  {
    label: 'APIs de ranking y cierre contable',
    args: [
      '--filter',
      'dapp',
      'test',
      '--runInBand',
      '__tests__/api/economy-weekly-ranking.test.ts',
      '__tests__/api/economy-rewards-commands.test.ts',
      '__tests__/api/economy-rewards.test.ts',
    ],
  },
  {
    label: 'Preparación de claims y destinos sin firmar ni publicar',
    args: [
      '--filter',
      'dapp',
      'exec',
      'node',
      '--test',
      'scripts/lib/reward-batch-publication.test.mjs',
      'scripts/lib/reward-publication-preparer.test.mjs',
    ],
  },
  {
    label: 'Schedulers privados: opt-in, HMAC y base aislada',
    args: [
      '--filter',
      'dapp',
      'exec',
      'node',
      '--test',
      'scripts/weekly-ranking-scheduler-policy.test.mjs',
      'scripts/reward-accounting-scheduler-policy.test.mjs',
    ],
  },
  {
    label: 'Índices de ranking, accounting, embajadores y claims',
    args: [
      '--filter',
      '@cukies/chain-indexer',
      'exec',
      'node',
      '--import',
      'tsx',
      '--test',
      'src/storage/economy-indexes.test.ts',
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
  process.stdout.write(`\n[stage weekly rewards local] ${check.label}\n`);
  const result = spawnSync('pnpm', check.args, {
    cwd: process.cwd(),
    env: stageEnvironment,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write(
  '\n[stage weekly rewards local] OK: Stage y chainId 97 emuladas; no se ha desplegado, firmado, publicado ni escrito en Stage.\n',
);
