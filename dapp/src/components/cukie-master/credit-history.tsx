'use client';

import { useMemo, useState } from 'react';
import {
  ArrowCounterClockwise,
  ClockCountdown,
  Coin,
  GameController,
  SpinnerGap,
  Trophy,
  Warning,
} from '@phosphor-icons/react';

import { Panel } from '@/components/landing/primitives';

type CreditHistoryOperation =
  | 'grant'
  | 'late_compensation'
  | 'pool_deposit'
  | 'reserve'
  | 'release'
  | 'spend'
  | 'expire';

export type CreditHistoryEntry = {
  eventId: string;
  operation: CreditHistoryOperation;
  bucket: 'own' | 'pool';
  amountCredits: number;
  route: 'uki' | 'nft' | 'mixed' | null;
  slotOrdinal: number | null;
  occurredAt: string;
  expiresAt: string | null;
  periodId: string;
};

export type CreditHistoryData = {
  available: boolean;
  page: number;
  pageSize: number;
  hasMore: boolean;
  totals: {
    receivedCredits: number;
    spentCredits: number;
    poolContributedCredits: number;
    expiredCredits: number;
  } | null;
  nextExpiry: { credits: number; at: string } | null;
  entries: CreditHistoryEntry[];
};

type HistoryFilter = 'all' | 'income' | 'spent' | 'pool' | 'expired';

const HISTORY_FILTERS: Array<{ id: HistoryFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'income', label: 'Entradas' },
  { id: 'spent', label: 'Gastados' },
  { id: 'pool', label: 'Al pool' },
  { id: 'expired', label: 'Caducados' },
];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function filterMatches(entry: CreditHistoryEntry, filter: HistoryFilter) {
  if (filter === 'all') return true;
  if (filter === 'income') return entry.operation === 'grant' || entry.operation === 'late_compensation';
  if (filter === 'spent') return entry.operation === 'spend';
  if (filter === 'pool') return entry.operation === 'pool_deposit';
  return entry.operation === 'expire';
}

function sourceLabel(entry: CreditHistoryEntry) {
  const bucket = entry.bucket === 'pool' ? 'Créditos del pool' : 'Créditos personales';
  if (entry.route === 'uki') {
    return `${bucket} · Cupo UKI${entry.slotOrdinal ? ` ${entry.slotOrdinal}` : ''}`;
  }
  if (entry.route === 'nft') {
    return `${bucket} · Cupo Cukie${entry.slotOrdinal ? ` ${entry.slotOrdinal}` : ''}`;
  }
  if (entry.route === 'mixed') return `${bucket} · Varios cupos`;
  return bucket;
}

function presentation(entry: CreditHistoryEntry) {
  switch (entry.operation) {
    case 'grant':
      return {
        title: 'Créditos recibidos',
        detail: 'Generados por uno de tus cupos Cukie Master.',
        amount: `+${entry.amountCredits}`,
        amountClass: 'text-[var(--uki-lilac)]',
        icon: <Coin className="h-5 w-5" weight="fill" />,
      };
    case 'late_compensation':
      return {
        title: 'Ajuste de créditos recibido',
        detail: 'Créditos añadidos después de completar una asignación pendiente.',
        amount: `+${entry.amountCredits}`,
        amountClass: 'text-[var(--uki-lilac)]',
        icon: <ArrowCounterClockwise className="h-5 w-5" weight="bold" />,
      };
    case 'pool_deposit':
      return {
        title: 'Aportación al pool',
        detail: 'Esta parte de tu reparto diario se destinó a partidas de competición.',
        amount: `${entry.amountCredits} al pool`,
        amountClass: 'text-[var(--uki-cream)]',
        icon: <Trophy className="h-5 w-5" weight="fill" />,
      };
    case 'reserve':
      return {
        title: 'Partida preparada',
        detail: 'Los créditos quedaron reservados mientras se completaba la partida.',
        amount: `${entry.amountCredits} reservados`,
        amountClass: 'text-[var(--uki-cream)]',
        icon: <GameController className="h-5 w-5" weight="fill" />,
      };
    case 'release':
      return {
        title: 'Reserva devuelta',
        detail: 'La partida no consumió estos créditos y volvieron a estar disponibles.',
        amount: `+${entry.amountCredits}`,
        amountClass: 'text-[var(--uki-lilac)]',
        icon: <ArrowCounterClockwise className="h-5 w-5" weight="bold" />,
      };
    case 'spend':
      return {
        title: 'Partida jugada',
        detail: 'La partida quedó confirmada y consumió los créditos reservados.',
        amount: `−${entry.amountCredits}`,
        amountClass: 'text-[var(--uki-cream)]',
        icon: <GameController className="h-5 w-5" weight="fill" />,
      };
    case 'expire':
      return {
        title: 'Créditos caducados',
        detail: 'Llegaron al siguiente corte sin utilizarse.',
        amount: `−${entry.amountCredits}`,
        amountClass: 'text-amber-300',
        icon: <ClockCountdown className="h-5 w-5" weight="bold" />,
      };
  }
}

