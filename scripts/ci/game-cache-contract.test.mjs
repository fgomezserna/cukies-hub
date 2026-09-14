import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const configPath = new URL('../../games/sybil-slayer/next.config.ts', import.meta.url);
const dockerfilePath = new URL('../../Dockerfile.ci', import.meta.url);

function evalConfigCache(configSource, env) {
  const match = configSource.match(/const gameCacheVersion =\s*([\s\S]*?);\n\nconst nextConfig/);
  assert.ok(match, 'no se encontró el selector de cache del game next.config');
  return Function('process', `return (${match[1]});`)({env});
}

function extractStage(dockerfile, stage) {
  const match = dockerfile.match(new RegExp(`FROM deps AS ${stage}\\n([\\s\\S]*?)(?=\\nFROM |$)`));
  assert.ok(match, `no se encontró el stage ${stage}`);
  return match[1];
}

test('game cache usa IMAGE_REVISION cuando SOURCE_COMMIT está vacío', async () => {
  const source = await readFile(configPath, 'utf8');
  const imageRevision = '4'.repeat(40);
  assert.equal(evalConfigCache(source, {
    NEXT_PUBLIC_GAME_CACHE_VERSION: '',
    SOURCE_COMMIT: '',
    IMAGE_REVISION: imageRevision,
  }), imageRevision);
});

test('treasure-hunt-build deriva SOURCE_COMMIT de IMAGE_REVISION', async () => {
  const dockerfile = await readFile(dockerfilePath, 'utf8');
  const stage = extractStage(dockerfile, 'treasure-hunt-build');
  assert.doesNotMatch(stage, /^ARG SOURCE_COMMIT\s*$/m);
  assert.match(stage, /SOURCE_COMMIT=\$IMAGE_REVISION/);
  assert.doesNotMatch(stage, /SOURCE_COMMIT=\$SOURCE_COMMIT/);
});
