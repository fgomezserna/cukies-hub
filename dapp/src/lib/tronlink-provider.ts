export const TRON_MAINNET_CHAIN_ID = '0x2b6653dc';
export const TRON_SHASTA_CHAIN_ID = '0x94a9059e';
export const TRON_NILE_CHAIN_ID = '0xcd8690dc';

export type TronWebLike = {
  ready?: boolean;
  chainId?: string;
  fullNode?: { host?: string };
  defaultAddress?: { base58?: string; hex?: string };
  address?: { toHex?: (address: string) => string };
  toHex?: (value: string) => string;
  contract?: (...args: unknown[]) => unknown;
  trx?: { sign?: (message: unknown) => Promise<unknown> };
};

export type TronLinkProviderLike = {
  request?: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  chainId?: string;
  tronWeb?: TronWebLike;
  selectedAddress?: string | null;
  defaultAddress?: { base58?: string; hex?: string };
};

declare global {
  interface Window {
    tron?: TronLinkProviderLike;
    tronWeb?: TronWebLike;
    tronLink?: TronLinkProviderLike;
  }
}

function browserWindow() {
  return typeof window === 'undefined' ? null : window;
}

let announcedTronProvider: TronLinkProviderLike | null = null;

export function registerTronProvider(candidate: unknown) {
  if (!candidate || typeof candidate !== 'object') return null;
  const provider = candidate as TronLinkProviderLike;
  if (!provider.request && !provider.on && !provider.selectedAddress && !provider.defaultAddress) return null;
  announcedTronProvider = provider;
  return provider;
}

export function resolveTronProvider(): TronLinkProviderLike | null {
  const currentWindow = browserWindow();
  if (!currentWindow) return null;
  const candidates = [currentWindow.tron, currentWindow.tronLink, currentWindow.tronWeb, announcedTronProvider];
  return candidates.find((candidate) => {
    const provider = candidate as TronLinkProviderLike;
    return Boolean(provider && (provider.request || provider.on));
  }) as TronLinkProviderLike | undefined
    ?? candidates.find((candidate) => {
      const provider = candidate as TronLinkProviderLike;
      return Boolean(provider && (provider.selectedAddress || provider.defaultAddress));
    }) as TronLinkProviderLike | undefined
    ?? null;
}

export function resolveTronWeb(): TronWebLike | null {
  const currentWindow = browserWindow();
  if (!currentWindow) return null;
  return currentWindow.tronWeb
    ?? currentWindow.tronLink?.tronWeb
    ?? currentWindow.tron?.tronWeb
    ?? announcedTronProvider?.tronWeb
    ?? null;
}

export function resolveTronAddress(tronWeb = resolveTronWeb()) {
  const currentWindow = browserWindow();
  if (!currentWindow) return null;
  return currentWindow.tron?.selectedAddress
    ?? currentWindow.tron?.defaultAddress?.base58
    ?? tronWeb?.defaultAddress?.base58
    ?? tronWeb?.defaultAddress?.hex
    ?? currentWindow.tronLink?.tronWeb?.defaultAddress?.base58
    ?? currentWindow.tronLink?.selectedAddress
    ?? announcedTronProvider?.selectedAddress
    ?? announcedTronProvider?.defaultAddress?.base58
    ?? announcedTronProvider?.defaultAddress?.hex
    ?? null;
}

export function canonicalTronChainId(value?: string | number | null) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  if (/^0x[0-9a-f]+$/.test(raw)) return raw;
  if (/^\d+$/.test(raw)) return `0x${BigInt(raw).toString(16)}`;
  return null;
}

function hostFrom(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function chainIdFromTronHost(value?: string | null) {
  const host = hostFrom(value);
  if (host === 'api.trongrid.io') return TRON_MAINNET_CHAIN_ID;
  if (host === 'api.shasta.trongrid.io') return TRON_SHASTA_CHAIN_ID;
  if (host === 'nile.trongrid.io') return TRON_NILE_CHAIN_ID;
  return null;
}

export function resolveTronChainId(
  provider = resolveTronProvider(),
  tronWeb = resolveTronWeb(),
) {
  return canonicalTronChainId(provider?.chainId)
    ?? canonicalTronChainId(provider?.tronWeb?.chainId)
    ?? canonicalTronChainId(tronWeb?.chainId)
    ?? chainIdFromTronHost(tronWeb?.fullNode?.host);
}

export type TronNetwork = 'mainnet' | 'shasta' | 'nile' | 'unknown';

export function tronNetworkFromChainId(chainId?: string | null): TronNetwork {
  const normalized = canonicalTronChainId(chainId);
  if (normalized === TRON_MAINNET_CHAIN_ID) return 'mainnet';
  if (normalized === TRON_SHASTA_CHAIN_ID) return 'shasta';
  if (normalized === TRON_NILE_CHAIN_ID) return 'nile';
  return 'unknown';
}

export function tronNodeHost(tronWeb = resolveTronWeb()) {
  return hostFrom(tronWeb?.fullNode?.host);
}
