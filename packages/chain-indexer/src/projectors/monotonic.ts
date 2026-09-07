import type { ClientSession } from 'mongodb';

type MonotonicTuple = { blockNumber: number; logIndex: number };

type MonotonicCollection = {
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<{ matchedCount: number }>;
  insertOne(document: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
};

export function isMongoDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

function monotonicTupleFilter(id: string, tuple: MonotonicTuple) {
  return {
    _id: id,
    $or: [
      { lastBlockNumber: { $exists: false } },
      { lastBlockNumber: { $lt: tuple.blockNumber } },
      { lastBlockNumber: tuple.blockNumber, lastLogIndex: { $lt: tuple.logIndex } },
    ],
  };
}

/**
 * Applies a block/log cursor atomically. A stale writer cannot match the
 * update filter; a concurrent first writer is handled by the duplicate-key
 * retry. This is shared by economy and legacy audit projections.
 */
export async function monotonicAbsoluteUpdate(
  target: MonotonicCollection,
  id: string,
  tuple: MonotonicTuple,
  values: Record<string, unknown>,
  createdAt: Date,
  session?: ClientSession,
) {
  const set = {
    ...values,
    lastBlockNumber: tuple.blockNumber,
    lastLogIndex: tuple.logIndex,
  };
  const updateExisting = () => target.updateOne(
    monotonicTupleFilter(id, tuple),
    { $set: set },
    { upsert: false, session },
  );
  const updated = await updateExisting();
  if (updated.matchedCount > 0) return true;

  try {
    await target.insertOne({ _id: id, ...set, createdAt }, { session });
    return true;
  } catch (error) {
    if (!isMongoDuplicateKey(error)) throw error;
    return (await updateExisting()).matchedCount > 0;
  }
}
