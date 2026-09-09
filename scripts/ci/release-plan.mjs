#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { requireValue } from './cli-args.mjs';
import { assertImmutableImageEntry, CI_COMPONENTS } from './image-ref.mjs';

export const COMPONENTS = CI_COMPONENTS;

const IMAGE_ENV = Object.freeze({
  dapp: 'CUKIES_IMAGE_DAPP',
  'chain-indexer': 'CUKIES_IMAGE_CHAIN_INDEXER',
  'cuki-card-worker': 'CUKIES_IMAGE_CUKI_CARD_WORKER',
  schedulers: 'CUKIES_IMAGE_SCHEDULERS',
  'cukies-bridge-relayer': 'CUKIES_IMAGE_CUKIES_BRIDGE_RELAYER',
});

const PROJECT_COMPONENT = Object.freeze({
  dapp: 'dapp',
  '@cukies/chain-indexer': 'chain-indexer',
  'chain-indexer': 'chain-indexer',
  '@cukies/cuki-card-worker': 'cuki-card-worker',
  'cuki-card-worker': 'cuki-card-worker',
  '@cukies/cukies-bridge-relayer': 'cukies-bridge-relayer',
  'cukies-bridge-relayer': 'cukies-bridge-relayer',
});

const ALL_REASON = 'first-run-or-invalid-base';
const ORCHESTRATION_ONLY_PATHS = new Set([
  'scripts/ci/coolify-release.mjs',
  'scripts/ci/release-plan.mjs',
  'scripts/ci/release-state.mjs',
  'scripts/ci/ci.test.mjs',
]);

function validSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

function unique(values) {
  return [...new Set(values)].filter((value) => COMPONENTS.includes(value));
}

export function componentForPath(path) {
  if (/^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|nx\.json|\.npmrc|\.dockerignore|Dockerfile\.ci|docker-compose\.coolify\.yml|docker-compose\.images\.yml|scripts\/docker-start(?:-ci)?\.sh|scripts\/assert-.*\.mjs)$/.test(path)) return [...COMPONENTS];
  if (path.startsWith('dapp/scripts/') || path.startsWith('packages/economy-schedulers/')) return ['schedulers'];
  if (path.startsWith('dapp/')) return ['dapp'];
  if (path.startsWith('packages/chain-indexer/')) return ['chain-indexer'];
  if (path.startsWith('packages/cuki-card-worker/')) return ['cuki-card-worker'];
  if (path.startsWith('packages/cukies-bridge-relayer/')) return ['cukies-bridge-relayer'];
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

export function chooseReleasePlan({ state, head, configHash, changedFiles = [], nxProjects = [], nxAvailable = true, baseAncestor = true }) {
  const previousCommit = state?.commit ?? state?.deployedSha ?? null;
  const hasUsableBase = validSha(previousCommit) && validSha(head) && baseAncestor;
  const pathAffected = changedFiles.flatMap(componentForPath);
  const nxAffected = mapNxProjects(nxProjects);
  const configChanged = Boolean(state && state.configHash !== configHash);
  const firstOrInvalid = !hasUsableBase;
  const affected = firstOrInvalid
    ? [...COMPONENTS]
    : unique([...pathAffected, ...nxAffected, ...(configChanged ? ['dapp'] : [])]);
  const build = firstOrInvalid ? [...COMPONENTS] : affected;
  const reuse = [];
  if (!firstOrInvalid) {
    for (const component of COMPONENTS.filter((value) => !build.includes(value))) {
      try {
        reuse.push({ component, ...assertImmutableImageEntry(component, state?.components?.[component]) });
      } catch {
        build.push(component);
      }
    }
  }

  return {
    head,
    base: hasUsableBase ? previousCommit : null,
    baseReason: firstOrInvalid ? ALL_REASON : configChanged ? 'build-config-changed' : 'last-successful-deploy',
    configHash,
    nx: { available: nxAvailable, projects: nxProjects, affected: nxAffected },
    changedFiles,
    build: unique(build),
    reuse: reuse.map((entry) => ({ component: entry.component, image: entry.image, digest: entry.digest, tag: entry.tag, configHash: entry.configHash, sourceSha: entry.sourceSha })),
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
  if (!validSha(head) || !/^[0-9a-f]{64}$/i.test(configHash)) throw new Error('release-plan requiere SHA completo y config hash SHA-256.');
  const state = await readFile(statePath, 'utf8').then(JSON.parse).catch(() => null);
  const previousCommit = state?.commit ?? null;
  const ancestor = await isAncestor(previousCommit, head);
  const files = await gitFiles(previousCommit && ancestor ? previousCommit : null, head);
  const nx = await nxAffected(previousCommit && ancestor ? previousCommit : null, head);
  const plan = chooseReleasePlan({ state, head, configHash, changedFiles: files, nxProjects: nx.projects, nxAvailable: nx.available, baseAncestor: ancestor });
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
