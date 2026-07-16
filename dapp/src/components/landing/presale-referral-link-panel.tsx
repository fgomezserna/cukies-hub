'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Loader2, ShieldAlert, Ticket, Trophy, Users, Wallet } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useToast } from '@/hooks/use-toast';
import type { PublicLocale } from '@/lib/public-locale';
import { useAuth } from '@/providers/auth-provider';
import { usePublicLocale } from '@/providers/public-locale-provider';
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

function formatNumber(value?: number | null, maximumFractionDigits = 2, locale: PublicLocale = 'es') {
  if (value === undefined || value === null || !Number.isFinite(value)) return '--';

  return value.toLocaleString(locale === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits });
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

const referralPanelCopyByLocale = {
  es: {
    loadError: 'No se pudo cargar tu progreso de referidos.',
    toastTitle: 'Link copiado',
    toastDescription: 'Ya puedes compartir tu enlace de preventa.',
    levels: [
      { level: 'Nivel 1', includes: 'Invitados directos' },
      { level: 'Nivel 2', includes: 'Invitados de tus invitados' },
      { level: 'Nivel 3', includes: 'Tercer nivel de tu red' },
    ],
    connectTitle: 'Conecta tu wallet',
    connectText: 'Conecta una wallet EVM para ver tu progreso y comprobar si ya puedes acceder a tu link de invitación.',
    wrongChainTitle: 'Red incorrecta',
    wrongChainTextPrefix: 'Cambia a',
    wrongChainTextSuffix: 'para revisar tu compra y tu link.',
    panelTitle: 'Tu enlace de invitación',
    score: 'Score',
    inputLabel: 'Enlace de invitación de preventa',
    copyLabel: 'Copiar link de invitación',
    copyButton: 'Copiar enlace',
    activeText: 'Link activo. El volumen comprado desde tus invitaciones cuenta para la competición de sponsors.',
    unavailableTitle: 'Progreso no disponible',
    loadingTitle: 'Cargando progreso',
    loadingText: 'Estamos revisando tus compras y tu enlace de invitación.',
    unlockLabel: 'Desbloqueo de link',
    boughtSuffix: 'UKI comprados',
    detectedPurchase: 'Compra detectada. Tu enlace de invitación estará disponible en unos minutos.',
    firstPurchaseNeeded: 'Tu enlace de invitación aparecerá después de tu primera compra de UKI.',
    remainingPrefix: 'Necesitas comprar',
    remainingSuffix: 'UKI más con esta wallet para acceder a tu link.',
    noPurchase: 'Aún no has hecho ninguna compra con esta wallet. Compra UKI para desbloquear tu enlace de invitación.',
    minimumReached: 'Compra mínima alcanzada. Tu enlace de invitación estará disponible en unos minutos.',
    buy: 'Comprar UKI',
    table: {
      level: 'Nivel',
      includes: 'Qué incluye',
      referrals: 'Referidos',
      purchased: 'Comprado por invitados',
      competition: 'Cuenta para competición',
      purchasedMobile: 'Comprado',
      competitionPoints: 'Puntos competición',
    },
    totalTitle: 'Total de UKI recomendados que cuentan para la competición',
    totalText: 'Cálculo aplicado: Nivel 1 cuenta al 100%, Nivel 2 al 50% y Nivel 3 al 25%.',
  },
  en: {
    loadError: 'Could not load your referral progress.',
    toastTitle: 'Link copied',
    toastDescription: 'You can now share your presale invitation link.',
    levels: [
      { level: 'Level 1', includes: 'Direct invitees' },
      { level: 'Level 2', includes: 'Invitees from your invitees' },
      { level: 'Level 3', includes: 'Third level of your network' },
    ],
    connectTitle: 'Connect your wallet',
    connectText: 'Connect an EVM wallet to view your progress and check whether your invitation link is available.',
    wrongChainTitle: 'Wrong network',
    wrongChainTextPrefix: 'Switch to',
    wrongChainTextSuffix: 'to review your purchase and your link.',
    panelTitle: 'Your invitation link',
    score: 'Score',
    inputLabel: 'Presale invitation link',
    copyLabel: 'Copy invitation link',
    copyButton: 'Copy link',
    activeText: 'Active link. Purchase volume from your invitations counts toward the sponsor competition.',
    unavailableTitle: 'Progress unavailable',
    loadingTitle: 'Loading progress',
    loadingText: 'We are checking your purchases and invitation link.',
    unlockLabel: 'Link unlock',
    boughtSuffix: 'UKI purchased',
    detectedPurchase: 'Purchase detected. Your invitation link will be available in a few minutes.',
    firstPurchaseNeeded: 'Your invitation link will appear after your first UKI purchase.',
    remainingPrefix: 'You need to buy',
    remainingSuffix: 'more UKI with this wallet to access your link.',
    noPurchase: 'You have not made any purchase with this wallet yet. Buy UKI to unlock your invitation link.',
    minimumReached: 'Minimum purchase reached. Your invitation link will be available in a few minutes.',
    buy: 'Buy UKI',
    table: {
      level: 'Level',
      includes: 'Includes',
      referrals: 'Referrals',
      purchased: 'Purchased by invitees',
      competition: 'Counts for competition',
      purchasedMobile: 'Purchased',
      competitionPoints: 'Competition points',
    },
    totalTitle: 'Total recommended UKI counting toward the competition',
    totalText: 'Applied calculation: Level 1 counts at 100%, Level 2 at 50%, and Level 3 at 25%.',
  },
} as const satisfies Record<PublicLocale, object>;

