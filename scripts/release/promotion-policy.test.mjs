import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROMOTION_MANIFEST_REPOSITORY_PATH,
  PROMOTION_MANIFEST_SCHEMA_VERSION,
  PromotionPolicyError,
  evaluatePromotionPolicy,
  isPlaceholderValue,
  runPromotionPolicyCli,
} from './promotion-policy.mjs';

const CANDIDATE_SHA = '0123456789abcdef0123456789abcdef01234567';
const BASE_SHA = '89abcdef0123456789abcdef0123456789abcdef';
const OTHER_SHA = 'fedcba9876543210fedcba9876543210fedcba98';
const PR_NUMBER = 232;

function normalManifest(overrides = {}) {
  return {
    schemaVersion: PROMOTION_MANIFEST_SCHEMA_VERSION,
    mode: 'normal',
    pullRequest: PR_NUMBER,
    baseSha: BASE_SHA,
    stagingEvidence: [
      'https://github.com/fgomezserna/cukies-hub/actions/runs/481',
      'https://cukieshub.eurekand.com/api/health',
    ],
    rollback: 'Revert the main merge commit and redeploy the previous known-good image.',
    ...overrides,
  };
}

function hotfixManifest(overrides = {}) {
  return {
    schemaVersion: PROMOTION_MANIFEST_SCHEMA_VERSION,
    mode: 'hotfix',
    pullRequest: PR_NUMBER,
    baseSha: BASE_SHA,
    incident: 'INC-481 - production checkout is unavailable for active customers.',
    urgency: 'Active production impact requires immediate restoration of checkout.',
    whyStagingCannotWait: 'The failure depends on production-only routing and blocks presale purchases now.',
    rollback: 'Revert the hotfix merge commit and redeploy the last known-good image.',
    ...overrides,
  };
}

function pullRequestEvent(overrides = {}) {
  const pullRequestOverrides = overrides.pullRequest ?? {};
  const pullRequest = {
    number: PR_NUMBER,
    base: {
      ref: 'main',
      sha: BASE_SHA,
      repo: { full_name: 'fgomezserna/cukies-hub' },
      ...pullRequestOverrides.base,
    },
    head: {
      ref: 'staging',
      sha: CANDIDATE_SHA,
      repo: { full_name: 'fgomezserna/cukies-hub' },
      ...pullRequestOverrides.head,
    },
    body: 'Informational only and intentionally mutable.',
    labels: [],
    ...pullRequestOverrides,
  };
  pullRequest.base = {
    ref: 'main',
    sha: BASE_SHA,
    repo: { full_name: 'fgomezserna/cukies-hub' },
    ...pullRequestOverrides.base,
  };
  pullRequest.head = {
    ref: 'staging',
    sha: CANDIDATE_SHA,
    repo: { full_name: 'fgomezserna/cukies-hub' },
    ...pullRequestOverrides.head,
  };

  return {
    action: 'synchronize',
    pull_request: pullRequest,
    ...overrides.event,
  };
}

test('permite staging -> main solo con manifiesto inmutable ligado a PR y base SHA', () => {
  assert.deepEqual(evaluatePromotionPolicy(pullRequestEvent(), normalManifest()), {
    mode: 'normal',
    pullRequest: PR_NUMBER,
    baseRef: 'main',
    baseSha: BASE_SHA,
    headRef: 'staging',
    candidateSha: CANDIDATE_SHA,
  });
});

test('permite hotfix/* -> main con manifiesto formal e inmutable', () => {
  const event = pullRequestEvent({
    pullRequest: {
      head: { ref: 'hotfix/restore-checkout', sha: CANDIDATE_SHA },
      body: '',
      labels: [],
    },
  });

  assert.deepEqual(evaluatePromotionPolicy(event, hotfixManifest()), {
    mode: 'hotfix',
    pullRequest: PR_NUMBER,
    baseRef: 'main',
    baseSha: BASE_SHA,
    headRef: 'hotfix/restore-checkout',
    candidateSha: CANDIDATE_SHA,
  });
});

