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
    
    if (!isConnected || !addressToUse) {
        setUser(null);
        setIsLoading(false);
        setIsWaitingForApproval(false);
        setWalletType(null);
        return;
    }

    setIsLoading(true);
    setIsWaitingForApproval(false); // Reset waiting state when connection is successful
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: addressToUse }),
      });

      if (!response.ok) throw new Error('Login failed');

      const userData = await response.json();
      setUser(userData);
      setWalletType(isEvmConnected ? 'evm' : 'tron');
      
      // Show success toast if we were waiting for approval
      if (isWaitingForApproval) {
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
        description: "Failed to connect to your wallet. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentAddress, isConnected, isEvmConnected, isTronConnected, disconnectEvm, disconnectTron, toast, isWaitingForApproval]);

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