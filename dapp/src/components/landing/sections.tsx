import Image from 'next/image';
import type { CSSProperties } from 'react';
import { ArrowRight, Check, Gift, Instagram, Lock, MessageCircle, Send, Timer, Trophy, Youtube } from 'lucide-react';
import {
  communityRewards,
  faqs,
  futureUtility,
  gameCards,
  navItems,
  presalePrizeTiers,
  purchaseSteps,
  saleFacts,
  trustSignals,
  utilityNodes,
} from './data';
import { PresaleGateAction, PresaleGateLink, PresaleLockBadge } from './presale-countdown';
import { HeroBackgroundVideo } from './hero-background-video';
import { LandingButton, MetricTile, Panel, SectionHeading } from './primitives';
import { SaleConsole } from './sale-console';
import { UKI_PRESALE_START_LABEL, UKI_PRESALE_START_SHORT_LABEL } from './sale-config';
import { LandingWalletConnectButton } from './wallet-connect-dynamic';

export function CukiesLanding() {
  return (
    <main className="uki-landing min-h-screen overflow-hidden bg-[var(--uki-bg)] text-[var(--uki-cream)]">
      <div className="uki-noise" />
      <div className="uki-grid-bg" />
      <LandingHeader />
      <HeroSection />
      <SaleFacts />
      <HowToBuy />
      <CommunityOwnership />
      <UtilityMap />
      <AfterPresale />
      <Games />
      <PrizesPreview />
      <FaqAndCta />
      <LandingFooter />
    </main>
  );
}

function LandingHeader() {
  return (
    <header className="uki-landing-header">
      <nav className="uki-container flex h-[5.7rem] items-center justify-between">
        <a href="#presale" className="uki-header-logo relative block h-[5.1rem] w-48 overflow-hidden" aria-label="Inicio Cukies World">
          <Image src="/Cukie_logo_first.png" alt="Cukies World" fill className="object-contain object-left" sizes="11rem" priority />
        </a>

        <div className="hidden items-center gap-6 lg:flex">
          {navItems.map((item, index) => (
            <a key={item.href} href={item.href} className={`uki-nav-link ${index === 0 ? 'is-active' : ''}`}>
              {item.label}
            </a>
          ))}
        </div>

        <LandingWalletConnectButton />
      </nav>
    </header>
  );
}

function HeroSection() {
  return (
    <section id="presale" className="uki-hero-section">
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
      <div className="uki-hero-sale-sign" aria-hidden="true">
        <span>UKI</span>
        <span>Preventa</span>
      </div>
      <div className="uki-container uki-hero-layout">
        <div className="uki-hero-content">
          <p className="uki-launch-badge">Lanzamiento 2026</p>
          <h1 className="uki-hero-title">
            <span className="uki-hero-title-line">Preventa UKI</span>
            {' '}
            <span className="uki-hero-title-line text-[var(--uki-cyan)]">abre {UKI_PRESALE_START_SHORT_LABEL}</span>
          </h1>
          <p className="mt-4 max-w-[28rem] text-lg leading-snug text-[var(--uki-text)] sm:text-xl">
            El token que conecta juegos, créditos de competición, Cukies, rankings y recompensas en{' '}
            <span className="font-black text-[var(--uki-gold)]">BNB Smart Chain.</span>
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <PresaleGateLink href="#presale-console">Comprar UKI</PresaleGateLink>
            <LandingButton href="#token" variant="secondary">
              Ver detalles
            </LandingButton>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {trustSignals.map((signal) => (
              <TrustSignal key={signal.label} {...signal} />
            ))}
          </div>
        </div>

        <SaleConsole />
      </div>
    </section>
  );
}

function TrustSignal({ icon: Icon, label, value }: (typeof trustSignals)[number]) {
  return (
    <div className="uki-trust-signal">
      <Icon className="h-5 w-5 text-[var(--uki-gold)]" strokeWidth={1.8} />
      <div>
        <p className="text-[0.66rem] font-black uppercase tracking-[0.14em] text-[var(--uki-cream)]">{label}</p>
        <p className="text-[0.68rem] font-semibold text-[var(--uki-muted)]">{value}</p>
      </div>
    </div>
  );
}

function SaleFacts() {
  return (
    <section className="uki-container uki-facts-section">
      <div className="grid overflow-hidden rounded-[12px] border border-[var(--uki-cyan-border)] bg-[#071923]/82 sm:grid-cols-2 lg:grid-cols-6">
        {saleFacts.map((fact) => (
          <MetricTile key={fact.label} {...fact} />
        ))}
      </div>
    </section>
  );
}

