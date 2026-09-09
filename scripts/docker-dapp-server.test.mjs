import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createDappServerController,
  DEFAULT_DRAIN_TIMINGS_MS,
} from './docker-dapp-server.mjs';

class FakeTimers {
  #nextId = 1;
  #queue = new Map();

  setTimeout = (callback, delay) => {
    const id = this.#nextId++;
    this.#queue.set(id, { callback, delay });
    return id;
  };

  clearTimeout = (id) => this.#queue.delete(id);

  run(delay) {
    const pending = [...this.#queue.entries()].find(([, timer]) => timer.delay === delay);
    assert.ok(pending, `no hay temporizador de ${delay} ms`);
    this.#queue.delete(pending[0]);
    pending[1].callback();
  }
}

function fakeChild({ exitOnTerm = true } = {}) {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.signals = [];
  child.kill = (signal) => {
    child.signals.push(signal);
    if (signal === 'SIGTERM' && exitOnTerm) {
      child.exitCode = 0;
      child.emit('exit', 0, null);
    }
    return true;
  };
  return child;
}

test('mantiene serving, marca drain, retira el child y limpia el marcador en orden', () => {
  const root = mkdtempSync(join(tmpdir(), 'cukies-dapp-drain-'));
  const marker = join(root, 'draining');
  const timers = new FakeTimers();
  const child = fakeChild();
  const exits = [];
  const controller = createDappServerController({
    serverPath: '/app/server.js',
    environment: { CUKIES_DAPP_DRAIN_MARKER_PATH: marker },
    spawnProcess: () => child,
    timers,
    timings: { providerPropagation: 5, proxyRetirement: 7, forceKill: 25 },
    onExit: (code) => exits.push(code),
    logger: { info() {}, error() {} },
  });

  controller.handleSignal('SIGTERM');
  assert.deepEqual(child.signals, []);
  assert.equal(existsSync(marker), false);

  timers.run(5);
  assert.equal(existsSync(marker), true);
  assert.match(readFileSync(marker, 'utf8'), /\d+/);
  assert.deepEqual(child.signals, []);

  timers.run(7);
  assert.deepEqual(child.signals, ['SIGTERM']);
  assert.deepEqual(exits, [0]);
  assert.equal(existsSync(marker), false);
  rmSync(root, { recursive: true, force: true });
});

test('las señales repetidas son idempotentes y un child colgado recorre el drain antes de SIGKILL', () => {
  const timers = new FakeTimers();
  const child = fakeChild({ exitOnTerm: false });
  const exits = [];
  const controller = createDappServerController({
    serverPath: '/app/server.js',
    environment: { CUKIES_DAPP_DRAIN_MARKER_PATH: join(tmpdir(), `cukies-dapp-${process.pid}-force`) },
    spawnProcess: () => child,
    timers,
    timings: DEFAULT_DRAIN_TIMINGS_MS,
    onExit: (code) => exits.push(code),
    logger: { info() {}, error() {} },
  });

  controller.handleSignal('SIGTERM');
  controller.handleSignal('SIGINT');
  timers.run(DEFAULT_DRAIN_TIMINGS_MS.providerPropagation);
  timers.run(DEFAULT_DRAIN_TIMINGS_MS.proxyRetirement);
  assert.deepEqual(child.signals, ['SIGTERM']);
  timers.run(DEFAULT_DRAIN_TIMINGS_MS.forceKill);
  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']);
  assert.deepEqual(exits, []);
});

test('proceso real conserva HTTP durante 5+5 fases, devuelve 503 en drain y sale limpio', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cukies-dapp-drain-integration-'));
  const marker = join(root, 'draining');
  const portFile = join(root, 'port');
  const fixture = join(root, 'server.mjs');
  const wrapper = new URL('./docker-dapp-server.mjs', import.meta.url).pathname;
  writeFileSync(fixture, `
    import { existsSync, writeFileSync } from 'node:fs';
    import http from 'node:http';
    const marker = process.env.CUKIES_DAPP_DRAIN_MARKER_PATH;
    const server = http.createServer((request, response) => {
      if (request.url === '/ready' && existsSync(marker)) {
        response.writeHead(503, { 'content-type': 'text/plain' });
        response.end('draining');
        return;
      }
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('ok');
    });
    server.listen(0, '127.0.0.1', () => {
      writeFileSync(process.env.CUKIES_DAPP_PORT_FILE, String(server.address().port));
    });
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
  `);

  const harness = `
    import { createDappServerController } from ${JSON.stringify(wrapper)};
    const controller = createDappServerController({
      serverPath: process.env.CUKIES_DAPP_FIXTURE,
      timings: { providerPropagation: 200, proxyRetirement: 300, forceKill: 1500 },
      onExit: (code) => process.exit(code),
    });
    process.on('SIGTERM', () => controller.handleSignal('SIGTERM'));
    process.on('SIGINT', () => controller.handleSignal('SIGINT'));
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', harness], {
    env: {
      ...process.env,
      CUKIES_DAPP_DRAIN_MARKER_PATH: marker,
      CUKIES_DAPP_PORT_FILE: portFile,
      CUKIES_DAPP_FIXTURE: fixture,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const waitFor = async (predicate, timeoutMs = 2_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('timeout esperando estado del proceso DApp');
  };
  const request = async (path) => {
    const port = Number(readFileSync(portFile, 'utf8'));
    return fetch(`http://127.0.0.1:${port}${path}`);
  };
  const waitForExit = new Promise((resolve, reject) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', reject);
  });

  try {
    await waitFor(() => existsSync(portFile));
    await waitFor(async () => (await request('/ready')).status === 200);
    assert.equal((await request('/')).status, 200);

    child.kill('SIGTERM');
    child.kill('SIGTERM');
    assert.equal((await request('/ready')).status, 200);
    assert.equal((await request('/')).status, 200);

    await waitFor(() => existsSync(marker));
    assert.equal((await request('/ready')).status, 503);
    assert.equal((await request('/')).status, 200);
    child.kill('SIGTERM');
    assert.equal((await request('/')).status, 200);

    const result = await Promise.race([
      waitForExit,
      new Promise((_, reject) => setTimeout(() => reject(new Error('wrapper no terminó')), 2_000)),
    ]);
    assert.deepEqual(result, { code: 0, signal: null });
    assert.equal(existsSync(marker), false);
  } finally {
    child.kill('SIGKILL');
    rmSync(root, { recursive: true, force: true });
  }
});

test('un marcador no escribible rechaza el candidato antes de arrancar Next', () => {
  let spawned = false;
  assert.throws(() => createDappServerController({
    serverPath: '/app/server.js',
    environment: {},
    filesystem: {
      existsSync: () => false,
      unlinkSync() {},
      mkdirSync() {},
      writeFileSync() { throw new Error('read-only filesystem'); },
    },
    spawnProcess: () => { spawned = true; return fakeChild(); },
  }), /no es escribible/);
  assert.equal(spawned, false);
});

test('un fallo de spawn termina con código 1 y limpia el marker previo', () => {
  const marker = join(tmpdir(), `cukies-dapp-${process.pid}-spawn-failure`);
  const exits = [];
  const controller = createDappServerController({
    serverPath: '/app/server.js',
    environment: { CUKIES_DAPP_DRAIN_MARKER_PATH: marker },
    spawnProcess: () => { throw new Error('spawn failed'); },
    onExit: (code) => exits.push(code),
    logger: { info() {}, error() {} },
  });

  assert.equal(controller.child, null);
  assert.deepEqual(exits, [1]);
  assert.equal(existsSync(marker), false);
});
