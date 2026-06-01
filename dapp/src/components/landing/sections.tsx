import Image from 'next/image';
import type { CSSProperties } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  Coins,
  Crown,
  Database,
  Gamepad2,
  Gem,
  Gift,
  KeyRound,
  type LucideIcon,
  MessageCircle,
  Star,
  Timer,
  Trophy,
  Users,
  WalletCards,
} from 'lucide-react';
import {
  faqs,
  gameCards,
  navItems,
  purchaseSteps,
  saleFacts,
  utilityNodes,
} from './data';
import { PresaleCountdown, PresaleGateLink } from './presale-countdown';
import { HeroBackgroundVideo } from './hero-background-video';
import { LandingButton, MetricTile, Panel, SectionHeading } from './primitives';
import { SaleConsole } from './sale-console';
import { UKI_PRESALE_START_LABEL } from './sale-config';
import { VestingAccessButton } from './vesting-access-button';
import { LandingWalletConnectButton } from './wallet-connect-dynamic';
import { LandingHeader } from './header';
import { LandingFooter } from './footer';


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
      <div className="uki-container uki-hero-layout">
        <div className="uki-hero-content">
          <p className="uki-launch-badge">Preventa UKI</p>
          <h1 className="uki-hero-title">
            <span className="uki-hero-title-line">Preventa UKI</span>
          </h1>
          <div className="uki-hero-countdown mt-5 max-w-[30rem]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-headline text-xl font-black uppercase text-[var(--uki-gold)]">Inicio 15 de Junio</p>
              <p className="uki-label">Cuenta atrás</p>
            </div>
            <PresaleCountdown />
          </div>
          <p className="mt-4 max-w-[28rem] text-lg leading-snug text-[var(--uki-text)] sm:text-xl">
            El token que impulsa la economía de Cukies World, conectando juegos, competición y recompensas en{' '}
            <span className="font-black text-[var(--uki-gold)]">BNB Smart Chain.</span>
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <PresaleGateLink href="#presale-console">Comprar UKI</PresaleGateLink>
            <LandingButton href="#token" variant="secondary">
              Ver detalles
            </LandingButton>
          </div>
        </div>

        <SaleConsole />
      </div>
    </section>
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
              <p className="mt-1 font-headline text-lg font-black text-[var(--uki-cream)]">5,000 ASM</p>
            </div>
            <button type="button" className="h-9 w-full rounded-[5px] bg-[var(--uki-cyan)] text-[0.68rem] font-black uppercase tracking-[0.1em] text-[#02090d]">
              Aprobar
            </button>
          </div>
        ) : null}
        {step.number === '3' ? (
          <div className="space-y-2">
            <Amount label="Pagas" value="100" token="ASM" />
            <div className="flex justify-center">
              <ArrowRight className="h-4 w-4 rotate-90 rounded-full border border-[var(--uki-cyan-border)] p-0.5 text-[var(--uki-cyan)]" />
            </div>
            <Amount label="Recibes" value="*****" token="UKI" />
            <p className="text-center text-[0.62rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)]">
              El ratio ASM se fija al abrir preventa
            </p>
          </div>
        ) : null}
        {step.number === '4' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Icon className="h-8 w-8 rounded-full border border-[var(--uki-cyan-border)] bg-[var(--uki-cyan)]/10 p-2 text-[var(--uki-cyan)]" strokeWidth={1.8} />
              <p className="text-xs font-semibold leading-snug text-[var(--uki-muted)]">
                El acceso a vesting se activa solo cuando esta wallet tiene una compra UKI confirmada.
              </p>
            </div>
            <VestingAccessButton />
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
      <div className="uki-community-panel">
        <div className="uki-community-copy">
          <p className="uki-launch-badge inline-flex items-center gap-2">
            <Users className="h-4 w-4" strokeWidth={1.8} />
            Economía centrada en la comunidad
          </p>
          <h2 className="mt-5 max-w-5xl font-headline text-4xl font-black uppercase leading-tight text-[var(--uki-cream)] sm:text-5xl lg:text-6xl">
            Más del 60% de UKI <span className="text-[var(--uki-gold)]">está destinado a la comunidad</span>
          </h2>
          <p className="mt-5 max-w-3xl text-base font-semibold leading-relaxed text-[var(--uki-text)] sm:text-lg">
            En Cukies World, más del 60% del supply total de UKI está destinado a recompensar a las personas que participan en el ecosistema durante un periodo de <strong className="text-[var(--uki-gold)]">6 años</strong>. Porque creemos que una economía sostenible debe beneficiar a quienes juegan, aportan y forman parte de su crecimiento.
          </p>
        </div>
        <div className="uki-community-visual" aria-hidden="true">
          <div className="uki-community-ring">
            <span>60%+</span>
            <small>del supply total destinado a la comunidad</small>
          </div>
          <div className="uki-community-years">
            <CalendarDays className="h-9 w-9" strokeWidth={1.8} />
            <span>6 años</span>
            <small>de distribución en recompensas</small>
          </div>
        </div>
        <div className="uki-community-footer">
          <Trophy className="h-5 w-5 text-[var(--uki-gold)]" strokeWidth={1.8} />
          <span>Recompensamos la participación. Construimos el futuro juntos.</span>
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
    <section className="uki-container pb-8">
      <div className="uki-master-panel">
        <div className="uki-master-hero">
          <div>
            <p className="uki-launch-badge inline-flex items-center gap-2">
              <Crown className="h-4 w-4" strokeWidth={1.8} />
              Cukie Master
            </p>
            <h2 className="mt-5 max-w-2xl font-headline text-4xl font-black uppercase leading-tight text-[var(--uki-cream)] sm:text-5xl">
              La llave principal <span className="text-[var(--uki-gold)]">al ecosistema</span>
            </h2>
            <p className="mt-5 max-w-xl text-base font-semibold leading-relaxed text-[var(--uki-text)]">
              Conviértete en Cukie Master y accede a recompensas diarias dentro de Cukies World, ya sea de forma activa o pasiva.
            </p>
          </div>
          <div className="uki-master-badge">
            <KeyRound className="h-12 w-12 text-[var(--uki-gold)]" strokeWidth={1.6} />
            <span>Cukie Master</span>
            <small>Acceso exclusivo a recompensas diarias</small>
          </div>
        </div>

        <div className="uki-master-requirements">
          <MasterRequirement icon={Users} value="500" label="cupos iniciales" helper="Disponibles en la fase inicial" />
          <MasterRequirement icon={Coins} value="20,000" label="UKI o más" helper="Requisito por cada cupo" />
          <MasterRequirement icon={WalletCards} value="Máx. 5" label="cupos por wallet" helper="Límite por dirección" />
        </div>

        <div className="uki-master-presale">
          <Gift className="h-10 w-10 text-[var(--uki-gold)]" strokeWidth={1.7} />
          <div>
            <h3>Los UKI de preventa también califican</h3>
            <p>Los UKI comprados durante la preventa cuentan para ser Cukie Master, incluso si tienen vesting.</p>
          </div>
        </div>

        <div className="uki-master-benefits">
          <div className="text-center">
            <h3>¿Qué recibes por cada cupo?</h3>
            <p>Cada cupo de Cukie Master genera 100 créditos de competición diarios. Cada crédito puede convertirse en 1 UKI.</p>
          </div>
          <div className="uki-master-flow">
            <FlowStep icon={Crown} value="1 cupo" label="Cukie Master" />
            <ArrowRight className="uki-master-flow-arrow" strokeWidth={1.8} />
            <FlowStep icon={Star} value="100" label="créditos de competición al día" />
            <ArrowRight className="uki-master-flow-arrow" strokeWidth={1.8} />
            <FlowStep icon={Coins} value="1 crédito" label="= 1 UKI" />
          </div>
        </div>

        <div className="uki-master-uses">
          <h3>Dos formas de usar tus créditos</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <UseCard number="1" icon={Gamepad2} title="Jugar para convertirlos a UKI" text="Utiliza tus créditos en los juegos y convierte su valor a UKI de forma inmediata." />
            <UseCard number="2" icon={Database} title="Ponerlos en un pool" text="Otros jugadores los usarán para jugar y compartirán contigo las ganancias generadas." />
          </div>
        </div>

        <div className="uki-master-final">
          Cukie Master te da acceso diario a la economía de Cukies World. Tú decides si participar de forma <strong>activa, pasiva o combinada.</strong>
        </div>
      </div>
    </section>
  );
}

