'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import {
  ArrowRight,
  Check,
  CircleAlert,
  Coins,
  Crown,
  ExternalLink,
  Gamepad2,
  LockKeyhole,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';

import {
  faqsByLocale,
  landingCopyByLocale,
  PANCAKESWAP_UKI_URL,
  participationStepsByLocale,
  transparencyItemsByLocale,
  utilityCardsByLocale,
} from './data';
import { LandingFooter } from './footer';
import { LandingHeader } from './header';
import { HeroBackgroundVideo } from './hero-background-video';
import { LandingButton, Panel, SectionHeading } from './primitives';
import { ScrollReveal } from './scroll-reveal';
import { UKI_TOKEN_ICON_SRC } from './sale-config';
import {
  type TreasureHuntCompetitionCampaign,
  type TreasureHuntCompetitionPhase,
  useTreasureHuntCompetitionOverview,
} from '@/hooks/use-treasure-hunt-competition-overview';
import { TOKENOMICS_URL_BY_LOCALE } from '@/lib/public-locale';
import { formatTreasureHuntUkiRaw } from '@/lib/treasure-hunt-prize-pool';
import { usePublicLocale } from '@/providers/public-locale-provider';

export function CukiesLanding() {
  return (
    <main
      id="contenido-principal"
      tabIndex={-1}
      className="uki-landing min-h-screen overflow-hidden bg-[var(--uki-bg)] text-[var(--uki-cream)]"
    >
      <div className="uki-noise" />
      <div className="uki-grid-bg" />
      <LandingHeader />
      <HeroSection />
      <LaunchStatusStrip />
      <div className="uki-section-divider" />
      <ParticipationFlow />
      <div className="uki-section-divider" />
      <CompetitionSpotlight />
      <div className="uki-section-divider" />
      <UtilitySection />
      <div className="uki-section-divider" />
      <StakingSection />
      <div className="uki-section-divider" />
      <CommunityOwnership />
      <div className="uki-section-divider" />
      <PresaleParticipants />
      <div className="uki-section-divider" />
      <TransparencySection />
      <div className="uki-section-divider" />
      <FaqAndCta />
      <LandingFooter />
    </main>
  );
}

function HeroSection() {
  const { locale } = usePublicLocale();
  const copy = landingCopyByLocale[locale].hero;

  return (
    <section id="inicio" className="uki-hero-section">
      <HeroBackgroundVideo />
      <Image
        src="/brand/generated/uki-hero-stage-generated.png"
        alt=""
        fill
        className="uki-hero-bg uki-hero-bg-fallback"
        sizes="(max-width: 1023px) 100vw, 80vw"
        priority
      />
      <div className="uki-hero-vignette" />
      <div className="uki-container uki-hero-layout">
        <ScrollReveal animation="left" duration={900} className="uki-hero-content">
          <p className="uki-launch-badge">{copy.badge}</p>
          <h1 className="uki-hero-title max-w-[13ch] text-balance">
            <span className="uki-hero-title-line">{copy.title}</span>
          </h1>
          <p className="mt-5 max-w-[34rem] text-lg font-semibold leading-relaxed text-[var(--uki-text)] sm:text-xl">
            {copy.lead}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <LandingButton href="/games/treasure-hunt">{copy.play}</LandingButton>
            <LandingButton href="/cukie-master" variant="secondary">
              {copy.stake}
            </LandingButton>
          </div>
          <a
            href={PANCAKESWAP_UKI_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[var(--uki-gold)] transition hover:text-[var(--uki-cream)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-cyan)]"
          >
            {copy.buy}
            <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
          </a>
        </ScrollReveal>

        <ScrollReveal animation="right" duration={900} className="uki-hero-overview-wrap w-full">
          <LaunchOverview />
        </ScrollReveal>
      </div>
    </section>
  );
}

