import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PromotionMergeVerificationError,
  runVerifyPromotionMergeCli,
  validatePromotionMergePayloads,
  verifyPromotionMerge,
} from './verify-promotion-merge.mjs';

const REPOSITORY = 'fgomezserna/cukies-hub';
const BASE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const HEAD_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const MERGE_SHA = 'cccccccccccccccccccccccccccccccccccccccc';
const TREE_SHA = 'dddddddddddddddddddddddddddddddddddddddd';
const OTHER_TREE_SHA = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

function mergePayload(overrides = {}) {
  return {
    sha: MERGE_SHA,
    tree: { sha: TREE_SHA },
    parents: [{ sha: BASE_SHA }, { sha: HEAD_SHA }],
    ...overrides,
  };
}

function headPayload(overrides = {}) {
  return {
    sha: HEAD_SHA,
    tree: { sha: TREE_SHA },
    parents: [{ sha: BASE_SHA }],
    ...overrides,
  };
}

function validOptions(overrides = {}) {
  return {
    mergePayload: mergePayload(),
    headPayload: headPayload(),
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    mergeSha: MERGE_SHA,
    mode: 'normal',
    ...overrides,
  };
}

function jsonResponse(payload, status = 200, contentType = 'application/json') {
  return {
    status,
    headers: { get: () => contentType },
    json: async () => payload,
  };
}

test('normal acepta test merge con padres exactos y tree idéntico al staging desplegado', () => {
  assert.deepEqual(validatePromotionMergePayloads(validOptions()), {
    mode: 'normal',
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    mergeSha: MERGE_SHA,
    mergeTreeSha: TREE_SHA,
    headTreeSha: TREE_SHA,
    stagingContainsMain: true,
  });
});

test('normal falla si incorporar main cambia el tree de staging', () => {
  assert.throws(
    () => validatePromotionMergePayloads(validOptions({
      mergePayload: mergePayload({ tree: { sha: OTHER_TREE_SHA } }),
    })),
    /staging no contiene todavía todo main/i,
  );
});

test('hotfix valida padres pero permite que el test merge cambie el tree', () => {
  const result = validatePromotionMergePayloads(validOptions({
    mode: 'hotfix',
    mergePayload: mergePayload({ tree: { sha: OTHER_TREE_SHA } }),
  }));
  assert.equal(result.stagingContainsMain, null);
  assert.equal(result.mergeTreeSha, OTHER_TREE_SHA);
});

test('rechaza padres invertidos, ausentes o SHAs que no coinciden', () => {
  for (const payload of [
    mergePayload({ parents: [{ sha: HEAD_SHA }, { sha: BASE_SHA }] }),
    mergePayload({ parents: [{ sha: BASE_SHA }] }),
    mergePayload({ sha: HEAD_SHA }),
    mergePayload({ tree: { sha: 'short' } }),
  ]) {
    assert.throws(
      () => validatePromotionMergePayloads(validOptions({ mergePayload: payload })),
      PromotionMergeVerificationError,
    );
  }
});

test('rechaza modo y SHAs de entrada inválidos', () => {
  for (const overrides of [
    { mode: 'release' },
    { baseSha: 'short' },
    { headSha: BASE_SHA },
    { mergeSha: HEAD_SHA },
  ]) {
    assert.throws(
      () => validatePromotionMergePayloads(validOptions(overrides)),
      PromotionMergeVerificationError,
    );
  }
});

test('verifyPromotionMerge consulta commits exactos por API y no ramas mutables', async () => {
  const requests = [];
  const result = await verifyPromotionMerge({
    repository: REPOSITORY,
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    mergeSha: MERGE_SHA,
    mode: 'normal',
    token: 'test-token',
    fetchFn: async (url, options) => {
      requests.push({ url, options });
      return url.endsWith(MERGE_SHA)
        ? jsonResponse(mergePayload())
        : jsonResponse(headPayload());
    },
  });
  assert.equal(result.stagingContainsMain, true);
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, new RegExp(`/git/commits/${MERGE_SHA}$`));
  assert.match(requests[1].url, new RegExp(`/git/commits/${HEAD_SHA}$`));
  assert.equal(requests.every(({ options }) => options.redirect === 'error'), true);
});

test('falla cerrado ante red, HTTP, content-type o entradas inválidas sin filtrar secretos', async () => {
  await assert.rejects(verifyPromotionMerge({
    repository: REPOSITORY,
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    mergeSha: MERGE_SHA,
    mode: 'normal',
    token: 'secret-token',
    fetchFn: async () => { throw new Error('secret-token'); },
  }), (error) => {
    assert.match(error.message, /red/i);
    assert.doesNotMatch(error.message, /secret-token/);
    return true;
  });

  for (const response of [
    jsonResponse({}, 404),
    jsonResponse({}, 200, 'text/html'),
    { ...jsonResponse({}), json: async () => { throw new Error('SECRET'); } },
  ]) {
    await assert.rejects(verifyPromotionMerge({
      repository: REPOSITORY,
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      mergeSha: MERGE_SHA,
      mode: 'normal',
      token: 'test-token',
      fetchFn: async () => response,
    }), (error) => {
      assert.doesNotMatch(error.message, /SECRET/);
      return true;
    });
  }
});

test('CLI usa env, devuelve resumen mínimo y falla cerrado sin token', async () => {
  const output = [];
  const exitCode = await runVerifyPromotionMergeCli({
    argv: [],
    env: {
      GITHUB_REPOSITORY: REPOSITORY,
      GITHUB_TOKEN: 'DO_NOT_PRINT',
      PROMOTION_BASE_SHA: BASE_SHA,
      PROMOTION_HEAD_SHA: HEAD_SHA,
      PROMOTION_MERGE_SHA: MERGE_SHA,
      PROMOTION_MODE: 'normal',
    },
    fetchFn: async (url) => url.endsWith(MERGE_SHA)
      ? jsonResponse(mergePayload())
      : jsonResponse(headPayload()),
    stdout: { write: (value) => output.push(value) },
    stderr: { write: () => assert.fail('no debe escribir error') },
  });
  assert.equal(exitCode, 0);
  assert.match(output.join(''), /Test merge.*validado/);
  assert.doesNotMatch(output.join(''), /DO_NOT_PRINT/);

  let fetchCalls = 0;
  const errors = [];
  const denied = await runVerifyPromotionMergeCli({
    argv: [],
    env: {
      GITHUB_REPOSITORY: REPOSITORY,
      PROMOTION_BASE_SHA: BASE_SHA,
      PROMOTION_HEAD_SHA: HEAD_SHA,
      PROMOTION_MERGE_SHA: MERGE_SHA,
      PROMOTION_MODE: 'normal',
    },
    fetchFn: async () => {
      fetchCalls += 1;
      return jsonResponse({});
    },
    stdout: { write: () => assert.fail('no debe escribir éxito') },
    stderr: { write: (value) => errors.push(value) },
  });
  assert.equal(denied, 1);
  assert.equal(fetchCalls, 0);
  assert.match(errors.join(''), /DENEGADO/);
});
