'use client';

import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { defineChain } from 'viem';
import { injected } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

// Binance Smart Chain Mainnet
const bsc = defineChain({
  id: 56,
  name: 'BNB Smart Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'BNB',
    symbol: 'BNB',
  },
  rpcUrls: {
    default: {
      http: ['https://bsc-dataseed1.binance.org'],
    },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://bscscan.com' },
  },
});

// Binance Smart Chain Testnet
const bscTestnet = defineChain({
  id: 97,
  name: 'BNB Smart Chain Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'BNB',
    symbol: 'BNB',
  },
  rpcUrls: {
    default: {
      http: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
    },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://testnet.bscscan.com' },
  },
});

export const config = createConfig({
  chains: [bsc, bscTestnet, mainnet, sepolia],
  connectors: [
    injected(),
  ],
  transports: {
    [bsc.id]: http(),
    [bscTestnet.id]: http(),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
} 