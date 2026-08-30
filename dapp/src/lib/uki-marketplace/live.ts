import 'server-only';

import {
  createPublicClient,
  http,
  isAddress,
  type Address,
  type ContractFunctionParameters,
} from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { ukiMarketplaceNftReadAbi, ukiMarketplaceReadAbi } from './abi';
import type {
  IndexedUkiMarketplaceOrder,
  UkiMarketplaceLiveInspection,
  UkiMarketplaceRuntime,
} from './types';

export interface UkiMarketplaceLiveReader {
  inspectOrders(
    orders: IndexedUkiMarketplaceOrder[],
  ): Promise<Map<string, UkiMarketplaceLiveInspection>>;
}

function unavailable(orders: IndexedUkiMarketplaceOrder[]) {
  return new Map(orders.map((order) => [
    order.orderId,
    {
      contractState: null,
      ownerNormalized: null,
      marketplaceApproved: null,
    } satisfies UkiMarketplaceLiveInspection,
  ]));
}

function successfulResult(result: unknown) {
  if (!result || typeof result !== 'object' || !('status' in result)) return null;
  const candidate = result as { status: string; result?: unknown };
  return candidate.status === 'success' ? candidate.result : null;
}

export class ViemUkiMarketplaceLiveReader implements UkiMarketplaceLiveReader {
  constructor(private readonly runtime: UkiMarketplaceRuntime) {}

  async inspectOrders(orders: IndexedUkiMarketplaceOrder[]) {
    if (
      orders.length === 0
      || !this.runtime.ready
      || !this.runtime.marketplaceAddress
      || !this.runtime.rpcUrl
      || !this.runtime.chainId
    ) {
      return orders.length === 0 ? new Map() : unavailable(orders);
    }

    const marketplaceAddress = this.runtime.marketplaceAddress as Address;
    const contracts: ContractFunctionParameters[] = [];
    for (const order of orders) {
      if (!/^\d+$/.test(order.tokenId)) return unavailable(orders);
      const collection = order.collectionAddress as Address;
      const seller = order.seller as Address;
      contracts.push(
        {
          address: marketplaceAddress,
          abi: ukiMarketplaceReadAbi,
          functionName: 'orderState',
          args: [order.orderId],
        },
        {
          address: collection,
          abi: ukiMarketplaceNftReadAbi,
          functionName: 'ownerOf',
          args: [BigInt(order.tokenId)],
        },
        {
          address: collection,
          abi: ukiMarketplaceNftReadAbi,
          functionName: 'getApproved',
          args: [BigInt(order.tokenId)],
        },
        {
          address: collection,
          abi: ukiMarketplaceNftReadAbi,
          functionName: 'isApprovedForAll',
          args: [seller, marketplaceAddress],
        },
      );
    }

    try {
      const client = createPublicClient({
        chain: this.runtime.chainId === 97 ? bscTestnet : bsc,
        transport: http(this.runtime.rpcUrl, { timeout: 8_000, retryCount: 1 }),
      });
      const results = await client.multicall({ contracts, allowFailure: true });
      const inspections = new Map<string, UkiMarketplaceLiveInspection>();
      orders.forEach((order, index) => {
        const offset = index * 4;
        const rawState = successfulResult(results[offset]);
        const rawOwner = successfulResult(results[offset + 1]);
        const rawApproved = successfulResult(results[offset + 2]);
        const rawApprovedForAll = successfulResult(results[offset + 3]);
        const numericState = typeof rawState === 'number'
          ? rawState
          : typeof rawState === 'bigint'
            ? Number(rawState)
            : null;
        const contractState = numericState !== null
          && Number.isInteger(numericState)
          && numericState >= 0
          && numericState <= 5
          ? numericState as 0 | 1 | 2 | 3 | 4 | 5
          : null;
        const ownerNormalized = typeof rawOwner === 'string'
          && isAddress(rawOwner, { strict: false })
          ? rawOwner.toLowerCase() as `0x${string}`
          : null;
        const tokenApproved = typeof rawApproved === 'string'
          && isAddress(rawApproved, { strict: false })
          ? rawApproved.toLowerCase() === marketplaceAddress.toLowerCase()
          : null;
        const approvedForAll = typeof rawApprovedForAll === 'boolean'
          ? rawApprovedForAll
          : null;
        const marketplaceApproved = tokenApproved === true || approvedForAll === true
          ? true
          : tokenApproved === false && approvedForAll === false
            ? false
            : null;

        inspections.set(order.orderId, {
          contractState,
          ownerNormalized,
          marketplaceApproved,
        });
      });
      return inspections;
    } catch {
      return unavailable(orders);
    }
  }
}
