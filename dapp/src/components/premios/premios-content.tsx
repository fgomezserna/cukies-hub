'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { isAddress, type Address } from 'viem';
import {
  Gift,
  Sparkles,
  Star,
  Ticket,
  Trophy,
  Users,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useAccount, useReadContract } from 'wagmi';
import { LandingHeader } from '@/components/landing/header';
import { LandingFooter } from '@/components/landing/footer';
import { PresaleReferralLinkPanel } from '@/components/landing/presale-referral-link-panel';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { UKI_PRESALE_CHAIN_ID } from '@/components/landing/sale-config';
import {
  CUKIE_MASTER_PURCHASE_UKI_DECIMALS,
  CukieMasterPurchaseProgress,
  formatUkiRawAmount,
} from '@/components/premios/cukie-master-purchase-progress';
import {
  purchaseRewardDisplay,
  purchaseRewards,
  rarityRewardDisplay,
  rarityRewards,
} from '@/components/premios/rewards-data';
import { presaleAbi, ukiSaleContracts } from '@/lib/contracts/uki-sale';
import type { PublicLocale } from '@/lib/public-locale';
import { usePublicLocale } from '@/providers/public-locale-provider';

function formatNumber(value?: number | null, maximumFractionDigits = 2, locale: PublicLocale = 'es') {
  if (value === undefined || value === null || !Number.isFinite(value)) return '0';
  return value.toLocaleString(locale === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits });
}

const UKI_RAW_UNIT = BigInt(10) ** BigInt(CUKIE_MASTER_PURCHASE_UKI_DECIMALS);

function wholeUkiToRaw(value: number) {
  return BigInt(value) * UKI_RAW_UNIT;
}

