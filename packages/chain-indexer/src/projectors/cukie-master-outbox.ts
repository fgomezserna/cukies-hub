import type { ClientSession } from 'mongodb';

import type { ChainEvent } from '../types.js';
import type { IndexerStore } from '../storage/index.js';
import { now } from '../utils/json.js';

export type CukieMasterRecalculationRoute = 'uki' | 'nft';

const BSC_WALLET = /^0x[0-9a-f]{40}$/;
const BSC_ZERO_WALLET = /^0x0{40}$/;

export function normalizeCukieMasterJobWallet(value: string) {
  const walletNormalized = value.trim().toLowerCase();
  if (!BSC_WALLET.test(walletNormalized) || BSC_ZERO_WALLET.test(walletNormalized)) {
    throw new Error('La wallet del job Cukie Master no es una direccion BSC valida.');
  }
  return walletNormalized;
}

export function cukieMasterRecalculationJobId(
  eventId: string,
  wallet: string,
  route: CukieMasterRecalculationRoute,
) {
  return `chain-event:${eventId}:${normalizeCukieMasterJobWallet(wallet)}:${route}`;
}

export async function enqueueCukieMasterRecalculation(input: {
  store: IndexerStore;
  event: ChainEvent;
  wallet: string;
  route: CukieMasterRecalculationRoute;
  session?: ClientSession;
}) {
  const walletNormalized = normalizeCukieMasterJobWallet(input.wallet);
  const createdAt = now();
  const id = cukieMasterRecalculationJobId(
    input.event._id,
    walletNormalized,
    input.route,
  );
  await input.store.db.collection<{ _id: string }>('cukie_master_recalculation_jobs').updateOne(
    { _id: id },
    {
      $setOnInsert: {
        _id: id,
        walletNormalized,
        route: input.route,
        status: 'pending',
        sourceType: 'chain_event',
        sourceEventId: input.event._id,
        sourceAlias: input.event.contractAlias,
        availableAt: createdAt,
        attempts: 0,
        fenceToken: 0,
        createdAt,
        updatedAt: createdAt,
      },
    },
    { upsert: true, session: input.session },
  );
}
