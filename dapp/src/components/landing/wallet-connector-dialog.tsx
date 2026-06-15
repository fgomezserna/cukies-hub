'use client';

import { Loader2, Wallet } from 'lucide-react';
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
} from '@/lib/wallet-connectors';

type TronLinkNativeOption = {
  isInstalled: boolean;
  isLoading: boolean;
  error: string | null;
  onSelect: () => Promise<void> | void;
};

type WalletConnectorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectors: readonly Connector[];
  onSelectConnector: (connector: Connector) => Promise<void> | void;
  isConnecting?: boolean;
  title?: string;
  description?: string;
  tronLinkNative?: TronLinkNativeOption;
};

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
  isConnecting = false,
  title = 'Conectar wallet',
  description = 'Elige como quieres conectar tu wallet.',
  tronLinkNative,
}: WalletConnectorDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isBusy = isConnecting || Boolean(selectedId) || Boolean(tronLinkNative?.isLoading);

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
      <DialogContent className="max-w-[92vw] border border-[var(--uki-cyan-border)] bg-[#070817] p-4 text-[var(--uki-cream)] shadow-[0_0_54px_rgba(228,92,255,0.18)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl font-black uppercase tracking-[0.04em] text-[var(--uki-cream)]">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {connectors.map((connector) => {
            const isSelected = selectedId === connector.id;

            return (
              <button
                key={connector.id}
                type="button"
                disabled={isBusy}
                onClick={() => void handleSelectConnector(connector)}
                className="grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-2 text-left transition hover:border-[var(--uki-cyan)]/45 hover:bg-[var(--uki-cyan)]/10 disabled:cursor-not-allowed disabled:opacity-55"
              >
              <span className="grid h-9 w-9 place-items-center rounded-[7px] border border-[var(--uki-cyan)]/25 bg-[var(--uki-cyan)]/10 text-[var(--uki-cyan)]">
                <ConnectorIcon connector={connector} />
                </span>
                <span>
                  <span className="block text-sm font-black uppercase tracking-[0.08em] text-[var(--uki-cream)]">
                    {getConnectorDisplayName(connector)}
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold leading-snug text-[var(--uki-muted)]">
                    {getConnectorDescription(connector)}
                  </span>
                </span>
                {isSelected ? <Loader2 className="h-4 w-4 animate-spin text-[var(--uki-cyan)]" /> : null}
              </button>
            );
          })}

          {tronLinkNative ? (
            <button
              type="button"
              disabled={isBusy || !tronLinkNative.isInstalled}
              onClick={() => void handleSelectTronLinkNative()}
              className="grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-2 text-left transition hover:border-[var(--uki-cyan)]/45 hover:bg-[var(--uki-cyan)]/10 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className="grid h-9 w-9 place-items-center rounded-[7px] border border-[var(--uki-cyan)]/25 bg-[var(--uki-cyan)]/10 text-[var(--uki-cyan)]">
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
                <Loader2 className="h-4 w-4 animate-spin text-[var(--uki-cyan)]" />
              ) : null}
            </button>
          ) : null}

          {connectors.length === 0 && !tronLinkNative ? (
            <div className="rounded-[8px] border border-[#f2c34b]/30 bg-[#2b1d08]/42 p-3 text-sm font-semibold text-[#ffe2a0]">
              No se ha detectado ningun conector de wallet compatible.
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
