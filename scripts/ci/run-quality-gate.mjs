#!/usr/local/bin/node

import { spawnSync } from 'node:child_process';

const SYSTEM_NODE = '/usr/local/bin/node';
const SYSTEM_PNPM = '/usr/local/bin/pnpm';
const PRISMA_VALIDATOR = '/opt/cukies-quality/validate-prisma-generator.mjs';
const PRISMA_SCHEMA = '/workspace/dapp/prisma/schema.prisma';
const SOURCE_VERIFIER = '/opt/cukies-quality/verify-quality-source.mjs';
const SOURCE_MANIFEST = '/opt/cukies-quality/source-manifest.json';
const WORKSPACE = '/workspace';

const args = process.argv.slice(2);
const withPrisma = args[0] === '--with-prisma';
const separatorIndex = args.indexOf('--');
if (separatorIndex !== (withPrisma ? 1 : 0) || separatorIndex === args.length - 1) {
  process.stderr.write('[quality-gate] Invalid trusted gate invocation.\n');
  process.exit(2);
}

function run(command, commandArgs) {
  if (![SYSTEM_NODE, SYSTEM_PNPM].includes(command)) {
    process.stderr.write('[quality-gate] Command is outside the trusted executable allowlist.\n');
    return 2;
  }
  const result = spawnSync(command, commandArgs, {
    cwd: WORKSPACE,
    env: {
      ...process.env,
      CI: '1',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    shell: false,
    stdio: 'inherit',
  });
  if (result.error || result.signal || !Number.isInteger(result.status)) return 1;
  return result.status;
}

if (withPrisma) {
  const policyStatus = run(SYSTEM_NODE, [PRISMA_VALIDATOR, PRISMA_SCHEMA]);
  if (policyStatus !== 0) process.exit(policyStatus);

  const prismaStatus = run(SYSTEM_PNPM, [
    '--filter', 'dapp',
    '--fail-if-no-match',
    'exec', 'prisma', 'generate',
    '--schema', 'prisma/schema.prisma',
  ]);
  if (prismaStatus !== 0) process.exit(prismaStatus);

  const sourceStatus = run(SYSTEM_NODE, [SOURCE_VERIFIER, WORKSPACE, SOURCE_MANIFEST]);
  if (sourceStatus !== 0) process.exit(sourceStatus);
}

const command = args[separatorIndex + 1];
const commandArgs = args.slice(separatorIndex + 2);
process.exit(run(command, commandArgs));
