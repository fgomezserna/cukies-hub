'use client';

import Image from 'next/image';
import { Wallet } from 'lucide-react';
import type { Connector } from 'wagmi';

import { Button } from '@/components/ui/button';
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
  isMetaMaskConnector,
  isSafePalConnector,
  isTokenPocketConnector,
  isTrustWalletConnector,
  type MobileWalletId,
} from '@/lib/wallet-connectors';

interface HeaderWalletDialogProps {
  connectors: readonly Connector[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMobileWallet: (walletId: MobileWalletId) => void;
  onSelectConnector: (connector: Connector) => void;
  tronLink: {
    error: string | null;
    isInstalled: boolean;
    isLoading: boolean;
    onSelect: () => void;
  };
}

const MOBILE_WALLETS: Array<{
  description: string;
  id: MobileWalletId;
  label: string;
  shortLabel: string;
}> = [
  {
    id: 'safepal',
    label: 'SafePal',
    shortLabel: 'SP',
    description: 'Abre Cukies World desde el navegador DApp de SafePal.',
  },
  {
    id: 'trustWallet',
    label: 'Trust Wallet',
    shortLabel: 'TW',
    description: 'Conecta o abre la DApp en Trust Wallet.',
  },
  {
    id: 'metaMask',
    label: 'MetaMask',
    shortLabel: 'MM',
    description: 'Conecta mediante MetaMask Mobile.',
  },
  {
    id: 'tokenPocket',
    label: 'TokenPocket',
    shortLabel: 'TP',
    description: 'Abre la DApp en el navegador de TokenPocket.',
  },
];

function WalletLogo({ connector }: { connector: Connector }) {
  const logoSrc = getConnectorLogoSrc(connector);

  if (!logoSrc) {
    return <Wallet aria-hidden="true" className="h-6 w-6 text-slate-800" />;
  }

  return (
    <Image
      src={logoSrc}
      alt=""
      width={24}
      height={24}
      unoptimized
      className="h-6 w-6 object-contain"
    />
  );
}

function WalletOptionContent({ connector }: { connector: Connector }) {
  return (
    <span className="flex w-full min-w-0 items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-cyan-300/20 bg-white">
        <WalletLogo connector={connector} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block break-words text-base font-bold leading-tight text-foreground sm:text-lg">
          {getConnectorDisplayName(connector)}
        </span>
        <span className="mt-1 block whitespace-normal break-words text-sm leading-snug text-muted-foreground">
          {getConnectorDescription(connector)}
        </span>
      </span>
    </span>
  );
}

export function HeaderWalletDialog({
  connectors,
  open,
  onOpenChange,
  onSelectMobileWallet,
  onSelectConnector,
  tronLink,
}: HeaderWalletDialogProps) {
  const otherConnectors = connectors.filter(
    (connector) =>
      !isSafePalConnector(connector) &&
      !isTrustWalletConnector(connector) &&
      !isMetaMaskConnector(connector) &&
      !isTokenPocketConnector(connector),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-xl border-2 border-teal-400/20 bg-gradient-to-br from-card to-card/50 p-4 shadow-xl shadow-teal-400/10 backdrop-blur-sm sm:p-5">
        <DialogHeader className="min-w-0 pr-8 text-left">
          <DialogTitle className="break-words text-xl font-bold leading-tight text-foreground sm:text-2xl">
            Elige tipo de wallet
          </DialogTitle>
          <DialogDescription className="break-words text-muted-foreground">
            Selecciona la wallet que quieres conectar
          </DialogDescription>
        </DialogHeader>

        <div
          data-testid="header-wallet-dialog-options"
          className="grid min-h-0 min-w-0 gap-3 overflow-x-hidden overflow-y-auto py-1 pr-1"
        >
          <div data-testid="mobile-wallet-options" className="grid gap-2">
            {MOBILE_WALLETS.map((wallet) => (
              <Button
                key={wallet.id}
                onClick={() => onSelectMobileWallet(wallet.id)}
                className="h-auto w-full min-w-0 whitespace-normal rounded-xl border-2 border-cyan-300/30 bg-gradient-to-r from-teal-400/10 to-cyan-400/10 p-3 text-left transition-all duration-300 hover:border-cyan-300/50 hover:from-teal-400/20 hover:to-cyan-400/20 sm:p-4"
              >
                <span className="flex w-full min-w-0 items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-cyan-300/20 bg-white text-xs font-black text-slate-800">
                    {wallet.shortLabel}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-base font-bold leading-tight text-foreground">
                      {wallet.label}
                    </span>
                    <span className="mt-1 block text-sm leading-snug text-muted-foreground">
                      {wallet.description}
                    </span>
                  </span>
                </span>
              </Button>
            ))}
          </div>

          <div data-testid="other-wallet-options" className="grid gap-3">
            <p className="pt-1 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
              Otras opciones
            </p>
            {otherConnectors.map((connector) => (
              <Button
                key={connector.id}
                onClick={() => onSelectConnector(connector)}
                className="h-auto w-full min-w-0 whitespace-normal rounded-xl border-2 border-cyan-300/30 bg-gradient-to-r from-teal-400/10 to-cyan-400/10 p-3 text-left transition-all duration-300 hover:border-cyan-300/50 hover:from-teal-400/20 hover:to-cyan-400/20 sm:p-4"
              >
                <WalletOptionContent connector={connector} />
              </Button>
            ))}

            <Button
              onClick={tronLink.onSelect}
              disabled={!tronLink.isInstalled || tronLink.isLoading}
              className="h-auto w-full min-w-0 whitespace-normal rounded-xl border-2 border-cyan-300/30 bg-gradient-to-r from-teal-400/10 to-cyan-400/10 p-3 text-left transition-all duration-300 hover:border-cyan-300/50 hover:from-teal-400/20 hover:to-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50 sm:p-4"
            >
              <span className="flex w-full min-w-0 items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-cyan-300/20 bg-white">
                  <Image
                    src="/brand/wallets/tronlink.png"
                    alt=""
                    width={24}
                    height={24}
                    unoptimized
                    className="h-6 w-6 object-contain"
                  />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block break-words text-base font-bold leading-tight text-foreground sm:text-lg">
                    TronLink
                  </span>
                  <span className="mt-1 block whitespace-normal break-words text-sm leading-snug text-muted-foreground">
                    {tronLink.isInstalled
                      ? tronLink.isLoading
                        ? 'Esperando confirmacion en TronLink...'
                        : 'Conecta tu wallet TronLink'
                      : 'Instala la extensión TronLink'}
                  </span>
                </span>
              </span>
            </Button>

            {tronLink.error && (
              <p className="min-w-0 break-words rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-100">
                {tronLink.error}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
