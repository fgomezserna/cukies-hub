import type { CreditIntegrityIncident, CreditRoute } from "./types";

export const HISTORICAL_SLOT_HISTORY_CONTAINMENT =
  "pool_positions_excluded_by_reward_contributor_selector" as const;

const SHA256_HEX = /^[0-9a-f]{64}$/;
const RUN_ID_HEX = /^[0-9a-f]{64}$/;
const PERIOD_CUTOFF = /^[A-Za-z0-9][A-Za-z0-9:._-]*:[0-9a-f]{64}:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/;

export function isKnownCreditRoute(value: unknown): value is CreditRoute {
  return value === "uki" || value === "nft";
}

function incidentCutoff(periodId: unknown) {
  if (typeof periodId !== "string") return null;
  const match = PERIOD_CUTOFF.exec(periodId);
  if (!match) return null;
  const parsed = new Date(match[1]);
  try {
    return parsed.toISOString() === match[1] ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Historical slot-history corrections remain open for reward exclusion, but
 * only a correction for a strictly earlier cutoff can be bypassed by a new
 * snapshot. Malformed or ambiguous documents remain blocking.
 */
export function isContainedHistoricalCreditIncident(
  incident: CreditIntegrityIncident,
  route: CreditRoute,
  cutoff: Date,
) {
  const incidentCutoffAt = incidentCutoff(incident.periodId);
  return (
    incident.status === "open" &&
    incident.route === route &&
    incident.type === "credit_reconciliation_mismatch" &&
    Array.isArray(incident.reasonCodes) &&
    incident.reasonCodes.length === 1 &&
    incident.reasonCodes[0] === "SOURCE_SLOT_HISTORY_CORRECTED" &&
    incident.containment === HISTORICAL_SLOT_HISTORY_CONTAINMENT &&
    incident.selectorCutoff === 0 &&
    SHA256_HEX.test(incident.planHash ?? "") &&
    SHA256_HEX.test(incident.evidenceHash) &&
    RUN_ID_HEX.test(incident.runId) &&
    incidentCutoffAt !== null &&
    incidentCutoffAt.getTime() < cutoff.getTime()
  );
}

export function isBlockingCreditIncident(
  incident: CreditIntegrityIncident,
  route: CreditRoute,
  cutoff: Date,
) {
  if (incident.status !== "open") return false;
  // A persisted document outside the two route values is a malformed/global
  // incident. It must remain a block for every route rather than being
  // discarded by a route-specific query.
  if (!isKnownCreditRoute(incident.route)) return true;
  return (
    incident.route === route &&
    !isContainedHistoricalCreditIncident(incident, route, cutoff)
  );
}

/**
 * Reservation and public availability use the global integrity decision. A
 * valid contained historical correction is exempt only for its own route and
 * an older cutoff; every other open incident blocks the wallet.
 */
export function isBlockingCreditIncidentGlobally(
  incident: CreditIntegrityIncident,
  cutoff: Date,
) {
  return isKnownCreditRoute(incident.route)
    ? isBlockingCreditIncident(incident, incident.route, cutoff)
    : isBlockingCreditIncident(incident, "uki", cutoff);
}
