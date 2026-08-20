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
import {
  loadRewardAccountingRuntimeConfig,
  runRewardAccountingRuntimeTick,
} from "@/lib/uki-economy/rewards/accounting-runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PATH = "/api/economy/v1/internal/rewards/accounting/tick";

function header(request: Request, name: string) {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new InternalEconomyAuthError("INVALID_REQUEST", `Falta header ${name}.`);
  return value;
}

function parseBody(rawBody: Buffer) {
  if (rawBody.byteLength === 0) return;
  const parsed = JSON.parse(rawBody.toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new SyntaxError();
  const keys = Object.keys(parsed);
  if (keys.length !== 1 || keys[0] !== "workerId" || typeof (parsed as { workerId?: unknown }).workerId !== "string") {
    throw new SyntaxError();
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await readLimitedInternalEconomyRequestBody(request);
    parseBody(rawBody);
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
    return NextResponse.json(await runRewardAccountingRuntimeTick({
      config: loadRewardAccountingRuntimeConfig(),
    }));
  } catch (error) {
    if (error instanceof InternalEconomyAuthError) {
      return NextResponse.json(
        { status: "error", code: error.code },
        { status: error.code === "CONFIGURATION" ? 503 : 401 },
      );
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ status: "error", code: "INVALID_JSON" }, { status: 400 });
    }
    if (error instanceof UkiEconomyError) {
      return NextResponse.json(
        { status: "error", code: `REWARD_ACCOUNTING_${error.code}` },
        { status: error.code === "VALIDATION" ? 400 : 409 },
      );
    }
    return NextResponse.json(
      { status: "error", code: "REWARD_ACCOUNTING_TICK_FAILED" },
      { status: 503 },
    );
  }
}
