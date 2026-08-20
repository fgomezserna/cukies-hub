import "server-only";

import type { ClientSession, Db } from "mongodb";

import {
  DomainConflictError,
  DomainNotFoundError,
  SchemaNotReadyError,
} from "../errors";
import {
  stakingBalancesMatchState,
  vestingLedgerMatchesPositions,
} from "../cukie-master/repository";
import {
  compareCreditText,
  safeCompetitionCreditPeriodScopeId,
  safeCompetitionCreditSettlementPeriodScopeId,
  stableCreditHash,
} from "./rules";
import {
  buildCreditSourceHealthEvidenceHash,
  creditSourceCursorIsHealthy,
} from "./source-health";
import {
  CREDIT_RULE_SCOPE,
  CREDIT_SCHEMA_VERSION,
  CREDIT_SOURCE_WATERMARK_IDS,
  type CompetitionCreditLedgerEntry,
  type CompetitionCreditRule,
  type CompetitionCreditRun,
  type CreditAccountPeriod,
  type CreditCanonicalBlockEvidence,
  type CreditIntegrityIncident,
  type CreditLot,
  type CreditLotFifoCursor,
  type CreditPoolConfiguration,
  type CreditPoolPeriod,
  type CreditPoolPosition,
  type CreditReconciliationSnapshot,
  type CreditReservation,
  type CreditRunItem,
  type CreditRunHold,
  type CreditSnapshotGate,
  type CreditSnapshotSlot,
  type CreditSourceHealth,
  type CreditSourceWatermark,
  type CreditRoute,
} from "./types";

export type ReserveCreditLotsInput = {
  reservation: CreditReservation;
  now: Date;
};

export type FinishCreditReservationInput = {
  reservation: CreditReservation;
  operation: "consume" | "release";
  idempotencyKey: string;
  payloadHash: string;
  committedAt?: Date;
  now: Date;
};

export interface CompetitionCreditRepository {
  findRuleAt(
    at: Date,
    expectedVersion?: string
  ): Promise<CompetitionCreditRule | null>;
  findOldestRule(): Promise<CompetitionCreditRule | null>;
  readSnapshotGate(
    rule: CompetitionCreditRule,
    cutoff: Date,
    route: CreditRoute
  ): Promise<CreditSnapshotGate>;
  listSourceSlots(limit: number, route?: CreditRoute): Promise<CreditSnapshotSlot[]>;
  listSourceSlotsAtCutoff(
    cutoffBlock: CreditCanonicalBlockEvidence,
    route: CreditRoute,
    limit: number
  ): Promise<CreditSnapshotSlot[]>;
  readSourceHealth(
    now: Date,
    rule: CompetitionCreditRule,
    route: CreditRoute
  ): Promise<CreditSourceHealth>;
  findCanonicalCutoffBlock(
    cutoff: Date
  ): Promise<CreditCanonicalBlockEvidence | null>;
  upsertSourceWatermark(
    watermark: CreditSourceWatermark
  ): Promise<CreditSourceWatermark>;
  findSlot(slotId: string): Promise<CreditSnapshotSlot | null>;
  findPoolConfiguration(
    walletNormalized: string,
    slotId: string,
    eligibilityEpoch: number,
    cutoff: Date,
    ruleVersion: string,
    ruleConfigHash: string
  ): Promise<CreditPoolConfiguration | null>;
  findPoolConfigurationByIdempotencyKey(
    idempotencyKey: string
  ): Promise<CreditPoolConfiguration | null>;
  insertPoolConfiguration(config: CreditPoolConfiguration): Promise<void>;
  findRun(runId: string): Promise<CompetitionCreditRun | null>;
  findRunByPeriod(periodId: string, route: CreditRoute): Promise<CompetitionCreditRun | null>;
  findLatestRunByRoute(route: CreditRoute): Promise<CompetitionCreditRun | null>;
  insertRunAndItems(
    run: CompetitionCreditRun,
    items: CreditRunItem[],
    holds: CreditRunHold[]
  ): Promise<void>;
  claimRunLease(
    runId: string,
    workerId: string,
    now: Date,
    leaseExpiresAt: Date
  ): Promise<CompetitionCreditRun | null>;
  findPendingRunItems(runId: string, limit: number): Promise<CreditRunItem[]>;
  applyRunItem(
    runId: string,
    workerId: string,
    fenceToken: number,
    item: CreditRunItem,
    now: Date
  ): Promise<boolean>;
  countPendingRunItems(runId: string): Promise<number>;
  openRun(
    runId: string,
    workerId: string,
    fenceToken: number,
    now: Date
  ): Promise<CompetitionCreditRun | null>;
  findReservationByIdempotencyKey(
    idempotencyKey: string
  ): Promise<CreditReservation | null>;
  findReservation(reservationId: string): Promise<CreditReservation | null>;
  findReservationBySessionId(
    sessionId: string
  ): Promise<CreditReservation | null>;
  listExpiredActiveReservations(
    now: Date,
    limit: number
  ): Promise<CreditReservation[]>;
  findGameSessionLifecycle(
    sessionId: string
  ): Promise<{ status: string } | null>;
  findLedgerByIdempotencyKey(
    idempotencyKey: string
  ): Promise<CompetitionCreditLedgerEntry | null>;
  hasOpenCreditBlock(walletNormalized: string): Promise<boolean>;
  listAvailableOwnLots(
    walletNormalized: string,
    periodId: string,
    now: Date,
    limit: number,
    after?: CreditLotFifoCursor
  ): Promise<CreditLot[]>;
  listAvailablePoolLots(
    periodId: string,
    now: Date,
    limit: number,
    after?: CreditLotFifoCursor
  ): Promise<CreditLot[]>;
  reserveLots(input: ReserveCreditLotsInput): Promise<void>;
  finishReservation(
    input: FinishCreditReservationInput
  ): Promise<CreditReservation | null>;
  listExpiredAvailableLots(now: Date, limit: number): Promise<CreditLot[]>;
  expireAvailableLot(lot: CreditLot, now: Date): Promise<boolean>;
  readReconciliationSnapshot(
    runId: string
  ): Promise<CreditReconciliationSnapshot | null>;
  blockRunAndOpenIncident(incident: CreditIntegrityIncident): Promise<void>;
}

export type CompetitionCreditTransactionRunner = <T>(
  work: (repository: CompetitionCreditRepository) => Promise<T>
) => Promise<T>;

function accountPeriodId(walletNormalized: string, periodId: string, route: CreditRoute) {
  return `${walletNormalized}:${periodId}:${route}`;
}

function poolPeriodId(periodId: string, route: CreditRoute) {
  return `pool:${periodId}:${route}`;
}

const RECONCILIATION_DOCUMENT_LIMITS = {
  items: 5_001,
  ownLots: 5_001,
  poolLots: 5_001,
  poolPositions: 5_001,
  reservations: 20_001,
  ledger: 50_001,
  accounts: 5_001,
} as const;

function duplicateKey(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
  );
}

function ledgerEntry(
  input: Omit<CompetitionCreditLedgerEntry, "_id" | "ledgerId">
) {
  const ledgerId = stableCreditHash({
    idempotencyKey: input.idempotencyKey,
    operation: input.operation,
    bucket: input.bucket,
    lotId: input.lotId,
  });
  return { ...input, _id: ledgerId, ledgerId };
}

function creditLotFifoAfter(after?: CreditLotFifoCursor) {
  if (!after) return {};
  return {
    $or: [
      { expiresAt: { $gt: after.expiresAt } },
      { expiresAt: after.expiresAt, createdAt: { $gt: after.createdAt } },
      {
        expiresAt: after.expiresAt,
        createdAt: after.createdAt,
        _id: { $gt: after.lotId },
      },
    ],
  };
}

