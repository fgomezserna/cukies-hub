'use client';

import { Loader2, LogOut, ShieldAlert, Wallet } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import type { Connector } from 'wagmi';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getConnectorDescription,
  getConnectorDisplayName,
  getConnectorLogoSrc,
  findMetaMaskEvmProvider,
  findSafePalEvmProvider,
  findTokenPocketEvmProvider,
  findTrustWalletEvmProvider,
  isMetaMaskConnector,
  isSafePalConnector,
  isTokenPocketConnector,
  isTrustWalletConnector,
} from '@/lib/wallet-connectors';
import type { MobileWalletId } from '@/lib/wallet-connectors';

type TronLinkNativeOption = {
  isInstalled: boolean;
  isLoading: boolean;
  error: string | null;
  onSelect: () => Promise<void> | void;
};

type WalletDialogAction = {
  description: string;
  isLoading?: boolean;
  label: string;
  onSelect: () => Promise<void> | void;
};

type WalletConnectorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectors: readonly Connector[];
  onSelectConnector: (connector: Connector) => Promise<void> | void;
  currentWalletAction?: WalletDialogAction;
  disconnectAction?: WalletDialogAction;
  isConnecting?: boolean;
  title?: string;
  description?: string;
  errorMessage?: string | null;
  tronLinkNative?: TronLinkNativeOption;
  isMobile?: boolean;
  onSelectMobileWallet?: (walletId: MobileWalletId) => Promise<void> | void;
};

const MOBILE_WALLETS: ReadonlyArray<{
  id: MobileWalletId;
  label: string;
  description: string;
  logoSrc: string;
}> = [
  {
    id: 'safepal',
    label: 'SafePal',
    description: 'Abrir en SafePal móvil.',
    logoSrc: '/brand/wallets/safepal.svg',
  },
  {
    id: 'trustWallet',
    label: 'Trust Wallet',
    description: 'Abrir en Trust Wallet móvil.',
    logoSrc: '/brand/wallets/trust-wallet.svg',
  },
  {
    id: 'metaMask',
    label: 'MetaMask',
    description: 'Abrir en MetaMask móvil.',
    logoSrc: '/brand/wallets/metamask.svg',
  },
  {
    id: 'tokenPocket',
    label: 'TokenPocket',
    description: 'Abrir en TokenPocket móvil.',
    logoSrc: '/brand/wallets/tokenpocket.svg',
  },
];

function belongsToMobileFamily(connector: Connector, walletId: MobileWalletId) {
  const isGenericInjected = connector.id === 'injected' && connector.name === 'Injected';
  switch (walletId) {
    case 'safepal':
      return isSafePalConnector(connector) || (isGenericInjected && Boolean(findSafePalEvmProvider()));
    case 'trustWallet':
      return isTrustWalletConnector(connector) || (isGenericInjected && Boolean(findTrustWalletEvmProvider()));
    case 'metaMask':
      return isMetaMaskConnector(connector) || (isGenericInjected && Boolean(findMetaMaskEvmProvider()));
    case 'tokenPocket':
      return isTokenPocketConnector(connector) || (isGenericInjected && Boolean(findTokenPocketEvmProvider()));
  }
}

function ConnectorIcon({ connector }: { connector: Connector }) {
  const logoSrc = getConnectorLogoSrc(connector);
  if (logoSrc) {
    return (
      <Image
        src={logoSrc}
        alt={`${getConnectorDisplayName(connector)} logo`}
        width={24}
        height={24}
        unoptimized
        className="h-6 w-6 object-contain"
      />
    );
  }

  return <Wallet className="h-5 w-5" strokeWidth={1.8} />;
}

function connectorDescription(connector: Connector, mobile: boolean) {
  if (mobile) return getConnectorDescription(connector);
  if (isMetaMaskConnector(connector)) return 'Extensión de navegador para BNB Smart Chain.';
  if (isSafePalConnector(connector)) return 'Extensión de navegador para BNB Smart Chain.';
  if (isTrustWalletConnector(connector)) return 'Extensión de navegador para BNB Smart Chain.';
  if (isTokenPocketConnector(connector)) return 'Extensión de navegador para BNB Smart Chain.';
  return getConnectorDescription(connector);
}

