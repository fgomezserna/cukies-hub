import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { requireValue } from './cli-args.mjs';
import { canonicalizeBuildEnv } from './build-env.mjs';
import { assertStagingApplication, buildImageEnvironment, deployAndVerify } from './coolify-release.mjs';
import { generateImagesCompose } from './generate-images-compose.mjs';
import { COMPONENTS, chooseReleasePlan, componentForPath, isDappFinalStageOnlyChange } from './release-plan.mjs';
import { createSuccessfulState, readReleaseState, writeReleaseStateAtomic } from './release-state.mjs';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const completeState = {
  commit: SHA_A,
  configHash: HASH_A,
  components: Object.fromEntries(COMPONENTS.map((component) => [component, {
    image: `192.168.1.207:5000/cukies-hub/${component}:${SHA_A}-${HASH_A}@sha256:${'1'.repeat(64)}`,
    digest: `sha256:${'1'.repeat(64)}`,
    configHash: HASH_A,
  }])),
};

const stagingApplication = {
  uuid: 'u4s804o4wwcckowgk0woo4wg',
  id: 28,
  git_branch: 'staging',
  git_repository: 'fgomezserna/cukies-hub',
  git_commit_sha: SHA_B,
};

test('requireValue rechaza flags sin valor y no lee argv[0]', () => {
  assert.throws(() => requireValue(['node', 'script.mjs', '--manifest'], '--manifest'), /requiere un valor/);
  assert.throws(() => requireValue(['node', 'script.mjs'], '--manifest'), /es obligatorio/);
  assert.equal(requireValue(['node', 'script.mjs'], '--manifest', { fallback: 'manifest.json' }), 'manifest.json');
});

test('release plan construye todo en primera ejecución y con una base inválida', () => {
  const first = chooseReleasePlan({ state: null, head: SHA_B, configHash: HASH_A });
  assert.deepEqual(first.build, COMPONENTS);
  assert.equal(first.base, null);

  const invalid = chooseReleasePlan({ state: completeState, head: SHA_B, configHash: HASH_A, baseAncestor: false });
  assert.deepEqual(invalid.build, first.build);
  assert.equal(invalid.baseReason, 'first-run-or-invalid-base');
});

test('el wrapper PID1 solo invalida la imagen dapp', () => {
  assert.deepEqual(componentForPath('scripts/docker-dapp-server.mjs'), ['dapp']);
});

test('el comparador de Dockerfile limita el refinamiento al stage final dapp', () => {
  const baseDockerfile = [
    'FROM node:22-bookworm-slim AS base',
    '',
    'FROM base AS dapp',
    'COPY old /app',
    '',
    'FROM base AS chain-indexer',
    'CMD ["old"]',
    '',
  ].join('\n');
  const dappChange = baseDockerfile.replace('COPY old /app', 'COPY new /app');
  const prefixChange = baseDockerfile.replace('node:22-bookworm-slim', 'node:22-bookworm');
  const suffixChange = baseDockerfile.replace('CMD ["old"]', 'CMD ["new"]');

  assert.equal(isDappFinalStageOnlyChange(baseDockerfile, dappChange), true);
  assert.equal(isDappFinalStageOnlyChange(baseDockerfile, prefixChange), false);
  assert.equal(isDappFinalStageOnlyChange(baseDockerfile, suffixChange), false);
  assert.equal(isDappFinalStageOnlyChange(baseDockerfile, dappChange.replace('COPY new /app', 'FROM base AS replacement\nCOPY new /app')), false);
  const dependent = baseDockerfile.replace('CMD ["old"]', 'COPY --from=dapp /app /app');
  assert.equal(isDappFinalStageOnlyChange(dependent, dependent.replace('COPY old /app', 'COPY new /app')), false);
});

