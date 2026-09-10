#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { requireValue } from './cli-args.mjs';
import { assertEnvironmentMetadata, resolveDeploymentEnvironment } from './deployment-environment.mjs';
import { assertImmutableImageEntry, CI_COMPONENTS, WORLD_COMPONENTS } from './image-ref.mjs';
import { withoutWorldRuntime } from './generate-images-compose.mjs';

export const COMPONENTS = CI_COMPONENTS;

const IMAGE_ENV = Object.freeze({
  dapp: 'CUKIES_IMAGE_DAPP',
  'chain-indexer': 'CUKIES_IMAGE_CHAIN_INDEXER',
  'cuki-card-worker': 'CUKIES_IMAGE_CUKI_CARD_WORKER',
  schedulers: 'CUKIES_IMAGE_SCHEDULERS',
  'cukies-bridge-relayer': 'CUKIES_IMAGE_CUKIES_BRIDGE_RELAYER',
  'treasure-hunt': 'CUKIES_IMAGE_TREASURE_HUNT',
  'world-api': 'CUKIES_IMAGE_WORLD_API',
  'world-matchmaking': 'CUKIES_IMAGE_WORLD_MATCHMAKING',
});

const PROJECT_COMPONENT = Object.freeze({
  dapp: 'dapp',
  '@cukies/chain-indexer': 'chain-indexer',
  'chain-indexer': 'chain-indexer',
  '@cukies/cuki-card-worker': 'cuki-card-worker',
  'cuki-card-worker': 'cuki-card-worker',
  '@cukies/cukies-bridge-relayer': 'cukies-bridge-relayer',
  'cukies-bridge-relayer': 'cukies-bridge-relayer',
  'sybil-slayer': 'treasure-hunt',
  '@cukies/sybil-slayer': 'treasure-hunt',
  'treasure-hunt': 'treasure-hunt',
  '@cukies/world-api': 'world-api',
  'world-api': 'world-api',
  '@cukies/world-matchmaking': 'world-matchmaking',
  'world-matchmaking': 'world-matchmaking',
});

const SHARED_WORLD_PROJECTS = new Set(['@cukies/world-shared', 'world-shared']);

const ALL_REASON = 'first-run-or-invalid-base';
const ORCHESTRATION_ONLY_PATHS = new Set([
  'scripts/ci/coolify-release.mjs',
  'scripts/ci/release-plan.mjs',
  'scripts/ci/release-state.mjs',
  'scripts/ci/ci.test.mjs',
  'scripts/ci/standalone-assets.test.mjs',
  'scripts/ci/coolify-rolling-web.mjs',
  'scripts/ci/coolify-targets.mjs',
  'scripts/ci/deliver-release.mjs',
  'scripts/ci/release-delivery-plan.mjs',
  'scripts/ci/release-delivery.test.mjs',
  'scripts/ci/rolling-web.test.mjs',
  'scripts/ci/env-ci.test.mjs',
  'scripts/ci/worker-compose.test.mjs',
  'scripts/ci/game-lane.test.mjs',
  'scripts/ci/game-cache-contract.test.mjs',
  'scripts/ci/image-ref.mjs',
  'scripts/ci/generate-images-compose.mjs',
  'scripts/ci/world-integration.test.mjs',
]);

const DAPP_DOCKERFILE_REFINEMENT_REASON = 'dockerfile-ci-final-dapp-stage-only';

function validSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

function unique(values) {
  return [...new Set(values)].filter((value) => COMPONENTS.includes(value));
}

function worldAffectedForPath(path) {
  if (path === 'scripts/ci/world-runtime-smoke.mjs') return [...WORLD_COMPONENTS];
  if (path.startsWith('packages/world-api/')) return ['world-api'];
  if (path.startsWith('packages/world-matchmaking/')) return ['world-matchmaking'];
  if (path.startsWith('packages/world-shared/') || path.startsWith('infrastructure/world/')) return [...WORLD_COMPONENTS];
  return [];
}

