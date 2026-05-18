'use client';

import { Web3Provider } from '@/providers/web3-provider';
import {
  WalletConnectButton,
  WalletStateCallout,
  WalletStatusLabel,
  type WalletConnectButtonProps,
} from './wallet-connect-button';

export function LandingWalletConnectButton(props: WalletConnectButtonProps) {
  return (
    <Web3Provider>
      <WalletConnectButton {...props} />
    </Web3Provider>
  );
}

export function LandingWalletStatusLabel() {
  return (
    <Web3Provider>
      <WalletStatusLabel />
    </Web3Provider>
  );
}

export function LandingWalletStateCallout() {
  return (
    <Web3Provider>
      <WalletStateCallout />
    </Web3Provider>
  );
}
