import { ReadPreference, type ClientSession, type Db } from 'mongodb';

export const ECONOMY_SCHEMA_METADATA_COLLECTION = 'economy_schema_metadata';
export const ECONOMY_SCHEMA_METADATA_ID = 'uki-economy';
export const ECONOMY_PREVIOUS_SCHEMA_VERSION = 1 as const;
export const ECONOMY_SCHEMA_VERSION = 2 as const;
export const ECONOMY_V2_MIGRATION_ID = 'uki-economy-v1-to-v2-credit-ledger' as const;

export type EconomySchemaMetadata = {
  _id: typeof ECONOMY_SCHEMA_METADATA_ID;
  schemaVersion: typeof ECONOMY_SCHEMA_VERSION;
  dbName: string;
  initializedAt: Date;
  updatedAt: Date;
  transactionVerifiedAt?: Date;
  migratedFromVersion?: typeof ECONOMY_PREVIOUS_SCHEMA_VERSION;
  migrationId?: typeof ECONOMY_V2_MIGRATION_ID;
  migratedAt?: Date;
};

type EconomySchemaMetadataV1 = Omit<
  EconomySchemaMetadata,
  'schemaVersion' | 'migratedFromVersion' | 'migrationId' | 'migratedAt'
> & {
  schemaVersion: typeof ECONOMY_PREVIOUS_SCHEMA_VERSION;
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
      const collection = db.collection<EconomySchemaMetadata | EconomySchemaMetadataV1>(
        ECONOMY_SCHEMA_METADATA_COLLECTION,
      );
      const current = await collection.findOne(
        { _id: ECONOMY_SCHEMA_METADATA_ID },
        { session },
      );
      if (current?.schemaVersion === ECONOMY_SCHEMA_VERSION) {
        return validateMetadata(current, normalizedExpected);
      }
      if (
        !current
        || current.schemaVersion !== ECONOMY_PREVIOUS_SCHEMA_VERSION
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
          schemaVersion: ECONOMY_PREVIOUS_SCHEMA_VERSION,
          dbName: normalizedExpected,
        },
        {
          $set: {
            schemaVersion: ECONOMY_SCHEMA_VERSION,
            migratedFromVersion: ECONOMY_PREVIOUS_SCHEMA_VERSION,
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
        if (winner?.schemaVersion === ECONOMY_SCHEMA_VERSION) {
          return validateMetadata(winner, normalizedExpected);
        }
        throw new EconomySchemaError('El sentinel perdio la carrera de migracion v1 a v2.');
      }
      return validateMetadata(migrated as EconomySchemaMetadata, normalizedExpected);
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
