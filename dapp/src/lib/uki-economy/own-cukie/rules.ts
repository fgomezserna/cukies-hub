import { createHash } from "node:crypto";

import { normalizeWalletAddress } from "@/lib/wallet-address";
import { gamesQuota } from "@/lib/uki-economy/cukie-pool/rules";

import { DomainConflictError, DomainValidationError } from "../errors";
import type {
  OwnCukieAssignment,
  OwnCukieAssetSnapshot,
  OwnCukieEpoch,
  OwnCukieGeneration,
  OwnCukieRarity,
} from "./types";

export const OWN_CUKIE_SELECTION_POLICY = "owned_bsc_quota_then_pool_v1" as const;
export const OWN_CUKIE_MAX_WALLET_ASSETS = 1_000;
/**
 * Versioned period ledger. The version participates in the ledger identity so
 * a future quota-policy change can start a new ledger without rewriting this
 * period or the legacy lifetime epochs.
 */
export const OWN_CUKIE_DAILY_QUOTA_POLICY_VERSION = "own-cukie-daily-v1" as const;

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

export function stableOwnCukieHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

export function requiredOwnCukieText(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) {
    throw new DomainValidationError(`${label} no es texto canonico.`);
  }
  return value.trim();
}

export function validOwnCukieDate(value: Date | undefined, label: string, fallback?: Date) {
  const result = value ?? fallback;
  if (!(result instanceof Date) || Number.isNaN(result.getTime())) {
    throw new DomainValidationError(`${label} debe ser una fecha valida.`);
  }
  return new Date(result);
}

export function normalizeOwnCukieWallet(value: string) {
  const result = normalizeWalletAddress(requiredOwnCukieText(value, "walletAddress"));
  if (!/^0x[0-9a-f]{40}$/.test(result) || /^0x0{40}$/.test(result)) {
    throw new DomainValidationError("walletAddress debe ser una wallet BSC valida.");
  }
  return result;
}

export function ownCukieEpochId(input: {
  assetId: string;
  ownerNormalized: string;
  ownershipEventId: string;
}) {
  return stableOwnCukieHash({
    kind: "own-cukie-ownership-epoch",
    assetId: input.assetId,
    ownerNormalized: input.ownerNormalized,
    ownershipEventId: input.ownershipEventId,
  });
}

export function ownCukiePeriodEpochId(input: {
  assetId: string;
  periodId: string;
  quotaPolicyVersion: string;
}) {
  return stableOwnCukieHash({
    kind: "own-cukie-period-epoch",
    assetId: requiredOwnCukieText(input.assetId, "assetId"),
    periodId: requiredOwnCukieText(input.periodId, "periodId"),
    quotaPolicyVersion: requiredOwnCukieText(input.quotaPolicyVersion, "quotaPolicyVersion"),
  });
}

export function ownCukieAssignmentId(sessionId: string) {
  return stableOwnCukieHash({
    kind: "own-cukie-game-assignment",
    sessionId: requiredOwnCukieText(sessionId, "sessionId"),
  });
}

export function ownCukieQuota(generation: OwnCukieGeneration, rarity: OwnCukieRarity) {
  return gamesQuota(generation, rarity);
}

export function assertOwnCukieAssetEligible(
  asset: OwnCukieAssetSnapshot,
  walletNormalized: string,
) {
  // A game reservation may only use a Cukie that is currently in the wallet.
  // Master staking, Pool custody/loan, Marketplace (legacy/V2), bridge and any
  // unknown lock remain unavailable until their lock is fully terminal.
  const available = asset.canonicalState === "available" && asset.activeLocks.length === 0;
  if (
    asset.network !== "bsc"
    || asset.ownerNormalized !== walletNormalized
    || !asset.tokenId
    || !asset.ownershipEventId
    || asset.generation === "unknown"
    || asset.rarity === "unknown"
    || !available
    || asset.blockers.some((blocker) => [
      "asset_not_found",
      "owner_mismatch",
      "unknown_owner",
      "unknown_network",
      "unsupported_network",
      "missing_token_id",
      "missing_rarity",
      "missing_generation",
      "listed",
      "bridging",
      "in_pool",
      "assigned_to_game",
      "invalidated",
      "unknown_state",
    ].includes(blocker))
  ) {
    throw new DomainConflictError(`El asset ${asset.assetId} no es elegible como Cukie propio.`);
  }
  return {
    asset,
    generation: asset.generation as OwnCukieGeneration,
    rarity: asset.rarity as OwnCukieRarity,
    softStakeLockId: null,
  };
}

const KNOWN_INELIGIBLE_STATES = new Set([
  "listed",
  "bridging",
  "soft_staked",
  "in_pool",
  "assigned_to_game",
  "invalidated",
]);

const KNOWN_INELIGIBLE_BLOCKERS = new Set([
  "owner_mismatch",
  "unsupported_network",
  "listed",
  "bridging",
  "already_locked",
  "in_pool",
  "assigned_to_game",
  "invalidated",
  "soft_stake_required",
]);

