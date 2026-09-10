#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SERVICE_IMAGES = Object.freeze({
  dapp: 'CUKIES_IMAGE_DAPP',
  'chain-indexer': 'CUKIES_IMAGE_CHAIN_INDEXER',
  'legacy-chain-indexer': 'CUKIES_IMAGE_CHAIN_INDEXER',
  'cuki-card-worker': 'CUKIES_IMAGE_CUKI_CARD_WORKER',
  'cuki-card-worker-legacy': 'CUKIES_IMAGE_CUKI_CARD_WORKER',
  'cukies-bridge-relayer': 'CUKIES_IMAGE_CUKIES_BRIDGE_RELAYER',
  'cukie-master-scheduler': 'CUKIES_IMAGE_SCHEDULERS',
  'competition-credit-scheduler': 'CUKIES_IMAGE_SCHEDULERS',
  'game-economy-scheduler': 'CUKIES_IMAGE_SCHEDULERS',
  'cukie-pool-scheduler': 'CUKIES_IMAGE_SCHEDULERS',
  'weekly-ranking-scheduler': 'CUKIES_IMAGE_SCHEDULERS',
  'reward-accounting-scheduler': 'CUKIES_IMAGE_SCHEDULERS',
  'reward-batch-publisher': 'CUKIES_IMAGE_SCHEDULERS',
  'world-api': 'CUKIES_IMAGE_WORLD_API',
  'world-matchmaking': 'CUKIES_IMAGE_WORLD_MATCHMAKING',
});

const INFRASTRUCTURE_IMAGES = Object.freeze({
  'world-redis': 'redis:7-alpine',
});

export const WORLD_RUNTIME_SERVICES = Object.freeze(['world-api', 'world-matchmaking', 'world-redis']);
const WORLD_RUNTIME_NETWORK = 'world-private';

const GENERATED_HEADER = [
  '# GENERATED FILE. Do not edit directly.',
  '# Source: docker-compose.coolify.yml',
  '# Regenerate with: node scripts/ci/generate-images-compose.mjs --write',
  '',
].join('\n');

function serviceBlocks(lines) {
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^  ([a-z0-9-]+):$/);
    if (match) starts.push({ index, name: match[1] });
  }
  return starts.map((entry, position) => ({
    ...entry,
    end: starts[position + 1]?.index ?? lines.length,
  }));
}

function removeBlock(lines, start, end) {
  return [...lines.slice(0, start), ...lines.slice(end)];
}

function transformService(lines, name, imageEnv) {
  const image = INFRASTRUCTURE_IMAGES[name];
  const result = [lines[0], image
    ? `    image: "${image}"`
    : `    image: "\${${imageEnv}:?Set ${imageEnv} to an immutable digest reference}"`];
  let skipBuild = false;
  for (const line of lines.slice(1)) {
    if (line === '    <<: *dapp-runtime') continue;
    if (image && line === `    image: ${image}`) continue;
    if (line === '    build:') {
      skipBuild = true;
      continue;
    }
    if (skipBuild) {
      if (/^    [A-Za-z0-9_][A-Za-z0-9_-]*:/.test(line)) skipBuild = false;
      else continue;
    }
    result.push(line);
  }

  if (name === 'dapp') {
    const uuidIndex = result.findIndex((line) => line.startsWith('      COOLIFY_RESOURCE_UUID:'));
    if (uuidIndex !== -1) result.splice(uuidIndex + 1, 0, '      GIT_COMMIT_SHA: ${IMAGE_REVISION:?Set IMAGE_REVISION to the deployed SHA}');
  }
  return result;
}

