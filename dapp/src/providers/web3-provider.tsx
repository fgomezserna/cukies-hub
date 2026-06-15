'use client';

import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { defineChain } from 'viem';
import { coinbaseWallet, injected, metaMask, walletConnect } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { findTronLinkEvmProvider, TRONLINK_EVM_CONNECTOR_ID } from '@/lib/wallet-connectors';

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

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cukies.world';
const appIconUrl = `${siteUrl.replace(/\/$/, '')}/Cukie_logo_first.png`;

const connectors = [
  metaMask({
    dappMetadata: {
      name: 'Cukies World',
      url: siteUrl,
      iconUrl: appIconUrl,
    },
  }),
  injected({ unstable_shimAsyncInject: 1_000 }),
  injected({
    target: {
      id: TRONLINK_EVM_CONNECTOR_ID,
      name: 'TronLink EVM',
      provider: findTronLinkEvmProvider,
    },
    unstable_shimAsyncInject: 1_000,
  }),
  coinbaseWallet({
    appName: 'Cukies World',
    appLogoUrl: appIconUrl,
    preference: 'all',
  }),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
          metadata: {
            name: 'Cukies World',
            description: 'Cukies World dapp',
            url: siteUrl,
            icons: [appIconUrl],
          },
        }),
      ]
    : []),
];

export const config = createConfig({
  chains: [bsc, bscTestnet, mainnet, sepolia],
  connectors,
  ssr: true,
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
