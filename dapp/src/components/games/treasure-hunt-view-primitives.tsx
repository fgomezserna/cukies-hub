import type { LucideIcon } from 'lucide-react';
import { LockKeyhole } from 'lucide-react';

import {
  TREASURE_HUNT_PHASE_COPY,
  type TreasureHuntCompetitionPhase,
} from '@/hooks/use-treasure-hunt-competition-overview';
import { cn } from '@/lib/utils';

const phaseTone: Record<TreasureHuntCompetitionPhase, string> = {
  unconfigured: 'border-slate-400/20 bg-slate-400/10 text-slate-300',
  disabled: 'border-slate-400/20 bg-slate-400/10 text-slate-300',
  scheduled: 'border-amber-300/25 bg-amber-300/10 text-amber-200',
  active: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200',
  closed: 'border-slate-400/20 bg-slate-400/10 text-slate-300',
};

export function TreasureHuntPhaseBadge({
  phase,
  loading = false,
}: {
  readonly phase: TreasureHuntCompetitionPhase;
  readonly loading?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 font-mono text-[0.65rem] font-black uppercase tracking-[0.1em]',
        phaseTone[phase],
      )}
    >
      {loading ? 'Consultando' : TREASURE_HUNT_PHASE_COPY[phase].label}
    </span>
  );
}

export function TreasureHuntSectionIntro({
  eyebrow,
  title,
  description,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="font-mono text-[0.68rem] font-black uppercase tracking-[0.2em] text-emerald-300">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-balance font-headline text-2xl font-black tracking-[-0.035em] text-white sm:text-3xl lg:text-[2.45rem] lg:leading-[1.05]">
        {title}
      </h1>
      <p className="mt-3 max-w-[68ch] text-sm leading-6 text-slate-400 sm:text-base">
        {description}
      </p>
    </div>
  );
}

export function InactiveExperienceCard({
  eyebrow,
  title,
  description,
  label,
  Icon,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly label: string;
  readonly Icon: LucideIcon;
}) {
  return (
    <div
      role="group"
      aria-disabled="true"
      className="group relative min-h-[13rem] overflow-hidden rounded-[14px] border border-white/[0.07] bg-[#0e1917]/60 p-5 text-slate-500 grayscale-[0.35]"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-slate-400/[0.04] blur-2xl" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.03]">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/15 px-2.5 py-1 font-mono text-[0.62rem] font-black uppercase tracking-[0.08em]">
            <LockKeyhole className="h-3 w-3" aria-hidden="true" />
            {label}
          </span>
        </div>
        <p className="mt-6 font-mono text-[0.63rem] font-black uppercase tracking-[0.16em] text-slate-600">
          {eyebrow}
        </p>
        <h3 className="mt-1 font-headline text-lg font-black tracking-tight text-slate-400">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-5 text-slate-500">{description}</p>
        <p className="mt-auto pt-5 text-xs font-semibold text-slate-600">
          Se activará cuando exista una edición configurada.
        </p>
      </div>
    </div>
  );
}

export function TreasureHuntErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  return (
    <div role="alert" className="rounded-[12px] border border-red-300/20 bg-red-300/[0.07] p-5">
      <p className="text-sm font-bold text-red-100">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex min-h-10 items-center rounded-[9px] border border-red-200/20 bg-red-100/10 px-4 text-sm font-black text-red-100 transition hover:bg-red-100/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/60"
      >
        Reintentar
      </button>
    </div>
  );
}
