'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, LockKeyhole, Save, UserRound, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTreasureHuntCompetitionOverview } from '@/hooks/use-treasure-hunt-competition-overview';
import { useAuth } from '@/providers/auth-provider';

const ALIAS_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;

function compactWallet(walletAddress: string) {
  return `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}`;
}

function aliasValidationMessage(alias: string) {
  const trimmed = alias.trim();
  if (trimmed.length < 3 || trimmed.length > 20) return 'Usa entre 3 y 20 caracteres.';
  if (!ALIAS_PATTERN.test(trimmed)) {
    return 'Solo se permiten letras, números, guion y guion bajo.';
  }
  if (/^0x/i.test(trimmed)) return 'El alias no puede parecer una dirección de wallet.';
  return null;
}

interface ParticipantData {
  readonly alias: string;
  readonly canonicalAlias: string;
  readonly aliasChangedAt: string | null;
  readonly createdAt: string;
}

function isParticipant(value: unknown): value is ParticipantData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.alias === 'string' &&
    typeof candidate.canonicalAlias === 'string' &&
    (candidate.aliasChangedAt === null || typeof candidate.aliasChangedAt === 'string') &&
    typeof candidate.createdAt === 'string'
  );
}

function isParticipantResponse(value: unknown): value is {
  readonly success: true;
  readonly participant: ParticipantData;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.success === true && isParticipant(candidate.participant);
}

function aliasSaveError(response: Response, body: unknown) {
  const code = body && typeof body === 'object' && !Array.isArray(body)
    && typeof (body as Record<string, unknown>).error === 'string'
    ? String((body as Record<string, unknown>).error)
    : null;
  if (response.status === 401 || code === 'INVALID_WALLET') {
    return 'Tu sesión ha caducado. Conecta y firma la wallet para editar el alias.';
  }
  if (code === 'ALIAS_TAKEN') return 'Ese alias ya está en uso.';
  if (code === 'INVALID_ALIAS') return 'El alias no cumple las reglas permitidas.';
  if (code === 'ALIAS_LOCKED') return 'El alias de esa competición ya está cerrado.';
  return 'No se pudo guardar el alias. Revisa la conexión e inténtalo de nuevo.';
}

function ReadonlyField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
        <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </Label>
      <div className="flex min-h-11 items-center rounded-[10px] border border-white/10 bg-black/20 px-3 font-mono text-sm text-slate-300">
        {value}
      </div>
    </div>
  );
}

export default function TreasureHuntProfile() {
  const { user, isLoading: authLoading } = useAuth();
  const { status, isLoading, error, reload } =
    useTreasureHuntCompetitionOverview({
      includeLeaderboard: false,
      participantScope: 'weekly',
    });
  const [alias, setAlias] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const walletIdentity = user?.walletAddress?.trim().toLowerCase() ?? null;
  const walletIdentityRef = useRef(walletIdentity);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    setAlias(status?.participant?.alias ?? '');
  }, [status?.participant?.alias]);

  useEffect(() => {
    walletIdentityRef.current = walletIdentity;
    setSaved(false);
    setSaveError(null);
  }, [walletIdentity]);

  const validationMessage = aliasValidationMessage(alias);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      saveInFlightRef.current ||
      validationMessage ||
      !status?.participant ||
      !walletIdentity
    ) return;

    saveInFlightRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    setSaved(false);
    const requestWallet = walletIdentity;
    try {
      const response = await fetch('/api/games/treasure-hunt/competition/participant?scope=weekly', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ alias: alias.trim() }),
      });
      const body = await response.json().catch(() => null);
      if (walletIdentityRef.current !== requestWallet) return;
      if (!response.ok || !isParticipantResponse(body)) {
        throw new Error(aliasSaveError(response, body));
      }

      const readbackResponse = await fetch(
        '/api/games/treasure-hunt/competition/participant?scope=weekly',
        { credentials: 'same-origin', cache: 'no-store' },
      );
      const readbackBody = await readbackResponse.json().catch(() => null);
      if (walletIdentityRef.current !== requestWallet) return;
      if (
        !readbackResponse.ok ||
        !isParticipantResponse(readbackBody) ||
        readbackBody.participant.canonicalAlias !== body.participant.canonicalAlias
      ) {
        throw new Error(aliasSaveError(readbackResponse, readbackBody));
      }

      setAlias(readbackBody.participant.alias);
      setSaved(true);
      reload();
    } catch (cause) {
      if (walletIdentityRef.current === requestWallet) {
        setSaveError(cause instanceof Error
          ? cause.message
          : 'No se pudo guardar el alias. Revisa la conexión e inténtalo de nuevo.');
      }
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  if (!authLoading && !user) {
    return (
      <section className="rounded-[16px] border border-lilac-300/20 bg-[#100b18]/95 p-6 sm:p-8">
        <Wallet className="h-8 w-8 text-lilac-200" aria-hidden="true" />
        <h2 className="mt-5 font-headline text-2xl font-black text-white">Conecta tu wallet</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
          Conecta tu wallet para consultar tu perfil semanal y personalizar el alias del ranking.
        </p>
        <Button
          type="button"
          className="mt-6 bg-lilac-300 font-black text-[#16061f] hover:bg-lilac-200"
          onClick={() => window.dispatchEvent(new Event('cukies:open-wallet-dialog'))}
        >
          Conectar wallet
        </Button>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[16px] border border-lilac-300/20 bg-[#100b18]/95">
      <header className="border-b border-white/10 px-5 py-6 sm:px-7">
        <div className="flex items-center gap-3">
          <UserRound className="h-6 w-6 text-lilac-200" aria-hidden="true" />
          <div>
            <p className="font-mono text-[0.65rem] font-black uppercase tracking-[0.18em] text-lilac-300">
              Identidad del torneo
            </p>
            <h2 className="font-headline text-xl font-black text-white">Mi perfil</h2>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6 p-5 sm:p-7">
        <div className="space-y-2">
          <Label htmlFor="competition-alias" className="text-sm font-black text-white">
            Alias público
          </Label>
          <Input
            id="competition-alias"
            value={alias}
            onChange={(event) => {
              setAlias(event.target.value);
              setSaved(false);
              setSaveError(null);
            }}
            disabled={isLoading || !status?.participant || isSaving}
            autoComplete="off"
            maxLength={20}
            aria-describedby="competition-alias-help"
            className="border-white/10 bg-black/20 font-mono text-white focus-visible:ring-lilac-300"
          />
          <p id="competition-alias-help" className={`text-xs ${validationMessage ? 'text-amber-200' : 'text-slate-500'}`}>
            {validationMessage ?? 'El nombre con el que aparecerás en el ranking.'}
          </p>
        </div>

        <div className="max-w-md">
          <ReadonlyField
            label="Wallet"
            value={user?.walletAddress ? compactWallet(user.walletAddress) : 'Consultando…'}
          />
        </div>

        {error ? <p role="alert" className="text-sm font-semibold text-red-200">{error}</p> : null}
        {saveError ? <p role="alert" className="text-sm font-semibold text-red-200">{saveError}</p> : null}
        {saved ? (
          <p role="status" className="flex items-center gap-2 text-sm font-semibold text-lilac-200">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Alias actualizado.
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={
            isSaving ||
            isLoading ||
            Boolean(validationMessage) ||
            !status?.participant ||
            alias.trim() === status?.participant?.alias
          }
          className="min-h-11 bg-lilac-300 font-black text-[#16061f] hover:bg-lilac-200"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Guardar alias
        </Button>
      </form>
    </section>
  );
}
