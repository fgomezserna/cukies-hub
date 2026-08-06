import { NextResponse } from "next/server";

import { getEconomyDb } from "@/lib/indexer-db/mongodb";
import {
  GameEconomyRuntimeBusyError,
  GameEconomyRuntimeConfigurationError,
  runGameEconomyRuntimeTick,
} from "@/lib/uki-economy/game-economy/runtime";
import {
  InternalEconomyAuthError,
  createMongoInternalEconomyNonceRepository,
  loadInternalEconomyAuthConfig,
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from "@/lib/uki-economy/internal-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PATH = "/api/economy/v1/internal/games/tick";

function header(request: Request, name: string) {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new InternalEconomyAuthError("INVALID_REQUEST", `Falta header ${name}.`);
  return value;
}

function payload(rawBody: Buffer) {
  if (rawBody.byteLength === 0) return { workerId: "game-economy-scheduler" };
  const parsed = JSON.parse(rawBody.toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new SyntaxError();
  const keys = Object.keys(parsed);
  if (keys.length !== 1 || keys[0] !== "workerId") throw new SyntaxError();
  return { workerId: (parsed as { workerId: string }).workerId };
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
    return NextResponse.json(await runGameEconomyRuntimeTick(payload(rawBody)));
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
    if (error instanceof GameEconomyRuntimeBusyError) {
      return NextResponse.json({ status: "busy", code: "GAME_RUNTIME_BUSY" }, { status: 409 });
    }
    if (error instanceof GameEconomyRuntimeConfigurationError) {
      return NextResponse.json({ status: "error", code: "GAME_RUNTIME_CONFIGURATION" }, { status: 503 });
    }
    return NextResponse.json({ status: "error", code: "GAME_RUNTIME_TICK_FAILED" }, { status: 503 });
  }
}
