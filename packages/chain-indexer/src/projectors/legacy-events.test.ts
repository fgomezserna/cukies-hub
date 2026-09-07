import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { bscEventAbis, eventSignatures, tronEventSignatures } from '../config/abis.js';
import { getContractEventConfigs } from '../config/contracts.js';
import { normalizeDomainEvent } from '../normalize.js';
import type { ChainEvent, EventName } from '../types.js';
import {
  projectBreedingLedger,
  projectBridgeLifecycle,
  projectLegacyAuditEvent,
  projectReferralEvent,
} from './legacy-events.js';
import { projectEvent } from './index.js';

type Document = Record<string, any>;

class MemoryCollection {
  readonly documents = new Map<string, Document>();

  private matches(document: Document, filter: Document): boolean {
    return Object.entries(filter).every(([key, value]) => {
      if (key === '$or') return (value as Document[]).some((item) => this.matches(document, item));
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const condition = value as Document;
        if ('$exists' in condition) return (key in document) === condition.$exists;
        if ('$lt' in condition) return document[key] < condition.$lt;
      }
      return document[key] === value;
    });
  }

  async findOne(filter: Document) {
    return [...this.documents.values()].find((document) => this.matches(document, filter)) ?? null;
  }

  find(filter: Document) {
    const values = [...this.documents.values()].filter((document) => this.matches(document, filter));
    return { toArray: async () => values.map((value) => ({ ...value })) };
  }

  async updateOne(filter: Document, update: Document, options: Document = {}) {
    const id = String(filter._id ?? update.$setOnInsert?._id);
    const current = this.documents.get(id);
    if (current && this.matches(current, filter)) {
      Object.assign(current, update.$set ?? {});
      for (const [key, value] of Object.entries(update.$addToSet ?? {})) {
        const values = Array.isArray(current[key]) ? current[key] : [];
        if (!values.includes(value)) values.push(value);
        current[key] = values;
      }
      return { matchedCount: 1, upsertedCount: 0 };
    }
    if (!options.upsert) return { matchedCount: 0, upsertedCount: 0 };
    this.documents.set(id, {
      ...(update.$setOnInsert ?? {}),
      ...(update.$set ?? {}),
    });
    return { matchedCount: 0, upsertedCount: 1 };
  }

  async insertOne(document: Document) {
    const id = String(document._id);
    if (this.documents.has(id)) {
      const error = Object.assign(new Error('duplicate'), { code: 11000 });
      throw error;
    }
    this.documents.set(id, { ...document });
    return { acknowledged: true, insertedId: id };
  }

  async deleteOne(filter: Document) {
    const match = [...this.documents.values()].find((document) => this.matches(document, filter));
    if (!match) return { deletedCount: 0 };
    this.documents.delete(String(match._id));
    return { deletedCount: 1 };
  }

  async deleteMany(filter: Document) {
    const matches = [...this.documents.values()].filter((document) => this.matches(document, filter));
    for (const match of matches) this.documents.delete(String(match._id));
    return { deletedCount: matches.length };
  }
}

function fakeStore() {
  const collections = new Map<string, MemoryCollection>();
  return {
    collections,
    store: {
      db: {
        collection(name: string) {
          const current = collections.get(name);
          if (current) return current;
          const created = new MemoryCollection();
          collections.set(name, created);
          return created;
        },
      },
      cursors() {
        const current = collections.get('chain_cursors');
        if (current) return current;
        const created = new MemoryCollection();
        collections.set('chain_cursors', created);
        return created;
      },
    },
  };
}

