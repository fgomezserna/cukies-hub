import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  STAGING_DEPLOY_GUARD,
  assertDeploymentTarget,
  assertFreeSpace,
  assertNoOtherBuild,
  createCoolifyClient,
  parseFreeBytes,
  preflightBeforeStart,
  watchDeployment,
} from './staging-deploy-guard.mjs';

const COMMIT = '5e6ee836310c5924bbaa492e0244a70539f5dc9a';
const TARGET = 'deployment-target-123';

function record(status, deploymentUuid = TARGET, overrides = {}) {
  return {
    deployment_uuid: deploymentUuid,
    application_id: '28',
    commit: COMMIT,
    status,
    ...overrides,
  };
}

function dfOutput(freeKib) {
  return `Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 100 1 ${freeKib} 1% /srv\n`;
}

function fakeExec(stdout) {
  return async () => ({ stdout });
}

describe('staging deployment guard', () => {
  it('reads df output and enforces the 10 GiB floor', () => {
    const freeBytes = parseFreeBytes(dfOutput(99));
    assert.equal(freeBytes, 99n * 1024n);
    assert.throws(() => assertFreeSpace(9n * 1024n * 1024n * 1024n), /espacio libre insuficiente/);
  });

  it('rejects a wrong deployment, app or commit without cancellation', () => {
    assert.throws(
      () => assertDeploymentTarget(record('building', 'other'), { deploymentUuid: TARGET, expectedCommit: COMMIT }),
      /no coincide/,
    );
    assert.throws(
      () => assertDeploymentTarget(record('building', TARGET, { application_id: '12' }), { deploymentUuid: TARGET, expectedCommit: COMMIT }),
      /no pertenece/,
    );
    assert.throws(
      () => assertDeploymentTarget(record('building', TARGET, { commit: 'd5babb90efa75a3a5784153733067b959d2f1a58' }), { deploymentUuid: TARGET, expectedCommit: COMMIT }),
      /commit esperado/,
    );
    assert.throws(() => assertNoOtherBuild([record('queued', 'other')], TARGET), /otro build activo/);
  });

  it('runs preflight against app 28 and never mutates or cancels', async () => {
    let cancelled = 0;
    const result = await preflightBeforeStart({
      expectedCommit: COMMIT,
      client: {
        listDeployments: async (resourceUuid) => {
          assert.equal(resourceUuid, STAGING_DEPLOY_GUARD.resourceUuid);
          return [];
        },
        cancelDeployment: async () => { cancelled += 1; },
      },
      exec: fakeExec(dfOutput(20_000_000)),
    });
    assert.equal(result.readyToStart, true);
    assert.equal(result.applicationId, '28');
    assert.equal(cancelled, 0);
  });

  it('exits cleanly for finished, failed and cancelled deployments', async (t) => {
    for (const status of ['finished', 'failed', 'cancelled-by-user']) {
      await t.test(status, async () => {
        let cancelCalls = 0;
        const result = await watchDeployment({
          deploymentUuid: TARGET,
          expectedCommit: COMMIT,
          client: {
            getDeployment: async () => record(status),
            listDeployments: async () => [record(status)],
            cancelDeployment: async () => { cancelCalls += 1; },
          },
          exec: fakeExec(dfOutput(20_000_000)),
          sleep: async () => {},
        });
        assert.equal(result.status, status);
        assert.equal(result.cancelCount, 0);
        assert.equal(cancelCalls, 0);
      });
    }
  });

  it('cancels exactly once on low space and verifies terminal state', async () => {
    let current = record('building');
    let cancelCalls = 0;
    const result = await watchDeployment({
      deploymentUuid: TARGET,
      expectedCommit: COMMIT,
      client: {
        getDeployment: async () => current,
        listDeployments: async () => [current],
        cancelDeployment: async (deploymentUuid) => {
          cancelCalls += 1;
          assert.equal(deploymentUuid, TARGET);
          current = record('cancelled-by-user');
          return { status: 200, payload: { deployment_uuid: TARGET, message: 'Deployment cancelled.' } };
        },
      },
      exec: fakeExec(dfOutput(9_000_000)),
      sleep: async () => {},
    });
    assert.equal(result.status, 'cancelled-by-user');
    assert.equal(result.cancelCount, 1);
    assert.equal(cancelCalls, 1);
  });

  it('cancels exactly once on df failure and verifies terminal state', async () => {
    let current = record('building');
    let reads = 0;
    let cancelCalls = 0;
    const result = await watchDeployment({
      deploymentUuid: TARGET,
      expectedCommit: COMMIT,
      client: {
        getDeployment: async () => current,
        listDeployments: async () => [current],
        cancelDeployment: async () => {
          cancelCalls += 1;
          current = record('cancelled');
          return { status: 200, payload: { cancelled: true, deployment_uuid: TARGET } };
        },
      },
      exec: async () => {
        reads += 1;
        if (reads === 1) throw new Error('df unavailable');
        return { stdout: dfOutput(20_000_000) };
      },
      sleep: async () => {},
    });
    assert.equal(result.status, 'cancelled');
    assert.equal(result.cancelCount, 1);
    assert.equal(cancelCalls, 1);
  });

  it('times out a hanging df call and follows the single-cancel path', async () => {
    let current = record('building');
    let cancelCalls = 0;
    const result = await watchDeployment({
      deploymentUuid: TARGET,
      expectedCommit: COMMIT,
      timeoutMs: 10,
      client: {
        getDeployment: async () => current,
        listDeployments: async () => [current],
        cancelDeployment: async () => {
          cancelCalls += 1;
          current = record('cancelled');
          return { status: 200, payload: { cancelled: true, deployment_uuid: TARGET } };
        },
      },
      exec: async () => new Promise(() => {}),
      sleep: async () => {},
    });
    assert.equal(result.status, 'cancelled');
    assert.equal(result.cancelCount, 1);
    assert.equal(cancelCalls, 1);
  });

  it('cancels once after a query failure only after the target was verified', async () => {
    let getCalls = 0;
    let cancelCalls = 0;
    const result = await watchDeployment({
      deploymentUuid: TARGET,
      expectedCommit: COMMIT,
      client: {
        getDeployment: async () => {
          getCalls += 1;
          if (getCalls === 2) throw new Error('temporary Coolify read failure');
          return record(getCalls >= 3 ? 'cancelled' : 'building');
        },
        listDeployments: async () => [record(getCalls >= 3 ? 'cancelled' : 'building')],
        cancelDeployment: async () => {
          cancelCalls += 1;
          return { status: 200, payload: { message: 'cancelled' } };
        },
      },
      exec: fakeExec(dfOutput(20_000_000)),
      sleep: async () => {},
    });
    assert.equal(result.status, 'cancelled');
    assert.equal(result.cancelCount, 1);
    assert.equal(cancelCalls, 1);
  });

  it('fails without cancelling when the first query cannot verify the target', async () => {
    let cancelCalls = 0;
    await assert.rejects(
      watchDeployment({
        deploymentUuid: TARGET,
        expectedCommit: COMMIT,
        client: {
          getDeployment: async () => { throw new Error('Coolify unavailable'); },
          listDeployments: async () => [],
          cancelDeployment: async () => { cancelCalls += 1; },
        },
        sleep: async () => {},
      }),
      /Coolify unavailable/,
    );
    assert.equal(cancelCalls, 0);
  });

  it('fails if another active build appears and does not cancel the target', async () => {
    let cancelCalls = 0;
    await assert.rejects(
      watchDeployment({
        deploymentUuid: TARGET,
        expectedCommit: COMMIT,
        client: {
          getDeployment: async () => record('building'),
          listDeployments: async () => [record('building'), record('queued', 'other')],
          cancelDeployment: async () => { cancelCalls += 1; },
        },
        exec: fakeExec(dfOutput(20_000_000)),
        sleep: async () => {},
      }),
      /otro build activo/,
    );
    assert.equal(cancelCalls, 0);
  });

  it('rejects a cancellation ACK for a different deployment', async () => {
    let cancelCalls = 0;
    await assert.rejects(
      watchDeployment({
        deploymentUuid: TARGET,
        expectedCommit: COMMIT,
        client: {
          getDeployment: async () => record('building'),
          listDeployments: async () => [record('building')],
          cancelDeployment: async () => {
            cancelCalls += 1;
            return { status: 200, payload: { deployment_uuid: 'other', message: 'Deployment cancelled.' } };
          },
        },
        exec: fakeExec(dfOutput(9_000_000)),
        sleep: async () => {},
      }),
      /deployment incorrecto/,
    );
    assert.equal(cancelCalls, 1);
  });

  it('uses only the expected Coolify endpoints and bearer token in the client', async () => {
    const calls = [];
    const client = createCoolifyClient({
      baseUrl: 'https://coolify.test/',
      token: 'token-not-logged',
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, status: 200, json: async () => ({ message: 'Deployment cancelled.' }) };
      },
    });
    await client.getDeployment(TARGET);
    await client.listDeployments();
    await client.cancelDeployment(TARGET);
    assert.deepEqual(calls.map(({ url }) => url), [
      `https://coolify.test/api/v1/deployments/${TARGET}`,
      `https://coolify.test/api/v1/deployments/applications/${STAGING_DEPLOY_GUARD.resourceUuid}`,
      `https://coolify.test/api/v1/deployments/${TARGET}/cancel`,
    ]);
    assert.equal(calls[2].options.method, 'POST');
    assert.equal(calls[2].options.headers.authorization, 'Bearer token-not-logged');
  });

  it('aborts a hanging Coolify request at the bounded timeout', async () => {
    const client = createCoolifyClient({
      baseUrl: 'https://coolify.test',
      token: 'token-not-logged',
      timeoutMs: 10,
      fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted by test')), { once: true });
      }),
    });
    await assert.rejects(client.getDeployment(TARGET), /excedió el timeout de 10 ms/);
  });
});
