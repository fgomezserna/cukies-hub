'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { User } from '@/types';

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  fetchUser: () => void; // Function to allow components to trigger a refetch
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  const fetchUser = useCallback(async () => {
    if (!isConnected || !address) {
        setUser(null);
        setIsLoading(false);
        return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });

      if (!response.ok) throw new Error('Login failed');

      const userData = await response.json();
      setUser(userData);
    } catch (error) {
      console.error(error);
      setUser(null);
      disconnect();
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected, disconnect]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <AuthContext.Provider value={{ user, isLoading, fetchUser }}>
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