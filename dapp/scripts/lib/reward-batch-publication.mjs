import { createHash } from 'node:crypto';

import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
} from 'viem';

const SYSTEM_CATEGORIES = new Set([
  'treasury',
  'marketing_development',
  'supply_reduction',
]);
const CLAIMABLE_CATEGORIES = new Set([
  'player',
  'credit_pool',
  'cukie_pool_original',
  'cukie_pool_second_plus',
  'ambassador_ordinary',
  'ambassador_weekly',
]);
const ACCOUNTING_CATEGORIES = new Set([
  ...SYSTEM_CATEGORIES,
  ...CLAIMABLE_CATEGORIES,
]);
const RAW = /^(0|[1-9][0-9]*)$/;
const SHA_256 = /^[0-9a-f]{64}$/;

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key.normalize('NFC'), stableValue(child)]),
    );
  }
  return typeof value === 'string' ? value.normalize('NFC') : value;
}

export function stableRewardPublicationHash(value) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)), 'utf8')
    .digest('hex');
}

function canonicalRaw(value, label) {
  if (typeof value !== 'string' || !RAW.test(value)) {
    throw new Error(`${label} no es una cantidad raw canonica.`);
  }
  return BigInt(value);
}

function canonicalDate(value, label) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${label} no es una fecha valida.`);
  }
  return value;
}

function canonicalWallet(value, label) {
  if (typeof value !== 'string' || !isAddress(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`${label} no es una wallet EVM valida.`);
  }
  return getAddress(value);
}

function validateAccountingAllocation(document, accountingId) {
  const immutable = {
    accountingId: document.accountingId,
    accountingKind: document.accountingKind,
    periodId: document.periodId,
    allocationId: document.allocationId,
    walletNormalized: document.walletNormalized,
    category: document.category,
    amountRaw: document.amountRaw,
    fundingMode: document.fundingMode,
    sourceIds: document.sourceIds,
    availableAt: document.availableAt,
    status: document.status,
    createdAt: document.createdAt,
  };
  if (
    document._id !== document.allocationId
    || document.accountingId !== accountingId
    || (document.accountingKind !== 'daily' && document.accountingKind !== 'weekly')
    || document.status !== 'allocated_offchain'
    || !ACCOUNTING_CATEGORIES.has(document.category)
    || !Array.isArray(document.sourceIds)
    || new Set(document.sourceIds).size !== document.sourceIds.length
    || (document.fundingMode !== 'daily_emission' && document.fundingMode !== 'reserved_no_mint')
    || canonicalRaw(document.amountRaw, 'allocation.amountRaw') <= 0n
    || canonicalWallet(document.walletNormalized, 'allocation.walletNormalized').toLowerCase()
      !== document.walletNormalized
    || !canonicalDate(document.availableAt, 'allocation.availableAt')
    || !canonicalDate(document.createdAt, 'allocation.createdAt')
    || document.payloadHash !== stableRewardPublicationHash({
      kind: 'reward-accounting-allocation-document',
      ...immutable,
    })
  ) {
    throw new Error(`La allocation ${String(document._id)} no es canonica.`);
  }
  return document;
}

function rewardLeafHash(chainId, distributorAddress, batchId, walletAddress, amountRaw) {
  const inner = keccak256(encodeAbiParameters(
    [
      { type: 'uint256' },
      { type: 'address' },
      { type: 'bytes32' },
      { type: 'address' },
      { type: 'uint256' },
    ],
    [BigInt(chainId), distributorAddress, batchId, walletAddress, BigInt(amountRaw)],
  ));
  return keccak256(inner);
}

function hashPair(left, right) {
  const [first, second] = left.toLowerCase() <= right.toLowerCase()
    ? [left, right]
    : [right, left];
  return keccak256(concatHex([first, second]));
}

function merkleLayers(leaves) {
  if (leaves.length === 0) throw new Error('El batch reclamable no contiene hojas.');
  const layers = [[...leaves]];
  while (layers.at(-1).length > 1) {
    const current = layers.at(-1);
    const next = [];
    for (let index = 0; index < current.length; index += 2) {
      next.push(index + 1 < current.length
        ? hashPair(current[index], current[index + 1])
        : current[index]);
    }
    layers.push(next);
  }
  return layers;
}

function proofFor(layers, leafIndex) {
  const proof = [];
  let index = leafIndex;
  for (let layer = 0; layer < layers.length - 1; layer += 1) {
    const sibling = index % 2 === 0 ? index + 1 : index - 1;
    if (sibling < layers[layer].length) proof.push(layers[layer][sibling]);
    index = Math.floor(index / 2);
  }
  return proof;
}

function aggregateClaimable(allocations) {
  const amounts = new Map();
  for (const allocation of allocations) {
    if (SYSTEM_CATEGORIES.has(allocation.category)) continue;
    const wallet = getAddress(allocation.walletNormalized);
    const key = wallet.toLowerCase();
    const current = amounts.get(key) ?? { walletAddress: wallet, amount: 0n };
    current.amount += BigInt(allocation.amountRaw);
    amounts.set(key, current);
  }
  return [...amounts.values()]
    .map(({ walletAddress, amount }) => ({ walletAddress, amountRaw: amount.toString(10) }))
    .sort((left, right) => left.walletAddress.toLowerCase().localeCompare(
      right.walletAddress.toLowerCase(),
    ));
}

function sumCategory(allocations, category) {
  return allocations
    .filter((allocation) => allocation.category === category)
    .reduce((sum, allocation) => sum + BigInt(allocation.amountRaw), 0n);
}

function assertSystemDestination(allocations, category, expectedAddress) {
  const expected = canonicalWallet(expectedAddress, `destinations.${category}`).toLowerCase();
  for (const allocation of allocations.filter((item) => item.category === category)) {
    if (allocation.walletNormalized !== expected) {
      throw new Error(`La allocation ${allocation._id} no apunta al destino ${category}.`);
    }
  }
  return expected;
}

function assertUndistributedRule(rule) {
  if (!rule || !SHA_256.test(rule.configHash ?? '')) {
    throw new Error('La regla de rewards no contiene un configHash canonico.');
  }
  const weights = rule.undistributedBps;
  if (
    !weights
    || weights.treasury !== 8_000
    || weights.marketing !== 0
    || weights.development !== 0
    || (weights.marketingDevelopment ?? 0) !== 1_000
    || weights.supplyReduction !== 1_000
  ) {
    throw new Error(
      'La regla de UKI no distribuido debe ser exactamente 80/10/10 con marketing y desarrollo unificados.',
    );
  }
  if (!rule.destinations?.marketingDevelopment) {
    throw new Error('La regla 80/10/10 exige el destino unificado marketingDevelopment.');
  }
  const destinations = {
    treasury: canonicalWallet(rule.destinations.treasury, 'destinations.treasury').toLowerCase(),
    marketingDevelopment: canonicalWallet(
      rule.destinations.marketingDevelopment,
      'destinations.marketingDevelopment',
    ).toLowerCase(),
    supplyReduction: canonicalWallet(
      rule.destinations.supplyReduction,
      'destinations.supplyReduction',
    ).toLowerCase(),
  };
  if (new Set(Object.values(destinations)).size !== 3) {
    throw new Error('Los tres destinos 80/10/10 deben ser distintos.');
  }
  return destinations;
}

function canonicalUndistributedSplit(split, label) {
  if (!split || typeof split !== 'object') {
    throw new Error(`${label} no contiene el reparto 80/10/10 sellado.`);
  }
  const total = canonicalRaw(split.totalRaw, `${label}.totalRaw`);
  const treasury = canonicalRaw(split.treasuryRaw, `${label}.treasuryRaw`);
  const marketingDevelopment = canonicalRaw(
    split.marketingDevelopmentRaw,
    `${label}.marketingDevelopmentRaw`,
  );
  const supplyReduction = canonicalRaw(
    split.supplyReductionRaw,
    `${label}.supplyReductionRaw`,
  );
  const expectedTreasury = total * 8_000n / 10_000n;
  const expectedMarketingDevelopment = total * 1_000n / 10_000n;
  const expectedSupplyReduction = total - expectedTreasury - expectedMarketingDevelopment;
  if (
    treasury !== expectedTreasury
    || marketingDevelopment !== expectedMarketingDevelopment
    || supplyReduction !== expectedSupplyReduction
  ) {
    throw new Error(`${label} no aplica exactamente 80/10/10 hasta el ultimo wei.`);
  }
  return { treasury, marketingDevelopment, supplyReduction };
}

function assertAccountingUndistributed(allocations, accounting, accountingKind) {
  const parts = accountingKind === 'daily'
    ? [
        ['accounting.undistributed', accounting.undistributed, 'daily_emission'],
        [
          'accounting.priorReservedUndistributed',
          accounting.priorReservedUndistributed,
          'reserved_no_mint',
        ],
      ]
    : [
        ['accounting.undistributed', accounting.undistributed, 'reserved_no_mint'],
        [
          'accounting.ambassadorUndistributed',
          accounting.ambassadorUndistributed,
          'reserved_no_mint',
        ],
      ];
  const expectedByFunding = new Map();
  for (const [label, split, fundingMode] of parts) {
    const expected = canonicalUndistributedSplit(split, label);
    const current = expectedByFunding.get(fundingMode) ?? {
      treasury: 0n,
      marketingDevelopment: 0n,
      supplyReduction: 0n,
    };
    current.treasury += expected.treasury;
    current.marketingDevelopment += expected.marketingDevelopment;
    current.supplyReduction += expected.supplyReduction;
    expectedByFunding.set(fundingMode, current);
  }
  for (const [fundingMode, expected] of expectedByFunding) {
    const scoped = allocations.filter((allocation) => allocation.fundingMode === fundingMode);
    const actual = {
      treasury: sumCategory(scoped, 'treasury'),
      marketingDevelopment: sumCategory(scoped, 'marketing_development'),
      supplyReduction: sumCategory(scoped, 'supply_reduction'),
    };
    if (
      actual.treasury !== expected.treasury
      || actual.marketingDevelopment !== expected.marketingDevelopment
      || actual.supplyReduction !== expected.supplyReduction
    ) {
      throw new Error(
        `Las salidas ${fundingMode} no coinciden con el reparto 80/10/10 sellado.`,
      );
    }
  }
}

function assertAccountingPayloadHash(accounting, accountingKind) {
  let payload;
  if (accountingKind === 'daily' && String(accounting.dayId).startsWith('canary:')) {
    payload = {
      kind: 'reward-canary-accounting',
      accountingId: accounting._id,
      allocations: accounting.allocations,
    };
  } else if (accountingKind === 'daily') {
    payload = {
      dayId: accounting.dayId,
      ...(accounting.calendar ? { calendar: accounting.calendar } : {}),
      ruleVersion: accounting.ruleVersion,
      ruleConfigHash: accounting.ruleConfigHash,
      sourceIds: accounting.sourceIds,
      sourceSetHash: accounting.sourceSetHash,
      sourceReservedRaw: accounting.sourceReservedRaw,
      capacityMaterializedRaw: accounting.capacityMaterializedRaw,
      priorReservedInflowRaw: accounting.priorReservedInflowRaw,
      topupRaw: accounting.topupRaw,
      emissionRaw: accounting.emissionRaw,
      buckets: accounting.buckets,
      undistributed: accounting.undistributed,
      priorReservedUndistributed: accounting.priorReservedUndistributed,
      destinations: accounting.destinations,
      allocations: accounting.allocations,
      conservationRaw: accounting.conservationRaw,
    };
  } else {
    payload = {
      periodId: accounting.periodId,
      ...(accounting.calendar ? { calendar: accounting.calendar } : {}),
      ruleVersion: accounting.ruleVersion,
      ruleConfigHash: accounting.ruleConfigHash,
      fundingMode: accounting.fundingMode,
      sourceDailyAccountingIds: accounting.sourceDailyAccountingIds,
      potRaw: accounting.potRaw,
      ambassadorReserveRaw: accounting.ambassadorReserveRaw,
      winners: accounting.winners,
      poolReservations: accounting.poolReservations,
      poolTrancheSchedule: accounting.poolTrancheSchedule,
      ambassadorPayouts: accounting.ambassadorPayouts,
      playerAllocatedRaw: accounting.playerAllocatedRaw,
      poolReservedRaw: accounting.poolReservedRaw,
      allocatedRaw: accounting.allocatedRaw,
      ambassadorAllocatedRaw: accounting.ambassadorAllocatedRaw,
      ambassadorDeferredRaw: accounting.ambassadorDeferredRaw,
      undistributed: accounting.undistributed,
      ambassadorUndistributed: accounting.ambassadorUndistributed,
      destinations: accounting.destinations,
      allocations: accounting.allocations,
      conservationRaw: accounting.conservationRaw,
      lotteryEntropy: accounting.lotteryEntropy,
      lotteryEntropyHash: accounting.lotteryEntropyHash,
      payoutAt: accounting.payoutAt,
    };
  }
  if (accounting.payloadHash !== stableRewardPublicationHash(payload)) {
    throw new Error(`El payloadHash de ${accounting._id} no coincide con su cierre inmutable.`);
  }
}

function materializeMerkleDraft(input) {
  const claims = input.claims;
  const batchId = keccak256(stringToHex(input.periodId));
  const leaves = claims.map((claim) => rewardLeafHash(
    input.chainId,
    input.distributorAddress,
    batchId,
    claim.walletAddress,
    claim.amountRaw,
  ));
  const layers = merkleLayers(leaves);
  const proofs = claims.map((claim, index) => {
    const walletNormalized = claim.walletAddress.toLowerCase();
    const proofId = stableRewardPublicationHash({
      kind: 'reward-claim-proof-id',
      batchId,
      walletNormalized,
    });
    const immutable = {
      proofId,
      batchId,
      periodId: input.periodId,
      walletAddress: claim.walletAddress,
      walletNormalized,
      amountRaw: claim.amountRaw,
      leaf: leaves[index],
      proof: proofFor(layers, index),
    };
    return {
      _id: proofId,
      ...immutable,
      payloadHash: stableRewardPublicationHash({ kind: 'reward-claim-proof', ...immutable }),
      createdAt: input.createdAt,
    };
  });
  const proofSetHash = stableRewardPublicationHash({
    kind: 'reward-claim-proof-set',
    batchId,
    proofs: proofs
      .map(({ proofId, payloadHash }) => ({ proofId, payloadHash }))
      .sort((left, right) => left.proofId.localeCompare(right.proofId)),
  });
  const canonical = {
    batchId,
    periodId: input.periodId,
    chainId: input.chainId,
    distributorAddress: input.distributorAddress,
    metadata: input.metadata,
    allocations: claims,
  };
  const canonicalInputHash = `0x${createHash('sha256')
    .update(JSON.stringify(canonical), 'utf8')
    .digest('hex')}`;
  const draftKey = stableRewardPublicationHash({
    kind: 'reward-claim-draft',
    periodId: input.periodId,
    chainId: input.chainId,
    distributorAddress: input.distributorAddress.toLowerCase(),
    sourceAllocationSetHash: input.sourceAllocationSetHash,
  });
  const totalAllocatedRaw = claims
    .reduce((sum, claim) => sum + BigInt(claim.amountRaw), 0n)
    .toString(10);
  return {
    batch: {
      _id: draftKey,
      draftKey,
      batchId,
      periodId: input.periodId,
      chainId: input.chainId,
      distributorAddress: input.distributorAddress,
      metadata: input.metadata,
      metadataHash: keccak256(stringToHex(input.metadata)),
      merkleRoot: layers.at(-1)[0],
      totalAllocatedRaw,
      allocationCount: claims.length,
      sourceAllocationSetHash: input.sourceAllocationSetHash,
      periodSealId: input.periodSealId,
      ruleVersion: input.ruleVersion,
      ruleConfigHash: input.ruleConfigHash,
      sourceIds: [...input.sourceIds],
      proofSetHash,
      proofCollection: 'reward_claim_proofs',
      canonicalInputHash,
      status: 'draft',
      previewOnly: true,
      publishAuthorized: false,
      signature: null,
      transactionHash: null,
      accountingId: input.accountingId,
      accountingKind: input.accountingKind,
      createdAt: input.createdAt,
    },
    proofs,
  };
}

export function buildRewardPublicationArtifacts(input) {
  if (input.chainId !== 97) throw new Error('El publicador automatico solo admite BSC Testnet 97.');
  const distributorAddress = canonicalWallet(input.distributorAddress, 'distributorAddress');
  const tokenAddress = canonicalWallet(input.tokenAddress, 'tokenAddress');
  const createdAt = canonicalDate(input.createdAt, 'createdAt');
  if (!input.accounting || input.accounting._id !== input.accountingId) {
    throw new Error('El cierre contable no coincide con accountingId.');
  }
  if (input.accounting.status !== 'sealed' || typeof input.accounting.payloadHash !== 'string') {
    throw new Error(`El cierre ${input.accountingId} no esta sellado.`);
  }
  if (!input.rule || input.rule.version !== input.accounting.ruleVersion) {
    throw new Error(`El cierre ${input.accountingId} no liga una regla exacta.`);
  }
  if (stableRewardPublicationHash(input.accounting.calendar ?? null)
    !== stableRewardPublicationHash(input.rule.emissionBudget?.calendar ?? null)) {
    throw new Error('El calendario contable no coincide con la regla sellada.');
  }
  const ruleDestinations = assertUndistributedRule(input.rule);
  if (
    !SHA_256.test(input.accounting.ruleConfigHash ?? '')
    || input.accounting.ruleConfigHash !== input.rule.configHash
  ) {
    throw new Error(`El cierre ${input.accountingId} no liga el configHash exacto de su regla.`);
  }
  const allocations = input.allocations
    .map((allocation) => validateAccountingAllocation(allocation, input.accountingId))
    .sort((left, right) => left._id.localeCompare(right._id));
  if (allocations.length === 0) throw new Error('El cierre no contiene allocations finales.');
  const sealedAllocations = Array.isArray(input.accounting.allocations)
    ? [...input.accounting.allocations].sort((left, right) => (
        left.allocationId.localeCompare(right.allocationId)
      ))
    : null;
  const allocationDocuments = allocations.map((allocation) => ({
    allocationId: allocation.allocationId,
    walletNormalized: allocation.walletNormalized,
    category: allocation.category,
    amountRaw: allocation.amountRaw,
    fundingMode: allocation.fundingMode,
    sourceIds: allocation.sourceIds,
  }));
  if (
    !sealedAllocations
    || stableRewardPublicationHash(sealedAllocations)
      !== stableRewardPublicationHash(allocationDocuments)
  ) {
    throw new Error(`Las allocations de ${input.accountingId} no coinciden con su cierre sellado.`);
  }
  if (allocations.some((allocation) => allocation.availableAt > createdAt)) {
    throw new Error(`El cierre ${input.accountingId} aun no esta disponible para publicar.`);
  }
  const accountingKind = allocations[0].accountingKind;
  if (allocations.some((allocation) => allocation.accountingKind !== accountingKind)) {
    throw new Error('El cierre mezcla clases contables.');
  }
  if (
    accountingKind === 'weekly'
    && allocations.some((allocation) => allocation.fundingMode !== 'reserved_no_mint')
  ) {
    throw new Error('El cierre weekly solo puede publicar UKI previamente reservado.');
  }
  if (
    !input.accounting.destinations
    || canonicalWallet(
      input.accounting.destinations.treasury,
      'accounting.destinations.treasury',
    ).toLowerCase() !== ruleDestinations.treasury
    || canonicalWallet(
      input.accounting.destinations.marketingDevelopment,
      'accounting.destinations.marketingDevelopment',
    ).toLowerCase() !== ruleDestinations.marketingDevelopment
    || canonicalWallet(
      input.accounting.destinations.supplyReduction,
      'accounting.destinations.supplyReduction',
    ).toLowerCase() !== ruleDestinations.supplyReduction
  ) {
    throw new Error('Los destinos sellados no coinciden con la regla 80/10/10.');
  }
  assertAccountingUndistributed(allocations, input.accounting, accountingKind);
  const treasuryAddress = assertSystemDestination(
    allocations,
    'treasury',
    ruleDestinations.treasury,
  );
  const marketingDevelopmentAddress = assertSystemDestination(
    allocations,
    'marketing_development',
    ruleDestinations.marketingDevelopment,
  );
  assertSystemDestination(
    allocations,
    'supply_reduction',
    ruleDestinations.supplyReduction,
  );
  assertAccountingPayloadHash(input.accounting, accountingKind);
  const sourceAllocationSetHash = stableRewardPublicationHash({
    kind: 'reward-accounting-allocation-set',
    accountingId: input.accountingId,
    allocations: allocations.map(({ _id, payloadHash }) => ({ allocationId: _id, payloadHash })),
  });
  const periodId = `reward-accounting:${input.accountingId}`;
  const metadata = JSON.stringify({
    schema: 'cukies.reward-accounting-batch.v1',
    accountingId: input.accountingId,
    accountingKind,
    sourceAllocationSetHash,
  });
  const claims = aggregateClaimable(allocations);
  const claimableTotalRaw = claims.reduce((sum, claim) => sum + BigInt(claim.amountRaw), 0n);
  const treasuryRaw = sumCategory(allocations, 'treasury');
  const marketingDevelopmentRaw = sumCategory(allocations, 'marketing_development');
  const supplyReductionRaw = sumCategory(allocations, 'supply_reduction');
  const totalRaw = allocations.reduce((sum, allocation) => sum + BigInt(allocation.amountRaw), 0n);
  if (
    claimableTotalRaw + treasuryRaw + marketingDevelopmentRaw + supplyReductionRaw !== totalRaw
  ) {
    throw new Error(`El cierre ${input.accountingId} no conserva su total publicable.`);
  }
  const merkle = claims.length === 0 ? null : materializeMerkleDraft({
    periodId,
    chainId: input.chainId,
    distributorAddress,
    metadata,
    sourceAllocationSetHash,
    periodSealId: input.accounting.payloadHash,
    ruleVersion: input.rule.version,
    ruleConfigHash: input.rule.configHash,
    sourceIds: allocations.map((allocation) => allocation._id),
    claims,
    accountingId: input.accountingId,
    accountingKind,
    createdAt,
  });
  const planId = stableRewardPublicationHash({
    kind: 'reward-publication-plan-id',
    accountingId: input.accountingId,
  });
  const operation = (kind, amountRaw, to = null) => ({
    kind,
    amountRaw: amountRaw.toString(10),
    to,
    status: amountRaw === 0n ? 'skipped' : 'pending',
    transactionHash: null,
    signedRawTransaction: null,
    nonce: null,
    confirmedAt: null,
  });
  const operations = [
    operation('fund_distributor', claimableTotalRaw, distributorAddress.toLowerCase()),
    operation('publish_batch', merkle ? claimableTotalRaw : 0n, distributorAddress.toLowerCase()),
    operation('transfer_treasury', treasuryRaw, treasuryAddress),
    operation('transfer_marketing_development', marketingDevelopmentRaw, marketingDevelopmentAddress),
    operation('burn_supply_reduction', supplyReductionRaw),
  ];
  const planBase = {
    planId,
    accountingId: input.accountingId,
    accountingKind,
    periodId,
    chainId: input.chainId,
    tokenAddress: tokenAddress.toLowerCase(),
    distributorAddress: distributorAddress.toLowerCase(),
    sourceAllocationSetHash,
    accountingPayloadHash: input.accounting.payloadHash,
    ruleVersion: input.rule.version,
    ruleConfigHash: input.rule.configHash,
    sourceAllocationIds: allocations.map((allocation) => allocation._id),
    batchId: merkle?.batch.batchId ?? null,
    draftKey: merkle?.batch.draftKey ?? null,
    claimableTotalRaw: claimableTotalRaw.toString(10),
    treasuryRaw: treasuryRaw.toString(10),
    marketingDevelopmentRaw: marketingDevelopmentRaw.toString(10),
    supplyReductionRaw: supplyReductionRaw.toString(10),
    totalRaw: totalRaw.toString(10),
    operations,
    status: 'prepared',
    revision: 0,
    leaseOwner: null,
    leaseExpiresAt: null,
    createdAt,
    updatedAt: createdAt,
  };
  const publicationIntent = {
    planId,
    accountingId: input.accountingId,
    accountingKind,
    periodId,
    chainId: input.chainId,
    tokenAddress: tokenAddress.toLowerCase(),
    distributorAddress: distributorAddress.toLowerCase(),
    sourceAllocationSetHash,
    accountingPayloadHash: input.accounting.payloadHash,
    ruleVersion: input.rule.version,
    ruleConfigHash: input.rule.configHash,
    sourceAllocationIds: allocations.map((allocation) => allocation._id),
    batchId: merkle?.batch.batchId ?? null,
    draftKey: merkle?.batch.draftKey ?? null,
    claimableTotalRaw: claimableTotalRaw.toString(10),
    treasuryRaw: treasuryRaw.toString(10),
    marketingDevelopmentRaw: marketingDevelopmentRaw.toString(10),
    supplyReductionRaw: supplyReductionRaw.toString(10),
    totalRaw: totalRaw.toString(10),
    operationIntents: operations.map(({ kind, amountRaw, to }) => ({ kind, amountRaw, to })),
  };
  return {
    plan: {
      _id: planId,
      ...planBase,
      payloadHash: stableRewardPublicationHash({
        kind: 'reward-publication-plan',
        ...publicationIntent,
      }),
    },
    batch: merkle?.batch ?? null,
    proofs: merkle?.proofs ?? [],
  };
}

export function assertRewardPublicationPlanIntegrity(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.operations)) {
    throw new Error('El plan de publicacion no es valido.');
  }
  const operationIntents = plan.operations.map((operation) => ({
    kind: operation.kind,
    amountRaw: operation.amountRaw,
    to: operation.to ?? null,
  }));
  const expectedId = stableRewardPublicationHash({
    kind: 'reward-publication-plan-id',
    accountingId: plan.accountingId,
  });
  const expectedHash = stableRewardPublicationHash({
    kind: 'reward-publication-plan',
    planId: plan.planId,
    accountingId: plan.accountingId,
    accountingKind: plan.accountingKind,
    periodId: plan.periodId,
    chainId: plan.chainId,
    tokenAddress: plan.tokenAddress,
    distributorAddress: plan.distributorAddress,
    sourceAllocationSetHash: plan.sourceAllocationSetHash,
    accountingPayloadHash: plan.accountingPayloadHash,
    ruleVersion: plan.ruleVersion,
    ruleConfigHash: plan.ruleConfigHash,
    sourceAllocationIds: plan.sourceAllocationIds,
    batchId: plan.batchId,
    draftKey: plan.draftKey,
    claimableTotalRaw: plan.claimableTotalRaw,
    treasuryRaw: plan.treasuryRaw,
    marketingDevelopmentRaw: plan.marketingDevelopmentRaw,
    supplyReductionRaw: plan.supplyReductionRaw,
    totalRaw: plan.totalRaw,
    operationIntents,
  });
  const kinds = operationIntents.map(({ kind }) => kind);
  if (
    plan._id !== expectedId
    || plan.planId !== expectedId
    || plan.payloadHash !== expectedHash
    || plan.chainId !== 97
    || !Array.isArray(plan.sourceAllocationIds)
    || new Set(plan.sourceAllocationIds).size !== plan.sourceAllocationIds.length
    || kinds.join(',') !== [
      'fund_distributor',
      'publish_batch',
      'transfer_treasury',
      'transfer_marketing_development',
      'burn_supply_reduction',
    ].join(',')
    || operationIntents.some(({ amountRaw }) => !RAW.test(amountRaw))
    || BigInt(plan.claimableTotalRaw) + BigInt(plan.treasuryRaw)
      + BigInt(plan.marketingDevelopmentRaw) + BigInt(plan.supplyReductionRaw)
      !== BigInt(plan.totalRaw)
  ) {
    throw new Error(`El plan ${String(plan._id)} fue manipulado.`);
  }
  return plan;
}

export function authorizeRewardClaimBatch(batch, now, claimWindowSeconds) {
  const authorizedAt = canonicalDate(now, 'authorizedAt');
  if (!Number.isSafeInteger(claimWindowSeconds) || claimWindowSeconds < 86_400) {
    throw new Error('claimWindowSeconds debe ser al menos un dia.');
  }
  if (
    !batch
    || batch.status !== 'draft'
    || batch.publishAuthorized !== false
    || batch.previewOnly !== true
  ) throw new Error('El batch no es un draft autorizable.');
  const startsAtRaw = Math.floor(authorizedAt.getTime() / 1_000).toString(10);
  const expiresAtRaw = (
    BigInt(startsAtRaw) + BigInt(claimWindowSeconds)
  ).toString(10);
  return {
    ...batch,
    previewOnly: false,
    publishAuthorized: true,
    publishedProofSetHash: batch.proofSetHash,
    publishedPeriodSealId: batch.periodSealId,
    startsAtRaw,
    expiresAtRaw,
    startsAt: new Date(Number(startsAtRaw) * 1_000),
    expiresAt: new Date(Number(expiresAtRaw) * 1_000),
    closed: false,
    updatedAt: authorizedAt,
  };
}
