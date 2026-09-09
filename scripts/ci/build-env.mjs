#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const PUBLIC_KEY = /^(NEXT_PUBLIC_[A-Z0-9_]+|GAME_[A-Z0-9_]+|DISCORD_CLIENT_ID|TWITTER_CLIENT_ID)$/;
const SECRET_KEY = /(SECRET|PASSWORD|PRIVATE_KEY|API_KEY|DATABASE_URL|MONGO_URL|ACCESS_KEY|AWS_SECRET)/i;

export const BUILD_ENV_ALLOWLIST = Object.freeze([
  'NEXT_PUBLIC_*',
  'GAME_*',
  'DISCORD_CLIENT_ID',
  'TWITTER_CLIENT_ID',
]);

function fail(message) {
  throw new Error(`CUKIES_STAGING_BUILD_ENV_JSON inválido: ${message}`);
}

export function canonicalizeBuildEnv(input, { environment = 'staging', chainId = '97' } = {}) {
  let parsed;
  try {
    parsed = typeof input === 'string' ? JSON.parse(input) : input;
  } catch (error) {
    fail(`JSON malformado (${error.message}).`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') fail('debe ser un objeto JSON.');

  const result = {};
  for (const key of Object.keys(parsed).sort()) {
    if (!PUBLIC_KEY.test(key) || SECRET_KEY.test(key)) {
      fail(`la clave ${key} no pertenece a la allowlist pública.`);
    }
    const value = parsed[key];
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      fail(`el valor de ${key} debe ser scalar.`);
    }
    result[key] = String(value);
  }

  if (result.NEXT_PUBLIC_APP_ENV !== environment) {
    fail(`NEXT_PUBLIC_APP_ENV debe ser ${environment}.`);
  }
  if (result.NEXT_PUBLIC_UKI_CHAIN_ID !== chainId) {
    fail(`NEXT_PUBLIC_UKI_CHAIN_ID debe ser ${chainId}.`);
  }

  const canonical = JSON.stringify(Object.fromEntries(Object.entries(result).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
  return Object.freeze({
    environment,
    chainId,
    config: result,
    canonical,
    hash: createHash('sha256').update(canonical).digest('hex'),
  });
}

async function main() {
  const source = process.env.CUKIES_STAGING_BUILD_ENV_JSON;
  if (typeof source !== 'string' || source.trim() === '') fail('CUKIES_STAGING_BUILD_ENV_JSON es obligatorio.');
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex !== -1 && (!process.argv[outputIndex + 1] || process.argv[outputIndex + 1].startsWith('--'))) {
    fail('--output requiere una ruta explicita.');
  }
  const outputPath = outputIndex === -1 ? null : process.argv[outputIndex + 1];
  const result = canonicalizeBuildEnv(source, { environment: 'staging', chainId: '97' });
  if (outputPath) await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ hash: result.hash, canonical: result.canonical, keys: Object.keys(result.config) }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
