import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CANDIDATE_BUILD_STEPS,
  CANDIDATE_QUALITY_STEPS,
  QUALITY_PROFILES,
  QUICK_QUALITY_STEPS,
  QualityRunnerError,
  createTrackedWorkspaceGuard,
  inspectQualityImage,
  parseQualityArguments,
  resolveWorkspacePath,
  runQuality,
  runQualityCli,
} from './run-quality.mjs';

const IMMUTABLE_IMAGE_ID = `sha256:${'b'.repeat(64)}`;

function memoryStream() {
  let value = '';
  return {
    stream: { write: (chunk) => { value += String(chunk); } },
    read: () => value,
  };
}

test('expone contratos deterministas, inmutables y candidate contiene quick como prefijo', () => {
  assert.equal(QUALITY_PROFILES.quick, QUICK_QUALITY_STEPS);
  assert.equal(QUALITY_PROFILES.candidate, CANDIDATE_QUALITY_STEPS);
  assert.deepEqual(
    CANDIDATE_QUALITY_STEPS.slice(0, QUICK_QUALITY_STEPS.length),
    QUICK_QUALITY_STEPS,
  );
  assert.deepEqual(
    CANDIDATE_QUALITY_STEPS.slice(QUICK_QUALITY_STEPS.length),
    CANDIDATE_BUILD_STEPS,
  );

  const ids = CANDIDATE_QUALITY_STEPS.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(
    CANDIDATE_QUALITY_STEPS.every(({ command }) => ['node', 'pnpm'].includes(command)),
  );
  assert.ok(CANDIDATE_QUALITY_STEPS.every(Object.isFrozen));
  assert.ok(CANDIDATE_QUALITY_STEPS.every(({ args }) => Object.isFrozen(args)));
  assert.ok(
    CANDIDATE_QUALITY_STEPS.every(({ prepare }) => prepare === undefined || prepare === 'prisma'),
  );
});

test('quick cubre políticas y checks disponibles de todas las áreas requeridas', () => {
  const ids = new Set(QUICK_QUALITY_STEPS.map(({ id }) => id));
  for (const requiredId of [
    'policy:staging-guards',
    'policy:release',
    'policy:ci',
    'dapp:prisma-generate',
    'dapp:lint',
    'dapp:typecheck',
    'dapp:test',
    'dapp:test-schedulers',
    'dapp:test-staging-economy-policy',
    'sybil-slayer:lint',
    'sybil-slayer:typecheck',
    'hyppie-road:lint',
    'hyppie-road:typecheck',
    'tower-builder:lint',
    'tower-builder:typecheck',
    'game-bridge:lint',
    'game-bridge:typecheck',
    'chain-indexer:typecheck',
    'chain-indexer:test',
    'card-worker:typecheck',
    'card-worker:test',
    'contracts:test',
  ]) {
    assert.ok(ids.has(requiredId), `falta el paso ${requiredId}`);
  }

  const ciPolicyStep = QUICK_QUALITY_STEPS.find(({ id }) => id === 'policy:ci');
  assert.equal(ciPolicyStep.command, 'node');
  assert.deepEqual(ciPolicyStep.args.slice(0, 1), ['--test']);
  assert.ok(ciPolicyStep.args.includes('scripts/ci/run-quality.test.mjs'));
  assert.ok(ciPolicyStep.args.includes('scripts/ci/ci-workflow.test.mjs'));
  assert.ok(ciPolicyStep.args.includes('scripts/ci/quality-baseline.test.mjs'));
  assert.ok(ciPolicyStep.args.includes('scripts/ci/prepare-quality-container.test.mjs'));
  assert.ok(!ciPolicyStep.args.includes('verify'));

  for (const qualityStep of CANDIDATE_QUALITY_STEPS) {
    if (qualityStep.args.includes('--filter')) {
      assert.ok(
        qualityStep.args.includes('--fail-if-no-match'),
        `${qualityStep.id} debe fallar si desaparece su workspace`,
      );
    }
  }
});

test('candidate añade únicamente builds y compilación de contratos tras quick', () => {
  assert.deepEqual(CANDIDATE_BUILD_STEPS.map(({ id }) => id), [
    'dapp:build',
    'sybil-slayer:build',
    'hyppie-road:build',
    'tower-builder:build',
    'chain-indexer:build',
    'card-worker:build',
    'contracts:compile',
  ]);
});

