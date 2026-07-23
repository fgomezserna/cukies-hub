import type { Connector } from 'wagmi';
import type { EIP1193Provider } from 'viem';

export const TRONLINK_EVM_CONNECTOR_ID = 'tronLinkEvm';
export const SAFEPAL_EVM_CONNECTOR_ID = 'safePalEvm';
export const TRUST_WALLET_EVM_CONNECTOR_ID = 'trustWalletEvm';
export const TOKENPOCKET_EVM_CONNECTOR_ID = 'tokenPocketEvm';

export type MobileWalletId = 'safepal' | 'trustWallet' | 'metaMask' | 'tokenPocket';

type ConnectorLike = Pick<Connector, 'icon' | 'id' | 'name' | 'type' | 'rdns'>;

type TaggedEvmProvider = EIP1193Provider & {
  isMetaMask?: true;
  isSafePal?: true;
  isTokenPocket?: true;
  isTrust?: true;
  isTrustWallet?: true;
  rdns?: string;
};

type BrowserWindowWithTronLink = {
  ethereum?: TaggedEvmProvider & {
    providers?: TaggedEvmProvider[];
    isPhantom?: boolean;
    isTronLink?: boolean;
    isTronlink?: boolean;
    rdns?: string;
  };
  phantom?: { ethereum?: EIP1193Provider };
  safepalProvider?: TaggedEvmProvider;
  tokenpocket?: { ethereum?: TaggedEvmProvider };
  trustwallet?: { ethereum?: TaggedEvmProvider };
  tron?: { ethereum?: EIP1193Provider };
  tronLink?: { ethereum?: EIP1193Provider; provider?: EIP1193Provider };
};

const CONNECTOR_ORDER = [
  SAFEPAL_EVM_CONNECTOR_ID,
  TRUST_WALLET_EVM_CONNECTOR_ID,
  'metaMask',
  TOKENPOCKET_EVM_CONNECTOR_ID,
  TRONLINK_EVM_CONNECTOR_ID,
  'injected',
  'walletConnect',
  'coinbaseWalletSDK',
  'coinbaseWallet',
  'safe',
];

function normalizeConnectorText(value?: string | readonly string[]) {
  if (typeof value === 'string') return value.toLowerCase();
  return value?.join(' ').toLowerCase() ?? '';
}

export function isWalletConnectConnector(connector: ConnectorLike) {
  return connector.id === 'walletConnect' || connector.type === 'walletConnect';
}

export function isCoinbaseWalletConnector(connector: ConnectorLike) {
  const text = `${connector.id} ${connector.name} ${connector.type} ${normalizeConnectorText(connector.rdns)}`;
  return text.toLowerCase().includes('coinbase');
}

export function isPhantomConnector(connector: ConnectorLike) {
  const text = `${connector.id} ${connector.name} ${connector.type} ${normalizeConnectorText(connector.rdns)}`;
  return text.toLowerCase().includes('phantom');
}

export function isMetaMaskConnector(connector: ConnectorLike) {
  const text = `${connector.id} ${connector.name} ${connector.type} ${normalizeConnectorText(connector.rdns)}`;
  return connector.id === 'metaMask' || text.toLowerCase().includes('metamask');
}

export function isSafePalConnector(connector: ConnectorLike) {
  const text = `${connector.id} ${connector.name} ${connector.type} ${normalizeConnectorText(connector.rdns)}`;
  return connector.id === SAFEPAL_EVM_CONNECTOR_ID || text.toLowerCase().includes('safepal');
}

export function isTrustWalletConnector(connector: ConnectorLike) {
  const text = `${connector.id} ${connector.name} ${connector.type} ${normalizeConnectorText(connector.rdns)}`;
  const normalized = text.toLowerCase();
  return connector.id === TRUST_WALLET_EVM_CONNECTOR_ID ||
    normalized.includes('trust wallet') ||
    normalized.includes('trustwallet');
}

export function isTokenPocketConnector(connector: ConnectorLike) {
  const text = `${connector.id} ${connector.name} ${connector.type} ${normalizeConnectorText(connector.rdns)}`;
  const normalized = text.toLowerCase();
  return connector.id === TOKENPOCKET_EVM_CONNECTOR_ID ||
    normalized.includes('tokenpocket') ||
    normalized.includes('token pocket');
}

