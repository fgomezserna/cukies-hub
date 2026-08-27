import {
  type Collection,
  type Db,
  type Document,
  MongoClient,
  type OptionalUnlessRequiredId,
} from 'mongodb';

import type {
  ChainCursor,
  ChainEvent,
  ContractEventConfig,
  IndexerConfig,
  VerifiedBscContractIdentity,
} from '../types.js';
import { now } from '../utils/json.js';
import { ECONOMY_INDEXES } from './economy-indexes.js';
import {
  ensureEconomySchema,
  migrateEconomySchemaV1ToV2,
  migrateEconomySchemaV2ToV3,
  verifyEconomyTransactionSupport,
} from './economy-schema.js';

export class IndexerStore {
  private client: MongoClient;
  readonly db: Db;

  constructor(config: IndexerConfig) {
    this.client = new MongoClient(config.mongoUrl);
    this.db = this.client.db(config.dbName);
  }

  async connect() {
    await this.client.connect();
    return this;
  }

  async close() {
    await this.client.close();
  }

  events(): Collection<ChainEvent> {
    return this.db.collection<ChainEvent>('chain_events');
  }

  cursors(): Collection<ChainCursor> {
    return this.db.collection<ChainCursor>('chain_cursors');
  }

  async ensureEconomyIndexes() {
    for (const index of ECONOMY_INDEXES) {
      await this.db.collection(index.collection).createIndex(index.keys, index.options);
    }
  }

  async ensureEconomySetup() {
    await this.ensureEconomyIndexes();
    await ensureEconomySchema(this.db, this.db.databaseName);
    return verifyEconomyTransactionSupport(this.db, this.db.databaseName);
  }

  async migrateEconomySchemaV2() {
    await this.ensureEconomyIndexes();
    const metadata = await migrateEconomySchemaV1ToV2(this.db, this.db.databaseName);
    await verifyEconomyTransactionSupport(this.db, this.db.databaseName);
    return metadata;
  }

  async migrateEconomySchemaV3() {
    const metadata = await migrateEconomySchemaV2ToV3(this.db, this.db.databaseName);
    await this.ensureEconomyIndexes();
    await verifyEconomyTransactionSupport(this.db, this.db.databaseName);
    return metadata;
  }