function LaunchOverview() {
  const { locale } = usePublicLocale();
  const copy = landingCopyByLocale[locale].hero;

  const rows = [
    { icon: ShieldCheck, label: copy.pool, value: 'ASM / UKI', tone: 'text-[var(--uki-cyan)]' },
    { icon: Crown, label: copy.staking, value: copy.network, tone: 'text-[var(--uki-gold)]' },
    { icon: LockKeyhole, label: copy.lock, value: copy.lockValue, tone: 'text-[#f19bff]' },
  ];

  return (
    <Panel
      className="uki-launch-overview"
      innerClassName="relative overflow-hidden p-5 sm:p-6 lg:p-7"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--uki-cyan)]/10 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="uki-label">{copy.live}</p>
            <p className="mt-1 font-headline text-2xl font-black text-[var(--uki-cream)]">
              ASM / UKI
            </p>
          </div>
          <div className="flex items-center -space-x-2" aria-label="Par oficial ASM y UKI">
            <span className="relative h-12 w-12 overflow-hidden rounded-full border-2 border-[#0d0b24] bg-white">
              <Image src="/brand/official/asm-token-coingecko.png" alt="ASM" fill sizes="48px" className="object-contain" />
            </span>
            <span className="relative h-12 w-12 overflow-hidden rounded-full border-2 border-[#0d0b24] bg-white">
              <Image src={UKI_TOKEN_ICON_SRC} alt="UKI" fill sizes="48px" className="object-contain" />
            </span>
          </div>
        </div>

        <div className="mt-3 divide-y divide-white/10">
          {rows.map(({ icon: Icon, label, value, tone }) => (
            <div key={label} className="flex items-center justify-between gap-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <Icon className={`h-5 w-5 shrink-0 ${tone}`} strokeWidth={1.8} />
                <span className="text-sm font-semibold text-[var(--uki-muted)]">{label}</span>
              </div>
              <span className="text-right font-mono text-xs font-black text-[var(--uki-cream)] sm:text-sm">
                {value}
              </span>
            </div>
          ))}
        </div>

        <a
          href={PANCAKESWAP_UKI_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex min-h-12 items-center justify-between rounded-[8px] border border-[var(--uki-cyan-border)] bg-[var(--uki-cyan)]/10 px-4 font-headline text-sm font-black uppercase tracking-[0.08em] text-[var(--uki-cyan)] transition hover:bg-[var(--uki-cyan)]/15 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-cyan)]"
        >
          <span>{copy.buy}</span>
          <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
        </a>
      </div>
    </Panel>
  );
}

function LaunchStatusStrip() {
  const { locale } = usePublicLocale();
  const copy = landingCopyByLocale[locale].hero;
  const items = [
    [copy.pool, 'PancakeSwap V2'],
    [copy.staking, copy.network],
    [copy.lock, copy.lockValue],
  ];

  return (
    <section aria-label={copy.live} className="uki-container uki-facts-section">
      <ScrollReveal animation="fade" duration={700}>
        <div className="grid overflow-hidden rounded-[12px] border border-[var(--uki-cyan-border)] bg-[#0d0b24]/82 sm:grid-cols-3">
          {items.map(([label, value]) => (
            <article key={label} className="flex items-center gap-3 border-b border-white/10 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#65e2a2] shadow-[0_0_14px_rgba(101,226,162,0.55)]" />
              <div>
                <p className="uki-label">{label}</p>
                <p className="mt-1 text-sm font-black text-[var(--uki-cream)]">{value}</p>
              </div>
            </article>
          ))}
        </div>
      </ScrollReveal>
    </section>
  );
}

