'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useDisconnect, useSignMessage, type Connector } from 'wagmi';
import { User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useTronLink } from '@/hooks/use-tronlink';
import { resolveTronWeb } from '@/lib/tronlink-provider';

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isWaitingForApproval: boolean;
  walletType: 'evm' | 'tron' | null;
  fetchUser: (walletAddress?: string, options?: FetchUserOptions) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type LoginWalletType = 'evm' | 'tron';
type FetchUserOptions = {
  promptForSignature?: boolean;
  walletType?: LoginWalletType;
  evmConnector?: Connector;
  requireSignedWallet?: boolean;
};

function isUserRejectedRequest(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as { code?: number | string; message?: string };
  const message = record.message?.toLowerCase() || '';

  return (
    record.code === 4001 ||
    record.code === 'ACTION_REJECTED' ||
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('rejected') ||
    message.includes('cancelled') ||
    message.includes('canceled')
  );
}

function walletAddressesEqual(walletType: LoginWalletType, left?: string | null, right?: string | null) {
  if (!left || !right) return false;
  return walletType === 'evm'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

async function signTronLoginMessage(message: string) {
  const tronWeb = resolveTronWeb();

  if (!tronWeb?.toHex || !tronWeb?.trx?.sign) {
    throw new Error('No TronLink signing provider is available');
  }

  return tronWeb.trx.sign(tronWeb.toHex(message)) as Promise<string>;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWaitingForApproval, setIsWaitingForApproval] = useState(false);
  const [walletType, setWalletType] = useState<'evm' | 'tron' | null>(null);
  const [primaryWalletInvalidated, setPrimaryWalletInvalidated] = useState(false);

  // EVM wallets (MetaMask, etc.)
  const { address: evmAddress, connector: activeEvmConnector, isConnected: isEvmConnected } = useAccount();
  const { disconnect: disconnectEvm } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  // TronLink
  const { address: tronAddress, isConnected: isTronConnected, disconnect: disconnectTron } = useTronLink();

  const { toast } = useToast();
  const hasObservedWalletStateRef = useRef(false);
  const initialRestorePendingRef = useRef(true);
  const previousAddressRef = useRef<string | undefined>(undefined);
  const authGenerationRef = useRef(0);
  const explicitSelectionRef = useRef<{ address: string; walletType: LoginWalletType } | null>(null);
  const walletSlotsRef = useRef({
    evmAddress,
    isEvmConnected,
    tronAddress,
    isTronConnected,
    evmRevision: 0,
    tronRevision: 0,
  });

  // The authenticated wallet is the primary identity. A secondary connection must
  // remain visible to operations without replacing this session.
  const currentAddress = walletType === 'tron'
    ? (isTronConnected ? tronAddress : null)
    : walletType === 'evm'
      ? (isEvmConnected ? evmAddress : null)
      : primaryWalletInvalidated
        ? null
        : (isEvmConnected ? evmAddress : (isTronConnected ? tronAddress : null));
  const isConnected = isEvmConnected || isTronConnected;

  const previousWalletSlots = walletSlotsRef.current;
  const evmSlotChanged = previousWalletSlots.evmAddress !== evmAddress
    || previousWalletSlots.isEvmConnected !== isEvmConnected;
  const tronSlotChanged = previousWalletSlots.tronAddress !== tronAddress
    || previousWalletSlots.isTronConnected !== isTronConnected;
  walletSlotsRef.current = {
    evmAddress,
    isEvmConnected,
    tronAddress,
    isTronConnected,
    evmRevision: previousWalletSlots.evmRevision + (evmSlotChanged ? 1 : 0),
    tronRevision: previousWalletSlots.tronRevision + (tronSlotChanged ? 1 : 0),
  };

  const fetchUser = useCallback(async (walletAddress?: string, options: FetchUserOptions = {}) => {
    const addressToUse = walletAddress || currentAddress;
    const loginWalletType: LoginWalletType = options.walletType || walletType || (isEvmConnected ? 'evm' : 'tron');
    const shouldPromptForSignature = Boolean(options.promptForSignature);
    const requireSignedWallet = options.requireSignedWallet === true;
    const generation = ++authGenerationRef.current;
    const startedSlotAddress = loginWalletType === 'evm'
      ? walletSlotsRef.current.evmAddress
      : walletSlotsRef.current.tronAddress;
    const startedSlotRevision = loginWalletType === 'evm'
      ? walletSlotsRef.current.evmRevision
      : walletSlotsRef.current.tronRevision;
    const isCurrentRequest = () => {
      if (authGenerationRef.current !== generation) return false;
      const slotRevision = loginWalletType === 'evm'
        ? walletSlotsRef.current.evmRevision
        : walletSlotsRef.current.tronRevision;
      if (slotRevision !== startedSlotRevision) return false;
      const slotAddress = loginWalletType === 'evm'
        ? walletSlotsRef.current.evmAddress
        : walletSlotsRef.current.tronAddress;
      if (startedSlotAddress && !walletAddressesEqual(loginWalletType, startedSlotAddress, slotAddress)) return false;
      if (slotAddress && !walletAddressesEqual(loginWalletType, addressToUse, slotAddress)) return false;
      return true;
    };

    if (walletAddress || shouldPromptForSignature) {
      initialRestorePendingRef.current = false;
      if (walletAddress && options.walletType) {
        explicitSelectionRef.current = {
          address: walletAddress,
          walletType: options.walletType,
        };
      }
    }
    const canUseWalletAddress = isConnected || Boolean(walletAddress && shouldPromptForSignature);

    if (primaryWalletInvalidated && !walletAddress && !shouldPromptForSignature) {
      if (isCurrentRequest()) {
        setUser(null);
        setIsLoading(false);
        setIsWaitingForApproval(false);
      }
      return;
    }

    if (!canUseWalletAddress || !addressToUse) {
      if (isCurrentRequest()) {
        setUser(null);
        setIsLoading(false);
        setIsWaitingForApproval(false);
      }
      return;
    }

    setIsLoading(true);
    setIsWaitingForApproval(false); // Reset waiting state when connection is successful
    let didRequestSignature = false;
    try {
      let response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: addressToUse,
          ...(requireSignedWallet
            ? { walletType: loginWalletType, requireSignedWallet: true }
            : {}),
        }),
      });

      if (response.status === 401) {
        if (!isCurrentRequest()) return;
        if (!shouldPromptForSignature) {
          setUser(null);
          setPrimaryWalletInvalidated(true);
          return;
        }

        const challengeResponse = await fetch('/api/auth/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: addressToUse,
            walletType: loginWalletType,
          }),
        });

        if (!challengeResponse.ok) {
          throw new Error('Could not create wallet challenge');
        }

        const challenge = await challengeResponse.json();
        if (!isCurrentRequest()) return;
        setIsWaitingForApproval(true);
        didRequestSignature = true;
        const signature =
          loginWalletType === 'evm'
            ? await signMessageAsync({
                account: addressToUse as `0x${string}`,
                connector: options.evmConnector ?? activeEvmConnector,
                message: challenge.message,
              })
            : await signTronLoginMessage(challenge.message);

        if (!isCurrentRequest()) return;
        response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: addressToUse,
            walletType: loginWalletType,
            message: challenge.message,
            signature,
            ...(requireSignedWallet ? { requireSignedWallet: true } : {}),
          }),
        });
      }

      if (!response.ok) throw new Error('Login failed');

      const userData = await response.json();
      if (!isCurrentRequest()) return;
      setUser(userData);
      setWalletType(loginWalletType);
      setPrimaryWalletInvalidated(false);
      if (
        explicitSelectionRef.current
        && walletAddressesEqual(loginWalletType, explicitSelectionRef.current.address, addressToUse)
        && explicitSelectionRef.current.walletType === loginWalletType
        && walletAddressesEqual(loginWalletType, addressToUse, currentAddress)
      ) {
        explicitSelectionRef.current = null;
      }

      // Show success toast if we were waiting for approval
      if (didRequestSignature) {
        toast({
          title: "Wallet Connected",
          description: `Successfully connected to ${addressToUse?.slice(0, 6)}...${addressToUse?.slice(-4)}`,
        });
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error(error);
      setUser(null);
      setPrimaryWalletInvalidated(true);
      explicitSelectionRef.current = null;

      const wasRejected = didRequestSignature && isUserRejectedRequest(error);

      if (!wasRejected) {
        // Disconnect only on real auth/provider errors. A rejected signature should leave
        // the wallet connected so the user can retry from the Connect Wallet button.
        if (loginWalletType === 'evm' && isEvmConnected && evmAddress?.toLowerCase() === addressToUse?.toLowerCase()) {
          disconnectEvm();
        }
        if (loginWalletType === 'tron' && isTronConnected && tronAddress === addressToUse) {
          disconnectTron();
        }
      }

      // Show error toast
      if (shouldPromptForSignature) {
        toast({
          title: wasRejected ? "Signature Cancelled" : "Connection Failed",
          description: wasRejected
            ? "Click Connect Wallet when you want to try again."
            : "Failed to verify your wallet. Please try again.",
          variant: wasRejected ? "default" : "destructive",
        });
      }
    } finally {
      if (isCurrentRequest()) {
        setIsLoading(false);
        setIsWaitingForApproval(false);
      }
    }
  }, [activeEvmConnector, currentAddress, disconnectEvm, disconnectTron, evmAddress, isConnected, isEvmConnected, isTronConnected, primaryWalletInvalidated, signMessageAsync, toast, tronAddress, walletType]);

  // Enhanced wallet change detection effect
  useEffect(() => {
    console.log('Wallet hook update:', {
      evmAddress,
      tronAddress,
      currentAddress,
      isConnected,
      previousAddress: previousAddressRef.current
    });

    // The first observed connected wallet may restore an existing session. This
    // is deliberately the only implicit login; later wallet changes require an
    // explicit selection/login from the user.
    if (!hasObservedWalletStateRef.current) {
      hasObservedWalletStateRef.current = true;
      previousAddressRef.current = currentAddress || undefined;
      if (currentAddress && !primaryWalletInvalidated) {
        initialRestorePendingRef.current = false;
      }
      void fetchUser(undefined, { promptForSignature: false });
      return;
    }

    // Detect wallet change
    const hasWalletChanged = previousAddressRef.current !== currentAddress;

    if (!hasWalletChanged) return;

    const explicitSelection = explicitSelectionRef.current;
    if (
      explicitSelection
      && currentAddress
      && walletType === explicitSelection.walletType
      && walletAddressesEqual(explicitSelection.walletType, explicitSelection.address, currentAddress)
    ) {
      previousAddressRef.current = currentAddress;
      explicitSelectionRef.current = null;
      return;
    }

    if (
      initialRestorePendingRef.current
      && !previousAddressRef.current
      && currentAddress
      && !primaryWalletInvalidated
    ) {
      initialRestorePendingRef.current = false;
      previousAddressRef.current = currentAddress;
      void fetchUser(undefined, { promptForSignature: false });
      return;
    }

    {
      console.log('🔄 Wallet change detected:', {
        previous: previousAddressRef.current,
        current: currentAddress,
        isConnected
      });

      // Clear current user state (logout)
      authGenerationRef.current += 1;
      setUser(null);
      setIsLoading(false);
      setIsWaitingForApproval(false);
      setPrimaryWalletInvalidated(true);

      // Update reference for next comparison
      previousAddressRef.current = currentAddress || undefined;
    }
  }, [evmAddress, tronAddress, currentAddress, isConnected, fetchUser, primaryWalletInvalidated, walletType]);

  // Direct wallet event listener as backup (EVM wallets)
  useEffect(() => {
    if (walletType !== 'evm' || typeof window === 'undefined' || !window.ethereum) return;
    const handleAccountsChanged = (accounts: string[]) => {
      console.log('🔄 Direct accountsChanged event:', accounts);
      console.log('Current wagmi address:', evmAddress);
      console.log('Previous address:', previousAddressRef.current);

      // Force a manual check if wagmi hasn't updated yet
      const newAddress = accounts[0]?.toLowerCase();
      if (newAddress && newAddress !== evmAddress && newAddress !== previousAddressRef.current) {
        console.log('⚠️ Direct event detected change before wagmi update');

        authGenerationRef.current += 1;

        // Wagmi will settle the connection state; this fallback only clears stale auth.
        setIsWaitingForApproval(true);

        toast({
          title: "Wallet Change Detected",
          description: "Please confirm the new wallet before continuing.",
        });

        setUser(null);
        setPrimaryWalletInvalidated(true);
        setIsLoading(false);
        setIsWaitingForApproval(false);
      }
    };

    const handleChainChanged = (chainId: string) => {
      console.log('🔗 Chain changed:', chainId);
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum?.removeListener('chainChanged', handleChainChanged);
    };
  }, [evmAddress, toast, walletType]);

  // Additional polling mechanism for more reliable wallet change detection (EVM only)
  useEffect(() => {
    if (walletType !== 'evm' || typeof window === 'undefined' || !window.ethereum) return;
    const pollWalletAccounts = async () => {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        const currentAccount = accounts[0]?.toLowerCase();

        // Only log if there's an actual change and we haven't logged it recently
        if (currentAccount && currentAccount !== evmAddress && currentAccount !== previousAddressRef.current) {
          // This will trigger the useEffect above when wagmi updates.
        }
      } catch (error) {
        // Only log errors occasionally to avoid spam
        console.error('Error polling wallet accounts:', error);
      }
    };

    // Poll every 5 seconds when connected (reduced frequency)
    let interval: NodeJS.Timeout;
    if (isEvmConnected) {
      interval = setInterval(pollWalletAccounts, 5000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [evmAddress, isEvmConnected, walletType]);

  return (
    <AuthContext.Provider value={{ user, isLoading, isWaitingForApproval, walletType, fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
