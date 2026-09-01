import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AttestationVerificationError,
  REQUIRED_STATUS_CONTEXTS,
  runVerifyAttestationsCli,
  validateActionsRunPayload,
  validateAncestryPayload,
  validateCommitStatusPayload,
  validateDeploymentBranchPoliciesPayload,
  validateStagingEnvironmentPayload,
  verifyAttestations,
} from './verify-attestations.mjs';

const REPOSITORY = 'fgomezserna/cukies-hub';
const CANDIDATE_SHA = '0123456789abcdef0123456789abcdef01234567';
const OTHER_SHA = '89abcdef0123456789abcdef0123456789abcdef';
const MAIN_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const INTERMEDIATE_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const RUN_ID = '123456789';
const OTHER_RUN_ID = '987654321';
const RELEASE_STATUS_CREATOR_LOGIN = 'cukies-release-guard[bot]';
const RELEASE_APP_CREATOR = Object.freeze({
  login: RELEASE_STATUS_CREATOR_LOGIN,
  id: 9001,
  type: 'Bot',
});

function runUrl(runId = RUN_ID) {
  return `https://github.com/${REPOSITORY}/actions/runs/${runId}`;
}

function releaseStatus(context, {
  sha = CANDIDATE_SHA,
  state = 'success',
  runId = RUN_ID,
  creator = RELEASE_APP_CREATOR,
} = {}) {
  return {
    context,
    state,
    sha,
    target_url: runUrl(runId),
    creator,
  };
}

function validStatuses(overrides = {}) {
  return {
    state: 'success',
    sha: CANDIDATE_SHA,
    total_count: 2,
    statuses: REQUIRED_STATUS_CONTEXTS.map((context) => releaseStatus(context)),
    ...overrides,
  };
}

function deployedStatusPayload(overrides = {}) {
  return validStatuses({
    state: 'pending',
    total_count: 1,
    statuses: [releaseStatus('release/staging-deployed')],
    ...overrides,
  });
}

function validEnvironment(overrides = {}) {
  return {
    name: 'Staging',
    protection_rules: [{
      id: 1,
      type: 'required_reviewers',
      prevent_self_review: true,
      reviewers: [{ type: 'User', reviewer: { id: 219637213, login: 'JairoGG-ai' } }],
    }],
    deployment_branch_policy: {
      protected_branches: false,
      custom_branch_policies: true,
    },
    ...overrides,
  };
}

function validBranchPolicies(branch = 'staging') {
  return {
    total_count: 1,
    branch_policies: [{ id: 7, name: branch, type: 'branch' }],
  };
}

function validAncestry(overrides = {}) {
  return {
    status: 'ahead',
    ahead_by: 2,
    behind_by: 0,
    total_commits: 2,
    base_commit: { sha: MAIN_SHA },
    merge_base_commit: { sha: MAIN_SHA },
    commits: [{ sha: INTERMEDIATE_SHA }, { sha: CANDIDATE_SHA }],
    ...overrides,
  };
}

function validRun(overrides = {}) {
  return {
    id: Number(RUN_ID),
    html_url: runUrl(),
    path: '.github/workflows/staging-deploy-verify.yml',
    event: 'push',
    head_branch: 'staging',
    head_sha: CANDIDATE_SHA,
    display_title: `Staging deploy ${CANDIDATE_SHA}`,
    status: 'completed',
    conclusion: 'success',
    repository: { full_name: REPOSITORY },
    head_repository: { full_name: REPOSITORY },
    workflow_id: 42,
    ...overrides,
  };
}

function jsonResponse(payload, status = 200) {
  return {
    status,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
    json: async () => payload,
  };
}

function sequenceFetch(payloads, requests = []) {
  const responses = [...payloads];
  return async (url, options) => {
    requests.push({ url, options });
    const response = responses.shift();
    assert.ok(response, `respuesta simulada ausente para ${url}`);
    return response;
  };
}