test('Dockerfile solo en dapp descarta Nx global y conserva dos imágenes', () => {
  const baseDockerfile = [
    'FROM node:22-bookworm-slim AS base',
    '',
    'FROM base AS dapp',
    'COPY old /app',
    '',
    'FROM base AS chain-indexer',
    'CMD ["old"]',
    '',
  ].join('\n');
  const plan = chooseReleasePlan({
    state: completeState,
    head: SHA_B,
    configHash: HASH_A,
    changedFiles: [
      'Dockerfile.ci',
      'scripts/ci/release-plan.mjs',
      'scripts/ci/ci.test.mjs',
      'scripts/ci/standalone-assets.test.mjs',
      'docs/release-workflow.md',
      'AGENTS.md',
      'infrastructure/ci/evidence.json',
      'dapp/src/app/api/ready/route.ts',
      'dapp/__tests__/api/ready-route.test.ts',
    ],
    nxProjects: ['dapp', 'chain-indexer', 'cuki-card-worker'],
    dockerfileBefore: baseDockerfile,
    dockerfileAfter: baseDockerfile.replace('COPY old /app', 'COPY new /app'),
    baseAncestor: true,
  });

  assert.deepEqual(plan.build, ['dapp']);
  assert.deepEqual(plan.reuse.map((entry) => entry.component), ['chain-indexer', 'cuki-card-worker']);
  assert.deepEqual(plan.nx.affected, []);
  assert.equal(plan.planReason, 'dockerfile-ci-final-dapp-stage-only');
  assert.equal(plan.refinement.reason, plan.planReason);
});

test('una fuente adicional fuera de la lista segura conserva el fallback global', () => {
  const dockerfile = [
    'FROM node:22-bookworm-slim AS base',
    '',
    'FROM base AS dapp',
    'COPY old /app',
    '',
    'FROM base AS chain-indexer',
    'CMD ["old"]',
    '',
  ].join('\n');
  const plan = chooseReleasePlan({
    state: completeState,
    head: SHA_B,
    configHash: HASH_A,
    changedFiles: ['Dockerfile.ci', 'packages/contracts/src/guard.sol'],
    nxProjects: ['dapp'],
    dockerfileBefore: dockerfile,
    dockerfileAfter: dockerfile.replace('COPY old /app', 'COPY new /app'),
    baseAncestor: true,
  });
  assert.deepEqual(plan.build, COMPONENTS);
  assert.equal(plan.refinement, null);
});

test('release plan selecciona dapp por config nueva y reutiliza los demás digests', () => {
  const plan = chooseReleasePlan({ state: completeState, head: SHA_B, configHash: HASH_B, changedFiles: [], nxProjects: [], baseAncestor: true });
  assert.deepEqual(plan.build, ['dapp']);
  assert.deepEqual(plan.reuse.map((entry) => entry.component), ['chain-indexer', 'cuki-card-worker']);
  assert.match(plan.reuse[0].image, /@sha256:/);
});

test('release plan reutiliza los tres digests para cambios de orquestación y documentación', () => {
  const plan = chooseReleasePlan({
    state: completeState,
    head: SHA_B,
    configHash: HASH_A,
    changedFiles: [
      'scripts/ci/coolify-release.mjs',
      'scripts/ci/release-plan.mjs',
      'scripts/ci/release-state.mjs',
      'scripts/ci/ci.test.mjs',
      'docs/release-workflow.md',
      'docs/deployment-environments.md',
    ],
    nxProjects: [],
    baseAncestor: true,
  });
  assert.deepEqual(plan.build, []);
  assert.deepEqual(plan.reuse.map((entry) => entry.component), COMPONENTS);
  assert.equal(new Set(plan.reuse.map((entry) => entry.digest)).size, 1);

  const buildScript = chooseReleasePlan({
    state: completeState,
    head: SHA_B,
    configHash: HASH_A,
    changedFiles: ['scripts/ci/build-images.mjs'],
    nxProjects: [],
    baseAncestor: true,
  });
  assert.deepEqual(buildScript.build, COMPONENTS);
});

