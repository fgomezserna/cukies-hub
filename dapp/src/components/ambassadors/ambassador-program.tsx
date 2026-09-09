'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { formatUnits } from 'viem';
import { useSignMessage } from 'wagmi';
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

type AttributionSource = 'presale_locked' | 'presale_default' | 'signed_wallet_session' | 'admin_override';
type CommissionStatus =
  | 'registered'
  | 'preparing'
  | 'scheduled'
  | 'claimable'
  | 'claimed'
  | 'expired';

type AmbassadorDashboard = {
  walletNormalized: string;
  profile: { invitationCode: string } | null;
  enrollment: {
    isPresaleParticipant: boolean;
    canChooseSponsor: boolean;
    canInvite: boolean;
    isCukieMaster?: boolean | null;
    hasConfirmedSponsor?: boolean;
    eligibilityReason?: string | null;
  };
  defaultAmbassador: { ambassadorWalletMasked: string } | null;
  ownAttribution: {
    attributionId: string;
    ambassadorWalletMasked: string;
    isCukiesWorld: boolean;
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
  if (source === 'presale_locked') return 'Vinculado automáticamente desde la preventa';
  if (source === 'presale_default') return 'Vinculado automáticamente a Cukies World';
  if (source === 'admin_override') return 'Asignado por administración';
  return 'Confirmado con tu wallet';
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

const PENDING_INVITATION_KEY = 'cukies:ambassador:pending-invitation';

function storedInvitation() {
  try {
    return window.sessionStorage.getItem(PENDING_INVITATION_KEY)?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

function confirmationError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    AMBASSADOR_CYCLE: 'No puedes registrarte con este embajador porque formarías un ciclo.',
    PRESALE_SPONSOR_LOCKED: 'Participaste en la preventa y ya no puedes asignarte un embajador.',
    AMBASSADOR_ALREADY_CONFIRMED: 'Esta wallet ya tiene un embajador confirmado y no puede cambiarlo.',
    INVALID_SIGNATURE: 'No hemos podido validar la firma. Vuelve a confirmar con tu wallet.',
    AMBASSADOR_CONFIRMATION_REQUIRED: 'Confirma tu embajador con una firma en tu wallet.',
    AMBASSADOR_DEFAULT_WALLET_NOT_CONFIGURED: 'Ahora no podemos confirmar a Cukies World como embajador. Tu selección se conserva; inténtalo más tarde.',
    AMBASSADOR_CONFIRMATION_SECRET_NOT_CONFIGURED: 'La confirmación de embajador no está disponible ahora. Tu selección se conserva; inténtalo más tarde.',
    NOT_FOUND: 'Esta invitación ya no está disponible.',
  };
  return messages[code] ?? 'No hemos podido confirmar la invitación. Tu invitación pendiente se conserva; vuelve a intentarlo.';
}

export function AmbassadorProgram({ initialInvitationCode }: { initialInvitationCode?: string }) {
  const { user, isLoading: authLoading, walletType } = useAuth();
  const { signMessageAsync } = useSignMessage();
  const walletAddress = user?.walletAddress ?? null;
  const walletKey = walletType === 'evm' ? walletAddress?.toLowerCase() ?? null : null;
  const [dashboard, setDashboard] = useState<AmbassadorDashboard | null>(null);
  const [policy, setPolicy] = useState<SummaryResponse['policy']>(undefined);
  const [pendingInvitationCode, setPendingInvitationCode] = useState<string | null>(
    initialInvitationCode?.trim().toLowerCase() || null,
  );
  const [resolvedInvitation, setResolvedInvitation] = useState<Invitation | null>(null);
  const invitation = resolvedInvitation?.invitationCode === pendingInvitationCode ? resolvedInvitation : null;
  const [requestState, setRequestState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [invitationState, setInvitationState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [accepting, setAccepting] = useState(false);
  const [consent, setConsent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const mounted = useRef(false);
  const currentWallet = useRef(walletKey);
  currentWallet.current = walletKey;
  const dashboardRequest = useRef(0);
  const confirmationContextKey = JSON.stringify([walletKey, pendingInvitationCode, initialInvitationCode]);
  const confirmationContext = useRef({ key: confirmationContextKey });
  if (confirmationContext.current.key !== confirmationContextKey) {
    confirmationContext.current = { key: confirmationContextKey };
  }
  const activeConfirmation = useRef<object | null>(null);
  const currentDashboard = dashboard?.walletNormalized.toLowerCase() === walletKey ? dashboard : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      dashboardRequest.current += 1;
      activeConfirmation.current = null;
    };
  }, []);

  useEffect(() => {
    const code = initialInvitationCode?.trim().toLowerCase();
    if (code) {
      try {
        window.sessionStorage.setItem(PENDING_INVITATION_KEY, code);
      } catch {
        // The invitation still works in memory when browser storage is unavailable.
      }
    }
    setPendingInvitationCode(code || storedInvitation());
  }, [initialInvitationCode]);

  useEffect(() => {
    activeConfirmation.current = null;
    setAccepting(false);
    setConsent(false);
  }, [confirmationContextKey]);

  const loadDashboard = useCallback(async () => {
    if (!walletKey) return;
    const requestId = ++dashboardRequest.current;
    const isCurrent = () => mounted.current && currentWallet.current === walletKey && dashboardRequest.current === requestId;
    setRequestState('loading');
    setFeedback((previous) => previous?.error ? null : previous);
    try {
      const response = await fetch('/api/economy/v1/ambassadors/summary', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const body = await response.json() as SummaryResponse;
      if (!isCurrent()) return;
      if (!response.ok || body.status !== 'ok' || !body.dashboard || body.dashboard.walletNormalized.toLowerCase() !== walletKey) {
        throw new Error(body.code);
      }
      setDashboard(body.dashboard);
      setPolicy(body.policy);
      setRequestState('ready');
    } catch {
      if (!isCurrent()) return;
      setRequestState('error');
      setFeedback({ message: 'No podemos actualizar el programa ahora. Tus relaciones y comisiones se conservan.', error: true });
    }
  }, [walletKey]);

  useEffect(() => {
    dashboardRequest.current += 1;
    setDashboard(null);
    setPolicy(undefined);
    setFeedback(null);
    setCopied(false);
    setRequestState('idle');
    if (!authLoading && walletKey) void loadDashboard();
    return () => { dashboardRequest.current += 1; };
  }, [authLoading, loadDashboard, walletKey]);

  useEffect(() => {
    setResolvedInvitation(null);
    if (!pendingInvitationCode) {
      setInvitationState('idle');
      return;
    }
    const controller = new AbortController();
    setInvitationState('loading');
    fetch(`/api/economy/v1/ambassadors/invitations/${encodeURIComponent(pendingInvitationCode)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json() as InvitationResponse;
        if (controller.signal.aborted) return;
        if (!response.ok || body.status !== 'ok' || !body.invitation) throw new Error(body.code);
        setResolvedInvitation(body.invitation);
        setInvitationState('ready');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setResolvedInvitation(null);
        setInvitationState('error');
      });
    return () => controller.abort();
  }, [pendingInvitationCode]);

  const invitationUrl = useMemo(() => {
    if (
      !currentDashboard?.enrollment.canInvite ||
      currentDashboard.enrollment.isCukieMaster === false ||
      !currentDashboard.profile ||
      typeof window === 'undefined'
    ) return null;
    return `${window.location.origin}/embajadores/${currentDashboard.profile.invitationCode}`;
  }, [currentDashboard]);

  async function copyInvitationLink() {
    if (!invitationUrl) return;
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopied(true);
      setFeedback({ message: 'Enlace copiado.' });
    } catch {
      setFeedback({ message: 'No se ha podido copiar el enlace.', error: true });
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

  const defaultAmbassador = !pendingInvitationCode ? currentDashboard?.defaultAmbassador : null;
  const proposedAmbassador = invitation ?? defaultAmbassador;
  const isOwnInvitation = Boolean(
    invitation && currentDashboard?.profile?.invitationCode === invitation.invitationCode,
  );
  const hasConfirmedSponsor = Boolean(
    currentDashboard && (
      (currentDashboard.enrollment.hasConfirmedSponsor
      ?? Boolean(currentDashboard.ownAttribution))
    ),
  );
  const isEligibilityUnknown = Boolean(
    currentDashboard &&
    currentDashboard.enrollment.isCukieMaster === null &&
    !currentDashboard.enrollment.canInvite,
  );
  const canShowDashboard = Boolean(currentDashboard && hasConfirmedSponsor);

  async function acceptInvitation() {
    if (!proposedAmbassador || !consent || activeConfirmation.current || !walletAddress || !currentDashboard?.enrollment.canChooseSponsor || currentDashboard.ownAttribution || isOwnInvitation) return;
    const context = confirmationContext.current;
    const operation = {};
    activeConfirmation.current = operation;
    const isCurrent = () => mounted.current && confirmationContext.current === context && activeConfirmation.current === operation;
    const target = invitation ? { invitationCode: invitation.invitationCode } : { sponsor: 'cukies_world' as const };
    setAccepting(true);
    setFeedback(null);
    try {
      const challengeResponse = await fetch('/api/economy/v1/ambassadors/confirmation', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(target),
      });
      const challenge = await challengeResponse.json() as { status: string; message?: string; code?: string };
      if (!isCurrent()) return;
      if (!challengeResponse.ok || challenge.status !== 'ok' || !challenge.message) throw new Error(challenge.code);
      let signature: string;
      try {
        signature = await signMessageAsync({ account: walletAddress as `0x${string}`, message: challenge.message });
      } catch {
        if (isCurrent()) setFeedback({ message: 'No se ha completado la firma. Tu invitación pendiente se conserva y puedes volver a intentarlo.', error: true });
        return;
      }
      if (!isCurrent()) return;
      const response = await fetch('/api/economy/v1/ambassadors/attribution', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...target, signature }),
      });
      const body = await response.json() as SummaryResponse;
      if (!isCurrent()) return;
      if (!response.ok || body.status !== 'ok') throw new Error(body.code);
      try {
        if (storedInvitation() === pendingInvitationCode) window.sessionStorage.removeItem(PENDING_INVITATION_KEY);
      } catch {
        // Confirmation is valid even if browser storage is unavailable.
      }
      setPendingInvitationCode(null);
      setResolvedInvitation(null);
      setConsent(false);
      setFeedback({ message: 'Embajador confirmado. Esta relación ya queda protegida.' });
      await loadDashboard();
    } catch (error) {
      if (isCurrent()) setFeedback({ message: confirmationError(error), error: true });
    } finally {
      if (isCurrent()) {
        activeConfirmation.current = null;
        setAccepting(false);
      }
    }
  }

  const commissionPercent = (policy?.commissionBps ?? 500) / 100;

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
              {currentDashboard?.enrollment.isCukieMaster === false
                ? 'Conservas tu código, tus referidos y el historial de comisiones. Activa Cukie Master para volver a invitar y generar nuevas comisiones.'
                : isEligibilityUnknown
                  ? 'No podemos comprobar ahora si cumples el requisito Cukie Master. Reintenta para conocer el estado de tu programa.'
                  : `Recibes el ${commissionPercent.toLocaleString('es-ES')}% de los premios elegibles que generen tus invitados. Ellos mantienen el 100% de lo que ganen.`}
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

      {pendingInvitationCode || (currentDashboard?.enrollment.canChooseSponsor && requestState === 'ready') ? (
        <section aria-labelledby="invitation-title" className="pt-7">
          <Panel innerClassName="p-5 sm:p-7">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.48fr)] lg:items-center">
              <div>
                <p className="uki-label">{pendingInvitationCode ? 'Has recibido una invitación' : 'Tu embajador propuesto'}</p>
                <h2 id="invitation-title" className="mt-2 font-headline text-2xl font-black sm:text-3xl">{pendingInvitationCode ? 'Confirma quién te invitó' : 'Confirma tu embajador'}</h2>
                {!hasConfirmedSponsor && !pendingInvitationCode && defaultAmbassador ? (
                  <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-lilac)]">Confirmación de embajador pendiente</p>
                ) : null}
                {invitationState === 'loading' ? (
                  <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--uki-muted)]">
                    <SpinnerGap className="h-4 w-4 animate-spin text-[var(--uki-lilac)]" /> Comprobando la invitación…
                  </p>
                ) : invitationState === 'error' ? (
                  <p role="alert" className="mt-4 flex items-start gap-2 text-sm font-semibold text-amber-200">
                    <Warning className="mt-0.5 h-4 w-4 shrink-0" weight="fill" /> Esta invitación no existe o ya no puede utilizarse.
                  </p>
                ) : proposedAmbassador ? (
                  <div className="mt-4 flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-full border border-[var(--uki-lilac)]/30 bg-[var(--uki-lilac)]/10">
                      <Crown className="h-5 w-5 text-[var(--uki-lilac)]" weight="fill" />
                    </span>
                    <div>
                      {defaultAmbassador ? <p className="font-black text-[var(--uki-cream)]">Cukies World</p> : null}
                      <p className="font-mono text-base font-black text-[var(--uki-cream)]">{proposedAmbassador.ambassadorWalletMasked}</p>
                      <p className="mt-0.5 text-xs font-semibold text-[var(--uki-muted)]">{currentDashboard && !currentDashboard.enrollment.canChooseSponsor ? 'Wallet que te invita' : 'Será tu embajador directo'}</p>
                    </div>
                  </div>
                ) : !pendingInvitationCode ? (
                  <p className="mt-4 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">Ahora no podemos ofrecerte un embajador. Puedes seguir navegando y volver a intentarlo más adelante.</p>
                ) : null}
              </div>

              {proposedAmbassador &&
              currentDashboard?.enrollment.canChooseSponsor &&
              !currentDashboard?.ownAttribution &&
              walletAddress &&
              requestState === "ready" &&
              !isOwnInvitation ? (
                <div className="rounded-[12px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/[0.055] p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={consent}
                      disabled={accepting}
                      onChange={(event) => setConsent(event.target.checked)}
                      className="mt-1 h-4 w-4 accent-[var(--uki-lilac)]"
                    />
                    <span className="text-xs font-semibold leading-relaxed text-[var(--uki-text)]">
                      Entiendo que esta relación es permanente y no podré sustituirla más adelante. La confirmaré con una firma en mi wallet, sin gas.
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={acceptInvitation}
                    disabled={!consent || accepting}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[9px] bg-[var(--uki-lilac)] px-4 font-headline text-sm font-black text-[#09060f] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {accepting ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" weight="bold" />}
                    {accepting ? 'Esperando confirmación…' : 'Confirmar embajador'}
                  </button>
                </div>
              ) : !walletAddress && invitation ? (
                <LandingWalletConnectButton
                  evmOnly
                  showCompactText={false}
                  label="Conectar para confirmar"
                  compactLabel="Conectar"
                />
              ) : currentDashboard?.ownAttribution ? (
                <div className="flex items-start gap-3 rounded-[12px] border border-white/10 bg-white/[0.035] p-4">
                  <LockKey className="mt-0.5 h-5 w-5 shrink-0 text-[var(--uki-lilac)]" weight="fill" />
                  <p className="text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">Tu wallet ya tiene un embajador confirmado.</p>
                </div>
              ) : currentDashboard?.enrollment.isPresaleParticipant ? (
                <p className="text-sm font-semibold text-[var(--uki-muted)]">Participaste en la preventa y ya no puedes asignarte un embajador. Conservas tu enlace para invitar.</p>
              ) : isOwnInvitation ? (
                <p className="text-sm font-semibold text-amber-200">No puedes aceptar tu propia invitación.</p>
              ) : null}
            </div>
          </Panel>
        </section>
      ) : null}

      {feedback ? (
        <div role={feedback.error ? 'alert' : 'status'} className="mt-5 flex items-start gap-3 rounded-[10px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/[0.06] p-4 text-sm font-semibold text-[var(--uki-text)]">
          {feedback.error ? <Warning className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" weight="bold" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-lilac)]" weight="bold" />} {feedback.message}
        </div>
      ) : null}

      {authLoading || requestState === 'loading' ? <LoadingProgram /> : null}

      {!pendingInvitationCode &&
      !authLoading &&
      (!walletAddress || walletType !== 'evm') ? (
        <section className="grid min-h-[28rem] overflow-hidden rounded-[18px] border border-[var(--uki-lilac)]/25 bg-[#09060f] lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col justify-center p-6 sm:p-10">
            <UsersThree className="h-8 w-8 text-[var(--uki-lilac)]" weight="fill" />
            <h2 className="mt-5 max-w-xl font-headline text-3xl font-black sm:text-4xl">Conecta tu wallet para abrir tu programa</h2>
            <p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
              Puedes conectar y navegar sin confirmar ningún embajador. Si llegas con una invitación, se conservará hasta que decidas confirmarla.
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

      {requestState === 'ready' && canShowDashboard && currentDashboard ? (
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
              <Metric label="Invitados confirmados" value={currentDashboard.referrals.length.toLocaleString('es-ES')} helper="Relaciones directas y permanentes" />
              <Metric label="En preparación" value={`${formatUki(currentDashboard.commissions.totals.pendingRaw)} UKI`} helper="Registrado antes de su publicación" />
              <Metric label="Disponible" value={`${formatUki(currentDashboard.commissions.totals.claimableRaw)} UKI`} helper="Ya puede cobrarse en Premios" />
              <Metric label="Cobrado" value={`${formatUki(currentDashboard.commissions.totals.claimedRaw)} UKI`} helper="Confirmado en tu wallet" />
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
              <div className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                {invitationUrl ? (
                  'La persona invitada verá tu wallet abreviada y decidirá si confirma la relación. Tu dirección completa no aparece en el enlace.'
                ) : currentDashboard.enrollment.isCukieMaster === false ? (
                  <>
                    <p>Tus referidos, tu código y el historial de comisiones se conservan. Activa Cukie Master para volver a usar el mismo enlace y generar nuevas comisiones.</p>
                    <Link href="/cukie-master" className="mt-4 inline-flex items-center gap-2 font-black text-[var(--uki-lilac)]">
                      Activar Cukie Master <ArrowRight className="h-4 w-4" weight="bold" />
                    </Link>
                  </>
                ) : isEligibilityUnknown ? (
                  <>
                    <p>No se puede comprobar ahora si cumples el requisito Cukie Master. Tus datos se conservan; reintenta para volver a comprobarlo.</p>
                    <button type="button" onClick={loadDashboard} className="mt-4 inline-flex items-center gap-2 font-black text-[var(--uki-lilac)]">
                      Reintentar <ArrowClockwise className="h-4 w-4" weight="bold" />
                    </button>
                  </>
                ) : (
                  'Tu enlace todavía no está disponible. Actualiza para volver a comprobar el estado de tu programa.'
                )}
              </div>
              {invitationUrl ? <div className="mt-5 overflow-hidden rounded-[10px] border border-white/10 bg-black/25">
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
              </div> : !hasConfirmedSponsor ? <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-[var(--uki-lilac)]"><LockKey className="h-5 w-5 shrink-0" weight="fill" /> Confirmación de embajador pendiente</p> : null}
            </Panel>

            <Panel innerClassName="p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="uki-label">Tu relación</p>
                  <h2 className="mt-2 font-headline text-2xl font-black">Mi embajador</h2>
                </div>
                <ShieldCheck className="h-7 w-7 shrink-0 text-[var(--uki-lilac)]" weight="fill" />
              </div>
              {currentDashboard.ownAttribution ? (
                <div className="mt-5 rounded-[12px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/[0.055] p-5">
                  {currentDashboard.ownAttribution.isCukiesWorld ? <p className="mb-1 font-black">Cukies World</p> : null}
                  <p className="font-mono text-lg font-black">{currentDashboard.ownAttribution.ambassadorWalletMasked}</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--uki-lilac)]">{sourceCopy(currentDashboard.ownAttribution.source)}</p>
                  <p className="mt-2 text-xs font-semibold text-[var(--uki-muted)]">Desde el {formatDate(currentDashboard.ownAttribution.acceptedAt)}. No puedes sustituirla desde tu cuenta; administración o soporte puede corregirla con autorización y trazabilidad.</p>
                </div>
              ) : (
                <div className="mt-5 flex items-start gap-3 rounded-[12px] border border-white/10 bg-white/[0.035] p-5">
                  <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-[var(--uki-lilac)]" weight="bold" />
                  <div>
                    <p className="font-black">{currentDashboard.enrollment.isPresaleParticipant ? 'Sin embajador en la preventa' : 'Embajador pendiente de confirmar'}</p>
                    <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">{currentDashboard.enrollment.isPresaleParticipant
                      ? 'Tu participación en la preventa ya no permite asignarte un patrocinador desde aquí.'
                      : proposedAmbassador
                        ? 'Conectar tu wallet y navegar no confirma la relación. Solo se guardará cuando la confirmes con una firma específica, sin gas.'
                        : pendingInvitationCode
                          ? 'Conservamos tu invitación pendiente. Debe estar disponible antes de que puedas confirmarla.'
                          : 'Ahora no podemos ofrecerte un embajador. Puedes seguir navegando y volver a intentarlo más adelante.'}</p>
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
              <span className="font-headline text-3xl font-black text-[var(--uki-lilac)]">{currentDashboard.referrals.length}</span>
            </div>
            {currentDashboard.referrals.length === 0 ? (
              <div className="flex min-h-44 flex-col items-center justify-center border-b border-white/10 px-5 py-8 text-center">
                <UsersThree className="h-9 w-9 text-[var(--uki-lilac)]" weight="duotone" />
                <p className="mt-4 font-headline text-xl font-black">Todavía no tienes invitados confirmados</p>
                <p className="mt-2 max-w-lg text-sm font-semibold text-[var(--uki-muted)]">{invitationUrl
                  ? 'Comparte tu enlace. La relación aparecerá aquí en cuanto la otra wallet la confirme.'
                  : currentDashboard.enrollment.isCukieMaster === false
                    ? 'Tus referidos se conservan. Activa Cukie Master para volver a invitar.'
                    : isEligibilityUnknown
                      ? 'No se puede comprobar ahora si puedes invitar. Reintenta para actualizar el estado.'
                      : 'Tu enlace todavía no está disponible. Actualiza para volver a comprobar el estado.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-white/10 border-b border-white/10">
                {currentDashboard.referrals.map((referral) => (
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
                <p className="mt-2 text-sm font-semibold text-[var(--uki-muted)]">Cada fila explica cuándo se registró y en qué estado se encuentra. El historial se conserva aunque ahora no puedas generar nuevas comisiones.</p>
              </div>
              <Link href="/premios?category=ambassador" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border border-[var(--uki-lilac)]/35 px-4 text-sm font-black text-[var(--uki-lilac)]">
                Ver en Premios <ArrowRight className="h-4 w-4" weight="bold" />
              </Link>
            </div>
            {currentDashboard.commissions.history.length === 0 ? (
              <div className="flex min-h-44 flex-col items-center justify-center border-b border-white/10 px-5 py-8 text-center">
                <Gift className="h-9 w-9 text-[var(--uki-lilac)]" weight="duotone" />
                <p className="mt-4 font-headline text-xl font-black">Aún no se han generado comisiones</p>
                <p className="mt-2 max-w-lg text-sm font-semibold text-[var(--uki-muted)]">{currentDashboard.enrollment.isCukieMaster === false
                  ? 'No se generan nuevas comisiones mientras no cumplas el requisito Cukie Master.'
                  : isEligibilityUnknown
                    ? 'No podemos comprobar ahora si puedes generar nuevas comisiones. Reintenta para actualizar el estado.'
                    : 'Aparecerán cuando un invitado confirmado reciba un premio elegible.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-white/10 border-b border-white/10">
                {currentDashboard.commissions.history.map((entry) => {
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
                    ['01', 'Una sola confirmación', 'Los nuevos usuarios confirman a su embajador con una firma específica, sin gas. Las relaciones de preventa se conservan y ya no pueden añadirse ni cambiarse.'],
                    ['02', 'El invitado no pierde nada', currentDashboard.enrollment.isCukieMaster === true || (currentDashboard.enrollment.isCukieMaster === null && currentDashboard.enrollment.canInvite)
                      ? `El invitado recibe su premio completo y tú recibes un ${commissionPercent.toLocaleString('es-ES')}% adicional.`
                      : 'El historial se conserva, pero las nuevas comisiones solo se generan mientras mantienes el requisito Cukie Master.'],
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
