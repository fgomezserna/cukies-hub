import { createPublicClient } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { bscReadTransport, parseBscReadRpcUrls } from '@/lib/bsc-read-rpc';

const primary = 'https://primary.invalid/';
const secondary = 'https://secondary.invalid/';

function mockRpc(primaryChain: number | null, secondaryChain: number | null) {
  const requests: Array<{ url: string; method: string }> = [];
  (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body = JSON.parse(String(init?.body ?? await (input as Request).text()));
    requests.push({ url, method: body.method });
    const chain = url === primary ? primaryChain : secondaryChain;
    if (chain === null) return new Response('Unavailable', { status: 503 });
    return new Response(JSON.stringify({
      jsonrpc: '2.0', id: body.id,
      result: body.method === 'eth_chainId' ? `0x${chain.toString(16)}` : '0x7b',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return requests;
}

describe('BSC read RPC fallback', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([97, 56] as const)('recovers from primary HTTP 503 on chain %s', async (chainId) => {
    const requests = mockRpc(null, chainId);
    const client = createPublicClient({
      chain: chainId === 97 ? bscTestnet : bsc,
      transport: bscReadTransport([primary, secondary], chainId),
    });
    await expect(client.getBlockNumber()).resolves.toBe(BigInt(123));
    expect(requests).toEqual([
      { url: primary, method: 'eth_chainId' },
      { url: secondary, method: 'eth_chainId' },
      { url: secondary, method: 'eth_blockNumber' },
    ]);
  });

  it('never reads data from an endpoint on the wrong chain', async () => {
    const requests = mockRpc(56, 97);
    const client = createPublicClient({ chain: bscTestnet, transport: bscReadTransport([primary, secondary], 97) });
    await expect(client.getBlockNumber()).resolves.toBe(BigInt(123));
    expect(requests).not.toContainEqual({ url: primary, method: 'eth_blockNumber' });
  });

  it('rejects when every endpoint is unavailable rather than returning an empty balance', async () => {
    mockRpc(null, null);
    const client = createPublicClient({ chain: bscTestnet, transport: bscReadTransport([primary, secondary], 97) });
    await expect(client.getBlockNumber()).rejects.toThrow();
  });

  it('keeps the whole configured list and rejects malformed protocols', () => {
    expect(parseBscReadRpcUrls(` ${primary}, ${secondary},${primary}`)).toEqual([primary, secondary]);
    expect(parseBscReadRpcUrls(`${primary},file:///etc/config`)).toEqual([]);
  });
});