const KNOWN_ACTIVE_LOCK_STATES = new Set([
  "listed",
  "bridging",
  "soft_staked",
  "in_pool",
  "assigned_to_game",
  "invalidated",
]);

function isEvmWallet(value: unknown): value is string {
  return typeof value === "string"
    && /^0x[0-9a-f]{40}$/i.test(value)
    && !/^0x0{40}$/i.test(value);
}

/**
 * Known custody/state exclusions must win over unrelated missing metadata.
 * For example, a soft-staked row without an ownership event is still known
 * unavailable for a game and must not make the whole wallet `unknown`.
 */
export function ownCukieAssetHasKnownIneligibilitySignals(
  asset: OwnCukieAssetSnapshot,
  walletNormalized?: string,
) {
  const ownerNormalized = typeof asset.ownerNormalized === "string"
    ? asset.ownerNormalized.trim().toLowerCase()
    : "";
  const requestedWallet = typeof walletNormalized === "string"
    ? walletNormalized.trim().toLowerCase()
    : "";
  const ownerMismatch = isEvmWallet(ownerNormalized)
    && isEvmWallet(requestedWallet)
    && ownerNormalized !== requestedWallet;
  return (
    asset.network === "tron"
    || KNOWN_INELIGIBLE_STATES.has(asset.canonicalState)
    || asset.blockers.some((blocker) => KNOWN_INELIGIBLE_BLOCKERS.has(blocker))
    || ownerMismatch
    || asset.activeLocks.some((lock) => (
      typeof lock.lockId === "string"
      && lock.lockId.trim().length > 0
      && typeof lock.reason === "string"
      && lock.reason.trim().length > 0
      && KNOWN_ACTIVE_LOCK_STATES.has(lock.state)
    ))
  );
}

/** Unknown inventory/ownership facts must not be silently counted as zero. */
export function ownCukieAssetHasUnknownEligibilitySignals(asset: OwnCukieAssetSnapshot) {
  const ownerNormalized = typeof asset.ownerNormalized === "string"
    ? asset.ownerNormalized.trim().toLowerCase()
    : "";
  const knownNetwork = asset.network === "bsc"
    || asset.network === "tron"
    || asset.network === "unknown";
  const knownState = [
    "available",
    "listed",
    "bridging",
    "soft_staked",
    "in_pool",
    "assigned_to_game",
    "invalidated",
    "unknown",
  ].includes(asset.canonicalState);
  return (
    typeof asset.network !== "string"
    || !knownNetwork
    || asset.network === "unknown"
    || !knownState
    || asset.canonicalState === "unknown"
    || !/^0x[0-9a-f]{40}$/.test(ownerNormalized)
    || /^0x0{40}$/.test(ownerNormalized)
    || asset.generation === "unknown"
    || asset.rarity === "unknown"
    || typeof asset.tokenId !== "string"
    || asset.tokenId.trim().length === 0
    || typeof asset.ownershipEventId !== "string"
    || asset.ownershipEventId.trim().length === 0
    || asset.activeLocks.some((lock) => (
      lock.state === "unknown"
      || !KNOWN_ACTIVE_LOCK_STATES.has(lock.state)
      || typeof lock.lockId !== "string"
      || lock.lockId.trim().length === 0
      || typeof lock.reason !== "string"
      || lock.reason.trim().length === 0
    ))
    || asset.blockers.some((blocker) => [
      "asset_not_found",
      "unknown_owner",
      "unknown_network",
      "missing_token_id",
      "missing_rarity",
      "missing_generation",
      "unknown_state",
    ].includes(blocker))
  );
}

export function assertOwnCukieEpochIntegrity(epoch: OwnCukieEpoch) {
  const periodScoped = Boolean(epoch.periodId || epoch.quotaPolicyVersion || epoch.periodStartsAt || epoch.periodEndsAt);
  const periodFieldsValid = !periodScoped || (
    typeof epoch.periodId === "string"
    && epoch.periodId.trim().length > 0
    && typeof epoch.quotaPolicyVersion === "string"
    && epoch.quotaPolicyVersion.trim().length > 0
  );
  const expectedId = periodScoped && periodFieldsValid
    ? ownCukiePeriodEpochId({
        assetId: epoch.assetId,
        periodId: epoch.periodId ?? "",
        quotaPolicyVersion: epoch.quotaPolicyVersion ?? "",
      })
    : ownCukieEpochId(epoch);
  const quota = ownCukieQuota(epoch.generation, epoch.rarity);
  const assigned = epoch.status === "assigned";
  const periodValid = !periodScoped || (
    typeof epoch.periodId === "string"
    && epoch.periodId.trim().length > 0
    && typeof epoch.quotaPolicyVersion === "string"
    && epoch.quotaPolicyVersion.trim().length > 0
    && epoch.periodStartsAt instanceof Date
    && !Number.isNaN(epoch.periodStartsAt.getTime())
    && epoch.periodEndsAt instanceof Date
    && !Number.isNaN(epoch.periodEndsAt.getTime())
    && epoch.periodEndsAt.getTime() > epoch.periodStartsAt.getTime()
  );
  if (
    epoch._id !== expectedId
    || epoch.epochId !== expectedId
    || epoch.gamesQuota !== quota
    || !Number.isSafeInteger(epoch.gamesRemaining)
    || epoch.gamesRemaining < 0
    || epoch.gamesRemaining > quota
    || !Number.isSafeInteger(epoch.revision)
    || epoch.revision < 0
    || !periodFieldsValid
    || !periodValid
    || assigned !== Boolean(epoch.assignmentSessionId && epoch.assignmentExpiresAt)
    || (epoch.status === "active" && epoch.gamesRemaining === 0)
    || (epoch.status === "exhausted" && epoch.gamesRemaining !== 0)
  ) {
    throw new DomainConflictError(`El ownership epoch ${epoch.epochId} no supera integridad.`);
  }
  return epoch;
}

