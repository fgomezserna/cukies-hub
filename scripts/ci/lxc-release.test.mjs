import test from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { assertLxcManifest, createLxcReleaseEnv } from './lxc-release.mjs';
import { CI_COMPONENTS } from './image-ref.mjs';

const sha = 'a'.repeat(40);
const hash = 'b'.repeat(64);
const digest = `sha256:${'c'.repeat(64)}`;

function manifest(environment = 'production') {
  return {
    environment,
    chainId: environment === 'production' ? '56' : '97',
    commit: sha,
    configHash: hash,
    components: Object.fromEntries(CI_COMPONENTS.map((component) => [component, {
      image: `registry:5000/cukies-hub/${component}:${sha}-${hash}@${digest}`,
      digest,
      sourceSha: sha,
      configHash: hash,
    }])),
  };
}

test('el manifest LXC solo admite producción con imágenes inmutables', () => {
  assert.equal(assertLxcManifest(manifest()).environment, 'production');
  assert.throws(() => assertLxcManifest(manifest('staging')), /reservado a producción/);
});

test('release.env del LXC no contiene secretos y fija la release por digest', () => {
  const env = createLxcReleaseEnv(manifest());
  assert.match(env, /IMAGE_REVISION=a{40}/);
  assert.match(env, /CUKIES_BUILD_ENV_HASH=b{64}/);
  assert.match(env, /CUKIES_WEB_RESOURCE_UUID=uo8gswsg84c488cowko0kkkg/);
  assert.match(env, /CUKIES_GAME_TRAEFIK_LABEL_FILE=treasure-hunt-production\.labels/);
  assert.match(env, /CUKIES_DAPP_TRAEFIK_LABEL_FILE=dapp-production\.labels/);
  assert.match(env, /COMPOSE_PROFILES=bridge-relayer/);
  for (const component of CI_COMPONENTS) {
    assert.match(env, new RegExp(`CUKIES_IMAGE_${component.replaceAll('-', '_').toUpperCase()}=registry:5000`));
  }
  assert.doesNotMatch(env, /PASSWORD|SECRET|PRIVATE_KEY/);
});

test('el overlay LXC retira el puerto directo y separa la identidad web de los workers', async () => {
  const overlay = await readFile(new URL('../../docker-compose.production.lxc.yml', import.meta.url), 'utf8');
  assert.match(overlay, /ports: !reset \[\]/);
  assert.match(overlay, /COOLIFY_RESOURCE_UUID: \$\{CUKIES_WEB_RESOURCE_UUID:/);
  assert.match(overlay, /- dapp-\$\{CUKIES_WEB_RESOURCE_UUID:/);
  assert.match(overlay, /  treasure-hunt:\n/);
  assert.match(overlay, /CUKIES_GAME_TRAEFIK_LABEL_FILE:/);
});
