import { resolveDeploymentEnvironment } from './deployment-environment.mjs';

const TARGETS = Object.freeze({
  staging: {
    web: { resourceUuid: 'rwwsc4kkwc0ck84cgk40s8kk', applicationId: '32' },
    game: { resourceUuid: 'lc04cw8gs4koo4swwws0c4ss', applicationId: '31', publicUrl: 'https://cukieshub.eurekand.com/treasurehunt-game' },
    workers: { resourceUuid: 'u4s804o4wwcckowgk0woo4wg', applicationId: '28' },
    publicUrl: 'https://cukieshub.eurekand.com',
  },
  production: {
    web: { resourceUuid: 'uo8gswsg84c488cowko0kkkg', applicationId: '33' },
    game: { resourceUuid: 'tkkggwcosc4gksckcc480cwg', applicationId: '13', publicUrl: 'https://treasurehunt.cukies.world' },
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
    game: {
      ...common,
      ...selected.game,
      component: 'treasure-hunt',
      appName: 'treasure-hunt',
      requireImageSha: true,
      healthUrl: `${selected.game.publicUrl}/api/health`,
      readyUrl: `${selected.game.publicUrl}/api/ready`,
    },
    workers: { ...common, ...selected.workers, composeLocation: '/docker-compose.workers.yml' },
  };
}
