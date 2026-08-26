import { randomUUID } from 'node:crypto';

import type { Db, Document, IndexDescription } from 'mongodb';

import type {
  CompetitionRankingArchiveEntry,
  CompetitionRankingArchiveManifest,
  CompetitionRankingArchiveStage,
  PreparedCompetitionRankingArchive,
} from '../archive';

export const COMPETITION_RANKING_ARCHIVES_COLLECTION = 'competition_ranking_archives';
export const COMPETITION_RANKING_ARCHIVE_ENTRIES_COLLECTION =
  'competition_ranking_archive_entries';

export const COMPETITION_RANKING_ARCHIVE_INDEXES: readonly IndexDescription[] = [
  {
    key: { campaignId: 1, rulesVersion: 1, stage: 1 },
    name: 'competition_ranking_archive_identity',
    unique: true,
  },
  {
    key: { publicationStatus: 1, endsAt: -1, createdAt: -1 },
    name: 'competition_ranking_archive_public_history',
  },
  {
    key: { campaignId: 1, publicationStatus: 1, stage: 1, createdAt: -1 },
    name: 'competition_ranking_archive_public_detail',
  },
];

export const COMPETITION_RANKING_ARCHIVE_ENTRY_INDEXES: readonly IndexDescription[] = [
  {
    key: { campaignId: 1, rulesVersion: 1, stage: 1, rank: 1 },
    name: 'competition_ranking_archive_entry_rank',
    unique: true,
  },
  {
    key: { buildId: 1 },
    name: 'competition_ranking_archive_entry_build',
  },
];

type ArchiveIdentity = Pick<
  CompetitionRankingArchiveManifest,
  'campaignId' | 'rulesVersion' | 'stage'
>;

interface CompetitionRankingArchiveManifestDocument extends CompetitionRankingArchiveManifest {
  readonly buildId: string;
  readonly writerToken: string;
  readonly leaseExpiresAt: string;
  readonly readyAt?: string;
}

interface CompetitionRankingArchiveEntryDocument extends CompetitionRankingArchiveEntry {
  readonly campaignId: string;
  readonly rulesVersion: string;
  readonly stage: CompetitionRankingArchiveStage;
  readonly buildId: string;
  readonly outputHash: string;
}

export interface CompetitionRankingArchiveRepository {
  ensureIndexes(): Promise<void>;
  writeSnapshot(
    archive: PreparedCompetitionRankingArchive,
  ): Promise<{ readonly created: boolean; readonly manifest: CompetitionRankingArchiveManifest }>;
  listReadyManifests(): Promise<CompetitionRankingArchiveManifest[]>;
  findReadyManifests(
    campaignId: string,
    stage?: CompetitionRankingArchiveStage,
  ): Promise<CompetitionRankingArchiveManifest[]>;
  listReadyEntries(input: {
    readonly manifest: CompetitionRankingArchiveManifest;
    readonly offset: number;
    readonly limit: number;
  }): Promise<CompetitionRankingArchiveEntry[]>;
}

export class CompetitionRankingArchiveConflictError extends Error {
  constructor(message = 'A ranking archive already exists with a different payload') {
    super(message);
    this.name = 'CompetitionRankingArchiveConflictError';
  }
}

export class CompetitionRankingArchiveBuildInProgressError extends Error {
  constructor() {
    super('The same ranking archive is currently being built');
    this.name = 'CompetitionRankingArchiveBuildInProgressError';
  }
}

