import "server-only";

import { compareCreditText, stableCreditHash } from "./rules";
import type { CreditVerifiedContractIdentity } from "./types";

export function creditSourceCursorIsHealthy(input: {
  cursor: Record<string, unknown>;
  expectedAlias: string;
  expectedEventName: string;
  expectedAddress: string;
  expectedSafeBlock: number;
  freshnessCutoff: Date;
  expectedChainId?: 56 | 97;
  expectedIdentity?: CreditVerifiedContractIdentity;
}) {
  const cursor = input.cursor;
  const base =
    cursor.contractAlias === input.expectedAlias &&
    cursor.eventName === input.expectedEventName &&
    cursor.updatedAt instanceof Date &&
    cursor.updatedAt >= input.freshnessCutoff &&
    Number.isSafeInteger(cursor.safeBlock) &&
    Number(cursor.safeBlock) >= input.expectedSafeBlock &&
    Number.isSafeInteger(cursor.nextBlock) &&
    Number(cursor.nextBlock) > input.expectedSafeBlock &&
    typeof cursor.contractAddress === "string" &&
    cursor.contractAddress.toLowerCase() === input.expectedAddress;
  if (!base) return false;
  if (!input.expectedIdentity) return true;
  return (
    cursor.bootstrapStatus === "verified" &&
    Number.isSafeInteger(cursor.bootstrapStartBlock) &&
    cursor.bootstrapVerifiedAt instanceof Date &&
    cursor.verifiedChainId === input.expectedChainId &&
    cursor.contractCodeHash === input.expectedIdentity.runtimeCodeHash &&
    cursor.contractDeploymentBlock === input.expectedIdentity.deploymentBlock &&
    cursor.contractConfigHash === input.expectedIdentity.configHash
  );
}

export type CreditNftSourceMode = 'legacy' | 'custodial' | 'invalid';

export type CreditSourceHealthClassification = {
  healthy: boolean;
  blockingWarnings: string[];
  ancillaryWarnings: string[];
};

/**
 * Classifies source warnings without discarding any evidence. In custodial
 * mode the TOKEN_V2 ownership projection is ancillary to the vault-backed
 * credit slots; its dead-letter/pending alarms remain visible but do not block
 * a new cut unless the vault itself also has a pending or dead-letter event.
 * Legacy and invalid modes keep every NFT warning blocking.
 */
export function classifyCreditSourceHealth(input: {
  route: 'uki' | 'nft';
  nftMode?: CreditNftSourceMode;
  warnings: readonly string[];
  deadLetters: number;
  pendingEvents: number;
  blockingDeadLetters: number;
  blockingPendingEvents: number;
}): CreditSourceHealthClassification {
  const ancillaryWarnings = input.route === 'nft'
    && input.nftMode === 'custodial'
    ? [
        ...(input.blockingDeadLetters === 0 && input.deadLetters > 0
          ? ['CHAIN_DEAD_LETTERS_OPEN']
          : []),
        ...(input.blockingPendingEvents === 0 && input.pendingEvents > 0
          ? ['CHAIN_EVENTS_NOT_PROJECTED']
          : []),
      ]
    : [];
  const ancillary = new Set(ancillaryWarnings);
  const blockingWarnings = input.warnings.filter((warning) => !ancillary.has(warning));
  return {
    healthy: blockingWarnings.length === 0,
    blockingWarnings,
    ancillaryWarnings,
  };
}

export type CreditSourceHealthEvidenceInput = {
  successAt: Date | null;
  errorAt: Date | null;
  checkpoint: Record<string, unknown> | null;
  cursors: Array<Record<string, unknown>>;
  deadLetters: number;
  pendingEvents: number;
  /** Counts for the aliases that can mutate the credit source itself. */
  blockingDeadLetters?: number;
  blockingPendingEvents?: number;
  nftMode?: CreditNftSourceMode;
  incidents: number;
  sourceRuleVersions: Record<"uki" | "nft", string> | null;
  rounds: Array<Record<string, unknown>>;
  stakingState: Record<string, unknown> | null;
  stakingPositionsCount: number;
  vestingPositionsCount: number;
  vestingLedgerCount: number;
  cukieProjectionHash: string;
  warnings: string[];
};

export function buildCreditSourceHealthEvidenceHash(
  input: CreditSourceHealthEvidenceInput
) {
  const cursors = [...input.cursors].sort((left, right) =>
    compareCreditText(
      `${String(left.contractAlias)}:${String(left.eventName)}:${String(
        left._id
      )}`,
      `${String(right.contractAlias)}:${String(right.eventName)}:${String(
        right._id
      )}`
    )
  );
  const rounds = [...input.rounds].sort((left, right) =>
    compareCreditText(
      `${String(left.route)}:${String(left._id)}`,
      `${String(right.route)}:${String(right._id)}`
    )
  );
  return stableCreditHash({
    ...input,
    cursors,
    rounds,
    warnings: [...input.warnings].sort(compareCreditText),
  });
}
