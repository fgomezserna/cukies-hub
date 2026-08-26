'use client';

import { useCallback, useEffect, useState } from 'react';

const COMPETITION_HISTORY_API = '/api/games/treasure-hunt/competition/history';
const ARCHIVE_LIST_PAGE_SIZE = 100;
const MAX_ARCHIVE_LIST_PAGES = 100;

export type TreasureHuntCompetitionArchiveStage = 'provisional' | 'final';
export type TreasureHuntCompetitionArchiveRewardStatus =
  | 'pending'
  | 'estimated'
  | 'partial'
  | 'no_purchase'
  | 'pool_exhausted'
  | 'reward_rounds_to_zero'
  | 'draw_pending'
  | 'final'
  | 'not_applicable';

export interface TreasureHuntCompetitionArchiveManifest {
  readonly schemaVersion: 1;
  readonly campaignId: string;
  readonly rulesVersion: string;
  readonly eligibilityKind: 'presale' | 'uki_staking';
  readonly startsAt: string;
  readonly endsAt: string;
  readonly stage: TreasureHuntCompetitionArchiveStage;
  readonly createdAt: string;
  readonly pool: {
    readonly status: TreasureHuntCompetitionArchiveStage;
    readonly totalUkiRaw: string;
    readonly playerUkiRaw: string | null;
    readonly sponsorUkiRaw: string | null;
  };
  readonly rewardMetadata: {
    readonly model: 'presale_pool' | 'staking_draw' | 'external';
    readonly playerPoolUkiRaw: string | null;
    readonly sponsorPoolUkiRaw: string | null;
    readonly prizePerWinnerUkiRaw: string | null;
  } | null;
  readonly totalRankedEntries: number;
  readonly totalParticipants: number | null;
  readonly totalWallets: number | null;
  readonly source: {
    readonly kind: 'sanitized_json' | 'same_database';
    readonly reference: string;
    readonly exportedAt: string;
  };
  readonly inputHash: string;
  readonly outputHash: string;
  readonly publicationStatus: 'ready';
}

export interface TreasureHuntCompetitionArchiveEntry {
  readonly rank: number;
  readonly walletRank: number | null;
  readonly publicEntryId: string;
  readonly attemptId: string | null;
  readonly playerAlias: string;
  readonly score: number;
  readonly elapsedMs: number;
  readonly finishedAt: string;
  readonly reviewStatus: 'pending' | 'review' | 'valid' | 'invalid';
  readonly estimatedRewardUkiRaw: string | null;
  readonly finalRewardUkiRaw: string | null;
  readonly rewardStatus: TreasureHuntCompetitionArchiveRewardStatus;
  readonly tickets: number | null;
}

export interface TreasureHuntCompetitionArchivePagination {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

interface HistoryListResponse {
  readonly success: true;
  readonly archives: readonly TreasureHuntCompetitionArchiveManifest[];
  readonly pagination: TreasureHuntCompetitionArchivePagination;
}

interface HistoryDetailResponse {
  readonly success: true;
  readonly archive: TreasureHuntCompetitionArchiveManifest;
  readonly entries: readonly TreasureHuntCompetitionArchiveEntry[];
  readonly pagination: TreasureHuntCompetitionArchivePagination;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
}

function isSafePositiveInteger(value: unknown): value is number {
  return isSafeNonNegativeInteger(value) && value > 0;
}

function isRawUki(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value);
}

function isNullableRawUki(value: unknown): value is string | null {
  return value === null || isRawUki(value);
}

function isUtcDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isPagination(value: unknown): value is TreasureHuntCompetitionArchivePagination {
  return (
    isObject(value)
    && isSafePositiveInteger(value.page)
    && isSafePositiveInteger(value.pageSize)
    && isSafeNonNegativeInteger(value.total)
    && isSafeNonNegativeInteger(value.totalPages)
    && value.pageSize <= 100
    && value.totalPages === Math.ceil(value.total / value.pageSize)
  );
}

function isArchiveManifest(value: unknown): value is TreasureHuntCompetitionArchiveManifest {
  if (!isObject(value) || !isObject(value.pool) || !isObject(value.source)) return false;
  const rewardMetadata = value.rewardMetadata;
  return (
    value.schemaVersion === 1
    && typeof value.campaignId === 'string'
    && value.campaignId.length > 0
    && typeof value.rulesVersion === 'string'
    && (value.eligibilityKind === 'presale' || value.eligibilityKind === 'uki_staking')
    && isUtcDate(value.startsAt)
    && isUtcDate(value.endsAt)
    && (value.stage === 'provisional' || value.stage === 'final')
    && isUtcDate(value.createdAt)
    && (value.pool.status === 'provisional' || value.pool.status === 'final')
    && value.pool.status === value.stage
    && isRawUki(value.pool.totalUkiRaw)
    && isNullableRawUki(value.pool.playerUkiRaw)
    && isNullableRawUki(value.pool.sponsorUkiRaw)
    && (
      rewardMetadata === null
      || (
        isObject(rewardMetadata)
        && ['presale_pool', 'staking_draw', 'external'].includes(String(rewardMetadata.model))
        && isNullableRawUki(rewardMetadata.playerPoolUkiRaw)
        && isNullableRawUki(rewardMetadata.sponsorPoolUkiRaw)
        && isNullableRawUki(rewardMetadata.prizePerWinnerUkiRaw)
      )
    )
    && isSafeNonNegativeInteger(value.totalRankedEntries)
    && (value.totalParticipants === null || isSafeNonNegativeInteger(value.totalParticipants))
    && (value.totalWallets === null || isSafeNonNegativeInteger(value.totalWallets))
    && (value.source.kind === 'sanitized_json' || value.source.kind === 'same_database')
    && typeof value.source.reference === 'string'
    && isUtcDate(value.source.exportedAt)
    && typeof value.inputHash === 'string'
    && /^sha256:[0-9a-f]{64}$/.test(value.inputHash)
    && typeof value.outputHash === 'string'
    && /^sha256:[0-9a-f]{64}$/.test(value.outputHash)
    && value.publicationStatus === 'ready'
  );
}

