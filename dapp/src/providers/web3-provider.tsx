'use client';

import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { defineChain } from 'viem';
import { coinbaseWallet, injected, metaMask, walletConnect } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  findSafePalEvmProvider,
  findTokenPocketEvmProvider,
  findTronLinkEvmProvider,
  findTrustWalletEvmProvider,
  SAFEPAL_EVM_CONNECTOR_ID,
  TOKENPOCKET_EVM_CONNECTOR_ID,
  TRONLINK_EVM_CONNECTOR_ID,
  TRUST_WALLET_EVM_CONNECTOR_ID,
} from '@/lib/wallet-connectors';

const queryClient = new QueryClient();
const BSC_RPC_URL = 'https://bsc-dataseed1.binance.org';
const BSC_TESTNET_RPC_URL = 'https://data-seed-prebsc-1-s1.binance.org:8545';

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
      http: [BSC_RPC_URL],
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
      http: [BSC_TESTNET_RPC_URL],
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
  injected({
    target: {
      id: SAFEPAL_EVM_CONNECTOR_ID,
      name: 'SafePal',
      provider: findSafePalEvmProvider,
    },
    unstable_shimAsyncInject: 1_000,
  }),
  injected({
    target: {
      id: TRUST_WALLET_EVM_CONNECTOR_ID,
      name: 'Trust Wallet',
      provider: findTrustWalletEvmProvider,
    },
    unstable_shimAsyncInject: 1_000,
  }),
  metaMask({
    dappMetadata: {
      name: 'Cukies World',
      url: siteUrl,
      iconUrl: appIconUrl,
    },
  }),
  injected({
    target: {
      id: TOKENPOCKET_EVM_CONNECTOR_ID,
      name: 'TokenPocket',
      provider: findTokenPocketEvmProvider,
    },
    unstable_shimAsyncInject: 1_000,
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
    [bsc.id]: http(BSC_RPC_URL),
    [bscTestnet.id]: http(BSC_TESTNET_RPC_URL),
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