  async ensureIndexes() {
    await Promise.all([
      this.events().createIndex({
        chain: 1,
        contractAlias: 1,
        contractAddress: 1,
        eventName: 1,
        blockNumber: 1,
      }),
      this.events().createIndex({ status: 1, timestampMs: 1, blockNumber: 1, logIndex: 1 }),
      this.events().createIndex({ txHash: 1 }),
      this.events().createIndex({ eventName: 1, 'normalized.tokenId': 1, timestampMs: -1 }),
      this.events().createIndex({
        chain: 1,
        contractAlias: 1,
        contractAddress: 1,
        eventName: 1,
        status: 1,
        'normalized.accountNormalized': 1,
        timestampMs: 1,
      }),
      this.events().createIndex({
        chain: 1,
        contractAlias: 1,
        status: 1,
        'normalized.accountNormalized': 1,
      }),
      this.events().createIndex({
        chain: 1,
        contractAlias: 1,
        status: 1,
        'normalized.beneficiaryNormalized': 1,
      }),
      this.events().createIndex({
        chain: 1,
        contractAlias: 1,
        status: 1,
        'normalized.fromNormalized': 1,
      }),
      this.events().createIndex({
        chain: 1,
        contractAlias: 1,
        status: 1,
        'normalized.toNormalized': 1,
      }),
      this.cursors().createIndex({ chain: 1, contractAlias: 1, eventName: 1 }),
      this.db.collection('tx_nfts').createIndex({ eventId: 1 }, { unique: true, sparse: true }),
      this.db
        .collection('point_transactions')
        .createIndex({ eventId: 1 }, { unique: true, sparse: true }),
      this.db.collection('point_balances').createIndex({ addressNormalized: 1 }, { unique: true }),
      this.db.collection('marketplace_listings').createIndex({ tokenId: 1 }, { unique: true }),
      this.db.collection('bridge_transfers').createIndex({ eventId: 1 }, { unique: true }),
      this.db.collection('presale_purchases').createIndex({ eventId: 1 }, { unique: true }),
      this.db.collection('presale_purchases').createIndex({ txHash: 1, logIndex: 1 }, { unique: true }),
      this.db.collection('presale_purchases').createIndex({ buyerNormalized: 1, confirmedAt: -1 }),
      this.db.collection('presale_purchases').createIndex({ contractAddress: 1, confirmedAt: 1 }),
      this.db.collection('presale_participants').createIndex({ normalizedWalletAddress: 1 }, { unique: true }),
      this.db.collection('presale_participants').createIndex({ referralCode: 1 }, { unique: true, sparse: true }),
      this.db.collection('presale_referral_contributions').createIndex({ eventId: 1, level: 1 }, { unique: true }),
      this.db.collection('presale_referral_contributions').createIndex({ sponsorWalletNormalized: 1, level: 1, confirmedAt: -1 }),
      this.db.collection('presale_referral_campaign_config').createIndex({ active: 1 }),
      this.db.collection('uki_staking_positions')
        .createIndex({ walletNormalized: 1 }, { unique: true }),
      this.db.collection('uki_staking_state')
        .createIndex({ contractAddressNormalized: 1 }, { unique: true }),
      this.db.collection('reward_claim_batches')
        .createIndex({ batchId: 1 }, { unique: true }),
      this.db.collection('reward_claims')
        .createIndex({ eventId: 1 }, { unique: true }),
      this.db.collection('reward_claims')
        .createIndex({ batchId: 1, walletNormalized: 1 }, { unique: true }),
      this.db.collection('reward_claims')
        .createIndex({ transactionHash: 1, logIndex: 1 }, { unique: true }),
      this.db.collection('chain_dead_letters').createIndex({ eventId: 1 }, { unique: true }),
      this.db.collection('chain_dead_letters').createIndex({ chain: 1, contractAlias: 1, updatedAt: -1 }),
      this.db.collection('chain_indexer_runs').createIndex({ startedAt: -1 }),
      this.db.collection('cukies').createIndex({ state: 1, network: 1, ownerNormalized: 1, timeStamp: -1 }),
      this.db.collection('cukies').createIndex({ ownerNormalized: 1, state: 1, network: 1 }),
      this.db.collection('cukies').createIndex(
        { chainId: 1, collectionAddressNormalized: 1, tokenId: 1 },
        {
          name: 'cukies_bsc_asset_identity_unique',
          unique: true,
          partialFilterExpression: {
            chainId: { $type: 'number' },
            collectionAddressNormalized: { $type: 'string' },
            tokenId: { $exists: true },
          },
        },
      ),
      this.db.collection('nft_vault_collections').createIndex(
        { chainId: 1, vaultAlias: 1, vaultAddressNormalized: 1, collectionAddressNormalized: 1 },
        { unique: true },
      ),
      this.db.collection('cukie_master_nft_positions').createIndex(
        { chainId: 1, beneficiaryNormalized: 1, lifecycleOpen: 1, assetId: 1 },
      ),
      this.db.collection('cukie_pool_nft_vault_positions').createIndex(
        { chainId: 1, beneficiaryNormalized: 1, lifecycleOpen: 1, assetId: 1 },
      ),
      this.db.collection('cukie_pool_nft_vault_positions').createIndex(
        {
          chainId: 1,
          vaultAddressNormalized: 1,
          collectionAddressNormalized: 1,
          activationAt: 1,
          exitRequestedAt: 1,
        },
        { name: 'cukie_pool_reward_census' },
      ),
      this.db.collection('cukie_pool_calendar_versions').createIndex(
        { chainId: 1, vaultAddressNormalized: 1, calendarVersion: 1 },
        { unique: true },
      ),
      this.db.collection('nft_vault_recovery_audit').createIndex(
        { chainId: 1, vaultAlias: 1, assetId: 1, 'evidence.blockNumber': -1 },
      ),
      this.db.collection('tx_nfts').createIndex({ tokenId: 1, timestampMs: -1 }),
      this.db.collection('point_transactions').createIndex({ addressNormalized: 1, chain: 1, type: 1, timestampMs: -1 }),
      this.db.collection('point_transactions').createIndex({ chain: 1, type: 1, timestampMs: -1 }),
      this.db.collection('marketplace_listings').createIndex({ status: 1, chain: 1, updatedAt: -1 }),
      this.db.collection('bridge_transfers').createIndex({ tokenId: 1, timestampMs: -1 }),
    ]);
  }

  cursorId(config: ContractEventConfig) {
    return `${config.chain}:${config.contractAlias}:${config.eventName}`;
  }

