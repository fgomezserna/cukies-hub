#!/usr/bin/env node

/**
 * Local-only runtime smoke test.
 *
 * The test is intentionally opt-in. Set WORLD_API_IMAGE and
 * WORLD_MATCHMAKING_IMAGE to locally built image tags before running it. It
 * creates a disposable Docker network, MongoDB and Redis containers and
 * removes every container/network in a finally block. It never reads or
 * writes Hub/Coolify data and does not use the integration Compose file.
 */
import { randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const requireShared = createRequire(new URL('../../../packages/world-shared/package.json', import.meta.url));
const jwt = requireShared('jsonwebtoken');

const apiImage = process.env.WORLD_API_IMAGE;
const matchmakingImage = process.env.WORLD_MATCHMAKING_IMAGE;
const mongoImage = process.env.WORLD_SMOKE_MONGO_IMAGE ?? 'mongo:8';
const redisImage = process.env.WORLD_SMOKE_REDIS_IMAGE ?? 'redis:7-alpine';

if (!apiImage || !matchmakingImage) {
  console.log('World Docker smoke omitido: define WORLD_API_IMAGE y WORLD_MATCHMAKING_IMAGE con tags locales.');
  process.exit(0);
}

const docker = (args, options = {}) => execFileSync('docker', args, {
  encoding: 'utf8',
  stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  ...options,
}).trim();

const network = `cukies-world-smoke-${process.pid}-${Date.now()}`;
const containers = [];
const secret = randomBytes(48).toString('base64url');
const namespace = 'cukies-world-staging';
const envDir = mkdtempSync(join(tmpdir(), 'cukies-world-smoke-'));
const envFile = join(envDir, 'runtime.env');
writeFileSync(envFile, `WORLD_SESSION_SECRET=${secret}\n`, { mode: 0o600 });
const ports = {};

function runContainer(args) {
  const id = docker(['run', '-d', ...args]);
  containers.push(id);
  return id;
}

function publishedPort(id, containerPort) {
  const output = docker(['port', id, `${containerPort}/tcp`]);
  const match = output.match(/127\.0\.0\.1:(\d+)/);
  if (!match) throw new Error(`Docker did not publish 127.0.0.1 for ${containerPort}/tcp`);
  return Number(match[1]);
}

function fetchWithTimeout(url, init) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(3_000) });
}

function waitFor(url, expected = new Set([200]), timeoutMs = 45_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await fetchWithTimeout(url);
        if (expected.has(response.status)) return resolve(response);
      } catch {
        // The application is still starting.
      }
      if (Date.now() - start > timeoutMs) return reject(new Error(`timeout waiting for ${url}`));
      setTimeout(poll, 500);
    };
    poll();
  });
}

async function expectStatus(url, expected, init) {
  const response = await fetchWithTimeout(url, init);
  if (response.status !== expected) {
    throw new Error(`${init?.method ?? 'GET'} ${url} returned ${response.status}; expected ${expected}`);
  }
  return response;
}

