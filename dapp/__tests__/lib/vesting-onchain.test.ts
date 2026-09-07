import {
  VestingOnChainUnavailableError,
  VestingOnChainValidationError,
  readWalletVestingStatus,
  vestingRpcUrls,
  type WalletVestingDependencies,
} from '@/lib/vesting-onchain';

const wallet = '0x1111111111111111111111111111111111111111';
const vault = '0x2222222222222222222222222222222222222222';

function dependencies(
  overrides: Partial<WalletVestingDependencies> = {},
): WalletVestingDependencies {
  return {
    chainId: 97,
    vaultAddress: vault,
    readSchedule: jest.fn().mockResolvedValue({
      totalAmount: BigInt(10_000),
      releasedAmount: BigInt(2_000),
      start: BigInt(1_800_000_000),
      cliff: BigInt(1_800_000_000),
      duration: BigInt(31_536_000),
    }),
    readReleasable: jest.fn().mockResolvedValue(BigInt(500)),
    readConfigFrozen: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('readWalletVestingStatus', () => {
  it('uses all staging indexer RPCs and does not default to a different provider', () => {
    expect(vestingRpcUrls(97, {
      CHAIN_INDEXER_BSC_RPC_URLS: 'https://primary.invalid,https://secondary.invalid',
      CHAIN_INDEXER_BSC_RPC_URL: 'https://unused.invalid',
    })).toEqual(['https://primary.invalid/', 'https://secondary.invalid/']);
    expect(vestingRpcUrls(97, {
      CHAIN_INDEXER_BSC_TESTNET_RPC_URL: 'https://testnet.invalid',
      CHAIN_INDEXER_BSC_RPC_URLS: 'https://unused.invalid',
    })).toEqual(['https://testnet.invalid/']);
    expect(vestingRpcUrls(56, { BSC_RPC_URL: 'https://mainnet.invalid' }))
      .toEqual(['https://mainnet.invalid/']);
  });

  it('materializa el calendario Testnet sin perder precisión ni confundir bloqueado con reclamable', async () => {
    const runtime = dependencies();

    const result = await readWalletVestingStatus(wallet, runtime);

    expect(result).toEqual({
      walletNormalized: wallet,
      chainId: 97,
      vaultAddress: vault,
      configFrozen: true,
      hasPosition: true,
      totalAmountRaw: '10000',
      releasedAmountRaw: '2000',
      releasableRaw: '500',
      lockedAmountRaw: '7500',
      progressBps: 2500,
      schedule: {
        start: 1_800_000_000,
        cliff: 1_800_000_000,
        duration: 31_536_000,
        end: 1_831_536_000,
      },
    });
    expect(runtime.readSchedule).toHaveBeenCalledWith(wallet);
    expect(runtime.readReleasable).toHaveBeenCalledWith(wallet);
  });

  it('rechaza wallets inválidas antes de leer el contrato', async () => {
    const runtime = dependencies();

    await expect(readWalletVestingStatus('not-a-wallet', runtime))
      .rejects.toBeInstanceOf(VestingOnChainValidationError);
    expect(runtime.readSchedule).not.toHaveBeenCalled();
  });

  it('falla cerrado si released más releasable supera la asignación', async () => {
    const runtime = dependencies({
      readReleasable: jest.fn().mockResolvedValue(BigInt(9_000)),
    });

    await expect(readWalletVestingStatus(wallet, runtime))
      .rejects.toBeInstanceOf(VestingOnChainUnavailableError);
  });

  it('no degrada un fallo RPC a un calendario vacío', async () => {
    const runtime = dependencies({
      readSchedule: jest.fn().mockRejectedValue(new Error('rpc unavailable')),
    });

    await expect(readWalletVestingStatus(wallet, runtime))
      .rejects.toBeInstanceOf(VestingOnChainUnavailableError);
  });
});
