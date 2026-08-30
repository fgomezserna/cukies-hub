'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Save } from 'lucide-react';

import { Panel } from '@/components/landing/primitives';
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
};

function utcLabel(value: string | null) {
  if (!value) return 'pendiente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'pendiente';
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function CompetitionCreditPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const [status, setStatus] = useState<CreditStatus | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [savingSlot, setSavingSlot] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<'idle' | 'saved' | 'error'>('idle');

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!walletAddress) return;
    setState('loading');
    const response = await fetch(
      `/api/economy/v1/credits?walletAddress=${encodeURIComponent(walletAddress)}`,
      { cache: 'no-store', credentials: 'same-origin', signal },
    );
    const body = await response.json() as { data?: CreditStatus };
    if (!response.ok || !body.data) throw new Error('CREDIT_STATUS_UNAVAILABLE');
    setStatus(body.data);
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
      setState('idle');
      return;
    }
    const controller = new AbortController();
    load(controller.signal).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus(null);
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

  async function save(configuration: CreditConfiguration) {
    if (!walletAddress || !routeAvailability[configuration.route] || savingSlot) return;
    const poolCreditsPerSlot = drafts[configuration.slotId];
    if (!Number.isInteger(poolCreditsPerSlot) || poolCreditsPerSlot < 0 ||
      poolCreditsPerSlot > 100 || poolCreditsPerSlot % 10 !== 0) {
      setSaveResult('error');
      return;
    }
    setSavingSlot(configuration.slotId);
    setSaveResult('idle');
    try {
      const idempotencyKey = `credit-config:${configuration.slotId}:${crypto.randomUUID()}`;
      const response = await fetch('/api/economy/v1/credits', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          walletAddress,
          slotId: configuration.slotId,
          poolCreditsPerSlot,
        }),
      });
      if (!response.ok) throw new Error('CREDIT_CONFIG_REJECTED');
      await load();
      setSaveResult('saved');
    } catch {
      setSaveResult('error');
    } finally {
      setSavingSlot(null);
    }
  }

  if (!authLoading && state === 'idle') return null;

  return (
    <section id="competition-credits" className="uki-container relative z-[2] scroll-mt-28 pb-14">
      <Panel innerClassName="p-5 sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="uki-label">Ledger diario</p>
            <h2 className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)]">
              Créditos de competición
            </h2>
          </div>
          {status ? (
            <p className="text-xs font-semibold text-[var(--uki-muted)]">
              Próximo corte UTC: {utcLabel(status.period.nextCutoff)}
            </p>
          ) : null}
        </div>

        {authLoading || state === 'loading' ? (
          <div className="mt-6 flex items-center gap-3 text-sm font-semibold text-[var(--uki-text)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--uki-cyan)]" />
            Leyendo ledger y configuración vigente…
          </div>
        ) : null}

        {state === 'unavailable' ? (
          <div className="mt-6 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              El ledger de créditos no está disponible con garantías. No se muestran balances
              estimados ni se permite cambiar aportaciones al pool.
            </p>
          </div>
        ) : null}

        {state === 'ready' && status ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CreditMetric label="Disponibles" value={status.balance.availableCredits} />
              <CreditMetric label="Reservados" value={status.balance.reservedCredits} />
              <CreditMetric label="Usados" value={status.balance.spentCredits} />
              <CreditMetric label="Pool del periodo" value={status.pool.availableCredits} />
            </div>

            {unavailableRoutes.length > 0 ? (
              <div className="mt-5 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                <p className="text-xs font-semibold leading-relaxed text-[var(--uki-text)]">
                  Configuración bloqueada solo en {unavailableRoutes.map((route) => (
                    route === 'uki' ? 'Ruta UKI' : 'Ruta Cukies'
                  )).join(' y ')} hasta que su watermark e incidentes estén saludables.
                </p>
              </div>
            ) : null}

            {unavailableRoutes.length < 2 ? (
              <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-[var(--uki-muted)]">
                <CheckCircle2 className="h-4 w-4 text-[var(--uki-cyan)]" />
                Regla {status.rule.version}: las rutas saludables permiten aportar en múltiplos de 10.
              </div>
            ) : null}

            <div className="mt-5 space-y-3">
              {status.configurations.length === 0 ? (
                <p className="text-sm font-semibold text-[var(--uki-muted)]">
                  No hay cupos activos configurables en este momento.
                </p>
              ) : status.configurations.map((configuration) => {
                const canConfigureRoute = routeAvailability[configuration.route];
                return (
                  <div
                    key={configuration.slotId}
                    className="grid gap-3 rounded-[8px] border border-white/10 bg-black/20 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                  >
                    <div>
                      <p className="text-sm font-black text-[var(--uki-cream)]">
                        {configuration.route === 'uki' ? 'Ruta UKI' : 'Ruta Cukies'} · Cupo {configuration.ordinal}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">
                        {canConfigureRoute
                          ? `Aplicación: ${utcLabel(configuration.effectiveCutoff)}`
                          : 'Ruta bloqueada: no se guardará ninguna aportación.'}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--uki-text)]">
                      Al pool
                      <select
                        aria-label={`Créditos al pool para ${configuration.slotId}`}
                        value={drafts[configuration.slotId] ?? 0}
                        disabled={!canConfigureRoute || savingSlot !== null}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [configuration.slotId]: Number(event.target.value),
                        }))}
                        className="rounded-[6px] border border-white/15 bg-black/40 px-3 py-2 text-[var(--uki-cream)]"
                      >
                        {Array.from({ length: 11 }, (_, index) => index * 10).map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={!canConfigureRoute || savingSlot !== null ||
                        drafts[configuration.slotId] === configuration.poolCreditsPerSlot}
                      onClick={() => save(configuration)}
                      className="inline-flex items-center justify-center gap-2 rounded-[6px] border border-[var(--uki-cyan-border)] px-4 py-2 text-xs font-black uppercase text-[var(--uki-cyan)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {savingSlot === configuration.slotId
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Save className="h-4 w-4" />}
                      Guardar
                    </button>
                  </div>
                );
              })}
            </div>

            {saveResult === 'saved' ? (
              <p className="mt-4 text-xs font-semibold text-[var(--uki-cyan)]">
                Configuración registrada de forma idempotente.
              </p>
            ) : saveResult === 'error' ? (
              <p className="mt-4 text-xs font-semibold text-amber-300">
                No se pudo guardar; el estado no se ha estimado ni modificado localmente.
              </p>
            ) : null}
          </>
        ) : null}
      </Panel>
    </section>
  );
}

function CreditMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-black/20 p-4">
      <p className="uki-label">{label}</p>
      <p className="mt-2 font-headline text-3xl font-black text-[var(--uki-gold)]">{value}</p>
    </div>
  );
}
