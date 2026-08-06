'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Lock, Unlock } from 'lucide-react';
import { formatUnits } from 'viem';

import { Panel } from '@/components/landing/primitives';
import { useAuth } from '@/providers/auth-provider';

type PublicSlot = {
  route: 'uki' | 'nft';
  ordinal: number;
  eligibilityEpoch: number;
  status: 'qualifying' | 'active' | 'grace' | 'inactive';
  creditEligibleFrom: string;
  graceEndsAt: string | null;
};

type PublicRoute = {
  position: null | {
    status: string;
    desiredSlots: number;
    allocatedSlots: number;
    protectedSlots: number;
    graceEndsAt: string | null;
  };
  currentRequirement: Requirement;
  pendingRequirement: Requirement | null;
  requirementGraceEndsAt: string | null;
  deficitToNextSlot: Requirement | null;
  deficitToPreserveSlots: Requirement | null;
  slots: PublicSlot[];
  source: { complete: boolean; status: 'available' | 'unavailable' };
};

type Requirement = { route: 'uki'; ukiRaw: string } | { route: 'nft'; nftPoints: number };

type PublicNft = {
  assetId: string;
  tokenId: string | null;
  rarity: string;
  rarityPoints: number | null;
  state: string;
  lock: null | { lockId: string; fencingToken: number };
  canSoftStake: boolean;
  canUnstake: boolean;
};

