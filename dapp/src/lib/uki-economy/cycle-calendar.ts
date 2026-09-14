/**
 * Immutable economic calendar, copied into versioned rules and their snapshots.
 * An absent calendar means the original UTC day/week, never the current env.
 * Operational clocks (sessions, leases, HMAC, RPC freshness) are not scaled.
 */
export type EconomyCycleCalendar = {
  version: "cycle-v1";
  chainId: 97;
  cycleSeconds: 1800 | 3600;
  anchorAt: string;
};

export const STANDARD_ECONOMY_DAY_MS = 86_400_000;

function validDate(value: Date) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError("La fecha del calendario economico no es valida.");
  }
  return value;
}

export function assertEconomyCycleCalendar(
  calendar: EconomyCycleCalendar | undefined,
  expectedChainId?: number,
) {
  if (calendar === undefined) return;
  if (
    !calendar || calendar.version !== "cycle-v1" || calendar.chainId !== 97
    || (expectedChainId !== undefined && expectedChainId !== 97)
    || ![1800, 3600].includes(calendar.cycleSeconds)
    || typeof calendar.anchorAt !== "string"
  ) throw new TypeError("El calendario acelerado requiere una configuracion valida de testnet.");
  const anchor = validDate(new Date(calendar.anchorAt));
  if (
    anchor.toISOString() !== calendar.anchorAt
    || anchor.getTime() % (calendar.cycleSeconds * 1000) !== 0
  ) throw new TypeError("El inicio debe coincidir con un corte canonico del ciclo.");
}

export function economyCycleDurationMs(calendar?: EconomyCycleCalendar) {
  assertEconomyCycleCalendar(calendar);
  return calendar ? calendar.cycleSeconds * 1000 : STANDARD_ECONOMY_DAY_MS;
}

export function economyCycleDelayMs(standardHours: number, calendar?: EconomyCycleCalendar) {
  if (!Number.isFinite(standardHours) || standardHours < 0) {
    throw new TypeError("La espera economica no es valida.");
  }
  return Math.round(economyCycleDurationMs(calendar) * standardHours / 24);
}

export function acceleratedCyclePeriod(
  at: Date,
  calendar: EconomyCycleCalendar,
  cycles = 1,
) {
  assertEconomyCycleCalendar(calendar);
  validDate(at);
  if (cycles !== 1 && cycles !== 7) throw new TypeError("El periodo debe contener uno o siete ciclos.");
  const anchor = new Date(calendar.anchorAt).getTime();
  const duration = economyCycleDurationMs(calendar) * cycles;
  const index = Math.floor((at.getTime() - anchor) / duration);
  const start = new Date(anchor + index * duration);
  return { start, endExclusive: new Date(start.getTime() + duration) };
}

export function acceleratedWeekId(at: Date, calendar: EconomyCycleCalendar) {
  return `C${calendar.cycleSeconds}-W:${acceleratedCyclePeriod(at, calendar, 7).start.toISOString()}`;
}

export function acceleratedDayId(at: Date, calendar: EconomyCycleCalendar) {
  return `C${calendar.cycleSeconds}-D:${acceleratedCyclePeriod(at, calendar).start.toISOString()}`;
}

export function acceleratedDayFromId(id: string) {
  const match = /^C(1800|3600)-D:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z)$/.exec(id);
  if (!match) throw new TypeError("El identificador de ciclo diario no es valido.");
  const week = acceleratedWeekFromId(`C${match[1]}-W:${match[2]}`);
  return { id, start: week.start, endExclusive: new Date(week.start.getTime() + Number(match[1]) * 1000) };
}

/** Self-describing IDs keep archived fast weeks readable after an env change. */
export function acceleratedWeekFromId(id: string) {
  const match = /^C(1800|3600)-W:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z)$/.exec(id);
  if (!match) throw new TypeError("El identificador de ciclo semanal no es valido.");
  const start = validDate(new Date(match[2]));
  const seconds = Number(match[1]);
  if (start.toISOString() !== match[2] || start.getTime() % (seconds * 1000) !== 0) {
    throw new TypeError("El inicio semanal no es canonico.");
  }
  return { id, start, endExclusive: new Date(start.getTime() + seconds * 7000) };
}

/** Fail closed: accelerated settings cannot be enabled by a public/client flag. */
export function loadEconomyCycleCalendar(
  env: Readonly<Record<string, string | undefined>> = process.env,
): EconomyCycleCalendar | undefined {
  const seconds = env.ECONOMY_CYCLE_SECONDS?.trim();
  const anchorAt = env.ECONOMY_CYCLE_ANCHOR_AT?.trim();
  if ((!seconds || seconds === "86400") && !anchorAt) return undefined;
  if (
    env.APP_ENV !== "staging" || env.STAGING_ONLY_GUARD !== "true"
    || env.NEXT_PUBLIC_UKI_CHAIN_ID !== "97"
    || env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID !== "97"
    || env.CHAIN_INDEXER_DB_NAME !== "cukieshub-new-staging"
    || (seconds !== "1800" && seconds !== "3600") || !anchorAt
  ) throw new TypeError("ECONOMY_CYCLE requiere staging aislado, chain 97, duracion e inicio explicitos.");
  const calendar: EconomyCycleCalendar = {
    version: "cycle-v1", chainId: 97, cycleSeconds: Number(seconds) as 1800 | 3600, anchorAt,
  };
  assertEconomyCycleCalendar(calendar, 97);
  return calendar;
}
