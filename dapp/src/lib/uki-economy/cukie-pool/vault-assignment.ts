import 'server-only';

import type { ClientSession, Db, OptionalUnlessRequiredId } from 'mongodb';

import { withEconomyTransaction } from '@/lib/indexer-db/mongodb';

import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
  SchemaNotReadyError,
  StaleFenceError,
} from '../errors';
import type { GameEconomySession } from '../game-economy/types';
import {
  clonePoolAssignment,
  deterministicSeikuAssetId,
  gamesQuota,
  poolPriority,
  requiredPoolText,
  stableCukiePoolHash,
  validPoolDate,
  validPoolIdempotencyKey,
  validPoolLimit,
  validPoolRevision,
} from './rules';
import type {
  AssignCukiePoolSessionInput,
  CukiePoolAssignment,
  CukiePoolGameSessionLifecycle,
  ExpireCukiePoolAssignmentsInput,
  ExpireCukiePoolAssignmentsResult,
  ReleaseCukiePoolAssignmentInput,
} from './types';
import {
  assertCukiePoolVaultIndexerReady,
  CUKIE_POOL_VAULT_ASSET_LEASES,
  CUKIE_POOL_VAULT_PERIOD_USAGE,
  loadCukiePoolVaultCandidates,
  requireCukiePoolVaultConfig,
  type CukiePoolVaultCandidate,
  type CukiePoolVaultPeriod,
} from './vault-source';

const SYSTEM_PREFIX = 'system:cukie-pool:';
const ASSIGNMENT_RETRIES = 20;

