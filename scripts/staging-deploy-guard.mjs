#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const STAGING_DEPLOY_GUARD = Object.freeze({
  resourceUuid: 'u4s804o4wwcckowgk0woo4wg',
  minimumFreeBytes: 10n * 1024n * 1024n * 1024n,
  intervalMs: 2500,
});

export function parseFreeBytes(dfOutput) {
  const line = dfOutput.trim().split('\n').at(-1)?.trim();
  const fields = line?.split(/\s+/);
  const freeKib = fields?.at(3);
  if (!freeKib || !/^\d+$/.test(freeKib)) {
    throw new Error('No se pudo leer el espacio libre de df -Pk.');
  }
  return BigInt(freeKib) * 1024n;
}

export function assertFreeSpace(freeBytes, minimumFreeBytes = STAGING_DEPLOY_GUARD.minimumFreeBytes) {
  if (freeBytes < minimumFreeBytes) {
    throw new Error(`Guard de staging: espacio libre insuficiente (${freeBytes} bytes; mínimo ${minimumFreeBytes}).`);
  }
  return freeBytes;
}

export function assertDeploymentTarget(deploymentUuid, expected = STAGING_DEPLOY_GUARD.resourceUuid) {
  if (!deploymentUuid || deploymentUuid !== expected) {
    throw new Error(`Guard de staging: sólo se puede cancelar el deployment exacto ${expected}.`);
  }
  return deploymentUuid;
}

export function assertNoOtherBuild(activeDeploymentUuids, expected = STAGING_DEPLOY_GUARD.resourceUuid) {
  const others = activeDeploymentUuids.filter((uuid) => uuid && uuid !== expected);
  if (others.length) {
    throw new Error(`Guard de staging: hay otro build activo (${others.join(', ')}).`);
  }
}

export async function readFreeBytes({ mountPath = '/srv', exec = execFileAsync } = {}) {
  const { stdout } = await exec('df', ['-Pk', mountPath]);
  return parseFreeBytes(stdout);
}

export async function checkStagingDeploy({
  deploymentUuid,
  activeDeploymentUuids = [],
  mountPath = '/srv',
  minimumFreeBytes = STAGING_DEPLOY_GUARD.minimumFreeBytes,
  exec = execFileAsync,
} = {}) {
  assertDeploymentTarget(deploymentUuid);
  assertNoOtherBuild(activeDeploymentUuids);
  const freeBytes = await readFreeBytes({ mountPath, exec });
  assertFreeSpace(freeBytes, minimumFreeBytes);
  return { deploymentUuid, freeBytes, intervalMs: STAGING_DEPLOY_GUARD.intervalMs };
}

export async function watchStagingDeploy({
  deploymentUuid,
  getActiveDeploymentUuids = async () => [],
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ...options
} = {}) {
  while (true) {
    const activeDeploymentUuids = await getActiveDeploymentUuids();
    await checkStagingDeploy({ deploymentUuid, activeDeploymentUuids, ...options });
    await sleep(STAGING_DEPLOY_GUARD.intervalMs);
  }
}

async function main() {
  const deploymentUuid = process.env.STAGING_DEPLOYMENT_UUID;
  const activeDeploymentUuids = (process.env.STAGING_ACTIVE_DEPLOYMENT_UUIDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const result = await checkStagingDeploy({
    deploymentUuid,
    activeDeploymentUuids,
    mountPath: process.env.STAGING_MOUNT_PATH ?? '/srv',
  });
  console.log(JSON.stringify({
    ok: true,
    deploymentUuid: result.deploymentUuid,
    freeBytes: result.freeBytes.toString(),
    intervalMs: result.intervalMs,
    cancellationTarget: result.deploymentUuid,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