export function isTronLinkEvmConnector(connector: ConnectorLike) {
  const text = `${connector.id} ${connector.name} ${connector.type} ${normalizeConnectorText(connector.rdns)}`;
  return connector.id === TRONLINK_EVM_CONNECTOR_ID || text.toLowerCase().includes('tronlink');
}

function findProvider(
  windowObject: unknown,
  predicate: (provider: TaggedEvmProvider) => boolean,
) {
  const browserWindow = windowObject as BrowserWindowWithTronLink | undefined;
  const providers = browserWindow?.ethereum?.providers ?? [];
  return providers.find(predicate);
}

export function findSafePalEvmProvider(windowObject?: unknown) {
  const browserWindow = windowObject as BrowserWindowWithTronLink | undefined;
  return browserWindow?.safepalProvider ?? findProvider(windowObject, (provider) => (
    Boolean(provider.isSafePal || provider.rdns?.toLowerCase().includes('safepal'))
  ));
}

export function findTrustWalletEvmProvider(windowObject?: unknown) {
  const browserWindow = windowObject as BrowserWindowWithTronLink | undefined;
  if (browserWindow?.trustwallet?.ethereum) return browserWindow.trustwallet.ethereum;
  if (browserWindow?.ethereum?.isTrust || browserWindow?.ethereum?.isTrustWallet) {
    return browserWindow.ethereum;
  }
  return findProvider(windowObject, (provider) => Boolean(
    provider.isTrust ||
    provider.isTrustWallet ||
    provider.rdns?.toLowerCase().includes('trustwallet'),
  ));
}

export function findTokenPocketEvmProvider(windowObject?: unknown) {
  const browserWindow = windowObject as BrowserWindowWithTronLink | undefined;
  if (browserWindow?.tokenpocket?.ethereum) return browserWindow.tokenpocket.ethereum;
  if (browserWindow?.ethereum?.isTokenPocket) return browserWindow.ethereum;
  return findProvider(windowObject, (provider) => Boolean(
    provider.isTokenPocket ||
    provider.rdns?.toLowerCase().includes('tokenpocket'),
  ));
}

export function findTronLinkEvmProvider(windowObject?: unknown) {
  const browserWindow = windowObject as BrowserWindowWithTronLink | undefined;

  const providers = browserWindow?.ethereum?.providers ?? [];
  const tronProvider = providers.find((provider: EIP1193Provider) => {
    const candidate = provider as EIP1193Provider & {
      isTronLink?: boolean;
      isTronlink?: boolean;
      rdns?: string;
    };

    return Boolean(
      candidate.isTronLink ||
        candidate.isTronlink ||
        candidate.rdns?.toLowerCase().includes('tronlink'),
    );
  });

  if (tronProvider) return tronProvider;
  if (browserWindow?.ethereum?.isTronLink || browserWindow?.ethereum?.isTronlink) {
    return browserWindow.ethereum;
  }

  return browserWindow?.tronLink?.ethereum ?? browserWindow?.tron?.ethereum ?? browserWindow?.tronLink?.provider;
}

export function hasTronLinkEvmProvider(windowObject?: unknown) {
  return Boolean(findTronLinkEvmProvider(windowObject));
}

function isPhantomProvider(provider?: EIP1193Provider | null) {
  const candidate = provider as (EIP1193Provider & { isPhantom?: boolean; rdns?: string }) | undefined;
  return Boolean(candidate?.isPhantom || candidate?.rdns?.toLowerCase().includes('phantom'));
}

function isDefaultInjectedPhantomProvider(windowObject?: unknown) {
  const browserWindow = windowObject as BrowserWindowWithTronLink | undefined;
  return isPhantomProvider(browserWindow?.ethereum);
}

export function getConnectorDisplayName(connector: ConnectorLike) {
  if (isPhantomConnector(connector)) return 'Phantom';
  if (isSafePalConnector(connector)) return 'SafePal';
  if (isTrustWalletConnector(connector)) return 'Trust Wallet';
  if (isMetaMaskConnector(connector)) return 'MetaMask';
  if (isTokenPocketConnector(connector)) return 'TokenPocket';
  if (isTronLinkEvmConnector(connector)) return 'TronLink EVM';
  if (isWalletConnectConnector(connector)) return 'WalletConnect';
  if (isCoinbaseWalletConnector(connector)) return 'Coinbase Wallet';
  if (connector.id === 'injected' && connector.name === 'Injected') return 'Browser wallet';

  return connector.name || 'Wallet EVM';
}

