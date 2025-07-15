'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useDisconnect, useConnect } from 'wagmi';
import { User } from '@/types';
import { useToast } from '@/hooks/use-toast';

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isWaitingForApproval: boolean;
  fetchUser: () => void; // Function to allow components to trigger a refetch
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWaitingForApproval, setIsWaitingForApproval] = useState(false);
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { connect, connectors } = useConnect();
  const { toast } = useToast();
  const previousAddressRef = useRef<string | undefined>(address);

  const fetchUser = useCallback(async () => {
    if (!isConnected || !address) {
        setUser(null);
        setIsLoading(false);
        setIsWaitingForApproval(false);
        return;
    }

    setIsLoading(true);
    setIsWaitingForApproval(false); // Reset waiting state when connection is successful
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });

      if (!response.ok) throw new Error('Login failed');

      const userData = await response.json();
      setUser(userData);
      
      // Show success toast if we were waiting for approval
      if (isWaitingForApproval) {
        toast({
          title: "Wallet Connected",
          description: `Successfully connected to ${address?.slice(0, 6)}...${address?.slice(-4)}`,
        });
      }
    } catch (error) {
      console.error(error);
      setUser(null);
      disconnect();
      
      // Show error toast
      toast({
        title: "Connection Failed",
        description: "Failed to connect to your wallet. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected, disconnect, toast, isWaitingForApproval]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Enhanced wallet change detection effect
  useEffect(() => {
    console.log('useAccount hook update:', {
      address,
      isConnected,
      previousAddress: previousAddressRef.current
    });

    // Skip on initial render
    if (previousAddressRef.current === undefined) {
      previousAddressRef.current = address;
      return;
    }

    // Detect wallet change
    const hasWalletChanged = previousAddressRef.current !== address;
    
    if (hasWalletChanged) {
      console.log('🔄 Wallet change detected:', {
        previous: previousAddressRef.current,
        current: address,
        isConnected
      });

      // Clear current user state (logout)
      setUser(null);
      setIsLoading(true);

      // Update reference for next comparison
      previousAddressRef.current = address;

      // If there's a new wallet connected, fetch user data (login)
      if (isConnected && address) {
        console.log('🔐 Logging in with new wallet:', address);
        fetchUser();
      } else {
        // If disconnected, just finish loading
        console.log('🔓 Wallet disconnected, finishing logout');
        setIsLoading(false);
      }
    }
  }, [address, isConnected, fetchUser]);

  // Direct wallet event listener as backup
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        console.log('🔄 Direct accountsChanged event:', accounts);
        console.log('Current wagmi address:', address);
        console.log('Previous address:', previousAddressRef.current);
        
        // Force a manual check if wagmi hasn't updated yet
        const newAddress = accounts[0]?.toLowerCase();
        if (newAddress && newAddress !== address && newAddress !== previousAddressRef.current) {
          console.log('⚠️ Direct event detected change before wagmi update');
          
          // Force disconnect and reconnect to trigger authorization popup
          console.log('🔌 Forcing disconnect and reconnect to trigger popup');
          setIsWaitingForApproval(true);
          
          // Show toast notification
          toast({
            title: "Wallet Change Detected",
            description: "Please approve the connection to your new wallet in the popup.",
          });
          
          disconnect();
          
          // Wait a moment for disconnect to complete, then reconnect
          setTimeout(() => {
            if (connectors.length > 0) {
              console.log('🔌 Reconnecting with first connector');
              connect({ connector: connectors[0] });
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
  }, [address, disconnect, connect, connectors, toast]);

  // Additional polling mechanism for more reliable wallet change detection
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      const pollWalletAccounts = async () => {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          const currentAccount = accounts[0]?.toLowerCase();
          
          if (currentAccount && currentAccount !== address && currentAccount !== previousAddressRef.current) {
            console.log('🔄 Polling detected wallet change:', {
              wagmiAddress: address,
              polledAddress: currentAccount,
              previousAddress: previousAddressRef.current
            });
            
            // This will trigger the useEffect above when wagmi updates
            // We just log here to help with debugging
          }
        } catch (error) {
          console.error('Error polling wallet accounts:', error);
        }
      };

      // Poll every 2 seconds when connected
      let interval: NodeJS.Timeout;
      if (isConnected) {
        interval = setInterval(pollWalletAccounts, 2000);
      }

      return () => {
        if (interval) {
          clearInterval(interval);
        }
      };
    }
  }, [address, isConnected]);

  return (
    <AuthContext.Provider value={{ user, isLoading, isWaitingForApproval, fetchUser }}>
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