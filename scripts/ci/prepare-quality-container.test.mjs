import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  QualityContainerError,
  decodeNullTerminatedGitRecords,
  materializePinnedTree,
  parseQualityContainerArguments,
} from './prepare-quality-container.mjs';
import {
  PrismaGeneratorPolicyError,
  validatePrismaGenerator,
} from './validate-prisma-generator.mjs';

const SHA = 'a'.repeat(40);
const ROOT = new URL('../../', import.meta.url);

test('parser liga workspace, imagen aislada y SHA exacto de forma indivisible', () => {
  assert.deepEqual(parseQualityContainerArguments([
    '--workspace', '/tmp/candidate',
    '--expected-sha', SHA,
    '--image', `cukies-quality:${SHA}`,
  ]), {
    workspace: '/tmp/candidate',
    expectedSha: SHA,
    image: `cukies-quality:${SHA}`,
  });

  for (const argv of [
    [],
    ['--workspace', '/tmp/candidate', '--expected-sha', SHA],
    [
      '--workspace', '/tmp/candidate',
      '--expected-sha', SHA,
      '--image', `cukies-quality:${'b'.repeat(40)}`,
    ],
    [
      '--workspace', '/tmp/candidate',
      '--expected-sha', 'ABC',
      '--image', 'cukies-quality:ABC',
    ],
  ]) {
    assert.throws(() => parseQualityContainerArguments(argv), QualityContainerError);
  }
});

test('rechaza records Git no terminados o con paths que no sean UTF-8 exacto', () => {
  assert.throws(
    () => decodeNullTerminatedGitRecords(Buffer.from('100644 blob deadbeef\tpath')),
    /NUL terminated/,
  );
  assert.throws(
    () => decodeNullTerminatedGitRecords(Buffer.concat([
      Buffer.from(`100644 blob ${'a'.repeat(40)}\tinvalid-`),
      Buffer.from([0xff, 0]),
    ])),
    /valid UTF-8/,
  );
});

test('validador Prisma acepta solo client oficial y detecta generators indentados o encubiertos', () => {
  assert.doesNotThrow(() => validatePrismaGenerator(`
    // generator ignored { provider = "evil" }
    generator client {
      provider = "prisma-client-js"
    }
    datasource db {
      provider = "mongodb"
      url = env("generator is data, not syntax")
    }
  `));

  for (const schema of [
    `
      generator client { provider = "prisma-client-js" }
        generator evil { provider = "definitely-not-installed" }
    `,
    'generator client { provider = "prisma-client-js" output = "./generated" }',
    'generator client { provider = env("PRISMA_GENERATOR") }',
    'generator client { provider = "prisma-client-js" ',
    '/* generator client { provider = "prisma-client-js" }',
  ]) {
    assert.throws(() => validatePrismaGenerator(schema), PrismaGeneratorPolicyError);
  }
});

