import { createHash } from 'node:crypto';

import { z } from 'zod';

export const COMPETITION_RANKING_ARCHIVE_SCHEMA_VERSION = 1 as const;
export const COMPETITION_RANKING_ARCHIVE_STAGES = ['provisional', 'final'] as const;
export const COMPETITION_RANKING_ARCHIVE_PUBLICATION_STATUSES = ['building', 'ready'] as const;

export type CompetitionRankingArchiveStage =
  (typeof COMPETITION_RANKING_ARCHIVE_STAGES)[number];
export type CompetitionRankingArchivePublicationStatus =
  (typeof COMPETITION_RANKING_ARCHIVE_PUBLICATION_STATUSES)[number];
export type CompetitionRankingArchiveEligibilityKind = 'presale' | 'uki_staking';
export type CompetitionRankingArchiveReviewStatus =
  | 'pending'
  | 'review'
  | 'valid'
  | 'invalid';
export type CompetitionRankingArchiveRewardStatus =
  | 'pending'
  | 'estimated'
  | 'partial'
  | 'no_purchase'
  | 'pool_exhausted'
  | 'reward_rounds_to_zero'
  | 'draw_pending'
  | 'final'
  | 'not_applicable';

export interface CompetitionRankingArchivePool {
  readonly status: CompetitionRankingArchiveStage;
  readonly totalUkiRaw: string;
  readonly playerUkiRaw: string | null;
  readonly sponsorUkiRaw: string | null;
}

export interface CompetitionRankingArchiveRewardMetadata {
  readonly model: 'presale_pool' | 'staking_draw' | 'external';
  readonly playerPoolUkiRaw: string | null;
  readonly sponsorPoolUkiRaw: string | null;
  readonly prizePerWinnerUkiRaw: string | null;
}

export interface CompetitionRankingArchiveSource {
  readonly kind: 'sanitized_json' | 'same_database';
  readonly reference: string;
  readonly exportedAt: string;
}

/** This is the complete public shape. Private source fields are never persisted. */
export interface CompetitionRankingArchiveEntry {
  readonly rank: number;
  readonly walletRank: number | null;
  readonly publicEntryId: string;
  readonly attemptId: string | null;
  readonly playerAlias: string;
  readonly score: number;
  readonly elapsedMs: number;
  readonly finishedAt: string;
  readonly reviewStatus: CompetitionRankingArchiveReviewStatus;
  readonly estimatedRewardUkiRaw: string | null;
  readonly finalRewardUkiRaw: string | null;
  readonly rewardStatus: CompetitionRankingArchiveRewardStatus;
  readonly tickets: number | null;
}

export interface CompetitionRankingArchiveManifest {
  readonly schemaVersion: typeof COMPETITION_RANKING_ARCHIVE_SCHEMA_VERSION;
  readonly campaignId: string;
  readonly rulesVersion: string;
  readonly eligibilityKind: CompetitionRankingArchiveEligibilityKind;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly stage: CompetitionRankingArchiveStage;
  readonly createdAt: string;
  readonly pool: CompetitionRankingArchivePool;
  readonly rewardMetadata: CompetitionRankingArchiveRewardMetadata | null;
  readonly totalRankedEntries: number;
  readonly totalParticipants: number | null;
  readonly totalWallets: number | null;
  readonly source: CompetitionRankingArchiveSource;
  readonly inputHash: string;
  readonly outputHash: string;
  readonly publicationStatus: CompetitionRankingArchivePublicationStatus;
}

export interface PreparedCompetitionRankingArchive {
  readonly manifest: Omit<CompetitionRankingArchiveManifest, 'publicationStatus'>;
  readonly entries: readonly CompetitionRankingArchiveEntry[];
}

