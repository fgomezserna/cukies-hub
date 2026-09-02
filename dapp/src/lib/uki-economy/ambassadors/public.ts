import type { Db } from "mongodb";

import { getEconomyDb } from "@/lib/indexer-db/mongodb";
import type {
  RewardClaim,
  RewardClaimBatch,
  RewardClaimProof,
} from "@/lib/uki-economy/rewards/types";

import { DomainConflictError } from "../errors";
import type { RewardAccountingAllocationDocument } from "../rewards/accounting-types";
import {
  findMongoAmbassadorByInvitationCode,
  getOrCreateMongoAmbassadorProfile,
  materializeLockedPresaleAmbassadorAttributions,
  resolveMongoAmbassadorAttribution,
} from "./repository";
import { assertAmbassadorInvitationCode, validAmbassadorWallet } from "./rules";
import type { AmbassadorAttribution } from "./types";

const COMMISSION_CATEGORIES = ["ambassador_ordinary", "ambassador_weekly"] as const;

type PublicationPlan = {
  accountingId: string;
  batchId: `0x${string}` | null;
  status: string;
};

export type AmbassadorCommissionStatus =
  | "registered"
  | "preparing"
  | "scheduled"
  | "claimable"
  | "claimed"
  | "expired";

function validRaw(value: string) {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new DomainConflictError("Una comision de embajador contiene un importe no canonico.");
  }
  return BigInt(value);
}

function commissionStatus(input: {
  plan?: PublicationPlan;
  batch?: RewardClaimBatch;
  proof?: RewardClaimProof;
  claim?: RewardClaim;
  now: Date;
}): AmbassadorCommissionStatus {
  if (input.claim) return "claimed";
  if (!input.plan) return "registered";
  if (!input.batch || !input.proof || input.batch.status !== "published") return "preparing";
  if (!(input.batch.startsAt instanceof Date) || !(input.batch.expiresAt instanceof Date)) {
    throw new DomainConflictError("Un batch de comisiones publicado no conserva sus fechas.");
  }
  if (input.now.getTime() < input.batch.startsAt.getTime()) return "scheduled";
  if (input.now.getTime() >= input.batch.expiresAt.getTime()) return "expired";
  return "claimable";
}

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

async function commissionDashboard(db: Db, walletNormalized: string, now: Date) {
  const allocations = await db
    .collection<RewardAccountingAllocationDocument>("reward_accounting_allocations")
    .find({
      walletNormalized,
      category: { $in: [...COMMISSION_CATEGORIES] },
    })
    .sort({ availableAt: -1, _id: -1 })
    .limit(100)
    .toArray();
  const accountingIds = [...new Set(allocations.map((row) => row.accountingId))];
  const plans = accountingIds.length === 0
    ? []
    : await db.collection<PublicationPlan>("reward_publication_plans")
      .find({ accountingId: { $in: accountingIds } })
      .toArray();
  const batchIds = plans
    .map((plan) => plan.batchId)
    .filter((batchId): batchId is `0x${string}` => typeof batchId === "string");
  const [batches, proofs, claims] = batchIds.length === 0
    ? [[], [], []]
    : await Promise.all([
      db.collection<RewardClaimBatch>("reward_claim_batches")
        .find({ batchId: { $in: batchIds } })
        .toArray(),
      db.collection<RewardClaimProof>("reward_claim_proofs")
        .find({ batchId: { $in: batchIds }, walletNormalized })
        .toArray(),
      db.collection<RewardClaim>("reward_claims")
        .find({ batchId: { $in: batchIds }, walletNormalized })
        .toArray(),
    ]);
  const planByAccounting = new Map(plans.map((row) => [row.accountingId, row]));
  const batchById = new Map(batches.map((row) => [row.batchId.toLowerCase(), row]));
  const proofByBatch = new Map(proofs.map((row) => [row.batchId.toLowerCase(), row]));
  const claimByBatch = new Map(claims.map((row) => [row.batchId.toLowerCase(), row]));
  const totals = {
    totalRaw: BigInt(0),
    pendingRaw: BigInt(0),
    claimableRaw: BigInt(0),
    claimedRaw: BigInt(0),
    expiredRaw: BigInt(0),
  };
  const history = allocations.map((allocation) => {
    const plan = planByAccounting.get(allocation.accountingId);
    const batchKey = plan?.batchId?.toLowerCase();
    const status = commissionStatus({
      plan,
      batch: batchKey ? batchById.get(batchKey) : undefined,
      proof: batchKey ? proofByBatch.get(batchKey) : undefined,
      claim: batchKey ? claimByBatch.get(batchKey) : undefined,
      now,
    });
    const amount = validRaw(allocation.amountRaw);
    totals.totalRaw += amount;
    if (status === "claimed") totals.claimedRaw += amount;
    else if (status === "claimable") totals.claimableRaw += amount;
    else if (status === "expired") totals.expiredRaw += amount;
    else totals.pendingRaw += amount;
    return {
      allocationId: allocation.allocationId,
      kind: allocation.category === "ambassador_weekly" ? "weekly" as const : "ordinary" as const,
      periodId: allocation.periodId,
      amountRaw: allocation.amountRaw,
      status,
      availableAt: allocation.availableAt.toISOString(),
      sourceCount: allocation.sourceIds.length,
    };
  });
  return {
    totals: Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [key, value.toString()]),
    ) as Record<keyof typeof totals, string>,
    history,
  };
}

export async function getPublicAmbassadorInvitation(code: string) {
  const invitationCode = assertAmbassadorInvitationCode(code);
  const profile = await findMongoAmbassadorByInvitationCode(await getEconomyDb(), invitationCode);
  return profile ? {
    invitationCode: profile.invitationCode,
    ambassadorWalletMasked: shortWallet(profile.walletNormalized),
  } : null;
}

export async function getAmbassadorDashboard(wallet: string, now = new Date()) {
  const walletNormalized = validAmbassadorWallet(wallet);
  const db = await getEconomyDb();
  // Los sponsors confirmados en preventa son una fuente canónica, no una alta nueva:
  // se materializan antes de devolver el panel para que el usuario no repita el trámite.
  await materializeLockedPresaleAmbassadorAttributions(db, {
    ambassadorWallet: walletNormalized,
    now,
  });
  const [profile, ownAttribution, referrals, commissions] = await Promise.all([
    getOrCreateMongoAmbassadorProfile(db, walletNormalized, now),
    resolveMongoAmbassadorAttribution(db, walletNormalized, now),
    db.collection<AmbassadorAttribution>("ambassador_attributions")
      .find({ ambassadorWalletNormalized: walletNormalized })
      .sort({ acceptedAt: -1, _id: 1 })
      .limit(100)
      .toArray(),
    commissionDashboard(db, walletNormalized, now),
  ]);
  return {
    walletNormalized,
    profile: {
      invitationCode: profile.invitationCode,
    },
    ownAttribution: ownAttribution ? {
      attributionId: ownAttribution.attributionId,
      ambassadorWalletMasked: shortWallet(ownAttribution.ambassadorWalletNormalized),
      source: ownAttribution.source,
      acceptedAt: ownAttribution.acceptedAt.toISOString(),
      commissionBps: ownAttribution.commissionBpsSnapshot,
      levels: ownAttribution.levelsSnapshot,
    } : null,
    referrals: referrals.map((row) => ({
      attributionId: row.attributionId,
      referredWalletMasked: shortWallet(row.referredWalletNormalized),
      source: row.source,
      acceptedAt: row.acceptedAt.toISOString(),
    })),
    commissions,
  };
}
