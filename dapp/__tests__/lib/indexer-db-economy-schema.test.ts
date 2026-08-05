jest.mock('mongodb', () => ({
  MongoClient: jest.fn(),
  ReadPreference: { primary: 'primary' },
}));

import {
  ECONOMY_SCHEMA_METADATA_ID,
  assertEconomySchema,
} from '@/lib/indexer-db/mongodb';
import { SchemaNotReadyError } from '@/lib/uki-economy/errors';
import type { Db } from 'mongodb';

const EXPECTED_DB = 'cukieshub-new-staging';

function fakeDb(input: {
  databaseName?: string;
  metadata?: Record<string, unknown> | null;
}) {
  const findOne = jest.fn().mockResolvedValue(input.metadata ?? null);
  const db = {
    databaseName: input.databaseName ?? EXPECTED_DB,
    collection: jest.fn(() => ({ findOne })),
  } as unknown as Db;

  return { db, findOne };
}

function validMetadata() {
  return {
    _id: ECONOMY_SCHEMA_METADATA_ID,
    schemaVersion: 2,
    dbName: EXPECTED_DB,
    initializedAt: new Date('2026-08-05T20:00:00.000Z'),
    updatedAt: new Date('2026-08-05T20:01:00.000Z'),
    transactionVerifiedAt: new Date('2026-08-05T20:01:00.000Z'),
  };
}

describe('dapp economy schema gate', () => {
  it('accepts only the expected v2 sentinel with verified transactions', async () => {
    const { db } = fakeDb({ metadata: validMetadata() });

    await expect(assertEconomySchema(db, EXPECTED_DB)).resolves.toEqual(validMetadata());
  });

  it('rejects a different database before querying its sentinel', async () => {
    const { db, findOne } = fakeDb({
      databaseName: 'cukieshub-new',
      metadata: validMetadata(),
    });

    await expect(assertEconomySchema(db, EXPECTED_DB)).rejects.toBeInstanceOf(
      SchemaNotReadyError,
    );
    expect(findOne).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...validMetadata(), schemaVersion: 1 },
    { ...validMetadata(), dbName: 'cukieshub-new' },
    { ...validMetadata(), transactionVerifiedAt: undefined },
  ])('fails closed for a missing or incompatible sentinel', async (metadata) => {
    const { db } = fakeDb({ metadata });

    await expect(assertEconomySchema(db, EXPECTED_DB)).rejects.toBeInstanceOf(
      SchemaNotReadyError,
    );
  });
});