test('body y labels mutables no forman parte de la autorización', () => {
  const event = pullRequestEvent({
    pullRequest: {
      head: { ref: 'hotfix/restore-checkout', sha: CANDIDATE_SHA },
      body: 'edited after the run',
      labels: [{ name: 'anything' }],
    },
  });
  assert.equal(evaluatePromotionPolicy(event, hotfixManifest()).mode, 'hotfix');
});

test('rechaza eventos que no sean de pull request', () => {
  assert.throws(() => evaluatePromotionPolicy({ action: 'push' }, normalManifest()), PromotionPolicyError);
});

test('rechaza una base distinta de main', () => {
  assert.throws(
    () => evaluatePromotionPolicy(
      pullRequestEvent({ pullRequest: { base: { ref: 'develop' } } }),
      normalManifest(),
    ),
    /base.*main/i,
  );
});

test('rechaza staging o hotfix desde un fork aunque el nombre de rama parezca válido', () => {
  for (const [headRef, manifest] of [
    ['staging', normalManifest()],
    ['hotfix/forged', hotfixManifest()],
  ]) {
    assert.throws(
      () => evaluatePromotionPolicy(pullRequestEvent({
        pullRequest: {
          head: {
            ref: headRef,
            sha: CANDIDATE_SHA,
            repo: { full_name: 'attacker/cukies-hub' },
          },
        },
      }), manifest),
      /mismo repositorio/i,
    );
  }
});

for (const headRef of ['feature/new-gate', 'develop', 'main', 'staging-copy', 'hotfix/']) {
  test(`rechaza la rama de origen no autorizada: ${headRef}`, () => {
    assert.throws(
      () => evaluatePromotionPolicy(
        pullRequestEvent({ pullRequest: { head: { ref: headRef, sha: CANDIDATE_SHA } } }),
        normalManifest(),
      ),
      /rama de origen/i,
    );
  });
}

test('rechaza SHA de head o de base ausente, abreviado o mal formado', () => {
  for (const sha of [undefined, '', CANDIDATE_SHA.slice(0, 7), `${CANDIDATE_SHA}00`, 'z'.repeat(40)]) {
    assert.throws(
      () => evaluatePromotionPolicy(
        pullRequestEvent({ pullRequest: { head: { ref: 'staging', sha } } }),
        normalManifest(),
      ),
      /sha.*completo/i,
    );
    assert.throws(
      () => evaluatePromotionPolicy(
        pullRequestEvent({ pullRequest: { base: { sha } } }),
        normalManifest(),
      ),
      /sha.*base|base.*sha/i,
    );
  }
});

test('rechaza manifiesto sin objeto o con schemaVersion distinto', () => {
  for (const manifest of [undefined, null, [], normalManifest({ schemaVersion: 2 })]) {
    assert.throws(
      () => evaluatePromotionPolicy(pullRequestEvent(), manifest),
      /manifiesto|schemaversion/i,
    );
  }
});

test('rechaza manifiesto reutilizado en otro PR o tras avanzar main', () => {
  assert.throws(
    () => evaluatePromotionPolicy(
      pullRequestEvent({ pullRequest: { number: PR_NUMBER + 1 } }),
      normalManifest(),
    ),
    /número exacto/i,
  );
  assert.throws(
    () => evaluatePromotionPolicy(
      pullRequestEvent({ pullRequest: { base: { sha: OTHER_SHA } } }),
      normalManifest(),
    ),
    /sha exacto actual/i,
  );
});

test('rechaza un mode que no coincide con la rama de origen', () => {
  assert.throws(
    () => evaluatePromotionPolicy(pullRequestEvent(), normalManifest({ mode: 'hotfix' })),
    /mode normal/i,
  );
  assert.throws(
    () => evaluatePromotionPolicy(
      pullRequestEvent({ pullRequest: { head: { ref: 'hotfix/fix', sha: CANDIDATE_SHA } } }),
      hotfixManifest({ mode: 'normal' }),
    ),
    /mode hotfix/i,
  );
});

test('rechaza campos extra y campos faltantes de forma fail-closed', () => {
  const normalExtra = normalManifest({ arbitraryApproval: true });
  assert.throws(
    () => evaluatePromotionPolicy(pullRequestEvent(), normalExtra),
    /exactamente.*campos/i,
  );

  const hotfixMissing = hotfixManifest();
  delete hotfixMissing.incident;
  assert.throws(
    () => evaluatePromotionPolicy(
      pullRequestEvent({ pullRequest: { head: { ref: 'hotfix/fix', sha: CANDIDATE_SHA } } }),
      hotfixMissing,
    ),
    /exactamente.*campos/i,
  );
});

