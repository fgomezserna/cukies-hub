#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^([A-Za-z0-9][A-Za-z0-9_.-]*)\/([A-Za-z0-9][A-Za-z0-9_.-]*)$/;
const VALID_MODES = new Set(['normal', 'hotfix']);
export const DEFAULT_GITHUB_API_URL = 'https://api.github.com';

export class PromotionMergeVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PromotionMergeVerificationError';
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFullGitSha(value) {
  return typeof value === 'string' && FULL_GIT_SHA_PATTERN.test(value);
}

function validateSha(value, name) {
  if (!isFullGitSha(value)) {
    throw new PromotionMergeVerificationError(
      `${name} debe ser un SHA Git completo en minúsculas de 40 caracteres.`,
    );
  }
  return value;
}

function validateRepository(repository) {
  if (typeof repository !== 'string') {
    throw new PromotionMergeVerificationError('GITHUB_REPOSITORY no es válido.');
  }
  const match = repository.match(REPOSITORY_PATTERN);
  if (!match || match[1].includes('..') || match[2].includes('..')) {
    throw new PromotionMergeVerificationError('GITHUB_REPOSITORY debe tener la forma owner/repo.');
  }
  return { owner: match[1], repo: match[2], fullName: repository };
}

function validateApiBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new PromotionMergeVerificationError('La URL base de GitHub API no es válida.');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.search !== ''
    || parsed.hash !== ''
  ) {
    throw new PromotionMergeVerificationError(
      'GitHub API debe usar una URL HTTPS sin credenciales.',
    );
  }
  return parsed.href.replace(/\/+$/, '');
}

function contentTypeIsJson(response) {
  if (typeof response?.headers?.get !== 'function') return false;
  const value = response.headers.get('content-type');
  if (typeof value !== 'string') return false;
  const mediaType = value.split(';', 1)[0].trim().toLowerCase();
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

async function fetchGitHubJson(url, { token, fetchFn }) {
  let response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    throw new PromotionMergeVerificationError('Error de red al consultar GitHub API.');
  }
  if (!isRecord(response) || response.status !== 200) {
    const status = isRecord(response) && Number.isInteger(response.status)
      ? `HTTP ${response.status}`
      : 'respuesta HTTP inválida';
    throw new PromotionMergeVerificationError(`GitHub API devolvió ${status}.`);
  }
  if (!contentTypeIsJson(response)) {
    throw new PromotionMergeVerificationError('GitHub API no devolvió content-type JSON.');
  }
  try {
    return await response.json();
  } catch {
    throw new PromotionMergeVerificationError('GitHub API devolvió JSON inválido.');
  }
}

function validateCommitTree(payload, expectedSha, label) {
  if (
    !isRecord(payload)
    || payload.sha !== expectedSha
    || !isRecord(payload.tree)
    || !isFullGitSha(payload.tree.sha)
  ) {
    throw new PromotionMergeVerificationError(
      `${label} no coincide con el SHA exacto o no expone un tree SHA válido.`,
    );
  }
  return payload.tree.sha;
}

export function validatePromotionMergePayloads({
  mergePayload,
  headPayload,
  baseSha,
  headSha,
  mergeSha,
  mode,
} = {}) {
  validateSha(baseSha, 'baseSha');
  validateSha(headSha, 'headSha');
  validateSha(mergeSha, 'mergeSha');
  if (new Set([baseSha, headSha, mergeSha]).size !== 3) {
    throw new PromotionMergeVerificationError(
      'El test merge SHA debe ser distinto de sus SHAs base y head.',
    );
  }
  if (!VALID_MODES.has(mode)) {
    throw new PromotionMergeVerificationError('mode debe ser exactamente normal o hotfix.');
  }

  const mergeTreeSha = validateCommitTree(mergePayload, mergeSha, 'El test merge commit');
  if (
    !Array.isArray(mergePayload.parents)
    || mergePayload.parents.length !== 2
    || !isRecord(mergePayload.parents[0])
    || mergePayload.parents[0].sha !== baseSha
    || !isRecord(mergePayload.parents[1])
    || mergePayload.parents[1].sha !== headSha
  ) {
    throw new PromotionMergeVerificationError(
      'El test merge commit no tiene exactamente baseSha y headSha como padres ordenados.',
    );
  }

  const headTreeSha = validateCommitTree(headPayload, headSha, 'El head commit');
  if (mode === 'normal' && mergeTreeSha !== headTreeSha) {
    throw new PromotionMergeVerificationError(
      'staging no contiene todavía todo main: el tree del test merge difiere del tree desplegado.',
    );
  }

  return {
    mode,
    baseSha,
    headSha,
    mergeSha,
    mergeTreeSha,
    headTreeSha,
    stagingContainsMain: mode === 'normal' ? true : null,
  };
}