test('dos releases sucesivas conservan workers construidos en un SHA anterior', () => {
  const state = createSuccessfulState({ head: SHA_B, configHash: HASH_A,
    components: completeState.components, healthSha: SHA_B });
  const plan = chooseReleasePlan({ state, head: 'c'.repeat(40), configHash: HASH_A,
    changedFiles: ['dapp/src/app/page.tsx'], baseAncestor: true });
  assert.deepEqual(plan.build, ['dapp']);
  assert.equal(plan.reuse.length, 2);
  assert.ok(plan.reuse.every((entry) => entry.sourceSha === SHA_A));
});

test('release plan reconstruye una entrada reutilizable con digest o componente incoherente', () => {
  const state = structuredClone(completeState);
  state.components.dapp.digest = `sha256:${'2'.repeat(64)}`;
  const plan = chooseReleasePlan({ state, head: SHA_B, configHash: HASH_A, changedFiles: [], nxProjects: [], baseAncestor: true });
  assert.deepEqual(plan.build, ['dapp']);
  assert.ok(!plan.reuse.some((entry) => entry.component === 'dapp'));
});

test('scheduler changes rebuild only their independent runtime', () => {
  const plan = chooseReleasePlan({ state: completeState, head: SHA_B, configHash: HASH_A, changedFiles: ['dapp/scripts/game-economy-scheduler.mjs'], baseAncestor: true });
  assert.deepEqual(plan.build, ['dapp']);
});

test('Dockerfile final dapp mezclado con scheduler conserva el fallback global', () => {
  const dockerfile = [
    'FROM node:22-bookworm-slim AS base',
    '',
    'FROM base AS dapp',
    'COPY old /app',
    '',
    'FROM base AS chain-indexer',
    'CMD ["old"]',
    '',
  ].join('\n');
  const plan = chooseReleasePlan({
    state: completeState,
    head: SHA_B,
    configHash: HASH_A,
    changedFiles: ['Dockerfile.ci', 'dapp/scripts/game-economy-scheduler.mjs'],
    nxProjects: COMPONENTS,
    dockerfileBefore: dockerfile,
    dockerfileAfter: dockerfile.replace('COPY old /app', 'COPY new /app'),
    baseAncestor: true,
  });
  assert.deepEqual(plan.build, COMPONENTS);
  assert.equal(plan.refinement, null);
});

test('build environment rejects runtime secrets and cross-environment values', () => {
  const accepted = canonicalizeBuildEnv({ NEXT_PUBLIC_APP_ENV: 'staging', NEXT_PUBLIC_UKI_CHAIN_ID: '97', NEXT_PUBLIC_UKI_TOKEN_ADDRESS: '0x1', GAME_SYBILSLASH: 'https://game', DISCORD_CLIENT_ID: 'public' });
  assert.equal(accepted.config.NEXT_PUBLIC_APP_ENV, 'staging');
  assert.equal(accepted.config.NEXT_PUBLIC_UKI_CHAIN_ID, '97');
  assert.throws(() => canonicalizeBuildEnv({ NEXT_PUBLIC_UKI_TOKEN_ADDRESS: '0x1' }), /debe ser staging/);
  assert.throws(() => canonicalizeBuildEnv({ DATABASE_URL: 'mongodb://secret' }), /allowlist pública/);
  assert.throws(() => canonicalizeBuildEnv({ NEXT_PUBLIC_APP_ENV: 'production' }), /debe ser staging/);
  assert.throws(() => canonicalizeBuildEnv({ NEXT_PUBLIC_APP_ENV: 'staging', NEXT_PUBLIC_UKI_CHAIN_ID: '56' }), /debe ser 97/);
});

