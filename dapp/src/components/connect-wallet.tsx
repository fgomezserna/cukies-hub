'use client';

import { useConnect, useDisconnect } from 'wagmi';
import { Button } from './ui/button';
import { injected } from 'wagmi/connectors';
import { useAuth } from './auth-provider';
import { Loader2 } from 'lucide-react';

export function ConnectWallet() {
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Button variant="outline" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">
          {user.username ?? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`}
        </p>
        <Button onClick={() => disconnect()} variant="outline">
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={() => connect({ connector: injected() })}>
      Connect Wallet
    </Button>
  );
} 