export async function verifyPromotionMerge({
  repository,
  baseSha,
  headSha,
  mergeSha,
  mode,
  token,
  apiBaseUrl = DEFAULT_GITHUB_API_URL,
  fetchFn = globalThis.fetch,
} = {}) {
  const parsedRepository = validateRepository(repository);
  validateSha(baseSha, 'baseSha');
  validateSha(headSha, 'headSha');
  validateSha(mergeSha, 'mergeSha');
  if (!VALID_MODES.has(mode)) {
    throw new PromotionMergeVerificationError('mode debe ser exactamente normal o hotfix.');
  }
  if (typeof token !== 'string' || token.trim() === '' || /[\r\n]/.test(token)) {
    throw new PromotionMergeVerificationError('GITHUB_TOKEN es obligatorio y debe ser válido.');
  }
  if (typeof fetchFn !== 'function') {
    throw new PromotionMergeVerificationError('La dependencia fetch no es válida.');
  }
  const apiUrl = validateApiBaseUrl(apiBaseUrl);
  const repoPath = `/repos/${encodeURIComponent(parsedRepository.owner)}/${encodeURIComponent(parsedRepository.repo)}`;
  const [mergePayload, headPayload] = await Promise.all([
    fetchGitHubJson(`${apiUrl}${repoPath}/git/commits/${mergeSha}`, { token, fetchFn }),
    fetchGitHubJson(`${apiUrl}${repoPath}/git/commits/${headSha}`, { token, fetchFn }),
  ]);
  return validatePromotionMergePayloads({
    mergePayload,
    headPayload,
    baseSha,
    headSha,
    mergeSha,
    mode,
  });
}

function parseCliArguments(argv) {
  const parsed = {};
  const names = new Map([
    ['--repository', 'repository'],
    ['--base-sha', 'baseSha'],
    ['--head-sha', 'headSha'],
    ['--merge-sha', 'mergeSha'],
    ['--mode', 'mode'],
    ['--api-url', 'apiBaseUrl'],
  ]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      parsed.help = true;
      continue;
    }
    const property = names.get(argument);
    if (!property || seen.has(argument)) {
      throw new PromotionMergeVerificationError(`Argumento no reconocido o repetido: ${argument}.`);
    }
    const value = argv[index + 1];
    if (typeof value !== 'string' || value.startsWith('--')) {
      throw new PromotionMergeVerificationError(`Falta el valor de ${argument}.`);
    }
    parsed[property] = value;
    seen.add(argument);
    index += 1;
  }
  return parsed;
}

export async function runVerifyPromotionMergeCli({
  argv = process.argv.slice(2),
  env = process.env,
  fetchFn = globalThis.fetch,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const args = parseCliArguments(argv);
    if (args.help) {
      stdout.write(
        'Uso: verify-promotion-merge.mjs --repository <owner/repo> --base-sha <sha> --head-sha <sha> --merge-sha <sha> --mode <normal|hotfix>\n',
      );
      return 0;
    }
    const result = await verifyPromotionMerge({
      repository: args.repository ?? env.GITHUB_REPOSITORY,
      baseSha: args.baseSha ?? env.PROMOTION_BASE_SHA,
      headSha: args.headSha ?? env.PROMOTION_HEAD_SHA,
      mergeSha: args.mergeSha ?? env.PROMOTION_MERGE_SHA,
      mode: args.mode ?? env.PROMOTION_MODE,
      token: env.GITHUB_TOKEN,
      apiBaseUrl: args.apiBaseUrl ?? env.GITHUB_API_URL ?? DEFAULT_GITHUB_API_URL,
      fetchFn,
    });
    const parity = result.mode === 'normal'
      ? '; staging tree contiene exactamente el resultado main+staging'
      : '';
    stdout.write(`Test merge ${result.mergeSha} validado (${result.mode})${parity}.\n`);
    return 0;
  } catch (error) {
    const message = error instanceof PromotionMergeVerificationError
      ? error.message
      : 'Error interno al verificar el test merge.';
    stderr.write(`Test merge DENEGADO: ${message}\n`);
    return 1;
  }
}

const isDirectInvocation = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectInvocation) {
  process.exitCode = await runVerifyPromotionMergeCli();
}
