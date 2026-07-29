import type { IndexDescription } from 'mongodb';

export const COMPETITION_CAMPAIGN_INDEXES: readonly IndexDescription[] = [
  { key: { campaignId: 1 }, name: 'presale_game_campaign_id', unique: true },
  { key: { startsAt: 1, endsAt: 1 }, name: 'presale_game_campaign_window' },
];

export const COMPETITION_PARTICIPANT_INDEXES: readonly IndexDescription[] = [
  {
    key: { campaignId: 1, walletAddress: 1 },
    name: 'presale_game_participant_wallet',
    unique: true,
  },
  {
    key: { campaignId: 1, canonicalAlias: 1 },
    name: 'presale_game_participant_alias',
    unique: true,
  },
];

export const COMPETITION_ATTEMPT_INDEXES: readonly IndexDescription[] = [
  { key: { attemptId: 1 }, name: 'presale_game_attempt_id', unique: true },
  {
    key: { campaignId: 1, gameSessionId: 1 },
    name: 'presale_game_attempt_session',
    unique: true,
  },
  {
    key: { campaignId: 1, walletAddress: 1, status: 1 },
    name: 'presale_game_one_active_attempt_per_wallet',
    unique: true,
    partialFilterExpression: { status: 'active' },
  },
  {
    key: { campaignId: 1, status: 1, score: -1, gameTimeMs: 1, finishedAt: 1, attemptId: 1 },
    name: 'presale_game_ranking',
  },
  {
    key: { campaignId: 1, status: 1, finishPendingAuthority: 1, updatedAt: 1, attemptId: 1 },
    name: 'presale_game_finish_recovery',
  },
  {
    key: { campaignId: 1, walletAddress: 1, createdAt: -1 },
    name: 'presale_game_wallet_attempts',
  },
];
