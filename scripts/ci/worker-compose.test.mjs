import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  generateImagesCompose,
  generateWorkersCompose,
} from './generate-images-compose.mjs';

const source = await readFile(new URL('../../docker-compose.coolify.yml', import.meta.url), 'utf8');
const images = generateImagesCompose(source);
const workers = generateWorkersCompose(source);

function serviceBlocks(compose) {
  const lines = compose.split('\n');
  const servicesIndex = lines.indexOf('services:');
  const end = lines.slice(servicesIndex + 1)
    .findIndex((line) => /^(networks|volumes):$/.test(line));
  const serviceLines = lines.slice(
    servicesIndex + 1,
    end === -1 ? lines.length : servicesIndex + 1 + end,
  );
  const starts = [];
  for (let index = 0; index < serviceLines.length; index += 1) {
    const match = serviceLines[index].match(/^  ([a-z0-9-]+):$/);
    if (match) starts.push({ index, name: match[1] });
  }
  return new Map(starts.map((start, position) => [
    start.name,
    serviceLines.slice(start.index, starts[position + 1]?.index ?? serviceLines.length),
  ]));
}

function section(lines, name) {
  const start = lines.findIndex((line) => line === `    ${name}:`);
  if (start === -1) return [];
  const end = lines.slice(start + 1).findIndex((line) => /^    [a-z0-9_-]+:/.test(line));
  return lines.slice(start, end === -1 ? lines.length : start + 1 + end);
}

function profiles(block) {
  const profileIndex = block.indexOf('    profiles:');
  if (profileIndex === -1) return [];
  return block.slice(profileIndex + 1).filter((line) => line.startsWith('      - '));
}

test('genera solo servicios worker y no conserva build, Mongo embebido ni exposicion web', () => {
  const imageServices = serviceBlocks(images);
  const workerServices = serviceBlocks(workers);

  assert.deepEqual(
    [...workerServices.keys()],
    [...imageServices.keys()].filter((name) => name !== 'dapp'),
  );
  assert.doesNotMatch(workers, /^    build:/m);
  assert.doesNotMatch(workers, /staging-mongo/);
  assert.doesNotMatch(workers, /(^|\n)  dapp:\n/);
  assert.doesNotMatch(workers, /(^|\n)      dapp:/);
  assert.doesNotMatch(workers, /^    ports:/m);
  assert.doesNotMatch(workers, /CUKIES_DAPP_TRAEFIK_LABEL_FILE/);
  assert.doesNotMatch(workers, /http:\/\/dapp-/);
});

test('conserva profiles, volumes, networks, healthchecks y dependencias no dapp', () => {
  const imageServices = serviceBlocks(images);
  const workerServices = serviceBlocks(workers);

  for (const [name, imageBlock] of imageServices) {
    if (name === 'dapp') continue;
    const workerBlock = workerServices.get(name);
    assert.deepEqual(profiles(workerBlock), profiles(imageBlock), `${name} profiles`);
    assert.deepEqual(section(workerBlock, 'volumes'), section(imageBlock, 'volumes'), `${name} volumes`);
    assert.deepEqual(section(workerBlock, 'networks'), section(imageBlock, 'networks'), `${name} networks`);
    assert.equal(workerBlock.includes('    healthcheck:'), imageBlock.includes('    healthcheck:'), `${name} healthcheck`);
  }

  const publisher = workerServices.get('reward-batch-publisher').join('\n');
  const relayer = workerServices.get('cukies-bridge-relayer').join('\n');
  assert.match(publisher, /\n    depends_on:\n      chain-indexer:\n        condition: service_healthy/);
  assert.match(relayer, /\n    depends_on:\n      chain-indexer:\n        condition: service_healthy/);
  assert.doesNotMatch(workers, /depends_on:\n      dapp:/);
});

test('usa URL web configurable y valida la identidad sana del dapp remoto', () => {
  const schedulerNames = [
    'cukie-master-scheduler',
    'competition-credit-scheduler',
    'game-economy-scheduler',
    'cukie-pool-scheduler',
    'weekly-ranking-scheduler',
    'reward-accounting-scheduler',
    'reward-batch-publisher',
  ];
  const workerServices = serviceBlocks(workers);
  const webUrl = '${CUKIES_WEB_URL:?Set CUKIES_WEB_URL}';
  const webUuid = '${CUKIES_WEB_RESOURCE_UUID:?Set CUKIES_WEB_RESOURCE_UUID}';

  for (const name of schedulerNames) {
    const block = workerServices.get(name).join('\n');
    assert.match(block, new RegExp(`CUKIES_WEB_RESOURCE_UUID: ${webUuid.replace(/[{}:?$]/g, '\\$&')}`));
    assert.match(block, new RegExp(webUrl.replace(/[{}:?$]/g, '\\$&')));
    assert.match(block, /process\.env\.CUKIES_WEB_RESOURCE_UUID/);
    assert.doesNotMatch(block, /process\.env\.COOLIFY_RESOURCE_UUID/);
    assert.doesNotMatch(block, /:3000/);
  }
});

