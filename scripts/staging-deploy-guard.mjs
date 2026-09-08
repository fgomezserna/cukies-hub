#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const STAGING_DEPLOY_GUARD = Object.freeze({
  resourceUuid: 'u4s804o4wwcckowgk0woo4wg',
  applicationId: '28',
  minimumFreeBytes: 10n * 1024n * 1024n * 1024n,
  intervalMs: 2500,
  operationTimeoutMs: 3000,
});

const TERMINAL_STATUSES = new Set([
  'finished',
  'failed',
  'cancelled',
  'cancelled-by-user',
  'canceled',
  'canceled-by-user',
  'error',
]);

const ACTIVE_STATUSES = new Set([
  'queued',
  'pending',
  'building',
  'deploying',
  'running',
  'in_progress',
  'in-progress',
  'canceling',
  'cancelling',
]);

function statusOf(record) {
  return String(record?.status ?? '').trim().toLowerCase();
}

function deploymentUuidOf(record) {
  return record?.deployment_uuid ?? record?.deploymentUuid ?? record?.uuid;
}

function applicationIdOf(record) {
  return String(record?.application_id ?? record?.applicationId ?? '').trim();
}

function commitOf(record) {
  return record?.commit ?? record?.commit_sha ?? record?.commitSha;
}

function isTerminal(record) {
  return TERMINAL_STATUSES.has(statusOf(record));
}

function isActive(record) {
  return ACTIVE_STATUSES.has(statusOf(record)) || (!isTerminal(record) && Boolean(statusOf(record)));
}

function asDeploymentRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.deployments)) return payload.deployments;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function parseFreeBytes(dfOutput) {
  const line = String(dfOutput).trim().split('\n').at(-1)?.trim();
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

export function assertDeploymentTarget(
  record,
  { deploymentUuid, expectedCommit, applicationId = STAGING_DEPLOY_GUARD.applicationId } = {},
) {
  const actualUuid = deploymentUuidOf(record);
  if (!deploymentUuid || actualUuid !== deploymentUuid) {
    throw new Error(`Guard de staging: el deployment consultado no coincide con ${deploymentUuid ?? '(sin UUID)'}.`);
  }
  if (applicationIdOf(record) !== String(applicationId)) {
    throw new Error(`Guard de staging: el deployment ${deploymentUuid} no pertenece a la aplicación ${applicationId}.`);
  }
  if (expectedCommit && commitOf(record) !== expectedCommit) {
    throw new Error(`Guard de staging: el deployment ${deploymentUuid} no corresponde al commit esperado.`);
  }
  return record;
}

export function assertNoOtherBuild(records, deploymentUuid = null) {
  const active = records.filter(isActive);
  const others = active.filter((record) => deploymentUuidOf(record) !== deploymentUuid);
  if (others.length) {
    const ids = others.map(deploymentUuidOf).filter(Boolean).join(', ');
    throw new Error(`Guard de staging: hay otro build activo (${ids || 'UUID ausente'}).`);
  }
  return records;
}

export async function readFreeBytes({
  mountPath = '/srv',
  exec = execFileAsync,
  timeoutMs = STAGING_DEPLOY_GUARD.operationTimeoutMs,
} = {}) {
  let timeoutHandle;
  const command = exec('df', ['-Pk', mountPath], { timeout: timeoutMs });
  const timedOut = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`df -Pk ${mountPath} excedió el timeout de ${timeoutMs} ms.`)), timeoutMs);
  });
  try {
    const { stdout } = await Promise.race([command, timedOut]);
    return parseFreeBytes(stdout);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function requireExpectedCommit(expectedCommit) {
  if (!expectedCommit || !/^[0-9a-f]{40}$/i.test(expectedCommit)) {
    throw new Error('Guard de staging: STAGING_EXPECTED_COMMIT debe ser un SHA-1 completo.');
  }
  return expectedCommit;
}

export function createCoolifyClient({
  baseUrl = process.env.COOLIFY_API_URL,
  token = process.env.COOLIFY_API_TOKEN,
  readToken = process.env.COOLIFY_API_READ_TOKEN,
  deployToken = process.env.COOLIFY_API_DEPLOY_TOKEN,
  fetchImpl = globalThis.fetch,
  timeoutMs = STAGING_DEPLOY_GUARD.operationTimeoutMs,
} = {}) {
  if (!baseUrl || (!token && !readToken && !deployToken)) {
    throw new Error('Guard de staging: faltan COOLIFY_API_URL y una credencial Coolify.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Guard de staging: no hay un fetch disponible para Coolify.');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Guard de staging: timeout de Coolify inválido.');
  }

  const apiUrl = baseUrl.replace(/\/$/, '');
  const request = async (method, path, body, requestToken = token) => {
    if (!requestToken) {
      throw new Error(`Guard de staging: falta credencial Coolify para ${method} ${path}.`);
    }
    const controller = new AbortController();
    const timeoutError = new Error(`Coolify API ${method} ${path} excedió el timeout de ${timeoutMs} ms.`);
    let rejectTimeout;
    const timeoutPromise = new Promise((_, reject) => {
      rejectTimeout = reject;
    });
    const timeout = setTimeout(() => {
      controller.abort();
      rejectTimeout(timeoutError);
    }, timeoutMs);
    let response;
    let payload = null;
    try {
      response = await Promise.race([fetchImpl(`${apiUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${requestToken}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        signal: controller.signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }), timeoutPromise]);
      try {
        payload = await Promise.race([response.json(), timeoutPromise]);
      } catch (error) {
        if (error === timeoutError) throw error;
        payload = null;
      }
    } catch (error) {
      if (error === timeoutError || controller.signal.aborted) {
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new Error(`Coolify API ${method} ${path} devolvió HTTP ${response.status}.`);
    }
    return { status: response.status, payload };
  };

  return Object.freeze({
    async getDeployment(deploymentUuid) {
      const result = await request('GET', `/api/v1/deployments/${encodeURIComponent(deploymentUuid)}`, undefined, readToken ?? token);
      return result.payload;
    },
    async listDeployments(resourceUuid = STAGING_DEPLOY_GUARD.resourceUuid) {
      const result = await request('GET', `/api/v1/deployments/applications/${encodeURIComponent(resourceUuid)}`, undefined, readToken ?? token);
      return asDeploymentRecords(result.payload);
    },
    async cancelDeployment(deploymentUuid) {
      return request('POST', `/api/v1/deployments/${encodeURIComponent(deploymentUuid)}/cancel`, undefined, deployToken ?? token);
    },
  });
}

export async function preflightBeforeStart({
  client,
  expectedCommit,
  mountPath = '/srv',
  minimumFreeBytes = STAGING_DEPLOY_GUARD.minimumFreeBytes,
  timeoutMs = STAGING_DEPLOY_GUARD.operationTimeoutMs,
  exec = execFileAsync,
} = {}) {
  requireExpectedCommit(expectedCommit);
  if (!client?.listDeployments) throw new Error('Guard de staging: cliente Coolify incompleto.');
  const records = await client.listDeployments(STAGING_DEPLOY_GUARD.resourceUuid);
  assertNoOtherBuild(records);
  const freeBytes = await readFreeBytes({ mountPath, exec, timeoutMs });
  assertFreeSpace(freeBytes, minimumFreeBytes);
  return {
    resourceUuid: STAGING_DEPLOY_GUARD.resourceUuid,
    applicationId: STAGING_DEPLOY_GUARD.applicationId,
    expectedCommit,
    freeBytes,
    intervalMs: STAGING_DEPLOY_GUARD.intervalMs,
    readyToStart: true,
  };
}

function assertCancellationAck(result, deploymentUuid) {
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`Guard de staging: Coolify no confirmó la cancelación de ${deploymentUuid}.`);
  }
  const body = result.payload ?? {};
  const acknowledgedUuid = deploymentUuidOf(body);
  if (acknowledgedUuid && acknowledgedUuid !== deploymentUuid) {
    throw new Error(`Guard de staging: ACK de cancelación para deployment incorrecto (${acknowledgedUuid}).`);
  }
  const message = String(body.message ?? body.status ?? '').toLowerCase();
  if (body.cancelled !== true && body.canceled !== true && !message.includes('cancel')) {
    throw new Error(`Guard de staging: ACK de Coolify no indica cancelación de ${deploymentUuid}.`);
  }
}

export async function watchDeployment({
  client,
  deploymentUuid,
  expectedCommit,
  mountPath = '/srv',
  minimumFreeBytes = STAGING_DEPLOY_GUARD.minimumFreeBytes,
  timeoutMs = STAGING_DEPLOY_GUARD.operationTimeoutMs,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  exec = execFileAsync,
  onCancel = () => {},
} = {}) {
  requireExpectedCommit(expectedCommit);
  if (!deploymentUuid) throw new Error('Guard de staging: falta STAGING_DEPLOYMENT_UUID.');
  if (!client?.getDeployment || !client?.listDeployments || !client?.cancelDeployment) {
    throw new Error('Guard de staging: cliente Coolify incompleto.');
  }

  let cancelCount = 0;
  let targetVerified = false;
  let cancellationRequested = false;
  let lastVerifiedRecord;

  const cancelOnce = async (reason) => {
    if (cancellationRequested) return false;
    assertDeploymentTarget(lastVerifiedRecord, { deploymentUuid, expectedCommit });
    const result = await client.cancelDeployment(deploymentUuid);
    assertCancellationAck(result, deploymentUuid);
    cancellationRequested = true;
    cancelCount += 1;
    await onCancel({ deploymentUuid, reason, cancelCount });
    return true;
  };

  while (true) {
    let deployment;
    try {
      deployment = await client.getDeployment(deploymentUuid);
      assertDeploymentTarget(deployment, { deploymentUuid, expectedCommit });
      const records = await client.listDeployments(STAGING_DEPLOY_GUARD.resourceUuid);
      const listedTarget = records.find((record) => deploymentUuidOf(record) === deploymentUuid);
      if (!listedTarget) {
        throw new Error(`Guard de staging: ${deploymentUuid} no está relacionado con la aplicación ${STAGING_DEPLOY_GUARD.resourceUuid}.`);
      }
      assertDeploymentTarget(listedTarget, { deploymentUuid, expectedCommit });
      assertNoOtherBuild(records, deploymentUuid);
      lastVerifiedRecord = deployment;
      targetVerified = true;
    } catch (error) {
      if (!targetVerified) throw error;
      if (cancellationRequested) {
        throw new Error(`Guard de staging: no se pudo verificar el estado terminal tras cancelar ${deploymentUuid}: ${error.message}`);
      }
      await cancelOnce(`fallo de consulta: ${error.message}`);
      await sleep(STAGING_DEPLOY_GUARD.intervalMs);
      continue;
    }

    if (isTerminal(deployment)) {
      return { deploymentUuid, status: statusOf(deployment), cancelCount };
    }

    let freeBytes;
    try {
      freeBytes = await readFreeBytes({ mountPath, exec, timeoutMs });
    } catch (error) {
      await cancelOnce(`fallo de lectura de espacio: ${error.message}`);
    }
    if (freeBytes !== undefined && freeBytes < minimumFreeBytes) {
      await cancelOnce(`espacio libre insuficiente: ${freeBytes} bytes`);
    }

    await sleep(STAGING_DEPLOY_GUARD.intervalMs);
  }
}

async function main() {
  const client = createCoolifyClient();
  const expectedCommit = requireExpectedCommit(process.env.STAGING_EXPECTED_COMMIT);
  const mountPath = process.env.STAGING_MOUNT_PATH ?? '/srv';
  const deploymentUuid = process.env.STAGING_DEPLOYMENT_UUID;

  if (!deploymentUuid) {
    const result = await preflightBeforeStart({ client, expectedCommit, mountPath });
    console.log(JSON.stringify({
      ok: true,
      phase: 'preflight',
      resourceUuid: result.resourceUuid,
      applicationId: result.applicationId,
      expectedCommit: result.expectedCommit,
      freeBytes: result.freeBytes.toString(),
      intervalMs: result.intervalMs,
      readyToStart: result.readyToStart,
    }));
    return;
  }

  const result = await watchDeployment({ client, deploymentUuid, expectedCommit, mountPath });
  console.log(JSON.stringify({ ok: true, phase: 'watch', ...result }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
