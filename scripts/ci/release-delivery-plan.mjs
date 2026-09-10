import { createHash } from 'node:crypto';
import { assertImmutableImageEntry, CI_COMPONENTS, WORLD_COMPONENTS } from './image-ref.mjs';
import { assertEnvironmentMetadata, resolveDeploymentEnvironment } from './deployment-environment.mjs';
import { withoutWorldRuntime } from './generate-images-compose.mjs';

function worldActivationRequested(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.worldEnabled === true || value.worldEnabled === 'true'
    || value.worldRuntimeEnabled === true || value.worldRuntimeEnabled === 'true'
    || value.WORLD_RUNTIME_ENABLED === true || value.WORLD_RUNTIME_ENABLED === 'true'
    || value.worldProfile === 'world-runtime') return true;
  const profiles = value.composeProfiles ?? value.COMPOSE_PROFILES;
  if (Array.isArray(profiles)) return profiles.includes('world-runtime');
  return typeof profiles === 'string' && profiles.split(',').map((item) => item.trim()).includes('world-runtime');
}

export function assertWorldDisabled(...values) {
  if (values.some((value) => worldActivationRequested(value)
    || (typeof value === 'string' && /(?:WORLD_RUNTIME_ENABLED|WORLD_GAME_WRITES_ENABLED)\s*[:=]\s*["']?true\b/i.test(value))
    || (typeof value === 'string' && /COMPOSE_PROFILES\s*[:=][^\n]*\bworld-runtime\b/i.test(value)))) {
    throw new Error('La entrega World sigue apagada; no se acepta world-runtime en el manifiesto o sus perfiles.');
  }
}

export function chooseDelivery({ manifest, previous, compose }) {
  const deployment = resolveDeploymentEnvironment(manifest.environment);
  assertWorldDisabled(manifest, previous);
  assertEnvironmentMetadata(manifest, deployment, { context: 'manifest de entrega' });
  if (previous) assertEnvironmentMetadata(previous, deployment, { context: 'estado previo' });
  for (const component of CI_COMPONENTS) {
    const entry = manifest.components?.[component];
    assertEnvironmentMetadata(entry, deployment, { context: `imagen ${component}` });
    assertImmutableImageEntry(component, entry);
  }
  const effectiveCompose = withoutWorldRuntime(compose);
  const workersComposeHash = createHash('sha256').update(effectiveCompose).digest('hex');
  const changed = CI_COMPONENTS.filter((component) => manifest.components[component].image !== previous?.components?.[component]?.image);
  const changedGame = changed.includes('treasure-hunt');
  const changedWeb = changed.includes('dapp') || manifest.configHash !== previous?.configHash;
  const changedWorkers = changed.some((component) => component !== 'dapp' && component !== 'treasure-hunt' && !WORLD_COMPONENTS.includes(component));
  // The first rolling split still brings up web/workers together. A game lane
  // is independent and is also deployed during a first release/bootstrap.
  const firstRolling = previous?.deliveryMode !== 'rolling';
  const workers = firstRolling || previous?.workersComposeHash !== workersComposeHash || changedWorkers;
  const web = firstRolling || workers || changedWeb;
  const game = changedGame;
  return { deliveryMode: 'rolling', web, workers, game, skip: !web && !workers && !game, changed, workersComposeHash };
}