function ParticipationFlow() {
  const { locale } = usePublicLocale();
  const copy = landingCopyByLocale[locale].flow;
  const steps = participationStepsByLocale[locale];

  return (
    <section id="comprar" className="uki-container uki-home-section">
      <ScrollReveal animation="fade">
        <SectionHeading
          eyebrow={copy.eyebrow}
          title={copy.title}
          subtitle={copy.subtitle}
          tone="cyan"
          withRule
        />
      </ScrollReveal>

      <div className="mt-7 grid gap-4 lg:grid-cols-3">
        {steps.map(({ icon: Icon, ...step }, index) => (
          <ScrollReveal key={step.number} animation="up" delay={index * 120} className="h-full">
            <article className="group flex h-full min-h-[19rem] flex-col overflow-hidden rounded-[14px] border border-white/10 bg-[#0c0b20]/88 p-5 transition duration-300 hover:-translate-y-1 hover:border-[var(--uki-cyan-border)] sm:p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-black tracking-[0.2em] text-[var(--uki-muted)]">{step.number}</span>
                <Icon className="h-10 w-10 rounded-[10px] border border-[var(--uki-cyan-border)] bg-[var(--uki-cyan)]/10 p-2.5 text-[var(--uki-cyan)]" strokeWidth={1.8} />
              </div>
              <h3 className="mt-8 max-w-[13ch] text-balance font-headline text-3xl font-black leading-none text-[var(--uki-cream)]">
                {step.title}
              </h3>
              <p className="mt-4 max-w-[34rem] text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                {step.text}
              </p>
              <a
                href={step.href}
                target={step.external ? '_blank' : undefined}
                rel={step.external ? 'noreferrer' : undefined}
                className="mt-auto inline-flex items-center gap-2 pt-7 text-sm font-black text-[var(--uki-gold)] transition group-hover:text-[var(--uki-cream)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-cyan)]"
              >
                {step.action}
                {step.external ? <ExternalLink className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              </a>
            </article>
          </ScrollReveal>
        ))}
      </div>

      <ScrollReveal animation="fade" delay={180}>
        <div className="mt-4 flex items-start gap-3 rounded-[10px] border border-[#ffb04a]/25 bg-[#ffb04a]/[0.07] px-4 py-3 text-sm font-semibold leading-relaxed text-[#f4c77e]">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.8} />
          <p>{copy.warning}</p>
        </div>
      </ScrollReveal>
    </section>
  );
}

