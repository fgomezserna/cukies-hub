'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Lock, RadioTower } from 'lucide-react';
import { UKI_PRESALE_START_LABEL } from './sale-config';
import { usePresaleLock } from './presale-countdown';

type PresaleStatusResponse = {
  source: 'static' | 'contract';
  isConfigured: boolean;
  isOpen?: boolean;
  message?: string;
  startsAtLabel: string;
  chainLabel: string;
  price?: {
    ukiPerAsmFormatted: string;
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

function usePresaleStatusValue() {
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

function formatRate(value?: string) {
  if (!value) return 'RATIO ASM - UKI SE FIJARÁ AL INICIO';

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'RATIO ASM - UKI SE FIJARÁ AL INICIO';

  return `1 ASM = ${numeric.toLocaleString('en-US', { maximumFractionDigits: 4 })} UKI`;
}

export function PresaleRateLabel() {
  const state = usePresaleStatusValue();
  const { isLocked } = usePresaleLock();

  if (state.status === 'loading') {
    return <span className="uki-status-inline">Cargando estado de preventa</span>;
  }

  if (isLocked || state.status === 'error' || !state.data.isConfigured || !state.data.isOpen) {
    return <span className="uki-status-inline">RATIO ASM - UKI SE FIJARÁ AL INICIO</span>;
  }

  return <span className="uki-status-inline">{formatRate(state.data.price?.ukiPerAsmFormatted)}</span>;
}

export function PresaleRuntimeStatus() {
  const state = usePresaleStatusValue();
  const { isLocked } = usePresaleLock();

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

    if (state.data.isOpen) {
      return {
        icon: CheckCircle2,
        tone: 'ready',
        title: 'Preventa abierta',
        text: `Contrato activo en ${state.data.chainLabel}.`,
      } as const;
    }

    return {
      icon: Lock,
      tone: isLocked ? 'locked' : 'warning',
      title: isLocked ? `Bloqueado hasta ${UKI_PRESALE_START_LABEL}` : 'Aún no abierta',
      text: 'Conecta wallet para revisar datos; aprobar y comprar siguen bloqueados hasta la apertura.',
    } as const;
  }, [isLocked, state]);

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
