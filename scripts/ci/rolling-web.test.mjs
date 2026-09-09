import assert from 'node:assert/strict';
import test from 'node:test';

import { deployRollingWeb } from './coolify-rolling-web.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const DIGEST_A = `sha256:${'1'.repeat(64)}`;
const DIGEST_B = `sha256:${'2'.repeat(64)}`;

const target = {
  resourceUuid: 'resource-staging',
  applicationId: '28',
  gitBranch: 'staging',
  repository: 'fgomezserna/cukies-hub',
  healthUrl: 'https://hub.test/api/health',
  readyUrl: 'https://hub.test/api/ready',
};

function image(sourceSha, configHash, digest = DIGEST_B) {
  return `registry.test/cukies-hub/dapp:${sourceSha}-${configHash}@${digest}`;
}

function manifest({ commit = SHA_B, configHash = HASH_B, digest = DIGEST_B, environment = 'staging', chainId = '97' } = {}) {
  return {
    environment,
    chainId,
    commit,
    configHash,
    components: {
      dapp: {
        image: image(commit, configHash, digest),
        digest,
        sourceSha: commit,
        configHash,
      },
    },
  };
}

function previousManifest() {
  return manifest({ commit: SHA_A, configHash: HASH_A, digest: DIGEST_A });
}

function application(overrides = {}) {
  return {
    uuid: target.resourceUuid,
    id: target.applicationId,
    git_branch: target.gitBranch,
    git_repository: target.repository,
    git_commit_sha: SHA_A,
    build_pack: 'dockerimage',
    ports_mappings: null,
    health_check_enabled: true,
    health_check_path: '/api/ready',
    docker_registry_image_name: 'registry.test/cukies-hub/dapp',
    docker_registry_image_tag: `sha256-${DIGEST_A.slice(7)}`,
    ...overrides,
  };
}

function fakeFetch({ health, ready }) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url) => {
      calls.push(url);
      const payload = url.endsWith('/ready') ? ready() : health();
      return { ok: true, status: 200, json: async () => payload };
    },
  };
}

function fakeClient({ deployments = [{ status: 'finished', commit: SHA_B }], app = application() } = {}) {
  const calls = [];
  const state = { ...app };
  let deploymentIndex = 0;
  return {
    calls,
    client: {
      getApplication: async () => { calls.push(['getApplication']); return { ...state }; },
      patchApplication: async (uuid, body) => { Object.assign(state, body); calls.push(['patchApplication', uuid, body]); },
      patchEnvs: async (uuid, data) => { calls.push(['patchEnvs', uuid, data]); },
      start: async (uuid) => { calls.push(['start', uuid]); return { deployment_uuid: 'deployment-1' }; },
      getDeployment: async (uuid) => { calls.push(['getDeployment', uuid]); return deployments[Math.min(deploymentIndex++, deployments.length - 1)]; },
    },
  };
}

function expectedHealth() {
  return { status: 'ok', environment: 'staging', gitSha: SHA_B, coolify: { resourceUuid: target.resourceUuid } };
}

function expectedReady() {
  return { status: 'ready', gitSha: SHA_B, configHash: HASH_B };
}

test('rolling web respeta el orden readiness/finished/health y parchea solo la identidad inmutable', async () => {
  const fake = fakeClient({ deployments: [
    { status: 'queued', commit: 'HEAD' },
    { status: 'finished', commit: 'HEAD' },
  ] });
  const web = fakeFetch({ health: expectedHealth, ready: expectedReady });
  const result = await deployRollingWeb({
    client: fake.client,
    target,
    manifest: manifest(),
    previousManifest: previousManifest(),
    fetchImpl: web.fetchImpl,
    sleep: async () => {},
    pollMs: 1,
    timeoutMs: 10,
  });

  assert.equal(result.status, 'finished');
  assert.deepEqual(fake.calls.map(([name]) => name), [
    'getApplication', 'patchApplication', 'patchEnvs', 'getApplication', 'start',
    'getDeployment', 'getDeployment', 'getApplication',
  ]);
  assert.deepEqual(web.calls, [target.healthUrl, target.readyUrl]);
  const patch = fake.calls[1][2];
  assert.deepEqual(patch, {
    git_commit_sha: SHA_B,
    docker_registry_image_name: 'registry.test/cukies-hub/dapp',
    docker_registry_image_tag: `sha256-${DIGEST_B.slice(7)}`,
  });
  assert.ok(fake.calls[2][2].every((entry) => entry.is_runtime && !entry.is_buildtime && entry.is_literal));
});

test('si el despliegue falla, nunca hace stop y restaura config y metadata anteriores', async () => {
  const fake = fakeClient({ deployments: [{ status: 'failed', commit: SHA_B }] });
  const web = fakeFetch({ health: expectedHealth, ready: expectedReady });
  await assert.rejects(() => deployRollingWeb({
    client: fake.client,
    target,
    manifest: manifest(),
    previousManifest: previousManifest(),
    fetchImpl: web.fetchImpl,
    sleep: async () => {},
    pollMs: 1,
    timeoutMs: 10,
  }), /terminó en failed/);

  assert.equal(fake.calls.some(([name]) => name === 'stop'), false);
  const restorePatch = fake.calls.find(([, , body]) => body?.git_commit_sha === SHA_A);
  assert.deepEqual(restorePatch?.[2], {
    git_commit_sha: SHA_A,
    docker_registry_image_name: 'registry.test/cukies-hub/dapp',
    docker_registry_image_tag: `sha256-${DIGEST_A.slice(7)}`,
  });
  const restoreEnvs = fake.calls.find(([, , data]) => Array.isArray(data) && data[0]?.value === SHA_A);
  assert.equal(restoreEnvs?.[2].find((entry) => entry.key === 'CUKIES_BUILD_ENV_HASH').value, HASH_A);
});

