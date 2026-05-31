import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Crown, Gift, Sparkles, Star, Ticket, Trophy, Users } from 'lucide-react';
import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { PresaleReferralLinkPanel } from '@/components/landing/presale-referral-link-panel';

export const metadata: Metadata = {
  title: 'Premios de preventa | Cukies World',
  description: 'Sorteos de Cukies por compra de UKI y competición de referidos de la preventa.',
};

const publicNav = [
  { label: 'Inicio', href: '/' },
  { label: 'Premios', href: '/premios' },
];

const purchaseRewards = [
  {
    amount: '10.000 UKI',
    prize: 'Sorteo de 10 Cukies de 2ª Generación',
    helper: 'Rarezas variadas',
    tone: 'from-[#f6bd45]/24 to-[#7c3cff]/18',
  },
  {
    amount: '30.000 UKI',
    prize: 'Sorteo de 5 Cukies Comunes',
    helper: 'Primer bloque garantizado de participación',
    tone: 'from-[#e8e2d2]/18 to-[#6b7280]/14',
  },
  {
    amount: '50.000 UKI',
    prize: 'Sorteo de 2 Cukies Raros + 3 Cukies No Comunes',
    helper: 'Más rareza por mayor tramo',
    tone: 'from-[#38bdf8]/20 to-[#91e96f]/14',
  },
  {
    amount: '80.000 UKI',
    prize: 'Sorteo de 1 Cukie Épico + 2 Cukies Raros + 2 Cukies No Comunes',
    helper: 'Entrada en premios premium',
    tone: 'from-[#c044ff]/24 to-[#38bdf8]/14',
  },
  {
    amount: '125.000 UKI',
    prize: 'Sorteo de 1 Cukie Legendario + 3 Cukies Épicos',
    helper: 'Tramo alto de lanzamiento',
    tone: 'from-[#f2c34b]/24 to-[#c044ff]/18',
  },
  {
    amount: '150.000 UKI',
    prize: 'Sorteo de 1 Cukie Goat + 3 Cukies Legendarios',
    helper: '+ tickets extra desde este tramo',
    tone: 'from-[#fff2dc]/24 to-[#f2c34b]/18',
  },
];

const rarityRewards = [
  { name: 'Goat', threshold: '3.000.000 UKI', border: 'border-[#f2c34b]/70', text: 'text-[#ffe08a]', icon: Crown },
  { name: 'Legendario', threshold: '1.500.000 UKI', border: 'border-[#d7a63e]/65', text: 'text-[#f2c34b]', icon: Trophy },
  { name: 'Épico', threshold: '750.000 UKI', border: 'border-[#d953ff]/65', text: 'text-[#f19bff]', icon: Sparkles },
  { name: 'Raro', threshold: '500.000 UKI', border: 'border-[#38bdf8]/65', text: 'text-[#7dd3fc]', icon: Star },
  { name: 'No Común', threshold: '250.000 UKI', border: 'border-[#91e96f]/65', text: 'text-[#b8f486]', icon: Gift },
  { name: 'Común', threshold: '>250.000 UKI', border: 'border-white/30', text: 'text-[var(--uki-cream)]', icon: Users },
];