export type CukiePoolVaultAssetLease = {
  _id: string;
  positionId: string;
  assetId: string;
  depositEpoch: string;
  assignmentId: string;
  sessionId: string;
  expiresAt: Date;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CukiePoolVaultPeriodUsage = {
  _id: string;
  positionId: string;
  assetId: string;
  depositEpoch: string;
  periodId: string;
  gamesQuota: number;
  consumedGames: number;
  consumedAssignmentIds: string[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export interface CukiePoolVaultAssignmentRepository {
  currentPeriod(now: Date): Promise<CukiePoolVaultPeriod>;
  listCandidates(now: Date): Promise<CukiePoolVaultCandidate[]>;
  findAssignmentBySessionId(sessionId: string): Promise<CukiePoolAssignment | null>;
  findAssignmentByIdempotencyKey(idempotencyKey: string): Promise<CukiePoolAssignment | null>;
  findActiveAssignmentByAssetId(assetId: string): Promise<CukiePoolAssignment | null>;
  insertAssignment(assignment: CukiePoolAssignment): Promise<void>;
  compareAndSetAssignment(
    current: CukiePoolAssignment,
    replacement: CukiePoolAssignment,
  ): Promise<CukiePoolAssignment | null>;
  findLease(positionId: string): Promise<CukiePoolVaultAssetLease | null>;
  insertLease(lease: CukiePoolVaultAssetLease): Promise<void>;
  deleteLease(lease: CukiePoolVaultAssetLease): Promise<boolean>;
  findUsage(usageId: string): Promise<CukiePoolVaultPeriodUsage | null>;
  insertUsage(usage: CukiePoolVaultPeriodUsage): Promise<void>;
  compareAndSetUsage(
    current: CukiePoolVaultPeriodUsage,
    replacement: CukiePoolVaultPeriodUsage,
  ): Promise<CukiePoolVaultPeriodUsage | null>;
  listExpiredAssignments(now: Date, limit: number): Promise<CukiePoolAssignment[]>;
  findGameSessionLifecycle(sessionId: string): Promise<CukiePoolGameSessionLifecycle | null>;
}

export type CukiePoolVaultAssignmentRunner = <T>(
  work: (repository: CukiePoolVaultAssignmentRepository) => Promise<T>,
) => Promise<T>;

type InternalReleaseInput = ReleaseCukiePoolAssignmentInput & {
  operation?: 'release' | 'expire';
  allowSystemIdempotency?: boolean;
  requireOrphanGameSession?: boolean;
};

function duplicateKey(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

function assignmentId(sessionId: string) {
  return stableCukiePoolHash({ kind: 'cukie-pool-assignment', sessionId });
}

function reservationHash(input: { sessionId: string; expiresAt: Date }) {
  return stableCukiePoolHash({
    operation: 'assign',
    sessionId: input.sessionId,
    expiresAt: input.expiresAt,
  });
}

function usageId(candidate: Pick<CukiePoolVaultCandidate, 'positionId'>, periodId: string) {
  return `${candidate.positionId}:period:${periodId}`;
}

function orderedCandidates(candidates: CukiePoolVaultCandidate[]) {
  for (const candidate of candidates) {
    if (
      candidate.poolPriority !== poolPriority(candidate.generation)
      || candidate.gamesQuota !== gamesQuota(candidate.generation, candidate.rarity)
    ) throw new SchemaNotReadyError(
      `Reglas de prioridad/cuota incoherentes para ${candidate.positionId}.`,
    );
  }
  return [...candidates].sort((left, right) => (
    poolPriority(left.generation) - poolPriority(right.generation)
    || left.activationAt.getTime() - right.activationAt.getTime()
    || left.depositedAt.getTime() - right.depositedAt.getTime()
    || left.positionId.localeCompare(right.positionId)
  ));
}

function validateUsage(
  usage: CukiePoolVaultPeriodUsage,
  expected: {
    positionId: string;
    assetId: string;
    depositEpoch: string;
    periodId: string;
    gamesQuota: number;
  },
) {
  if (
    usage._id !== `${expected.positionId}:period:${expected.periodId}`
    || usage.positionId !== expected.positionId
    || usage.assetId !== expected.assetId
    || usage.depositEpoch !== expected.depositEpoch
    || usage.periodId !== expected.periodId
    || usage.gamesQuota !== expected.gamesQuota
    || !Number.isSafeInteger(usage.consumedGames)
    || usage.consumedGames < 0
    || usage.consumedGames > usage.gamesQuota
    || !Array.isArray(usage.consumedAssignmentIds)
    || new Set(usage.consumedAssignmentIds).size !== usage.consumedAssignmentIds.length
    || usage.consumedAssignmentIds.length !== usage.consumedGames
    || !Number.isSafeInteger(usage.revision)
    || usage.revision < 0
  ) throw new SchemaNotReadyError(`Uso de cuota custodial incoherente para ${usage._id}.`);
  return usage;
}

function validateLease(lease: CukiePoolVaultAssetLease) {
  if (
    lease._id !== lease.positionId
    || !lease.positionId
    || !lease.assetId
    || !/^[1-9][0-9]*$/.test(lease.depositEpoch)
    || !lease.assignmentId
    || !lease.sessionId
    || !(lease.expiresAt instanceof Date)
    || Number.isNaN(lease.expiresAt.getTime())
    || !Number.isSafeInteger(lease.revision)
    || lease.revision < 0
  ) throw new SchemaNotReadyError(`Lease custodial incoherente para ${lease._id}.`);
  return lease;
}

function buildVaultAssignment(input: {
  sessionId: string;
  expiresAt: Date;
  idempotencyKey: string;
  reservationRequestHash: string;
  now: Date;
  period: CukiePoolVaultPeriod;
  candidate?: CukiePoolVaultCandidate;
}): CukiePoolAssignment {
  const id = assignmentId(input.sessionId);
  const selected = input.candidate;
  const kind = selected ? 'pool_asset' as const : 'seiku' as const;
  const assetId = selected?.assetId ?? deterministicSeikuAssetId(input.sessionId);
  const requestHash = stableCukiePoolHash({
    operation: 'assign_vault',
    sessionId: input.sessionId,
    expiresAt: input.expiresAt,
    assignmentKind: kind,
    assetId,
    positionId: selected?.positionId ?? null,
    depositEpoch: selected?.depositEpoch ?? null,
    periodId: input.period.periodId,
    calendarVersion: input.period.calendarVersion,
  });
  return {
    _id: id,
    assignmentId: id,
    sessionId: input.sessionId,
    kind,
    status: 'active',
    assetId,
    tokenId: selected?.tokenId ?? null,
    positionId: selected?.positionId ?? null,
    ownerNormalized: selected?.ownerNormalized ?? null,
    generation: selected?.generation ?? 'original',
    rarity: selected?.rarity ?? 'common',
    ownerRewardEligible: selected?.ownerRewardEligible ?? false,
    custodyMode: 'custodial',
    collectionAddressNormalized: selected?.collectionAddressNormalized ?? null,
    depositEpoch: selected?.depositEpoch ?? null,
    periodId: input.period.periodId,
    periodStartsAt: input.period.startsAt,
    periodEndsAt: input.period.endsAt,
    calendarVersion: input.period.calendarVersion,
    gamesQuota: selected?.gamesQuota ?? null,
    reservationRequestHash: input.reservationRequestHash,
    lockId: null,
    lockFencingToken: null,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    assignedAt: input.now,
    expiresAt: input.expiresAt,
    revision: 0,
    updatedAt: input.now,
  };
}

function assertReservationRetry(
  assignment: CukiePoolAssignment,
  input: { idempotencyKey: string; requestHash: string; sessionId: string },
) {
  const boundRequest = assignment.reservationRequestHash ?? assignment.requestHash;
  if (
    assignment.sessionId !== input.sessionId
    || assignment.idempotencyKey !== input.idempotencyKey
    || boundRequest !== input.requestHash
  ) throw new DomainConflictError('La asignacion existente corresponde a otro payload.');
  return clonePoolAssignment(assignment);
}

function createAssignment(runner: CukiePoolVaultAssignmentRunner) {
  return async (input: AssignCukiePoolSessionInput) => {
    const sessionId = requiredPoolText(input.sessionId, 'sessionId');
    const now = validPoolDate(input.now, 'now', new Date());
    const expiresAt = validPoolDate(input.expiresAt, 'expiresAt');
    if (expiresAt <= now) throw new DomainValidationError('expiresAt debe estar en el futuro.');
    const idempotencyKey = validPoolIdempotencyKey(input.idempotencyKey);
    const requestHash = reservationHash({ sessionId, expiresAt });

    for (let attempt = 0; attempt < ASSIGNMENT_RETRIES; attempt += 1) {
      try {
        return await runner(async (repository) => {
          const byKey = await repository.findAssignmentByIdempotencyKey(idempotencyKey);
          if (byKey) return assertReservationRetry(byKey, { idempotencyKey, requestHash, sessionId });
          const bySession = await repository.findAssignmentBySessionId(sessionId);
          if (bySession) return assertReservationRetry(bySession, { idempotencyKey, requestHash, sessionId });

          const period = await repository.currentPeriod(now);
          const candidates = orderedCandidates(await repository.listCandidates(now));
          for (const candidate of candidates) {
            const usage = await repository.findUsage(usageId(candidate, period.periodId));
            if (usage) {
              validateUsage(usage, { ...candidate, periodId: period.periodId });
              if (usage.consumedGames >= candidate.gamesQuota) continue;
            }
            // Protege tambien la ventana de migracion: una asignacion legacy
            // que siga activa para el mismo asset impide abrir un lease vault.
            if (await repository.findActiveAssignmentByAssetId(candidate.assetId)) continue;
            const currentLease = await repository.findLease(candidate.positionId);
            if (currentLease) {
              validateLease(currentLease);
              continue;
            }
            const assignment = buildVaultAssignment({
              sessionId,
              expiresAt,
              idempotencyKey,
              reservationRequestHash: requestHash,
              now,
              period,
              candidate,
            });
            const lease: CukiePoolVaultAssetLease = {
              _id: candidate.positionId,
              positionId: candidate.positionId,
              assetId: candidate.assetId,
              depositEpoch: candidate.depositEpoch,
              assignmentId: assignment.assignmentId,
              sessionId,
              expiresAt,
              revision: 0,
              createdAt: now,
              updatedAt: now,
            };
            await repository.insertLease(lease);
            await repository.insertAssignment(assignment);
            return clonePoolAssignment(assignment);
          }

          const seiku = buildVaultAssignment({
            sessionId,
            expiresAt,
            idempotencyKey,
            reservationRequestHash: requestHash,
            now,
            period,
          });
          await repository.insertAssignment(seiku);
          return clonePoolAssignment(seiku);
        });
      } catch (error) {
        if (!duplicateKey(error) || attempt === ASSIGNMENT_RETRIES - 1) throw error;
      }
    }
    throw new StaleFenceError('No se pudo reservar un Cukie custodial tras varios CAS.');
  };
}

function terminalHash(input: {
  operation: 'release' | 'expire';
  sessionId: string;
  expectedRevision: number;
  consumeGame: boolean;
  reason: string;
}) {
  return stableCukiePoolHash(input);
}

function createRelease(runner: CukiePoolVaultAssignmentRunner) {
  return async (input: InternalReleaseInput) => {
    const sessionId = requiredPoolText(input.sessionId, 'sessionId');
    const expectedRevision = validPoolRevision(input.expectedRevision);
    if (typeof input.consumeGame !== 'boolean') {
      throw new DomainValidationError('consumeGame debe ser booleano.');
    }
    const reason = requiredPoolText(input.reason, 'reason');
    const now = validPoolDate(input.now, 'now', new Date());
    const operation = input.operation ?? 'release';
    const idempotencyKey = validPoolIdempotencyKey(
      input.idempotencyKey,
      input.allowSystemIdempotency === true,
    );
    const requestHash = terminalHash({
      operation,
      sessionId,
      expectedRevision,
      consumeGame: input.consumeGame,
      reason,
    });

    return runner(async (repository) => {
      const assignment = await repository.findAssignmentBySessionId(sessionId);
      if (!assignment) throw new DomainNotFoundError(`No existe asignacion para ${sessionId}.`);
      if (assignment.custodyMode !== 'custodial') {
        throw new DomainConflictError(`La asignacion ${assignment.assignmentId} no es custodial.`);
      }
      if (assignment.status !== 'active') {
        if (
          assignment.terminalIdempotencyKey === idempotencyKey
          && assignment.terminalRequestHash === requestHash
        ) return clonePoolAssignment(assignment);
        throw new DomainConflictError(`La asignacion ${assignment.assignmentId} ya esta cerrada.`);
      }
      if (assignment.revision !== expectedRevision) {
        throw new StaleFenceError(`Revision obsoleta para ${assignment.assignmentId}.`);
      }
      if (
        input.requireOrphanGameSession
        && await repository.findGameSessionLifecycle(sessionId)
      ) throw new DomainConflictError(
        `La sesion ${sessionId} pertenece a GameEconomy y solo su saga puede cerrarla.`,
      );

      if (assignment.kind === 'pool_asset') {
        const lease = await repository.findLease(assignment.positionId!);
        if (
          !lease
          || validateLease(lease).assignmentId !== assignment.assignmentId
          || lease.sessionId !== sessionId
          || lease.assetId !== assignment.assetId
          || lease.depositEpoch !== assignment.depositEpoch
        ) throw new SchemaNotReadyError(
          `La asignacion ${assignment.assignmentId} no tiene su lease canonico.`,
        );

        if (input.consumeGame) {
          if (
            !assignment.positionId
            || !assignment.depositEpoch
            || !assignment.periodId
            || !assignment.gamesQuota
          ) throw new SchemaNotReadyError('La asignacion no contiene identidad de cuota completa.');
          const id = `${assignment.positionId}:period:${assignment.periodId}`;
          const current = await repository.findUsage(id);
          const expected = {
            positionId: assignment.positionId,
            assetId: assignment.assetId,
            depositEpoch: assignment.depositEpoch,
            periodId: assignment.periodId,
            gamesQuota: assignment.gamesQuota,
          };
          if (!current) {
            await repository.insertUsage({
              _id: id,
              ...expected,
              consumedGames: 1,
              consumedAssignmentIds: [assignment.assignmentId],
              revision: 0,
              createdAt: now,
              updatedAt: now,
            });
          } else {
            validateUsage(current, expected);
            if (!current.consumedAssignmentIds.includes(assignment.assignmentId)) {
              if (current.consumedGames >= current.gamesQuota) {
                throw new DomainConflictError(`La cuota de ${assignment.assetId} ya esta agotada.`);
              }
              const updated = await repository.compareAndSetUsage(current, {
                ...current,
                consumedGames: current.consumedGames + 1,
                consumedAssignmentIds: [...current.consumedAssignmentIds, assignment.assignmentId],
                revision: current.revision + 1,
                updatedAt: now,
              });
              if (!updated) throw new StaleFenceError(`CAS de cuota perdido para ${id}.`);
            }
          }
        }
        if (!await repository.deleteLease(lease)) {
          throw new StaleFenceError(`CAS de lease perdido para ${lease.positionId}.`);
        }
      }

      const replacement: CukiePoolAssignment = {
        ...clonePoolAssignment(assignment),
        status: operation === 'expire'
          ? 'expired'
          : input.consumeGame
            ? 'completed'
            : 'released',
        revision: assignment.revision + 1,
        updatedAt: now,
        releasedAt: now,
        releaseReason: reason,
        terminalIdempotencyKey: idempotencyKey,
        terminalRequestHash: requestHash,
      };
      const persisted = await repository.compareAndSetAssignment(assignment, replacement);
      if (!persisted) throw new StaleFenceError(`CAS perdido para ${assignment.assignmentId}.`);
      return clonePoolAssignment(persisted);
    });
  };
}

function createExpiry(
  runner: CukiePoolVaultAssignmentRunner,
  release: ReturnType<typeof createRelease>,
) {
  return async (
    input: ExpireCukiePoolAssignmentsInput = {},
  ): Promise<ExpireCukiePoolAssignmentsResult> => {
    const now = validPoolDate(input.now, 'now', new Date());
    const limit = validPoolLimit(input.limit);
    const actor = requiredPoolText(input.actor ?? 'cukie-pool-vault-expirer', 'actor');
    const candidates = await runner((repository) => repository.listExpiredAssignments(now, limit));
    let expired = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      try {
        await release({
          sessionId: candidate.sessionId,
          expectedRevision: candidate.revision,
          consumeGame: false,
          reason: `assignment_expired:${actor}`,
          idempotencyKey: `${SYSTEM_PREFIX}vault-expire:${candidate.assignmentId}:${candidate.revision}`,
          now,
          operation: 'expire',
          allowSystemIdempotency: true,
          requireOrphanGameSession: true,
        });
        expired += 1;
      } catch (error) {
        if (
          error instanceof DomainConflictError
          || error instanceof DomainNotFoundError
          || error instanceof StaleFenceError
        ) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }
    return { scanned: candidates.length, expired, skipped };
  };
}

export function createCukiePoolVaultAssignmentService(
  runner: CukiePoolVaultAssignmentRunner,
) {
  const releaseCukiePoolAssignment = createRelease(runner);
  return {
    assignCukiePoolSession: createAssignment(runner),
    releaseCukiePoolAssignment,
    expireCukiePoolAssignments: createExpiry(runner, releaseCukiePoolAssignment),
  };
}

export function createMongoCukiePoolVaultAssignmentRepository(
  db: Db,
  session: ClientSession,
): CukiePoolVaultAssignmentRepository {
  const config = requireCukiePoolVaultConfig();
  const assignments = db.collection<CukiePoolAssignment>('cukie_pool_assignments');
  const leases = db.collection<CukiePoolVaultAssetLease>(CUKIE_POOL_VAULT_ASSET_LEASES);
  const usages = db.collection<CukiePoolVaultPeriodUsage>(CUKIE_POOL_VAULT_PERIOD_USAGE);
  const gameSessions = db.collection<GameEconomySession>('game_economy_sessions');
  const options = { session };
  return {
    currentPeriod: (now) => assertCukiePoolVaultIndexerReady(db, config, now),
    listCandidates: (now) => loadCukiePoolVaultCandidates(db, config, now),
    findAssignmentBySessionId: (sessionId) => assignments.findOne({ sessionId }, options),
    findAssignmentByIdempotencyKey: (idempotencyKey) => (
      assignments.findOne({ idempotencyKey }, options)
    ),
    findActiveAssignmentByAssetId: (assetId) => assignments.findOne(
      { assetId, status: 'active' },
      options,
    ),
    insertAssignment: async (assignment) => {
      await assignments.insertOne(assignment, options);
    },
    async compareAndSetAssignment(current, replacement) {
      const { _id: _ignored, ...withoutId } = replacement;
      return assignments.findOneAndReplace(
        { _id: current._id, revision: current.revision, status: current.status },
        withoutId as OptionalUnlessRequiredId<CukiePoolAssignment>,
        { ...options, returnDocument: 'after' },
      );
    },
    findLease: (positionId) => leases.findOne({ _id: positionId }, options),
    insertLease: async (lease) => {
      await leases.insertOne(lease, options);
    },
    async deleteLease(lease) {
      const result = await leases.deleteOne({
        _id: lease._id,
        revision: lease.revision,
        assignmentId: lease.assignmentId,
      }, options);
      return result.deletedCount === 1;
    },
    findUsage: (id) => usages.findOne({ _id: id }, options),
    insertUsage: async (usage) => {
      await usages.insertOne(usage, options);
    },
    async compareAndSetUsage(current, replacement) {
      const { _id: _ignored, ...withoutId } = replacement;
      return usages.findOneAndReplace(
        {
          _id: current._id,
          revision: current.revision,
          consumedGames: current.consumedGames,
        },
        withoutId as OptionalUnlessRequiredId<CukiePoolVaultPeriodUsage>,
        { ...options, returnDocument: 'after' },
      );
    },
    listExpiredAssignments: (now, limit) => assignments.find({
      custodyMode: 'custodial',
      status: 'active',
      expiresAt: { $lte: now },
    }, options).sort({ expiresAt: 1, _id: 1 }).limit(limit).toArray(),
    async findGameSessionLifecycle(sessionId) {
      const game = await gameSessions.findOne({ _id: sessionId }, {
        ...options,
        projection: {
          _id: 1,
          sessionId: 1,
          status: 1,
          revision: 1,
          settlementIntent: 1,
          terminalIntent: 1,
          terminal: 1,
        },
      });
      if (!game) return null;
      return {
        sessionId: game.sessionId,
        status: game.status,
        revision: game.revision,
        hasSettlementIntent: Boolean(game.settlementIntent),
        terminalIntentStatus: game.terminalIntent?.status ?? null,
        terminalStatus: game.terminal ? game.status : null,
      };
    },
  };
}

export const mongoCukiePoolVaultAssignmentRunner: CukiePoolVaultAssignmentRunner = (work) => (
  withEconomyTransaction((db, session) => (
    work(createMongoCukiePoolVaultAssignmentRepository(db, session))
  ))
);

export const cukiePoolVaultAssignmentService = createCukiePoolVaultAssignmentService(
  mongoCukiePoolVaultAssignmentRunner,
);