export function getConnectorDescription(connector: ConnectorLike) {
  if (isPhantomConnector(connector)) {
    return 'No disponible para la preventa en BNB Smart Chain.';
  }

  if (isSafePalConnector(connector)) {
    return 'SafePal móvil o extensión en BNB Smart Chain.';
  }

  if (isTrustWalletConnector(connector)) {
    return 'Trust Wallet móvil o extensión en BNB Smart Chain.';
  }

  if (isMetaMaskConnector(connector)) {
    return 'Extension, navegador movil o deep link oficial.';
  }

  if (isTokenPocketConnector(connector)) {
    return 'TokenPocket móvil mediante su navegador DApp.';
  }

  if (isTronLinkEvmConnector(connector)) {
    return 'TronLink en modo EVM para BNB Smart Chain.';
  }

  if (isWalletConnectConnector(connector)) {
    return 'QR o deep link para wallets moviles compatibles.';
  }

  if (isCoinbaseWalletConnector(connector)) {
    return 'Coinbase Wallet extension o app movil.';
  }

  if (connector.id === 'injected') {
    return 'MetaMask, Rabby, Trust, OKX, Binance Wallet o TronLink EVM.';
  }

  return 'Conector EVM compatible con la red BSC.';
}

export function getConnectorLogoSrc(connector: ConnectorLike) {
  if (isMetaMaskConnector(connector)) return '/brand/wallets/metamask.svg';
  if (isTronLinkEvmConnector(connector)) return '/brand/wallets/tronlink.png';
  if (isWalletConnectConnector(connector)) return '/brand/wallets/walletconnect.svg';
  if (isCoinbaseWalletConnector(connector)) return '/brand/wallets/coinbase-wallet.svg';
  if (connector.icon) return connector.icon.trimStart();

  return null;
}

function getConnectorPriority(connector: ConnectorLike) {
  if (isPhantomConnector(connector)) return Number.POSITIVE_INFINITY;
  if (connector.id === SAFEPAL_EVM_CONNECTOR_ID) return CONNECTOR_ORDER.indexOf(SAFEPAL_EVM_CONNECTOR_ID);
  if (connector.id === TRUST_WALLET_EVM_CONNECTOR_ID) return CONNECTOR_ORDER.indexOf(TRUST_WALLET_EVM_CONNECTOR_ID);
  if (connector.id === TOKENPOCKET_EVM_CONNECTOR_ID) return CONNECTOR_ORDER.indexOf(TOKENPOCKET_EVM_CONNECTOR_ID);
  if (connector.id === TRONLINK_EVM_CONNECTOR_ID) return CONNECTOR_ORDER.indexOf(TRONLINK_EVM_CONNECTOR_ID);
  if (connector.id === 'metaMask') return CONNECTOR_ORDER.indexOf('metaMask');

  const exactIndex = CONNECTOR_ORDER.indexOf(connector.id);
  if (exactIndex >= 0) return exactIndex;

  if (isSafePalConnector(connector)) return CONNECTOR_ORDER.indexOf(SAFEPAL_EVM_CONNECTOR_ID) + 0.1;
  if (isTrustWalletConnector(connector)) return CONNECTOR_ORDER.indexOf(TRUST_WALLET_EVM_CONNECTOR_ID) + 0.1;
  if (isMetaMaskConnector(connector)) return CONNECTOR_ORDER.indexOf('metaMask') + 0.1;
  if (isTokenPocketConnector(connector)) return CONNECTOR_ORDER.indexOf(TOKENPOCKET_EVM_CONNECTOR_ID) + 0.1;
  if (isTronLinkEvmConnector(connector)) return CONNECTOR_ORDER.indexOf(TRONLINK_EVM_CONNECTOR_ID) + 0.1;
  if (isWalletConnectConnector(connector)) return CONNECTOR_ORDER.indexOf('walletConnect');
  if (isCoinbaseWalletConnector(connector)) return CONNECTOR_ORDER.indexOf('coinbaseWalletSDK');

  return CONNECTOR_ORDER.length;
}

