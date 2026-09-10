#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { requireValue } from './cli-args.mjs';
import { assertImmutableImageEntry, CI_COMPONENTS } from './image-ref.mjs';
import { withoutWorldRuntime } from './generate-images-compose.mjs';
import { assertWorldDisabled } from './release-delivery-plan.mjs';

export const COOLIFY_STAGING = Object.freeze({
  resourceUuid: 'u4s804o4wwcckowgk0woo4wg',
  applicationId: '28',
  gitBranch: 'staging',
  repository: 'fgomezserna/cukies-hub',
  composeLocation: '/docker-compose.images.yml',
  healthUrl: 'https://cukieshub.eurekand.com/api/health',
});

const TERMINAL_FAILURES = new Set(['failed', 'error', 'cancelled', 'cancelled-by-user', 'canceled', 'canceled-by-user']);

function deploymentUuid(payload) {
  return payload?.deployment_uuid ?? payload?.deploymentUuid ?? payload?.uuid;
}

function statusOf(payload) {
  return String(payload?.status ?? '').toLowerCase();
}

function safeDiagnostic(value) {
  if (value === undefined || value === null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replace(/bearer\s+[^\s,]+/gi, 'Bearer [redacted]').replace(/(token|password|secret|authorization)[=:][^\s,]+/gi, '$1=[redacted]').slice(0, 500);
}

function diagnosticOf(payload) {
  const message = safeDiagnostic(payload?.message ?? payload?.error ?? payload?.error_message);
  const rawUrl = payload?.logs_url ?? payload?.log_url ?? payload?.logsUrl ?? payload?.deployment_url ?? payload?.deploymentUrl;
  let logUrl = null;
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      logUrl = `${url.origin}${url.pathname}`;
    } catch {
      logUrl = safeDiagnostic(rawUrl);
    }
  }
  return [message, logUrl ? `log=${logUrl}` : null].filter(Boolean).join('; ');
}

function applicationUuidOf(application) {
  return application?.uuid ?? application?.resource_uuid ?? application?.resourceUuid;
}

function applicationIdOf(application) {
  return application?.id ?? application?.application_id ?? application?.applicationId;
}

function repositoryOf(application) {
  const value = application?.git_repository ?? application?.gitRepository ?? application?.repository;
  if (typeof value === 'string') return value;
  return value?.full_name ?? value?.fullName ?? value?.name ?? null;
}

export function assertStagingApplication(application, { resourceUuid = COOLIFY_STAGING.resourceUuid, applicationId = COOLIFY_STAGING.applicationId } = {}) {
  if (applicationUuidOf(application) !== resourceUuid) throw new Error(`Coolify aplicación no coincide con el UUID esperado.`);
  const actualId = applicationIdOf(application);
  if (actualId !== undefined && actualId !== null && String(actualId) !== String(applicationId)) throw new Error(`Coolify aplicación no coincide con el id esperado.`);
  if ((application?.git_branch ?? application?.gitBranch) !== COOLIFY_STAGING.gitBranch) throw new Error(`Coolify aplicación no está fijada a la rama ${COOLIFY_STAGING.gitBranch}.`);
  if (repositoryOf(application) !== COOLIFY_STAGING.repository) throw new Error(`Coolify aplicación no está fijada al repositorio esperado.`);
  return application;
}

