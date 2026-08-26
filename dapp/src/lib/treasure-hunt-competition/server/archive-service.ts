import type { CompetitionRankingArchiveStage } from '../archive';
import { getIndexerDb } from '@/lib/indexer-db/mongodb';
import {
  MongoCompetitionRankingArchiveRepository,
  selectPreferredCompetitionRankingArchives,
  type CompetitionRankingArchiveRepository,
} from './archive-repository';

const CAMPAIGN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class CompetitionRankingArchiveNotFoundError extends Error {
  constructor() {
    super('Competition ranking archive not found');
    this.name = 'CompetitionRankingArchiveNotFoundError';
  }
}

function pagination(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError('Archive page must be a positive safe integer');
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new RangeError(`Archive pageSize must be between 1 and ${MAX_PAGE_SIZE}`);
  }
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function preferredForCampaign(
  manifests: Awaited<ReturnType<CompetitionRankingArchiveRepository['findReadyManifests']>>,
  stage?: CompetitionRankingArchiveStage,
) {
  if (stage) return manifests[0] ?? null;
  return selectPreferredCompetitionRankingArchives(manifests)[0] ?? null;
}

export function createCompetitionRankingArchiveService(
  repository: CompetitionRankingArchiveRepository,
) {
  return {
    async listHistory(input: {
      readonly page?: number;
      readonly pageSize?: number;
      readonly stage?: CompetitionRankingArchiveStage;
    } = {}) {
      const selectedPage = pagination(input.page, input.pageSize);
      const allReady = await repository.listReadyManifests();
      const eligible = selectPreferredCompetitionRankingArchives(
        input.stage
          ? allReady.filter((manifest) => manifest.stage === input.stage)
          : allReady,
      );
      const manifests = eligible.slice(
        selectedPage.offset,
        selectedPage.offset + selectedPage.pageSize,
      );
      return {
        archives: manifests,
        pagination: {
          page: selectedPage.page,
          pageSize: selectedPage.pageSize,
          total: eligible.length,
          totalPages: Math.ceil(eligible.length / selectedPage.pageSize),
        },
      };
    },

    async getHistory(input: {
      readonly campaignId: string;
      readonly page?: number;
      readonly pageSize?: number;
      readonly stage?: CompetitionRankingArchiveStage;
    }) {
      if (!CAMPAIGN_ID_PATTERN.test(input.campaignId)) {
        throw new TypeError('Invalid archive campaignId');
      }
      const selectedPage = pagination(input.page, input.pageSize);
      const candidates = await repository.findReadyManifests(input.campaignId, input.stage);
      const manifest = preferredForCampaign(candidates, input.stage);
      if (!manifest) throw new CompetitionRankingArchiveNotFoundError();
      const entries = await repository.listReadyEntries({
        manifest,
        offset: selectedPage.offset,
        limit: selectedPage.pageSize,
      });
      return {
        archive: manifest,
        entries,
        pagination: {
          page: selectedPage.page,
          pageSize: selectedPage.pageSize,
          total: manifest.totalRankedEntries,
          totalPages: Math.ceil(manifest.totalRankedEntries / selectedPage.pageSize),
        },
      };
    },
  };
}

declare global {
  // eslint-disable-next-line no-var
  var treasureHuntCompetitionRankingArchiveService:
    | ReturnType<typeof createCompetitionRankingArchiveService>
    | undefined;
}

export function getCompetitionRankingArchiveService() {
  if (!global.treasureHuntCompetitionRankingArchiveService) {
    global.treasureHuntCompetitionRankingArchiveService = createCompetitionRankingArchiveService(
      new MongoCompetitionRankingArchiveRepository(getIndexerDb),
    );
  }
  return global.treasureHuntCompetitionRankingArchiveService;
}
