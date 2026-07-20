'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

const COMPETITION_API = '/api/games/treasure-hunt/competition';

type CompetitionPhase =
  | 'unconfigured'
  | 'disabled'
  | 'scheduled'
  | 'active'
  | 'closed';

interface CompetitionCampaign {
  readonly campaignId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly poolBps: number;
  readonly playerRewardBps: number;
  readonly sponsorRewardBps: number;
  readonly maxWinningAttemptsPerWallet: number;
  readonly cliffMonths: number;
  readonly vestingMonths: number;
}

interface CompetitionParticipant {
  readonly alias: string;
  readonly canonicalAlias: string;
  readonly aliasChangedAt: string | null;
  readonly createdAt: string;
}

interface CompetitionStatusResponse {
  readonly success: true;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly phase: CompetitionPhase;
  readonly campaign: CompetitionCampaign | null;
  readonly participant: CompetitionParticipant | null;
}

interface LeaderboardEntry {
  readonly rank: number;
  readonly walletRank: number;
  readonly attemptId: string;
  readonly alias: string;
  readonly score: number;
  readonly gameTimeMs: number;
  readonly finishedAt: string;
  readonly reviewStatus: 'pending' | 'approved';
  readonly isMe: boolean;
}

interface CompetitionLeaderboardResponse {
  readonly success: true;
  readonly campaignId: string;
  readonly entries: readonly LeaderboardEntry[];
}

interface ParticipantResponse {
  readonly success: true;
  readonly participant: CompetitionParticipant;
}

const PHASE_COPY: Record<
  CompetitionPhase,
  { readonly label: string; readonly detail: string; readonly tone: string }
> = {
  unconfigured: {
    label: 'Pendiente de configurar',
    detail: 'Las fechas se anunciarán cuando la campaña quede configurada.',
    tone: 'border-slate-400/25 bg-slate-400/10 text-slate-300',
  },
  disabled: {
    label: 'Competición desactivada',
    detail: 'El acceso con ranking no está habilitado en este momento.',
    tone: 'border-slate-400/25 bg-slate-400/10 text-slate-300',
  },
  scheduled: {
    label: 'Próxima',
    detail: 'Puedes consultar las reglas antes de la apertura del ranking.',
    tone: 'border-amber-300/25 bg-amber-300/10 text-amber-200',
  },
  active: {
    label: 'En curso',
    detail: 'Las partidas 1P terminadas aparecen provisionalmente hasta completar su revisión.',
    tone: 'border-primary/30 bg-primary/10 text-primary',
  },
  closed: {
    label: 'Cerrada',
    detail: 'El ranking está cerrado y pendiente de liquidación definitiva.',
    tone: 'border-slate-400/25 bg-slate-400/10 text-slate-300',
  },
};

const FALLBACK_RULES = {
  poolBps: 2_500,
  playerRewardBps: 1_000,
  sponsorRewardBps: 2_500,
  maxWinningAttemptsPerWallet: 5,
  cliffMonths: 9,
  vestingMonths: 6,
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCampaign(value: unknown): value is CompetitionCampaign {
  if (!isObject(value)) return false;
  return (
    typeof value.campaignId === 'string' &&
    typeof value.startsAt === 'string' &&
    typeof value.endsAt === 'string' &&
    isFiniteNumber(value.poolBps) &&
    isFiniteNumber(value.playerRewardBps) &&
    isFiniteNumber(value.sponsorRewardBps) &&
    isFiniteNumber(value.maxWinningAttemptsPerWallet) &&
    isFiniteNumber(value.cliffMonths) &&
    isFiniteNumber(value.vestingMonths)
  );
}

function isParticipant(value: unknown): value is CompetitionParticipant {
  if (!isObject(value)) return false;
  return (
    typeof value.alias === 'string' &&
    typeof value.canonicalAlias === 'string' &&
    (value.aliasChangedAt === null || typeof value.aliasChangedAt === 'string') &&
    typeof value.createdAt === 'string'
  );
}

function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  if (!isObject(value)) return false;
  return (
    isFiniteNumber(value.rank) &&
    isFiniteNumber(value.walletRank) &&
    typeof value.attemptId === 'string' &&
    typeof value.alias === 'string' &&
    isFiniteNumber(value.score) &&
    isFiniteNumber(value.gameTimeMs) &&
    typeof value.finishedAt === 'string' &&
    (value.reviewStatus === 'pending' || value.reviewStatus === 'approved') &&
    typeof value.isMe === 'boolean'
  );
}

