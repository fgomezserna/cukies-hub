'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatUnits } from 'viem';
import {
  ArrowClockwise,
  ArrowRight,
  Check,
  ClockCountdown,
  Copy,
  Crown,
  Gift,
  Handshake,
  LinkSimple,
  LockKey,
  ShareNetwork,
  ShieldCheck,
  SpinnerGap,
  UserPlus,
  UsersThree,
  Warning,
} from '@phosphor-icons/react';

import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { Panel } from '@/components/landing/primitives';
import { useAuth } from '@/providers/auth-provider';

type AttributionSource = 'presale_locked' | 'signed_wallet_session';
type CommissionStatus =
  | 'registered'
  | 'preparing'
  | 'scheduled'
  | 'claimable'
  | 'claimed'
  | 'expired';

type AmbassadorDashboard = {
  walletNormalized: string;
  profile: { invitationCode: string };
  ownAttribution: {
    attributionId: string;
    ambassadorWalletMasked: string;
    source: AttributionSource;
    acceptedAt: string;
    commissionBps: number;
    levels: number;
  } | null;
  referrals: Array<{
    attributionId: string;
    referredWalletMasked: string;
    source: AttributionSource;
    acceptedAt: string;
  }>;
  commissions: {
    totals: {
      totalRaw: string;
      pendingRaw: string;
      claimableRaw: string;
      claimedRaw: string;
      expiredRaw: string;
    };
    history: Array<{
      allocationId: string;
      kind: 'ordinary' | 'weekly';
      periodId: string;
      amountRaw: string;
      status: CommissionStatus;
      availableAt: string;
      sourceCount: number;
    }>;
  };
};

type SummaryResponse = {
  status: 'ok' | 'error';
  dashboard?: AmbassadorDashboard;
  policy?: { version: string; commissionBps: number; levels: number };
  registrationInvitationCode?: string | null;
  code?: string;
};

type Invitation = {
  invitationCode: string;
  ambassadorWalletMasked: string;
};

type InvitationResponse = {
  status: 'ok' | 'error';
  invitation?: Invitation;
  code?: string;
};

function formatUki(raw: string) {
  try {
    const value = Number(formatUnits(BigInt(raw), 18));
    return new Intl.NumberFormat('es-ES', {
      maximumFractionDigits: value > 0 && value < 0.0001 ? 6 : 4,
    }).format(value);
  } catch {
    return '0';
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function periodLabel(periodId: string) {
  const week = /^(\d{4})-W(\d{1,2})$/i.exec(periodId);
  if (week) return `Semana ${Number(week[2])} de ${week[1]}`;
  const day = /^(\d{4}-\d{2}-\d{2})$/.exec(periodId);
  if (day) return formatDate(`${day[1]}T00:00:00.000Z`);
  return 'Cierre de recompensas';
}

const STATUS_COPY: Record<CommissionStatus, { label: string; helper: string }> = {
  registered: { label: 'Registrada', helper: 'Incluida en el cierre económico.' },
  preparing: { label: 'En preparación', helper: 'Se está preparando para publicarla.' },
  scheduled: { label: 'Programada', helper: 'Tendrá una fecha de cobro próxima.' },
  claimable: { label: 'Disponible', helper: 'Ya puedes cobrarla desde Premios.' },
  claimed: { label: 'Cobrada', helper: 'El envío a tu wallet quedó confirmado.' },
  expired: { label: 'Caducada', helper: 'Finalizó su plazo de cobro.' },
};

function sourceCopy(source: AttributionSource) {
  return source === 'presale_locked'
    ? 'Vinculado automáticamente desde la preventa'
    : 'Confirmado mediante invitación';
}

function Metric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="min-w-0 px-5 py-5 sm:px-6">
      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--uki-muted)]">{label}</p>
      <p className="mt-2 font-headline text-3xl font-black tracking-[-0.03em] text-[var(--uki-cream)]">{value}</p>
      <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">{helper}</p>
    </div>
  );
}

function LoadingProgram() {
  return (
    <div role="status" className="space-y-5 pt-7" aria-label="Cargando programa de embajadores">
      <div className="h-36 animate-pulse rounded-[16px] border border-white/10 bg-white/[0.035]" />
      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="h-72 animate-pulse rounded-[16px] border border-white/10 bg-white/[0.035]" />
        <div className="h-72 animate-pulse rounded-[16px] border border-white/10 bg-white/[0.035]" />
      </div>
    </div>
  );
}

