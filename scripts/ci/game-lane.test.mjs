import assert from 'node:assert/strict';
import test from 'node:test';

import { deliverRelease } from './deliver-release.mjs';
import { deployRollingWeb } from './coolify-rolling-web.mjs';
import { chooseDelivery } from './release-delivery-plan.mjs';
import { CI_COMPONENTS } from './image-ref.mjs';
import { createSuccessfulState } from './release-state.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const HASH = 'c'.repeat(64);
const DIGEST_A = `sha256:${'1'.repeat(64)}`;
const DIGEST_B = `sha256:${'2'.repeat(64)}`;
const compose = 'services:\n  chain-indexer:\n    image: immutable\n';

function entry(component, sourceSha = SHA_A, digest = DIGEST_A) {
  return {
    image: `registry.test/cukies-hub/${component}:${sourceSha}-${HASH}@${digest}`,
    digest,
    sourceSha,
    configHash: HASH,
  };
}

function candidate() {
  return {
    environment: 'staging',
    chainId: '97',
    commit: SHA_B,
    configHash: HASH,
    components: Object.fromEntries(CI_COMPONENTS.map((component) => [component,
      component === 'treasure-hunt' ? entry(component, SHA_B, DIGEST_B) : entry(component)])),
  };
}

function previous() {
  const manifest = candidate();
  delete manifest.components['treasure-hunt'];
  manifest.commit = SHA_A;
  manifest.deliveryMode = 'rolling';
  manifest.workersComposeHash = chooseDelivery({ manifest: { ...manifest, components: { ...manifest.components, 'treasure-hunt': entry('treasure-hunt') } }, previous: null, compose }).workersComposeHash;
  return manifest;
}

test('game-only delivery calls game and leaves web/workers untouched', async () => {
  const prior = previous();
  const manifest = candidate();
  const decision = chooseDelivery({ manifest, previous: prior, compose });
  assert.equal(decision.game, true);
  assert.equal(decision.web, false);
  assert.equal(decision.workers, false);
  const calls = [];
  const result = await deliverRelease({
    manifest,
    previous: prior,
    compose,
    targets: { web: {}, game: {}, workers: {} },
    webDeploy: () => { calls.push('web'); throw new Error('web must not run'); },
    workerDeploy: () => { calls.push('workers'); throw new Error('workers must not run'); },
    gameDeploy: async () => { calls.push('game'); return { deploymentUuid: 'game-1', healthSha: SHA_B }; },
  });
  assert.deepEqual(calls, ['game']);
  assert.equal(result.game.deploymentUuid, 'game-1');
  assert.equal(manifest.webCommit, SHA_A);
  assert.equal(manifest.gameCommit, SHA_B);
});

test('game bootstrap failure leaves a fail-closed journal phase', async () => {
  const progress = [];
  await assert.rejects(() => deliverRelease({
    manifest: candidate(), previous: null, compose,
    targets: { web: {}, game: {}, workers: {} },
    webDeploy: async () => ({ deploymentUuid: 'web-1', healthSha: SHA_B }),
    gameDeploy: async () => { throw new Error('game bootstrap failed'); },
    workerDeploy: async () => ({ deploymentUuid: 'workers-1' }),
    recordProgress: async (record) => progress.push(record),
    sleepImpl: async () => {},
  }), /game bootstrap failed/);
  assert.equal(progress.at(-1).phase, 'game-starting');
  assert.equal(progress.at(-1).candidate.commit, SHA_B);
});

test('game rollback preserves the prior image and rejects a wrong target before mutation', async () => {
  const target = {
    component: 'treasure-hunt', resourceUuid: 'game-resource', applicationId: '31',
    gitBranch: 'staging', repository: 'fgomezserna/cukies-hub',
    healthUrl: 'https://game.test/treasurehunt-game/api/health', readyUrl: 'https://game.test/treasurehunt-game/api/ready',
    appName: 'treasure-hunt', requireImageSha: true,
  };
  const manifest = candidate();
  const prior = { ...manifest, commit: SHA_A, components: { ...manifest.components, 'treasure-hunt': entry('treasure-hunt', SHA_A, DIGEST_A) } };
  let app = { uuid: target.resourceUuid, id: target.applicationId, git_branch: 'staging', git_repository: target.repository, git_commit_sha: SHA_A, build_pack: 'dockerimage', ports_mappings: null, health_check_enabled: true, health_check_path: '/treasurehunt-game/api/ready', docker_registry_image_name: 'registry.test/cukies-hub/treasure-hunt', docker_registry_image_tag: `sha256-${DIGEST_A.slice(7)}` };
  let patches = 0;
  const client = { getApplication: async () => ({ ...app }), patchApplication: async (_uuid, body) => { patches += 1; app = { ...app, ...body }; }, patchEnvs: async () => {}, start: async () => ({ deployment_uuid: 'game-2' }), getDeployment: async () => ({ status: 'finished', commit: SHA_B }) };
  const fetchImpl = async (url) => ({ ok: true, status: 200, json: async () => url.endsWith('/health')
    ? { status: 'ok', app: 'treasure-hunt', environment: 'staging', gitSha: SHA_A, coolify: { resourceUuid: target.resourceUuid } }
    : { status: 'ready', gitSha: SHA_A, configHash: HASH, imageSha: SHA_A } });
  await assert.rejects(() => deployRollingWeb({ client, target, manifest, previousManifest: prior, fetchImpl, sleep: async () => {}, pollMs: 1, timeoutMs: 2 }), /no confirmó health\/ready/);
  assert.ok(patches >= 2, 'la recuperación debe reaplicar la imagen previa');
  await assert.rejects(() => deployRollingWeb({ client, target: { ...target, gitBranch: 'main' }, manifest, previousManifest: prior }), /no corresponde al entorno/);
});

test('state upgrade keeps the aggregate commit and records independent web/game commits', () => {
  const prior = { environment: 'staging', chainId: '97', commit: SHA_A, configHash: HASH, components: Object.fromEntries(CI_COMPONENTS.filter((component) => component !== 'treasure-hunt').map((component) => [component, entry(component)])) };
  const state = createSuccessfulState({ previous: prior, environment: 'staging', chainId: '97', head: SHA_B, configHash: HASH, components: candidate().components, healthSha: SHA_B, webCommit: SHA_A, gameCommit: SHA_B });
  assert.equal(state.commit, SHA_B);
  assert.equal(state.webCommit, SHA_A);
  assert.equal(state.gameCommit, SHA_B);
  assert.ok(state.components['treasure-hunt']);
});
