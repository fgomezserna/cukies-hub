import { NextResponse } from "next/server";

import { getEconomyDb } from "@/lib/indexer-db/mongodb";
import { UkiEconomyError } from "@/lib/uki-economy/errors";
import { persistGameEconomyRule } from "@/lib/uki-economy/game-economy/control-plane";
import { parseGameRuleCommand } from "@/lib/uki-economy/game-economy/rule-command";
import {
  InternalEconomyAuthError,
  createMongoInternalEconomyNonceRepository,
  loadInternalEconomyAuthConfig,
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from "@/lib/uki-economy/internal-auth";

export const dynamic = "force-dynamic";

const PATH = "/api/economy/v1/internal/game-admin/rules";

function requiredHeader(request: Request, name: string) {
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
        timestamp: requiredHeader(request, "x-economy-timestamp"),
        nonce: requiredHeader(request, "x-economy-nonce"),
        keyId: requiredHeader(request, "x-economy-key-id"),
        signature: requiredHeader(request, "x-economy-signature"),
        rawBody,
      },
      config: loadInternalEconomyAuthConfig(),
      nonces: createMongoInternalEconomyNonceRepository(db),
    });
    const rule = await persistGameEconomyRule({
      ...parseGameRuleCommand(rawBody),
      now: new Date(),
    });
    return NextResponse.json({ status: "ok", rule });
  } catch (error) {
    if (error instanceof InternalEconomyAuthError) {
      return NextResponse.json(
        { status: "error", code: error.code },
        { status: error.code === "CONFIGURATION" ? 503 : 401 },
      );
    }
    if (error instanceof UkiEconomyError) {
      const status = error.code === "VALIDATION" ? 400 : error.code === "NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ status: "error", code: `GAME_RULE_${error.code}` }, { status });
    }
    return NextResponse.json(
      { status: "error", code: "GAME_RULE_COMMAND_FAILED" },
      { status: 503 },
    );
  }
}