const CANONICAL_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const UINT_PATTERN = /^(0|[1-9]\d*)$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const canonicalDate = z.string().regex(CANONICAL_UTC_PATTERN).refine(
  (value) => new Date(value).toISOString() === value,
  'must be a real canonical UTC date',
);
const id = z.string().regex(ID_PATTERN);
const rawUki = z.string().regex(UINT_PATTERN);
const nullableRawUki = rawUki.nullable().optional().transform((value) => value ?? null);

const poolSchema = z.object({
  status: z.enum(COMPETITION_RANKING_ARCHIVE_STAGES),
  totalUkiRaw: rawUki,
  playerUkiRaw: nullableRawUki,
  sponsorUkiRaw: nullableRawUki,
}).strict();

const rewardMetadataSchema = z.object({
  model: z.enum(['presale_pool', 'staking_draw', 'external']),
  playerPoolUkiRaw: nullableRawUki,
  sponsorPoolUkiRaw: nullableRawUki,
  prizePerWinnerUkiRaw: nullableRawUki,
}).strict();

const sourceSchema = z.object({
  kind: z.enum(['sanitized_json', 'same_database']),
  reference: z.string().trim().min(1).max(256),
  exportedAt: canonicalDate,
}).strict();

const archiveEntrySchema = z.object({
  rank: z.number().int().safe().positive(),
  walletRank: z.number().int().safe().positive().nullable().optional()
    .transform((value) => value ?? null),
  publicEntryId: id,
  attemptId: id.nullable().optional().transform((value) => value ?? null),
  playerAlias: z.string().trim().min(1).max(64),
  score: z.number().int().safe().nonnegative(),
  elapsedMs: z.number().int().safe().nonnegative(),
  finishedAt: canonicalDate,
  reviewStatus: z.enum(['pending', 'review', 'valid', 'invalid']),
  estimatedRewardUkiRaw: nullableRawUki,
  finalRewardUkiRaw: nullableRawUki,
  rewardStatus: z.enum([
    'pending',
    'estimated',
    'partial',
    'no_purchase',
    'pool_exhausted',
    'reward_rounds_to_zero',
    'draw_pending',
    'final',
    'not_applicable',
  ]),
  tickets: z.number().int().safe().nonnegative().nullable().optional()
    .transform((value) => value ?? null),
}).strict();

const archiveImportSchema = z.object({
  schemaVersion: z.literal(COMPETITION_RANKING_ARCHIVE_SCHEMA_VERSION),
  campaignId: id,
  rulesVersion: id,
  eligibilityKind: z.enum(['presale', 'uki_staking']).optional()
    .transform((value) => value ?? 'presale'),
  startsAt: canonicalDate,
  endsAt: canonicalDate,
  stage: z.enum(COMPETITION_RANKING_ARCHIVE_STAGES),
  createdAt: canonicalDate,
  pool: poolSchema,
  rewardMetadata: rewardMetadataSchema.nullable().optional()
    .transform((value) => value ?? null),
  totalRankedEntries: z.number().int().safe().nonnegative(),
  totalParticipants: z.number().int().safe().nonnegative().nullable().optional()
    .transform((value) => value ?? null),
  totalWallets: z.number().int().safe().nonnegative().nullable().optional()
    .transform((value) => value ?? null),
  source: sourceSchema,
  hashes: z.object({
    input: z.string().regex(SHA256_PATTERN),
    output: z.string().regex(SHA256_PATTERN),
  }).strict().optional(),
  entries: z.array(archiveEntrySchema).max(1_000_000),
}).strict();

type ParsedArchiveImport = z.infer<typeof archiveImportSchema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

