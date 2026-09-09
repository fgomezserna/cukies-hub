#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const EXPECTED_STAGING_HOST = 'cukieshub.eurekand.com';
export const EXPECTED_STAGING_HOSTS = Object.freeze([
  'cukies-hub.eurekand.com',
  EXPECTED_STAGING_HOST,
]);
export const EXPECTED_STAGING_RESOURCE_UUID = 'u4s804o4wwcckowgk0woo4wg';
export const DEFAULT_STAGING_HEALTH_URL = `https://${EXPECTED_STAGING_HOST}/api/health`;
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
export const DEFAULT_POLL_INTERVAL_MS = 5 * 1000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 15 * 1000;

const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_TIMER_MS = 2_147_483_647;

export class DeploymentVerificationError extends Error {
  constructor(message, { issues } = {}) {
    super(message);
    this.name = 'DeploymentVerificationError';
    if (issues) {
      this.issues = issues;
    }
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFullGitSha(value) {
  return typeof value === 'string' && FULL_GIT_SHA_PATTERN.test(value);
}

export function normalizeGitRef(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.startsWith('refs/heads/')) {
    return trimmed.slice('refs/heads/'.length);
  }
  if (trimmed.startsWith('origin/')) {
    return trimmed.slice('origin/'.length);
  }
  return trimmed;
}

export function normalizeHost(value) {
  for (const host of EXPECTED_STAGING_HOSTS) {
    if (
      value === host
      || value === `https://${host}`
      || value === `https://${host}/`
    ) {
      return host;
    }
  }
  return null;
}

function normalizeHostList(value) {
  if (typeof value !== 'string' || value === '' || /[\r\n]/.test(value)) {
    return null;
  }
  const values = value.split(',');
  if (values.some((entry) => entry === '')) {
    return null;
  }
  const hosts = values.map(normalizeHost);
  if (hosts.some((host) => host === null) || new Set(hosts).size !== hosts.length) {
    return null;
  }
  return hosts;
}

function normalizeEnvironment(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

export function validateDeploymentPayload(payload, candidateSha) {
  if (!isFullGitSha(candidateSha)) {
    throw new DeploymentVerificationError(
      'Candidate SHA debe ser un SHA Git completo en minúsculas de 40 caracteres.',
    );
  }
  if (!isRecord(payload)) {
    throw new DeploymentVerificationError('El health check debe devolver un objeto JSON.');
  }

  const issues = [];
  const environment = normalizeEnvironment(payload.environment);
  const gitRef = normalizeGitRef(payload.gitRef);
  const coolify = isRecord(payload.coolify) ? payload.coolify : null;

  if (payload.status !== 'ok') {
    issues.push('status debe ser exactamente ok');
  }
  if (payload.app !== 'cukies-hub') {
    issues.push('app debe ser exactamente cukies-hub');
  }
  if (environment !== 'staging') {
    issues.push('environment normalizado debe ser staging');
  }
  if (!isFullGitSha(payload.gitSha) || payload.gitSha !== candidateSha) {
    issues.push('gitSha debe ser el Candidate SHA completo y exacto');
  }
  if (gitRef !== 'staging') {
    issues.push('gitRef normalizado debe ser staging');
  }
  if (!coolify) {
    issues.push('coolify debe ser un objeto JSON');
  }
  if (coolify?.resourceUuid !== EXPECTED_STAGING_RESOURCE_UUID) {
    issues.push('coolify.resourceUuid no corresponde al recurso de staging');
  }

  const hostFields = coolify
    ? ['fqdn', 'host'].filter((field) => Object.hasOwn(coolify, field))
    : [];
  if (hostFields.length === 0) {
    issues.push('debe existir fqdn o host de staging');
  }

  const validatedHosts = [];
  for (const field of hostFields) {
    const normalized = normalizeHostList(coolify[field]);
    if (!normalized) {
      issues.push(`coolify.${field} no corresponde al host de staging`);
    } else {
      validatedHosts.push(...normalized);
    }
  }
  if (!validatedHosts.includes(EXPECTED_STAGING_HOST)) {
    issues.push('los hosts de Coolify no incluyen el dominio público canónico de staging');
  }

  if (issues.length > 0) {
    throw new DeploymentVerificationError(
      `Contrato de deployment inválido: ${issues.join('; ')}.`,
      { issues },
    );
  }

  return {
    status: 'ok',
    app: 'cukies-hub',
    environment: 'staging',
    gitSha: payload.gitSha,
    gitRef: 'staging',
    resourceUuid: EXPECTED_STAGING_RESOURCE_UUID,
    host: EXPECTED_STAGING_HOST,
    hosts: [...new Set(validatedHosts)],
  };
}

function assertPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_TIMER_MS) {
    throw new DeploymentVerificationError(
      `${name} debe ser un entero positivo menor o igual a ${MAX_TIMER_MS}.`,
    );
  }
}

