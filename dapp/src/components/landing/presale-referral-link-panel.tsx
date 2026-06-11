'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Loader2, ShieldAlert, Ticket, Trophy, Users, Wallet } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useToast } from '@/hooks/use-toast';
import { LandingWalletConnectButton } from './wallet-connect-dynamic';
import { UKI_PRESALE_CHAIN_ID, UKI_PRESALE_CHAIN_LABEL } from './sale-config';

type PresaleReferralStatus = {
  totalUkiPurchased: number;
  minimumUkiToUnlockLink: number;
  unlockProgress: number;
  referralUnlockedAt: string | null;
  referralLink: string | null;
  referralWeightedScore: number;
  referralLevel1UkiAmount: number;
  referralLevel2UkiAmount: number;
  referralLevel3UkiAmount: number;
  referralLevel1Count: number;
  referralLevel2Count: number;
  referralLevel3Count: number;
  levelWeights: {
    level1: number;
    level2: number;
    level3: number;
  };
};

function formatNumber(value?: number | null, maximumFractionDigits = 2) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '--';

  return value.toLocaleString('en-US', { maximumFractionDigits });
}

function withCurrentBrowserOrigin(referralLink: string | null) {
  if (!referralLink || typeof window === 'undefined') return referralLink;

  try {
    const link = new URL(referralLink);
    return `${window.location.origin}${link.pathname}${link.search}${link.hash}`;
  } catch {
    return referralLink;
  }
}

