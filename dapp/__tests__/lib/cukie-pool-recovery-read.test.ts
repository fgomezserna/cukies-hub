import {
  classifyPoolRecoveryRead,
  mergePoolRecoveryInspection,
  readPoolRecoveryPositions,
} from '@/lib/uki-economy/cukie-pool/recovery-read';

const wallet = '0x1111111111111111111111111111111111111111';
const previousVault = '0x2222222222222222222222222222222222222222';
const otherOwner = '0x3333333333333333333333333333333333333333';
const assetId = '97:0x4444444444444444444444444444444444444444:98000001';

function position(beneficialOwner = wallet) {
  return [beneficialOwner, BigInt(1), BigInt(1_700_000_000), BigInt(1_700_000_100), BigInt(0), BigInt(0), BigInt(0), BigInt(1), BigInt(0)];
}

describe('Pool vault recovery read classification', () => {
  it('keeps a token owned by the wallet out of former-vault custody', () => {
    expect(classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      owner: wallet,
      rawPosition: position(),
    })).toMatchObject({ status: 'not_found', vaultAddress: null });
  });

  it('marks a token held by the allowlisted former vault as custodied', () => {
    expect(classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      owner: previousVault,
      rawPosition: position(),
    })).toMatchObject({
      status: 'custodied',
      vaultAddress: previousVault,
      beneficialOwner: wallet,
    });
  });

  it('keeps another owner or malformed reads unknown', () => {
    expect(classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      owner: otherOwner,
      rawPosition: position(),
    })).toMatchObject({ status: 'unknown', reason: 'POOL_RECOVERY_OWNER_MISMATCH' });
    expect(classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      owner: previousVault,
      rawPosition: null,
    })).toMatchObject({ status: 'unknown', reason: 'POOL_RECOVERY_POSITION_INVALID' });
  });

  it('keeps confirmed custody when another former vault is inconclusive', () => {
    const confirmed = classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      owner: previousVault,
      rawPosition: position(),
    });
    const unknown = classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: otherOwner,
      owner: otherOwner,
      rawPosition: null,
    });
    expect(mergePoolRecoveryInspection(confirmed, unknown)).toEqual(confirmed);
    expect(mergePoolRecoveryInspection(unknown, confirmed)).toEqual(confirmed);
  });

  it('fails closed when two former vaults both claim the same asset', () => {
    const confirmed = classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      owner: previousVault,
      rawPosition: position(),
    });
    const secondVault = '0x5555555555555555555555555555555555555555';
    const second = classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: secondVault,
      owner: secondVault,
      rawPosition: position(),
    });
    expect(mergePoolRecoveryInspection(confirmed, second)).toMatchObject({
      status: 'unknown',
      reason: 'POOL_RECOVERY_VAULT_AMBIGUOUS',
    });
  });

  it('does not require a recovery RPC on a chain without an allowlisted vault', async () => {
    await expect(readPoolRecoveryPositions({
      walletNormalized: wallet,
      vaults: [{ chainId: 97, vaultAddress: previousVault }],
      assets: [{
        chainId: 56,
        collectionAddress: '0x4444444444444444444444444444444444444444',
        tokenId: '1',
      }],
    })).resolves.toMatchObject([{ status: 'not_found' }]);
  });

  it('fails closed for an oversized recovery batch instead of leaving tail assets unchecked', async () => {
    const assets = Array.from({ length: 201 }, (_, index) => ({
      chainId: 97 as const,
      collectionAddress: '0x4444444444444444444444444444444444444444',
      tokenId: String(index + 1),
    }));
    const result = await readPoolRecoveryPositions({
      walletNormalized: wallet,
      vaults: [{ chainId: 97, vaultAddress: previousVault }],
      assets,
    });
    expect(result).toHaveLength(201);
    expect(new Set(result.map((item) => item.status))).toEqual(new Set(['unknown']));
    expect(new Set(result.map((item) => item.reason))).toEqual(new Set(['POOL_RECOVERY_ASSET_LIMIT']));
  });
});