function isArchiveEntry(value: unknown): value is TreasureHuntCompetitionArchiveEntry {
  if (!(
    isObject(value)
    && isSafePositiveInteger(value.rank)
    && (value.walletRank === null || isSafePositiveInteger(value.walletRank))
    && typeof value.publicEntryId === 'string'
    && value.publicEntryId.length > 0
    && (value.attemptId === null || typeof value.attemptId === 'string')
    && typeof value.playerAlias === 'string'
    && value.playerAlias.length > 0
    && isSafeNonNegativeInteger(value.score)
    && isSafeNonNegativeInteger(value.elapsedMs)
    && isUtcDate(value.finishedAt)
    && ['pending', 'review', 'valid', 'invalid'].includes(String(value.reviewStatus))
    && isNullableRawUki(value.estimatedRewardUkiRaw)
    && isNullableRawUki(value.finalRewardUkiRaw)
    && [
      'pending',
      'estimated',
      'partial',
      'no_purchase',
      'pool_exhausted',
      'reward_rounds_to_zero',
      'draw_pending',
      'final',
      'not_applicable',
    ].includes(String(value.rewardStatus))
    && (value.tickets === null || isSafeNonNegativeInteger(value.tickets))
  )) return false;
  if (value.rewardStatus === 'final' && value.finalRewardUkiRaw === null) return false;
  if (
    ['no_purchase', 'pool_exhausted', 'reward_rounds_to_zero', 'not_applicable']
      .includes(String(value.rewardStatus))
    && value.finalRewardUkiRaw !== null
    && value.finalRewardUkiRaw !== '0'
  ) return false;
  return true;
}

function isHistoryListResponse(value: unknown): value is HistoryListResponse {
  return (
    isObject(value)
    && value.success === true
    && Array.isArray(value.archives)
    && value.archives.every(isArchiveManifest)
    && isPagination(value.pagination)
  );
}

function isHistoryDetailResponse(value: unknown): value is HistoryDetailResponse {
  if (!(
    isObject(value)
    && value.success === true
    && isArchiveManifest(value.archive)
    && Array.isArray(value.entries)
    && value.entries.every(isArchiveEntry)
    && isPagination(value.pagination)
  )) return false;
  if (value.archive.stage === 'final' && value.entries.some((entry) => (
    entry.reviewStatus !== 'valid'
    || ['pending', 'estimated', 'partial', 'draw_pending'].includes(entry.rewardStatus)
  ))) return false;
  return true;
}

function expectedPageCardinality(pagination: TreasureHuntCompetitionArchivePagination) {
  if (pagination.total === 0 || pagination.page > pagination.totalPages) return 0;
  const offset = (pagination.page - 1) * pagination.pageSize;
  return Math.min(pagination.pageSize, pagination.total - offset);
}

