import "server-only";

import { DomainConflictError } from "../errors";
import type { CreditRoute, CreditSnapshotSlot } from "./types";

export const PENDING_CREDIT_SOURCE_EVENT_STATUSES = [
  "ingested",
  "projecting",
  "failed",
] as const;

type VerifiedSlotEvidence = Pick<
  CreditSnapshotSlot,
  | "_id"
  | "route"
  | "sourceBlockNumber"
  | "sourceBlockHash"
  | "sourceBlockTimestamp"
>;

export type CreditVerifiedSlotVersion = {
  _id: string;
  slotId: string;
  route: CreditRoute;
  effectiveBlockNumber: number;
  effectiveBlockHash: string;
  effectiveBlockTimestamp: Date;
  slot: VerifiedSlotEvidence;
};

export type CreditVerifiedHistoryCoverage = {
  completeFrom: Date;
  completeFromBlockNumber: number;
  verifiedSlotCount: number;
};

function historyConflict(
  message: string,
  route: CreditRoute,
  reasonCode: string,
  details: Record<string, unknown> = {},
) {
  return new DomainConflictError(message, {
    reasonCode,
    route,
    ...details,
  });
}

function validVerifiedVersion(
  version: CreditVerifiedSlotVersion,
  route: CreditRoute,
) {
  return (
    typeof version._id === "string" &&
    typeof version.slotId === "string" &&
    version.route === route &&
    Number.isSafeInteger(version.effectiveBlockNumber) &&
    version.effectiveBlockNumber >= 0 &&
    /^0x[0-9a-f]{64}$/.test(version.effectiveBlockHash) &&
    version.effectiveBlockTimestamp instanceof Date &&
    !Number.isNaN(version.effectiveBlockTimestamp.getTime()) &&
    version.slot?._id === version.slotId &&
    version.slot.route === route &&
    version.slot.sourceBlockNumber === version.effectiveBlockNumber &&
    version.slot.sourceBlockHash === version.effectiveBlockHash &&
    version.slot.sourceBlockTimestamp instanceof Date &&
    version.slot.sourceBlockTimestamp.getTime() ===
      version.effectiveBlockTimestamp.getTime()
  );
}

/**
 * Returns the first block from which every currently known slot has canonical
 * temporal evidence. Unverified migration backfills are deliberately excluded.
 */
export function deriveVerifiedCreditHistoryCoverage(input: {
  route: CreditRoute;
  sourceSlots: Array<Pick<CreditSnapshotSlot, "_id" | "route">>;
  earliestVerifiedVersions: CreditVerifiedSlotVersion[];
}): CreditVerifiedHistoryCoverage {
  const sourceSlotIds = new Set<string>();
  for (const slot of input.sourceSlots) {
    if (
      typeof slot._id !== "string" ||
      slot.route !== input.route ||
      sourceSlotIds.has(slot._id)
    ) {
      throw historyConflict(
        `Los slots ${input.route} no tienen una identidad canonica unica.`,
        input.route,
        "HISTORY_SOURCE_SLOT_SET_INVALID",
      );
    }
    sourceSlotIds.add(slot._id);
  }
  if (sourceSlotIds.size === 0) {
    throw historyConflict(
      `La ruta ${input.route} no tiene slots con los que acreditar su baseline historico.`,
      input.route,
      "HISTORY_EMPTY_ROUTE_REQUIRES_BASELINE",
    );
  }

  const verifiedBySlot = new Map<string, CreditVerifiedSlotVersion>();
  for (const version of input.earliestVerifiedVersions) {
    if (
      !validVerifiedVersion(version, input.route) ||
      !sourceSlotIds.has(version.slotId) ||
      verifiedBySlot.has(version.slotId)
    ) {
      throw historyConflict(
        `La cobertura historica ${input.route} contiene evidencia no canonica.`,
        input.route,
        "HISTORY_VERIFIED_VERSION_INVALID",
      );
    }
    verifiedBySlot.set(version.slotId, version);
  }
  if (verifiedBySlot.size !== sourceSlotIds.size) {
    throw historyConflict(
      `La cobertura historica ${input.route} no acredita todos sus slots.`,
      input.route,
      "HISTORY_VERIFIED_SLOT_COVERAGE_INCOMPLETE",
      {
        sourceSlotCount: sourceSlotIds.size,
        verifiedSlotCount: verifiedBySlot.size,
      },
    );
  }

  const coverageStart = [...verifiedBySlot.values()].reduce((latest, version) => {
    if (version.effectiveBlockNumber !== latest.effectiveBlockNumber) {
      return version.effectiveBlockNumber > latest.effectiveBlockNumber
        ? version
        : latest;
    }
    return version.effectiveBlockTimestamp.getTime() >
      latest.effectiveBlockTimestamp.getTime()
      ? version
      : latest;
  });
  return {
    completeFrom: new Date(coverageStart.effectiveBlockTimestamp.getTime()),
    completeFromBlockNumber: coverageStart.effectiveBlockNumber,
    verifiedSlotCount: verifiedBySlot.size,
  };
}