function CompetitionSpotlight() {
  const { locale } = usePublicLocale();
  const { isConnected } = useAccount();
  const copy = landingCopyByLocale[locale].competition;
  const { status, leaderboardMeta, isLoading, error } = useTreasureHuntCompetitionOverview({
    includeLeaderboard: true,
    leaderboardPageSize: 1,
  });
  const campaign = status?.campaign;
  const eligibility = isConnected ? status?.eligibility : null;
  const isPersonalStatusLoading = isConnected && isLoading;
  const maxAttempts = campaign?.topAttemptsPerWallet ?? 10;
  const phase = status?.phase ?? 'unconfigured';
  const prizePool = leaderboardMeta?.poolUkiRaw
    ? formatTreasureHuntUkiRaw(leaderboardMeta.poolUkiRaw, 1)
    : copy.loading;
  const attempts = eligibility
    ? eligibility.attemptsRemaining.toLocaleString(locale === 'es' ? 'es-ES' : 'en-GB')
    : copy.connect;
  const counted = eligibility
    ? `${eligibility.disqualified ? 0 : eligibility.topAttemptsCount}/${maxAttempts}`
    : `—/${maxAttempts}`;

  return (
    <section id="torneo" className="uki-container uki-home-section">
      <ScrollReveal animation="up" duration={900}>
        <div className="relative overflow-hidden rounded-[18px] border border-[var(--uki-cyan-border)] bg-[#071312]">
          <Image
            src="/brand/generated/uki-treasure-hunt-cukie-scene-v1.png"
            alt=""
            fill
            className="object-cover opacity-25"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,14,14,0.99)_0%,rgba(5,14,14,0.94)_54%,rgba(5,14,14,0.42)_100%)]" />
          <div className="relative grid min-h-[31rem] gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)] lg:items-end lg:p-10">
            <div className="self-center">
              <div className="flex flex-wrap items-center gap-3">
                <p className="uki-launch-badge">{copy.eyebrow}</p>
                <span className="inline-flex items-center gap-2 rounded-[5px] border border-[#65e2a2]/25 bg-[#65e2a2]/10 px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#65e2a2]">
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {copy[phase]}
                </span>
              </div>
              <h2 className="mt-5 max-w-[13ch] text-balance font-headline text-4xl font-black leading-[0.98] text-[var(--uki-cream)] sm:text-5xl">
                {copy.title}
              </h2>
              <p className="mt-5 max-w-[38rem] text-base font-semibold leading-relaxed text-[var(--uki-text)]">
                {copy.text}
              </p>
              <CompetitionCountdown locale={locale} phase={phase} campaign={campaign} />

              {eligibility?.disqualified ? (
                <p className="mt-5 flex max-w-xl items-center gap-3 rounded-[8px] border border-[#ff7d7d]/30 bg-[#ff7d7d]/10 px-4 py-3 text-sm font-bold text-[#ff9b9b]">
                  <CircleAlert className="h-5 w-5 shrink-0" />
                  {copy.disqualified}
                </p>
              ) : null}
              {error ? (
                <p className="mt-5 max-w-xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                  {copy.unavailable}
                </p>
              ) : null}

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <LandingButton href="/games/treasure-hunt">{copy.play}</LandingButton>
                <LandingButton href="/games/treasure-hunt/rankings" variant="secondary">
                  {copy.rankings}
                </LandingButton>
              </div>
            </div>

            <dl className="grid gap-px overflow-hidden rounded-[12px] border border-white/15 bg-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.32)]">
              {[
                [copy.prize, isLoading && !leaderboardMeta ? copy.loading : prizePool],
                [copy.attempts, isPersonalStatusLoading ? copy.loading : attempts],
                [copy.counted, isPersonalStatusLoading ? copy.loading : counted],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#081614]/95 px-5 py-5 sm:px-6">
                  <dt className="uki-label">{label}</dt>
                  <dd className="mt-2 truncate font-mono text-xl font-black text-[var(--uki-cyan)] sm:text-2xl" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}

function CompetitionCountdown({
  locale,
  phase,
  campaign,
}: {
  locale: 'es' | 'en';
  phase: TreasureHuntCompetitionPhase;
  campaign: TreasureHuntCompetitionCampaign | null | undefined;
}) {
  const copy = landingCopyByLocale[locale].competition;
  const [nowMs, setNowMs] = useState<number | null>(null);
  const target = phase === 'scheduled' ? campaign?.startsAt : campaign?.endsAt;
  const targetMs = target ? new Date(target).getTime() : Number.NaN;

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!Number.isFinite(targetMs)) return null;
  const isFinished = phase === 'closed' || (nowMs !== null && nowMs >= targetMs);
  const prefix = phase === 'scheduled' ? copy.starts : copy.ends;
  const date = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(targetMs));

  return (
    <p className="mt-5 font-mono text-sm font-black text-[var(--uki-gold)]" aria-live="polite">
      {isFinished
        ? copy.finished
        : `${prefix}: ${nowMs === null ? copy.loading : formatRemaining(targetMs - nowMs)}`}
      <span className="ml-2 font-sans font-semibold text-[var(--uki-muted)]">· {date} UTC</span>
    </p>
  );
}

function formatRemaining(remainingMs: number) {
  const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1_000));
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

