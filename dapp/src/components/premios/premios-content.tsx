'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Crown,
  Gift,
  Sparkles,
  Star,
  Ticket,
  Trophy,
  Users,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useAccount } from 'wagmi';
import { LandingHeader } from '@/components/landing/header';
import { LandingFooter } from '@/components/landing/footer';
import { PresaleReferralLinkPanel } from '@/components/landing/presale-referral-link-panel';
import { ScrollReveal } from '@/components/landing/scroll-reveal';

const purchaseRewards = [
  {
    amount: 10000,
    amountStr: '10.000 UKI',
    prize: 'Sorteo de 10 Cukies de 2ª Generación',
    helper: 'Rarezas variadas',
    tier: 'Bronce',
    badgeColor: 'bg-[#a35e26]/30 text-[#e4a06d] border-[#a35e26]/60',
    tone: 'from-[#a35e26]/12 to-[#09091a]/86',
    border: 'border-[#a35e26]/30',
  },
  {
    amount: 30000,
    amountStr: '30.000 UKI',
    prize: 'Sorteo de 5 Cukies Comunes',
    helper: 'Primer bloque garantizado de participación',
    tier: 'Bronce',
    badgeColor: 'bg-[#a35e26]/30 text-[#e4a06d] border-[#a35e26]/60',
    tone: 'from-[#a35e26]/12 to-[#09091a]/86',
    border: 'border-[#a35e26]/30',
  },
  {
    amount: 50000,
    amountStr: '50.000 UKI',
    prize: 'Sorteo de 2 Cukies Raros + 3 Cukies No Comunes',
    helper: 'Más rareza por mayor tramo',
    tier: 'Plata',
    badgeColor: 'bg-[#6b7280]/30 text-[#e2e8f0] border-[#9ca3af]/60',
    tone: 'from-[#4b5563]/16 to-[#09091a]/86',
    border: 'border-[#6b7280]/30',
  },
  {
    amount: 80000,
    amountStr: '80.000 UKI',
    prize: 'Sorteo de 1 Cukie Épico + 2 Cukies Raros + 2 Cukies No Comunes',
    helper: 'Entrada en premios premium',
    tier: 'Oro',
    badgeColor: 'bg-[#b8860b]/30 text-[#ffd700] border-[#b8860b]/60',
    tone: 'from-[#b8860b]/18 to-[#09091a]/86',
    border: 'border-[#b8860b]/30',
  },
  {
    amount: 125000,
    amountStr: '125.000 UKI',
    prize: 'Sorteo de 1 Cukie Legendario + 3 Cukies Épicos',
    helper: 'Tramo alto de lanzamiento',
    tier: 'Platino',
    badgeColor: 'bg-[#008080]/30 text-[#44edd6] border-[#008080]/60',
    tone: 'from-[#008080]/20 to-[#09091a]/86 shadow-[0_0_24px_rgba(0,128,128,0.15)]',
    border: 'border-[#008080]/45',
  },
  {
    amount: 150000,
    amountStr: '150.000 UKI',
    prize: 'Sorteo de 1 Cukie Goat + 3 Cukies Legendarios',
    helper: '+ tickets extra desde este tramo',
    tier: 'Leyenda',
    badgeColor: 'bg-[#8b0000]/30 text-[#ff4d4d] border-[#ff4d4d]/60',
    tone: 'from-[#ff4d4d]/15 to-[#8b0000]/8 bg-gradient-to-r shadow-[0_0_32px_rgba(255,77,77,0.22)]',
    border: 'border-[#ff4d4d]/50',
    isLegendary: true,
  },
];

const rarityRewards = [
  {
    name: 'Goat',
    threshold: '3.000.000 UKI',
    border: 'border-[#f2c34b]/70 hover:border-[#f2c34b]',
    glow: 'shadow-[0_0_22px_rgba(242,195,75,0.2)]',
    text: 'text-[#ffe08a]',
    icon: Crown,
    stars: 5,
  },
  {
    name: 'Legendario',
    threshold: '1.500.000 UKI',
    border: 'border-[#d7a63e]/65 hover:border-[#d7a63e]',
    glow: 'shadow-[0_0_18px_rgba(215,166,62,0.16)]',
    text: 'text-[#f2c34b]',
    icon: Trophy,
    stars: 4,
  },
  {
    name: 'Épico',
    threshold: '750.000 UKI',
    border: 'border-[#d953ff]/65 hover:border-[#d953ff]',
    glow: 'shadow-[0_0_18px_rgba(217,83,255,0.15)]',
    text: 'text-[#f19bff]',
    icon: Sparkles,
    stars: 3,
  },
  {
    name: 'Raro',
    threshold: '500.000 UKI',
    border: 'border-[#38bdf8]/65 hover:border-[#38bdf8]',
    glow: 'shadow-[0_0_14px_rgba(56,189,248,0.12)]',
    text: 'text-[#7dd3fc]',
    icon: Star,
    stars: 2,
  },
  {
    name: 'No Común',
    threshold: '250.000 UKI',
    border: 'border-[#91e96f]/65 hover:border-[#91e96f]',
    glow: 'shadow-[0_0_14px_rgba(145,233,111,0.12)]',
    text: 'text-[#b8f486]',
    icon: Gift,
    stars: 1,
  },
  {
    name: 'Común',
    threshold: '>250.000 UKI',
    border: 'border-white/20 hover:border-white/40',
    glow: '',
    text: 'text-[var(--uki-cream)]',
    icon: Users,
    stars: 0,
  },
];

