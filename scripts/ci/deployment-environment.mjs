#!/usr/bin/env node

const ENVIRONMENTS = Object.freeze({
  staging: Object.freeze({
    environment: 'staging',
    chainId: '97',
    branch: 'staging',
    cacheNamespace: 'staging',
  }),
  production: Object.freeze({
    environment: 'production',
    chainId: '56',
    branch: 'main',
    cacheNamespace: 'production',
  }),
});

export const DEPLOYMENT_ENVIRONMENTS = ENVIRONMENTS;

export function resolveDeploymentEnvironment(name = process.env.CUKIES_DEPLOY_ENVIRONMENT || 'staging') {
  if (typeof name !== 'string' || !Object.hasOwn(ENVIRONMENTS, name)) {
    throw new Error(`entorno de despliegue inválido: ${String(name)}. Valores permitidos: staging, production.`);
  }
  return { ...ENVIRONMENTS[name] };
}

export function assertEnvironmentMetadata(value, deployment, { allowLegacy = false, context = 'metadatos' } = {}) {
  const resolved = typeof deployment === 'string'
    ? resolveDeploymentEnvironment(deployment)
    : resolveDeploymentEnvironment(deployment?.environment);
  const hasEnvironment = value !== null && typeof value === 'object' && Object.hasOwn(value, 'environment');
  const hasChainId = value !== null && typeof value === 'object' && Object.hasOwn(value, 'chainId');
  if (!hasEnvironment && !hasChainId) {
    if (allowLegacy) return resolved;
    throw new Error(`${context} debe declarar environment y chainId.`);
  }
  if (value.environment !== resolved.environment || String(value.chainId) !== resolved.chainId) {
    throw new Error(`${context} no corresponde al entorno ${resolved.environment}/${resolved.chainId}.`);
  }
  return resolved;
}