export function PresaleReferralLinkPanel() {
  const { locale } = usePublicLocale();
  const copy = referralPanelCopyByLocale[locale];
  const { address, chainId, connector: activeConnector, isConnected } = useAccount();
  const { fetchUser } = useAuth();
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
      await fetchUser(address, {
        evmConnector: activeConnector,
        promptForSignature: true,
        requireSignedWallet: true,
        walletType: 'evm',
      });

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
        setStatusError(copy.loadError);
      }
    } catch {
      setStatus(null);
      setStatusError(copy.loadError);
    } finally {
      setIsLoading(false);
    }
  }, [activeConnector, address, copy.loadError, fetchUser]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  async function copyReferralLink() {
    if (!status?.referralLink) return;

    await navigator.clipboard.writeText(status.referralLink);
    toast({
      title: copy.toastTitle,
      description: copy.toastDescription,
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
      level: copy.levels[0].level,
      includes: copy.levels[0].includes,
      referrals: status?.referralLevel1Count ?? 0,
      purchased: status?.referralLevel1UkiAmount ?? 0,
      weight: status?.levelWeights?.level1 ?? 1,
      color: 'text-[#f19bff]',
    },
    {
      level: copy.levels[1].level,
      includes: copy.levels[1].includes,
      referrals: status?.referralLevel2Count ?? 0,
      purchased: status?.referralLevel2UkiAmount ?? 0,
      weight: status?.levelWeights?.level2 ?? 0.5,
      color: 'text-[var(--uki-gold)]',
    },
    {
      level: copy.levels[2].level,
      includes: copy.levels[2].includes,
      referrals: status?.referralLevel3Count ?? 0,
      purchased: status?.referralLevel3UkiAmount ?? 0,
      weight: status?.levelWeights?.level3 ?? 0.25,
      color: 'text-[#c7a6ff]',
    },
  ];

  if (!isConnected || !address) {
    return (
      <div className="rounded-[10px] border border-[var(--uki-cyan)]/25 bg-[#070817]/82 p-5 shadow-[0_0_40px_rgba(228,92,255,0.06)]">
        <div className="flex gap-3 rounded-[9px] border border-[#f2c34b]/35 bg-[#2b1d08]/48 p-4">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-gold)]" strokeWidth={1.8} />
          <div>
            <p className="font-headline text-sm font-black uppercase tracking-[0.12em] text-[var(--uki-cream)]">{copy.connectTitle}</p>
            <span className="mt-1 block text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              {copy.connectText}
            </span>
          </div>
        </div>
        <LandingWalletConnectButton className="mt-4 w-full justify-center" showCompactText={false} />
      </div>
    );
  }

  if (isWrongChain) {
    return (
      <div className="rounded-[10px] border border-[var(--uki-cyan)]/25 bg-[#070817]/82 p-5 shadow-[0_0_40px_rgba(228,92,255,0.06)]">
        <div className="flex gap-3 rounded-[9px] border border-[#f2c34b]/35 bg-[#2b1d08]/48 p-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-gold)]" strokeWidth={1.8} />
          <div>
            <p className="font-headline text-sm font-black uppercase tracking-[0.12em] text-[var(--uki-cream)]">{copy.wrongChainTitle}</p>
            <span className="mt-1 block text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              {copy.wrongChainTextPrefix} {UKI_PRESALE_CHAIN_LABEL} {copy.wrongChainTextSuffix}
            </span>
          </div>
        </div>
        <LandingWalletConnectButton className="mt-4 w-full justify-center" showCompactText={false} />
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-[var(--uki-cyan)]/25 bg-[#070817]/82 p-5 shadow-[0_0_40px_rgba(228,92,255,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-headline text-sm font-black uppercase tracking-[0.14em] text-[var(--uki-cyan)]">
          <Users className="h-4 w-4" strokeWidth={1.8} />
          {copy.panelTitle}
        </span>
        <span className="inline-flex items-center gap-1 text-[0.68rem] font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {copy.score} {formatNumber(status?.referralWeightedScore, 2, locale)}
        </span>
      </div>

      {status?.referralLink ? (
        <>
          <div className="mt-4 flex items-center gap-2">
            <input
              value={status.referralLink}
              readOnly
              aria-label={copy.inputLabel}
              className="h-11 min-w-0 flex-1 rounded-[7px] border border-[var(--uki-cyan)]/20 bg-[#04030a] px-3 text-sm font-bold text-[var(--uki-cream)] outline-none"
            />
            <button
              type="button"
              onClick={copyReferralLink}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[7px] border border-[var(--uki-cyan)]/60 bg-[var(--uki-cyan)] px-4 font-headline text-xs font-black uppercase tracking-[0.08em] text-white shadow-[0_0_18px_rgba(228,92,255,0.22)] transition hover:bg-[#f19bff]"
              aria-label={copy.copyLabel}
            >
              <Copy className="h-4 w-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">{copy.copyButton}</span>
            </button>
          </div>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
            {copy.activeText}
          </p>
        </>
      ) : statusError ? (
        <div className="mt-4 flex gap-3 rounded-[9px] border border-[#f2c34b]/35 bg-[#2b1d08]/48 p-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-gold)]" strokeWidth={1.8} />
          <div>
            <p className="font-headline text-sm font-black uppercase tracking-[0.12em] text-[var(--uki-cream)]">{copy.unavailableTitle}</p>
            <span className="mt-1 block text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              {statusError}
            </span>
          </div>
        </div>
      ) : !status ? (
        <div className="mt-4 flex gap-3 rounded-[9px] border border-[var(--uki-cyan)]/20 bg-[#070817]/70 p-4">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--uki-cyan)]" strokeWidth={1.8} />
          <div>
            <p className="font-headline text-sm font-black uppercase tracking-[0.12em] text-[var(--uki-cream)]">{copy.loadingTitle}</p>
            <span className="mt-1 block text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              {copy.loadingText}
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4">
            <div className="flex items-end justify-between gap-2 text-[0.68rem] font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">
              <span>{copy.unlockLabel}</span>
              <span>
                {hasConfiguredMinimum
                  ? `${formatNumber(status?.totalUkiPurchased, 2, locale)} / ${formatNumber(referralMinimum, 2, locale)} UKI`
                  : `${formatNumber(status?.totalUkiPurchased, 2, locale)} ${copy.boughtSuffix}`}
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
                ? copy.detectedPurchase
                : copy.firstPurchaseNeeded
              : remainingUkiToUnlock > 0
              ? hasPurchasedUki
                ? `${copy.remainingPrefix} ${formatNumber(remainingUkiToUnlock, 2, locale)} ${copy.remainingSuffix}`
                : copy.noPurchase
              : copy.minimumReached}
          </p>
          <Link href="/#presale-console" className="uki-button uki-button-secondary mt-4 w-full justify-center">
            {copy.buy}
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
                  <th className="px-4 py-3 font-headline text-[0.65rem] font-black uppercase tracking-[0.12em]">{copy.table.level}</th>
                  <th className="px-4 py-3 font-headline text-[0.65rem] font-black uppercase tracking-[0.12em]">{copy.table.includes}</th>
                  <th className="px-4 py-3 font-headline text-[0.65rem] font-black uppercase tracking-[0.12em]">{copy.table.referrals}</th>
                  <th className="px-4 py-3 font-headline text-[0.65rem] font-black uppercase tracking-[0.12em]">{copy.table.purchased}</th>
                  <th className="px-4 py-3 text-right font-headline text-[0.65rem] font-black uppercase tracking-[0.12em]">
                    {copy.table.competition}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-[var(--uki-text)]">
                {referralLevels.map((level) => (
                  <tr key={level.level}>
                    <td className={`px-4 py-3 font-headline text-base font-black uppercase ${level.color}`}>{level.level}</td>
                    <td className="px-4 py-3 font-semibold">{level.includes}</td>
                    <td className="px-4 py-3 font-headline text-lg font-black text-[var(--uki-cream)]">
                      {formatNumber(level.referrals, 0, locale)}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      <span className="inline-flex items-center gap-2">
                        <Ticket className="h-4 w-4 text-[var(--uki-gold)]" strokeWidth={1.8} />
                        {formatNumber(level.purchased, 2, locale)} UKI
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-headline text-lg font-black text-[var(--uki-cream)]">
                      {formatNumber(level.purchased * level.weight, 2, locale)} UKI
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
                    <p className="text-[var(--uki-muted)] font-black uppercase tracking-[0.08em]">{copy.table.referrals}</p>
                    <p className="font-headline text-base font-black text-[var(--uki-cream)] mt-1">{formatNumber(level.referrals, 0, locale)}</p>
                  </div>
                  <div>
                    <p className="text-[var(--uki-muted)] font-black uppercase tracking-[0.08em]">{copy.table.purchasedMobile}</p>
                    <p className="font-semibold mt-1 flex items-center gap-1.5 text-xs text-[var(--uki-cream)]">
                      <Ticket className="h-3.5 w-3.5 text-[var(--uki-gold)]" strokeWidth={1.8} />
                      {formatNumber(level.purchased, 2, locale)} UKI
                    </p>
                  </div>
                </div>
                <div className="bg-white/[0.04] rounded-[6px] p-2 flex items-center justify-between">
                  <span className="text-[0.62rem] font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">{copy.table.competitionPoints}</span>
                  <strong className="font-headline text-sm font-black text-[var(--uki-gold)]">
                    {formatNumber(level.purchased * level.weight, 2, locale)} UKI
                    <span className="ml-1 text-[0.62rem] text-[var(--uki-muted)] font-normal">({Math.round(level.weight * 100)}%)</span>
                  </strong>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-3 rounded-[10px] border border-[#f2c34b]/30 bg-[#2b1d08]/40 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="inline-flex items-center gap-2 text-[0.72rem] font-black uppercase tracking-[0.12em] text-[#f19bff]">
                <Trophy className="h-4 w-4" strokeWidth={1.8} />
                {copy.totalTitle}
              </div>
              <strong className="font-headline text-3xl font-black uppercase leading-none text-[var(--uki-gold)]">
                {formatNumber(status.referralWeightedScore, 2, locale)} UKI
              </strong>
            </div>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              {copy.totalText}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
