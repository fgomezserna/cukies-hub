'use client';

import { useMemo } from 'react';
import { AlertTriangle, CloudOff, Loader2, RefreshCw, ShieldAlert, Wifi } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { useAppRuntime, type AppRuntimeOperation } from '@/providers/app-runtime-provider';

function operationForPath(pathname: string): AppRuntimeOperation | null {
  if (pathname === '/dashboard') return 'dashboard';
  if (pathname.startsWith('/credits')) return 'credits';
  if (pathname.startsWith('/cukie-master')) return 'master';
  if (pathname.startsWith('/cukie-hodler')) return 'pool';
  if (pathname.startsWith('/cukies')) return 'nft';
  return null;
}

export function AppRuntimeNotice() {
  const pathname = usePathname();
  const runtime = useAppRuntime();
  const operation = useMemo(() => operationForPath(pathname), [pathname]);
  const readiness = operation ? runtime.readiness(operation) : null;
  const writeOperation = operation === 'master'
    ? 'master-write' as const
    : operation === 'pool'
      ? 'pool-write' as const
      : operation === 'nft'
        ? 'nft-write' as const
        : null;
  const writeReadiness = writeOperation ? runtime.readiness(writeOperation) : null;

  const showingWriteNetwork = Boolean(
    readiness?.ready
    && writeReadiness?.reason === 'wrong_chain'
    && writeReadiness.targetChainId,
  );
  const healthNeedsAttention = runtime.statusState === 'stale'
    || runtime.statusState === 'syncing'
    || runtime.statusState === 'unavailable';
  const projectionSync = runtime.projectionSync;
  const projectionNeedsAttention = projectionSync.state !== 'idle'
    && projectionSync.wallet === runtime.address;
  // The shared economy runtime describes EVM services. Legacy TRON collection
  // views keep their own context and must not inherit an EVM health warning.
  if (projectionNeedsAttention) {
    const delayed = projectionSync.state === 'delayed';
    return (
      <aside
        role="status"
        aria-live="polite"
        data-testid="app-runtime-notice"
        data-projection-sync={projectionSync.state}
        className="relative z-20 flex flex-col gap-3 border-b border-amber-200/15 bg-amber-300/[0.06] px-4 py-3 text-[var(--uki-cream)] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"
      >
        <div className="flex min-w-0 items-start gap-3">
          {delayed ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" /> : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-200" aria-hidden="true" />}
          <div className="min-w-0">
            <p className="text-sm font-black">{delayed ? 'La proyección está tardando' : 'Actualizando tus cupos Cukie Master'}</p>
            <p className="mt-0.5 text-xs font-semibold text-white/65">
              {delayed
                ? 'La transacción está confirmada, pero Master y Créditos aún no muestran el mismo estado. Puedes reintentarlo.'
                : 'La transacción está confirmada en la red. Conservamos este aviso mientras Master y Créditos convergen.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="uki-button uki-button-secondary min-h-9 shrink-0 px-3 text-xs"
          onClick={() => void runtime.refreshAfterTransaction('master')}
          disabled={runtime.isRefreshing && !delayed}
        >
          {runtime.isRefreshing && !delayed ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          Reintentar
        </button>
      </aside>
    );
  }
  if (!operation || !readiness || runtime.authLoading || runtime.walletType === 'tron' || (readiness.ready && !showingWriteNetwork && !healthNeedsAttention)) return null;
  const effectiveReadiness = showingWriteNetwork ? writeReadiness! : readiness;

  const serviceUnavailable = effectiveReadiness.reason === 'service_unavailable' || healthNeedsAttention;
  const title = showingWriteNetwork
    ? 'Cambia de red cuando vayas a firmar'
    : effectiveReadiness.reason === 'offline'
    ? 'Sin conexión'
    : effectiveReadiness.reason === 'wallet_required'
      ? 'Conecta tu wallet para continuar'
      : effectiveReadiness.reason === 'signature_required'
          ? 'Firma para consultar tus datos'
        : readiness.reason === 'wrong_chain'
          ? 'Cambia de red para continuar'
          : runtime.statusState === 'syncing'
            ? 'Estamos recuperando el estado'
            : runtime.statusState === 'stale'
              ? 'El estado puede estar desactualizado'
            : serviceUnavailable
              ? 'Este servicio está actualizando datos'
              : 'No hemos podido actualizar tus datos';
  const description = showingWriteNetwork
    ? `Las acciones de esta sección necesitan ${effectiveReadiness.targetChainId === 97 ? 'BNB Smart Chain Testnet' : 'BNB Smart Chain'}. Tus lecturas siguen disponibles.`
    : effectiveReadiness.reason === 'offline'
    ? 'Recuperaremos el estado cuando vuelva la conexión.'
    : readiness.reason === 'wrong_chain'
      ? `Esta sección necesita ${readiness.targetChainId === 97 ? 'BNB Smart Chain Testnet' : 'BNB Smart Chain'}.`
      : healthNeedsAttention || readiness.reason === 'service_unavailable'
        ? 'La sección sigue disponible con el último estado confirmado cuando exista.'
        : 'Puedes reintentarlo cuando quieras.';

  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="app-runtime-notice"
      className="relative z-20 flex flex-col gap-3 border-b border-amber-200/15 bg-amber-300/[0.06] px-4 py-3 text-[var(--uki-cream)] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"
    >
      <div className="flex min-w-0 items-start gap-3">
        {effectiveReadiness.reason === 'offline' ? <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" /> : serviceUnavailable ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />}
        <div className="min-w-0">
          <p className="text-sm font-black">{title}</p>
          <p className="mt-0.5 text-xs font-semibold text-white/65">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {(effectiveReadiness.reason === 'wallet_required' || effectiveReadiness.reason === 'signature_required') ? (
          <LandingWalletConnectButton evmOnly className="min-h-9 px-3 text-xs" label={effectiveReadiness.reason === 'signature_required' ? 'Firmar wallet' : 'Conectar wallet'} compactLabel="Continuar" showCompactText />
        ) : effectiveReadiness.reason === 'wrong_chain' ? (
          <button
            type="button"
            className="uki-button uki-button-primary min-h-9 px-3 text-xs"
            onClick={() => void runtime.switchTo(showingWriteNetwork ? writeOperation! : operation)}
          >
            <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
            Cambiar de red
          </button>
        ) : (
          <button
            type="button"
            className="uki-button uki-button-secondary min-h-9 px-3 text-xs"
            onClick={() => void runtime.refresh()}
            disabled={runtime.isRefreshing}
          >
            {runtime.isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            Reintentar
          </button>
        )}
      </div>
    </aside>
  );
}