type PublicStatus = {
  walletNormalized: string;
  routes: { uki: PublicRoute; nft: PublicRoute };
  totals: { desiredSlots: number; allocatedSlots: number; maxPotentialSlots: 10 };
  nftInventory: PublicNft[];
};

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function dateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function CukieMasterStatusPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [mutatingAsset, setMutatingAsset] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.walletAddress) {
      setStatus(null);
      setState('idle');
      return;
    }
    const controller = new AbortController();
    setState('loading');
    fetch(
      `/api/economy/v1/cukie-master?walletAddress=${encodeURIComponent(user.walletAddress)}`,
      { cache: 'no-store', credentials: 'same-origin', signal: controller.signal },
    )
      .then(async (response) => {
        const body = await response.json() as { data?: PublicStatus };
        if (!response.ok || !body.data) throw new Error('CUKIE_MASTER_UNAVAILABLE');
        setStatus(body.data);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStatus(null);
        setState('unavailable');
      });
    return () => controller.abort();
  }, [authLoading, reloadNonce, user?.walletAddress]);

  async function mutateNft(asset: PublicNft, operation: 'soft_stake' | 'unstake') {
    if (!user?.walletAddress || mutatingAsset) return;
    setMutatingAsset(asset.assetId);
    setMutationError(null);
    try {
      const idempotencyKey = `cukie-master-ui:${user.walletAddress.toLowerCase()}:${operation}:${asset.assetId}:${crypto.randomUUID()}`;
      const response = await fetch('/api/economy/v1/cukie-master', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: user.walletAddress,
          operation,
          assetId: asset.assetId,
          ...(operation === 'unstake' && asset.lock ? {
            lockId: asset.lock.lockId,
            expectedFencingToken: asset.lock.fencingToken,
          } : {}),
          idempotencyKey,
        }),
      });
      if (!response.ok) throw new Error('NFT_OPERATION_FAILED');
      setReloadNonce((value) => value + 1);
    } catch {
      setMutationError('No se pudo completar la operación NFT con garantías. Revisa el estado e inténtalo de nuevo.');
    } finally {
      setMutatingAsset(null);
    }
  }

  return (
    <section id="mi-estado" className="uki-container relative z-[2] pb-10">
      <Panel innerClassName="p-5 sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="uki-label">Estado verificable</p>
            <h2 className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)]">
              Mis cupos Cukie Master
            </h2>
          </div>
          {status ? (
            <p className="text-xs font-semibold text-[var(--uki-muted)]">
              Wallet {shortWallet(status.walletNormalized)}
            </p>
          ) : null}
        </div>

        {authLoading || state === 'loading' ? (
          <div className="mt-6 flex items-center gap-3 text-sm font-semibold text-[var(--uki-text)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--uki-cyan)]" />
            Verificando fuentes e inventario…
          </div>
        ) : null}

        {!authLoading && state === 'idle' ? (
          <p className="mt-6 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
            Conecta y autentica tu wallet para consultar cupos. No se muestra ninguna estimación
            si las fuentes on-chain o el inventario no están completos.
          </p>
        ) : null}

        {state === 'unavailable' ? (
          <div className="mt-6 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              El estado económico no está disponible con garantías ahora mismo. Los cupos
              persistidos no se alteran y volveremos a mostrarlos cuando indexador, bootstrap y
              reconciliación estén saludables.
            </p>
          </div>
        ) : null}

        {state === 'ready' && status ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-[0.72fr_1fr_1fr]">
            <div className="rounded-[8px] border border-[var(--uki-cyan-border)] bg-black/20 p-5">
              <p className="uki-label">Total activo</p>
              <p className="mt-2 font-headline text-4xl font-black text-[var(--uki-cyan)]">
                {status.totals.allocatedSlots}
              </p>
              <p className="mt-2 text-xs font-semibold text-[var(--uki-muted)]">
                de {status.totals.maxPotentialSlots} posibles, máximo 5 por ruta
              </p>
            </div>
            <RouteCard label="Ruta UKI" route={status.routes.uki} />
            <RouteCard label="Ruta Cukies" route={status.routes.nft} />
          </div>
        ) : null}

        {state === 'ready' && status ? (
          <div className="mt-4 rounded-[8px] border border-white/10 bg-black/20 p-5">
            <div>
              <p className="uki-label">Inventario Original BSC</p>
              <h3 className="mt-2 font-headline text-xl font-black uppercase text-[var(--uki-cream)]">
                Soft-staking Cukies
              </h3>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                La operación solo bloquea el uso económico del NFT; nunca transfiere el token ni firma automáticamente.
              </p>
            </div>
            {mutationError ? (
              <p role="alert" className="mt-3 text-sm font-semibold text-amber-300">{mutationError}</p>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {status.nftInventory.length === 0 ? (
                <p className="text-sm font-semibold text-[var(--uki-muted)]">Sin Cukies Originales BSC operables.</p>
              ) : status.nftInventory.map((asset) => (
                <div key={asset.assetId} className="flex items-center justify-between gap-3 rounded-[8px] border border-white/10 p-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--uki-cream)]">
                      Cukie #{asset.tokenId ?? asset.assetId.slice(-8)}
                    </p>
                    <p className="text-xs font-semibold capitalize text-[var(--uki-muted)]">
                      {asset.rarity} · {asset.rarityPoints ?? 0} puntos · {asset.state}
                    </p>
                  </div>
                  {asset.canSoftStake ? (
                    <button
                      type="button"
                      disabled={Boolean(mutatingAsset)}
                      onClick={() => void mutateNft(asset, 'soft_stake')}
                      className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--uki-cyan-border)] px-3 py-2 text-xs font-black uppercase text-[var(--uki-cyan)] disabled:opacity-50"
                    >
                      {mutatingAsset === asset.assetId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                      Activar
                    </button>
                  ) : asset.canUnstake ? (
                    <button
                      type="button"
                      disabled={Boolean(mutatingAsset)}
                      onClick={() => void mutateNft(asset, 'unstake')}
                      className="inline-flex items-center gap-1.5 rounded-[7px] border border-white/15 px-3 py-2 text-xs font-black uppercase text-[var(--uki-text)] disabled:opacity-50"
                    >
                      {mutatingAsset === asset.assetId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                      Retirar
                    </button>
                  ) : (
                    <span className="text-[10px] font-black uppercase text-[var(--uki-muted)]">No disponible</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>
    </section>
  );
}

function RouteCard({ label, route }: { label: string; route: PublicRoute }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-black/20 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-headline text-lg font-black uppercase text-[var(--uki-cream)]">{label}</p>
        {route.source.complete ? (
          <CheckCircle2 className="h-5 w-5 text-[var(--uki-cyan)]" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-300" />
        )}
      </div>
      <p className="mt-3 text-3xl font-black text-[var(--uki-gold)]">
        {route.position?.allocatedSlots ?? 0}
      </p>
      <p className="text-xs font-semibold text-[var(--uki-muted)]">cupos asignados</p>
      <dl className="mt-4 grid gap-2 text-xs font-semibold">
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--uki-muted)]">Requisito actual</dt>
          <dd className="text-right text-[var(--uki-text)]">{requirementLabel(route.currentRequirement)}</dd>
        </div>
        {route.pendingRequirement ? (
          <div className="flex justify-between gap-3">
            <dt className="text-amber-300">Nuevo requisito</dt>
            <dd className="text-right text-amber-200">
              {requirementLabel(route.pendingRequirement)} · hasta {dateLabel(route.requirementGraceEndsAt) ?? '48h'}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--uki-muted)]">Cupos protegidos</dt>
          <dd className="text-right text-[var(--uki-text)]">{route.position?.protectedSlots ?? 0}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--uki-muted)]">
            {route.deficitToPreserveSlots ? 'Déficit para conservar cupos' : 'Déficit próximo cupo'}
          </dt>
          <dd className="text-right text-[var(--uki-text)]">
            {route.deficitToPreserveSlots
              ? requirementLabel(route.deficitToPreserveSlots)
              : route.deficitToNextSlot
                ? requirementLabel(route.deficitToNextSlot)
                : route.source.complete
                  ? 'Máximo alcanzado'
                  : 'No disponible'}
          </dd>
        </div>
      </dl>
      <div className="mt-4 space-y-2">
        {route.slots.length === 0 ? (
          <p className="text-xs font-semibold text-[var(--uki-muted)]">Sin cupos en esta ruta.</p>
        ) : route.slots.map((slot) => (
          <div key={`${slot.route}:${slot.ordinal}:${slot.eligibilityEpoch}`} className="flex items-center justify-between gap-3 text-xs font-semibold">
            <span className="text-[var(--uki-text)]">Cupo {slot.ordinal}</span>
            <span className="flex items-center gap-1.5 text-[var(--uki-muted)]">
              <Clock3 className="h-3.5 w-3.5" />
              {slot.status === 'active'
                ? 'Activo'
                : slot.status === 'grace'
                  ? `Gracia hasta ${dateLabel(slot.graceEndsAt) ?? 'pendiente'}`
                  : slot.status === 'qualifying'
                    ? `Disponible ${dateLabel(slot.creditEligibleFrom) ?? 'tras 24h'}`
                    : 'Inactivo'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function requirementLabel(requirement: Requirement) {
  if (requirement.route === 'nft') return `${requirement.nftPoints} puntos`;
  const formatted = formatUnits(BigInt(requirement.ukiRaw), 18);
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 4 }).format(Number(formatted))} UKI`;
}
