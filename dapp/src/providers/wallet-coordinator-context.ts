import { createContext, useContext } from 'react';
import type { Connector } from 'wagmi';

export type { Connector } from 'wagmi';

export type WalletKind = 'evm' | 'tron';
export type WalletDialogKind = WalletKind | 'any';

export type WalletRequest = {
  kind: WalletKind;
  targetChainId?: 56 | 97;
  targetTronNetwork?: 'mainnet';
  reason: string;
};

export type WalletReady = {
  kind: WalletKind;
  address: string;
  chainId?: number;
  tronChainId?: string | null;
  network?: 'mainnet' | 'shasta' | 'nile' | 'unknown';
};

export type EvmWalletSlot = {
  address?: string;
  chainId?: number;
  isConnected: boolean;
  isConnecting: boolean;
  connector: Connector | undefined;
  error: Error | null;
};

export type TronWalletSlot = {
  address: string | null;
  chainId: string | null;
  network: 'mainnet' | 'shasta' | 'nile' | 'unknown';
  rpcHost: string | null;
  isInstalled: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
};

export type WalletCoordinatorContextValue = {
  evm: EvmWalletSlot;
  tron: TronWalletSlot;
  requestWallet: (request: WalletRequest) => Promise<WalletReady>;
  openWalletSelector: (kind?: WalletDialogKind, reason?: string) => void;
  closeWalletSelector: () => void;
  walletDialogOpen: boolean;
  walletDialogKind: WalletDialogKind;
  walletDialogReason: string | null;
  walletDialogError: string | null;
  selectEvmConnector: (connector: Connector) => Promise<void>;
  selectTronLink: () => Promise<void>;
  disconnectWallet: (kind: WalletKind) => void;
};

export const FALLBACK_COORDINATOR: WalletCoordinatorContextValue = {
  evm: {
    address: undefined,
    chainId: undefined,
    isConnected: false,
    isConnecting: false,
    connector: undefined,
    error: null,
  },
  tron: {
    address: null,
    chainId: null,
    network: 'unknown',
    rpcHost: null,
    isInstalled: false,
    isConnected: false,
    isConnecting: false,
    error: null,
  },
  requestWallet: async () => {
    throw new Error('WALLET_COORDINATOR_UNAVAILABLE');
  },
  openWalletSelector: () => undefined,
  closeWalletSelector: () => undefined,
  walletDialogOpen: false,
  walletDialogKind: 'any',
  walletDialogReason: null,
  walletDialogError: null,
  selectEvmConnector: async () => undefined,
  selectTronLink: async () => undefined,
  disconnectWallet: () => undefined,
};

export const WalletCoordinatorContext = createContext<WalletCoordinatorContextValue | null>(null);

export function useWalletCoordinator() {
  return useContext(WalletCoordinatorContext) ?? FALLBACK_COORDINATOR;
}
