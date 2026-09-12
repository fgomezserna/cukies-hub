import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertBscDeploymentReceiptIdentity } from './bsc.js';

const contractAddress = '0x00000000000000000000000000000000000000aa';
const otherAddress = '0x00000000000000000000000000000000000000bb';
const deploymentTxHash = `0x${'1'.repeat(64)}`;
const otherTxHash = `0x${'2'.repeat(64)}`;

function validReceipt() {
  return {
    status: 'success',
    contractAddress,
    blockNumber: 123n,
    transactionHash: deploymentTxHash,
  };
}

describe('BSC protected contract deployment identity', () => {
  for (const alias of [
    'TOKEN',
    'MARKETPLACE',
    'BRIDGE',
    'CUKIE_MASTER_NFT_VAULT',
    'CUKIE_POOL_NFT_VAULT',
  ]) {
    it(`accepts only the configured successful deployment receipt for ${alias}`, () => {
      const input = {
        alias,
        address: contractAddress.toUpperCase(),
        deploymentBlock: 123,
        deploymentTxHash: deploymentTxHash.toUpperCase(),
        receipt: validReceipt(),
      };

      assert.doesNotThrow(() => assertBscDeploymentReceiptIdentity(input));
      assert.throws(() => assertBscDeploymentReceiptIdentity({
        ...input,
        receipt: { ...validReceipt(), status: 'reverted' },
      }), /receipt de despliegue/);
      assert.throws(() => assertBscDeploymentReceiptIdentity({
        ...input,
        receipt: { ...validReceipt(), contractAddress: otherAddress },
      }), /receipt de despliegue/);
      assert.throws(() => assertBscDeploymentReceiptIdentity({
        ...input,
        receipt: { ...validReceipt(), blockNumber: 124n },
      }), /receipt de despliegue/);
      assert.throws(() => assertBscDeploymentReceiptIdentity({
        ...input,
        receipt: { ...validReceipt(), transactionHash: otherTxHash },
      }), /receipt de despliegue/);
    });
  }
});