test('generated image compose removes builds and Mongo while preserving card sharing and network', async () => {
  const source = await readFile(new URL('../../docker-compose.coolify.yml', import.meta.url), 'utf8');
  const generated = generateImagesCompose(source);
  assert.doesNotMatch(generated, /(^|\n)\s+build:/);
  assert.doesNotMatch(generated, /staging-mongo|staging-mongo-data|staging-mongo-config/);
  assert.match(generated, /CUKIES_IMAGE_DAPP.*digest reference/);
  const cardBlocks = generated.match(/^    image: "\$\{CUKIES_IMAGE_CUKI_CARD_WORKER/gm) ?? [];
  assert.equal(cardBlocks.length, 1);
  assert.match(generated, /coolify:\n    external: true/);
  const withLiveVolume = source.replace(/\nvolumes:\n/, '\nvolumes:\n  live-data:\n    name: live-data\n');
  assert.match(generateImagesCompose(withLiveVolume), /live-data:\n    name: live-data/);
});

test('failed health cannot advance durable release state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cukies-ci-state-'));
  const path = join(root, 'release.json');
  await writeFile(path, `${JSON.stringify(completeState)}\n`);
  assert.throws(() => createSuccessfulState({
    previous: completeState,
    head: SHA_B,
    configHash: HASH_B,
    components: completeState.components,
    healthSha: SHA_A,
  }), /health no confirma/);
  assert.deepEqual(await readReleaseState(path), completeState);
});

test('failed Coolify deployment never advances the prior base', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cukies-ci-deploy-'));
  const path = join(root, 'release.json');
  await writeFile(path, `${JSON.stringify(completeState)}\n`);
  await assert.rejects(() => deployAndVerify({
    client: {
      patchApplication: async () => {},
      getApplication: async () => stagingApplication,
      patchEnvs: async () => {},
      start: async () => ({ deployment_uuid: 'deploy-failed' }),
      getDeployment: async () => ({ status: 'failed', commit: SHA_B, message: 'fallo de build', logs_url: 'https://coolify.test/deployments/deploy-failed/logs?token=secret' }),
    },
    compose: 'services: {}\n',
    manifest: { commit: SHA_B, configHash: HASH_B, components: completeState.components },
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
    sleep: async () => {},
  }), /terminó en failed: fallo de build; log=https:\/\/coolify\.test\/deployments\/deploy-failed\/logs/);
  assert.equal((await readReleaseState(path)).commit, SHA_A);
});

test('state writer uses the configured path and records only a successful health SHA', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cukies-ci-state-'));
  const path = join(root, 'nested', 'release.json');
  const state = createSuccessfulState({ previous: completeState, head: SHA_B, configHash: HASH_B, components: completeState.components, healthSha: SHA_B });
  await writeReleaseStateAtomic(path, state, { now: () => 123 });
  assert.equal((await readReleaseState(path)).commit, SHA_B);
});

test('Coolify release patches image refs in bulk and verifies the served SHA', async () => {
  const manifest = {
    environment: 'staging',
    commit: SHA_B,
    configHash: HASH_B,
    components: completeState.components,
  };
  const calls = [];
  const client = {
    patchApplication: async (uuid, body) => { calls.push(['patch', uuid, body]); },
    getApplication: async () => stagingApplication,
    patchEnvs: async (uuid, data) => { calls.push(['envs', uuid, data]); },
    start: async () => ({ deployment_uuid: 'deploy-1' }),
    getDeployment: async () => ({ status: 'finished', commit: SHA_B }),
  };
  const result = await deployAndVerify({
    client,
    compose: 'services: {}\n',
    manifest,
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'ok', environment: 'staging', gitSha: SHA_B, coolify: { resourceUuid: 'u4s804o4wwcckowgk0woo4wg' } }) }),
    sleep: async () => {},
  });
  assert.equal(result.healthSha, SHA_B);
  assert.equal(result.environment, 'staging');
  assert.equal(result.resourceUuid, 'u4s804o4wwcckowgk0woo4wg');
  assert.equal(calls[0][2].git_commit_sha, SHA_B);
  assert.equal(calls[0][2].docker_compose_raw, 'services: {}\n');
  assert.equal(calls[1][2].find((entry) => entry.key === 'CUKIES_IMAGE_CUKI_CARD_WORKER').value, completeState.components['cuki-card-worker'].image);
  const environment = buildImageEnvironment(manifest);
  assert.equal(environment.length, 5);
  assert.ok(environment.every((entry) => entry.is_runtime && entry.is_buildtime));
});

