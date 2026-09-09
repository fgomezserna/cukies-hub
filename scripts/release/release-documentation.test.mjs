import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, ROOT), 'utf8');
}

test('release docs usan staging -> main, manifiesto inmutable y test merge exacto', async () => {
  const [workflow, candidate, issueForm, pullRequestTemplate] = await Promise.all([
    read('docs/release-workflow.md'),
    read('docs/release-candidate-template.md'),
    read('.github/ISSUE_TEMPLATE/release_candidate.yml'),
    read('.github/pull_request_template.md'),
  ]);
  const combined = `${workflow}\n${candidate}\n${issueForm}\n${pullRequestTemplate}`;

  assert.match(workflow, /PR desde `staging` a `main`/);
  assert.match(combined, /\.github\/release\/promotion\.json/);
  assert.match(combined, /promotion\.schema\.json/);
  assert.match(workflow, /refs\/pull\/<n>\/merge/);
  assert.match(workflow, /tree del test merge/i);
  assert.match(candidate, /"mode": "normal"/);
  assert.match(candidate, /"mode": "hotfix"/);
  assert.match(issueForm, /Main\/live \(promocion desde staging\)/);

  for (const obsolete of [
    'label exacta `hotfix`',
    'sync/hotfix-',
    'El PR normal solo puede tener head `staging` y base `main`. Su body debe contener',
  ]) {
    assert.doesNotMatch(combined, new RegExp(obsolete.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('bootstrap queda fail-closed con App dedicada, custom branches, sync y freeze', async () => {
  const [workflow, candidate] = await Promise.all([
    read('docs/release-workflow.md'),
    read('docs/release-candidate-template.md'),
  ]);
  for (const source of [workflow, candidate]) {
    assert.match(source, /Environment\s+protegido `Staging`/);
    assert.match(source, /pull_request_target/);
    assert.match(source, /no\s+fabrica attestations/i);
    assert.match(source, /impid(?:e|en|ir) autoaprobacion/);
    assert.match(source, /app_id/);
    assert.match(source, /App dedicada/i);
    assert.match(source, /sync\/main-/);
    assert.match(source, /Create a merge commit/);
    assert.match(source, /Mainnet y preventa.*congelad/is);
  }
  assert.match(workflow, /custom.*`staging`/is);
  assert.match(workflow, /custom.*`main`/is);
  assert.match(workflow, /#235/);
  assert.doesNotMatch(workflow, /actor autorizado crea manualmente/);
});
