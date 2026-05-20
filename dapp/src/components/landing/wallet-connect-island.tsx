'use client';

import {
  WalletConnectButton,
  WalletStateCallout,
  WalletStatusLabel,
  type WalletConnectButtonProps,
} from './wallet-connect-button';

export function LandingWalletConnectButton(props: WalletConnectButtonProps) {
  return <WalletConnectButton {...props} />;
}

export function LandingWalletStatusLabel() {
  return <WalletStatusLabel />;
}

export function LandingWalletStateCallout() {
  return <WalletStateCallout />;
}