  async getCursor(config: ContractEventConfig) {
    const cursors = this.cursors();
    const cursor = await cursors.findOne({ _id: this.cursorId(config) });
    if (!cursor) return null;

    const storedAddress = cursor.contractAddress?.trim();
    const configuredAddress = config.contractAddress.trim();
    const matches = config.chain === 'BSC'
      ? storedAddress?.toLowerCase() === configuredAddress.toLowerCase()
      : storedAddress === configuredAddress;
    if (matches) return cursor;

    await cursors.deleteOne(cursor.contractAddress
      ? { _id: this.cursorId(config), contractAddress: cursor.contractAddress }
      : { _id: this.cursorId(config), contractAddress: { $exists: false } });
    return null;
  }

  async updateCursor(config: ContractEventConfig, update: Partial<ChainCursor>) {
    await this.cursors().updateOne(
      { _id: this.cursorId(config) },
      {
        $set: {
          chain: config.chain,
          contractAlias: config.contractAlias,
          contractAddress: config.contractAddress,
          eventName: config.eventName,
          ...update,
          updatedAt: now(),
        },
      },
      { upsert: true },
    );
  }

  async upsertBscCheckpoint(input: {
    chainId: 56 | 97;
    safeBlockNumber: number;
    safeBlockHash: string;
    safeBlockTimestampMs: number;
    checkedAt: Date;
  }) {
    if (
      !Number.isSafeInteger(input.safeBlockTimestampMs)
      || input.safeBlockTimestampMs < 0
    ) {
      throw new Error('El timestamp del bloque canonico BSC es invalido.');
    }
    await this.db.collection<Document & { _id: string }>('chain_bsc_canonical_blocks').updateOne(
      { _id: String(input.safeBlockNumber) },
      {
        $setOnInsert: {
          _id: String(input.safeBlockNumber),
          chain: 'BSC',
          chainId: input.chainId,
          blockNumber: input.safeBlockNumber,
          blockHash: input.safeBlockHash.toLowerCase(),
          blockTimestamp: new Date(input.safeBlockTimestampMs),
          observedAt: input.checkedAt,
          createdAt: input.checkedAt,
        },
      },
      { upsert: true },
    );
    await this.db.collection<Document & { _id: string }>('chain_bsc_checkpoints').updateOne(
      { _id: 'canonical-safe' },
      {
        $set: {
          chain: 'BSC',
          chainId: input.chainId,
          safeBlockNumber: input.safeBlockNumber,
          safeBlockHash: input.safeBlockHash.toLowerCase(),
          safeBlockTimestamp: new Date(input.safeBlockTimestampMs),
          checkedAt: input.checkedAt,
          updatedAt: input.checkedAt,
        },
        $setOnInsert: {
          _id: 'canonical-safe',
          createdAt: input.checkedAt,
        },
      },
      { upsert: true },
    );
  }

  async listUnresolvedCompetitionCreditCutoffs(safeThrough: Date, limit: number) {
    const schema = await this.db.collection<Document & { _id: string }>(
      'economy_schema_metadata',
    ).findOne({ _id: 'uki-economy', schemaVersion: 3 });
    const coverage = await this.db.collection<Document & { _id: string }>(
      'cukie_master_slot_history_state',
    ).find({ _id: { $in: ['uki', 'nft'] } }).limit(3).toArray();
    if (!schema || coverage.length !== 2) return [];
    const reliableDates = [schema.migratedAt ?? schema.initializedAt, ...coverage.map((item) => item.completeFrom)];
    if (reliableDates.some((value) => !(value instanceof Date))) return [];
    const reliableFrom = new Date(Math.max(...reliableDates.map((value) => (value as Date).getTime())));
    const rules = await this.db.collection<{
      active?: boolean;
      activeFrom?: Date;
      activeUntil?: Date;
      cutoffHourUtc?: number;
      cutoffMinuteUtc?: number;
      scope?: string;
    }>('economy_rule_versions').find({
      scope: 'competition_credits',
      activeFrom: { $lte: safeThrough },
      $or: [
        { activeUntil: { $exists: false } },
        { activeUntil: { $gt: reliableFrom } },
      ],
    }).sort({ activeFrom: 1, _id: 1 }).limit(100).toArray();
    const candidates: Date[] = [];
    for (const rule of rules) {
      if (
        !(rule.activeFrom instanceof Date)
        || !Number.isSafeInteger(rule.cutoffHourUtc)
        || !Number.isSafeInteger(rule.cutoffMinuteUtc)
      ) continue;
      const firstReliableInstant = rule.activeFrom > reliableFrom ? rule.activeFrom : reliableFrom;
      let cutoff = new Date(Date.UTC(
        firstReliableInstant.getUTCFullYear(),
        firstReliableInstant.getUTCMonth(),
        firstReliableInstant.getUTCDate(),
        Number(rule.cutoffHourUtc),
        Number(rule.cutoffMinuteUtc),
      ));
      if (cutoff < firstReliableInstant) cutoff = new Date(cutoff.getTime() + 86_400_000);
      const end = rule.activeUntil && rule.activeUntil < safeThrough ? rule.activeUntil : safeThrough;
      while (cutoff <= end) {
        if (candidates.length >= 20_000) {
          throw new Error('El backlog de cutoffs canonicos excede el limite auditable de 20.000.');
        }
        candidates.push(cutoff);
        cutoff = new Date(cutoff.getTime() + 86_400_000);
      }
    }
    const unique = [...new Map(candidates.map((cutoff) => [cutoff.toISOString(), cutoff])).values()]
      .sort((left, right) => left.getTime() - right.getTime());
    if (unique.length === 0) return [];
    const existing = await this.db.collection<Document & { _id: string }>(
      'competition_credit_cutoff_blocks',
    ).find(
      { _id: { $in: unique.map((cutoff) => cutoff.toISOString()) } },
      { projection: { _id: 1 } },
    ).toArray();
    const resolved = new Set(existing.map((item) => String(item._id)));
    return unique.filter((cutoff) => !resolved.has(cutoff.toISOString())).slice(0, limit);
  }

