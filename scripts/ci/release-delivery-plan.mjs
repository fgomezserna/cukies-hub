import { createHash } from 'node:crypto';
import { assertImmutableImageEntry, CI_COMPONENTS } from './image-ref.mjs';
import { assertEnvironmentMetadata, resolveDeploymentEnvironment } from './deployment-environment.mjs';

export function chooseDelivery({ manifest, previous, compose }) {
  const deployment = resolveDeploymentEnvironment(manifest.environment);
  assertEnvironmentMetadata(manifest, deployment, { context: 'manifest de entrega' });
  if (previous) assertEnvironmentMetadata(previous, deployment, { context: 'estado previo' });
  for (const component of CI_COMPONENTS) assertImmutableImageEntry(component, manifest.components?.[component]);
  const workersComposeHash = createHash('sha256').update(compose).digest('hex');
  const changed = CI_COMPONENTS.filter((component) => manifest.components[component].image !== previous?.components?.[component]?.image);
  const changedGame = changed.includes('treasure-hunt');
  const changedWeb = changed.includes('dapp') || manifest.configHash !== previous?.configHash;
  const changedWorkers = changed.some((component) => component !== 'dapp' && component !== 'treasure-hunt');
  // The first rolling split still brings up web/workers together. A game lane
  // is independent and is also deployed during a first release/bootstrap.
  const firstRolling = previous?.deliveryMode !== 'rolling';
  const workers = firstRolling || previous?.workersComposeHash !== workersComposeHash || changedWorkers;
  const web = firstRolling || workers || changedWeb;
  const game = changedGame;
  return { deliveryMode: 'rolling', web, workers, game, skip: !web && !workers && !game, changed, workersComposeHash };
}