export function competitionRankingArchiveHash(value: unknown) {
  const payload = JSON.stringify(canonicalize(value));
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

function normalizedHashInput(input: ParsedArchiveImport) {
  const { hashes: _hashes, ...withoutHashes } = input;
  return withoutHashes;
}

function assertPoolMetadataIntegrity(input: ParsedArchiveImport) {
  const playerPool = input.pool.playerUkiRaw;
  const sponsorPool = input.pool.sponsorUkiRaw;
  if (
    playerPool !== null
    && sponsorPool !== null
    && BigInt(playerPool) + BigInt(sponsorPool) !== BigInt(input.pool.totalUkiRaw)
  ) {
    throw new Error('Archive player and sponsor pools must sum to total pool');
  }

  const metadata = input.rewardMetadata;
  if (!metadata) return;
  if (metadata.playerPoolUkiRaw !== playerPool) {
    throw new Error('Archive reward metadata player pool differs from pool header');
  }
  if (metadata.sponsorPoolUkiRaw !== sponsorPool) {
    throw new Error('Archive reward metadata sponsor pool differs from pool header');
  }
  if (metadata.model === 'presale_pool' && (playerPool === null || sponsorPool === null)) {
    throw new Error('Presale reward metadata requires complete player and sponsor pools');
  }
  if (
    metadata.model === 'staking_draw'
    && (sponsorPool !== null && sponsorPool !== '0')
  ) {
    throw new Error('Staking reward metadata cannot define a non-zero sponsor pool');
  }
}

function assertArchiveIntegrity(input: ParsedArchiveImport, now: Date) {
  if (Date.parse(input.startsAt) >= Date.parse(input.endsAt)) {
    throw new Error('Archive campaign startsAt must be before endsAt');
  }
  if (Date.parse(input.endsAt) >= now.getTime()) {
    throw new Error('Archive campaign must be closed before it can be imported');
  }
  if (Date.parse(input.source.exportedAt) < Date.parse(input.endsAt)) {
    throw new Error('Archive source export cannot predate campaign end');
  }
  if (Date.parse(input.createdAt) < Date.parse(input.source.exportedAt)) {
    throw new Error('Archive creation cannot predate source export');
  }
  if (Date.parse(input.createdAt) > now.getTime()) {
    throw new Error('Archive creation cannot be in the future');
  }
  if (input.pool.status !== input.stage) {
    throw new Error('Archive pool status must match snapshot stage');
  }
  if (input.totalRankedEntries !== input.entries.length) {
    throw new Error('Archive totalRankedEntries does not match entries length');
  }
  if (input.rewardMetadata?.model === 'presale_pool' && input.eligibilityKind !== 'presale') {
    throw new Error('Presale reward metadata cannot be applied to a staking archive');
  }
  if (input.rewardMetadata?.model === 'staking_draw' && input.eligibilityKind !== 'uki_staking') {
    throw new Error('Staking reward metadata cannot be applied to a presale archive');
  }
  assertPoolMetadataIntegrity(input);

  const publicIds = new Set<string>();
  const attemptIds = new Set<string>();
  const walletRanksByAlias = new Map<string, number>();
  const representedAliases = new Set<string>();
  for (const [index, entry] of input.entries.entries()) {
    if (entry.rank !== index + 1) {
      throw new Error(`Archive ranks must be contiguous from 1 (invalid rank at index ${index})`);
    }
    if (publicIds.has(entry.publicEntryId)) {
      throw new Error(`Duplicate archive publicEntryId at rank ${entry.rank}`);
    }
    publicIds.add(entry.publicEntryId);
    representedAliases.add(entry.playerAlias);
    if (entry.attemptId) {
      if (attemptIds.has(entry.attemptId)) {
        throw new Error(`Duplicate archive attemptId at rank ${entry.rank}`);
      }
      attemptIds.add(entry.attemptId);
    }
    const finishedAt = Date.parse(entry.finishedAt);
    if (finishedAt < Date.parse(input.startsAt) || finishedAt > Date.parse(input.endsAt)) {
      throw new Error(`Archive entry ${entry.rank} finished outside the campaign window`);
    }
    if (input.eligibilityKind === 'presale' && entry.tickets !== null) {
      throw new Error('Presale archive entries cannot contain staking tickets');
    }
    if (entry.rewardStatus === 'final' && entry.finalRewardUkiRaw === null) {
      throw new Error(`Final reward status requires a fixed reward at rank ${entry.rank}`);
    }
    if (
      ['no_purchase', 'pool_exhausted', 'reward_rounds_to_zero', 'not_applicable']
        .includes(entry.rewardStatus)
      && entry.finalRewardUkiRaw !== null
      && entry.finalRewardUkiRaw !== '0'
    ) {
      throw new Error(`No-prize reward status cannot contain a positive final amount at rank ${entry.rank}`);
    }
    if (entry.walletRank !== null) {
      const expectedWalletRank = (walletRanksByAlias.get(entry.playerAlias) ?? 0) + 1;
      if (entry.walletRank !== expectedWalletRank) {
        throw new Error(`Archive walletRank is not contiguous at rank ${entry.rank}`);
      }
      walletRanksByAlias.set(entry.playerAlias, entry.walletRank);
    }
  }

  const representedParticipants = representedAliases.size;
  if (input.totalParticipants === null || input.totalWallets === null) {
    throw new Error('Archive participant and ranked-wallet totals are required');
  }
  if (input.totalWallets > input.entries.length) {
    throw new Error('Archive ranked-wallet total cannot exceed ranked entries');
  }
  if (input.totalWallets !== representedParticipants) {
    throw new Error('Archive ranked-wallet total must match unique public aliases');
  }
  if (input.totalParticipants < input.totalWallets) {
    throw new Error('Archive participant total cannot be lower than ranked wallets');
  }
  if (input.stage === 'final') {
    const unresolved = input.entries.find((entry) => (
      entry.reviewStatus === 'pending' || entry.reviewStatus === 'review'
    ));
    if (unresolved) {
      throw new Error(`Final archive cannot contain pending review at rank ${unresolved.rank}`);
    }
    const unresolvedRewardStatuses: readonly CompetitionRankingArchiveRewardStatus[] = [
      'pending',
      'estimated',
      'partial',
      'draw_pending',
    ];
    const unresolvedReward = input.entries.find((entry) => (
      unresolvedRewardStatuses.includes(entry.rewardStatus)
    ));
    if (unresolvedReward) {
      throw new Error(`Final archive contains an unresolved reward at rank ${unresolvedReward.rank}`);
    }
  }
}

export function prepareCompetitionRankingArchiveImport(
  value: unknown,
  options: { readonly now?: Date; readonly requireDeclaredHashes?: boolean } = {},
): PreparedCompetitionRankingArchive {
  const input = archiveImportSchema.parse(value);
  assertArchiveIntegrity(input, options.now ?? new Date());

  const hashInput = normalizedHashInput(input);
  const inputHash = competitionRankingArchiveHash(hashInput);
  const manifestWithoutHashes = {
    schemaVersion: input.schemaVersion,
    campaignId: input.campaignId,
    rulesVersion: input.rulesVersion,
    eligibilityKind: input.eligibilityKind,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    stage: input.stage,
    createdAt: input.createdAt,
    pool: input.pool,
    rewardMetadata: input.rewardMetadata,
    totalRankedEntries: input.totalRankedEntries,
    totalParticipants: input.totalParticipants,
    totalWallets: input.totalWallets,
    source: input.source,
  } as const;
  const outputHash = competitionRankingArchiveHash({
    manifest: manifestWithoutHashes,
    entries: input.entries,
  });

  if (options.requireDeclaredHashes && !input.hashes) {
    throw new Error('Archive import requires declared input and output hashes');
  }
  if (input.hashes?.input !== undefined && input.hashes.input !== inputHash) {
    throw new Error('Archive declared input hash does not match sanitized payload');
  }
  if (input.hashes?.output !== undefined && input.hashes.output !== outputHash) {
    throw new Error('Archive declared output hash does not match public snapshot');
  }

  return {
    manifest: { ...manifestWithoutHashes, inputHash, outputHash },
    entries: input.entries,
  };
}