export function CompetitionCreditHistory({
  history,
  isLoadingMore,
  loadMoreError,
  onLoadMore,
  onRetry,
}: {
  history: CreditHistoryData | null;
  isLoadingMore: boolean;
  loadMoreError: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const visibleEntries = useMemo(
    () => history?.entries.filter((entry) => filterMatches(entry, filter)) ?? [],
    [filter, history],
  );

  return (
    <section id="credit-history" aria-labelledby="credit-history-title" className="mt-7 scroll-mt-24">
      <Panel innerClassName="p-5 sm:p-7 lg:p-8">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="uki-label">Movimientos de tu saldo</p>
            <h2 id="credit-history-title" className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)] sm:text-3xl">
              Historial de créditos
            </h2>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
              Consulta qué créditos recibiste, cuáles usaste para jugar, cuánto aportaste al pool y cuándo caducaron.
            </p>
          </div>
          {history?.nextExpiry ? (
            <div className="min-w-[250px] rounded-[9px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] px-4 py-3">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-[var(--uki-lilac)]">
                <ClockCountdown className="h-4 w-4" weight="bold" />
                Próxima caducidad
              </p>
              <p className="mt-1 text-lg font-black text-[var(--uki-cream)]">
                {history.nextExpiry.credits} créditos
              </p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--uki-muted)]">
                {formatDate(history.nextExpiry.at)}
              </p>
            </div>
          ) : null}
        </div>

        {!history ? (
          <div className="mt-6 flex items-center gap-3 text-sm font-semibold text-[var(--uki-text)]">
            <SpinnerGap className="h-5 w-5 animate-spin text-[var(--uki-lilac)]" />
            Cargando tus movimientos…
          </div>
        ) : !history.available || !history.totals ? (
          <div className="mt-6 flex flex-col gap-4 rounded-[9px] border border-amber-300/30 bg-amber-300/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <Warning className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" weight="bold" />
              <div>
                <p className="text-sm font-black text-[var(--uki-cream)]">No podemos mostrar el historial ahora</p>
                <p className="mt-1 text-sm font-semibold text-[var(--uki-text)]">
                  Tu saldo y tu reparto no se han modificado. Puedes volver a intentarlo.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 rounded-[8px] border border-white/15 px-4 text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-cream)] transition hover:border-[var(--uki-lilac-border)]"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <div className="mt-6 grid overflow-hidden rounded-[9px] border border-white/10 bg-black/20 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-white/10">
              <HistoryTotal label="Recibidos" value={history.totals.receivedCredits} />
              <HistoryTotal label="Gastados jugando" value={history.totals.spentCredits} />
              <HistoryTotal label="Aportados al pool" value={history.totals.poolContributedCredits} />
              <HistoryTotal label="Caducados" value={history.totals.expiredCredits} warning />
            </div>

            {!history.nextExpiry ? (
              <div className="mt-4 flex items-center gap-3 rounded-[8px] border border-white/10 bg-black/20 px-4 py-3">
                <ClockCountdown className="h-5 w-5 text-[var(--uki-lilac)]" weight="bold" />
                <p className="text-sm font-semibold text-[var(--uki-text)]">
                  Ahora mismo no tienes créditos personales pendientes de caducar.
                </p>
              </div>
            ) : null}

            <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="uki-label">Detalle</p>
                <h3 className="mt-1 text-lg font-black text-[var(--uki-cream)]">Tus últimos movimientos</h3>
              </div>
              <div className="flex flex-wrap gap-2" aria-label="Filtrar movimientos de créditos">
                {HISTORY_FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={filter === item.id}
                    onClick={() => setFilter(item.id)}
                    className="min-h-10 rounded-[8px] border px-3 text-xs font-black transition aria-pressed:border-[var(--uki-lilac-border)] aria-pressed:bg-[var(--uki-lilac-soft)] aria-pressed:text-[var(--uki-lilac)] border-white/10 text-[var(--uki-muted)] hover:border-white/20 hover:text-[var(--uki-cream)]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {visibleEntries.length > 0 ? (
              <ol className="mt-4 divide-y divide-white/10 border-y border-white/10">
                {visibleEntries.map((entry) => (
                  <HistoryRow key={entry.eventId} entry={entry} />
                ))}
              </ol>
            ) : (
              <div className="mt-4 rounded-[9px] border border-dashed border-white/15 px-5 py-8 text-center">
                <p className="text-base font-black text-[var(--uki-cream)]">
                  {history.entries.length === 0 ? 'Todavía no hay movimientos' : 'No hay movimientos con este filtro'}
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--uki-muted)]">
                  {history.entries.length === 0
                    ? 'Tus próximas entradas y usos de créditos aparecerán aquí.'
                    : 'Selecciona otro filtro o carga movimientos anteriores.'}
                </p>
              </div>
            )}

            <div aria-live="polite" className="mt-5 flex flex-col items-center gap-2">
              {history.hasMore ? (
                <button
                  type="button"
                  disabled={isLoadingMore}
                  onClick={onLoadMore}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-white/15 px-5 text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-cream)] transition hover:border-[var(--uki-lilac-border)] disabled:cursor-wait disabled:opacity-50"
                >
                  {isLoadingMore ? <SpinnerGap className="h-4 w-4 animate-spin" /> : null}
                  {isLoadingMore ? 'Cargando…' : 'Cargar movimientos anteriores'}
                </button>
              ) : history.entries.length > 0 ? (
                <p className="text-xs font-semibold text-[var(--uki-muted)]">Has llegado al inicio de tu historial.</p>
              ) : null}
              {loadMoreError ? (
                <p className="text-xs font-black text-amber-300">No se pudieron cargar más movimientos. Inténtalo de nuevo.</p>
              ) : null}
            </div>
          </>
        )}
      </Panel>
    </section>
  );
}