const premiosCopyByLocale = {
  es: {
    hero: {
      badge: 'Premios',
      titlePrefix: 'Elegibilidad de Cukies por comprar',
      titleMiddle: 'y por',
      titleStrong: 'invitar',
      text: 'Participa en la preventa y suma elegibilidad para sorteos o asignaciones de Cukies. Los tramos quedan sujetos a condiciones, reglas finales y validación operativa.',
      presale: 'Ir a la preventa',
      referrals: 'Mi progreso de referidos',
      imageAlt: 'Cukies con tesoro y condiciones de preventa UKI',
    },
    walletProgress: {
      badge: 'Progreso de preventa de tu Wallet',
      purchasedPrefix: 'Has comprado',
      needsPrefix: 'Necesitas comprar',
      needsSuffix: 'más',
      unlockPrefix: 'Para llegar al tramo de',
      max: 'Has alcanzado el tramo máximo de elegibilidad.',
      completed: 'completado',
      zero: '0 UKI',
    },
    purchase: {
      badge: 'Elegibilidad por compra',
      title: 'Tramos de sorteo según tus UKI comprados',
      text: 'Cada tramo de compra puede dar acceso a un sorteo diferente. La asignación final depende de las condiciones publicadas y la validación operativa.',
      notesTitle: 'Notas importantes',
      extraTickets: 'Desde 150.000 UKI, está previsto 1 ticket extra por cada 10.000 UKI comprados.',
      genNote: 'Todos los Cukies son de 1ª generación salvo indicación.',
      tier: 'Tier',
      achieved: 'Conseguido',
      next: 'Siguiente tramo',
      locked: 'Bloqueado',
      raffleLabel: 'Sorteo de',
    },
    referrals: {
      badge: 'Competición de referidos',
      title: 'Tramos de rareza previstos para patrocinadores',
      text: 'Los 5 mejores patrocinadores que atraigan más compras a la preventa aparecen en los tramos de Cukie de regalo previstos. La asignación final depende del volumen UKI, condiciones publicadas y validación operativa.',
      volumeRequired: 'Volumen requerido',
      rankingTitle: 'Ponderación para ranking',
      rankingLine1: 'Nivel 1 cuenta al 100%, nivel 2 al 50% y nivel 3 al 25%.',
      rankingLine2: 'Como máximo se entregará un Cukie Goat y un Cukie Legendario.',
      raffleTitle: 'Sorteo para el resto',
      raffleLine1: 'El resto de participantes entra en el sorteo de 10 Cukies de 2ª Generación.',
      raffleLine2: 'Recibes 1 ticket para el sorteo por cada 5.000 UKI recomendados.',
    },
    referralProgress: {
      badge: 'Tu progreso en la competición de referidos',
      title: 'Comparte tu enlace y sube en el ranking',
      text: 'Comparte tu enlace, invita a otros usuarios y aumenta tu progreso dentro de la competición de sponsors.',
    },
    finalCta: {
      title: 'Consulta tu elegibilidad en la preventa UKI',
      text: 'Participa comprando UKI o invitando a tus amigos para entrar en tramos sujetos a condiciones y subir en la competición.',
      presale: 'Ir a la preventa',
      home: 'Volver al inicio',
    },
  },
  en: {
    hero: {
      badge: 'Rewards',
      titlePrefix: 'Cukie eligibility by buying',
      titleMiddle: 'and by',
      titleStrong: 'inviting',
      text: 'Join the presale and build eligibility for Cukie raffles or allocations. Tiers are subject to conditions, final rules, and operational validation.',
      presale: 'Go to presale',
      referrals: 'My referral progress',
      imageAlt: 'Cukies with treasure and UKI presale conditions',
    },
    walletProgress: {
      badge: 'Your wallet presale progress',
      purchasedPrefix: 'You have bought',
      needsPrefix: 'You need to buy',
      needsSuffix: 'more',
      unlockPrefix: 'To reach the',
      max: 'You have reached the maximum eligibility tier.',
      completed: 'complete',
      zero: '0 UKI',
    },
    purchase: {
      badge: 'Purchase eligibility',
      title: 'Raffle tiers based on your UKI purchases',
      text: 'Each purchase tier may provide access to a different raffle. Final allocation depends on published conditions and operational validation.',
      notesTitle: 'Important notes',
      extraTickets: 'From 150,000 UKI, 1 extra ticket is planned for every 10,000 UKI purchased.',
      genNote: 'All Cukies are 1st generation unless stated otherwise.',
      tier: 'Tier',
      achieved: 'Achieved',
      next: 'Next tier',
      locked: 'Locked',
      raffleLabel: 'Raffle',
    },
    referrals: {
      badge: 'Referral competition',
      title: 'Planned rarity tiers for sponsors',
      text: 'The top 5 sponsors who bring the highest presale purchase volume appear in planned gifted-Cukie tiers. Final allocation depends on UKI volume, published conditions, and operational validation.',
      volumeRequired: 'Required volume',
      rankingTitle: 'Ranking weighting',
      rankingLine1: 'Level 1 counts at 100%, level 2 at 50%, and level 3 at 25%.',
      rankingLine2: 'At most one Cukie Goat and one Legendary Cukie will be awarded.',
      raffleTitle: 'Raffle for the rest',
      raffleLine1: 'All other participants enter the raffle for 10 2nd Generation Cukies.',
      raffleLine2: 'You receive 1 raffle ticket for every 5,000 recommended UKI.',
    },
    referralProgress: {
      badge: 'Your referral competition progress',
      title: 'Share your link and climb the ranking',
      text: 'Share your link, invite other users, and increase your progress in the sponsor competition.',
    },
    finalCta: {
      title: 'Check your UKI presale eligibility',
      text: 'Participate by buying UKI or inviting friends to enter conditional tiers and climb the competition.',
      presale: 'Go to presale',
      home: 'Back to home',
    },
  },
} as const satisfies Record<PublicLocale, object>;

const purchaseReadCopyByLocale = {
  es: {
    connect: 'Conecta tu wallet para ver tu progreso Cukie Master',
    connectHelper: 'Consulta tus cinco rangos según los UKI comprados en preventa.',
    connectCta: 'Conectar y comprar UKI',
    loading: 'Consultando tus compras de preventa…',
    loadingHelper: 'Estamos leyendo el acumulado exacto de tu wallet en BSC.',
    error: 'No hemos podido leer tus UKI comprados.',
    errorHelper: 'Tu progreso no se estimará con datos incompletos. Reintenta la lectura on-chain.',
    configError: 'La dirección de preventa no está configurada correctamente. El progreso queda oculto para no mostrar datos inventados.',
    retry: 'Reintentar',
    raffle: 'Progreso hacia el siguiente sorteo',
    raffleProgress: 'Porcentaje completado hacia el siguiente tramo de sorteo',
  },
  en: {
    connect: 'Connect your wallet to see your Cukie Master progress',
    connectHelper: 'Check your five ranks based on the UKI purchased in the presale.',
    connectCta: 'Connect and buy UKI',
    loading: 'Checking your presale purchases…',
    loadingHelper: 'We are reading your wallet’s exact total on BSC.',
    error: 'We could not read your purchased UKI.',
    errorHelper: 'Your progress will not be estimated from incomplete data. Retry the on-chain read.',
    configError: 'The presale address is not configured correctly. Progress stays hidden rather than showing estimated data.',
    retry: 'Retry',
    raffle: 'Progress toward the next raffle',
    raffleProgress: 'Percentage completed toward the next raffle tier',
  },
} as const satisfies Record<PublicLocale, object>;