function isCompetitionStatusResponse(value: unknown): value is CompetitionStatusResponse {
  if (!isObject(value)) return false;
  return (
    value.success === true &&
    typeof value.configured === 'boolean' &&
    typeof value.enabled === 'boolean' &&
    typeof value.phase === 'string' &&
    ['unconfigured', 'disabled', 'scheduled', 'active', 'closed'].includes(value.phase) &&
    (value.campaign === null || isCampaign(value.campaign)) &&
    (value.participant === null || isParticipant(value.participant))
  );
}

function isLeaderboardResponse(value: unknown): value is CompetitionLeaderboardResponse {
  return (
    isObject(value) &&
    value.success === true &&
    typeof value.campaignId === 'string' &&
    Array.isArray(value.entries) &&
    value.entries.every(isLeaderboardEntry)
  );
}

function isParticipantResponse(value: unknown): value is ParticipantResponse {
  return isObject(value) && value.success === true && isParticipant(value.participant);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorCode(value: unknown) {
  return isObject(value) && typeof value.error === 'string' ? value.error : null;
}

function formatPercentage(bps: number) {
  return `${bps / 100}%`;
}

function formatCampaignWindow(campaign: CompetitionCampaign | null) {
  if (!campaign) return null;

  const startsAt = new Date(campaign.startsAt);
  const endsAt = new Date(campaign.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
  return `${formatter.format(startsAt)} — ${formatter.format(endsAt)} UTC`;
}

function formatDuration(gameTimeMs: number) {
  if (!Number.isFinite(gameTimeMs) || gameTimeMs < 0) return '—';
  return `${(gameTimeMs / 1_000).toFixed(1)} s`;
}

function getAliasValidationMessage(alias: string) {
  const trimmed = alias.trim();
  if (trimmed.length < 3 || trimmed.length > 20) {
    return 'Usa entre 3 y 20 caracteres.';
  }
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed) || /^0x/i.test(trimmed)) {
    return 'Usa letras, números, guion o guion bajo; no introduzcas una wallet.';
  }
  return null;
}