function HistoryTotal({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className="border-b border-white/10 p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(3)]:border-b-0 sm:[&:nth-child(4)]:border-b-0 lg:border-b-0 lg:border-r-0">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--uki-muted)]">{label}</p>
      <p className={`mt-1 font-headline text-2xl font-black tabular-nums ${warning ? 'text-amber-300' : 'text-[var(--uki-lilac)]'}`}>
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold text-[var(--uki-muted)]">Desde el inicio</p>
    </div>
  );
}

function HistoryRow({ entry }: { entry: CreditHistoryEntry }) {
  const content = presentation(entry);
  const showExpiry = entry.expiresAt && ['grant', 'late_compensation', 'pool_deposit'].includes(entry.operation);
  return (
    <li className="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] text-[var(--uki-lilac)]">
          {content.icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-[var(--uki-cream)]">{content.title}</p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">{content.detail}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-[var(--uki-muted)]">
            <span>{sourceLabel(entry)}</span>
            <span>{formatDate(entry.occurredAt)}</span>
            {showExpiry ? <span>Caducidad: {formatDate(entry.expiresAt!)}</span> : null}
          </div>
        </div>
      </div>
      <p className={`pl-14 font-headline text-lg font-black tabular-nums sm:pl-0 sm:text-right ${content.amountClass}`}>
        {content.amount}
      </p>
    </li>
  );
}
