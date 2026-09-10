import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const compose = readFileSync(new URL('../../../docker-compose.coolify.yml', import.meta.url), 'utf8');

test('World services remain opt-in and have no public ports or Traefik labels', () => {
  for (const service of ['world-redis:', 'world-api:', 'world-matchmaking:']) {
    const start = compose.indexOf(`  ${service}`);
    const block = compose.slice(start).split(/\n  (?=\S)/, 1)[0];
    assert.match(block, /profiles:\s*\n\s+- world-runtime/);
    assert.doesNotMatch(block, /\n\s+ports:/);
    assert.doesNotMatch(block, /traefik/i);
  }
});

test('World network is private while APIs retain scoped Coolify egress aliases', () => {
  assert.match(compose, /world-private:\n\s+name: .*\n\s+internal: true/);
  assert.match(compose, /world-api-\$\{COOLIFY_RESOURCE_UUID:-local\}/);
  assert.match(compose, /world-matchmaking-\$\{COOLIFY_RESOURCE_UUID:-local\}/);
});

test('World env is optional at Compose interpolation time', () => {
  const worldStart = compose.indexOf('  world-redis:');
  const worldConfig = compose.slice(worldStart);
  assert.doesNotMatch(worldConfig, /WORLD_[A-Z0-9_]+:\s*\$\{[^}]*:\?[^}]*\}/);
});
