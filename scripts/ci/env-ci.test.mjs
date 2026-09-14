import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalizeBuildEnv } from './build-env.mjs';
import { buildComponents, cacheRef } from './build-images.mjs';
import { resolveDeploymentEnvironment } from './deployment-environment.mjs';
import { COMPONENTS, chooseReleasePlan } from './release-plan.mjs';
import { createSuccessfulState } from './release-state.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const HASH_A = 'a'.repeat(64);
const DIGEST = `sha256:${'1'.repeat(64)}`;

function componentEntries(environment = 'staging', chainId = environment === 'production' ? '56' : '97') {
  return Object.fromEntries(COMPONENTS.map((component) => [component, {
    image: `registry.test/cukies-hub/${component}:${SHA_A}-${HASH_A}@${DIGEST}`,
    digest: DIGEST,
    tag: `${SHA_A}-${HASH_A}`,
    configHash: HASH_A,
    sourceSha: SHA_A,
    environment,
    chainId,
  }]));
}

test('resolver estricto conserva cache staging y separa production con chain 56', () => {
  assert.deepEqual(resolveDeploymentEnvironment('staging'), {
    environment: 'staging', chainId: '97', branch: 'staging', cacheNamespace: 'staging',
  });
  assert.deepEqual(resolveDeploymentEnvironment('production'), {
    environment: 'production', chainId: '56', branch: 'main', cacheNamespace: 'production',
  });
  assert.throws(() => resolveDeploymentEnvironment('staging97'), /entorno de despliegue inválido/);
  assert.throws(() => resolveDeploymentEnvironment('prod'), /entorno de despliegue inválido/);
});

test('build env usa la variable nueva y sólo permite el fallback legacy en staging', () => {
  const staging = canonicalizeBuildEnv({ NEXT_PUBLIC_APP_ENV: 'staging', NEXT_PUBLIC_UKI_CHAIN_ID: '97' });
  const production = canonicalizeBuildEnv({ NEXT_PUBLIC_APP_ENV: 'production', NEXT_PUBLIC_UKI_CHAIN_ID: '56' }, resolveDeploymentEnvironment('production'));
  assert.equal(staging.environment, 'staging');
  assert.equal(production.chainId, '56');
  assert.throws(() => canonicalizeBuildEnv({ NEXT_PUBLIC_APP_ENV: 'production', NEXT_PUBLIC_UKI_CHAIN_ID: '97' }, resolveDeploymentEnvironment('production')), /debe ser production|debe ser 56/);
});

test('CLI build env rechaza usar CUKIES_STAGING_BUILD_ENV_JSON para production', () => {
  const output = join(tmpdir(), `cukies-build-env-${process.pid}.json`);
  const environment = { ...process.env, CUKIES_DEPLOY_ENVIRONMENT: 'production', CUKIES_STAGING_BUILD_ENV_JSON: JSON.stringify({ NEXT_PUBLIC_APP_ENV: 'staging', NEXT_PUBLIC_UKI_CHAIN_ID: '97' }) };
  delete environment.CUKIES_BUILD_ENV_JSON;
  assert.throws(() => execFileSync(process.execPath, ['scripts/ci/build-env.mjs', '--output', output], { cwd: process.cwd(), env: environment, stdio: 'pipe' }), /obligatorio para production/);
});

test('cache BuildKit y build manifest quedan aislados por entorno', async () => {
  assert.match(cacheRef('registry.test', 'staging', 'dapp'), /cukies-cache\/staging-dapp:buildkit$/);
  assert.match(cacheRef('registry.test', 'production', 'dapp'), /cukies-cache\/production-dapp:buildkit$/);

  const root = await mkdtemp(join(tmpdir(), 'cukies-ci-images-'));
  const buildEnvPath = join(root, 'build-env.json');
  const manifestPath = join(root, 'manifest.json');
  const env = canonicalizeBuildEnv({ NEXT_PUBLIC_APP_ENV: 'production', NEXT_PUBLIC_UKI_CHAIN_ID: '56' }, resolveDeploymentEnvironment('production'));
  await writeFile(buildEnvPath, JSON.stringify(env));
  const calls = [];
  const built = await buildComponents({
    components: ['dapp'], registry: 'registry.test', sha: SHA_B, configHash: env.hash,
    buildEnvJsonPath: buildEnvPath, manifestPath, environment: 'production',
    runCommand: async (_docker, args) => {
      calls.push(args);
      const metadataPath = args[args.indexOf('--metadata-file') + 1];
      await writeFile(metadataPath, JSON.stringify({ 'containerimage.digest': DIGEST }));
    },
  });
  assert.equal(built.dapp.environment, 'production');
  assert.equal(built.dapp.chainId, '56');
  assert.ok(calls[0].includes('type=registry,ref=registry.test/cukies-cache/production-dapp:buildkit'));
  assert.ok(!calls[0].some((arg) => arg.includes('staging')));
});

test('state y previous bloquean cruces de entorno y el plan no reutiliza una imagen cruzada', () => {
  const productionState = createSuccessfulState({
    environment: 'production', head: SHA_A, configHash: HASH_A,
    components: componentEntries('production', '56'), healthSha: SHA_A,
  });
  assert.equal(productionState.environment, 'production');
  assert.equal(productionState.chainId, '56');
  assert.throws(() => createSuccessfulState({
    environment: 'production', previous: { ...productionState, environment: 'staging', chainId: '97' },
    head: SHA_B, configHash: HASH_A, components: componentEntries('production', '56'), healthSha: SHA_B,
  }), /previous release state no corresponde/);

  const mixed = { ...productionState, components: { ...productionState.components, dapp: componentEntries('staging', '97').dapp } };
  const plan = chooseReleasePlan({ state: mixed, environment: 'production', head: SHA_B, configHash: HASH_A, baseAncestor: true });
  assert.ok(plan.build.includes('dapp'));
  assert.ok(!plan.reuse.some((entry) => entry.component === 'dapp'));
});

test('production no acepta estado legacy sin environment/chainId', () => {
  assert.throws(() => chooseReleasePlan({
    state: { commit: SHA_A, configHash: HASH_A, components: componentEntries('production', '56') },
    environment: 'production', head: SHA_B, configHash: HASH_A,
  }), /release state debe declarar environment y chainId/);
});

test('build env production exige ambos valores de red correctos', () => {
  assert.throws(() => canonicalizeBuildEnv({ NEXT_PUBLIC_APP_ENV: 'production' }, resolveDeploymentEnvironment('production')), /debe ser 56/);
  assert.throws(() => canonicalizeBuildEnv({ NEXT_PUBLIC_UKI_CHAIN_ID: '56' }, resolveDeploymentEnvironment('production')), /debe ser production/);
});