export function getSortedWalletConnectors<TConnector extends ConnectorLike>(connectors: readonly TConnector[]) {
  const unique = new Map<string, TConnector>();

  for (const connector of connectors) {
    if (!unique.has(connector.id)) {
      unique.set(connector.id, connector);
    }
  }

  return Array.from(unique.values()).sort((left, right) => {
    const priorityDelta = getConnectorPriority(left) - getConnectorPriority(right);
    if (priorityDelta !== 0) return priorityDelta;
    return getConnectorDisplayName(left).localeCompare(getConnectorDisplayName(right));
  });
}

function getConnectorFamilyKey(connector: ConnectorLike) {
  if (isPhantomConnector(connector)) return 'phantom';
  if (isSafePalConnector(connector)) return 'safepal';
  if (isTrustWalletConnector(connector)) return 'trustwallet';
  if (isMetaMaskConnector(connector)) return 'metamask';
  if (isTokenPocketConnector(connector)) return 'tokenpocket';
  if (isTronLinkEvmConnector(connector)) return 'tronlink-evm';
  if (isWalletConnectConnector(connector)) return 'walletconnect';
  if (isCoinbaseWalletConnector(connector)) return 'coinbase';
  if (connector.id === 'injected' && connector.name === 'Injected') return 'browser-injected';

  return connector.id;
}

export function getVisibleWalletConnectors<TConnector extends ConnectorLike>(
  connectors: readonly TConnector[],
  windowObject?: unknown,
) {
  const browserWindow = windowObject ?? (typeof window === 'undefined' ? undefined : window);
  const hasDedicatedTronLinkProvider = hasTronLinkEvmProvider(browserWindow);
  const defaultInjectedProviderIsPhantom = isDefaultInjectedPhantomProvider(browserWindow);
  const visibleConnectors: TConnector[] = [];
  const seenFamilies = new Set<string>();

  for (const connector of getSortedWalletConnectors(connectors)) {
    if (isPhantomConnector(connector)) {
      continue;
    }

    if (connector.id === TRONLINK_EVM_CONNECTOR_ID) {
      if (!hasDedicatedTronLinkProvider) continue;
    }
    if (connector.id === SAFEPAL_EVM_CONNECTOR_ID && !findSafePalEvmProvider(browserWindow)) {
      continue;
    }
    if (
      connector.id === TRUST_WALLET_EVM_CONNECTOR_ID &&
      !findTrustWalletEvmProvider(browserWindow)
    ) {
      continue;
    }
    if (
      connector.id === TOKENPOCKET_EVM_CONNECTOR_ID &&
      !findTokenPocketEvmProvider(browserWindow)
    ) {
      continue;
    }

    if (connector.id === 'injected' && connector.name === 'Injected' && defaultInjectedProviderIsPhantom) {
      continue;
    }

    const familyKey = getConnectorFamilyKey(connector);
    if (seenFamilies.has(familyKey)) continue;

    seenFamilies.add(familyKey);
    visibleConnectors.push(connector);
  }

  return visibleConnectors;
}

export function getPreferredWalletConnector<TConnector extends ConnectorLike>(connectors: readonly TConnector[]) {
  return getVisibleWalletConnectors(connectors)[0];
}

export function getMobileWalletConnector<TConnector extends ConnectorLike>(
  connectors: readonly TConnector[],
  walletId: MobileWalletId,
) {
  return connectors.find((connector) => {
    switch (walletId) {
      case 'safepal':
        return isSafePalConnector(connector);
      case 'trustWallet':
        return isTrustWalletConnector(connector);
      case 'metaMask':
        return isMetaMaskConnector(connector);
      case 'tokenPocket':
        return isTokenPocketConnector(connector);
    }
  });
}

export function getMobileWalletLaunchUrl(walletId: MobileWalletId, dappUrl: string) {
  const parsed = new URL(dappUrl);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Unsupported dapp URL');
  }
  const normalizedUrl = parsed.toString();

  switch (walletId) {
    case 'safepal':
      return 'https://www.safepal.com/download?product=1';
    case 'trustWallet':
      return `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(normalizedUrl)}`;
    case 'metaMask':
      return `https://metamask.app.link/dapp/${normalizedUrl.replace(/^https?:\/\//, '')}`;
    case 'tokenPocket':
      return `tpdapp://open?params=${encodeURIComponent(JSON.stringify({
        url: normalizedUrl,
        chain: 'BSC',
        source: 'Cukies World',
      }))}`;
  }
}
