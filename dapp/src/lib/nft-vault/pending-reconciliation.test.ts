import { encodeAbiParameters, encodeEventTopics } from 'viem';

import { cukiePoolNftVaultAbi } from '@/lib/contracts/uki-nft-vaults';
import {
  canonicalNftVaultAssetId,
  type NftVaultPendingOperation,
} from './pending-operations';
import {
  depositedEpochFromReceipt,
  inspectPoolDepositPosition,
} from './pending-reconciliation';

const walletAddress = '0x1111111111111111111111111111111111111111';
const vaultAddress = '0x2222222222222222222222222222222222222222';
const collectionAddress = '0x3333333333333333333333333333333333333333';
const depositHash = `0x${'b'.repeat(64)}` as const;

function operation(overrides: Partial<NftVaultPendingOperation> = {}): NftVaultPendingOperation {
  return {
    version: 1,
    chainId: 97,
    walletAddress,
    vaultAddress,
    assetId: `97:${collectionAddress}:6`,
    collectionAddress,
    tokenId: '6',
    action: 'deposit',
    phase: 'syncing_projection',
    txHash: depositHash,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function depositedReceipt(input: {
  collection?: string;
  tokenId?: bigint;
  beneficiary?: string;
  depositEpoch?: bigint;
} = {}) {
  const topics = encodeEventTopics({
    abi: cukiePoolNftVaultAbi,
    eventName: 'Deposited',
    args: {
      collection: (input.collection ?? collectionAddress) as `0x${string}`,
      tokenId: input.tokenId ?? BigInt(6),
      beneficiary: (input.beneficiary ?? walletAddress) as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    [
      { type: 'uint64' },
      { type: 'uint64' },
      { type: 'uint64' },
      { type: 'uint64' },
      { type: 'uint64' },
      { type: 'uint32' },
    ],
    [input.depositEpoch ?? BigInt(2), BigInt(100), BigInt(200), BigInt(300), BigInt(0), 1],
  );
  return {
    status: 'success',
    logs: [{ address: vaultAddress, topics, data }],
  };
}

describe('pending NFT vault reconciliation', () => {
  it('canonicaliza el assetId aunque el navegador conservara una etiqueta antigua', () => {
    expect(canonicalNftVaultAssetId({
      chainId: 97,
      collectionAddress: collectionAddress.toUpperCase(),
      tokenId: '006',
    })).toBe(`97:${collectionAddress}:6`);
  });

  it('extrae el epoch del Deposited solo cuando coincide vault, token y beneficiario', () => {
    expect(depositedEpochFromReceipt(depositedReceipt(), operation())).toBe('2');
    expect(depositedEpochFromReceipt(
      depositedReceipt({ beneficiary: '0x4444444444444444444444444444444444444444' }),
      operation(),
    )).toBeNull();
    expect(depositedEpochFromReceipt(
      depositedReceipt({ tokenId: BigInt(7) }),
      operation(),
    )).toBeNull();
  });

  it('acepta la posición on-chain del mismo epoch y rechaza una posición de epoch anterior', () => {
    const confirmed = {
      beneficialOwner: walletAddress,
      depositEpoch: BigInt(2),
      depositedAt: BigInt(100),
      activationAt: BigInt(200),
    };
    expect(inspectPoolDepositPosition(operation({ depositEpoch: '2' }), confirmed)).toEqual({ depositEpoch: '2' });
    expect(inspectPoolDepositPosition(operation({ depositEpoch: '1' }), confirmed)).toBeNull();
    expect(inspectPoolDepositPosition(operation(), confirmed)).toEqual({ depositEpoch: '2' });
    expect(inspectPoolDepositPosition(
      operation({ depositEpoch: '2' }),
      { ...confirmed, beneficialOwner: '0x0000000000000000000000000000000000000000' },
    )).toBeNull();
  });
});