test('acepta los dos contextos release en success sobre el candidate SHA', () => {
  const result = validateCommitStatusPayload(validStatuses(), CANDIDATE_SHA);
  assert.equal(result.candidateSha, CANDIDATE_SHA);
  assert.deepEqual(result.contexts, [...REQUIRED_STATUS_CONTEXTS]);
  assert.deepEqual(result.matchedStatuses.map(({ context }) => context), [...REQUIRED_STATUS_CONTEXTS]);
});

test('acepta status items sin sha propio cuando el payload combinado está anclado al candidato', () => {
  const payload = validStatuses();
  payload.statuses = payload.statuses.map(({ sha: _sha, ...status }) => status);
  assert.equal(validateCommitStatusPayload(payload, CANDIDATE_SHA).candidateSha, CANDIDATE_SHA);
});

test('rechaza SHA ajeno, contextos ausentes, duplicados, incompletos o no exitosos', () => {
  assert.throws(
    () => validateCommitStatusPayload(validStatuses({ sha: OTHER_SHA }), CANDIDATE_SHA),
    /SHA.*candidato/i,
  );
  const wrongItemSha = validStatuses();
  wrongItemSha.statuses[0] = releaseStatus('release/staging-deployed', { sha: OTHER_SHA });
  assert.throws(() => validateCommitStatusPayload(wrongItemSha, CANDIDATE_SHA), /SHA.*distinto/i);

  for (const context of REQUIRED_STATUS_CONTEXTS) {
    const payload = validStatuses();
    payload.statuses = payload.statuses.filter((status) => status.context !== context);
    payload.total_count = payload.statuses.length;
    assert.throws(
      () => validateCommitStatusPayload(payload, CANDIDATE_SHA),
      new RegExp(context.replace('/', '\\/')),
    );
  }

  for (const state of ['error', 'failure', 'pending']) {
    const payload = validStatuses({ state });
    payload.statuses[1] = releaseStatus('release/staging-validated', { state });
    assert.throws(() => validateCommitStatusPayload(payload, CANDIDATE_SHA), /success/i);
  }

  const duplicate = validStatuses();
  duplicate.statuses.push(releaseStatus('release/staging-deployed'));
  duplicate.total_count = 3;
  assert.throws(() => validateCommitStatusPayload(duplicate, CANDIDATE_SHA), /duplicado/i);
  assert.throws(
    () => validateCommitStatusPayload(validStatuses({ total_count: 3 }), CANDIDATE_SHA),
    /total_count/i,
  );
});

test('rechaza formas inválidas de la API de commit statuses', () => {
  const malformedPayloads = [
    null,
    [],
    validStatuses({ sha: CANDIDATE_SHA.slice(0, 12) }),
    validStatuses({ total_count: '2' }),
    validStatuses({ statuses: null }),
    validStatuses({ statuses: [{ context: '', state: 'success' }], total_count: 1 }),
    validStatuses({
      statuses: [{ context: 'release/staging-deployed', state: 'unknown' }],
      total_count: 1,
    }),
  ];
  for (const payload of malformedPayloads) {
    assert.throws(
      () => validateCommitStatusPayload(payload, CANDIDATE_SHA),
      AttestationVerificationError,
    );
  }
});

test('valida el entorno Staging protegido y falla cerrado ante cualquier relajación', () => {
  assert.deepEqual(validateStagingEnvironmentPayload(validEnvironment()), {
    name: 'Staging',
    preventSelfReview: true,
    reviewerIds: [219637213],
    customBranchPolicies: true,
  });
  for (const payload of [
    validEnvironment({ name: 'staging' }),
    validEnvironment({ protection_rules: [] }),
    validEnvironment({ protection_rules: [{
      type: 'required_reviewers',
      prevent_self_review: false,
      reviewers: [{ type: 'User', reviewer: { id: 1 } }],
    }] }),
    validEnvironment({ deployment_branch_policy: null }),
  ]) {
    assert.throws(() => validateStagingEnvironmentPayload(payload), /entorno Staging/i);
  }
  assert.deepEqual(
    validateDeploymentBranchPoliciesPayload(validBranchPolicies(), 'staging', 'Staging'),
    { environmentName: 'Staging', branches: ['staging'] },
  );
  for (const payload of [
    { total_count: 0, branch_policies: [] },
    validBranchPolicies('main'),
    { total_count: 1, branch_policies: [{ name: 'staging', type: 'tag' }] },
  ]) {
    assert.throws(
      () => validateDeploymentBranchPoliciesPayload(payload, 'staging', 'Staging'),
      /exclusivamente.*staging/i,
    );
  }
});

