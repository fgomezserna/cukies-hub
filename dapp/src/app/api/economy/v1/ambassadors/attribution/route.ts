import { NextResponse } from "next/server";

import { readWalletSession } from "@/lib/wallet-auth";
import {
  acceptCanonicalAmbassadorInvitation,
  getCanonicalAmbassadorAttribution,
} from "@/lib/uki-economy/ambassadors/service";
import {
  assertAmbassadorAttributionWritesEnabled,
  assertAmbassadorInvitationCode,
  assertAmbassadorRuntime,
  stableAmbassadorHash,
  validAmbassadorWallet,
} from "@/lib/uki-economy/ambassadors/rules";
import { AMBASSADOR_ATTRIBUTION_POLICY } from "@/lib/uki-economy/ambassadors/types";
import { UkiEconomyError } from "@/lib/uki-economy/errors";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

async function signedIdentity() {
  const session = await readWalletSession();
  if (
    !session ||
    session.walletType !== "evm" ||
    typeof session.userId !== "string" ||
    !session.userId.trim() ||
    typeof session.signedWalletAddress !== "string"
  ) return null;
  let walletAddress: string;
  try {
    walletAddress = validAmbassadorWallet(session.signedWalletAddress);
  } catch {
    return null;
  }
  return {
    walletAddress,
    signedSessionEvidenceHash: stableAmbassadorHash({
      kind: "signed_wallet_session",
      userId: session.userId,
      signedWalletAddress: walletAddress,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
    }),
  };
}

async function readBody(request: Request) {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function responseAttribution(attribution: Awaited<ReturnType<typeof getCanonicalAmbassadorAttribution>>) {
  return attribution ? {
    attributionId: attribution.attributionId,
    referredWalletNormalized: attribution.referredWalletNormalized,
    ambassadorWalletNormalized: attribution.ambassadorWalletNormalized,
    source: attribution.source,
    policyVersion: attribution.policyVersion,
    commissionBps: attribution.commissionBpsSnapshot,
    levels: attribution.levelsSnapshot,
    acceptedAt: attribution.acceptedAt.toISOString(),
    evidenceHash: attribution.evidenceHash,
  } : null;
}

function errorResponse(error: unknown) {
  if (error instanceof UkiEconomyError) {
    return json(
      { status: "error", code: error.code },
      error.code === "CONFLICT" ? 409 : error.code === "NOT_FOUND" ? 404 : 400,
    );
  }
  if (
    error instanceof TypeError &&
    error.message === "AMBASSADOR_RUNTIME_MISCONFIGURED"
  ) {
    return json({ status: "error", code: error.message }, 400);
  }
  if (
    error instanceof TypeError &&
    error.message === "AMBASSADOR_ATTRIBUTION_WRITES_DISABLED"
  ) {
    return json({ status: "error", code: error.message }, 503);
  }
  console.error("Ambassador attribution request failed", error);
  return json({ status: "error", code: "INTERNAL_ERROR" }, 500);
}

export async function GET() {
  try {
    assertAmbassadorRuntime(process.env);
    const identity = await signedIdentity();
    if (!identity) return json({ status: "error", code: "AUTH_REQUIRED" }, 401);
    const attribution = await getCanonicalAmbassadorAttribution(identity.walletAddress);
    return json({
      status: "ok",
      policy: AMBASSADOR_ATTRIBUTION_POLICY,
      attribution: responseAttribution(attribution),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertAmbassadorRuntime(process.env);
    assertAmbassadorAttributionWritesEnabled(process.env);
    const identity = await signedIdentity();
    if (!identity) return json({ status: "error", code: "AUTH_REQUIRED" }, 401);
    const body = await readBody(request);
    if (typeof body?.invitationCode !== "string") {
      return json({ status: "error", code: "INVALID_INVITATION_CODE" }, 400);
    }
    const invitationCode = assertAmbassadorInvitationCode(body.invitationCode);
    const attribution = await acceptCanonicalAmbassadorInvitation({
      referredWallet: identity.walletAddress,
      invitationCode,
      signedSessionEvidenceHash: identity.signedSessionEvidenceHash,
    });
    return json({
      status: "ok",
      policy: AMBASSADOR_ATTRIBUTION_POLICY,
      attribution: responseAttribution(attribution),
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
