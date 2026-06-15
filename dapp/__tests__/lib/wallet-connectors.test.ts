import {
  TRONLINK_EVM_CONNECTOR_ID,
  getConnectorDescription,
  getConnectorDisplayName,
  getConnectorLogoSrc,
  getPreferredWalletConnector,
  getSortedWalletConnectors,
  isCoinbaseWalletConnector,
  isTronLinkEvmConnector,
  isWalletConnectConnector,
} from '@/lib/wallet-connectors';

function connector(overrides: {
  id: string;
  icon?: string;
  name?: string;
  type?: string;
  rdns?: string | readonly string[];
}) {
  return {
    icon: overrides.icon,
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    rdns: overrides.rdns,
    type: overrides.type ?? overrides.id,
  } as any;
}

describe('lib/wallet-connectors', () => {
  it('sorts and deduplicates EVM connectors by stable wallet priority', () => {
    const walletConnect = connector({ id: 'walletConnect', name: 'WalletConnect', type: 'walletConnect' });
    const browserWallet = connector({ id: 'injected', name: 'Injected', type: 'injected' });
    const tronLink = connector({ id: TRONLINK_EVM_CONNECTOR_ID, name: 'TronLink EVM', type: 'injected' });
    const coinbase = connector({ id: 'coinbaseWalletSDK', name: 'Coinbase Wallet', type: 'coinbaseWallet' });
    const metaMask = connector({ id: 'io.metamask', name: 'MetaMask', type: 'metaMask' });

    const sorted = getSortedWalletConnectors([
      walletConnect,
      coinbase,
      browserWallet,
      tronLink,
      walletConnect,
      metaMask,
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      'io.metamask',
      TRONLINK_EVM_CONNECTOR_ID,
      'injected',
      'walletConnect',
      'coinbaseWalletSDK',
    ]);
  });

  it('returns undefined when no connector is available', () => {
    expect(getPreferredWalletConnector([])).toBeUndefined();
  });

  it('detects supported connector families without relying on exact names only', () => {
    const walletConnect = connector({ id: 'custom', name: 'WalletConnect', type: 'walletConnect' });
    const coinbase = connector({ id: 'customCoinbase', name: 'CB Wallet', rdns: 'com.coinbase.wallet' });
    const tronLink = connector({ id: 'customTron', name: 'TRONLINK', rdns: 'io.tronlink' });

    expect(isWalletConnectConnector(walletConnect)).toBe(true);
    expect(isCoinbaseWalletConnector(coinbase)).toBe(true);
    expect(isTronLinkEvmConnector(tronLink)).toBe(true);
  });

  it('normalizes labels and descriptions for user-facing wallet options', () => {
    const browserWallet = connector({ id: 'injected', name: 'Injected', type: 'injected' });
    const tronLink = connector({ id: TRONLINK_EVM_CONNECTOR_ID, name: 'TronLink EVM', type: 'injected' });

    expect(getConnectorDisplayName(browserWallet)).toBe('Browser wallet');
    expect(getConnectorDescription(browserWallet)).toContain('TronLink EVM');
    expect(getConnectorDisplayName(tronLink)).toBe('TronLink EVM');
    expect(getConnectorDescription(tronLink)).toContain('BNB Smart Chain');
    expect(getConnectorLogoSrc(tronLink)).toBe('/brand/wallets/tronlink.png');
    expect(getConnectorLogoSrc(connector({ id: 'io.metamask', name: 'MetaMask', type: 'metaMask' }))).toBe('/brand/wallets/metamask.svg');
  });

  it('uses official local logos for known wallets and trims unknown connector icons', () => {
    const embeddedMetaMask = connector({
      id: 'metaMask',
      icon: '\n data:image/png;base64,broken',
      name: 'MetaMask',
      type: 'metaMask',
    });
    const unknownWallet = connector({
      id: 'unknownWallet',
      icon: '\n data:image/png;base64,valid',
      name: 'Unknown Wallet',
      type: 'injected',
    });

    expect(getConnectorLogoSrc(embeddedMetaMask)).toBe('/brand/wallets/metamask.svg');
    expect(getConnectorLogoSrc(unknownWallet)).toBe('data:image/png;base64,valid');
  });
});
