import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChainEvent, EventName } from '../types.js';
import {
  classifyLegacyAdminEvent,
  projectLegacyAdminAudit,
} from './legacy-admin-audit.js';

type Document = Record<string, any>;

class MemoryCollection {
  readonly documents = new Map<string, Document>();

  private matches(document: Document, filter: Document): boolean {
    return Object.entries(filter).every(([key, condition]) => {
      if (key === '$or') return (condition as Document[]).some((item) => this.matches(document, item));
      if (condition && typeof condition === 'object' && '$exists' in condition) {
        return (key in document) === condition.$exists;
      }
      if (condition && typeof condition === 'object' && '$lt' in condition) {
        return document[key] < condition.$lt;
      }
      return document[key] === condition;
    });
  }

  async findOne(filter: Document) {
    return [...this.documents.values()].find((document) => this.matches(document, filter)) ?? null;
  }

  async updateOne(filter: Document, update: Document, options: Document = {}) {
    const id = String(filter._id ?? update.$setOnInsert?._id);
    const current = this.documents.get(id);
    if (current && this.matches(current, filter)) {
      Object.assign(current, update.$set ?? {});
      return { matchedCount: 1 };
    }
    if (!options.upsert) return { matchedCount: 0 };
    this.documents.set(id, { ...(update.$setOnInsert ?? {}), ...(update.$set ?? {}) });
    return { matchedCount: 0 };
  }

  async insertOne(document: Document) {
    if (this.documents.has(String(document._id))) {
      throw Object.assign(new Error('duplicate'), { code: 11000 });
    }
    this.documents.set(String(document._id), { ...document });
    return { acknowledged: true };
  }
}

function fakeStore() {
  const collections = new Map<string, MemoryCollection>();
  return {
    collections,
    store: {
      db: {
        collection(name: string) {
          const existing = collections.get(name);
          if (existing) return existing;
          const created = new MemoryCollection();
          collections.set(name, created);
          return created;
        },
      },
    },
  };
}

function event(
  eventName: EventName,
  args: Record<string, unknown>,
  blockNumber: number,
  alias: any = 'PRESALE',
  chain: ChainEvent['chain'] = 'BSC',
): ChainEvent {
  return {
    _id: `${alias}:${eventName}:${blockNumber}`,
    chain,
    chainId: chain === 'BSC' ? 56 : 728126428,
    contractAlias: alias,
    contractAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    eventName,
    txHash: `0x${String(blockNumber).padStart(64, '0')}`,
    logIndex: 0,
    blockNumber,
    blockHash: `0x${String(blockNumber).padStart(64, '0')}`,
    timestampMs: blockNumber * 1_000,
    args: args as any,
    normalized: args as any,
    raw: { args } as any,
    status: 'projecting',
    attempts: 1,
    schemaVersion: 1,
    createdAt: new Date(blockNumber * 1_000),
    updatedAt: new Date(blockNumber * 1_000),
  };
}

