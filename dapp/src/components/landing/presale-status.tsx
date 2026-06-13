'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Lock, RadioTower } from 'lucide-react';
import {
  UKI_PRESALE_START_ISO,
  UKI_PRESALE_START_LABEL,
  UKI_PRESALE_START_SHORT_LABEL,
} from './sale-config';
import { formatPresaleRateLabel, remainingTimeUntil } from '@/lib/presale-display';

type PresaleStatusResponse = {
  source: 'static' | 'contract';
  isConfigured: boolean;
  isOpen?: boolean;
  saleEnabled?: boolean | null;
  message?: string;
  startsAt: string;
  startsAtLabel: string;
  startsAtShortLabel?: string;
  endsAt?: string | null;
  endsAtLabel?: string | null;
  chainLabel: string;
  price?: {
    ukiPerAsmFormatted: string | null;
  };
};

type PresaleStatusState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: PresaleStatusResponse; error: null }
  | { status: 'error'; data: null; error: string };

const PresaleStatusContext = createContext<PresaleStatusState | null>(null);

function usePresaleStatus(): PresaleStatusState {
  const [state, setState] = useState<PresaleStatusState>({ status: 'loading', data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();

    async function loadStatus() {
      try {
        const response = await fetch('/api/presale/status', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Status request failed with ${response.status}`);
        }

        const data = (await response.json()) as PresaleStatusResponse;
        setState({ status: 'ready', data, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          data: null,
          error: error instanceof Error ? error.message : 'Estado no disponible',
        });
      }
    }

    loadStatus();

    return () => controller.abort();
  }, []);

  return state;
}

export function usePresaleStatusValue() {
  const state = useContext(PresaleStatusContext);

  if (!state) {
    throw new Error('Presale status components must be rendered inside PresaleStatusProvider.');
  }

  return state;
}

export function PresaleStatusProvider({ children }: { children: ReactNode }) {
  const state = usePresaleStatus();

  return <PresaleStatusContext.Provider value={state}>{children}</PresaleStatusContext.Provider>;
}

export function usePresaleTiming() {
  const state = usePresaleStatusValue();
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const data = state.status === 'ready' ? state.data : null;
  const contractStartsAt = data?.startsAt ?? '';
  const contractRemaining = remainingTimeUntil(contractStartsAt);
  const isContractConfigured = Boolean(data?.isConfigured);
  const isContractOpen = Boolean(data?.isOpen && data.saleEnabled !== false);
  const shouldUsePublicStart =
    state.status !== 'ready' ||
    !data?.isConfigured ||
    data.saleEnabled === false ||
    (!data.isOpen && contractStartsAt && contractRemaining.total <= 0);
  const startsAt = shouldUsePublicStart ? UKI_PRESALE_START_ISO : contractStartsAt;
  const endsAt = data?.endsAt ?? null;
  const countdownTarget = isContractOpen && endsAt ? endsAt : startsAt;
  const remaining = remainingTimeUntil(countdownTarget);
  const isLocked = state.status !== 'ready' || !isContractConfigured || !isContractOpen;

  return {
    hasExactStart: Boolean(startsAt),
    isLocked,
    isContractConfigured,
    isContractOpen,
    remaining,
    startsAt,
    startLabel: shouldUsePublicStart ? UKI_PRESALE_START_LABEL : data?.startsAtLabel ?? UKI_PRESALE_START_LABEL,
    startShortLabel: shouldUsePublicStart ? UKI_PRESALE_START_SHORT_LABEL : data?.startsAtShortLabel ?? UKI_PRESALE_START_SHORT_LABEL,
    endsAt,
    endLabel: data?.endsAtLabel ?? null,
  };
}

export function PresaleRateLabel() {
  const state = usePresaleStatusValue();

  if (state.status === 'loading') {
    return <span className="uki-status-inline">Cargando estado de preventa</span>;
  }

  if (state.status === 'error' || !state.data.isConfigured) {
    return <span className="uki-status-inline">Ratio ASM - UKI pendiente</span>;
  }

  return <span className="uki-status-inline">{formatPresaleRateLabel(state.data.price?.ukiPerAsmFormatted)}</span>;
}

export function PresaleStartLabel({ prefix = '' }: { prefix?: string }) {
  const { startLabel } = usePresaleTiming();

  return (
    <span suppressHydrationWarning>
      {prefix}
      {prefix ? ' ' : ''}
      {startLabel}
    </span>
  );
}

export function PresaleFinalCtaText() {
  const { isContractOpen, endLabel, startLabel } = usePresaleTiming();

  if (isContractOpen) {
    return (
      <>
        La preventa UKI ya está abierta. Revisa precio, premios, Cukie Master y condiciones antes de comprar.
        {endLabel ? <> La preventa termina {endLabel}.</> : null}
      </>
    );
  }

  return (
    <>
      La preventa UKI abre el {startLabel}. Revisa precio, premios, Cukie Master y condiciones antes de comprar.
    </>
  );
}

export function PresaleQuoteAmount({ asmAmount }: { asmAmount: number }) {
  const state = usePresaleStatusValue();
  const rate = state.status === 'ready' ? Number(state.data.price?.ukiPerAsmFormatted) : null;

  if (!rate || !Number.isFinite(rate) || rate <= 0) {
    return <span>pendiente</span>;
  }

  return (
    <span>
      {(asmAmount * rate).toLocaleString('en-US', { maximumFractionDigits: 2 })}
    </span>
  );
}

export function PresaleRuntimeStatus() {
  const state = usePresaleStatusValue();
  const timing = usePresaleTiming();

  const runtime = useMemo(() => {
    if (state.status === 'loading') {
      return {
        icon: Loader2,
        tone: 'loading',
        title: 'Cargando preventa',
        text: 'Revisando configuración de la preventa.',
      } as const;
    }

    if (state.status === 'error') {
      return {
        icon: AlertTriangle,
        tone: 'warning',
        title: 'Estado no disponible',
        text: 'La landing sigue visible; la compra queda bloqueada hasta confirmar estado.',
      } as const;
    }

    if (!state.data.isConfigured) {
      return {
        icon: RadioTower,
        tone: 'warning',
        title: 'Contrato pendiente',
        text: state.data.message ?? 'El contrato de preventa aún no está configurado.',
      } as const;
    }

    if (timing.isContractOpen) {
      return {
        icon: CheckCircle2,
        tone: 'ready',
        title: 'Preventa abierta',
        text: `Contrato activo en ${state.data.chainLabel}.`,
      } as const;
    }

    return {
      icon: Lock,
      tone: timing.isLocked ? 'locked' : 'warning',
      title: timing.isLocked ? `Bloqueado hasta ${timing.startLabel}` : 'Aún no abierta',
      text: 'Conecta wallet para revisar datos; aprobar y comprar siguen bloqueados hasta la apertura.',
    } as const;
  }, [state, timing.isContractOpen, timing.isLocked, timing.startLabel]);

  const Icon = runtime.icon;

  return (
    <div className={`uki-state-callout uki-state-callout-${runtime.tone}`} aria-live="polite">
      <Icon className={runtime.tone === 'loading' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} strokeWidth={1.8} />
      <div>
        <p>{runtime.title}</p>
        <span>{runtime.text}</span>
      </div>
    </div>
  );
}
