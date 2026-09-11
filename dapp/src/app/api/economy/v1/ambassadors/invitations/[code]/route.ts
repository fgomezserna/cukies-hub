import { NextResponse } from "next/server";

import { getPublicAmbassadorInvitation } from "@/lib/uki-economy/ambassadors/public";
import {
  AMBASSADOR_ELIGIBILITY_UNAVAILABLE,
  assertAmbassadorRuntime,
} from "@/lib/uki-economy/ambassadors/rules";
import { UkiEconomyError } from "@/lib/uki-economy/errors";

export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      // Solo una invitación resuelta puede cachearse públicamente. Un 404 o
      // un 503 transitorio no debe quedarse servido como si fuera un estado
      // canónico del enlace.
      "Cache-Control": status >= 400
        ? "private, no-store, max-age=0"
        : "public, max-age=60, stale-while-revalidate=300",
    },
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
    if (
      error instanceof TypeError &&
      ["AMBASSADOR_RUNTIME_MISCONFIGURED", AMBASSADOR_ELIGIBILITY_UNAVAILABLE].includes(error.message)
    ) {
      return json({ status: "error", code: error.message }, 503);
    }
    console.error("Ambassador invitation request failed", error);
    return json({ status: "error", code: "AMBASSADOR_SERVICE_UNAVAILABLE" }, 503);
  }
}
