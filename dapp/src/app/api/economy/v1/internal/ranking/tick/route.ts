import { NextResponse } from "next/server";

import { getEconomyDb } from "@/lib/indexer-db/mongodb";
import { UkiEconomyError } from "@/lib/uki-economy/errors";
import {
  InternalEconomyAuthError,
  createMongoInternalEconomyNonceRepository,
  loadInternalEconomyAuthConfig,
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from "@/lib/uki-economy/internal-auth";
import { parseWeeklyRankingTickCommand } from "@/lib/uki-economy/ranking/internal-command";
import {
  WeeklyRankingRuntimeBusyError,
  WeeklyRankingRuntimeConfigurationError,
  runWeeklyRankingRuntimeTick,
} from "@/lib/uki-economy/ranking/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PATH = "/api/economy/v1/internal/ranking/tick";

function header(request: Request, name: string) {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new InternalEconomyAuthError("INVALID_REQUEST", `Falta header ${name}.`);
  return value;
}

export async function POST(request: Request) {
  try {
    const rawBody = await readLimitedInternalEconomyRequestBody(request);
    const db = await getEconomyDb();
    await verifyAndConsumeInternalEconomyRequest({
      request: {
        method: "POST",
        path: PATH,
        timestamp: header(request, "x-economy-timestamp"),
        nonce: header(request, "x-economy-nonce"),
        keyId: header(request, "x-economy-key-id"),
        signature: header(request, "x-economy-signature"),
        rawBody,
      },
      config: loadInternalEconomyAuthConfig(),
      nonces: createMongoInternalEconomyNonceRepository(db),
    });
    return NextResponse.json(await runWeeklyRankingRuntimeTick(parseWeeklyRankingTickCommand(rawBody)));
  } catch (error) {
    if (error instanceof InternalEconomyAuthError) {
      return NextResponse.json(
        { status: "error", code: error.code },
        { status: error.code === "CONFIGURATION" ? 503 : 401 },
      );
    }
    if (error instanceof WeeklyRankingRuntimeBusyError) {
      return NextResponse.json({ status: "busy", code: "WEEKLY_RANKING_RUNTIME_BUSY" }, { status: 409 });
    }
    if (error instanceof WeeklyRankingRuntimeConfigurationError) {
      return NextResponse.json({ status: "error", code: "WEEKLY_RANKING_RUNTIME_CONFIGURATION" }, { status: 503 });
    }
    if (error instanceof UkiEconomyError) {
      return NextResponse.json(
        { status: "error", code: `WEEKLY_RANKING_${error.code}` },
        { status: error.code === "VALIDATION" ? 400 : 409 },
      );
    }
    return NextResponse.json({ status: "error", code: "WEEKLY_RANKING_TICK_FAILED" }, { status: 503 });
  }
}
