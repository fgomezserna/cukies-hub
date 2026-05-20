'use client';

import { CheckCircle2, ShieldAlert, Wallet } from 'lucide-react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { UKI_PRESALE_CHAIN_ID, UKI_PRESALE_CHAIN_LABEL } from './sale-config';

type WalletConnectButtonProps = {
  className?: string;
  label?: string;
  compactLabel?: string;
  showCompactText?: boolean;
};

export type { WalletConnectButtonProps };

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export { shortAddress };

function isSameWalletAddress(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function WalletConnectButton({
  className = '',
  label = 'Connect wallet',
  compactLabel = 'Wallet',
  showCompactText = true,
}: WalletConnectButtonProps) {
  const { address, chainId, isConnected } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { user, isLoading: isAuthLoading, isWaitingForApproval, fetchUser } = useAuth();
  const { toast } = useToast();

  const connector = connectors.find((item) => item.id === 'injected') ?? connectors[0];
  const isWrongChain = isConnected && chainId !== UKI_PRESALE_CHAIN_ID;
  const isAuthenticatedWallet = isSameWalletAddress(user?.walletAddress, address);
  const isBusy = isPending || isSwitching || isAuthLoading || isWaitingForApproval;

  const handleClick = async () => {
    if (isBusy) return;

    if (isWrongChain) {
      switchChain(
        { chainId: UKI_PRESALE_CHAIN_ID },
        {
          onError: () => {
            toast({
              title: 'Network switch failed',
              description: `Please switch your wallet to ${UKI_PRESALE_CHAIN_LABEL}.`,
              variant: 'destructive',
            });
          },
        },
      );
      return;
    }

    if (isConnected && address) {
      if (!isAuthenticatedWallet) {
        await fetchUser(address, { promptForSignature: true, walletType: 'evm' });
        return;
      }

      disconnect();
      return;
    }

    if (!connector) {
      toast({
        title: 'Wallet not found',
        description: 'Install an EVM wallet such as MetaMask to connect.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await connectAsync({ connector });
      const connectedAddress = result.accounts?.[0] ?? address;

      if (connectedAddress) {
        await fetchUser(connectedAddress, { promptForSignature: true, walletType: 'evm' });
      }
    } catch {
      toast({
        title: 'Connection failed',
        description: 'Please approve the wallet connection and try again.',
        variant: 'destructive',
      });
    }
  };

  const text = isBusy
    ? isWaitingForApproval
      ? 'Sign message'
      : 'Connecting...'
    : isWrongChain
      ? 'Switch to BSC'
      : address
        ? isAuthenticatedWallet
          ? shortAddress(address)
          : 'Sign in'
        : label;
  const compactText = address ? (isAuthenticatedWallet ? shortAddress(address) : 'Sign in') : compactLabel;

  return (
    <button type="button" onClick={handleClick} disabled={isBusy} className={`uki-wallet-button ${className}`}>
      <Wallet className="h-4 w-4" strokeWidth={1.8} />
      <span className={showCompactText ? 'hidden sm:inline' : ''}>{text}</span>
      {showCompactText ? <span className="sm:hidden">{compactText}</span> : null}
    </button>
  );
}

export function WalletStatusLabel() {
  const { address, chainId, isConnected } = useAccount();
  const { user, isLoading } = useAuth();

  if (!isConnected || !address) {
    return <span className="text-[#ff75aa]">Not connected</span>;
  }

  if (chainId !== UKI_PRESALE_CHAIN_ID) {
    return <span className="text-[#ffcc6d]">Wrong chain</span>;
  }

  if (isLoading) {
    return <span className="text-[#ffcc6d]">Checking auth</span>;
  }

  if (!isSameWalletAddress(user?.walletAddress, address)) {
    return <span className="text-[#ffcc6d]">Signature required</span>;
  }

  return <span className="text-[var(--uki-cyan)]">{shortAddress(address)}</span>;
}

export function WalletStateCallout() {
  const { address, chainId, isConnected } = useAccount();
  const { user, isLoading, isWaitingForApproval } = useAuth();
  const isWrongChain = isConnected && chainId !== UKI_PRESALE_CHAIN_ID;
  const isAuthenticatedWallet = isSameWalletAddress(user?.walletAddress, address);

  if (!isConnected || !address) {
    return (
      <div className="uki-state-callout uki-state-callout-warning">
        <Wallet className="h-4 w-4" strokeWidth={1.8} />
        <div>
          <p>Wallet disconnected</p>
          <span>Connect an EVM wallet to review personal sale and vesting data.</span>
        </div>
      </div>
    );
  }

  if (isWrongChain) {
    return (
      <div className="uki-state-callout uki-state-callout-warning">
        <ShieldAlert className="h-4 w-4" strokeWidth={1.8} />
        <div>
          <p>Wrong chain</p>
          <span>Switch to {UKI_PRESALE_CHAIN_LABEL} before approve, buy or vesting actions.</span>
        </div>
      </div>
    );
  }

  if (isLoading || isWaitingForApproval) {
    return (
      <div className="uki-state-callout uki-state-callout-warning">
        <Wallet className="h-4 w-4" strokeWidth={1.8} />
        <div>
          <p>{isWaitingForApproval ? 'Signature pending' : 'Checking wallet auth'}</p>
          <span>{isWaitingForApproval ? 'Approve the login message in your wallet.' : 'Confirming your app session.'}</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticatedWallet) {
    return (
      <div className="uki-state-callout uki-state-callout-warning">
        <ShieldAlert className="h-4 w-4" strokeWidth={1.8} />
        <div>
          <p>Signature required</p>
          <span>Sign the wallet challenge to use the same authenticated app session.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="uki-state-callout uki-state-callout-ready">
      <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />
      <div>
        <p>Wallet ready</p>
        <span>{shortAddress(address)} is connected on {UKI_PRESALE_CHAIN_LABEL}.</span>
      </div>
    </div>
  );
}
