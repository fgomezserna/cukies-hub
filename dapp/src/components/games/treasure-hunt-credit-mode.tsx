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

function ownCukieCopy(access: ReturnType<typeof useTreasureHuntCreditAccess>) {
  const availability = access.ownCukieAvailability;
  if (!access.walletConnected) {
    return {
      value: 'Conecta tu wallet',
      detail: 'Consulta tus Cukies elegibles antes de jugar',
    };
  }
  if (access.isLoading) {
    return {
      value: 'Comprobando Cukies…',
      detail: 'Estamos consultando tus Cukies para mostrar el saldo del periodo',
    };
  }
  if (access.isError) {
    return {
      value: 'No disponible',
      detail: 'No hemos podido verificar tus Cukies. Puedes volver a intentarlo',
    };
  }
  if (
    !availability
    || (availability.status !== 'ready' && availability.status !== 'partial')
    || availability.totalGamesRemaining === null
    || availability.eligibleCukies === null
    || !availability.periodId
    || !availability.periodStartsAt
    || !availability.periodEndsAt
  ) {
    return {
      value: 'No verificado · Cukies',
      detail: 'Estamos consultando tus Cukies. Puedes volver a intentarlo',
    };
  }
  const periodStartsAt = new Date(availability.periodStartsAt);
  const periodEndsAt = new Date(availability.periodEndsAt);
  if (
    !Number.isFinite(periodStartsAt.getTime())
    || !Number.isFinite(periodEndsAt.getTime())
    || periodEndsAt.getTime() <= periodStartsAt.getTime()
  ) {
    return {
      value: 'No verificado · Cukies',
      detail: 'Estamos consultando tus Cukies. Puedes volver a intentarlo',
    };
  }
  const eligible = availability.eligibleCukies ?? 0;
  const renewal = new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(periodEndsAt);
  if (availability.status === 'partial') {
    const pending = availability.unknownCukies;
    return {
      value: `Al menos ${availability.totalGamesRemaining} partida${availability.totalGamesRemaining === 1 ? '' : 's'}`,
      detail: `${availability.eligibleCukies} Cukie${availability.eligibleCukies === 1 ? '' : 's'} disponibles · ${pending} pendiente${pending === 1 ? '' : 's'} de comprobar · renueva ${renewal} UTC`,
    };
  }
  return {
    value: `${availability.totalGamesRemaining} partida${availability.totalGamesRemaining === 1 ? '' : 's'}`,
    detail: `${eligible} Cukie${eligible === 1 ? '' : 's'} elegible${eligible === 1 ? '' : 's'} · renueva ${renewal} UTC`,
  };
}

