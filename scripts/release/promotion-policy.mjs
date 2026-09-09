#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROMOTION_MANIFEST_SCHEMA_VERSION = 1;
export const PROMOTION_MANIFEST_REPOSITORY_PATH = '.github/release/promotion.json';

const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const HOTFIX_REF_PATTERN = /^hotfix\/(?!\/)(?!.*\/\/)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const MAX_MANIFEST_BYTES = 32 * 1024;
const MAX_EVIDENCE_ITEMS = 10;
const MAX_TEXT_LENGTH = 4_000;
const COMMON_MANIFEST_KEYS = Object.freeze([
  'schemaVersion',
  'mode',
  'pullRequest',
  'baseSha',
]);
const NORMAL_MANIFEST_KEYS = Object.freeze([
  ...COMMON_MANIFEST_KEYS,
  'stagingEvidence',
  'rollback',
]);
const HOTFIX_MANIFEST_KEYS = Object.freeze([
  ...COMMON_MANIFEST_KEYS,
  'incident',
  'urgency',
  'whyStagingCannotWait',
  'rollback',
]);

export class PromotionPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PromotionPolicyError';
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isFullGitSha(value) {
  return typeof value === 'string' && FULL_GIT_SHA_PATTERN.test(value);
}

export function isPlaceholderValue(value) {
  if (typeof value !== 'string') {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === '' || /^[?.!_\-–—]+$/.test(normalized)) {
    return true;
  }

  return (
    /^(?:<[^>]+>|\[[^\]]+\]|\{[^}]+\})$/.test(normalized)
    || /\b(?:tbd|todo|pending|placeholder|changeme|fixme|none|null|unknown|later)\b/.test(normalized)
    || /(?:pendiente|por\s+completar|rellenar|añadir|describir)/.test(normalized)
    || /\b(?:fill|insert|add|describe|provide|replace)\s+(?:this|me|the|an?|your|evidence|details?|plan|value|sha)\b/.test(normalized)
    || /\b(?:n\s*\/?\s*a|not\s+applicable|to\s+be\s+(?:decided|determined|defined|confirmed|completed))\b/.test(normalized)
  );
}

function validateExactKeys(manifest, expectedKeys) {
  const actualKeys = Object.keys(manifest).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpected.length
    || actualKeys.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new PromotionPolicyError(
      `El manifiesto ${manifest.mode ?? 'desconocido'} no contiene exactamente los campos permitidos.`,
    );
  }
}

function validateText(value, field) {
  if (
    typeof value !== 'string'
    || value.trim() !== value
    || value.length < 16
    || value.length > MAX_TEXT_LENGTH
    || isPlaceholderValue(value)
  ) {
    throw new PromotionPolicyError(
      `El campo ${field} del manifiesto está vacío, es un placeholder o tiene una longitud inválida.`,
    );
  }
  return value;
}

function validateEvidence(value) {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.length > MAX_EVIDENCE_ITEMS
    || new Set(value).size !== value.length
  ) {
    throw new PromotionPolicyError(
      'stagingEvidence debe contener entre 1 y 10 URLs HTTPS únicas.',
    );
  }

  for (const evidenceUrl of value) {
    let parsed;
    try {
      parsed = new URL(evidenceUrl);
    } catch {
      throw new PromotionPolicyError('stagingEvidence contiene una URL inválida.');
    }
    if (
      typeof evidenceUrl !== 'string'
      || evidenceUrl.length > 2_048
      || parsed.protocol !== 'https:'
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.hostname === ''
    ) {
      throw new PromotionPolicyError(
        'stagingEvidence solo admite URLs HTTPS absolutas y sin credenciales.',
      );
    }
  }
  return [...value];
}

function validateManifestBinding(pullRequest, manifest) {
  if (!isRecord(manifest)) {
    throw new PromotionPolicyError('Se requiere un manifiesto de promoción JSON válido.');
  }
  if (manifest.schemaVersion !== PROMOTION_MANIFEST_SCHEMA_VERSION) {
    throw new PromotionPolicyError(
      `schemaVersion debe ser exactamente ${PROMOTION_MANIFEST_SCHEMA_VERSION}.`,
    );
  }
  if (!Number.isSafeInteger(pullRequest.number) || pullRequest.number <= 0) {
    throw new PromotionPolicyError('El número de pull request no es válido.');
  }
  if (manifest.pullRequest !== pullRequest.number) {
    throw new PromotionPolicyError(
      'El manifiesto no está ligado al número exacto de esta pull request.',
    );
  }
  if (!isFullGitSha(pullRequest.base.sha)) {
    throw new PromotionPolicyError('El SHA de base debe ser un SHA Git completo de 40 caracteres.');
  }
  if (!isFullGitSha(manifest.baseSha) || manifest.baseSha !== pullRequest.base.sha) {
    throw new PromotionPolicyError(
      'El manifiesto no está ligado al SHA exacto actual de main.',
    );
  }
}

