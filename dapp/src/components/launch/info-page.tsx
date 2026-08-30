import Image from 'next/image';
import type { ReactNode } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown } from 'lucide-react';
import { LandingHeader } from '@/components/landing/header';
import { LandingButton, Panel } from '@/components/landing/primitives';

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
  beforeSections?: ReactNode;
  afterSections?: ReactNode;
  note?: string;
  variant?: 'standard' | 'workspace';
};

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
  beforeSections,
  afterSections,
  note,
  variant = 'standard',
}: InfoPageProps) {
  const isWorkspace = variant === 'workspace';
  const Root = isWorkspace ? 'div' : 'main';

  return (
    <Root className="uki-landing min-h-screen overflow-x-clip bg-[var(--uki-bg)] text-[var(--uki-cream)]">
      <div className="uki-noise" />
      <div className="uki-grid-bg" />
      {!isWorkspace ? <LandingHeader /> : null}

      <section className={`uki-container relative z-[2] grid min-w-0 gap-6 ${
        isWorkspace
          ? 'pb-7 pt-28 sm:grid-cols-[1.08fr_0.92fr] sm:items-center lg:min-h-[23rem] lg:gap-10'
          : 'min-h-[34rem] pb-12 pt-36 lg:grid-cols-[0.92fr_1.08fr] lg:items-center'
      }`}>
        <div className="min-w-0">
          <p className="uki-launch-badge">{eyebrow}</p>
          <h1 className={`mt-5 max-w-4xl font-headline font-black uppercase leading-[0.94] text-[var(--uki-cream)] ${
            isWorkspace ? 'text-4xl sm:text-5xl lg:text-6xl' : 'text-5xl sm:text-6xl lg:text-7xl'
          }`}>
            {title}
          </h1>
          <p className={`mt-4 max-w-2xl leading-relaxed text-[var(--uki-text)] ${isWorkspace ? 'text-base sm:text-lg' : 'text-lg'}`}>
            {subtitle}
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <LandingButton href={primaryCta.href}>{primaryCta.label}</LandingButton>
            {secondaryCta ? (
              <LandingButton href={secondaryCta.href} variant="secondary">
                {secondaryCta.label}
              </LandingButton>
            ) : null}
          </div>
        </div>

        <div className={`relative min-w-0 overflow-hidden rounded-[14px] border border-[var(--uki-cyan-border)] bg-[#02090d] ${
          isWorkspace ? 'hidden min-h-[14rem] sm:block lg:min-h-[18rem]' : 'min-h-[22rem] lg:min-h-[31rem]'
        }`}>
          <Image src={heroImage} alt={heroAlt} fill className="object-cover" sizes="(min-width: 1024px) 52vw, 100vw" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-[#02090d]/74 via-transparent to-transparent" />
        </div>
      </section>

      {!isWorkspace ? <InfoMetrics metrics={metrics} /> : null}

      {beforeSections}

      {isWorkspace ? (
        <section id="como-funciona" className="uki-container relative z-[2] min-w-0 scroll-mt-28 pb-10">
          <Panel className="min-w-0" innerClassName="min-w-0 overflow-hidden">
            <details className="group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left sm:px-7">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Información secundaria</p>
                  <h2 className="mt-1 font-headline text-xl font-black uppercase text-[var(--uki-cream)]">Reglas y requisitos</h2>
                </div>
                <ChevronDown className="h-5 w-5 shrink-0 text-[var(--uki-cyan)] transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="min-w-0 border-t border-white/10 p-4 sm:p-6">
                <InfoMetrics metrics={metrics} nested />
                <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
                  {sections.map((section) => <InfoSectionCard key={section.title} section={section} nested />)}
                </div>
                {note ? <InfoNote note={note} nested /> : null}
              </div>
            </details>
          </Panel>
        </section>
      ) : (
        <>
          <section className="uki-container relative z-[2] grid min-w-0 gap-4 pb-10 lg:grid-cols-2">
            {sections.map((section) => <InfoSectionCard key={section.title} section={section} />)}
          </section>
          {note ? <InfoNote note={note} /> : null}
        </>
      )}

      {afterSections}
    </Root>
  );
}

function InfoMetrics({ metrics, nested = false }: { metrics: InfoMetric[]; nested?: boolean }) {
  return (
    <section className={`${nested ? '' : 'uki-container relative z-[2] pb-8'} grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
      {metrics.map((metric) => (
        <article key={metric.label} className="min-w-0 rounded-[8px] border border-[var(--uki-cyan-border)] bg-[#071923]/82 p-4">
          <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">{metric.label}</p>
          <p className="mt-2 break-words font-headline text-2xl font-black uppercase leading-tight text-[var(--uki-cream)]">{metric.value}</p>
          {metric.helper ? <p className="mt-2 text-xs font-semibold leading-snug text-[var(--uki-muted)]">{metric.helper}</p> : null}
        </article>
      ))}
    </section>
  );
}

function InfoSectionCard({ section, nested = false }: { section: InfoSection; nested?: boolean }) {
  const Heading = nested ? 'h3' : 'h2';

  return (
    <Panel className="min-w-0" innerClassName="h-full min-w-0 p-5 sm:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[var(--uki-cyan)]" strokeWidth={1.8} />
        <div className="min-w-0">
          <Heading className="break-words font-headline text-xl font-black uppercase tracking-[0.04em] text-[var(--uki-cyan)]">{section.title}</Heading>
          {section.text ? <p className="mt-3 text-sm leading-relaxed text-[var(--uki-text)]">{section.text}</p> : null}
        </div>
      </div>

      {section.bullets ? (
        <ul className="mt-5 space-y-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
          {section.bullets.map((item) => (
            <li key={item} className="flex min-w-0 gap-3">
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[var(--uki-gold)]" strokeWidth={1.8} />
              <span className="min-w-0 break-words">{item}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {section.table ? <InfoTable table={section.table} /> : null}
    </Panel>
  );
}

function InfoNote({ note, nested = false }: { note: string; nested?: boolean }) {
  const content = (
    <div className="rounded-[10px] border border-[var(--uki-cyan-border)] bg-[#071923]/82 p-5 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
      {note}
    </div>
  );
  if (nested) return <div className="mt-4">{content}</div>;
  return <section className="uki-container relative z-[2] pb-14">{content}</section>;
}

function InfoTable({ table }: { table: InfoTable }) {
  return (
    <div className="mt-5 max-w-full overflow-x-auto rounded-[8px] border border-white/10">
      <table className="w-full min-w-full border-collapse text-left text-sm sm:min-w-[34rem]">
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
                <td key={`cell-${rowIndex}-${cellIndex}`} className="break-words px-4 py-3 align-top font-semibold">
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