test('valida procedencia exacta de una ejecución terminal de staging', () => {
  assert.equal(validateActionsRunPayload(validRun(), {
    repository: REPOSITORY,
    candidateSha: CANDIDATE_SHA,
    context: 'release/staging-deployed',
    runId: RUN_ID,
    targetUrl: runUrl(),
  }).headSha, CANDIDATE_SHA);
  for (const payload of [
    validRun({ head_branch: 'feature/forge-status' }),
    validRun({ path: '.github/workflows/forged.yml' }),
    validRun({ head_sha: OTHER_SHA }),
    validRun({ conclusion: 'failure' }),
  ]) {
    assert.throws(() => validateActionsRunPayload(payload, {
      repository: REPOSITORY,
      candidateSha: CANDIDATE_SHA,
      context: 'release/staging-deployed',
      runId: RUN_ID,
      targetUrl: runUrl(),
    }), /Actions run/i);
  }
});

test('confirma que main es ancestro exacto de staging', () => {
  assert.deepEqual(validateAncestryPayload(validAncestry(), {
    mainSha: MAIN_SHA,
    candidateSha: CANDIDATE_SHA,
  }), {
    mainSha: MAIN_SHA,
    candidateSha: CANDIDATE_SHA,
    relation: 'ahead',
    commitsAhead: 2,
  });

  for (const override of [
    { status: 'behind', ahead_by: 0, behind_by: 2, total_commits: 0, commits: [] },
    { status: 'diverged', behind_by: 1 },
    { merge_base_commit: { sha: OTHER_SHA } },
    { commits: [{ sha: INTERMEDIATE_SHA }, { sha: OTHER_SHA }] },
    { total_commits: 3 },
  ]) {
    assert.throws(() => validateAncestryPayload(validAncestry(override), {
      mainSha: MAIN_SHA,
      candidateSha: CANDIDATE_SHA,
    }), AttestationVerificationError);
  }
});

test('verifyAttestations exige environment, statuses y una ejecución confiable', async () => {
  const requests = [];
  const result = await verifyAttestations({
    repository: REPOSITORY,
    candidateSha: CANDIDATE_SHA,
    token: 'test-token',
    statusCreatorLogin: RELEASE_STATUS_CREATOR_LOGIN,
    fetchFn: sequenceFetch([
      jsonResponse(validEnvironment()),
      jsonResponse(validBranchPolicies()),
      jsonResponse({ sha: MAIN_SHA }),
      jsonResponse(validStatuses()),
      jsonResponse(validRun()),
      jsonResponse(validAncestry()),
    ], requests),
  });

  assert.equal(result.repository, REPOSITORY);
  assert.equal(result.mainSha, MAIN_SHA);
  assert.equal(result.relation, 'ahead');
  assert.deepEqual(result.contexts, [...REQUIRED_STATUS_CONTEXTS]);
  assert.equal(result.runs.length, 2);
  assert.equal(new Set(result.runs.map(({ runId }) => runId)).size, 1);
  assert.equal(requests.length, 6, 'la misma Actions run se consulta una sola vez');
  assert.match(requests[0].url, /\/environments\/Staging$/);
  assert.match(requests[1].url, /deployment-branch-policies\?per_page=100$/);
  assert.match(requests[2].url, /\/commits\/main$/);
  assert.match(requests[3].url, new RegExp(`/commits/${CANDIDATE_SHA}/status\\?per_page=100$`));
  assert.match(requests[4].url, new RegExp(`/actions/runs/${RUN_ID}$`));
  assert.match(requests[5].url, new RegExp(`/compare/${MAIN_SHA}\\.\\.\\.${CANDIDATE_SHA}\\?per_page=100$`));
});

