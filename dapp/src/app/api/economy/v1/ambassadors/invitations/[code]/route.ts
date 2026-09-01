import { NextResponse } from "next/server";

import { getPublicAmbassadorInvitation } from "@/lib/uki-economy/ambassadors/public";
import { assertAmbassadorRuntime } from "@/lib/uki-economy/ambassadors/rules";
import { UkiEconomyError } from "@/lib/uki-economy/errors";

export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    assertAmbassadorRuntime(process.env);
    const invitation = await getPublicAmbassadorInvitation((await params).code);
    return invitation
      ? json({ status: "ok", invitation })
      : json({ status: "error", code: "INVITATION_NOT_FOUND" }, 404);
  } catch (error) {
    if (error instanceof UkiEconomyError && error.code === "VALIDATION") {
      return json({ status: "error", code: "INVALID_INVITATION_CODE" }, 400);
    }
    if (error instanceof TypeError && error.message === "AMBASSADOR_RUNTIME_MISCONFIGURED") {
      return json({ status: "error", code: error.message }, 503);
    }
    console.error("Ambassador invitation request failed", error);
    return json({ status: "error", code: "AMBASSADOR_SERVICE_UNAVAILABLE" }, 503);
  }
}
