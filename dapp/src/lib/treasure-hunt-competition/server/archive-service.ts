import {
  MAX_COMPETITION_RANKING_ARCHIVE_ENTRIES,
  type CompetitionRankingArchiveStage,
} from '../archive';
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
  return { page, pageSize };
}

function pageOffset(input: {
  page: number;
  pageSize: number;
  total: number;
  maximumTotal?: number;
}) {
  const maximumTotal = input.maximumTotal ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(input.total) || input.total < 0 || input.total > maximumTotal) {
    throw new RangeError('Archive total is outside the supported range');
  }
  if (input.total === 0 || input.page > Math.ceil(input.total / input.pageSize)) {
    return null;
  }
  const offset = (input.page - 1) * input.pageSize;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= input.total) {
    throw new RangeError('Archive page offset is outside the safe range');
  }
  return offset;
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
      const offset = pageOffset({ ...selectedPage, total: eligible.length });
      const manifests = offset === null
        ? []
        : eligible.slice(offset, offset + selectedPage.pageSize);
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
      const offset = pageOffset({
        ...selectedPage,
        total: manifest.totalRankedEntries,
        maximumTotal: MAX_COMPETITION_RANKING_ARCHIVE_ENTRIES,
      });
      const entries = offset === null
        ? []
        : await repository.listReadyEntries({
          manifest,
          offset,
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