test('rechaza status no emitido por la GitHub App dedicada y ejecución de otra rama', async () => {
  const forgedCreator = validStatuses();
  forgedCreator.statuses[0] = releaseStatus('release/staging-deployed', {
    creator: { login: 'attacker', id: 99, type: 'User' },
  });
  await assert.rejects(verifyAttestations({
    repository: REPOSITORY,
    candidateSha: CANDIDATE_SHA,
    token: 'test-token',
    statusCreatorLogin: RELEASE_STATUS_CREATOR_LOGIN,
    fetchFn: sequenceFetch([
      jsonResponse(validEnvironment()),
      jsonResponse(validBranchPolicies()),
      jsonResponse({ sha: MAIN_SHA }),
      jsonResponse(forgedCreator),
    ]),
  }), /GitHub App de release dedicada/i);

  await assert.rejects(verifyAttestations({
    repository: REPOSITORY,
    candidateSha: CANDIDATE_SHA,
    token: 'test-token',
    statusCreatorLogin: RELEASE_STATUS_CREATOR_LOGIN,
    fetchFn: sequenceFetch([
      jsonResponse(validEnvironment()),
      jsonResponse(validBranchPolicies()),
      jsonResponse({ sha: MAIN_SHA }),
      jsonResponse(validStatuses()),
      jsonResponse(validRun({ head_branch: 'feature/forge-status' })),
    ]),
  }), /workflow, ref, SHA/i);
});

test('rechaza que deployed y validated procedan de ejecuciones distintas', async () => {
  const statuses = validStatuses();
  statuses.statuses[1] = releaseStatus('release/staging-validated', { runId: OTHER_RUN_ID });
  await assert.rejects(verifyAttestations({
    repository: REPOSITORY,
    candidateSha: CANDIDATE_SHA,
    token: 'test-token',
    statusCreatorLogin: RELEASE_STATUS_CREATOR_LOGIN,
    fetchFn: sequenceFetch([
      jsonResponse(validEnvironment()),
      jsonResponse(validBranchPolicies()),
      jsonResponse({ sha: MAIN_SHA }),
      jsonResponse(statuses),
      jsonResponse(validRun()),
      jsonResponse(validRun({ id: Number(OTHER_RUN_ID), html_url: runUrl(OTHER_RUN_ID) })),
    ]),
  }), /única ejecución protegida/i);
});

test('QA interna acepta deployed de la ejecución actual aún en progreso y omite main/compare', async () => {
  const requests = [];
  const result = await verifyAttestations({
    repository: REPOSITORY,
    candidateSha: CANDIDATE_SHA,
    token: 'test-token',
    statusCreatorLogin: RELEASE_STATUS_CREATOR_LOGIN,
    deployedOnly: true,
    currentRunId: RUN_ID,
    fetchFn: sequenceFetch([
      jsonResponse(validEnvironment()),
      jsonResponse(validBranchPolicies()),
      jsonResponse(deployedStatusPayload()),
      jsonResponse(validRun({ status: 'in_progress', conclusion: null })),
    ], requests),
  });
  assert.equal(result.mode, 'deployed-only');
  assert.deepEqual(result.contexts, ['release/staging-deployed']);
  assert.equal(requests.length, 4);
  assert.equal(requests.some(({ url }) => url.includes('/commits/main')), false);
  assert.equal(requests.some(({ url }) => url.includes('/compare/')), false);
});