function event(
  eventName: EventName,
  args: Record<string, unknown>,
  blockNumber: number,
  chain: 'BSC' | 'TRON' = 'BSC',
): ChainEvent {
  const contractAlias = eventName === 'MintReferral' ? 'MINT'
    : eventName === 'BridgeRequested' || eventName === 'BridgeCompleted' ? 'BRIDGE_ENDPOINT'
      : eventName === 'Approval' || eventName === 'ApprovalForAll' ? 'TOKEN'
        : 'BREEDING_POINTS';
  const contractAddress = chain === 'BSC' ? `0x${'a'.repeat(40)}` : 'TContract';
  const txHash = `${chain.toLowerCase()}-${blockNumber}`;
  return {
    _id: `${chain}:${contractAlias}:${eventName}:${txHash}:0`,
    chain,
    chainId: chain === 'BSC' ? 97 : undefined,
    contractAlias,
    contractAddress,
    eventName,
    txHash,
    logIndex: 0,
    blockNumber,
    timestampMs: blockNumber * 1_000,
    args: args as any,
    normalized: normalizeDomainEvent(chain, eventName, contractAlias, args),
    raw: { args } as any,
    status: 'projecting',
    attempts: 1,
    schemaVersion: 1,
    createdAt: new Date(blockNumber * 1_000),
    updatedAt: new Date(blockNumber * 1_000),
  };
}

test('declares complete event coverage, exact BSC indexed signatures and TRON aliases', () => {
  for (const name of [
    'Approval', 'ApprovalForAll', 'MinterAdded', 'MinterRemoved',
    'OwnershipRenounced', 'OwnershipTransferred', 'Paused', 'Unpaused',
    'BridgeRequested', 'BridgeCompleted', 'RelayerUpdated', 'BridgePriceUpdated',
    'FeeRecipientUpdated', 'UntrackedERC721Recovered', 'CollectionAllowedUpdated',
    'PaymentTokenAllowedUpdated', 'NativePaymentAllowedUpdated', 'FeeConfigUpdated',
    'NativeFeesClaimed',
  ] as EventName[]) {
    assert.ok(eventSignatures[name], `missing signature ${name}`);
    assert.ok(bscEventAbis[name], `missing ABI ${name}`);
  }
  assert.match(eventSignatures.Approval, /indexed owner/);
  assert.match(eventSignatures.BridgeRequested, /indexed transferId/);

  const bsc = getContractEventConfigs(['BSC'], {
    marketplaceAddress: `0x${'1'.repeat(40)}`,
    ukiMarketplaceAddress: `0x${'2'.repeat(40)}`,
    bridgeAddress: `0x${'3'.repeat(40)}`,
    bridgeEndpointAddress: `0x${'5'.repeat(40)}`,
    tokenAddress: `0x${'4'.repeat(40)}`,
    contractAliases: ['TOKEN', 'MARKETPLACE', 'UKI_MARKETPLACE', 'BRIDGE', 'BRIDGE_ENDPOINT'],
  });
  assert.ok(bsc.some((item) => item.contractAlias === 'BRIDGE_ENDPOINT' && item.eventName === 'BridgeCompleted'));
  assert.equal(
    bsc.some((item) => item.contractAlias === 'BRIDGE' && item.eventName === 'BridgeCompleted'),
    false,
  );
  const legacyBsc = getContractEventConfigs(['BSC'], {
    tokenAddress: `0x${'4'.repeat(40)}`,
    bridgeEndpointAddress: `0x${'5'.repeat(40)}`,
    ukiMarketplaceAddress: `0x${'6'.repeat(40)}`,
    marketplaceAddress: `0x${'1'.repeat(40)}`,
    bridgeAddress: `0x${'3'.repeat(40)}`,
    contractAliases: ['TOKEN', 'POINTS', 'STAKING_POINTS', 'BREEDING_POINTS', 'MARKETPLACE', 'BRIDGE'],
  });
  const bscByAlias = new Map<string, string[]>();
  for (const item of legacyBsc) {
    const events = bscByAlias.get(item.contractAlias) ?? [];
    events.push(item.eventName);
    bscByAlias.set(item.contractAlias, events);
  }
  assert.deepEqual(bscByAlias.get('TOKEN'), [
    'Transfer', 'Approval', 'ApprovalForAll', 'MinterAdded', 'MinterRemoved',
    'OwnershipRenounced', 'OwnershipTransferred',
  ]);
  assert.deepEqual(bscByAlias.get('BRIDGE'), [
    'JumpInBridge', 'JumpOutBridge', 'OwnershipRenounced', 'OwnershipTransferred',
    'Paused', 'Unpaused',
  ]);
  assert.deepEqual(bscByAlias.get('POINTS'), [
    'Mint', 'Burn', 'MinterAdded', 'MinterRemoved', 'OwnershipRenounced', 'OwnershipTransferred',
  ]);
  assert.deepEqual(bscByAlias.get('STAKING_POINTS'), [
    'Stake', 'Unstake', 'OwnershipRenounced', 'OwnershipTransferred',
  ]);
  assert.deepEqual(bscByAlias.get('BREEDING_POINTS'), [
    'BreedStart', 'BreedFinish', 'OwnershipRenounced', 'OwnershipTransferred',
  ]);
  assert.deepEqual(bscByAlias.get('MARKETPLACE'), [
    'TokenOnSale', 'TokenBought', 'MarketTokenSaleCancelled', 'MarketTokenPriceChanged',
    'OwnershipRenounced', 'OwnershipTransferred', 'Paused', 'Unpaused',
  ]);
  const legacyTron = getContractEventConfigs(['TRON'], {
    contractAliases: [
      'MINT', 'TOKEN', 'REFERRALS', 'POINTS', 'STAKING_POINTS',
      'BREEDING_POINTS', 'MARKETPLACE', 'BRIDGE',
    ],
  });
  const tronByAlias = new Map<string, string[]>();
  for (const item of legacyTron) {
    const events = tronByAlias.get(item.contractAlias) ?? [];
    events.push(item.eventName);
    tronByAlias.set(item.contractAlias, events);
  }
  assert.deepEqual(tronByAlias.get('MINT'), ['MintReferral', 'OwnershipRenounced', 'OwnershipTransferred']);
  assert.deepEqual(tronByAlias.get('REFERRALS'), ['OwnershipRenounced', 'OwnershipTransferred']);
  assert.deepEqual(tronByAlias.get('BRIDGE'), [
    'JumpInBridge', 'JumpOutBridge', 'OwnershipRenounced', 'OwnershipTransferred', 'Paused', 'Unpaused',
  ]);
  assert.ok(bsc.some((item) => item.eventName === 'OwnershipTransferStarted'));
  const tron = getContractEventConfigs(['TRON'], { contractAliases: ['MINT', 'REFERRALS'] });
  assert.deepEqual(
    tron.map((item) => `${item.contractAlias}:${item.eventName}`),
    [
      'MINT:MintReferral', 'MINT:OwnershipRenounced', 'MINT:OwnershipTransferred',
      'REFERRALS:OwnershipRenounced', 'REFERRALS:OwnershipTransferred',
    ],
  );
});

