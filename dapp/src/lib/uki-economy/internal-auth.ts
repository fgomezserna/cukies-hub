import 'server-only';

import {
  createHash,
  createHmac,
  timingSafeEqual,
  type BinaryLike,
} from 'node:crypto';

import type { Db, MongoServerError } from 'mongodb';

const INTERNAL_PATH_PREFIX = '/api/economy/v1/internal/';
const SIGNATURE_PREFIX = 'v1=';
const DEFAULT_MAX_CLOCK_SKEW_MS = 30_000;
const DEFAULT_NONCE_TTL_MS = 10 * 60_000;
export const ECONOMY_INTERNAL_MAX_BODY_BYTES = 1024 * 1024;

export const ECONOMY_INTERNAL_NONCES_COLLECTION = 'economy_internal_nonces';

export type InternalEconomyAuthErrorCode =
  | 'CONFIGURATION'
  | 'INVALID_REQUEST'
  | 'INVALID_KEY'
  | 'INVALID_SIGNATURE'
  | 'EXPIRED_REQUEST'
  | 'REPLAYED_REQUEST';

export class InternalEconomyAuthError extends Error {
  readonly code: InternalEconomyAuthErrorCode;

  constructor(code: InternalEconomyAuthErrorCode, message: string) {
    super(message);
    this.name = 'InternalEconomyAuthError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type InternalEconomyAuthConfig = {
  keyId: string;
  secret: Buffer;
  maxClockSkewMs: number;
  nonceTtlMs: number;
};

export type InternalEconomyAuthInput = {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  keyId: string;
  signature: string;
  rawBody: string | Buffer | Uint8Array;
};

export type InternalEconomyNonceDocument = {
  _id: string;
  keyId: string;
  nonceHash: string;
  requestHash: string;
  bodyHash: string;
  requestedAt: Date;
  consumedAt: Date;
  expiresAt: Date;
};

export interface InternalEconomyNonceRepository {
  consume(document: InternalEconomyNonceDocument): Promise<boolean>;
}

type InternalEconomyAuthEnvironment = Record<string, string | undefined>;

function requiredEnvironmentValue(
  environment: InternalEconomyAuthEnvironment,
  name: string,
) {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InternalEconomyAuthError(
      'CONFIGURATION',
      `${name} es obligatorio para autenticar rutas internas de economia.`,
    );
  }
  return value.trim();
}

