import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CI_CONTEXT_PLACEHOLDER,
  RELEASE_GUARDS_CONFIRMATION,
  buildReleaseGuardPlan,
} from './release-guards.config.mjs';
import {
  applyReleaseGuardPlan,
  runConfigureBranchProtectionCli,
} from './configure-branch-protection.mjs';

const REPOSITORY = 'fgomezserna/cukies-hub';
const CANDIDATE_SHA = '0123456789abcdef0123456789abcdef01234567';
const MAIN_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_SHA = '89abcdef0123456789abcdef0123456789abcdef';
const INTERMEDIATE_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const WORKFLOW_BLOB_SHA = 'cccccccccccccccccccccccccccccccccccccccc';
const RUN_ID = '123456789';
const RUN_URL = `https://github.com/${REPOSITORY}/actions/runs/${RUN_ID}`;
const RELEASE_APP_ID = 424242;
const RELEASE_APP_SLUG = 'cukies-release-guard';
const RELEASE_CREATOR = Object.freeze({
  login: `${RELEASE_APP_SLUG}[bot]`,
  id: 9001,
  type: 'Bot',
});

function jsonResponse(payload, status = 200) {
  return {
    status,
    headers: { get: () => 'application/json' },
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

function validEnvironment(name = 'Staging', overrides = {}) {
  return {
    name,
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

function validBranchPolicies(branch) {
  return {
    total_count: 1,
    branch_policies: [{ id: 7, name: branch, type: 'branch' }],
  };
}

function statusPayload(overrides = {}) {
  return {
    state: 'success',
    sha: CANDIDATE_SHA,
    total_count: 2,
    statuses: ['release/staging-deployed', 'release/staging-validated'].map((context) => ({
      context,
      state: 'success',
      sha: CANDIDATE_SHA,
      creator: RELEASE_CREATOR,
      target_url: RUN_URL,
    })),
    ...overrides,
  };
}

function actionsRunPayload(overrides = {}) {
  return {
    id: Number(RUN_ID),
    html_url: RUN_URL,
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

function ancestryPayload() {
  return {
    status: 'ahead',
    ahead_by: 2,
    behind_by: 0,
    total_commits: 2,
    base_commit: { sha: MAIN_SHA },
    merge_base_commit: { sha: MAIN_SHA },
    commits: [{ sha: INTERMEDIATE_SHA }, { sha: CANDIDATE_SHA }],
  };
}

function branchPayload(name, sha) {
  return { name, commit: { sha } };
}

function protectionPayload({ checks = [], legacyContexts = [] } = {}) {
  if (checks.length === 0 && legacyContexts.length === 0) {
    return { required_status_checks: null };
  }
  return {
    required_status_checks: {
      contexts: [...legacyContexts, ...checks.map(({ context }) => context)],
      checks: checks.map((check) => ({ ...check })),
    },
  };
}

function branchPreflightResponses({
  mainProtection = protectionPayload(),
  stagingProtection = protectionPayload(),
} = {}) {
  return [
    jsonResponse(branchPayload('main', MAIN_SHA)),
    jsonResponse(mainProtection),
    jsonResponse(branchPayload('staging', CANDIDATE_SHA)),
    jsonResponse(stagingProtection),
  ];
}

function successfulCheckRuns({
  name = 'CI Quality / Required',
  appId = RELEASE_APP_ID,
  sha = MAIN_SHA,
  conclusion = 'success',
  extra = [],
} = {}) {
  const checkRuns = [{
    id: 9001,
    name,
    head_sha: sha,
    status: 'completed',
    conclusion,
    app: { id: appId, slug: appId === RELEASE_APP_ID ? RELEASE_APP_SLUG : 'github-actions' },
  }, ...extra];
  return { total_count: checkRuns.length, check_runs: checkRuns };
}

function releaseApp(overrides = {}) {
  return {
    id: RELEASE_APP_ID,
    slug: RELEASE_APP_SLUG,
    name: 'Cukies Release Guard',
    ...overrides,
  };
}

function releaseAppOptions() {
  return { releaseAppId: RELEASE_APP_ID, releaseAppSlug: RELEASE_APP_SLUG };
}

test('los planes mantienen main lineal y permiten merge commits de sync en staging', () => {
  const lock = buildReleaseGuardPlan({ phase: 'bootstrap-lock' });
  const attested = buildReleaseGuardPlan({
    phase: 'bootstrap-attested',
    releaseAppId: RELEASE_APP_ID,
    ciRequirement: {
      kind: 'check',
      context: 'CI Quality / Required',
      appId: RELEASE_APP_ID,
    },
  });
  const steady = buildReleaseGuardPlan({
    phase: 'steady-state',
    releaseAppId: RELEASE_APP_ID,
  });

  assert.equal(lock.branches.main.required_status_checks, null);
  assert.deepEqual(attested.branches.main.required_status_checks.checks, [
    { context: 'release/staging-deployed', app_id: RELEASE_APP_ID },
    { context: 'release/staging-validated', app_id: RELEASE_APP_ID },
  ]);
  assert.deepEqual(attested.branches.staging.required_status_checks.checks, [
    { context: 'CI Quality / Required', app_id: RELEASE_APP_ID },
  ]);
  assert.deepEqual(steady.branches.main.required_status_checks.contexts, [CI_CONTEXT_PLACEHOLDER]);
  assert.deepEqual(steady.branches.main.required_status_checks.checks, [
    { context: 'release/promotion-gate', app_id: RELEASE_APP_ID },
  ]);
  assert.equal(lock.branches.main.lock_branch, true);
  assert.equal(lock.branches.staging.lock_branch, false);
  assert.equal(attested.branches.main.lock_branch, false);
  assert.equal(steady.branches.main.lock_branch, false);
  for (const plan of [lock, attested, steady]) {
    for (const branch of ['main', 'staging']) {
      const protection = plan.branches[branch];
      assert.equal(protection.enforce_admins, true);
      assert.equal(protection.required_pull_request_reviews.required_approving_review_count, 1);
      assert.equal(protection.required_pull_request_reviews.require_code_owner_reviews, true);
      assert.equal(protection.required_pull_request_reviews.require_last_push_approval, true);
      assert.equal(protection.required_linear_history, branch === 'main');
      assert.equal(protection.allow_force_pushes, false);
      assert.equal(protection.allow_deletions, false);
      if (protection.required_status_checks) {
        assert.equal(protection.required_status_checks.strict, true);
      }
    }
  }
});

test('rechaza usar la identidad global de GitHub Actions para contextos release', () => {
  for (const releaseAppId of [undefined, 0, 15368]) {
    assert.throws(
      () => buildReleaseGuardPlan({ phase: 'steady-state', releaseAppId }),
      /dedicated GitHub App/i,
    );
  }
});

test('preserva checks ajenos con app_id exacto sin degradarlos a contexts legacy', () => {
  const plan = buildReleaseGuardPlan({
    phase: 'steady-state',
    releaseAppId: RELEASE_APP_ID,
    ciRequirement: { kind: 'check', context: 'CI Quality / Required', appId: RELEASE_APP_ID },
    existingContexts: {
      main: {
        contexts: ['legacy/security', 'release/staging-deployed'],
        checks: [
          { context: 'ci/security', app_id: 4242 },
          { context: 'ci/legacy-any-app', app_id: null },
        ],
      },
      staging: {
        contexts: [],
        checks: [{ context: 'ci/staging', app_id: 5252 }],
      },
    },
  });
  assert.deepEqual(plan.branches.main.required_status_checks.contexts, [
    'legacy/security',
    'ci/legacy-any-app',
  ]);
  assert.deepEqual(plan.branches.main.required_status_checks.checks, [
    { context: 'ci/security', app_id: 4242 },
    { context: 'release/promotion-gate', app_id: RELEASE_APP_ID },
    { context: 'CI Quality / Required', app_id: RELEASE_APP_ID },
  ]);
  assert.deepEqual(plan.branches.staging.required_status_checks.checks, [
    { context: 'ci/staging', app_id: 5252 },
    { context: 'CI Quality / Required', app_id: RELEASE_APP_ID },
  ]);
});

test('CLI es dry-run bootstrap-lock por defecto y no llama fetch ni requiere token', async () => {
  const output = [];
  const exitCode = await runConfigureBranchProtectionCli({
    argv: [],
    env: {},
    fetchFn: async () => assert.fail('dry-run must not call fetch'),
    stdout: { write: (value) => output.push(value) },
    stderr: { write: () => assert.fail('dry-run must not write stderr') },
  });
  assert.equal(exitCode, 0);
  assert.match(output.join(''), /DRY-RUN: no GitHub settings were changed/);
  assert.match(output.join(''), /bootstrap-lock/);
});

test('dry-run de fases con statuses exige identidad App dedicada explícita', async () => {
  for (const argv of [
    ['--phase', 'bootstrap-attested'],
    [
      '--phase', 'steady-state',
      '--release-app-id', String(RELEASE_APP_ID),
      '--release-app-slug', RELEASE_APP_SLUG,
    ],
    ['--phase', 'steady-state', '--release-app-id', '15368', '--release-app-slug', 'github-actions'],
  ]) {
    const errors = [];
    const exitCode = await runConfigureBranchProtectionCli({
      argv,
      env: {},
      fetchFn: async () => assert.fail('dry-run denied must not call fetch'),
      stdout: { write: () => assert.fail('denied dry-run must not report success') },
      stderr: { write: (value) => errors.push(value) },
    });
    assert.equal(exitCode, 1);
    assert.match(errors.join(''), /release-app|GitHub Actions|CI context/i);
  }

  const output = [];
  const exitCode = await runConfigureBranchProtectionCli({
    argv: [
      '--phase', 'bootstrap-attested',
      '--release-app-id', String(RELEASE_APP_ID),
      '--release-app-slug', RELEASE_APP_SLUG,
      '--ci-context', 'CI Quality / Required',
    ],
    env: {},
    fetchFn: async () => assert.fail('dry-run must not call fetch'),
    stdout: { write: (value) => output.push(value) },
    stderr: { write: () => assert.fail('valid dry-run must not write stderr') },
  });
  assert.equal(exitCode, 0);
  assert.match(output.join(''), new RegExp(String(RELEASE_APP_ID)));
  const attestedPlan = JSON.parse(output.join('').split('\n').slice(1).join('\n'));
  assert.deepEqual(attestedPlan.branches.staging.required_status_checks.checks, [
    { context: 'CI Quality / Required', app_id: RELEASE_APP_ID },
  ]);

  const steadyOutput = [];
  const steadyExitCode = await runConfigureBranchProtectionCli({
    argv: [
      '--phase', 'steady-state',
      '--release-app-id', String(RELEASE_APP_ID),
      '--release-app-slug', RELEASE_APP_SLUG,
      '--ci-context', 'CI Quality / Required',
    ],
    env: {},
    fetchFn: async () => assert.fail('dry-run must not call fetch'),
    stdout: { write: (value) => steadyOutput.push(value) },
    stderr: { write: () => assert.fail('valid dry-run must not write stderr') },
  });
  const steadyPlan = JSON.parse(steadyOutput.join('').split('\n').slice(1).join('\n'));
  assert.equal(steadyExitCode, 0);
  assert.deepEqual(steadyPlan.branches.main.required_status_checks.checks, [
    { context: 'release/promotion-gate', app_id: RELEASE_APP_ID },
    { context: 'CI Quality / Required', app_id: RELEASE_APP_ID },
  ]);
  assert.deepEqual(steadyPlan.branches.staging.required_status_checks.checks, [
    { context: 'CI Quality / Required', app_id: RELEASE_APP_ID },
  ]);
  assert.doesNotMatch(steadyOutput.join(''), new RegExp(CI_CONTEXT_PLACEHOLDER));
});

test('cualquier --apply sin confirmación literal falla antes de fetch', async () => {
  for (const argv of [
    ['--apply'],
    ['--apply', '--confirm', 'yes'],
    ['--apply', '--confirm', `${RELEASE_GUARDS_CONFIRMATION} `],
  ]) {
    let fetchCalls = 0;
    const errors = [];
    const exitCode = await runConfigureBranchProtectionCli({
      argv,
      env: { GITHUB_TOKEN: 'test-token' },
      fetchFn: async () => {
        fetchCalls += 1;
        return jsonResponse({});
      },
      stdout: { write: () => assert.fail('denied apply must not report success') },
      stderr: { write: (value) => errors.push(value) },
    });
    assert.equal(exitCode, 1);
    assert.equal(fetchCalls, 0);
    assert.match(errors.join(''), /DENIED/);
  }
});

test('bootstrap-lock bloquea y aplica primero main, después staging, sin exigir statuses', async () => {
  const requests = [];
  const plan = await applyReleaseGuardPlan({
    phase: 'bootstrap-lock',
    repository: REPOSITORY,
    confirmation: RELEASE_GUARDS_CONFIRMATION,
    token: 'test-token',
    apiBaseUrl: 'https://api.github.test',
    fetchFn: sequenceFetch([
      ...branchPreflightResponses(),
      jsonResponse({ url: 'protected-main' }),
      jsonResponse({ url: 'protected-staging' }),
    ], requests),
  });
  assert.deepEqual(requests.map(({ options }) => options.method), [
    'GET', 'GET', 'GET', 'GET', 'PUT', 'PUT',
  ]);
  assert.match(requests[4].url, /branches\/main\/protection$/);
  assert.match(requests[5].url, /branches\/staging\/protection$/);
  assert.equal(plan.branches.main.required_status_checks, null);
  assert.equal(plan.branches.main.lock_branch, true);
});

test('bootstrap-lock conserva app_id positivo y convierte app_id null en legacy context', async () => {
  const requests = [];
  const mainProtection = protectionPayload({
    checks: [
      { context: 'ci/security', app_id: 4242 },
      { context: 'ci/legacy-any-app', app_id: null },
    ],
  });
  await applyReleaseGuardPlan({
    phase: 'bootstrap-lock',
    repository: REPOSITORY,
    confirmation: RELEASE_GUARDS_CONFIRMATION,
    token: 'test-token',
    apiBaseUrl: 'https://api.github.test',
    fetchFn: sequenceFetch([
      ...branchPreflightResponses({ mainProtection }),
      jsonResponse({ url: 'protected-main' }),
      jsonResponse({ url: 'protected-staging' }),
    ], requests),
  });
  const mainBody = JSON.parse(requests[4].options.body);
  assert.deepEqual(mainBody.required_status_checks.contexts, ['ci/legacy-any-app']);
  assert.deepEqual(mainBody.required_status_checks.checks, [
    { context: 'ci/security', app_id: 4242 },
  ]);
});

test('bootstrap-attested valida App dedicada, candidato, entorno, procedencia y ancestry', async () => {
  const requests = [];
  const plan = await applyReleaseGuardPlan({
    phase: 'bootstrap-attested',
    repository: REPOSITORY,
    candidateSha: CANDIDATE_SHA,
    ciContext: 'CI Quality / Required',
    ...releaseAppOptions(),
    confirmation: RELEASE_GUARDS_CONFIRMATION,
    token: 'test-token',
    apiBaseUrl: 'https://api.github.test',
    fetchFn: sequenceFetch([
      ...branchPreflightResponses(),
      jsonResponse(releaseApp()),
      jsonResponse(validEnvironment()),
      jsonResponse(validBranchPolicies('staging')),
      jsonResponse({ sha: MAIN_SHA }),
      jsonResponse(statusPayload()),
      jsonResponse(actionsRunPayload()),
      jsonResponse(ancestryPayload()),
      jsonResponse(successfulCheckRuns({ sha: CANDIDATE_SHA })),
      jsonResponse({ url: 'protected-main' }),
      jsonResponse({ url: 'protected-staging' }),
    ], requests),
  });
  assert.equal(requests.length, 14);
  assert.match(requests[4].url, new RegExp(`/apps/${RELEASE_APP_SLUG}$`));
  assert.match(requests[10].url, new RegExp(`/compare/${MAIN_SHA}\\.\\.\\.${CANDIDATE_SHA}\\?per_page=100$`));
  assert.match(requests[11].url, new RegExp(`/commits/${CANDIDATE_SHA}/check-runs`));
  assert.match(requests[12].url, /branches\/main\/protection$/);
  assert.match(requests[13].url, /branches\/staging\/protection$/);
  assert.deepEqual(JSON.parse(requests[12].options.body).required_status_checks.checks, [
    { context: 'release/staging-deployed', app_id: RELEASE_APP_ID },
    { context: 'release/staging-validated', app_id: RELEASE_APP_ID },
  ]);
  assert.deepEqual(JSON.parse(requests[13].options.body).required_status_checks.checks, [
    { context: 'CI Quality / Required', app_id: RELEASE_APP_ID },
  ]);
  assert.equal(plan.phase, 'bootstrap-attested');
});

test('bootstrap-attested falla sin mutar para candidato o App incorrectos', async () => {
  const wrongCandidateRequests = [];
  await assert.rejects(applyReleaseGuardPlan({
    phase: 'bootstrap-attested',
    repository: REPOSITORY,
    candidateSha: OTHER_SHA,
    ciContext: 'CI Quality / Required',
    ...releaseAppOptions(),
    confirmation: RELEASE_GUARDS_CONFIRMATION,
    token: 'test-token',
    apiBaseUrl: 'https://api.github.test',
    fetchFn: sequenceFetch(branchPreflightResponses(), wrongCandidateRequests),
  }), /currently resolved for staging/i);
  assert.equal(wrongCandidateRequests.some(({ options }) => options.method === 'PUT'), false);

  const wrongAppRequests = [];
  await assert.rejects(applyReleaseGuardPlan({
    phase: 'bootstrap-attested',
    repository: REPOSITORY,
    candidateSha: CANDIDATE_SHA,
    ciContext: 'CI Quality / Required',
    ...releaseAppOptions(),
    confirmation: RELEASE_GUARDS_CONFIRMATION,
    token: 'test-token',
    apiBaseUrl: 'https://api.github.test',
    fetchFn: sequenceFetch([
      ...branchPreflightResponses(),
      jsonResponse(releaseApp({ id: 999999 })),
    ], wrongAppRequests),
  }), /dedicated release GitHub App/i);
  assert.equal(wrongAppRequests.some(({ options }) => options.method === 'PUT'), false);

  const wrongCiRequests = [];
  await assert.rejects(applyReleaseGuardPlan({
    phase: 'bootstrap-attested',
    repository: REPOSITORY,
    candidateSha: CANDIDATE_SHA,
    ciContext: 'CI Quality / Required',
    ...releaseAppOptions(),
    confirmation: RELEASE_GUARDS_CONFIRMATION,
    token: 'test-token',
    apiBaseUrl: 'https://api.github.test',
    fetchFn: sequenceFetch([
      ...branchPreflightResponses(),
      jsonResponse(releaseApp()),
      jsonResponse(validEnvironment()),
      jsonResponse(validBranchPolicies('staging')),
      jsonResponse({ sha: MAIN_SHA }),
      jsonResponse(statusPayload()),
      jsonResponse(actionsRunPayload()),
      jsonResponse(ancestryPayload()),
      jsonResponse(successfulCheckRuns({ sha: CANDIDATE_SHA, appId: 15368 })),
    ], wrongCiRequests),
  }), /staging CI check.*dedicated release GitHub App/i);
  assert.equal(wrongCiRequests.some(({ options }) => options.method === 'PUT'), false);
});

test('bootstrap-attested exige el contexto CI antes de consultar o mutar GitHub', async () => {
  let fetchCalls = 0;
  await assert.rejects(applyReleaseGuardPlan({
    phase: 'bootstrap-attested',
    repository: REPOSITORY,
    candidateSha: CANDIDATE_SHA,
    ...releaseAppOptions(),
    confirmation: RELEASE_GUARDS_CONFIRMATION,
    token: 'test-token',
    apiBaseUrl: 'https://api.github.test',
    fetchFn: async () => {
      fetchCalls += 1;
      return jsonResponse({});
    },
  }), /CI context/i);
  assert.equal(fetchCalls, 0);
});

test('steady-state exige SHA actual, CI e identidad release antes de configurar', async () => {
  for (const ciContext of [undefined, '', CI_CONTEXT_PLACEHOLDER, 'release/promotion-gate']) {
    let fetchCalls = 0;
    await assert.rejects(applyReleaseGuardPlan({
      phase: 'steady-state',
      repository: REPOSITORY,
      candidateSha: MAIN_SHA,
      ciContext,
      ...releaseAppOptions(),
      confirmation: RELEASE_GUARDS_CONFIRMATION,
      token: 'test-token',
      apiBaseUrl: 'https://api.github.test',
      fetchFn: async () => {
        fetchCalls += 1;
        return jsonResponse({});
      },
    }), /CI context/i);
    assert.equal(fetchCalls, 0);
  }

  const requests = [];
  await assert.rejects(applyReleaseGuardPlan({
    phase: 'steady-state',
    repository: REPOSITORY,
    candidateSha: OTHER_SHA,
    ciContext: 'CI Quality / Required',
    ...releaseAppOptions(),
    confirmation: RELEASE_GUARDS_CONFIRMATION,
    token: 'test-token',
    apiBaseUrl: 'https://api.github.test',
    fetchFn: sequenceFetch(branchPreflightResponses(), requests),
  }), /currently resolved for main/i);
  assert.equal(requests.some(({ options }) => options.method === 'PUT'), false);
});

test('steady-state valida workflow, ambos entornos y check verde antes de PUT', async () => {
  const requests = [];
  const mainProtection = protectionPayload({ checks: [{ context: 'ci/security', app_id: 4242 }] });
  const stagingProtection = protectionPayload({ checks: [{ context: 'ci/staging', app_id: 5252 }] });
  const plan = await applyReleaseGuardPlan({
    phase: 'steady-state',
    repository: REPOSITORY,
    candidateSha: MAIN_SHA,
    ciContext: 'CI Quality / Required',
    ...releaseAppOptions(),
    confirmation: RELEASE_GUARDS_CONFIRMATION,
    token: 'test-token',
    apiBaseUrl: 'https://api.github.test',
    fetchFn: sequenceFetch([
      ...branchPreflightResponses({ mainProtection, stagingProtection }),
      jsonResponse(releaseApp()),
      jsonResponse({
        type: 'file',
        path: '.github/workflows/main-promotion-gate.yml',
        sha: WORKFLOW_BLOB_SHA,
      }),
      jsonResponse(validEnvironment('Staging')),
      jsonResponse(validBranchPolicies('staging')),
      jsonResponse(validEnvironment('Release Gate')),
      jsonResponse(validBranchPolicies('main')),
      jsonResponse(successfulCheckRuns()),
      jsonResponse(successfulCheckRuns({ sha: CANDIDATE_SHA })),
      jsonResponse({ url: 'protected-main' }),
      jsonResponse({ url: 'protected-staging' }),
    ], requests),
  });
  assert.equal(requests.length, 14);
  assert.match(requests[5].url, /main-promotion-gate\.yml\?ref=main$/);
  assert.match(requests[6].url, /environments\/Staging$/);
  assert.match(requests[7].url, /deployment-branch-policies\?per_page=100$/);
  assert.match(requests[8].url, /environments\/Release%20Gate$/);
  assert.match(requests[9].url, /deployment-branch-policies\?per_page=100$/);
  assert.match(requests[10].url, new RegExp(`/commits/${MAIN_SHA}/check-runs\\?`));
  assert.match(requests[11].url, new RegExp(`/commits/${CANDIDATE_SHA}/check-runs\\?`));
  assert.deepEqual(plan.branches.main.required_status_checks.checks, [
    { context: 'ci/security', app_id: 4242 },
    { context: 'release/promotion-gate', app_id: RELEASE_APP_ID },
    { context: 'CI Quality / Required', app_id: RELEASE_APP_ID },
  ]);
  assert.deepEqual(plan.branches.staging.required_status_checks.checks, [
    { context: 'ci/staging', app_id: 5252 },
    { context: 'CI Quality / Required', app_id: RELEASE_APP_ID },
  ]);
});

test('steady-state rechaza CI de staging emitido por otra App sin hacer PUT', async () => {
  const requests = [];
  await assert.rejects(applyReleaseGuardPlan({
    phase: 'steady-state',
    repository: REPOSITORY,
    candidateSha: MAIN_SHA,
    ciContext: 'CI Quality / Required',
    ...releaseAppOptions(),
    confirmation: RELEASE_GUARDS_CONFIRMATION,
    token: 'test-token',
    apiBaseUrl: 'https://api.github.test',
    fetchFn: sequenceFetch([
      ...branchPreflightResponses(),
      jsonResponse(releaseApp()),
      jsonResponse({
        type: 'file',
        path: '.github/workflows/main-promotion-gate.yml',
        sha: WORKFLOW_BLOB_SHA,
      }),
      jsonResponse(validEnvironment('Staging')),
      jsonResponse(validBranchPolicies('staging')),
      jsonResponse(validEnvironment('Release Gate')),
      jsonResponse(validBranchPolicies('main')),
      jsonResponse(successfulCheckRuns()),
      jsonResponse(successfulCheckRuns({ sha: CANDIDATE_SHA, appId: 15368 })),
    ], requests),
  }), /main and staging.*dedicated release GitHub App/i);
  assert.equal(requests.some(({ options }) => options.method === 'PUT'), false);
});

test('steady-state rechaza environment relajado o CI ambiguo sin hacer PUT', async () => {
  const cases = [
    {
      staging: validEnvironment('Staging'),
      releaseGate: validEnvironment('Release Gate', { protection_rules: [] }),
      checks: successfulCheckRuns(),
    },
    {
      staging: validEnvironment('Staging'),
      releaseGate: validEnvironment('Release Gate'),
      checks: successfulCheckRuns({
        extra: [{
          id: 9002,
          name: 'CI Quality / Required',
          head_sha: MAIN_SHA,
          status: 'completed',
          conclusion: 'success',
          app: { id: 99999, slug: 'forged-ci' },
        }],
      }),
    },
    {
      staging: validEnvironment('Staging'),
      releaseGate: validEnvironment('Release Gate'),
      checks: successfulCheckRuns({ appId: 15368 }),
    },
  ];
  for (const testCase of cases) {
    const requests = [];
    await assert.rejects(applyReleaseGuardPlan({
      phase: 'steady-state',
      repository: REPOSITORY,
      candidateSha: MAIN_SHA,
      ciContext: 'CI Quality / Required',
      ...releaseAppOptions(),
      confirmation: RELEASE_GUARDS_CONFIRMATION,
      token: 'test-token',
      apiBaseUrl: 'https://api.github.test',
      fetchFn: sequenceFetch([
        ...branchPreflightResponses(),
        jsonResponse(releaseApp()),
        jsonResponse({
          type: 'file',
          path: '.github/workflows/main-promotion-gate.yml',
          sha: WORKFLOW_BLOB_SHA,
        }),
        jsonResponse(testCase.staging),
        jsonResponse(validBranchPolicies('staging')),
        jsonResponse(testCase.releaseGate),
        ...(testCase.releaseGate.protection_rules.length === 0
          ? []
          : [
              jsonResponse(validBranchPolicies('main')),
              jsonResponse(testCase.checks),
            ]),
      ], requests),
    }));
    assert.equal(requests.some(({ options }) => options.method === 'PUT'), false);
  }
});

test('steady-state falla sin mutar si el workflow no existe todavía en main', async () => {
  const requests = [];
  await assert.rejects(applyReleaseGuardPlan({
    phase: 'steady-state',
    repository: REPOSITORY,
    candidateSha: MAIN_SHA,
    ciContext: 'CI Quality / Required',
    ...releaseAppOptions(),
    confirmation: RELEASE_GUARDS_CONFIRMATION,
    token: 'test-token',
    apiBaseUrl: 'https://api.github.test',
    fetchFn: sequenceFetch([
      ...branchPreflightResponses(),
      jsonResponse(releaseApp()),
      jsonResponse({ message: 'Not Found' }, 404),
    ], requests),
  }), /preflight/i);
  assert.equal(requests.some(({ options }) => options.method === 'PUT'), false);
});

test('si falla el segundo PUT main ya queda protegido aunque staging siga pendiente', async () => {
  const putUrls = [];
  const responses = [
    ...branchPreflightResponses(),
    jsonResponse({ url: 'protected-main' }),
    jsonResponse({ message: 'denied' }, 500),
  ];
  await assert.rejects(applyReleaseGuardPlan({
    phase: 'bootstrap-lock',
    repository: REPOSITORY,
    confirmation: RELEASE_GUARDS_CONFIRMATION,
    token: 'test-token',
    apiBaseUrl: 'https://api.github.test',
    fetchFn: async (url, options) => {
      if (options.method === 'PUT') putUrls.push(url);
      return responses.shift();
    },
  }), /staging.*HTTP 500/i);
  assert.match(putUrls[0], /branches\/main\/protection$/);
  assert.match(putUrls[1], /branches\/staging\/protection$/);
});