test('contrasts all 14 legacy ABI fixtures against chain+alias configs', () => {
  const fixtureRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../docs/legacy-marketplace/abis');
  const fixtures: Array<{ chain: 'BSC' | 'TRON'; alias: string; file: string }> = [
    { chain: 'BSC', alias: 'BREEDING_POINTS', file: 'bsc/breedingPoints.abi.json' },
    { chain: 'BSC', alias: 'BRIDGE', file: 'bsc/bridge.abi.json' },
    { chain: 'BSC', alias: 'MARKETPLACE', file: 'bsc/marketplace.abi.json' },
    { chain: 'BSC', alias: 'POINTS', file: 'bsc/points.abi.json' },
    { chain: 'BSC', alias: 'STAKING_POINTS', file: 'bsc/stakingPoints.abi.json' },
    { chain: 'BSC', alias: 'TOKEN', file: 'bsc/token.abi.json' },
    { chain: 'TRON', alias: 'BREEDING_POINTS', file: 'tron/breedingPoints.abi.json' },
    { chain: 'TRON', alias: 'BRIDGE', file: 'tron/bridge.abi.json' },
    { chain: 'TRON', alias: 'MARKETPLACE', file: 'tron/marketplace.abi.json' },
    { chain: 'TRON', alias: 'MINT', file: 'tron/mint.abi.json' },
    { chain: 'TRON', alias: 'POINTS', file: 'tron/points.abi.json' },
    { chain: 'TRON', alias: 'REFERRALS', file: 'tron/referrals.abi.json' },
    { chain: 'TRON', alias: 'STAKING_POINTS', file: 'tron/stakingPoints.abi.json' },
    { chain: 'TRON', alias: 'TOKEN', file: 'tron/token.abi.json' },
  ];
  const bscConfigs = getContractEventConfigs(['BSC'], {
    tokenAddress: `0x${'1'.repeat(40)}`,
    marketplaceAddress: `0x${'2'.repeat(40)}`,
    bridgeAddress: `0x${'3'.repeat(40)}`,
    contractAliases: ['TOKEN', 'POINTS', 'STAKING_POINTS', 'BREEDING_POINTS', 'MARKETPLACE', 'BRIDGE'],
  });
  const tronConfigs = getContractEventConfigs(['TRON'], {
    contractAliases: ['TOKEN', 'POINTS', 'STAKING_POINTS', 'BREEDING_POINTS', 'MARKETPLACE', 'BRIDGE', 'MINT', 'REFERRALS'],
  });
  for (const fixture of fixtures) {
    const abi = JSON.parse(fs.readFileSync(path.join(fixtureRoot, fixture.file), 'utf8')) as Array<any>;
    const expected = abi.filter((item) => item.type === 'event' || item.type === 'Event');
    const configs = (fixture.chain === 'BSC' ? bscConfigs : tronConfigs)
      .filter((item) => item.contractAlias === fixture.alias);
    assert.deepEqual(
      configs.map((item) => item.eventName).sort(),
      expected.map((item) => item.name).sort(),
      `${fixture.chain}:${fixture.alias} coverage mismatch`,
    );
    if (fixture.chain === 'BSC') {
      for (const item of expected) {
        const parsed = bscEventAbis[item.name as EventName] as any;
        assert.ok(parsed, `missing BSC ABI ${item.name}`);
        assert.deepEqual(
          parsed.inputs.map((input: any) => ({ type: input.type, indexed: Boolean(input.indexed) })),
          item.inputs.map((input: any) => ({ type: input.type, indexed: Boolean(input.indexed) })),
          `BSC ABI signature mismatch ${fixture.alias}:${item.name}`,
        );
      }
    }
    if (fixture.chain === 'TRON') {
      const jumpOut = expected.find((item) => item.name === 'JumpOutBridge');
      if (jumpOut) {
        assert.equal(tronEventSignatures.JumpOutBridge, 'event JumpOutBridge(uint256 tokenId, uint256 createdAt)');
        assert.deepEqual(jumpOut.inputs.map((input: any) => input.type), ['uint256', 'uint256']);
      }
    }
  }
});

