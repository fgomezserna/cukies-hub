#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { requireValue } from './cli-args.mjs';
import { assertEnvironmentMetadata, resolveDeploymentEnvironment } from './deployment-environment.mjs';
import { assertImmutableImageEntry, CI_COMPONENTS, WORLD_COMPONENTS } from './image-ref.mjs';

export async function readReleaseState(path) {
  return readFile(path, 'utf8').then(JSON.parse).catch((error) => {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  });
}

export function createSuccessfulState({ previous = null, head, configHash, components, deploymentUuid, healthSha, environment, chainId, deliveryMode, workersComposeHash, webResourceUuid, workersResourceUuid, gameResourceUuid, gameDeploymentUuid, webCommit, gameCommit }) {
  const deployment = resolveDeploymentEnvironment(environment);
  if (chainId !== undefined && String(chainId) !== deployment.chainId) {
    throw new Error(`release state no corresponde al entorno ${deployment.environment}/${deployment.chainId}.`);
  }
  if (previous) assertEnvironmentMetadata(previous, deployment, { allowLegacy: deployment.environment === 'staging', context: 'previous release state' });
  if (healthSha !== head) throw new Error('no se puede persistir release: health no confirma el SHA de CI.');
  if (!/^[0-9a-f]{40}$/i.test(head)) throw new Error('SHA desplegado inválido.');
  if (!/^[0-9a-f]{64}$/i.test(configHash ?? '')) throw new Error('config hash inválido.');
  const normalizedComponents = Object.fromEntries(CI_COMPONENTS.map((component) => {
    const entry = components?.[component];
    // The game lane was added after the five-component state format. Allow a
    // legacy state to be read and rewritten while the release plan builds the
    // missing game image; once it exists, a missing entry is an error.
    if (!entry && component === 'treasure-hunt' && !previous?.components?.[component]) return null;
    assertEnvironmentMetadata(entry, deployment, { allowLegacy: deployment.environment === 'staging', context: `imagen de ${component}` });
    const value = assertImmutableImageEntry(component, entry);
    return [component, {
      image: value.image,
      digest: value.digest,
      tag: value.tag,
      configHash: value.configHash,
      sourceSha: value.sourceSha,
      environment: deployment.environment,
      chainId: deployment.chainId,
    }];
  }).filter(Boolean));
  const resolvedWebCommit = webCommit ?? previous?.webCommit ?? previous?.commit ?? (healthSha === head ? head : null);
  const resolvedGameCommit = gameCommit ?? previous?.gameCommit
    ?? (previous?.components?.['treasure-hunt'] ? previous.commit : null);
  return {
    schemaVersion: 1,
    environment: deployment.environment,
    chainId: deployment.chainId,
    commit: head,
    configHash,
    deploymentUuid: deploymentUuid ?? null,
    ...(deliveryMode === 'rolling' ? {
      deliveryMode,
      workersComposeHash,
      webResourceUuid,
      workersResourceUuid,
      gameResourceUuid: gameResourceUuid ?? previous?.gameResourceUuid ?? null,
      gameDeploymentUuid: gameDeploymentUuid ?? previous?.gameDeploymentUuid ?? null,
    } : {}),
    components: normalizedComponents,
    webCommit: resolvedWebCommit,
    gameCommit: resolvedGameCommit,
    previousCommit: previous?.commit ?? null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Persists a CI manifest when the effective rolling delivery is a no-op.
 *
 * World images are part of the registry/catalogue even while their runtime is
 * disabled.  They therefore need to advance the durable base without claiming
 * a new health SHA or changing any active Coolify identity.  Only the two
 * World entries may differ from the previous state in this path.
 */
export function createNoopState({ previous = null, head, configHash, components, environment, chainId, workersComposeHash }) {
  if (!previous || previous.deliveryMode !== 'rolling') {
    throw new Error('un registro sin entrega rolling previa no puede marcar un no-op.');
  }
  const deployment = resolveDeploymentEnvironment(environment);
  if (chainId !== undefined && String(chainId) !== deployment.chainId) {
    throw new Error(`release state no corresponde al entorno ${deployment.environment}/${deployment.chainId}.`);
  }
  assertEnvironmentMetadata(previous, deployment, { allowLegacy: deployment.environment === 'staging', context: 'previous release state' });
  if (!/^[0-9a-f]{40}$/i.test(head ?? '')) throw new Error('SHA procesado inválido.');
  if (!/^[0-9a-f]{64}$/i.test(configHash ?? '')) throw new Error('config hash inválido.');
  if (previous.configHash !== configHash) throw new Error('el no-op requiere el mismo config hash efectivo.');
  if (!/^[0-9a-f]{64}$/i.test(workersComposeHash ?? '') || previous.workersComposeHash !== workersComposeHash) {
    throw new Error('el no-op requiere el mismo hash de Compose efectivo.');
  }

  const normalizedComponents = Object.fromEntries(CI_COMPONENTS.map((component) => {
    const entry = components?.[component];
    if (!entry) throw new Error(`falta la imagen de ${component} para registrar el no-op.`);
    assertEnvironmentMetadata(entry, deployment, { allowLegacy: deployment.environment === 'staging', context: `imagen de ${component}` });
    const value = assertImmutableImageEntry(component, entry);
    return [component, {
      image: value.image,
      digest: value.digest,
      tag: value.tag,
      configHash: value.configHash,
      sourceSha: value.sourceSha,
      environment: deployment.environment,
      chainId: deployment.chainId,
    }];
  }));

  for (const component of CI_COMPONENTS.filter((value) => !WORLD_COMPONENTS.includes(value))) {
    const previousEntry = previous.components?.[component];
    if (!previousEntry) throw new Error(`falta la imagen activa previa de ${component} para registrar el no-op.`);
    assertEnvironmentMetadata(previousEntry, deployment, { allowLegacy: deployment.environment === 'staging', context: `imagen activa previa de ${component}` });
    const previousValue = assertImmutableImageEntry(component, previousEntry);
    const currentValue = normalizedComponents[component];
    for (const key of ['image', 'digest', 'tag', 'configHash', 'sourceSha']) {
      if (currentValue[key] !== previousValue[key]) {
        throw new Error(`el no-op no puede cambiar la referencia activa de ${component}.`);
      }
    }
  }

  return {
    ...previous,
    schemaVersion: previous.schemaVersion ?? 1,
    environment: deployment.environment,
    chainId: deployment.chainId,
    commit: head,
    configHash,
    workersComposeHash,
    components: normalizedComponents,
    // Legacy rolling states (schema 6) did not persist lane commits.  Carry
    // their served identities forward explicitly; otherwise a catalogue-only
    // no-op would report the new CI head as the served web SHA.
    webCommit: previous.webCommit ?? previous.commit ?? null,
    gameCommit: previous.gameCommit
      ?? (previous.components?.['treasure-hunt'] ? previous.commit : null),
    previousCommit: previous.commit ?? previous.deployedSha ?? null,
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
  const environmentName = requireValue(process.argv, '--environment', {
    fallback: process.env.CUKIES_DEPLOY_ENVIRONMENT ?? manifest.environment ?? 'staging',
  });
  const deployment = resolveDeploymentEnvironment(environmentName);
  assertEnvironmentMetadata(manifest, deployment, { allowLegacy: deployment.environment === 'staging', context: 'release manifest' });
  const previous = await readReleaseState(statePath);
  const state = createSuccessfulState({ previous, ...manifest, environment: deployment.environment, head: manifest.commit, healthSha });
  await writeReleaseStateAtomic(statePath, state);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
