'use client';

import { AuthProvider } from '@/providers/auth-provider';
import { PublicLocaleProvider } from '@/providers/public-locale-provider';
import { Web3Provider } from '@/providers/web3-provider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <Web3Provider>
      <PublicLocaleProvider>
        <AuthProvider>{children}</AuthProvider>
      </PublicLocaleProvider>
    </Web3Provider>
  );
}
