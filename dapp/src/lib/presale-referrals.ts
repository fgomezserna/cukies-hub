import crypto from 'node:crypto';

import { MongoClient, type Db } from 'mongodb';

import { normalizeWalletAddress } from './wallet-address';

const PRESALE_DATABASE_URL =
  process.env.CHAIN_INDEXER_MONGO_URL ?? process.env.DATABASE_URL;
const PRESALE_DATABASE_NAME = process.env.CHAIN_INDEXER_DB_NAME ?? 'cukieshub-new';

declare global {
  // eslint-disable-next-line no-var
  var presaleReferralsClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var presaleReferralsDb: Db | undefined;
}

function getClient() {
  if (!PRESALE_DATABASE_URL) {
    throw new Error('Falta CHAIN_INDEXER_MONGO_URL o DATABASE_URL para preventa.');
  }

  if (!global.presaleReferralsClient || !global.presaleReferralsDb) {
    global.presaleReferralsClient = new MongoClient(PRESALE_DATABASE_URL);
    global.presaleReferralsDb = global.presaleReferralsClient.db(PRESALE_DATABASE_NAME);
  }

  return {
    client: global.presaleReferralsClient,
    db: global.presaleReferralsDb,
  };
}

async function getPresaleDb() {
  const { client, db } = getClient();

  try {
    await db.admin().ping();
  } catch {
    await client.connect();
  }

  return db;
}

function referralCodeForWallet(normalizedWalletAddress: string) {
  const hash = crypto.createHash('sha256').update(normalizedWalletAddress).digest('hex');
  return `uki-${hash.slice(0, 10)}`;
}

type ReferralLevelCounts = {
  level1: number;
  level2: number;
  level3: number;
};

const emptyReferralLevelCounts: ReferralLevelCounts = {
  level1: 0,
  level2: 0,
  level3: 0,
};

async function getCampaignConfig(db: Db) {
  const config = await db.collection('presale_referral_campaign_config').findOne(
    { active: true },
    { sort: { updatedAt: -1, createdAt: -1 } },
  );

  return {
    minimumUkiToUnlockLink: Number(config?.minimumUkiToUnlockLink ?? 0),
    levelOneWeight: Number(config?.levelOneWeight ?? 1),
    levelTwoWeight: Number(config?.levelTwoWeight ?? 0.5),
    levelThreeWeight: Number(config?.levelThreeWeight ?? 0.25),
  };
}

async function getReferralLevelCounts(db: Db, sponsorWalletNormalized?: string | null) {
  if (!sponsorWalletNormalized) return emptyReferralLevelCounts;

  const rows = await db.collection('presale_referral_contributions').aggregate<{
    _id: number;
    referralCount: number;
  }>([
    {
      $match: {
        sponsorWalletNormalized,
        level: { $in: [1, 2, 3] },
      },
    },
    {
      $group: {
        _id: '$level',
        uniqueBuyers: { $addToSet: '$buyerWalletNormalized' },
      },
    },
    {
      $project: {
        referralCount: { $size: '$uniqueBuyers' },
      },
    },
  ]).toArray();

  return rows.reduce<ReferralLevelCounts>((counts, row) => {
    if (row._id === 1) counts.level1 = row.referralCount;
    if (row._id === 2) counts.level2 = row.referralCount;
    if (row._id === 3) counts.level3 = row.referralCount;
    return counts;
  }, { ...emptyReferralLevelCounts });
}

export function toPublicPresaleParticipantStatus(
  participant: Record<string, any>,
  campaignConfig: Awaited<ReturnType<typeof getCampaignConfig>>,
  referralLevelCounts: ReferralLevelCounts,
  origin?: string | null,
) {
  const isUnlocked = Boolean(participant.referralUnlockedAt);
  const normalizedWalletAddress = String(participant.normalizedWalletAddress);
  const referralCode =
    typeof participant.referralCode === 'string' && participant.referralCode.trim()
      ? participant.referralCode
      : referralCodeForWallet(normalizedWalletAddress);
  const totalUkiPurchased = Number(participant.totalUkiPurchased ?? 0);
  const minimumUkiToUnlockLink = campaignConfig.minimumUkiToUnlockLink;
  const unlockProgress = minimumUkiToUnlockLink > 0
    ? Math.min(totalUkiPurchased / minimumUkiToUnlockLink, 1)
    : isUnlocked
      ? 1
      : 0;

  return {
    walletAddress: participant.walletAddress,
    normalizedWalletAddress,
    totalUkiPurchased,
    minimumUkiToUnlockLink,
    unlockProgress,
    referralUnlockedAt: participant.referralUnlockedAt ?? null,
    referralMinimumUkiSnapshot: participant.referralMinimumUkiSnapshot ?? null,
    referralCode: isUnlocked ? referralCode : null,
    referralLink: isUnlocked && origin ? `${origin}/ref/${referralCode}` : null,
    pendingSponsorCode: participant.pendingSponsorCode ?? null,
    pendingSponsorWalletAddress: participant.pendingSponsorWalletAddress ?? null,
    lockedSponsorWalletAddress: participant.lockedSponsorWalletAddress ?? null,
    sponsorLockedAt: participant.sponsorLockedAt ?? null,
    referralLevel1UkiAmount: participant.referralLevel1UkiAmount ?? 0,
    referralLevel2UkiAmount: participant.referralLevel2UkiAmount ?? 0,
    referralLevel3UkiAmount: participant.referralLevel3UkiAmount ?? 0,
    referralLevel1Count: referralLevelCounts.level1,
    referralLevel2Count: referralLevelCounts.level2,
    referralLevel3Count: referralLevelCounts.level3,
    referralWeightedScore: participant.referralWeightedScore ?? 0,
    levelWeights: {
      level1: campaignConfig.levelOneWeight,
      level2: campaignConfig.levelTwoWeight,
      level3: campaignConfig.levelThreeWeight,
    },
  };
}

