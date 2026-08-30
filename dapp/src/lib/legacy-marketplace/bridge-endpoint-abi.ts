import type { Abi } from 'viem';

export const cukiesBridgeEndpointAbi = [
  {
    type: 'function',
    name: 'bridgePrice',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'requestBridge',
    stateMutability: 'payable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'destinationOwner', type: 'bytes20' },
      { name: 'destinationNetwork', type: 'uint8' },
    ],
    outputs: [{ name: 'transferId', type: 'bytes32' }],
  },
] as const satisfies Abi;
