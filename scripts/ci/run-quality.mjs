#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PNPM = 'pnpm';
const NODE = 'node';
const CONTAINER_PNPM = '/usr/local/bin/pnpm';
const CONTAINER_NODE = '/usr/local/bin/node';
const CONTAINER_GATE = '/opt/cukies-quality/run-quality-gate.mjs';
const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const QUALITY_IMAGE_PATTERN = /^sha256:[0-9a-f]{64}$/;

function commandStep(id, command, args, { prepare } = {}) {
  if (![NODE, PNPM].includes(command) || (prepare !== undefined && prepare !== 'prisma')) {
    throw new QualityRunnerError(`Invalid trusted quality step: ${id}.`);
  }
  return Object.freeze({
    id,
    command,
    args: Object.freeze([...args]),
    ...(prepare === undefined ? {} : { prepare }),
  });
}

function nodeStep(id, ...args) {
  return commandStep(id, NODE, args);
}

function workspaceStep(id, selector, args, options) {
  return commandStep(
    id,
    PNPM,
    ['--filter', selector, '--fail-if-no-match', ...args],
    options,
  );
}

export const QUICK_QUALITY_STEPS = Object.freeze([
  nodeStep(
    'policy:staging-guards',
    '--test',
    'scripts/assert-staging-only.test.mjs',
    'scripts/docker-compose-coolify.test.mjs',
  ),
  nodeStep(
    'policy:release',
    '--test',
    'scripts/release/configure-branch-protection.test.mjs',
    'scripts/release/promotion-policy.test.mjs',
    'scripts/release/release-documentation.test.mjs',
    'scripts/release/verify-attestations.test.mjs',
    'scripts/release/verify-deployment.test.mjs',
    'scripts/release/verify-promotion-merge.test.mjs',
    'scripts/release/workflows.test.mjs',
  ),
  nodeStep(
    'policy:ci',
    '--test',
    'scripts/ci/run-quality.test.mjs',
    'scripts/ci/ci-workflow.test.mjs',
    'scripts/ci/quality-baseline.test.mjs',
    'scripts/ci/prepare-quality-container.test.mjs',
  ),
  workspaceStep(
    'dapp:prisma-generate',
    'dapp',
    ['exec', 'prisma', 'generate', '--schema', 'prisma/schema.prisma'],
  ),
  workspaceStep('dapp:lint', 'dapp', ['run', 'lint']),
  workspaceStep('dapp:typecheck', 'dapp', ['run', 'typecheck'], { prepare: 'prisma' }),
  workspaceStep('dapp:test', 'dapp', ['run', 'test:ci'], { prepare: 'prisma' }),
  workspaceStep(
    'dapp:test-schedulers',
    'dapp',
    ['run', 'test:schedulers'],
    { prepare: 'prisma' },
  ),
  nodeStep(
    'dapp:test-staging-economy-policy',
    '--test',
    'dapp/scripts/staging-economy-rules-policy.test.mjs',
  ),
  workspaceStep('sybil-slayer:lint', 'sybil-slayer', ['run', 'lint']),
  workspaceStep('sybil-slayer:typecheck', 'sybil-slayer', ['run', 'typecheck']),
  workspaceStep('hyppie-road:lint', 'hyppie-road', ['run', 'lint']),
  workspaceStep('hyppie-road:typecheck', 'hyppie-road', ['run', 'typecheck']),
  workspaceStep('tower-builder:lint', 'tower-builder', ['run', 'lint']),
  workspaceStep('tower-builder:typecheck', 'tower-builder', ['run', 'typecheck']),
  workspaceStep('game-bridge:lint', '@hyppie/game-bridge', ['run', 'lint']),
  workspaceStep('game-bridge:typecheck', '@hyppie/game-bridge', ['run', 'typecheck']),
  workspaceStep('chain-indexer:typecheck', '@cukies/chain-indexer', ['run', 'typecheck']),
  workspaceStep('chain-indexer:test', '@cukies/chain-indexer', ['run', 'test']),
  workspaceStep('card-worker:typecheck', '@cukies/cuki-card-worker', ['run', 'typecheck']),
  workspaceStep('card-worker:test', '@cukies/cuki-card-worker', ['run', 'test']),
  workspaceStep('contracts:test', '@cukies/contracts', ['run', 'test']),
]);