test('classifies all new admin families and preserves vault domain dispatch', () => {
  const cases: Array<[EventName, any, string]> = [
    ['OwnershipTransferStarted', { previousOwner: '0x1', newOwner: '0x2' }, 'admin'],
    ['MinPurchaseUpdated', { minAsmPerPurchase: 1n }, 'config'],
    ['SaleEnabledUpdated', { enabled: true }, 'config'],
    ['SaleWindowUpdated', { saleStart: 1n, saleEnd: 2n }, 'config'],
    ['TotalUkiForSaleUpdated', { totalUkiForSale: 3n }, 'config'],
    ['TreasuryUpdated', { previousTreasury: '0x1', nextTreasury: '0x2' }, 'config'],
    ['UkiPerAsmUpdated', { previousUkiPerAsm: 1n, nextUkiPerAsm: 2n }, 'config'],
    ['PresaleVestingConfigFrozen', { start: 1n, duration: 2n }, 'config'],
    ['PresaleVestingConfigUpdated', { start: 1n, duration: 2n }, 'config'],
    ['RoleAdminChanged', { role: '0xrole', previousAdminRole: '0xa', newAdminRole: '0xb' }, 'role'],
    ['RoleGranted', { role: '0xrole', account: '0x1', sender: '0x2' }, 'role'],
    ['RoleRevoked', { role: '0xrole', account: '0x1', sender: '0x2' }, 'role'],
    ['UnallocatedWithdrawn', { to: '0x1', amount: 1n }, 'config'],
    ['ExcessRecovered', { to: '0x1', amount: 1n }, 'config'],
    ['RelayerUpdated', { relayer: '0x1', allowed: true }, 'config'],
    ['BridgePriceUpdated', { previousPrice: 1n, newPrice: 2n }, 'config'],
    ['FeeRecipientUpdated', { previousRecipient: '0x1', newRecipient: '0x2' }, 'config'],
    ['UntrackedERC721Recovered', { collectionAddress: '0x1', tokenId: 1n, recipient: '0x2' }, 'config'],
    ['UkiTokenApproval', { owner: '0x1', spender: '0x2', value: 4n }, 'erc20'],
    ['UkiTokenTransfer', { from: '0x1', to: '0x2', value: 4n }, 'erc20'],
    ['UkiTokenOwnershipTransferred', { previousOwner: '0x1', newOwner: '0x2' }, 'erc20'],
    ['UkiTokenPaused', { account: '0x1' }, 'erc20'],
    ['UkiTokenUnpaused', { account: '0x1' }, 'erc20'],
  ];
  for (const [eventName, args, classification] of cases) {
    const descriptor = classifyLegacyAdminEvent(event(eventName, args, 1, eventName.startsWith('UkiToken') ? 'UKI_TOKEN' : 'PRESALE'));
    assert.equal(descriptor?.classification, classification, eventName);
  }
  const vault = classifyLegacyAdminEvent(event('CollectionAllowedUpdated', { collection: '0x1', allowed: true }, 1, 'CUKIE_POOL_NFT_VAULT'));
  assert.equal(vault?.classification, 'config');
  assert.equal(vault?.preserveDomain, true);
  assert.equal(classifyLegacyAdminEvent(event('UkiTokenApproval', { owner: '0x1', spender: '0x2', value: 1n }, 1, 'TOKEN')), undefined);
});

