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
  isTronLink?: boolean;
  isTronlink?: boolean;
  selectedAddress?: string | null;
  defaultAddress?: { base58?: string; hex?: string };
};

export type TronProviderAnnouncementInfo = {
  name?: string;
  rdns?: string;
  uuid?: string;
  icon?: string;
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

function isTronLinkAnnouncement(info: unknown) {
  if (!info || typeof info !== 'object') return false;
  const announcement = info as TronProviderAnnouncementInfo;
  const name = announcement.name?.trim().toLowerCase();
  const rdns = announcement.rdns?.trim().toLowerCase();
  return name === 'tronlink' && (!rdns || rdns === 'org.tronlink.www');
}

function hasExplicitTronCapability(provider: TronLinkProviderLike) {
  // The announced TIP/EIP provider must expose the native TRON surface. A
  // generic EVM provider (including TronLink's EVM surface) can also expose
  // request/on and an isTronLink marker, but it has no nested tronWeb.
  return Boolean(provider.tronWeb);
}

function hasProviderSignal(provider?: TronLinkProviderLike | null) {
  return Boolean(provider && (provider.request || provider.on));
}

function tronWebCandidates(currentWindow: Window) {
  // TronLink can expose a read-only legacy `window.tronWeb` alongside the
  // signer-backed instance nested under its provider. Keep both surfaces, but
  // let the signer-backed candidate win when a write is requested.
  return [
    currentWindow.tron?.tronWeb,
    announcedTronProvider?.tronWeb,
    currentWindow.tronLink?.tronWeb,
    currentWindow.tronWeb,
  ].filter((candidate): candidate is TronWebLike => Boolean(candidate));
}

function hasTronWebSignerShape(value?: TronWebLike | null) {
  return Boolean(
    value?.trx?.sign
      && value.contract
      && (value.defaultAddress?.base58 || value.defaultAddress?.hex),
  );
}

/**
 * A signer is valid only when its TronWeb instance is tied to an injected
 * wallet provider. TronWeb's read-only SDK also exposes `trx.sign`, so the
 * method shape alone must never authorize a write.
 */
export function isTronWebSignerReady(value?: TronWebLike | null) {
  if (!value || !hasTronWebSignerShape(value) || value.ready === false) return false;
  const currentWindow = browserWindow();
  if (!currentWindow) return false;
  const providers = [currentWindow.tron, announcedTronProvider, currentWindow.tronLink]
    .filter((provider): provider is TronLinkProviderLike => hasProviderSignal(provider));
  if (providers.some((provider) => provider.tronWeb === value)) return true;

  // Older TronLink builds expose only `window.tronWeb`; its explicit ready
  // marker distinguishes the injected signer from a plain SDK reader.
  return currentWindow.tronWeb === value && value.ready === true;
}

/**
 * A TronWeb-shaped object can expose `trx.sign` even when it was created as a
 * read-only SDK client. Only instances associated with an injected TronLink
 * provider are eligible for a wallet write.
 */
export function isTronWebWalletSignerReady(value?: TronWebLike | null) {
  return isTronWebSignerReady(value);
}

export function registerTronProvider(
  candidate: unknown,
  info?: unknown,
) {
  if (!candidate || typeof candidate !== 'object') return null;
  const provider = candidate as TronLinkProviderLike;
  if (!isTronLinkAnnouncement(info) || !hasExplicitTronCapability(provider)) return null;
  if (!provider.request && !provider.on && !provider.selectedAddress && !provider.defaultAddress) return null;
  announcedTronProvider = provider;
  return provider;
}

/** Clears the event-discovered provider between isolated browser/test sessions. */
export function clearRegisteredTronProvider() {
  announcedTronProvider = null;
}

export function resolveTronProvider(): TronLinkProviderLike | null {
  const currentWindow = browserWindow();
  if (!currentWindow) return null;
  const candidates = [currentWindow.tron, announcedTronProvider, currentWindow.tronLink, currentWindow.tronWeb];
  const providerWithSignal = candidates.find((candidate) => {
    const provider = candidate as TronLinkProviderLike;
    return Boolean(provider && (provider.request || provider.on));
  }) as TronLinkProviderLike | undefined;
  if (providerWithSignal) return providerWithSignal;

  // Older TronLink builds expose only `window.tronWeb`. A plain TronWeb SDK
  // reader has the same address fields but no wallet readiness marker; accept
  // this fallback only when the injected instance explicitly reports ready.
  return candidates.find((candidate) => {
    if (!candidate) return false;
    const provider = candidate as TronLinkProviderLike;
    if (candidate === currentWindow.tronWeb) {
      const tronWeb = candidate as unknown as TronWebLike;
      return tronWeb.ready === true && Boolean(tronWeb.defaultAddress?.base58 || tronWeb.defaultAddress?.hex);
    }
    return Boolean(provider.selectedAddress || provider.defaultAddress);
  }) as TronLinkProviderLike | undefined ?? null;
}

export function resolveTronWeb(): TronWebLike | null {
  const currentWindow = browserWindow();
  if (!currentWindow) return null;
  const candidates = tronWebCandidates(currentWindow);
  return candidates.find(isTronWebWalletSignerReady)
    ?? candidates.find(hasTronWebSignerShape)
    ?? candidates[0]
    ?? null;
}

export function resolveTronSignerWeb(): TronWebLike | null {
  const currentWindow = browserWindow();
  if (!currentWindow) return null;
  return tronWebCandidates(currentWindow).find(isTronWebWalletSignerReady) ?? null;
}

export function resolveTronAddress(tronWeb = resolveTronWeb()) {
  const currentWindow = browserWindow();
  if (!currentWindow) return null;
  if (tronWeb && isTronWebSignerReady(tronWeb)) {
    return tronWeb.defaultAddress?.base58
      ?? tronWeb.defaultAddress?.hex
      ?? null;
  }
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
