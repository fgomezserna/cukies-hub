'use client';

import Image from 'next/image';
import type { Connector } from 'wagmi';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { MobileWalletId } from '@/lib/wallet-connectors';
import {
  getConnectorDescription,
  getConnectorDisplayName,
  getConnectorLogoSrc,
} from '@/lib/wallet-connectors';

interface HeaderWalletDialogProps {
  connectors: readonly Connector[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMobileWallet: (walletId: MobileWalletId) => void;
  onSelectConnector: (connector: Connector) => void;
  walletKind?: 'evm' | 'tron' | 'any';
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
  logoSrc: string;
}> = [
  {
    id: 'safepal',
    label: 'SafePal',
    logoSrc: '/brand/wallets/safepal.svg',
    description: 'Abre Cukies World desde el navegador DApp de SafePal.',
  },
  {
    id: 'trustWallet',
    label: 'Trust Wallet',
    logoSrc: '/brand/wallets/trust-wallet.svg',
    description: 'Conecta o abre la DApp en Trust Wallet.',
  },
  {
    id: 'metaMask',
    label: 'MetaMask',
    logoSrc: '/brand/wallets/metamask.svg',
    description: 'Conecta mediante MetaMask Mobile.',
  },
  {
    id: 'tokenPocket',
    label: 'TokenPocket',
    logoSrc: '/brand/wallets/tokenpocket.svg',
    description: 'Abre la DApp en el navegador de TokenPocket.',
  },
];

export function HeaderWalletDialog({
  open,
  onOpenChange,
  onSelectMobileWallet,
  connectors,
  onSelectConnector,
  tronLink,
  walletKind = 'any',
}: HeaderWalletDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-xl border-2 border-lilac-400/20 bg-gradient-to-br from-card to-card/50 p-4 shadow-xl shadow-lilac-400/10 backdrop-blur-sm sm:p-5">
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
          {walletKind !== 'tron' ? <div data-testid="mobile-wallet-options" className="grid gap-2">
            {MOBILE_WALLETS.map((wallet) => (
              <Button
                key={wallet.id}
                onClick={() => onSelectMobileWallet(wallet.id)}
                className="h-auto w-full min-w-0 whitespace-normal rounded-xl border-2 border-lilac-300/30 bg-gradient-to-r from-lilac-400/10 to-lilac-400/10 p-3 text-left transition-all duration-300 hover:border-lilac-300/50 hover:from-lilac-400/20 hover:to-lilac-400/20 sm:p-4"
              >
                <span className="flex w-full min-w-0 items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-lilac-300/20 bg-white">
                    <Image
                      src={wallet.logoSrc}
                      alt=""
                      width={26}
                      height={26}
                      unoptimized
                      className="h-6 w-6 object-contain"
                    />
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
          </div> : null}

          {walletKind !== 'tron' && connectors.length > 0 ? (
            <div data-testid="evm-wallet-options" className="grid gap-2 border-t border-white/10 pt-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Otras opciones EVM
              </p>
              {connectors.map((connector) => {
                const logoSrc = getConnectorLogoSrc(connector);
                return (
                  <Button
                    key={connector.id}
                    type="button"
                    onClick={() => onSelectConnector(connector)}
                    className="h-auto w-full min-w-0 whitespace-normal rounded-xl border border-white/10 bg-white/[0.035] p-3 text-left hover:border-lilac-300/45 hover:bg-lilac-400/10"
                  >
                    <span className="flex w-full min-w-0 items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-lilac-300/20 bg-white">
                        {logoSrc ? <Image src={logoSrc} alt="" width={24} height={24} unoptimized className="h-5 w-5 object-contain" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block text-sm font-bold leading-tight text-foreground">
                          {getConnectorDisplayName(connector)}
                        </span>
                        <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                          {getConnectorDescription(connector)}
                        </span>
                      </span>
                    </span>
                  </Button>
                );
              })}
            </div>
          ) : null}

          {walletKind !== 'evm' ? (
            <div data-testid="tron-wallet-options" className="grid gap-2 border-t border-white/10 pt-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Wallet TRON
              </p>
              <Button
                type="button"
                disabled={!tronLink.isInstalled || tronLink.isLoading}
                onClick={tronLink.onSelect}
                className="h-auto w-full min-w-0 whitespace-normal rounded-xl border border-white/10 bg-white/[0.035] p-3 text-left hover:border-lilac-300/45 hover:bg-lilac-400/10"
              >
                <span className="flex w-full min-w-0 items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-lilac-300/20 bg-white">
                    <Image src="/brand/wallets/tronlink.png" alt="" width={24} height={24} unoptimized className="h-5 w-5 object-contain" />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-bold leading-tight text-foreground">TronLink TRON</span>
                    <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                      {tronLink.isInstalled ? 'Conexión nativa para operar en TRON Mainnet.' : 'Instala o activa TronLink.'}
                    </span>
                  </span>
                </span>
              </Button>
              {tronLink.error ? <p role="alert" className="text-xs font-semibold text-red-200">{tronLink.error}</p> : null}
            </div>
          ) : null}

        </div>
      </DialogContent>
    </Dialog>
  );
}
