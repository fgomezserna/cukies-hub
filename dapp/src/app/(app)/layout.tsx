import AppLayout from '@/components/layout/app-layout';
import { AuthProvider } from '@/providers/auth-provider';
import { Web3Provider } from '@/providers/web3-provider';

export default function InternalAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Web3Provider>
      <AuthProvider>
        <AppLayout>{children}</AppLayout>
      </AuthProvider>
    </Web3Provider>
  );
}
