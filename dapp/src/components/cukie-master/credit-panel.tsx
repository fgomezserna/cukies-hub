'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { appRuntimeEndpoint, useAppRuntime, useAppRuntimeResource } from '@/providers/app-runtime-provider';

type CreditConfiguration = {
  slotId: string;
  route: 'uki' | 'nft';
  ordinal: number;
  status: 'qualifying' | 'active' | 'grace';
  creditEligibleFrom: string;
  firstEligibleCutoff: string;
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
    expiredCredits: number;
    blocked: boolean;
  };
  pool: { availableCredits: number; reservedCredits: number; blocked: boolean };
  routes: Partial<Record<'uki' | 'nft', CreditRouteStatus>>;
  configurations: CreditConfiguration[];
  activeReservations: number;
  grants: { healthy: boolean; sourceObservedThrough: string | null; openIncidents: number };
  currentRun: {
    periodCutoff: string;
    routes: Array<{
      route: 'uki' | 'nft';
      status: 'missing' | 'snapshotted' | 'processing' | 'open' | 'open_with_holds' | 'blocked';
    }>;
  };
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
    year: 'numeric',
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

function isEligibleForCutoff(configuration: CreditConfiguration, cutoff: string) {
  if (configuration.status !== 'qualifying') return true;
  const eligibleAt = Date.parse(configuration.firstEligibleCutoff);
  const cutoffAt = Date.parse(cutoff);
  return Number.isFinite(eligibleAt) && Number.isFinite(cutoffAt) && eligibleAt <= cutoffAt;
}

