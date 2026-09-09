import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SYNC_WORKFLOW_URL = new URL('../../.github/workflows/main-staging-sync.yml', import.meta.url);
const PROMOTION_WORKFLOW_URL = new URL('../../.github/workflows/main-promotion-gate.yml', import.meta.url);
const STAGING_WORKFLOW_URL = new URL('../../.github/workflows/staging-deploy-verify.yml', import.meta.url);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const MERGE_SHA = '0123456789abcdef0123456789abcdef01234567';
const APP_TOKEN_ACTION_SHA = 'fee1f7d63c2ff003460e3d139729b119787bc349';

async function syncWorkflowSource() {
  return readFile(SYNC_WORKFLOW_URL, 'utf8');
}

function extractGithubScript(source) {
  const marker = '          script: |\n';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'github-script block must exist');
  const lines = source.slice(start + marker.length).split('\n');
  const scriptLines = [];
  for (const line of lines) {
    if (line === '' || line.startsWith('            ')) {
      scriptLines.push(line.startsWith('            ') ? line.slice(12) : line);
      continue;
    }
    break;
  }
  return scriptLines.join('\n');
}

function testCore() {
  const failures = [];
  const info = [];
  const summary = {
    addHeading: () => summary,
    addLink: () => summary,
    addRaw: () => summary,
    write: async () => undefined,
  };
  return {
    core: {
      setFailed: (message) => failures.push(message),
      info: (message) => info.push(message),
      summary,
    },
    failures,
    info,
  };
}

function context(overrides = {}) {
  return {
    repo: { owner: 'fgomezserna', repo: 'cukies-hub' },
    payload: {
      pull_request: {
        number: 232,
        merge_commit_sha: MERGE_SHA,
        head: { ref: 'staging' },
        ...overrides,
      },
    },
  };
}

async function executeSyncScript({ comparisonStatus = 'ahead', pullRequest = {}, overrides = {} } = {}) {
  const source = await syncWorkflowSource();
  const script = extractGithubScript(source);
  const calls = [];
  const { core, failures, info } = testCore();
  const github = {
    rest: {
      repos: {
        compareCommitsWithBasehead: async (args) => {
          calls.push(['compare', args]);
          return { data: { status: comparisonStatus } };
        },
      },
      git: {
        getRef: async () => {
          calls.push(['getRef']);
          const error = new Error('not found');
          error.status = 404;
          throw error;
        },
        createRef: async (args) => {
          calls.push(['createRef', args]);
          return { data: {} };
        },
      },
      pulls: {
        list: async () => {
          calls.push(['listPulls']);
          return { data: [] };
        },
        create: async (args) => {
          calls.push(['createPull', args]);
          return { data: { number: 99, html_url: 'https://github.test/pr/99' } };
        },
      },
      ...overrides,
    },
  };
  await new AsyncFunction('context', 'github', 'core', script)(
    context(pullRequest),
    github,
    core,
  );
  return { calls, failures, info, script, source };
}

function syncPullsOverride(pullRequests) {
  return {
    pulls: {
      list: async () => ({ data: pullRequests }),
      create: async () => assert.fail('an existing sync PR must never be recreated'),
    },
  };
}

test('todo PR merged en main activa sync sin depender de label o rama original', async () => {
  const source = await syncWorkflowSource();
  const jobCondition = source.match(/    if: ([^\n]+)/)?.[1] ?? '';
  assert.match(jobCondition, /merged == true/);
  assert.doesNotMatch(jobCondition, /hotfix|head\.ref|label/i);

  for (const headRef of ['staging', 'hotfix/restore-checkout', 'unexpected/admin-bypass']) {
    const result = await executeSyncScript({
      comparisonStatus: 'diverged',
      pullRequest: { head: { ref: headRef } },
    });
    assert.deepEqual(result.failures, []);
    assert.equal(result.calls.some(([name]) => name === 'createPull'), true);
  }
});

for (const comparisonStatus of ['ahead', 'identical']) {
  test(`sync es idempotente cuando staging ya contiene main: ${comparisonStatus}`, async () => {
    const result = await executeSyncScript({ comparisonStatus });
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.calls.map(([name]) => name), ['compare']);
    assert.match(result.info.join(''), /already contains exact main SHA/i);
  });
}

test('sync crea rama en SHA exacto y exige merge commit para restaurar ancestry', async () => {
  const result = await executeSyncScript({ comparisonStatus: 'diverged' });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.calls.map(([name]) => name), [
    'compare',
    'getRef',
    'createRef',
    'listPulls',
    'createPull',
  ]);
  const createRef = result.calls.find(([name]) => name === 'createRef')[1];
  assert.equal(createRef.sha, MERGE_SHA);
  const createPull = result.calls.find(([name]) => name === 'createPull')[1];
  assert.equal(createPull.base, 'staging');
  assert.match(createPull.head, /sync\/main-/);
  assert.match(createPull.body, /Required merge method: Create a merge commit/);
  assert.match(createPull.body, /next promotion blocked/);
  assert.match(createPull.body, /not auto-merged/);
});

test('sync fail-closed si el evento no contiene merge SHA completo', async () => {
  const result = await executeSyncScript({ pullRequest: { merge_commit_sha: 'abc' } });
  assert.deepEqual(result.calls, []);
  assert.match(result.failures.join(''), /full merge commit SHA/i);
});