function MasterRequirement({ icon: Icon, value, label, helper }: { icon: LucideIcon; value: string; label: string; helper: string }) {
  return (
    <article className="uki-master-requirement">
      <Icon className="h-9 w-9 text-[var(--uki-gold)]" strokeWidth={1.8} />
      <div>
        <p className="font-headline text-3xl font-black leading-none text-[var(--uki-cream)]">{value}</p>
        <p className="mt-1 font-headline text-lg font-black uppercase text-[var(--uki-cyan)]">{label}</p>
        <p className="mt-2 text-xs font-semibold leading-snug text-[var(--uki-muted)]">{helper}</p>
      </div>
    </article>
  );
}

function FlowStep({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <article className="uki-master-flow-step">
      <Icon className="h-8 w-8 text-[var(--uki-gold)]" strokeWidth={1.8} />
      <div>
        <p>{value}</p>
        <span>{label}</span>
      </div>
    </article>
  );
}

function UseCard({ number, icon: Icon, title, text }: { number: string; icon: LucideIcon; title: string; text: string }) {
  return (
    <article className="uki-master-use-card">
      <span>{number}</span>
      <Icon className="h-8 w-8 text-[var(--uki-gold)]" strokeWidth={1.8} />
      <div>
        <h4>{title}</h4>
        <p>{text}</p>
      </div>
    </article>
  );
}