function RulesSummary({ campaign }: { readonly campaign: CompetitionCampaign | null }) {
  const rules = campaign ?? FALLBACK_RULES;
  const items = [
    {
      value: formatPercentage(rules.poolBps),
      label: 'Pool de recompensas',
      detail: 'de todos los UKI comprados; 80% jugadores y hasta 20% sponsors',
    },
    {
      value: formatPercentage(rules.playerRewardBps),
      label: 'Premio por partida',
      detail: `de tus UKI comprados, hasta ${rules.maxWinningAttemptsPerWallet} partidas por wallet`,
    },
    {
      value: formatPercentage(rules.sponsorRewardBps),
      label: 'Recompensa del sponsor',
      detail: 'del premio que recibe cada jugador referido',
    },
    {
      value: `${rules.cliffMonths} + ${rules.vestingMonths}`,
      label: 'Entrega en UKI',
      detail: `${rules.cliffMonths} meses de cliff y ${rules.vestingMonths} meses de vesting lineal`,
    },
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] border-y border-border/70">
      {items.map((item) => (
        <article key={item.label} className="border-b border-border/70 px-4 py-5 last:border-b-0">
          <strong className="font-headline text-2xl font-black tracking-tight text-primary">
            {item.value}
          </strong>
          <h3 className="mt-2 text-sm font-bold text-foreground">{item.label}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
        </article>
      ))}
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div aria-label="Cargando ranking" className="space-y-2">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="h-11 animate-pulse rounded-[8px] border border-border/60 bg-muted/40 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

export default function TreasureHuntCompetitionPanel() {
  const { address, connector: activeConnector, isConnected } = useAccount();
  const { fetchUser } = useAuth();
  const [refreshToken, setRefreshToken] = useState(0);
  const [status, setStatus] = useState<CompetitionStatusResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<readonly LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState('');
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [aliasFeedback, setAliasFeedback] = useState<string | null>(null);
  const [isSavingAlias, setIsSavingAlias] = useState(false);
  const [isAuthenticatingWallet, setIsAuthenticatingWallet] = useState(false);
  const [requiresWalletSignature, setRequiresWalletSignature] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      setLeaderboardError(null);

      try {
        const statusResponse = await fetch(COMPETITION_API, {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        const statusBody = await readJson(statusResponse);

        if (!statusResponse.ok || !isCompetitionStatusResponse(statusBody)) {
          if (statusResponse.status === 401) setRequiresWalletSignature(true);
          throw new Error('No se pudo consultar el estado de la competición.');
        }
        if (controller.signal.aborted) return;

        setStatus(statusBody);
        setAliasDraft(statusBody.participant?.alias ?? '');
        setRequiresWalletSignature(!statusBody.participant);

        if (!statusBody.configured || !statusBody.campaign) {
          setLeaderboard([]);
          return;
        }

        const leaderboardResponse = await fetch(`${COMPETITION_API}/leaderboard?limit=100`, {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        const leaderboardBody = await readJson(leaderboardResponse);
        if (!leaderboardResponse.ok || !isLeaderboardResponse(leaderboardBody)) {
          if (!controller.signal.aborted) {
            setLeaderboard([]);
            setLeaderboardError('El ranking no está disponible ahora mismo.');
          }
          return;
        }
        if (!controller.signal.aborted) setLeaderboard(leaderboardBody.entries);
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus(null);
        setLeaderboard([]);
        setLoadError(
          error instanceof Error
            ? error.message
            : 'No se pudo consultar el estado de la competición.',
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [refreshToken]);

  const retry = useCallback(() => {
    setIsLoading(true);
    setRequiresWalletSignature(false);
    setAliasError(null);
    setAliasFeedback(null);
    setRefreshToken((value) => value + 1);
  }, []);

  const authenticateWalletAndRetry = useCallback(async () => {
    if (!isConnected || !address) {
      setRequiresWalletSignature(true);
      setAliasFeedback('Conecta una wallet EVM antes de solicitar la firma.');
      return;
    }

    setIsAuthenticatingWallet(true);
    setAliasError(null);
    setAliasFeedback('Confirma la firma en tu wallet EVM para activar el ranking.');
    try {
      await fetchUser(address, {
        evmConnector: activeConnector,
        promptForSignature: true,
        requireSignedWallet: true,
        walletType: 'evm',
      });
      retry();
    } catch {
      setRequiresWalletSignature(true);
      setAliasFeedback(
        'No se completó la firma de la wallet EVM. Puedes volver a intentarlo cuando quieras.',
      );
    } finally {
      setIsAuthenticatingWallet(false);
    }
  }, [activeConnector, address, fetchUser, isConnected, retry]);

  const handleAliasSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const validationMessage = getAliasValidationMessage(aliasDraft);
      if (validationMessage) {
        setAliasError(validationMessage);
        setAliasFeedback(null);
        return;
      }

      setIsSavingAlias(true);
      setAliasError(null);
      setAliasFeedback(null);
      try {
        const response = await fetch(`${COMPETITION_API}/participant`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ alias: aliasDraft.trim() }),
        });
        const body = await readJson(response);

        if (response.status === 401) {
          setRequiresWalletSignature(true);
          setAliasFeedback('Tu sesión ha caducado. Conecta y firma la wallet para editar el nombre del ranking.');
          return;
        }
        if (!response.ok || !isParticipantResponse(body)) {
          const code = errorCode(body);
          setAliasError(
            code === 'ALIAS_TAKEN'
              ? 'Ese nombre ya está en uso.'
              : code === 'INVALID_ALIAS'
                ? 'El nombre no cumple las reglas.'
                : code === 'ALIAS_LOCKED'
                  ? 'El nombre quedó bloqueado al cerrar la competición.'
                : 'No se pudo guardar el nombre. Inténtalo de nuevo.',
          );
          return;
        }

        setStatus((current) => (current ? { ...current, participant: body.participant } : current));
        setLeaderboard((current) => current.map((entry) => (
          entry.isMe ? { ...entry, alias: body.participant.alias } : entry
        )));
        setAliasDraft(body.participant.alias);
        setAliasFeedback('Nombre actualizado. Se usará en el ranking público.');
      } catch {
        setAliasError('No se pudo guardar el nombre. Revisa la conexión e inténtalo de nuevo.');
      } finally {
        setIsSavingAlias(false);
      }
    },
    [aliasDraft],
  );

  const phase = status?.phase ?? 'unconfigured';
  const phaseCopy = PHASE_COPY[phase];
  const campaignWindow = useMemo(
    () => formatCampaignWindow(status?.configured ? status.campaign : null),
    [status],
  );
  const participant = status?.participant ?? null;
  const isAliasLocked = phase === 'closed' && Boolean(participant) && !requiresWalletSignature;
  const canEditAlias = Boolean(participant) && !requiresWalletSignature && !isAliasLocked;

  return (
    <section
      aria-labelledby="treasure-hunt-competition-title"
      className="overflow-hidden rounded-[14px] border border-border/80 bg-card/95 text-card-foreground shadow-[0_18px_48px_-24px_rgba(3,18,17,0.55)]"
    >
      <header className="px-5 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.18em] text-primary">
              Detalle de la competición
            </p>
            <h2
              id="treasure-hunt-competition-title"
              className="mt-2 font-headline text-2xl font-black tracking-tight text-foreground"
            >
              Reglas, identidad y ranking
            </h2>
            <p className="mt-2 max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
              Juega en modo 1P, entra en el ranking con tus mejores partidas y desbloquea
              recompensas según los UKI comprados durante la preventa.
            </p>
          </div>

          <div className={cn('rounded-full border px-3 py-1.5 text-xs font-bold', phaseCopy.tone)}>
            {isLoading ? 'Consultando estado' : phaseCopy.label}
          </div>
        </div>

        {!isLoading && !loadError ? (
          <div className="mt-4 border-l-2 border-primary/50 pl-3">
            <p className="text-sm font-medium text-foreground">{phaseCopy.detail}</p>
            {campaignWindow ? (
              <p className="mt-1 font-mono text-xs text-muted-foreground">{campaignWindow}</p>
            ) : null}
          </div>
        ) : null}

        {loadError ? (
          <div role="alert" className="mt-4 rounded-[8px] border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-sm font-semibold text-destructive">{loadError}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3 active:scale-[0.98]" onClick={retry}>
              Reintentar
            </Button>
          </div>
        ) : null}
      </header>

      <RulesSummary campaign={status?.campaign ?? null} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-px bg-border/70">
        <div className="bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-headline text-lg font-black tracking-tight text-foreground">
                Nombre en el ranking
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Treasure Hunt usa este nombre público y nunca muestra la dirección de tu wallet.
              </p>
            </div>
            {participant && !requiresWalletSignature ? (
              <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                Wallet firmada
              </span>
            ) : null}
          </div>

          {isLoading ? (
            <div className="mt-5 space-y-2" aria-label="Cargando participante">
              <div className="h-4 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div className="h-10 animate-pulse rounded-[8px] bg-muted motion-reduce:animate-none" />
            </div>
          ) : canEditAlias ? (
            <form className="mt-5 space-y-2" onSubmit={handleAliasSubmit}>
              <Label htmlFor="treasure-hunt-alias">Nombre en el ranking</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="treasure-hunt-alias"
                  name="alias"
                  value={aliasDraft}
                  minLength={3}
                  maxLength={20}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="treasure-hunt-alias-help treasure-hunt-alias-feedback"
                  aria-invalid={Boolean(aliasError)}
                  className="min-w-[12rem] flex-1 font-mono"
                  onChange={(event) => {
                    setAliasDraft(event.target.value);
                    setAliasError(null);
                    setAliasFeedback(null);
                  }}
                />
                <Button
                  type="submit"
                  disabled={isSavingAlias || aliasDraft.trim() === participant?.alias}
                  className="active:scale-[0.98]"
                >
                  {isSavingAlias ? 'Guardando' : 'Guardar nombre'}
                </Button>
              </div>
              <p id="treasure-hunt-alias-help" className="text-xs text-muted-foreground">
                De 3 a 20 caracteres. Es independiente del nombre de perfil general,
                que también se usa en enlaces de referido.
              </p>
              <p
                id="treasure-hunt-alias-feedback"
                aria-live="polite"
                className={cn('min-h-4 text-xs font-medium', aliasError ? 'text-destructive' : 'text-primary')}
              >
                {aliasError ?? aliasFeedback}
              </p>
            </form>
          ) : isAliasLocked ? (
            <div className="mt-5 rounded-[8px] border border-border bg-muted/35 p-4">
              <p className="text-sm font-bold text-foreground">
                Nombre definitivo: <span className="font-mono text-primary">{participant?.alias}</span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Los nombres quedaron bloqueados al cerrar la competición para preservar el ranking
                y la liquidación auditables.
              </p>
            </div>
          ) : (
            <div className="mt-5 rounded-[8px] border border-primary/25 bg-primary/10 p-4">
              <p className="text-sm font-bold text-foreground">Firma la wallet EVM conectada</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {address
                  ? `Debes firmar con ${address.slice(0, 6)}…${address.slice(-4)}. No se reutilizará la sesión de otra wallet ni una sesión TRON.`
                  : 'Conecta una wallet EVM y fírmala para guardar partidas y editar tu nombre del ranking.'}
                {' '}Sin firma puedes consultar las reglas y el ranking público.
              </p>
              {aliasFeedback ? (
                <p role="status" className="mt-2 text-xs font-semibold text-amber-200">
                  {aliasFeedback}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 active:scale-[0.98]"
                disabled={isAuthenticatingWallet}
                onClick={authenticateWalletAndRetry}
              >
                {isAuthenticatingWallet ? 'Esperando firma' : 'Firmar wallet EVM'}
              </Button>
            </div>
          )}
        </div>

        <div className="bg-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-headline text-lg font-black tracking-tight text-foreground">
                Ranking general
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Hasta cinco resultados por wallet pueden optar a premio tras su revisión.
              </p>
            </div>
            <span className="font-mono text-xs font-bold text-muted-foreground">
              {leaderboard.length} partidas
            </span>
          </div>

          <div className="mt-5">
            {isLoading ? <LeaderboardSkeleton /> : null}
            {!isLoading && leaderboardError ? (
              <div role="status" className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100">
                {leaderboardError}
              </div>
            ) : null}
            {!isLoading && !leaderboardError && leaderboard.length === 0 ? (
              <div className="rounded-[8px] border border-dashed border-border p-5">
                <p className="text-sm font-bold text-foreground">Aún no hay partidas clasificadas</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  El ranking aparecerá aquí cuando se registre el primer resultado válido.
                </p>
              </div>
            ) : null}
            {!isLoading && !leaderboardError && leaderboard.length > 0 ? (
              <div className="overflow-x-auto rounded-[8px] border border-border/80">
                <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
                  <thead className="bg-muted/55 text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2.5 font-bold">Puesto</th>
                      <th scope="col" className="px-3 py-2.5 font-bold">Nombre</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-bold">Puntos</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-bold">Tiempo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {leaderboard.map((entry) => (
                      <tr key={entry.attemptId} className={entry.isMe ? 'bg-primary/[0.07]' : undefined}>
                        <td className="px-3 py-3 font-mono font-black text-primary">#{entry.rank}</td>
                        <td className="px-3 py-3 font-semibold text-foreground">
                          {entry.alias}
                          {entry.isMe ? (
                            <span className="ml-2 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[0.65rem] font-bold text-primary">
                              Tú
                            </span>
                          ) : null}
                          {entry.reviewStatus === 'pending' ? (
                            <span className="ml-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[0.65rem] font-bold text-amber-200">
                              En revisión
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-foreground">
                          {entry.score.toLocaleString('es-ES')}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs text-muted-foreground">
                          {formatDuration(entry.gameTimeMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="border-t border-border/70 bg-muted/25 px-5 py-4 text-xs leading-relaxed text-muted-foreground">
        Jugar sin comprar UKI está permitido. Para generar una recompensa, la wallet debe tener
        una compra válida antes del cierre de la preventa.
      </footer>
    </section>
  );
}