function mongoCollections(db: Db) {
  return {
    rules: db.collection<CompetitionCreditRule>("economy_rule_versions"),
    watermarks: db.collection<CreditSourceWatermark>(
      "competition_credit_source_watermarks"
    ),
    slots: db.collection<CreditSnapshotSlot>("cukie_master_slots"),
    slotVersions: db.collection<{
      _id: string;
      slotId: string;
      route: CreditRoute;
      validFrom: Date;
      validUntil?: Date;
      effectiveBlockNumber?: number;
      effectiveBlockHash?: string;
      effectiveBlockTimestamp?: Date;
      slot: CreditSnapshotSlot;
    }>("cukie_master_slot_versions"),
    slotHistoryState: db.collection<{
      _id: CreditRoute;
      completeFrom: Date;
      completeFromBlockNumber?: number;
    }>("cukie_master_slot_history_state"),
    configs: db.collection<CreditPoolConfiguration>(
      "competition_credit_pool_configs"
    ),
    runs: db.collection<CompetitionCreditRun>("competition_credit_runs"),
    runItems: db.collection<CreditRunItem>("competition_credit_run_items"),
    runHolds: db.collection<CreditRunHold>("competition_credit_run_holds"),
    ledger: db.collection<CompetitionCreditLedgerEntry>(
      "competition_credit_ledger"
    ),
    ownLots: db.collection<CreditLot>("competition_credit_lots"),
    poolLots: db.collection<CreditLot>("competition_credit_pool_lots"),
    poolPositions: db.collection<CreditPoolPosition>("credit_pool_positions"),
    accounts: db.collection<CreditAccountPeriod>(
      "competition_credit_account_periods"
    ),
    poolPeriods: db.collection<CreditPoolPeriod>(
      "competition_credit_pool_periods"
    ),
    reservations: db.collection<CreditReservation>(
      "competition_credit_reservations"
    ),
    incidents: db.collection<CreditIntegrityIncident>(
      "competition_credit_incidents"
    ),
  };
}

export async function assertCompetitionCreditSchema(
  db: Db,
  session: ClientSession
) {
  const sentinel = await db
    .collection<{
      _id: string;
      schemaVersion?: unknown;
      dbName?: unknown;
    }>("economy_schema_metadata")
    .findOne({ _id: "uki-economy" }, { session });
  if (
    !sentinel ||
    sentinel.schemaVersion !== CREDIT_SCHEMA_VERSION ||
    sentinel.dbName !== db.databaseName
  ) {
    throw new SchemaNotReadyError(
      `CompetitionCreditService requiere economy schema v${CREDIT_SCHEMA_VERSION} coordinado en ${db.databaseName}.`
    );
  }
  return sentinel;
}

