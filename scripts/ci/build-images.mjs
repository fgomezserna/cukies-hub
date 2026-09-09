#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { requireValue } from './cli-args.mjs';
import { assertImmutableImageEntry } from './image-ref.mjs';

const TARGETS = Object.freeze({
  dapp: 'dapp',
  'chain-indexer': 'chain-indexer',
  'cuki-card-worker': 'cuki-card-worker',
  schedulers: 'schedulers',
  'cukies-bridge-relayer': 'cukies-bridge-relayer',
});

function run(command, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }
    child.on('error', reject);
    child.on('close', (status) => {
      if (status !== 0) reject(new Error(`${command} ${args.join(' ')} terminó con ${status}: ${stderr}`));
      else resolve({ stdout, stderr });
    });
  });
}

function imageRef(registry, component, tag) {
  return `${registry.replace(/\/$/, '')}/cukies-hub/${component}:${tag}`;
}

export function cacheRef(registry, environment, component) {
  return `${registry.replace(/\/$/, '')}/cukies-cache/${environment}-${component}:buildkit`;
}

export function immutableImage({ registry, component, tag, digest }) {
  if (!/^sha256:[0-9a-f]{64}$/i.test(digest)) throw new Error(`digest inválido para ${component}.`);
  return `${imageRef(registry, component, tag)}@${digest}`;
}

export async function buildComponents({ components, registry, sha, configHash, buildEnvJsonPath, manifestPath, builder = process.env.BUILDX_BUILDER ?? 'cukies-ci', docker = 'docker', runCommand = run }) {
  if (!registry) throw new Error('CUKIES_REGISTRY es obligatorio.');
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('SHA de imagen inválido.');
  if (!/^[0-9a-f]{64}$/i.test(configHash)) throw new Error('config hash inválido.');
  const buildEnv = JSON.parse(await readFile(buildEnvJsonPath, 'utf8'));
  const tag = `${sha}-${configHash}`;
  const result = {};
  for (const component of components) {
    const target = TARGETS[component];
    if (!target) throw new Error(`componente CI no soportado: ${component}`);
    const ref = imageRef(registry, component, tag);
    const metadataPath = `${manifestPath}.${component}.metadata.json`;
    await runCommand(docker, [
      'buildx', 'build', '--builder', builder, '--platform', 'linux/amd64',
      '--file', 'Dockerfile.ci', '--target', target,
      '--tag', ref, '--push', '--provenance=false', '--sbom=false',
      '--cache-from', `type=registry,ref=${cacheRef(registry, 'staging', component)}`,
      '--cache-to', `type=registry,ref=${cacheRef(registry, 'staging', component)},mode=max,image-manifest=true,oci-mediatypes=true`,
      '--metadata-file', metadataPath,
      ...Object.entries(buildEnv.config).flatMap(([key, value]) => ['--build-arg', `${key}=${value}`]),
      '--build-arg', `CUKIES_BUILD_ENV_HASH=${configHash}`,
      '--build-arg', `IMAGE_REVISION=${sha}`,
      '--build-arg', 'NX_VERSION=23.2.0',
      '.',
    ]);
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const digest = metadata['containerimage.digest'];
    const image = immutableImage({ registry, component, tag, digest });
    result[component] = { image, digest, tag, configHash, sourceSha: sha };
  }
  await mkdir(dirname(manifestPath), { recursive: true });
  return result;
}

async function main() {
  const components = JSON.parse(requireValue(process.argv, '--components'));
  const manifestPath = requireValue(process.argv, '--manifest');
  const planPath = requireValue(process.argv, '--plan');
  const registry = requireValue(process.argv, '--registry', { fallback: process.env.CUKIES_REGISTRY });
  const sha = requireValue(process.argv, '--sha', { fallback: process.env.GITHUB_SHA });
  const configHash = requireValue(process.argv, '--config-hash', { fallback: process.env.CUKIES_BUILD_ENV_HASH });
  const buildEnvJsonPath = requireValue(process.argv, '--build-env-json');
  const built = await buildComponents({
    components,
    registry,
    sha,
    configHash,
    buildEnvJsonPath,
    manifestPath,
  });
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  const reuse = plan.reuse.map((entry) => {
    const valid = assertImmutableImageEntry(entry.component, entry);
    return [entry.component, valid];
  });
  const componentsManifest = Object.fromEntries(reuse.concat(Object.entries(built)));
  const manifest = {
    environment: 'staging',
    chainId: '97',
    commit: sha,
    configHash,
    deploymentUuid: null,
    components: componentsManifest,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
