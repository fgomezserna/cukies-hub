import type {
  TreasureHuntEconomyResultResponse,
  TreasureHuntEconomyStartResponse,
} from "@/lib/uki-economy/game-economy/treasure-hunt-types";

export class TreasureHuntEconomyClientError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
    this.name = "TreasureHuntEconomyClientError";
  }
}

async function economyRequest<T>(
  path: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
) {
  const response = await fetchImpl(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  let payload: { status?: unknown; code?: unknown; result?: unknown };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new TreasureHuntEconomyClientError("TREASURE_ECONOMY_UNAVAILABLE");
  }
  if (!response.ok || payload.status !== "ok") {
    throw new TreasureHuntEconomyClientError(
      typeof payload.code === "string" ? payload.code : "TREASURE_ECONOMY_UNAVAILABLE",
    );
  }
  return payload.result as T;
}

function invalidResponse(): never {
  throw new TreasureHuntEconomyClientError("TREASURE_ECONOMY_INVALID_RESPONSE");
}

function nonEmptyText(value: unknown, max = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function startResponse(value: unknown): TreasureHuntEconomyStartResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidResponse();
  const result = value as Record<string, unknown>;
  if (
    !nonEmptyText(result.runId) ||
    !nonEmptyText(result.gameEconomySessionId) ||
    (result.creditSource !== "own" && result.creditSource !== "pool") ||
    (result.cukieSource !== "own" && result.cukieSource !== "pool") ||
    !nonEmptyText(result.cukieAssetId) ||
    !nonEmptyText(result.dailyPeriodId) ||
    !nonEmptyText(result.dailyPeriodEndsAt) ||
    Number.isNaN(Date.parse(result.dailyPeriodEndsAt))
  ) invalidResponse();
  return result as TreasureHuntEconomyStartResponse;
}

function resultResponse(value: unknown): TreasureHuntEconomyResultResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidResponse();
  const result = value as Record<string, unknown>;
  if (
    !nonEmptyText(result.runId) ||
    (result.status !== "settled" && result.status !== "forfeited") ||
    typeof result.scoreRaw !== "string" ||
    !/^(0|[1-9][0-9]*)$/.test(result.scoreRaw) ||
    typeof result.leaderboardEligible !== "boolean" ||
    typeof result.rewardEligible !== "boolean" ||
    typeof result.jackpotEligible !== "boolean" ||
    (result.status === "forfeited" && (
      result.scoreRaw !== "0" ||
      result.leaderboardEligible ||
      result.rewardEligible ||
      result.jackpotEligible
    ))
  ) invalidResponse();
  return result as TreasureHuntEconomyResultResponse;
}

export function openTreasureHuntEconomyRun(
  input: { gameSessionId: string; requestId: string },
  fetchImpl?: typeof fetch,
) {
  return economyRequest<unknown>(
    "/api/games/treasure-hunt/economy/sessions",
    input,
    fetchImpl,
  ).then(startResponse);
}

export function appendTreasureHuntEconomyCheckpoint(
  input: {
    runId: string;
    checkpointId: string;
    score: number;
    gameTimeMs: number;
  },
  fetchImpl?: typeof fetch,
) {
  return economyRequest<unknown>(
    `/api/games/treasure-hunt/economy/sessions/${encodeURIComponent(input.runId)}/checkpoints`,
    input,
    fetchImpl,
  ).then((result) => {
    if (!result || typeof result !== "object" || Array.isArray(result)) invalidResponse();
    const value = result as Record<string, unknown>;
    if (
      !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 0 ||
      typeof value.evidenceHash !== "string" || !/^[0-9a-f]{64}$/.test(value.evidenceHash)
    ) invalidResponse();
    return value as { sequence: number; evidenceHash: string };
  });
}

export function finishTreasureHuntEconomyRun(
  input: {
    runId: string;
    resultId: string;
    score: number;
    gameTimeMs: number;
    outcome: "completed" | "voluntary_forfeit";
    authoritySource: "competition" | "economy";
    authorityReference?: string;
  },
  fetchImpl?: typeof fetch,
) {
  return economyRequest<unknown>(
    `/api/games/treasure-hunt/economy/sessions/${encodeURIComponent(input.runId)}/result`,
    input,
    fetchImpl,
  ).then(resultResponse);
}
