#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { requireValue } from './cli-args.mjs';
import { assertEnvironmentMetadata, resolveDeploymentEnvironment } from './deployment-environment.mjs';
import { assertImmutableImageEntry, CI_COMPONENTS } from './image-ref.mjs';

const IMAGE_ENV = Object.freeze({
  dapp: 'CUKIES_IMAGE_DAPP',
  'chain-indexer': 'CUKIES_IMAGE_CHAIN_INDEXER',
  'cuki-card-worker': 'CUKIES_IMAGE_CUKI_CARD_WORKER',
  'cukies-bridge-relayer': 'CUKIES_IMAGE_CUKIES_BRIDGE_RELAYER',
  'treasure-hunt': 'CUKIES_IMAGE_TREASURE_HUNT',
});

const SHA40 = /^[0-9a-f]{40}$/i;
const HASH64 = /^[0-9a-f]{64}$/i;
// The production web image is guarded as Coolify app33 even when it runs in
// the standalone LXC.  The worker images keep app12's UUID in runtime.env.
export const PRODUCTION_WEB_RESOURCE_UUID = 'uo8gswsg84c488cowko0kkkg';

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function run(command, args, { input = null, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => {
      if (status !== 0) {
        reject(new Error(`${command} terminó con ${status}: ${stderr.trim().slice(0, 800)}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
    if (input !== null) child.stdin.end(input);
    else child.stdin.end();
  });
}

function sshArgs({ sshKey, knownHosts } = {}) {
  const args = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes'];
  if (knownHosts) args.push('-o', `UserKnownHostsFile=${knownHosts}`);
  if (sshKey) args.push('-i', sshKey);
  return args;
}

export function assertLxcManifest(manifest) {
  const deployment = resolveDeploymentEnvironment(manifest?.environment);
  assertEnvironmentMetadata(manifest, deployment, { context: 'release manifest' });
  if (deployment.environment !== 'production') {
    throw new Error('El destino LXC de este carril está reservado a producción.');
  }
  if (!SHA40.test(manifest.commit ?? '')) throw new Error('release manifest contiene un commit inválido.');
  if (!HASH64.test(manifest.configHash ?? '')) throw new Error('release manifest contiene un configHash inválido.');
  for (const component of CI_COMPONENTS) {
    assertImmutableImageEntry(component, manifest.components?.[component]);
  }
  return deployment;
}

export function createLxcReleaseEnv(manifest) {
  assertLxcManifest(manifest);
  const lines = [
    `IMAGE_REVISION=${manifest.commit}`,
    `SOURCE_COMMIT=${manifest.commit}`,
    `GIT_COMMIT_SHA=${manifest.commit}`,
    `CUKIES_BUILD_ENV_HASH=${manifest.configHash}`,
    `CUKIES_WEB_RESOURCE_UUID=${PRODUCTION_WEB_RESOURCE_UUID}`,
    'CUKIES_DAPP_TRAEFIK_LABEL_FILE=dapp-production.labels',
    'CUKIES_GAME_TRAEFIK_LABEL_FILE=treasure-hunt-production.labels',
    'COMPOSE_PROFILES=bridge-relayer',
  ];
  for (const component of CI_COMPONENTS) {
    const entry = assertImmutableImageEntry(component, manifest.components?.[component]);
    lines.push(`${IMAGE_ENV[component]}=${entry.image}`);
  }
  return `${lines.join('\n')}\n`;
}

async function ssh({ host, user, sshKey, knownHosts }, command, runImpl = run) {
  const destination = `${user}@${host}`;
  return runImpl('ssh', [...sshArgs({ sshKey, knownHosts }), destination, command]);
}

async function copy({ host, user, sshKey, knownHosts }, source, destination, runImpl = run) {
  return runImpl('scp', [...sshArgs({ sshKey, knownHosts }), source, `${user}@${host}:${destination}`]);
}

function remotePath(value) {
  if (typeof value !== 'string' || !/^\/[a-zA-Z0-9_./-]+$/.test(value)) {
    throw new Error('remoteDir debe ser una ruta absoluta sin espacios.');
  }
  return value.replace(/\/$/, '');
}

export async function deployToLxc({
  manifest,
  composePath = 'docker-compose.images.yml',
  overlayPath = 'docker-compose.production.lxc.yml',
  labelPath = 'deploy/coolify/labels/dapp-production.labels',
  gameLabelPath = 'infrastructure/ci/production-game.labels',
  host,
  user = 'root',
  remoteDir = '/opt/cukies/prod',
  sshKey,
  knownHosts,
  runImpl = run,
} = {}) {
  assertLxcManifest(manifest);
  if (!host) throw new Error('host LXC es obligatorio.');
  const root = remotePath(remoteDir);
  const releaseDir = `${root}/releases/${manifest.commit}`;
  const temp = await mkdtemp(join(tmpdir(), 'cukies-lxc-release-'));
  try {
    const releaseEnvPath = join(temp, 'release.env');
    await writeFile(releaseEnvPath, createLxcReleaseEnv(manifest), { mode: 0o600 });
    const connection = { host, user, sshKey, knownHosts };
    const quote = shellQuote;
    await ssh(connection, `set -eu; mkdir -p ${quote(releaseDir)}; test -f ${quote(`${root}/runtime.env`)}; docker network inspect coolify >/dev/null 2>&1 || docker network create coolify >/dev/null`, runImpl);
    await copy(connection, composePath, `${releaseDir}/docker-compose.images.yml`, runImpl);
    await copy(connection, overlayPath, `${releaseDir}/docker-compose.production.lxc.yml`, runImpl);
    await copy(connection, labelPath, `${releaseDir}/dapp-production.labels`, runImpl);
    await copy(connection, gameLabelPath, `${releaseDir}/treasure-hunt-production.labels`, runImpl);
    await copy(connection, releaseEnvPath, `${releaseDir}/release.env`, runImpl);

    const compose = `docker compose --env-file ${quote(`${root}/runtime.env`)} --env-file ${quote(`${releaseDir}/release.env`)} -f ${quote(`${releaseDir}/docker-compose.images.yml`)} -f ${quote(`${releaseDir}/docker-compose.production.lxc.yml`)} --profile bridge-relayer`;
    await ssh(connection, `set -eu; ${compose} config >/dev/null; ${compose} pull; ${compose} up -d --remove-orphans --wait`, runImpl);
    const health = await ssh(connection, `set -eu; curl -kfsS --retry 10 --retry-delay 2 -H 'Host: cukies.world' https://127.0.0.1/api/health`, runImpl);
    const ready = await ssh(connection, `set -eu; curl -kfsS --retry 10 --retry-delay 2 -H 'Host: cukies.world' https://127.0.0.1/api/ready`, runImpl);
    const gameHealth = await ssh(connection, `set -eu; curl -kfsS --retry 10 --retry-delay 2 -H 'Host: treasurehunt.cukies.world' https://127.0.0.1/api/health`, runImpl);
    const gameReady = await ssh(connection, `set -eu; curl -kfsS --retry 10 --retry-delay 2 -H 'Host: treasurehunt.cukies.world' https://127.0.0.1/api/ready`, runImpl);
    let healthBody;
    let readyBody;
    let gameHealthBody;
    let gameReadyBody;
    try {
      healthBody = JSON.parse(health.stdout);
      readyBody = JSON.parse(ready.stdout);
      gameHealthBody = JSON.parse(gameHealth.stdout);
      gameReadyBody = JSON.parse(gameReady.stdout);
    } catch {
      throw new Error('El LXC devolvió health/ready no JSON.');
    }
    if (healthBody?.status !== 'ok' || healthBody?.gitSha !== manifest.commit || healthBody?.environment !== 'production') {
      throw new Error(`health del LXC no confirma ${manifest.commit}.`);
    }
    if (readyBody?.status !== 'ready' || readyBody?.gitSha !== manifest.commit || readyBody?.configHash !== manifest.configHash) {
      throw new Error(`ready del LXC no confirma ${manifest.commit}.`);
    }
    if (gameHealthBody?.status !== 'ok' || gameHealthBody?.app !== 'treasure-hunt' || gameHealthBody?.gitSha !== manifest.commit || gameHealthBody?.environment !== 'production') {
      throw new Error(`health de Treasure Hunt no confirma ${manifest.commit}.`);
    }
    if (gameReadyBody?.status !== 'ready' || gameReadyBody?.gitSha !== manifest.commit || gameReadyBody?.configHash !== manifest.configHash) {
      throw new Error(`ready de Treasure Hunt no confirma ${manifest.commit}.`);
    }
    return {
      status: 'finished',
      platform: 'lxc',
      host,
      remoteDir: root,
      releaseDir,
      healthSha: healthBody.gitSha,
      readyStatus: readyBody.status,
      gameHealthSha: gameHealthBody.gitSha,
      gameReadyStatus: gameReadyBody.status,
      environment: healthBody.environment,
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

async function main() {
  const manifestPath = requireValue(process.argv, '--manifest');
  const resultPath = requireValue(process.argv, '--result');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const result = await deployToLxc({
    manifest,
    composePath: requireValue(process.argv, '--compose', { fallback: 'docker-compose.images.yml' }),
    overlayPath: requireValue(process.argv, '--overlay', { fallback: 'docker-compose.production.lxc.yml' }),
    labelPath: requireValue(process.argv, '--labels', { fallback: 'deploy/coolify/labels/dapp-production.labels' }),
    gameLabelPath: requireValue(process.argv, '--game-labels', { fallback: 'infrastructure/ci/production-game.labels' }),
    host: requireValue(process.argv, '--host', { fallback: process.env.CUKIES_LXC_HOST }),
    user: requireValue(process.argv, '--user', { fallback: process.env.CUKIES_LXC_USER || 'root' }),
    remoteDir: requireValue(process.argv, '--remote-dir', { fallback: process.env.CUKIES_LXC_REMOTE_DIR || '/opt/cukies/prod' }),
    sshKey: process.env.CUKIES_LXC_SSH_KEY,
    knownHosts: process.env.CUKIES_LXC_KNOWN_HOSTS,
  });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
