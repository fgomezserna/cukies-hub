import { acceleratedCyclePeriod, acceleratedWeekId, acceleratedDayId, type EconomyCycleCalendar } from '../cycle-calendar';

export const TREASURE_HUNT_ECONOMY_POLICY = Object.freeze({
  policyVersion: "treasure-hunt-staging-v1",
  gameId: "treasure-hunt",
  gameRuleVersion: "staging-test-v4",
  cutoffHourUtc: 14,
  cutoffMinuteUtc: 0,
  weekStartsOnUtcDay: 1,
  maxPoolGamesPerPeriod: 30,
  maxPoolLowScoreGamesPerPeriod: 10,
  lowScoreExclusiveThresholdRaw: "100",
  maxScorePerSecond: 500,
  scoreBurstAllowance: 250,
  evidenceClockToleranceMs: 5_000,
  maxEvidencePoints: 720,
} as const);

const DAY_MS = 24 * 60 * 60 * 1_000;
const WEEK_MS = 7 * DAY_MS;

export type TreasureHuntPeriod = {
  periodId: string;
  startsAt: Date;
  endsAt: Date;
  policyVersion: typeof TREASURE_HUNT_ECONOMY_POLICY.policyVersion;
};

export type TreasureHuntEvidenceState = {
  startedAt: Date;
  nextSequence: number;
  lastScoreRaw: string;
  lastGameTimeMs: number;
};

export type TreasureHuntEvidenceInput = {
  scoreRaw: string;
  gameTimeMs: number;
  receivedAt: Date;
};

export type TreasureHuntPoolUsageCounters = {
  reservedGames: number;
  reservedLowScoreSlots: number;
  countedGames: number;
  lowScoreGames: number;
};

export function assertTreasureHuntStagingRuntime(
  environment: Record<string, string | undefined>,
) {
  if (
    environment.APP_ENV !== "staging" ||
    environment.STAGING_ONLY_GUARD !== "true" ||
    environment.NEXT_PUBLIC_UKI_CHAIN_ID !== "97" ||
    environment.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID !== "97"
  ) {
    throw new TypeError("TREASURE_HUNT_STAGING_RUNTIME_REQUIRED");
  }
  return {
    environment: "staging" as const,
    chainId: 97 as const,
    policyVersion: TREASURE_HUNT_ECONOMY_POLICY.policyVersion,
  };
}

function validDate(value: Date, label: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError(`${label} debe ser una fecha valida.`);
  }
  return value;
}

export function canonicalTreasureHuntScore(value: unknown, label = "scoreRaw") {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError(`${label} debe ser un entero decimal canonico.`);
  }
  const parsed = BigInt(value);
  if (parsed > (BigInt(1) << BigInt(256)) - BigInt(1)) {
    throw new TypeError(`${label} excede uint256.`);
  }
  return parsed.toString(10);
}

function shiftedUtcDayStart(at: Date) {
  const value = validDate(at, "at");
  const shifted = new Date(
    value.getTime() -
      (TREASURE_HUNT_ECONOMY_POLICY.cutoffHourUtc * 60 +
        TREASURE_HUNT_ECONOMY_POLICY.cutoffMinuteUtc) *
        60_000,
  );
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
      TREASURE_HUNT_ECONOMY_POLICY.cutoffHourUtc,
      TREASURE_HUNT_ECONOMY_POLICY.cutoffMinuteUtc,
    ),
  );
}

export function getTreasureHuntDailyPeriod(at: Date, calendar?: EconomyCycleCalendar): TreasureHuntPeriod {
  if (calendar) {
    const period = acceleratedCyclePeriod(at, calendar);
    return { periodId: acceleratedDayId(at, calendar), startsAt: period.start, endsAt: period.endExclusive, policyVersion: TREASURE_HUNT_ECONOMY_POLICY.policyVersion };
  }
  const startsAt = shiftedUtcDayStart(at);
  return {
    periodId: `th-day:${startsAt.toISOString()}`,
    startsAt,
    endsAt: new Date(startsAt.getTime() + DAY_MS),
    policyVersion: TREASURE_HUNT_ECONOMY_POLICY.policyVersion,
  };
}

