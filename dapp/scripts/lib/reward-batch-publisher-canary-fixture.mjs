import { getAddress, parseEther } from 'viem';

import { stableRewardPublicationHash } from './reward-batch-publication.mjs';

export function buildRewardPublisherCanaryFixture({
  now,
  distributorAddress: distributorInput,
  accountAddress: accountInput,
}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('now debe ser una fecha valida.');
  }
  const distributorAddress = getAddress(distributorInput);
  const accountAddress = getAddress(accountInput);
  const accountingId = `reward-daily:canary:${distributorAddress.toLowerCase()}`;
  const allocationId = `reward-canary-allocation:${distributorAddress.toLowerCase()}`;
  const amountRaw = parseEther('10').toString(10);
  const ruleVersion = `rewards-canary:${distributorAddress.toLowerCase()}`;
  const destinations = {
    treasury: '0x3333333333333333333333333333333333333333',
    marketingDevelopment: '0x4444444444444444444444444444444444444444',
    supplyReduction: '0x5555555555555555555555555555555555555555',
  };
  const sealedAllocations = [{
    allocationId,
    walletNormalized: accountAddress.toLowerCase(),
    category: 'player',
    amountRaw,
    fundingMode: 'daily_emission',
    sourceIds: ['reward-canary-source'],
  }];
  const rule = {
    _id: `reward_allocations:${ruleVersion}`,
    scope: 'reward_allocations',
    version: ruleVersion,
    active: false,
    activeFrom: new Date(now.getTime() - 60_000),
    configHash: stableRewardPublicationHash({ ruleVersion, destinations }),
    destinations,
    createdAt: now,
    updatedAt: now,
  };
  const accounting = {
    _id: accountingId,
    dayId: `canary:${distributorAddress.toLowerCase()}`,
    ruleVersion,
    allocations: sealedAllocations,
    payloadHash: stableRewardPublicationHash({
      kind: 'reward-canary-accounting',
      accountingId,
      allocations: sealedAllocations,
    }),
    status: 'sealed',
    sealedAt: now,
  };
  const immutable = {
    accountingId,
    accountingKind: 'daily',
    periodId: 'canary',
    allocationId,
    walletNormalized: accountAddress.toLowerCase(),
    category: 'player',
    amountRaw,
    fundingMode: 'daily_emission',
    sourceIds: ['reward-canary-source'],
    availableAt: new Date(now.getTime() - 1_000),
    status: 'allocated_offchain',
    createdAt: now,
  };
  const allocation = {
    _id: allocationId,
    ...immutable,
    payloadHash: stableRewardPublicationHash({
      kind: 'reward-accounting-allocation-document',
      ...immutable,
    }),
  };
  return { accountingId, amountRaw, rule, accounting, allocation };
}
