import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DeploymentVerificationError,
  EXPECTED_STAGING_HOST,
  EXPECTED_STAGING_HOSTS,
  EXPECTED_STAGING_RESOURCE_UUID,
  normalizeGitRef,
  normalizeHost,
  runVerifyDeploymentCli,
  validateDeploymentPayload,
  verifyDeployment,
} from './verify-deployment.mjs';

const CANDIDATE_SHA = '0123456789abcdef0123456789abcdef01234567';
const OTHER_SHA = '89abcdef0123456789abcdef0123456789abcdef';

function validPayload(overrides = {}) {
  const { coolify: coolifyOverrides, ...rootOverrides } = overrides;
  const payload = {
    status: 'ok',
    app: 'cukies-hub',
    environment: 'staging',
    gitSha: CANDIDATE_SHA,
    gitRef: 'staging',
    coolify: {
      resourceUuid: EXPECTED_STAGING_RESOURCE_UUID,
      fqdn: EXPECTED_STAGING_HOST,
    },
    ...rootOverrides,
  };
  if (Object.hasOwn(overrides, 'coolify')) {
    payload.coolify = coolifyOverrides !== null
      && typeof coolifyOverrides === 'object'
      && !Array.isArray(coolifyOverrides)
      ? { ...payload.coolify, ...coolifyOverrides }
      : coolifyOverrides;
  }
  return payload;
}

function jsonResponse(payload, { status = 200, contentType = 'application/json; charset=utf-8' } = {}) {
  return {
    status,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : null },
    json: async () => payload,
  };
}

function fakeTime(start = 0) {
  let now = start;
  return {
    clock: () => now,
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
    get now() {
      return now;
    },
  };
}

test('valida el contrato exacto de un deployment de staging', () => {
  assert.deepEqual(validateDeploymentPayload(validPayload(), CANDIDATE_SHA), {
    status: 'ok',
    app: 'cukies-hub',
    environment: 'staging',
    gitSha: CANDIDATE_SHA,
    gitRef: 'staging',
    resourceUuid: EXPECTED_STAGING_RESOURCE_UUID,
    host: EXPECTED_STAGING_HOST,
    hosts: [EXPECTED_STAGING_HOST],
  });
});

test('acepta el fqdn múltiple exacto que expone actualmente Coolify staging', () => {
  const result = validateDeploymentPayload(validPayload({
    coolify: { fqdn: EXPECTED_STAGING_HOSTS.join(',') },
  }), CANDIDATE_SHA);

  assert.equal(result.host, EXPECTED_STAGING_HOST);
  assert.deepEqual(result.hosts, [...EXPECTED_STAGING_HOSTS]);
});

test('normaliza environment, refs explícitas y FQDN URL sin abrir aliases arbitrarios', () => {
  const result = validateDeploymentPayload(validPayload({
    environment: '  STAGING ',
    gitRef: 'refs/heads/staging',
    coolify: { fqdn: `https://${EXPECTED_STAGING_HOST}/` },
  }), CANDIDATE_SHA);

  assert.equal(result.environment, 'staging');
  assert.equal(result.gitRef, 'staging');
  assert.equal(result.host, EXPECTED_STAGING_HOST);
  assert.equal(normalizeGitRef('origin/staging'), 'staging');
  assert.equal(normalizeGitRef('refs/heads/origin/staging'), 'origin/staging');
  assert.equal(normalizeHost(EXPECTED_STAGING_HOST), EXPECTED_STAGING_HOST);
  assert.equal(normalizeHost(`https://${EXPECTED_STAGING_HOST}`), EXPECTED_STAGING_HOST);
  assert.equal(normalizeHost(`https://${EXPECTED_STAGING_HOST}/`), EXPECTED_STAGING_HOST);
});

