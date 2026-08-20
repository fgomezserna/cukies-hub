const DEFAULT_DB_NAME = 'cukieshub-new';

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio para el scheduler de reward accounting.`);
  return value;
}

function bounded(environment, name, fallback, minimum, maximum) {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} debe ser un entero.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} debe estar entre ${minimum} y ${maximum}.`);
  }
  return value;
}

function strictGate(environment, name) {
  const value = environment[name]?.trim();
  if (value && value !== 'true' && value !== 'false') {
    throw new Error(`${name} debe ser true o false.`);
  }
  return value === 'true';
}

export function loadRewardAccountingSchedulerConfig(environment = process.env, host = 'scheduler') {
  const enabled = strictGate(environment, 'REWARD_ACCOUNTING_RUNTIME_ENABLED');
  const baseUrl = (environment.REWARD_ACCOUNTING_DAPP_INTERNAL_URL ?? 'http://dapp:3000')
    .trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error('REWARD_ACCOUNTING_DAPP_INTERNAL_URL debe ser HTTP(S).');
  }
  const schedulerId = (environment.REWARD_ACCOUNTING_SCHEDULER_ID ?? host).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(schedulerId)) {
    throw new Error('REWARD_ACCOUNTING_SCHEDULER_ID tiene formato invalido.');
  }
  const shared = {
    enabled,
    baseUrl,
    schedulerId,
    intervalMs: bounded(
      environment,
      'REWARD_ACCOUNTING_SCHEDULER_INTERVAL_MS',
      60_000,
      10_000,
      60 * 60_000,
    ),
    tickTimeoutMs: bounded(
      environment,
      'REWARD_ACCOUNTING_TICK_TIMEOUT_MS',
      240_000,
      10_000,
      600_000,
    ),
  };
  if (!enabled) return { ...shared, keyId: null, secret: null, mongoUrl: null, dbName: null };
  for (const gate of [
    'REWARD_DAILY_ACCOUNTING_ENABLED',
    'REWARD_WEEKLY_PAYOUT_ENABLED',
    'REWARD_POOL_TRANCHES_ENABLED',
  ]) strictGate(environment, gate);
  const keyId = required(environment, 'ECONOMY_INTERNAL_HMAC_KEY_ID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(keyId)) {
    throw new Error('ECONOMY_INTERNAL_HMAC_KEY_ID tiene formato invalido.');
  }
  const secret = required(environment, 'ECONOMY_INTERNAL_HMAC_SECRET');
  if (Buffer.byteLength(secret, 'utf8') < 32 || new Set(secret).size < 10) {
    throw new Error('ECONOMY_INTERNAL_HMAC_SECRET no tiene entropia suficiente.');
  }
  if (Object.entries(environment).some(([name, value]) => (
    name.startsWith('NEXT_PUBLIC_') && typeof value === 'string' && value.trim() === secret
  ))) throw new Error('ECONOMY_INTERNAL_HMAC_SECRET no puede ser publica.');
  const dbName = (environment.CHAIN_INDEXER_DB_NAME ?? DEFAULT_DB_NAME).trim();
  if (!dbName || dbName.toLowerCase() === 'cukies') {
    throw new Error('CHAIN_INDEXER_DB_NAME no puede apuntar a la base legacy.');
  }
  return {
    ...shared,
    keyId,
    secret,
    mongoUrl: required(environment, 'CHAIN_INDEXER_MONGO_URL'),
    dbName,
  };
}