export default function PremiosPage() {
  return (
    <main className="uki-landing min-h-screen overflow-hidden bg-[var(--uki-bg)] text-[var(--uki-cream)]">
      <div className="uki-noise" />
      <div className="uki-grid-bg" />
      <header className="uki-landing-header">
        <nav className="uki-container flex h-[5.7rem] items-center justify-between">
          <Link href="/" className="uki-header-logo relative block h-[5.1rem] w-48 overflow-hidden" aria-label="Inicio Cukies World">
            <Image src="/Cukie_logo_first.png" alt="Cukies World" fill className="object-contain object-left" sizes="11rem" priority />
          </Link>

          <div className="hidden items-center gap-6 lg:flex">
            {publicNav.map((item) => (
              <Link key={item.href} href={item.href} className="uki-nav-link">
                {item.label}
              </Link>
            ))}
          </div>

          <LandingWalletConnectButton />
        </nav>
      </header>

      <section className="uki-container relative z-[2] grid min-h-[35rem] gap-8 pb-10 pt-36 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
        <div>
          <p className="uki-launch-badge">PREMIOS</p>
          <h1 className="mt-5 max-w-4xl font-headline text-5xl font-black uppercase leading-[0.94] text-[var(--uki-cream)] sm:text-6xl lg:text-7xl">
            Consigue Cukies por comprar <span className="text-[var(--uki-gold)]">UKI</span> y por{' '}
            <span className="text-[#e45cff]">invitar</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg font-semibold leading-relaxed text-[var(--uki-text)]">
            Participa en la preventa y suma oportunidades de conseguir Cukies. Cuanto más compras o más recomiendas,
            mejores premios desbloqueas.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/#presale-console" className="uki-button uki-button-primary justify-center">
              Comprar UKI
            </Link>
            <Link href="#progreso-referidos" className="uki-button uki-button-secondary justify-center">
              Ver mi progreso
            </Link>
          </div>
        </div>

        <div className="relative min-h-[22rem] overflow-hidden rounded-[14px] border border-[#7c3cff]/45 bg-[#050712] shadow-[0_0_54px_rgba(124,60,255,0.22)] lg:min-h-[31rem]">
          <Image
            src="/brand/generated/uki-treasure-hunt-scene-v2.png"
            alt="Cukies con tesoro y premios UKI"
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 54vw, 100vw"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050712]/82 via-[#050712]/12 to-transparent" />
        </div>
      </section>

      <section className="uki-container relative z-[2] pb-5">
        <div className="rounded-[14px] border border-[#7c3cff]/42 bg-[#070817]/86 p-4 shadow-[0_0_44px_rgba(124,60,255,0.16)] sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[0.34fr_0.66fr]">
            <div className="flex flex-col justify-between gap-6">
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
                <p className="text-sm font-black uppercase tracking-[0.12em] text-[#f19bff]">Notas</p>
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
            </div>

            <div className="grid gap-3">
              {purchaseRewards.map((reward) => (
                <article
                  key={reward.amount}
                  className={`grid gap-3 rounded-[10px] border border-white/10 bg-gradient-to-r ${reward.tone} p-3 sm:grid-cols-[10rem_1.5rem_1fr] sm:items-center`}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#f2c34b]/70 bg-[#3a2508] text-xs font-black text-[#ffe08a] shadow-[0_0_20px_rgba(242,195,75,0.22)]">
                      UKI
                    </span>
                    <strong className="font-headline text-xl font-black uppercase leading-none text-[var(--uki-cream)]">
                      {reward.amount}
                    </strong>
                  </div>
                  <ArrowRight className="hidden h-5 w-5 text-[#e45cff] sm:block" strokeWidth={2.2} />
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Sorteo de</p>
                    <h3 className="font-headline text-lg font-black uppercase leading-tight text-[var(--uki-cream)]">
                      {reward.prize}
                    </h3>
                    <p className="mt-1 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-gold)]">{reward.helper}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="uki-container relative z-[2] pb-5">
        <div className="rounded-[14px] border border-[#38bdf8]/32 bg-[#06101d]/88 p-4 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[0.25fr_0.75fr]">
            <div>
              <p className="uki-launch-badge">COMPETICIÓN DE REFERIDOS</p>
              <p className="mt-4 text-base font-semibold leading-relaxed text-[var(--uki-text)]">
                Los 5 mejores sponsors reciben un Cukie garantizado. La rareza depende de los UKI que compren sus invitados.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {rarityRewards.map((rarity) => {
                const Icon = rarity.icon;

                return (
                  <article key={rarity.name} className={`rounded-[10px] border ${rarity.border} bg-[#09091a]/86 p-3 text-center`}>
                    <Icon className={`mx-auto h-7 w-7 ${rarity.text}`} strokeWidth={1.8} />
                    <h3 className={`mt-3 font-headline text-sm font-black uppercase ${rarity.text}`}>{rarity.name}</h3>
                    <p className="mt-4 font-headline text-lg font-black leading-tight text-[var(--uki-cream)]">{rarity.threshold}</p>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <RulePanel icon={Users} title="Ponderación para ranking">
              <p>Nivel 1 cuenta al 100%, nivel 2 al 50% y nivel 3 al 25%.</p>
              <p className="mt-3">Como máximo se entregará un Cukie Goat y un Cukie Legendario.</p>
            </RulePanel>
            <RulePanel icon={Gift} title="Sorteo para el resto">
              <p>El resto de participantes entra en el sorteo de 10 Cukies de 2ª Generación.</p>
              <p className="mt-3">Recibes 1 ticket para el sorteo por cada 5.000 UKI recomendados.</p>
            </RulePanel>
          </div>
        </div>
      </section>

      <section id="progreso-referidos" className="uki-container relative z-[2] scroll-mt-28 pb-14">
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
      </section>
    </main>
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
