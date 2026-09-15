import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

type JourneyItem = {
  icon: LucideIcon;
  label: string;
};

type RelatedLink = {
  href: string;
  icon: LucideIcon;
  label: string;
  primary?: boolean;
};

export function CollectionWorkspaceHeader({
  description,
  eyebrow,
  insight,
  insightDescription,
  insightIcon: InsightIcon,
  journey,
  links,
  title,
}: {
  description: string;
  eyebrow: string;
  insight: string;
  insightDescription: string;
  insightIcon: LucideIcon;
  journey: JourneyItem[];
  links: RelatedLink[];
  title: string;
}) {
  return (
    <header className="relative overflow-hidden border-b border-white/10 pb-7 pt-1 sm:pb-9">
      <div className="pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full bg-[rgba(228,92,255,0.1)] blur-3xl" />
      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-bold text-[var(--uki-lilac)]">{eyebrow}</p>
          <h1 className="mt-2 text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">
            {description}
          </p>

          <div className="mt-5 grid gap-px overflow-hidden rounded-[12px] border border-white/10 bg-white/10 sm:grid-cols-3">
            {journey.map(({ icon: Icon, label }, index) => (
              <div key={label} className="flex min-w-0 items-center gap-3 bg-[#0d0914] px-4 py-3">
                <span className="font-headline text-xs font-black text-[var(--uki-lilac)]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <Icon className="h-4 w-4 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
                <span className="text-xs font-bold leading-snug text-[var(--uki-text)]">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex max-w-md shrink-0 flex-col gap-4">
          <div className="flex items-start gap-3 border-l-2 border-[var(--uki-lilac)] pl-4">
            <InsightIcon className="mt-0.5 h-6 w-6 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
            <div>
              <p className="font-headline text-lg font-black text-[var(--uki-cream)]">{insight}</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                {insightDescription}
              </p>
            </div>
          </div>

          <nav aria-label="Acciones relacionadas" className="flex flex-wrap gap-2">
            {links.map(({ href, icon: Icon, label, primary }) => (
              <Link
                key={href}
                href={href}
                className={primary
                  ? 'inline-flex min-h-11 items-center gap-2 rounded-[9px] border border-[var(--uki-lilac)] bg-[var(--uki-lilac)] px-4 text-sm font-black text-[#09060f] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)]'
                  : 'inline-flex min-h-11 items-center gap-2 rounded-[9px] border border-white/15 bg-white/[0.04] px-4 text-sm font-black text-[var(--uki-cream)] transition hover:border-[var(--uki-lilac)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)]'}
              >
                <Icon className={primary ? 'h-4 w-4' : 'h-4 w-4 text-[var(--uki-lilac)]'} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
