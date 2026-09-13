import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
} from 'viem';

import { isMissingTokenOwnerOfError } from './bsc-destination.js';

const ownerOfAbi = [{
  type: 'function',
  name: 'ownerOf',
  stateMutability: 'view',
  inputs: [{ name: 'tokenId', type: 'uint256' }],
  outputs: [{ name: '', type: 'address' }],
}] as const;

function wrappedRevert(message: string) {
  const cause = new ContractFunctionRevertedError({
    functionName: 'ownerOf',
    message,
  });
  return new ContractFunctionExecutionError(cause, {
    abi: ownerOfAbi,
    args: [1n],
    contractAddress: '0x0000000000000000000000000000000000000001',
    functionName: 'ownerOf',
  });
}

describe('BSC token existence probe', () => {
  it('treats the legacy nonexistent-token revert as absence', () => {
    assert.equal(
      isMissingTokenOwnerOfError(
        wrappedRevert('TRC721: owner query for nonexistent token'),
      ),
      true,
    );
  });

  it('does not treat a generic revert as absence', () => {
    assert.equal(
      isMissingTokenOwnerOfError(wrappedRevert('execution reverted')),
      false,
    );
  });

  it('does not treat transport errors as absence', () => {
    assert.equal(
      isMissingTokenOwnerOfError(new Error('temporary RPC failure')),
      false,
    );
  });
});
