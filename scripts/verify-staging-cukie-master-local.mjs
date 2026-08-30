import { spawnSync } from 'node:child_process';

const stageEnvironment = {
  ...process.env,
  APP_ENV: 'staging',
  NEXT_PUBLIC_APP_ENV: 'staging',
  NEXT_PUBLIC_UKI_CHAIN_ID: '97',
  LOCAL_EVM_CHAIN_ID: '97',
};

const checks = [
  {
    label: 'Contratos Cukie Master: staking UKI y vault NFT',
    args: [
      '--filter',
      '@cukies/contracts',
      'exec',
      'hardhat',
      'test',
      'test/uki-staking.test.cjs',
      'test/cukie-master-nft-vault.test.cjs',
    ],
  },
  {
    label: 'DApp Cukie Master: recarga, cupos, inventario, créditos y API',
    args: [
      '--filter',
      'dapp',
      'test',
      '--runInBand',
      '__tests__/components/cukie-master-status-panel.test.tsx',
      '__tests__/components/cukie-master-nft-vault-panel.test.tsx',
      '__tests__/components/cukie-master-workspace.test.tsx',
      '__tests__/components/cukie-master-page.test.tsx',
      '__tests__/components/competition-credit-panel.test.tsx',
      '__tests__/api/economy-cukie-master.test.ts',
      '__tests__/api/economy-cukie-master-custodial.test.ts',
      '__tests__/api/economy-cukie-master-admin.test.ts',
      '__tests__/api/economy-credits.test.ts',
      '__tests__/lib/uki-economy-cukie-master.test.ts',
      '__tests__/lib/cukie-master-service.test.ts',
      '__tests__/lib/cukie-master-jobs.test.ts',
      '__tests__/lib/cukie-master-runtime.test.ts',
      '__tests__/lib/cukie-master-store.test.ts',
      '__tests__/lib/cukie-master-nft-vault-source.test.ts',
      '__tests__/lib/cukie-master-nft-entitlement.test.ts',
      '__tests__/lib/cukie-master-nft-operations.test.ts',
      '__tests__/lib/cukie-master-nft-custodial-operations.test.ts',
      '__tests__/lib/competition-credit-flow.test.ts',
    ],
  },
  {
    label: 'Indexer Cukie Master: vault, staking y outbox idempotente',
    args: [
      '--filter',
      '@cukies/chain-indexer',
      'exec',
      'node',
      '--import',
      'tsx',
      '--test',
      'src/projectors/nft-vaults.test.ts',
      'src/projectors/cukie-master-outbox.test.ts',
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
  process.stdout.write(`\n[stage Cukie Master local] ${check.label}\n`);
  const result = spawnSync('pnpm', check.args, {
    cwd: process.cwd(),
    env: stageEnvironment,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write(
  '\n[stage Cukie Master local] OK: chainId 97 emulada; no se ha desplegado, firmado ni escrito en Stage.\n',
);
