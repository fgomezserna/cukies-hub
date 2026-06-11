import { z } from 'zod';

export const presaleAbi = [
  {
    type: 'function',
    name: 'asmToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'vestingVault',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'treasury',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'saleStart',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'saleEnd',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'ukiPerAsm',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'minAsmPerPurchase',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalUkiForSale',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalAsmRaised',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalUkiSold',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'asmPurchased',
    stateMutability: 'view',
    inputs: [{ name: 'buyer', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'ukiPurchased',
    stateMutability: 'view',
    inputs: [{ name: 'buyer', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'quoteUki',
    stateMutability: 'view',
    inputs: [{ name: 'asmAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isOpen',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'saleEnabled',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'buy',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'asmAmount', type: 'uint256' }],
    outputs: [{ name: 'ukiAmount', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Purchased',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'asmAmount', type: 'uint256', indexed: false },
      { name: 'ukiAmount', type: 'uint256', indexed: false },
      { name: 'totalBuyerAsm', type: 'uint256', indexed: false },
      { name: 'totalBuyerUki', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const erc20Abi = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const vestingVaultAbi = [
  {
    type: 'function',
    name: 'PRESALE_SCHEDULE_ID',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'totalAllocated',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalReleased',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'unallocatedBalance',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'presaleVestingStart',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'presaleVestingDuration',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'presaleVestingConfigFrozen',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'scheduleOf',
    stateMutability: 'view',
    inputs: [{ name: 'beneficiary', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'totalAmount', type: 'uint128' },
          { name: 'releasedAmount', type: 'uint128' },
          { name: 'start', type: 'uint64' },
          { name: 'cliff', type: 'uint64' },
          { name: 'duration', type: 'uint64' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'releasable',
    stateMutability: 'view',
    inputs: [{ name: 'beneficiary', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'release',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'releaseAll',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ name: 'totalAmount', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'createVestingWithCliff',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'beneficiary', type: 'address' },
      { name: 'scheduleId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
      { name: 'start', type: 'uint64' },
      { name: 'cliff', type: 'uint64' },
      { name: 'duration', type: 'uint64' },
    ],
    outputs: [],
  },
] as const;

const envSchema = z.object({
  NEXT_PUBLIC_UKI_CHAIN_ID: z.coerce.number().default(56),
  NEXT_PUBLIC_ASM_TOKEN_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_UKI_TOKEN_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_UKI_PRESALE_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_BSCSCAN_BASE_URL: z.string().url().default('https://bscscan.com'),
});

const env = envSchema.parse({
  NEXT_PUBLIC_UKI_CHAIN_ID: process.env.NEXT_PUBLIC_UKI_CHAIN_ID,
  NEXT_PUBLIC_ASM_TOKEN_ADDRESS: process.env.NEXT_PUBLIC_ASM_TOKEN_ADDRESS,
  NEXT_PUBLIC_UKI_TOKEN_ADDRESS: process.env.NEXT_PUBLIC_UKI_TOKEN_ADDRESS,
  NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS: process.env.NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS,
  NEXT_PUBLIC_UKI_PRESALE_ADDRESS: process.env.NEXT_PUBLIC_UKI_PRESALE_ADDRESS,
  NEXT_PUBLIC_BSCSCAN_BASE_URL: process.env.NEXT_PUBLIC_BSCSCAN_BASE_URL,
});

export const ukiSaleContracts = {
  chainId: env.NEXT_PUBLIC_UKI_CHAIN_ID,
  asmTokenAddress: env.NEXT_PUBLIC_ASM_TOKEN_ADDRESS,
  ukiTokenAddress: env.NEXT_PUBLIC_UKI_TOKEN_ADDRESS,
  vestingVaultAddress: env.NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS,
  presaleAddress: env.NEXT_PUBLIC_UKI_PRESALE_ADDRESS,
  blockExplorerBaseUrl: env.NEXT_PUBLIC_BSCSCAN_BASE_URL,
} as const;

export function getBscScanTxUrl(txHash: string) {
  return `${ukiSaleContracts.blockExplorerBaseUrl.replace(/\/$/, '')}/tx/${txHash}`;
}