test('QA interna exige run actual exacta, staging-deployed y SHA candidato', async () => {
  await assert.rejects(verifyAttestations({
    repository: REPOSITORY,
    candidateSha: CANDIDATE_SHA,
    token: 'test-token',
    statusCreatorLogin: RELEASE_STATUS_CREATOR_LOGIN,
    deployedOnly: true,
    currentRunId: OTHER_RUN_ID,
    fetchFn: sequenceFetch([
      jsonResponse(validEnvironment()),
      jsonResponse(validBranchPolicies()),
      jsonResponse(deployedStatusPayload()),
    ]),
  }), /ejecución QA actual/i);

  const validatedOnly = deployedStatusPayload({
    statuses: [releaseStatus('release/staging-validated')],
  });
  await assert.rejects(verifyAttestations({
    repository: REPOSITORY,
    candidateSha: CANDIDATE_SHA,
    token: 'test-token',
    statusCreatorLogin: RELEASE_STATUS_CREATOR_LOGIN,
    deployedOnly: true,
    currentRunId: RUN_ID,
    fetchFn: sequenceFetch([
      jsonResponse(validEnvironment()),
      jsonResponse(validBranchPolicies()),
      jsonResponse(validatedOnly),
    ]),
  }), /release\/staging-deployed/);

  await assert.rejects(verifyAttestations({
    repository: REPOSITORY,
    candidateSha: CANDIDATE_SHA,
    token: 'test-token',
    statusCreatorLogin: RELEASE_STATUS_CREATOR_LOGIN,
    deployedOnly: true,
    currentRunId: RUN_ID,
    fetchFn: sequenceFetch([
      jsonResponse(validEnvironment()),
      jsonResponse(validBranchPolicies()),
      jsonResponse(deployedStatusPayload({ sha: OTHER_SHA })),
    ]),
  }), /SHA.*candidato/i);
});

test('falla cerrado ante red, HTTP o entradas inválidas sin filtrar secretos', async () => {
  await assert.rejects(verifyAttestations({
    repository: REPOSITORY,
    candidateSha: CANDIDATE_SHA,
    token: 'test-token',
    statusCreatorLogin: RELEASE_STATUS_CREATOR_LOGIN,
    fetchFn: async () => { throw new Error('network token=SECRET_VALUE'); },
  }), (error) => {
    assert.match(error.message, /red.*GitHub/i);
    assert.doesNotMatch(error.message, /SECRET_VALUE/);
    return true;
  });

  for (const response of [
    jsonResponse({}, 403),
    { ...jsonResponse({}), json: async () => { throw new SyntaxError('SECRET_VALUE'); } },
  ]) {
    await assert.rejects(verifyAttestations({
      repository: REPOSITORY,
      candidateSha: CANDIDATE_SHA,
      token: 'test-token',
      statusCreatorLogin: RELEASE_STATUS_CREATOR_LOGIN,
      fetchFn: async () => response,
    }), (error) => {
      assert.doesNotMatch(error.message, /SECRET_VALUE/);
      return true;
    });
  }

  const neverFetch = async () => assert.fail('fetch no debe ejecutarse');
  for (const options of [
    { repository: 'invalid', candidateSha: CANDIDATE_SHA, token: 'x' },
    { repository: 'owner/repo', candidateSha: CANDIDATE_SHA.slice(0, 12), token: 'x' },
    { repository: 'owner/repo', candidateSha: CANDIDATE_SHA, token: '' },
    { repository: 'owner/repo', candidateSha: CANDIDATE_SHA, token: 'x', apiBaseUrl: 'http://api.github.com' },
    { repository: 'owner/repo', candidateSha: CANDIDATE_SHA, token: 'x', deployedOnly: true },
  ]) {
    await assert.rejects(
      verifyAttestations({ ...options, fetchFn: neverFetch }),
      AttestationVerificationError,
    );
  }
});

test('CLI normal valida y solo imprime un resumen sin token ni payloads', async () => {
  const output = [];
  const errors = [];
  const exitCode = await runVerifyAttestationsCli({
    argv: ['--sha', CANDIDATE_SHA, '--repository', REPOSITORY],
    env: {
      GITHUB_TOKEN: 'DO_NOT_PRINT',
      RELEASE_STATUS_CREATOR_LOGIN,
    },
    fetchFn: sequenceFetch([
      jsonResponse(validEnvironment({ secret: 'DO_NOT_PRINT' })),
      jsonResponse(validBranchPolicies()),
      jsonResponse({ sha: MAIN_SHA, secret: 'DO_NOT_PRINT' }),
      jsonResponse(validStatuses({ secret: 'DO_NOT_PRINT' })),
      jsonResponse(validRun({ secret: 'DO_NOT_PRINT' })),
      jsonResponse(validAncestry({ secret: 'DO_NOT_PRINT' })),
    ]),
    stdout: { write: (value) => output.push(value) },
    stderr: { write: (value) => errors.push(value) },
  });
  assert.equal(exitCode, 0);
  assert.match(output.join(''), /attestations.*validadas/i);
  assert.doesNotMatch(output.join(''), /DO_NOT_PRINT/);
  assert.equal(errors.length, 0);
});