function validateEndpoint(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new DeploymentVerificationError('La URL del health check no es válida.');
  }

  if (
    parsed.protocol !== 'https:'
    || parsed.hostname.toLowerCase() !== EXPECTED_STAGING_HOST
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.port !== ''
    || parsed.pathname !== '/api/health'
    || parsed.search !== ''
    || parsed.hash !== ''
  ) {
    throw new DeploymentVerificationError(
      'La URL debe ser el endpoint HTTPS exacto /api/health del host de staging.',
    );
  }
  return parsed.href;
}

function contentTypeIsJson(contentType) {
  if (typeof contentType !== 'string') {
    return false;
  }
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

async function performAttempt({ url, candidateSha, requestTimeoutMs, fetchFn }) {
  let response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch {
    return { ok: false, reason: 'error de red al consultar el health check' };
  }

  if (!isRecord(response) || response.status !== 200) {
    const status = isRecord(response) && Number.isInteger(response.status)
      ? `HTTP ${response.status}`
      : 'respuesta HTTP inválida';
    return { ok: false, reason: status };
  }

  const contentType = typeof response.headers?.get === 'function'
    ? response.headers.get('content-type')
    : null;
  if (!contentTypeIsJson(contentType)) {
    return { ok: false, reason: 'content-type no es JSON' };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, reason: 'JSON inválido' };
  }

  try {
    return {
      ok: true,
      deployment: validateDeploymentPayload(payload, candidateSha),
    };
  } catch (error) {
    if (error instanceof DeploymentVerificationError) {
      return { ok: false, reason: error.message };
    }
    return { ok: false, reason: 'error interno al validar el contrato de deployment' };
  }
}

export async function verifyDeployment({
  candidateSha,
  url = DEFAULT_STAGING_HEALTH_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  fetchFn = globalThis.fetch,
  sleepFn = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  clock = Date.now,
} = {}) {
  if (!isFullGitSha(candidateSha)) {
    throw new DeploymentVerificationError(
      'Candidate SHA debe ser un SHA Git completo en minúsculas de 40 caracteres.',
    );
  }
  assertPositiveInteger(timeoutMs, 'timeoutMs');
  assertPositiveInteger(pollIntervalMs, 'pollIntervalMs');
  assertPositiveInteger(requestTimeoutMs, 'requestTimeoutMs');
  if (typeof fetchFn !== 'function' || typeof sleepFn !== 'function' || typeof clock !== 'function') {
    throw new DeploymentVerificationError('Las dependencias de polling no son válidas.');
  }

  const validatedUrl = validateEndpoint(url);
  const startedAt = clock();
  if (!Number.isFinite(startedAt)) {
    throw new DeploymentVerificationError('El reloj de polling no devolvió un valor válido.');
  }

  let attempts = 0;
  let lastReason = 'sin intentos';

  while (true) {
    const beforeAttempt = clock();
    if (!Number.isFinite(beforeAttempt) || beforeAttempt < startedAt) {
      throw new DeploymentVerificationError('El reloj de polling no es monotónico.');
    }
    if (attempts > 0 && beforeAttempt - startedAt >= timeoutMs) {
      break;
    }

    attempts += 1;
    const remainingMs = timeoutMs - (beforeAttempt - startedAt);
    const outcome = await performAttempt({
      url: validatedUrl,
      candidateSha,
      requestTimeoutMs: Math.max(1, Math.floor(Math.min(requestTimeoutMs, remainingMs))),
      fetchFn,
    });

    const afterAttempt = clock();
    if (!Number.isFinite(afterAttempt) || afterAttempt < beforeAttempt) {
      throw new DeploymentVerificationError('El reloj de polling no es monotónico.');
    }
    const elapsedMs = afterAttempt - startedAt;

    if (outcome.ok && elapsedMs < timeoutMs) {
      return {
        attempts,
        elapsedMs,
        deployment: outcome.deployment,
      };
    }

    lastReason = outcome.ok ? 'la respuesta llegó después del timeout' : outcome.reason;
    if (elapsedMs >= timeoutMs) {
      break;
    }

    const waitMs = Math.min(pollIntervalMs, timeoutMs - elapsedMs);
    try {
      await sleepFn(waitMs);
    } catch {
      throw new DeploymentVerificationError('El polling no pudo esperar antes del siguiente intento.');
    }
  }

  throw new DeploymentVerificationError(
    `Timeout de deployment tras ${attempts} intentos; último resultado: ${lastReason}.`,
  );
}

