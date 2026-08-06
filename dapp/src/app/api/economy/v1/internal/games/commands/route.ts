import { NextResponse } from "next/server";

import { getEconomyDb } from "@/lib/indexer-db/mongodb";
import { UkiEconomyError } from "@/lib/uki-economy/errors";
import {
  completeGameSession,
  openGameSession,
  rejectGameSession,
} from "@/lib/uki-economy/game-economy/coordinator";
import { parseGameInternalCommand } from "@/lib/uki-economy/game-economy/internal-command";
import {
  InternalEconomyAuthError,
  createMongoInternalEconomyNonceRepository,
  loadGameEconomyAuthConfig,
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from "@/lib/uki-economy/internal-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PATH = "/api/economy/v1/internal/games/commands";

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
      config: loadGameEconomyAuthConfig(),
      nonces: createMongoInternalEconomyNonceRepository(db),
    });
    const command = parseGameInternalCommand(rawBody);
    const now = new Date();
    const result = command.command === "open_session"
      ? await openGameSession({ ...command.payload, now })
      : command.command === "complete_session"
        ? await completeGameSession({ ...command.payload, now })
        : await rejectGameSession({ ...command.payload, now });
    return NextResponse.json({ status: "ok", command: command.command, result });
  } catch (error) {
    if (error instanceof InternalEconomyAuthError) {
      return NextResponse.json(
        { status: "error", code: error.code },
        { status: error.code === "CONFIGURATION" ? 503 : 401 },
      );
    }
    if (error instanceof UkiEconomyError) {
      const status = error.code === "VALIDATION" ? 400 : error.code === "NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ status: "error", code: `GAME_${error.code}` }, { status });
    }
    return NextResponse.json(
      { status: "error", code: "GAME_COMMAND_FAILED" },
      { status: 503 },
    );
  }
}