export function createCoolifyReleaseClient({ baseUrl = process.env.CUKIES_COOLIFY_URL, token = process.env.CUKIES_COOLIFY_TOKEN, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (!baseUrl || !token) throw new Error('CUKIES_COOLIFY_URL y CUKIES_COOLIFY_TOKEN son obligatorios.');
  const root = baseUrl.replace(/\/$/, '');
  async function request(method, path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${root}${path}`, {
        method,
        headers: { accept: 'application/json', authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      let payload = null;
      try { payload = await response.json(); } catch {}
      if (!response.ok) throw new Error(`Coolify ${method} ${path} HTTP ${response.status}: ${diagnosticOf(payload) || 'sin detalle'}`);
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }
  return Object.freeze({
    getApplication: (uuid) => request('GET', `/api/v1/applications/${encodeURIComponent(uuid)}`),
    patchApplication: (uuid, body) => request('PATCH', `/api/v1/applications/${encodeURIComponent(uuid)}`, body),
    patchEnvs: (uuid, data) => request('PATCH', `/api/v1/applications/${encodeURIComponent(uuid)}/envs/bulk`, { data }),
    start: (uuid) => request('GET', `/api/v1/applications/${encodeURIComponent(uuid)}/start?force=false&instant_deploy=true`),
    getDeployment: (uuid) => request('GET', `/api/v1/deployments/${encodeURIComponent(uuid)}`),
  });
}

export function assertPinnedApplication(application, expectedSha) {
  const actual = application?.git_commit_sha ?? application?.gitCommitSha;
  if (actual !== expectedSha) throw new Error(`Coolify no confirmó git_commit_sha=${expectedSha}; API devolvió ${actual ?? '(ausente)'}.`);
  return application;
}

export function buildImageEnvironment(manifest) {
  if (!/^[0-9a-f]{40}$/i.test(manifest?.commit ?? '') || !/^[0-9a-f]{64}$/i.test(manifest?.configHash ?? '')) {
    throw new Error('manifest con commit o config hash inválido.');
  }
  const entries = CI_COMPONENTS.flatMap((component) => {
    // Releases written before the game lane existed have five components. Keep
    // those manifests deployable for the workers compatibility path.
    if (!manifest.components?.[component] && component === 'treasure-hunt') return [];
    const value = assertImmutableImageEntry(component, manifest.components?.[component]);
    const env = {
      dapp: 'CUKIES_IMAGE_DAPP',
      'chain-indexer': 'CUKIES_IMAGE_CHAIN_INDEXER',
      'cuki-card-worker': 'CUKIES_IMAGE_CUKI_CARD_WORKER',
      schedulers: 'CUKIES_IMAGE_SCHEDULERS',
      'cukies-bridge-relayer': 'CUKIES_IMAGE_CUKIES_BRIDGE_RELAYER',
      'treasure-hunt': 'CUKIES_IMAGE_TREASURE_HUNT',
      'world-api': 'CUKIES_IMAGE_WORLD_API',
      'world-matchmaking': 'CUKIES_IMAGE_WORLD_MATCHMAKING',
    }[component];
    return [{ key: env, value: value.image, is_literal: true, is_runtime: true, is_buildtime: true }];
  });
  entries.push({ key: 'IMAGE_REVISION', value: manifest.commit, is_literal: true, is_runtime: true, is_buildtime: true });
  entries.push({ key: 'CUKIES_BUILD_ENV_HASH', value: manifest.configHash, is_literal: true, is_runtime: true, is_buildtime: true });
  return entries;
}

export async function deployAndVerify({ client, compose, manifest, resourceUuid = COOLIFY_STAGING.resourceUuid, healthUrl = COOLIFY_STAGING.healthUrl, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), fetchImpl = globalThis.fetch, pollMs = 5000, timeoutMs = 30 * 60 * 1000, healthTimeoutMs = 15000 }) {
  assertWorldDisabled(manifest, process.env);
  compose = withoutWorldRuntime(compose);
  const imageEnvironment = buildImageEnvironment(manifest);
  assertStagingApplication(await client.getApplication(resourceUuid), { resourceUuid });
  await client.patchApplication(resourceUuid, {
    git_commit_sha: manifest.commit,
    docker_compose_location: COOLIFY_STAGING.composeLocation,
    docker_compose_raw: compose,
  });
  const pinnedApplication = await client.getApplication(resourceUuid);
  assertStagingApplication(pinnedApplication, { resourceUuid });
  assertPinnedApplication(pinnedApplication, manifest.commit);
  await client.patchEnvs(resourceUuid, imageEnvironment);
  const started = await client.start(resourceUuid);
  const deployment = deploymentUuid(started);
  if (!deployment) throw new Error('Coolify no devolvió deployment_uuid al iniciar.');
  const deadline = Date.now() + timeoutMs;
  let finished;
  while (Date.now() < deadline) {
    const current = await client.getDeployment(deployment);
    const status = statusOf(current);
    const deploymentCommit = current?.commit ?? current?.commit_sha ?? current?.commitSha;
    const sentinelCommit = deploymentCommit === undefined || deploymentCommit === null || deploymentCommit === '' || deploymentCommit === 'HEAD';
    if (!sentinelCommit && deploymentCommit !== manifest.commit) throw new Error(`Coolify deployment ${deployment} corresponde a ${deploymentCommit}, no al SHA ${manifest.commit}.`);
    if (TERMINAL_FAILURES.has(status)) throw new Error(`Coolify deployment ${deployment} terminó en ${status}${diagnosticOf(current) ? `: ${diagnosticOf(current)}` : '.'}`);
    if (status === 'finished') {
      if (deploymentCommit !== manifest.commit) throw new Error(`Coolify deployment ${deployment} terminó sin confirmar el SHA ${manifest.commit}; commit=${deploymentCommit ?? '(ausente)'}.`);
      finished = current;
      break;
    }
    if (sentinelCommit && !['queued', 'in_progress'].includes(status)) throw new Error(`Coolify deployment ${deployment} devolvió commit ${deploymentCommit ?? '(ausente)'} en estado ${status || '(ausente)'}.`);
    await sleep(pollMs);
  }
  if (!finished) throw new Error(`Coolify deployment ${deployment} no terminó dentro del timeout.`);

  const healthController = new AbortController();
  const healthTimer = setTimeout(() => healthController.abort(), healthTimeoutMs);
  let healthResponse;
  try {
    healthResponse = await fetchImpl(healthUrl, { headers: { accept: 'application/json' }, signal: healthController.signal });
  } finally {
    clearTimeout(healthTimer);
  }
  const health = await healthResponse.json();
  if (!healthResponse.ok || health?.status !== 'ok' || health?.gitSha !== manifest.commit || health?.environment !== manifest.environment || health?.coolify?.resourceUuid !== resourceUuid) {
    throw new Error(`health no confirma el SHA ${manifest.commit}; gitSha=${health?.gitSha ?? '(ausente)'}.`);
  }
  return {
    deploymentUuid: deployment,
    healthSha: health.gitSha,
    environment: health.environment,
    resourceUuid: health.coolify.resourceUuid,
    healthUrl,
    deploymentTimeoutMs: timeoutMs,
    healthTimeoutMs,
    status: 'finished',
  };
}

async function main() {
  const manifestPath = requireValue(process.argv, '--manifest');
  const composePath = requireValue(process.argv, '--compose');
  const resultPath = requireValue(process.argv, '--result');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const compose = await readFile(composePath, 'utf8');
  const result = await deployAndVerify({
    client: createCoolifyReleaseClient(),
    compose,
    manifest,
    healthUrl: process.env.CUKIES_HEALTH_URL ?? COOLIFY_STAGING.healthUrl,
  });
  manifest.deploymentUuid = result.deploymentUuid;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