export function CompetitionCreditPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const runtime = useAppRuntime();
  const walletAddress = user?.walletAddress ?? null;
  const sessionWallet = walletAddress?.toLowerCase() ?? null;
  const identityMatches = Boolean(sessionWallet && runtime.sessionReady && runtime.address === sessionWallet);
  const [status, setStatus] = useState<CreditStatus | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult>('idle');
  const [history, setHistory] = useState<CreditHistoryData | null>(null);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [historyLoadError, setHistoryLoadError] = useState(false);
  const requestIdRef = useRef(0);
  const loadSequenceRef = useRef(0);
  const activeLoadRef = useRef<{ requestId: number; sequence: number } | null>(null);
  const saveOperationRef = useRef(0);
  const historyOperationRef = useRef(0);
  const statusRef = useRef<CreditStatus | null>(null);
  const draftsRef = useRef<Record<string, number>>({});
  const historyRef = useRef<CreditHistoryData | null>(null);
  const identityKeyRef = useRef<string | null>(null);
  const onlineRef = useRef(runtime.online);
  identityKeyRef.current = identityMatches ? sessionWallet : null;
  onlineRef.current = runtime.online;
  const applyIncomingStatus = useCallback((incomingStatus: CreditStatus, preserveDrafts = true, preserveHistory = false) => {
    const previousStatus = statusRef.current;
    const currentDrafts = draftsRef.current;
    const previousConfigurations = new Map(
      previousStatus?.configurations.map((configuration) => [configuration.slotId, configuration]) ?? [],
    );
    const nextDrafts = Object.fromEntries(incomingStatus.configurations.map((configuration) => {
      const previousConfiguration = previousConfigurations.get(configuration.slotId);
      const hasUnsavedDraft = preserveDrafts
        && previousConfiguration
        && currentDrafts[configuration.slotId] !== previousConfiguration.poolCreditsPerSlot;
      return [configuration.slotId, hasUnsavedDraft ? currentDrafts[configuration.slotId] : configuration.poolCreditsPerSlot];
    }));

    const incomingHistory = incomingStatus.history;
    const previousHistory = historyRef.current;
    const nextHistory = preserveHistory
      && previousHistory?.available
      && incomingHistory.available
      && previousHistory.page > 0
      ? (() => {
          const eventIds = new Set(incomingHistory.entries.map((entry) => entry.eventId));
          return {
            ...incomingHistory,
            page: previousHistory.page,
            hasMore: previousHistory.hasMore,
            entries: [...incomingHistory.entries, ...previousHistory.entries.filter((entry) => !eventIds.has(entry.eventId))],
          };
        })()
      : incomingHistory;

    statusRef.current = incomingStatus;
    draftsRef.current = nextDrafts;
    historyRef.current = nextHistory;
    setStatus(incomingStatus);
    setHistory(nextHistory);
    setHistoryLoadError(false);
    setDrafts(nextDrafts);
    setState('ready');
  }, []);
  const statusResource = useAppRuntimeResource<CreditStatus>('credits', {
    enabled: Boolean(walletAddress) && !authLoading,
  });
  const nextHistoryPage = history?.page ? history.page + 1 : null;
  const historyResource = useAppRuntimeResource<CreditStatus>('credits', {
    enabled: false,
    endpoint: nextHistoryPage && walletAddress
      ? `${appRuntimeEndpoint('credits', walletAddress)}&historyPage=${nextHistoryPage}`
      : undefined,
    cacheKeySuffix: `history:${nextHistoryPage ?? 'none'}`,
  });
  const refreshStatus = statusResource.refresh;

  useEffect(() => {
    statusRef.current = status;
    draftsRef.current = drafts;
  }, [drafts, status]);

  const load = useCallback(async (
    signal?: AbortSignal,
    silent = false,
    expectedRequestId = requestIdRef.current,
    options: { force?: boolean; preserveDrafts?: boolean } = {},
  ) => {
    if (!walletAddress || !identityMatches || !runtime.online) return;
    if (activeLoadRef.current?.requestId === expectedRequestId && !options.force) return;
    const requestedWallet = walletAddress;
    const loadSequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = loadSequence;
    activeLoadRef.current = { requestId: expectedRequestId, sequence: loadSequence };
    const isCurrentRequest = () => (
      requestIdRef.current === expectedRequestId
      && walletAddress === requestedWallet
      && activeLoadRef.current?.sequence === loadSequence
      && !signal?.aborted
    );
    try {
      if (!silent) setState('loading');
      const result = await refreshStatus();
      const incomingStatus = result.data;
      if (!incomingStatus) throw new Error('CREDIT_STATUS_UNAVAILABLE');
      if (incomingStatus.walletNormalized.toLowerCase() !== identityKeyRef.current) throw new Error('CREDIT_STATUS_IDENTITY_MISMATCH');
      if (!isCurrentRequest()) return;

      applyIncomingStatus(incomingStatus, options.preserveDrafts !== false, silent && options.preserveDrafts !== false);
    } finally {
      if (activeLoadRef.current?.sequence === loadSequence) activeLoadRef.current = null;
    }
  }, [applyIncomingStatus, identityMatches, refreshStatus, runtime.online, walletAddress]);

  useEffect(() => {
    if (authLoading) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    saveOperationRef.current += 1;
    historyOperationRef.current += 1;
    setIsSaving(false);
    setIsLoadingMoreHistory(false);
    statusRef.current = null;
    draftsRef.current = {};
    historyRef.current = null;
    setStatus(null);
    setHistory(null);
    setDrafts({});
    setHistoryLoadError(false);
    if (!walletAddress || !identityMatches) {
      setState('idle');
      return;
    }
    return () => {
      saveOperationRef.current += 1;
      historyOperationRef.current += 1;
      setIsSaving(false);
      setIsLoadingMoreHistory(false);
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
    };
  }, [authLoading, identityMatches, walletAddress]);

  useEffect(() => {
    if (!identityMatches || authLoading) return;
    if (!statusResource.data) {
      if (statusResource.state === 'loading') setState('loading');
      else if (statusResource.state === 'unavailable') setState('unavailable');
      return;
    }
    if (statusResource.data.walletNormalized.toLowerCase() !== identityKeyRef.current) return;
    applyIncomingStatus(statusResource.data, true, true);
  }, [applyIncomingStatus, authLoading, identityMatches, statusResource.data, statusResource.dataUpdatedAt, statusResource.state]);

  const routeState = useMemo(() => {
    const getRouteState = (route: 'uki' | 'nft'): 'healthy' | 'blocked' | 'unknown' => {
      const source = status?.routes[route];
      if (
        !source
        || typeof source.grants?.healthy !== 'boolean'
        || typeof source.balance?.blocked !== 'boolean'
        || typeof source.pool?.blocked !== 'boolean'
      ) return 'unknown';
      if (source.grants.healthy && !source.balance.blocked && !source.pool.blocked) return 'healthy';
      return 'blocked';
    };
    return { uki: getRouteState('uki'), nft: getRouteState('nft') };
  }, [status]);

  const routeAvailability = useMemo(() => ({
    uki: routeState.uki === 'healthy',
    nft: routeState.nft === 'healthy',
  }), [routeState]);

  const unavailableRoutes = useMemo(() => (
    (['uki', 'nft'] as const).filter((route) => routeState[route] !== 'healthy')
  ), [routeState]);

  const unknownRoutes = useMemo(() => (
    (['uki', 'nft'] as const).filter((route) => routeState[route] === 'unknown')
  ), [routeState]);

  const changedConfigurations = useMemo(() => (
    status?.configurations.filter((configuration) => (
      routeAvailability[configuration.route]
      && drafts[configuration.slotId] !== configuration.poolCreditsPerSlot
    )) ?? []
  ), [drafts, routeAvailability, status]);

  const creditableConfigurations = useMemo(() => (
    status?.configurations.filter((configuration) => (
      routeAvailability[configuration.route]
      && status
      && isEligibleForCutoff(configuration, status.period.nextCutoff)
    )) ?? []
  ), [routeAvailability, status]);

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
  const nextAllocationPending = Boolean(
    status
    && status.configurations.length > 0
    && unavailableRoutes.length === 2,
  );
  const nextAllocationPartial = Boolean(
    status
    && status.configurations.length > 0
    && !nextAllocationPending
    && unavailableRoutes.length > 0,
  );

  const futureConfigurations = useMemo(() => (
    status?.configurations.filter((configuration) => configuration.status === 'qualifying') ?? []
  ), [status]);
  const futureAllocationGroups = useMemo(() => {
    const groups = new Map<string, { cutoff: string; generated: number; forPlaying: number; forPool: number }>();
    futureConfigurations.forEach((configuration) => {
      const cutoff = configuration.firstEligibleCutoff;
      const current = groups.get(cutoff) ?? { cutoff, generated: 0, forPlaying: 0, forPool: 0 };
      const forPool = drafts[configuration.slotId] ?? configuration.poolCreditsPerSlot;
      const creditsPerSlot = status?.rule.creditsPerSlot ?? 0;
      groups.set(cutoff, {
        cutoff,
        generated: current.generated + creditsPerSlot,
        forPlaying: current.forPlaying + creditsPerSlot - forPool,
        forPool: current.forPool + forPool,
      });
    });
    return [...groups.values()].sort((left, right) => Date.parse(left.cutoff) - Date.parse(right.cutoff));
  }, [drafts, futureConfigurations, status]);

  const allocationSourceMessage = useMemo(() => {
    if (!status || status.configurations.length === 0 || unavailableRoutes.length === 0) return null;
    const labels = unavailableRoutes.map((route) => route === 'uki' ? 'UKI' : 'Cukies');
    const stateLabel = unknownRoutes.length > 0 ? 'sin confirmar' : 'bloqueada';
    return `${labels.join(' y ')} ${stateLabel}; mostramos solo la parte confirmada.`;
  }, [status, unavailableRoutes, unknownRoutes]);

  const currentRunStatuses = status?.currentRun?.routes.map(({ status: runStatus }) => runStatus) ?? [];
  const currentRunPending = currentRunStatuses.some((runStatus) => (
    ['missing', 'snapshotted', 'processing'].includes(runStatus)
  ));
  const currentRunBlocked = currentRunStatuses.some((runStatus) => runStatus === 'blocked');
  const currentRunHeld = currentRunStatuses.some((runStatus) => runStatus === 'open_with_holds');

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
    if (!walletAddress || !identityMatches || !runtime.online || !status || isSaving || changedConfigurations.length === 0) return;
    const requestId = requestIdRef.current;
    const requestedWallet = walletAddress;
    const requestedIdentity = identityKeyRef.current;
    const operationId = saveOperationRef.current + 1;
    saveOperationRef.current = operationId;
    const isCurrentRequest = () => (
      requestIdRef.current === requestId
      && saveOperationRef.current === operationId
      && walletAddress === requestedWallet
      && identityKeyRef.current === requestedIdentity
      && onlineRef.current
    );
    setIsSaving(true);
    setSaveResult('idle');
    try {
      for (const configuration of changedConfigurations) {
        if (!isCurrentRequest()) return;
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
        if (!isCurrentRequest()) return;
      }
      if (!isCurrentRequest()) return;
      await runtime.refreshAfterTransaction('credits');
      if (isCurrentRequest()) setSaveResult('saved');
    } catch {
      if (!isCurrentRequest()) return;
      await runtime.invalidate('credits').catch(() => undefined);
      if (isCurrentRequest()) setSaveResult('error');
    } finally {
      if (isCurrentRequest()) setIsSaving(false);
    }
  }

  async function loadMoreHistory() {
    if (!walletAddress || !history?.available || !history.hasMore || isLoadingMoreHistory) return;
    const requestId = requestIdRef.current;
    const requestedWallet = walletAddress;
    const operationId = historyOperationRef.current + 1;
    historyOperationRef.current = operationId;
    const isCurrentRequest = () => (
      requestIdRef.current === requestId
      && historyOperationRef.current === operationId
      && walletAddress === requestedWallet
    );
    setIsLoadingMoreHistory(true);
    setHistoryLoadError(false);
    try {
      const nextPage = history.page + 1;
      const result = await historyResource.refresh();
      const nextHistory = result.data?.history;
      if (!nextHistory?.available || nextHistory.page !== nextPage) {
        throw new Error('CREDIT_HISTORY_UNAVAILABLE');
      }
      if (!isCurrentRequest()) return;
      setHistory((current) => {
        if (!current?.available) {
          historyRef.current = nextHistory;
          return nextHistory;
        }
        const eventIds = new Set(current.entries.map((entry) => entry.eventId));
        const merged = {
          ...nextHistory,
          entries: [
            ...current.entries,
            ...nextHistory.entries.filter((entry) => !eventIds.has(entry.eventId)),
          ],
        };
        historyRef.current = merged;
        return merged;
      });
    } catch {
      if (isCurrentRequest()) setHistoryLoadError(true);
    } finally {
      if (isCurrentRequest()) setIsLoadingMoreHistory(false);
    }
  }

  if (!authLoading && (!walletAddress || !identityMatches)) {
    return (
      <section id="competition-credits" className="relative z-[2] w-full scroll-mt-24 pb-14">
        <Panel innerClassName="p-5 sm:p-7 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="max-w-2xl">
              <p className="uki-label">Tu reparto por periodo</p>
              <h2 className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)] sm:text-3xl">
                Conecta o firma tu wallet para ver tus créditos
              </h2>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                Identifica tu wallet para consultar el saldo y repartir créditos entre juego y pool.
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
            <p className="uki-label">Tus créditos por periodo</p>
            <h2 className="mt-2 max-w-2xl font-headline text-2xl font-black uppercase text-[var(--uki-cream)] sm:text-3xl">
              Decide cómo quieres usarlos
            </h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
              Cada cupo activo genera {status?.rule.creditsPerSlot ?? 100} créditos por periodo.
              Conserva los que quieras para jugar y aporta el resto al pool de créditos.
            </p>
          </div>
          {status ? (
            <div className="shrink-0 rounded-[8px] border border-white/10 bg-black/20 px-4 py-3 lg:text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--uki-muted)]">
                Próximo corte
              </p>
              <p className="mt-1 text-sm font-black text-[var(--uki-cream)]">
                {utcLabel(status.period.nextCutoff) ?? 'Próximo corte'}
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
                <h3 className="mt-1 text-lg font-black text-[var(--uki-cream)]">Confirmado en este periodo</h3>
              </div>
            </div>
            <div className="mt-3 grid overflow-hidden rounded-[8px] border border-white/10 bg-black/20 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-white/10">
              <CurrentBalance label="Para jugar" value={status.balance.availableCredits} />
              <CurrentBalance label="En partidas" value={status.balance.reservedCredits} />
              <CurrentBalance label="Ya usados" value={status.balance.spentCredits} />
              <CurrentBalance label="Aportados al pool" value={status.balance.poolDepositedCredits} />
              <CurrentBalance label="Caducados" value={status.balance.expiredCredits} />
            </div>

            {currentRunPending ? (
              <div className="mt-5 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
                <Warning className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" weight="bold" />
                <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                  El reparto del periodo con corte {utcLabel(status.currentRun?.periodCutoff ?? null) ?? 'pendiente'} sigue en proceso. El saldo mostrado es el último saldo confirmado; todavía no damos este reparto por liquidado.
                </p>
              </div>
            ) : currentRunBlocked ? (
              <div className="mt-5 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
                <Warning className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" weight="bold" />
                <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                  El reparto del periodo con corte {utcLabel(status.currentRun?.periodCutoff ?? null) ?? 'pendiente'} está bloqueado y requiere una comprobación adicional. No hemos modificado tu saldo confirmado.
                </p>
              </div>
            ) : currentRunHeld ? (
              <div className="mt-5 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
                <Warning className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" weight="bold" />
                <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                  El reparto del periodo ya está disponible para las rutas confirmadas; una parte sigue retenida para revisión. Mostramos por separado lo que está confirmado.
                </p>
              </div>
            ) : null}

            {unavailableRoutes.length > 0 ? (
              <div className="mt-5 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
                <Warning className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" weight="bold" />
                <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                  La vigencia actual de {unavailableRoutes.map((route) => (
                    route === 'uki' ? 'tus cupos UKI' : 'tus cupos de Cukies'
                  )).join(' y ')} está pendiente de confirmación. Mostramos el último estado confirmado y no aceptamos cambios hasta recibir una fuente actualizada. Los créditos ya emitidos conservan su fecha de caducidad.
                </p>
              </div>
            ) : null}

            {status.configurations.length === 0 ? (
              <div className="mt-6 border-t border-white/10 py-8">
                {unknownRoutes.length > 0 ? (
                  <>
                    <p className="text-lg font-black text-[var(--uki-cream)]">Todavía no podemos confirmar tus cupos</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--uki-muted)]">
                      La fuente de {unknownRoutes.map(routeLabel).join(' y ')} sigue pendiente. Mostraremos la configuración cuando termine la comprobación.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-black text-[var(--uki-cream)]">Todavía no tienes cupos configurables</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--uki-muted)]">
                      Cuando actives tu primer cupo podrás decidir aquí cómo usar sus créditos en cada periodo.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(250px,0.72fr)_minmax(0,1.6fr)]">
                <aside className="self-start rounded-[10px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] p-5 lg:sticky lg:top-24">
                  <p className="uki-label text-[var(--uki-lilac)]">Reparto del próximo corte</p>
                  <div className="mt-5 space-y-4">
                    <AllocationSummary
                      icon={<GameController className="h-6 w-6" weight="fill" />}
                      label="Para jugar"
                      value={nextAllocationPending ? 'Pendiente' : nextAllocation.forPlaying}
                    />
                    <AllocationSummary
                      icon={<Trophy className="h-6 w-6" weight="fill" />}
                      label="Al pool de créditos"
                      value={nextAllocationPending ? 'Pendiente' : nextAllocation.forPool}
                    />
                  </div>
                  <p className="mt-4 border-t border-white/10 pt-4 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                    {nextAllocationPending
                      ? 'La próxima asignación queda pendiente de confirmar la fuente de cupos.'
                      : nextAllocationPartial
                        ? `Asignación parcial: ${allocationSourceMessage}`
                      : nextAllocation.generated === 0
                        ? 'No hay cupos activos para el próximo corte.'
                        : `Repartes ${nextAllocation.generated} créditos entre tus cupos activos en el próximo corte.`}
                  </p>

                  {futureAllocationGroups.length > 0 ? (
                    <div className="mt-5 border-t border-white/10 pt-5">
                      <p className="uki-label text-[var(--uki-muted)]">Configuración futura</p>
                      <div className="mt-3 space-y-4">
                        {futureAllocationGroups.map((allocation) => (
                          <div key={allocation.cutoff} className="rounded-[7px] border border-white/10 bg-black/15 p-3">
                            <p className="text-xs font-black text-[var(--uki-cream)]">
                              Primer corte elegible: {utcLabel(allocation.cutoff) ?? 'pendiente de fecha'}
                            </p>
                            <div className="mt-2 grid gap-1 text-xs font-black text-[var(--uki-cream)]">
                              <span>{allocation.generated} créditos preparados</span>
                              <span>Para jugar: {allocation.forPlaying}</span>
                              <span>Al pool: {allocation.forPool}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

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
                                {canConfigureRoute
                                  ? slotStatusLabel(configuration.status)
                                  : 'Último estado confirmado · vigencia pendiente'}
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
                                Primer corte elegible para recibir créditos: {utcLabel(configuration.firstEligibleCutoff) ?? 'pendiente de fecha'}. Puedes dejar preparado el reparto desde ahora; no se adelanta la entrega.
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
                          Reparto guardado. Se aplicará en el corte indicado para cada cupo.
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
          onRetry={() => {
            const requestId = requestIdRef.current;
            void load(undefined, true, requestId).catch(() => {
              if (requestIdRef.current === requestId) setHistoryLoadError(true);
            });
          }}
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
  value: number | string;
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
