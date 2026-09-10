'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from 'wagmi';

import { WalletConnectorDialog } from '@/components/landing/wallet-connector-dialog';
import { getVisibleWalletConnectors } from '@/lib/wallet-connectors';
import {
  TRON_MAINNET_CHAIN_ID,
  resolveTronProvider,
  resolveTronChainId,
  tronNetworkFromChainId,
} from '@/lib/tronlink-provider';
import { useTronLink } from '@/hooks/use-tronlink';
import {
  WalletCoordinatorContext,
  type Connector,
  type WalletCoordinatorContextValue,
  type WalletDialogKind,
  type WalletKind,
  type WalletReady,
  type WalletRequest,
  type EvmWalletSlot,
  type TronWalletSlot,
} from '@/providers/wallet-coordinator-context';

type PendingRequest = {
  request: WalletRequest;
  resolve: (value: WalletReady) => void;
  reject: (reason?: unknown) => void;
};

export type {
  Connector,
  EvmWalletSlot,
  TronWalletSlot,
  WalletCoordinatorContextValue,
  WalletDialogKind,
  WalletKind,
  WalletReady,
  WalletRequest,
} from '@/providers/wallet-coordinator-context';

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'No se pudo preparar la wallet. Revisa la conexión e inténtalo de nuevo.';
}

function isRejected(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return message.includes('reject')
    || message.includes('denied')
    || message.includes('cancel')
    || message.includes('4001');
}

function sameRequest(left: WalletRequest, right: WalletRequest) {
  return left.kind === right.kind
    && left.targetChainId === right.targetChainId
    && left.targetTronNetwork === right.targetTronNetwork;
}

