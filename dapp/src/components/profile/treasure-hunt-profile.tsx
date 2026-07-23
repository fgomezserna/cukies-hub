'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, LockKeyhole, Save, UserRound, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  TREASURE_HUNT_PHASE_COPY,
  useTreasureHuntCompetitionOverview,
} from '@/hooks/use-treasure-hunt-competition-overview';
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
  const { status, leaderboard, isLoading, error, reload } =
    useTreasureHuntCompetitionOverview();
  const [alias, setAlias] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAlias(status?.participant?.alias ?? '');
  }, [status?.participant?.alias]);

  const myAttempts = useMemo(
    () => leaderboard.filter((entry) => entry.isMe).length,
    [leaderboard],
  );
  const validationMessage = aliasValidationMessage(alias);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validationMessage || !status?.participant) return;

    setIsSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/games/treasure-hunt/competition/participant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: alias.trim() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.success !== true) {
        throw new Error(body?.error === 'ALIAS_TAKEN'
          ? 'Ese alias ya está en uso.'
          : 'No se pudo guardar el alias.');
      }
      setAlias(body.participant.alias);
      setSaved(true);
      reload();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'No se pudo guardar el alias.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!authLoading && !user) {
    return (
      <section className="rounded-[16px] border border-emerald-300/20 bg-[#0d1916]/95 p-6 sm:p-8">
        <Wallet className="h-8 w-8 text-emerald-200" aria-hidden="true" />
        <h2 className="mt-5 font-headline text-2xl font-black text-white">Conecta tu wallet</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
          Conecta tu wallet para consultar el perfil del torneo y personalizar tu alias.
        </p>
        <Button
          type="button"
          className="mt-6 bg-emerald-300 font-black text-[#06211b] hover:bg-emerald-200"
          onClick={() => window.dispatchEvent(new Event('cukies:open-wallet-dialog'))}
        >
          Conectar wallet
        </Button>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[16px] border border-emerald-300/20 bg-[#0d1916]/95">
      <header className="border-b border-white/10 px-5 py-6 sm:px-7">
        <div className="flex items-center gap-3">
          <UserRound className="h-6 w-6 text-emerald-200" aria-hidden="true" />
          <div>
            <p className="font-mono text-[0.65rem] font-black uppercase tracking-[0.18em] text-emerald-300">
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
            className="border-white/10 bg-black/20 font-mono text-white focus-visible:ring-emerald-300"
          />
          <p id="competition-alias-help" className={`text-xs ${validationMessage ? 'text-amber-200' : 'text-slate-500'}`}>
            {validationMessage ?? 'Es el único dato editable y será visible en el ranking.'}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <ReadonlyField
            label="Wallet"
            value={user?.walletAddress ? compactWallet(user.walletAddress) : 'Consultando…'}
          />
          <ReadonlyField label="Torneo" value="Torneo Preventa UKI" />
          <ReadonlyField
            label="Estado"
            value={TREASURE_HUNT_PHASE_COPY[status?.phase ?? 'unconfigured'].label}
          />
          <ReadonlyField
            label="Partidas computables"
            value={`${myAttempts}/${status?.campaign?.maxWinningAttemptsPerWallet ?? 5}`}
          />
        </div>

        {error ? <p role="alert" className="text-sm font-semibold text-red-200">{error}</p> : null}
        {saveError ? <p role="alert" className="text-sm font-semibold text-red-200">{saveError}</p> : null}
        {saved ? (
          <p role="status" className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
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
          className="min-h-11 bg-emerald-300 font-black text-[#06211b] hover:bg-emerald-200"
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
