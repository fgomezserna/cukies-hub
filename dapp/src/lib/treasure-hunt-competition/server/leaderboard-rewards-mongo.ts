import 'server-only';

import type { Document } from 'mongodb';

import { getIndexerDb } from '@/lib/indexer-db/mongodb';
import { readTotalStakedAt } from './staking-eligibility';

import type {
  CompetitionRewardPurchase,
  CompetitionRewardSource,
} from './leaderboard-rewards';

const PURCHASES_COLLECTION = 'presale_purchases';

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function contractAddressQuery(address: string) {
  return { $regex: `^${address}$`, $options: 'i' } as const;
}

function purchaseFromDocument(row: Document): CompetitionRewardPurchase {
  return {
    eventId: text(row.eventId),
    walletAddress: text(row.buyerWalletAddress),
    asmPurchasedRaw: text(row.asmAmountRaw),
    ukiPurchasedRaw: text(row.ukiAmountRaw),
  };
}

export class MongoCompetitionRewardSource implements CompetitionRewardSource {
  async getTotalStakedUkiRaw(input: {
    stakingContractAddress: string;
    stakingChainId: number;
    through: string;
  }) {
    const through = new Date(input.through);
    const total = await readTotalStakedAt({
      db: await getIndexerDb(),
      stakingContractAddress: input.stakingContractAddress,
      stakingChainId: input.stakingChainId,
      through,
    });
    return total.totalStakedUkiRaw;
  }

  async listPurchases(input: {
    presaleContractAddress: string;
    through: string;
  }) {
    const through = new Date(input.through);
    if (!Number.isFinite(through.getTime())) {
      throw new TypeError('Competition reward preview boundary must be a valid date');
    }

    const rows = await (await getIndexerDb())
      .collection(PURCHASES_COLLECTION)
      .find({
        contractAddress: contractAddressQuery(input.presaleContractAddress),
        confirmedAt: { $lte: through },
      })
      .project({
        _id: 0,
        eventId: 1,
        buyerWalletAddress: 1,
        asmAmountRaw: 1,
        ukiAmountRaw: 1,
      })
      .toArray();

    return rows.map(purchaseFromDocument);
  }
}
