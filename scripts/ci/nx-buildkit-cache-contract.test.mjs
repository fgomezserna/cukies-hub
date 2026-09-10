import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dockerfilePath = new URL('../../Dockerfile.ci', import.meta.url);

function stage(source, name) {
  const match = source.match(new RegExp(`FROM deps AS ${name}\\n([\\s\\S]*?)(?=\\nFROM |$)`));
  assert.ok(match, `no se encontró el stage ${name}`);
  return match[1];
}

test('los caches Next no se montan dentro de outputs que Nx puede restaurar', async () => {
  const source = await readFile(dockerfilePath, 'utf8');
  for (const [name, projectRoot, cacheId, cacheDir] of [
    ['dapp-build', '/app/dapp', 'cukies-next-cache-dapp', '/var/cache/cukies-next-dapp'],
    ['treasure-hunt-build', '/app/games/sybil-slayer', 'cukies-next-cache-treasure-hunt', '/var/cache/cukies-next-treasure-hunt'],
  ]) {
    const body = stage(source, name);
    assert.match(body, new RegExp(`--mount=type=cache,id=${cacheId},target=${cacheDir},sharing=locked`));
    assert.doesNotMatch(body, new RegExp(`--mount=type=cache,id=${cacheId},target=${projectRoot.replaceAll('/', '\\/')}/\\.next/cache`));
    assert.match(body, new RegExp(`mkdir -p ${projectRoot.replaceAll('/', '\\/')}\\/.next`));
    assert.match(body, new RegExp(`rm -rf ${projectRoot.replaceAll('/', '\\/')}\\/.next/cache`));
    assert.match(body, new RegExp(`ln -s ${cacheDir.replaceAll('/', '\\/')} ${projectRoot.replaceAll('/', '\\/')}\\/.next/cache`));
    assert.match(body, /--mount=type=cache,id=cukies-nx-state,target=\/app\/\.nx,sharing=locked/);
    assert.match(body, /NX_CACHE_DIRECTORY=\/app\/\.nx\/cache NX_WORKSPACE_DATA_DIRECTORY=\/app\/\.nx\/workspace-data NX_DAEMON=false/);
  }
});