function identity(manifest: ArchiveIdentity) {
  return {
    campaignId: manifest.campaignId,
    rulesVersion: manifest.rulesVersion,
    stage: manifest.stage,
  } as const;
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

function publicManifest(
  document: (CompetitionRankingArchiveManifestDocument & { _id?: unknown }) | null,
): CompetitionRankingArchiveManifest | null {
  if (!document) return null;
  return {
    schemaVersion: document.schemaVersion,
    campaignId: document.campaignId,
    rulesVersion: document.rulesVersion,
    eligibilityKind: document.eligibilityKind === 'uki_staking' ? 'uki_staking' : 'presale',
    startsAt: document.startsAt,
    endsAt: document.endsAt,
    stage: document.stage,
    createdAt: document.createdAt,
    pool: {
      status: document.pool.status,
      totalUkiRaw: document.pool.totalUkiRaw,
      playerUkiRaw: document.pool.playerUkiRaw ?? null,
      sponsorUkiRaw: document.pool.sponsorUkiRaw ?? null,
    },
    rewardMetadata: document.rewardMetadata ? {
      model: document.rewardMetadata.model,
      playerPoolUkiRaw: document.rewardMetadata.playerPoolUkiRaw ?? null,
      sponsorPoolUkiRaw: document.rewardMetadata.sponsorPoolUkiRaw ?? null,
      prizePerWinnerUkiRaw: document.rewardMetadata.prizePerWinnerUkiRaw ?? null,
    } : null,
    totalRankedEntries: document.totalRankedEntries,
    totalParticipants: document.totalParticipants ?? null,
    totalWallets: document.totalWallets ?? null,
    source: {
      kind: document.source.kind,
      reference: document.source.reference,
      exportedAt: document.source.exportedAt,
    },
    inputHash: document.inputHash,
    outputHash: document.outputHash,
    publicationStatus: document.publicationStatus,
  };
}

function publicEntry(
  document: CompetitionRankingArchiveEntryDocument & { _id?: unknown },
): CompetitionRankingArchiveEntry {
  return {
    rank: document.rank,
    walletRank: document.walletRank ?? null,
    publicEntryId: document.publicEntryId,
    attemptId: document.attemptId ?? null,
    playerAlias: document.playerAlias,
    score: document.score,
    elapsedMs: document.elapsedMs,
    finishedAt: document.finishedAt,
    reviewStatus: document.reviewStatus,
    estimatedRewardUkiRaw: document.estimatedRewardUkiRaw ?? null,
    finalRewardUkiRaw: document.finalRewardUkiRaw ?? null,
    rewardStatus: document.rewardStatus,
    tickets: document.tickets ?? null,
  };
}

const manifestProjection = {
  _id: 0,
  schemaVersion: 1,
  campaignId: 1,
  rulesVersion: 1,
  eligibilityKind: 1,
  startsAt: 1,
  endsAt: 1,
  stage: 1,
  createdAt: 1,
  pool: 1,
  rewardMetadata: 1,
  totalRankedEntries: 1,
  totalParticipants: 1,
  totalWallets: 1,
  source: 1,
  inputHash: 1,
  outputHash: 1,
  publicationStatus: 1,
} as const;

const entryProjection = {
  _id: 0,
  rank: 1,
  walletRank: 1,
  publicEntryId: 1,
  attemptId: 1,
  playerAlias: 1,
  score: 1,
  elapsedMs: 1,
  finishedAt: 1,
  reviewStatus: 1,
  estimatedRewardUkiRaw: 1,
  finalRewardUkiRaw: 1,
  rewardStatus: 1,
  tickets: 1,
} as const;

export function selectPreferredCompetitionRankingArchives(
  manifests: readonly CompetitionRankingArchiveManifest[],
) {
  const sorted = [...manifests].sort((left, right) => {
    const byEnd = Date.parse(right.endsAt) - Date.parse(left.endsAt);
    if (byEnd !== 0) return byEnd;
    const byStage = Number(right.stage === 'final') - Number(left.stage === 'final');
    if (byStage !== 0) return byStage;
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
  const selected = new Map<string, CompetitionRankingArchiveManifest>();
  for (const manifest of sorted) {
    const current = selected.get(manifest.campaignId);
    if (!current || (manifest.stage === 'final' && current.stage !== 'final')) {
      selected.set(manifest.campaignId, manifest);
    }
  }
  return [...selected.values()].sort(
    (left, right) => Date.parse(right.endsAt) - Date.parse(left.endsAt),
  );
}

export class MongoCompetitionRankingArchiveRepository
implements CompetitionRankingArchiveRepository {
  constructor(
    private readonly getDb: () => Promise<Db>,
    private readonly buildLeaseMs = 5 * 60_000,
  ) {}

  async ensureIndexes() {
    const db = await this.getDb();
    await Promise.all([
      db.collection(COMPETITION_RANKING_ARCHIVES_COLLECTION)
        .createIndexes([...COMPETITION_RANKING_ARCHIVE_INDEXES]),
      db.collection(COMPETITION_RANKING_ARCHIVE_ENTRIES_COLLECTION)
        .createIndexes([...COMPETITION_RANKING_ARCHIVE_ENTRY_INDEXES]),
    ]);
  }

  async writeSnapshot(
    archive: PreparedCompetitionRankingArchive,
  ): Promise<{ created: boolean; manifest: CompetitionRankingArchiveManifest }> {
    await this.ensureIndexes();
    const db = await this.getDb();
    const manifests = db.collection<CompetitionRankingArchiveManifestDocument>(
      COMPETITION_RANKING_ARCHIVES_COLLECTION,
    );
    const entries = db.collection<CompetitionRankingArchiveEntryDocument>(
      COMPETITION_RANKING_ARCHIVE_ENTRIES_COLLECTION,
    );
    const archiveIdentity = identity(archive.manifest);
    const buildId = archive.manifest.outputHash;
    const writerToken = randomUUID();
    const leaseStartedAt = new Date();
    const leaseExpiresAt = new Date(leaseStartedAt.getTime() + this.buildLeaseMs).toISOString();
    const buildingManifest: CompetitionRankingArchiveManifestDocument = {
      ...archive.manifest,
      publicationStatus: 'building',
      buildId,
      writerToken,
      leaseExpiresAt,
    };

    let insertedManifest = false;
    try {
      await manifests.insertOne(buildingManifest);
      insertedManifest = true;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }

    if (!insertedManifest) {
      const stored = await manifests.findOne(archiveIdentity);
      if (!stored) throw new CompetitionRankingArchiveConflictError();
      if (
        stored.inputHash !== archive.manifest.inputHash
        || stored.outputHash !== archive.manifest.outputHash
        || stored.buildId !== buildId
      ) {
        throw new CompetitionRankingArchiveConflictError();
      }
      if (stored.publicationStatus === 'ready') {
        return { created: false, manifest: publicManifest(stored) as CompetitionRankingArchiveManifest };
      }
      if (stored.publicationStatus !== 'building') {
        throw new CompetitionRankingArchiveConflictError('Ranking archive has an invalid build state');
      }
      const claim = await manifests.updateOne(
        {
          ...archiveIdentity,
          publicationStatus: 'building',
          buildId,
          inputHash: archive.manifest.inputHash,
          outputHash: archive.manifest.outputHash,
          $or: [
            { leaseExpiresAt: { $lte: leaseStartedAt.toISOString() } },
            { leaseExpiresAt: { $exists: false } },
          ],
        },
        { $set: { writerToken, leaseExpiresAt } },
      );
      if (claim.modifiedCount !== 1) {
        throw new CompetitionRankingArchiveBuildInProgressError();
      }
    }

    let publication;
    try {
      // A retry may only remove rows carrying its own deterministic output hash/build id.
      await entries.deleteMany({ ...archiveIdentity, buildId });
      if (archive.entries.length > 0) {
        await entries.insertMany(archive.entries.map((entry) => ({
          ...entry,
          ...archiveIdentity,
          buildId,
          outputHash: archive.manifest.outputHash,
        })), { ordered: true });
      }

      const readyAt = new Date().toISOString();
      publication = await manifests.updateOne(
        {
          ...archiveIdentity,
          publicationStatus: 'building',
          buildId,
          writerToken,
          inputHash: archive.manifest.inputHash,
          outputHash: archive.manifest.outputHash,
        },
        { $set: { publicationStatus: 'ready', readyAt } },
      );
    } catch (error) {
      try {
        await manifests.updateOne(
          { ...archiveIdentity, publicationStatus: 'building', buildId, writerToken },
          { $set: { leaseExpiresAt: new Date(0).toISOString() } },
        );
      } catch {
        // The original write failure is more actionable; a crashed process is
        // recoverable after the lease expiry even if early release also fails.
      }
      throw error;
    }
    if (publication.modifiedCount !== 1) {
      const stored = await manifests.findOne(archiveIdentity);
      if (
        stored?.publicationStatus === 'ready'
        && stored.inputHash === archive.manifest.inputHash
        && stored.outputHash === archive.manifest.outputHash
      ) {
        return { created: false, manifest: publicManifest(stored) as CompetitionRankingArchiveManifest };
      }
      throw new Error('Ranking archive could not be published atomically');
    }

    return {
      created: true,
      manifest: { ...archive.manifest, publicationStatus: 'ready' },
    };
  }

  async listReadyManifests() {
    const documents = await (await this.getDb())
      .collection<CompetitionRankingArchiveManifestDocument>(
        COMPETITION_RANKING_ARCHIVES_COLLECTION,
      )
      .find({ publicationStatus: 'ready' }, { projection: manifestProjection })
      .sort({ endsAt: -1, createdAt: -1 })
      .toArray();
    return documents.map((document) => publicManifest(document) as CompetitionRankingArchiveManifest);
  }

  async findReadyManifests(campaignId: string, stage?: CompetitionRankingArchiveStage) {
    const filter: Document = { campaignId, publicationStatus: 'ready' };
    if (stage) filter.stage = stage;
    const documents = await (await this.getDb())
      .collection<CompetitionRankingArchiveManifestDocument>(
        COMPETITION_RANKING_ARCHIVES_COLLECTION,
      )
      .find(filter, { projection: manifestProjection })
      .sort({ createdAt: -1 })
      .toArray();
    return documents.map((document) => publicManifest(document) as CompetitionRankingArchiveManifest);
  }

  async listReadyEntries(input: {
    manifest: CompetitionRankingArchiveManifest;
    offset: number;
    limit: number;
  }) {
    if (input.manifest.publicationStatus !== 'ready') return [];
    const documents = await (await this.getDb())
      .collection<CompetitionRankingArchiveEntryDocument>(
        COMPETITION_RANKING_ARCHIVE_ENTRIES_COLLECTION,
      )
      .find(
        {
          ...identity(input.manifest),
          outputHash: input.manifest.outputHash,
        },
        { projection: entryProjection },
      )
      .sort({ rank: 1 })
      .skip(input.offset)
      .limit(input.limit)
      .toArray();
    return documents.map(publicEntry);
  }
}