test('pnpm devuelve fallo real para un workspace inexistente', () => {
  const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@cukies/workspace-that-must-not-exist',
      '--fail-if-no-match',
      'run',
      'lint',
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      shell: false,
    },
  );

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /No projects matched the filters/);
});

test('parsea perfiles y workspace, con quick y el directorio actual por defecto', () => {
  assert.deepEqual(parseQualityArguments([]), { profile: 'quick', workspace: '.' });
  assert.deepEqual(
    parseQualityArguments([
      '--workspace', '../clean checkout',
      '--profile', 'candidate',
      '--expected-sha', 'a'.repeat(40),
      '--container-image', IMMUTABLE_IMAGE_ID,
    ]),
    {
      profile: 'candidate',
      workspace: '../clean checkout',
      expectedSha: 'a'.repeat(40),
      containerImage: IMMUTABLE_IMAGE_ID,
    },
  );
  assert.deepEqual(parseQualityArguments(['--help']), {
    profile: 'quick',
    workspace: '.',
    help: true,
  });
});

test('rechaza argumentos desconocidos, repetidos, incompletos y perfiles abiertos', () => {
  for (const argv of [
    ['candidate'],
    ['--profile'],
    ['--workspace', '--profile', 'quick'],
    ['--profile', 'quick', '--profile', 'candidate'],
    ['--workspace', '.', '--workspace', '..'],
    ['--expected-sha', 'abc123'],
    ['--expected-sha', 'A'.repeat(40)],
    ['--expected-sha', 'a'.repeat(40)],
    ['--container-image', IMMUTABLE_IMAGE_ID],
    [
      '--expected-sha', 'a'.repeat(40),
      '--container-image', 'attacker.example/candidate:latest',
    ],
    ['--profile', 'best-effort'],
    ['--help', '--help'],
  ]) {
    assert.throws(() => parseQualityArguments(argv), QualityRunnerError);
  }
});

