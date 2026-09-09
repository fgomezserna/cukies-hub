import { resolveDeploymentEnvironment } from './deployment-environment.mjs';

const TARGETS = Object.freeze({
  staging: {
    web: { resourceUuid: 'rwwsc4kkwc0ck84cgk40s8kk', applicationId: '32' },
    workers: { resourceUuid: 'u4s804o4wwcckowgk0woo4wg', applicationId: '28' },
    publicUrl: 'https://cukieshub.eurekand.com',
  },
  production: {
    web: { resourceUuid: 'uo8gswsg84c488cowko0kkkg', applicationId: '33' },
    workers: { resourceUuid: 'jookw8ow8woks088s44404ok', applicationId: '12' },
    publicUrl: 'https://cukies.world',
  },
});

export function resolveCoolifyTargets(environment) {
  const deployment = resolveDeploymentEnvironment(environment);
  const selected = TARGETS[deployment.environment];
  if (!selected.web) throw new Error(`El recurso web de ${deployment.environment} todavía no está configurado.`);
  const common = { gitBranch: deployment.branch, repository: 'fgomezserna/cukies-hub' };
  return {
    ...deployment,
    publicUrl: selected.publicUrl,
    web: { ...common, ...selected.web, healthUrl: `${selected.publicUrl}/api/health`, readyUrl: `${selected.publicUrl}/api/ready` },
    workers: { ...common, ...selected.workers, composeLocation: '/docker-compose.workers.yml' },
  };
}
