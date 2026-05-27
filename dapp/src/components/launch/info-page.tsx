import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { LandingButton, Panel } from '@/components/landing/primitives';
import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';

type InfoMetric = {
  label: string;
  value: string;
  helper?: string;
};

type InfoTable = {
  headers: string[];
  rows: string[][];
};

type InfoSection = {
  title: string;
  text?: string;
  bullets?: string[];
  table?: InfoTable;
};

type InfoPageProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  heroImage: string;
  heroAlt: string;
  metrics: InfoMetric[];
  sections: InfoSection[];
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  afterSections?: ReactNode;
  note?: string;
};

const publicNav = [
  { label: 'Inicio', href: '/' },
  { label: 'Premios', href: '/premios' },
  { label: 'Cukie Master', href: '/cukie-master' },
  { label: 'Hodler', href: '/cukie-hodler' },
  { label: 'Cómo jugar', href: '/como-jugar' },
  { label: 'Wallet', href: '/wallet' },
  { label: 'Juegos', href: '/games' },
];

export function LaunchInfoPage({
  eyebrow,
  title,
  subtitle,
  heroImage,
  heroAlt,
  metrics,
  sections,
  primaryCta,
  secondaryCta,
  afterSections,
  note,
}: InfoPageProps) {
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

      <section className="uki-container relative z-[2] grid min-h-[34rem] gap-8 pt-36 pb-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <div>
          <p className="uki-launch-badge">{eyebrow}</p>
          <h1 className="mt-5 max-w-4xl font-headline text-5xl font-black uppercase leading-[0.94] text-[var(--uki-cream)] sm:text-6xl lg:text-7xl">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--uki-text)]">
            {subtitle}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <LandingButton href={primaryCta.href}>{primaryCta.label}</LandingButton>
            {secondaryCta ? (
              <LandingButton href={secondaryCta.href} variant="secondary">
                {secondaryCta.label}
              </LandingButton>
            ) : null}
          </div>
        </div>

        <div className="relative min-h-[22rem] overflow-hidden rounded-[14px] border border-[var(--uki-cyan-border)] bg-[#02090d] lg:min-h-[31rem]">
          <Image src={heroImage} alt={heroAlt} fill className="object-cover" sizes="(min-width: 1024px) 52vw, 100vw" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-[#02090d]/74 via-transparent to-transparent" />
        </div>
      </section>

      <section className="uki-container relative z-[2] grid gap-3 pb-8 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-[8px] border border-[var(--uki-cyan-border)] bg-[#071923]/82 p-4">
            <p className="uki-label">{metric.label}</p>
            <p className="mt-2 font-headline text-2xl font-black uppercase leading-tight text-[var(--uki-cream)]">{metric.value}</p>
            {metric.helper ? <p className="mt-2 text-xs font-semibold leading-snug text-[var(--uki-muted)]">{metric.helper}</p> : null}
          </article>
        ))}
      </section>

      <section className="uki-container relative z-[2] grid gap-4 pb-10 lg:grid-cols-2">
        {sections.map((section) => (
          <Panel key={section.title} innerClassName="h-full p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[var(--uki-cyan)]" strokeWidth={1.8} />
              <div>
                <h2 className="font-headline text-xl font-black uppercase tracking-[0.04em] text-[var(--uki-cyan)]">{section.title}</h2>
                {section.text ? <p className="mt-3 text-sm leading-relaxed text-[var(--uki-text)]">{section.text}</p> : null}
              </div>
            </div>

            {section.bullets ? (
              <ul className="mt-5 space-y-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                {section.bullets.map((item) => (
                  <li key={item} className="flex gap-3">
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[var(--uki-gold)]" strokeWidth={1.8} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {section.table ? <InfoTable table={section.table} /> : null}
          </Panel>
        ))}
      </section>

      {afterSections}

      {note ? (
        <section className="uki-container relative z-[2] pb-14">
          <div className="rounded-[10px] border border-[var(--uki-cyan-border)] bg-[#071923]/82 p-5 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
            {note}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function InfoTable({ table }: { table: InfoTable }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-[8px] border border-white/10">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <thead className="bg-white/[0.06] text-[var(--uki-cyan)]">
          <tr>
            {table.headers.map((header) => (
              <th key={header} className="px-4 py-3 font-headline text-xs font-black uppercase tracking-[0.1em]">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 text-[var(--uki-text)]">
          {table.rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`} className="px-4 py-3 align-top font-semibold">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