export function assertOwnCukieAssignmentIntegrity(assignment: OwnCukieAssignment) {
  const expectedId = ownCukieAssignmentId(assignment.sessionId);
  const periodScoped = Boolean(
    assignment.periodId
    || assignment.quotaPolicyVersion
    || assignment.periodStartsAt
    || assignment.periodEndsAt,
  );
  const periodFieldsValid = !periodScoped || (
    typeof assignment.periodId === "string"
    && assignment.periodId.trim().length > 0
    && typeof assignment.quotaPolicyVersion === "string"
    && assignment.quotaPolicyVersion.trim().length > 0
  );
  const expectedEpochId = periodScoped && periodFieldsValid
    ? ownCukiePeriodEpochId({
        assetId: assignment.assetId,
        periodId: assignment.periodId ?? "",
        quotaPolicyVersion: assignment.quotaPolicyVersion ?? "",
      })
    : ownCukieEpochId(assignment);
  const periodValid = !periodScoped || (
    typeof assignment.periodId === "string"
    && assignment.periodId.trim().length > 0
    && typeof assignment.quotaPolicyVersion === "string"
    && assignment.quotaPolicyVersion.trim().length > 0
    && assignment.periodStartsAt instanceof Date
    && !Number.isNaN(assignment.periodStartsAt.getTime())
    && assignment.periodEndsAt instanceof Date
    && !Number.isNaN(assignment.periodEndsAt.getTime())
    && assignment.periodEndsAt.getTime() > assignment.periodStartsAt.getTime()
  );
  if (
    assignment._id !== expectedId
    || assignment.assignmentId !== expectedId
    || assignment.epochId !== expectedEpochId
    || !["active", "completed", "released", "invalidated"].includes(assignment.status)
    || !Number.isSafeInteger(assignment.lockFencingToken)
    || assignment.lockFencingToken < 1
    || !Number.isSafeInteger(assignment.revision)
    || assignment.revision < 0
    || !periodFieldsValid
    || !periodValid
    || assignment.expiresAt.getTime() <= assignment.assignedAt.getTime()
    || !/^[0-9a-f]{64}$/.test(assignment.requestHash)
  ) {
    throw new DomainConflictError(
      `La asignacion propia ${assignment.assignmentId} no supera integridad.`,
    );
  }
  return assignment;
}

export function cloneOwnCukieEpoch(epoch: OwnCukieEpoch): OwnCukieEpoch {
  return {
    ...epoch,
    createdAt: new Date(epoch.createdAt),
    updatedAt: new Date(epoch.updatedAt),
    ...(epoch.assignmentExpiresAt ? { assignmentExpiresAt: new Date(epoch.assignmentExpiresAt) } : {}),
    ...(epoch.invalidatedAt ? { invalidatedAt: new Date(epoch.invalidatedAt) } : {}),
    ...(epoch.periodStartsAt ? { periodStartsAt: new Date(epoch.periodStartsAt) } : {}),
    ...(epoch.periodEndsAt ? { periodEndsAt: new Date(epoch.periodEndsAt) } : {}),
  };
}

export function cloneOwnCukieAssignment(
  assignment: OwnCukieAssignment,
): OwnCukieAssignment {
  return {
    ...assignment,
    assignedAt: new Date(assignment.assignedAt),
    expiresAt: new Date(assignment.expiresAt),
    updatedAt: new Date(assignment.updatedAt),
    ...(assignment.periodStartsAt ? { periodStartsAt: new Date(assignment.periodStartsAt) } : {}),
    ...(assignment.periodEndsAt ? { periodEndsAt: new Date(assignment.periodEndsAt) } : {}),
    ...(assignment.terminalAt ? { terminalAt: new Date(assignment.terminalAt) } : {}),
  };
}