export function createMongoCompetitionCreditRepository(
  db: Db,
  session: ClientSession
): CompetitionCreditRepository {
  const collections = mongoCollections(db);
  const options = { session };

  async function openRunIdsAt(periodId: string, now: Date) {
    return collections.runs.distinct(
      "_id",
      {
        status: { $in: ["open", "open_with_holds"] },
        "settlementPeriod.periodId": periodId,
        "settlementPeriod.cutoff": { $lte: now },
        "settlementPeriod.nextCutoff": { $gt: now },
      },
      options
    );
  }

  async function incrementAccount(
    walletNormalized: string,
    periodId: string,
    route: CreditRoute,
    increments: Partial<
      Record<
        | "grantedCredits"
        | "poolDepositedCredits"
        | "availableCredits"
        | "reservedCredits"
        | "spentCredits"
        | "expiredCredits",
        number
      >
    >,
    now: Date
  ) {
    const id = accountPeriodId(walletNormalized, periodId, route);
    await collections.accounts.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          _id: id,
          walletNormalized,
          periodId,
          route,
          grantedCredits: 0,
          poolDepositedCredits: 0,
          availableCredits: 0,
          reservedCredits: 0,
          spentCredits: 0,
          expiredCredits: 0,
          blocked: false,
          revision: 0,
          createdAt: now,
          updatedAt: now,
        },
      },
      { ...options, upsert: true }
    );
    const updated = await collections.accounts.updateOne(
      { _id: id, blocked: false },
      { $inc: { ...increments, revision: 1 }, $set: { updatedAt: now } },
      options
    );
    if (updated.matchedCount !== 1) {
      throw new DomainConflictError(
        `La cuenta de creditos ${id} esta bloqueada o ausente.`
      );
    }
  }

  async function incrementPoolPeriod(
    periodId: string,
    route: CreditRoute,
    increments: Partial<
      Record<
        | "contributedCredits"
        | "availableCredits"
        | "reservedCredits"
        | "spentCredits"
        | "expiredCredits",
        number
      >
    >,
    now: Date
  ) {
    const id = poolPeriodId(periodId, route);
    await collections.poolPeriods.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          _id: id,
          periodId,
          route,
          contributedCredits: 0,
          availableCredits: 0,
          reservedCredits: 0,
          spentCredits: 0,
          expiredCredits: 0,
          blocked: false,
          revision: 0,
          createdAt: now,
          updatedAt: now,
        },
      },
      { ...options, upsert: true }
    );
    const updated = await collections.poolPeriods.updateOne(
      { _id: id, blocked: false },
      { $inc: { ...increments, revision: 1 }, $set: { updatedAt: now } },
      options
    );
    if (updated.matchedCount !== 1) {
      throw new DomainConflictError(
        `El periodo de pool ${id} esta bloqueado o ausente.`
      );
    }
  }

  return {
    async findRuleAt(at, expectedVersion) {
      const found = await collections.rules
        .find(
          {
            scope: CREDIT_RULE_SCOPE,
            activeFrom: { $lte: at },
            $or: [
              { activeUntil: { $exists: false } },
              { activeUntil: { $gt: at } },
            ],
          },
          options
        )
        .sort({ activeFrom: -1, _id: 1 })
        .limit(2)
        .toArray();
      if (found.length > 1) {
        throw new DomainConflictError(
          "Hay reglas de creditos activas solapadas."
        );
      }
      if (expectedVersion && found[0]?.version !== expectedVersion) return null;
      return found[0] ?? null;
    },
    findOldestRule: () => collections.rules.findOne(
      { scope: CREDIT_RULE_SCOPE },
      { ...options, sort: { activeFrom: 1, _id: 1 } }
    ),

    async readSnapshotGate(rule, cutoff, route) {
      const routeAliases = route === "uki"
        ? ["UKI_STAKING", "VESTING_VAULT"]
        : ["TOKEN_V2", "CUKIE_MASTER_NFT_VAULT"];
      const [
        sourceWatermark,
        ruleCount,
        creditIncidents,
        chainIncidents,
        maturedQualifyingSlots,
      ] = await Promise.all([
        collections.watermarks.findOne(
          { _id: CREDIT_SOURCE_WATERMARK_IDS[route] },
          options
        ),
        collections.rules.countDocuments(
          {
            _id: rule._id,
            scope: CREDIT_RULE_SCOPE,
            version: rule.version,
            active: true,
            configHash: rule.configHash,
            activeFrom: { $lte: cutoff },
            $or: [
              { activeUntil: { $exists: false } },
              { activeUntil: { $gt: cutoff } },
            ],
          },
          options
        ),
        collections.incidents.countDocuments({ status: "open", route }, options),
        db.collection("chain_integrity_incidents").countDocuments(
          {
            status: "open",
            $or: [
              { route },
              { scope: route },
              { contractAlias: { $in: routeAliases } },
              {
                route: { $exists: false },
                scope: { $exists: false },
                contractAlias: { $exists: false },
                type: { $regex: /economy|canonical|cukie|credit/i },
              },
            ],
          },
          options
        ),
        collections.slots.countDocuments(
          {
            route,
            status: "qualifying",
            creditEligibleFrom: { $lte: cutoff },
          },
          options
        ),
      ]);
      return {
        schemaReady: db.databaseName.length > 0,
        activeRuleMatches: ruleCount === 1,
        sourceWatermark,
        openIntegrityIncidents: creditIncidents + chainIncidents,
        maturedQualifyingSlots,
      };
    },

    listSourceSlots: (limit, route) =>
      collections.slots
        .find(route ? { route } : {}, options)
        .sort({ _id: 1 })
        .limit(limit)
        .toArray(),
    async listSourceSlotsAtCutoff(cutoffBlock, route, limit) {
      const coverage = await collections.slotHistoryState.findOne(
        { _id: route },
        options
      );
      if (
        !coverage ||
        !Number.isSafeInteger(coverage.completeFromBlockNumber) ||
        Number(coverage.completeFromBlockNumber) > cutoffBlock.blockNumber
      ) {
        throw new DomainConflictError(
          `El historial temporal ${route} no cubre el bloque ${cutoffBlock.blockNumber}.`
        );
      }
      const versions = await collections.slotVersions.aggregate<{
        _id: string;
        slotId: string;
        effectiveBlockNumber: number;
        effectiveBlockHash: string;
        effectiveBlockTimestamp: Date;
        slot: CreditSnapshotSlot;
      }>([
        {
          $match: {
            route,
            effectiveBlockNumber: { $lte: cutoffBlock.blockNumber },
            effectiveBlockHash: { $type: "string" },
            effectiveBlockTimestamp: { $type: "date" },
          },
        },
        { $sort: { slotId: 1, effectiveBlockNumber: -1, "slot.revision": -1, _id: -1 } },
        { $group: { _id: "$slotId", version: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$version" } },
        { $sort: { _id: 1 } },
        { $limit: limit },
      ], options).toArray();
      for (const version of versions) {
        if (
          !Number.isSafeInteger(version.effectiveBlockNumber) ||
          version.effectiveBlockNumber > cutoffBlock.blockNumber ||
          !/^0x[0-9a-f]{64}$/.test(version.effectiveBlockHash) ||
          !(version.effectiveBlockTimestamp instanceof Date) ||
          Number.isNaN(version.effectiveBlockTimestamp.getTime()) ||
          version.effectiveBlockTimestamp.getTime() > cutoffBlock.blockTimestamp.getTime() ||
          version.slot.sourceBlockNumber !== version.effectiveBlockNumber ||
          version.slot.sourceBlockHash !== version.effectiveBlockHash ||
          version.slot.sourceBlockTimestamp?.getTime() !== version.effectiveBlockTimestamp.getTime()
        ) {
          throw new DomainConflictError(
            `La version historica ${version._id} no acredita su bloque efectivo.`,
          );
        }
      }
      return versions.map((version) => version.slot);
    },
    async readSourceHealth(now, rule, route) {
      const aliases = route === "uki"
        ? ["UKI_STAKING", "VESTING_VAULT"]
        : ["TOKEN_V2", "CUKIE_MASTER_NFT_VAULT"];
      const expectedCursorIds = route === "uki"
        ? [
            "UKI_STAKING:Staked",
            "UKI_STAKING:Unstaked",
            "VESTING_VAULT:VestingCreated",
            "VESTING_VAULT:TokensReleased",
          ]
        : [
            "TOKEN_V2:Transfer",
            "TOKEN_V2:CukieMetadataConfigured",
            "CUKIE_MASTER_NFT_VAULT:CukieMasterCollectionAllowedUpdated",
            "CUKIE_MASTER_NFT_VAULT:CukieMasterDeposited",
            "CUKIE_MASTER_NFT_VAULT:CukieMasterWithdrawn",
            "CUKIE_MASTER_NFT_VAULT:CukieMasterUntrackedERC721Recovered",
          ];
      const [
        latestSuccess,
        latestError,
        checkpoint,
        cursors,
        deadLetters,
        pendingEvents,
        incidents,
        rounds,
        stakingPositions,
        stakingState,
        vestingPositions,
        vestingLedger,
        cukiePositions,
        healthSlots,
      ] = await Promise.all([
        db
          .collection("chain_indexer_runs")
          .findOne(
            { type: { $in: ["loop", "ingest-once"] } },
            { ...options, sort: { endedAt: -1 } }
          ),
        db
          .collection("chain_indexer_runs")
          .findOne(
            { type: "loop-error", failedContractAliases: { $in: aliases } },
            { ...options, sort: { endedAt: -1 } }
          ),
        db
          .collection<{
            _id: string;
            checkedAt?: unknown;
            safeBlockNumber?: unknown;
            safeBlockHash?: unknown;
          }>("chain_bsc_checkpoints")
          .findOne({ _id: "canonical-safe" }, options),
        db
          .collection("chain_cursors")
          .find(
            {
              chain: "BSC",
              contractAlias: { $in: aliases },
            },
            options
          )
          .limit(100)
          .toArray(),
        db.collection("chain_dead_letters").countDocuments(
          {
            contractAlias: { $in: aliases },
          },
          options
        ),
        db.collection("chain_events").countDocuments(
          {
            contractAlias: { $in: aliases },
            status: { $ne: "projected" },
          },
          options
        ),
        db.collection("chain_integrity_incidents").countDocuments(
          {
            status: "open",
            $or: [
              { contractAlias: { $in: aliases } },
              { route },
              { scope: route },
              {
                chain: "BSC",
                route: { $exists: false },
                scope: { $exists: false },
                contractAlias: { $exists: false },
                type: { $regex: /canonical|economy|vesting|staking|nft/i },
              },
            ],
          },
          options
        ),
        db
          .collection("cukie_master_route_rounds")
          .find(
            {
              route,
              status: "active",
            },
            options
          )
          .limit(3)
          .toArray(),
        db
          .collection("uki_staking_positions")
          .find({}, options)
          .limit(rule.maxSnapshotSlots + 1)
          .toArray(),
        db.collection("uki_staking_state").findOne(
          {
            contractAddressNormalized: rule.sourceContractAddresses.UKI_STAKING,
          },
          options
        ),
        db
          .collection("uki_vesting_positions")
          .find({}, options)
          .limit(rule.maxSnapshotSlots + 1)
          .toArray(),
        db
          .collection("uki_vesting_events")
          .find({}, options)
          .sort({
            beneficiaryNormalized: 1,
            scheduleId: 1,
            blockNumber: 1,
            logIndex: 1,
          })
          .limit(50_001)
          .toArray(),
        db
          .collection("cukie_master_positions")
          .find({ route }, options)
          .sort({ _id: 1 })
          .limit(rule.maxSnapshotSlots + 1)
          .toArray(),
        collections.slots
          .find({ route }, options)
          .sort({ _id: 1 })
          .limit(rule.maxSnapshotSlots + 1)
          .toArray(),
      ]);
      const warnings: string[] = [];
      const freshnessCutoff = new Date(now.getTime() - rule.sourceFreshnessMs);
      const successAt =
        latestSuccess?.endedAt instanceof Date ? latestSuccess.endedAt : null;
      const errorAt =
        latestError?.endedAt instanceof Date ? latestError.endedAt : null;
      const checkpointAt =
        checkpoint?.checkedAt instanceof Date ? checkpoint.checkedAt : null;
      if (
        !successAt ||
        successAt < freshnessCutoff ||
        (errorAt && errorAt > successAt)
      ) {
        warnings.push("INDEXER_RUN_UNHEALTHY");
      }
      if (
        !checkpointAt ||
        checkpointAt < freshnessCutoff ||
        !Number.isSafeInteger(checkpoint?.safeBlockNumber) ||
        typeof checkpoint?.safeBlockHash !== "string"
      ) {
        warnings.push("CANONICAL_CHECKPOINT_UNHEALTHY");
      }
      const healthyCursorIds = new Set<string>();
      const cursorIdCounts = new Map<string, number>();
      const cursorTimes: Date[] = [];
      for (const cursor of cursors) {
        const cursorId = `${String(cursor.contractAlias)}:${String(
          cursor.eventName
        )}`;
        cursorIdCounts.set(cursorId, (cursorIdCounts.get(cursorId) ?? 0) + 1);
        const alias = aliases.includes(String(cursor.contractAlias))
          ? (String(
              cursor.contractAlias
            ) as keyof CompetitionCreditRule["sourceContractAddresses"])
          : null;
        const isUkiCursor =
          alias === "UKI_STAKING" || alias === "VESTING_VAULT";
        const expectedAddress = alias
          ? rule.sourceContractAddresses[alias]
          : null;
        const expectedIdentity = isUkiCursor
          ? rule.verifiedSourceIdentities[alias]
          : null;
        const [expectedAlias, expectedEventName] = cursorId.split(":");
        const healthy =
          alias !== null &&
          expectedCursorIds.includes(cursorId) &&
          typeof expectedAddress === "string" &&
          Number.isSafeInteger(checkpoint?.safeBlockNumber) &&
          creditSourceCursorIsHealthy({
            cursor,
            expectedAlias,
            expectedEventName,
            expectedAddress,
            expectedSafeBlock: Number(checkpoint?.safeBlockNumber),
            freshnessCutoff,
            ...(isUkiCursor
              ? {
                  expectedChainId: rule.expectedBscChainId,
                  expectedIdentity: expectedIdentity!,
                }
              : {}),
          });
        if (healthy) {
          healthyCursorIds.add(cursorId);
          cursorTimes.push(cursor.updatedAt);
        }
      }
      for (const cursorId of expectedCursorIds) {
        if (
          !healthyCursorIds.has(cursorId) ||
          cursorIdCounts.get(cursorId) !== 1
        ) {
          warnings.push(`CURSOR_UNHEALTHY:${cursorId}`);
        }
      }
      if (cursors.length !== expectedCursorIds.length) {
        warnings.push("CURSOR_SET_CARDINALITY_MISMATCH");
      }
      if (deadLetters > 0) warnings.push("CHAIN_DEAD_LETTERS_OPEN");
      if (pendingEvents > 0) warnings.push("CHAIN_EVENTS_NOT_PROJECTED");
      if (incidents > 0) warnings.push("CHAIN_INTEGRITY_INCIDENT_OPEN");
      const validRaw = (value: unknown) =>
        typeof value === "string" && /^\d{1,78}$/.test(value);
      const stakingRawShapeValid =
        stakingPositions.every((position) =>
          validRaw(position.accountBalanceRaw)
        ) && validRaw(stakingState?.totalStakedRaw);
      if (route === "uki" && (
        stakingPositions.length > rule.maxSnapshotSlots ||
        !stakingRawShapeValid ||
        !stakingBalancesMatchState(stakingPositions, stakingState as never)
      )) {
        warnings.push("UKI_STAKING_PROJECTION_MISMATCH");
      }
      const vestingRawShapeValid =
        vestingLedger.every(
          (event) =>
            validRaw(event.allocatedAmountRaw) &&
            validRaw(event.releasedAmountRaw)
        ) &&
        vestingPositions.every(
          (position) =>
            validRaw(position.totalAllocatedRaw) &&
            validRaw(position.releasedRaw) &&
            validRaw(position.lockedRaw)
        );
      if (route === "uki" && (
        vestingPositions.length > rule.maxSnapshotSlots ||
        vestingLedger.length > 50_000 ||
        !vestingRawShapeValid ||
        !vestingLedgerMatchesPositions(
          vestingLedger as never,
          vestingPositions as never
        )
      )) {
        warnings.push("UKI_VESTING_PROJECTION_MISMATCH");
      }
      if (route === "uki" && stakingState?.totalStakedRaw === "0" && !stakingState.lastEventId) {
        const stakingIdentityMatches = cursors.some(
          (cursor) =>
            cursor.contractAlias === "UKI_STAKING" &&
            cursor.contractCodeHash === stakingState.contractCodeHash &&
            cursor.contractConfigHash === stakingState.contractConfigHash
        );
        if (
          !(
            stakingState.bootstrapVerifiedAt instanceof Date &&
            Number.isSafeInteger(stakingState.bootstrapSafeBlock) &&
            typeof stakingState.bootstrapSafeBlockHash === "string" &&
            stakingState.verifiedChainId === rule.expectedBscChainId &&
            typeof stakingState.contractCodeHash === "string" &&
            typeof stakingState.contractConfigHash === "string" &&
            stakingIdentityMatches
          )
        ) {
          warnings.push("UKI_STAKING_ZERO_WITHOUT_BOOTSTRAP_PROOF");
        }
      }
      if (
        cukiePositions.length > rule.maxSnapshotSlots ||
        healthSlots.length > rule.maxSnapshotSlots
      ) {
        warnings.push("CUKIE_MASTER_PROJECTION_LIMIT_EXCEEDED");
      } else {
        const positionByRoute = new Map<string, Record<string, unknown>>();
        for (const position of cukiePositions) {
          const key = `${String(position.walletNormalized)}:${String(
            position.route
          )}`;
          if (positionByRoute.has(key))
            warnings.push("CUKIE_MASTER_POSITION_DUPLICATE");
          positionByRoute.set(key, position);
        }
        const slotsByPosition = new Map<string, CreditSnapshotSlot[]>();
        for (const sourceSlot of healthSlots) {
          const key = `${sourceSlot.walletNormalized}:${sourceSlot.route}`;
          const current = slotsByPosition.get(key) ?? [];
          current.push(sourceSlot);
          slotsByPosition.set(key, current);
          const position = positionByRoute.get(key);
          if (
            sourceSlot.status !== "inactive" &&
            (!position ||
              position.sourceHash !== sourceSlot.sourceHash ||
              position.ruleVersion !== sourceSlot.ruleVersion ||
              position.roundId !== sourceSlot.roundId)
          ) {
            warnings.push("CUKIE_MASTER_SLOT_POSITION_MISMATCH");
          }
        }
        for (const [key, position] of positionByRoute) {
          const allocatedSlots = position.allocatedSlots;
          const currentSlots = (slotsByPosition.get(key) ?? []).filter(
            (slot) => slot.status !== "inactive"
          );
          if (
            typeof allocatedSlots !== "number" ||
            !Number.isSafeInteger(allocatedSlots) ||
            allocatedSlots < 0 ||
            currentSlots.length !== allocatedSlots
          ) {
            warnings.push("CUKIE_MASTER_ALLOCATED_SLOT_COUNT_MISMATCH");
          }
        }
      }
      const routeVersions: Partial<Record<"uki" | "nft", string>> = {};
      for (const round of rounds) {
        const route: unknown = round.route;
        if (
          (route === "uki" || route === "nft") &&
          typeof round.ruleVersion === "string" &&
          round.ruleVersion.length > 0 &&
          !routeVersions[route]
        )
          routeVersions[route] = round.ruleVersion;
        else warnings.push("CUKIE_MASTER_ROUND_AMBIGUOUS");
      }
      if (!routeVersions[route] || rounds.length !== 1) {
        warnings.push("CUKIE_MASTER_ROUNDS_UNHEALTHY");
      }
      const observedCandidates = [
        successAt,
        checkpointAt,
        ...cursorTimes,
      ].filter((value): value is Date => value instanceof Date);
      const observedThrough =
        observedCandidates.length > 0
          ? new Date(
              Math.min(...observedCandidates.map((date) => date.getTime()))
            )
          : null;
      const sourceRuleVersions = routeVersions[route]
        ? {
            uki: route === "uki" ? routeVersions.uki! : "independent",
            nft: route === "nft" ? routeVersions.nft! : "independent",
          }
        : null;
      const sortedWarnings = [...warnings].sort(compareCreditText);
      const cukieProjectionHash = stableCreditHash({
        positions: cukiePositions.map((position) => ({
          _id: position._id,
          walletNormalized: position.walletNormalized,
          route: position.route,
          status: position.status,
          allocatedSlots: position.allocatedSlots,
          roundId: position.roundId,
          ruleVersion: position.ruleVersion,
          sourceHash: position.sourceHash,
          revision: position.revision,
          updatedAt: position.updatedAt,
        })),
        slots: healthSlots,
      });
      const evidenceHash = buildCreditSourceHealthEvidenceHash({
        successAt,
        errorAt,
        checkpoint: checkpoint
          ? {
              checkedAt: checkpointAt,
              safeBlockNumber: checkpoint.safeBlockNumber,
              safeBlockHash: checkpoint.safeBlockHash,
            }
          : null,
        cursors: cursors.map((cursor) => ({
          _id: cursor._id,
          contractAlias: cursor.contractAlias,
          eventName: cursor.eventName,
          updatedAt: cursor.updatedAt,
          safeBlock: cursor.safeBlock,
          nextBlock: cursor.nextBlock,
          contractAddress: cursor.contractAddress,
          bootstrapStatus: cursor.bootstrapStatus,
          bootstrapStartBlock: cursor.bootstrapStartBlock,
          bootstrapVerifiedAt: cursor.bootstrapVerifiedAt,
          verifiedChainId: cursor.verifiedChainId,
          contractCodeHash: cursor.contractCodeHash,
          contractDeploymentBlock: cursor.contractDeploymentBlock,
          contractConfigHash: cursor.contractConfigHash,
        })),
        deadLetters,
        pendingEvents,
        incidents,
        sourceRuleVersions,
        rounds: rounds.map((round) => ({
          _id: round._id,
          route: round.route,
          roundId: round.roundId,
          ruleVersion: round.ruleVersion,
          revision: round.revision,
          updatedAt: round.updatedAt,
        })),
        stakingState: stakingState
          ? {
              totalStakedRaw: stakingState.totalStakedRaw,
              lastEventId: stakingState.lastEventId,
              bootstrapSafeBlock: stakingState.bootstrapSafeBlock,
              bootstrapSafeBlockHash: stakingState.bootstrapSafeBlockHash,
              verifiedChainId: stakingState.verifiedChainId,
              contractCodeHash: stakingState.contractCodeHash,
              contractConfigHash: stakingState.contractConfigHash,
            }
          : null,
        stakingPositionsCount: stakingPositions.length,
        vestingPositionsCount: vestingPositions.length,
        vestingLedgerCount: vestingLedger.length,
        cukieProjectionHash,
        warnings: sortedWarnings,
      });
      return {
        healthy: sortedWarnings.length === 0,
        warnings: sortedWarnings,
        observedThrough,
        sourceRuleVersions,
        evidenceHash,
        canonicalSafeBlock:
          Number.isSafeInteger(checkpoint?.safeBlockNumber)
            ? Number(checkpoint?.safeBlockNumber)
            : null,
        canonicalSafeBlockHash:
          typeof checkpoint?.safeBlockHash === "string"
            ? checkpoint.safeBlockHash
            : null,
        checkedAt: now,
      };
    },
    async findCanonicalCutoffBlock(cutoff) {
      const block = await db.collection<{
        _id: string;
        blockNumber?: unknown;
        blockHash?: unknown;
        blockTimestamp?: unknown;
        successorBlockNumber?: unknown;
        successorBlockTimestamp?: unknown;
      }>("competition_credit_cutoff_blocks").findOne(
        { _id: cutoff.toISOString() },
        options
      );
      if (
        !block ||
        !Number.isSafeInteger(block.blockNumber) ||
        Number(block.blockNumber) < 0 ||
        typeof block.blockHash !== "string" ||
        !/^0x[0-9a-f]{64}$/.test(block.blockHash) ||
        !(block.blockTimestamp instanceof Date) ||
        Number.isNaN(block.blockTimestamp.getTime()) ||
        block.blockTimestamp.getTime() >= cutoff.getTime() ||
        !Number.isSafeInteger(block.successorBlockNumber) ||
        Number(block.successorBlockNumber) !== Number(block.blockNumber) + 1 ||
        !(block.successorBlockTimestamp instanceof Date) ||
        block.successorBlockTimestamp.getTime() < cutoff.getTime()
      ) return null;
      return {
        blockNumber: Number(block.blockNumber),
        blockHash: block.blockHash,
        blockTimestamp: block.blockTimestamp,
      };
    },
    async upsertSourceWatermark(watermark) {
      const current = await collections.watermarks.findOne(
        { _id: watermark._id },
        options
      );
      if (
        current &&
        current.observedThrough.getTime() > watermark.observedThrough.getTime()
      ) {
        return current;
      }
      try {
        const result = await collections.watermarks.replaceOne(
          {
            _id: watermark._id,
            $or: [
              { observedThrough: { $exists: false } },
              { observedThrough: { $lte: watermark.observedThrough } },
            ],
          },
          watermark,
          { ...options, upsert: !current }
        );
        if (result.matchedCount === 0 && result.upsertedCount === 0) {
          const winner = await collections.watermarks.findOne(
            { _id: watermark._id },
            options
          );
          if (winner) return winner;
          throw new DomainConflictError(
            "No se pudo persistir el watermark de creditos."
          );
        }
      } catch (error) {
        if (!duplicateKey(error)) throw error;
      }
      const persisted = await collections.watermarks.findOne(
        { _id: watermark._id },
        options
      );
      if (!persisted)
        throw new DomainConflictError(
          "No existe ganador del watermark concurrente."
        );
      return persisted;
    },

    findSlot: (slotId) => collections.slots.findOne({ _id: slotId }, options),
    findPoolConfiguration: (
      walletNormalized,
      slotId,
      eligibilityEpoch,
      cutoff,
      ruleVersion,
      ruleConfigHash
    ) =>
      collections.configs.findOne(
        {
          walletNormalized,
          slotId,
          eligibilityEpoch,
          ruleVersion,
          ruleConfigHash,
          effectiveCutoff: { $lte: cutoff },
        },
        { ...options, sort: { effectiveCutoff: -1, requestedAt: -1, _id: -1 } }
      ),
    findPoolConfigurationByIdempotencyKey: (idempotencyKey) =>
      collections.configs.findOne({ idempotencyKey }, options),
    insertPoolConfiguration: async (config) => {
      await collections.configs.insertOne(config, options);
    },
    findRun: (runId) => collections.runs.findOne({ _id: runId }, options),
    findRunByPeriod: (periodId, route) =>
      collections.runs.findOne({ "period.periodId": periodId, route }, options),
    findLatestRunByRoute: (route) =>
      collections.runs.findOne(
        { route },
        { ...options, sort: { "period.cutoff": -1, _id: -1 } }
      ),
    async insertRunAndItems(run, items, holds) {
      await collections.runs.insertOne(run, options);
      if (items.length > 0)
        await collections.runItems.insertMany(items, options);
      if (holds.length > 0)
        await collections.runHolds.insertMany(holds, options);
    },
    claimRunLease: (runId, workerId, now, leaseExpiresAt) =>
      collections.runs.findOneAndUpdate(
        {
          _id: runId,
          status: { $in: ["snapshotted", "processing"] },
          $or: [
            { leaseExpiresAt: { $exists: false } },
            { leaseExpiresAt: { $lte: now } },
            { leaseOwner: workerId },
          ],
        },
        {
          $set: {
            status: "processing",
            leaseOwner: workerId,
            leaseExpiresAt,
            updatedAt: now,
          },
          $inc: { fenceToken: 1 },
        },
        { ...options, returnDocument: "after" }
      ),
    findPendingRunItems: (runId, limit) =>
      collections.runItems
        .find({ runId, status: "pending" }, options)
        .sort({ _id: 1 })
        .limit(limit)
        .toArray(),
    async applyRunItem(runId, workerId, fenceToken, item, now) {
      const run = await collections.runs.findOne(
        {
          _id: runId,
          status: "processing",
          leaseOwner: workerId,
          fenceToken,
          leaseExpiresAt: { $gt: now },
        },
        options
      );
      if (!run)
        throw new DomainConflictError(
          "Lease o fence del run de creditos no vigente."
        );
      const persisted = await collections.runItems.findOne(
        { _id: item._id, runId },
        options
      );
      if (!persisted)
        throw new DomainNotFoundError(`No existe el item ${item.itemId}.`);
      if (persisted.payloadHash !== item.payloadHash) {
        throw new DomainConflictError(
          `El item ${item.itemId} no coincide con el snapshot inmutable.`
        );
      }
      if (persisted.status === "applied") return false;

      const ownLotId = stableCreditHash({
        kind: "own-lot",
        itemId: item.itemId,
      });
      const ownLot: CreditLot = {
        _id: ownLotId,
        lotId: ownLotId,
        bucket: "own",
        route: run.route,
        walletNormalized: item.walletNormalized,
        periodId: item.periodId,
        runId,
        runItemId: item.itemId,
        sourceSlotId: item.slotId,
        eligibilityEpoch: item.eligibilityEpoch,
        totalCredits: item.grantCredits,
        poolDepositedCredits: item.poolCredits,
        availableCredits: item.ownCredits,
        reservedCredits: 0,
        spentCredits: 0,
        expiredCredits: 0,
        expiresAt: run.settlementPeriod.nextCutoff,
        revision: 0,
        blocked: false,
        createdAt: now,
        updatedAt: now,
      };
      await collections.ownLots.insertOne(ownLot, options);
      const entries: CompetitionCreditLedgerEntry[] = [
        ledgerEntry({
          idempotencyKey: `daily-credit:${item.itemId}`,
          payloadHash: item.payloadHash,
          operation: "grant",
          bucket: "own",
          amountCredits: item.baseGrantCredits,
          walletNormalized: item.walletNormalized,
          periodId: item.periodId,
          runId,
          runItemId: item.itemId,
          lotId: ownLotId,
          reservationId: null,
          sessionId: null,
          fromState: null,
          toState: "available",
          effectiveBlockNumber: run.cutoffBlock.blockNumber,
          effectiveBlockHash: run.cutoffBlock.blockHash,
          effectiveBlockTimestamp: run.cutoffBlock.blockTimestamp,
          createdAt: now,
        }),
      ];
      if (item.compensationCredits > 0) {
        entries.push(
          ledgerEntry({
            idempotencyKey: `late-compensation:${item.earnedPeriodId}:${run.route}:${item.slotId}:${item.eligibilityEpoch}`,
            payloadHash: item.payloadHash,
            operation: "late_compensation",
            bucket: "own",
            amountCredits: item.compensationCredits,
            walletNormalized: item.walletNormalized,
            periodId: item.periodId,
            runId,
            runItemId: item.itemId,
            lotId: ownLotId,
            reservationId: null,
            sessionId: null,
            fromState: null,
            toState: "available",
            effectiveBlockNumber: run.cutoffBlock.blockNumber,
            effectiveBlockHash: run.cutoffBlock.blockHash,
            effectiveBlockTimestamp: run.cutoffBlock.blockTimestamp,
            createdAt: now,
          })
        );
      }

      if (item.poolCredits > 0) {
        const poolLotId = stableCreditHash({
          kind: "pool-lot",
          itemId: item.itemId,
        });
        const poolLot: CreditLot = {
          _id: poolLotId,
          lotId: poolLotId,
          bucket: "pool",
          route: run.route,
          walletNormalized: null,
          periodId: item.periodId,
          runId,
          runItemId: item.itemId,
          sourceSlotId: item.slotId,
          eligibilityEpoch: item.eligibilityEpoch,
          totalCredits: item.poolCredits,
          poolDepositedCredits: 0,
          availableCredits: item.poolCredits,
          reservedCredits: 0,
          spentCredits: 0,
          expiredCredits: 0,
          expiresAt: run.settlementPeriod.nextCutoff,
          revision: 0,
          blocked: false,
          createdAt: now,
          updatedAt: now,
        };
        const positionId = stableCreditHash({
          kind: "pool-position",
          itemId: item.itemId,
        });
        const position: CreditPoolPosition = {
          _id: positionId,
          positionId,
          route: run.route,
          walletNormalized: item.walletNormalized,
          periodId: item.periodId,
          runId,
          runItemId: item.itemId,
          sourceSlotId: item.slotId,
          eligibilityEpoch: item.eligibilityEpoch,
          credits: item.poolCredits,
          status: "pending_run",
          createdAt: now,
          updatedAt: now,
        };
        await collections.poolLots.insertOne(poolLot, options);
        await collections.poolPositions.insertOne(position, options);
        entries.push(
          ledgerEntry({
            idempotencyKey: `pool-deposit:own:${item.itemId}`,
            payloadHash: item.payloadHash,
            operation: "pool_deposit",
            bucket: "own",
            amountCredits: item.poolCredits,
            walletNormalized: item.walletNormalized,
            periodId: item.periodId,
            runId,
            runItemId: item.itemId,
            lotId: ownLotId,
            reservationId: null,
            sessionId: null,
            fromState: "available",
            toState: null,
            effectiveBlockNumber: run.cutoffBlock.blockNumber,
            effectiveBlockHash: run.cutoffBlock.blockHash,
            effectiveBlockTimestamp: run.cutoffBlock.blockTimestamp,
            createdAt: now,
          }),
          ledgerEntry({
            idempotencyKey: `pool-deposit:pool:${item.itemId}`,
            payloadHash: item.payloadHash,
            operation: "pool_deposit",
            bucket: "pool",
            amountCredits: item.poolCredits,
            walletNormalized: item.walletNormalized,
            periodId: item.periodId,
            runId,
            runItemId: item.itemId,
            lotId: poolLotId,
            reservationId: null,
            sessionId: null,
            fromState: null,
            toState: "available",
            effectiveBlockNumber: run.cutoffBlock.blockNumber,
            effectiveBlockHash: run.cutoffBlock.blockHash,
            effectiveBlockTimestamp: run.cutoffBlock.blockTimestamp,
            createdAt: now,
          })
        );
        await incrementPoolPeriod(
          item.periodId,
          run.route,
          {
            contributedCredits: item.poolCredits,
            availableCredits: item.poolCredits,
          },
          now
        );
      }
      await collections.ledger.insertMany(entries, options);
      await incrementAccount(
        item.walletNormalized,
        item.periodId,
        run.route,
        {
          grantedCredits: item.grantCredits,
          poolDepositedCredits: item.poolCredits,
          availableCredits: item.ownCredits,
        },
        now
      );
      const applied = await collections.runItems.updateOne(
        {
          _id: item._id,
          runId,
          status: "pending",
          payloadHash: item.payloadHash,
        },
        { $set: { status: "applied", appliedAt: now } },
        options
      );
      if (applied.matchedCount !== 1) {
        throw new DomainConflictError(
          `El item ${item.itemId} perdio la carrera de aplicacion.`
        );
      }
      return true;
    },
    countPendingRunItems: (runId) =>
      collections.runItems.countDocuments(
        { runId, status: "pending" },
        options
      ),
    async openRun(runId, workerId, fenceToken, now) {
      const pending = await collections.runItems.countDocuments(
        { runId, status: "pending" },
        options
      );
      if (pending > 0)
        throw new DomainConflictError(
          `El run ${runId} aun tiene ${pending} items pendientes.`
        );
      const held = await collections.runHolds.countDocuments(
        { runId, status: "held" },
        options
      );
      await collections.poolPositions.updateMany(
        { runId, status: "pending_run" },
        { $set: { status: "open", updatedAt: now } },
        options
      );
      return collections.runs.findOneAndUpdate(
        {
          _id: runId,
          status: "processing",
          leaseOwner: workerId,
          fenceToken,
          leaseExpiresAt: { $gt: now },
        },
        {
          $set: {
            status: held > 0 ? "open_with_holds" : "open",
            openedAt: now,
            updatedAt: now,
          },
          $unset: { leaseOwner: "", leaseExpiresAt: "" },
        },
        { ...options, returnDocument: "after" }
      );
    },
    findReservationByIdempotencyKey: (idempotencyKey) =>
      collections.reservations.findOne({ idempotencyKey }, options),
    findReservation: (reservationId) =>
      collections.reservations.findOne({ _id: reservationId }, options),
    findReservationBySessionId: (sessionId) =>
      collections.reservations.findOne({ sessionId }, options),
    listExpiredActiveReservations: (now, limit) =>
      collections.reservations
        .find(
          {
            status: "active",
            expiresAt: { $lte: now },
          },
          options
        )
        .sort({ expiresAt: 1, _id: 1 })
        .limit(limit)
        .toArray(),
    findGameSessionLifecycle: (sessionId) =>
      db.collection<{ _id: string; status: string }>("game_economy_sessions")
        .findOne({ _id: sessionId }, { ...options, projection: { _id: 1, status: 1 } }),
    findLedgerByIdempotencyKey: (idempotencyKey) =>
      collections.ledger.findOne({ idempotencyKey }, options),
    async hasOpenCreditBlock(walletNormalized) {
      const [incidents, accountBlocks] = await Promise.all([
        collections.incidents.countDocuments(
          {
            status: "open",
            $or: [{ walletNormalized: null }, { walletNormalized }],
          },
          options
        ),
        collections.accounts.countDocuments(
          { walletNormalized, blocked: true },
          options
        ),
      ]);
      return incidents + accountBlocks > 0;
    },
    async listAvailableOwnLots(walletNormalized, periodId, now, limit, after) {
      const runIds = await openRunIdsAt(periodId, now);
      if (runIds.length === 0) return [];
      return collections.ownLots
        .find(
          {
            walletNormalized,
            periodId,
            runId: { $in: runIds },
            blocked: false,
            availableCredits: { $gt: 0 },
            expiresAt: { $gt: now },
            ...creditLotFifoAfter(after),
          },
          options
        )
        .sort({ expiresAt: 1, createdAt: 1, _id: 1 })
        .limit(limit)
        .toArray();
    },
    async listAvailablePoolLots(periodId, now, limit, after) {
      const runIds = await openRunIdsAt(periodId, now);
      if (runIds.length === 0) return [];
      return collections.poolLots
        .find(
          {
            periodId,
            runId: { $in: runIds },
            blocked: false,
            availableCredits: { $gt: 0 },
            expiresAt: { $gt: now },
            ...creditLotFifoAfter(after),
          },
          options
        )
        .sort({ expiresAt: 1, createdAt: 1, _id: 1 })
        .limit(limit)
        .toArray();
    },
    async reserveLots({ reservation, now }) {
      const lotCollection =
        reservation.bucket === "own"
          ? collections.ownLots
          : collections.poolLots;
      const openRunIds = await openRunIdsAt(reservation.periodId, now);
      if (openRunIds.length === 0)
        throw new DomainConflictError("No hay runs de creditos abiertos.");
      const lotUpdates = await lotCollection.bulkWrite(
        reservation.allocations.map((allocation) => ({
          updateOne: {
            filter: {
              _id: allocation.lotId,
              revision: allocation.lotRevision,
              periodId: reservation.periodId,
              runId: { $in: openRunIds },
              blocked: false,
              expiresAt: { $gt: now },
              availableCredits: { $gte: allocation.amountCredits },
            },
            update: {
              $inc: {
                availableCredits: -allocation.amountCredits,
                reservedCredits: allocation.amountCredits,
                revision: 1,
              },
              $set: { updatedAt: now },
            },
          },
        })),
        { ...options, ordered: true }
      );
      if (
        lotUpdates.matchedCount !== reservation.allocations.length ||
        lotUpdates.modifiedCount !== reservation.allocations.length
      ) {
        throw new DomainConflictError(
          "Los lotes cambiaron durante la reserva; reintento requerido."
        );
      }
      await collections.reservations.insertOne(reservation, options);
      const lotsById = new Map(
        (
          await lotCollection
            .find(
              {
                _id: { $in: reservation.allocations.map((item) => item.lotId) },
                periodId: reservation.periodId,
              },
              options
            )
            .toArray()
        ).map((lot) => [lot.lotId, lot])
      );
      const entries: CompetitionCreditLedgerEntry[] = [];
      let reservedTotal = 0;
      const reservedByRoute = new Map<CreditRoute, number>();
      for (const [index, allocation] of reservation.allocations.entries()) {
        const lot = lotsById.get(allocation.lotId);
        if (!lot)
          throw new DomainNotFoundError(
            `No existe el lote ${allocation.lotId}.`
          );
        entries.push(
          ledgerEntry({
            idempotencyKey: `${reservation.idempotencyKey}:allocation:${index}`,
            payloadHash: reservation.payloadHash,
            operation: "reserve",
            bucket: reservation.bucket,
            amountCredits: allocation.amountCredits,
            walletNormalized: reservation.walletNormalized,
            periodId: lot.periodId,
            runId: lot.runId,
            runItemId: lot.runItemId,
            lotId: lot.lotId,
            reservationId: reservation.reservationId,
            sessionId: reservation.sessionId,
            fromState: "available",
            toState: "reserved",
            createdAt: now,
          })
        );
        reservedTotal += allocation.amountCredits;
        reservedByRoute.set(
          lot.route,
          (reservedByRoute.get(lot.route) ?? 0) + allocation.amountCredits
        );
      }
      if (reservedTotal !== reservation.amountCredits) {
        throw new DomainConflictError(
          "La reserva no conserva el total asignado."
        );
      }
      await collections.ledger.insertMany(entries, options);
      for (const [route, routeTotal] of reservedByRoute) {
        const materializationIncrements = {
          availableCredits: -routeTotal,
          reservedCredits: routeTotal,
        };
        if (reservation.bucket === "own") {
          await incrementAccount(
            reservation.walletNormalized,
            reservation.periodId,
            route,
            materializationIncrements,
            now
          );
        } else {
          await incrementPoolPeriod(
            reservation.periodId,
            route,
            materializationIncrements,
            now
          );
        }
      }
    },
    async finishReservation(input) {
      const terminalStatus =
        input.operation === "consume"
          ? "consumed"
          : input.reservation.expiresAt.getTime() <= input.now.getTime()
          ? "expired"
          : "released";
      const result = await collections.reservations.findOneAndUpdate(
        {
          _id: input.reservation._id,
          status: "active",
          revision: input.reservation.revision,
          ...(input.operation === "consume" && !(
            input.committedAt
            && input.committedAt.getTime() <= input.reservation.expiresAt.getTime()
          )
            ? { expiresAt: { $gt: input.now } }
            : {}),
        },
        {
          $set: {
            status: terminalStatus,
            terminalAt: input.now,
            ...(input.committedAt ? { terminalCommittedAt: input.committedAt } : {}),
            terminalIdempotencyKey: input.idempotencyKey,
            terminalPayloadHash: input.payloadHash,
            updatedAt: input.now,
          },
          $inc: { revision: 1 },
        },
        { ...options, returnDocument: "after" }
      );
      if (!result) return null;
      const lotCollection =
        result.bucket === "own" ? collections.ownLots : collections.poolLots;
      const lotsById = new Map(
        (
          await lotCollection
            .find(
              {
                _id: { $in: result.allocations.map((item) => item.lotId) },
                periodId: result.periodId,
              },
              options
            )
            .toArray()
        ).map((lot) => [lot.lotId, lot])
      );
      const lotOperations = [];
      const entries: CompetitionCreditLedgerEntry[] = [];
      const materializationByRoute = new Map<CreditRoute, {
        availableCredits: number;
        reservedCredits: number;
        spentCredits: number;
        expiredCredits: number;
      }>();
      for (const [index, allocation] of result.allocations.entries()) {
        const lot = lotsById.get(allocation.lotId);
        if (!lot)
          throw new DomainNotFoundError(
            `No existe el lote ${allocation.lotId}.`
          );
        const expires =
          input.operation === "release" &&
          lot.expiresAt.getTime() <= input.now.getTime();
        const increments =
          input.operation === "consume"
            ? {
                reservedCredits: -allocation.amountCredits,
                spentCredits: allocation.amountCredits,
              }
            : expires
            ? {
                reservedCredits: -allocation.amountCredits,
                expiredCredits: allocation.amountCredits,
              }
            : {
                reservedCredits: -allocation.amountCredits,
                availableCredits: allocation.amountCredits,
              };
        lotOperations.push({
          updateOne: {
            filter: {
              _id: lot._id,
              periodId: result.periodId,
              reservedCredits: { $gte: allocation.amountCredits },
              blocked: false,
            },
            update: {
              $inc: { ...increments, revision: 1 },
              $set: { updatedAt: input.now },
            },
          },
        });
        const operation =
          input.operation === "consume"
            ? "spend"
            : expires
            ? "expire"
            : "release";
        entries.push(
          ledgerEntry({
            idempotencyKey: `${input.idempotencyKey}:allocation:${index}`,
            payloadHash: input.payloadHash,
            operation,
            bucket: result.bucket,
            amountCredits: allocation.amountCredits,
            walletNormalized: result.walletNormalized,
            periodId: lot.periodId,
            runId: lot.runId,
            runItemId: lot.runItemId,
            lotId: lot.lotId,
            reservationId: result.reservationId,
            sessionId: result.sessionId,
            fromState: "reserved",
            toState:
              input.operation === "consume"
                ? "spent"
                : expires
                ? "expired"
                : "available",
            createdAt: input.now,
          })
        );
        const materializationIncrements = materializationByRoute.get(lot.route) ?? {
          availableCredits: 0,
          reservedCredits: 0,
          spentCredits: 0,
          expiredCredits: 0,
        };
        for (const [field, amount] of Object.entries(increments)) {
          materializationIncrements[
            field as keyof typeof materializationIncrements
          ] += amount;
        }
        materializationByRoute.set(lot.route, materializationIncrements);
      }
      const lotUpdates = await lotCollection.bulkWrite(lotOperations, {
        ...options,
        ordered: true,
      });
      if (
        lotUpdates.matchedCount !== result.allocations.length ||
        lotUpdates.modifiedCount !== result.allocations.length
      ) {
        throw new DomainConflictError(
          "Los lotes no conservan todas las reservas esperadas."
        );
      }
      await collections.ledger.insertMany(entries, options);
      for (const [route, materializationIncrements] of materializationByRoute) {
        if (result.bucket === "own") {
          await incrementAccount(
            result.walletNormalized,
            result.periodId,
            route,
            materializationIncrements,
            input.now
          );
        } else {
          await incrementPoolPeriod(
            result.periodId,
            route,
            materializationIncrements,
            input.now
          );
        }
      }
      return result;
    },
    async listExpiredAvailableLots(now, limit) {
      const query = {
        blocked: false,
        availableCredits: { $gt: 0 },
        expiresAt: { $lte: now },
      } as const;
      const [own, pool] = await Promise.all([
        collections.ownLots
          .find(query, options)
          .sort({ expiresAt: 1, _id: 1 })
          .limit(limit)
          .toArray(),
        collections.poolLots
          .find(query, options)
          .sort({ expiresAt: 1, _id: 1 })
          .limit(limit)
          .toArray(),
      ]);
      return [...own, ...pool]
        .sort(
          (left, right) =>
            left.expiresAt.getTime() - right.expiresAt.getTime() ||
            compareCreditText(left._id, right._id)
        )
        .slice(0, limit);
    },
    async expireAvailableLot(lot, now) {
      const collection =
        lot.bucket === "own" ? collections.ownLots : collections.poolLots;
      const persisted = await collection.findOne({ _id: lot._id }, options);
      if (!persisted)
        throw new DomainNotFoundError(`No existe el lote ${lot.lotId}.`);
      const idempotencyKey = `credit-lot-expire:${
        lot.lotId
      }:${lot.expiresAt.toISOString()}`;
      const payloadHash = stableCreditHash({
        operation: "expire",
        lotId: lot.lotId,
        expiresAt: lot.expiresAt,
      });
      const replay = await collections.ledger.findOne(
        { idempotencyKey },
        options
      );
      if (replay) {
        if (replay.payloadHash !== payloadHash) {
          throw new DomainConflictError(
            `La expiracion de ${lot.lotId} tiene otro payload.`
          );
        }
        return false;
      }
      if (
        persisted.revision !== lot.revision ||
        persisted.availableCredits !== lot.availableCredits ||
        persisted.availableCredits <= 0
      )
        return false;
      const updated = await collection.updateOne(
        {
          _id: lot._id,
          revision: lot.revision,
          blocked: false,
          availableCredits: lot.availableCredits,
          expiresAt: { $lte: now },
        },
        {
          $inc: {
            availableCredits: -lot.availableCredits,
            expiredCredits: lot.availableCredits,
            revision: 1,
          },
          $set: { updatedAt: now },
        },
        options
      );
      if (updated.matchedCount !== 1) return false;
      await collections.ledger.insertOne(
        ledgerEntry({
          idempotencyKey,
          payloadHash,
          operation: "expire",
          bucket: lot.bucket,
          amountCredits: lot.availableCredits,
          walletNormalized: lot.walletNormalized,
          periodId: lot.periodId,
          runId: lot.runId,
          runItemId: lot.runItemId,
          lotId: lot.lotId,
          reservationId: null,
          sessionId: null,
          fromState: "available",
          toState: "expired",
          createdAt: now,
        }),
        options
      );
      if (lot.bucket === "own") {
        if (!lot.walletNormalized)
          throw new DomainConflictError("Lote own sin wallet.");
        await incrementAccount(
          lot.walletNormalized,
          lot.periodId,
          lot.route,
          {
            availableCredits: -lot.availableCredits,
            expiredCredits: lot.availableCredits,
          },
          now
        );
      } else {
        await incrementPoolPeriod(
          lot.periodId,
          lot.route,
          {
            availableCredits: -lot.availableCredits,
            expiredCredits: lot.availableCredits,
          },
          now
        );
      }
      return true;
    },
    async readReconciliationSnapshot(runId) {
      const run = await collections.runs.findOne({ _id: runId }, options);
      if (!run) return null;
      const periodId = safeCompetitionCreditSettlementPeriodScopeId(run, runId);
      const periodFilter = { periodId, route: run.route };
      const [
        itemCount,
        holdCount,
        ownLotCount,
        poolLotCount,
        accountLotCount,
        poolPeriodLotCount,
        poolPositionCount,
        reservationCount,
        ledgerCount,
        accountCount,
      ] = await Promise.all([
        collections.runItems.countDocuments({ runId }, options),
        collections.runHolds.countDocuments({ runId }, options),
        collections.ownLots.countDocuments({ runId }, options),
        collections.poolLots.countDocuments({ runId }, options),
        collections.ownLots.countDocuments(periodFilter, options),
        collections.poolLots.countDocuments(periodFilter, options),
        collections.poolPositions.countDocuments({ runId }, options),
        collections.reservations.countDocuments(
          {
            periodId,
            $or: [
              { "allocations.runId": runId },
              { allocations: { $not: { $type: "array" } } },
            ],
          },
          options
        ),
        collections.ledger.countDocuments({ runId }, options),
        collections.accounts.countDocuments(periodFilter, options),
      ]);
      const collectionCounts = {
        items: itemCount,
        holds: holdCount,
        ownLots: ownLotCount,
        poolLots: poolLotCount,
        accountLots: accountLotCount,
        poolPeriodLots: poolPeriodLotCount,
        poolPositions: poolPositionCount,
        reservations: reservationCount,
        ledger: ledgerCount,
        accounts: accountCount,
      };
      const [
        items,
        holds,
        ownLots,
        poolLots,
        accountLots,
        poolPeriodLots,
        poolPositions,
        reservations,
        ledger,
        accounts,
        poolPeriod,
      ] = await Promise.all([
        collections.runItems
          .find({ runId }, options)
          .sort({ _id: 1 })
          .limit(RECONCILIATION_DOCUMENT_LIMITS.items)
          .toArray(),
        collections.runHolds
          .find({ runId }, options)
          .sort({ _id: 1 })
          .limit(RECONCILIATION_DOCUMENT_LIMITS.items)
          .toArray(),
        collections.ownLots
          .find({ runId }, options)
          .sort({ _id: 1 })
          .limit(RECONCILIATION_DOCUMENT_LIMITS.ownLots)
          .toArray(),
        collections.poolLots
          .find({ runId }, options)
          .sort({ _id: 1 })
          .limit(RECONCILIATION_DOCUMENT_LIMITS.poolLots)
          .toArray(),
        collections.ownLots
          .find(periodFilter, options)
          .sort({ _id: 1 })
          .limit(RECONCILIATION_DOCUMENT_LIMITS.ownLots)
          .toArray(),
        collections.poolLots
          .find(periodFilter, options)
          .sort({ _id: 1 })
          .limit(RECONCILIATION_DOCUMENT_LIMITS.poolLots)
          .toArray(),
        collections.poolPositions
          .find({ runId }, options)
          .sort({ _id: 1 })
          .limit(RECONCILIATION_DOCUMENT_LIMITS.poolPositions)
          .toArray(),
        collections.reservations
          .find({
            periodId,
            $or: [
              { "allocations.runId": runId },
              { allocations: { $not: { $type: "array" } } },
            ],
          }, options)
          .sort({ _id: 1 })
          .limit(RECONCILIATION_DOCUMENT_LIMITS.reservations)
          .toArray(),
        collections.ledger
          .find({ runId }, options)
          .sort({ _id: 1 })
          .limit(RECONCILIATION_DOCUMENT_LIMITS.ledger)
          .toArray(),
        collections.accounts
          .find(periodFilter, options)
          .sort({ _id: 1 })
          .limit(RECONCILIATION_DOCUMENT_LIMITS.accounts)
          .toArray(),
        collections.poolPeriods.findOne(
          { _id: poolPeriodId(periodId, run.route) },
          options
        ),
      ]);
      return {
        run,
        items,
        holds,
        ownLots,
        poolLots,
        accountLots,
        poolPeriodLots,
        poolPositions,
        reservations,
        ledger,
        accounts,
        poolPeriod,
        collectionCounts,
      };
    },
    async blockRunAndOpenIncident(incident) {
      await collections.incidents.updateOne(
        { _id: incident._id },
        { $setOnInsert: incident },
        { ...options, upsert: true }
      );
      await collections.runs.updateOne(
        { _id: incident.runId, status: { $ne: "blocked" } },
        {
          $set: {
            status: "blocked",
            blockedReason: incident.reasonCodes.join(","),
            updatedAt: incident.detectedAt,
          },
        },
        options
      );
      await collections.ownLots.updateMany(
        { runId: incident.runId },
        { $set: { blocked: true, updatedAt: incident.detectedAt } },
        options
      );
      await collections.poolLots.updateMany(
        { runId: incident.runId },
        { $set: { blocked: true, updatedAt: incident.detectedAt } },
        options
      );
      await collections.poolPositions.updateMany(
        { runId: incident.runId },
        { $set: { status: "blocked", updatedAt: incident.detectedAt } },
        options
      );
      await collections.accounts.updateMany(
        { periodId: incident.periodId },
        { $set: { blocked: true, updatedAt: incident.detectedAt } },
        options
      );
      await collections.poolPeriods.updateOne(
          { _id: poolPeriodId(incident.periodId, incident.route) },
        { $set: { blocked: true, updatedAt: incident.detectedAt } },
        options
      );
    },
  };
}

export const mongoCompetitionCreditTransactionRunner: CompetitionCreditTransactionRunner =
  async (work) => {
    const { withEconomyTransaction } = await import("@/lib/indexer-db/mongodb");
    return withEconomyTransaction(async (db, session) => {
      await assertCompetitionCreditSchema(db, session);
      return work(createMongoCompetitionCreditRepository(db, session));
    });
  };

export function mapCreditPersistenceError(error: unknown) {
  if (duplicateKey(error)) {
    return new DomainConflictError(
      "Conflicto de idempotencia o unicidad en creditos.",
      {
        persistenceFailure: "DUPLICATE_KEY",
        mongoCode: 11000,
      }
    );
  }
  return error;
}

export const CREDIT_EXPECTED_SCHEMA_VERSION = CREDIT_SCHEMA_VERSION;
