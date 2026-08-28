import { NextResponse } from "next/server";

import { requireCompetitionIdentity } from "@/lib/treasure-hunt-competition/server/api";
import { UkiEconomyError } from "@/lib/uki-economy/errors";
import { assertTreasureHuntStagingRuntime } from "@/lib/uki-economy/game-economy/treasure-hunt-policy";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export function treasureEconomyJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

export async function requireTreasureEconomyIdentity() {
  assertTreasureHuntStagingRuntime(process.env);
  return requireCompetitionIdentity();
}

export async function readTreasureEconomyBody(request: Request) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return null;
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function treasureEconomyErrorResponse(error: unknown) {
  if (error instanceof UkiEconomyError) {
    const status = error.code === "NOT_FOUND"
      ? 404
      : error.code === "CONFLICT" || error.code === "STALE_FENCE"
        ? 409
        : error.code === "SCHEMA_NOT_READY"
          ? 503
          : 400;
    return treasureEconomyJson({ status: "error", code: error.code }, status);
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = typeof error.status === "number" ? error.status : 400;
    const code = "code" in error && typeof error.code === "string"
      ? error.code
      : "AUTH_REQUIRED";
    return treasureEconomyJson({ status: "error", code }, status);
  }
  if (error instanceof RangeError || error instanceof TypeError) {
    return treasureEconomyJson({ status: "error", code: error.message }, 400);
  }
  console.error("Treasure Hunt economy request failed", error);
  return treasureEconomyJson({ status: "error", code: "INTERNAL_ERROR" }, 500);
}

export function bodyText(
  body: Record<string, unknown> | null,
  key: string,
  minimum = 1,
  maximum = 160,
) {
  const value = body?.[key];
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    throw new TypeError(`INVALID_${key.toUpperCase()}`);
  }
  return value;
}

export function bodyNonNegativeInteger(
  body: Record<string, unknown> | null,
  key: string,
) {
  const value = body?.[key];
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new TypeError(`INVALID_${key.toUpperCase()}`);
  }
  return Number(value);
}
