'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';

import { WalletConnectorDialog } from '@/components/landing/wallet-connector-dialog';
import { getVisibleWalletConnectors } from '@/lib/wallet-connectors';
import {
  WalletCoordinatorContext,
  type Connector,
  type EvmWalletSlot,
  type WalletCoordinatorContextValue,
  type WalletDialogKind,
  type WalletKind,
  type WalletReady,
  type WalletRequest,
} from '@/providers/wallet-coordinator-context';

type PendingRequest = {
  id: number;
  request: WalletRequest;
  resolve: (value: WalletReady) => void;
  reject: (reason?: unknown) => void;
};

export type {
  Connector,
  EvmWalletSlot,
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
  return message.includes('reject') || message.includes('denied') || message.includes('cancel') || message.includes('4001');
}

export function WalletCoordinatorProvider({ children }: { children: ReactNode }) {
  const { address, chainId, isConnected, connector } = useAccount();
  const { connectAsync, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [walletDialogKind, setWalletDialogKind] = useState<WalletDialogKind>('any');
  const [walletDialogReason, setWalletDialogReason] = useState<string | null>(null);
  const [walletDialogError, setWalletDialogError] = useState<string | null>(null);
  const pendingRef = useRef<PendingRequest | null>(null);
  const requestIdRef = useRef(0);
  const evmConnectors = useMemo(() => getVisibleWalletConnectors(connectors), [connectors]);
  const evm = useMemo<EvmWalletSlot>(() => ({
    address,
    chainId,
    isConnected,
    isConnecting: isConnecting || isSwitching,
    connector,
    error: null,
  }), [address, chainId, connector, isConnected, isConnecting, isSwitching]);
  const tron = useMemo(() => ({
    address: null,
    chainId: null,
    network: 'unknown' as const,
    rpcHost: null,
    isInstalled: false,
    isConnected: false,
    isConnecting: false,
    error: null,
  }), []);

  const isCurrent = useCallback((pending: PendingRequest | null) => (
    Boolean(pending && pendingRef.current?.id === pending.id)
  ), []);
  const settle = useCallback((pending: PendingRequest, ready: WalletReady) => {
    if (!isCurrent(pending)) return;
    pending.resolve(ready);
    pendingRef.current = null;
    setWalletDialogOpen(false);
    setWalletDialogError(null);
  }, [isCurrent]);
  const reject = useCallback((pending: PendingRequest | null, reason: unknown) => {
    if (!pending || !isCurrent(pending)) return;
    pending.reject(reason);
    pendingRef.current = null;
    setWalletDialogOpen(false);
    setWalletDialogError(errorMessage(reason));
  }, [isCurrent]);
  const buildReady = useCallback((request: WalletRequest): WalletReady | null => {
    if (request.kind !== 'evm' || !address || !isConnected) return null;
    if (request.targetChainId !== undefined && chainId !== request.targetChainId) return null;
    return { kind: 'evm', address, chainId };
  }, [address, chainId, isConnected]);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    const ready = buildReady(pending.request);
    if (ready) settle(pending, ready);
  }, [address, chainId, buildReady, isConnected, settle]);

  useEffect(() => () => {
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      pending.reject(new Error('WALLET_REQUEST_CANCELLED'));
    }
  }, []);

  const requestWallet = useCallback((request: WalletRequest) => {
    const ready = buildReady(request);
    if (ready) return Promise.resolve(ready);
    if (request.kind !== 'evm') return Promise.reject(new Error('TRON_WALLET_UNAVAILABLE'));

    if (pendingRef.current) reject(pendingRef.current, new Error('WALLET_REQUEST_REPLACED'));
    const promise = new Promise<WalletReady>((resolve, rejectPromise) => {
      pendingRef.current = {
        id: ++requestIdRef.current,
        request,
        resolve,
        reject: rejectPromise,
      };
    });
    const pending = pendingRef.current;
    if (!pending) return promise;
    setWalletDialogKind('evm');
    setWalletDialogReason(request.reason);
    setWalletDialogError(null);
    if (isConnected && request.targetChainId !== undefined && chainId !== request.targetChainId) {
      void (async () => {
        try {
          await switchChainAsync({ chainId: request.targetChainId! });
          if (address && isCurrent(pending)) {
            settle(pending, { kind: 'evm', address, chainId: request.targetChainId });
          }
        } catch (error) {
          reject(pending, new Error(isRejected(error) ? 'Cambio de red cancelado en la wallet.' : errorMessage(error)));
        }
      })();
    } else {
      setWalletDialogOpen(true);
    }
    return promise;
  }, [address, buildReady, chainId, isConnected, isCurrent, reject, settle, switchChainAsync]);

  const selectEvmConnector = useCallback(async (selectedConnector: Connector) => {
    const pending = pendingRef.current;
    try {
      const targetChainId = pending?.request.targetChainId;
      const result = await connectAsync({ connector: selectedConnector, ...(targetChainId ? { chainId: targetChainId } : {}) });
      if (pending && !isCurrent(pending)) return;
      if (targetChainId !== undefined && result.chainId !== targetChainId) {
        await switchChainAsync({ chainId: targetChainId });
      }
      const connectedAddress = result.accounts?.[0] ?? address;
      if (pending && connectedAddress && isCurrent(pending)) {
        settle(pending, { kind: 'evm', address: connectedAddress, chainId: targetChainId ?? result.chainId });
      } else if (!pending) {
        setWalletDialogOpen(false);
      }
    } catch (error) {
      reject(pending, new Error(isRejected(error) ? 'Conexión o cambio de red cancelado en la wallet.' : errorMessage(error)));
    }
  }, [address, connectAsync, isCurrent, reject, settle, switchChainAsync]);

  const openWalletSelector = useCallback((kind: WalletDialogKind = 'any', reason?: string) => {
    setWalletDialogKind(kind);
    setWalletDialogReason(reason ?? null);
    setWalletDialogError(null);
    setWalletDialogOpen(true);
  }, []);
  const closeWalletSelector = useCallback(() => {
    if (pendingRef.current) reject(pendingRef.current, new Error('WALLET_REQUEST_CANCELLED'));
    else setWalletDialogOpen(false);
  }, [reject]);
  const disconnectWallet = useCallback((kind: WalletKind) => {
    if (kind === 'evm') disconnect();
  }, [disconnect]);
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
    selectTronLink: async () => { throw new Error('TRON_WALLET_UNAVAILABLE'); },
    disconnectWallet,
  }), [closeWalletSelector, disconnectWallet, evm, openWalletSelector, requestWallet, selectEvmConnector, tron, walletDialogError, walletDialogKind, walletDialogOpen, walletDialogReason]);

  return (
    <WalletCoordinatorContext.Provider value={value}>
      {children}
      <WalletConnectorDialog
        open={walletDialogOpen}
        onOpenChange={(open) => { if (open) setWalletDialogOpen(true); else closeWalletSelector(); }}
        connectors={evmConnectors}
        onSelectConnector={selectEvmConnector}
        isConnecting={isConnecting || isSwitching}
        title="Conectar wallet EVM"
        description={walletDialogReason ?? 'Elige la wallet que quieres usar para continuar.'}
        tronLinkNative={undefined}
      />
    </WalletCoordinatorContext.Provider>
  );
}
