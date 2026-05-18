'use client';

import dynamic from 'next/dynamic';
import type { WalletConnectButtonProps } from './wallet-connect-button';

const DynamicWalletConnectButton = dynamic(
  () => import('./wallet-connect-island').then((mod) => mod.LandingWalletConnectButton),
  {
    ssr: false,
    loading: () => (
      <button type="button" className="uki-wallet-button" disabled>
        <span>Wallet</span>
      </button>
    ),
  },
);

const DynamicWalletStatusLabel = dynamic(
  () => import('./wallet-connect-island').then((mod) => mod.LandingWalletStatusLabel),
  {
    ssr: false,
    loading: () => <span className="text-[#ff75aa]">Not connected</span>,
  },
);

const DynamicWalletStateCallout = dynamic(
  () => import('./wallet-connect-island').then((mod) => mod.LandingWalletStateCallout),
  {
    ssr: false,
    loading: () => (
      <div className="uki-state-callout uki-state-callout-loading">
        <div>
          <p>Loading wallet</p>
          <span>Checking wallet state.</span>
        </div>
      </div>
    ),
  },
);

export function LandingWalletConnectButton(props: WalletConnectButtonProps) {
  return <DynamicWalletConnectButton {...props} />;
}

export function LandingWalletStatusLabel() {
  return <DynamicWalletStatusLabel />;
}

export function LandingWalletStateCallout() {
  return <DynamicWalletStateCallout />;
}
