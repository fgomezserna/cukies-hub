#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { requireValue } from './cli-args.mjs';
import { assertEnvironmentMetadata, resolveDeploymentEnvironment } from './deployment-environment.mjs';
import { assertImmutableImageEntry, CI_COMPONENTS } from './image-ref.mjs';

export const COMPONENTS = CI_COMPONENTS;

const IMAGE_ENV = Object.freeze({
  dapp: 'CUKIES_IMAGE_DAPP',
  'chain-indexer': 'CUKIES_IMAGE_CHAIN_INDEXER',
  'cuki-card-worker': 'CUKIES_IMAGE_CUKI_CARD_WORKER',
  schedulers: 'CUKIES_IMAGE_SCHEDULERS',
  'cukies-bridge-relayer': 'CUKIES_IMAGE_CUKIES_BRIDGE_RELAYER',
  'treasure-hunt': 'CUKIES_IMAGE_TREASURE_HUNT',
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
});

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
]);

const DAPP_DOCKERFILE_REFINEMENT_REASON = 'dockerfile-ci-final-dapp-stage-only';

function validSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

function unique(values) {
  return [...new Set(values)].filter((value) => COMPONENTS.includes(value));
}

export function componentForPath(path) {
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
    const component = PROJECT_COMPONENT[name.trim()];
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

export function chooseReleasePlan({ state, head, configHash, environment, changedFiles = [], nxProjects = [], nxAvailable = true, baseAncestor = true, dockerfileBefore = null, dockerfileAfter = null }) {
  const deployment = resolveDeploymentEnvironment(environment);
  if (state) assertEnvironmentMetadata(state, deployment, { allowLegacy: deployment.environment === 'staging', context: 'release state' });
  const previousCommit = state?.commit ?? state?.deployedSha ?? null;
  const hasUsableBase = validSha(previousCommit) && validSha(head) && baseAncestor;
  const nxAffected = mapNxProjects(nxProjects);
  const configChanged = Boolean(state && state.configHash !== configHash);
  const firstOrInvalid = !hasUsableBase;
  const refinedDappOnly = !firstOrInvalid && canRefineDappOnly({ changedFiles, dockerfileBefore, dockerfileAfter });
  const pathAffected = refinedDappOnly ? ['dapp'] : changedFiles.flatMap(componentForPath);
  const effectiveNxAffected = refinedDappOnly ? [] : nxAffected;
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
  const plan = chooseReleasePlan({ state, head, configHash, environment: deployment.environment, changedFiles: files, nxProjects: nx.projects, nxAvailable: nx.available, baseAncestor: ancestor, dockerfileBefore, dockerfileAfter });
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