  async upsertCompetitionCreditCutoffBlock(input: {
    cutoff: Date;
    chainId: 56 | 97;
    blockNumber: number;
    blockHash: string;
    blockTimestamp: Date;
    successorBlockNumber: number;
    successorBlockHash: string;
    successorBlockTimestamp: Date;
    safeBlockNumber: number;
    safeBlockHash: string;
    resolvedAt: Date;
  }) {
    await this.db.collection<Document & { _id: string }>(
      'competition_credit_cutoff_blocks',
    ).updateOne(
      { _id: input.cutoff.toISOString() },
      {
        $setOnInsert: {
          _id: input.cutoff.toISOString(),
          ...input,
          createdAt: input.resolvedAt,
        },
      },
      { upsert: true },
    );
  }

  async reconcileVerifiedUkiStakingBootstrap(input: {
    identity: VerifiedBscContractIdentity;
    safeBlockNumber: number;
    safeBlockHash: string;
    verifiedAt: Date;
  }) {
    if (input.identity.alias !== 'UKI_STAKING') return;
    const positions = await this.db.collection('uki_staking_positions')
      .find({}, { projection: { accountBalanceRaw: 1 } })
      .limit(5_001)
      .toArray();
    if (positions.length > 5_000) {
      throw new Error('UKI_STAKING excede el maximo auditable de 5.000 posiciones.');
    }
    let materializedTotal = BigInt(0);
    for (const position of positions) {
      if (
        typeof position.accountBalanceRaw !== 'string'
        || !/^\d+$/.test(position.accountBalanceRaw)
      ) {
        throw new Error('UKI_STAKING contiene una posicion con raw invalido.');
      }
      materializedTotal += BigInt(position.accountBalanceRaw);
    }
    const states = this.db.collection<Document & { _id: string }>('uki_staking_state');
    const state = await states.findOne({ _id: input.identity.address });
    const latestProjected = await this.events().findOne(
      {
        chain: 'BSC',
        contractAlias: 'UKI_STAKING',
        contractAddress: {
          $regex: `^${input.identity.address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          $options: 'i',
        },
        status: 'projected',
      },
      { sort: { blockNumber: -1, logIndex: -1, _id: -1 } },
    );
    const totalStakedRaw = typeof state?.totalStakedRaw === 'string'
      && /^\d+$/.test(state.totalStakedRaw)
      ? state.totalStakedRaw
      : '0';
    const consistent = materializedTotal.toString(10) === totalStakedRaw
      && (latestProjected ? state?.lastEventId === latestProjected._id : !state?.lastEventId);
    const identityFields = {
      chain: 'BSC',
      contractAddress: input.identity.address,
      contractAddressNormalized: input.identity.address,
      bootstrapStatus: 'verified',
      bootstrapStartBlock: input.identity.startBlock,
      bootstrapVerifiedAt: input.verifiedAt,
      bootstrapSafeBlock: input.safeBlockNumber,
      bootstrapSafeBlockHash: input.safeBlockHash.toLowerCase(),
      verifiedChainId: input.identity.chainId,
      contractCodeHash: input.identity.runtimeCodeHash,
      contractDeploymentBlock: input.identity.deploymentBlock,
      contractDeploymentTxHash: input.identity.deploymentTxHash,
      contractConfigHash: input.identity.configHash,
      materializationStatus: consistent ? 'consistent' : 'inconsistent',
      materializedTotalRaw: materializedTotal.toString(10),
      ...(latestProjected
        ? {
            materializedThroughEventId: latestProjected._id,
            materializedThroughBlockNumber: latestProjected.blockNumber,
            materializedThroughLogIndex: latestProjected.logIndex,
          }
        : {
            materializedThroughSafeBlock: input.safeBlockNumber,
            materializedThroughSafeBlockHash: input.safeBlockHash.toLowerCase(),
          }),
      updatedAt: input.verifiedAt,
    };
    await states.updateOne(
      { _id: input.identity.address },
      {
        $set: identityFields,
        $setOnInsert: {
          _id: input.identity.address,
          totalStakedRaw: '0',
          createdAt: input.verifiedAt,
        },
      },
      { upsert: true },
    );
  }

  async upsertEvents(events: ChainEvent[]) {
    if (events.length === 0) return { inserted: 0 };

    const result = await this.events().bulkWrite(
      events.map((event) => ({
        updateOne: {
          filter: { _id: event._id },
          update: {
            $setOnInsert: event,
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    return { inserted: result.upsertedCount };
  }

  async claimNextEvent() {
    const staleLock = new Date(Date.now() - 15 * 60 * 1000);

    const result = await this.events().findOneAndUpdate(
      {
        $or: [
          { status: 'ingested' },
          { status: 'failed', attempts: { $lt: 5 } },
          { status: 'projecting', lockedAt: { $lt: staleLock } },
        ],
      },
      {
        $set: {
          status: 'projecting',
          lockedAt: now(),
          updatedAt: now(),
        },
        $inc: { attempts: 1 },
      },
      {
        sort: { timestampMs: 1, blockNumber: 1, logIndex: 1 },
        returnDocument: 'after',
      },
    );

    return result;
  }

  async markProjected(eventId: string) {
    await this.events().updateOne(
      { _id: eventId },
      {
        $set: {
          status: 'projected',
          projectedAt: now(),
          updatedAt: now(),
        },
        $unset: { lockedAt: '', lastError: '' },
      },
    );
  }

  async markIgnored(eventId: string, reason: string) {
    await this.events().updateOne(
      { _id: eventId },
      {
        $set: {
          status: 'ignored',
          lastError: reason,
          projectedAt: now(),
          updatedAt: now(),
        },
        $unset: { lockedAt: '' },
      },
    );
  }

  async markFailed(event: ChainEvent, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    await this.events().updateOne(
      { _id: event._id },
      {
        $set: {
          status: 'failed',
          lastError: message,
          updatedAt: now(),
        },
        $unset: { lockedAt: '' },
      },
    );

    if (event.attempts >= 4) {
      await this.db.collection('chain_dead_letters').updateOne(
        { eventId: event._id },
        {
          $set: {
            eventId: event._id,
            eventName: event.eventName,
            chain: event.chain,
            contractAlias: event.contractAlias,
            contractAddress: event.contractAddress,
            error: message,
            updatedAt: now(),
          },
          $setOnInsert: {
            createdAt: now(),
          },
        },
        { upsert: true },
      );
    }
  }

  async recordRun<T extends Document>(document: OptionalUnlessRequiredId<T>) {
    await this.db.collection<T>('chain_indexer_runs').insertOne(document);
  }

  async summary() {
    const [
      eventCounts,
      cursorCount,
      cukiCount,
      txCount,
      pointTxCount,
      listingCount,
      deadLetterCount,
    ] = await Promise.all([
      this.events()
        .aggregate<{ _id: string; count: number }>([
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      this.cursors().countDocuments(),
      this.db.collection('cukies').countDocuments(),
      this.db.collection('tx_nfts').countDocuments(),
      this.db.collection('point_transactions').countDocuments(),
      this.db.collection('marketplace_listings').countDocuments(),
      this.db.collection('chain_dead_letters').countDocuments(),
    ]);

    return {
      eventCounts,
      cursorCount,
      cukiCount,
      txCount,
      pointTxCount,
      listingCount,
      deadLetterCount,
    };
  }
}