function HowToBuy() {
  return (
    <section id="token" className="uki-container pb-9 pt-12">
      <SectionHeading title="Cómo comprar UKI" tone="cyan" withRule />
      <div className="uki-buy-steps mt-5 grid gap-4 lg:grid-cols-4">
        {purchaseSteps.map((step, index) => (
          <article key={step.number} className="relative h-full" style={{ '--uki-stagger': index } as CSSProperties}>
            <StepCard step={step} />
            {index < purchaseSteps.length - 1 ? <ArrowRight className="uki-step-arrow" strokeWidth={1.8} /> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function StepCard({ step }: { step: (typeof purchaseSteps)[number] }) {
  const Icon = step.icon;

  return (
    <Panel className="uki-step-card h-full" innerClassName="flex h-full min-h-[250px] flex-col p-4 lg:min-h-[365px]">
      <div className="flex items-start gap-3">
        <span className="uki-step-number">{step.number}</span>
        <div>
          <h3 className="font-headline text-base font-black uppercase tracking-[0.08em] text-[var(--uki-cream)]">{step.title}</h3>
          <p className="mt-1.5 text-xs font-semibold leading-snug text-[var(--uki-text)]">{step.text}</p>
        </div>
      </div>
      <div className="uki-step-action mt-auto rounded-[9px] border border-white/10 bg-[#02090d]/66 p-3">
        {step.number === '1' ? (
          <div className="space-y-2.5">
            <LandingWalletConnectButton className="h-9 w-full justify-center rounded-[5px]" showCompactText={false} />
            <MiniRow label="Wallet EVM compatible" />
            <MiniRow label="BNB Smart Chain" />
          </div>
        ) : null}
        {step.number === '2' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs font-semibold text-[var(--uki-text)]">
              <Check className="h-4 w-4 rounded-full bg-[#91d867] p-0.5 text-[#02090d]" strokeWidth={2} />
              Aprobar ASM
            </div>
            <div>
              <p className="uki-label">Límite de gasto</p>
              <p className="mt-1 font-headline text-lg font-black text-[var(--uki-cream)]">Definir importe</p>
            </div>
            <PresaleGateAction className="h-9 w-full rounded-[5px] bg-[var(--uki-cyan)] text-[0.68rem] font-black uppercase tracking-[0.1em] text-[#02090d]">
              Aprobar
            </PresaleGateAction>
          </div>
        ) : null}
        {step.number === '3' ? (
          <div className="space-y-2">
            <Amount label="Pagas" value="Importe ASM" token="ASM" />
            <div className="flex justify-center">
              <ArrowRight className="h-4 w-4 rotate-90 rounded-full border border-[var(--uki-cyan-border)] p-0.5 text-[var(--uki-cyan)]" />
            </div>
            <Amount label="Recibes" value="UKI cotizado" token="UKI" />
            <p className="text-center text-[0.62rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)]">
              El ratio ASM se fija al abrir preventa
            </p>
            <PresaleLockBadge className="mt-2 w-full justify-center" />
          </div>
        ) : null}
        {step.number === '4' ? (
          <div>
            <div className="flex items-center gap-3">
              <Icon className="h-8 w-8 rounded-full border border-[var(--uki-cyan-border)] bg-[var(--uki-cyan)]/10 p-2 text-[var(--uki-cyan)]" strokeWidth={1.8} />
              <div>
                <p className="font-headline text-lg font-black text-[var(--uki-cream)]">1,000,000 UKI</p>
                <p className="text-xs font-semibold text-[var(--uki-muted)]">9 meses lineal</p>
              </div>
            </div>
            <div className="mt-5 flex justify-between text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[var(--uki-muted)]">
              <span>0%</span>
              <span>100%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[18%] rounded-full bg-[var(--uki-cyan)]" />
            </div>
            <LandingButton href="/vesting" variant="ghost" className="mt-5 w-full justify-center">
              Ver vesting
            </LandingButton>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function MiniRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between rounded-[5px] border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-[var(--uki-muted)]">
      <span>{label}</span>
      <Check className="h-3.5 w-3.5 text-[var(--uki-cyan)]" strokeWidth={1.8} />
    </div>
  );
}

function Amount({ label, value, token }: { label: string; value: string; token: string }) {
  return (
    <div className="uki-amount-card rounded-[7px] border border-white/10 bg-[#04141a] p-2.5">
      <p className="text-[0.66rem] font-semibold text-[var(--uki-muted)]">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-headline text-xl font-black text-[var(--uki-cream)]">{value}</span>
        <span className="rounded-full border border-[var(--uki-cyan-border)] px-2 py-1 text-[0.66rem] font-black text-[var(--uki-cyan)]">{token}</span>
      </div>
    </div>
  );
}

function CommunityOwnership() {
  return (
    <section className="uki-container pb-10">
      <SectionHeading title="Cukies World es de su gente" subtitle="Más del 60% del supply total de UKI se entregará como recompensas a quienes participan en el ecosistema durante 6 años." tone="cyan" withRule />
      <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel innerClassName="flex h-full flex-col justify-center p-6">
          <p className="font-headline text-7xl font-black leading-none text-[var(--uki-cyan)] sm:text-8xl">60%+</p>
          <p className="mt-4 max-w-xl text-lg font-semibold leading-snug text-[var(--uki-text)]">
            Una parte mayoritaria de UKI está reservada para jugadores, holders, Cukie Masters, prestadores de recursos y miembros activos de Cukies World.
          </p>
        </Panel>
        <div className="grid gap-3">
          {communityRewards.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-[9px] border border-[var(--uki-cyan-border)] bg-[#071923]/82 p-4">
                <div className="flex items-start gap-3">
                  <Icon className="mt-1 h-6 w-6 shrink-0 text-[var(--uki-gold)]" strokeWidth={1.8} />
                  <div>
                    <h3 className="font-headline text-base font-black uppercase tracking-[0.08em] text-[var(--uki-cream)]">{item.title}</h3>
                    <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">{item.text}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function UtilityMap() {
  return (
    <section id="utility" className="uki-container relative pb-9">
      <SectionHeading title="Por qué existe UKI" subtitle="UKI lo conecta todo: juegos, créditos de competición, Cukies, pools, rankings y recompensas." tone="cyan" withRule />
      <div className="uki-utility-map">
        <svg className="uki-utility-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M50 53 L31 21" />
          <path d="M50 53 L70 22" />
          <path d="M50 53 L23 51" />
          <path d="M50 53 L78 51" />
          <path d="M50 53 L30 80" />
          <path d="M50 53 L72 80" />
        </svg>
        <div className="uki-orbit" />
        {utilityNodes.map((node) => {
          const Icon = node.icon;
          return (
            <article key={node.title} className={`uki-utility-node ${node.className} ${node.positionClassName}`}>
              <Icon className="h-8 w-8 rounded-full border border-current/25 bg-black/20 p-2" strokeWidth={1.8} />
              <div>
                <h3 className="font-headline text-base font-black uppercase tracking-[0.08em]">{node.title}</h3>
                <p className="mt-1 text-xs font-semibold leading-tight text-[var(--uki-text)]">{node.text}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AfterPresale() {
  return (
    <section className="uki-container pb-6">
      <div className="uki-after-scene-wrap">
        <div className="uki-after-scene-bg" aria-hidden="true" />
        <div className="uki-after-content">
          <div className="uki-after-copy">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <SectionHeading
                className="uki-after-heading"
                title={
                  <>
                    Después de la preventa: <span className="text-[var(--uki-cyan)]">Cukie Master</span>
                  </>
                }
                subtitle="La llave principal al ecosistema para ganar recompensas cada día de forma activa o pasiva."
              />
            </div>
          </div>
          <div className="uki-future-rail">
            {futureUtility.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className={`uki-future-card ${item.className}`}>
                  <Image
                    src={item.image}
                    alt=""
                    fill
                    className="uki-future-card-bg"
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  />
                  <span className="uki-future-image-scrim" aria-hidden="true" />
                  <div className="uki-future-card-top">
                    <span className="uki-future-icon">
                      <Icon className="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    <span className="uki-future-lock">
                      <Lock className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                  </div>
                  <div className="uki-future-card-copy">
                    <h3 className="font-headline text-lg font-black uppercase leading-none tracking-[-0.02em] text-[var(--uki-cream)]">
                      {item.title}
                    </h3>
                    <p className="mt-2 max-w-[15rem] text-xs font-semibold leading-snug text-[var(--uki-text)]">{item.text}</p>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="uki-after-note">
            <Timer className="h-4 w-4 text-[var(--uki-gold)]" strokeWidth={1.8} />
            500 cupos iniciales. Requisito: stakear 20,000 UKI o más por cupo, máximo 5 cupos por wallet. Los UKI comprados durante la preventa califican aunque tengan vesting.
          </p>
          <p className="uki-after-note">
            <Gift className="h-4 w-4 text-[var(--uki-gold)]" strokeWidth={1.8} />
            Cada cupo recibe 100 créditos de competición diarios. Puedes jugarlos para convertirlos a UKI o aportarlos a un pool para compartir ganancias.
          </p>
        </div>
      </div>
    </section>
  );
}

function Games() {
  return (
    <section id="games" className="uki-container pb-6">
      <Panel innerClassName="uki-games-panel p-4 sm:p-5">
        <div className="uki-games-feature grid gap-4 lg:grid-cols-[0.44fr_minmax(0,1.12fr)_0.45fr]">
          <div className="flex flex-col justify-between">
            <div>
              <h2 className="uki-games-title font-headline font-black uppercase leading-tight tracking-[-0.02em] text-[var(--uki-cyan)]">
                Treasure Hunt
                <span className="block">primer juego</span>
              </h2>
              <p className="mt-5 text-base leading-relaxed text-[var(--uki-text)]">
                El primer juego es la base para entender las nuevas funcionalidades y conectar la economía alrededor de UKI de forma sencilla.
              </p>
            </div>
          </div>

          <div className="uki-game-scene relative overflow-hidden rounded-[10px] border border-white/10 bg-[#02090d]">
            <Image src="/brand/generated/uki-treasure-hunt-scene-v2.png" alt="Treasure Hunt game scene" fill className="object-cover" sizes="(min-width: 1024px) 560px, 100vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#02090d]/55 via-transparent to-transparent" />
          </div>

          <div className="uki-game-overview rounded-[10px] border border-white/10 bg-[#02090d]/62 p-5">
            <h3 className="font-headline text-xl font-black uppercase tracking-[0.08em] text-[var(--uki-cyan)]">Resumen de juego</h3>
            <ul className="mt-5 space-y-4 text-sm font-semibold text-[var(--uki-text)]">
              {['Partidas rápidas de unos 5 minutos', 'Coste por partida: 10 créditos', 'Cada partida rankea en el torneo semanal'].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <Check className="h-4 w-4 rounded-full bg-[var(--uki-cyan)] p-0.5 text-[#02090d]" strokeWidth={2} />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-8 grid grid-cols-3 gap-3 border-t border-white/10 pt-5">
              <GameMetric label="Entrada" value="10" helper="Créditos" />
              <GameMetric label="Ranking" value="Semanal" helper="Periodo" />
              <GameMetric label="Premio" value="7.5" helper="UKI max." />
            </div>
          </div>
        </div>

        <div className="uki-games-more mt-4 border-t border-white/10 pt-4">
          <h3 className="text-center font-headline text-lg font-black uppercase tracking-[0.14em] text-[var(--uki-cyan)]">
            Más juegos en camino
          </h3>
          <div className="mt-4 grid gap-3 lg:grid-cols-4">
            {gameCards.map((game) => (
              <article key={game.title} className="uki-game-card grid grid-cols-[82px_1fr] items-center gap-4 rounded-[9px] border border-white/10 bg-[#02090d]/60 p-3">
                <div className="relative h-16 overflow-hidden rounded-[6px] border border-white/10 bg-[#06141a]">
                  <Image src={game.image} alt={game.title} fill className="object-cover" sizes="82px" />
                </div>
                <div>
                  <h4 className="font-headline text-base font-black text-[var(--uki-cream)]">{game.title}</h4>
                  <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">{game.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </Panel>
    </section>
  );
}

function PrizesPreview() {
  return (
    <section className="uki-container pb-6">
      <SectionHeading title="Premios de preventa" subtitle="Compra UKI, invita a otros participantes y entra en sorteos de Cukies." tone="cyan" withRule />
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel innerClassName="p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {presalePrizeTiers.slice(0, 4).map((tier) => (
              <article key={tier.amount} className="rounded-[8px] border border-white/10 bg-[#02090d]/60 p-4">
                <p className="uki-label">{tier.amount}</p>
                <h3 className="mt-2 font-headline text-lg font-black uppercase text-[var(--uki-cream)]">{tier.prize}</h3>
                {tier.helper ? <p className="mt-2 text-xs font-semibold text-[var(--uki-muted)]">{tier.helper}</p> : null}
              </article>
            ))}
          </div>
        </Panel>
        <Panel innerClassName="flex h-full flex-col justify-between p-5">
          <div>
            <Trophy className="h-10 w-10 text-[var(--uki-gold)]" strokeWidth={1.8} />
            <h3 className="mt-4 font-headline text-2xl font-black uppercase text-[var(--uki-cyan)]">Competición de referidos</h3>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              Los 5 mejores sponsors reciben un Cukie garantizado y el resto participa en sorteos por UKI recomendado.
            </p>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row lg:flex-col">
            <LandingButton href="/premios">Ver premios</LandingButton>
            <LandingButton href="/premios#invitacion" variant="secondary">Conseguir link</LandingButton>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function GameMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="uki-game-metric">
      <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-[var(--uki-gold)]">{label}</p>
      <p className="mt-2 font-headline text-lg font-black uppercase text-[var(--uki-cream)]">{value}</p>
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[var(--uki-muted)]">{helper}</p>
    </div>
  );
}

function FaqAndCta() {
  return (
    <section id="faq" className="uki-faq-cta-row uki-container grid gap-4 pb-6 lg:grid-cols-[0.415fr_0.585fr]">
      <Panel className="uki-faq-panel" innerClassName="p-3 sm:p-4">
        <h2 className="font-headline text-2xl font-black uppercase text-[var(--uki-cyan)]">FAQ</h2>
        <div className="uki-faq-list mt-3 divide-y divide-white/10">
          {faqs.map((faq) => (
            <details key={faq.question} className="group py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold text-[var(--uki-text)] transition group-open:text-[var(--uki-cyan)] hover:text-[var(--uki-cyan)]">
                {faq.question}
                <span className="text-lg leading-none text-[var(--uki-cyan)] transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="pt-2 text-xs leading-relaxed text-[var(--uki-muted)]">{faq.answer}</p>
            </details>
          ))}
        </div>
      </Panel>

      <Panel className="uki-final-cta-panel" innerClassName="relative overflow-hidden p-0">
        <div className="uki-final-cta-bg" aria-hidden="true" />
        <div className="uki-final-cta-content">
          <div className="uki-final-cta-copy">
            <h2 className="font-headline text-3xl font-black uppercase leading-[0.98] text-[var(--uki-cream)] sm:text-4xl">
              Entra en la nueva etapa de Cukies
            </h2>
            <p className="mt-3 max-w-sm text-sm font-semibold leading-snug text-[var(--uki-text)]">
              La preventa UKI abre en {UKI_PRESALE_START_LABEL}. Revisa precio, premios, Cukie Master y condiciones antes de comprar.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <PresaleGateLink href="#presale-console">Comprar UKI</PresaleGateLink>
              <LandingButton href="#token" variant="secondary">
                Ver detalles
              </LandingButton>
            </div>
          </div>
        </div>
      </Panel>
    </section>
  );
}

function LandingFooter() {
  const socials = [
    { label: 'X', icon: MessageCircle },
    { label: 'Telegram', icon: Send },
    { label: 'YouTube', icon: Youtube },
    { label: 'Instagram', icon: Instagram },
  ];

  return (
    <footer className="uki-footer">
      <div className="uki-footer-inner uki-container">
        <div className="uki-footer-brand">
          <span className="relative block h-11 w-[6.8rem] overflow-hidden sm:h-12 sm:w-[7.4rem]">
            <Image src="/Cukie_logo_first.png" alt="Cukies World" fill className="object-contain object-left" sizes="7.4rem" />
          </span>
        </div>

        <div className="uki-footer-socials">
          {socials.map((social) => {
            const Icon = social.icon;
            return (
              <a key={social.label} href="#presale" aria-label={social.label} className="uki-social-link">
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </a>
            );
          })}
        </div>

        <div className="uki-footer-links">
          <a href="#token" className="hover:text-[var(--uki-cyan)]">Preventa</a>
          <a href="/cukie-master" className="hover:text-[var(--uki-cyan)]">Cukie Master</a>
          <a href="/premios" className="hover:text-[var(--uki-cyan)]">Premios</a>
          <a href="/cukie-hodler" className="hover:text-[var(--uki-cyan)]">Cukie Hodler</a>
          <a href="/como-jugar" className="hover:text-[var(--uki-cyan)]">Cómo jugar</a>
          <span className="text-white/30">Terms</span>
          <span className="text-white/30">Privacy</span>
        </div>

        <p className="uki-footer-copy">
          © 2026 Cukies World
          <span className="block">Todos los derechos reservados.</span>
        </p>
      </div>
    </footer>
  );
}
