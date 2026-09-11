import {
  assertRewardPublicationPlanIntegrity,
  buildRewardPublicationArtifacts,
} from './reward-batch-publication.mjs';
import {
  assertRewardPublicationPeriodForwardEligible,
  assertRewardPublicationPlanForwardEligible,
  isRewardPublicationForwardFenceError,
  rewardPublicationAccountingCollection,
} from './reward-publication-forward-fence.mjs';

function duplicateKey(error) {
  return Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 11000,
  );
}

function validNow(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('now debe ser una fecha valida.');
  }
  return value;
}

function validForwardActivationAt(value) {
  if (value === undefined) return undefined;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('forwardActivationAt debe ser una fecha valida.');
  }
  return value;
}

function validMaxCandidates(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw new Error('maxCandidates debe estar entre 1 y 1000.');
  }
  return value;
}

async function existingPlan(db, accountingId, session) {
  const plan = await db.collection('reward_publication_plans').findOne(
    { accountingId },
    session ? { session } : undefined,
  );
  return plan ? assertRewardPublicationPlanIntegrity(plan) : null;
}

export function buildRewardPublicationCandidatePipeline(
  now,
  maxCandidates,
  forwardActivationAt,
) {
  const activationAt = validForwardActivationAt(forwardActivationAt);
  const pipeline = [
    { $match: {
      status: 'allocated_offchain',
      availableAt: { $lte: now },
      ...(activationAt ? { createdAt: { $gte: activationAt } } : {}),
    } },
    { $sort: { availableAt: 1, accountingId: 1, _id: 1 } },
    {
      $group: {
        _id: '$accountingId',
        accountingKind: { $first: '$accountingKind' },
        availableAt: { $first: '$availableAt' },
      },
    },
    { $sort: { availableAt: 1, _id: 1 } },
  ];
  // With a forward fence, period eligibility is derived from each sealed
  // accounting document after this aggregation. Do not cap the candidate
  // groups before that check: a backlog of late-created historical rows must
  // not starve a valid period that appears later in the stable sort order.
  if (!activationAt) pipeline.push({ $limit: maxCandidates });
  return pipeline;
}

export async function prepareNextRewardPublicationPlan(input) {
  const now = validNow(input.now ?? new Date());
  const maxCandidates = validMaxCandidates(input.maxCandidates ?? 50);
  const forwardActivationAt = validForwardActivationAt(input.forwardActivationAt);
  const candidates = await input.db.collection('reward_accounting_allocations').aggregate(
    buildRewardPublicationCandidatePipeline(now, maxCandidates, forwardActivationAt),
  ).toArray();

  for (const candidate of candidates) {
    if (!forwardActivationAt && await existingPlan(input.db, candidate._id)) continue;
    if (candidate.accountingKind !== 'daily' && candidate.accountingKind !== 'weekly') {
      throw new Error(`El cierre ${candidate._id} tiene accountingKind invalido.`);
    }
    const session = input.mongoClient.startSession();
    try {
      let prepared = null;
      let replayed = false;
      let skipCandidate = false;
      await session.withTransaction(async () => {
        const allocations = await input.db.collection('reward_accounting_allocations')
          .find({ accountingId: candidate._id }, { session })
          .sort({ _id: 1 })
          .toArray();
        const accountingCollection = rewardPublicationAccountingCollection(candidate.accountingKind);
        const accounting = await input.db.collection(accountingCollection).findOne(
          { _id: candidate._id },
          { session },
        );
        if (!accounting) throw new Error(`No existe el cierre ${candidate._id}.`);
        const rule = await input.db.collection('economy_rule_versions').findOne({
          scope: 'reward_allocations',
          version: accounting.ruleVersion,
        }, { session });
        assertRewardPublicationPeriodForwardEligible({
          accounting,
          accountingKind: candidate.accountingKind,
          allocations,
          rule,
          forwardActivationAt,
        });
        const current = await existingPlan(input.db, candidate._id, session);
        if (current) {
          if (current.status === 'completed' || current.status === 'blocked') {
            skipCandidate = true;
            return;
          }
          assertRewardPublicationPlanForwardEligible({
            plan: current,
            accounting,
            accountingKind: candidate.accountingKind,
            rule,
            forwardActivationAt,
          });
          prepared = current;
          replayed = true;
          return;
        }
        const artifacts = buildRewardPublicationArtifacts({
          accountingId: candidate._id,
          accounting,
          rule,
          allocations,
          chainId: input.chainId,
          tokenAddress: input.tokenAddress,
          distributorAddress: input.distributorAddress,
          createdAt: now,
        });
        assertRewardPublicationPlanIntegrity(artifacts.plan);
        if (artifacts.proofs.length > 0) {
          await input.db.collection('reward_claim_proofs').insertMany(
            artifacts.proofs,
            { session },
          );
          await input.db.collection('reward_claim_batches').insertOne(
            artifacts.batch,
            { session },
          );
        }
        await input.db.collection('reward_publication_plans').insertOne(
          artifacts.plan,
          { session },
        );
        prepared = artifacts.plan;
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
      if (skipCandidate) continue;
      if (!prepared) throw new Error(`No se preparo el cierre ${candidate._id}.`);
      return { plan: prepared, replayed };
    } catch (error) {
      if (isRewardPublicationForwardFenceError(error)) continue;
      if (duplicateKey(error)) {
        const replay = await existingPlan(input.db, candidate._id);
        if (replay) return { plan: replay, replayed: true };
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
  return null;
}
