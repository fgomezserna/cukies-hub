import {
  evmWalletSessionMatchesSignedAddress,
  isValidEvmWalletAddress,
  type WalletSessionPayload,
} from '@/lib/wallet-auth';

const buyerAddress = '0x1111111111111111111111111111111111111111';
const otherAddress = '0x2222222222222222222222222222222222222222';

function session(overrides: Partial<WalletSessionPayload> = {}): WalletSessionPayload {
  return {
    userId: 'buyer-user',
    walletAddress: buyerAddress,
    signedWalletAddress: buyerAddress,
    walletType: 'evm',
    issuedAt: '2026-07-16T00:00:00.000Z',
    expiresAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('autorizacion EVM de referrals', () => {
  it('solo acepta una direccion EVM completa', () => {
    expect(isValidEvmWalletAddress(buyerAddress)).toBe(true);
    expect(isValidEvmWalletAddress('0xbuyer')).toBe(false);
    expect(isValidEvmWalletAddress('0x0000000000000000000000000000000000000000')).toBe(false);
    expect(isValidEvmWalletAddress('TJRabPrwbZy45sbavfcjinPJC18kjpRTv8')).toBe(false);
  });

  it('compara exclusivamente con signedWalletAddress', () => {
    expect(evmWalletSessionMatchesSignedAddress(session({
      walletAddress: buyerAddress,
      signedWalletAddress: otherAddress,
    }), buyerAddress)).toBe(false);
  });

  it('rechaza una sesion TRON aunque el campo firmado contenga la direccion solicitada', () => {
    expect(evmWalletSessionMatchesSignedAddress(session({
      signedWalletAddress: buyerAddress,
      walletType: 'tron',
    }), buyerAddress)).toBe(false);
  });

  it('acepta la wallet EVM que firmo la sesion', () => {
    expect(evmWalletSessionMatchesSignedAddress(session(), buyerAddress)).toBe(true);
  });
});