test('Coolify acepta HEAD durante queued/in_progress y confirma el SHA al finalizar', async () => {
  const statuses = [
    { status: 'queued', commit: 'HEAD' },
    { status: 'in_progress', commit: 'HEAD' },
    { status: 'finished', commit: SHA_B },
  ];
  let poll = 0;
  const result = await deployAndVerify({
    client: {
      patchApplication: async () => {},
      getApplication: async () => stagingApplication,
      patchEnvs: async () => {},
      start: async () => ({ deployment_uuid: 'deploy-head' }),
      getDeployment: async () => statuses[poll++],
    },
    compose: 'services: {}\n',
    manifest: { environment: 'staging', commit: SHA_B, configHash: HASH_B, components: completeState.components },
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'ok', environment: 'staging', gitSha: SHA_B, coolify: { resourceUuid: 'u4s804o4wwcckowgk0woo4wg' } }) }),
    sleep: async () => {},
  });
  assert.equal(result.healthSha, SHA_B);
  assert.equal(poll, 3);
});

test('Coolify rechaza HEAD en finished y un SHA concreto incorrecto', async () => {
  const run = (deployment) => deployAndVerify({
    client: {
      patchApplication: async () => {},
      getApplication: async () => stagingApplication,
      patchEnvs: async () => {},
      start: async () => ({ deployment_uuid: 'deploy-invalid' }),
      getDeployment: async () => deployment,
    },
    compose: 'services: {}\n',
    manifest: { environment: 'staging', commit: SHA_B, configHash: HASH_B, components: completeState.components },
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
    sleep: async () => {},
  });

  await assert.rejects(() => run({ status: 'finished', commit: 'HEAD' }), /terminó sin confirmar el SHA/);
  await assert.rejects(() => run({ status: 'in_progress', commit: SHA_A }), /corresponde a .* no al SHA/);
});

test('Coolify preflight blocks mutations when the application source is wrong', async () => {
  let mutations = 0;
  await assert.rejects(() => deployAndVerify({
    client: {
      getApplication: async () => ({ ...stagingApplication, git_branch: 'main' }),
      patchApplication: async () => { mutations += 1; },
    },
    compose: 'services: {}\n',
    manifest: { commit: SHA_B, configHash: HASH_B, components: completeState.components },
  }), /rama staging/);
  assert.equal(mutations, 0);
});

test('estado persistido deriva el hash y SHA de cada imagen reutilizada', () => {
  const state = createSuccessfulState({ previous: completeState, head: SHA_B, configHash: HASH_B, components: completeState.components, healthSha: SHA_B });
  assert.equal(state.configHash, HASH_B);
  assert.equal(state.components.dapp.configHash, HASH_A);
  assert.equal(state.components.dapp.sourceSha, SHA_A);
  assert.equal(state.components.dapp.tag, `${SHA_A}-${HASH_A}`);
});

test('imagen de componente exige digest exacto', () => {
  assert.throws(() => buildImageEnvironment({
    commit: SHA_B,
    configHash: HASH_B,
    components: { ...completeState.components, dapp: { ...completeState.components.dapp, image: completeState.components.dapp.image.replace(/@sha256:.+$/, '@sha256:bad') } },
  }), /referencia de imagen incoherente|digest incoherente/);
});

test('CLI de persistencia usa commit del manifest como SHA desplegado', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cukies-ci-cli-'));
  const statePath = join(directory, 'release.json');
  const manifestPath = join(directory, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({ ...completeState, commit: SHA_B }));
  execFileSync(process.execPath, [fileURLToPath(new URL('./release-state.mjs', import.meta.url)),
    '--state', statePath, '--manifest', manifestPath, '--health-sha', SHA_B]);
  assert.equal((await readReleaseState(statePath)).commit, SHA_B);
});
