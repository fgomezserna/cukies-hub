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
import { parseWeeklyRankingRuleCommand } from "@/lib/uki-economy/ranking/internal-command";
import { weeklyRankingService } from "@/lib/uki-economy/ranking/service";

export const dynamic = "force-dynamic";

const PATH = "/api/economy/v1/internal/ranking/admin/rules";

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
    const result = await weeklyRankingService.persistCurrentRule({
      ...parseWeeklyRankingRuleCommand(rawBody),
      now: new Date(),
    });
    return NextResponse.json({ status: "ok", ...result });
  } catch (error) {
    if (error instanceof InternalEconomyAuthError) {
      return NextResponse.json(
        { status: "error", code: error.code },
        { status: error.code === "CONFIGURATION" ? 503 : 401 },
      );
    }
    if (error instanceof UkiEconomyError) {
      return NextResponse.json(
        { status: "error", code: `WEEKLY_RANKING_${error.code}` },
        { status: error.code === "VALIDATION" ? 400 : 409 },
      );
    }
    return NextResponse.json({ status: "error", code: "WEEKLY_RANKING_RULE_FAILED" }, { status: 503 });
  }
}