export async function getOrCreatePresaleParticipant(walletAddress: string) {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const referralCode = referralCodeForWallet(normalizedWalletAddress);
  const now = new Date();
  const db = await getPresaleDb();

  await db.collection('presale_participants').updateOne(
    { normalizedWalletAddress },
    {
      $setOnInsert: {
        walletAddress: normalizedWalletAddress,
        normalizedWalletAddress,
        referralCode,
        totalUkiPurchased: 0,
        totalAsmPurchased: 0,
        referralLevel1UkiAmount: 0,
        referralLevel2UkiAmount: 0,
        referralLevel3UkiAmount: 0,
        referralWeightedScore: 0,
        createdAt: now,
      },
      $set: {
        updatedAt: now,
      },
    },
    { upsert: true },
  );

  await db.collection('presale_participants').updateOne(
    {
      normalizedWalletAddress,
      $or: [
        { referralCode: { $exists: false } },
        { referralCode: null },
        { referralCode: '' },
      ],
    },
    {
      $set: {
        referralCode,
        updatedAt: now,
      },
    },
  );

  return db.collection('presale_participants').findOne({ normalizedWalletAddress });
}

export async function getPresaleReferralStatus(walletAddress: string, origin?: string | null) {
  const db = await getPresaleDb();
  const participant = await getOrCreatePresaleParticipant(walletAddress);
  if (!participant) throw new Error('No se pudo cargar participante de preventa.');
  const campaignConfig = await getCampaignConfig(db);
  const referralLevelCounts = await getReferralLevelCounts(
    db,
    participant.normalizedWalletAddress,
  );

  return toPublicPresaleParticipantStatus(participant, campaignConfig, referralLevelCounts, origin);
}

export async function applyPresaleReferralCode(walletAddress: string, referralCode: string) {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const cleanCode = referralCode.trim();
  const now = new Date();
  const db = await getPresaleDb();
  const participants = db.collection('presale_participants');
  const buyer = await getOrCreatePresaleParticipant(normalizedWalletAddress);
  const sponsor = await participants.findOne({ referralCode: cleanCode });

  if (!buyer) throw new Error('No se pudo cargar comprador.');

  if (!sponsor || !sponsor.referralUnlockedAt) {
    return { applied: false, reason: 'invalid_or_locked_code' as const };
  }

  if (sponsor.normalizedWalletAddress === normalizedWalletAddress) {
    return { applied: false, reason: 'self_referral' as const };
  }

  if (buyer.firstPurchaseAt || buyer.lockedSponsorWalletAddress) {
    return { applied: false, reason: 'sponsor_already_locked' as const };
  }

  await participants.updateOne(
    { normalizedWalletAddress },
    {
      $set: {
        pendingSponsorWalletAddress: sponsor.walletAddress,
        pendingSponsorWalletNormalized: sponsor.normalizedWalletAddress,
        pendingSponsorCode: cleanCode,
        pendingSponsorUpdatedAt: now,
        updatedAt: now,
      },
    },
  );

  return {
    applied: true,
    pendingSponsorCode: cleanCode,
  };
}

export async function listPresaleReferralRanking(limit = 100) {
  const db = await getPresaleDb();
  const safeLimit = Math.min(Math.max(limit, 1), 500);

  const rows = await db
    .collection('presale_participants')
    .find({
      referralWeightedScore: { $gt: 0 },
    })
    .sort({ referralWeightedScore: -1, referralTotalUkiAmount: -1 })
    .limit(safeLimit)
    .project({
      _id: 0,
      walletAddress: 1,
      normalizedWalletAddress: 1,
      referralCode: 1,
      referralLevel1UkiAmount: 1,
      referralLevel2UkiAmount: 1,
      referralLevel3UkiAmount: 1,
      referralTotalUkiAmount: 1,
      referralWeightedScore: 1,
      totalUkiPurchased: 1,
      updatedAt: 1,
    })
    .toArray();

  return rows.map((row, index) => ({
    rank: index + 1,
    walletAddress: row.walletAddress,
    referralCode: row.referralCode,
    level1Uki: row.referralLevel1UkiAmount ?? 0,
    level2Uki: row.referralLevel2UkiAmount ?? 0,
    level3Uki: row.referralLevel3UkiAmount ?? 0,
    totalReferralUki: row.referralTotalUkiAmount ?? 0,
    weightedScore: row.referralWeightedScore ?? 0,
    ownUkiPurchased: row.totalUkiPurchased ?? 0,
    updatedAt: row.updatedAt ?? null,
  }));
}
