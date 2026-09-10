import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CI_COMPONENTS, WORLD_COMPONENTS } from './image-ref.mjs';
import { chooseDelivery, assertWorldDisabled } from './release-delivery-plan.mjs';
import {
  chooseReleasePlan,
  componentForPath,
  isWorldBuildImagesOnlyChange,
  isWorldDockerfileOnlyChange,
  isWorldLockOnlyChange,
  mapNxProjects,
} from './release-plan.mjs';
import { createNoopState } from './release-state.mjs';
import { withoutWorldRuntime } from './generate-images-compose.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_WEB = 'c'.repeat(40);
const SHA_GAME = 'd'.repeat(40);
const HASH = 'c'.repeat(64);
const DIGEST = `sha256:${'d'.repeat(64)}`;
const LOCK_BASELINE = `lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:
  dapp:
    dependencies:
      demo:
        specifier: 1.0.0
        version: 1.0.0

packages:
  demo@1.0.0:
    resolution: {integrity: sha512-base}

snapshots:
  demo@1.0.0: {}
`;
const LOCK_WORLD = LOCK_BASELINE
  .replace('\npackages:\n', `
  packages/world-api:
    dependencies: {}
  packages/world-matchmaking:
    dependencies: {}
  packages/world-shared:
    dependencies: {}

packages:
`)
  .replace('\nsnapshots:\n', `
  '@cukies/world-api@0.1.0':
    resolution: {integrity: sha512-world}

snapshots:
`);

const COMPOSE_WITH_WORLD = `services:
  app:
    image: registry.test/app@sha256:aaa

  world-redis:
    image: redis:7-alpine
    profiles:
      - world-runtime
    networks:
      - world-private

  world-api:
    image: registry.test/world-api@sha256:bbb
    profiles:
      - world-runtime
    depends_on:
      world-redis:
        condition: service_healthy
    networks:
      - world-private

  world-matchmaking:
    image: registry.test/world-matchmaking@sha256:ccc
    profiles:
      - world-runtime
    depends_on:
      world-redis:
        condition: service_healthy
    networks:
      - world-private

networks:
  default:
  world-private:
    internal: true
`;

const COMPOSE_WITHOUT_WORLD = `services:
  app:
    image: registry.test/app@sha256:aaa

networks:
  default:
`;

function dockerBaseline(source) {
  const marker = source.indexOf('\nFROM base AS world-deps');
  if (marker < 0) throw new Error('Dockerfile fixture no contiene el bloque World.');
  return source.slice(0, marker + 1);
}