function Games() {
  return (
    <section id="games" className="uki-container pb-6">
      <Panel innerClassName="uki-games-panel p-0">
        <div className="uki-treasure-hero">
          <Image src="/brand/generated/uki-treasure-hunt-scene-v2.png" alt="Treasure Hunt" fill className="object-cover" sizes="100vw" />
          <div className="uki-treasure-scrim" />
          <div className="uki-treasure-top">
            <span>Treasure Hunt · Primer juego</span>
            <div className="uki-treasure-hud">
              <span>05:00</span>
              <span>♥ ♥ ♥</span>
            </div>
          </div>
          <div className="uki-treasure-copy">
            <h2>Recoge tesoros y <span className="text-[var(--uki-gold)]">convierte tu puntuación en UKI</span></h2>
            <p>Recoge gemas, monedas y tesoros para conseguir la mayor puntuación posible antes de perder tus 3 vidas o de que se acabe el tiempo.</p>
            <div className="uki-treasure-badge">
              <Trophy className="h-5 w-5 text-[var(--uki-gold)]" strokeWidth={1.8} />
              Cada partida también cuenta para el ranking semanal
            </div>
          </div>
          <div className="uki-treasure-metrics">
            <TreasureMetric icon={Timer} value="5 min" label="partidas rápidas" />
            <TreasureMetric icon={Star} value="10 créditos" label="coste por partida" />
            <TreasureMetric icon={Coins} value="Hasta 7.5 UKI" label="premio inmediato" />
          </div>
        </div>

        <div className="uki-games-more mt-4 border-t border-white/10 pt-4">
          <h3 className="text-center font-headline text-lg font-black uppercase tracking-[0.14em] text-[var(--uki-cyan)]">
            Otros juegos del ecosistema
          </h3>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {gameCards.map((game) => (
              <article key={game.title} className="uki-game-card grid grid-cols-[82px_1fr] items-center gap-4 rounded-[9px] border border-white/10 bg-[#02090d]/60 p-3">
                <div className="relative h-16 overflow-hidden rounded-[6px] border border-white/10 bg-[#06141a]">
                  <Image src={game.image} alt={game.title} fill className="object-cover" sizes="82px" />
                  <span className="uki-game-card-face" aria-hidden="true" />
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
      <div className="uki-prizes-hero">
        <div className="uki-prizes-bg" aria-hidden="true" />
        <div className="uki-prizes-copy">
          <p className="uki-launch-badge inline-flex items-center gap-2">
            <Gem className="h-4 w-4" strokeWidth={1.8} />
            Premios
          </p>
          <h2>Gana Cukies por <span className="text-[var(--uki-gold)]">participar y por invitar</span></h2>
          <p>Consigue Cukies comprando UKI en la preventa y también invitando a otras personas a participar en el ecosistema.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <LandingButton href="/premios">Ver Premios</LandingButton>
            <LandingButton href="/premios#progreso-referidos" variant="secondary">Invita a tus amigos</LandingButton>
          </div>
        </div>
        <div className="uki-prizes-side-card">
          <Gift className="h-10 w-10 text-[var(--uki-gold)]" strokeWidth={1.8} />
          <h3>Más participación, más recompensas.</h3>
          <p>¡Juntos hacemos crecer el ecosistema Cukies!</p>
        </div>
      </div>
    </section>
  );
}

function TreasureMetric({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <article className="uki-treasure-metric">
      <Icon className="h-9 w-9 text-[var(--uki-gold)]" strokeWidth={1.8} />
      <div>
        <p>{value}</p>
        <span>{label}</span>
      </div>
    </article>
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
                <span className="text-lg leading-none text-[var(--uki-cyan)] transition-transform duration-300 group-open:rotate-45">+</span>
              </summary>
              <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-in-out group-open:grid-rows-[1fr]">
                <div className="overflow-hidden">
                  <p className="pt-2 text-xs leading-relaxed text-[var(--uki-muted)]">{faq.answer}</p>
                </div>
              </div>
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
              <PresaleGateLink href="#presale-console">Participa ahora</PresaleGateLink>
              <LandingButton href="#token" variant="secondary">
                Lee las condiciones
              </LandingButton>
            </div>
          </div>
        </div>
      </Panel>
    </section>
  );
}

