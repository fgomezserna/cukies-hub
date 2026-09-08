import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  STAGING_DEPLOY_GUARD,
  assertDeploymentTarget,
  assertFreeSpace,
  assertNoOtherBuild,
  checkStagingDeploy,
  parseFreeBytes,
} from './staging-deploy-guard.mjs';

describe('staging deployment guard', () => {
  it('reads df output and enforces the 10 GiB floor', () => {
    const freeBytes = parseFreeBytes('Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 100 1 99 1% /srv\n');
    assert.equal(freeBytes, 99n * 1024n);
    assert.throws(() => assertFreeSpace(9n * 1024n * 1024n * 1024n), /espacio libre insuficiente/);
  });

  it('fails closed on a wrong deployment or another active build', () => {
    assert.equal(assertDeploymentTarget(STAGING_DEPLOY_GUARD.resourceUuid), STAGING_DEPLOY_GUARD.resourceUuid);
    assert.throws(() => assertDeploymentTarget('other-deployment'), /sólo se puede cancelar/);
    assert.throws(() => assertNoOtherBuild(['other-deployment']), /otro build activo/);
  });

  it('checks the exact target without mutating or cancelling anything', async () => {
    const result = await checkStagingDeploy({
      deploymentUuid: STAGING_DEPLOY_GUARD.resourceUuid,
      activeDeploymentUuids: [STAGING_DEPLOY_GUARD.resourceUuid],
      exec: async () => ({ stdout: 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 1 1 20000000 1% /srv\n' }),
    });
    assert.equal(result.deploymentUuid, STAGING_DEPLOY_GUARD.resourceUuid);
    assert.equal(result.intervalMs, 2500);
  });

  it('fails closed if df cannot be read', async () => {
    await assert.rejects(
      checkStagingDeploy({
        deploymentUuid: STAGING_DEPLOY_GUARD.resourceUuid,
        exec: async () => { throw new Error('df failed'); },
      }),
      /df failed/,
    );
  });
});
