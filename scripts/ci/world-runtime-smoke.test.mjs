import assert from 'node:assert/strict';
import { chmod, copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { docker, runWorldRuntimeSmoke } from './world-runtime-smoke.mjs';

const API_SHA = 'a'.repeat(40);
const MATCHMAKING_SHA = 'b'.repeat(40);
const API_IMAGE = `registry.test/cukies-hub/world-api@sha256:${'1'.repeat(64)}`;
const MATCHMAKING_IMAGE = `registry.test/cukies-hub/world-matchmaking@sha256:${'2'.repeat(64)}`;

function runtimeEnv() {
  const env = {
    ...process.env,
    WORLD_API_IMAGE: API_IMAGE,
    WORLD_MATCHMAKING_IMAGE: MATCHMAKING_IMAGE,
    WORLD_API_SOURCE_SHA: API_SHA,
    WORLD_MATCHMAKING_SOURCE_SHA: MATCHMAKING_SHA,
  };
  delete env.WORLD_SMOKE_SKIP_PULL;
  return env;
}

test('docker normaliza la salida nula de un comando con stdio heredado', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cukies-world-smoke-docker-'));
  const fakeDocker = join(directory, 'docker');
  const previousPath = process.env.PATH;
  try {
    await writeFile(fakeDocker, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    await chmod(fakeDocker, 0o755);
    process.env.PATH = `${directory}${delimiter}${previousPath ?? ''}`;
    assert.equal(docker(['pull', API_IMAGE], { stdio: 'inherit' }), '');
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  }
});

test('descarga e inspecciona ambas referencias y ejecuta el harness', () => {
  const calls = [];
  let harnessCall;
  const images = new Map([[API_IMAGE, API_SHA], [MATCHMAKING_IMAGE, MATCHMAKING_SHA]]);
  const fakeDocker = (args, options) => {
    calls.push({ args, options });
    if (args[0] === 'pull') return null;
    assert.equal(args[0], 'image');
    return JSON.stringify({ 'org.opencontainers.image.revision': images.get(args[2]) });
  };
  const fakeExec = (file, args, options) => {
    harnessCall = { file, args, options };
    return null;
  };

  runWorldRuntimeSmoke({ env: runtimeEnv(), dockerImpl: fakeDocker, execImpl: fakeExec });

  assert.deepEqual(calls.map(({ args }) => args.slice(0, 2)), [
    ['pull', API_IMAGE],
    ['image', 'inspect'],
    ['pull', MATCHMAKING_IMAGE],
    ['image', 'inspect'],
  ]);
  assert.equal(calls[0].options.stdio, 'inherit');
  assert.equal(calls[2].options.stdio, 'inherit');
  assert.match(harnessCall.args.at(-1), /runtime-smoke\.mjs$/);
  assert.equal(harnessCall.options.stdio, 'inherit');
  assert.equal(harnessCall.options.env.WORLD_API_IMAGE, API_IMAGE);
});

test('un fallo de pull bloquea antes de inspeccionar o ejecutar el harness', () => {
  let harnessCalled = false;
  assert.throws(() => runWorldRuntimeSmoke({
    env: runtimeEnv(),
    dockerImpl: (args) => {
      if (args[0] === 'pull') throw new Error('pull failed');
      throw new Error('inspect should not run');
    },
    execImpl: () => { harnessCalled = true; },
  }), /pull failed/);
  assert.equal(harnessCalled, false);
});

test('un fallo de inspección OCI bloquea antes del segundo pull o harness', () => {
  const calls = [];
  let harnessCalled = false;
  assert.throws(() => runWorldRuntimeSmoke({
    env: runtimeEnv(),
    dockerImpl: (args) => {
      calls.push(args);
      if (args[0] === 'pull') return null;
      throw new Error('inspect failed');
    },
    execImpl: () => { harnessCalled = true; },
  }), /inspect failed/);
  assert.deepEqual(calls.map((args) => args[0]), ['pull', 'image']);
  assert.equal(harnessCalled, false);
});

test('un fallo del harness conserva el gate obligatorio', () => {
  const images = new Map([[API_IMAGE, API_SHA], [MATCHMAKING_IMAGE, MATCHMAKING_SHA]]);
  assert.throws(() => runWorldRuntimeSmoke({
    env: runtimeEnv(),
    dockerImpl: (args) => args[0] === 'pull'
      ? null
      : JSON.stringify({ 'org.opencontainers.image.revision': images.get(args[2]) }),
    execImpl: () => { throw new Error('harness failed'); },
  }), /harness failed/);
});

test('la ejecución CLI con espacios en la ruta no omite el gate', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cukies-world-entry review-'));
  const script = join(directory, 'world-runtime-smoke.mjs');
  const env = { ...process.env };
  delete env.WORLD_API_IMAGE;
  delete env.WORLD_MATCHMAKING_IMAGE;
  delete env.WORLD_API_SOURCE_SHA;
  delete env.WORLD_MATCHMAKING_SOURCE_SHA;
  delete env.WORLD_SMOKE_SKIP_PULL;
  try {
    await copyFile(new URL('./world-runtime-smoke.mjs', import.meta.url), script);
    assert.throws(() => execFileSync(process.execPath, [script], { env, encoding: 'utf8', stdio: 'pipe' }), (error) => {
      assert.equal(error.status, 1);
      assert.match(String(error.stderr ?? ''), /World smoke exige WORLD_API_IMAGE/);
      return true;
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