export function PresaleReferralLinkPanel() {
  const { address, chainId, isConnected } = useAccount();
  const { toast } = useToast();
  const [status, setStatus] = useState<PresaleReferralStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const isWrongChain = isConnected && chainId !== UKI_PRESALE_CHAIN_ID;

  const fetchStatus = useCallback(async () => {
    if (!address) {
      setStatus(null);
      return;
    }

    setIsLoading(true);
    setStatusError(null);
    try {
      const params = new URLSearchParams({
        walletAddress: address,
        origin: window.location.origin,
      });
      const response = await fetch(`/api/presale/referral/status?${params.toString()}`, {
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        setStatus({
          ...data,
          referralLink: withCurrentBrowserOrigin(data.referralLink),
        });
      } else {
        setStatus(null);
        setStatusError('No se pudo cargar tu progreso de referidos.');
      }
    } catch {
      setStatus(null);
      setStatusError('No se pudo cargar tu progreso de referidos.');
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
  const hasConfiguredMinimum = referralMinimum > 0;
  const referralProgressPercent = hasConfiguredMinimum
    ? Math.round((status?.unlockProgress ?? 0) * 100)
    : status?.referralLink
      ? 100
      : 0;
  const remainingUkiToUnlock = Math.max(referralMinimum - (status?.totalUkiPurchased ?? 0), 0);
  const hasPurchasedUki = (status?.totalUkiPurchased ?? 0) > 0;
  const referralLevels = [
    {
      level: 'Nivel 1',
      includes: 'Invitados directos',
      referrals: status?.referralLevel1Count ?? 0,
      purchased: status?.referralLevel1UkiAmount ?? 0,
      weight: status?.levelWeights?.level1 ?? 1,
      color: 'text-[#7dd3fc]',
    },
    {
      level: 'Nivel 2',
      includes: 'Invitados de tus invitados',
      referrals: status?.referralLevel2Count ?? 0,
      purchased: status?.referralLevel2UkiAmount ?? 0,
      weight: status?.levelWeights?.level2 ?? 0.5,
      color: 'text-[var(--uki-gold)]',
    },
    {
      level: 'Nivel 3',
      includes: 'Tercer nivel de tu red',
      referrals: status?.referralLevel3Count ?? 0,
      purchased: status?.referralLevel3UkiAmount ?? 0,
      weight: status?.levelWeights?.level3 ?? 0.25,
      color: 'text-[#91e96f]',
    },
  ];

  if (!isConnected || !address) {
    return (
      <div className="rounded-[10px] border border-[var(--uki-cyan)]/25 bg-[#05131a]/82 p-5 shadow-[0_0_40px_rgba(34,231,223,0.06)]">
        <div className="flex gap-3 rounded-[9px] border border-[#f2c34b]/35 bg-[#2b1d08]/48 p-4">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-gold)]" strokeWidth={1.8} />
          <div>
            <p className="font-headline text-sm font-black uppercase tracking-[0.12em] text-[var(--uki-cream)]">Conecta tu wallet</p>
            <span className="mt-1 block text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              Conecta una wallet EVM para ver tu progreso y comprobar si ya puedes acceder a tu link de invitación.
            </span>
          </div>
        </div>
        <LandingWalletConnectButton className="mt-4 w-full justify-center" showCompactText={false} />
      </div>
    );
  }

  if (isWrongChain) {
    return (
      <div className="rounded-[10px] border border-[var(--uki-cyan)]/25 bg-[#05131a]/82 p-5 shadow-[0_0_40px_rgba(34,231,223,0.06)]">
        <div className="flex gap-3 rounded-[9px] border border-[#f2c34b]/35 bg-[#2b1d08]/48 p-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-gold)]" strokeWidth={1.8} />
          <div>
            <p className="font-headline text-sm font-black uppercase tracking-[0.12em] text-[var(--uki-cream)]">Red incorrecta</p>
            <span className="mt-1 block text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              Cambia a {UKI_PRESALE_CHAIN_LABEL} para revisar tu compra y tu link.
            </span>
          </div>
        </div>
        <LandingWalletConnectButton className="mt-4 w-full justify-center" showCompactText={false} />
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-[var(--uki-cyan)]/25 bg-[#05131a]/82 p-5 shadow-[0_0_40px_rgba(34,231,223,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-headline text-sm font-black uppercase tracking-[0.14em] text-[var(--uki-cyan)]">
          <Users className="h-4 w-4" strokeWidth={1.8} />
          Tu enlace de invitación
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
              aria-label="Enlace de invitación de preventa"
              className="h-11 min-w-0 flex-1 rounded-[7px] border border-[var(--uki-cyan)]/20 bg-[#02030a] px-3 text-sm font-bold text-[var(--uki-cream)] outline-none"
            />
            <button
              type="button"
              onClick={copyReferralLink}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[7px] border border-[var(--uki-cyan)]/60 bg-[var(--uki-cyan)] px-4 font-headline text-xs font-black uppercase tracking-[0.08em] text-[#040d12] shadow-[0_0_18px_rgba(34,231,223,0.22)] transition hover:bg-[#2ef1eb]"
              aria-label="Copiar link de invitación"
            >
              <Copy className="h-4 w-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Copiar enlace</span>
            </button>
          </div>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
            Link activo. El volumen comprado desde tus invitaciones cuenta para la competición de sponsors.
          </p>
        </>
      ) : statusError ? (
        <div className="mt-4 flex gap-3 rounded-[9px] border border-[#f2c34b]/35 bg-[#2b1d08]/48 p-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-gold)]" strokeWidth={1.8} />
          <div>
            <p className="font-headline text-sm font-black uppercase tracking-[0.12em] text-[var(--uki-cream)]">Progreso no disponible</p>
            <span className="mt-1 block text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              {statusError}
            </span>
          </div>
        </div>
      ) : !status ? (
        <div className="mt-4 flex gap-3 rounded-[9px] border border-[var(--uki-cyan)]/20 bg-[#05131a]/70 p-4">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--uki-cyan)]" strokeWidth={1.8} />
          <div>
            <p className="font-headline text-sm font-black uppercase tracking-[0.12em] text-[var(--uki-cream)]">Cargando progreso</p>
            <span className="mt-1 block text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              Estamos revisando tus compras y tu enlace de invitación.
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4">
            <div className="flex items-end justify-between gap-2 text-[0.68rem] font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">
              <span>Desbloqueo de link</span>
              <span>
                {hasConfiguredMinimum
                  ? `${formatNumber(status?.totalUkiPurchased)} / ${formatNumber(referralMinimum)} UKI`
                  : `${formatNumber(status?.totalUkiPurchased)} UKI indexados`}
              </span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-black/35">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--uki-cyan)] to-[#f2c34b] transition-all"
                style={{ width: `${referralProgressPercent}%` }}
              />
            </div>
          </div>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
            {!hasConfiguredMinimum
              ? hasPurchasedUki
                ? 'Compra detectada, pero el indexer todavía no ha marcado el desbloqueo del link. Refresca después de proyectar eventos de preventa.'
                : 'Tu link aparecerá cuando el indexer proyecte tu primera compra de UKI.'
              : remainingUkiToUnlock > 0
              ? hasPurchasedUki
                ? `Necesitas comprar ${formatNumber(remainingUkiToUnlock)} UKI más con esta wallet para acceder a tu link.`
                : 'Aún no has hecho ninguna compra con esta wallet. Compra UKI para desbloquear tu enlace de invitación.'
              : 'Tu link aparecerá cuando el indexer confirme la compra mínima.'}
          </p>
          <Link href="/#presale-console" className="uki-button uki-button-secondary mt-4 w-full justify-center">
            Comprar UKI
          </Link>
        </>
      )}

      {status ? (
        <>
          {/* Vista desktop en formato tabla */}
          <div className="mt-5 hidden overflow-x-auto rounded-[10px] border border-white/10 md:block">
            <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
              <thead className="bg-white/[0.06] text-[var(--uki-muted)]">
                <tr>
                  <th className="px-4 py-3 font-headline text-[0.65rem] font-black uppercase tracking-[0.12em]">Nivel</th>
                  <th className="px-4 py-3 font-headline text-[0.65rem] font-black uppercase tracking-[0.12em]">Qué incluye</th>
                  <th className="px-4 py-3 font-headline text-[0.65rem] font-black uppercase tracking-[0.12em]">Referidos</th>
                  <th className="px-4 py-3 font-headline text-[0.65rem] font-black uppercase tracking-[0.12em]">Comprado por invitados</th>
                  <th className="px-4 py-3 text-right font-headline text-[0.65rem] font-black uppercase tracking-[0.12em]">
                    Cuenta para competición
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-[var(--uki-text)]">
                {referralLevels.map((level) => (
                  <tr key={level.level}>
                    <td className={`px-4 py-3 font-headline text-base font-black uppercase ${level.color}`}>{level.level}</td>
                    <td className="px-4 py-3 font-semibold">{level.includes}</td>
                    <td className="px-4 py-3 font-headline text-lg font-black text-[var(--uki-cream)]">
                      {formatNumber(level.referrals, 0)}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      <span className="inline-flex items-center gap-2">
                        <Ticket className="h-4 w-4 text-[var(--uki-gold)]" strokeWidth={1.8} />
                        {formatNumber(level.purchased)} UKI
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-headline text-lg font-black text-[var(--uki-cream)]">
                      {formatNumber(level.purchased * level.weight)} UKI
                      <span className="ml-2 text-xs text-[var(--uki-muted)]">({Math.round(level.weight * 100)}%)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Vista móvil en formato tarjetas */}
          <div className="mt-5 space-y-4 md:hidden">
            {referralLevels.map((level) => (
              <article key={level.level} className="rounded-[10px] border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className={`font-headline text-sm font-black uppercase ${level.color}`}>{level.level}</span>
                  <span className="text-xs font-semibold text-[var(--uki-muted)]">{level.includes}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[var(--uki-muted)] font-black uppercase tracking-[0.08em]">Referidos</p>
                    <p className="font-headline text-base font-black text-[var(--uki-cream)] mt-1">{formatNumber(level.referrals, 0)}</p>
                  </div>
                  <div>
                    <p className="text-[var(--uki-muted)] font-black uppercase tracking-[0.08em]">Comprado</p>
                    <p className="font-semibold mt-1 flex items-center gap-1.5 text-xs text-[var(--uki-cream)]">
                      <Ticket className="h-3.5 w-3.5 text-[var(--uki-gold)]" strokeWidth={1.8} />
                      {formatNumber(level.purchased)} UKI
                    </p>
                  </div>
                </div>
                <div className="bg-white/[0.04] rounded-[6px] p-2 flex items-center justify-between">
                  <span className="text-[0.62rem] font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">Puntos competición</span>
                  <strong className="font-headline text-sm font-black text-[var(--uki-gold)]">
                    {formatNumber(level.purchased * level.weight)} UKI
                    <span className="ml-1 text-[0.62rem] text-[var(--uki-muted)] font-normal">({Math.round(level.weight * 100)}%)</span>
                  </strong>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-3 rounded-[10px] border border-[#f2c34b]/30 bg-[#2b1d08]/40 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="inline-flex items-center gap-2 text-[0.72rem] font-black uppercase tracking-[0.12em] text-[#7dd3fc]">
                <Trophy className="h-4 w-4" strokeWidth={1.8} />
                Total de UKI recomendados que cuentan para la competición
              </div>
              <strong className="font-headline text-3xl font-black uppercase leading-none text-[var(--uki-gold)]">
                {formatNumber(status.referralWeightedScore)} UKI
              </strong>
            </div>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              Cálculo aplicado: Nivel 1 cuenta al 100%, Nivel 2 al 50% y Nivel 3 al 25%.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