export function componentForPath(path) {
  const world = worldAffectedForPath(path);
  if (world.length > 0) return world;
  if (path === 'scripts/docker-dapp-server.mjs') return ['dapp', 'treasure-hunt'];
  if (path === 'scripts/docker-start-game-ci.mjs') return ['treasure-hunt'];
  if (/^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|nx\.json|\.npmrc|\.dockerignore|Dockerfile\.ci|docker-compose\.coolify\.yml|docker-compose\.images\.yml|scripts\/docker-start(?:-ci)?\.sh|scripts\/assert-.*\.mjs)$/.test(path)) return [...COMPONENTS];
  if (path.startsWith('dapp/scripts/') || path.startsWith('packages/economy-schedulers/')) return ['schedulers'];
  if (path.startsWith('dapp/')) return ['dapp'];
  if (path.startsWith('packages/chain-indexer/')) return ['chain-indexer'];
  if (path.startsWith('packages/cuki-card-worker/')) return ['cuki-card-worker'];
  if (path.startsWith('packages/cukies-bridge-relayer/')) return ['cukies-bridge-relayer'];
  if (path.startsWith('games/sybil-slayer/')) return ['treasure-hunt'];
  if (path.startsWith('scripts/ci/')) return ORCHESTRATION_ONLY_PATHS.has(path) ? [] : [...COMPONENTS];
  return [];
}

export function mapNxProjects(projectNames) {
  const result = [];
  for (const name of projectNames) {
    const normalized = name.trim();
    if (SHARED_WORLD_PROJECTS.has(normalized)) result.push(...WORLD_COMPONENTS);
    const component = PROJECT_COMPONENT[normalized];
    if (component) result.push(component);
    if (name.trim().toLowerCase().includes('scheduler')) result.push('schedulers');
  }
  return unique(result);
}

function stageBounds(source) {
  if (typeof source !== 'string') return null;
  const dapp = /^FROM base AS dapp\r?\n/m.exec(source);
  const chainIndexer = /^FROM base AS chain-indexer\r?\n/m.exec(source);
  if (!dapp || !chainIndexer || dapp.index < 0 || chainIndexer.index <= dapp.index) return null;
  if ((source.slice(dapp.index, chainIndexer.index).match(/^[ \t]*FROM\s/gim) ?? []).length !== 1) return null;
  return { start: dapp.index, end: chainIndexer.index };
}