test('rechaza cualquier variante no literal de fqdn/host', () => {
  const invalidHosts = [
    EXPECTED_STAGING_HOST.toUpperCase(),
    `${EXPECTED_STAGING_HOST}.`,
    ` ${EXPECTED_STAGING_HOST}`,
    `${EXPECTED_STAGING_HOST} `,
    `http://${EXPECTED_STAGING_HOST}`,
    `HTTPS://${EXPECTED_STAGING_HOST}`,
    `https://${EXPECTED_STAGING_HOST.toUpperCase()}`,
    `https://${EXPECTED_STAGING_HOST}:443`,
    `https://user:password@${EXPECTED_STAGING_HOST}`,
    `https://${EXPECTED_STAGING_HOST}/api/health`,
    `https://${EXPECTED_STAGING_HOST}/?token=x`,
    `https://${EXPECTED_STAGING_HOST}/#fragment`,
    `//${EXPECTED_STAGING_HOST}`,
  ];

  for (const host of invalidHosts) {
    assert.equal(normalizeHost(host), null);
    assert.throws(
      () => validateDeploymentPayload(validPayload({ coolify: { fqdn: host } }), CANDIDATE_SHA),
      /coolify\.fqdn/i,
    );
  }
});

test('acepta host como alternativa a fqdn', () => {
  const payload = validPayload({ coolify: { host: EXPECTED_STAGING_HOST } });
  delete payload.coolify.fqdn;

  assert.equal(validateDeploymentPayload(payload, CANDIDATE_SHA).host, EXPECTED_STAGING_HOST);
});

test('rechaza el alias Coolify si falta el dominio público canónico de staging', () => {
  assert.throws(
    () => validateDeploymentPayload(validPayload({
      coolify: { fqdn: EXPECTED_STAGING_HOSTS[0] },
    }), CANDIDATE_SHA),
    /dominio público canónico/i,
  );
});

const invalidFields = [
  ['status', { status: 'healthy' }, /status/i],
  ['app', { app: 'another-app' }, /app/i],
  ['environment', { environment: 'production' }, /environment/i],
  ['gitSha distinto', { gitSha: OTHER_SHA }, /gitSha/i],
  ['gitSha abreviado', { gitSha: CANDIDATE_SHA.slice(0, 12) }, /gitSha/i],
  ['gitRef', { gitRef: 'feature/staging' }, /gitRef/i],
  ['resourceUuid', { coolify: { resourceUuid: 'wrong-resource' } }, /resourceUuid/i],
  ['fqdn', { coolify: { fqdn: 'cukieshub.eurekand.com.attacker.example' } }, /fqdn|host/i],
];

for (const [name, override, expectedError] of invalidFields) {
  test(`rechaza el campo inválido ${name}`, () => {
    assert.throws(
      () => validateDeploymentPayload(validPayload(override), CANDIDATE_SHA),
      expectedError,
    );
  });
}

test('rechaza payloads que no son objetos JSON', () => {
  for (const payload of [null, [], 'ok', 42]) {
    assert.throws(
      () => validateDeploymentPayload(payload, CANDIDATE_SHA),
      /objeto JSON/i,
    );
  }
});

test('rechaza ausencia de fqdn y host', () => {
  const payload = validPayload();
  delete payload.coolify.fqdn;

  assert.throws(
    () => validateDeploymentPayload(payload, CANDIDATE_SHA),
    /fqdn.*host/i,
  );
});

test('rechaza si uno de fqdn/host contradice al otro', () => {
  assert.throws(
    () => validateDeploymentPayload(validPayload({
      coolify: { host: 'production.example.com' },
    }), CANDIDATE_SHA),
    /host/i,
  );
});

test('rechaza identidad Coolify en raíz o un objeto coolify ausente/malformado', () => {
  const rootFallback = validPayload();
  rootFallback.resourceUuid = rootFallback.coolify.resourceUuid;
  rootFallback.fqdn = rootFallback.coolify.fqdn;
  delete rootFallback.coolify;

  for (const payload of [rootFallback, validPayload({ coolify: null }), validPayload({ coolify: [] })]) {
    assert.throws(
      () => validateDeploymentPayload(payload, CANDIDATE_SHA),
      /coolify/i,
    );
  }
});

