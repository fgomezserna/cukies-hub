import {
  isAllowedAdminWalletSession,
  parseAdminWalletAllowlist,
} from '@/lib/admin-wallet-access';
import type { WalletSessionPayload } from '@/lib/wallet-auth';

const ADMIN_WALLET = '0x1111111111111111111111111111111111111111';
const OTHER_WALLET = '0x2222222222222222222222222222222222222222';

function session(overrides: Partial<WalletSessionPayload> = {}): WalletSessionPayload {
  return {
    userId: 'admin-user',
    walletAddress: ADMIN_WALLET,
    signedWalletAddress: ADMIN_WALLET,
    walletType: 'evm',
    issuedAt: '2026-08-31T00:00:00.000Z',
    expiresAt: '2026-09-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('admin wallet access', () => {
  it('fails closed when the allowlist is missing or empty', () => {
    expect(isAllowedAdminWalletSession(session(), undefined)).toBe(false);
    expect(isAllowedAdminWalletSession(session(), '   ')).toBe(false);
  });

  it('accepts only the EVM wallet that signed the session', () => {
    expect(isAllowedAdminWalletSession(session(), ADMIN_WALLET.toUpperCase())).toBe(true);
    expect(isAllowedAdminWalletSession(session(), OTHER_WALLET)).toBe(false);
    expect(isAllowedAdminWalletSession(session({
      walletAddress: ADMIN_WALLET,
      signedWalletAddress: OTHER_WALLET,
    }), ADMIN_WALLET)).toBe(false);
    expect(isAllowedAdminWalletSession(session({ walletType: 'tron' }), ADMIN_WALLET)).toBe(false);
  });

  it('ignores malformed and zero-address entries', () => {
    const allowlist = parseAdminWalletAllowlist(
      `invalid,0x0000000000000000000000000000000000000000,${ADMIN_WALLET}`,
    );

    expect([...allowlist]).toEqual([ADMIN_WALLET]);
  });
});
