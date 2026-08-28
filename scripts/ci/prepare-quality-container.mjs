#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const QUALITY_IMAGE_PATTERN = /^cukies-quality:([0-9a-f]{40})$/;
const ASSET_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

export class QualityContainerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QualityContainerError';
  }
}

export function parseQualityContainerArguments(argv) {
  const parsed = {};
  const properties = new Map([
    ['--workspace', 'workspace'],
    ['--expected-sha', 'expectedSha'],
    ['--image', 'image'],
  ]);
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const property = properties.get(argument);
    if (!property || seen.has(argument)) {
      throw new QualityContainerError(`Unknown or repeated argument: ${argument}.`);
    }
    const value = argv[index + 1];
    if (typeof value !== 'string' || value === '' || value.startsWith('--')) {
      throw new QualityContainerError(`Missing value for ${argument}.`);
    }
    parsed[property] = value;
    seen.add(argument);
    index += 1;
  }

  if (typeof parsed.workspace !== 'string') {
    throw new QualityContainerError('--workspace is required.');
  }
  if (!FULL_GIT_SHA_PATTERN.test(parsed.expectedSha ?? '')) {
    throw new QualityContainerError('--expected-sha must be an exact lowercase 40-hex Git SHA.');
  }
  const imageMatch = QUALITY_IMAGE_PATTERN.exec(parsed.image ?? '');
  if (!imageMatch || imageMatch[1] !== parsed.expectedSha) {
    throw new QualityContainerError('--image must be cukies-quality:<expected-sha>.');
  }
  return parsed;
}

function run(command, args, options = {}) {
  const {
    capture = false,
    operation = command,
    ...spawnOptions
  } = options;
  const result = spawnSync(command, args, {
    encoding: capture ? 'utf8' : undefined,
    maxBuffer: 32 * 1024 * 1024,
    shell: false,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...spawnOptions,
  });
  if (result?.error || result?.signal || result?.status !== 0) {
    throw new QualityContainerError(`${operation} failed.`);
  }
  return capture ? result.stdout.trim() : '';
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function runBuffer(command, args, { operation = command } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result?.error || result?.signal || result?.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new QualityContainerError(`${operation} failed.`);
  }
  return result.stdout;
}