test('keeps payload clocks and bytes20/bytes32 lossless', () => {
  const normalized = normalizeDomainEvent('BSC', 'BridgeRequested', 'BRIDGE', {
    transferId: `0x${'1'.repeat(64)}`,
    tokenId: 9n,
    sourceOwner: `0x${'a'.repeat(40)}`,
    destinationOwner: `0x${'b'.repeat(40)}`,
    sourceNetwork: 1,
    destinationNetwork: 0,
    nonce: 2n ** 80n,
    feePaid: 3n ** 80n,
    metadataHash: `0x${'c'.repeat(64)}`,
    createdAt: 9_999_999_999_999n,
  });
  assert.equal(normalized.createdAtRaw, '9999999999999');
  assert.equal(normalized.nonceRaw, (2n ** 80n).toString());
  assert.equal(normalized.feePaidRaw, (3n ** 80n).toString());
  assert.equal(normalized.destinationOwnerRaw, `0x${'b'.repeat(40)}`);
});

test('projects approvals/admin/referrals without touching points or economy', async () => {
  const context = fakeStore();
  const approval = event('Approval', {
    owner: `0x${'1'.repeat(40)}`,
    approved: `0x${'2'.repeat(40)}`,
    tokenId: 7n,
  }, 1);
  await projectLegacyAuditEvent(context.store as never, approval);
  const revoke = event('Approval', {
    owner: `0x${'1'.repeat(40)}`,
    approved: `0x${'0'.repeat(40)}`,
    tokenId: 7n,
  }, 2);
  await projectLegacyAuditEvent(context.store as never, revoke);
  await projectLegacyAuditEvent(context.store as never, approval);
  const revoked = context.collections.get('nft_approvals')!.documents.values().next().value;
  assert.ok(revoked);
  assert.equal(revoked.state, 'revoked');

  const referral = event('MintReferral', {
    user: 'TUser', sponsor: 'TSponsor', num: 2n, value: 10n, comission: 3n, level: 1,
  }, 2, 'TRON');
  await projectReferralEvent(context.store as never, referral);
  const row = context.collections.get('referral_events')!.documents.get(referral._id)!;
  assert.equal(row.commissionRaw, '3');
  assert.equal(row.comissionRaw, '3');
  assert.equal(context.collections.has('point_transactions'), false);

  const unverifiedBsc = event('Approval', {
    owner: `0x${'3'.repeat(40)}`,
    approved: `0x${'4'.repeat(40)}`,
    tokenId: 8n,
  }, 3);
  assert.match(String(await projectEvent(context.store as never, unverifiedBsc)), /cursor contractual verificado/);
  assert.equal(
    context.collections.get('chain_event_audit')!.documents.get(unverifiedBsc._id)!.classification,
    'unverified-bsc-contract',
  );
});