test('rechaza candidate SHA ausente, abreviado, distinto de un SHA Git o con mayúsculas', () => {
  for (const sha of [undefined, '', CANDIDATE_SHA.slice(0, 7), 'g'.repeat(40), CANDIDATE_SHA.toUpperCase()]) {
    assert.throws(
      () => validateDeploymentPayload(validPayload(), sha),
      /candidate sha.*completo/i,
    );
  }
});

test('verifyDeployment resuelve en el primer HTTP 200 JSON válido', async () => {
  const requests = [];
  const result = await verifyDeployment({
    candidateSha: CANDIDATE_SHA,
    fetchFn: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse(validPayload());
    },
  });

  assert.equal(result.attempts, 1);
  assert.equal(result.deployment.gitSha, CANDIDATE_SHA);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `https://${EXPECTED_STAGING_HOST}/api/health`);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.headers.accept, 'application/json');
  assert.ok(requests[0].options.signal instanceof AbortSignal);
});

test('hace polling hasta que aparece el SHA candidato', async () => {
  const time = fakeTime();
  let requests = 0;
  const result = await verifyDeployment({
    candidateSha: CANDIDATE_SHA,
    timeoutMs: 500,
    pollIntervalMs: 100,
    clock: time.clock,
    sleepFn: time.sleep,
    fetchFn: async () => {
      requests += 1;
      return jsonResponse(validPayload({ gitSha: requests === 1 ? OTHER_SHA : CANDIDATE_SHA }));
    },
  });

  assert.equal(result.attempts, 2);
  assert.equal(result.elapsedMs, 100);
  assert.equal(requests, 2);
});

test('agota el timeout de polling sin hacer una petición nueva en el deadline', async () => {
  const time = fakeTime();
  let requests = 0;

  await assert.rejects(
    verifyDeployment({
      candidateSha: CANDIDATE_SHA,
      timeoutMs: 250,
      pollIntervalMs: 100,
      clock: time.clock,
      sleepFn: time.sleep,
      fetchFn: async () => {
        requests += 1;
        return jsonResponse(validPayload({ gitSha: OTHER_SHA }));
      },
    }),
    (error) => {
      assert.ok(error instanceof DeploymentVerificationError);
      assert.match(error.message, /timeout.*3 intentos/i);
      assert.match(error.message, /gitSha/i);
      return true;
    },
  );

  assert.equal(requests, 3);
  assert.equal(time.now, 250);
});

