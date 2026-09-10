#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

const TEST_FILE = 'scripts/test-competition-credit-real-mongo.ts';
const MAX_WAIT_MS = 20_000;

function commandAvailable(command) {
  return spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' }).status === 0;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio ?? 'inherit',
      env: options.env ?? process.env,
      cwd: options.cwd ?? process.cwd(),
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error('No se pudo reservar un puerto local para Mongo.');
  return port;
}

function mongoShell(uri, expression) {
  const result = spawnSync('mongosh', [uri, '--quiet', '--eval', expression], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    ...result,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

async function waitForMongo(uri, expression) {
  const deadline = Date.now() + MAX_WAIT_MS;
  let lastOutput = '';
  while (Date.now() < deadline) {
    const result = mongoShell(uri, expression);
    lastOutput = result.output;
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Mongo local no estuvo listo a tiempo. Ultima salida: ${lastOutput.trim()}`);
}

async function main() {
  const missing = ['mongod', 'mongosh'].filter((command) => !commandAvailable(command));
  if (missing.length > 0) {
    throw new Error(
      `Validacion Mongo real bloqueada: faltan comandos locales ${missing.join(', ')}. `
      + 'El harness queda disponible para ejecutarse con mongod/mongosh en una replica efimera local.',
    );
  }

  const port = await freePort();
  const dbPath = mkdtempSync(join(tmpdir(), 'cukies-credit-mongo-'));
  const logPath = join(dbPath, 'mongod.log');
  const dbName = `cukies_credit_real_${process.pid}_${Date.now()}`;
  const standaloneUri = `mongodb://127.0.0.1:${port}/admin?directConnection=true`;
  const replicaUri = `mongodb://127.0.0.1:${port}/?replicaSet=rs0`;
  let started = false;

  try {
    const start = await run('mongod', [
      '--dbpath', dbPath,
      '--replSet', 'rs0',
      '--bind_ip', '127.0.0.1',
      '--port', String(port),
      '--logpath', logPath,
      '--fork',
    ]);
    if (start.code !== 0) {
      throw new Error(`No se pudo iniciar mongod local (exit ${start.code}).`);
    }
    started = true;
    await waitForMongo(standaloneUri, 'db.adminCommand({ ping: 1 }).ok');
    const initiated = mongoShell(
      standaloneUri,
      `rs.initiate({_id: 'rs0', members: [{_id: 0, host: '127.0.0.1:${port}'}]}).ok`,
    );
    if (initiated.status !== 0 && !initiated.output.includes('already initialized')) {
      throw new Error(`No se pudo iniciar la replica local: ${initiated.output.trim()}`);
    }
    await waitForMongo(replicaUri, 'db.hello().isWritablePrimary === true');

    const result = await run('node', [
      '--require', './scripts/server-only-require.cjs',
      '--import', 'tsx',
      '--loader', './scripts/server-only-loader.mjs',
      TEST_FILE,
    ], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        CHAIN_INDEXER_MONGO_URL: replicaUri,
        CHAIN_INDEXER_DB_NAME: dbName,
        CREDIT_REAL_MONGO_URI: replicaUri,
        CREDIT_REAL_MONGO_DB_NAME: dbName,
      },
    });
    if (result.code !== 0) process.exitCode = result.code;
  } catch (error) {
    let log = '';
    try {
      log = readFileSync(logPath, 'utf8').slice(-4_000);
    } catch {
      // The startup log may not exist if mongod was unavailable.
    }
    console.error(error instanceof Error ? error.message : error);
    if (log) console.error(`--- mongod.log (tail) ---\n${log}`);
    process.exitCode = 2;
  } finally {
    if (started) {
      // MongoDB 8 no longer accepts `mongod --shutdown`; shut down the
      // ephemeral primary through its local admin command before removing its
      // exact temporary dbPath.
      mongoShell(standaloneUri, 'db.adminCommand({ shutdown: 1, force: true })');
    }
    rmSync(dbPath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
