import type { Abi } from 'viem';

export const ukiMarketplaceReadAbi = [
  {
    type: 'function',
    name: 'feeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    type: 'function',
    name: 'collectionAllowed',
    stateMutability: 'view',
    inputs: [{ name: 'collection', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'activeOrderIds',
    stateMutability: 'view',
    inputs: [
      { name: 'collection', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'orderState',
    stateMutability: 'view',
    inputs: [{ name: 'orderId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const satisfies Abi;

export const ukiMarketplaceWriteAbi = [
  {
    type: 'function',
    name: 'createOrder',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'collection', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'ukiPrice', type: 'uint256' },
      { name: 'expiresAt', type: 'uint64' },
    ],
    outputs: [{ name: 'orderId', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'cancelOrder',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'orderId', type: 'bytes32' }],
    outputs: [],
  },
] as const satisfies Abi;

export const ukiMarketplaceNftReadAbi = [
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getApproved',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'isApprovedForAll',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
] as const satisfies Abi;
