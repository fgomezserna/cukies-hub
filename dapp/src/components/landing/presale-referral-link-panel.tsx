'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Loader2, ShieldAlert, Users, Wallet } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useToast } from '@/hooks/use-toast';
import { LandingWalletConnectButton } from './wallet-connect-dynamic';
import { UKI_PRESALE_CHAIN_ID, UKI_PRESALE_CHAIN_LABEL } from './sale-config';

type PresaleReferralStatus = {
  totalUkiPurchased: number;
  minimumUkiToUnlockLink: number;
  unlockProgress: number;
  referralLink: string | null;
  referralWeightedScore: number;
};

function formatNumber(value?: number | null, maximumFractionDigits = 2) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '--';

  return value.toLocaleString('en-US', { maximumFractionDigits });
}

export function PresaleReferralLinkPanel() {
  const { address, chainId, isConnected } = useAccount();
  const { toast } = useToast();
  const [status, setStatus] = useState<PresaleReferralStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isWrongChain = isConnected && chainId !== UKI_PRESALE_CHAIN_ID;

  const fetchStatus = useCallback(async () => {
    if (!address) {
      setStatus(null);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/presale/referral/status?walletAddress=${address}`, {
        cache: 'no-store',
      });

      if (response.ok) {
        setStatus(await response.json());
      }
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  async function copyReferralLink() {
    if (!status?.referralLink) return;

    await navigator.clipboard.writeText(status.referralLink);
    toast({
      title: 'Link copiado',
      description: 'Ya puedes compartir tu enlace de preventa.',
    });
  }

  const referralMinimum = status?.minimumUkiToUnlockLink ?? 0;
  const referralProgressPercent = Math.round((status?.unlockProgress ?? 0) * 100);
  const remainingUkiToUnlock = Math.max(referralMinimum - (status?.totalUkiPurchased ?? 0), 0);

  if (!isConnected || !address) {
    return (
      <div className="rounded-[10px] border border-[var(--uki-cyan-border)] bg-[#071923]/82 p-5">
        <div className="uki-state-callout uki-state-callout-warning">
          <Wallet className="h-4 w-4" strokeWidth={1.8} />
          <div>
            <p>Conecta tu wallet</p>
            <span>Conecta una wallet EVM para comprobar si ya puedes acceder a tu link de invitación.</span>
          </div>
        </div>
        <LandingWalletConnectButton className="mt-4 w-full justify-center" showCompactText={false} />
      </div>
    );
  }

  if (isWrongChain) {
    return (
      <div className="rounded-[10px] border border-[var(--uki-cyan-border)] bg-[#071923]/82 p-5">
        <div className="uki-state-callout uki-state-callout-warning">
          <ShieldAlert className="h-4 w-4" strokeWidth={1.8} />
          <div>
            <p>Red incorrecta</p>
            <span>Cambia a {UKI_PRESALE_CHAIN_LABEL} para revisar tu compra y tu link.</span>
          </div>
        </div>
        <LandingWalletConnectButton className="mt-4 w-full justify-center" showCompactText={false} />
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-[var(--uki-cyan-border)] bg-[#071923]/82 p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-headline text-sm font-black uppercase tracking-[0.14em] text-[var(--uki-cyan)]">
          <Users className="h-4 w-4" strokeWidth={1.8} />
          Link de invitación
        </span>
        <span className="inline-flex items-center gap-1 text-[0.68rem] font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Score {formatNumber(status?.referralWeightedScore)}
        </span>
      </div>

      {status?.referralLink ? (
        <>
          <div className="mt-4 flex items-center gap-2">
            <input
              value={status.referralLink}
              readOnly
              className="h-11 min-w-0 flex-1 rounded-[7px] border border-[var(--uki-cyan-border)] bg-[#02090d] px-3 text-sm font-bold text-[var(--uki-cream)] outline-none"
            />
            <button type="button" onClick={copyReferralLink} className="uki-wallet-button h-11 px-4" aria-label="Copiar link de invitación">
              <Copy className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
            Link activo. El volumen comprado desde tus invitaciones cuenta para la competición de sponsors.
          </p>
        </>
      ) : (
        <>
          <div className="mt-4">
            <div className="flex items-end justify-between gap-2 text-[0.68rem] font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">
              <span>Compra mínima</span>
              <span>
                {formatNumber(status?.totalUkiPurchased)} / {formatNumber(referralMinimum)} UKI
              </span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-black/35">
              <div className="h-full rounded-full bg-[var(--uki-cyan)] transition-all" style={{ width: `${referralProgressPercent}%` }} />
            </div>
          </div>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
            {remainingUkiToUnlock > 0
              ? `Necesitas comprar ${formatNumber(remainingUkiToUnlock)} UKI más con esta wallet para acceder a tu link.`
              : 'Tu link aparecerá cuando el indexer confirme la compra mínima.'}
          </p>
          <Link href="/#presale-console" className="uki-button uki-button-secondary mt-4 w-full justify-center">
            Comprar UKI
          </Link>
        </>
      )}
    </div>
  );
}