test('sync falla cerrado si un PR previo se fusionó sin conservar ancestry', async () => {
  const branch = `sync/main-${MERGE_SHA.slice(0, 12)}`;
  const result = await executeSyncScript({
    comparisonStatus: 'diverged',
    overrides: syncPullsOverride([{
      number: 77,
      state: 'closed',
      merged_at: '2026-08-08T00:00:00Z',
      html_url: 'https://github.test/pr/77',
      head: { ref: branch },
      base: { ref: 'staging' },
    }]),
  });
  assert.match(result.failures.join(''), /merged without preserving exact main ancestry/i);
  assert.match(result.failures.join(''), /Create a merge commit/);
});

test('workflow con token write nunca hace checkout ni referencia código del PR head', async () => {
  const source = await syncWorkflowSource();
  assert.doesNotMatch(source, /actions\/checkout/);
  assert.doesNotMatch(source, /pull_request\.head\.sha/);
  assert.doesNotMatch(source, /^  contents: write$/m);
  assert.doesNotMatch(source, /^  pull-requests: write$/m);
  assert.match(source, /environment:\n\s+name: Release Gate/);
  assert.match(source, new RegExp(`actions/create-github-app-token@${APP_TOKEN_ACTION_SHA}`));
  assert.match(source, /permission-contents: write/);
  assert.match(source, /permission-pull-requests: write/);
  assert.match(source, /github-token: \$\{\{ steps\.release_app\.outputs\.token \}\}/);
  assert.doesNotMatch(source, /github-token: \$\{\{ github\.token \}\}/);
  assert.match(source, /actions\/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea/);
});

test('promotion gate usa App dedicada protegida y publica sobre el test merge', async () => {
  const source = await readFile(PROMOTION_WORKFLOW_URL, 'utf8');
  assert.doesNotMatch(source, /^\s+statuses: write$/m);
  assert.match(source, /environment:\n\s+name: Release Gate/);
  assert.match(source, /name: release\/promotion-gate-runner/);
  assert.match(source, new RegExp(`actions/create-github-app-token@${APP_TOKEN_ACTION_SHA}`));
  assert.match(source, /app-id: \$\{\{ vars\.RELEASE_GATE_APP_ID \}\}/);
  assert.match(source, /secrets\.RELEASE_GATE_APP_PRIVATE_KEY/);
  assert.equal((source.match(/GH_TOKEN: \$\{\{ steps\.release_app\.outputs\.token \}\}/g) ?? []).length, 2);
  assert.match(source, /MERGE_SHA: \$\{\{ steps\.live_pr\.outputs\.merge_sha \}\}/);
  assert.equal((source.match(/statuses\/\$\{MERGE_SHA\}/g) ?? []).length, 2);
  assert.equal((source.match(/context='release\/promotion-gate'/g) ?? []).length, 2);
});

test('promotion gate carga manifiesto desde el head SHA sin ejecutar ese checkout', async () => {
  const source = await readFile(PROMOTION_WORKFLOW_URL, 'utf8');
  assert.match(source, /contents\/\.github\/release\/promotion\.json\?ref=\$\{head_sha\}/);
  assert.match(source, /Accept: application\/vnd\.github\.raw\+json/);
  assert.match(source, /PROMOTION_MANIFEST_PATH: \$\{\{ steps\.live_pr\.outputs\.manifest_path \}\}/);
  assert.match(source, /ref: \$\{\{ steps\.live_pr\.outputs\.base_sha \}\}/);
  assert.doesNotMatch(source, /ref: \$\{\{[^\n]*head_sha/);
  assert.equal((source.match(/git\/ref\/heads\/main/g) ?? []).length, 2);
  assert.match(source, /\.base\.sha = \$base_sha \| \{ pull_request: \. \}/);
  assert.doesNotMatch(source, /\n\s+- edited\n|\n\s+- labeled\n|\n\s+- unlabeled\n/);
  assert.match(source, /verify-promotion-merge\.mjs/);
  assert.match(source, /select\(\.merge_commit_sha == \$merge_sha\)/);
});

test('staging push combina deploy y QA tras Environment y firma con la App dedicada', async () => {
  const source = await readFile(STAGING_WORKFLOW_URL, 'utf8');
  assert.match(source, /run-name: Staging deploy \$\{\{ github\.sha \}\}/);
  assert.match(source, /push:\n\s+branches:\n\s+- staging/);
  assert.doesNotMatch(source, /workflow_dispatch/);
  assert.doesNotMatch(source, /^\s+statuses: write$/m);
  assert.match(source, /environment:\n\s+name: Staging/);
  assert.match(source, new RegExp(`actions/create-github-app-token@${APP_TOKEN_ACTION_SHA}`));
  assert.match(source, /app-id: \$\{\{ vars\.RELEASE_GATE_APP_ID \}\}/);
  assert.match(source, /--staging-push-qa-current-run/);
  assert.match(source, /RELEASE_STATUS_CREATOR_LOGIN: \$\{\{ steps\.release_app\.outputs\.app-slug \}\}\[bot\]/);
  assert.match(source, /release\/staging-deployed/);
  assert.match(source, /release\/staging-validated/);
});

test('cada action de terceros está fijada a SHA inmutable', async () => {
  const workflowNames = [
    'staging-deploy-verify.yml',
    'main-promotion-gate.yml',
    'main-staging-sync.yml',
  ];
  for (const workflowName of workflowNames) {
    const source = await readFile(new URL(`../../.github/workflows/${workflowName}`, import.meta.url), 'utf8');
    const uses = source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('uses: '));
    for (const action of uses) {
      assert.match(action, /^uses: [A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/);
    }
  }
});
