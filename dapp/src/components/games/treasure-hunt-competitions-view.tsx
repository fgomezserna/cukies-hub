'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Flag,
  Gamepad2,
  Info,
  LockKeyhole,
  Medal,
  Swords,
  Timer,
  Trophy,
  UserRound,
} from 'lucide-react';

import TreasureHuntCompetitionPanel from '@/components/games/treasure-hunt-competition-panel';
import {
  formatTreasureHuntCampaignWindow,
  formatTreasureHuntPercentage,
  TREASURE_HUNT_FALLBACK_RULES,
  useTreasureHuntCompetitionOverview,
} from '@/hooks/use-treasure-hunt-competition-overview';
import { cn } from '@/lib/utils';

const inactiveCompetitions = [
  {
    title: 'Liga semanal UKI',
    description: 'Se activará después de la preventa',
    state: 'INACTIVA',
    Icon: Medal,
  },
  {
    title: 'Speedrun semanal',
    description: 'Próxima temporada · Sin ranking activo',
    state: 'INACTIVO',
    Icon: Timer,
  },
  {
    title: 'Torneo 1v1',
    description: 'Próximamente más información',
    state: 'PRÓXIMAMENTE',
    Icon: Swords,
  },
] as const;

function PageFooter() {
  return (
    <footer className="flex flex-col gap-3 border-t border-white/15 py-4 text-[11px] text-[#9b9e99] sm:flex-row sm:items-center sm:justify-between">
      <p className="inline-flex items-center gap-2">
        <Info className="h-4 w-4 text-[#d4d8d2]" />
        Las competiciones están sujetas a reglas específicas. Revisa los detalles antes de participar.
      </p>
      <p className="inline-flex items-center gap-2">
        <Timer className="h-4 w-4 text-[#d4d8d2]" />
        Las horas se muestran en tu zona horaria local.
      </p>
    </footer>
  );
}

