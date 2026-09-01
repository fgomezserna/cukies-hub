'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock3, Coins, Medal } from 'lucide-react';

import { useTreasureHuntWeeklyOverview } from '@/hooks/use-treasure-hunt-weekly-overview';
import { formatTreasureHuntUkiRaw } from '@/lib/treasure-hunt-prize-pool';

function rewardCopy(status: 'processing' | 'allocated' | 'blocked' | 'not_applicable', amountRaw: string | null) {
  if (status === 'allocated') return amountRaw === '0' ? 'Sin importe directo' : formatTreasureHuntUkiRaw(amountRaw, 6);
  if (status === 'blocked') return 'Pendiente de revisión';
  if (status === 'processing') return 'Calculándose';
  return 'No aplicable';
}

export default function TreasureHuntLatestResult() {
  const { data, isLoading } = useTreasureHuntWeeklyOverview({ pageSize: 1 });
  const result = data?.latestResult;
  if (isLoading || !result) return null;

  const completed = result.status === 'settled';
  return (
    <section aria-labelledby="treasure-hunt-latest-result-title" className="overflow-hidden rounded-[8px] border border-[#b68b3c]/55 bg-[#061110]/94">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#35eee2]">Resultado confirmado</p>
          <h2 id="treasure-hunt-latest-result-title" className="mt-1 font-headline text-xl font-black text-[#f2eee7]">Tu última partida</h2>
          <p className="mt-1 text-sm text-[#aaa8a2]">{completed ? 'La partida quedó registrada y su reparto está ligado a este resultado.' : 'La partida se cerró sin puntuación ni recompensa.'}</p>
        </div>
        <Link href="/premios" className="inline-flex min-h-10 items-center gap-2 rounded-[6px] border border-white/20 px-3.5 text-xs font-black text-[#f2eee7] hover:border-[#35eee2]/55">Ver mis premios <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <dl className="grid border-t border-white/15 sm:grid-cols-5 sm:divide-x sm:divide-white/15">
        <div className="px-4 py-3.5"><dt className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#969994]"><CheckCircle2 className="h-3.5 w-3.5 text-[#35eee2]" /> Puntuación</dt><dd className="mt-1 font-mono text-lg font-black text-[#35eee2]">{Number(result.scoreRaw).toLocaleString('es-ES')}</dd></div>
        <div className="px-4 py-3.5"><dt className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#969994]"><Coins className="h-3.5 w-3.5 text-[#ffc240]" /> Créditos usados</dt><dd className="mt-1 text-sm font-black text-[#f2eee7]">{result.creditSource === 'own' ? 'Propios' : 'Del pool'}</dd></div>
        <div className="px-4 py-3.5"><dt className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#969994]"><Medal className="h-3.5 w-3.5 text-[#35eee2]" /> Ranking semanal</dt><dd className="mt-1 text-sm font-black text-[#f2eee7]">{result.leaderboardEligible ? 'Sí, esta partida cuenta' : 'No cuenta'}</dd></div>
        <div className="px-4 py-3.5"><dt className="text-[10px] font-black uppercase tracking-[0.1em] text-[#969994]">Cukie asignado</dt><dd className="mt-1 text-sm font-black text-[#f2eee7]">{result.cukieSource === 'own' ? 'Propio' : 'Del pool'}</dd><p className="mt-0.5 text-[11px] text-[#969994]">{result.cukieGeneration} · {result.cukieRarity}</p></div>
        <div className="px-4 py-3.5"><dt className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#969994]"><Clock3 className="h-3.5 w-3.5 text-[#ffc240]" /> Recompensa directa</dt><dd className="mt-1 text-sm font-black text-[#ffc240]">{rewardCopy(result.reward.status, result.reward.amountRaw)}</dd><p className="mt-0.5 text-[11px] text-[#969994]">{result.reward.status === 'processing' ? 'Se actualizará automáticamente' : 'Importe asignado al jugador'}</p></div>
      </dl>
      {!result.leaderboardEligible && completed ? <p className="border-t border-white/10 px-5 py-3 text-xs text-[#aaa8a2]">Esta partida sí genera reparto directo. No entra en el ranking porque usó créditos propios; para competir semanalmente deben usarse créditos del pool.</p> : null}
    </section>
  );
}