export function AmbassadorProgram({ initialInvitationCode }: { initialInvitationCode?: string }) {
  const { user, isLoading: authLoading, walletType } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const [dashboard, setDashboard] = useState<AmbassadorDashboard | null>(null);
  const [policy, setPolicy] = useState<SummaryResponse['policy']>(undefined);
  const [registrationInvitationCode, setRegistrationInvitationCode] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [requestState, setRequestState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [invitationState, setInvitationState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [accepting, setAccepting] = useState(false);
  const [consent, setConsent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!walletAddress || walletType !== 'evm') return;
    setRequestState('loading');
    setFeedback(null);
    try {
      const response = await fetch('/api/economy/v1/ambassadors/summary', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const body = await response.json() as SummaryResponse;
      if (!response.ok || body.status !== 'ok' || !body.dashboard) throw new Error(body.code);
      setDashboard(body.dashboard);
      setPolicy(body.policy);
      setRegistrationInvitationCode(body.registrationInvitationCode ?? null);
      setRequestState('ready');
    } catch {
      setRequestState('error');
      setFeedback('No podemos actualizar el programa ahora. No se ha guardado ningún cambio.');
    }
  }, [walletAddress, walletType]);

  useEffect(() => {
    if (authLoading) return;
    if (!walletAddress || walletType !== 'evm') {
      setDashboard(null);
      setPolicy(undefined);
      setRegistrationInvitationCode(null);
      setRequestState('idle');
      return;
    }
    void loadDashboard();
  }, [authLoading, loadDashboard, walletAddress, walletType]);

  useEffect(() => {
    const code = initialInvitationCode?.trim().toLowerCase();
    if (!code) return;
    const controller = new AbortController();
    setInvitationState('loading');
    fetch(`/api/economy/v1/ambassadors/invitations/${encodeURIComponent(code)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json() as InvitationResponse;
        if (!response.ok || body.status !== 'ok' || !body.invitation) throw new Error(body.code);
        setInvitation(body.invitation);
        setInvitationState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setInvitation(null);
        setInvitationState('error');
      });
    return () => controller.abort();
  }, [initialInvitationCode]);

  const invitationUrl = useMemo(() => {
    if (!dashboard || typeof window === 'undefined') return null;
    return `${window.location.origin}/embajadores/${dashboard.profile.invitationCode}`;
  }, [dashboard]);

  async function copyInvitationLink() {
    if (!invitationUrl) return;
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopied(true);
      setFeedback('Enlace copiado.');
    } catch {
      setFeedback('No se ha podido copiar el enlace.');
    }
  }

  async function shareInvitationLink() {
    if (!invitationUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Cukies World',
          text: 'Únete a Cukies World con mi invitación de embajador.',
          url: invitationUrl,
        });
        return;
      } catch {
        return;
      }
    }
    await copyInvitationLink();
  }

  async function acceptInvitation() {
    if (!invitation || !consent || accepting || dashboard?.ownAttribution) return;
    setAccepting(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/economy/v1/ambassadors/attribution', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ invitationCode: invitation.invitationCode }),
      });
      const body = await response.json() as SummaryResponse;
      if (!response.ok || body.status !== 'ok') throw new Error(body.code);
      setFeedback('Embajador confirmado. Esta relación ya queda protegida.');
      setConsent(false);
      await loadDashboard();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setFeedback(
        code === 'REGISTRATION_ALREADY_COMPLETE'
          ? 'Esta wallet ya estaba registrada y no puede añadir un embajador después del alta.'
          : code === 'CONFLICT'
          ? 'Esta wallet ya tiene otro embajador confirmado y no puede cambiarlo.'
          : code === 'NOT_FOUND'
            ? 'Esta invitación ya no está disponible.'
            : 'No hemos podido confirmar la invitación. No se ha guardado ningún cambio.',
      );
    } finally {
      setAccepting(false);
    }
  }

  const commissionPercent = (policy?.commissionBps ?? 500) / 100;
  const isOwnInvitation = Boolean(
    invitation && dashboard?.profile.invitationCode === invitation.invitationCode,
  );
  const canAcceptInvitation = Boolean(
    invitation && registrationInvitationCode === invitation.invitationCode,
  );

  return (
    <div className="uki-landing mx-auto min-h-full w-full max-w-[1480px] [background:transparent] pb-10 text-[var(--uki-cream)]">
      <header className="relative overflow-hidden border-b border-white/10 pb-7 pt-1 sm:pb-9">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-[var(--uki-lilac)]/10 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)] lg:items-end">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)]">
              <Handshake className="h-5 w-5" weight="bold" aria-hidden="true" />
              Programa de embajadores
            </p>
            <h1 className="mt-2 text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] sm:text-5xl">
              Invita y recibe una parte adicional de sus premios
            </h1>
            <p className="mt-4 max-w-2xl text-pretty text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">
              Recibes el {commissionPercent.toLocaleString('es-ES')}% de los premios elegibles que generen tus invitados. Ellos mantienen el 100% de lo que ganen.
            </p>
          </div>
          <div className="border-l-2 border-[var(--uki-lilac)] pl-4">
            <p className="text-xs font-black uppercase tracking-[0.13em] text-[var(--uki-lilac)]">Una relación directa</p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
              Un nivel, sin comisiones encadenadas y sin cambios retroactivos. Los referidos confirmados en preventa ya están incluidos automáticamente.
            </p>
          </div>
        </div>
      </header>

      {initialInvitationCode ? (
        <section aria-labelledby="invitation-title" className="pt-7">
          <Panel innerClassName="p-5 sm:p-7">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.48fr)] lg:items-center">
              <div>
                <p className="uki-label">Has recibido una invitación</p>
                <h2 id="invitation-title" className="mt-2 font-headline text-2xl font-black sm:text-3xl">Confirma quién te invitó</h2>
                {invitationState === 'loading' ? (
                  <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--uki-muted)]">
                    <SpinnerGap className="h-4 w-4 animate-spin text-[var(--uki-lilac)]" /> Comprobando la invitación…
                  </p>
                ) : invitationState === 'error' ? (
                  <p role="alert" className="mt-4 flex items-start gap-2 text-sm font-semibold text-amber-200">
                    <Warning className="mt-0.5 h-4 w-4 shrink-0" weight="fill" /> Esta invitación no existe o ya no puede utilizarse.
                  </p>
                ) : invitation ? (
                  <div className="mt-4 flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-full border border-[var(--uki-lilac)]/30 bg-[var(--uki-lilac)]/10">
                      <Crown className="h-5 w-5 text-[var(--uki-lilac)]" weight="fill" />
                    </span>
                    <div>
                      <p className="font-mono text-base font-black text-[var(--uki-cream)]">{invitation.ambassadorWalletMasked}</p>
                      <p className="mt-0.5 text-xs font-semibold text-[var(--uki-muted)]">Será tu embajador directo</p>
                    </div>
                  </div>
                ) : null}
              </div>

              {invitation &&
              !dashboard?.ownAttribution &&
              walletAddress &&
              canAcceptInvitation &&
              !isOwnInvitation ? (
                <div className="rounded-[12px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/[0.055] p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                      className="mt-1 h-4 w-4 accent-[var(--uki-lilac)]"
                    />
                    <span className="text-xs font-semibold leading-relaxed text-[var(--uki-text)]">
                      Entiendo que esta relación es permanente y no podré sustituirla más adelante.
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={acceptInvitation}
                    disabled={!consent || accepting}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[9px] bg-[var(--uki-lilac)] px-4 font-headline text-sm font-black text-[#09060f] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {accepting ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" weight="bold" />}
                    Confirmar embajador
                  </button>
                </div>
              ) : !walletAddress && invitation ? (
                <LandingWalletConnectButton
                  evmOnly
                  ambassadorInvitationCode={invitation.invitationCode}
                  showCompactText={false}
                  label="Conectar para confirmar"
                  compactLabel="Conectar"
                />
              ) : dashboard?.ownAttribution ? (
                <div className="flex items-start gap-3 rounded-[12px] border border-white/10 bg-white/[0.035] p-4">
                  <LockKey className="mt-0.5 h-5 w-5 shrink-0 text-[var(--uki-lilac)]" weight="fill" />
                  <p className="text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">Tu wallet ya tiene un embajador confirmado.</p>
                </div>
              ) : isOwnInvitation ? (
                <p className="text-sm font-semibold text-amber-200">No puedes aceptar tu propia invitación.</p>
              ) : walletAddress &&
                invitation &&
                requestState === 'ready' &&
                !canAcceptInvitation ? (
                <div className="flex items-start gap-3 rounded-[12px] border border-white/10 bg-white/[0.035] p-4">
                  <LockKey className="mt-0.5 h-5 w-5 shrink-0 text-[var(--uki-lilac)]" weight="fill" />
                  <p className="text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                    Esta wallet ya estaba registrada. Las invitaciones solo se pueden confirmar durante el alta inicial.
                  </p>
                </div>
              ) : null}
            </div>
          </Panel>
        </section>
      ) : null}

      {feedback ? (
        <div role="status" className="mt-5 flex items-start gap-3 rounded-[10px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/[0.06] p-4 text-sm font-semibold text-[var(--uki-text)]">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-lilac)]" weight="bold" /> {feedback}
        </div>
      ) : null}

      {authLoading || requestState === 'loading' ? <LoadingProgram /> : null}

      {!initialInvitationCode &&
      !authLoading &&
      (!walletAddress || walletType !== 'evm') ? (
        <section className="grid min-h-[28rem] overflow-hidden rounded-[18px] border border-[var(--uki-lilac)]/25 bg-[#09060f] lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col justify-center p-6 sm:p-10">
            <UsersThree className="h-8 w-8 text-[var(--uki-lilac)]" weight="fill" />
            <h2 className="mt-5 max-w-xl font-headline text-3xl font-black sm:text-4xl">Conecta tu wallet para abrir tu programa</h2>
            <p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
              Verás tu enlace, los invitados confirmados y cada comisión desde que se registra hasta que llega a tu wallet.
            </p>
            <LandingWalletConnectButton evmOnly className="mt-6 w-fit" showCompactText={false} />
          </div>
          <div className="relative grid min-h-[18rem] place-items-center border-t border-white/10 bg-[var(--uki-lilac)]/[0.045] lg:border-l lg:border-t-0">
            <Handshake className="h-28 w-28 text-[var(--uki-lilac)]/80" weight="duotone" />
          </div>
        </section>
      ) : null}

      {requestState === 'error' && walletAddress ? (
        <div role="alert" className="mt-7 flex flex-col gap-4 rounded-[14px] border border-amber-300/25 bg-amber-300/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-black">No podemos cargar tu programa ahora</p>
            <p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">Tus relaciones y comisiones no se han modificado.</p>
          </div>
          <button type="button" onClick={loadDashboard} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border border-white/15 px-4 text-sm font-black">
            <ArrowClockwise className="h-4 w-4" weight="bold" /> Reintentar
          </button>
        </div>
      ) : null}

      {requestState === 'ready' && dashboard ? (
        <>
          <section aria-labelledby="summary-title" className="pt-7">
            <div className="flex items-end justify-between gap-4 pb-4">
              <div>
                <p className="uki-label">Tu programa de un vistazo</p>
                <h2 id="summary-title" className="mt-2 font-headline text-2xl font-black sm:text-3xl">Lo que ya has generado</h2>
              </div>
              <button type="button" onClick={loadDashboard} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-lilac)]">
                <ArrowClockwise className="h-4 w-4" weight="bold" /> Actualizar
              </button>
            </div>
            <div className="grid overflow-hidden rounded-[16px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/[0.055] sm:grid-cols-2 xl:grid-cols-4 sm:[&>*+*]:border-l sm:[&>*+*]:border-white/10">
              <Metric label="Invitados confirmados" value={dashboard.referrals.length.toLocaleString('es-ES')} helper="Relaciones directas y permanentes" />
              <Metric label="En preparación" value={`${formatUki(dashboard.commissions.totals.pendingRaw)} UKI`} helper="Registrado antes de su publicación" />
              <Metric label="Disponible" value={`${formatUki(dashboard.commissions.totals.claimableRaw)} UKI`} helper="Ya puede cobrarse en Premios" />
              <Metric label="Cobrado" value={`${formatUki(dashboard.commissions.totals.claimedRaw)} UKI`} helper="Confirmado en tu wallet" />
            </div>
          </section>

          <section className="grid gap-5 pt-7 lg:grid-cols-[1.08fr_0.92fr]">
            <Panel innerClassName="p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="uki-label">Comparte tu invitación</p>
                  <h2 className="mt-2 font-headline text-2xl font-black">Tu enlace de embajador</h2>
                </div>
                <LinkSimple className="h-7 w-7 shrink-0 text-[var(--uki-lilac)]" weight="bold" />
              </div>
              <p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                La persona invitada verá tu wallet abreviada y decidirá si confirma la relación. Tu dirección completa no aparece en el enlace.
              </p>
              <div className="mt-5 overflow-hidden rounded-[10px] border border-white/10 bg-black/25">
                <p className="break-all px-4 py-3 font-mono text-xs text-[var(--uki-text)]">{invitationUrl}</p>
                <div className="grid border-t border-white/10 sm:grid-cols-2">
                  <button type="button" onClick={copyInvitationLink} className="inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-black text-[var(--uki-lilac)] transition active:scale-[0.98]">
                    {copied ? <Check className="h-4 w-4" weight="bold" /> : <Copy className="h-4 w-4" weight="bold" />}
                    {copied ? 'Copiado' : 'Copiar enlace'}
                  </button>
                  <button type="button" onClick={shareInvitationLink} className="inline-flex min-h-11 items-center justify-center gap-2 border-t border-white/10 px-4 text-sm font-black text-[var(--uki-cream)] transition active:scale-[0.98] sm:border-l sm:border-t-0">
                    <ShareNetwork className="h-4 w-4" weight="bold" /> Compartir
                  </button>
                </div>
              </div>
            </Panel>

            <Panel innerClassName="p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="uki-label">Tu relación</p>
                  <h2 className="mt-2 font-headline text-2xl font-black">Mi embajador</h2>
                </div>
                <ShieldCheck className="h-7 w-7 shrink-0 text-[var(--uki-lilac)]" weight="fill" />
              </div>
              {dashboard.ownAttribution ? (
                <div className="mt-5 rounded-[12px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/[0.055] p-5">
                  <p className="font-mono text-lg font-black">{dashboard.ownAttribution.ambassadorWalletMasked}</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--uki-lilac)]">{sourceCopy(dashboard.ownAttribution.source)}</p>
                  <p className="mt-2 text-xs font-semibold text-[var(--uki-muted)]">Desde el {formatDate(dashboard.ownAttribution.acceptedAt)}. Esta relación no puede sustituirse.</p>
                </div>
              ) : (
                <div className="mt-5 flex items-start gap-3 rounded-[12px] border border-white/10 bg-white/[0.035] p-5">
                  <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-[var(--uki-lilac)]" weight="bold" />
                  <div>
                    <p className="font-black">No tienes embajador</p>
                    <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">Solo se asignará cuando abras un enlace válido y lo confirmes con tu wallet.</p>
                  </div>
                </div>
              )}
            </Panel>
          </section>

          <section aria-labelledby="referrals-title" className="pt-10">
            <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="uki-label">Relaciones confirmadas</p>
                <h2 id="referrals-title" className="mt-2 font-headline text-2xl font-black sm:text-3xl">Tus invitados</h2>
                <p className="mt-2 text-sm font-semibold text-[var(--uki-muted)]">Aquí aparecen tanto las nuevas invitaciones como los referidos confirmados durante la preventa.</p>
              </div>
              <span className="font-headline text-3xl font-black text-[var(--uki-lilac)]">{dashboard.referrals.length}</span>
            </div>
            {dashboard.referrals.length === 0 ? (
              <div className="flex min-h-44 flex-col items-center justify-center border-b border-white/10 px-5 py-8 text-center">
                <UsersThree className="h-9 w-9 text-[var(--uki-lilac)]" weight="duotone" />
                <p className="mt-4 font-headline text-xl font-black">Todavía no tienes invitados confirmados</p>
                <p className="mt-2 max-w-lg text-sm font-semibold text-[var(--uki-muted)]">Comparte tu enlace. La relación aparecerá aquí en cuanto la otra wallet la confirme.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/10 border-b border-white/10">
                {dashboard.referrals.map((referral) => (
                  <article key={referral.attributionId} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/[0.07]">
                        <Check className="h-4 w-4 text-[var(--uki-lilac)]" weight="bold" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-black">{referral.referredWalletMasked}</p>
                        <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">{sourceCopy(referral.source)}</p>
                      </div>
                    </div>
                    <p className="pl-[3.25rem] text-xs font-semibold text-[var(--uki-muted)] sm:pl-0">Confirmado el {formatDate(referral.acceptedAt)}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section id="comisiones" aria-labelledby="commissions-title" className="scroll-mt-24 pt-10">
            <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="uki-label">Movimientos de embajador</p>
                <h2 id="commissions-title" className="mt-2 font-headline text-2xl font-black sm:text-3xl">Tus comisiones</h2>
                <p className="mt-2 text-sm font-semibold text-[var(--uki-muted)]">Cada fila explica cuándo se registró y en qué estado se encuentra.</p>
              </div>
              <Link href="/premios?category=ambassador" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border border-[var(--uki-lilac)]/35 px-4 text-sm font-black text-[var(--uki-lilac)]">
                Ver en Premios <ArrowRight className="h-4 w-4" weight="bold" />
              </Link>
            </div>
            {dashboard.commissions.history.length === 0 ? (
              <div className="flex min-h-44 flex-col items-center justify-center border-b border-white/10 px-5 py-8 text-center">
                <Gift className="h-9 w-9 text-[var(--uki-lilac)]" weight="duotone" />
                <p className="mt-4 font-headline text-xl font-black">Aún no se han generado comisiones</p>
                <p className="mt-2 max-w-lg text-sm font-semibold text-[var(--uki-muted)]">Aparecerán cuando un invitado confirmado reciba un premio elegible.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/10 border-b border-white/10">
                {dashboard.commissions.history.map((entry) => {
                  const status = STATUS_COPY[entry.status];
                  return (
                    <article key={entry.allocationId} className="grid gap-4 py-5 md:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.7fr)_auto] md:items-center">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/[0.07]">
                          {entry.status === 'claimable' || entry.status === 'claimed'
                            ? <Check className="h-4 w-4 text-[var(--uki-lilac)]" weight="bold" />
                            : <ClockCountdown className="h-4 w-4 text-[var(--uki-lilac)]" weight="bold" />}
                        </span>
                        <div>
                          <p className="font-black">{entry.kind === 'weekly' ? 'Comisión semanal' : 'Comisión por premios'}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">{periodLabel(entry.periodId)} · {entry.sourceCount} {entry.sourceCount === 1 ? 'origen' : 'orígenes'}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-lilac)]">{status.label}</p>
                        <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">{status.helper}</p>
                      </div>
                      <p className="font-headline text-2xl font-black text-[var(--uki-cream)]">{formatUki(entry.amountRaw)} UKI</p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="pt-10">
            <Panel innerClassName="overflow-hidden">
              <div className="grid gap-px bg-white/10 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="bg-[#0d0914] p-5 sm:p-7">
                  <p className="uki-label">Reglas claras</p>
                  <h2 className="mt-2 font-headline text-2xl font-black">Cómo funciona</h2>
                  <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">El sistema conserva la relación y calcula la comisión usando la atribución vigente cuando se crea la partida o se cierra el periodo.</p>
                </div>
                <ol className="divide-y divide-white/10 bg-[#0d0914]">
                  {[
                    ['01', 'Una sola confirmación', 'El invitado acepta la relación una vez. Si venía de la preventa, ya aparece confirmada automáticamente.'],
                    ['02', 'El invitado no pierde nada', `El invitado recibe su premio completo y tú recibes un ${commissionPercent.toLocaleString('es-ES')}% adicional.`],
                    ['03', 'Sin cambios retroactivos', 'La vinculación nueva solo afecta a premios posteriores. No hay segundo nivel ni comisión sobre otra comisión.'],
                    ['04', 'Cobro desde Premios', 'La comisión se registra con el cierre correspondiente y se cobra mediante el mismo sistema de premios UKI.'],
                  ].map(([number, title, description]) => (
                    <li key={number} className="grid gap-2 p-5 sm:grid-cols-[44px_minmax(0,1fr)] sm:p-6">
                      <span className="font-headline text-sm font-black text-[var(--uki-lilac)]">{number}</span>
                      <div>
                        <p className="font-black">{title}</p>
                        <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">{description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </Panel>
          </section>
        </>
      ) : null}
    </div>
  );
}
