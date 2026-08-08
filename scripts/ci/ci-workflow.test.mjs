import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const WORKFLOW_URL = new URL('../../.github/workflows/ci-quality.yml', import.meta.url);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const BASE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const HEAD_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const MERGE_SHA = 'cccccccccccccccccccccccccccccccccccccccc';
const CHECKOUT_SHA = '11bd71901bbe5b1630ceea73d27597364c9af683';
const SETUP_NODE_SHA = '49933ea5288caeca8642d1e84afbd3f7d6820020';
const APP_TOKEN_SHA = 'fee1f7d63c2ff003460e3d139729b119787bc349';
const GITHUB_SCRIPT_SHA = '60a0d83039c74a4aee543508d2ffcb1c3799cdea';

async function workflowSource() {
  return readFile(WORKFLOW_URL, 'utf8');
}

function extractStepScript(source, stepName) {
  const stepMarker = `      - name: ${stepName}\n`;
  const stepStart = source.indexOf(stepMarker);
  assert.notEqual(stepStart, -1, `step ${stepName} must exist`);
  const scriptMarker = '          script: |\n';
  const scriptStart = source.indexOf(scriptMarker, stepStart);
  assert.notEqual(scriptStart, -1, `step ${stepName} must contain github-script code`);
  const lines = source.slice(scriptStart + scriptMarker.length).split('\n');
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

function pullContext(overrides = {}) {
  return {
    eventName: 'pull_request_target',
    ref: 'refs/heads/staging',
    repo: { owner: 'fgomezserna', repo: 'cukies-hub' },
    payload: { pull_request: { number: 235 } },
    ...overrides,
  };
}

function pullPayload(overrides = {}) {
  return {
    state: 'open',
    mergeable: true,
    merge_commit_sha: MERGE_SHA,
    base: {
      ref: 'staging',
      repo: { full_name: 'fgomezserna/cukies-hub' },
    },
    head: {
      sha: HEAD_SHA,
      repo: { full_name: 'fgomezserna/cukies-hub' },
    },
    ...overrides,
  };
}

async function runResolver({ context = pullContext(), pull = pullPayload(), parents } = {}) {
  const source = await workflowSource();
  const script = extractStepScript(source, 'Resolve and validate the exact quality target');
  const outputs = new Map();
  const github = {
    rest: {
      pulls: { get: async () => ({ data: pull }) },
      git: {
        getRef: async ({ ref }) => {
          if (ref === 'heads/staging' || ref === 'heads/main') {
            return { data: { object: { sha: BASE_SHA } } };
          }
          if (ref === 'pull/235/merge') return { data: { object: { sha: MERGE_SHA } } };
          throw new Error(`unexpected ref ${ref}`);
        },
        getCommit: async () => ({
          data: { parents: (parents ?? [BASE_SHA, HEAD_SHA]).map((sha) => ({ sha })) },
        }),
      },
    },
  };
  const core = { setOutput: (name, value) => outputs.set(name, value) };
  await new AsyncFunction('github', 'context', 'core', 'setTimeout', script)(
    github,
    context,
    core,
    () => assert.fail('mergeable fixture must not poll'),
  );
  return outputs;
}

async function runAttestor({ context = pullContext(), pull = pullPayload(), parents } = {}) {
  const source = await workflowSource();
  const script = extractStepScript(source, 'Revalidate the live target before signing');
  const github = {
    rest: {
      pulls: { get: async () => ({ data: pull }) },
      git: {
        getRef: async ({ ref }) => {
          if (ref === 'heads/staging') return { data: { object: { sha: BASE_SHA } } };
          if (ref === 'pull/235/merge') return { data: { object: { sha: MERGE_SHA } } };
          throw new Error(`unexpected ref ${ref}`);
        },
        getCommit: async () => ({
          data: { parents: (parents ?? [BASE_SHA, HEAD_SHA]).map((sha) => ({ sha })) },
        }),
      },
    },
  };
  const processFixture = {
    env: {
      EXPECTED_BASE_REF: 'staging',
      EXPECTED_BASE_SHA: BASE_SHA,
      EXPECTED_HEAD_SHA: HEAD_SHA,
      EXPECTED_TARGET_SHA: MERGE_SHA,
    },
  };
  await new AsyncFunction('github', 'context', 'process', script)(
    github,
    context,
    processFixture,
  );
}

test('workflow separa ejecución sin secretos y firma con App dedicada protegida', async () => {
  const source = await workflowSource();
  assert.match(source, /pull_request_target:\n\s+branches:\n\s+- staging\n\s+- main/);
  assert.match(source, /push:\n\s+branches:\n\s+- staging\n\s+- main/);
  assert.doesNotMatch(source, /workflow_dispatch/);
  assert.doesNotMatch(source, /^  checks: write$/m);
  assert.doesNotMatch(source, /^  contents: write$/m);
  assert.match(source, /quality:\n\s+name: ci\/quality-runner/);
  assert.match(source, /attest:\n\s+name: ci\/quality-attestor/);
  assert.match(source, /environment:\n\s+name: \$\{\{ needs\.prepare\.outputs\.environment_name \}\}/);
  assert.match(source, new RegExp(`actions/create-github-app-token@${APP_TOKEN_SHA}`));
  assert.match(source, /permission-checks: write/);
  assert.match(source, /github-token: \$\{\{ steps\.release_app\.outputs\.token \}\}/);
  assert.match(source, /name: 'CI Quality \/ Required'/);
  assert.match(source, /concurrency:\n\s+group: ci-quality-/);
  assert.match(source, /cancel-in-progress: true/);
  assert.match(source, /Build the immutable isolated candidate image/);
  assert.match(source, /trusted\/scripts\/ci\/prepare-quality-container\.mjs/);
  assert.match(source, /QUALITY_IMAGE: cukies-quality:\$\{\{ needs\.prepare\.outputs\.target_sha \}\}/);

  const qualityBlock = source.slice(source.indexOf('  quality:'), source.indexOf('  attest:'));
  assert.doesNotMatch(qualityBlock, /secrets\.|RELEASE_GATE_APP|environment:/);
  assert.match(qualityBlock, /trusted\/scripts\/ci\/run-quality\.mjs/);
  assert.match(qualityBlock, /--workspace "\$QUALITY_WORKSPACE"/);
  assert.match(qualityBlock, /--expected-sha "\$QUALITY_EXPECTED_SHA"/);
  assert.match(qualityBlock, /--container-image "\$QUALITY_CONTAINER_IMAGE"/);
  assert.match(qualityBlock, /quality_image_id="\$\(docker image inspect --format='\{\{\.Id\}\}'/);
  assert.match(qualityBlock, /\^sha256:\[0-9a-f\]\{64\}\$/);
  assert.match(qualityBlock, /com\.cukies\.quality\.target-sha/);
  assert.match(qualityBlock, /printf 'image_id=%s\\n'/);
  assert.match(
    qualityBlock,
    /QUALITY_CONTAINER_IMAGE: \$\{\{ steps\.candidate_image\.outputs\.image_id \}\}/,
  );
  assert.doesNotMatch(
    qualityBlock,
    /QUALITY_CONTAINER_IMAGE: \$\{\{ steps\.candidate_image\.outputs\.image \}\}/,
  );

  const candidateCheckout = qualityBlock.indexOf('- name: Checkout exact candidate');
  const trustedCheckout = qualityBlock.indexOf('- name: Checkout trusted CI tooling');
  const imageBuild = qualityBlock.indexOf('- name: Build the immutable isolated candidate image');
  const qualityRunner = qualityBlock.indexOf('- name: Run the trusted fail-closed quality contract');
  assert.ok(candidateCheckout >= 0);
  assert.ok(candidateCheckout < trustedCheckout);
  assert.ok(trustedCheckout < imageBuild);
  assert.ok(imageBuild < qualityRunner);
  assert.ok(trustedCheckout < qualityRunner);
  assert.match(qualityBlock, /Validate trusted tooling checkout/);
  assert.match(qualityBlock, /Revalidate both checkouts after candidate execution/);

  const attestBlock = source.slice(source.indexOf('  attest:'));
  assert.doesNotMatch(attestBlock, /actions\/checkout/);
});

test('workflow fija todas las actions externas a SHAs inmutables', async () => {
  const source = await workflowSource();
  for (const expected of [CHECKOUT_SHA, SETUP_NODE_SHA, APP_TOKEN_SHA, GITHUB_SCRIPT_SHA]) {
    assert.match(source, new RegExp(`@${expected}`));
  }
  for (const line of source.split('\n').map((value) => value.trim())) {
    if (line.startsWith('uses: ')) {
      assert.match(line, /^uses: [A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/);
    }
  }
});

test('resolver ancla un PR same-repo al test merge y a la base viva', async () => {
  const outputs = await runResolver();
  assert.equal(outputs.get('base_ref'), 'staging');
  assert.equal(outputs.get('base_sha'), BASE_SHA);
  assert.equal(outputs.get('head_sha'), HEAD_SHA);
  assert.equal(outputs.get('target_sha'), MERGE_SHA);
  assert.equal(outputs.get('target_ref'), 'refs/pull/235/merge');
  assert.equal(outputs.get('profile'), 'quick');
  assert.equal(outputs.get('environment_name'), 'Staging');
});

test('todo PR hacia main, incluido hotfix, exige candidate completo antes del merge', async () => {
  const outputs = await runResolver({
    context: pullContext({ ref: 'refs/heads/main' }),
    pull: pullPayload({
      base: {
        ref: 'main',
        repo: { full_name: 'fgomezserna/cukies-hub' },
      },
    }),
  });
  assert.equal(outputs.get('base_ref'), 'main');
  assert.equal(outputs.get('profile'), 'candidate');
  assert.equal(outputs.get('environment_name'), 'Release Gate');
});

test('resolver rechaza forks y test merges con padres obsoletos', async () => {
  await assert.rejects(runResolver({
    pull: pullPayload({
      head: { sha: HEAD_SHA, repo: { full_name: 'attacker/cukies-hub' } },
    }),
  }), /eligible same-repository quality target/);

  await assert.rejects(runResolver({
    parents: ['dddddddddddddddddddddddddddddddddddddddd', HEAD_SHA],
  }), /exact current GitHub test merge/);
});

test('resolver rechaza pushes fuera de staging/main antes de consultar GitHub', async () => {
  await assert.rejects(runResolver({
    context: pullContext({
      eventName: 'push',
      ref: 'refs/heads/feature/unsafe',
      sha: HEAD_SHA,
    }),
  }), /only accepts.*staging or main/i);
});

test('attestor revalida el mismo PR, repositorio y test merge antes de firmar', async () => {
  await runAttestor();

  await assert.rejects(runAttestor({
    context: pullContext({ payload: { pull_request: {} } }),
  }), /number is invalid/i);

  await assert.rejects(runAttestor({
    pull: pullPayload({
      head: { sha: HEAD_SHA, repo: { full_name: 'attacker/cukies-hub' } },
    }),
  }), /changed before quality attestation/i);

  await assert.rejects(runAttestor({
    parents: [BASE_SHA, 'dddddddddddddddddddddddddddddddddddddddd'],
  }), /no longer the exact test merge/i);
});