test('materializes verified admin/ERC20 state monotonically and keeps unverified raw-only', async () => {
  const context = fakeStore();
  const approval = event('UkiTokenApproval', { owner: '0x1', spender: '0x2', value: 4n }, 10, 'UKI_TOKEN');
  const revoke = event('UkiTokenApproval', { owner: '0x1', spender: '0x2', value: 0n }, 11, 'UKI_TOKEN');
  const stale = event('UkiTokenApproval', { owner: '0x1', spender: '0x2', value: 9n }, 9, 'UKI_TOKEN');
  await projectLegacyAdminAudit(context.store as never, approval, { sourceVerified: true });
  await projectLegacyAdminAudit(context.store as never, revoke, { sourceVerified: true });
  await projectLegacyAdminAudit(context.store as never, stale, { sourceVerified: true });
  const allowance = [...context.collections.get('erc20_allowance_state')!.documents.values()][0];
  assert.equal(allowance.valueRaw, '0');
  assert.equal(allowance.state, 'revoked');
  assert.equal(context.collections.get('erc20_event_ledger')!.documents.size, 3);

  const pending = event('OwnershipTransferStarted', { previousOwner: '0x1', newOwner: '0x2' }, 20, 'UKI_STAKING');
  await projectLegacyAdminAudit(context.store as never, pending, { sourceVerified: true });
  const pendingOwnership = [...context.collections.get('contract_admin_state')!.documents.values()]
    .find((row) => row.entityKey === 'ownership');
  assert.equal(pendingOwnership?.pendingOwnerNormalized, '0x2');

  const renounced = event('OwnershipTransferred', { previousOwner: '0x1', newOwner: '0x0000000000000000000000000000000000000000' }, 21, 'UKI_STAKING');
  await projectLegacyAdminAudit(context.store as never, renounced, { sourceVerified: true });
  const ownership = [...context.collections.get('contract_admin_state')!.documents.values()]
    .find((row) => row.entityKey === 'ownership');
  assert.equal(ownership?.ownershipState, 'renounced');
  assert.equal(ownership?.pendingOwner, null);

  const treasuryLate = event('TreasuryUpdated', { previousTreasury: '0x1', nextTreasury: '0x3' }, 41, 'PRESALE');
  const treasuryEarly = event('TreasuryUpdated', { previousTreasury: '0x0', nextTreasury: '0x2' }, 40, 'PRESALE');
  const treasuryStale = event('TreasuryUpdated', { previousTreasury: '0x9', nextTreasury: '0x4' }, 39, 'PRESALE');
  const recipientEarly = event('FeeRecipientUpdated', { previousRecipient: '0x1', newRecipient: '0x2' }, 42, 'PRESALE');
  const recipientLate = event('FeeRecipientUpdated', { previousRecipient: '0x2', newRecipient: '0x3' }, 43, 'PRESALE');
  const feeConfig = event('FeeConfigUpdated', { recipient: '0x3', feeBps: 25n }, 44, 'PRESALE');
  await projectLegacyAdminAudit(context.store as never, treasuryLate, { sourceVerified: true });
  await projectLegacyAdminAudit(context.store as never, treasuryEarly, { sourceVerified: true });
  await projectLegacyAdminAudit(context.store as never, treasuryStale, { sourceVerified: true });
  await projectLegacyAdminAudit(context.store as never, recipientEarly, { sourceVerified: true });
  await projectLegacyAdminAudit(context.store as never, recipientLate, { sourceVerified: true });
  await projectLegacyAdminAudit(context.store as never, feeConfig, { sourceVerified: true });
  const adminRows = [...context.collections.get('contract_admin_state')!.documents.values()];
  const treasuryRows = adminRows.filter((row) => row.entityKey === 'treasury');
  const recipientRows = adminRows.filter((row) => row.entityKey === 'feeRecipient');
  const feeConfigRows = adminRows.filter((row) => row.entityKey === 'feeConfig');
  assert.equal(treasuryRows.length, 1);
  assert.equal(treasuryRows[0].treasuryNormalized, '0x3');
  assert.equal(treasuryRows[0].lastBlockNumber, 41);
  assert.equal(recipientRows.length, 1);
  assert.equal(recipientRows[0].feeRecipientNormalized, '0x3');
  assert.equal(recipientRows[0].lastBlockNumber, 43);
  assert.equal(feeConfigRows.length, 1);
  assert.equal(feeConfigRows[0].feeRecipientNormalized, '0x3');
  assert.equal(feeConfigRows[0].feeBpsRaw, '25');

  const vaultPause = classifyLegacyAdminEvent(event('Paused', { account: '0x1' }, 45, 'CUKIE_POOL_NFT_VAULT'));
  assert.equal(vaultPause?.preserveDomain, false);

  const tronRenounced = event(
    'OwnershipTransferred',
    { previousOwner: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwa', newOwner: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb' },
    46,
    'REFERRALS',
    'TRON',
  );
  await projectLegacyAdminAudit(context.store as never, tronRenounced, { sourceVerified: true });
  const tronOwnership = [...context.collections.get('contract_admin_state')!.documents.values()]
    .find((row) => row.contractAlias === 'REFERRALS' && row.entityKey === 'ownership');
  assert.equal(tronOwnership?.ownershipState, 'renounced');

  const roleOne = event('RoleGranted', { role: '0xrole', account: '0x1', sender: '0x2' }, 25, 'VESTING_VAULT');
  const roleTwo = event('RoleGranted', { role: '0xrole', account: '0x3', sender: '0x2' }, 26, 'VESTING_VAULT');
  await projectLegacyAdminAudit(context.store as never, roleOne, { sourceVerified: true });
  await projectLegacyAdminAudit(context.store as never, roleTwo, { sourceVerified: true });
  const roleRows = [...context.collections.get('contract_admin_state')!.documents.values()]
    .filter((row) => row.classification === 'role');
  assert.equal(roleRows.length, 2);
  assert.notEqual(roleRows[0].entityKey, roleRows[1].entityKey);

  const unverified = event('UkiTokenTransfer', { from: '0x1', to: '0x2', value: 8n }, 30, 'UKI_TOKEN');
  const result = await projectLegacyAdminAudit(context.store as never, unverified, { sourceVerified: false });
  assert.equal(result?.materialized, false);
  assert.equal(context.collections.get('erc20_event_ledger')!.documents.size, 3);
  assert.equal(context.collections.get('chain_event_audit')!.documents.get(unverified._id)!.classification, 'erc20');
});