function isExpectedHistoryDetail(
  value: unknown,
  expected: { readonly campaignId: string; readonly page: number; readonly pageSize: number },
): value is HistoryDetailResponse {
  if (!isHistoryDetailResponse(value)) return false;
  const { archive, entries, pagination } = value;
  if (
    archive.campaignId !== expected.campaignId
    || pagination.page !== expected.page
    || pagination.pageSize !== expected.pageSize
    || pagination.total !== archive.totalRankedEntries
    || entries.length !== expectedPageCardinality(pagination)
  ) return false;
  if (pagination.total === 0 || pagination.page > pagination.totalPages) return entries.length === 0;
  const firstRank = ((pagination.page - 1) * pagination.pageSize) + 1;
  return entries.every((entry, index) => entry.rank === firstRank + index);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function useTreasureHuntCompetitionHistory(options?: {
  readonly page?: number;
  readonly pageSize?: number;
}) {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 20;
  const [archives, setArchives] = useState<readonly TreasureHuntCompetitionArchiveManifest[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [archive, setArchive] = useState<TreasureHuntCompetitionArchiveManifest | null>(null);
  const [entries, setEntries] = useState<readonly TreasureHuntCompetitionArchiveEntry[]>([]);
  const [pagination, setPagination] = useState<TreasureHuntCompetitionArchivePagination | null>(null);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [listRefreshToken, setListRefreshToken] = useState(0);
  const [detailRefreshToken, setDetailRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadArchives() {
      setIsListLoading(true);
      setListError(null);
      try {
        const response = await fetch(
          `${COMPETITION_HISTORY_API}?page=1&pageSize=${ARCHIVE_LIST_PAGE_SIZE}`,
          { cache: 'no-store', credentials: 'same-origin', signal: controller.signal },
        );
        const body = await readJson(response);
        if (!response.ok || !isHistoryListResponse(body)) {
          throw new Error('No se pudieron cargar las ediciones finalizadas.');
        }
        if (
          body.pagination.page !== 1
          || body.pagination.pageSize !== ARCHIVE_LIST_PAGE_SIZE
          || body.archives.length !== expectedPageCardinality(body.pagination)
        ) {
          throw new Error('No se pudieron cargar las ediciones finalizadas.');
        }
        if (body.pagination.totalPages > MAX_ARCHIVE_LIST_PAGES) {
          throw new Error('El histórico supera el límite de ediciones consultables.');
        }
        const allArchives = [...body.archives];
        for (let nextPage = 2; nextPage <= body.pagination.totalPages; nextPage += 1) {
          const nextResponse = await fetch(
            `${COMPETITION_HISTORY_API}?page=${nextPage}&pageSize=${ARCHIVE_LIST_PAGE_SIZE}`,
            { cache: 'no-store', credentials: 'same-origin', signal: controller.signal },
          );
          const nextBody = await readJson(nextResponse);
          if (
            !nextResponse.ok
            || !isHistoryListResponse(nextBody)
            || nextBody.pagination.page !== nextPage
            || nextBody.pagination.pageSize !== body.pagination.pageSize
            || nextBody.pagination.total !== body.pagination.total
            || nextBody.pagination.totalPages !== body.pagination.totalPages
            || nextBody.archives.length !== expectedPageCardinality(nextBody.pagination)
          ) {
            throw new Error('No se pudieron cargar las ediciones finalizadas.');
          }
          allArchives.push(...nextBody.archives);
        }
        if (new Set(allArchives.map((item) => item.campaignId)).size !== allArchives.length) {
          throw new Error('El histórico contiene ediciones duplicadas.');
        }
        if (allArchives.length !== body.pagination.total) {
          throw new Error('El histórico no contiene todas las ediciones anunciadas.');
        }
        if (controller.signal.aborted) return;
        setArchives(allArchives);
        setSelectedCampaignId((current) => (
          current && allArchives.some((item) => item.campaignId === current)
            ? current
            : allArchives[0]?.campaignId ?? null
        ));
      } catch (cause) {
        if (controller.signal.aborted) return;
        setArchives([]);
        setSelectedCampaignId(null);
        setListError(cause instanceof Error ? cause.message : 'No se pudieron cargar las ediciones finalizadas.');
      } finally {
        if (!controller.signal.aborted) setIsListLoading(false);
      }
    }

    void loadArchives();
    return () => controller.abort();
  }, [listRefreshToken]);

  useEffect(() => {
    if (!selectedCampaignId) {
      setArchive(null);
      setEntries([]);
      setPagination(null);
      setDetailError(null);
      setIsDetailLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadDetail() {
      setIsDetailLoading(true);
      setDetailError(null);
      try {
        const response = await fetch(
          `${COMPETITION_HISTORY_API}/${encodeURIComponent(selectedCampaignId as string)}?page=${page}&pageSize=${pageSize}`,
          { cache: 'no-store', credentials: 'same-origin', signal: controller.signal },
        );
        const body = await readJson(response);
        if (!response.ok || !isExpectedHistoryDetail(body, {
          campaignId: selectedCampaignId as string,
          page,
          pageSize,
        })) {
          throw new Error('No se pudo cargar la clasificación de esta edición.');
        }
        if (!controller.signal.aborted) {
          setArchive(body.archive);
          setEntries(body.entries);
          setPagination(body.pagination);
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setArchive(null);
        setEntries([]);
        setPagination(null);
        setDetailError(cause instanceof Error ? cause.message : 'No se pudo cargar la clasificación de esta edición.');
      } finally {
        if (!controller.signal.aborted) setIsDetailLoading(false);
      }
    }

    void loadDetail();
    return () => controller.abort();
  }, [detailRefreshToken, page, pageSize, selectedCampaignId]);

  const selectCampaign = useCallback((campaignId: string) => {
    if (campaignId === selectedCampaignId) return;
    setArchive(null);
    setEntries([]);
    setPagination(null);
    setDetailError(null);
    setIsDetailLoading(true);
    setSelectedCampaignId(campaignId);
  }, [selectedCampaignId]);
  const reloadList = useCallback(() => setListRefreshToken((current) => current + 1), []);
  const reloadDetail = useCallback(() => setDetailRefreshToken((current) => current + 1), []);

  return {
    archives,
    selectedCampaignId,
    archive,
    entries,
    pagination,
    isListLoading,
    isDetailLoading,
    listError,
    detailError,
    selectCampaign,
    reloadList,
    reloadDetail,
  } as const;
}
