import { isAddress, zeroAddress } from 'viem';

import type { WalletSessionPayload } from '@/lib/wallet-auth';

export function parseAdminWalletAllowlist(value?: string | null) {
  if (!value?.trim()) return new Set<string>();

  return new Set(
    value
      .split(',')
      .map((address) => address.trim().toLowerCase())
      .filter((address) => isAddress(address, { strict: false }) && address !== zeroAddress),
  );
}

export function isAllowedAdminWalletSession(
  session: WalletSessionPayload | null,
  allowlistValue = process.env.ADMIN_WALLET_ALLOWLIST,
) {
  const signedWalletAddress = session?.signedWalletAddress?.trim().toLowerCase();

  if (
    session?.walletType !== 'evm'
    || !signedWalletAddress
    || !isAddress(signedWalletAddress, { strict: false })
    || signedWalletAddress === zeroAddress
  ) {
    return false;
  }

  return parseAdminWalletAllowlist(allowlistValue).has(signedWalletAddress);
}
