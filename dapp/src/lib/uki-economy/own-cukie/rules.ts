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
  const softStake = asset.activeLocks.filter((lock) => (
    lock.reason === "soft_stake"
    && lock.state === "soft_staked"
    && lock.ownerNormalized === walletNormalized
    && Boolean(lock.lockId)
  ));
  const available = asset.canonicalState === "available" && asset.activeLocks.length === 0;
  const softStaked = asset.canonicalState === "soft_staked"
    && asset.activeLocks.length === 1
    && softStake.length === 1;
  if (
    asset.network !== "bsc"
    || asset.ownerNormalized !== walletNormalized
    || !asset.tokenId
    || !asset.ownershipEventId
    || asset.generation === "unknown"
    || asset.rarity === "unknown"
    || (!available && !softStaked)
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
    softStakeLockId: softStaked ? softStake[0].lockId! : null,
  };
}

export function assertOwnCukieEpochIntegrity(epoch: OwnCukieEpoch) {
  const expectedId = ownCukieEpochId(epoch);
  const quota = ownCukieQuota(epoch.generation, epoch.rarity);
  const assigned = epoch.status === "assigned";
  if (
    epoch._id !== expectedId
    || epoch.epochId !== expectedId
    || epoch.gamesQuota !== quota
    || !Number.isSafeInteger(epoch.gamesRemaining)
    || epoch.gamesRemaining < 0
    || epoch.gamesRemaining > quota
    || !Number.isSafeInteger(epoch.revision)
    || epoch.revision < 0
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
  if (
    assignment._id !== expectedId
    || assignment.assignmentId !== expectedId
    || assignment.epochId !== ownCukieEpochId(assignment)
    || !["active", "completed", "released", "invalidated"].includes(assignment.status)
    || !Number.isSafeInteger(assignment.lockFencingToken)
    || assignment.lockFencingToken < 1
    || !Number.isSafeInteger(assignment.revision)
    || assignment.revision < 0
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
    ...(assignment.terminalAt ? { terminalAt: new Date(assignment.terminalAt) } : {}),
  };
}