test('CLI QA de staging valida solo desde el workflow/ref/run exactos', async () => {
  const output = [];
  const env = {
    GITHUB_TOKEN: 'test-token',
    RELEASE_STATUS_CREATOR_LOGIN,
    GITHUB_REF: 'refs/heads/staging',
    GITHUB_SHA: CANDIDATE_SHA,
    GITHUB_RUN_ID: RUN_ID,
    GITHUB_WORKFLOW_REF: `${REPOSITORY}/.github/workflows/staging-deploy-verify.yml@refs/heads/staging`,
    RELEASE_ATTESTATION_CONTEXT: 'staging-push-qa',
  };
  const exitCode = await runVerifyAttestationsCli({
    argv: [
      '--sha', CANDIDATE_SHA,
      '--repository', REPOSITORY,
      '--staging-push-qa-current-run',
    ],
    env,
    fetchFn: sequenceFetch([
      jsonResponse(validEnvironment()),
      jsonResponse(validBranchPolicies()),
      jsonResponse(deployedStatusPayload()),
      jsonResponse(validRun({ status: 'in_progress', conclusion: null })),
    ]),
    stdout: { write: (value) => output.push(value) },
    stderr: { write: () => assert.fail('no debe escribir error') },
  });
  assert.equal(exitCode, 0);
  assert.match(output.join(''), /staging-deployed.*validada/i);
});

test('CLI QA falla antes de fetch si guard, ref, SHA, workflow o run no son exactos', async () => {
  const baseEnv = {
    GITHUB_TOKEN: 'test-token',
    RELEASE_STATUS_CREATOR_LOGIN,
    GITHUB_REF: 'refs/heads/staging',
    GITHUB_SHA: CANDIDATE_SHA,
    GITHUB_RUN_ID: RUN_ID,
    GITHUB_WORKFLOW_REF: `${REPOSITORY}/.github/workflows/staging-deploy-verify.yml@refs/heads/staging`,
    RELEASE_ATTESTATION_CONTEXT: 'staging-push-qa',
  };
  const cases = [
    { RELEASE_ATTESTATION_CONTEXT: 'staging-qa-attest' },
    { GITHUB_REF: 'refs/heads/feature/forged' },
    { GITHUB_SHA: OTHER_SHA },
    { GITHUB_WORKFLOW_REF: `${REPOSITORY}/.github/workflows/forged.yml@refs/heads/staging` },
    { GITHUB_RUN_ID: 'invalid' },
  ];
  for (const override of cases) {
    let requests = 0;
    const errors = [];
    const exitCode = await runVerifyAttestationsCli({
      argv: [
        '--sha', CANDIDATE_SHA,
        '--repository', REPOSITORY,
        '--staging-push-qa-current-run',
      ],
      env: { ...baseEnv, ...override },
      fetchFn: async () => {
        requests += 1;
        return jsonResponse(validEnvironment());
      },
      stdout: { write: () => assert.fail('no debe escribir éxito') },
      stderr: { write: (value) => errors.push(value) },
    });
    assert.equal(exitCode, 1);
    assert.equal(requests, 0);
    assert.match(errors.join(''), /DENEGADAS/);
  }
});

test('CLI rechaza el antiguo --deployed-only antes de fetch', async () => {
  let requests = 0;
  const errors = [];
  const exitCode = await runVerifyAttestationsCli({
    argv: ['--sha', CANDIDATE_SHA, '--repository', REPOSITORY, '--deployed-only'],
    env: { GITHUB_TOKEN: 'test-token', RELEASE_STATUS_CREATOR_LOGIN },
    fetchFn: async () => {
      requests += 1;
      return jsonResponse(validEnvironment());
    },
    stdout: { write: () => assert.fail('no debe escribir éxito') },
    stderr: { write: (value) => errors.push(value) },
  });
  assert.equal(exitCode, 1);
  assert.equal(requests, 0);
  assert.match(errors.join(''), /argumento no reconocido.*--deployed-only/i);
});
