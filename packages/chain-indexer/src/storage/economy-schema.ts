import { ReadPreference, type ClientSession, type Db } from 'mongodb';
import {
  CREDIT_ECONOMY_COLLECTIONS,
  CREDIT_ECONOMY_INDEXES,
} from './credit-economy-indexes.js';

export const ECONOMY_SCHEMA_METADATA_COLLECTION = 'economy_schema_metadata';
export const ECONOMY_SCHEMA_METADATA_ID = 'uki-economy';
export const ECONOMY_V1_SCHEMA_VERSION = 1 as const;
export const ECONOMY_PREVIOUS_SCHEMA_VERSION = 2 as const;
export const ECONOMY_SCHEMA_VERSION = 3 as const;
export const ECONOMY_V2_MIGRATION_ID = 'uki-economy-v1-to-v2-credit-ledger' as const;
export const ECONOMY_V3_MIGRATION_ID = 'uki-economy-v2-to-v3-credit-periods' as const;

export type EconomySchemaMetadata = {
  _id: typeof ECONOMY_SCHEMA_METADATA_ID;
  schemaVersion: typeof ECONOMY_SCHEMA_VERSION;
  dbName: string;
  initializedAt: Date;
  updatedAt: Date;
  transactionVerifiedAt?: Date;
  migratedFromVersion?: typeof ECONOMY_V1_SCHEMA_VERSION | typeof ECONOMY_PREVIOUS_SCHEMA_VERSION;
  migrationId?: typeof ECONOMY_V2_MIGRATION_ID | typeof ECONOMY_V3_MIGRATION_ID;
  migratedAt?: Date;
};

type EconomySchemaMetadataV1 = Omit<
  EconomySchemaMetadata,
  'schemaVersion' | 'migratedFromVersion' | 'migrationId' | 'migratedAt'
> & {
  schemaVersion: typeof ECONOMY_V1_SCHEMA_VERSION;
};

type EconomySchemaMetadataV2 = Omit<
  EconomySchemaMetadata,
  'schemaVersion' | 'migratedFromVersion'
> & {
  schemaVersion: typeof ECONOMY_PREVIOUS_SCHEMA_VERSION;
  migratedFromVersion?: typeof ECONOMY_V1_SCHEMA_VERSION;
};

export class EconomySchemaError extends Error {
  readonly code = 'SCHEMA_NOT_READY' as const;