async function waitForStatus(url, expected, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    try {
      const response = await fetchWithTimeout(url);
      if (response.status === expected) return response;
    } catch {
      // A stopped dependency can briefly take the process down before HTTP
      // returns the expected 503; keep polling inside the bounded window.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`timeout waiting for HTTP ${expected} from ${url}`);
}

function token({ subject = '0123456789abcdef01234567', scope = ['player'], expiresIn = '10m' } = {}) {
  // The generated token is kept in memory and is never printed.
  return jwt.sign({
    sub: subject,
    kind: 'world-session',
    env: 'staging',
    namespace,
    scope,
  }, secret, {
    algorithm: 'HS256',
    issuer: 'cukies-world-smoke',
    audience: 'cukies-world-smoke-api',
    expiresIn,
  });
}

async function main() {
  docker(['network', 'create', network]);
  runContainer(['--network', network, '--network-alias', 'mongo', mongoImage, '--bind_ip_all']);
  runContainer(['--network', network, '--network-alias', 'redis', redisImage]);

  // Keep all runtime dependencies synthetic and isolated to this network.
  const common = [
    '--network', network,
    '--env-file', envFile,
    '-e', 'NODE_ENV=production',
    '-e', 'WORLD_RUNTIME_ENABLED=true',
    '-e', 'APP_ENV=staging',
    '-e', `WORLD_NAMESPACE=${namespace}`,
    '-e', 'WORLD_DATA_MONGO_URL=mongodb://mongo:27017/cukies-world-data-staging',
    '-e', 'WORLD_GAME_MONGO_URL=mongodb://mongo:27017/cukies-world-game-staging',
    '-e', 'WORLD_REDIS_URL=redis://redis:6379',
    '-e', 'WORLD_SESSION_ISSUER=cukies-world-smoke',
    '-e', 'WORLD_SESSION_AUDIENCE=cukies-world-smoke-api',
    '-e', 'WORLD_SESSION_EXPIRES_IN=10m',
    '-e', 'WORLD_SESSION_MAX_TTL_SECONDS=900',
    '-e', 'WORLD_CORS_ORIGINS=http://localhost:3000',
    '-e', 'WORLD_ADMIN_ENABLED=false',
    '-e', 'WORLD_GAME_WRITES_ENABLED=false',
  ];
  const apiId = runContainer([...common, '-e', 'WORLD_SERVICE=api', '-e', 'WORLD_PORT=3010', '-p', '127.0.0.1::3010', apiImage]);
  ports.api = publishedPort(apiId, 3010);
  const matchmakingId = runContainer([...common, '-e', 'WORLD_SERVICE=matchmaking', '-e', 'WORLD_PORT=3011', '-p', '127.0.0.1::3011', matchmakingImage]);
  ports.matchmaking = publishedPort(matchmakingId, 3011);

  const api = `http://127.0.0.1:${ports.api}`;
  const matchmaking = `http://127.0.0.1:${ports.matchmaking}`;
  await waitFor(`${api}/health/ready`);
  await waitFor(`${matchmaking}/health/ready`);

  // Health endpoints must represent the running application plus dependencies.
  await expectStatus(`${api}/health/ready`, 200);
  await expectStatus(`${matchmaking}/health/ready`, 200);

  // Auth contract: anonymous and expired sessions are rejected; admin remains deny-by-default.
  await expectStatus(`${api}/user/fromToken`, 401);
  await expectStatus(`${api}/user/fromToken`, 401, {
    headers: { authorization: `Bearer ${token({ expiresIn: -30 })}` },
  });
  await expectStatus(`${api}/user`, 403, {
    headers: { authorization: `Bearer ${token({ scope: ['player'] })}` },
  });

  // The global write gate must reject mutations before any database side effect.
  await expectStatus(`${api}/user/fromToken`, 503, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });

  // Readiness must fail when a required dependency disappears. Redis is checked
  // through matchmaking; Mongo is shared by both services.
  const redisId = containers[1];
  docker(['stop', redisId]);
  await waitForStatus(`${matchmaking}/health/ready`, 503);
  docker(['start', redisId]);
  await waitFor(`${matchmaking}/health/ready`);

  const mongoId = containers[0];
  docker(['stop', mongoId]);
  await waitForStatus(`${api}/health/ready`, 503);
  await waitForStatus(`${matchmaking}/health/ready`, 503);

  console.log('World Docker smoke OK: dependencias sintéticas, auth, write gate y readiness verificados.');
}

try {
  await main();
} catch (error) {
  // These containers contain synthetic fixtures only. Keep startup failures
  // diagnosable before cleanup, without exposing the generated session key.
  for (const id of containers.slice(2)) {
    try {
      const result = spawnSync('docker', ['logs', '--tail', '45', id], { encoding: 'utf8' });
      const logs = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      const safe = logs.split(secret).join('[REDACTED]')
        .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED JWT]');
      console.error(`World smoke container ${id.slice(0, 12)}:\n${safe}`);
    } catch { /* container did not start */ }
  }
  throw error;
} finally {
  for (const id of containers.reverse()) {
    try { docker(['rm', '-f', id]); } catch { /* already removed */ }
  }
  try { docker(['network', 'rm', network]); } catch { /* already removed */ }
  try { rmSync(envDir, { recursive: true, force: true }); } catch { /* already removed */ }
}
