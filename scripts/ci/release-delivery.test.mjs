import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseDelivery } from './release-delivery-plan.mjs';
import { deliverRelease, deployWorkers, assertNoPendingDelivery } from './deliver-release.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CI_COMPONENTS } from './image-ref.mjs';
import { resolveCoolifyTargets } from './coolify-targets.mjs';

const sha = 'a'.repeat(40), hash = 'b'.repeat(64), digest = 'sha256:' + 'c'.repeat(64);
const compose = 'services:\n  chain-indexer:\n    image: fixture\n';
const manifest = () => ({ environment: 'staging', chainId: '97', commit: sha, configHash: hash,
  components: Object.fromEntries(CI_COMPONENTS.map((c) => [c, { image: `registry:5000/cukies-hub/${c}:${sha}-${hash}@${digest}`, digest, sourceSha: sha, configHash: hash }])) });
const previous = () => ({ ...manifest(), deliveryMode: 'rolling', workersComposeHash: chooseDelivery({ manifest: manifest(), compose }).workersComposeHash });

test('a docs-only release neither restarts services nor advances the served SHA', async () => {
  const prior = previous();
  const candidate = { ...manifest(), commit: 'd'.repeat(40) };
  const result = await deliverRelease({ client: {}, manifest: candidate, previous: prior, compose,
    webDeploy: () => assert.fail('web restarted'), workerDeploy: () => assert.fail('workers restarted') });
  assert.equal(result.status, 'skipped');
  assert.equal(result.servedSha, sha);
});

test('only a changed web image leaves workers untouched', () => {
  const candidate = manifest();
  candidate.components.dapp = { ...candidate.components.dapp, image: candidate.components.dapp.image.replace(digest, 'sha256:' + 'e'.repeat(64)), digest: 'sha256:' + 'e'.repeat(64) };
  const decision = chooseDelivery({ manifest: candidate, previous: previous(), compose });
  assert.equal(decision.web, true);
  assert.equal(decision.workers, false);
});

test('workers start only after the web release has been verified', async () => {
  const calls = [];
  await deliverRelease({ client: {}, manifest: manifest(), previous: previous(), compose: compose + '# change\n',
    webDeploy: async () => { calls.push('web-ready'); return { deploymentUuid: 'web-1' }; },
    workerDeploy: async () => { calls.push('workers'); return { deploymentUuid: 'workers-1' }; } });
  assert.deepEqual(calls, ['web-ready', 'workers']);
});

test('a failed web candidate never starts or duplicates workers', async () => {
  await assert.rejects(deliverRelease({ client: {}, manifest: manifest(), previous: null, compose,
    webDeploy: async () => { throw new Error('candidate failed'); },
    workerDeploy: () => assert.fail('workers started') }), /candidate failed/);
});

test('a cross-environment state is rejected before delivery', () => {
  assert.throws(() => chooseDelivery({ manifest: manifest(), previous: { ...previous(), environment: 'production', chainId: '56' }, compose }), /entorno/);
});

test('workers reject production resource and do not mutate it', async () => {
  await assert.rejects(deployWorkers({ client: { getApplication: async () => ({ uuid: 'jookw8ow8woks088s44404ok', git_branch: 'main', build_pack: 'dockercompose' }), patchEnvs: () => assert.fail('mutation') },
    targets: resolveCoolifyTargets('staging'), manifest: manifest(), compose }), /destino aprobado/);
});

test('a worker failure leaves an explicit record of the web already serving', async () => {
  const progress = [];
  await assert.rejects(deliverRelease({ client: {}, manifest: manifest(), previous: null, compose,
    recordProgress: async (record) => progress.push(record),
    webDeploy: async () => ({ deploymentUuid: 'web-ready', healthSha: sha }),
    workerDeploy: async () => { throw new Error('worker failed'); } }), /worker failed/);
  assert.equal(progress.at(-1).phase, 'workers-starting');
  assert.equal(progress.at(-1).web.healthSha, sha);
  assert.equal(progress.at(-1).candidate.commit, sha);
  assert.equal(progress.some((record) => record.phase === 'delivery-verified'), false);
});

test('pending or corrupt journals block a subsequent delivery', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cukies-delivery-'));
  const path = join(dir, 'release.json.pending.json');
  try {
    await assertNoPendingDelivery(path);
    for (const contents of ['{"phase":"workers-starting"}', '{broken']) {
      await writeFile(path, contents);
      await assert.rejects(assertNoPendingDelivery(path), /sin reconciliar/);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
