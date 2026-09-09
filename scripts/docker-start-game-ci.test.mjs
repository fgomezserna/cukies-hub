import assert from 'node:assert/strict';
import test from 'node:test';

import {GAME_RUNTIME_TARGETS, validateGameRuntime} from './docker-start-game-ci.mjs';

function environment(environmentName) {
  const target = GAME_RUNTIME_TARGETS[environmentName];
  return {
    APP_ENV: target.appEnv,
    NEXT_PUBLIC_APP_ENV: target.appEnv,
    STAGING_ONLY_GUARD: target.stagingOnlyGuard,
    COOLIFY_RESOURCE_UUID: target.resourceUuid,
    COOLIFY_APPLICATION_ID: target.applicationId,
    COOLIFY_BRANCH: target.branch,
    NEXT_PUBLIC_GAME_BASE_PATH: target.basePath,
  };
}

test('acepta la identidad de Treasure Hunt en staging y producción', () => {
  assert.equal(validateGameRuntime(environment('staging')).target.applicationId, '31');
  assert.equal(validateGameRuntime(environment('production')).target.applicationId, '13');
});

test('rechaza cruzar recurso, rama o basePath entre entornos', () => {
  for (const key of ['COOLIFY_RESOURCE_UUID', 'COOLIFY_BRANCH', 'NEXT_PUBLIC_GAME_BASE_PATH', 'NEXT_PUBLIC_APP_ENV']) {
    const candidate = environment('staging');
    candidate[key] = environment('production')[key];
    assert.throws(() => validateGameRuntime(candidate), /runtime guard rejected/);
  }
});