function TronLinkLogo() {
  return (
    <Image
      src="/brand/wallets/tronlink.png"
      alt="TronLink logo"
      width={24}
      height={24}
      unoptimized
      className="h-6 w-6 object-contain"
    />
  );
}

export function WalletConnectorDialog({
  open,
  onOpenChange,
  connectors,
  onSelectConnector,
  currentWalletAction,
  disconnectAction,
  isConnecting = false,
  title = 'Conectar wallet',
  description = 'Elige como quieres conectar tu wallet.',
  errorMessage,
  tronLinkNative,
  isMobile = false,
  onSelectMobileWallet,
}: WalletConnectorDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isBusy = isConnecting ||
    Boolean(selectedId) ||
    Boolean(currentWalletAction?.isLoading) ||
    Boolean(disconnectAction?.isLoading) ||
    Boolean(tronLinkNative?.isLoading);
  const showMobileWalletCards = isMobile && Boolean(onSelectMobileWallet);
  const visibleConnectors = showMobileWalletCards
    ? connectors.filter((connector) => !MOBILE_WALLETS.some((wallet) => belongsToMobileFamily(connector, wallet.id)))
    : connectors;

  async function handleDialogAction(action: WalletDialogAction, selectedActionId: string) {
    if (isBusy) return;
    setSelectedId(selectedActionId);

    try {
      await action.onSelect();
    } finally {
      setSelectedId(null);
    }
  }

  async function handleSelectConnector(connector: Connector) {
    if (isBusy) return;
    setSelectedId(connector.id);

    try {
      await onSelectConnector(connector);
    } finally {
      setSelectedId(null);
    }
  }

  async function handleSelectTronLinkNative() {
    if (!tronLinkNative || isBusy || !tronLinkNative.isInstalled) return;
    setSelectedId('tronlink-native');

    try {
      await tronLinkNative.onSelect();
    } finally {
      setSelectedId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[92vw] border border-[var(--uki-lilac-border)] bg-[#070817] p-4 text-[var(--uki-cream)] shadow-[0_0_54px_rgba(228,92,255,0.18)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl font-black uppercase tracking-[0.04em] text-[var(--uki-cream)]">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {isMobile && onSelectMobileWallet ? (
            <section aria-labelledby="mobile-wallet-options" className="grid gap-2">
              <h3 id="mobile-wallet-options" className="px-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">
                Wallet móvil
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {MOBILE_WALLETS.map((wallet) => (
                  <button
                    key={wallet.id}
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleDialogAction({
                      label: wallet.label,
                      description: wallet.description,
                      onSelect: () => onSelectMobileWallet(wallet.id),
                    }, `mobile-${wallet.id}`)}
                    className="grid min-h-20 gap-1 rounded-[8px] border border-white/10 bg-white/[0.035] px-2 py-2 text-left transition hover:border-[var(--uki-lilac)]/45 hover:bg-[var(--uki-lilac)]/10 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className="flex items-center gap-2">
                      <Image
                        src={wallet.logoSrc}
                        alt={`${wallet.label} logo`}
                        width={24}
                        height={24}
                        unoptimized
                        className="h-6 w-6 object-contain"
                      />
                      <span className="text-xs font-black uppercase tracking-[0.06em] text-[var(--uki-cream)]">
                        {wallet.label}
                      </span>
                    </span>
                    <span className="text-[11px] font-semibold leading-snug text-[var(--uki-muted)]">
                      {wallet.description}
                    </span>
                    {selectedId === `mobile-${wallet.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--uki-lilac)]" /> : null}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {currentWalletAction ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void handleDialogAction(currentWalletAction, 'current-wallet-action')}
              className="grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[8px] border border-[var(--uki-lilac)]/35 bg-[var(--uki-lilac)]/10 px-3 py-2 text-left transition hover:border-[var(--uki-lilac)]/55 hover:bg-[var(--uki-lilac)]/15 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className="grid h-9 w-9 place-items-center rounded-[7px] border border-[var(--uki-lilac)]/30 bg-[var(--uki-lilac)]/10 text-[var(--uki-lilac)]">
                <ShieldAlert className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span>
                <span className="block text-sm font-black uppercase tracking-[0.08em] text-[var(--uki-cream)]">
                  {currentWalletAction.label}
                </span>
                <span className="mt-0.5 block text-xs font-semibold leading-snug text-[var(--uki-muted)]">
                  {currentWalletAction.description}
                </span>
              </span>
              {selectedId === 'current-wallet-action' || currentWalletAction.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--uki-lilac)]" />
              ) : null}
            </button>
          ) : null}

          {disconnectAction ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void handleDialogAction(disconnectAction, 'disconnect-wallet-action')}
              className="grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[8px] border border-[#ff75aa]/30 bg-[#40101f]/28 px-3 py-2 text-left transition hover:border-[#ff75aa]/50 hover:bg-[#40101f]/42 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className="grid h-9 w-9 place-items-center rounded-[7px] border border-[#ff75aa]/30 bg-[#ff75aa]/10 text-[#ffd0df]">
                <LogOut className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span>
                <span className="block text-sm font-black uppercase tracking-[0.08em] text-[var(--uki-cream)]">
                  {disconnectAction.label}
                </span>
                <span className="mt-0.5 block text-xs font-semibold leading-snug text-[#ffd0df]">
                  {disconnectAction.description}
                </span>
              </span>
              {selectedId === 'disconnect-wallet-action' || disconnectAction.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#ffd0df]" />
              ) : null}
            </button>
          ) : null}

          {visibleConnectors.length > 0 ? (
            <h3 className="px-1 pt-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">
              {isMobile ? 'Otras opciones EVM' : 'Wallets EVM'}
            </h3>
          ) : null}

          {visibleConnectors.map((connector) => {
            const isSelected = selectedId === connector.id;

            return (
              <button
                key={connector.id}
                type="button"
                disabled={isBusy}
                onClick={() => void handleSelectConnector(connector)}
                className="grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-2 text-left transition hover:border-[var(--uki-lilac)]/45 hover:bg-[var(--uki-lilac)]/10 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span className="grid h-9 w-9 place-items-center rounded-[7px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/10 text-[var(--uki-lilac)]">
                  <ConnectorIcon connector={connector} />
                </span>
                <span>
                  <span className="block text-sm font-black uppercase tracking-[0.08em] text-[var(--uki-cream)]">
                    {getConnectorDisplayName(connector)}
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold leading-snug text-[var(--uki-muted)]">
                    {connectorDescription(connector, isMobile)}
                  </span>
                </span>
                {isSelected ? <Loader2 className="h-4 w-4 animate-spin text-[var(--uki-lilac)]" /> : null}
              </button>
            );
          })}

          {tronLinkNative ? (
            <button
              type="button"
              disabled={isBusy || !tronLinkNative.isInstalled}
              onClick={() => void handleSelectTronLinkNative()}
              className="grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-2 text-left transition hover:border-[var(--uki-lilac)]/45 hover:bg-[var(--uki-lilac)]/10 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className="grid h-9 w-9 place-items-center rounded-[7px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/10 text-[var(--uki-lilac)]">
                <TronLinkLogo />
              </span>
              <span>
                <span className="block text-sm font-black uppercase tracking-[0.08em] text-[var(--uki-cream)]">
                  TronLink TRON
                </span>
                <span className="mt-0.5 block text-xs font-semibold leading-snug text-[var(--uki-muted)]">
                  {tronLinkNative.isInstalled ? 'Conexion nativa para wallet TRON.' : 'Instala o activa TronLink.'}
                </span>
              </span>
              {selectedId === 'tronlink-native' || tronLinkNative.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--uki-lilac)]" />
              ) : null}
            </button>
          ) : null}

          {visibleConnectors.length === 0 && !tronLinkNative && !showMobileWalletCards ? (
            <div className="rounded-[8px] border border-[#f2c34b]/30 bg-[#2b1d08]/42 p-3 text-sm font-semibold text-[#ffe2a0]">
              No se ha detectado ningun conector de wallet compatible.
            </div>
          ) : null}

          {errorMessage ? (
            <div role="alert" className="rounded-[8px] border border-[#ff75aa]/30 bg-[#40101f]/42 p-3 text-sm font-semibold text-[#ffd0df]">
              {errorMessage}
            </div>
          ) : null}

          {tronLinkNative?.error ? (
            <div className="rounded-[8px] border border-[#ff75aa]/30 bg-[#40101f]/42 p-3 text-sm font-semibold text-[#ffd0df]">
              {tronLinkNative.error}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
