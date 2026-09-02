import { NextResponse } from "next/server";

import { readWalletSession } from "@/lib/wallet-auth";
import { getAmbassadorDashboard } from "@/lib/uki-economy/ambassadors/public";
import {
  assertAmbassadorRuntime,
  validAmbassadorWallet,
} from "@/lib/uki-economy/ambassadors/rules";
import { AMBASSADOR_ATTRIBUTION_POLICY } from "@/lib/uki-economy/ambassadors/types";
import { UkiEconomyError } from "@/lib/uki-economy/errors";

export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET() {
  try {
    assertAmbassadorRuntime(process.env);
    const session = await readWalletSession();
    if (
      !session ||
      session.walletType !== "evm" ||
      typeof session.signedWalletAddress !== "string"
    ) {
      return json({ status: "error", code: "AUTH_REQUIRED" }, 401);
    }
    const wallet = validAmbassadorWallet(session.signedWalletAddress);
    const dashboard = await getAmbassadorDashboard(wallet);
    return json({
      status: "ok",
      policy: AMBASSADOR_ATTRIBUTION_POLICY,
      dashboard,
    });
  } catch (error) {
    if (error instanceof UkiEconomyError) {
      return json(
        { status: "error", code: error.code },
        error.code === "CONFLICT"
          ? 409
          : error.code === "VALIDATION"
          ? 400
          : 503
      );
    }
    if (
      error instanceof TypeError &&
      error.message === "AMBASSADOR_RUNTIME_MISCONFIGURED"
    ) {
      return json({ status: "error", code: error.message }, 503);
    }
    console.error("Ambassador summary request failed", error);
    return json(
      { status: "error", code: "AMBASSADOR_SERVICE_UNAVAILABLE" },
      503
    );
  }
}
