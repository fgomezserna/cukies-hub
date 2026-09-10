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

function required(name, env = process.env) {
  const value = env[name];
  if (!value) throw new Error(`World smoke exige ${name}.`);
  return value;
}

export function docker(args, options = {}) {
  const output = execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  return typeof output === 'string' ? output.trim() : '';
}

export function assertRevision(image, sourceSha, component, dockerImpl = docker) {
  if (!/^[0-9a-f]{40}$/i.test(sourceSha)) throw new Error(`${component} source SHA inválido para smoke.`);
  const labels = JSON.parse(dockerImpl(['image', 'inspect', image, '--format', '{{json .Config.Labels}}']) || '{}');
  const actual = labels?.['org.opencontainers.image.revision'] ?? null;
  if (actual !== sourceSha) {
    throw new Error(`${component} OCI revision ${actual ?? '(ausente)'} no coincide con sourceSha ${sourceSha}.`);
  }
}

export function verifyWorldImages({ env = process.env, dockerImpl = docker } = {}) {
  for (const [imageName, shaName, component] of entries) {
    const image = required(imageName, env);
    const sourceSha = required(shaName, env);
    // CI manifests use immutable registry references. A local opt-in check may
    // set WORLD_SMOKE_SKIP_PULL while exercising tags built on the workstation.
    if (env.WORLD_SMOKE_SKIP_PULL !== 'true') dockerImpl(['pull', image], { stdio: 'inherit' });
    assertRevision(image, sourceSha, component, dockerImpl);
  }
}

export function runWorldRuntimeSmoke({ env = process.env, dockerImpl = docker, execImpl = execFileSync } = {}) {
  verifyWorldImages({ env, dockerImpl });
  const harness = fileURLToPath(new URL('../../infrastructure/world/tests/runtime-smoke.mjs', import.meta.url));
  return execImpl(process.execPath, [harness], {
    stdio: 'inherit',
    env,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) runWorldRuntimeSmoke();
