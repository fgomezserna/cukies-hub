#!/usr/bin/env node

import {existsSync} from 'node:fs';
import {createDappServerController} from './docker-dapp-server.mjs';

export const GAME_RUNTIME_TARGETS = Object.freeze({
  staging: Object.freeze({
    appEnv: 'staging',
    branch: 'staging',
    resourceUuid: 'lc04cw8gs4koo4swwws0c4ss',
    applicationId: '31',
    basePath: '/treasurehunt-game',
    stagingOnlyGuard: 'true',
  }),
  production: Object.freeze({
    appEnv: 'production',
    branch: 'main',
    resourceUuid: 'tkkggwcosc4gksckcc480cwg',
    applicationId: '13',
    basePath: '',
    stagingOnlyGuard: 'false',
  }),
});

function required(environment, key, failures) {
  const value = environment[key]?.trim();
  if (!value) failures.push(`${key} is required`);
  return value;
}

function unquote(value) {
  return value?.replace(/^(['"])(.*)\1$/, '$2');
}

function exact(environment, key, expected, failures, {quoted = false} = {}) {
  if (expected === '' && (!environment[key] || environment[key].trim() === '')) return '';
  const value = required(environment, key, failures);
  if (value && (quoted ? unquote(value) : value) !== expected) {
    failures.push(`${key} must equal ${expected}`);
  }
  return value;
}

export function validateGameRuntime(environment = process.env) {
  const failures = [];
  const appEnv = exact(environment, 'APP_ENV', environment.APP_ENV?.trim(), failures);
  const target = GAME_RUNTIME_TARGETS[appEnv];
  if (!target) {
    failures.push('APP_ENV must be staging or production');
    throw new Error(`Treasure Hunt runtime guard rejected:\n- ${failures.join('\n- ')}`);
  }

  exact(environment, 'APP_ENV', target.appEnv, failures);
  exact(environment, 'NEXT_PUBLIC_APP_ENV', target.appEnv, failures);
  exact(environment, 'STAGING_ONLY_GUARD', target.stagingOnlyGuard, failures);
  exact(environment, 'COOLIFY_RESOURCE_UUID', target.resourceUuid, failures);
  exact(environment, 'COOLIFY_BRANCH', target.branch, failures, {quoted: true});
  exact(environment, 'NEXT_PUBLIC_GAME_BASE_PATH', target.basePath, failures);

  const applicationId = environment.COOLIFY_APPLICATION_ID?.trim();
  if (applicationId && applicationId !== target.applicationId) {
    failures.push(`COOLIFY_APPLICATION_ID must equal ${target.applicationId}`);
  }

  if (failures.length > 0) {
    throw new Error(`Treasure Hunt runtime guard rejected:\n- ${failures.join('\n- ')}`);
  }
  return {ok: true, target};
}

function serverPath() {
  if (existsSync('/app/server.js')) return '/app/server.js';
  if (existsSync('/app/games/sybil-slayer/server.js')) return '/app/games/sybil-slayer/server.js';
  throw new Error('No se encontró el servidor standalone de Treasure Hunt');
}

export function startGameServer({environment = process.env, controllerFactory = createDappServerController, onExit = (code) => process.exit(code)} = {}) {
  validateGameRuntime(environment);
  const controller = controllerFactory({
    serverPath: serverPath(),
    environment,
    onExit,
  });
  const forwardSignal = (signal) => {
    controller.handleSignal(signal);
  };
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  return controller;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    startGameServer();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
