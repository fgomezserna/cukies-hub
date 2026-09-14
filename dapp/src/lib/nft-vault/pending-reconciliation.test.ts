import { encodeAbiParameters, encodeEventTopics } from 'viem';

import { cukieMasterNftVaultAbi, cukiePoolNftVaultAbi } from '@/lib/contracts/uki-nft-vaults';
import {
  canonicalNftVaultAssetId,
  type NftVaultPendingOperation,
} from './pending-operations';
import {
  depositedEpochFromReceipt,
  depositedEpochFromMasterReceipt,
  inspectMasterDepositPosition,
  inspectPoolDepositPosition,
  masterProjectionMatchesPendingOperation,
  withdrawnEpochFromMasterReceipt,
  withdrawnEpochFromReceipt,
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

function masterDepositedReceipt(input: {
  collection?: string;
  tokenId?: bigint;
  beneficiary?: string;
  depositEpoch?: bigint;
} = {}) {
  const topics = encodeEventTopics({
    abi: cukieMasterNftVaultAbi,
    eventName: 'Deposited',
    args: {
      collection: (input.collection ?? collectionAddress) as `0x${string}`,
      tokenId: input.tokenId ?? BigInt(6),
      beneficiary: (input.beneficiary ?? walletAddress) as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    [input.depositEpoch ?? BigInt(4), BigInt(100)],
  );
  return {
    status: 'success',
    logs: [{ address: vaultAddress, topics, data }],
  };
}

function withdrawnReceipt(input: {
  collection?: string;
  tokenId?: bigint;
  beneficiary?: string;
  depositEpoch?: bigint;
} = {}) {
  const topics = encodeEventTopics({
    abi: cukiePoolNftVaultAbi,
    eventName: 'Withdrawn',
    args: {
      collection: (input.collection ?? collectionAddress) as `0x${string}`,
      tokenId: input.tokenId ?? BigInt(6),
      beneficiary: (input.beneficiary ?? walletAddress) as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    [{ type: 'uint64' }, { type: 'uint64' }],
    [input.depositEpoch ?? BigInt(2), BigInt(400)],
  );
  return {
    status: 'success',
    logs: [{ address: vaultAddress, topics, data }],
  };
}

function masterWithdrawnReceipt(input: {
  collection?: string;
  tokenId?: bigint;
  beneficiary?: string;
  depositEpoch?: bigint;
} = {}) {
  const topics = encodeEventTopics({
    abi: cukieMasterNftVaultAbi,
    eventName: 'Withdrawn',
    args: {
      collection: (input.collection ?? collectionAddress) as `0x${string}`,
      tokenId: input.tokenId ?? BigInt(6),
      beneficiary: (input.beneficiary ?? walletAddress) as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    [input.depositEpoch ?? BigInt(4), BigInt(400)],
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

  it('decodifica el evento Master con su ABI y no lo confunde con el Pool', () => {
    expect(depositedEpochFromMasterReceipt(masterDepositedReceipt(), operation())).toBe('4');
    expect(depositedEpochFromMasterReceipt(
      masterDepositedReceipt({ beneficiary: '0x4444444444444444444444444444444444444444' }),
      operation(),
    )).toBeNull();
  });

  it('extrae el epoch de Withdrawn y rechaza otro token o beneficiario', () => {
    expect(withdrawnEpochFromReceipt(withdrawnReceipt(), operation())).toBe('2');
    expect(withdrawnEpochFromReceipt(
      withdrawnReceipt({ beneficiary: '0x4444444444444444444444444444444444444444' }),
      operation(),
    )).toBeNull();
    expect(withdrawnEpochFromReceipt(
      withdrawnReceipt({ tokenId: BigInt(7) }),
      operation(),
    )).toBeNull();
  });

  it('decodifica Withdrawn de Master con su ABI', () => {
    expect(withdrawnEpochFromMasterReceipt(masterWithdrawnReceipt(), operation())).toBe('4');
    expect(withdrawnEpochFromMasterReceipt(
      masterWithdrawnReceipt({ depositEpoch: BigInt(3) }),
      operation(),
    )).toBe('3');
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

  it('valida la posición Master por wallet y epoch aunque no tenga activationAt', () => {
    const confirmed = {
      beneficialOwner: walletAddress,
      depositEpoch: BigInt(4),
      depositedAt: BigInt(100),
    };
    expect(inspectMasterDepositPosition(operation({ depositEpoch: '4' }), confirmed)).toEqual({ depositEpoch: '4' });
    expect(inspectMasterDepositPosition(operation({ depositEpoch: '3' }), confirmed)).toBeNull();
    expect(inspectMasterDepositPosition(
      operation({ depositEpoch: '4' }),
      { ...confirmed, beneficialOwner: '0x0000000000000000000000000000000000000000' },
    )).toBeNull();
  });

  it('solo acepta la proyección Master del wallet/vault/epoch exactos', () => {
    const pending = operation({ depositEpoch: '4' });
    const status = {
      walletNormalized: walletAddress,
      nftCustody: {
        mode: 'custodial',
        chainId: 97,
        vaultAddress,
        collectionAddresses: [collectionAddress],
      },
      nftInventory: [{
        assetId: pending.assetId,
        collectionAddress,
        tokenId: pending.tokenId,
        custody: 'cukie_master_nft_vault',
        depositEpoch: '4',
      }],
    };
    expect(masterProjectionMatchesPendingOperation(pending, status)).toBe(true);
    expect(masterProjectionMatchesPendingOperation(pending, {
      ...status,
      walletNormalized: '0x4444444444444444444444444444444444444444',
    })).toBe(false);
    expect(masterProjectionMatchesPendingOperation(pending, {
      ...status,
      nftInventory: [{ ...status.nftInventory[0], depositEpoch: '3' }],
    })).toBe(false);
  });
});
