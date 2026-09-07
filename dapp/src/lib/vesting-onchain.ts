import { createPublicClient, getAddress, isAddress } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { ukiSaleContracts, vestingVaultAbi } from '@/lib/contracts/uki-sale';
import { bscReadTransport, parseBscReadRpcUrls } from '@/lib/bsc-read-rpc';

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
    return { chain: bsc, chainId: bsc.id as SupportedVestingChainId };
  }
  if (chainId === bscTestnet.id) {
    return {
      chain: bscTestnet,
      chainId: bscTestnet.id as SupportedVestingChainId,
    };
  }
  return null;
}

export function vestingRpcUrls(
  chainId: SupportedVestingChainId,
  environment: Record<string, string | undefined> = process.env,
) {
  const configured = chainId === 97
    ? environment.CHAIN_INDEXER_BSC_TESTNET_RPC_URLS?.trim()
      || environment.CHAIN_INDEXER_BSC_TESTNET_RPC_URL?.trim()
      || environment.BSC_TESTNET_RPC_URL?.trim()
      || environment.CHAIN_INDEXER_BSC_RPC_URLS?.trim()
      || environment.CHAIN_INDEXER_BSC_RPC_URL?.trim()
    : environment.CHAIN_INDEXER_BSC_RPC_URLS?.trim()
      || environment.CHAIN_INDEXER_BSC_RPC_URL?.trim()
      || environment.BSC_RPC_URL?.trim();
  if (configured) return parseBscReadRpcUrls(configured);
  return chainId === 97
    ? ['https://data-seed-prebsc-1-s1.binance.org:8545', 'https://bsc-testnet-rpc.publicnode.com']
    : ['https://bsc-dataseed1.binance.org', 'https://bsc-rpc.publicnode.com'];
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
    transport: bscReadTransport(vestingRpcUrls(chain.chainId), chain.chainId),
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