function buildImagesBaseline(source) {
  return source.replace(/^[ \t]*['"]world-(?:api|matchmaking)['"][ \t]*:[ \t]*[^,\n]+,[ \t]*\r?\n?/gm, '');
}

function packageBaseline(source) {
  const parsed = JSON.parse(source);
  delete parsed.scripts['build:world'];
  delete parsed.scripts['typecheck:world'];
  delete parsed.scripts['test:world'];
  return JSON.stringify(parsed);
}

function imageEntry(component, sourceSha = SHA_A, digest = DIGEST) {
  return {
    image: `registry.test/cukies-hub/${component}:${sourceSha}-${HASH}@${digest}`,
    digest,
    tag: `${sourceSha}-${HASH}`,
    sourceSha,
    configHash: HASH,
    environment: 'staging',
    chainId: '97',
  };
}

function activeComponents() {
  return Object.fromEntries(CI_COMPONENTS
    .filter((component) => !WORLD_COMPONENTS.includes(component))
    .map((component) => [component, imageEntry(component)]));
}

function allComponents() {
  return Object.fromEntries(CI_COMPONENTS.map((component) => [component, imageEntry(component)]));
}

function worldManifest() {
  return {
    environment: 'staging',
    chainId: '97',
    commit: SHA_B,
    configHash: HASH,
    components: {
      ...activeComponents(),
      'world-api': imageEntry('world-api', SHA_B),
      'world-matchmaking': imageEntry('world-matchmaking', SHA_B),
    },
  };
}

test('World package and Nx mappings keep API/MM changes independent', () => {
  assert.deepEqual(componentForPath('packages/world-api/src/main.ts'), ['world-api']);
  assert.deepEqual(componentForPath('packages/world-matchmaking/src/main.ts'), ['world-matchmaking']);
  assert.deepEqual(componentForPath('packages/world-shared/src/index.ts'), [...WORLD_COMPONENTS]);
  assert.deepEqual(mapNxProjects(['@cukies/world-api']), ['world-api']);
  assert.deepEqual(mapNxProjects(['@cukies/world-matchmaking']), ['world-matchmaking']);
  assert.deepEqual(mapNxProjects(['@cukies/world-shared']), [...WORLD_COMPONENTS]);
});

test('World Docker refinement allows the initial append and a later World-only edit', async () => {
  const after = await readFile(new URL('../../Dockerfile.ci', import.meta.url), 'utf8');
  const before = dockerBaseline(after);
  assert.equal(isWorldDockerfileOnlyChange(before, after), true);
  assert.equal(isWorldDockerfileOnlyChange(before, after.replace('FROM base AS world-deps', 'FROM deps AS world-deps')), false);
  assert.equal(isWorldDockerfileOnlyChange(after, after.replace('EXPOSE 3010', 'EXPOSE 3010\n# World-only stage edit')), true);
  assert.equal(isWorldDockerfileOnlyChange(after, after.replace('FROM base AS dapp', 'FROM deps AS dapp')), false);
});

test('a subsequent World-only Docker stage edit refines to both World images', async () => {
  const source = await readFile(new URL('../../Dockerfile.ci', import.meta.url), 'utf8');
  const edited = source.replace('EXPOSE 3010', 'EXPOSE 3010\n# World-only follow-up');
  const state = {
    environment: 'staging',
    chainId: '97',
    commit: SHA_A,
    configHash: HASH,
    components: allComponents(),
  };
  const plan = chooseReleasePlan({
    state,
    head: SHA_B,
    configHash: HASH,
    changedFiles: ['Dockerfile.ci'],
    dockerfileBefore: source,
    dockerfileAfter: edited,
    baseAncestor: true,
  });
  assert.deepEqual(plan.build, [...WORLD_COMPONENTS]);
  assert.deepEqual(plan.nx.affected, []);
});

test('World build-images refinement only accepts the two target catalog delta', async () => {
  const after = await readFile(new URL('../../scripts/ci/build-images.mjs', import.meta.url), 'utf8');
  const before = buildImagesBaseline(after);
  assert.equal(isWorldBuildImagesOnlyChange(before, after), true);
  assert.equal(isWorldBuildImagesOnlyChange(before, after.replace("const TARGETS = Object.freeze({", "const TARGETS = Object.freeze({\n  dapp: 'changed',")), false);
});

test('World lock refinement preserves every pre-existing block and allows only World importers', async () => {
  assert.equal(isWorldLockOnlyChange(LOCK_BASELINE, LOCK_WORLD), true);
  assert.equal(isWorldLockOnlyChange(LOCK_BASELINE, LOCK_WORLD.replace('excludeLinksFromLockfile: false', 'excludeLinksFromLockfile: true')), false);
  assert.equal(isWorldLockOnlyChange(LOCK_BASELINE, LOCK_WORLD.replace('packages/world-api:', 'packages/not-world:')), false);
});

test('World effective Compose projection preserves the non-World fixture byte for byte', () => {
  assert.equal(withoutWorldRuntime(COMPOSE_WITH_WORLD), COMPOSE_WITHOUT_WORLD);
  assert.match(COMPOSE_WITH_WORLD, /world-redis:\n\s+image: redis:7-alpine/);
  assert.match(COMPOSE_WITH_WORLD, /world-api:[\s\S]*profiles:\n\s+- world-runtime/);
  assert.doesNotMatch(COMPOSE_WITHOUT_WORLD, /world-(?:api|matchmaking|redis)|world-private/);
});

test('World-only delivery changes catalogue images without starting active runtimes', async () => {
  const manifest = worldManifest();
  const previous = {
    environment: 'staging',
    chainId: '97',
    commit: SHA_A,
    configHash: HASH,
    deliveryMode: 'rolling',
    workersComposeHash: null,
    components: activeComponents(),
    deploymentUuid: 'deploy-old',
    webResourceUuid: 'web-old',
    workersResourceUuid: 'workers-old',
    gameResourceUuid: 'game-old',
  };
  const compose = COMPOSE_WITH_WORLD;
  previous.workersComposeHash = chooseDelivery({ manifest, previous: null, compose }).workersComposeHash;
  const decision = chooseDelivery({ manifest, previous, compose });
  assert.equal(decision.skip, true);
  assert.equal(decision.workers, false);
  assert.equal(decision.web, false);
  assert.equal(decision.game, false);
  assert.deepEqual(decision.changed, ['world-api', 'world-matchmaking']);
  assert.equal(decision.workersComposeHash, chooseDelivery({ manifest, previous: null, compose }).workersComposeHash);
  assert.throws(() => chooseDelivery({
    manifest: { ...manifest, components: { ...manifest.components, 'world-api': { ...manifest.components['world-api'], environment: 'production', chainId: '56' } } },
    previous,
    compose,
  }), /imagen world-api.*entorno/);
  assert.throws(() => assertWorldDisabled({ worldEnabled: true }), /World sigue apagada/);
  assert.throws(() => assertWorldDisabled({ WORLD_RUNTIME_ENABLED: 'true' }), /World sigue apagada/);
  assert.throws(() => assertWorldDisabled({ COMPOSE_PROFILES: 'workers,world-runtime' }), /World sigue apagada/);
  assert.throws(() => assertWorldDisabled('WORLD_RUNTIME_ENABLED=true'), /World sigue apagada/);
});

test('No-op registra World images y conserva identidades rolling separadas', () => {
  const previous = {
    environment: 'staging',
    chainId: '97',
    commit: SHA_A,
    webCommit: SHA_WEB,
    gameCommit: SHA_GAME,
    configHash: HASH,
    deliveryMode: 'rolling',
    workersComposeHash: 'e'.repeat(64),
    components: activeComponents(),
    deploymentUuid: 'deploy-old',
    webResourceUuid: 'web-old',
    workersResourceUuid: 'workers-old',
    gameResourceUuid: 'game-old',
    rollback: { commit: 'f'.repeat(40), deploymentUuid: 'rollback-old' },
  };
  const candidate = worldManifest();
  const state = createNoopState({ previous, head: SHA_B, configHash: HASH, components: candidate.components, environment: 'staging', chainId: '97', workersComposeHash: previous.workersComposeHash });
  assert.equal(state.commit, SHA_B);
  assert.equal(state.webCommit, SHA_WEB);
  assert.equal(state.gameCommit, SHA_GAME);
  assert.notEqual(state.webCommit, state.gameCommit);
  assert.deepEqual(state.components['world-api'], candidate.components['world-api']);
  assert.equal(state.deploymentUuid, 'deploy-old');
  assert.deepEqual(state.rollback, previous.rollback);
  assert.equal(state.healthSha, undefined);
  assert.throws(() => createNoopState({ previous, head: SHA_B, configHash: HASH, components: { ...candidate.components, dapp: imageEntry('dapp', SHA_B) }, environment: 'staging', chainId: '97', workersComposeHash: previous.workersComposeHash }), /referencia activa de dapp/);
  assert.throws(() => createNoopState({ previous, head: SHA_B, configHash: HASH, components: candidate.components, environment: 'staging', chainId: '97', workersComposeHash: 'f'.repeat(64) }), /hash de Compose/);
  assert.throws(() => createNoopState({ previous, head: SHA_B, configHash: HASH, components: { ...candidate.components, 'chain-indexer': { ...candidate.components['chain-indexer'], environment: 'production', chainId: '56' } }, environment: 'staging', chainId: '97', workersComposeHash: previous.workersComposeHash }), /imagen activa previa|entorno/);
});

test('No-op bloquea la migración legacy ambigua antes de persistir', async () => {
  const previous = {
    environment: 'staging',
    chainId: '97',
    commit: SHA_WEB,
    configHash: HASH,
    deliveryMode: 'rolling',
    workersComposeHash: chooseDelivery({ manifest: worldManifest(), previous: null, compose: COMPOSE_WITH_WORLD }).workersComposeHash,
    components: activeComponents(),
    deploymentUuid: 'deploy-old',
    webResourceUuid: 'web-old',
    workersResourceUuid: 'workers-old',
    gameResourceUuid: 'game-old',
  };
  const candidate = worldManifest();
  const directory = await mkdtemp(join(tmpdir(), 'cukies-world-noop-identity-'));
  const statePath = join(directory, 'release.json');
  const manifestPath = join(directory, 'manifest.json');
  const composePath = join(directory, 'compose.yml');
  const resultPath = join(directory, 'result.json');
  const previousRaw = `${JSON.stringify(previous, null, 2)}\n`;
  const manifestRaw = `${JSON.stringify(candidate, null, 2)}\n`;
  try {
    await writeFile(statePath, previousRaw);
    await writeFile(manifestPath, manifestRaw);
    await writeFile(composePath, COMPOSE_WITH_WORLD);
    assert.throws(() => createNoopState({
      previous,
      head: candidate.commit,
      configHash: candidate.configHash,
      components: candidate.components,
      environment: candidate.environment,
      chainId: candidate.chainId,
      workersComposeHash: previous.workersComposeHash,
    }), /webCommit servido verificable/);

    assert.throws(() => execFileSync(process.execPath, [
      fileURLToPath(new URL('./deliver-release.mjs', import.meta.url)),
      '--state', statePath,
      '--manifest', manifestPath,
      '--result', resultPath,
      '--compose', composePath,
    ], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, CUKIES_COOLIFY_URL: 'https://unused.invalid', CUKIES_COOLIFY_TOKEN: 'test-token' },
    }), /webCommit servido verificable/);
    assert.equal(await readFile(statePath, 'utf8'), previousRaw);
    assert.equal(await readFile(manifestPath, 'utf8'), manifestRaw);
    await assert.rejects(readFile(resultPath, 'utf8'), { code: 'ENOENT' });
    await assert.rejects(readFile(`${statePath}.pending.json`, 'utf8'), { code: 'ENOENT' });

    const webOnly = { ...previous, webCommit: SHA_WEB };
    assert.throws(() => createNoopState({
      previous: webOnly,
      head: candidate.commit,
      configHash: candidate.configHash,
      components: candidate.components,
      environment: candidate.environment,
      chainId: candidate.chainId,
      workersComposeHash: previous.workersComposeHash,
    }), /gameCommit servido verificable/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('World integration refinement rejects global npmrc changes', async () => {
  const afterPackage = await readFile(new URL('../../package.json', import.meta.url), 'utf8');
  const afterDocker = await readFile(new URL('../../Dockerfile.ci', import.meta.url), 'utf8');
  const beforePackage = packageBaseline(afterPackage);
  const afterLock = LOCK_WORLD;
  const beforeLock = LOCK_BASELINE;
  const beforeDocker = dockerBaseline(afterDocker);
  const composeAfter = COMPOSE_WITH_WORLD;
  const composeBefore = COMPOSE_WITHOUT_WORLD;
  const files = ['packages/world-shared/src/index.ts', 'package.json', 'pnpm-lock.yaml', 'Dockerfile.ci', 'docker-compose.coolify.yml'];
  const plan = chooseReleasePlan({
    state: { ...worldManifest(), commit: SHA_A, components: activeComponents() },
    head: SHA_B,
    configHash: HASH,
    changedFiles: files,
    packageBefore: beforePackage,
    packageAfter: afterPackage,
    lockBefore: beforeLock,
    lockAfter: afterLock,
    dockerfileBefore: beforeDocker,
    dockerfileAfter: afterDocker,
    composeBefore,
    composeAfter,
    baseAncestor: true,
  });
  assert.deepEqual(plan.build, [...WORLD_COMPONENTS]);
  assert.deepEqual(plan.nx.affected, []);
  const buildImagesAfter = await readFile(new URL('../../scripts/ci/build-images.mjs', import.meta.url), 'utf8');
  const buildImagesBefore = buildImagesBaseline(buildImagesAfter);
  const completeChangedFiles = [
    ...files,
    'scripts/ci/build-images.mjs',
    'scripts/ci/world-runtime-smoke.mjs',
    'scripts/ci/world-runtime-smoke.test.mjs',
    'scripts/ci/world-integration.test.mjs',
    'scripts/ci/ci.test.mjs',
  ];
  const completePlan = chooseReleasePlan({
    state: { ...worldManifest(), commit: SHA_A, components: activeComponents() },
    head: SHA_B,
    configHash: HASH,
    changedFiles: completeChangedFiles,
    nxProjects: ['@cukies/world-shared'],
    packageBefore: beforePackage,
    packageAfter: afterPackage,
    lockBefore: beforeLock,
    lockAfter: afterLock,
    dockerfileBefore: beforeDocker,
    dockerfileAfter: afterDocker,
    composeBefore,
    composeAfter,
    imagesComposeBefore: COMPOSE_WITHOUT_WORLD,
    imagesComposeAfter: COMPOSE_WITH_WORLD,
    workersComposeBefore: COMPOSE_WITHOUT_WORLD,
    workersComposeAfter: COMPOSE_WITH_WORLD,
    buildImagesBefore,
    buildImagesAfter,
    baseAncestor: true,
  });
  assert.deepEqual(completePlan.build, [...WORLD_COMPONENTS]);
  assert.deepEqual(completePlan.nx.affected, []);
  const globalBuildImages = chooseReleasePlan({
    state: { ...worldManifest(), commit: SHA_A, components: activeComponents() },
    head: SHA_B,
    configHash: HASH,
    changedFiles: [...files, 'scripts/ci/build-images.mjs'],
    packageBefore: beforePackage,
    packageAfter: afterPackage,
    lockBefore: beforeLock,
    lockAfter: afterLock,
    dockerfileBefore: beforeDocker,
    dockerfileAfter: afterDocker,
    buildImagesBefore,
    buildImagesAfter: buildImagesAfter.replace("const TARGETS = Object.freeze({", "const TARGETS = Object.freeze({\n  dapp: 'changed',"),
    baseAncestor: true,
  });
  assert.deepEqual([...globalBuildImages.build].sort(), [...CI_COMPONENTS].sort());
  const conservative = chooseReleasePlan({
    state: { ...worldManifest(), commit: SHA_A, components: activeComponents() },
    head: SHA_B,
    configHash: HASH,
    changedFiles: [...files, '.npmrc'],
    packageBefore: beforePackage,
    packageAfter: afterPackage,
    lockBefore: beforeLock,
    lockAfter: afterLock,
    dockerfileBefore: beforeDocker,
    dockerfileAfter: afterDocker,
    baseAncestor: true,
  });
  assert.deepEqual([...conservative.build].sort(), [...CI_COMPONENTS].sort());
});
