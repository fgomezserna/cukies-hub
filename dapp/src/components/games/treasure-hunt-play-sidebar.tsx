'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Gamepad2,
  Medal,
  Trophy,
} from 'lucide-react';

import { TreasureHuntCompetitionCountdown } from '@/components/games/treasure-hunt-competition-countdown';
import {
  TREASURE_HUNT_FALLBACK_RULES,
  useTreasureHuntCompetitionOverview,
} from '@/hooks/use-treasure-hunt-competition-overview';
import { formatTreasureHuntUkiRaw } from '@/lib/treasure-hunt-prize-pool';
import { TREASURE_HUNT_LAUNCH_TOURNAMENT_NAME } from '@/lib/treasure-hunt-competition/presentation';

export default function TreasureHuntPlaySidebar({
  onStartSinglePlayer,
}: {
  readonly onStartSinglePlayer: () => void;
}) {
  const { status, leaderboard, isLoading } = useTreasureHuntCompetitionOverview();
  const rules = status?.campaign ?? TREASURE_HUNT_FALLBACK_RULES;
  const eligibility = status?.eligibility;
  const attemptsUsed = eligibility?.attemptsUsed ?? leaderboard.filter((entry) => entry.isMe).length;
  const attemptsGranted = eligibility?.attemptsGranted
    ?? rules.topAttemptsPerWallet
    ?? rules.maxWinningAttemptsPerWallet
    ?? 10;
  const canStart = status?.phase === 'active' && (
    eligibility == null || (
      eligibility.ready &&
      !eligibility.disqualified &&
      eligibility.attemptsRemaining > 0
    )
  );
  const actionLabel = eligibility?.disqualified
    ? 'Wallet descalificada'
    : eligibility && !eligibility.ready
      ? 'Sincronizando staking'
      : eligibility?.attemptsRemaining === 0
        ? 'Sin intentos disponibles'
        : status?.phase === 'scheduled'
          ? 'El torneo aún no ha comenzado'
        : 'Iniciar partida 1P';
  const statusLabel = isLoading
    ? 'Comprobando'
    : eligibility?.disqualified
      ? 'Descalificado'
      : eligibility && !eligibility.ready
        ? 'Sincronizando'
        : canStart
          ? 'Listo para jugar'
          : 'No disponible';

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-[8px] border border-white/20 bg-[#071312]/94 p-5">
      <h2 className="font-headline text-xl font-black text-[#f2eee7]">{TREASURE_HUNT_LAUNCH_TOURNAMENT_NAME}</h2>
      <TreasureHuntCompetitionCountdown
        phase={status?.phase}
        campaign={status?.campaign}
        className="mt-2"
      />

      <dl className="mt-4 overflow-hidden rounded-[8px] border border-white/20 bg-[#091513]">
        {[
          { label: 'Modo', value: '1P', Icon: Gamepad2, tone: 'text-[#ffc240]' },
          { label: 'Competición', value: TREASURE_HUNT_LAUNCH_TOURNAMENT_NAME, Icon: Trophy, tone: 'text-[#ffc240]' },
          { label: 'Intentos', value: `${attemptsUsed} usados · ${attemptsGranted} concedidos`, Icon: Medal, tone: 'text-[#f2eee7]' },
          { label: 'UKI en staking', value: eligibility ? formatTreasureHuntUkiRaw(eligibility.stakedUkiRaw) : 'Conecta tu wallet', Icon: Medal, tone: 'text-[#f2eee7]' },
          { label: 'Estado', value: statusLabel, Icon: CheckCircle2, tone: eligibility?.disqualified ? 'text-red-300' : 'text-[#61e598]' },
        ].map(({ label, value, Icon, tone }) => (
          <div key={label} className="flex min-h-[52px] items-center gap-3 border-b border-white/15 px-4 last:border-0">
            <Icon className="h-5 w-5 shrink-0 text-[#35eee2]" />
            <dt className="text-sm text-[#b6b5b0]">{label}</dt>
            <dd className={`ml-auto text-right text-sm font-bold ${tone}`}>{value}</dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        onClick={onStartSinglePlayer}
        disabled={!canStart}
        className="mt-4 inline-flex min-h-[54px] w-full items-center justify-center gap-4 rounded-[7px] border border-[#47f4e9] bg-[linear-gradient(180deg,#1ca9a2,#0e6d68)] px-5 text-base font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35eee2] disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/5 disabled:text-[#969994] disabled:shadow-none"
      >
        {actionLabel}
        <ArrowRight className="h-5 w-5" />
      </button>

      <Link href="/cukie-master" className="mt-2 inline-flex min-h-11 items-center justify-center gap-3 text-sm font-semibold text-[#ffc240] hover:text-white">
        Gestionar staking UKI <ArrowRight className="h-4 w-4" />
      </Link>

      <Link href="/games/treasure-hunt/rules" className="inline-flex min-h-11 items-center justify-center gap-3 text-sm font-semibold text-[#35eee2] hover:text-white">
        Ver reglas <ArrowRight className="h-4 w-4" />
      </Link>
    </aside>
  );
}
