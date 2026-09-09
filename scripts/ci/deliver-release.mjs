#!/usr/bin/env node

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { requireValue } from './cli-args.mjs';
import { createCoolifyReleaseClient, buildImageEnvironment, assertPinnedApplication } from './coolify-release.mjs';
import { deployRollingWeb } from './coolify-rolling-web.mjs';
import { resolveCoolifyTargets } from './coolify-targets.mjs';
import { chooseDelivery } from './release-delivery-plan.mjs';
import { readReleaseState, createSuccessfulState, writeReleaseStateAtomic } from './release-state.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function assertWorkerTarget(application, target) {
  if (application?.uuid !== target.resourceUuid || application?.git_branch !== target.gitBranch
    || application?.git_repository !== target.repository || application?.build_pack !== 'dockercompose') {
    throw new Error('El recurso de workers no coincide con el destino aprobado.');
  }
}

export async function deployWorkers({ client, targets, manifest, compose, sleepImpl = sleep, timeoutMs = 30 * 60 * 1000 }) {
  const target = targets.workers;
  assertWorkerTarget(await client.getApplication(target.resourceUuid), target);
  await client.patchEnvs(target.resourceUuid, [
    ...buildImageEnvironment(manifest),
    { key: 'CUKIES_WEB_URL', value: targets.publicUrl, is_runtime: true, is_buildtime: true, is_literal: true },
    { key: 'CUKIES_WEB_RESOURCE_UUID', value: targets.web.resourceUuid, is_runtime: true, is_buildtime: true, is_literal: true },
  ]);
  await client.patchApplication(target.resourceUuid, { git_commit_sha: manifest.commit, docker_compose_location: target.composeLocation, docker_compose_raw: compose });
  assertPinnedApplication(await client.getApplication(target.resourceUuid), manifest.commit);
  const started = await client.start(target.resourceUuid);
  const deploymentUuid = started.deployment_uuid ?? started.uuid;
  if (!deploymentUuid) throw new Error('Coolify no devolvió el identificador de workers.');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await client.getDeployment(deploymentUuid);
    if (current.commit && current.commit !== 'HEAD' && current.commit !== manifest.commit) throw new Error('SHA inesperado en el despliegue de workers.');
    if (current.status === 'finished') {
      if (current.commit !== manifest.commit) throw new Error('Workers terminaron sin confirmar su SHA.');
      return { deploymentUuid, status: 'finished', commit: manifest.commit };
    }
    if (['failed', 'error', 'cancelled', 'cancelled-by-user', 'canceled', 'canceled-by-user'].includes(current.status)) throw new Error(`Despliegue de workers ${deploymentUuid}: ${current.status}.`);
    await sleepImpl(5000);
  }
  throw new Error(`Timeout esperando workers ${deploymentUuid}.`);
}

export async function deliverRelease({ client, manifest, previous, compose, targets = resolveCoolifyTargets(manifest.environment), webDeploy = deployRollingWeb, workerDeploy = deployWorkers, recordProgress = async () => {}, sleepImpl = sleep }) {
  const decision = chooseDelivery({ manifest, previous, compose });
  if (decision.skip) return { status: 'skipped', reason: 'images-and-workers-compose-unchanged', servedSha: previous.commit, decision };
  await recordProgress({ phase: 'web-starting', commit: manifest.commit, environment: manifest.environment, webResourceUuid: targets.web.resourceUuid, workersResourceUuid: targets.workers.resourceUuid });
  const web = await webDeploy({ client, target: targets.web, manifest, previousManifest: previous });
  await recordProgress({ phase: 'web-verified', web, candidate: manifest });
  if (decision.workers) {
    // During the initial split the old web belongs to the workers resource.
    // Give requests routed before the switch time to finish before Compose stops it.
    if (previous?.deliveryMode !== 'rolling') await sleepImpl(60_000);
    await recordProgress({ phase: 'workers-starting' });
  }
  const workers = decision.workers ? await workerDeploy({ client, targets, manifest, compose }) : null;
  await recordProgress({ phase: 'delivery-verified', web, workers });
  Object.assign(manifest, { deliveryMode: 'rolling', workersComposeHash: decision.workersComposeHash, deploymentUuid: web.deploymentUuid, webResourceUuid: targets.web.resourceUuid, workersResourceUuid: targets.workers.resourceUuid });
  return { status: 'finished', environment: manifest.environment, healthSha: manifest.commit, web, workers, decision };
}

export async function assertNoPendingDelivery(path) {
  // A malformed journal must also stop delivery; unlike optional release state,
  // losing this record could conceal a partially updated runtime.
  const raw = await readFile(path, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (raw !== null) throw new Error(`Hay una entrega sin reconciliar en ${path}. Comprueba web, workers y el estado final de Coolify antes de continuar.`);
}

async function main() {
  const manifestPath = requireValue(process.argv, '--manifest');
  const statePath = requireValue(process.argv, '--state');
  const resultPath = requireValue(process.argv, '--result');
  const compose = await readFile(requireValue(process.argv, '--compose'), 'utf8');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const journalPath = `${statePath}.pending.json`;
  await assertNoPendingDelivery(journalPath);
  const previous = await readReleaseState(statePath);
  let journal = { startedAt: new Date().toISOString(), previousCommit: previous?.commit ?? null };
  const recordProgress = async (progress) => {
    journal = { ...journal, ...progress, updatedAt: new Date().toISOString() };
    await writeReleaseStateAtomic(journalPath, journal);
  };
  const result = await deliverRelease({ client: createCoolifyReleaseClient(), manifest, previous, compose, recordProgress });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  if (result.status === 'finished') {
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await writeReleaseStateAtomic(statePath, createSuccessfulState({ previous, ...manifest, head: manifest.commit, healthSha: result.healthSha }));
    await unlink(journalPath);
  }
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
