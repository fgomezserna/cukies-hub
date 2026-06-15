import type { Connector } from 'wagmi';
import type { EIP1193Provider } from 'viem';

export const TRONLINK_EVM_CONNECTOR_ID = 'tronLinkEvm';

type ConnectorLike = Pick<Connector, 'icon' | 'id' | 'name' | 'type' | 'rdns'>;

type BrowserWindowWithTronLink = {
  ethereum?: EIP1193Provider & {
    providers?: EIP1193Provider[];
    isTronLink?: boolean;
    isTronlink?: boolean;
  };
  tron?: { ethereum?: EIP1193Provider };
  tronLink?: { ethereum?: EIP1193Provider; provider?: EIP1193Provider };
};

const CONNECTOR_ORDER = [
  'metaMask',
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

export function isMetaMaskConnector(connector: ConnectorLike) {
  const text = `${connector.id} ${connector.name} ${connector.type} ${normalizeConnectorText(connector.rdns)}`;
  return connector.id === 'metaMask' || text.toLowerCase().includes('metamask');
}

export function isTronLinkEvmConnector(connector: ConnectorLike) {
  const text = `${connector.id} ${connector.name} ${connector.type} ${normalizeConnectorText(connector.rdns)}`;
  return connector.id === TRONLINK_EVM_CONNECTOR_ID || text.toLowerCase().includes('tronlink');
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

export function getConnectorDisplayName(connector: ConnectorLike) {
  if (isMetaMaskConnector(connector)) return 'MetaMask';
  if (isTronLinkEvmConnector(connector)) return 'TronLink EVM';
  if (isWalletConnectConnector(connector)) return 'WalletConnect';
  if (isCoinbaseWalletConnector(connector)) return 'Coinbase Wallet';
  if (connector.id === 'injected' && connector.name === 'Injected') return 'Browser wallet';

  return connector.name || 'Wallet EVM';
}

export function getConnectorDescription(connector: ConnectorLike) {
  if (isMetaMaskConnector(connector)) {
    return 'Extension, navegador movil o deep link oficial.';
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
  const exactIndex = CONNECTOR_ORDER.indexOf(connector.id);
  if (exactIndex >= 0) return exactIndex;

  if (isMetaMaskConnector(connector)) return CONNECTOR_ORDER.indexOf('metaMask');
  if (isTronLinkEvmConnector(connector)) return CONNECTOR_ORDER.indexOf(TRONLINK_EVM_CONNECTOR_ID);
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

export function getVisibleWalletConnectors<TConnector extends ConnectorLike>(
  connectors: readonly TConnector[],
  windowObject?: unknown,
) {
  const browserWindow = windowObject ?? (typeof window === 'undefined' ? undefined : window);
  const hasDedicatedTronLinkProvider = hasTronLinkEvmProvider(browserWindow);

  return getSortedWalletConnectors(connectors).filter((connector) => {
    if (connector.id === TRONLINK_EVM_CONNECTOR_ID) {
      return hasDedicatedTronLinkProvider;
    }

    return true;
  });
}

export function getPreferredWalletConnector<TConnector extends ConnectorLike>(connectors: readonly TConnector[]) {
  return getVisibleWalletConnectors(connectors)[0];
}