export function getTreasureHuntWeeklyPeriod(at: Date, calendar?: EconomyCycleCalendar): TreasureHuntPeriod {
  if (calendar) {
    const period = acceleratedCyclePeriod(at, calendar, 7);
    return { periodId: acceleratedWeekId(at, calendar), startsAt: period.start, endsAt: period.endExclusive, policyVersion: TREASURE_HUNT_ECONOMY_POLICY.policyVersion };
  }
  const dailyStart = shiftedUtcDayStart(at);
  const isoDay = dailyStart.getUTCDay() || 7;
  const startsAt = new Date(
    dailyStart.getTime() -
      (isoDay - TREASURE_HUNT_ECONOMY_POLICY.weekStartsOnUtcDay) * DAY_MS,
  );
  return {
    periodId: `th-week:${startsAt.toISOString()}`,
    startsAt,
    endsAt: new Date(startsAt.getTime() + WEEK_MS),
    policyVersion: TREASURE_HUNT_ECONOMY_POLICY.policyVersion,
  };
}

export function isTreasureHuntLowScore(scoreRaw: string) {
  return (
    BigInt(canonicalTreasureHuntScore(scoreRaw)) <
    BigInt(TREASURE_HUNT_ECONOMY_POLICY.lowScoreExclusiveThresholdRaw)
  );
}

export function treasureHuntScoreOrderKey(scoreRaw: string) {
  const canonical = canonicalTreasureHuntScore(scoreRaw);
  return { scoreDigits: canonical.length, scoreRaw: canonical };
}

export function treasureHuntResultEligibility(input: {
  status: "settled" | "forfeited";
  creditSource: "own" | "pool";
}) {
  const rewardEligible = input.status === "settled";
  const weeklyEligible = rewardEligible && input.creditSource === "pool";
  return {
    leaderboardEligible: weeklyEligible,
    rewardEligible,
    jackpotEligible: weeklyEligible,
  };
}

