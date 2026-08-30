import { createPublicClient, getAddress, http, isAddress } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { ukiSaleContracts, vestingVaultAbi } from '@/lib/contracts/uki-sale';

const BSC_RPC_URL = process.env.CHAIN_INDEXER_BSC_RPC_URL
  ?? process.env.BSC_RPC_URL
  ?? 'https://bsc-dataseed1.binance.org';
const BSC_TESTNET_RPC_URL = process.env.CHAIN_INDEXER_BSC_TESTNET_RPC_URL
  ?? process.env.BSC_TESTNET_RPC_URL
  ?? 'https://data-seed-prebsc-1-s1.binance.org:8545';

type SupportedVestingChainId = 56 | 97;

export class VestingOnChainValidationError extends Error {}
export class VestingOnChainUnavailableError extends Error {}

export type WalletVestingSchedule = {
  totalAmount: bigint;
  releasedAmount: bigint;
  start: bigint;
  cliff: bigint;
  duration: bigint;
};

export type WalletVestingDependencies = {
  chainId: SupportedVestingChainId;
  vaultAddress: `0x${string}`;
  readSchedule: (walletAddress: `0x${string}`) => Promise<WalletVestingSchedule>;
  readReleasable: (walletAddress: `0x${string}`) => Promise<bigint>;
  readConfigFrozen: () => Promise<boolean>;
};

function supportedChain(chainId: number) {
  if (chainId === bsc.id) {
    return { chain: bsc, chainId: bsc.id as SupportedVestingChainId, rpcUrl: BSC_RPC_URL };
  }
  if (chainId === bscTestnet.id) {
    return {
      chain: bscTestnet,
      chainId: bscTestnet.id as SupportedVestingChainId,
      rpcUrl: BSC_TESTNET_RPC_URL,
    };
  }
  return null;
}

function productionDependencies(): WalletVestingDependencies {
  const chain = supportedChain(ukiSaleContracts.chainId);
  const vaultAddress = ukiSaleContracts.vestingVaultAddress;
  if (!chain || !vaultAddress || !isAddress(vaultAddress)) {
    throw new VestingOnChainUnavailableError('Vesting contract configuration is unavailable');
  }
  const canonicalVault = getAddress(vaultAddress) as `0x${string}`;
  const client = createPublicClient({
    chain: chain.chain,
    transport: http(chain.rpcUrl, { timeout: 8_000, retryCount: 1 }),
  });
  return {
    chainId: chain.chainId,
    vaultAddress: canonicalVault,
    readSchedule: async (walletAddress) => {
      const schedule = await client.readContract({
        address: canonicalVault,
        abi: vestingVaultAbi,
        functionName: 'scheduleOf',
        args: [walletAddress],
      });
      return {
        totalAmount: schedule.totalAmount,
        releasedAmount: schedule.releasedAmount,
        start: schedule.start,
        cliff: schedule.cliff,
        duration: schedule.duration,
      };
    },
    readReleasable: (walletAddress) => client.readContract({
      address: canonicalVault,
      abi: vestingVaultAbi,
      functionName: 'releasable',
      args: [walletAddress],
    }),
    readConfigFrozen: () => client.readContract({
      address: canonicalVault,
      abi: vestingVaultAbi,
      functionName: 'presaleVestingConfigFrozen',
    }),
  };
}

function safeTimestamp(value: bigint, label: string) {
  if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new VestingOnChainUnavailableError(`${label} is outside the supported timestamp range`);
  }
  return Number(value);
}

export async function readWalletVestingStatus(
  walletAddress: string,
  dependencies?: WalletVestingDependencies,
) {
  if (!isAddress(walletAddress) || /^0x0{40}$/i.test(walletAddress)) {
    throw new VestingOnChainValidationError('walletAddress is not a valid EVM address');
  }
  let runtime: WalletVestingDependencies;
  try {
    runtime = dependencies ?? productionDependencies();
  } catch (error) {
    if (error instanceof VestingOnChainUnavailableError) throw error;
    throw new VestingOnChainUnavailableError('Vesting runtime is unavailable');
  }
  if (
    (runtime.chainId !== 56 && runtime.chainId !== 97)
    || !isAddress(runtime.vaultAddress)
  ) {
    throw new VestingOnChainUnavailableError('Vesting runtime is invalid');
  }
  const walletNormalized = getAddress(walletAddress).toLowerCase() as `0x${string}`;
  try {
    const [schedule, releasable, configFrozen] = await Promise.all([
      runtime.readSchedule(walletNormalized),
      runtime.readReleasable(walletNormalized),
      runtime.readConfigFrozen(),
    ]);
    const values = [
      schedule.totalAmount,
      schedule.releasedAmount,
      schedule.start,
      schedule.cliff,
      schedule.duration,
      releasable,
    ];
    if (values.some((value) => typeof value !== 'bigint' || value < BigInt(0))) {
      throw new VestingOnChainUnavailableError('Vesting contract returned invalid values');
    }
    const vestedAmount = schedule.releasedAmount + releasable;
    if (vestedAmount > schedule.totalAmount) {
      throw new VestingOnChainUnavailableError('Vesting amounts exceed the allocation');
    }
    const lockedAmount = schedule.totalAmount - vestedAmount;
    const progressBps = schedule.totalAmount === BigInt(0)
      ? 0
      : Number((vestedAmount * BigInt(10_000)) / schedule.totalAmount);
    const start = safeTimestamp(schedule.start, 'start');
    const cliff = safeTimestamp(schedule.cliff, 'cliff');
    const duration = safeTimestamp(schedule.duration, 'duration');
    const end = start > 0 && duration > 0 && start <= Number.MAX_SAFE_INTEGER - duration
      ? start + duration
      : null;
    return {
      walletNormalized,
      chainId: runtime.chainId,
      vaultAddress: getAddress(runtime.vaultAddress).toLowerCase() as `0x${string}`,
      configFrozen,
      hasPosition: schedule.totalAmount > BigInt(0),
      totalAmountRaw: schedule.totalAmount.toString(),
      releasedAmountRaw: schedule.releasedAmount.toString(),
      releasableRaw: releasable.toString(),
      lockedAmountRaw: lockedAmount.toString(),
      progressBps,
      schedule: { start, cliff, duration, end },
    };
  } catch (error) {
    if (error instanceof VestingOnChainUnavailableError) throw error;
    throw new VestingOnChainUnavailableError('Vesting contract reads failed');
  }
}
