#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { requireValue } from './cli-args.mjs';
import { assertImmutableImageEntry, CI_COMPONENTS } from './image-ref.mjs';

export async function readReleaseState(path) {
  return readFile(path, 'utf8').then(JSON.parse).catch((error) => {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  });
}

export function createSuccessfulState({ previous = null, head, configHash, components, deploymentUuid, healthSha }) {
  if (healthSha !== head) throw new Error('no se puede persistir release: health no confirma el SHA de CI.');
  if (!/^[0-9a-f]{40}$/i.test(head)) throw new Error('SHA desplegado inválido.');
  if (!/^[0-9a-f]{64}$/i.test(configHash ?? '')) throw new Error('config hash inválido.');
  const normalizedComponents = Object.fromEntries(CI_COMPONENTS.map((component) => {
    const value = assertImmutableImageEntry(component, components?.[component]);
    return [component, {
      image: value.image,
      digest: value.digest,
      tag: value.tag,
      configHash: value.configHash,
      sourceSha: value.sourceSha,
    }];
  }));
  return {
    schemaVersion: 1,
    environment: 'staging',
    chainId: '97',
    commit: head,
    configHash,
    deploymentUuid: deploymentUuid ?? null,
    components: normalizedComponents,
    previousCommit: previous?.commit ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export async function writeReleaseStateAtomic(path, state, { now = Date.now } = {}) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = join(dirname(path), `.${path.split('/').at(-1)}.${process.pid}.${now()}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
  return path;
}

async function main() {
  const statePath = requireValue(process.argv, '--state');
  const manifestPath = requireValue(process.argv, '--manifest');
  const healthSha = requireValue(process.argv, '--health-sha');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const previous = await readReleaseState(statePath);
  const state = createSuccessfulState({ previous, ...manifest, head: manifest.commit, healthSha });
  await writeReleaseStateAtomic(statePath, state);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
