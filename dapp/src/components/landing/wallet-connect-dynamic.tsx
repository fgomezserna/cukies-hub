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

export function LandingWalletConnectButton(props: WalletConnectButtonProps) {
  return <DynamicWalletConnectButton {...props} />;
}

export function LandingWalletStatusLabel() {
  return <DynamicWalletStatusLabel />;
}