function formatNumber(value?: number | null, maximumFractionDigits = 2) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US', { maximumFractionDigits });
}

export function PremiosContent() {
  const { address, isConnected } = useAccount();
  const [totalPurchased, setTotalPurchased] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPurchasedUki = useCallback(async () => {
    if (!address) {
      setTotalPurchased(null);
      return;
    }
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        walletAddress: address,
        origin: window.location.origin,
      });
      const response = await fetch(`/api/presale/referral/status?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setTotalPurchased(data.totalUkiPurchased ?? 0);
      }
    } catch {
      setTotalPurchased(null);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      void fetchPurchasedUki();
    } else {
      setTotalPurchased(null);
    }
  }, [address, isConnected, fetchPurchasedUki]);

  // Encontrar el siguiente tramo a alcanzar
  const nextTier = totalPurchased !== null
    ? purchaseRewards.find((reward) => totalPurchased < reward.amount)
    : null;

  // Encontrar el tramo actual más alto alcanzado
  const currentTier = totalPurchased !== null
    ? [...purchaseRewards].reverse().find((reward) => totalPurchased >= reward.amount)
    : null;

  // Progreso hacia el siguiente tramo
  let progressPercentage = 0;
  let remainingForNext = 0;
  if (totalPurchased !== null && nextTier) {
    const previousLimit = currentTier ? currentTier.amount : 0;
    const requiredAmount = nextTier.amount - previousLimit;
    const currentProgress = totalPurchased - previousLimit;
    progressPercentage = Math.min(Math.max((currentProgress / requiredAmount) * 100, 0), 100);
    remainingForNext = nextTier.amount - totalPurchased;
  }

  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    if (progressPercentage > 0) {
      const timer = setTimeout(() => {
        setAnimatedProgress(progressPercentage);
      }, 400);
      return () => clearTimeout(timer);
    } else {
      setAnimatedProgress(0);
    }
  }, [progressPercentage]);

  return (
    <>
      <LandingHeader />

      <section className="uki-container relative z-[2] pb-12 pt-24">
        <ScrollReveal animation="fade" duration={900} className="w-full">
          <div className="uki-premios-page-hero">
            <Image
              src="/brand/generated/uki-premios-cukies-rewards-hero-v2.png"
              alt="Cukies con tesoro y premios UKI"
              fill
              className="uki-premios-page-hero-image"
              sizes="100vw"
              priority
            />
            <div className="uki-premios-page-hero-scrim" />
            <div className="uki-premios-page-hero-copy">
              <p className="uki-launch-badge">PREMIOS</p>
              <h1>
                Consigue Cukies por comprar <span>UKI</span> y por <strong>invitar</strong>
              </h1>
              <p>
                Participa en la preventa y suma oportunidades de conseguir Cukies. Cuanto más compras o más recomiendas,
                mejores premios desbloqueas.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/#presale-console" className="uki-button uki-button-primary justify-center">
                  Ir a la preventa
                </Link>
                <Link href="#progreso-referidos" className="uki-button uki-button-secondary justify-center">
                  Mi progreso de referidos
                </Link>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Sección: Progreso de compra de la wallet conectada */}
      {isConnected && totalPurchased !== null && (
        <section className="uki-container relative z-[2] pb-6">
          <ScrollReveal animation="up" duration={700} className="w-full">
            <div className="rounded-[14px] border border-[#2ee8d6]/30 bg-[#05131a]/82 p-5 shadow-[0_0_32px_rgba(46,232,214,0.08)]">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-cyan)]">Progreso de preventa de tu Wallet</p>
                  <h3 className="font-headline text-2xl font-black uppercase text-[var(--uki-cream)] mt-1">
                    Has comprado <span className="text-[var(--uki-gold)]">{formatNumber(totalPurchased, 0)} UKI</span>
                  </h3>
                </div>
                {nextTier ? (
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-semibold text-[var(--uki-text)]">
                      Necesitas comprar <strong className="text-[var(--uki-cyan)]">{formatNumber(remainingForNext, 0)} UKI</strong> más
                    </p>
                    <p className="text-[0.68rem] text-[var(--uki-muted)] font-bold uppercase mt-0.5">
                      Para desbloquear el tramo de {nextTier.amountStr}
                    </p>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-[8px] bg-[var(--uki-gold)]/10 border border-[var(--uki-gold)]/30 p-2.5 text-xs text-[var(--uki-gold)] font-bold">
                    <Trophy className="h-4 w-4" />
                    ¡Has alcanzado el tramo máximo de premios!
                  </div>
                )}
              </div>

              {nextTier && (
                <div className="mt-4">
                  <div className="h-3 overflow-hidden rounded-full bg-black/45 border border-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#2ee8d6] to-[#7c3cff] transition-all duration-700 ease-out"
                      style={{ width: `${animatedProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[0.65rem] font-bold text-[var(--uki-muted)] uppercase tracking-wider mt-1.5">
                    <span>{currentTier ? currentTier.amountStr : '0 UKI'}</span>
                    <span>{progressPercentage.toFixed(0)}% completado</span>
                    <span>{nextTier.amountStr}</span>
                </div>
              </div>
            )}
            </div>
          </ScrollReveal>
        </section>
      )}

      <section className="uki-container relative z-[2] pb-12">
        <div className="rounded-[14px] border border-[#7c3cff]/42 bg-[#070817]/86 p-4 shadow-[0_0_44px_rgba(124,60,255,0.16)] sm:p-6">
          <div className="grid gap-8 lg:grid-cols-[0.34fr_0.66fr]">
            <ScrollReveal animation="left" duration={800} className="flex flex-col justify-between gap-6">
              <div>
                <p className="uki-launch-badge">PREMIOS POR COMPRA</p>
                <h2 className="mt-4 font-headline text-3xl font-black uppercase leading-tight text-[var(--uki-cream)] sm:text-4xl">
                  Desbloquea sorteos según tus UKI comprados
                </h2>
                <p className="mt-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                  Cada tramo de compra te da acceso a un sorteo diferente. A mayor participación, mejores Cukies en juego.
                </p>
              </div>

              <div className="rounded-[10px] border border-[#7c3cff]/36 bg-[#0d0b24]/78 p-4">
                <p className="text-sm font-black uppercase tracking-[0.12em] text-[#f19bff]">Notas importantes</p>
                <ul className="mt-4 space-y-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                  <li className="flex gap-3">
                    <Ticket className="mt-0.5 h-5 w-5 shrink-0 text-[#e45cff]" strokeWidth={1.8} />
                    <span>Desde 150.000 UKI, recibes 1 ticket extra por cada 10.000 UKI comprados.</span>
                  </li>
                  <li className="flex gap-3">
                    <Star className="mt-0.5 h-5 w-5 shrink-0 text-[var(--uki-gold)]" strokeWidth={1.8} />
                    <span>Todos los Cukies son de 1ª generación salvo indicación.</span>
                  </li>
                </ul>
              </div>
            </ScrollReveal>

            <div className="grid gap-3.5">
              {purchaseRewards.map((reward, index) => {
                const isUnlocked = totalPurchased !== null && totalPurchased >= reward.amount;
                const isNext = totalPurchased !== null && nextTier?.amount === reward.amount;

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
                        totalPurchased !== null && !isUnlocked && !isNext ? 'opacity-52 filter saturate-50' : ''
                      } ${isUnlocked ? 'border-[#2ee8d6]/50 bg-[#051a1a]/40 shadow-[0_0_20px_rgba(46,232,214,0.08)]' : ''} ${
                        isNext ? 'border-dashed border-[#7c3cff]/70 shadow-[0_0_20px_rgba(124,60,255,0.12)]' : ''
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
                              {reward.amountStr}
                            </strong>
                            <span className={`inline-block text-[0.58rem] font-bold uppercase px-1.5 py-0.5 rounded-[4px] border ${reward.badgeColor}`}>
                              Tier {reward.tier}
                            </span>
                          </div>
                        </div>

                        {/* Estado del usuario conectado */}
                        {totalPurchased !== null && (
                          <div className="shrink-0 mt-1 sm:mt-0">
                            {isUnlocked ? (
                              <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-[var(--uki-cyan)] font-bold bg-[#2ee8d6]/10 border border-[#2ee8d6]/30 px-2.5 py-1 rounded-[6px]">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Conseguido
                              </span>
                            ) : isNext ? (
                              <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-[var(--uki-gold)] font-bold bg-[#f2c34b]/10 border border-[#f2c34b]/30 px-2.5 py-1 rounded-[6px]">
                                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                                Siguiente tramo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-[var(--uki-muted)] font-bold bg-white/5 border border-white/10 px-2.5 py-1 rounded-[6px]">
                                <Lock className="h-3.5 w-3.5" />
                                Bloqueado
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Fila 2: Premio y descripción */}
                      <div className="flex items-start gap-3">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#7c3cff]/10 text-[#e45cff] border border-[#7c3cff]/20">
                          <Gift className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Sorteo de</p>
                          <h3 className="font-headline text-base font-black uppercase leading-tight text-[var(--uki-cream)] mt-0.5">
                            {reward.prize}
                          </h3>
                          <p className="mt-0.5 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-gold)]">{reward.helper}</p>
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
          <div className="rounded-[14px] border border-[#38bdf8]/32 bg-[#06101d]/88 p-4 sm:p-6">
            <div className="grid gap-6">
              <div>
                <p className="uki-launch-badge">COMPETICIÓN DE REFERIDOS</p>
                <h2 className="mt-3 font-headline text-3xl font-black uppercase leading-tight text-[var(--uki-cream)]">
                  Premios de rareza garantizados para patrocinadores
                </h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-text)] max-w-3xl">
                  Los 5 mejores patrocinadores que atraigan más compras a la preventa tienen asegurado un Cukie de regalo.
                  La rareza final de tu recompensa se decide según el total de volumen UKI adquirido por tus invitados.
                </p>
              </div>

              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {rarityRewards.map((rarity, index) => {
                  const Icon = rarity.icon;

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
                              {rarity.name}
                            </h3>
                            <p className="mt-1 font-headline text-2xl font-black leading-none text-[var(--uki-cream)]">
                              {rarity.threshold}
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
                          <span className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--uki-muted)]">Volumen requerido</span>
                          <span className={`text-[0.62rem] font-black uppercase tracking-wider ${rarity.text} px-2 py-0.5 rounded bg-white/5 border border-current/10`}>
                            {rarity.name}
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
                <RulePanel icon={Users} title="Ponderación para ranking">
                  <p>Nivel 1 cuenta al 100%, nivel 2 al 50% y nivel 3 al 25%.</p>
                  <p className="mt-3">Como máximo se entregará un Cukie Goat y un Cukie Legendario.</p>
                </RulePanel>
              </ScrollReveal>
              <ScrollReveal animation="right" duration={700}>
                <RulePanel icon={Gift} title="Sorteo para el resto">
                  <p>El resto de participantes entra en el sorteo de 10 Cukies de 2ª Generación.</p>
                  <p className="mt-3">Recibes 1 ticket para el sorteo por cada 5.000 UKI recomendados.</p>
                </RulePanel>
              </ScrollReveal>
            </div>
          </div>
        </ScrollReveal>
      </section>

      <section id="progreso-referidos" className="uki-container relative z-[2] scroll-mt-28 pb-14">
        <ScrollReveal animation="scale" className="w-full">
          <div className="rounded-[14px] border border-[#e45cff]/44 bg-[#080719]/90 p-4 shadow-[0_0_48px_rgba(228,92,255,0.18)] sm:p-6">
            <div className="grid gap-6 lg:grid-cols-[0.36fr_0.64fr]">
              <div>
                <p className="uki-launch-badge">TU PROGRESO EN LA COMPETICIÓN DE REFERIDOS</p>
                <h2 className="mt-4 font-headline text-3xl font-black uppercase leading-tight text-[var(--uki-cream)] sm:text-4xl">
                  Comparte tu enlace y sube en el ranking
                </h2>
                <p className="mt-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                  Comparte tu enlace, invita a otros usuarios y aumenta tu progreso dentro de la competición de sponsors.
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
          <div className="rounded-[14px] border border-[#2ee8d6]/30 bg-[#05131a]/82 overflow-hidden relative min-h-[16rem] flex flex-col justify-center p-6 sm:p-8 shadow-[0_0_48px_rgba(46,232,214,0.1)]">
            <div className="absolute inset-0 bg-cover bg-center opacity-15" style={{ backgroundImage: 'url("/brand/generated/uki-final-cta-scene-v2.png")' }} />
            <div className="relative z-10 max-w-lg">
              <h2 className="font-headline text-3xl font-black uppercase leading-[1.05] text-[var(--uki-cream)] sm:text-4xl">
                Consigue tus premios en la preventa UKI
              </h2>
              <p className="mt-3 text-sm font-semibold leading-snug text-[var(--uki-text)]">
                Participa comprando UKI o invitando a tus amigos para desbloquear Cukies exclusivos y subir en la competición.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/#presale-console" className="uki-button uki-button-primary justify-center">
                  Ir a la preventa
                </Link>
                <Link href="/" className="uki-button uki-button-secondary justify-center">
                  Volver al inicio
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
        <Icon className="h-6 w-6 text-[#e45cff]" strokeWidth={1.8} />
        <h3 className="font-headline text-base font-black uppercase tracking-[0.08em] text-[var(--uki-cream)]">{title}</h3>
      </div>
      <div className="mt-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">{children}</div>
    </article>
  );
}