export function TreasureHuntCreditModeBanner() {
  const access = useTreasureHuntCreditAccess();
  const ownCopy = ownCukieCopy(access);
  const creditUnavailable = access.isError;
  const creditBlocked = access.blocked && !creditUnavailable;
  const selectedSource = access.canPlay && !access.blocked ? access.creditSource : null;
  const waitingForRun = access.availabilityReason === 'run_pending';
  const costLabel = creditUnavailable
    ? 'No verificado'
    : access.costCredits === null
      ? '—'
      : `${access.costCredits} créditos`;
  const balanceLabel = !access.walletConnected
    ? 'Conecta tu wallet'
    : creditUnavailable
      ? 'No verificado'
      : creditBlocked
        ? 'Bloqueado temporalmente'
    : access.ownAvailableCredits === null
      ? '—'
      : `${access.ownAvailableCredits} personales`;
  const sourceLabel = creditUnavailable
    ? 'No verificado'
    : creditBlocked
      ? 'Acceso bloqueado'
    : selectedSource === 'own'
    ? 'Personal · con ranking'
    : selectedSource === 'pool'
      ? 'Pool · con ranking'
      : waitingForRun
        ? 'Reparto pendiente'
        : 'Sin saldo suficiente';
  const sourceDetail = creditUnavailable
    ? 'No se ha confirmado el saldo'
    : creditBlocked
      ? 'No se confirmará ninguna fuente mientras siga bloqueado'
    : selectedSource === 'own'
    ? 'Premio directo · cuenta en la semana'
    : selectedSource === 'pool'
      ? 'Sí entra en la semana'
      : waitingForRun
        ? 'Esperando créditos confirmados'
        : 'No se iniciará la partida';
  const nextGameCopy = !access.walletConnected
    ? 'Conecta tu wallet para ver qué créditos se usarán y si la partida entrará en el ranking.'
    : creditUnavailable
      ? 'No hemos podido comprobar el saldo. No se iniciará ni cobrará ninguna partida mientras siga sin estar disponible.'
    : creditBlocked
      ? 'El acceso con créditos está temporalmente bloqueado. No se iniciará ni cobrará ninguna partida hasta resolver la incidencia.'
    : access.isLoading
      ? 'Estamos comprobando qué saldo se utilizará en tu próxima partida.'
      : selectedSource === 'pool'
        ? `Se usarán ${access.costCredits} créditos del pool y tu resultado sí entrará en el ranking semanal.`
        : selectedSource === 'own'
          ? `Se descontarán ${access.costCredits} créditos personales. Recibirás el reparto directo y tu mejor puntuación contará en el ranking semanal.`
          : waitingForRun
            ? 'El reparto de créditos del periodo aún no está abierto. No se iniciará ni cobrará ninguna partida hasta confirmarlo.'
            : 'No hay una fuente con saldo suficiente para crear la partida.';
  const contributedDetail = creditUnavailable
    ? 'No se ha podido verificar el reparto'
    : creditBlocked
      ? 'Reparto temporalmente bloqueado; no se reservará ninguna partida'
    : access.poolContributedCredits === null
      ? 'Reparto no disponible'
      : access.poolContributedCredits > 0
        ? `${access.poolContributedCredits} aportados al pool este periodo`
        : 'Nada aportado al pool este periodo';

  return (
    <section
      aria-labelledby="treasure-hunt-credit-mode-title"
      className="overflow-hidden rounded-[8px] border border-[var(--uki-lilac-border)] bg-[#0d0914]/94 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
    >
      <div className="grid gap-4 px-5 py-4 sm:px-6 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.4fr)] lg:items-center xl:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.55fr)_auto]">
        <div className="min-w-0 border-l-2 border-[var(--uki-lilac)] pl-4">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--uki-lilac)]">
            Partidas semanales · Créditos
          </p>
          <h2
            id="treasure-hunt-credit-mode-title"
            className="mt-1 font-headline text-xl font-black text-[#f2eee7]"
          >
            Juega con tus créditos
          </h2>
          <p className="mt-1 max-w-md text-xs font-semibold leading-relaxed text-[#aaa8a2]">
            {nextGameCopy}
          </p>
        </div>

        <dl className="grid overflow-hidden rounded-[7px] border border-[var(--uki-lilac-border)] bg-black/10 sm:grid-cols-2 sm:divide-x sm:divide-[var(--uki-lilac-border)] lg:grid-cols-4">
          <CreditMetric label="Coste" value={costLabel} detail="Al iniciar" />
          <CreditMetric
            label="Tus créditos"
            value={access.isLoading ? 'Comprobando…' : balanceLabel}
            detail={access.walletConnected ? contributedDetail : 'Conecta para consultarlo'}
          />
          <CreditMetric label="Próxima partida" value={sourceLabel} detail={sourceDetail} />
          <CreditMetric label="Cukies propios" value={ownCopy.value} detail={ownCopy.detail} />
        </dl>

        <div className="grid grid-cols-2 gap-2 lg:col-span-2 xl:col-span-1 xl:grid-cols-1 2xl:grid-cols-2">
          <Link
            href="/games/treasure-hunt/rankings"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[6px] border border-[var(--uki-lilac-border)] px-3 text-xs font-black text-[var(--uki-cream)] transition-colors hover:border-[var(--uki-lilac)] hover:text-[var(--uki-lilac)] active:scale-[0.98]"
          >
            <ClockCounterClockwise className="h-4 w-4" weight="bold" aria-hidden="true" />
            Ver semana actual
          </Link>
          <Link
            href="/credits"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[6px] border border-[var(--uki-lilac)]/55 bg-[var(--uki-lilac)] px-3 text-xs font-black text-[#120716] transition-transform hover:brightness-110 active:scale-[0.98]"
          >
            Gestionar créditos
            <ArrowRight className="h-4 w-4" weight="bold" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {creditUnavailable || creditBlocked ? (
        <div role="alert" className="flex items-start gap-3 border-t border-amber-300/25 bg-amber-300/10 px-5 py-3 text-sm font-semibold text-amber-100">
          <Warning className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" weight="bold" aria-hidden="true" />
          {creditUnavailable
            ? 'No hemos podido comprobar el saldo. No se iniciará ni cobrará ninguna partida mientras siga sin estar disponible.'
            : 'El acceso con créditos está temporalmente bloqueado. No se iniciará ni cobrará ninguna partida hasta resolver la incidencia.'}
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
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-[var(--uki-lilac-border)] px-4 py-3.5 last:border-b-0">
      <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-full border border-[var(--uki-lilac)]/35 bg-[var(--uki-lilac)]/10 text-[var(--uki-lilac)]">
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
  const ownCopy = ownCukieCopy(access);
  const creditUnavailable = access.isError;
  const creditBlocked = access.blocked && !creditUnavailable;
  const waitingForRun = access.availabilityReason === 'run_pending';
  const connectedUnavailable = access.walletConnected && (
    access.isLoading || access.isError || access.blocked || !access.ready
  );
  const disabled = connectedUnavailable || (access.walletConnected && !access.canPlay);
  const selectedSource = access.canPlay && !access.blocked ? access.creditSource : null;
  const isPoolGame = !creditUnavailable && selectedSource === 'pool';
  const isRankedGame = !creditUnavailable && (selectedSource === 'own' || isPoolGame);
  const modeLabel = isPoolGame
    ? 'Competición semanal'
    : selectedSource === 'own'
      ? 'Partida individual'
      : 'Acceso con créditos';
  const actionLabel = !access.walletConnected
    ? 'Conectar wallet para jugar'
    : access.isLoading
      ? 'Comprobando tus créditos'
      : access.isError || access.blocked || !access.ready
        ? 'Créditos no disponibles'
        : waitingForRun
          ? 'Reparto de créditos pendiente'
          : access.canPlay
            ? isPoolGame
              ? `Competir con ${access.costCredits} créditos del pool`
              : `Jugar con ${access.costCredits} créditos personales`
            : `Te faltan ${access.missingCredits} créditos`;
  const introCopy = !access.walletConnected
    ? 'Conecta tu wallet para comprobar el coste, el saldo y si la partida entra en el ranking.'
    : creditUnavailable
      ? 'No hemos podido comprobar tus créditos. No se iniciará ni cobrará ninguna partida hasta confirmar el saldo.'
    : access.isLoading
      ? 'Estamos comprobando qué créditos se utilizarán en tu próxima partida.'
      : creditBlocked
        ? 'El acceso con créditos está temporalmente bloqueado. No se reservará ni cobrará ninguna partida hasta resolver la incidencia.'
      : isPoolGame
        ? 'Tu próxima partida usará créditos del pool: genera reparto directo y sí compite en el ranking semanal.'
        : selectedSource === 'own'
          ? 'Tu próxima partida usará créditos personales: genera reparto directo y también compite en el ranking semanal.'
          : waitingForRun
            ? 'El reparto de créditos del periodo aún no está abierto. Espera a que el Hub confirme lotes utilizables.'
            : 'No hay saldo suficiente para crear una nueva partida.';

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-[8px] border border-[var(--uki-lilac-border)] bg-[#0d0914]/94 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--uki-lilac)]">
        {modeLabel}
      </p>
      <h2 className="mt-1.5 font-headline text-2xl font-black text-[#f2eee7]">
        Juega con créditos
      </h2>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-[#aaa8a2]">
        {introCopy}
      </p>

      <dl className="mt-5 overflow-hidden rounded-[8px] border border-[var(--uki-lilac-border)] bg-black/10">
        <SidebarRow
          icon={<Coin className="h-4 w-4" weight="fill" aria-hidden="true" />}
          label="Coste"
          value={access.costCredits === null ? 'Pendiente de consultar' : `${access.costCredits} créditos`}
          detail="Se reservan al iniciar y se descuentan al confirmar la partida"
        />
        <SidebarRow
          icon={access.isLoading
            ? <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" aria-hidden="true" />
            : <GameController className="h-4 w-4" weight="fill" aria-hidden="true" />}
          label="Tus créditos personales"
          value={!access.walletConnected
            ? 'Conecta tu wallet'
            : creditUnavailable
              ? 'No verificado'
              : creditBlocked
                ? 'Bloqueados temporalmente'
            : access.ownAvailableCredits === null
              ? 'No disponible'
              : `${access.ownAvailableCredits} créditos`}
          detail={creditUnavailable
            ? 'No se ha podido verificar el saldo ni el reparto'
            : creditBlocked
              ? 'El saldo queda visible como referencia, pero no puede reservarse durante la incidencia'
            : access.poolContributedCredits === null
              ? access.reservedCredits === null
                ? 'Reparto no disponible'
                : access.reservedCredits > 0
                  ? `${access.reservedCredits} reservados en partidas abiertas`
                  : 'Reparto no disponible'
              : access.poolContributedCredits > 0
                ? `${access.poolContributedCredits} aportados al pool este periodo`
                : access.reservedCredits
                  ? `${access.reservedCredits} reservados en partidas abiertas`
                  : 'Saldo libre en este momento'}
        />
        <SidebarRow
          icon={<Trophy className="h-4 w-4" weight="fill" aria-hidden="true" />}
          label="Ranking de esta partida"
          value={creditUnavailable
            ? 'Pendiente de comprobar'
            : creditBlocked
              ? 'No confirmado'
            : isRankedGame
              ? 'Sí, esta partida cuenta'
              : 'No entra en la clasificación'}
          detail={creditUnavailable
            ? 'No se ha confirmado la fuente de créditos'
            : creditBlocked
              ? 'La fuente y la participación en ranking se confirmarán cuando se desbloquee el acceso'
            : isPoolGame
              ? `${access.poolAvailableCredits ?? 0} créditos disponibles en el pool compartido`
              : selectedSource === 'own'
                ? 'Tus créditos personales también cuentan en la semana'
                : 'El sistema utiliza primero tus créditos personales'}
        />
        <SidebarRow
          icon={<Stack className="h-4 w-4" weight="fill" aria-hidden="true" />}
          label="Cukie de la partida"
          value={creditBlocked ? 'Pendiente de confirmar' : 'Se asigna al empezar'}
          detail={creditBlocked ? 'Se asignará cuando el acceso con créditos esté disponible' : 'Se usa uno propio o disponible en el pool'}
        />
        <SidebarRow
          icon={<Stack className="h-4 w-4" weight="fill" aria-hidden="true" />}
          label="Partidas con Cukies propios"
          value={ownCopy.value}
          detail={ownCopy.detail}
        />
      </dl>

      <button
        type="button"
        onClick={onStartSinglePlayer}
        disabled={disabled}
        className="mt-5 inline-flex min-h-[54px] w-full items-center justify-center gap-3 rounded-[7px] border border-[var(--uki-lilac)] bg-[var(--uki-lilac)] px-4 text-sm font-black uppercase text-[#120716] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_22px_rgba(228,92,255,0.16)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-[var(--uki-lilac-border)] disabled:bg-[var(--uki-lilac-soft)] disabled:text-[var(--uki-muted)] disabled:shadow-none"
      >
        {actionLabel}
        {!access.isLoading ? <ArrowRight className="h-5 w-5" weight="bold" aria-hidden="true" /> : null}
      </button>

      {access.walletConnected && !access.isLoading && !access.isError && access.blocked ? (
        <p role="status" className="mt-3 text-center text-xs font-semibold leading-relaxed text-[#969994]">
          El acceso con créditos está temporalmente bloqueado. No se reservará ni cobrará ninguna partida hasta que el Hub confirme que la incidencia está resuelta.
        </p>
      ) : access.walletConnected && !access.isLoading && !access.isError && !access.blocked && !access.canPlay && waitingForRun ? (
        <p role="status" className="mt-3 text-center text-xs font-semibold leading-relaxed text-[#969994]">
          El reparto del periodo sigue en preparación. No se reservará ni cobrará ninguna partida hasta que exista un lote abierto y utilizable.
        </p>
      ) : access.walletConnected && !access.isLoading && !access.isError && !access.blocked && !access.canPlay ? (
        <p role="status" className="mt-3 text-center text-xs font-semibold leading-relaxed text-[#969994]">
          Necesitas créditos disponibles para iniciar. No se iniciará ni cobrará una partida mientras el saldo sea insuficiente.
        </p>
      ) : null}

      <Link href="/credits" className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 text-sm font-black text-[var(--uki-lilac)] hover:text-[var(--uki-cream)]">
        Gestionar créditos <ArrowRight className="h-4 w-4" weight="bold" aria-hidden="true" />
      </Link>
      <Link href="/games/treasure-hunt/rankings" className="inline-flex min-h-10 items-center justify-center gap-2 text-sm font-semibold text-[#aaa8a2] hover:text-[var(--uki-lilac)]">
        Ver competición semanal <ClockCounterClockwise className="h-4 w-4" weight="bold" aria-hidden="true" />
      </Link>
    </aside>
  );
}
