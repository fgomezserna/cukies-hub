import {
  assertRewardPublicationPlanForwardEligible,
  isRewardPublicationForwardFenceError,
  rewardPublicationAccountingCollection,
} from './reward-publication-forward-fence.mjs';

/**
 * Selects and leases the oldest runnable publication plan. With a staging
 * forward fence, every candidate is checked against its sealed accounting
 * period before leasing; no pre-limit is allowed to starve later valid plans.
 */
export async function acquireRewardPublicationPlan(db, runtime, now) {
  const activationAt = runtime.forwardActivationAt
    ? new Date(runtime.forwardActivationAt)
    : undefined;
  const filter = {
    status: { $nin: ['completed', 'blocked'] },
    ...(activationAt ? { createdAt: { $gte: activationAt } } : {}),
    $or: [
      { leaseExpiresAt: null },
      { leaseExpiresAt: { $exists: false } },
      { leaseExpiresAt: { $lte: now } },
      { leaseOwner: runtime.schedulerId },
    ],
  };
  const candidates = db.collection('reward_publication_plans')
    .find(filter)
    .sort({ createdAt: 1, _id: 1 });
  for await (const candidate of candidates) {
    if (activationAt) {
      const accountingKind = candidate.accountingKind;
      const accountingCollection = rewardPublicationAccountingCollection(accountingKind);
      const accounting = await db.collection(accountingCollection).findOne({
        _id: candidate.accountingId,
      });
      if (!accounting) throw new Error(`No existe el cierre ${candidate.accountingId}.`);
      const allocations = await db.collection('reward_accounting_allocations').find({
        accountingId: candidate.accountingId,
      }).toArray();
      const rule = await db.collection('economy_rule_versions').findOne({
        scope: 'reward_allocations',
        version: accounting.ruleVersion,
      });
      try {
        assertRewardPublicationPlanForwardEligible({
          plan: candidate,
          accounting,
          accountingKind,
          allocations,
          rule,
          forwardActivationAt: activationAt,
        });
      } catch (error) {
        if (isRewardPublicationForwardFenceError(error)) continue;
        throw error;
      }
    }
    const result = await db.collection('reward_publication_plans').findOneAndUpdate(
      { ...filter, _id: candidate._id },
      {
        $set: {
          leaseOwner: runtime.schedulerId,
          leaseExpiresAt: new Date(now.getTime() + runtime.leaseMs),
          updatedAt: now,
        },
        $inc: { revision: 1 },
      },
      { returnDocument: 'after' },
    );
    if (result) return result;
  }
  return null;
}
