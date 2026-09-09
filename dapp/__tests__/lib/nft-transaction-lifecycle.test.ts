import {
  nftTransactionContextMatches,
  type NftTransactionContext,
} from '@/lib/nft-vault/transaction-lifecycle';

describe('nftTransactionContextMatches', () => {
  const expected: NftTransactionContext = {
    wallet: '0x1111111111111111111111111111111111111111',
    chainId: 97,
    vault: '0x2222222222222222222222222222222222222222',
  };

  it('rechaza una wallet desconectada sin lanzar', () => {
    expect(nftTransactionContextMatches(expected, {
      wallet: null,
      chainId: 97,
      vault: expected.vault,
    })).toBe(false);
    expect(nftTransactionContextMatches(expected, null)).toBe(false);
  });
});