function positiveBoundedInteger(
  value: string | undefined,
  fallback: number,
  label: string,
  maximum: number,
) {
  if (value === undefined || value.trim().length === 0) return fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new InternalEconomyAuthError('CONFIGURATION', `${label} debe ser un entero positivo.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new InternalEconomyAuthError(
      'CONFIGURATION',
      `${label} debe estar entre 1 y ${maximum}.`,
    );
  }
  return parsed;
}

export function loadInternalEconomyAuthConfig(
  environment: InternalEconomyAuthEnvironment = process.env,
): InternalEconomyAuthConfig {
  const keyId = requiredEnvironmentValue(environment, 'ECONOMY_INTERNAL_HMAC_KEY_ID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(keyId)) {
    throw new InternalEconomyAuthError(
      'CONFIGURATION',
      'ECONOMY_INTERNAL_HMAC_KEY_ID tiene un formato invalido.',
    );
  }

  const secretText = requiredEnvironmentValue(environment, 'ECONOMY_INTERNAL_HMAC_SECRET');
  const publicSecretReuse = Object.entries(environment).some(([name, value]) => (
    name.startsWith('NEXT_PUBLIC_')
    && typeof value === 'string'
    && value.trim().length > 0
    && secretText === value.trim()
  ));
  if (publicSecretReuse) {
    throw new InternalEconomyAuthError(
      'CONFIGURATION',
      'La clave interna de economia no puede reutilizar una variable NEXT_PUBLIC.',
    );
  }
  const secret = Buffer.from(secretText, 'utf8');
  if (secret.byteLength < 32) {
    throw new InternalEconomyAuthError(
      'CONFIGURATION',
      'ECONOMY_INTERNAL_HMAC_SECRET debe tener al menos 32 bytes.',
    );
  }
  const normalizedSecret = secretText.toLowerCase();
  const uniqueCharacters = new Set(secretText).size;
  if (
    uniqueCharacters < 10
    || /^(.)\1+$/.test(secretText)
    || /(change[-_ ]?me|example|placeholder|default|secret123|password)/i.test(normalizedSecret)
  ) {
    throw new InternalEconomyAuthError(
      'CONFIGURATION',
      'ECONOMY_INTERNAL_HMAC_SECRET parece predecible o de ejemplo.',
    );
  }

  const maxClockSkewMs = positiveBoundedInteger(
    environment.ECONOMY_INTERNAL_HMAC_MAX_SKEW_MS,
    DEFAULT_MAX_CLOCK_SKEW_MS,
    'ECONOMY_INTERNAL_HMAC_MAX_SKEW_MS',
    5 * 60_000,
  );
  const nonceTtlMs = positiveBoundedInteger(
    environment.ECONOMY_INTERNAL_HMAC_NONCE_TTL_MS,
    DEFAULT_NONCE_TTL_MS,
    'ECONOMY_INTERNAL_HMAC_NONCE_TTL_MS',
    24 * 60 * 60_000,
  );
  if (nonceTtlMs <= maxClockSkewMs * 2) {
    throw new InternalEconomyAuthError(
      'CONFIGURATION',
      'La retencion de nonces debe cubrir al menos dos veces la ventana de reloj.',
    );
  }

  return { keyId, secret, maxClockSkewMs, nonceTtlMs };
}

/**
 * Credencial de alcance exclusivo para el game server. No concede acceso a
 * rewards, reglas, migraciones ni ticks administrativos.
 */
export function loadGameEconomyAuthConfig(
  environment: InternalEconomyAuthEnvironment = process.env,
): InternalEconomyAuthConfig {
  const gameKeyId = environment.ECONOMY_GAMES_HMAC_KEY_ID;
  const gameSecret = environment.ECONOMY_GAMES_HMAC_SECRET;
  if (
    typeof gameSecret === 'string'
    && gameSecret.trim().length > 0
    && typeof environment.ECONOMY_INTERNAL_HMAC_SECRET === 'string'
    && gameSecret.trim() === environment.ECONOMY_INTERNAL_HMAC_SECRET.trim()
  ) {
    throw new InternalEconomyAuthError(
      'CONFIGURATION',
      'ECONOMY_GAMES_HMAC_SECRET debe ser distinta de la credencial administrativa.',
    );
  }
  return loadInternalEconomyAuthConfig({
    ...environment,
    ECONOMY_INTERNAL_HMAC_KEY_ID: gameKeyId,
    ECONOMY_INTERNAL_HMAC_SECRET: gameSecret,
  });
}

function requestBodyBytes(value: InternalEconomyAuthInput['rawBody']) {
  const byteLength = typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : value.byteLength;
  if (byteLength > ECONOMY_INTERNAL_MAX_BODY_BYTES) {
    throw new InternalEconomyAuthError(
      'INVALID_REQUEST',
      `El cuerpo firmado supera el limite de ${ECONOMY_INTERNAL_MAX_BODY_BYTES} bytes.`,
    );
  }
  if (Buffer.isBuffer(value)) return value;
  return typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
}

export async function readLimitedInternalEconomyRequestBody(
  request: Pick<Request, 'headers' | 'body'>,
) {
  const rawContentLength = request.headers.get('content-length');
  if (rawContentLength !== null) {
    if (!/^\d+$/.test(rawContentLength)) {
      throw new InternalEconomyAuthError('INVALID_REQUEST', 'Content-Length invalido.');
    }
    const contentLength = Number(rawContentLength);
    if (
      !Number.isSafeInteger(contentLength)
      || contentLength > ECONOMY_INTERNAL_MAX_BODY_BYTES
    ) {
      throw new InternalEconomyAuthError(
        'INVALID_REQUEST',
        `El cuerpo firmado supera el limite de ${ECONOMY_INTERNAL_MAX_BODY_BYTES} bytes.`,
      );
    }
  }

  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > ECONOMY_INTERNAL_MAX_BODY_BYTES) {
        await reader.cancel('economy internal body limit exceeded');
        throw new InternalEconomyAuthError(
          'INVALID_REQUEST',
          `El cuerpo firmado supera el limite de ${ECONOMY_INTERNAL_MAX_BODY_BYTES} bytes.`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}

function normalizedMethod(value: string) {
  if (typeof value !== 'string' || !/^[A-Za-z]{3,12}$/.test(value)) {
    throw new InternalEconomyAuthError('INVALID_REQUEST', 'Metodo HTTP invalido.');
  }
  return value.toUpperCase();
}

function validInternalPath(value: string) {
  const pathname = typeof value === 'string' ? value.split('?', 1)[0] : '';
  const lowerPathname = pathname.toLowerCase();
  if (
    typeof value !== 'string'
    || value.length > 2048
    || !value.startsWith(INTERNAL_PATH_PREFIX)
    || value.includes('#')
    || /[\r\n]/.test(value)
    || pathname.includes('\\')
    || pathname.includes('//')
    || pathname.split('/').includes('..')
    || lowerPathname.includes('%2e')
    || lowerPathname.includes('%2f')
    || lowerPathname.includes('%5c')
  ) {
    throw new InternalEconomyAuthError('INVALID_REQUEST', 'Ruta interna invalida.');
  }
  return value;
}

function validTimestamp(value: string) {
  if (typeof value !== 'string' || !/^\d{13}$/.test(value)) {
    throw new InternalEconomyAuthError(
      'INVALID_REQUEST',
      'El timestamp debe ser Unix epoch en milisegundos.',
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new InternalEconomyAuthError('INVALID_REQUEST', 'Timestamp fuera de rango.');
  }
  return parsed;
}

function validNonce(value: string) {
  if (typeof value !== 'string' || value.length > 128) {
    throw new InternalEconomyAuthError(
      'INVALID_REQUEST',
      'Nonce invalido; se requieren al menos 128 bits en base64url o hexadecimal.',
    );
  }
  if (/^[0-9a-fA-F]+$/.test(value)) {
    if (value.length < 32 || value.length % 2 !== 0) {
      throw new InternalEconomyAuthError(
        'INVALID_REQUEST',
        'Nonce hexadecimal invalido; se requieren al menos 128 bits.',
      );
    }
    return value;
  }
  if (!/^[A-Za-z0-9_-]{22,128}$/.test(value)) {
    throw new InternalEconomyAuthError(
      'INVALID_REQUEST',
      'Nonce base64url invalido; se requieren al menos 128 bits.',
    );
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.byteLength < 16 || decoded.toString('base64url') !== value) {
    throw new InternalEconomyAuthError(
      'INVALID_REQUEST',
      'Nonce base64url invalido; se requieren al menos 128 bits.',
    );
  }
  return value;
}

function validSignature(value: string) {
  if (
    typeof value !== 'string'
    || !new RegExp(`^${SIGNATURE_PREFIX}[0-9a-fA-F]{64}$`).test(value)
  ) {
    throw new InternalEconomyAuthError('INVALID_SIGNATURE', 'Firma HMAC invalida.');
  }
  return value.slice(SIGNATURE_PREFIX.length).toLowerCase();
}

function sha256(value: BinaryLike) {
  return createHash('sha256').update(value).digest('hex');
}

export function buildInternalEconomyCanonicalRequest(input: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  keyId: string;
  bodyHash: string;
}) {
  const method = normalizedMethod(input.method);
  const path = validInternalPath(input.path);
  validTimestamp(input.timestamp);
  const nonce = validNonce(input.nonce);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(input.keyId)) {
    throw new InternalEconomyAuthError('INVALID_KEY', 'Identificador de clave invalido.');
  }
  if (!/^[0-9a-f]{64}$/.test(input.bodyHash)) {
    throw new InternalEconomyAuthError('INVALID_REQUEST', 'Hash de cuerpo invalido.');
  }
  return [
    'cukies-economy-hmac-v1',
    input.keyId,
    method,
    path,
    input.timestamp,
    nonce,
    input.bodyHash,
  ].join('\n');
}

export function signInternalEconomyRequest(
  input: Omit<InternalEconomyAuthInput, 'signature'>,
  config: InternalEconomyAuthConfig,
) {
  if (input.keyId !== config.keyId) {
    throw new InternalEconomyAuthError('INVALID_KEY', 'La clave solicitada no esta activa.');
  }
  const bodyHash = sha256(requestBodyBytes(input.rawBody));
  const canonicalRequest = buildInternalEconomyCanonicalRequest({ ...input, bodyHash });
  const signature = createHmac('sha256', config.secret)
    .update(canonicalRequest, 'utf8')
    .digest('hex');
  return {
    signature: `${SIGNATURE_PREFIX}${signature}`,
    bodyHash,
    canonicalRequest,
    requestHash: sha256(canonicalRequest),
  };
}

function signaturesMatch(actualHex: string, expectedHeader: string) {
  const expectedHex = validSignature(expectedHeader);
  const actual = Buffer.from(actualHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

export async function verifyAndConsumeInternalEconomyRequest(input: {
  request: InternalEconomyAuthInput;
  config: InternalEconomyAuthConfig;
  nonces: InternalEconomyNonceRepository;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new InternalEconomyAuthError('INVALID_REQUEST', 'Fecha de verificacion invalida.');
  }
  if (input.request.keyId !== input.config.keyId) {
    throw new InternalEconomyAuthError('INVALID_KEY', 'La clave solicitada no esta activa.');
  }

  const requestedAtMs = validTimestamp(input.request.timestamp);
  if (Math.abs(now.getTime() - requestedAtMs) > input.config.maxClockSkewMs) {
    throw new InternalEconomyAuthError('EXPIRED_REQUEST', 'La solicitud interna esta fuera de ventana.');
  }

  const signed = signInternalEconomyRequest(
    {
      method: input.request.method,
      path: input.request.path,
      timestamp: input.request.timestamp,
      nonce: input.request.nonce,
      keyId: input.request.keyId,
      rawBody: input.request.rawBody,
    },
    input.config,
  );
  if (!signaturesMatch(signed.signature.slice(SIGNATURE_PREFIX.length), input.request.signature)) {
    throw new InternalEconomyAuthError('INVALID_SIGNATURE', 'Firma HMAC invalida.');
  }

  const nonce = validNonce(input.request.nonce);
  const nonceHash = sha256(`${input.config.keyId}:${nonce}`);
  const consumed = await input.nonces.consume({
    _id: nonceHash,
    keyId: input.config.keyId,
    nonceHash,
    requestHash: signed.requestHash,
    bodyHash: signed.bodyHash,
    requestedAt: new Date(requestedAtMs),
    consumedAt: new Date(now.getTime()),
    expiresAt: new Date(now.getTime() + input.config.nonceTtlMs),
  });
  if (!consumed) {
    throw new InternalEconomyAuthError('REPLAYED_REQUEST', 'Nonce interno ya consumido.');
  }

  return {
    keyId: input.config.keyId,
    nonceHash,
    bodyHash: signed.bodyHash,
    requestHash: signed.requestHash,
    requestedAt: new Date(requestedAtMs),
    verifiedAt: new Date(now.getTime()),
  };
}

function isMongoDuplicateKey(error: unknown) {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && Number((error as MongoServerError).code) === 11000,
  );
}

export function createMongoInternalEconomyNonceRepository(
  db: Db,
): InternalEconomyNonceRepository {
  const collection = db.collection<InternalEconomyNonceDocument>(
    ECONOMY_INTERNAL_NONCES_COLLECTION,
  );
  return {
    async consume(document) {
      try {
        await collection.insertOne(document, { writeConcern: { w: 'majority' } });
        return true;
      } catch (error) {
        if (isMongoDuplicateKey(error)) return false;
        throw error;
      }
    },
  };
}
