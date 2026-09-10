import 'server-only';

import {
  createPublicClient,
  formatUnits,
  isAddress,
  type Address,
} from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { bscReadTransport } from '@/lib/bsc-read-rpc';
import { erc20Abi, ukiSaleContracts } from '@/lib/contracts/uki-sale';
import { listMyCukieCollection } from '@/lib/cukies-data/my-collection';
import { getCompetitionCreditWalletStatus } from '@/lib/uki-economy/credits';
import { vestingRpcUrls } from '@/lib/vesting-onchain';
import type { AccountSummary } from '@/lib/account-summary-types';

type SupportedBscChainId = 56 | 97;

function chainConfig(chainId: SupportedBscChainId) {
  if (chainId === 56) return { chain: bsc, label: 'BNB Smart Chain' } as const;
  if (chainId === 97) return { chain: bscTestnet, label: 'BNB Smart Chain Testnet' } as const;
  return null;
}

function configuredChainId(): SupportedBscChainId | null {
  const chainId = ukiSaleContracts.chainId;
  return chainId === 56 || chainId === 97 ? chainId : null;
}

const collectionCountFields = [
  'total',
  'inWallet',
  'available',
  'onSale',
  'inPool',
  'inCukieMaster',
  'otherInUse',
] as const;

type CollectionCounts = Record<typeof collectionCountFields[number], number>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readCollectionCounts(value: unknown): CollectionCounts | null {
  if (!isRecord(value)) return null;
  const counts = {} as CollectionCounts;
  for (const field of collectionCountFields) {
    const count = value[field];
    if (!Number.isSafeInteger(count) || (count as number) < 0) return null;
    counts[field] = count as number;
  }
  return counts;
}

/**
 * The collection adapter is the source of truth for custody totals. Do not
 * infer complete coverage from a `summary` field alone: a response explicitly
 * marked partial/unavailable is treated as unavailable to the account menu.
 */
function normalizeCollectionSummary(value: unknown): AccountSummary['cukies'] {
  if (!isRecord(value) || !isRecord(value.summary)) return null;
  const rawSummary = value.summary;
  const rawCoverage = typeof value.coverage === 'string'
    ? value.coverage
    : typeof rawSummary.coverage === 'string'
      ? rawSummary.coverage
      : undefined;
  const counts = readCollectionCounts(rawSummary);
  if (rawCoverage !== undefined && rawCoverage !== 'complete') return null;
  if (!counts || !Array.isArray(value.items)) return null;

  // `inWallet` includes the available/listed/other-in-use subsets. Deposited
  // Cukies are separate custodial buckets and must still contribute to total.
  if (
    counts.total !== value.items.length
    || counts.inWallet + counts.inPool + counts.inCukieMaster !== counts.total
    || counts.available + counts.onSale + counts.otherInUse !== counts.inWallet
    || counts.available > counts.inWallet
    || counts.onSale > counts.inWallet
    || counts.otherInUse > counts.inWallet
  ) return null;

  return { ...counts, coverage: 'complete', source: 'collection' };
}

function formatTokenBalance(value: bigint, decimals: number) {
  const formatted = formatUnits(value, decimals);
  return formatted.includes('.')
    ? formatted.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1')
    : formatted;
}

async function readUkiBalance(walletAddress: string) {
  const tokenAddress = ukiSaleContracts.ukiTokenAddress;
  const chainId = configuredChainId();
  const configuredChain = chainId === null ? null : chainConfig(chainId);
  if (!tokenAddress || !isAddress(tokenAddress) || !isAddress(walletAddress) || !configuredChain || chainId === null) return null;

  const client = createPublicClient({
    chain: configuredChain.chain,
    transport: bscReadTransport(vestingRpcUrls(chainId), chainId),
  });
  const balance = await client.readContract({
    address: tokenAddress as Address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress as Address],
  });
  const decimals = 18;
  return {
    balance: formatTokenBalance(balance, decimals),
    balanceRaw: balance.toString(),
    decimals,
    symbol: 'UKI' as const,
    source: 'wallet' as const,
  };
}

export async function getWalletAccountSummary(walletAddress: string): Promise<AccountSummary> {
  const walletNormalized = walletAddress.toLowerCase();
  const [ukiResult, creditsResult, cukiesResult] = await Promise.allSettled([
    readUkiBalance(walletAddress),
    getCompetitionCreditWalletStatus(walletAddress),
    listMyCukieCollection(walletAddress),
  ]);

  const credits = creditsResult.status === 'fulfilled'
    ? {
        availableCredits: creditsResult.value.materialization.balance === 'ready'
          ? creditsResult.value.balance.availableCredits
          : null,
        reservedCredits: creditsResult.value.balance.reservedCredits,
        spentCredits: creditsResult.value.balance.spentCredits,
        blocked: creditsResult.value.balance.blocked,
        materialization: creditsResult.value.materialization.balance,
        source: 'account' as const,
      }
    : null;
  const cukies = cukiesResult.status === 'fulfilled'
    ? normalizeCollectionSummary(cukiesResult.value)
    : null;

  const chainId = configuredChainId();

  return {
    walletNormalized,
    chainId,
    network: {
      chainId,
      label: chainId === null ? 'BNB Smart Chain' : chainConfig(chainId)?.label ?? 'BNB Smart Chain',
    },
    uki: ukiResult.status === 'fulfilled' ? ukiResult.value : null,
    credits,
    cukies,
  };
}
