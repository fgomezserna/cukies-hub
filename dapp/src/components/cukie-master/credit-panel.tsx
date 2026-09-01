'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle,
  Coin,
  Diamond,
  FloppyDisk,
  GameController,
  Minus,
  Plus,
  SpinnerGap,
  Trophy,
  Warning,
} from '@phosphor-icons/react';

import { Panel } from '@/components/landing/primitives';
import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import {
  CompetitionCreditHistory,
  type CreditHistoryData,
} from '@/components/cukie-master/credit-history';
import { useAuth } from '@/providers/auth-provider';

type CreditConfiguration = {
  slotId: string;
  route: 'uki' | 'nft';
  ordinal: number;
  status: 'qualifying' | 'active' | 'grace';
  poolCreditsPerSlot: number;
  effectiveCutoff: string | null;
};

type CreditRouteStatus = {
  balance: { blocked: boolean };
  pool: { blocked: boolean };
  grants: { healthy: boolean; sourceObservedThrough: string | null; openIncidents: number };
};

type CreditStatus = {
  walletNormalized: string;
  rule: {
    version: string;
    creditsPerSlot: number;
    cutoffHourUtc: number;
    cutoffMinuteUtc: number;
  };
  period: { cutoff: string; nextCutoff: string };
  balance: {
    availableCredits: number;
    reservedCredits: number;
    spentCredits: number;
    poolDepositedCredits: number;
    blocked: boolean;
  };
  pool: { availableCredits: number; reservedCredits: number; blocked: boolean };
  routes: Record<'uki' | 'nft', CreditRouteStatus>;
  configurations: CreditConfiguration[];
  activeReservations: number;
  grants: { healthy: boolean; sourceObservedThrough: string | null; openIncidents: number };
  history: CreditHistoryData;
};

type SaveResult = 'idle' | 'saved' | 'error';

function utcLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date);
}

function clampAllocation(value: number, maximum: number) {
  return Math.min(maximum, Math.max(0, value));
}

function routeLabel(route: CreditConfiguration['route']) {
  return route === 'uki' ? 'UKI' : 'Cukies';
}

function slotStatusLabel(status: CreditConfiguration['status']) {
  if (status === 'qualifying') return 'Activándose';
  if (status === 'grace') return 'En periodo de gracia';
  return 'Activo';
}

