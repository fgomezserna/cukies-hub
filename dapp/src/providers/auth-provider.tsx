'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useDisconnect, useConnect } from 'wagmi';
import { User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useTronLink } from '@/hooks/use-tronlink';

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isWaitingForApproval: boolean;
  walletType: 'evm' | 'tron' | null;
  fetchUser: () => void; // Function to allow components to trigger a refetch
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type LoginWalletType = 'evm' | 'tron';

function getBrowserTronWeb() {
  if (typeof window === 'undefined') return null;
  return window.tronWeb ?? window.tronLink?.tronWeb ?? window.tron?.tronWeb ?? null;
}

async function signEvmLoginMessage(message: string, walletAddress: string) {
  const ethereum = (window as any).ethereum;

  if (!ethereum?.request) {
    throw new Error('No EVM wallet provider is available');
  }

  return ethereum.request({
    method: 'personal_sign',
    params: [message, walletAddress],
  }) as Promise<string>;
}

async function signTronLoginMessage(message: string) {
  const tronWeb = getBrowserTronWeb();

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

  // EVM wallets (MetaMask, etc.)
  const { address: evmAddress, isConnected: isEvmConnected } = useAccount();
  const { disconnect: disconnectEvm } = useDisconnect();
  const { connect: connectEvm, connectors } = useConnect();

  // TronLink
  const { address: tronAddress, isConnected: isTronConnected, connect: connectTron, disconnect: disconnectTron } = useTronLink();

  const { toast } = useToast();
  const previousAddressRef = useRef<string | undefined>(evmAddress || tronAddress || undefined);

  // Determine current wallet address and type
  const currentAddress = isEvmConnected ? evmAddress : (isTronConnected ? tronAddress : null);
  const isConnected = isEvmConnected || isTronConnected;

  const fetchUser = useCallback(async (walletAddress?: string) => {
    const addressToUse = walletAddress || currentAddress;
    const loginWalletType: LoginWalletType = isEvmConnected ? 'evm' : 'tron';

    if (!isConnected || !addressToUse) {
        setUser(null);
        setIsLoading(false);
        setIsWaitingForApproval(false);
        setWalletType(null);
        return;
    }

    setIsLoading(true);
    setIsWaitingForApproval(false); // Reset waiting state when connection is successful
    let didRequestSignature = false;
    try {
      let response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: addressToUse }),
      });

      if (response.status === 401) {
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
        setIsWaitingForApproval(true);
        didRequestSignature = true;
        const signature =
          loginWalletType === 'evm'
            ? await signEvmLoginMessage(challenge.message, addressToUse)
            : await signTronLoginMessage(challenge.message);

        response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: addressToUse,
            walletType: loginWalletType,
            message: challenge.message,
            signature,
          }),
        });
      }

      if (!response.ok) throw new Error('Login failed');

      const userData = await response.json();
      setUser(userData);
      setWalletType(loginWalletType);

      // Show success toast if we were waiting for approval
      if (didRequestSignature) {
        toast({
          title: "Wallet Connected",
          description: `Successfully connected to ${addressToUse?.slice(0, 6)}...${addressToUse?.slice(-4)}`,
        });
      }
    } catch (error) {
      console.error(error);
      setUser(null);
      setWalletType(null);

      // Disconnect the appropriate wallet
      if (isEvmConnected) disconnectEvm();
      if (isTronConnected) disconnectTron();

      // Show error toast
      toast({
        title: "Connection Failed",
        description: "Failed to verify your wallet. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsWaitingForApproval(false);
    }
  }, [currentAddress, isConnected, isEvmConnected, isTronConnected, disconnectEvm, disconnectTron, toast]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Enhanced wallet change detection effect
  useEffect(() => {
    console.log('Wallet hook update:', {
      evmAddress,
      tronAddress,
      currentAddress,
      isConnected,
      previousAddress: previousAddressRef.current
    });

    // Skip on initial render
    if (previousAddressRef.current === undefined) {
      previousAddressRef.current = currentAddress || undefined;
      return;
    }

    // Detect wallet change
    const hasWalletChanged = previousAddressRef.current !== currentAddress;

    if (hasWalletChanged) {
      console.log('🔄 Wallet change detected:', {
        previous: previousAddressRef.current,
        current: currentAddress,
        isConnected
      });

      // Clear current user state (logout)
      setUser(null);
      setIsLoading(true);

      // Update reference for next comparison
      previousAddressRef.current = currentAddress || undefined;

      // If there's a new wallet connected, fetch user data (login)
      if (isConnected && currentAddress) {
        console.log('🔐 Logging in with new wallet:', currentAddress);
        fetchUser();
      } else {
        // If disconnected, just finish loading
        console.log('🔓 Wallet disconnected, finishing logout');
        setIsLoading(false);
        setWalletType(null);
      }
    }
  }, [evmAddress, tronAddress, currentAddress, isConnected, fetchUser]);

  // Direct wallet event listener as backup (EVM wallets)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        console.log('🔄 Direct accountsChanged event:', accounts);
        console.log('Current wagmi address:', evmAddress);
        console.log('Previous address:', previousAddressRef.current);

        // Force a manual check if wagmi hasn't updated yet
        const newAddress = accounts[0]?.toLowerCase();
        if (newAddress && newAddress !== evmAddress && newAddress !== previousAddressRef.current) {
          console.log('⚠️ Direct event detected change before wagmi update');

          // Force disconnect and reconnect to trigger authorization popup
          console.log('🔌 Forcing disconnect and reconnect to trigger popup');
          setIsWaitingForApproval(true);

          // Show toast notification
          toast({
            title: "Wallet Change Detected",
            description: "Please approve the connection to your new wallet in the popup.",
          });

          disconnectEvm();

          // Wait a moment for disconnect to complete, then reconnect
          setTimeout(() => {
            if (connectors.length > 0) {
              console.log('🔌 Reconnecting with first connector');
              connectEvm({ connector: connectors[0] });
            }
          }, 100);
        }
      };

      const handleChainChanged = (chainId: string) => {
        console.log('🔗 Chain changed:', chainId);
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [evmAddress, disconnectEvm, connectEvm, connectors, toast]);

  // Additional polling mechanism for more reliable wallet change detection (EVM only)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      const pollWalletAccounts = async () => {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          const currentAccount = accounts[0]?.toLowerCase();

          // Only log if there's an actual change and we haven't logged it recently
          if (currentAccount && currentAccount !== evmAddress && currentAccount !== previousAddressRef.current) {
            // This will trigger the useEffect above when wagmi updates
            // We just log here to help with debugging
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
    }
  }, [evmAddress, isEvmConnected]);

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
