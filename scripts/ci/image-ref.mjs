import { readFileSync } from 'node:fs';

export const KNOWN_CI_COMPONENTS = Object.freeze([
  'dapp',
  'chain-indexer',
  'cuki-card-worker',
  'schedulers',
  'cukies-bridge-relayer',
  'treasure-hunt',
]);

function loadCiComponents() {
  const declared = JSON.parse(readFileSync(new URL('../../infrastructure/ci/components.json', import.meta.url), 'utf8'));
  if (!Array.isArray(declared) || declared.length === 0 || declared.some((value) => typeof value !== 'string')) {
    throw new Error('infrastructure/ci/components.json debe contener un array no vacío de componentes.');
  }
  if (new Set(declared).size !== declared.length) {
    throw new Error('infrastructure/ci/components.json no puede contener componentes duplicados.');
  }
  const unknown = declared.filter((component) => !KNOWN_CI_COMPONENTS.includes(component));
  if (unknown.length > 0) {
    throw new Error(`componentes CI fuera del catálogo conocido: ${unknown.join(', ')}.`);
  }
  return Object.freeze(declared);
}

export const CI_COMPONENTS = loadCiComponents();

const IMAGE_PATTERN = /^(?<repository>.+)\/cukies-hub\/(?<component>[a-z0-9-]+):(?<sourceSha>[0-9a-f]{40})-(?<configHash>[0-9a-f]{64})@(?<digest>sha256:[0-9a-f]{64})$/i;

export function parseImmutableImage(image) {
  if (typeof image !== 'string') return null;
  const match = image.match(IMAGE_PATTERN);
  if (!match) return null;
  return {
    repository: match.groups.repository,
    component: match.groups.component,
    sourceSha: match.groups.sourceSha,
    configHash: match.groups.configHash,
    tag: `${match.groups.sourceSha}-${match.groups.configHash}`,
    digest: match.groups.digest,
  };
}

export function assertImmutableImageEntry(component, entry, { expectedSourceSha } = {}) {
  if (!CI_COMPONENTS.includes(component)) throw new Error(`componente CI no soportado: ${component}.`);
  const parsed = parseImmutableImage(entry?.image);
  if (!parsed || parsed.component !== component) {
    throw new Error(`referencia de imagen incoherente para ${component}.`);
  }
  if (typeof entry.digest !== 'string' || !/^sha256:[0-9a-f]{64}$/i.test(entry.digest) || entry.digest.toLowerCase() !== parsed.digest.toLowerCase()) {
    throw new Error(`digest incoherente para ${component}.`);
  }
  if (entry.tag !== undefined && entry.tag !== parsed.tag) throw new Error(`tag incoherente para ${component}.`);
  if (entry.configHash !== undefined && entry.configHash !== parsed.configHash) throw new Error(`config hash incoherente para ${component}.`);
  if (entry.sourceSha !== undefined && entry.sourceSha !== parsed.sourceSha) throw new Error(`SHA de origen incoherente para ${component}.`);
  if (expectedSourceSha !== undefined && parsed.sourceSha !== expectedSourceSha) {
    throw new Error(`imagen de ${component} no corresponde al estado desplegado.`);
  }
  return { ...entry, digest: parsed.digest, tag: parsed.tag, configHash: parsed.configHash, sourceSha: parsed.sourceSha };
}
