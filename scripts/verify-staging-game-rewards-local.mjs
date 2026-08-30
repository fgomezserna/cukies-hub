import { spawnSync } from 'node:child_process';

const stageEnvironment = {
  ...process.env,
  APP_ENV: 'staging',
  NEXT_PUBLIC_APP_ENV: 'staging',
  STAGING_ONLY_GUARD: 'true',
  NEXT_PUBLIC_UKI_CHAIN_ID: '97',
  CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97',
  LOCAL_EVM_CHAIN_ID: '97',
  GAME_ECONOMY_RUNTIME_ENABLED: 'false',
  CUKIE_POOL_RUNTIME_ENABLED: 'false',
  REWARD_ACCOUNTING_SCHEDULER_ENABLED: 'false',
  REWARD_ACCOUNTING_RUNTIME_ENABLED: 'false',
  REWARD_DAILY_ACCOUNTING_ENABLED: 'false',
  REWARD_WEEKLY_PAYOUT_ENABLED: 'false',
  REWARD_POOL_TRANCHES_ENABLED: 'false',
};

const checks = [
  {
    label: 'Reglas Stage: Treasure Hunt, pools, rewards y chain 97',
    args: ['staging:economy:rules:test'],
  },
  {
    label: 'Vertical Stage: créditos/Cukies propios o prestados hasta rewards',
    args: [
      '--filter',
      'dapp',
      'test',
      '--runInBand',
      '__tests__/lib/staging-economy-vertical-flow.test.ts',
      '__tests__/lib/game-economy-flow.test.ts',
      '__tests__/lib/game-economy-rules.test.ts',
      '__tests__/lib/game-economy-runtime.test.ts',
      '__tests__/lib/cukie-pool-service.test.ts',
      '__tests__/lib/cukie-pool-vault-assignment.test.ts',
      '__tests__/lib/cukie-pool-rules.test.ts',
      '__tests__/lib/reward-accounting-runtime.test.ts',
    ],
  },
  {
    label: 'Reparto diario: jugador, pools, mínimos, presupuesto e idempotencia',
    args: [
      '--filter',
      'dapp',
      'test',
      '--runInBand',
      '__tests__/lib/reward-coordinator.test.ts',
      '__tests__/lib/reward-calculation.test.ts',
      '__tests__/lib/reward-accounting.test.ts',
      '__tests__/lib/reward-accounting-repository.test.ts',
      '__tests__/lib/reward-allocation-service.test.ts',
      '__tests__/lib/reward-emission-budget.test.ts',
    ],
  },
  {
    label: 'APIs privadas de juego, pool y rewards',
    args: [
      '--filter',
      'dapp',
      'test',
      '--runInBand',
      '__tests__/api/economy-games-commands.test.ts',
      '__tests__/api/economy-rewards-commands.test.ts',
      '__tests__/api/economy-rewards.test.ts',
      '__tests__/api/economy-cukie-pool.test.ts',
      '__tests__/api/economy-cukie-pool-tick.test.ts',
      '__tests__/api/treasure-hunt-economy-routes.test.ts',
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
      'scripts/game-economy-scheduler-policy.test.mjs',
      'scripts/cukie-pool-scheduler-policy.test.mjs',
      'scripts/reward-accounting-scheduler-policy.test.mjs',
    ],
  },
  {
    label: 'Índices de economía y rewards',
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
  process.stdout.write(`\n[stage game rewards local] ${check.label}\n`);
  const result = spawnSync('pnpm', check.args, {
    cwd: process.cwd(),
    env: stageEnvironment,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write(
  '\n[stage game rewards local] OK: Stage y chainId 97 emuladas; no se ha desplegado, firmado ni escrito en Stage.\n',
);
