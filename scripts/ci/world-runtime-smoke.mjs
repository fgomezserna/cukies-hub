#!/usr/bin/env node

/**
 * CI gate around the unchanged World runtime harness.
 *
 * The release manifest is the source of both image references and source
 * SHAs.  This wrapper requires both entries, pulls every immutable reference
 * (including a reused image), verifies the OCI revision per component, and
 * then delegates all runtime checks to the synthetic local-only harness.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const entries = [
  ['WORLD_API_IMAGE', 'WORLD_API_SOURCE_SHA', 'world-api'],
  ['WORLD_MATCHMAKING_IMAGE', 'WORLD_MATCHMAKING_SOURCE_SHA', 'world-matchmaking'],
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`World smoke exige ${name}.`);
  return value;
}

function docker(args, options = {}) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function assertRevision(image, sourceSha, component) {
  if (!/^[0-9a-f]{40}$/i.test(sourceSha)) throw new Error(`${component} source SHA inválido para smoke.`);
  const labels = JSON.parse(docker(['image', 'inspect', image, '--format', '{{json .Config.Labels}}']) || '{}');
  const actual = labels?.['org.opencontainers.image.revision'] ?? null;
  if (actual !== sourceSha) {
    throw new Error(`${component} OCI revision ${actual ?? '(ausente)'} no coincide con sourceSha ${sourceSha}.`);
  }
}

for (const [imageName, shaName, component] of entries) {
  const image = required(imageName);
  const sourceSha = required(shaName);
  // CI manifests use immutable registry references. A local opt-in check may
  // set WORLD_SMOKE_SKIP_PULL while exercising tags built on the workstation.
  if (process.env.WORLD_SMOKE_SKIP_PULL !== 'true') docker(['pull', image], { stdio: 'inherit' });
  assertRevision(image, sourceSha, component);
}

const harness = fileURLToPath(new URL('../../infrastructure/world/tests/runtime-smoke.mjs', import.meta.url));
execFileSync(process.execPath, [harness], {
  stdio: 'inherit',
  env: process.env,
});