test('guard de integridad detecta cualquier mutacion tracked contra el SHA fijado', () => {
  const repository = mkdtempSync(path.join(tmpdir(), 'quality-integrity-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: repository });
    execFileSync('git', ['config', 'user.email', 'quality@example.invalid'], { cwd: repository });
    execFileSync('git', ['config', 'user.name', 'Quality Test'], { cwd: repository });
    mkdirSync(path.join(repository, 'nested'));
    writeFileSync(path.join(repository, 'nested', 'tracked.txt'), 'pinned\n');
    execFileSync('git', ['add', 'nested/tracked.txt'], { cwd: repository });
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: repository });
    const expectedSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
    }).trim();

    const guard = createTrackedWorkspaceGuard({ workspace: repository, expectedSha });
    guard.verify('clean fixture');
    writeFileSync(path.join(repository, 'nested', 'tracked.txt'), 'rewritten by candidate\n');
    assert.throws(() => guard.verify('after candidate'), /tracked\.txt/);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test('runner ejecuta cada gate en un contenedor nuevo, sin red, mounts ni secretos heredados', () => {
  const calls = [];
  let integrityChecks = 0;
  let imageChecks = 0;
  const expectedSha = 'a'.repeat(40);
  const exitCode = runQuality({
    profile: 'quick',
    workspace: '/tmp/pinned-candidate',
    expectedSha,
    containerImage: IMMUTABLE_IMAGE_ID,
    environment: { CI: '0', PRIVATE_FIXTURE: 'must-not-enter-container' },
    stderr: memoryStream().stream,
    stdout: memoryStream().stream,
    createWorkspaceGuardFn() {
      return {
        verify() { integrityChecks += 1; },
      };
    },
    inspectContainerImageFn({ imageId, expectedSha: inspectedSha }) {
      imageChecks += 1;
      assert.equal(imageId, IMMUTABLE_IMAGE_ID);
      assert.equal(inspectedSha, expectedSha);
    },
    spawnSyncFn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(integrityChecks, 2);
  assert.equal(imageChecks, 1);
  assert.equal(calls.length, QUICK_QUALITY_STEPS.length);
  for (const [index, call] of calls.entries()) {
    assert.equal(call.command, 'docker');
    assert.deepEqual(call.args.slice(0, 11), [
      'run',
      '--rm',
      '--init',
      '--network', 'none',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--pids-limit', '1024',
    ]);
    const imageIndex = call.args.indexOf(IMMUTABLE_IMAGE_ID);
    assert.ok(imageIndex > 0);
    assert.equal(call.args.includes('--volume'), false);
    assert.equal(call.args.includes('--mount'), false);
    assert.equal(call.args.some((value) => value.includes('PRIVATE_FIXTURE')), false);
    const gateArgs = call.args.slice(imageIndex + 1);
    assert.equal(gateArgs[0], '/usr/local/bin/node');
    assert.equal(gateArgs[1], '/opt/cukies-quality/run-quality-gate.mjs');
    const separatorIndex = gateArgs.indexOf('--');
    assert.ok(separatorIndex >= 2);
    assert.equal(
      gateArgs.includes('--with-prisma'),
      QUICK_QUALITY_STEPS[index].prepare === 'prisma',
    );
    const expectedCommand = QUICK_QUALITY_STEPS[index].command === 'node'
      ? '/usr/local/bin/node'
      : '/usr/local/bin/pnpm';
    assert.deepEqual(
      gateArgs.slice(separatorIndex + 1),
      [expectedCommand, ...QUICK_QUALITY_STEPS[index].args],
    );
    assert.equal(call.options.shell, false);
  }
});

test('inspecciona ID y label de la imagen y falla antes de ejecutar ante cualquier mismatch', () => {
  assert.doesNotThrow(() => inspectQualityImage({
    imageId: IMMUTABLE_IMAGE_ID,
    expectedSha: 'a'.repeat(40),
    spawnSyncFn(command, args, options) {
      assert.equal(command, 'docker');
      assert.deepEqual(args.slice(0, 2), ['image', 'inspect']);
      assert.equal(args.at(-1), IMMUTABLE_IMAGE_ID);
      assert.equal(options.shell, false);
      return {
        status: 0,
        stdout: `${IMMUTABLE_IMAGE_ID}\t${'a'.repeat(40)}\n`,
      };
    },
  }));

  let gateCalls = 0;
  const stderr = memoryStream();
  const exitCode = runQuality({
    profile: 'quick',
    workspace: '/tmp/pinned-candidate',
    expectedSha: 'a'.repeat(40),
    containerImage: IMMUTABLE_IMAGE_ID,
    stderr: stderr.stream,
    stdout: memoryStream().stream,
    createWorkspaceGuardFn() {
      return { verify() {} };
    },
    inspectContainerImageFn() {
      throw new QualityRunnerError('image label mismatch');
    },
    spawnSyncFn() {
      gateCalls += 1;
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(gateCalls, 0);
  assert.match(stderr.read(), /image label mismatch/);
});

test('resuelve workspace relativo o absoluto sin interpolarlo en un shell', () => {
  const cwd = path.resolve('/tmp', 'quality-root');
  assert.equal(resolveWorkspacePath('../checkout', cwd), path.resolve('/tmp', 'checkout'));

  const absolute = path.resolve('/tmp', 'quality checkout');
  assert.equal(resolveWorkspacePath(absolute, cwd), absolute);
  assert.throws(() => resolveWorkspacePath('', cwd), QualityRunnerError);
});

test('ejecuta quick secuencialmente con comandos cerrados, entorno CI forzado y shell desactivado', () => {
  const calls = [];
  const stdout = memoryStream();
  const stderr = memoryStream();
  const environment = { CI: '0', NEXT_TELEMETRY_DISABLED: '0', KEEP_ME: 'yes' };
  const workspace = path.resolve('/tmp', 'repo with spaces');

  const exitCode = runQuality({
    profile: 'quick',
    workspace,
    environment,
    stdout: stdout.stream,
    stderr: stderr.stream,
    spawnSyncFn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(calls.length, QUICK_QUALITY_STEPS.length);
  assert.deepEqual(
    calls.map(({ command, args }) => ({ command, args })),
    QUICK_QUALITY_STEPS.map(({ command, args }) => ({ command, args: [...args] })),
  );
  for (const { options } of calls) {
    assert.equal(options.cwd, workspace);
    assert.equal(options.shell, false);
    assert.equal(options.stdio, 'inherit');
    assert.equal(options.env.CI, '1');
    assert.equal(options.env.NEXT_TELEMETRY_DISABLED, '1');
    assert.equal(options.env.KEEP_ME, 'yes');
  }
  assert.match(stdout.read(), /quick profile passed/);
  assert.equal(stderr.read(), '');
});

test('corta en el primer fallo y propaga exactamente su exit code', () => {
  const calls = [];
  const stdout = memoryStream();
  const stderr = memoryStream();
  const failureIndex = 3;

  const exitCode = runQuality({
    profile: 'quick',
    workspace: '/tmp/repo',
    stdout: stdout.stream,
    stderr: stderr.stream,
    spawnSyncFn(command, args) {
      calls.push({ command, args });
      return { status: calls.length - 1 === failureIndex ? 23 : 0 };
    },
  });

  assert.equal(exitCode, 23);
  assert.equal(calls.length, failureIndex + 1);
  assert.match(stderr.read(), /failed with exit code 23/);
  assert.doesNotMatch(stdout.read(), /profile passed/);
});

test('guards, TypeScript y tests fallan cerrado de forma controlada', () => {
  for (const criticalStepId of [
    'policy:staging-guards',
    'policy:release',
    'dapp:typecheck',
    'dapp:test',
    'contracts:test',
  ]) {
    const failureIndex = QUICK_QUALITY_STEPS.findIndex(({ id }) => id === criticalStepId);
    assert.notEqual(failureIndex, -1, `falta el gate critico ${criticalStepId}`);

    let calls = 0;
    const exitCode = runQuality({
      profile: 'quick',
      workspace: '/tmp/repo',
      stdout: memoryStream().stream,
      stderr: memoryStream().stream,
      spawnSyncFn() {
        const status = calls === failureIndex ? 19 : 0;
        calls += 1;
        return { status };
      },
    });

    assert.equal(exitCode, 19, `${criticalStepId} debe propagar su fallo`);
    assert.equal(calls, failureIndex + 1, `${criticalStepId} debe detener los pasos posteriores`);
  }
});

test('runQuality rechaza perfiles heredados del prototipo antes de ejecutar', () => {
  let calls = 0;
  assert.throws(
    () => runQuality({
      profile: 'toString',
      spawnSyncFn() {
        calls += 1;
        return { status: 0 };
      },
    }),
    QualityRunnerError,
  );
  assert.equal(calls, 0);
});

test('falla cerrado si el proceso no arranca, lanza excepción o termina por señal', () => {
  for (const spawnSyncFn of [
    () => ({ error: new Error('pnpm missing'), status: null }),
    () => { throw new Error('spawn exploded'); },
    () => ({ status: null, signal: 'SIGTERM' }),
    () => ({ status: null }),
  ]) {
    const stdout = memoryStream();
    const stderr = memoryStream();
    const exitCode = runQuality({
      stdout: stdout.stream,
      stderr: stderr.stream,
      spawnSyncFn,
    });

    assert.equal(exitCode, 1);
    assert.match(stderr.read(), /could not start|terminated by signal|no valid exit code/);
    assert.doesNotMatch(stdout.read(), /profile passed/);
  }
});

test('el CLI acepta workspace relativo, ejecuta candidate y devuelve el resultado del runner', () => {
  const calls = [];
  const stdout = memoryStream();
  const stderr = memoryStream();
  const cwd = path.resolve('/tmp', 'launcher');

  const exitCode = runQualityCli({
    argv: ['--profile', 'candidate', '--workspace', '../checkout'],
    currentWorkingDirectory: cwd,
    environment: { SOURCE: 'unit-test' },
    stdout: stdout.stream,
    stderr: stderr.stream,
    spawnSyncFn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(calls.length, CANDIDATE_QUALITY_STEPS.length);
  assert.ok(calls.every(({ options }) => options.cwd === path.resolve('/tmp', 'checkout')));
  assert.equal(stderr.read(), '');
});

test('el CLI devuelve 2 sin ejecutar pasos ante argumentos inválidos y 0 para help', () => {
  let calls = 0;
  const invalidStdout = memoryStream();
  const invalidStderr = memoryStream();
  const invalidExitCode = runQualityCli({
    argv: ['--profile', 'unknown'],
    stdout: invalidStdout.stream,
    stderr: invalidStderr.stream,
    spawnSyncFn() {
      calls += 1;
      return { status: 0 };
    },
  });

  assert.equal(invalidExitCode, 2);
  assert.equal(calls, 0);
  assert.match(invalidStderr.read(), /Unsupported quality profile/);
  assert.match(invalidStderr.read(), /Usage:/);

  const helpStdout = memoryStream();
  const helpStderr = memoryStream();
  const helpExitCode = runQualityCli({
    argv: ['--help'],
    stdout: helpStdout.stream,
    stderr: helpStderr.stream,
    spawnSyncFn() {
      calls += 1;
      return { status: 0 };
    },
  });

  assert.equal(helpExitCode, 0);
  assert.equal(calls, 0);
  assert.match(helpStdout.read(), /Usage:/);
  assert.equal(helpStderr.read(), '');
});
