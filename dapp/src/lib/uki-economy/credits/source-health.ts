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

export type CreditSourceHealthEvidenceInput = {
  successAt: Date | null;
  errorAt: Date | null;
  checkpoint: Record<string, unknown> | null;
  cursors: Array<Record<string, unknown>>;
  deadLetters: number;
  pendingEvents: number;
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
