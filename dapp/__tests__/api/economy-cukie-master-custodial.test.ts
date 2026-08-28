import { NextRequest } from 'next/server';

import { POST } from '@/app/api/economy/v1/cukie-master/route';
import { verifyWalletAuth } from '@/lib/auth-utils';
import { ukiNftVaults } from '@/lib/contracts/uki-nft-vaults';
import { mutateCukieMasterNft } from '@/lib/uki-economy/cukie-master';

jest.mock('@/lib/auth-utils', () => ({ verifyWalletAuth: jest.fn() }));
jest.mock('@/lib/contracts/uki-nft-vaults', () => ({
  ukiNftVaults: {
    chainId: 97,
    cukieMasterNftVaultAddress: '0x2222222222222222222222222222222222222222',
    cukiePoolNftVaultAddress: null,
    collectionAddresses: ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    recoveryCollectionAddresses: ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    explorerBaseUrl: 'https://testnet.bscscan.com',
    ready: { cukieMaster: true, cukiePool: false },
    mode: { cukieMaster: 'custodial', cukiePool: 'legacy' },
  },
}));
jest.mock('@/lib/uki-economy/cukie-master', () => ({
  getCukieMasterWalletStatus: jest.fn(),
  getCukieMasterNftInventory: jest.fn(),
  mutateCukieMasterNft: jest.fn(),
}));

const wallet = '0x1111111111111111111111111111111111111111';
const mutableConfig = ukiNftVaults as unknown as {
  mode: { cukieMaster: 'legacy' | 'custodial' | 'invalid' };
};
const mockVerify = verifyWalletAuth as jest.MockedFunction<typeof verifyWalletAuth>;
const mockMutate = mutateCukieMasterNft as jest.MockedFunction<typeof mutateCukieMasterNft>;

function request() {
  return new NextRequest('http://localhost/api/economy/v1/cukie-master', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletAddress: wallet,
      operation: 'soft_stake',
      assetId: 'cukies:1',
      idempotencyKey: 'custodial-test:1',
    }),
  });
}

describe('POST Cukie Master custodial', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutableConfig.mode.cukieMaster = 'custodial';
  });

  it('requires direct on-chain execution and never mutates a Mongo lock', async () => {
    const response = await POST(request());
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      status: 'error',
      code: 'CUKIE_MASTER_NFT_ONCHAIN_REQUIRED',
    });
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('fails closed for an invalid vault configuration', async () => {
    mutableConfig.mode.cukieMaster = 'invalid';
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'error',
      code: 'CUKIE_MASTER_NFT_VAULT_CONFIG_INVALID',
    });
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
