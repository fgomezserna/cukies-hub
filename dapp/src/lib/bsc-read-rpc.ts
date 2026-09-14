import { custom, fallback, http, type Transport } from 'viem';

/** Keep the configured order and reject malformed endpoints before making reads. */
export function parseBscReadRpcUrls(value: string | undefined): string[] {
  const urls = value?.split(',').map((url) => url.trim()).filter(Boolean) ?? [];
  try {
    return [...new Set(urls.map((url) => {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('RPC_PROTOCOL_INVALID');
      return parsed.toString();
    }))];
  } catch {
    return [];
  }
}

/** Each fallback must prove its chain before it can return contract data. */
export function bscReadTransport(urls: string[], chainId: 56 | 97): Transport {
  if (urls.length === 0) throw new Error('BSC_READ_RPC_NOT_CONFIGURED');
  return fallback(urls.map((url): Transport => {
    let verifiedChain: Promise<void> | undefined;
    return (options) => {
      const upstream = http(url, { timeout: 8_000, retryCount: 0 })(options);
      return custom({
        async request(args) {
          verifiedChain ??= upstream.request({ method: 'eth_chainId' }).then((observed) => {
            if (Number(observed) !== chainId) throw new Error('BSC_READ_RPC_CHAIN_MISMATCH');
          }).catch((error) => {
            verifiedChain = undefined;
            throw error;
          });
          await verifiedChain;
          return upstream.request(args as Parameters<typeof upstream.request>[0]);
        },
      }, { retryCount: 0 })(options);
    };
  }), { retryCount: 0 });
}
