'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Flag,
  Gamepad2,
  Info,
  LockKeyhole,
  Medal,
  Timer,
  Trophy,
  UserRound,
} from 'lucide-react';

import {
  TREASURE_HUNT_FALLBACK_RULES,
  useTreasureHuntCompetitionOverview,
} from '@/hooks/use-treasure-hunt-competition-overview';
import { cn } from '@/lib/utils';

interface PlayerRanking {
  readonly alias: string;
  readonly attempts: number;
  readonly bestScore: number;
  readonly reviewStatus: 'pending' | 'approved';
  readonly isMe: boolean;
}

function Position({ rank }: { readonly rank: number }) {
  if (rank > 3) return <span className="pl-2 font-mono text-sm text-[#efeee9]">{rank}</span>;
  const tones = [
    'border-[#ffc33d] bg-[#8a5e05] text-[#fff2b7]',
    'border-[#c4c9ca] bg-[#50585a] text-white',
    'border-[#cf864d] bg-[#65391e] text-[#ffd7ba]',
  ];
  return (
    <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-full border-2 font-mono text-xs font-black shadow-[inset_0_0_0_2px_rgba(0,0,0,0.22)]', tones[rank - 1])}>
      {rank}
    </span>
  );
}

function RankingSideItem({
  title,
  subtitle,
  active = false,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly active?: boolean;
}) {
  return (
    <div className={cn(
      'grid min-h-[82px] grid-cols-[54px_1fr_auto] items-center gap-3 rounded-[7px] border p-3',
      active
        ? 'border-[#d4a149]/55 bg-[#0b1917]'
        : 'border-white/15 bg-[#081312] text-[#8c918d]',
    )}>
      {active ? (
        <Image src="/brand/official/uki-token-cukies-world-coin.png" alt="" width={50} height={50} className="h-[50px] w-[50px] object-contain" />
      ) : (
        <span className="inline-flex h-[50px] w-[50px] items-center justify-center rounded-full border border-white/10 bg-[#101917]">
          <LockKeyhole className="h-6 w-6" />
        </span>
      )}
      <span className="min-w-0">
        <span className={cn('block truncate text-sm font-semibold', active && 'text-[#efeee9]')}>{title}</span>
        <span className="mt-1 block text-xs text-[#939691]">{subtitle}</span>
      </span>
      {active ? <ArrowRight className="h-5 w-5 text-[#35eee2]" /> : null}
    </div>
  );
}