function parsePositiveInteger(value, optionName) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new DeploymentVerificationError(`${optionName} debe ser un entero positivo.`);
  }
  const parsed = Number(value);
  assertPositiveInteger(parsed, optionName);
  return parsed;
}

function parseCliArguments(argv) {
  const values = {};
  const names = new Map([
    ['--sha', 'candidateSha'],
    ['--url', 'url'],
    ['--timeout-ms', 'timeoutMs'],
    ['--interval-ms', 'pollIntervalMs'],
    ['--request-timeout-ms', 'requestTimeoutMs'],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      values.help = true;
      continue;
    }
    const property = names.get(argument);
    if (!property) {
      throw new DeploymentVerificationError(`Argumento no reconocido: ${argument}.`);
    }
    const value = argv[index + 1];
    if (typeof value !== 'string' || value.startsWith('--')) {
      throw new DeploymentVerificationError(`Falta el valor de ${argument}.`);
    }
    values[property] = value;
    index += 1;
  }
  return values;
}

export async function runVerifyDeploymentCli({
  argv = process.argv.slice(2),
  env = process.env,
  fetchFn = globalThis.fetch,
  sleepFn,
  clock,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const args = parseCliArguments(argv);
    if (args.help) {
      stdout.write(
        'Uso: verify-deployment.mjs --sha <40-hex> [--timeout-ms N] [--interval-ms N] [--request-timeout-ms N]\n',
      );
      return 0;
    }

    const candidateSha = args.candidateSha
      ?? env.RELEASE_CANDIDATE_SHA
      ?? env.CANDIDATE_SHA
      ?? env.GITHUB_HEAD_SHA;
    const options = {
      candidateSha,
      url: args.url ?? env.STAGING_HEALTH_URL ?? DEFAULT_STAGING_HEALTH_URL,
      timeoutMs: parsePositiveInteger(
        args.timeoutMs ?? env.DEPLOYMENT_VERIFY_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS),
        'timeoutMs',
      ),
      pollIntervalMs: parsePositiveInteger(
        args.pollIntervalMs ?? env.DEPLOYMENT_VERIFY_INTERVAL_MS ?? String(DEFAULT_POLL_INTERVAL_MS),
        'pollIntervalMs',
      ),
      requestTimeoutMs: parsePositiveInteger(
        args.requestTimeoutMs ?? env.DEPLOYMENT_REQUEST_TIMEOUT_MS ?? String(DEFAULT_REQUEST_TIMEOUT_MS),
        'requestTimeoutMs',
      ),
      fetchFn,
    };
    if (sleepFn) options.sleepFn = sleepFn;
    if (clock) options.clock = clock;

    const result = await verifyDeployment(options);
    stdout.write(
      `Deployment de staging validado para ${result.deployment.gitSha} en ${result.attempts} intento(s).\n`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof DeploymentVerificationError
      ? error.message
      : 'Error interno durante la verificación.';
    stderr.write(`Deployment DENEGADO: ${message}\n`);
    return 1;
  }
}

const isDirectInvocation = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectInvocation) {
  process.exitCode = await runVerifyDeploymentCli();
}