function InactiveRow({
  title,
  description,
  state,
  Icon,
}: (typeof inactiveCompetitions)[number]) {
  return (
    <div
      role="group"
      aria-disabled="true"
      className="grid min-h-[98px] grid-cols-[6.5rem_minmax(0,1fr)] overflow-hidden rounded-[8px] border border-white/20 bg-[#071211]/88 text-[#aaa9a4] sm:grid-cols-[7.75rem_minmax(0,1fr)_15rem]"
    >
      <div className="flex items-center justify-center bg-[radial-gradient(circle,rgba(184,189,185,0.12),transparent_68%)]">
        <span className="inline-flex h-[70px] w-[70px] items-center justify-center rounded-full border border-white/10 bg-[#111b19] text-[#777d79] shadow-[inset_0_0_20px_rgba(255,255,255,0.04)]">
          <Icon className="h-9 w-9" />
        </span>
      </div>
      <div className="min-w-0 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-headline text-lg font-bold text-[#d0cec8]">{title}</h3>
          <span className="rounded-[4px] border border-white/20 bg-white/[0.04] px-2 py-0.5 text-[10px] tracking-[0.08em] text-[#aaa9a4]">
            {state}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-[#8e918d]">{description}</p>
        <dl className="mt-2 grid grid-cols-3 divide-x divide-white/12 text-[10px]">
          <div className="pr-3">
            <dt className="inline-flex items-center gap-1.5 uppercase text-[#8e918d]"><CalendarDays className="h-3.5 w-3.5" />Fecha</dt>
            <dd className="mt-0.5 text-xs text-[#b7b6b1]">Sin fecha</dd>
          </div>
          <div className="px-3">
            <dt className="inline-flex items-center gap-1.5 uppercase text-[#8e918d]"><Flag className="h-3.5 w-3.5" />Reglas</dt>
            <dd className="mt-0.5 text-xs text-[#b7b6b1]">—</dd>
          </div>
          <div className="pl-3">
            <dt className="inline-flex items-center gap-1.5 uppercase text-[#8e918d]"><BarChart3 className="h-3.5 w-3.5" />Ranking</dt>
            <dd className="mt-0.5 truncate text-xs text-[#b7b6b1]">Sin ranking activo</dd>
          </div>
        </dl>
      </div>
      <div className="hidden items-center justify-end px-4 sm:flex">
        <span className="inline-flex h-11 min-w-[142px] items-center justify-center gap-2 rounded-[6px] border border-white/20 bg-white/[0.04] px-4 text-sm text-[#8e918d]">
          <LockKeyhole className="h-4 w-4" />
          No disponible
        </span>
      </div>
    </div>
  );
}

export default function TreasureHuntCompetitionsView() {
  const { status, leaderboard, isLoading } = useTreasureHuntCompetitionOverview();
  const phase = status?.phase ?? 'unconfigured';
  const rules = status?.campaign ?? TREASURE_HUNT_FALLBACK_RULES;
  const myAttempts = leaderboard.filter((entry) => entry.isMe).length;
  const isActive = phase === 'active';
  const campaignWindow = formatTreasureHuntCampaignWindow(status?.campaign ?? null);

  return (
    <div className="min-h-full">
      <div className="mb-4">
        <h2 className="font-headline text-2xl font-black tracking-[-0.025em] text-[#f2eee7]">
          Competiciones de Treasure Hunt
        </h2>
        <p className="mt-1 text-sm text-[#aaa8a2]">
          Cada competición tiene sus propias reglas, fechas y ranking.
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_270px]">
        <main className="space-y-3">
          <article className="overflow-hidden rounded-[8px] border border-[#be8c2d]/75 bg-[#071211]/94 shadow-[0_20px_60px_-42px_rgba(213,157,43,0.8)]">
            <div className="grid min-h-[210px] sm:grid-cols-[220px_minmax(0,1fr)]">
              <div className="relative min-h-[170px] overflow-hidden border-b border-[#be8c2d]/45 sm:min-h-0 sm:border-b-0 sm:border-r">
                <Image
                  src="/brand/official/uki-token-cukies-world-coin.png"
                  alt="Emblema del Torneo de Preventa UKI"
                  fill
                  sizes="220px"
                  className="object-contain p-6 drop-shadow-[0_12px_22px_rgba(197,137,24,0.35)]"
                  priority
                />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(211,153,36,0.2),transparent_68%)]" />
              </div>

              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-headline text-2xl font-black tracking-[-0.02em] text-[#f0e4ce]">
                    Torneo de Preventa UKI
                  </h3>
                  <span className={cn(
                    'rounded-[4px] border px-2 py-1 text-[10px] font-bold tracking-[0.12em]',
                    isActive
                      ? 'border-[#2de9dd]/55 bg-[#07302e] text-[#49f2e7]'
                      : 'border-white/20 bg-white/5 text-[#aaa8a2]',
                  )}>
                    {isLoading ? 'CONSULTANDO' : isActive ? 'EN CURSO' : 'INACTIVO'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#d89c21]/60 bg-[#2b2107] px-2 py-1 text-[10px] font-bold tracking-[0.12em] text-[#ffc240]">
                    <Medal className="h-3.5 w-3.5" /> OFICIAL
                  </span>
                </div>
                {campaignWindow ? (
                  <p className="mt-2 text-xs text-[#8e918d]">{campaignWindow}</p>
                ) : null}

                <dl className="mt-6 grid grid-cols-2 divide-x divide-white/15 sm:grid-cols-5">
                  {[
                    ['Modo', '1P', UserRound],
                    ['Pool', formatTreasureHuntPercentage(rules.poolBps), Medal],
                    ['Por partida', formatTreasureHuntPercentage(rules.playerRewardBps), Trophy],
                    ['Partidas máx.', String(rules.maxWinningAttemptsPerWallet), Flag],
                    ['Sponsor', formatTreasureHuntPercentage(rules.sponsorRewardBps), Swords],
                  ].map(([label, value, Icon], index) => (
                    <div key={String(label)} className={cn('px-3 first:pl-0', index > 1 && 'mt-4 sm:mt-0')}>
                      <dt className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.08em] text-[#979994]">
                        <Icon className="h-4 w-4 text-[#e4bb6f]" />{String(label)}
                      </dt>
                      <dd className="mt-1 text-base font-semibold text-[#efeee9]">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-[#be8c2d]/45 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#37eee2]">Tu participación</p>
                <p className="mt-0.5 text-sm text-[#f0eee7]">{myAttempts}/{rules.maxWinningAttemptsPerWallet} partidas</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/games/treasure-hunt"
                  className="inline-flex min-h-11 items-center gap-3 rounded-[6px] border border-[#2de9dd]/65 bg-[#0d4d49] px-8 text-sm font-bold text-white transition hover:bg-[#11625d]"
                >
                  <Gamepad2 className="h-4 w-4" /> Jugar torneo <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/games/treasure-hunt/rules" className="inline-flex min-h-11 items-center gap-2 px-3 text-sm font-semibold text-[#35eee2] hover:text-white">
                  Ver reglas y ranking <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </article>

          {inactiveCompetitions.map((competition) => (
            <InactiveRow key={competition.title} {...competition} />
          ))}
        </main>

        <aside className="rounded-[8px] border border-white/20 bg-[#071211]/92 p-4">
          <h3 className="flex items-center gap-2 font-headline text-lg font-bold text-[#f1dfbe]">
            <BarChart3 className="h-5 w-5 text-[#edc27a]" />
            Tus competiciones
          </h3>

          <div className="mt-4 space-y-3">
            <Link href="/games/treasure-hunt/rankings" className="grid grid-cols-[54px_1fr_auto] items-center gap-3 rounded-[7px] border border-[#d09a36]/45 bg-[#0b1816] p-3 transition hover:border-[#d09a36]/75">
              <Image src="/brand/official/uki-token-cukies-world-coin.png" alt="" width={54} height={54} className="h-[54px] w-[54px] object-contain" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[#f0eee8]">Torneo de Preventa UKI</span>
                <span className="mt-1 block text-xs text-[#aaa8a2]">{myAttempts ? 'Clasificado' : 'Sin clasificar'}</span>
                <span className="block text-xs text-[#aaa8a2]">{myAttempts}/{rules.maxWinningAttemptsPerWallet} partidas</span>
              </span>
              <ArrowRight className="h-5 w-5 text-[#ffc240]" />
            </Link>

            {inactiveCompetitions.map(({ title, Icon }) => (
              <div key={title} aria-disabled="true" className="grid grid-cols-[52px_1fr] items-center gap-3 rounded-[7px] border border-white/15 bg-[#0a1514] p-3 text-[#8e918d]">
                <span className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-full border border-white/10 bg-[#101a18]">
                  <Icon className="h-7 w-7" />
                </span>
                <span>
                  <span className="block text-sm">{title}</span>
                  <span className="mt-1 inline-flex items-center gap-1.5 text-xs"><LockKeyhole className="h-3.5 w-3.5" /> Inactivo</span>
                </span>
              </div>
            ))}
          </div>

          <Link href="/games/treasure-hunt/rankings" className="mt-4 flex items-center justify-center gap-2 py-2 text-sm font-semibold text-[#35eee2]">
            Ver todas <ArrowRight className="h-4 w-4" />
          </Link>
        </aside>
      </div>

      <details className="mt-5 rounded-[8px] border border-white/15 bg-[#071211]/80">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#35eee2]">
          Administrar nombre y participación
        </summary>
        <div className="border-t border-white/10 p-3 sm:p-4">
          <TreasureHuntCompetitionPanel />
        </div>
      </details>

      <PageFooter />
    </div>
  );
}
