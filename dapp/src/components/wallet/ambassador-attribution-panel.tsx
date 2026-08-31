'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { getAddress, isAddress } from 'viem';

import { Panel } from '@/components/landing/primitives';
import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { useAuth } from '@/providers/auth-provider';

type Attribution = {
  attributionId: string;
  referredWalletNormalized: string;
  ambassadorWalletNormalized: string;
  source: 'presale_locked' | 'signed_wallet_session';
  policyVersion: string;
  commissionBps: number;
  levels: number;
  acceptedAt: string;
};

type AttributionResponse = {
  status: 'ok' | 'error';
  attribution?: Attribution | null;
  policy?: { version: string; commissionBps: number; levels: number };
  code?: string;
};

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function acceptedAtLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'fecha no disponible';
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function normalizedWallet(value: string) {
  if (!isAddress(value, { strict: false })) return null;
  const normalized = getAddress(value).toLowerCase();
  return /^0x0{40}$/i.test(normalized) ? null : normalized;
}

export function AmbassadorAttributionPanel() {
  const { user, isLoading: authLoading, walletType } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const [attribution, setAttribution] = useState<Attribution | null>(null);
  const [policy, setPolicy] = useState<AttributionResponse['policy']>(undefined);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'saving' | 'unavailable'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const hasReadInvitationRef = useRef(false);

  const invitationPath = useMemo(() => (
    walletAddress ? `/dashboard?ambassador=${encodeURIComponent(walletAddress)}` : null
  ), [walletAddress]);

  useEffect(() => {
    if (typeof window === 'undefined' || hasReadInvitationRef.current) return;
    hasReadInvitationRef.current = true;
    const candidate = new URLSearchParams(window.location.search).get('ambassador')?.trim();
    if (candidate) setDraft(candidate);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!walletAddress || walletType !== 'evm') {
      setAttribution(null);
      setPolicy(undefined);
      setState('idle');
      setError(null);
      return;
    }
    const controller = new AbortController();
    setState('loading');
    setError(null);
    fetch('/api/economy/v1/ambassadors/attribution', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json() as AttributionResponse;
        if (!response.ok || body.status !== 'ok') throw new Error(body.code ?? 'AMBASSADOR_UNAVAILABLE');
        setAttribution(body.attribution ?? null);
        setPolicy(body.policy);
        setState('ready');
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setAttribution(null);
        setPolicy(undefined);
        setState('unavailable');
        setError('Ahora no podemos comprobar tu embajador. No hemos guardado cambios.');
      });
    return () => controller.abort();
  }, [authLoading, walletAddress, walletType]);

  async function saveAttribution() {
    if (!walletAddress || state !== 'ready' || attribution) return;
    const ambassadorWalletAddress = normalizedWallet(draft.trim());
    const referredWalletAddress = normalizedWallet(walletAddress);
    if (!ambassadorWalletAddress) {
      setError('Introduce una dirección EVM válida.');
      return;
    }
    if (ambassadorWalletAddress === referredWalletAddress) {
      setError('Una wallet no puede asignarse a sí misma como embajador.');
      return;
    }
    setState('saving');
    setError(null);
    try {
      const response = await fetch('/api/economy/v1/ambassadors/attribution', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ambassadorWalletAddress }),
      });
      const body = await response.json() as AttributionResponse;
      if (!response.ok || body.status !== 'ok' || !body.attribution) {
        throw new Error(body.code ?? 'AMBASSADOR_ATTRIBUTION_REJECTED');
      }
      setAttribution(body.attribution);
      setPolicy(body.policy);
      setState('ready');
    } catch (caught) {
      setState('ready');
      setError(
        caught instanceof Error && caught.message === 'CONFLICT'
          ? 'Esta wallet ya confirmó otro embajador y no puede cambiarlo.'
          : 'No hemos podido confirmar tu embajador. No hemos guardado cambios.',
      );
    }
  }

  async function copyInvitationLink() {
    if (!invitationPath || typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${invitationPath}`);
      setCopied(true);
    } catch {
      setCopied(false);
      setError('No se ha podido copiar el enlace. Puedes copiarlo manualmente.');
    }
  }

  return (
    <section id="ambassador-program" className="relative z-[2] w-full pb-5">
      <Panel innerClassName="p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <p className="uki-label">Programa de embajadores</p>
            <h2 className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)]">
              Invita y gana premios
            </h2>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              El embajador directo recibe el 5% de los premios elegibles que genere su invitado.
              La relación es de un nivel, no es retroactiva y se confirma una sola vez.
            </p>
          </div>
          {policy ? (
            <div className="rounded-[8px] border border-[var(--uki-lilac-border)] bg-black/20 px-4 py-3 text-right">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Política activa</p>
              <p className="mt-1 font-headline text-xl font-black text-[var(--uki-lilac)]">
                {(policy.commissionBps / 100).toLocaleString('es-ES')}% · {policy.levels} nivel
              </p>
            </div>
          ) : null}
        </div>

        {authLoading || state === 'loading' ? (
          <div className="mt-6 flex items-center gap-3 text-sm font-semibold text-[var(--uki-text)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--uki-lilac)]" />
            Comprobando tu embajador…
          </div>
        ) : null}

        {!authLoading && state === 'idle' ? (
          <div className="mt-6 rounded-[8px] border border-white/10 bg-black/20 p-5">
            <div className="flex gap-3">
              <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-[var(--uki-lilac)]" />
              <div>
                <p className="font-black text-[var(--uki-cream)]">Conecta tu wallet</p>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                  Confirma quién te invitó o comparte tu propio enlace con otros jugadores.
                </p>
              </div>
            </div>
            <LandingWalletConnectButton evmOnly className="mt-4" showCompactText={false} />
          </div>
        ) : null}

        {state === 'unavailable' ? (
          <div className="mt-6 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">{error}</p>
          </div>
        ) : null}

        {state === 'ready' || state === 'saving' ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[8px] border border-white/10 bg-black/20 p-5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-[var(--uki-lilac)]" />
                <h3 className="font-headline text-lg font-black uppercase text-[var(--uki-cream)]">Mi embajador</h3>
              </div>
              {attribution ? (
                <div className="mt-4">
                  <p className="font-mono text-lg font-black text-[var(--uki-lilac)]">
                    {shortWallet(attribution.ambassadorWalletNormalized)}
                  </p>
                  <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                    {attribution.source === 'presale_locked'
                      ? 'Embajador conservado desde la preventa.'
                      : 'Embajador confirmado con tu wallet.'}
                    {' '}Confirmado el {acceptedAtLabel(attribution.acceptedAt)}.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-lilac)]">
                    <CheckCircle2 className="h-4 w-4" />
                    Embajador confirmado
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <label htmlFor="ambassador-wallet" className="text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">
                    Wallet de tu embajador
                  </label>
                  <input
                    id="ambassador-wallet"
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setError(null);
                    }}
                    disabled={state === 'saving'}
                    placeholder="0x…"
                    autoComplete="off"
                    spellCheck={false}
                    className="mt-2 w-full rounded-[6px] border border-white/15 bg-black/40 px-3 py-3 font-mono text-sm text-[var(--uki-cream)] outline-none focus:border-[var(--uki-lilac)]"
                  />
                  <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                    Revisa la dirección antes de confirmar: después no podrá sustituirse.
                  </p>
                  <button
                    type="button"
                    onClick={saveAttribution}
                    disabled={state === 'saving' || !draft.trim()}
                    className="uki-wallet-button mt-4 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {state === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Confirmar embajador
                  </button>
                </div>
              )}
              {error ? (
                <p role="alert" className="mt-4 text-sm font-semibold text-amber-300">{error}</p>
              ) : null}
            </div>

            <div className="rounded-[8px] border border-white/10 bg-black/20 p-5">
              <div className="flex items-center gap-3">
                <Link2 className="h-5 w-5 text-[var(--uki-gold)]" />
                <h3 className="font-headline text-lg font-black uppercase text-[var(--uki-cream)]">Mi enlace de invitación</h3>
              </div>
              <p className="mt-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                Cualquier wallet puede invitar. El invitado verá tu dirección preparada y deberá aceptarla con su propia firma.
              </p>
              {invitationPath ? (
                <>
                  <p className="mt-3 break-all rounded-[6px] border border-white/10 bg-black/30 p-3 font-mono text-xs text-[var(--uki-muted)]">
                    {invitationPath}
                  </p>
                  <button type="button" onClick={copyInvitationLink} className="uki-wallet-button mt-4">
                    {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'Enlace copiado' : 'Copiar enlace'}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </Panel>
    </section>
  );
}
