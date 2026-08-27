const DEFAULT_DB_NAME = 'cukieshub-new';

function boundedInteger(environment, name, fallback, minimum, maximum) {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} debe ser un entero positivo.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} debe estar entre ${minimum} y ${maximum}.`);
  }
  return value;
}

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio para el scheduler del pool de Cukies.`);
  return value;
}

function validateHmac(environment) {
  const keyId = required(environment, 'ECONOMY_INTERNAL_HMAC_KEY_ID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(keyId)) {
    throw new Error('ECONOMY_INTERNAL_HMAC_KEY_ID tiene un formato invalido.');
  }
  const secret = required(environment, 'ECONOMY_INTERNAL_HMAC_SECRET');
  const publicReuse = Object.entries(environment).some(([name, value]) => (
    name.startsWith('NEXT_PUBLIC_')
    && typeof value === 'string'
    && value.trim().length > 0
    && value.trim() === secret
  ));
  if (publicReuse) {
    throw new Error('ECONOMY_INTERNAL_HMAC_SECRET no puede reutilizar una variable NEXT_PUBLIC.');
  }
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
  return { keyId, secret };
}

export function loadCukiePoolSchedulerConfig(environment = process.env, host = 'scheduler') {
  const rawEnabled = environment.CUKIE_POOL_RUNTIME_ENABLED?.trim();
  if (rawEnabled && rawEnabled !== 'true' && rawEnabled !== 'false') {
    throw new Error('CUKIE_POOL_RUNTIME_ENABLED debe ser true o false.');
  }
  const enabled = rawEnabled === 'true';
  const intervalMs = boundedInteger(
    environment,
    'CUKIE_POOL_SCHEDULER_INTERVAL_MS',
    30_000,
    10_000,
    60 * 60_000,
  );
  const tickTimeoutMs = boundedInteger(
    environment,
    'CUKIE_POOL_TICK_TIMEOUT_MS',
    240_000,
    10_000,
    600_000,
  );
  const baseUrl = (environment.CUKIE_POOL_DAPP_INTERNAL_URL ?? 'http://dapp:3000')
    .trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error('CUKIE_POOL_DAPP_INTERNAL_URL debe ser una URL HTTP(S).');
  }
  const schedulerId = (environment.CUKIE_POOL_SCHEDULER_ID ?? host).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(schedulerId)) {
    throw new Error('CUKIE_POOL_SCHEDULER_ID tiene un formato invalido.');
  }
  if (!enabled) {
    return {
      enabled,
      intervalMs,
      tickTimeoutMs,
      baseUrl,
      schedulerId,
      keyId: null,
      secret: null,
      mongoUrl: null,
      dbName: null,
    };
  }
  const { keyId, secret } = validateHmac(environment);
  const mongoUrl = required(environment, 'CHAIN_INDEXER_MONGO_URL');
  const dbName = (environment.CHAIN_INDEXER_DB_NAME ?? DEFAULT_DB_NAME).trim();
  if (!dbName || dbName.toLowerCase() === 'cukies') {
    throw new Error('CHAIN_INDEXER_DB_NAME no puede estar vacio ni apuntar a `cukies`.');
  }
  return {
    enabled,
    intervalMs,
    tickTimeoutMs,
    baseUrl,
    schedulerId,
    keyId,
    secret,
    mongoUrl,
    dbName,
  };
}