test('materializa blobs exactos sin obedecer export-ignore ni export-subst', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'quality-tree-'));
  const repository = path.join(fixture, 'repository');
  const destination = path.join(fixture, 'materialized');
  try {
    mkdirSync(repository);
    mkdirSync(destination);
    execFileSync('git', ['init', '--quiet'], { cwd: repository });
    execFileSync('git', ['config', 'user.email', 'quality@example.invalid'], { cwd: repository });
    execFileSync('git', ['config', 'user.name', 'Quality Test'], { cwd: repository });
    writeFileSync(
      path.join(repository, '.gitattributes'),
      'hidden.txt export-ignore\nsubstituted.txt export-subst\n',
    );
    writeFileSync(path.join(repository, 'hidden.txt'), 'must remain in candidate\n');
    writeFileSync(path.join(repository, 'substituted.txt'), '$Format:%H$\n');
    execFileSync('git', ['add', '.'], { cwd: repository });
    execFileSync('git', ['commit', '--quiet', '-m', 'adversarial attributes'], {
      cwd: repository,
    });
    const expectedSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
    }).trim();

    const entries = materializePinnedTree({
      workspace: repository,
      expectedSha,
      destination,
    });
    assert.ok(entries.some(({ path: entryPath }) => entryPath === 'hidden.txt'));
    assert.equal(readFileSync(path.join(destination, 'hidden.txt'), 'utf8'), 'must remain in candidate\n');
    assert.equal(readFileSync(path.join(destination, 'substituted.txt'), 'utf8'), '$Format:%H$\n');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('rechaza node_modules preenvenenado aunque el candidato lo fuerce en Git', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'quality-node-modules-'));
  const repository = path.join(fixture, 'repository');
  const destination = path.join(fixture, 'materialized');
  try {
    mkdirSync(path.join(repository, 'dapp', 'node_modules', '.bin'), { recursive: true });
    mkdirSync(destination);
    execFileSync('git', ['init', '--quiet'], { cwd: repository });
    execFileSync('git', ['config', 'user.email', 'quality@example.invalid'], { cwd: repository });
    execFileSync('git', ['config', 'user.name', 'Quality Test'], { cwd: repository });
    writeFileSync(path.join(repository, 'dapp', 'node_modules', '.bin', 'jest'), 'exit 0\n');
    execFileSync('git', ['add', '-f', 'dapp/node_modules/.bin/jest'], { cwd: repository });
    execFileSync('git', ['commit', '--quiet', '-m', 'poisoned tool'], { cwd: repository });
    const expectedSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
    }).trim();

    assert.throws(
      () => materializePinnedTree({ workspace: repository, expectedSha, destination }),
      /unsafe tracked path/,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('Containerfile fija base, install inerte y tooling root-owned sin ejecutar Prisma', () => {
  const source = readFileSync(new URL('scripts/ci/quality-container.Containerfile', ROOT), 'utf8');
  assert.match(
    source,
    /^FROM node:22\.19\.0-bookworm-slim@sha256:[0-9a-f]{64}$/m,
  );
  assert.match(source, /COPY --chown=root:root .*\/opt\/cukies-quality\/source-manifest\.json/);
  assert.match(source, /COPY --chown=root:root .*\/opt\/cukies-quality\/run-quality-gate\.mjs/);
  assert.match(
    source,
    /COPY --chown=root:root .*\/opt\/cukies-quality\/validate-prisma-generator\.mjs/,
  );
  assert.match(source, /RUN chmod -R a-w \/opt\/cukies-quality/);
  assert.match(source, /^ARG QUALITY_EXPECTED_SHA$/m);
  assert.match(source, /^LABEL com\.cukies\.quality\.target-sha=\$QUALITY_EXPECTED_SHA$/m);
  assert.match(source, /^USER node$/m);
  assert.match(source, /pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile/);
  assert.doesNotMatch(source, /prisma generate/);
  assert.match(
    source,
    /\/usr\/local\/bin\/node \/opt\/cukies-quality\/validate-prisma-generator\.mjs/,
  );
  assert.match(source, /\/usr\/local\/bin\/node \/opt\/cukies-quality\/verify-quality-source\.mjs/);
  assert.doesNotMatch(source, /--mount|--secret/);
});

test('wrapper ejecuta Prisma solo por opt-in y revalida fuentes antes del gate', () => {
  const source = readFileSync(new URL('scripts/ci/run-quality-gate.mjs', ROOT), 'utf8');
  assert.match(source, /const SYSTEM_NODE = '\/usr\/local\/bin\/node'/);
  assert.match(source, /const SYSTEM_PNPM = '\/usr\/local\/bin\/pnpm'/);
  assert.match(source, /validate-prisma-generator\.mjs/);
  assert.match(source, /args\[0\] === '--with-prisma'/);
  assert.match(source, /'--fail-if-no-match'/);
  assert.match(source, /'exec', 'prisma', 'generate'/);
  const policyRun = source.indexOf('const policyStatus = run');
  const prismaRun = source.indexOf('const prismaStatus = run');
  const sourceRun = source.indexOf('const sourceStatus = run');
  const gateRun = source.indexOf('process.exit(run(command, commandArgs))');
  assert.ok(policyRun >= 0 && policyRun < prismaRun);
  assert.ok(prismaRun < sourceRun);
  assert.ok(sourceRun < gateRun);
  assert.doesNotMatch(source, /pnpm exec node/);
});

test('verificador detecta mutaciones y archivos fuente añadidos fuera de node_modules', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'quality-source-'));
  try {
    const workspace = path.join(fixture, 'workspace');
    const manifestPath = path.join(fixture, 'manifest.json');
    mkdirSync(path.join(workspace, 'src'), { recursive: true });
    writeFileSync(path.join(workspace, 'src', 'gate.ts'), 'export const gate = true;\n');
    const bytes = readFileSync(path.join(workspace, 'src', 'gate.ts'));
    writeFileSync(manifestPath, JSON.stringify({
      schemaVersion: 1,
      expectedSha: SHA,
      entries: [{
        path: 'src/gate.ts',
        type: 'file',
        mode: '100644',
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }],
    }));
    const verifier = fileURLToPath(new URL('scripts/ci/verify-quality-source.mjs', ROOT));

    execFileSync(process.execPath, [verifier, workspace, manifestPath]);
    writeFileSync(path.join(workspace, 'src', 'gate.ts'), 'export const gate = false;\n');
    const mutation = spawnSync(process.execPath, [verifier, workspace, manifestPath], {
      encoding: 'utf8',
    });
    assert.notEqual(mutation.status, 0);
    assert.match(mutation.stderr, /source changed/);

    writeFileSync(path.join(workspace, 'src', 'gate.ts'), bytes);
    writeFileSync(path.join(workspace, 'src', 'injected.ts'), 'export default true;\n');
    const injection = spawnSync(process.execPath, [verifier, workspace, manifestPath], {
      encoding: 'utf8',
    });
    assert.notEqual(injection.status, 0);
    assert.match(injection.stderr, /Unexpected candidate source/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