test('breeding ledger correlates start/finish, handles orphan and deduplicates replay', async () => {
  const context = fakeStore();
  const common = {
    user: `0x${'1'.repeat(40)}`,
    parent1: 10n,
    parent2: 11n,
    date: 12_345_678_901_234n,
  };
  const start = event('BreedStart', common, 1);
  const finish = event('BreedFinish', { ...common, result: 12n }, 2);
  await projectBreedingLedger(context.store as never, start);
  await projectBreedingLedger(context.store as never, start);
  await projectBreedingLedger(context.store as never, finish);
  await projectBreedingLedger(context.store as never, finish);
  const secondStart = event('BreedStart', common, 3);
  const secondFinish = event('BreedFinish', { ...common, result: 14n }, 4);
  await projectBreedingLedger(context.store as never, secondStart);
  await projectBreedingLedger(context.store as never, secondFinish);
  const operations = context.collections.get('breeding_operations')!.documents;
  assert.equal(operations.size, 2);
  assert.equal([...operations.values()].filter((row) => row.correlationStatus === 'matched_start').length, 2);
  assert.equal([...operations.values()][0].startDateRaw, '12345678901234');
  assert.equal(context.collections.get('breeding_children')!.documents.size, 2);

  const orphan = event('BreedFinish', { ...common, parent1: 20n, parent2: 21n, result: 13n }, 5);
  await projectBreedingLedger(context.store as never, orphan);
  const orphanStart = event('BreedStart', { ...common, parent1: 20n, parent2: 21n }, 6);
  await projectBreedingLedger(context.store as never, orphanStart);
  const orphanRow = [...context.collections.get('breeding_operations')!.documents.values()]
    .find((row) => row.childId === '13')!;
  assert.equal(orphanRow.status, 'orphan_finish');
  assert.equal(orphanRow.correlationStatus, 'orphan_finish');

  const outOfOrderFinish = event('BreedFinish', { ...common, parent1: 30n, parent2: 31n, result: 15n }, 8);
  const outOfOrderStart = event('BreedStart', { ...common, parent1: 30n, parent2: 31n }, 7);
  await projectBreedingLedger(context.store as never, outOfOrderFinish);
  await projectBreedingLedger(context.store as never, outOfOrderStart);
  const reorderedRow = [...context.collections.get('breeding_operations')!.documents.values()]
    .find((row) => row.childId === '15')!;
  assert.equal(reorderedRow.status, 'completed');
  assert.equal(reorderedRow.correlationStatus, 'matched_start');
});