  constructor(message: string) {
    super(message);
    this.name = 'EconomySchemaError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EconomyTransactionSupportError extends Error {
  readonly code = 'ECONOMY_TRANSACTIONS_UNSUPPORTED' as const;
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'EconomyTransactionSupportError';
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type EconomyTransactionProbeRunner = <T>(
  work: (session: ClientSession) => Promise<T>,
) => Promise<T>;

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

function assertExpectedDatabase(db: Db, expectedDbName: string) {
  const normalizedExpected = expectedDbName.trim();

  if (!normalizedExpected) {
    throw new EconomySchemaError('El nombre esperado de la base de economia no puede estar vacio.');
  }

  if (db.databaseName !== normalizedExpected) {
    throw new EconomySchemaError(
      `La conexion apunta a ${db.databaseName}, no a la base esperada ${normalizedExpected}.`,
    );
  }

  return normalizedExpected;
}

function validateMetadata(
  metadata: EconomySchemaMetadata | null,
  expectedDbName: string,
): EconomySchemaMetadata {
  if (!metadata) {
    throw new EconomySchemaError(
      `La base ${expectedDbName} no tiene inicializado el schema de economia UKI.`,
    );
  }

  if (metadata.schemaVersion !== ECONOMY_SCHEMA_VERSION) {
    throw new EconomySchemaError(
      `Schema de economia incompatible: esperado ${ECONOMY_SCHEMA_VERSION}, recibido ${String(metadata.schemaVersion)}.`,
    );
  }

  if (metadata.dbName !== expectedDbName) {
    throw new EconomySchemaError(
      `Sentinel de economia incompatible: esperado ${expectedDbName}, recibido ${String(metadata.dbName)}.`,
    );
  }

  if (!(metadata.initializedAt instanceof Date) || !(metadata.updatedAt instanceof Date)) {
    throw new EconomySchemaError('El sentinel de economia no contiene timestamps validos.');
  }

  return metadata;
}

export async function assertEconomySchema(
  db: Db,
  expectedDbName: string,
  session?: ClientSession,
) {
  const normalizedExpected = assertExpectedDatabase(db, expectedDbName);
  const metadata = await db
    .collection<EconomySchemaMetadata>(ECONOMY_SCHEMA_METADATA_COLLECTION)
    .findOne({ _id: ECONOMY_SCHEMA_METADATA_ID }, { session });

  return validateMetadata(metadata, normalizedExpected);
}

export async function ensureEconomySchema(db: Db, expectedDbName: string) {
  const normalizedExpected = assertExpectedDatabase(db, expectedDbName);
  const collection = db.collection<EconomySchemaMetadata>(ECONOMY_SCHEMA_METADATA_COLLECTION);
  const timestamp = new Date();

  try {
    const metadata = await collection.findOneAndUpdate(
      {
        _id: ECONOMY_SCHEMA_METADATA_ID,
        schemaVersion: ECONOMY_SCHEMA_VERSION,
        dbName: normalizedExpected,
      },
      {
        $setOnInsert: {
          _id: ECONOMY_SCHEMA_METADATA_ID,
          schemaVersion: ECONOMY_SCHEMA_VERSION,
          dbName: normalizedExpected,
          initializedAt: timestamp,
        },
        $set: { updatedAt: timestamp },
      },
      { upsert: true, returnDocument: 'after' },
    );

    return validateMetadata(metadata, normalizedExpected);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const winner = await collection.findOne({ _id: ECONOMY_SCHEMA_METADATA_ID });
    return validateMetadata(winner, normalizedExpected);
  }
}

async function runProbeTransaction<T>(db: Db, work: (session: ClientSession) => Promise<T>) {
  const session = db.client.startSession();

  try {
    return await session.withTransaction(() => work(session), {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: ReadPreference.primary,
    });
  } finally {
    await session.endSession();
  }
}

export async function migrateEconomySchemaV1ToV2(
  db: Db,
  expectedDbName: string,
  runner?: EconomyTransactionProbeRunner,
) {
  const normalizedExpected = assertExpectedDatabase(db, expectedDbName);
  const run = runner ?? ((work) => runProbeTransaction(db, work));

  try {
    return await run(async (session) => {
      const collection = db.collection<EconomySchemaMetadata | EconomySchemaMetadataV1 | EconomySchemaMetadataV2>(
        ECONOMY_SCHEMA_METADATA_COLLECTION,
      );
      const current = await collection.findOne(
        { _id: ECONOMY_SCHEMA_METADATA_ID },
        { session },
      );
      if (current?.schemaVersion === ECONOMY_SCHEMA_VERSION) {
        return validateMetadata(current as EconomySchemaMetadata, normalizedExpected);
      }
      if (current?.schemaVersion === ECONOMY_PREVIOUS_SCHEMA_VERSION) {
        if (current.dbName !== normalizedExpected) {
          throw new EconomySchemaError(`El sentinel v2 no pertenece a ${normalizedExpected}.`);
        }
        return current as EconomySchemaMetadataV2;
      }
      if (
        !current
        || current.schemaVersion !== ECONOMY_V1_SCHEMA_VERSION
        || current.dbName !== normalizedExpected
        || !(current.initializedAt instanceof Date)
        || !(current.updatedAt instanceof Date)
      ) {
        throw new EconomySchemaError(
          `La base ${normalizedExpected} no contiene un sentinel v1 migrable.`,
        );
      }

      const migratedAt = new Date();
      const migrated = await collection.findOneAndUpdate(
        {
          _id: ECONOMY_SCHEMA_METADATA_ID,
          schemaVersion: ECONOMY_V1_SCHEMA_VERSION,
          dbName: normalizedExpected,
        },
        {
          $set: {
            schemaVersion: ECONOMY_PREVIOUS_SCHEMA_VERSION,
            migratedFromVersion: ECONOMY_V1_SCHEMA_VERSION,
            migrationId: ECONOMY_V2_MIGRATION_ID,
            migratedAt,
            updatedAt: migratedAt,
          },
        },
        { session, returnDocument: 'after' },
      );
      if (!migrated) {
        const winner = await collection.findOne(
          { _id: ECONOMY_SCHEMA_METADATA_ID },
          { session },
        );
        if (winner?.schemaVersion === ECONOMY_PREVIOUS_SCHEMA_VERSION) {
          return winner as EconomySchemaMetadataV2;
        }
        throw new EconomySchemaError('El sentinel perdio la carrera de migracion v1 a v2.');
      }
      return migrated as EconomySchemaMetadataV2;
    });
  } catch (error) {
    if (error instanceof EconomySchemaError || error instanceof EconomyTransactionSupportError) {
      throw error;
    }
    throw new EconomyTransactionSupportError(
      `No se pudo migrar ${normalizedExpected} a economy schema v2 dentro de una transaccion.`,
      error,
    );
  }
}

function sameKeys(left: Record<string, unknown>, right: Record<string, unknown>) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export const ECONOMY_V3_LEGACY_CREDIT_COLLECTIONS = [
  ...CREDIT_ECONOMY_COLLECTIONS,
  'competition_credit_runtime_state',
  'competition_credit_runtime_runs',
] as const;

export async function assertEconomyV3LegacyCreditCollectionsEmpty(
  db: Db,
  session?: ClientSession,
) {
  const populated: Array<{ collection: string; count: number }> = [];
  for (const collection of ECONOMY_V3_LEGACY_CREDIT_COLLECTIONS) {
    const count = await db.collection(collection).countDocuments({}, { session, limit: 1001 });
    if (count > 0) populated.push({ collection, count });
  }
  if (populated.length > 0) {
    throw new EconomySchemaError(
      `La migracion v3 encontro colecciones legacy no vacias: ${populated
        .map((item) => `${item.collection}=${item.count}${item.count > 1000 ? '+' : ''}`)
        .join(', ')}. Pause creditos y archive o migre explicitamente cada documento antes de continuar.`,
    );
  }
}

export async function migrateEconomySchemaV2ToV3(
  db: Db,
  expectedDbName: string,
  runner?: EconomyTransactionProbeRunner,
) {
  const normalizedExpected = assertExpectedDatabase(db, expectedDbName);
  const metadataCollection = db.collection<EconomySchemaMetadata | EconomySchemaMetadataV2>(
    ECONOMY_SCHEMA_METADATA_COLLECTION,
  );
  const current = await metadataCollection.findOne({ _id: ECONOMY_SCHEMA_METADATA_ID });
  if (current?.schemaVersion === ECONOMY_SCHEMA_VERSION) {
    return validateMetadata(current as EconomySchemaMetadata, normalizedExpected);
  }
  if (
    !current ||
    current.schemaVersion !== ECONOMY_PREVIOUS_SCHEMA_VERSION ||
    current.dbName !== normalizedExpected
  ) {
    throw new EconomySchemaError(
      `La base ${normalizedExpected} no contiene un sentinel v2 migrable.`,
    );
  }
  const run = runner ?? ((work) => runProbeTransaction(db, work));
  const migratedAt = new Date();
  try {
    await run(async (session) => {
      await assertEconomyV3LegacyCreditCollectionsEmpty(db, session);
      const slots = await db.collection<Record<string, unknown> & {
        _id: string;
        route: 'uki' | 'nft';
        revision: number;
      }>('cukie_master_slots').find({}, { session }).toArray();
      const versions = db.collection<Record<string, unknown> & { _id: string }>(
        'cukie_master_slot_versions',
      );
      for (const slot of slots) {
        if (
          typeof slot._id !== 'string' ||
          (slot.route !== 'uki' && slot.route !== 'nft')
        ) {
          throw new EconomySchemaError('Existe un slot Cukie Master sin identidad de ruta migrable.');
        }
        await versions.updateOne(
          { _id: `${slot._id}:${String(slot.revision)}` },
          {
            $setOnInsert: {
              _id: `${slot._id}:${String(slot.revision)}`,
              slotId: slot._id,
              route: slot.route,
              validFrom: migratedAt,
              slot,
              createdAt: migratedAt,
              backfilled: true,
              historicalEvidenceStatus: 'unverified_backfill',
            },
          },
          { session, upsert: true },
        );
      }
      for (const route of ['uki', 'nft'] as const) {
        await db.collection<Record<string, unknown> & { _id: 'uki' | 'nft' }>(
          'cukie_master_slot_history_state',
        ).updateOne(
          { _id: route },
          {
            $setOnInsert: {
              _id: route,
              completeFrom: migratedAt,
              baselineAt: migratedAt,
              historicalBlockCoverage: 'unverified',
            },
            $set: { observedThrough: migratedAt, updatedAt: migratedAt },
          },
          { session, upsert: true },
        );
      }
    });

    const incompatible = [
      { collection: 'competition_credit_runs', keys: { 'period.periodId': 1 } },
      { collection: 'competition_credit_run_items', keys: { periodId: 1, slotId: 1, eligibilityEpoch: 1 } },
      { collection: 'competition_credit_run_items', keys: { periodId: 1, slotRoute: 1, slotId: 1, eligibilityEpoch: 1 } },
      { collection: 'competition_credit_lots', keys: { periodId: 1, sourceSlotId: 1, eligibilityEpoch: 1 } },
      { collection: 'competition_credit_lots', keys: { periodId: 1, route: 1, sourceSlotId: 1, eligibilityEpoch: 1 } },
      { collection: 'competition_credit_pool_lots', keys: { periodId: 1, sourceSlotId: 1, eligibilityEpoch: 1 } },
      { collection: 'competition_credit_pool_lots', keys: { periodId: 1, route: 1, sourceSlotId: 1, eligibilityEpoch: 1 } },
      { collection: 'competition_credit_account_periods', keys: { walletNormalized: 1, periodId: 1 } },
      { collection: 'competition_credit_pool_periods', keys: { periodId: 1 } },
    ];
    for (const target of incompatible) {
      const collection = db.collection(target.collection);
      const indexes = await collection.listIndexes().toArray().catch(() => []);
      for (const index of indexes) {
        if (index.name && index.name !== '_id_' && sameKeys(index.key, target.keys)) {
          await collection.dropIndex(index.name);
        }
      }
    }
    for (const definition of CREDIT_ECONOMY_INDEXES) {
      await db.collection(definition.collection).createIndex(definition.keys, definition.options);
    }
    const completedAt = new Date();
    const migrated = await metadataCollection.findOneAndUpdate(
      {
        _id: ECONOMY_SCHEMA_METADATA_ID,
        schemaVersion: ECONOMY_PREVIOUS_SCHEMA_VERSION,
        dbName: normalizedExpected,
      },
      {
        $set: {
          schemaVersion: ECONOMY_SCHEMA_VERSION,
          migratedFromVersion: ECONOMY_PREVIOUS_SCHEMA_VERSION,
          migrationId: ECONOMY_V3_MIGRATION_ID,
          migratedAt: completedAt,
          updatedAt: completedAt,
        },
      },
      { returnDocument: 'after' },
    );
    if (!migrated) throw new EconomySchemaError('El sentinel perdio la carrera de migracion v2 a v3.');
    return validateMetadata(migrated as EconomySchemaMetadata, normalizedExpected);
  } catch (error) {
    if (error instanceof EconomySchemaError) throw error;
    throw new EconomyTransactionSupportError(
      `No se pudo migrar ${normalizedExpected} a economy schema v3.`,
      error,
    );
  }
}

export async function verifyEconomyTransactionSupport(
  db: Db,
  expectedDbName: string,
  runner?: EconomyTransactionProbeRunner,
) {
  const normalizedExpected = assertExpectedDatabase(db, expectedDbName);
  const run = runner ?? ((work) => runProbeTransaction(db, work));

  try {
    return await run(async (session) => {
      await assertEconomySchema(db, normalizedExpected, session);
      const transactionVerifiedAt = new Date();
      const metadata = await db
        .collection<EconomySchemaMetadata>(ECONOMY_SCHEMA_METADATA_COLLECTION)
        .findOneAndUpdate(
          {
            _id: ECONOMY_SCHEMA_METADATA_ID,
            schemaVersion: ECONOMY_SCHEMA_VERSION,
            dbName: normalizedExpected,
          },
          {
            $set: {
              transactionVerifiedAt,
              updatedAt: transactionVerifiedAt,
            },
          },
          { session, returnDocument: 'after' },
        );

      return validateMetadata(metadata, normalizedExpected);
    });
  } catch (error) {
    if (error instanceof EconomySchemaError || error instanceof EconomyTransactionSupportError) {
      throw error;
    }

    throw new EconomyTransactionSupportError(
      `La base ${normalizedExpected} no soporta las transacciones requeridas por la economia UKI.`,
      error,
    );
  }
}