for (const evidence of [
  [],
  ['http://cukieshub.eurekand.com/api/health'],
  ['https://user:secret@example.com/evidence'],
  ['not-a-url'],
  Array.from({ length: 11 }, (_, index) => `https://example.com/${index}`),
  ['https://example.com/evidence', 'https://example.com/evidence'],
]) {
  test(`rechaza stagingEvidence inválida: ${JSON.stringify(evidence)}`, () => {
    assert.throws(
      () => evaluatePromotionPolicy(pullRequestEvent(), normalManifest({ stagingEvidence: evidence })),
      /stagingevidence/i,
    );
  });
}

for (const placeholder of [
  '',
  'TBD',
  'TODO: fill this in',
  'pending',
  'N/A',
  'none',
  '<add evidence here>',
  '[INSERT ROLLBACK PLAN]',
  '???',
  '...',
  'pendiente',
  'por completar',
  'rellenar',
  'añadir evidencia',
  'describir rollback',
]) {
  test(`detecta el placeholder ${JSON.stringify(placeholder)}`, () => {
    assert.equal(isPlaceholderValue(placeholder), true);
  });
}

for (const field of ['incident', 'urgency', 'whyStagingCannotWait', 'rollback']) {
  test(`rechaza hotfix con ${field} vacío o placeholder`, () => {
    assert.throws(
      () => evaluatePromotionPolicy(
        pullRequestEvent({ pullRequest: { head: { ref: 'hotfix/fix', sha: CANDIDATE_SHA } } }),
        hotfixManifest({ [field]: 'TODO' }),
      ),
      new RegExp(field, 'i'),
    );
  });
}

test('CLI lee evento y manifiesto desde dos rutas explícitas', async () => {
  const output = [];
  const errors = [];
  const readPaths = [];
  const exitCode = await runPromotionPolicyCli({
    env: {
      GITHUB_EVENT_PATH: '/tmp/event.json',
      PROMOTION_MANIFEST_PATH: '/tmp/promotion.json',
    },
    readFileFn: async (filePath) => {
      readPaths.push(filePath);
      return JSON.stringify(
        filePath === '/tmp/event.json' ? pullRequestEvent() : normalManifest(),
      );
    },
    stdout: { write: (value) => output.push(value) },
    stderr: { write: (value) => errors.push(value) },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(readPaths, ['/tmp/event.json', '/tmp/promotion.json']);
  assert.match(output.join(''), /normal.*permitida/i);
  assert.equal(errors.length, 0);
  assert.equal(PROMOTION_MANIFEST_REPOSITORY_PATH, '.github/release/promotion.json');
});

test('CLI falla cerrado si falta una ruta, el JSON es inválido o el manifiesto es excesivo', async () => {
  const cases = [
    { env: {}, readFileFn: async () => assert.fail('no debe leer') },
    {
      env: { GITHUB_EVENT_PATH: '/tmp/event.json' },
      readFileFn: async () => assert.fail('no debe leer'),
    },
    {
      env: {
        GITHUB_EVENT_PATH: '/tmp/event.json',
        PROMOTION_MANIFEST_PATH: '/tmp/promotion.json',
      },
      readFileFn: async (filePath) => filePath.endsWith('event.json') ? '{' : '{}',
    },
    {
      env: {
        GITHUB_EVENT_PATH: '/tmp/event.json',
        PROMOTION_MANIFEST_PATH: '/tmp/promotion.json',
      },
      readFileFn: async (filePath) => filePath.endsWith('event.json')
        ? JSON.stringify(pullRequestEvent())
        : 'x'.repeat(33 * 1024),
    },
  ];

  for (const testCase of cases) {
    const errors = [];
    const exitCode = await runPromotionPolicyCli({
      ...testCase,
      stdout: { write: () => assert.fail('no debe escribir éxito') },
      stderr: { write: (value) => errors.push(value) },
    });
    assert.equal(exitCode, 1);
    assert.match(errors.join(''), /promotion policy/i);
  }
});