export function WalletCoordinatorProvider({ children }: { children: ReactNode }) {
  const { address, chainId, isConnected, connector } = useAccount();
  const { connectAsync, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const {
    address: tronAddress,
    chainId: tronChainId,
    network: tronStateNetwork,
    rpcHost: tronRpcHost,
    isInstalled: tronIsInstalled,
    isConnected: tronIsConnected,
    isLoading: tronIsLoading,
    error: tronError,
    connect: connectTronLink,
    disconnect: disconnectTronLink,
  } = useTronLink();
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [walletDialogKind, setWalletDialogKind] = useState<WalletDialogKind>('any');
  const [walletDialogReason, setWalletDialogReason] = useState<string | null>(null);
  const [walletDialogError, setWalletDialogError] = useState<string | null>(null);
  const pendingRequestRef = useRef<PendingRequest | null>(null);

  const evmConnectors = useMemo(() => getVisibleWalletConnectors(connectors), [connectors]);
  const evm = useMemo<EvmWalletSlot>(() => ({
    address,
    chainId,
    isConnected,
    isConnecting: isConnecting || isSwitching,
    connector,
    error: null,
  }), [address, chainId, connector, isConnected, isConnecting, isSwitching]);
  const tron = useMemo<TronWalletSlot>(() => ({
    address: tronAddress,
    chainId: tronChainId,
    network: tronStateNetwork,
    rpcHost: tronRpcHost,
    isInstalled: tronIsInstalled,
    isConnected: tronIsConnected,
    isConnecting: tronIsLoading,
    error: tronError,
  }), [tronAddress, tronChainId, tronError, tronIsConnected, tronIsInstalled, tronIsLoading, tronRpcHost, tronStateNetwork]);

  const buildReady = useCallback((request: WalletRequest): WalletReady | null => {
    if (request.kind === 'evm') {
      if (!address || !isConnected) return null;
      if (request.targetChainId !== undefined && chainId !== request.targetChainId) return null;
      return { kind: 'evm', address, chainId };
    }
    if (!tronAddress || !tronIsConnected) return null;
    const currentChainId = tronChainId ?? resolveTronChainId();
    if (request.targetTronNetwork === 'mainnet' && currentChainId !== TRON_MAINNET_CHAIN_ID) return null;
    return {
      kind: 'tron',
      address: tronAddress,
      tronChainId: currentChainId,
      network: tronNetworkFromChainId(currentChainId),
    };
  }, [address, chainId, isConnected, tronAddress, tronChainId, tronIsConnected]);

  const settlePending = useCallback((ready: WalletReady) => {
    pendingRequestRef.current?.resolve(ready);
    pendingRequestRef.current = null;
    setWalletDialogOpen(false);
    setWalletDialogError(null);
  }, []);

  const rejectPending = useCallback((error: unknown) => {
    pendingRequestRef.current?.reject(error);
    pendingRequestRef.current = null;
    setWalletDialogOpen(false);
    setWalletDialogError(errorMessage(error));
  }, []);

  const switchTronToMainnet = useCallback(async () => {
    const provider = resolveTronProvider();
    if (!provider?.request) throw new Error('TRON_PROVIDER_UNAVAILABLE');
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: TRON_MAINNET_CHAIN_ID }],
    });
  }, []);

  const finishPendingIfReady = useCallback(() => {
    const pending = pendingRequestRef.current;
    if (!pending) return;
    const ready = buildReady(pending.request);
    if (ready) settlePending(ready);
  }, [buildReady, settlePending]);

  useEffect(() => {
    finishPendingIfReady();
  }, [finishPendingIfReady, address, chainId, isConnected, tronAddress, tronChainId, tronIsConnected]);

  const requestWallet = useCallback(async (request: WalletRequest) => {
    const ready = buildReady(request);
    if (ready) return ready;
    if (pendingRequestRef.current) {
      if (sameRequest(pendingRequestRef.current.request, request)) {
        return new Promise<WalletReady>((resolve, reject) => {
          const current = pendingRequestRef.current;
          if (!current) return reject(new Error('WALLET_REQUEST_CANCELLED'));
          const previousResolve = current.resolve;
          const previousReject = current.reject;
          current.resolve = (value) => {
            previousResolve(value);
            resolve(value);
          };
          current.reject = (reason) => {
            previousReject(reason);
            reject(reason);
          };
        });
      }
      rejectPending(new Error('WALLET_REQUEST_REPLACED'));
    }

    const promise = new Promise<WalletReady>((resolve, reject) => {
      pendingRequestRef.current = { request, resolve, reject };
    });
    setWalletDialogKind(request.kind);
    setWalletDialogReason(request.reason);
    setWalletDialogError(null);

    if (request.kind === 'evm' && isConnected && request.targetChainId !== undefined && chainId !== request.targetChainId) {
      try {
        await switchChainAsync({ chainId: request.targetChainId });
        const currentAddress = address;
        if (!currentAddress) throw new Error('EVM_WALLET_DISCONNECTED');
        settlePending({ kind: 'evm', address: currentAddress, chainId: request.targetChainId });
      } catch (error) {
        rejectPending(new Error(isRejected(error) ? 'Cambio de red cancelado en la wallet.' : errorMessage(error)));
      }
      return promise;
    }

    if (request.kind === 'tron' && tronIsConnected && request.targetTronNetwork === 'mainnet' && tronChainId !== TRON_MAINNET_CHAIN_ID) {
      try {
        await switchTronToMainnet();
        finishPendingIfReady();
      } catch (error) {
        rejectPending(new Error(isRejected(error) ? 'Cambio a TRON Mainnet cancelado en TronLink.' : errorMessage(error)));
      }
      return promise;
    }

    setWalletDialogOpen(true);
    return promise;
  }, [address, buildReady, chainId, finishPendingIfReady, isConnected, rejectPending, settlePending, switchChainAsync, switchTronToMainnet, tronChainId, tronIsConnected]);

  const selectEvmConnector = useCallback(async (selectedConnector: Connector) => {
    try {
      const request = pendingRequestRef.current?.request;
      const result = await connectAsync({
        connector: selectedConnector,
        ...(request?.targetChainId ? { chainId: request.targetChainId } : {}),
      });
      if (request?.targetChainId !== undefined && result.chainId !== request.targetChainId) {
        await switchChainAsync({ chainId: request.targetChainId });
      }
      const currentAddress = result.accounts?.[0] ?? address;
      if (!currentAddress) throw new Error('EVM_WALLET_DISCONNECTED');
      if (request) {
        settlePending({ kind: 'evm', address: currentAddress, chainId: request.targetChainId ?? result.chainId });
      } else {
        setWalletDialogOpen(false);
      }
    } catch (error) {
      rejectPending(new Error(isRejected(error) ? 'Conexión o cambio de red cancelado en la wallet.' : errorMessage(error)));
    }
  }, [address, connectAsync, rejectPending, settlePending, switchChainAsync]);

  const selectTronLink = useCallback(async () => {
    try {
      const request = pendingRequestRef.current?.request;
      const connectedAddress = tronIsConnected && tronAddress
        ? tronAddress
        : await connectTronLink();
      if (!connectedAddress) throw new Error(tronError ?? 'TRON_CONNECTION_FAILED');
      if (request?.targetTronNetwork === 'mainnet') {
        const chainId = tronChainId ?? resolveTronChainId();
        if (chainId !== TRON_MAINNET_CHAIN_ID) {
          await switchTronToMainnet();
        }
      }
      if (request) {
        const chainId = resolveTronChainId();
        settlePending({
          kind: 'tron',
          address: connectedAddress,
          tronChainId: chainId,
          network: tronNetworkFromChainId(chainId),
        });
      } else {
        setWalletDialogOpen(false);
      }
    } catch (error) {
      rejectPending(new Error(isRejected(error) ? 'Conexión o cambio a TRON Mainnet cancelado en TronLink.' : errorMessage(error)));
    }
  }, [connectTronLink, rejectPending, settlePending, switchTronToMainnet, tronAddress, tronChainId, tronError, tronIsConnected]);

  const openWalletSelector = useCallback((kind: WalletDialogKind = 'any', reason?: string) => {
    setWalletDialogKind(kind);
    setWalletDialogReason(reason ?? null);
    setWalletDialogError(null);
    setWalletDialogOpen(true);
  }, []);

  const closeWalletSelector = useCallback(() => {
    if (pendingRequestRef.current) rejectPending(new Error('WALLET_REQUEST_CANCELLED'));
    else setWalletDialogOpen(false);
  }, [rejectPending]);

  const disconnectWallet = useCallback((kind: WalletKind) => {
    if (kind === 'evm') disconnect();
    else disconnectTronLink();
  }, [disconnect, disconnectTronLink]);

  const value = useMemo<WalletCoordinatorContextValue>(() => ({
    evm,
    tron,
    requestWallet,
    openWalletSelector,
    closeWalletSelector,
    walletDialogOpen,
    walletDialogKind,
    walletDialogReason,
    walletDialogError,
    selectEvmConnector,
    selectTronLink,
    disconnectWallet,
  }), [closeWalletSelector, disconnectWallet, evm, openWalletSelector, requestWallet, selectEvmConnector, selectTronLink, tron, walletDialogError, walletDialogKind, walletDialogOpen, walletDialogReason]);

  return (
    <WalletCoordinatorContext.Provider value={value}>
      {children}
      <WalletConnectorDialog
        open={walletDialogOpen}
        onOpenChange={(open) => {
          if (open) setWalletDialogOpen(true);
          else closeWalletSelector();
        }}
        connectors={walletDialogKind === 'tron' ? [] : evmConnectors}
        onSelectConnector={selectEvmConnector}
        isConnecting={isConnecting || isSwitching}
        title={walletDialogKind === 'tron' ? 'Conectar wallet TRON' : 'Conectar wallet'}
        description={walletDialogReason ?? 'Elige la wallet que quieres usar para continuar.'}
        errorMessage={walletDialogError}
        tronLinkNative={walletDialogKind === 'evm' ? undefined : {
          error: tronError,
          isInstalled: tronIsInstalled,
          isLoading: tronIsLoading,
          onSelect: selectTronLink,
        }}
      />
    </WalletCoordinatorContext.Provider>
  );
}

export { useWalletCoordinator } from '@/providers/wallet-coordinator-context';
