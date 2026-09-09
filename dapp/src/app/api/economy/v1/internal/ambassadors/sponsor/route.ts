import { NextResponse } from "next/server";

import { getEconomyDb, withEconomyTransaction } from "@/lib/indexer-db/mongodb";
import {
  changeCanonicalAmbassadorSponsor,
  ensureMongoAmbassadorOverrideIndexes,
  type ChangeCanonicalAmbassadorSponsorInput,
} from "@/lib/uki-economy/ambassadors/admin";
import { assertAmbassadorRuntime } from "@/lib/uki-economy/ambassadors/rules";
import { UkiEconomyError } from "@/lib/uki-economy/errors";
import {
  InternalEconomyAuthError,
  createMongoInternalEconomyNonceRepository,
  loadInternalEconomyAuthConfig,
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from "@/lib/uki-economy/internal-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PATH = "/api/economy/v1/internal/ambassadors/sponsor";

function loadAmbassadorAdminAuthConfig() {
  return loadInternalEconomyAuthConfig({
    ...process.env,
    ECONOMY_INTERNAL_HMAC_KEY_ID: process.env.AMBASSADOR_ADMIN_HMAC_KEY_ID,
    ECONOMY_INTERNAL_HMAC_SECRET: process.env.AMBASSADOR_ADMIN_HMAC_SECRET,
  });
}

function requiredHeader(request: Request, name: string) {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new InternalEconomyAuthError("INVALID_REQUEST", `Falta header ${name}.`);
  return value;
}

function parseCommand(rawBody: Buffer | Uint8Array | string): Omit<ChangeCanonicalAmbassadorSponsorInput, "actor" | "keyId" | "session" | "now"> {
  let value: unknown;
  try {
    value = JSON.parse(typeof rawBody === "string" ? rawBody : Buffer.from(rawBody).toString("utf8"));
  } catch {
    throw new UkiEconomyError("VALIDATION", "El cuerpo debe ser JSON válido.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UkiEconomyError("VALIDATION", "El comando debe ser un objeto JSON.");
  }
  const command = value as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(command, "expectedCurrentSponsor")) {
    throw new UkiEconomyError("VALIDATION", "expectedCurrentSponsor debe ser explícito; usa null si no existe relación.");
  }
  for (const serverOnlyField of ["actor", "keyId", "now", "effectiveAt"]) {
    if (Object.prototype.hasOwnProperty.call(command, serverOnlyField)) {
      throw new UkiEconomyError("VALIDATION", `${serverOnlyField} lo determina el servidor.`);
    }
  }
  if (typeof command.referredWallet !== "string" || typeof command.sponsorWallet !== "string" || typeof command.reason !== "string" || typeof command.idempotencyKey !== "string") {
    throw new UkiEconomyError("VALIDATION", "referredWallet, sponsorWallet, reason e idempotencyKey son obligatorios.");
  }
  if (command.expectedCurrentSponsor !== null && typeof command.expectedCurrentSponsor !== "string") {
    throw new UkiEconomyError("VALIDATION", "expectedCurrentSponsor debe ser una wallet o null.");
  }
  return {
    referredWallet: command.referredWallet,
    sponsorWallet: command.sponsorWallet,
    expectedCurrentSponsor: command.expectedCurrentSponsor,
    reason: command.reason,
    idempotencyKey: command.idempotencyKey,
  };
}

export async function POST(request: Request) {
  try {
    const rawBody = await readLimitedInternalEconomyRequestBody(request);
    const timestamp = requiredHeader(request, "x-economy-timestamp");
    const nonce = requiredHeader(request, "x-economy-nonce");
    const keyId = requiredHeader(request, "x-economy-key-id");
    const signature = requiredHeader(request, "x-economy-signature");
    const config = loadAmbassadorAdminAuthConfig();
    assertAmbassadorRuntime(process.env);
    const command = parseCommand(rawBody);
    const db = await getEconomyDb();
    const auth = await verifyAndConsumeInternalEconomyRequest({
      request: {
        method: "POST",
        path: PATH,
        timestamp,
        nonce,
        keyId,
        signature,
        rawBody,
      },
      config,
      nonces: createMongoInternalEconomyNonceRepository(db),
    });
    await ensureMongoAmbassadorOverrideIndexes(db);
    const result = await withEconomyTransaction((transactionDb, session) =>
      changeCanonicalAmbassadorSponsor(transactionDb, {
        ...command,
        actor: auth.keyId,
        keyId: auth.keyId,
        session,
      }),
    );
    return NextResponse.json({
      status: "ok",
      changed: result.changed,
      overrideId: result.overrideId,
      attribution: result.attribution,
      actor: auth.keyId,
    });
  } catch (error) {
    if (error instanceof InternalEconomyAuthError) {
      return NextResponse.json(
        { status: "error", code: error.code },
        { status: error.code === "CONFIGURATION" ? 503 : 401 },
      );
    }
    if (error instanceof UkiEconomyError) {
      const status = error.code === "VALIDATION" ? 400 : error.code === "NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ status: "error", code: `AMBASSADOR_ADMIN_${error.code}`, details: error.details }, { status });
    }
    console.error("Ambassador sponsor admin request failed", error);
    return NextResponse.json({ status: "error", code: "AMBASSADOR_ADMIN_FAILED" }, { status: 503 });
  }
}
