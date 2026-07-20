'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Gamepad2,
  Info,
  Medal,
  ShoppingCart,
  Trophy,
} from 'lucide-react';

import {
  TREASURE_HUNT_FALLBACK_RULES,
  useTreasureHuntCompetitionOverview,
} from '@/hooks/use-treasure-hunt-competition-overview';

export default function TreasureHuntPlaySidebar({
  onStartSinglePlayer,
}: {
  readonly onStartSinglePlayer: () => void;
}) {
  const { status, leaderboard, isLoading } = useTreasureHuntCompetitionOverview();
  const rules = status?.campaign ?? TREASURE_HUNT_FALLBACK_RULES;
  const attempts = leaderboard.filter((entry) => entry.isMe).length;

  return (
    <aside className="flex h-full min-h-[30rem] flex-col rounded-[8px] border border-white/20 bg-[#071312]/94 p-5">
      <h2 className="font-headline text-xl font-black text-[#f2eee7]">Preparar partida</h2>

      <dl className="mt-4 overflow-hidden rounded-[8px] border border-white/20 bg-[#091513]">
        {[
          { label: 'Modo', value: '1P', Icon: Gamepad2, tone: 'text-[#ffc240]' },
          { label: 'Competición', value: 'Preventa UKI', Icon: Trophy, tone: 'text-[#ffc240]' },
          { label: 'Partidas computables', value: `${attempts} de ${rules.maxWinningAttemptsPerWallet}`, Icon: Medal, tone: 'text-[#f2eee7]' },
          { label: 'Compra de UKI', value: 'No requerida', Icon: ShoppingCart, tone: 'text-[#f2eee7]' },
          { label: 'Estado', value: isLoading ? 'Comprobando' : 'Listo para jugar', Icon: CheckCircle2, tone: 'text-[#61e598]' },
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
        className="mt-4 inline-flex min-h-[54px] w-full items-center justify-center gap-4 rounded-[7px] border border-[#47f4e9] bg-[linear-gradient(180deg,#1ca9a2,#0e6d68)] px-5 text-base font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35eee2]"
      >
        Iniciar partida 1P
        <ArrowRight className="h-5 w-5" />
      </button>

      <Link href="/games/treasure-hunt/rules" className="mt-2 inline-flex min-h-11 items-center justify-center gap-3 text-sm font-semibold text-[#35eee2] hover:text-white">
        Cómo se juega <ArrowRight className="h-4 w-4" />
      </Link>

      <div className="mt-auto flex gap-3 rounded-[8px] border border-white/15 bg-[#091513] p-4 text-xs leading-5 text-[#b0b1ac]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#d9ddd8]" />
        <p>Si clasificas, la partida se asociará al ranking de preventa.</p>
      </div>
    </aside>
  );
}
