import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import test from 'node:test';

const execFile = promisify(execFileCallback);

function extractStandaloneAssetRun(dockerfile) {
  const start = dockerfile.indexOf('RUN if [ -f /app/dapp/server.js ]; then');
  const end = dockerfile.indexOf('\n\nCOPY --from=dapp-build /app/scripts', start);
  assert.ok(start >= 0 && end > start, 'no se encontró el RUN de assets standalone');
  return dockerfile.slice(start, end).replace(/^RUN /, '').replace(/\\\r?\n/g, '\n');
}

async function createFixture(root, branch) {
  const app = join(root, 'app');
  const temp = join(root, 'tmp');
  await mkdir(temp, { recursive: true });
  await mkdir(join(app, branch === 'dapp' ? 'dapp' : ''), { recursive: true });
  await writeFile(join(app, branch === 'dapp' ? 'dapp/server.js' : 'server.js'), 'server');

  const appRoot = branch === 'dapp' ? join(app, 'dapp') : app;
  await mkdir(join(appRoot, '.next/static'), { recursive: true });
  await mkdir(join(appRoot, 'public'), { recursive: true });
  await mkdir(join(appRoot, 'prisma'), { recursive: true });
  await writeFile(join(appRoot, '.next/static/old.txt'), 'old');
  await writeFile(join(appRoot, 'public/old.txt'), 'old');
  await writeFile(join(appRoot, 'prisma/old.prisma'), 'old');

  const sources = {
    'cukies-next-static': ['asset.js', 'static'],
    'cukies-dapp-public': ['asset.txt', 'public'],
    'cukies-dapp-prisma': ['schema.prisma', 'prisma'],
  };
  for (const [directory, [file, contents]] of Object.entries(sources)) {
    const source = join(temp, directory);
    await mkdir(source, { recursive: true });
    await writeFile(join(source, file), contents);
  }
}

async function runAssetPlacement(run, root, branch) {
  const quotedRoot = `'${root.replaceAll("'", "'\\''")}'`;
  const remapped = run.replace(/\/app\b|\/tmp\/cukies-/g, (path) =>
    path === '/app' ? `${quotedRoot}/app` : `${quotedRoot}/tmp/cukies-`);
  await createFixture(root, branch);
  await execFile('sh', ['-eu', '-c', remapped]);

  const appRoot = join(root, 'app', branch === 'dapp' ? 'dapp' : '');
  assert.equal(await readFile(join(appRoot, '.next/static/asset.js'), 'utf8'), 'static');
  assert.equal(await readFile(join(appRoot, 'public/asset.txt'), 'utf8'), 'public');
  assert.equal(await readFile(join(appRoot, 'prisma/schema.prisma'), 'utf8'), 'prisma');
  await assert.rejects(() => readFile(join(appRoot, '.next/static/cukies-next-static/asset.js')));
  await assert.rejects(() => readFile(join(appRoot, 'public/cukies-dapp-public/asset.txt')));
  await assert.rejects(() => readFile(join(appRoot, 'prisma/cukies-dapp-prisma/schema.prisma')));
}

test('el RUN real coloca assets standalone en raíz sin anidamiento en ambas ramas', async () => {
  const dockerfile = await readFile(new URL('../../Dockerfile.ci', import.meta.url), 'utf8');
  const run = extractStandaloneAssetRun(dockerfile);

  for (const branch of ['dapp', 'root']) {
    const root = await mkdtemp('/tmp/cukies-standalone assets-');
    try {
      await runAssetPlacement(run, root, branch);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
