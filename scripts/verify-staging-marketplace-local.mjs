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
    label: 'Contrato marketplace: UKI, swaps, custodia, fees y bloqueos',
    args: [
      '--filter',
      '@cukies/contracts',
      'exec',
      'hardhat',
      'test',
      'test/cukies-marketplace.test.cjs',
      'test/uki-marketplace-testnet-plan.test.cjs',
    ],
  },
  {
    label: 'DApp marketplace: configuración, inventario, vendedor, comprador y API',
    args: [
      '--filter',
      'dapp',
      'test',
      '--runInBand',
      '__tests__/lib/uki-marketplace-public-config.test.ts',
      '__tests__/lib/uki-marketplace-checkout.test.ts',
      '__tests__/lib/uki-marketplace-listing.test.ts',
      '__tests__/lib/uki-marketplace-inventory.test.ts',
      '__tests__/lib/uki-marketplace-service.test.ts',
      '__tests__/api/uki-marketplace-inventory-route.test.ts',
      '__tests__/api/uki-marketplace-orders.test.ts',
      '__tests__/components/uki-marketplace-client.test.tsx',
      '__tests__/components/uki-marketplace-seller-panel.test.tsx',
      '__tests__/components/uki-marketplace-buyer-checkout.test.tsx',
      '__tests__/app/marketplace-sections.test.tsx',
    ],
  },
  {
    label: 'Indexer marketplace: ABI, eventos, proyección e idempotencia',
    args: [
      '--filter',
      '@cukies/chain-indexer',
      'exec',
      'node',
      '--import',
      'tsx',
      '--test',
      'test/uki-economy-contracts.test.ts',
      'src/projectors/uki-marketplace.test.ts',
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
  process.stdout.write(`\n[stage marketplace local] ${check.label}\n`);
  const result = spawnSync('pnpm', check.args, {
    cwd: process.cwd(),
    env: stageEnvironment,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write(
  '\n[stage marketplace local] OK: chainId 97 emulada; no se ha desplegado ni firmado ninguna transacción real.\n',
);