export const CANDIDATE_BUILD_STEPS = Object.freeze([
  workspaceStep('dapp:build', 'dapp', ['run', 'build'], { prepare: 'prisma' }),
  workspaceStep('sybil-slayer:build', 'sybil-slayer', ['run', 'build']),
  workspaceStep('hyppie-road:build', 'hyppie-road', ['run', 'build']),
  workspaceStep('tower-builder:build', 'tower-builder', ['run', 'build']),
  workspaceStep('chain-indexer:build', '@cukies/chain-indexer', ['run', 'build']),
  workspaceStep('card-worker:build', '@cukies/cuki-card-worker', ['run', 'build']),
  workspaceStep('contracts:compile', '@cukies/contracts', ['run', 'compile']),
]);

export const CANDIDATE_QUALITY_STEPS = Object.freeze([
  ...QUICK_QUALITY_STEPS,
  ...CANDIDATE_BUILD_STEPS,
]);

export const QUALITY_PROFILES = Object.freeze({
  quick: QUICK_QUALITY_STEPS,
  candidate: CANDIDATE_QUALITY_STEPS,
});

export const QUALITY_RUNNER_USAGE = [
  'Usage: node scripts/ci/run-quality.mjs --profile <quick|candidate> --workspace <path> [--expected-sha <40-hex> --container-image <sha256:64-hex>]',
  '',
  'Options:',
  '  --profile <name>   Quality profile to execute (default: quick).',
  '  --workspace <path> Monorepo root, absolute or relative to the current directory.',
  '  --expected-sha <sha> Pin and revalidate the host checkout around isolated CI.',
  '  --container-image <id> Run every gate from one verified immutable image ID.',
  '  --help             Show this help.',
].join('\n');

export class QualityRunnerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QualityRunnerError';
  }
}

export function parseQualityArguments(argv) {
  const parsed = { profile: 'quick', workspace: '.' };
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help') {
      if (seen.has(argument)) {
        throw new QualityRunnerError('--help cannot be repeated.');
      }
      parsed.help = true;
      seen.add(argument);
      continue;
    }

    if (
      argument !== '--profile'
      && argument !== '--workspace'
      && argument !== '--expected-sha'
      && argument !== '--container-image'
    ) {
      throw new QualityRunnerError(`Unknown argument: ${argument}.`);
    }
    if (seen.has(argument)) {
      throw new QualityRunnerError(`${argument} cannot be repeated.`);
    }

    const value = argv[index + 1];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      throw new QualityRunnerError(`Missing value for ${argument}.`);
    }

    if (argument === '--profile') parsed.profile = value;
    if (argument === '--workspace') parsed.workspace = value;
    if (argument === '--expected-sha') parsed.expectedSha = value;
    if (argument === '--container-image') parsed.containerImage = value;
    seen.add(argument);
    index += 1;
  }

  if (!Object.hasOwn(QUALITY_PROFILES, parsed.profile)) {
    throw new QualityRunnerError(
      `Unsupported quality profile: ${parsed.profile}. Expected quick or candidate.`,
    );
  }
  if (parsed.expectedSha !== undefined && !FULL_GIT_SHA_PATTERN.test(parsed.expectedSha)) {
    throw new QualityRunnerError('--expected-sha must be an exact lowercase 40-hex Git SHA.');
  }
  if (parsed.containerImage !== undefined && !QUALITY_IMAGE_PATTERN.test(parsed.containerImage)) {
    throw new QualityRunnerError('--container-image must be an immutable sha256:<64-hex> image ID.');
  }
  if ((parsed.expectedSha === undefined) !== (parsed.containerImage === undefined)) {
    throw new QualityRunnerError(
      '--expected-sha and --container-image must be provided together for isolated CI.',
    );
  }

  return parsed;
}

