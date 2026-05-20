'use client';

import { AuthProvider } from '@/providers/auth-provider';
import { Web3Provider } from '@/providers/web3-provider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <Web3Provider>
      <AuthProvider>{children}</AuthProvider>
    </Web3Provider>
  );
}