export function CompetitionCreditPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const [status, setStatus] = useState<CreditStatus | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult>('idle');
  const [history, setHistory] = useState<CreditHistoryData | null>(null);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [historyLoadError, setHistoryLoadError] = useState(false);

  const load = useCallback(async (signal?: AbortSignal, silent = false) => {
    if (!walletAddress) return;
    if (!silent) setState('loading');
    const response = await fetch(
      `/api/economy/v1/credits?walletAddress=${encodeURIComponent(walletAddress)}`,
      { cache: 'no-store', credentials: 'same-origin', signal },
    );
    const body = await response.json() as { data?: CreditStatus };
    if (!response.ok || !body.data) throw new Error('CREDIT_STATUS_UNAVAILABLE');
    setStatus(body.data);
    setHistory(body.data.history);
    setHistoryLoadError(false);
    setDrafts(Object.fromEntries(
      body.data.configurations.map((configuration) => [
        configuration.slotId,
        configuration.poolCreditsPerSlot,
      ]),
    ));
    setState('ready');
  }, [walletAddress]);

  useEffect(() => {
    if (authLoading) return;
    if (!walletAddress) {
      setStatus(null);
      setHistory(null);
      setState('idle');
      return;
    }
    const controller = new AbortController();
    load(controller.signal).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus(null);
      setHistory(null);
      setState('unavailable');
    });
    return () => controller.abort();
  }, [authLoading, load, walletAddress]);

  const routeAvailability = useMemo(() => ({
    uki: Boolean(
      status?.routes.uki.grants.healthy
      && !status.routes.uki.balance.blocked
      && !status.routes.uki.pool.blocked,
    ),
    nft: Boolean(
      status?.routes.nft.grants.healthy
      && !status.routes.nft.balance.blocked
      && !status.routes.nft.pool.blocked,
    ),
  }), [status]);

  const unavailableRoutes = useMemo(() => (
    (['uki', 'nft'] as const).filter((route) => !routeAvailability[route])
  ), [routeAvailability]);

  const changedConfigurations = useMemo(() => (
    status?.configurations.filter((configuration) => (
      routeAvailability[configuration.route]
      && drafts[configuration.slotId] !== configuration.poolCreditsPerSlot
    )) ?? []
  ), [drafts, routeAvailability, status]);

  const creditableConfigurations = useMemo(() => (
    status?.configurations.filter((configuration) => configuration.status !== 'qualifying') ?? []
  ), [status]);

  const nextAllocation = useMemo(() => {
    if (!status) return { generated: 0, forPlaying: 0, forPool: 0 };
    return creditableConfigurations.reduce((total, configuration) => {
      const forPool = drafts[configuration.slotId] ?? configuration.poolCreditsPerSlot;
      return {
        generated: total.generated + status.rule.creditsPerSlot,
        forPlaying: total.forPlaying + status.rule.creditsPerSlot - forPool,
        forPool: total.forPool + forPool,
      };
    }, { generated: 0, forPlaying: 0, forPool: 0 });
  }, [creditableConfigurations, drafts, status]);

  function updateDraft(slotId: string, value: number) {
    if (!status || isSaving) return;
    setSaveResult('idle');
    setDrafts((current) => ({
      ...current,
      [slotId]: clampAllocation(value, status.rule.creditsPerSlot),
    }));
  }

  function applyToAll(value: number) {
    if (!status || isSaving) return;
    setSaveResult('idle');
    setDrafts((current) => ({
      ...current,
      ...Object.fromEntries(status.configurations
        .filter((configuration) => routeAvailability[configuration.route])
        .map((configuration) => [
          configuration.slotId,
          clampAllocation(value, status.rule.creditsPerSlot),
        ])),
    }));
  }

  async function saveAll() {
    if (!walletAddress || !status || isSaving || changedConfigurations.length === 0) return;
    setIsSaving(true);
    setSaveResult('idle');
    try {
      for (const configuration of changedConfigurations) {
        const poolCreditsPerSlot = drafts[configuration.slotId];
        if (
          !Number.isInteger(poolCreditsPerSlot)
          || poolCreditsPerSlot < 0
          || poolCreditsPerSlot > status.rule.creditsPerSlot
          || poolCreditsPerSlot % 10 !== 0
        ) throw new Error('INVALID_CREDIT_CONFIGURATION');

        const response = await fetch('/api/economy/v1/credits', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': `credit-config:${configuration.slotId}:${crypto.randomUUID()}`,
          },
          body: JSON.stringify({
            walletAddress,
            slotId: configuration.slotId,
            poolCreditsPerSlot,
          }),
        });
        if (!response.ok) throw new Error('CREDIT_CONFIG_REJECTED');
      }
      await load(undefined, true);
      setSaveResult('saved');
    } catch {
      await load(undefined, true).catch(() => undefined);
      setSaveResult('error');
    } finally {
      setIsSaving(false);
    }
  }

  async function loadMoreHistory() {
    if (!walletAddress || !history?.available || !history.hasMore || isLoadingMoreHistory) return;
    setIsLoadingMoreHistory(true);
    setHistoryLoadError(false);
    try {
      const nextPage = history.page + 1;
      const response = await fetch(
        `/api/economy/v1/credits?walletAddress=${encodeURIComponent(walletAddress)}&historyPage=${nextPage}`,
        { cache: 'no-store', credentials: 'same-origin' },
      );
      const body = await response.json() as { data?: CreditStatus };
      const nextHistory = body.data?.history;
      if (!response.ok || !nextHistory?.available || nextHistory.page !== nextPage) {
        throw new Error('CREDIT_HISTORY_UNAVAILABLE');
      }
      setHistory((current) => {
        if (!current?.available) return nextHistory;
        const eventIds = new Set(current.entries.map((entry) => entry.eventId));
        return {
          ...nextHistory,
          entries: [
            ...current.entries,
            ...nextHistory.entries.filter((entry) => !eventIds.has(entry.eventId)),
          ],
        };
      });
    } catch {
      setHistoryLoadError(true);
    } finally {
      setIsLoadingMoreHistory(false);
    }
  }

  if (!authLoading && state === 'idle' && !walletAddress) {
    return (
      <section id="competition-credits" className="relative z-[2] w-full scroll-mt-24 pb-14">
        <Panel innerClassName="p-5 sm:p-7 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="max-w-2xl">
              <p className="uki-label">Tu reparto diario</p>
              <h2 className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)] sm:text-3xl">
                Conecta tu wallet para ver tus créditos
              </h2>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                Te mostraremos el saldo disponible y los cupos que puedes repartir entre juego y pool.
              </p>
            </div>
            <LandingWalletConnectButton
              evmOnly
              className="min-h-12 w-fit px-5"
              label="Conectar wallet"
              compactLabel="Conectar wallet"
              showCompactText={false}
            />
          </div>
        </Panel>
      </section>
    );
  }

  return (
    <div id="competition-credits" className="relative z-[2] w-full scroll-mt-24 pb-14">
      <Panel innerClassName="p-5 sm:p-7 lg:p-8">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="uki-label">Tus créditos diarios</p>
            <h2 className="mt-2 max-w-2xl font-headline text-2xl font-black uppercase text-[var(--uki-cream)] sm:text-3xl">
              Decide cómo quieres usarlos
            </h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
              Cada cupo activo genera {status?.rule.creditsPerSlot ?? 100} créditos al día.
              Conserva los que quieras para jugar y aporta el resto al pool de créditos.
            </p>
          </div>
          {status ? (
            <div className="shrink-0 rounded-[8px] border border-white/10 bg-black/20 px-4 py-3 lg:text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--uki-muted)]">
                Próxima aplicación
              </p>
              <p className="mt-1 text-sm font-black text-[var(--uki-cream)]">
                {utcLabel(status.period.nextCutoff) ?? 'Próximo reparto diario'}
              </p>
            </div>
          ) : null}
        </div>

        {authLoading || state === 'loading' ? (
          <div className="mt-6 flex items-center gap-3 text-sm font-semibold text-[var(--uki-text)]">
            <SpinnerGap className="h-5 w-5 animate-spin text-[var(--uki-lilac)]" />
            Cargando tus créditos…
          </div>
        ) : null}

        {state === 'unavailable' ? (
          <div className="mt-6 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
            <Warning className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" weight="bold" />
            <div>
              <p className="text-sm font-black text-[var(--uki-cream)]">Tus créditos no están disponibles ahora</p>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                No hemos cambiado ningún saldo ni reparto. Inténtalo de nuevo dentro de unos minutos.
              </p>
            </div>
          </div>
        ) : null}

        {state === 'ready' && status ? (
          <>
            <div className="mt-6 flex items-end justify-between gap-4">
              <div>
                <p className="uki-label">Saldo actual</p>
                <h3 className="mt-1 text-lg font-black text-[var(--uki-cream)]">Lo que ya tienes hoy</h3>
              </div>
            </div>
            <div className="mt-3 grid overflow-hidden rounded-[8px] border border-white/10 bg-black/20 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-white/10">
              <CurrentBalance label="Para jugar" value={status.balance.availableCredits} />
              <CurrentBalance label="En partidas" value={status.balance.reservedCredits} />
              <CurrentBalance label="Ya usados" value={status.balance.spentCredits} />
              <CurrentBalance label="Aportados al pool" value={status.balance.poolDepositedCredits} />
            </div>

            {unavailableRoutes.length > 0 ? (
              <div className="mt-5 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
                <Warning className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" weight="bold" />
                <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                  La asignación de {unavailableRoutes.map((route) => (
                    route === 'uki' ? 'tus cupos UKI' : 'tus cupos de Cukies'
                  )).join(' y ')} está temporalmente pausada. El resto de tus cupos sigue disponible.
                </p>
              </div>
            ) : null}

            {status.configurations.length === 0 ? (
              <div className="mt-6 border-t border-white/10 py-8">
                <p className="text-lg font-black text-[var(--uki-cream)]">Todavía no tienes cupos configurables</p>
                <p className="mt-2 text-sm font-semibold text-[var(--uki-muted)]">
                  Cuando actives tu primer cupo podrás decidir aquí cómo usar sus créditos diarios.
                </p>
              </div>
            ) : (
              <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(250px,0.72fr)_minmax(0,1.6fr)]">
                <aside className="self-start rounded-[10px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] p-5 lg:sticky lg:top-24">
                  <p className="uki-label text-[var(--uki-lilac)]">Próximo reparto diario</p>
                  <div className="mt-5 space-y-4">
                    <AllocationSummary
                      icon={<GameController className="h-6 w-6" weight="fill" />}
                      label="Para jugar"
                      value={nextAllocation.forPlaying}
                    />
                    <AllocationSummary
                      icon={<Trophy className="h-6 w-6" weight="fill" />}
                      label="Al pool de créditos"
                      value={nextAllocation.forPool}
                    />
                  </div>
                  <p className="mt-4 border-t border-white/10 pt-4 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                    Repartes {nextAllocation.generated} créditos entre tus cupos activos.
                  </p>

                  <div className="mt-5 grid gap-2" aria-label="Aplicar un reparto a todos los cupos disponibles">
                    <PresetButton
                      icon={<GameController className="h-5 w-5" weight="bold" />}
                      label="Todo para jugar"
                      detail={`${status.rule.creditsPerSlot} jugar · 0 pool`}
                      onClick={() => applyToAll(0)}
                      disabled={isSaving || unavailableRoutes.length === 2}
                    />
                    <PresetButton
                      icon={<Coin className="h-5 w-5" weight="bold" />}
                      label="Mitad y mitad"
                      detail={`${status.rule.creditsPerSlot / 2} jugar · ${status.rule.creditsPerSlot / 2} pool`}
                      onClick={() => applyToAll(status.rule.creditsPerSlot / 2)}
                      disabled={isSaving || unavailableRoutes.length === 2}
                    />
                    <PresetButton
                      icon={<Trophy className="h-5 w-5" weight="bold" />}
                      label="Todo al pool"
                      detail={`0 jugar · ${status.rule.creditsPerSlot} pool`}
                      onClick={() => applyToAll(status.rule.creditsPerSlot)}
                      disabled={isSaving || unavailableRoutes.length === 2}
                    />
                  </div>
                  <p className="mt-3 text-[11px] font-semibold leading-relaxed text-[var(--uki-muted)]">
                    Los botones aplican el mismo reparto a todos. Después puedes ajustar cada cupo.
                  </p>
                </aside>

                <div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="uki-label">Tus cupos</p>
                      <h3 className="mt-1 text-xl font-black text-[var(--uki-cream)]">
                        Personaliza cada reparto
                      </h3>
                    </div>
                    <p className="text-xs font-semibold text-[var(--uki-muted)]">
                      Ajustes de 10 créditos
                    </p>
                  </div>

                  <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
                    {status.configurations.map((configuration) => {
                      const canConfigureRoute = routeAvailability[configuration.route];
                      const forPool = drafts[configuration.slotId] ?? configuration.poolCreditsPerSlot;
                      const forPlaying = status.rule.creditsPerSlot - forPool;
                      const controlLabel = `${routeLabel(configuration.route)}, cupo ${configuration.ordinal}`;
                      return (
                        <fieldset
                          key={configuration.slotId}
                          disabled={!canConfigureRoute || isSaving}
                          className="grid gap-4 py-5 disabled:opacity-45 sm:grid-cols-[minmax(150px,1fr)_minmax(280px,1.25fr)] sm:items-center"
                        >
                          <legend className="sr-only">Reparto de {controlLabel}</legend>
                          <div className="flex items-center gap-3">
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-black/25 text-[var(--uki-lilac)]">
                              {configuration.route === 'uki'
                                ? <Coin className="h-6 w-6" weight="bold" />
                                : <Diamond className="h-6 w-6" weight="bold" />}
                            </div>
                            <div>
                              <p className="text-sm font-black text-[var(--uki-cream)]">
                                Cupo {configuration.ordinal} · {routeLabel(configuration.route)}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">
                                {canConfigureRoute ? slotStatusLabel(configuration.status) : 'Cambios pausados'}
                              </p>
                            </div>
                          </div>

                          <div>
                            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch overflow-hidden rounded-[8px] border border-white/10 bg-black/25">
                              <AllocationDestination
                                icon={<GameController className="h-5 w-5" weight="fill" />}
                                label="Jugar"
                                value={forPlaying}
                              />
                              <div className="flex items-center border-x border-white/10 bg-black/20 p-1">
                                <button
                                  type="button"
                                  aria-label={`Reducir aportación al pool de ${controlLabel}`}
                                  disabled={!canConfigureRoute || isSaving || forPool === 0}
                                  onClick={() => updateDraft(configuration.slotId, forPool - 10)}
                                  className="grid h-10 w-10 place-items-center rounded-[6px] text-[var(--uki-text)] transition duration-200 hover:bg-white/10 hover:text-[var(--uki-cream)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-25"
                                >
                                  <Minus className="h-4 w-4" weight="bold" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Aumentar aportación al pool de ${controlLabel}`}
                                  disabled={!canConfigureRoute || isSaving || forPool === status.rule.creditsPerSlot}
                                  onClick={() => updateDraft(configuration.slotId, forPool + 10)}
                                  className="grid h-10 w-10 place-items-center rounded-[6px] text-[var(--uki-lilac)] transition duration-200 hover:bg-white/10 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-25"
                                >
                                  <Plus className="h-4 w-4" weight="bold" />
                                </button>
                              </div>
                              <AllocationDestination
                                icon={<Trophy className="h-5 w-5" weight="fill" />}
                                label="Pool"
                                value={forPool}
                                align="right"
                                accent
                              />
                            </div>
                            {configuration.status === 'qualifying' ? (
                              <p className="mt-2 text-right text-[11px] font-semibold text-[var(--uki-muted)]">
                                Este reparto empezará cuando el cupo se active.
                              </p>
                            ) : null}
                          </div>
                        </fieldset>
                      );
                    })}
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div aria-live="polite" className="min-h-5">
                      {saveResult === 'saved' ? (
                        <p className="flex items-center gap-2 text-xs font-black text-[var(--uki-lilac)]">
                          <CheckCircle className="h-4 w-4" weight="fill" />
                          Reparto guardado. Se aplicará en el próximo corte.
                        </p>
                      ) : saveResult === 'error' ? (
                        <p className="flex items-center gap-2 text-xs font-black text-amber-300">
                          <Warning className="h-4 w-4" weight="fill" />
                          No se guardaron todos los cambios. Hemos recuperado el estado real.
                        </p>
                      ) : changedConfigurations.length > 0 ? (
                        <p className="text-xs font-semibold text-[var(--uki-muted)]">
                          {changedConfigurations.length} {changedConfigurations.length === 1 ? 'cupo modificado' : 'cupos modificados'}
                        </p>
                      ) : (
                        <p className="text-xs font-semibold text-[var(--uki-muted)]">Tu reparto está guardado.</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={isSaving || changedConfigurations.length === 0}
                      onClick={saveAll}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] bg-[var(--uki-lilac)] px-6 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#180b1f] transition duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isSaving
                        ? <SpinnerGap className="h-5 w-5 animate-spin" />
                        : <FloppyDisk className="h-5 w-5" weight="bold" />}
                      {isSaving
                        ? 'Guardando…'
                        : changedConfigurations.length > 0
                          ? `Guardar ${changedConfigurations.length} ${changedConfigurations.length === 1 ? 'cambio' : 'cambios'}`
                          : 'Reparto guardado'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </Panel>
      {state === 'ready' && status ? (
        <CompetitionCreditHistory
          history={history}
          isLoadingMore={isLoadingMoreHistory}
          loadMoreError={historyLoadError}
          onLoadMore={loadMoreHistory}
          onRetry={() => load(undefined, true).catch(() => setHistoryLoadError(true))}
        />
      ) : null}
    </div>
  );
}

function CurrentBalance({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-white/10 p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(3)]:border-b-0 sm:[&:nth-child(4)]:border-b-0 lg:border-b-0 lg:border-r-0">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--uki-muted)]">{label}</p>
      <p className="mt-1 font-headline text-2xl font-black text-[var(--uki-lilac)]">{value}</p>
    </div>
  );
}

function AllocationSummary({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--uki-lilac)] text-[#180b1f]">
        {icon}
      </div>
      <div>
        <p className="text-xs font-black text-[var(--uki-muted)]">{label}</p>
        <p className="mt-0.5 font-headline text-3xl font-black text-[var(--uki-cream)]">{value}</p>
      </div>
    </div>
  );
}

function PresetButton({
  icon,
  label,
  detail,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-12 items-center gap-3 rounded-[7px] border border-white/10 bg-black/20 px-3 py-2 text-left transition duration-200 hover:border-[var(--uki-lilac-border)] hover:bg-black/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="text-[var(--uki-lilac)]">{icon}</span>
      <span className="flex-1 text-xs font-black text-[var(--uki-cream)]">{label}</span>
      <span className="text-[10px] font-black tabular-nums text-[var(--uki-muted)]">{detail}</span>
    </button>
  );
}

function AllocationDestination({
  icon,
  label,
  value,
  align = 'left',
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  align?: 'left' | 'right';
  accent?: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 px-3 py-2 ${align === 'right' ? 'justify-end text-right' : ''}`}>
      {align === 'left' ? <span className="hidden text-[var(--uki-muted)] sm:block">{icon}</span> : null}
      <div className="min-w-0">
        <p className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">{label}</p>
        <p className={`font-headline text-xl font-black tabular-nums ${accent ? 'text-[var(--uki-lilac)]' : 'text-[var(--uki-cream)]'}`}>
          {value}
        </p>
      </div>
      {align === 'right' ? <span className="hidden text-[var(--uki-lilac)] sm:block">{icon}</span> : null}
    </div>
  );
}
