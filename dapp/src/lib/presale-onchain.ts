import { createPublicClient, formatUnits, http, isAddress, type Address } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { presaleAbi, ukiSaleContracts } from './contracts/uki-sale';

const BSC_RPC_URL =
  process.env.CHAIN_INDEXER_BSC_RPC_URL ??
  process.env.BSC_RPC_URL ??
  'https://bsc-dataseed1.binance.org';

const BSC_TESTNET_RPC_URL =
  process.env.CHAIN_INDEXER_BSC_TESTNET_RPC_URL ??
  process.env.BSC_TESTNET_RPC_URL ??
  'https://data-seed-prebsc-1-s1.binance.org:8545';

type SupportedPresaleChainId = 56 | 97;

export type OnChainPresalePurchaseTotals = {
  asmPurchasedRaw: bigint;
  ukiPurchasedRaw: bigint;
  totalAsmPurchased: number;
  totalUkiPurchased: number;
};

function getPresaleChainConfig(chainId: number) {
  if (chainId === bsc.id) {
    return { chain: bsc, rpcUrl: BSC_RPC_URL, chainId: bsc.id as SupportedPresaleChainId };
  }

  if (chainId === bscTestnet.id) {
    return { chain: bscTestnet, rpcUrl: BSC_TESTNET_RPC_URL, chainId: bscTestnet.id as SupportedPresaleChainId };
  }

  return null;
}

function toTokenNumber(value: bigint) {
  const numeric = Number(formatUnits(value, 18));
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function readOnChainPresalePurchaseTotals(walletAddress: string) {
  const presaleAddress = ukiSaleContracts.presaleAddress;
  const chainConfig = getPresaleChainConfig(ukiSaleContracts.chainId);

  if (!presaleAddress || !isAddress(presaleAddress) || !isAddress(walletAddress) || !chainConfig) {
    return null;
  }

  const client = createPublicClient({
    chain: chainConfig.chain,
    transport: http(chainConfig.rpcUrl),
  });

  const [asmPurchasedRaw, ukiPurchasedRaw] = await Promise.all([
    client.readContract({
      address: presaleAddress as Address,
      abi: presaleAbi,
      functionName: 'asmPurchased',
      args: [walletAddress as Address],
    }),
    client.readContract({
      address: presaleAddress as Address,
      abi: presaleAbi,
      functionName: 'ukiPurchased',
      args: [walletAddress as Address],
    }),
  ]);

  return {
    asmPurchasedRaw,
    ukiPurchasedRaw,
    totalAsmPurchased: toTokenNumber(asmPurchasedRaw),
    totalUkiPurchased: toTokenNumber(ukiPurchasedRaw),
  } satisfies OnChainPresalePurchaseTotals;
}

