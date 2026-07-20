'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  formatTreasureHuntPercentage,
  TREASURE_HUNT_FALLBACK_RULES,
  useTreasureHuntCompetitionOverview,
} from '@/hooks/use-treasure-hunt-competition-overview';

interface TreasureHuntCompetitionBannerProps {
  readonly children: ReactNode;
}
export default function TreasureHuntCompetitionBanner({
  children,
}: TreasureHuntCompetitionBannerProps) {
  const { status, leaderboard } = useTreasureHuntCompetitionOverview();
  const rules = status?.campaign ?? TREASURE_HUNT_FALLBACK_RULES;
  const attempts = leaderboard.filter((entry) => entry.isMe).length;

  return (
    <Sheet>
      <aside
        aria-labelledby="treasure-hunt-competition-banner-title"
        className="overflow-hidden rounded-[8px] border border-white/20 bg-[#071312]/94"
      >
        <div className="flex min-h-[42px] items-center gap-3 border-b border-white/15 px-4">
          <span aria-hidden="true" className="text-[#35eee2]">▣</span>
          <h2
            id="treasure-hunt-competition-banner-title"
            className="font-mono text-[10px] font-black uppercase tracking-[0.15em] text-[#35eee2]"
          >
            Competición activa · Torneo de Preventa UKI
          </h2>
        </div>

        <div className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center">
          <div className="flex items-center gap-3 border-r border-white/15 pr-4">
            <span aria-hidden="true" className="text-xl text-[#edb94e]">⚔</span>
            <div>
              <p className="font-headline text-lg font-black text-[#f2eee7]">1P</p>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#969994]">Modo activo</p>
            </div>
          </div>
          <div className="flex items-center gap-3 border-r border-white/15 pr-4">
            <span aria-hidden="true" className="text-xl text-[#edb94e]">◎</span>
            <div>
              <p className="font-mono text-lg font-black text-[#f2eee7]">{attempts}/{rules.maxWinningAttemptsPerWallet}</p>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#969994]">Partidas computables</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#edb94e] text-xs text-[#edb94e]">%</span>
            <div>
              <p className="font-mono text-lg font-black text-[#f2eee7]">{formatTreasureHuntPercentage(rules.poolBps)}</p>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#969994]">Pool</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/games/treasure-hunt/rules" className="inline-flex min-h-11 items-center gap-2 rounded-[6px] border border-white/20 px-4 text-sm font-semibold text-[#35eee2] hover:border-[#35eee2]/55">
              Ver reglas <span aria-hidden="true">→</span>
            </Link>
            <SheetTrigger asChild>
              <button type="button" className="inline-flex min-h-11 items-center rounded-[6px] border border-white/20 px-3 text-xs font-semibold text-[#d3d4cf] hover:border-[#35eee2]/55 hover:text-white">
                Mi participación
              </button>
            </SheetTrigger>
          </div>
        </div>
      </aside>

      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-l border-white/15 bg-[#04100f] p-4 text-[#f2eee7] sm:max-w-3xl sm:p-6"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Competición oficial de preventa UKI</SheetTitle>
          <SheetDescription>Reglas, nombre público y ranking de Treasure Hunt.</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