export function PremiosContent() {
  const { locale } = usePublicLocale();
  const copy = premiosCopyByLocale[locale];
  const readCopy = purchaseReadCopyByLocale[locale];
  const { address, isConnected } = useAccount();
  const configuredPresaleAddress = ukiSaleContracts.presaleAddress;
  const presaleAddress = typeof configuredPresaleAddress === 'string'
    && isAddress(configuredPresaleAddress)
    ? configuredPresaleAddress as Address
    : undefined;
  const {
    data: totalPurchasedRaw,
    isError: isPurchaseReadError,
    refetch: refetchPurchasedUki,
  } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: presaleAddress,
    abi: presaleAbi,
    functionName: 'ukiPurchased',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(isConnected && address && presaleAddress),
      staleTime: 15_000,
    },
  });
  const purchaseReadFailed = Boolean(
    isConnected
      && address
      && (!presaleAddress || isPurchaseReadError),
  );
  const purchaseReadPending = Boolean(
    isConnected
      && address
      && presaleAddress
      && totalPurchasedRaw === undefined
      && !purchaseReadFailed,
  );

  // Encontrar el siguiente tramo a alcanzar
  const nextTier = totalPurchasedRaw !== undefined
    ? purchaseRewards.find((reward) => totalPurchasedRaw < wholeUkiToRaw(reward.amount))
    : null;

  // Encontrar el tramo actual más alto alcanzado
  const currentTier = totalPurchasedRaw !== undefined
    ? [...purchaseRewards]
      .reverse()
      .find((reward) => totalPurchasedRaw >= wholeUkiToRaw(reward.amount))
    : null;
  const nextTierDisplay = nextTier ? purchaseRewardDisplay(nextTier, locale) : null;
  const currentTierDisplay = currentTier ? purchaseRewardDisplay(currentTier, locale) : null;

  // Progreso hacia el siguiente tramo
  let progressPercentage = 0;
  let remainingForNextRaw = BigInt(0);
  if (totalPurchasedRaw !== undefined && nextTier) {
    const previousLimitRaw = currentTier ? wholeUkiToRaw(currentTier.amount) : BigInt(0);
    const nextLimitRaw = wholeUkiToRaw(nextTier.amount);
    const requiredAmountRaw = nextLimitRaw - previousLimitRaw;
    const currentProgressRaw = totalPurchasedRaw > previousLimitRaw
      ? totalPurchasedRaw - previousLimitRaw
      : BigInt(0);

    progressPercentage = requiredAmountRaw > BigInt(0)
      ? Number((currentProgressRaw * BigInt(10_000)) / requiredAmountRaw) / 100
      : 0;
    remainingForNextRaw = nextLimitRaw > totalPurchasedRaw
      ? nextLimitRaw - totalPurchasedRaw
      : BigInt(0);
  }
  const displayedProgressPercentage = Math.floor(progressPercentage);

  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    setAnimatedProgress(0);

    if (progressPercentage > 0) {
      const timer = setTimeout(() => {
        setAnimatedProgress(progressPercentage);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [address, progressPercentage]);

  return (
    <>
      <LandingHeader />

      <section className="uki-container relative z-[2] pb-12 pt-24">
        <ScrollReveal animation="fade" duration={900} className="w-full">
          <div className="uki-premios-page-hero">
            <Image
              src="/brand/generated/uki-premios-cukies-rewards-hero-v5.png"
              alt={copy.hero.imageAlt}
              fill
              className="uki-premios-page-hero-image"
              sizes="100vw"
              priority
            />
            <div className="uki-premios-page-hero-scrim" />
            <div className="uki-premios-page-hero-copy">
              <p className="uki-launch-badge">{copy.hero.badge}</p>
              <h1>
                {copy.hero.titlePrefix} <span>UKI</span> {copy.hero.titleMiddle} <strong>{copy.hero.titleStrong}</strong>
              </h1>
              <p>
                {copy.hero.text}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/#presale-console" className="uki-button uki-button-primary justify-center">
                  {copy.hero.presale}
                </Link>
                <Link href="#progreso-referidos" className="uki-button uki-button-secondary justify-center">
                  {copy.hero.referrals}
                </Link>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Sección: Progreso de compra de la wallet conectada */}
      <section id="progreso-cukie-master" className="uki-container relative z-[2] scroll-mt-24 pb-6">
        <ScrollReveal animation="up" duration={700} className="w-full">
            {!isConnected || !address ? (
              <div className="rounded-[14px] border border-[#e45cff]/30 bg-[#070817]/82 p-5">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-cyan)]">
                  {copy.walletProgress.badge}
                </p>
                <h2 className="mt-1 max-w-3xl font-headline text-xl font-black uppercase leading-tight text-[var(--uki-cream)] sm:text-2xl">
                  {readCopy.connect}
                </h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                  {readCopy.connectHelper}
                </p>
                <Link
                  href="/#presale-console"
                  className="uki-button uki-button-secondary mt-4 justify-center active:-translate-y-px"
                >
                  {readCopy.connectCta}
                </Link>
              </div>
            ) : purchaseReadPending ? (
              <div
                role="status"
                aria-live="polite"
                className="rounded-[14px] border border-[#e45cff]/30 bg-[#070817]/82 p-5"
              >
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-cyan)]">
                  {copy.walletProgress.badge}
                </p>
                <h2 className="mt-1 font-headline text-xl font-black uppercase text-[var(--uki-cream)] sm:text-2xl">
                  {readCopy.loading}
                </h2>
                <p className="mt-2 text-xs font-semibold text-[var(--uki-muted)]">
                  {readCopy.loadingHelper}
                </p>
                <div className="mt-4 grid grid-cols-1 gap-1.5 md:grid-cols-5 md:gap-2" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, index) => (
                    <div key={index} className="h-14 animate-pulse rounded-[8px] border border-white/[0.08] bg-white/[0.04] motion-reduce:animate-none md:h-[132px]" />
                  ))}
                </div>
              </div>
            ) : purchaseReadFailed ? (
              <div
                role="alert"
                className="rounded-[14px] border border-amber-300/30 bg-[#070817]/82 p-5"
              >
                <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-300">
                  {copy.walletProgress.badge}
                </p>
                <h2 className="mt-1 font-headline text-xl font-black uppercase text-[var(--uki-cream)] sm:text-2xl">
                  {readCopy.error}
                </h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                  {presaleAddress ? readCopy.errorHelper : readCopy.configError}
                </p>
                {presaleAddress ? (
                  <button
                    type="button"
                    onClick={() => void refetchPurchasedUki()}
                    className="mt-4 rounded-[8px] border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-amber-200 transition-transform duration-300 active:-translate-y-px motion-reduce:transition-none"
                  >
                    {readCopy.retry}
                  </button>
                ) : null}
              </div>
            ) : totalPurchasedRaw !== undefined ? (
              <div className="rounded-[14px] border border-[#e45cff]/30 bg-[#070817]/82 p-5 shadow-[0_0_32px_rgba(228,92,255,0.08)]">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-cyan)]">
                    {copy.walletProgress.badge}
                  </p>
                  <h2 className="mt-1 font-headline text-xl font-black uppercase text-[var(--uki-cream)] sm:text-2xl">
                    {copy.walletProgress.purchasedPrefix}{' '}
                    <span className="text-[var(--uki-gold)]">{formatUkiRawAmount(totalPurchasedRaw, locale)} UKI</span>
                  </h2>
                </div>

                <CukieMasterPurchaseProgress
                  totalPurchasedRaw={totalPurchasedRaw}
                  locale={locale}
                />

                <div className="mt-4 border-t border-white/[0.08] pt-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-[var(--uki-cyan)]">
                      {readCopy.raffle}
                    </p>
                    {nextTier && nextTierDisplay ? (
                      <div className="text-left sm:text-right">
                        <p className="text-xs font-semibold text-[var(--uki-text)]">
                          {copy.walletProgress.needsPrefix}{' '}
                          <strong className="text-[var(--uki-cyan)]">{formatUkiRawAmount(remainingForNextRaw, locale)} UKI</strong>{' '}
                          {copy.walletProgress.needsSuffix}
                        </p>
                        <p className="mt-0.5 text-[0.68rem] font-bold uppercase text-[var(--uki-muted)]">
                          {copy.walletProgress.unlockPrefix} {nextTierDisplay.amountStr}
                        </p>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--uki-gold)]/30 bg-[var(--uki-gold)]/10 p-2.5 text-xs font-bold text-[var(--uki-gold)]">
                        <Trophy aria-hidden="true" className="h-4 w-4" />
                        {copy.walletProgress.max}
                      </div>
                    )}
                  </div>

                  {nextTier ? (
                    <div className="mt-3">
                      <div
                        role="progressbar"
                        aria-label={readCopy.raffleProgress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progressPercentage}
                        aria-valuetext={`${displayedProgressPercentage}% ${copy.walletProgress.completed}`}
                        className="h-3 overflow-hidden rounded-full border border-white/5 bg-black/45"
                      >
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#e45cff] to-[#f2c34b] transition-[width] duration-700 ease-out motion-reduce:transition-none"
                          style={{ width: `${animatedProgress}%` }}
                        />
                      </div>
                      <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] gap-2 text-[0.65rem] font-bold uppercase tracking-wider text-[var(--uki-muted)]">
                        <span>{currentTierDisplay ? currentTierDisplay.amountStr : copy.walletProgress.zero}</span>
                        <span>{displayedProgressPercentage}% {copy.walletProgress.completed}</span>
                        <span className="text-right">{nextTierDisplay?.amountStr}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
        </ScrollReveal>
      </section>

      <section className="uki-container relative z-[2] pb-12">
        <div className="rounded-[14px] border border-[var(--uki-cyan)]/25 bg-[#070817]/82 p-4 shadow-[0_0_44px_rgba(228,92,255,0.06)] sm:p-6">
          <div className="grid gap-8 lg:grid-cols-[0.34fr_0.66fr]">
            <ScrollReveal animation="left" duration={800} className="flex flex-col justify-between gap-6">
              <div>
                <p className="uki-launch-badge">{copy.purchase.badge}</p>
                <h2 className="mt-4 font-headline text-3xl font-black uppercase leading-tight text-[var(--uki-cream)] sm:text-4xl">
                  {copy.purchase.title}
                </h2>
                <p className="mt-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                  {copy.purchase.text}
                </p>
              </div>

              <div className="rounded-[10px] border border-[var(--uki-cyan)]/20 bg-[#0d0b24]/60 p-4">
                <p className="text-sm font-black uppercase tracking-[0.12em] text-[var(--uki-cyan)]">{copy.purchase.notesTitle}</p>
                <ul className="mt-4 space-y-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                  <li className="flex gap-3">
                    <Ticket className="mt-0.5 h-5 w-5 shrink-0 text-[var(--uki-cyan)]" strokeWidth={1.8} />
                    <span>{copy.purchase.extraTickets}</span>
                  </li>
                  <li className="flex gap-3">
                    <Star className="mt-0.5 h-5 w-5 shrink-0 text-[var(--uki-gold)]" strokeWidth={1.8} />
                    <span>{copy.purchase.genNote}</span>
                  </li>
                </ul>
              </div>
            </ScrollReveal>

            <div className="grid gap-3.5">
              {purchaseRewards.map((reward, index) => {
                const rewardThresholdRaw = wholeUkiToRaw(reward.amount);
                const isUnlocked = totalPurchasedRaw !== undefined
                  && totalPurchasedRaw >= rewardThresholdRaw;
                const isNext = totalPurchasedRaw !== undefined && nextTier?.amount === reward.amount;
                const rewardDisplay = purchaseRewardDisplay(reward, locale);

                return (
                  <ScrollReveal
                    key={reward.amount}
                    animation="up"
                    delay={index * 100}
                    className="w-full"
                  >
                    <article
                      className={`uki-hover-card flex flex-col gap-3.5 rounded-[12px] border ${reward.border} ${
                        reward.tone
                      } bg-gradient-to-r p-4 sm:p-5 relative overflow-hidden transition-all duration-300 ${
                        totalPurchasedRaw !== undefined && !isUnlocked && !isNext ? 'opacity-52 filter saturate-50' : ''
                      } ${isUnlocked ? 'border-[#e45cff]/50 bg-[#051a1a]/40 shadow-[0_0_20px_rgba(228,92,255,0.08)]' : ''} ${
                        isNext ? 'border-dashed border-[var(--uki-cyan)]/60 shadow-[0_0_20px_rgba(228,92,255,0.1)]' : ''
                      }`}
                    >
                      {/* Fila 1: Monto, Tier badge y Estado */}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#f2c34b]/70 bg-[#3a2508] text-[0.62rem] font-black text-[#ffe08a] shadow-[0_0_14px_rgba(242,195,75,0.18)]">
                            UKI
                          </span>
                          <div className="flex items-center gap-2">
                            <strong className="font-headline text-xl font-black uppercase leading-none text-[var(--uki-cream)]">
                              {rewardDisplay.amountStr}
                            </strong>
                            <span className={`inline-block text-[0.58rem] font-bold uppercase px-1.5 py-0.5 rounded-[4px] border ${reward.badgeColor}`}>
                              {copy.purchase.tier} {rewardDisplay.tier}
                            </span>
                          </div>
                        </div>

                        {/* Estado del usuario conectado */}
                        {totalPurchasedRaw !== undefined && (
                          <div className="shrink-0 mt-1 sm:mt-0">
                            {isUnlocked ? (
                              <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-[var(--uki-cyan)] font-bold bg-[#e45cff]/10 border border-[#e45cff]/30 px-2.5 py-1 rounded-[6px]">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {copy.purchase.achieved}
                              </span>
                            ) : isNext ? (
                              <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-[var(--uki-gold)] font-bold bg-[#f2c34b]/10 border border-[#f2c34b]/30 px-2.5 py-1 rounded-[6px]">
                                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                                {copy.purchase.next}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-[var(--uki-muted)] font-bold bg-white/5 border border-white/10 px-2.5 py-1 rounded-[6px]">
                                <Lock className="h-3.5 w-3.5" />
                                {copy.purchase.locked}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Fila 2: Premio y descripción */}
                      <div className="flex items-start gap-3">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--uki-cyan)]/10 text-[var(--uki-cyan)] border border-[var(--uki-cyan)]/20">
                          <Gift className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">{copy.purchase.raffleLabel}</p>
                          <h3 className="font-headline text-base font-black uppercase leading-tight text-[var(--uki-cream)] mt-0.5">
                            {rewardDisplay.prize}
                          </h3>
                          <p className="mt-0.5 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-gold)]">{rewardDisplay.helper}</p>
                        </div>
                      </div>
                    </article>
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="uki-container relative z-[2] pb-12">
        <ScrollReveal animation="fade" className="w-full">
          <div className="rounded-[14px] border border-[#d953ff]/32 bg-[#06101d]/88 p-4 sm:p-6">
            <div className="grid gap-6">
              <div>
                <p className="uki-launch-badge">{copy.referrals.badge}</p>
                <h2 className="mt-3 font-headline text-3xl font-black uppercase leading-tight text-[var(--uki-cream)]">
                  {copy.referrals.title}
                </h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-text)] max-w-3xl">
                  {copy.referrals.text}
                </p>
              </div>

              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {rarityRewards.map((rarity, index) => {
                  const Icon = rarity.icon;
                  const rarityDisplay = rarityRewardDisplay(rarity, locale);

                  return (
                    <ScrollReveal
                      key={rarity.name}
                      animation="up"
                      delay={index * 80}
                      className="w-full"
                    >
                      <article
                        className={`uki-hover-card rounded-[12px] border ${rarity.border} ${rarity.glow} bg-[#09091a]/86 p-5 flex flex-col justify-between transition-all duration-300 relative overflow-hidden min-h-[190px]`}
                      >
                        {/* Barra decorativa superior */}
                        <div className={`absolute top-0 inset-x-0 h-1.5 bg-current ${rarity.text}`} />
                        
                        <div className="flex items-start justify-between gap-4 pt-2">
                          <div>
                            <h3 className={`font-headline text-lg font-black uppercase tracking-wider ${rarity.text}`}>
                              {rarityDisplay.name}
                            </h3>
                            <p className="mt-1 font-headline text-2xl font-black leading-none text-[var(--uki-cream)]">
                              {rarityDisplay.threshold}
                            </p>
                            
                            {/* Estrellitas de rareza */}
                            {rarity.stars > 0 && (
                              <div className="flex gap-1 mt-2.5">
                                {Array.from({ length: rarity.stars }).map((_, i) => (
                                  <Star key={i} className={`h-3.5 w-3.5 fill-current ${rarity.text}`} />
                                ))}
                              </div>
                            )}
                          </div>
                          <Icon className={`h-8 w-8 ${rarity.text}`} strokeWidth={1.8} />
                        </div>

                        {/* Pie de tarjeta con badge de rareza */}
                        <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-3">
                          <span className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--uki-muted)]">{copy.referrals.volumeRequired}</span>
                          <span className={`text-[0.62rem] font-black uppercase tracking-wider ${rarity.text} px-2 py-0.5 rounded bg-white/5 border border-current/10`}>
                            {rarityDisplay.name}
                          </span>
                        </div>
                      </article>
                    </ScrollReveal>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <ScrollReveal animation="left" duration={700}>
                <RulePanel icon={Users} title={copy.referrals.rankingTitle}>
                  <p>{copy.referrals.rankingLine1}</p>
                  <p className="mt-3">{copy.referrals.rankingLine2}</p>
                </RulePanel>
              </ScrollReveal>
              <ScrollReveal animation="right" duration={700}>
                <RulePanel icon={Gift} title={copy.referrals.raffleTitle}>
                  <p>{copy.referrals.raffleLine1}</p>
                  <p className="mt-3">{copy.referrals.raffleLine2}</p>
                </RulePanel>
              </ScrollReveal>
            </div>
          </div>
        </ScrollReveal>
      </section>

      <section id="progreso-referidos" className="uki-container relative z-[2] scroll-mt-28 pb-14">
        <ScrollReveal animation="scale" className="w-full">
          <div className="rounded-[14px] border border-[var(--uki-cyan)]/25 bg-[#070817]/82 p-4 shadow-[0_0_48px_rgba(228,92,255,0.08)] sm:p-6">
            <div className="grid gap-6 lg:grid-cols-[0.36fr_0.64fr]">
              <div>
                <p className="uki-launch-badge">{copy.referralProgress.badge}</p>
                <h2 className="mt-4 font-headline text-3xl font-black uppercase leading-tight text-[var(--uki-cream)] sm:text-4xl">
                  {copy.referralProgress.title}
                </h2>
                <p className="mt-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                  {copy.referralProgress.text}
                </p>
              </div>
              <PresaleReferralLinkPanel />
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* CTA Final */}
      <section className="uki-container pb-14 relative z-[2]">
        <ScrollReveal animation="scale" className="w-full">
          <div className="rounded-[14px] border border-[#e45cff]/30 bg-[#070817]/82 overflow-hidden relative min-h-[16rem] flex flex-col justify-center p-6 sm:p-8 shadow-[0_0_48px_rgba(228,92,255,0.1)]">
            <div className="absolute inset-0 bg-cover bg-center opacity-15" style={{ backgroundImage: 'url("/brand/generated/uki-final-cta-scene-v2.png")' }} />
            <div className="relative z-10 max-w-lg">
              <h2 className="font-headline text-3xl font-black uppercase leading-[1.05] text-[var(--uki-cream)] sm:text-4xl">
                {copy.finalCta.title}
              </h2>
              <p className="mt-3 text-sm font-semibold leading-snug text-[var(--uki-text)]">
                {copy.finalCta.text}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/#presale-console" className="uki-button uki-button-primary justify-center">
                  {copy.finalCta.presale}
                </Link>
                <Link href="/" className="uki-button uki-button-secondary justify-center">
                  {copy.finalCta.home}
                </Link>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      <LandingFooter />
    </>
  );
}

function RulePanel({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-[10px] border border-white/10 bg-[#09091a]/82 p-4">
      <div className="flex items-center gap-3">
        <Icon className="h-6 w-6 text-[var(--uki-cyan)]" strokeWidth={1.8} />
        <h3 className="font-headline text-base font-black uppercase tracking-[0.08em] text-[var(--uki-cream)]">{title}</h3>
      </div>
      <div className="mt-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">{children}</div>
    </article>
  );
}