export function isDappFinalStageOnlyChange(baseDockerfile, headDockerfile) {
  const base = stageBounds(baseDockerfile);
  const head = stageBounds(headDockerfile);
  if (!base || !head) return false;
  if (baseDockerfile.slice(0, base.start) !== headDockerfile.slice(0, head.start)) return false;
  if (baseDockerfile.slice(base.end) !== headDockerfile.slice(head.end)) return false;
  const outside = headDockerfile.slice(0, head.start) + headDockerfile.slice(head.end);
  if (/--from=(?:["']?dapp["']?(?=\s|$)|[0-9$])|^[ \t]*FROM(?:\s+--\S+)*\s+(?:["']?dapp["']?(?=\s|$)|[0-9$])/im.test(outside)) return false;
  return baseDockerfile.slice(base.start, base.end) !== headDockerfile.slice(head.start, head.end);
}

function isSafeRefinementPath(path) {
  if (path.startsWith('dapp/scripts/') || path.startsWith('packages/economy-schedulers/')) return false;
  return (componentForPath(path).length === 1 && componentForPath(path)[0] === 'dapp')
    || path.startsWith('docs/')
    || path === 'AGENTS.md'
    || /^infrastructure\/ci\/[^/]+\.(?:md|json)$/.test(path)
    || ORCHESTRATION_ONLY_PATHS.has(path);
}

function canRefineDappOnly({ changedFiles, dockerfileBefore, dockerfileAfter }) {
  if (!changedFiles.includes('Dockerfile.ci')) return false;
  const otherFiles = changedFiles.filter((path) => path !== 'Dockerfile.ci');
  return otherFiles.every(isSafeRefinementPath)
    && isDappFinalStageOnlyChange(dockerfileBefore, dockerfileAfter);
}

const WORLD_DOCKER_STAGES = new Set([
  'world-deps',
  'world-api-build',
  'world-matchmaking-build',
  'world-api',
  'world-matchmaking',
]);

export function isWorldDockerfileOnlyChange(baseDockerfile, headDockerfile) {
  if (typeof baseDockerfile !== 'string' || typeof headDockerfile !== 'string') return false;
  const stageNames = (source) => [...source.matchAll(/^FROM\s+[^\n]+\s+AS\s+([a-z0-9-]+)\s*$/gim)].map((match) => match[1]);
  const baseStages = stageNames(baseDockerfile);
  const headStages = stageNames(headDockerfile);
  const baseNonWorld = baseStages.filter((stage) => !WORLD_DOCKER_STAGES.has(stage));
  const headNonWorld = headStages.filter((stage) => !WORLD_DOCKER_STAGES.has(stage));
  if (JSON.stringify(baseNonWorld) !== JSON.stringify(headNonWorld)) return false;
  if (!headDockerfile.includes('FROM base AS world-deps')) return false;
  const baseWorldStages = baseStages.filter((stage) => stage.startsWith('world-'));
  const headWorldStages = headStages.filter((stage) => stage.startsWith('world-'));
  if (headWorldStages.some((stage) => !WORLD_DOCKER_STAGES.has(stage))) return false;
  if (headWorldStages.some((stage, index, all) => all.indexOf(stage) !== index)) return false;
  if (baseWorldStages.length > 0 && JSON.stringify(baseWorldStages) !== JSON.stringify(headWorldStages)) return false;
  const knownWorldStages = headStages.filter((stage) => WORLD_DOCKER_STAGES.has(stage));
  if (knownWorldStages.length === 0) return false;
  const baseWithoutWorld = baseDockerfile.replace(/^FROM\s+[^\n]+\s+AS\s+world-[\s\S]*$/gim, '');
  const headWithoutWorld = headDockerfile.replace(/^FROM\s+[^\n]+\s+AS\s+world-[\s\S]*$/gim, '');
  if (baseWithoutWorld !== headWithoutWorld && !headDockerfile.startsWith(baseDockerfile)) return false;
  const worldText = headDockerfile.slice(Math.max(0, headDockerfile.indexOf('FROM base AS world-deps')));
  return !/(?:^|\n)\s*FROM\s+[^\n]+\s+AS\s+(?!world-)/i.test(worldText)
    && !/(?:^|\n)\s*COPY\s+--from=(?!world-(?:api|matchmaking)-build)/i.test(worldText);
}

/**
 * build-images is an orchestration entry point, so arbitrary edits keep the
 * conservative all-image invalidation. The only safe refinement is the
 * catalog delta that adds or edits the two World targets while every other
 * line remains byte-for-byte stable.
 */
export function isWorldBuildImagesOnlyChange(baseSource, headSource) {
  if (typeof baseSource !== 'string' || typeof headSource !== 'string') return false;
  const worldTarget = /^[ \t]*['"]world-(?:api|matchmaking)['"][ \t]*:[ \t]*[^,\n]+,[ \t]*\r?\n?/gm;
  const stripWorldTargets = (source) => source.replace(worldTarget, '');
  if (stripWorldTargets(baseSource) !== stripWorldTargets(headSource)) return false;
  return /['"]world-api['"]\s*:\s*['"]world-api['"]/m.test(headSource)
    && /['"]world-matchmaking['"]\s*:\s*['"]world-matchmaking['"]/m.test(headSource);
}

function jsonWithoutWorldScripts(value) {
  const parsed = JSON.parse(value);
  const scripts = { ...(parsed.scripts ?? {}) };
  delete scripts['build:world'];
  delete scripts['typecheck:world'];
  delete scripts['test:world'];
  return { ...parsed, scripts };
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
  }
  return value;
}

export function isWorldPackageOnlyChange(packageBefore, packageAfter) {
  if (typeof packageBefore !== 'string' || typeof packageAfter !== 'string') return false;
  try {
    const before = jsonWithoutWorldScripts(packageBefore);
    const after = jsonWithoutWorldScripts(packageAfter);
    return JSON.stringify(stableJson(before)) === JSON.stringify(stableJson(after));
  } catch {
    return false;
  }
}

function lockSectionBlocks(source, section) {
  if (typeof source !== 'string') return null;
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const marker = lines.findIndex((line) => line === `${section}:`);
  if (marker === -1) return null;
  const nextSection = lines.slice(marker + 1).findIndex((line) => /^[A-Za-z][A-Za-z0-9_-]*:$/.test(line));
  const end = nextSection === -1 ? lines.length : marker + 1 + nextSection;
  const blocks = new Map();
  let start = null;
  for (let index = marker + 1; index < end; index += 1) {
    // A lockfile block can be an inline empty mapping (`key: {}`), so only
    // indentation, rather than a trailing colon, identifies its boundary.
    if (/^  \S/.test(lines[index])) {
      if (start !== null) {
        const key = lines[start].slice(2).replace(/:.*$/, '').replace(/^['"]|['"]$/g, '');
        blocks.set(key, lines.slice(start, index).join('\n'));
      }
      start = index;
    }
  }
  if (start !== null) {
    const key = lines[start].slice(2).replace(/:.*$/, '').replace(/^['"]|['"]$/g, '');
    blocks.set(key, lines.slice(start, end).join('\n'));
  }
  return blocks;
}

function lockPreamble(source) {
  const marker = source.indexOf('importers:');
  return marker === -1 ? null : source.slice(0, marker);
}

export function isWorldLockOnlyChange(lockBefore, lockAfter) {
  if (typeof lockBefore !== 'string' || typeof lockAfter !== 'string') return false;
  if (lockPreamble(lockBefore) !== lockPreamble(lockAfter)) return false;
  for (const section of ['importers', 'packages', 'snapshots']) {
    const before = lockSectionBlocks(lockBefore, section);
    const after = lockSectionBlocks(lockAfter, section);
    if (!before || !after) return false;
    for (const [key, block] of before) {
      if (after.get(key) !== block) return false;
    }
    if (section === 'importers') {
      for (const key of after.keys()) {
        if (!before.has(key) && !['packages/world-api', 'packages/world-matchmaking', 'packages/world-shared'].includes(key)) return false;
      }
    }
  }
  return true;
}

const WORLD_ROOT_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'nx.json',
  'Dockerfile.ci',
  'docker-compose.coolify.yml',
  'docker-compose.images.yml',
  'docker-compose.workers.yml',
  '.github/workflows/cukies-images.yml',
]);

function isWorldRefinementPath(path) {
  if (path === 'scripts/ci/world-runtime-smoke.mjs') return true;
  if (path === 'scripts/ci/world-runtime-smoke.test.mjs') return true;
  if (path === 'scripts/ci/build-images.mjs') return true;
  if (WORLD_ROOT_FILES.has(path)) return true;
  if (worldAffectedForPath(path).length > 0) return true;
  if (path.startsWith('docs/')) return true;
  if (path.startsWith('infrastructure/ci/')) return /^(infrastructure\/ci\/components\.json|infrastructure\/ci\/[^/]+\.test\.sh|infrastructure\/ci\/[^/]+\.md)$/.test(path);
  if (path.startsWith('scripts/ci/')) return ORCHESTRATION_ONLY_PATHS.has(path)
    || ['scripts/ci/release-state.mjs', 'scripts/ci/release-delivery-plan.mjs', 'scripts/ci/deliver-release.mjs', 'scripts/ci/coolify-release.mjs'].includes(path);
  return path === 'AGENTS.md';
}

export function canRefineWorldOnly({
  changedFiles,
  packageBefore,
  packageAfter,
  lockBefore,
  lockAfter,
  workspaceBefore,
  workspaceAfter,
  nxBefore,
  nxAfter,
  dockerfileBefore,
  dockerfileAfter,
  composeBefore,
  composeAfter,
  imagesComposeBefore,
  imagesComposeAfter,
  workersComposeBefore,
  workersComposeAfter,
  buildImagesBefore,
  buildImagesAfter,
}) {
  const sharedRuntimeChanged = changedFiles.some((path) => path.startsWith('packages/world-shared/') || path.startsWith('infrastructure/world/'));
  const worldDockerChanged = changedFiles.includes('Dockerfile.ci')
    && isWorldDockerfileOnlyChange(dockerfileBefore, dockerfileAfter);
  const worldBuildCatalogChanged = changedFiles.includes('scripts/ci/build-images.mjs')
    && isWorldBuildImagesOnlyChange(buildImagesBefore, buildImagesAfter);
  const integrationRootChanged = changedFiles.some((path) => WORLD_ROOT_FILES.has(path)) || worldDockerChanged || worldBuildCatalogChanged;
  if ((!sharedRuntimeChanged && !worldDockerChanged && !worldBuildCatalogChanged) || !integrationRootChanged) return false;
  if (!changedFiles.every(isWorldRefinementPath)) return false;
  if (changedFiles.includes('scripts/ci/build-images.mjs')
    && !isWorldBuildImagesOnlyChange(buildImagesBefore, buildImagesAfter)) return false;
  if (changedFiles.includes('package.json') && !isWorldPackageOnlyChange(packageBefore, packageAfter)) return false;
  if (changedFiles.includes('pnpm-lock.yaml') && !isWorldLockOnlyChange(lockBefore, lockAfter)) return false;
  for (const [before, after] of [[workspaceBefore, workspaceAfter], [nxBefore, nxAfter]]) {
    if (before !== undefined || after !== undefined) {
      if (typeof before !== 'string' || typeof after !== 'string' || before !== after) return false;
    }
  }
  if (changedFiles.includes('Dockerfile.ci') && !isWorldDockerfileOnlyChange(dockerfileBefore, dockerfileAfter)) return false;
  for (const [before, after] of [
    [composeBefore, composeAfter],
    [imagesComposeBefore, imagesComposeAfter],
    [workersComposeBefore, workersComposeAfter],
  ]) {
    if (before !== undefined || after !== undefined) {
      if (typeof before !== 'string' || typeof after !== 'string') return false;
      if (withoutWorldRuntime(after) !== withoutWorldRuntime(before)) return false;
    }
  }
  return true;
}

export function chooseReleasePlan({ state, head, configHash, environment, changedFiles = [], nxProjects = [], nxAvailable = true, baseAncestor = true, dockerfileBefore = null, dockerfileAfter = null, packageBefore, packageAfter, lockBefore, lockAfter, workspaceBefore, workspaceAfter, nxBefore, nxAfter, composeBefore, composeAfter, imagesComposeBefore, imagesComposeAfter, workersComposeBefore, workersComposeAfter, buildImagesBefore, buildImagesAfter }) {
  const deployment = resolveDeploymentEnvironment(environment);
  if (state) assertEnvironmentMetadata(state, deployment, { allowLegacy: deployment.environment === 'staging', context: 'release state' });
  const previousCommit = state?.commit ?? state?.deployedSha ?? null;
  const hasUsableBase = validSha(previousCommit) && validSha(head) && baseAncestor;
  const nxAffected = mapNxProjects(nxProjects);
  const configChanged = Boolean(state && state.configHash !== configHash);
  const firstOrInvalid = !hasUsableBase;
  const refinedDappOnly = !firstOrInvalid && canRefineDappOnly({ changedFiles, dockerfileBefore, dockerfileAfter });
  const refinedWorldOnly = !firstOrInvalid && !refinedDappOnly && canRefineWorldOnly({ changedFiles, packageBefore, packageAfter, lockBefore, lockAfter, workspaceBefore, workspaceAfter, nxBefore, nxAfter, dockerfileBefore, dockerfileAfter, composeBefore, composeAfter, imagesComposeBefore, imagesComposeAfter, workersComposeBefore, workersComposeAfter, buildImagesBefore, buildImagesAfter });
  const pathAffected = refinedDappOnly ? ['dapp'] : refinedWorldOnly ? [...WORLD_COMPONENTS] : changedFiles.flatMap(componentForPath);
  const effectiveNxAffected = refinedDappOnly || refinedWorldOnly ? [] : nxAffected;
  const affected = firstOrInvalid
    ? [...COMPONENTS]
    : unique([...pathAffected, ...effectiveNxAffected, ...(configChanged ? ['dapp', 'treasure-hunt'] : [])]);
  const build = firstOrInvalid ? [...COMPONENTS] : affected;
  const reuse = [];
  if (!firstOrInvalid) {
    for (const component of COMPONENTS.filter((value) => !build.includes(value))) {
      try {
        const entry = state?.components?.[component];
        assertEnvironmentMetadata(entry, deployment, { allowLegacy: deployment.environment === 'staging', context: `reutilización de ${component}` });
        reuse.push({ component, ...assertImmutableImageEntry(component, entry) });
      } catch {
        build.push(component);
      }
    }
  }

  const planReason = firstOrInvalid
    ? ALL_REASON
    : refinedDappOnly
      ? DAPP_DOCKERFILE_REFINEMENT_REASON
      : refinedWorldOnly
        ? 'world-integration-only'
      : configChanged
        ? 'build-config-changed'
        : 'component-changes';

  return {
    environment: deployment.environment,
    chainId: deployment.chainId,
    cacheNamespace: deployment.cacheNamespace,
    head,
    base: hasUsableBase ? previousCommit : null,
    baseReason: firstOrInvalid ? ALL_REASON : configChanged ? 'build-config-changed' : 'last-successful-deploy',
    planReason,
    refinement: refinedDappOnly ? {
      reason: DAPP_DOCKERFILE_REFINEMENT_REASON,
      detail: 'Dockerfile.ci solo cambia el stage final dapp; se ignoran los Nx afectados globales y se reutilizan los otros cuatro componentes.',
    } : refinedWorldOnly ? {
      reason: 'world-integration-only',
      detail: 'El registro World solo añade sus paquetes, imágenes y perfil opt-in; la proyección efectiva conserva web, juego y workers existentes.',
    } : null,
    configHash,
    nx: { available: nxAvailable, projects: nxProjects, affected: effectiveNxAffected },
    changedFiles,
    build: unique(build),
    reuse: reuse.map((entry) => ({
      component: entry.component,
      image: entry.image,
      digest: entry.digest,
      tag: entry.tag,
      configHash: entry.configHash,
      sourceSha: entry.sourceSha,
      environment: deployment.environment,
      chainId: deployment.chainId,
    })),
    imageEnv: IMAGE_ENV,
  };
}

function execCapture(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', () => resolve({ status: 127, stdout, stderr }));
    child.on('close', (status) => resolve({ status: status ?? 1, stdout, stderr }));
  });
}

async function gitFiles(base, head) {
  if (!base) return [];
  const result = await execCapture('git', ['diff', '--name-only', `${base}..${head}`]);
  if (result.status !== 0) throw new Error(`git diff no pudo calcular cambios entre ${base} y ${head}: ${result.stderr.trim()}`);
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

async function gitShowFile(commit, path) {
  if (!validSha(commit)) throw new Error(`git show requiere SHA completo para ${path}.`);
  const result = await execCapture('git', ['show', `${commit}:${path}`]);
  if (result.status !== 0) throw new Error(`git show no pudo leer ${path} en ${commit}: ${result.stderr.trim()}`);
  return result.stdout;
}

async function isAncestor(base, head) {
  if (!validSha(base) || !validSha(head)) return false;
  const result = await execCapture('git', ['merge-base', '--is-ancestor', base, head]);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`git merge-base fallo al validar ${base} -> ${head}: ${result.stderr.trim()}`);
}

async function nxAffected(base, head) {
  if (!base) return { available: false, projects: [], stderr: 'sin base' };
  const result = await execCapture('pnpm', ['exec', 'nx', 'show', 'projects', '--affected', '--with-target=build', `--base=${base}`, `--head=${head}`, '--json']);
  if (result.status !== 0) throw new Error(`Nx no pudo calcular proyectos afectados: ${result.stderr.trim()}`);
  let projects;
  try {
    projects = JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(`Nx devolvio una lista no JSON: ${error.message}`);
  }
  if (!Array.isArray(projects) || projects.some((value) => typeof value !== 'string')) {
    throw new Error('Nx devolvio un formato de proyectos afectados no valido.');
  }
  return { available: true, projects };
}

async function main() {
  const statePath = requireValue(process.argv, '--state');
  const outputPath = requireValue(process.argv, '--output');
  const head = requireValue(process.argv, '--head', { fallback: process.env.GITHUB_SHA });
  const configHash = requireValue(process.argv, '--config-hash', { fallback: process.env.CUKIES_BUILD_ENV_HASH });
  const environmentName = requireValue(process.argv, '--environment', { fallback: process.env.CUKIES_DEPLOY_ENVIRONMENT ?? 'staging' });
  const deployment = resolveDeploymentEnvironment(environmentName);
  if (!validSha(head) || !/^[0-9a-f]{64}$/i.test(configHash)) throw new Error('release-plan requiere SHA completo y config hash SHA-256.');
  const state = await readFile(statePath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  }).then((source) => source === null ? null : JSON.parse(source));
  if (state) assertEnvironmentMetadata(state, deployment, { allowLegacy: deployment.environment === 'staging', context: 'release state' });
  const previousCommit = state?.commit ?? null;
  const ancestor = await isAncestor(previousCommit, head);
  const baseForDiff = previousCommit && ancestor ? previousCommit : null;
  const files = await gitFiles(baseForDiff, head);
  const nx = await nxAffected(baseForDiff, head);
  const dockerfileBefore = baseForDiff && files.includes('Dockerfile.ci')
    ? await gitShowFile(baseForDiff, 'Dockerfile.ci')
    : null;
  const dockerfileAfter = dockerfileBefore === null ? null : await gitShowFile(head, 'Dockerfile.ci');
  const pair = async (path) => {
    if (!baseForDiff || !files.includes(path)) return [undefined, undefined];
    return [await gitShowFile(baseForDiff, path), await gitShowFile(head, path)];
  };
  const [packageBefore, packageAfter] = await pair('package.json');
  const [lockBefore, lockAfter] = await pair('pnpm-lock.yaml');
  const [workspaceBefore, workspaceAfter] = await pair('pnpm-workspace.yaml');
  const [nxBefore, nxAfter] = await pair('nx.json');
  const [composeBefore, composeAfter] = await pair('docker-compose.coolify.yml');
  const [imagesComposeBefore, imagesComposeAfter] = await pair('docker-compose.images.yml');
  const [workersComposeBefore, workersComposeAfter] = await pair('docker-compose.workers.yml');
  const [buildImagesBefore, buildImagesAfter] = await pair('scripts/ci/build-images.mjs');
  const plan = chooseReleasePlan({ state, head, configHash, environment: deployment.environment, changedFiles: files, nxProjects: nx.projects, nxAvailable: nx.available, baseAncestor: ancestor, dockerfileBefore, dockerfileAfter, packageBefore, packageAfter, lockBefore, lockAfter, workspaceBefore, workspaceAfter, nxBefore, nxAfter, composeBefore, composeAfter, imagesComposeBefore, imagesComposeAfter, workersComposeBefore, workersComposeAfter, buildImagesBefore, buildImagesAfter });
  plan.nx.stderr = nx.stderr ?? null;
  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({ base: plan.base, baseReason: plan.baseReason, build: plan.build, reuse: plan.reuse.map((entry) => entry.component) }));
}

export { validSha };

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