function gitBlobId(bytes) {
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

export function decodeNullTerminatedGitRecords(rawTree) {
  if (!Buffer.isBuffer(rawTree)) {
    throw new QualityContainerError('Pinned candidate tree output is invalid.');
  }

  const records = [];
  let recordStart = 0;
  for (let index = 0; index < rawTree.length; index += 1) {
    if (rawTree[index] !== 0) continue;
    if (index === recordStart) {
      throw new QualityContainerError('Pinned candidate tree contains an empty entry.');
    }

    const recordBytes = rawTree.subarray(recordStart, index);
    const record = recordBytes.toString('utf8');
    if (!Buffer.from(record, 'utf8').equals(recordBytes)) {
      throw new QualityContainerError('Pinned candidate path is not valid UTF-8.');
    }
    records.push(record);
    recordStart = index + 1;
  }

  if (recordStart !== rawTree.length) {
    throw new QualityContainerError('Pinned candidate tree output is not NUL terminated.');
  }
  return records;
}

export function materializePinnedTree({ workspace, expectedSha, destination }) {
  if (!FULL_GIT_SHA_PATTERN.test(expectedSha ?? '')) {
    throw new QualityContainerError('Pinned tree materialization requires an exact Git SHA.');
  }
  const rawTree = runBuffer(
    'git',
    ['-C', workspace, 'ls-tree', '-rz', '--full-tree', expectedSha],
    { operation: 'Pinned candidate tree enumeration' },
  );
  const entries = [];
  for (const rawEntry of decodeNullTerminatedGitRecords(rawTree)) {
    const match = /^([0-7]{6}) (blob|commit) ([0-9a-f]{40})\t([\s\S]+)$/.exec(rawEntry);
    if (!match || match[2] !== 'blob') {
      throw new QualityContainerError('Pinned candidate contains an unsupported Git tree entry.');
    }
    const [, mode, , objectId, relativePath] = match;
    const pathParts = relativePath.split('/');
    if (
      !['100644', '100755', '120000'].includes(mode)
      || relativePath === ''
      || path.isAbsolute(relativePath)
      || pathParts.includes('..')
      || pathParts.includes('node_modules')
      || relativePath === '.quality'
      || relativePath.startsWith('.quality/')
    ) {
      throw new QualityContainerError('Pinned candidate contains an unsafe tracked path.');
    }
    const bytes = runBuffer(
      'git',
      ['-C', workspace, 'cat-file', 'blob', objectId],
      { operation: 'Pinned candidate blob read' },
    );
    if (gitBlobId(bytes) !== objectId) {
      throw new QualityContainerError(
        `Pinned candidate blob is corrupt: ${JSON.stringify(relativePath)}.`,
      );
    }
    const absolutePath = path.join(destination, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    if (mode === '120000') {
      const symlinkTarget = bytes.toString('utf8');
      if (!Buffer.from(symlinkTarget, 'utf8').equals(bytes) || symlinkTarget.includes('\0')) {
        throw new QualityContainerError(
          `Pinned candidate symlink target is invalid: ${JSON.stringify(relativePath)}.`,
        );
      }
      symlinkSync(symlinkTarget, absolutePath);
    } else {
      writeFileSync(absolutePath, bytes, { mode: mode === '100755' ? 0o755 : 0o644 });
    }
    entries.push({
      path: relativePath,
      type: mode === '120000' ? 'symlink' : 'file',
      mode,
      sha256: sha256(bytes),
    });
  }
  if (entries.length === 0) {
    throw new QualityContainerError('Pinned candidate tree is empty.');
  }
  return entries;
}

export function prepareQualityContainer({
  workspace,
  expectedSha,
  image,
  temporaryRoot = process.env.RUNNER_TEMP ?? tmpdir(),
} = {}) {
  if (!FULL_GIT_SHA_PATTERN.test(expectedSha ?? '')) {
    throw new QualityContainerError('Container preparation requires an exact Git SHA.');
  }
  const imageMatch = QUALITY_IMAGE_PATTERN.exec(image ?? '');
  if (!imageMatch || imageMatch[1] !== expectedSha) {
    throw new QualityContainerError('Container image identity must match the exact Git SHA.');
  }

  const resolvedWorkspace = realpathSync(workspace);
  const head = run('git', ['-C', resolvedWorkspace, 'rev-parse', 'HEAD'], {
    capture: true,
    operation: 'Candidate HEAD preflight',
  });
  if (head !== expectedSha) {
    throw new QualityContainerError('Candidate checkout does not match the expected SHA.');
  }
  run('git', ['-C', resolvedWorkspace, 'diff', '--no-ext-diff', '--quiet', expectedSha, '--'], {
    operation: 'Candidate tracked-tree preflight',
  });
  const untracked = run(
    'git',
    ['-C', resolvedWorkspace, 'status', '--porcelain', '--untracked-files=all'],
    { capture: true, operation: 'Candidate untracked-tree preflight' },
  );
  if (untracked !== '') {
    throw new QualityContainerError('Candidate checkout contains untracked or modified files.');
  }

  const temporaryDirectory = mkdtempSync(
    path.join(realpathSync(temporaryRoot), 'cukies-quality-context-'),
  );
  const contextPath = path.join(temporaryDirectory, 'context');
  try {
    mkdirSync(contextPath);
    const candidateEntries = materializePinnedTree({
      workspace: resolvedWorkspace,
      expectedSha,
      destination: contextPath,
    });
    const reservedDirectory = path.join(contextPath, '.quality');
    const manifest = {
      schemaVersion: 1,
      expectedSha,
      entries: candidateEntries,
    };
    mkdirSync(reservedDirectory);
    writeFileSync(
      path.join(reservedDirectory, 'source-manifest.json'),
      `${JSON.stringify(manifest)}\n`,
      { mode: 0o444 },
    );
    for (const asset of [
      'quality-container.Containerfile',
      'quality-container.Containerfile.dockerignore',
      'run-quality-gate.mjs',
      'validate-prisma-generator.mjs',
      'verify-quality-source.mjs',
    ]) {
      writeFileSync(
        path.join(reservedDirectory, asset),
        readFileSync(path.join(ASSET_DIRECTORY, asset)),
        { mode: 0o444 },
      );
    }

    run(
      'docker',
      [
        'build',
        '--pull',
        '--no-cache',
        '--tag', image,
        '--build-arg', `QUALITY_EXPECTED_SHA=${expectedSha}`,
        '--file', path.join(reservedDirectory, 'quality-container.Containerfile'),
        contextPath,
      ],
      { operation: 'Immutable quality image build' },
    );
    const imageId = run('docker', ['image', 'inspect', '--format={{.Id}}', image], {
      capture: true,
      operation: 'Quality image identity preflight',
    });
    if (!/^sha256:[0-9a-f]{64}$/.test(imageId)) {
      throw new QualityContainerError('Docker returned an invalid quality image identity.');
    }
    const imageTargetSha = run(
      'docker',
      [
        'image', 'inspect',
        '--format={{ index .Config.Labels "com.cukies.quality.target-sha" }}',
        imageId,
      ],
      { capture: true, operation: 'Quality image target label preflight' },
    );
    if (imageTargetSha !== expectedSha) {
      throw new QualityContainerError('Quality image label does not match the expected Git SHA.');
    }
    return { image, imageId, expectedSha };
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function isMainModule() {
  return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  try {
    const result = prepareQualityContainer(parseQualityContainerArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[quality-container] ${message}\n`);
    process.exitCode = 1;
  }
}
