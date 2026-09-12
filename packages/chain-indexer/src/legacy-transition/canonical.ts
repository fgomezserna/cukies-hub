import { createHash } from 'node:crypto';

export const MAX_UINT256 = (1n << 256n) - 1n;
export const MAX_INPUT_RECORDS = 10_000;
export const MAX_TOKENS_PER_WALLET = 1_000;
export const MAX_GLOBAL_TOKENS = 50_000;
export const MAX_INPUT_BYTES = 16 * 1024 * 1024;
export const MAX_IDENTIFIER_LENGTH = 128;
export const MAX_USER_ID_LENGTH = 256;
export const MAX_PATH_LENGTH = 240;
export const MAX_CSV_ROWS = 10_001;
export const MAX_CELL_LENGTH = 100_000;
export const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;

export function normalizeNfc(value: string) {
  return value.normalize('NFC');
}

export function compareCodePoints(left: string, right: string) {
  const a = Array.from(normalizeNfc(left), (character) => character.codePointAt(0) ?? 0);
  const b = Array.from(normalizeNfc(right), (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}

export function normalizeBoundedIdentifier(value: string, max = MAX_IDENTIFIER_LENGTH) {
  const normalized = normalizeNfc(value.trim());
  if (normalized.length === 0 || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function normalizeMachineId(value: unknown, max = MAX_IDENTIFIER_LENGTH) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) {
    return null;
  }
  return value;
}

export function parseUint256(value: string | undefined) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 78 || !/^(0|[1-9][0-9]*)$/.test(value)) {
    return null;
  }
  const parsed = BigInt(value);
  return parsed <= MAX_UINT256 ? parsed : null;
}

export function isSha256(value: string) {
  return /^[0-9a-f]{64}$/.test(value);
}

export function sanitizeExternalErrorCode(value: string) {
  const normalized = normalizeNfc(typeof value === 'string' ? value : '').trim().toUpperCase();
  const allowed = new Set([
    'TIMEOUT', 'RPC_TIMEOUT', 'RPC_DOWN', 'NETWORK_ERROR', 'RATE_LIMITED',
    'NOT_FOUND', 'UNAVAILABLE', 'INVALID_RESPONSE',
  ]);
  if (allowed.has(normalized)) return normalized;
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  return `EXTERNAL_${digest}`;
}
