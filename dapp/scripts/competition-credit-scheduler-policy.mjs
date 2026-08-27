const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 240_000;

function strictBoolean(value, fallback, name) {
  if (value === undefined || String(value).trim() === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} debe ser true o false.`);
}

function boundedInteger(value, fallback, minimum, maximum, name) {
  if (value === undefined || String(value).trim() === '') return fallback;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) throw new Error(`${name} debe ser un entero.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} debe estar entre ${minimum} y ${maximum}.`);
  }
  return parsed;
}

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio con el scheduler activo.`);
  return value;
}

function schedulerId(value, host) {
  const candidate = (value?.trim() || host || 'scheduler').slice(0, 64);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(candidate)) {
    throw new Error('COMPETITION_CREDITS_SCHEDULER_ID tiene formato invalido.');
  }
  return candidate;
}

export function loadCompetitionCreditSchedulerConfig(environment, host) {
  const enabled = strictBoolean(
    environment.COMPETITION_CREDITS_SCHEDULER_ENABLED,
    false,
    'COMPETITION_CREDITS_SCHEDULER_ENABLED',
  );
  const intervalMs = boundedInteger(
    environment.COMPETITION_CREDITS_SCHEDULER_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
    5_000,
    10 * 60_000,
    'COMPETITION_CREDITS_SCHEDULER_INTERVAL_MS',
  );
  const tickTimeoutMs = boundedInteger(
    environment.COMPETITION_CREDITS_TICK_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    10_000,
    600_000,
    'COMPETITION_CREDITS_TICK_TIMEOUT_MS',
  );
  if (!enabled) {
    return {
      enabled,
      intervalMs,
      tickTimeoutMs,
      schedulerId: schedulerId(environment.COMPETITION_CREDITS_SCHEDULER_ID, host),
    };
  }

  const secret = required(environment, 'ECONOMY_INTERNAL_HMAC_SECRET');
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('ECONOMY_INTERNAL_HMAC_SECRET debe tener al menos 32 bytes.');
  }
  if (
    new Set(secret).size < 10
    || /^(.)\1+$/.test(secret)
    || /(change[-_ ]?me|example|placeholder|default|secret123|password)/i.test(secret)
  ) {
    throw new Error('ECONOMY_INTERNAL_HMAC_SECRET parece predecible o de ejemplo.');
  }
  if (Object.entries(environment).some(([name, value]) => (
    name.startsWith('NEXT_PUBLIC_') && typeof value === 'string' && value.trim() === secret
  ))) {
    throw new Error('ECONOMY_INTERNAL_HMAC_SECRET no puede reutilizar NEXT_PUBLIC.');
  }
  const keyId = required(environment, 'ECONOMY_INTERNAL_HMAC_KEY_ID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(keyId)) {
    throw new Error('ECONOMY_INTERNAL_HMAC_KEY_ID tiene formato invalido.');
  }
  const baseUrl = (environment.COMPETITION_CREDITS_SCHEDULER_BASE_URL?.trim()
    || 'http://dapp:3000').replace(/\/$/, '');
  const parsedBaseUrl = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol) || parsedBaseUrl.username || parsedBaseUrl.password) {
    throw new Error('COMPETITION_CREDITS_SCHEDULER_BASE_URL debe ser HTTP(S) sin credenciales.');
  }
  const dbName = required(environment, 'CHAIN_INDEXER_DB_NAME');
  if (!new Set(['cukieshub-new', 'cukieshub-new-staging']).has(dbName)) {
    throw new Error(
      'CHAIN_INDEXER_DB_NAME debe ser cukieshub-new o cukieshub-new-staging para credits.',
    );
  }
  return {
    enabled,
    intervalMs,
    tickTimeoutMs,
    schedulerId: schedulerId(environment.COMPETITION_CREDITS_SCHEDULER_ID, host),
    baseUrl,
    keyId,
    secret,
    mongoUrl: required(environment, 'CHAIN_INDEXER_MONGO_URL'),
    dbName,
  };
}
