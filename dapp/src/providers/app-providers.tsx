'use client';

import { AuthProvider } from '@/providers/auth-provider';
import { PublicLocaleProvider } from '@/providers/public-locale-provider';
import { Web3Provider } from '@/providers/web3-provider';
import { AppRuntimeProvider } from '@/providers/app-runtime-provider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <Web3Provider>
      <PublicLocaleProvider>
        <AuthProvider>
          <AppRuntimeProvider>{children}</AppRuntimeProvider>
        </AuthProvider>
      </PublicLocaleProvider>
    </Web3Provider>
  );
}
