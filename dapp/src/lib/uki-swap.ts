import { formatUnits, type Address } from 'viem';

export const PANCAKE_V2_ROUTER_BY_CHAIN = Object.freeze({
  56: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
  97: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1',
} satisfies Record<number, Address>);

export const BSC_MAINNET_SWAP_TOKENS = Object.freeze({
  asm: '0x707F0f4a39a4a26239F7D00463B15AB5656861f9',
  usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  usdt: '0x55d398326f99059fF775485246999027B3197955',
  uki: '0x51646bc7A6359f88A79FDC8d7ACB735f1AbF67fA',
  wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
} satisfies Record<string, Address>);

export const pancakeV2RouterAbi = [
  {
    type: 'function',
    name: 'getAmountsOut',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'getAmountsIn',
    stateMutability: 'view',
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'swapExactETHForTokens',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'swapExactTokensForTokens',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'swapETHForExactTokens',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'swapTokensForExactTokens',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'amountInMax', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const;

export type UkiSwapSourceSymbol = 'BNB' | 'USDT' | 'USDC' | 'ASM';

export type UkiSwapSource = {
  symbol: UkiSwapSourceSymbol;
  isNative: boolean;
  tokenAddress?: Address;
  path: readonly Address[];
};

export type UkiSwapConfig = {
  chainId: 56 | 97;
  routerAddress: Address;
  sources: readonly UkiSwapSource[];
};

export function buildUkiSwapConfig({
  chainId,
  asmAddress,
  ukiAddress,
}: {
  chainId: number;
  asmAddress: Address;
  ukiAddress: Address;
}): UkiSwapConfig | null {
  if (chainId === 56) {
    const { usdc, usdt, wbnb } = BSC_MAINNET_SWAP_TOKENS;

    return {
      chainId,
      routerAddress: PANCAKE_V2_ROUTER_BY_CHAIN[chainId],
      sources: [
        {
          symbol: 'BNB',
          isNative: true,
          path: [wbnb, usdt, asmAddress, ukiAddress],
        },
        {
          symbol: 'USDT',
          isNative: false,
          tokenAddress: usdt,
          path: [usdt, asmAddress, ukiAddress],
        },
        {
          symbol: 'USDC',
          isNative: false,
          tokenAddress: usdc,
          path: [usdc, usdt, asmAddress, ukiAddress],
        },
        {
          symbol: 'ASM',
          isNative: false,
          tokenAddress: asmAddress,
          path: [asmAddress, ukiAddress],
        },
      ],
    };
  }

  if (chainId === 97) {
    return {
      chainId,
      routerAddress: PANCAKE_V2_ROUTER_BY_CHAIN[chainId],
      sources: [
        {
          symbol: 'ASM',
          isNative: false,
          tokenAddress: asmAddress,
          path: [asmAddress, ukiAddress],
        },
      ],
    };
  }

  return null;
}

export function applySlippageBps(amount: bigint, slippageBps: number) {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new Error('El slippage debe expresarse en puntos básicos entre 0 y 9.999.');
  }

  return (amount * BigInt(10_000 - slippageBps)) / BigInt(10_000);
}

export function applyMaximumSlippageBps(amount: bigint, slippageBps: number) {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new Error('El slippage debe expresarse en puntos básicos entre 0 y 9.999.');
  }

  const numerator = amount * BigInt(10_000 + slippageBps);
  return (numerator + BigInt(9_999)) / BigInt(10_000);
}

export function createSwapDeadline(nowMs = Date.now(), ttlMinutes = 20) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    throw new Error('No se puede calcular el límite temporal de la operación.');
  }

  return BigInt(Math.floor(nowMs / 1_000) + Math.floor(ttlMinutes * 60));
}

export function formatSwapAmount(amount: bigint | undefined, maximumDecimals = 6) {
  if (amount === undefined) return '—';

  const [integer, decimals = ''] = formatUnits(amount, 18).split('.');
  const visibleDecimals = decimals.slice(0, maximumDecimals).replace(/0+$/, '');
  const integerLabel = BigInt(integer).toLocaleString('es-ES');

  return visibleDecimals ? `${integerLabel},${visibleDecimals}` : integerLabel;
}

export function formatEditableSwapAmount(amount: bigint | undefined, maximumDecimals = 8) {
  if (amount === undefined) return '';

  const [integer, decimals = ''] = formatUnits(amount, 18).split('.');
  const visibleDecimals = decimals.slice(0, maximumDecimals).replace(/0+$/, '');
  return visibleDecimals ? `${integer}.${visibleDecimals}` : integer;
}