test('rechaza un target de otra rama/entorno antes de mutar Coolify', async () => {
  const fake = fakeClient();
  await assert.rejects(() => deployRollingWeb({
    client: fake.client,
    target: { ...target, gitBranch: 'main' },
    manifest: manifest(),
    previousManifest: previousManifest(),
  }), /no corresponde al entorno/);
  assert.equal(fake.calls.length, 0);
});

test('rechaza ports_mappings mapeado', async () => {
  const fake = fakeClient({ app: application({ ports_mappings: '3000:3000' }) });
  await assert.rejects(() => deployRollingWeb({
    client: fake.client,
    target,
    manifest: manifest(),
    previousManifest: previousManifest(),
  }), /ports_mappings/);
  assert.equal(fake.calls.filter(([name]) => name === 'patchApplication').length, 0);
});

test('finished sin prueba pública ejecuta rollback runtime y lanza el error original con resultado', async () => {
  const fake = fakeClient({ deployments: [
    { status: 'finished', commit: 'HEAD' },
    { status: 'finished', commit: SHA_A },
  ] });
  let healthCount = 0;
  const web = fakeFetch({
    health: () => {
      healthCount += 1;
      return healthCount === 1
        ? { status: 'ok', environment: 'staging', gitSha: SHA_A, coolify: { resourceUuid: target.resourceUuid } }
        : { status: 'ok', environment: 'staging', gitSha: SHA_A, coolify: { resourceUuid: target.resourceUuid } };
    },
    ready: () => healthCount === 1
      ? { status: 'ready', gitSha: SHA_A, configHash: HASH_A }
      : { status: 'ready', gitSha: SHA_A, configHash: HASH_A },
  });
  let thrown;
  try {
    await deployRollingWeb({
      client: fake.client,
      target,
      manifest: manifest(),
      previousManifest: previousManifest(),
      fetchImpl: web.fetchImpl,
      sleep: async () => {},
      pollMs: 1,
      timeoutMs: 3,
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown);
  assert.match(thrown.message, /no confirmó health\/ready/);
  assert.equal(thrown.runtimeRollback.status, 'finished');
  assert.equal(thrown.runtimeRollback.commit, SHA_A);
  assert.equal(fake.calls.some(([name]) => name === 'stop'), false);
  assert.equal(fake.calls.filter(([name]) => name === 'patchApplication').length, 2);
});

test('fallo de red en start conserva configuración para reconciliación y no restaura', async () => {
  const fake = fakeClient();
  fake.client.start = async (uuid) => {
    fake.calls.push(['start', uuid]);
    throw new Error('network failure');
  };
  await assert.rejects(() => deployRollingWeb({
    client: fake.client,
    target,
    manifest: manifest(),
    previousManifest: previousManifest(),
    sleep: async () => {},
    pollMs: 1,
    timeoutMs: 3,
  }), /network failure; despliegue sin estado final/);
  assert.equal(fake.calls.filter(([name]) => name === 'patchApplication').length, 1);
  assert.equal(fake.calls.filter(([name]) => name === 'patchEnvs').length, 1);
});

test('reintenta health viejo hasta que la instancia nueva confirma SHA y ready', async () => {
  const fake = fakeClient();
  let healthCount = 0;
  const web = fakeFetch({
    health: () => healthCount++ === 0
      ? { status: 'ok', environment: 'staging', gitSha: SHA_A, coolify: { resourceUuid: target.resourceUuid } }
      : expectedHealth(),
    ready: () => expectedReady(),
  });
  const result = await deployRollingWeb({
    client: fake.client,
    target,
    manifest: manifest(),
    previousManifest: previousManifest(),
    fetchImpl: web.fetchImpl,
    sleep: async () => {},
    pollMs: 1,
    timeoutMs: 10,
  });
  assert.equal(result.healthSha, SHA_B);
  assert.equal(healthCount, 2);
});

test('permite reutilizar una imagen anterior con la misma configuración pública', async () => {
  const fake = fakeClient();
  const candidate = manifest({ configHash: HASH_A });
  candidate.components = previousManifest().components;
  const web = fakeFetch({ health: expectedHealth, ready: () => ({ status: 'ready', gitSha: SHA_B, configHash: HASH_A }) });
  const result = await deployRollingWeb({ client: fake.client, target, manifest: candidate, previousManifest: previousManifest(), fetchImpl: web.fetchImpl, sleep: async () => {}, pollMs: 1, timeoutMs: 10 });
  assert.equal(result.healthSha, SHA_B);
  assert.equal(result.imageTag, `sha256-${DIGEST_A.slice(7)}`);
});

test('un timeout no pisa la configuración de un despliegue todavía activo', async () => {
  const fake = fakeClient({ deployments: [{ status: 'in_progress', commit: 'HEAD' }] });
  await assert.rejects(deployRollingWeb({ client: fake.client, target, manifest: manifest(), previousManifest: previousManifest(), sleep: async () => {}, pollMs: 1, timeoutMs: 1 }), /sin estado final/);
  assert.equal(fake.calls.filter(([name]) => name === 'patchApplication').length, 1);
});