function UtilitySection() {
  const { locale } = usePublicLocale();
  const copy = landingCopyByLocale[locale].utility;
  const cards = utilityCardsByLocale[locale];

  return (
    <section id="utilidad" className="uki-container uki-home-section">
      <ScrollReveal animation="fade">
        <SectionHeading
          eyebrow={copy.eyebrow}
          title={copy.title}
          subtitle={copy.subtitle}
          tone="cyan"
          withRule
        />
      </ScrollReveal>
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {cards.map(({ icon: Icon, title, text, tone }, index) => (
          <ScrollReveal key={title} animation={index % 2 === 0 ? 'left' : 'right'} delay={(index % 2) * 80}>
            <article className="grid min-h-[12rem] grid-cols-[auto_1fr] gap-4 rounded-[14px] border border-white/10 bg-[#0c0b20]/82 p-5 transition duration-300 hover:border-white/20 sm:p-6">
              <Icon className={`h-11 w-11 rounded-[10px] border border-current/20 bg-current/5 p-2.5 ${tone}`} strokeWidth={1.8} />
              <div>
                <h3 className="text-balance font-headline text-2xl font-black text-[var(--uki-cream)]">{title}</h3>
                <p className="mt-3 max-w-[34rem] text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">{text}</p>
              </div>
            </article>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}

function StakingSection() {
  const { locale } = usePublicLocale();
  const copy = landingCopyByLocale[locale].staking;

  return (
    <section id="staking" className="uki-container uki-home-section">
      <ScrollReveal animation="up">
        <div className="grid overflow-hidden rounded-[18px] border border-[#e45cff]/25 bg-[#15091e]/88 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="relative min-h-[18rem] overflow-hidden lg:min-h-[33rem]">
            <Image
              src="/brand/generated/cukie-master-stake-landing.png"
              alt="Cukie Master custodiando UKI"
              fill
              className="object-cover"
              sizes="(max-width: 1023px) 100vw, 42vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#15091e] via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-[#15091e]" />
          </div>
          <div className="flex flex-col justify-center p-5 sm:p-8 lg:p-12">
            <p className="uki-launch-badge inline-flex w-fit items-center gap-2">
              <Crown className="h-4 w-4" strokeWidth={1.8} />
              {copy.badge}
            </p>
            <h2 className="mt-5 max-w-[14ch] text-balance font-headline text-4xl font-black leading-[1.02] text-[var(--uki-cream)] sm:text-5xl">
              {copy.title}
            </h2>
            <p className="mt-5 max-w-xl text-base font-semibold leading-relaxed text-[var(--uki-text)]">
              {copy.text}
            </p>
            <ul className="mt-6 space-y-3">
              {copy.bullets.map((bullet) => (
                <li key={bullet} className="flex items-center gap-3 text-sm font-bold text-[var(--uki-muted)]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#65e2a2]/12 text-[#65e2a2]">
                    <Check className="h-4 w-4" strokeWidth={2} />
                  </span>
                  {bullet}
                </li>
              ))}
            </ul>
            <div className="mt-7">
              <LandingButton href="/cukie-master">{copy.action}</LandingButton>
            </div>
            <p className="mt-4 text-xs font-semibold text-[var(--uki-muted)]">{copy.helper}</p>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}

function CommunityOwnership() {
  const { locale } = usePublicLocale();
  const copy = landingCopyByLocale[locale].community;

  return (
    <section className="uki-container uki-home-section">
      <ScrollReveal animation="scale" duration={1000}>
        <div className="uki-community-panel">
          <div className="uki-community-copy">
            <p className="uki-launch-badge inline-flex items-center gap-2">
              <Users className="h-4 w-4" strokeWidth={1.8} />
              {copy.badge}
            </p>
            <h2 className="uki-community-title">
              <span>{copy.titleTop}</span>
              <span>{copy.titleBottom}</span>
            </h2>
            <p className="uki-community-lead">
              {copy.leadPrefix} <strong>{copy.leadStrong}</strong>
            </p>
            <p className="uki-community-principle">{copy.principle}</p>
            <div className="uki-community-actions">
              <LandingButton href={TOKENOMICS_URL_BY_LOCALE[locale]} variant="secondary" external>
                {copy.tokenomicsButton}
              </LandingButton>
            </div>
          </div>
          <div className="uki-community-visual" aria-hidden="true">
            <div className="uki-community-ring">
              <span>60%+</span>
              <small>{copy.ringLabel}</small>
            </div>
            <div className="uki-community-years">
              <Trophy className="h-9 w-9" strokeWidth={1.8} />
              <span>{copy.years}</span>
              <small>{copy.yearsLabel}</small>
            </div>
          </div>
          <div className="uki-community-footer">
            <Trophy className="h-5 w-5 text-[var(--uki-gold)]" strokeWidth={1.8} />
            <span>{copy.footer}</span>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}

function PresaleParticipants() {
  const { locale } = usePublicLocale();
  const copy = landingCopyByLocale[locale].presale;

  return (
    <section id="preventa-finalizada" className="uki-container uki-home-section">
      <ScrollReveal animation="up">
        <Panel innerClassName="grid gap-7 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-10">
          <div>
            <p className="uki-launch-badge">{copy.badge}</p>
            <h2 className="mt-5 max-w-[18ch] text-balance font-headline text-3xl font-black leading-tight text-[var(--uki-cream)] sm:text-4xl">
              {copy.title}
            </h2>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)] sm:text-base">
              {copy.text}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <LandingButton href="/vesting">{copy.vesting}</LandingButton>
            <LandingButton href="/premios" variant="secondary">{copy.rewards}</LandingButton>
            <LandingButton href="/games/treasure-hunt/rankings" variant="ghost">{copy.history}</LandingButton>
          </div>
        </Panel>
      </ScrollReveal>
    </section>
  );
}

function TransparencySection() {
  const { locale } = usePublicLocale();
  const copy = landingCopyByLocale[locale].transparency;
  const items = transparencyItemsByLocale[locale];

  return (
    <section id="transparencia" className="uki-container uki-home-section">
      <ScrollReveal animation="fade">
        <SectionHeading
          eyebrow={copy.eyebrow}
          title={copy.title}
          subtitle={copy.subtitle}
          tone="cyan"
          withRule
        />
      </ScrollReveal>
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {items.map(({ icon: Icon, ...item }, index) => (
          <ScrollReveal key={item.label} animation="up" delay={(index % 2) * 80}>
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="group grid min-h-[9rem] grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[12px] border border-white/10 bg-[#0b0a1c]/82 p-5 transition duration-300 hover:border-[var(--uki-cyan-border)] hover:bg-[#100e29] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-cyan)]"
              aria-label={`${item.label}: ${copy.open}`}
            >
              <Icon className="h-10 w-10 rounded-[9px] border border-[var(--uki-cyan-border)] bg-[var(--uki-cyan)]/10 p-2.5 text-[var(--uki-cyan)]" strokeWidth={1.8} />
              <div className="min-w-0">
                <p className="uki-label">{item.label}</p>
                <p className="mt-2 truncate font-mono text-sm font-black text-[var(--uki-cream)] sm:text-base" title={item.value}>
                  {item.value}
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">{item.helper}</p>
              </div>
              <ExternalLink className="h-4 w-4 text-[var(--uki-gold)] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}

function FaqAndCta() {
  const { locale } = usePublicLocale();
  const copy = landingCopyByLocale[locale].faq;
  const faqs = faqsByLocale[locale];

  return (
    <section id="faq" className="uki-container uki-home-section">
      <ScrollReveal animation="fade">
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} tone="cyan" withRule />
      </ScrollReveal>
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {faqs.map((faq, index) => (
          <ScrollReveal key={faq.question} animation="up" delay={(index % 2) * 70}>
            <article className="h-full rounded-[12px] border border-white/10 bg-[#0b0a1c]/78 p-5 sm:p-6">
              <h3 className="text-balance font-headline text-lg font-black leading-snug text-[var(--uki-cream)]">
                {faq.question}
              </h3>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">{faq.answer}</p>
            </article>
          </ScrollReveal>
        ))}
      </div>

      <ScrollReveal animation="up" delay={100}>
        <div className="mt-5 grid gap-6 overflow-hidden rounded-[16px] border border-[var(--uki-cyan-border)] bg-[radial-gradient(circle_at_80%_20%,rgba(56,239,226,0.12),transparent_34%),#0c0b20] p-5 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:p-10">
          <div>
            <h2 className="max-w-[18ch] text-balance font-headline text-3xl font-black leading-tight text-[var(--uki-cream)] sm:text-4xl">
              {copy.ctaTitle}
            </h2>
            <p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)] sm:text-base">
              {copy.ctaText}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <LandingButton href="/games/treasure-hunt">{copy.play}</LandingButton>
            <LandingButton href="/cukie-master" variant="secondary">{copy.stake}</LandingButton>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
