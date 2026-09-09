import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('la imagen standalone sustituye los destinos antes de mover assets públicos', async () => {
  const dockerfile = await readFile(
    new URL('../../Dockerfile.ci', import.meta.url),
    'utf8',
  );

  assert.match(
    dockerfile,
    /rm -rf \/app\/dapp\/\.next\/static \/app\/dapp\/public \/app\/dapp\/prisma;[\s\\]+mv \/tmp\/cukies-next-static \/app\/dapp\/\.next\/static;[\s\\]+mv \/tmp\/cukies-dapp-public \/app\/dapp\/public;/,
  );
  assert.match(
    dockerfile,
    /rm -rf \/app\/\.next\/static \/app\/public \/app\/prisma;[\s\\]+mv \/tmp\/cukies-next-static \/app\/\.next\/static;[\s\\]+mv \/tmp\/cukies-dapp-public \/app\/public;/,
  );
  assert.doesNotMatch(
    dockerfile,
    /mkdir -p \/app\/(?:dapp\/)?\.next \/app\/(?:dapp\/)?public/,
  );
});