export function generateImagesCompose(source) {
  let lines = String(source).replace(/\r\n/g, '\n').trimEnd().split('\n');
  const servicesMarker = lines.findIndex((line) => line === 'services:');
  if (servicesMarker === -1) throw new Error('docker-compose.coolify.yml no contiene services.');
  lines = lines.slice(servicesMarker);
  for (const block of serviceBlocks(lines).reverse()) {
    if (block.name === 'staging-mongo') lines = removeBlock(lines, block.index, block.end);
  }

  const serviceStart = 0;
  const serviceEnd = lines.slice(serviceStart + 1).findIndex((line) => /^(networks|volumes):$/.test(line));
  const servicesEnd = serviceEnd === -1 ? lines.length : serviceStart + 1 + serviceEnd;
  const serviceLines = lines.slice(serviceStart + 1, servicesEnd);
  const transformed = [];
  const serviceDocument = ['services:', ...serviceLines];
  for (const block of serviceBlocks(serviceDocument).slice(0)) {
    if (!SERVICE_IMAGES[block.name] && !INFRASTRUCTURE_IMAGES[block.name]) {
      throw new Error(`service ${block.name} no tiene una imagen CI definida.`);
    }
    if (block.name === 'world-redis') {
      const body = serviceDocument.slice(block.index, block.end);
      if (!body.includes('    image: redis:7-alpine') || body.some((line) => line === '    build:')) {
        throw new Error('world-redis debe usar exclusivamente la imagen de infraestructura redis:7-alpine.');
      }
    }
    const body = serviceDocument.slice(block.index, block.end);
    transformed.push(...transformService(body, block.name, SERVICE_IMAGES[block.name]));
  }
  lines = [...lines.slice(0, serviceStart + 1), ...transformed, ...lines.slice(servicesEnd)];

  const volumesIndex = lines.findIndex((line) => line === 'volumes:');
  if (volumesIndex !== -1) {
    const volumeStarts = [];
    for (let index = volumesIndex + 1; index < lines.length; index += 1) {
      const match = lines[index].match(/^  ([a-z0-9-]+):$/);
      if (match) volumeStarts.push({ index, name: match[1] });
    }
    const kept = [];
    for (const block of volumeStarts) {
      if (!['staging-mongo-data', 'staging-mongo-config'].includes(block.name)) {
        kept.push(...lines.slice(block.index, volumeStarts[volumeStarts.indexOf(block) + 1]?.index ?? lines.length));
      }
    }
    lines = kept.length
      ? [...lines.slice(0, volumesIndex + 1), ...kept]
      : lines.slice(0, volumesIndex);
  }

  const output = `${GENERATED_HEADER}${lines.join('\n').trimEnd()}\n`;
  if (/^\s+build:/m.test(output) || /staging-mongo|staging-mongo-data|staging-mongo-config/.test(output)) {
    throw new Error('el compose de imágenes conserva build o recursos staging-mongo.');
  }
  return output;
}

/**
 * Returns the delivery projection with World disabled. The full generated
 * Compose keeps the opt-in profile for future activation, but the current
 * delivery path must never let an external COMPOSE_PROFILES value start it.
 */
export function withoutWorldRuntime(source) {
  const normalized = String(source).replace(/\r\n/g, '\n');
  // Synthetic callers in the release tests use an inline empty services map.
  // It already contains no World service/network, so the projection is the
  // source itself and must remain byte-for-byte identical.
  if (/^services:\s*\{\}\s*$/m.test(normalized)) return normalized;
  let lines = normalized.split('\n');
  const servicesMarker = lines.findIndex((line) => line === 'services:');
  if (servicesMarker === -1) throw new Error('Compose sin sección services.');
  const servicesEndOffset = lines.slice(servicesMarker + 1)
    .findIndex((line) => /^(networks|volumes):$/.test(line));
  const servicesEnd = servicesEndOffset === -1 ? lines.length : servicesMarker + 1 + servicesEndOffset;
  const serviceLines = lines.slice(servicesMarker, servicesEnd);
  for (const block of serviceBlocks(serviceLines).reverse()) {
    if (WORLD_RUNTIME_SERVICES.includes(block.name)) {
      let start = servicesMarker + block.index;
      let end = servicesMarker + block.end;
      if (start > servicesMarker + 1 && lines[start - 1] === '') start -= 1;
      if (end > start && lines[end - 1] === '') end -= 1;
      lines = [...lines.slice(0, start), ...lines.slice(end)];
    }
  }

  const networksIndex = lines.findIndex((line) => line === 'networks:');
  if (networksIndex !== -1) {
    const networkEndOffset = lines.slice(networksIndex + 1)
      .findIndex((line) => /^(volumes|secrets|configs):$/.test(line));
    const networkEnd = networkEndOffset === -1 ? lines.length : networksIndex + 1 + networkEndOffset;
    const networkLines = lines.slice(networksIndex, networkEnd);
    const blocks = [];
    for (let index = 1; index < networkLines.length; index += 1) {
      const match = networkLines[index].match(/^  ([a-z0-9-]+):$/);
      if (match) blocks.push({ index, name: match[1] });
    }
    const worldNetwork = blocks.find((block) => block.name === WORLD_RUNTIME_NETWORK);
    if (worldNetwork) {
      let start = networksIndex + worldNetwork.index;
      let end = networksIndex + (blocks.find((block) => block.index > worldNetwork.index)?.index ?? networkLines.length);
      if (end > start && lines[end - 1] === '') end -= 1;
      lines = [...lines.slice(0, start), ...lines.slice(end)];
    }
  }

  return lines.join('\n');
}

const DAPP_INTERNAL_URL = 'http://dapp-${COOLIFY_RESOURCE_UUID}:3000';
const WEB_URL = '${CUKIES_WEB_URL:?Set CUKIES_WEB_URL}';
const WEB_RESOURCE_UUID = '${CUKIES_WEB_RESOURCE_UUID:?Set CUKIES_WEB_RESOURCE_UUID}';

