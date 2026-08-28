import { parseUkiNftVaultPublicConfig } from '@/lib/contracts/uki-nft-vaults';

describe('UKI NFT vault public config', () => {
  const master = '0x00000000000000000000000000000000000000A1';
  const pool = '0x00000000000000000000000000000000000000A2';
  const collection = '0x00000000000000000000000000000000000000C1';
  const historicalCollection = '0x00000000000000000000000000000000000000c2';

  it('enables each vault only with supported chain, address and collection', () => {
    expect(parseUkiNftVaultPublicConfig({
      chainId: '97',
      cukieMasterNftVaultAddress: master,
      cukiePoolNftVaultAddress: pool,
      collectionAddress: collection,
    })).toMatchObject({
      chainId: 97,
      ready: { cukieMaster: true, cukiePool: true },
      mode: { cukieMaster: 'custodial', cukiePool: 'custodial' },
      explorerBaseUrl: 'https://testnet.bscscan.com',
    });
  });

  it('fails closed for unsupported networks, zero/invalid addresses and missing collection', () => {
    expect(parseUkiNftVaultPublicConfig({
      chainId: '31337',
      cukieMasterNftVaultAddress: master,
      collectionAddress: collection,
    })).toMatchObject({
      ready: { cukieMaster: false },
      mode: { cukieMaster: 'invalid' },
    });
    expect(parseUkiNftVaultPublicConfig({
      chainId: '97',
      cukieMasterNftVaultAddress: '0x0000000000000000000000000000000000000000',
      collectionAddress: collection,
    })).toMatchObject({
      ready: { cukieMaster: false },
      mode: { cukieMaster: 'invalid' },
    });
    expect(parseUkiNftVaultPublicConfig({
      chainId: '97',
      cukieMasterNftVaultAddress: master,
    })).toMatchObject({
      ready: { cukieMaster: false },
      mode: { cukieMaster: 'invalid' },
    });
  });

  it('keeps the explicit legacy fallback only when no vault address was supplied', () => {
    expect(parseUkiNftVaultPublicConfig({
      chainId: '97',
      collectionAddress: collection,
    })).toMatchObject({
      ready: { cukieMaster: false, cukiePool: false },
      mode: { cukieMaster: 'legacy', cukiePool: 'legacy' },
    });
  });

  it('deduplicates multiple configured collection addresses', () => {
    const result = parseUkiNftVaultPublicConfig({
      chainId: '56',
      cukieMasterNftVaultAddress: master,
      collectionAddress: collection,
      collectionAddresses: `${collection.toLowerCase()},${pool}`,
    });
    expect(result.collectionAddresses).toHaveLength(2);
    expect(result.explorerBaseUrl).toBe('https://bscscan.com');
  });

  it('ignores optional collection variables that Compose injects as empty strings', () => {
    expect(parseUkiNftVaultPublicConfig({
      chainId: '97',
      cukieMasterNftVaultAddress: master,
      cukiePoolNftVaultAddress: pool,
      collectionAddress: collection,
      collectionAddresses: '',
    })).toMatchObject({
      collectionAddresses: [collection],
      collectionConfigInvalid: false,
      ready: { cukieMaster: true, cukiePool: true },
      mode: { cukieMaster: 'custodial', cukiePool: 'custodial' },
    });

    expect(parseUkiNftVaultPublicConfig({
      chainId: '97',
      cukieMasterNftVaultAddress: master,
      cukiePoolNftVaultAddress: pool,
      collectionAddress: '   ',
      collectionAddresses: collection,
    })).toMatchObject({
      collectionAddresses: [collection],
      collectionConfigInvalid: false,
      ready: { cukieMaster: true, cukiePool: true },
    });
  });

  it('still fails closed for an empty item inside a non-empty CSV list', () => {
    expect(parseUkiNftVaultPublicConfig({
      chainId: '97',
      cukieMasterNftVaultAddress: master,
      cukiePoolNftVaultAddress: pool,
      collectionAddresses: `${collection},,${pool}`,
    })).toMatchObject({
      collectionConfigInvalid: true,
      ready: { cukieMaster: false, cukiePool: false },
      mode: { cukieMaster: 'invalid', cukiePool: 'invalid' },
    });
  });

  it('fails closed when a collection list mixes valid and invalid entries', () => {
    expect(parseUkiNftVaultPublicConfig({
      chainId: '97',
      cukieMasterNftVaultAddress: master,
      cukiePoolNftVaultAddress: pool,
      collectionAddresses: `${collection},not-an-address`,
    })).toMatchObject({
      collectionAddresses: [collection],
      collectionConfigInvalid: true,
      ready: { cukieMaster: false, cukiePool: false },
      mode: { cukieMaster: 'invalid', cukiePool: 'invalid' },
    });
  });

  it('keeps historical collections available only to the direct recovery flow', () => {
    expect(parseUkiNftVaultPublicConfig({
      chainId: '97',
      cukieMasterNftVaultAddress: master,
      cukiePoolNftVaultAddress: pool,
      collectionAddress: collection,
      recoveryCollectionAddresses: `${historicalCollection},${collection}`,
    })).toMatchObject({
      collectionAddresses: [collection],
      recoveryCollectionAddresses: [collection, historicalCollection],
      collectionConfigInvalid: false,
      recoveryCollectionConfigInvalid: false,
      ready: { cukieMaster: true, cukiePool: true },
    });
  });

  it('fails closed only the recovery identity when its historical CSV is invalid', () => {
    expect(parseUkiNftVaultPublicConfig({
      chainId: '97',
      cukieMasterNftVaultAddress: master,
      cukiePoolNftVaultAddress: pool,
      collectionAddress: collection,
      recoveryCollectionAddresses: `${historicalCollection},,not-an-address`,
    })).toMatchObject({
      collectionAddresses: [collection],
      recoveryCollectionAddresses: [collection, historicalCollection],
      collectionConfigInvalid: false,
      recoveryCollectionConfigInvalid: true,
      ready: { cukieMaster: true, cukiePool: true },
    });
  });
});
