#!/usr/bin/env node

import { assertEnvironmentMetadata } from './deployment-environment.mjs';
import { createCoolifyReleaseClient } from './coolify-release.mjs';
import { assertImmutableImageEntry, parseImmutableImage } from './image-ref.mjs';

const TERMINAL_FAILURES = new Set([
  'failed',
  'error',
  'cancelled',
  'cancelled-by-user',
  'canceled',
  'canceled-by-user',
]);

const SHA40 = /^[0-9a-f]{40}$/i;
const HASH64 = /^[0-9a-f]{64}$/i;
const IMAGE_TAG = /^[0-9a-f]{64}$/i;

function valueOf(object, ...names) {
  for (const name of names) {
    if (object?.[name] !== undefined && object?.[name] !== null) return object[name];
  }
  return undefined;
}

function applicationUuidOf(application) {
  return valueOf(application, 'uuid', 'resource_uuid', 'resourceUuid');
}

function applicationIdOf(application) {
  return valueOf(application, 'id', 'application_id', 'applicationId');
}

function repositoryOf(application) {
  const repository = valueOf(application, 'git_repository', 'gitRepository', 'repository');
  if (typeof repository === 'string') return repository;
  return valueOf(repository, 'full_name', 'fullName', 'name');
}

function branchOf(application) {
  return valueOf(application, 'git_branch', 'gitBranch');
}

function commitOf(application) {
  return valueOf(application, 'git_commit_sha', 'gitCommitSha');
}

function statusOf(payload) {
  return String(payload?.status ?? '').toLowerCase();
}

function deploymentUuidOf(payload) {
  return valueOf(payload, 'deployment_uuid', 'deploymentUuid', 'uuid');
}

function deploymentCommitOf(payload) {
  return valueOf(payload, 'commit', 'commit_sha', 'commitSha');
}