test('breeding ledger rebuilds cycles from chronological evidence regardless of ingest order', async () => {
  const context = fakeStore();
  const common = {
    user: `0x${'7'.repeat(40)}`,
    parent1: 10n,
    parent2: 11n,
  };
  const start100 = event('BreedStart', { ...common, date: 100n }, 100);
  const start300 = event('BreedStart', { ...common, date: 300n }, 300);
  const finish400 = event('BreedFinish', { ...common, date: 400n, result: 400n }, 400);
  const finish200 = event('BreedFinish', { ...common, date: 200n, result: 200n }, 200);

  for (const item of [start100, start300, finish400, finish200, finish400, finish200]) {
    await projectBreedingLedger(context.store as never, item);
  }

  const operations = [...context.collections.get('breeding_operations')!.documents.values()]
    .map((row) => [row.startEvidence?.blockNumber ?? null, row.finishEvidence?.blockNumber ?? null]);
  assert.deepEqual(operations.sort((left, right) => String(left).localeCompare(String(right))), [
    [100, 200],
    [300, 400],
  ]);
  assert.equal(context.collections.get('breeding_event_ledger')!.documents.size, 4);
  assert.equal(context.collections.get('breeding_children')!.documents.size, 2);
  assert.equal(
    [...context.collections.get('breeding_children')!.documents.values()].every((row) => row.orphanFinish === false),
    true,
  );
});

test('breeding finish-first replay adopts one stable operation and child', async () => {
  const context = fakeStore();
  const common = {
    user: `0x${'8'.repeat(40)}`,
    parent1: 20n,
    parent2: 21n,
  };
  const finish = event('BreedFinish', { ...common, date: 200n, result: 201n }, 200);
  const start = event('BreedStart', { ...common, date: 100n }, 100);

  await projectBreedingLedger(context.store as never, finish);
  await projectBreedingLedger(context.store as never, finish);
  await Promise.all([
    projectBreedingLedger(context.store as never, start),
    projectBreedingLedger(context.store as never, start),
  ]);

  const operationRows = [...context.collections.get('breeding_operations')!.documents.values()];
  const childRows = [...context.collections.get('breeding_children')!.documents.values()];
  assert.equal(operationRows.length, 1);
  assert.equal(operationRows[0].startEvidence.blockNumber, 100);
  assert.equal(operationRows[0].finishEvidence.blockNumber, 200);
  assert.equal(operationRows[0].correlationStatus, 'matched_start');
  assert.equal(childRows.length, 1);
  assert.equal(childRows[0].orphanFinish, false);
  assert.equal(context.collections.get('breeding_event_ledger')!.documents.size, 2);
});

test('bridge completion before request preserves terminal state and does not create business tx', async () => {
  const context = fakeStore();
  const base = {
    transferId: `0x${'d'.repeat(64)}`,
    tokenId: 42n,
    sourceNetwork: 0,
    destinationNetwork: 1,
    metadataHash: `0x${'e'.repeat(64)}`,
  };
  const completed = event('BridgeCompleted', {
    ...base,
    destinationOwner: `0x${'2'.repeat(40)}`,
    minted: true,
    createdAt: 2n,
  }, 2);
  const requested = event('BridgeRequested', {
    ...base,
    sourceOwner: `0x${'1'.repeat(40)}`,
    destinationOwner: `0x${'3'.repeat(40)}`,
    nonce: 1n,
    feePaid: 4n,
    createdAt: 1n,
  }, 1);
  await projectBridgeLifecycle(context.store as never, completed);
  await projectBridgeLifecycle(context.store as never, requested);
  await projectBridgeLifecycle(context.store as never, completed);
  const lateRequest = event('BridgeRequested', {
    ...base,
    tokenId: 999n,
    metadataHash: `0x${'f'.repeat(64)}`,
    sourceOwner: `0x${'4'.repeat(40)}`,
    destinationOwner: `0x${'5'.repeat(40)}`,
    nonce: 2n,
    feePaid: 5n,
  }, 3);
  await projectBridgeLifecycle(context.store as never, lateRequest);
  const rows = [...context.collections.get('bridge_transfers')!.documents.values()];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'completed');
  assert.equal(rows[0].tokenId, '42');
  assert.equal(rows[0].requestEventId, requested._id);
  assert.equal(rows[0].lateRequestEventId, lateRequest._id);
  assert.equal(rows[0].completionEventId, completed._id);
  assert.equal(rows[0].orphanCompletion, false);
  assert.equal(context.collections.get('chain_event_audit')!.documents.get(lateRequest._id)!.classification, 'bridge-terminal-request-mismatch');
  assert.equal(context.collections.has('tx_nfts'), false);
});