function gitObjectId(bytes) {
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

function runGit(workspace, args, spawnSyncFn = spawnSync) {
  const result = spawnSyncFn('git', ['-C', workspace, ...args], {
    cwd: workspace,
    encoding: 'buffer',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result?.error || result?.signal || result?.status !== 0 || !Buffer.isBuffer(result?.stdout)) {
    throw new QualityRunnerError('Workspace integrity could not read the pinned Git target.');
  }
  return result.stdout;
}

function parsePinnedTree(rawTree) {
  const entries = [];
  for (const rawEntry of rawTree.toString('utf8').split('\0')) {
    if (rawEntry === '') continue;
    const match = /^([0-7]{6}) (blob|commit) ([0-9a-f]{40})\t([\s\S]+)$/.exec(rawEntry);
    if (!match || match[2] !== 'blob') {
      throw new QualityRunnerError('Workspace integrity found an unsupported Git tree entry.');
    }
    const [, mode, , objectId, relativePath] = match;
    if (
      relativePath === ''
      || path.isAbsolute(relativePath)
      || relativePath.split('/').includes('..')
      || relativePath.includes('\0')
    ) {
      throw new QualityRunnerError('Workspace integrity found an unsafe tracked path.');
    }
    entries.push(Object.freeze({ mode, objectId, relativePath }));
  }
  if (entries.length === 0) {
    throw new QualityRunnerError('Workspace integrity resolved an empty Git tree.');
  }
  return Object.freeze(entries);
}

export function createTrackedWorkspaceGuard({
  workspace,
  expectedSha,
  gitSpawnSyncFn = spawnSync,
} = {}) {
  if (!FULL_GIT_SHA_PATTERN.test(expectedSha ?? '')) {
    throw new QualityRunnerError('Workspace integrity requires an exact lowercase 40-hex Git SHA.');
  }
  const resolvedWorkspace = path.resolve(workspace);
  const head = runGit(resolvedWorkspace, ['rev-parse', 'HEAD'], gitSpawnSyncFn)
    .toString('utf8')
    .trim();
  if (head !== expectedSha) {
    throw new QualityRunnerError('Workspace HEAD does not match the pinned quality target.');
  }
  const entries = parsePinnedTree(
    runGit(resolvedWorkspace, ['ls-tree', '-rz', '--full-tree', expectedSha], gitSpawnSyncFn),
  );

  return Object.freeze({
    verify(label = 'quality step') {
      for (const { mode, objectId, relativePath } of entries) {
        const absolutePath = path.join(resolvedWorkspace, relativePath);
        let stats;
        let bytes;
        try {
          stats = lstatSync(absolutePath);
          if (mode === '120000') {
            if (!stats.isSymbolicLink()) throw new Error('mode mismatch');
            bytes = Buffer.from(readlinkSync(absolutePath));
          } else {
            if (!stats.isFile()) throw new Error('mode mismatch');
            const actualMode = (stats.mode & 0o111) === 0 ? '100644' : '100755';
            if (mode !== actualMode) throw new Error('mode mismatch');
            bytes = readFileSync(absolutePath);
          }
        } catch {
          throw new QualityRunnerError(
            `Workspace integrity changed at ${label}: ${relativePath}.`,
          );
        }
        if (gitObjectId(bytes) !== objectId) {
          throw new QualityRunnerError(
            `Workspace integrity changed at ${label}: ${relativePath}.`,
          );
        }
      }
    },
  });
}

export function resolveWorkspacePath(workspace, currentWorkingDirectory = process.cwd()) {
  if (typeof workspace !== 'string' || workspace.length === 0) {
    throw new QualityRunnerError('Workspace path must be a non-empty string.');
  }
  return path.resolve(currentWorkingDirectory, workspace);
}

function writeLine(stream, message) {
  stream.write(`${message}\n`);
}

function commandForDisplay({ command, args }) {
  return [command, ...args].join(' ');
}

function normalizeExitStatus(result, stepId, stderr) {
  if (result?.error) {
    writeLine(stderr, `[quality] ${stepId} could not start: ${result.error.message}`);
    return 1;
  }
  if (result?.signal) {
    writeLine(stderr, `[quality] ${stepId} terminated by signal ${result.signal}.`);
    return 1;
  }
  if (!Number.isInteger(result?.status) || result.status < 0 || result.status > 255) {
    writeLine(stderr, `[quality] ${stepId} returned no valid exit code.`);
    return 1;
  }
  return result.status;
}

export function inspectQualityImage({
  imageId,
  expectedSha,
  spawnSyncFn = spawnSync,
} = {}) {
  if (!QUALITY_IMAGE_PATTERN.test(imageId ?? '')) {
    throw new QualityRunnerError('Quality image must use an immutable sha256 image ID.');
  }
  if (!FULL_GIT_SHA_PATTERN.test(expectedSha ?? '')) {
    throw new QualityRunnerError('Quality image inspection requires an exact Git SHA.');
  }

  const result = spawnSyncFn(
    'docker',
    [
      'image',
      'inspect',
      '--format={{.Id}}\t{{ index .Config.Labels "com.cukies.quality.target-sha" }}',
      imageId,
    ],
    {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (
    result?.error
    || result?.signal
    || result?.status !== 0
    || typeof result?.stdout !== 'string'
  ) {
    throw new QualityRunnerError('Immutable quality image could not be inspected.');
  }

  const [actualImageId, targetSha, ...unexpected] = result.stdout.trim().split('\t');
  if (unexpected.length !== 0 || actualImageId !== imageId || targetSha !== expectedSha) {
    throw new QualityRunnerError('Immutable quality image identity does not match the pinned SHA.');
  }
}

function containerCommand(command) {
  if (command === NODE) return CONTAINER_NODE;
  if (command === PNPM) return CONTAINER_PNPM;
  throw new QualityRunnerError(`Unsupported trusted gate command: ${command}.`);
}

export function runQuality({
  profile = 'quick',
  workspace = process.cwd(),
  expectedSha,
  containerImage,
  environment = process.env,
  spawnSyncFn = spawnSync,
  createWorkspaceGuardFn = createTrackedWorkspaceGuard,
  inspectContainerImageFn = inspectQualityImage,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  if (typeof profile !== 'string' || !Object.hasOwn(QUALITY_PROFILES, profile)) {
    throw new QualityRunnerError(
      `Unsupported quality profile: ${String(profile)}. Expected quick or candidate.`,
    );
  }
  if ((expectedSha === undefined) !== (containerImage === undefined)) {
    throw new QualityRunnerError(
      'Pinned quality requires both expectedSha and a fresh containerImage.',
    );
  }
  if (expectedSha !== undefined && !FULL_GIT_SHA_PATTERN.test(expectedSha)) {
    throw new QualityRunnerError('expectedSha must be an exact lowercase 40-hex Git SHA.');
  }
  if (containerImage !== undefined && !QUALITY_IMAGE_PATTERN.test(containerImage)) {
    throw new QualityRunnerError('containerImage must be an immutable sha256:<64-hex> image ID.');
  }
  const steps = QUALITY_PROFILES[profile];
  let workspaceGuard;
  if (expectedSha !== undefined) {
    try {
      workspaceGuard = createWorkspaceGuardFn({ workspace, expectedSha });
      workspaceGuard.verify('quality preflight');
      inspectContainerImageFn({ imageId: containerImage, expectedSha });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(stderr, `[quality] ${message}`);
      return 1;
    }
  }

  const childEnvironment = {
    ...environment,
    CI: '1',
    NEXT_TELEMETRY_DISABLED: '1',
  };

  for (const [index, qualityStep] of steps.entries()) {
    writeLine(
      stdout,
      `[quality] ${index + 1}/${steps.length} ${qualityStep.id}: ${commandForDisplay(qualityStep)}`,
    );

    const invocation = containerImage === undefined
      ? {
          command: qualityStep.command,
          args: [...qualityStep.args],
          options: {
            cwd: workspace,
            env: childEnvironment,
            stdio: 'inherit',
            shell: false,
          },
        }
      : {
          command: 'docker',
          args: [
            'run',
            '--rm',
            '--init',
            '--network', 'none',
            '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges',
            '--pids-limit', '1024',
            '--workdir', '/workspace',
            '--env', 'CI=1',
            '--env', 'NEXT_TELEMETRY_DISABLED=1',
            containerImage,
            CONTAINER_NODE,
            CONTAINER_GATE,
            ...(qualityStep.prepare === 'prisma' ? ['--with-prisma'] : []),
            '--',
            containerCommand(qualityStep.command),
            ...qualityStep.args,
          ],
          options: {
            cwd: workspace,
            env: childEnvironment,
            stdio: 'inherit',
            shell: false,
          },
        };

    let result;
    try {
      result = spawnSyncFn(invocation.command, invocation.args, invocation.options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(stderr, `[quality] ${qualityStep.id} could not start: ${message}`);
      return 1;
    }

    const status = normalizeExitStatus(result, qualityStep.id, stderr);
    if (status !== 0) {
      writeLine(stderr, `[quality] ${qualityStep.id} failed with exit code ${status}.`);
      return status;
    }
  }

  if (workspaceGuard) {
    try {
      workspaceGuard.verify('quality completion');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(stderr, `[quality] ${message}`);
      return 1;
    }
  }

  writeLine(stdout, `[quality] ${profile} profile passed (${steps.length} steps).`);
  return 0;
}

export function runQualityCli({
  argv = process.argv.slice(2),
  currentWorkingDirectory = process.cwd(),
  environment = process.env,
  spawnSyncFn = spawnSync,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  let parsed;
  try {
    parsed = parseQualityArguments(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeLine(stderr, `[quality] ${message}`);
    writeLine(stderr, QUALITY_RUNNER_USAGE);
    return 2;
  }

  if (parsed.help) {
    writeLine(stdout, QUALITY_RUNNER_USAGE);
    return 0;
  }

  return runQuality({
    profile: parsed.profile,
    workspace: resolveWorkspacePath(parsed.workspace, currentWorkingDirectory),
    expectedSha: parsed.expectedSha,
    containerImage: parsed.containerImage,
    environment,
    spawnSyncFn,
    stdout,
    stderr,
  });
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  process.exitCode = runQualityCli();
}