export default function TreasureHuntRankingsView() {
  const { status, leaderboard, isLoading, error, reload } =
    useTreasureHuntCompetitionOverview();
  const rules = status?.campaign ?? TREASURE_HUNT_FALLBACK_RULES;
  const isActive = status?.phase === 'active';

  const players = useMemo<readonly PlayerRanking[]>(() => {
    const grouped = new Map<string, PlayerRanking>();
    for (const entry of leaderboard) {
      const key = entry.alias.toLocaleLowerCase('es');
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, {
          alias: entry.alias,
          attempts: 1,
          bestScore: entry.score,
          reviewStatus: entry.reviewStatus,
          isMe: entry.isMe,
        });
        continue;
      }
      grouped.set(key, {
        ...current,
        attempts: current.attempts + 1,
        bestScore: Math.max(current.bestScore, entry.score),
        reviewStatus:
          current.reviewStatus === 'approved' || entry.reviewStatus === 'approved'
            ? 'approved'
            : 'pending',
        isMe: current.isMe || entry.isMe,
      });
    }
    return [...grouped.values()].sort((a, b) => b.bestScore - a.bestScore);
  }, [leaderboard]);

  const topPlayers = players.slice(0, 5);
  const myPlayer = players.find((player) => player.isMe) ?? null;
  const myRank = myPlayer ? players.indexOf(myPlayer) + 1 : null;
  const showSeparateMe = !myPlayer || (myRank !== null && myRank > 5);

  return (
    <div className="min-h-full">
      <div className="mb-4">
        <h2 className="font-headline text-2xl font-black tracking-[-0.025em] text-[#f2eee7]">
          Rankings de Treasure Hunt
        </h2>
        <p className="mt-1 text-sm text-[#aaa8a2]">
          Cada clasificación pertenece a una competición concreta.
        </p>
      </div>

      {error ? (
        <div role="alert" className="mb-4 flex items-center justify-between gap-4 rounded-[7px] border border-red-300/30 bg-red-950/25 px-4 py-3 text-sm text-red-100">
          <span>{error}</span>
          <button type="button" onClick={reload} className="font-bold text-[#35eee2]">Reintentar</button>
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_270px]">
        <main className="overflow-hidden rounded-[8px] border border-[#b68b3c]/55 bg-[#061110]/94">
          <header className="border-b border-white/15 px-5 py-5">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-headline text-2xl font-black tracking-[-0.02em] text-[#f1eee8]">
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

            <dl className="mt-5 grid grid-cols-2 divide-x divide-white/15 sm:grid-cols-4">
              {[
                { label: 'Modo', value: '1P', Icon: UserRound },
                { label: 'Máximo', value: `${rules.maxWinningAttemptsPerWallet} partidas`, Icon: Flag },
                { label: 'Score', value: 'validado', Icon: Trophy },
                { label: 'Actualización', value: 'tras validación', Icon: Clock3 },
              ].map(({ label, value, Icon }) => (
                <div key={label} className="px-4 first:pl-0">
                  <dt className="inline-flex items-center gap-2 text-[10px] text-[#aaa8a2]">
                    <Icon className="h-5 w-5 text-[#edc27a]" /> {label}
                  </dt>
                  <dd className="mt-1 pl-7 text-sm font-semibold text-[#f0eee7]">{value}</dd>
                </div>
              ))}
            </dl>
          </header>

          <div className="hidden grid-cols-[5.5rem_1.4fr_0.8fr_1fr_1fr] border-b border-white/15 px-5 py-3 text-[10px] uppercase tracking-[0.09em] text-[#9c9e99] sm:grid">
            <span>Pos.</span>
            <span>Jugador</span>
            <span>Partidas</span>
            <span>Mejor score</span>
            <span>Estado</span>
          </div>

          {isLoading ? (
            <div aria-label="Cargando ranking" className="space-y-px bg-white/10">
              {[0, 1, 2, 3, 4].map((index) => <div key={index} className="h-[48px] animate-pulse bg-[#081413]" />)}
            </div>
          ) : topPlayers.length ? (
            <div className="divide-y divide-white/10">
              {topPlayers.map((player, index) => (
                <div
                  key={player.alias}
                  className={cn(
                    'grid min-h-[48px] grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-5 text-sm sm:grid-cols-[5.5rem_1.4fr_0.8fr_1fr_1fr] sm:gap-0',
                    player.isMe && 'bg-[#0b2927] ring-1 ring-inset ring-[#35eee2]',
                  )}
                >
                  <Position rank={index + 1} />
                  <span className="truncate font-medium text-[#f1efe9]">{player.isMe ? `TÚ · ${player.alias}` : player.alias}</span>
                  <span className="text-right text-[#babcb7] sm:text-left">{player.attempts}/{rules.maxWinningAttemptsPerWallet}</span>
                  <span className="col-start-2 font-mono font-semibold text-[#f0eee9] sm:col-auto sm:text-[#ffc240]">{player.bestScore.toLocaleString('es-ES')}</span>
                  <span className="col-start-3 row-start-2 inline-flex items-center justify-end gap-1.5 text-xs text-[#b8bbb6] sm:col-auto sm:row-auto sm:justify-start">
                    {player.reviewStatus === 'approved' ? (
                      <><CheckCircle2 className="h-4 w-4 text-[#35eee2]" /> Score validado</>
                    ) : (
                      <><Clock3 className="h-4 w-4 text-[#edc27a]" /> En revisión</>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {showSeparateMe ? (
            <div className="m-1 grid min-h-[70px] grid-cols-[54px_1fr_auto] items-center gap-3 rounded-[7px] border border-[#35eee2] bg-[#08201f] px-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-[#142522]">
                <UserRound className="h-5 w-5 text-[#d8dcda]" />
              </span>
              <span>
                <span className="font-semibold text-[#35eee2]">TÚ · Sin clasificar</span>
                <span className="mt-1 block text-xs text-[#aeb0ab]">0/{rules.maxWinningAttemptsPerWallet} partidas</span>
              </span>
              <span className="text-xs text-[#aaa8a2]">Sin clasificar</span>
            </div>
          ) : null}

          <footer className="flex flex-col gap-4 border-t border-white/15 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#edc27a]" />
              <div>
                <p className="text-sm text-[#e5e2dc]">
                  {myPlayer ? 'Tu mejor score válido determina tu posición.' : 'Completa una partida válida para entrar en la clasificación.'}
                </p>
                <p className="mt-1 text-xs text-[#9a9d98]">Los scores se añaden una vez validados.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Link href="/games/treasure-hunt" className="inline-flex min-h-11 items-center gap-3 rounded-[6px] border border-[#2de9dd]/65 bg-[#0d5d57] px-7 text-sm font-bold text-white hover:bg-[#137069]">
                <Gamepad2 className="h-4 w-4" /> Jugar torneo <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/games/treasure-hunt/rules" className="inline-flex min-h-11 items-center rounded-[6px] border border-white/20 px-5 text-sm text-[#d0d1cc] hover:border-[#35eee2]/50">
                Ver reglas
              </Link>
            </div>
          </footer>
        </main>

        <aside className="rounded-[8px] border border-white/20 bg-[#071211]/92 p-4">
          <h3 className="font-headline text-lg font-bold text-[#efeee8]">Rankings disponibles</h3>
          <div className="mt-4 space-y-3">
            <RankingSideItem title="Torneo de Preventa UKI" subtitle={isActive ? 'EN CURSO' : 'Inactivo'} active />
            <RankingSideItem title="Liga semanal UKI" subtitle="Inactivo" />
            <RankingSideItem title="Speedrun semanal" subtitle="Inactivo" />
            <RankingSideItem title="1v1" subtitle="Sin ranking" />
          </div>
        </aside>
      </div>

      <footer className="mt-4 flex flex-col gap-3 border-t border-white/15 py-4 text-[11px] text-[#9b9e99] sm:flex-row sm:items-center sm:justify-between">
        <p className="inline-flex items-center gap-2"><Info className="h-4 w-4 text-[#d4d8d2]" />Las clasificaciones se basan en tu mejor score entre tus partidas válidas.</p>
        <p className="inline-flex items-center gap-2"><Timer className="h-4 w-4 text-[#d4d8d2]" />Las horas se muestran en tu zona horaria local.</p>
      </footer>
    </div>
  );
}