function validCounter(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} debe ser un entero no negativo.`);
  }
  return value;
}

export function reserveTreasureHuntPoolQuota(
  counters: TreasureHuntPoolUsageCounters,
) {
  const current = {
    reservedGames: validCounter(counters.reservedGames, "reservedGames"),
    reservedLowScoreSlots: validCounter(
      counters.reservedLowScoreSlots,
      "reservedLowScoreSlots",
    ),
    countedGames: validCounter(counters.countedGames, "countedGames"),
    lowScoreGames: validCounter(counters.lowScoreGames, "lowScoreGames"),
  };
  if (
    current.reservedGames + current.countedGames >=
    TREASURE_HUNT_ECONOMY_POLICY.maxPoolGamesPerPeriod
  ) {
    throw new RangeError("POOL_DAILY_GAME_LIMIT_REACHED");
  }
  if (
    current.reservedLowScoreSlots + current.lowScoreGames >=
    TREASURE_HUNT_ECONOMY_POLICY.maxPoolLowScoreGamesPerPeriod
  ) {
    throw new RangeError("POOL_DAILY_LOW_SCORE_LIMIT_REACHED");
  }
  return {
    ...current,
    reservedGames: current.reservedGames + 1,
    reservedLowScoreSlots: current.reservedLowScoreSlots + 1,
  };
}

export function finishTreasureHuntPoolQuota(input: {
  counters: TreasureHuntPoolUsageCounters;
  outcome: "completed" | "voluntary_forfeit" | "system_failure";
  scoreRaw: string;
}) {
  const current = {
    reservedGames: validCounter(input.counters.reservedGames, "reservedGames"),
    reservedLowScoreSlots: validCounter(
      input.counters.reservedLowScoreSlots,
      "reservedLowScoreSlots",
    ),
    countedGames: validCounter(input.counters.countedGames, "countedGames"),
    lowScoreGames: validCounter(input.counters.lowScoreGames, "lowScoreGames"),
  };
  if (current.reservedGames < 1 || current.reservedLowScoreSlots < 1) {
    throw new RangeError("POOL_QUOTA_RESERVATION_MISSING");
  }
  const counted = input.outcome !== "system_failure";
  const lowScore = input.outcome === "voluntary_forfeit" ||
    (input.outcome === "completed" && isTreasureHuntLowScore(input.scoreRaw));
  return {
    reservedGames: current.reservedGames - 1,
    reservedLowScoreSlots: current.reservedLowScoreSlots - 1,
    countedGames: current.countedGames + (counted ? 1 : 0),
    lowScoreGames: current.lowScoreGames + (counted && lowScore ? 1 : 0),
  };
}

export function validateTreasureHuntEvidence(
  state: TreasureHuntEvidenceState,
  input: TreasureHuntEvidenceInput,
) {
  const scoreRaw = canonicalTreasureHuntScore(input.scoreRaw);
  const score = BigInt(scoreRaw);
  const lastScore = BigInt(canonicalTreasureHuntScore(state.lastScoreRaw));
  const receivedAt = validDate(input.receivedAt, "receivedAt");
  validDate(state.startedAt, "startedAt");
  if (
    !Number.isSafeInteger(state.nextSequence) ||
    state.nextSequence < 0 ||
    state.nextSequence >= TREASURE_HUNT_ECONOMY_POLICY.maxEvidencePoints
  ) {
    throw new TypeError("La secuencia de evidencia esta fuera de rango.");
  }
  if (!Number.isSafeInteger(input.gameTimeMs) || input.gameTimeMs < 0) {
    throw new TypeError("gameTimeMs debe ser un entero no negativo.");
  }
  if (score < lastScore || input.gameTimeMs < state.lastGameTimeMs) {
    throw new TypeError("La evidencia no puede retroceder.");
  }
  if (score > lastScore && input.gameTimeMs === state.lastGameTimeMs) {
    throw new TypeError("Una subida de score debe avanzar el reloj de juego.");
  }
  const elapsedServerMs = Math.max(
    0,
    receivedAt.getTime() - state.startedAt.getTime(),
  );
  if (
    input.gameTimeMs >
    elapsedServerMs + TREASURE_HUNT_ECONOMY_POLICY.evidenceClockToleranceMs
  ) {
    throw new TypeError("El reloj de juego adelanta al servidor.");
  }
  const allowedScore =
    BigInt(
      Math.ceil(
        (input.gameTimeMs / 1_000) *
          TREASURE_HUNT_ECONOMY_POLICY.maxScorePerSecond,
      ),
    ) + BigInt(TREASURE_HUNT_ECONOMY_POLICY.scoreBurstAllowance);
  if (score > allowedScore) {
    throw new TypeError("El crecimiento de score excede el limite autorizado.");
  }
  return {
    sequence: state.nextSequence,
    scoreRaw,
    gameTimeMs: input.gameTimeMs,
    receivedAt,
  };
}

export function shouldReplaceTreasureHuntWeeklyBest(input: {
  currentScoreRaw: string;
  currentAchievedAt: Date;
  candidateScoreRaw: string;
  candidateAchievedAt: Date;
}) {
  const current = BigInt(canonicalTreasureHuntScore(input.currentScoreRaw));
  const candidate = BigInt(canonicalTreasureHuntScore(input.candidateScoreRaw));
  if (candidate !== current) return candidate > current;
  return (
    validDate(input.candidateAchievedAt, "candidateAchievedAt").getTime() <
    validDate(input.currentAchievedAt, "currentAchievedAt").getTime()
  );
}