export function evaluatePromotionPolicy(event, manifest) {
  if (!isRecord(event) || !isRecord(event.pull_request)) {
    throw new PromotionPolicyError('Promotion policy: se requiere un evento de pull request válido.');
  }

  const pullRequest = event.pull_request;
  if (!isRecord(pullRequest.base) || pullRequest.base.ref !== 'main') {
    throw new PromotionPolicyError('La rama base debe ser exactamente main.');
  }
  if (!isRecord(pullRequest.head) || typeof pullRequest.head.ref !== 'string') {
    throw new PromotionPolicyError('La rama de origen de la pull request no es válida.');
  }
  if (
    !isRecord(pullRequest.base.repo)
    || !isRecord(pullRequest.head.repo)
    || typeof pullRequest.base.repo.full_name !== 'string'
    || pullRequest.base.repo.full_name === ''
    || pullRequest.head.repo.full_name !== pullRequest.base.repo.full_name
  ) {
    throw new PromotionPolicyError(
      'La promoción y los hotfixes deben originarse en una rama del mismo repositorio.',
    );
  }
  if (!isFullGitSha(pullRequest.head.sha)) {
    throw new PromotionPolicyError('El SHA de head debe ser un SHA Git completo de 40 caracteres.');
  }

  validateManifestBinding(pullRequest, manifest);

  const headRef = pullRequest.head.ref;
  const candidateSha = pullRequest.head.sha;
  let mode;

  if (headRef === 'staging') {
    mode = 'normal';
    if (manifest.mode !== mode) {
      throw new PromotionPolicyError('Una promoción desde staging requiere mode normal.');
    }
    validateExactKeys(manifest, NORMAL_MANIFEST_KEYS);
    validateEvidence(manifest.stagingEvidence);
    validateText(manifest.rollback, 'rollback');
  } else if (HOTFIX_REF_PATTERN.test(headRef)) {
    mode = 'hotfix';
    if (manifest.mode !== mode) {
      throw new PromotionPolicyError('Una rama hotfix/* requiere mode hotfix.');
    }
    validateExactKeys(manifest, HOTFIX_MANIFEST_KEYS);
    validateText(manifest.incident, 'incident');
    validateText(manifest.urgency, 'urgency');
    validateText(manifest.whyStagingCannotWait, 'whyStagingCannotWait');
    validateText(manifest.rollback, 'rollback');
  } else {
    throw new PromotionPolicyError(
      'Rama de origen no autorizada: use staging o una rama hotfix/* formal.',
    );
  }

  return {
    mode,
    pullRequest: pullRequest.number,
    baseRef: 'main',
    baseSha: pullRequest.base.sha,
    headRef,
    candidateSha,
  };
}

async function readJsonFile({ filePath, label, readFileFn }) {
  let raw;
  try {
    raw = await readFileFn(filePath, 'utf8');
  } catch {
    throw new PromotionPolicyError(`No se pudo leer ${label}.`);
  }
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_MANIFEST_BYTES) {
    throw new PromotionPolicyError(`${label} excede el tamaño permitido.`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new PromotionPolicyError(`${label} no contiene JSON válido.`);
  }
}

export async function runPromotionPolicyCli({
  env = process.env,
  readFileFn = readFile,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    if (typeof env.GITHUB_EVENT_PATH !== 'string' || env.GITHUB_EVENT_PATH.trim() === '') {
      throw new PromotionPolicyError('GITHUB_EVENT_PATH no está definido.');
    }
    if (
      typeof env.PROMOTION_MANIFEST_PATH !== 'string'
      || env.PROMOTION_MANIFEST_PATH.trim() === ''
    ) {
      throw new PromotionPolicyError('PROMOTION_MANIFEST_PATH no está definido.');
    }

    const event = await readJsonFile({
      filePath: env.GITHUB_EVENT_PATH,
      label: 'GITHUB_EVENT_PATH',
      readFileFn,
    });
    const manifest = await readJsonFile({
      filePath: env.PROMOTION_MANIFEST_PATH,
      label: 'PROMOTION_MANIFEST_PATH',
      readFileFn,
    });
    const result = evaluatePromotionPolicy(event, manifest);
    stdout.write(
      `Promotion policy: promoción ${result.mode} permitida para ${result.headRef} -> main (${result.candidateSha}).\n`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof PromotionPolicyError
      ? error.message
      : 'Error interno al evaluar la política.';
    stderr.write(`Promotion policy: DENEGADA. ${message}\n`);
    return 1;
  }
}

const isDirectInvocation = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectInvocation) {
  process.exitCode = await runPromotionPolicyCli();
}
