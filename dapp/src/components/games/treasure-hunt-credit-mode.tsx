'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ClockCounterClockwise,
  Coin,
  GameController,
  SpinnerGap,
  Stack,
  Trophy,
  Warning,
} from '@phosphor-icons/react';

import { useTreasureHuntCreditAccess } from '@/hooks/use-treasure-hunt-credit-access';

function CreditMetric({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}) {
  return (
    <div className="min-w-0 px-3 py-2.5 sm:px-4">
      <dt className="text-[9px] font-black uppercase tracking-[0.14em] text-[#969994]">
        {label}
      </dt>
      <dd className="mt-0.5 font-headline text-base font-black tabular-nums text-[#f2eee7]">
        {value}
      </dd>
      <p className="mt-0.5 text-[11px] font-semibold leading-snug text-[#969994]">{detail}</p>
    </div>
  );
}

export function TreasureHuntCreditModeBanner() {
  const access = useTreasureHuntCreditAccess();
  const costLabel = access.costCredits === null ? '—' : `${access.costCredits} créditos`;
  const balanceLabel = !access.walletConnected
    ? 'Conecta tu wallet'
    : access.availableCredits === null
      ? '—'
      : `${access.availableCredits} créditos`;

  return (
    <section
      aria-labelledby="treasure-hunt-credit-mode-title"
      className="overflow-hidden rounded-[8px] border border-[#b68b3c]/55 bg-[#061110]/94 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
    >
      <div className="grid gap-4 px-5 py-4 sm:px-6 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.4fr)] lg:items-center xl:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.55fr)_auto]">
        <div className="min-w-0 border-l-2 border-[#35eee2] pl-4">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#35eee2]">
            Partidas semanales · Créditos
          </p>
          <h2
            id="treasure-hunt-credit-mode-title"
            className="mt-1 font-headline text-xl font-black text-[#f2eee7]"
          >
            Juega con tus créditos
          </h2>
          <p className="mt-1 max-w-md text-xs font-semibold leading-relaxed text-[#aaa8a2]">
            Todas generan reparto; con créditos del pool también compites esta semana.
          </p>
        </div>

        <dl className="grid overflow-hidden rounded-[7px] border border-white/15 bg-black/10 sm:grid-cols-3 sm:divide-x sm:divide-white/15">
          <CreditMetric label="Coste" value={costLabel} detail="Al iniciar" />
          <CreditMetric
            label="Saldo para jugar"
            value={access.isLoading ? 'Comprobando…' : balanceLabel}
            detail={access.walletConnected ? 'Disponible ahora' : 'Conecta para consultarlo'}
          />
          <CreditMetric label="Cukie" value="Automático" detail="Propio o del pool" />
        </dl>

        <div className="grid grid-cols-2 gap-2 lg:col-span-2 xl:col-span-1 xl:grid-cols-1 2xl:grid-cols-2">
          <Link
            href="/games/treasure-hunt/rankings"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[6px] border border-white/20 px-3 text-xs font-black text-[#f2eee7] transition-colors hover:border-[#35eee2]/55 hover:text-[#35eee2] active:scale-[0.98]"
          >
            <ClockCounterClockwise className="h-4 w-4" weight="bold" aria-hidden="true" />
            Ver semana actual
          </Link>
          <Link
            href="/credits"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[6px] border border-[#35eee2]/55 bg-[#0d5d57] px-3 text-xs font-black text-white transition-transform hover:bg-[#137069] active:scale-[0.98]"
          >
            Gestionar créditos
            <ArrowRight className="h-4 w-4" weight="bold" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {access.isError ? (
        <div role="alert" className="flex items-start gap-3 border-t border-amber-300/25 bg-amber-300/10 px-5 py-3 text-sm font-semibold text-amber-100">
          <Warning className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" weight="bold" aria-hidden="true" />
          No hemos podido comprobar el saldo. No se iniciará ni cobrará ninguna partida mientras siga sin estar disponible.
        </div>
      ) : null}
    </section>
  );
}

function SidebarRow({
  icon,
  label,
  value,
  detail,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-white/10 px-4 py-3.5 last:border-b-0">
      <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-full border border-[#35eee2]/35 bg-[#35eee2]/10 text-[#35eee2]">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-[#969994]">{label}</dt>
        <dd className="mt-0.5 text-sm font-black text-[#f2eee7]">{value}</dd>
        <p className="mt-0.5 text-[11px] font-semibold leading-snug text-[#969994]">{detail}</p>
      </div>
    </div>
  );
}

export function TreasureHuntCreditModeSidebar({
  onStartSinglePlayer,
}: {
  readonly onStartSinglePlayer: () => void;
}) {
  const access = useTreasureHuntCreditAccess();
  const connectedUnavailable = access.walletConnected && (
    access.isLoading || access.isError || access.blocked || !access.ready
  );
  const disabled = connectedUnavailable || (access.walletConnected && !access.canPlay);
  const actionLabel = !access.walletConnected
    ? 'Conectar wallet para jugar'
    : access.isLoading
      ? 'Comprobando tus créditos'
      : access.isError || access.blocked || !access.ready
        ? 'Créditos no disponibles'
        : access.canPlay
          ? `Jugar por ${access.costCredits} créditos`
          : `Te faltan ${access.missingCredits} créditos`;

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-[8px] border border-[#b68b3c]/55 bg-[#061110]/94 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#35eee2]">
        Partida individual
      </p>
      <h2 className="mt-1.5 font-headline text-2xl font-black text-[#f2eee7]">
        Juega con créditos
      </h2>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-[#aaa8a2]">
        Cada partida genera reparto. Solo las que usan créditos del pool entran también en el ranking semanal.
      </p>

      <dl className="mt-5 overflow-hidden rounded-[8px] border border-white/15 bg-black/10">
        <SidebarRow
          icon={<Coin className="h-4 w-4" weight="fill" aria-hidden="true" />}
          label="Coste"
          value={access.costCredits === null ? 'Pendiente de consultar' : `${access.costCredits} créditos`}
          detail="Solo se descuentan si la partida queda creada"
        />
        <SidebarRow
          icon={access.isLoading
            ? <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" aria-hidden="true" />
            : <GameController className="h-4 w-4" weight="fill" aria-hidden="true" />}
          label="Disponibles para jugar"
          value={!access.walletConnected
            ? 'Conecta tu wallet'
            : access.availableCredits === null
              ? 'No disponible'
              : `${access.availableCredits} créditos`}
          detail={access.reservedCredits
            ? `${access.reservedCredits} reservados en partidas abiertas`
            : 'Saldo libre en este momento'}
        />
        <SidebarRow
          icon={<Stack className="h-4 w-4" weight="fill" aria-hidden="true" />}
          label="Cukie"
          value="Se asigna al empezar"
          detail="Se usa uno propio o disponible en el pool"
        />
        <SidebarRow
          icon={<Trophy className="h-4 w-4" weight="fill" aria-hidden="true" />}
          label="Resultado"
          value="Recompensa confirmada al terminar"
          detail="El ranking depende del origen de los créditos"
        />
      </dl>

      <button
        type="button"
        onClick={onStartSinglePlayer}
        disabled={disabled}
        className="mt-5 inline-flex min-h-[54px] w-full items-center justify-center gap-3 rounded-[7px] border border-[#47f4e9] bg-[linear-gradient(180deg,#1ca9a2,#0e6d68)] px-4 text-sm font-black uppercase text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/5 disabled:text-[#969994] disabled:shadow-none"
      >
        {actionLabel}
        {!access.isLoading ? <ArrowRight className="h-5 w-5" weight="bold" aria-hidden="true" /> : null}
      </button>

      {access.walletConnected && !access.isLoading && !access.isError && !access.blocked && !access.canPlay ? (
        <p role="status" className="mt-3 text-center text-xs font-semibold leading-relaxed text-[#969994]">
          Necesitas créditos disponibles para iniciar. Puedes conservar más en el próximo reparto diario.
        </p>
      ) : null}

      <Link href="/credits" className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 text-sm font-black text-[#35eee2] hover:text-white">
        Gestionar créditos <ArrowRight className="h-4 w-4" weight="bold" aria-hidden="true" />
      </Link>
      <Link href="/games/treasure-hunt/rankings" className="inline-flex min-h-10 items-center justify-center gap-2 text-sm font-semibold text-[#aaa8a2] hover:text-white">
        Ver competición semanal <ClockCounterClockwise className="h-4 w-4" weight="bold" aria-hidden="true" />
      </Link>
    </aside>
  );
}