test('trata errores de red como intentos fallidos y no filtra el mensaje original', async () => {
  const time = fakeTime();
  const secret = 'token-super-secreto';

  await assert.rejects(
    verifyDeployment({
      candidateSha: CANDIDATE_SHA,
      timeoutMs: 100,
      pollIntervalMs: 100,
      clock: time.clock,
      sleepFn: time.sleep,
      fetchFn: async () => {
        throw new Error(`network failed with ${secret}`);
      },
    }),
    (error) => {
      assert.match(error.message, /red/i);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
});

test('rechaza HTTP distinto de 200 aunque response.ok pudiera ser true', async () => {
  const time = fakeTime();

  await assert.rejects(
    verifyDeployment({
      candidateSha: CANDIDATE_SHA,
      timeoutMs: 1,
      pollIntervalMs: 1,
      clock: time.clock,
      sleepFn: time.sleep,
      fetchFn: async () => jsonResponse(validPayload(), { status: 204 }),
    }),
    /HTTP 204/,
  );
});

test('rechaza content-type que no sea JSON', async () => {
  const time = fakeTime();

  await assert.rejects(
    verifyDeployment({
      candidateSha: CANDIDATE_SHA,
      timeoutMs: 1,
      pollIntervalMs: 1,
      clock: time.clock,
      sleepFn: time.sleep,
      fetchFn: async () => jsonResponse(validPayload(), { contentType: 'text/html' }),
    }),
    /content-type.*JSON/i,
  );
});

test('rechaza JSON ilegible sin imprimir el body', async () => {
  const time = fakeTime();
  const response = jsonResponse(validPayload());
  response.json = async () => {
    throw new SyntaxError('body contains SECRET_VALUE');
  };

  await assert.rejects(
    verifyDeployment({
      candidateSha: CANDIDATE_SHA,
      timeoutMs: 1,
      pollIntervalMs: 1,
      clock: time.clock,
      sleepFn: time.sleep,
      fetchFn: async () => response,
    }),
    (error) => {
      assert.match(error.message, /JSON inválido/i);
      assert.doesNotMatch(error.message, /SECRET_VALUE/);
      return true;
    },
  );
});

test('falla antes de fetch con configuración inválida o endpoint ajeno a staging', async () => {
  const neverFetch = async () => assert.fail('fetch no debe ejecutarse');
  const cases = [
    { candidateSha: CANDIDATE_SHA.slice(0, 12) },
    { candidateSha: CANDIDATE_SHA, timeoutMs: 0 },
    { candidateSha: CANDIDATE_SHA, pollIntervalMs: -1 },
    { candidateSha: CANDIDATE_SHA, requestTimeoutMs: Number.NaN },
    { candidateSha: CANDIDATE_SHA, url: 'https://production.example.com/api/health' },
    { candidateSha: CANDIDATE_SHA, url: `http://${EXPECTED_STAGING_HOST}/api/health` },
    { candidateSha: CANDIDATE_SHA, url: `https://${EXPECTED_STAGING_HOST}/` },
    { candidateSha: CANDIDATE_SHA, url: `https://${EXPECTED_STAGING_HOST}/api/health/extra` },
    { candidateSha: CANDIDATE_SHA, url: `https://${EXPECTED_STAGING_HOST}/api/health?token=x` },
    { candidateSha: CANDIDATE_SHA, url: `https://${EXPECTED_STAGING_HOST}/api/health#fragment` },
  ];

  for (const options of cases) {
    await assert.rejects(verifyDeployment({ ...options, fetchFn: neverFetch }), DeploymentVerificationError);
  }
});

test('CLI admite configuración explícita y solo imprime un resumen seguro', async () => {
  const output = [];
  const errors = [];
  const exitCode = await runVerifyDeploymentCli({
    argv: ['--sha', CANDIDATE_SHA, '--timeout-ms', '10', '--interval-ms', '1'],
    env: {},
    fetchFn: async () => jsonResponse(validPayload({ internalSecret: 'DO_NOT_PRINT' })),
    stdout: { write: (value) => output.push(value) },
    stderr: { write: (value) => errors.push(value) },
  });

  assert.equal(exitCode, 0);
  assert.match(output.join(''), /deployment.*validado/i);
  assert.doesNotMatch(output.join(''), /DO_NOT_PRINT/);
  assert.equal(errors.length, 0);
});

test('CLI falla cerrado y no imprime un body inválido ni secretos', async () => {
  const output = [];
  const errors = [];
  const time = fakeTime();
  const exitCode = await runVerifyDeploymentCli({
    argv: ['--sha', CANDIDATE_SHA, '--timeout-ms', '1', '--interval-ms', '1'],
    env: {},
    clock: time.clock,
    sleepFn: time.sleep,
    fetchFn: async () => jsonResponse({ secret: 'DO_NOT_PRINT' }),
    stdout: { write: (value) => output.push(value) },
    stderr: { write: (value) => errors.push(value) },
  });

  assert.equal(exitCode, 1);
  assert.equal(output.length, 0);
  assert.match(errors.join(''), /deployment.*denegado/i);
  assert.doesNotMatch(errors.join(''), /DO_NOT_PRINT/);
});
