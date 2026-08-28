import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertBscCursorBootstrapIdentity } from '../src/chains/bsc.js';

const contractAddress = `0x${'a'.repeat(40)}`;
const contractEvent = {
  chain: 'BSC' as const,
  contractAlias: 'UKI_STAKING' as const,
  contractAddress,
  eventName: 'Staked' as const,
};
const identity = {
  alias: 'UKI_STAKING' as const,
  chainId: 97 as const,
  address: contractAddress,
  startBlock: 100,
  deploymentBlock: 100,
  deploymentTxHash: `0x${'1'.repeat(64)}`,
  runtimeCodeHash: `0x${'2'.repeat(64)}`,
  configHash: `0x${'3'.repeat(64)}`,
};
const sealedCursor = {
  contractAddress,
  bootstrapStatus: 'verified' as const,
  bootstrapStartBlock: identity.startBlock,
  bootstrapVerifiedAt: new Date('2026-08-28T00:00:00.000Z'),
  verifiedChainId: identity.chainId,
  contractCodeHash: identity.runtimeCodeHash,
  contractDeploymentBlock: identity.deploymentBlock,
  contractDeploymentTxHash: identity.deploymentTxHash,
  contractConfigHash: identity.configHash,
};

describe('BSC sealed cursor bootstrap identity', () => {
  it('accepts a sealed cursor only while all identity fields still match', () => {
    assert.doesNotThrow(() => assertBscCursorBootstrapIdentity({
      contractEvent,
      cursor: sealedCursor,
      identity,
    }));
  });

  it('allows a legacy unsealed cursor to follow the existing coverage migration path', () => {
    assert.doesNotThrow(() => assertBscCursorBootstrapIdentity({
      contractEvent,
      cursor: {
        contractAddress,
      },
      identity,
    }));
  });

  for (const [field, value] of [
    ['contractAddress', `0x${'b'.repeat(40)}`],
    ['bootstrapStartBlock', 101],
    ['bootstrapVerifiedAt', undefined],
    ['verifiedChainId', 56],
    ['contractCodeHash', `0x${'4'.repeat(64)}`],
    ['contractDeploymentBlock', 101],
    ['contractDeploymentTxHash', `0x${'5'.repeat(64)}`],
    ['contractConfigHash', `0x${'6'.repeat(64)}`],
  ] as const) {
    it(`rejects drift in ${field}`, () => {
      assert.throws(() => assertBscCursorBootstrapIdentity({
        contractEvent,
        cursor: { ...sealedCursor, [field]: value },
        identity,
      }), /Config drift en bootstrap/);
    });
  }
});