function removeDappService(lines) {
  const blocks = serviceBlocks(lines);
  const dapp = blocks.find((block) => block.name === 'dapp');
  if (!dapp) throw new Error('docker-compose.images.yml no contiene el servicio dapp.');
  return removeBlock(lines, dapp.index, dapp.end);
}

function removeDappDependency(lines) {
  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== '    depends_on:') {
      result.push(lines[index]);
      continue;
    }

    const end = lines.slice(index + 1).findIndex((line) => line && !/^      /.test(line));
    const blockEnd = end === -1 ? lines.length : index + 1 + end;
    const dependencyLines = lines.slice(index + 1, blockEnd);
    const kept = [];
    for (let dependencyIndex = 0; dependencyIndex < dependencyLines.length; dependencyIndex += 1) {
      const dependency = dependencyLines[dependencyIndex];
      if (dependency === '      dapp:') {
        dependencyIndex += 1;
        while (
          dependencyIndex < dependencyLines.length
          && /^        /.test(dependencyLines[dependencyIndex])
        ) dependencyIndex += 1;
        dependencyIndex -= 1;
        continue;
      }
      kept.push(dependency);
    }
    if (kept.length > 0) result.push('    depends_on:', ...kept);
    index = blockEnd - 1;
  }
  return result;
}

function rewriteWorkerService(lines) {
  const hasDappUrl = lines.some((line) => line.includes(DAPP_INTERNAL_URL));
  if (!hasDappUrl) return lines;

  const result = lines.map((line) => line
    .replaceAll(DAPP_INTERNAL_URL, WEB_URL)
    .replaceAll('process.env.COOLIFY_RESOURCE_UUID', 'process.env.CUKIES_WEB_RESOURCE_UUID'));
  const uuidIndex = result.findIndex((line) => line.startsWith('      COOLIFY_RESOURCE_UUID:'));
  if (uuidIndex === -1) throw new Error('servicio worker con URL dapp sin COOLIFY_RESOURCE_UUID.');
  result.splice(uuidIndex, 0, `      CUKIES_WEB_RESOURCE_UUID: ${WEB_RESOURCE_UUID}`);
  return result;
}

export function generateWorkersCompose(source) {
  const generatedImages = generateImagesCompose(source);
  let lines = generatedImages.trimEnd().split('\n');
  const servicesMarker = lines.findIndex((line) => line === 'services:');
  if (servicesMarker === -1) throw new Error('docker-compose.images.yml no contiene services.');

  lines = removeDappService(lines);
  const servicesEnd = lines.slice(servicesMarker + 1)
    .findIndex((line) => /^(networks|volumes):$/.test(line));
  const end = servicesEnd === -1 ? lines.length : servicesMarker + 1 + servicesEnd;
  const services = lines.slice(servicesMarker + 1, end);
  const transformed = [];
  for (const block of serviceBlocks(['services:', ...services])) {
    transformed.push(...rewriteWorkerService(
      removeDappDependency(['services:', ...services].slice(block.index, block.end)),
    ));
  }
  lines = [
    ...lines.slice(0, servicesMarker + 1),
    ...transformed,
    ...lines.slice(end),
  ];

  const output = `${lines.join('\n').trimEnd()}\n`;
  if (
    /^\s+build:/m.test(output)
    || /(^|\n)  dapp:\n/.test(output)
    || /(^|\n)      dapp:/.test(output)
    || /^    ports:/m.test(output)
    || output.includes(DAPP_INTERNAL_URL)
  ) {
    throw new Error('el compose de workers conserva dapp, una dependencia dapp, build, ports o una URL interna.');
  }
  return output;
}

async function main() {
  const root = resolve(new URL('../..', import.meta.url).pathname);
  const sourcePath = resolve(root, 'docker-compose.coolify.yml');
  const imagesPath = resolve(root, 'docker-compose.images.yml');
  const workersPath = resolve(root, 'docker-compose.workers.yml');
  const source = await readFile(sourcePath, 'utf8');
  const generatedImages = generateImagesCompose(source);
  const generatedWorkers = generateWorkersCompose(source);
  if (process.argv.includes('--check')) {
    const [currentImages, currentWorkers] = await Promise.all([
      readFile(imagesPath, 'utf8').catch(() => null),
      readFile(workersPath, 'utf8').catch(() => null),
    ]);
    if (currentImages !== generatedImages) {
      throw new Error('docker-compose.images.yml está desactualizado; el archivo existente debe permanecer igual.');
    }
    if (currentWorkers !== generatedWorkers) {
      throw new Error('docker-compose.workers.yml está desactualizado; ejecuta --write.');
    }
    return;
  }
  if (!process.argv.includes('--write')) throw new Error('usa --write o --check.');
  await writeFile(imagesPath, generatedImages);
  await writeFile(workersPath, generatedWorkers);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
