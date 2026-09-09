#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { requireValue } from './cli-args.mjs';
import { resolveDeploymentEnvironment } from './deployment-environment.mjs';

const PUBLIC_KEY = /^(NEXT_PUBLIC_[A-Z0-9_]+|GAME_[A-Z0-9_]+|DISCORD_CLIENT_ID|TWITTER_CLIENT_ID)$/;
const SECRET_KEY = /(SECRET|PASSWORD|PRIVATE_KEY|API_KEY|DATABASE_URL|MONGO_URL|ACCESS_KEY|AWS_SECRET)/i;

export const BUILD_ENV_ALLOWLIST = Object.freeze([
  'NEXT_PUBLIC_*',
  'GAME_*',
  'DISCORD_CLIENT_ID',
  'TWITTER_CLIENT_ID',
]);

function fail(message) {
  throw new Error(`CUKIES_BUILD_ENV_JSON inválido: ${message}`);
}

export function canonicalizeBuildEnv(input, { environment = 'staging', chainId } = {}) {
  const deployment = resolveDeploymentEnvironment(environment);
  const expectedChainId = chainId === undefined ? deployment.chainId : String(chainId);
  if (expectedChainId !== deployment.chainId) fail(`chainId ${expectedChainId} no pertenece a ${deployment.environment}.`);
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

  if (result.NEXT_PUBLIC_APP_ENV !== deployment.environment) {
    fail(`NEXT_PUBLIC_APP_ENV debe ser ${deployment.environment}.`);
  }
  if (result.NEXT_PUBLIC_UKI_CHAIN_ID !== expectedChainId) {
    fail(`NEXT_PUBLIC_UKI_CHAIN_ID debe ser ${expectedChainId}.`);
  }

  const canonical = JSON.stringify(Object.fromEntries(Object.entries(result).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
  return Object.freeze({
    environment: deployment.environment,
    chainId: deployment.chainId,
    config: result,
    canonical,
    hash: createHash('sha256').update(canonical).digest('hex'),
  });
}

async function main() {
  const environmentName = requireValue(process.argv, '--environment', { fallback: process.env.CUKIES_DEPLOY_ENVIRONMENT ?? 'staging' });
  const deployment = resolveDeploymentEnvironment(environmentName);
  const source = process.env.CUKIES_BUILD_ENV_JSON
    ?? (deployment.environment === 'staging' ? process.env.CUKIES_STAGING_BUILD_ENV_JSON : undefined);
  if (typeof source !== 'string' || source.trim() === '') {
    fail(deployment.environment === 'staging'
      ? 'CUKIES_BUILD_ENV_JSON es obligatorio (o CUKIES_STAGING_BUILD_ENV_JSON durante la transición).'
      : 'CUKIES_BUILD_ENV_JSON es obligatorio para production.');
  }
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex !== -1 && (!process.argv[outputIndex + 1] || process.argv[outputIndex + 1].startsWith('--'))) {
    fail('--output requiere una ruta explicita.');
  }
  const outputPath = outputIndex === -1 ? null : process.argv[outputIndex + 1];
  const result = canonicalizeBuildEnv(source, deployment);
  if (outputPath) await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ hash: result.hash, canonical: result.canonical, keys: Object.keys(result.config) }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
