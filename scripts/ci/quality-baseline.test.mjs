import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, ROOT), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await read(relativePath));
}

test('el contrato raiz declara pnpm y perfiles de calidad no interactivos', async () => {
  const [rootPackage, dappPackage] = await Promise.all([
    readJson('package.json'),
    readJson('dapp/package.json'),
  ]);

  assert.match(rootPackage.packageManager, /^pnpm@[0-9]+\.[0-9]+\.[0-9]+$/);
  assert.equal(
    rootPackage.scripts['verify:quick'],
    'node scripts/ci/run-quality.mjs --profile quick --workspace .',
  );
  assert.equal(
    rootPackage.scripts['verify:candidate'],
    'node scripts/ci/run-quality.mjs --profile candidate --workspace .',
  );
  assert.equal(rootPackage.scripts.verify, 'pnpm run verify:candidate');
  assert.equal(dappPackage.scripts['test:ci'], 'jest --ci --runInBand');
});

test('los builds Next no pueden ocultar errores TypeScript o ESLint', async () => {
  for (const relativePath of ['dapp/next.config.ts', 'games/sybil-slayer/next.config.ts']) {
    const source = await read(relativePath);
    assert.doesNotMatch(source, /ignoreBuildErrors/);
    assert.doesNotMatch(source, /ignoreDuringBuilds/);
  }
});

test('Hyppie Road y Tower Builder tienen lint Next no interactivo configurado', async () => {
  for (const workspace of ['games/hyppie-road', 'games/tower-builder']) {
    const [packageJson, eslintConfig] = await Promise.all([
      readJson(`${workspace}/package.json`),
      readJson(`${workspace}/.eslintrc.json`),
    ]);
    assert.equal(packageJson.scripts.lint, 'next lint');
    assert.equal(eslintConfig.extends, 'next/core-web-vitals');
  }
});

test('game-bridge usa TypeScript autonomo y ESLint flat ejecutable', async () => {
  const [packageJson, tsconfig, eslintConfig] = await Promise.all([
    readJson('packages/game-bridge/package.json'),
    readJson('packages/game-bridge/tsconfig.json'),
    read('packages/game-bridge/eslint.config.mjs'),
  ]);

  assert.equal(packageJson.scripts.lint, 'eslint .');
  assert.equal(packageJson.scripts.typecheck, 'tsc --noEmit');
  assert.equal(Object.hasOwn(tsconfig, 'extends'), false);
  assert.equal(tsconfig.compilerOptions.moduleResolution, 'Bundler');
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noEmit, true);
  assert.match(eslintConfig, /@typescript-eslint\/parser/);
  assert.match(eslintConfig, /src\/\*\*\/\*\.\{ts,tsx\}/);
});

test('la generacion Prisma explicita no admite generators arbitrarios', async () => {
  const schema = await read('dapp/prisma/schema.prisma');
  assert.equal([...schema.matchAll(/^generator\s+/gm)].length, 1);
  assert.match(
    schema,
    /generator client\s*\{\s*provider\s*=\s*"prisma-client-js"\s*\}/m,
  );
});

test('CODEOWNERS protege el workflow, runner y manifests que definen los gates', async () => {
  const codeowners = await read('.github/CODEOWNERS');
  for (const pattern of [
    '/.github/workflows/',
    '/scripts/ci/',
    '/scripts/release/',
    '/scripts/assert-staging-only.mjs',
    '/scripts/assert-staging-only.test.mjs',
    '/scripts/docker-compose-coolify.test.mjs',
    '/package.json',
    '/pnpm-lock.yaml',
    '/pnpm-workspace.yaml',
    '/.dockerignore',
    '/.gitattributes',
    '/.npmrc',
    '/dapp/package.json',
    '/games/*/package.json',
    '/games/*/.npmrc',
    '/dapp/prisma/schema.prisma',
    '/packages/*/package.json',
    '/packages/*/tsconfig.json',
    '/packages/game-bridge/',
  ]) {
    assert.match(codeowners, new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `, 'm'));
  }
});
