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
  const firstRolling = previous?.deliveryMode !== 'rolling';
  const workers = firstRolling || previous?.workersComposeHash !== workersComposeHash || changed.some((component) => component !== 'dapp');
  const web = firstRolling || workers || changed.includes('dapp') || manifest.configHash !== previous?.configHash;
  return { deliveryMode: 'rolling', web, workers, skip: !web && !workers, changed, workersComposeHash };
}