function isHead(commit) {
  return commit === undefined || commit === null || commit === '' || commit === 'HEAD';
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} es obligatorio.`);
  return value;
}

function resourceCommitOf(manifest, component = 'dapp') {
  const key = component === 'dapp' ? 'webCommit' : component === 'treasure-hunt' ? 'gameCommit' : null;
  const value = key ? manifest?.[key] : null;
  return SHA40.test(value ?? '') ? value : manifest?.commit;
}

function assertTarget(target, deployment) {
  if (!target || typeof target !== 'object') throw new Error('target Coolify es obligatorio.');
  for (const key of ['resourceUuid', 'applicationId', 'gitBranch', 'repository', 'healthUrl', 'readyUrl']) {
    requireString(target[key], `target.${key}`);
  }

  // The branch is the immutable environment boundary. Optional metadata is checked
  // too when a workflow includes it, but it is never sent to Coolify.
  if (target.gitBranch !== deployment.branch) {
    throw new Error(`target Coolify no corresponde al entorno ${deployment.environment}/${deployment.chainId}.`);
  }
  if (target.environment !== undefined && target.environment !== deployment.environment) {
    throw new Error(`target Coolify declara el entorno ${target.environment}, no ${deployment.environment}.`);
  }
  if (target.chainId !== undefined && String(target.chainId) !== deployment.chainId) {
    throw new Error(`target Coolify declara chainId ${target.chainId}, no ${deployment.chainId}.`);
  }
}

function assertManifest(manifest, component = 'dapp') {
  if (!manifest || typeof manifest !== 'object') throw new Error('release manifest es obligatorio.');
  const deployment = assertEnvironmentMetadata(manifest, manifest.environment, { context: 'release manifest' });
  if (!SHA40.test(manifest.commit ?? '')) throw new Error('release manifest contiene un commit inválido.');
  if (!HASH64.test(manifest.configHash ?? '')) throw new Error('release manifest contiene un configHash inválido.');
  const imageEntry = assertImmutableImageEntry(component, manifest.components?.[component]);
  const image = { ...imageEntry, ...parseImmutableImage(imageEntry.image) };
  if (image.configHash !== manifest.configHash) throw new Error(`La imagen ${component} no corresponde a la configuración pública del manifest.`);
  return { deployment, image, resourceCommit: resourceCommitOf(manifest, component) };
}

function assertPreviousManifest(previousManifest, deployment, component = 'dapp') {
  if (!previousManifest || typeof previousManifest !== 'object') {
    throw new Error('previousManifest es obligatorio para una aplicación ya configurada.');
  }
  assertEnvironmentMetadata(previousManifest, previousManifest.environment, { context: 'previous release manifest' });
  if (previousManifest.environment !== deployment.environment || String(previousManifest.chainId) !== deployment.chainId) {
    throw new Error('previousManifest no corresponde al target Coolify.');
  }
  if (!SHA40.test(previousManifest.commit ?? '')) throw new Error('previousManifest contiene un commit inválido.');
  if (!HASH64.test(previousManifest.configHash ?? '')) throw new Error('previousManifest contiene un configHash inválido.');
  const imageEntry = assertImmutableImageEntry(component, previousManifest.components?.[component]);
  const image = { ...imageEntry, ...parseImmutableImage(imageEntry.image) };
  return { image, resourceCommit: resourceCommitOf(previousManifest, component) };
}

function assertApplicationShape(application, target) {
  if (applicationUuidOf(application) !== target.resourceUuid) {
    throw new Error('Coolify aplicación no coincide con el resourceUuid confiable.');
  }
  const applicationId = applicationIdOf(application);
  if (applicationId !== undefined && applicationId !== null && String(applicationId) !== String(target.applicationId)) {
    throw new Error('Coolify aplicación no coincide con el applicationId confiable.');
  }
  if (branchOf(application) !== target.gitBranch) {
    throw new Error(`Coolify aplicación no está fijada a la rama ${target.gitBranch}.`);
  }
  if (repositoryOf(application) !== target.repository) {
    throw new Error('Coolify aplicación no está fijada al repositorio confiable.');
  }
  if (String(valueOf(application, 'build_pack', 'buildPack')).toLowerCase() !== 'dockerimage') {
    throw new Error('Coolify aplicación no usa build_pack=dockerimage.');
  }
  const ports = valueOf(application, 'ports_mappings', 'portsMappings');
  if (ports !== null && ports !== undefined && ports !== '') {
    if (Array.isArray(ports) && ports.length === 0) {
      // An empty array is the allowed equivalent of null.
    } else {
      throw new Error('Coolify aplicación tiene ports_mappings; rolling web exige null o vacío.');
    }
  }
  const healthEnabled = valueOf(application, 'health_check_enabled', 'healthCheckEnabled', 'healthcheck_enabled', 'healthcheckEnabled');
  if (healthEnabled !== true && healthEnabled !== 1 && healthEnabled !== 'true') {
    throw new Error('Coolify aplicación debe tener health check habilitado.');
  }
  const healthPath = valueOf(application, 'health_check_path', 'healthCheckPath', 'healthcheck_path', 'healthcheckPath');
  const expectedHealthPath = target.healthPath ?? new URL(target.readyUrl).pathname;
  if (healthPath !== expectedHealthPath) throw new Error(`Coolify aplicación debe usar health check path ${expectedHealthPath}.`);
}

function imageConfig(image) {
  const imageRepository = `${image.repository}/cukies-hub/${image.component}`;
  const imageTag = `sha256-${image.digest.slice('sha256:'.length)}`;
  if (!IMAGE_TAG.test(imageTag.slice('sha256-'.length))) throw new Error('digest de imagen inválido.');
  return { imageRepository, imageTag };
}

function metadataEntries(commit, configHash) {
  return [
    ['SOURCE_COMMIT', commit],
    ['GIT_COMMIT_SHA', commit],
    ['IMAGE_REVISION', commit],
    ['CUKIES_BUILD_ENV_HASH', configHash],
  ].map(([key, value]) => ({
    key,
    value,
    is_literal: true,
    is_runtime: true,
    is_buildtime: false,
  }));
}

function assertPinnedImage(application, expected, expectedCommit, component = 'dapp') {
  if (commitOf(application) !== expectedCommit) {
    throw new Error(`Coolify no confirmó git_commit_sha=${expectedCommit}; API devolvió ${commitOf(application) ?? '(ausente)'}.`);
  }
  if (valueOf(application, 'docker_registry_image_name', 'dockerRegistryImageName') !== expected.imageRepository) {
    throw new Error(`Coolify no confirmó docker_registry_image_name de ${component}.`);
  }
  if (valueOf(application, 'docker_registry_image_tag', 'dockerRegistryImageTag') !== expected.imageTag) {
    throw new Error(`Coolify no confirmó docker_registry_image_tag del digest ${component}.`);
  }
}

async function readJson(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

async function verifyPublicRelease({ fetchImpl, target, manifest, resourceCommit, expectedImageSha, attempts, sleep }) {
  let lastHealth;
  let lastReady;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      lastHealth = await readJson(fetchImpl, target.healthUrl);
      if (lastHealth.response.ok
        && lastHealth.body?.status === 'ok'
        && lastHealth.body?.gitSha === resourceCommit
        && lastHealth.body?.environment === manifest.environment
        && lastHealth.body?.coolify?.resourceUuid === target.resourceUuid
        && (!target.appName || lastHealth.body?.app === target.appName)) {
        // Keep polling ready in the same bounded window; old instances may answer health first.
      }
    } catch (error) {
      lastHealth = { error };
    }
    try {
      lastReady = await readJson(fetchImpl, target.readyUrl);
    } catch (error) {
      lastReady = { error };
    }
    const healthOk = Boolean(
      lastHealth?.response?.ok
      && lastHealth.body?.status === 'ok'
      && lastHealth.body?.gitSha === resourceCommit
      && lastHealth.body?.environment === manifest.environment
      && lastHealth.body?.coolify?.resourceUuid === target.resourceUuid
      && (!target.appName || lastHealth.body?.app === target.appName),
    );
    const readyOk = Boolean(
      lastReady?.response?.status === 200
      && lastReady.body?.status === 'ready'
      && lastReady.body?.gitSha === resourceCommit
      && lastReady.body?.configHash === manifest.configHash
      && (!target.requireImageSha || lastReady.body?.imageSha === expectedImageSha),
    );
    if (healthOk && readyOk) {
      return {
        healthSha: lastHealth.body.gitSha,
        readyStatus: lastReady.body.status,
        environment: lastHealth.body.environment,
        resourceUuid: lastHealth.body.coolify.resourceUuid,
      };
    }
    if (attempt < attempts - 1) await sleep(0);
  }
  throw new Error(`la aplicación no confirmó health/ready para el SHA ${resourceCommit}.`);
}

function rollbackState(application, previousManifest, component = 'dapp') {
  const previousCommit = commitOf(application);
  const bootstrap = !SHA40.test(previousCommit ?? '');
  if (bootstrap) return { bootstrap: true, application: null, envs: null };
  if (!previousManifest) throw new Error('previousManifest es obligatorio para recuperar una aplicación existente.');
  if (!previousManifest.components?.[component]) {
    throw new Error(`previousManifest no contiene imagen previa de ${component}.`);
  }
  const previous = assertPreviousManifest(previousManifest, { environment: previousManifest.environment, chainId: previousManifest.chainId }, component);
  if (previous.resourceCommit !== previousCommit) throw new Error('El estado previo no coincide con la release configurada en Coolify.');
  const image = imageConfig(previous.image);
  return {
    bootstrap: false,
    application: {
      git_commit_sha: previous.resourceCommit,
      docker_registry_image_name: image.imageRepository,
      docker_registry_image_tag: image.imageTag,
    },
    envs: metadataEntries(previous.resourceCommit, previousManifest.configHash),
  };
}

async function restorePrevious({ client, target, rollback }) {
  if (rollback.bootstrap) return;
  await client.patchApplication(target.resourceUuid, rollback.application);
  await client.patchEnvs(target.resourceUuid, rollback.envs);
}

export async function deployRollingWeb({
  client,
  target,
  manifest,
  previousManifest,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pollMs = 5000,
  timeoutMs = 30 * 60 * 1000,
  allowRuntimeRollback = true,
} = {}) {
  const component = target?.component ?? 'dapp';
  const { deployment, image: releaseImage, resourceCommit } = assertManifest(manifest, component);
  assertTarget(target, deployment);
  const releaseClient = client ?? createCoolifyReleaseClient({ fetchImpl });
  const attempts = Math.max(1, Math.ceil(timeoutMs / Math.max(1, pollMs)));
  let application;
  let rollback;
  let startAttempted = false;
  let terminal = false;
  let runtimeRollbackAttempted = false;

  try {
    application = await releaseClient.getApplication(target.resourceUuid);
    assertApplicationShape(application, target);
    rollback = rollbackState(application, previousManifest, component);
    if (!rollback.bootstrap && previousManifest.environment !== deployment.environment) {
      throw new Error('previousManifest no corresponde al entorno de despliegue.');
    }

    const image = imageConfig(releaseImage);
    await releaseClient.patchApplication(target.resourceUuid, {
      git_commit_sha: resourceCommit,
      docker_registry_image_name: image.imageRepository,
      docker_registry_image_tag: image.imageTag,
    });
    await releaseClient.patchEnvs(target.resourceUuid, metadataEntries(resourceCommit, manifest.configHash));

    const pinned = await releaseClient.getApplication(target.resourceUuid);
    assertApplicationShape(pinned, target);
    assertPinnedImage(pinned, image, resourceCommit, component);

    startAttempted = true;
    const startedPayload = await releaseClient.start(target.resourceUuid);
    const deploymentUuid = deploymentUuidOf(startedPayload);
    if (!deploymentUuid) throw new Error('Coolify no devolvió deployment_uuid al iniciar.');

    let finished = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const current = await releaseClient.getDeployment(deploymentUuid);
      const status = statusOf(current);
      const commit = deploymentCommitOf(current);
      if (!isHead(commit) && commit !== resourceCommit) {
        throw new Error(`Coolify deployment ${deploymentUuid} corresponde a ${commit}, no al SHA ${resourceCommit}.`);
      }
      if (TERMINAL_FAILURES.has(status)) {
        terminal = true;
        throw new Error(`Coolify deployment ${deploymentUuid} terminó en ${status}.`);
      }
      if (status === 'finished') {
        terminal = true;
        if (!isHead(commit) && commit !== resourceCommit) {
          throw new Error(`Coolify deployment ${deploymentUuid} terminó sin confirmar el SHA ${resourceCommit}.`);
        }
        finished = current;
        break;
      }
      if (isHead(commit) && !['queued', 'in_progress'].includes(status)) {
        throw new Error(`Coolify deployment ${deploymentUuid} devolvió commit HEAD en estado ${status || '(ausente)'}.`);
      }
      if (attempt < attempts - 1) await sleep(pollMs);
    }
    if (!finished) throw new Error(`Coolify deployment ${deploymentUuid} no terminó dentro del timeout.`);

    // DockerImage deployments can report HEAD even when finished. The application
    // pin and immutable image fields remain the artifact/config proof.
    const finishedApplication = await releaseClient.getApplication(target.resourceUuid);
    assertApplicationShape(finishedApplication, target);
    assertPinnedImage(finishedApplication, image, resourceCommit, component);
    let publicProof;
    try {
      publicProof = await verifyPublicRelease({
        fetchImpl,
        target,
        manifest,
        resourceCommit,
        expectedImageSha: releaseImage.sourceSha,
        attempts,
        sleep: (ms) => sleep(ms || pollMs),
      });
    } catch (verificationError) {
      if (allowRuntimeRollback && !rollback.bootstrap && previousManifest && finished) {
        runtimeRollbackAttempted = true;
        try {
          const runtimeRollback = await deployRollingWeb({
            client: releaseClient,
            target,
            manifest: previousManifest,
            previousManifest: manifest,
            component,
            fetchImpl,
            sleep,
            pollMs,
            timeoutMs,
            allowRuntimeRollback: false,
          });
          verificationError.runtimeRollback = runtimeRollback;
          verificationError.message += `; rollback runtime verificado: ${runtimeRollback.commit}.`;
        } catch (runtimeRollbackError) {
          verificationError.runtimeRollback = {
            status: 'failed',
            error: errorText(runtimeRollbackError),
          };
          verificationError.message += '; rollback runtime sin verificar: requiere reconciliación.';
        }
      }
      throw verificationError;
    }

    return {
      status: 'finished',
      deploymentUuid,
      commit: resourceCommit,
      imageRepository: image.imageRepository,
      imageTag: image.imageTag,
      ...publicProof,
    };
  } catch (error) {
    // Do not race a deployment whose final state is unknown. Reconciliation must
    // first observe its terminal status; changing configuration cannot cancel it.
    if (startAttempted && !terminal) throw new Error(`${errorText(error)}; despliegue sin estado final: configuración conservada para reconciliación.`);
    // A nested recovery may itself still be running after a network failure.
    // Its configuration must not be overwritten by the outer attempt.
    if (!runtimeRollbackAttempted && (startAttempted || rollback)) {
      try {
        await restorePrevious({ client: releaseClient, target, rollback: rollback ?? rollbackState(application ?? {}, previousManifest, component) });
      } catch (restoreError) {
        throw new Error(`${errorText(error)}; rollback de configuración fallido: ${errorText(restoreError)}`);
      }
    }
    throw error;
  }
}
