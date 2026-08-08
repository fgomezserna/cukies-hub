/**
 * Declarative access inventory for every App Router route-handler method.
 *
 * This file is intentionally free of runtime authorization logic. Its purpose is
 * to make the expected boundary reviewable and to let CI reject unclassified
 * routes before they can be merged.
 */

export const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
export type RouteAccess = 'public' | 'user' | 'admin' | 'internal' | 'webhook';
export type RouteRuntime = 'all' | 'local-only' | 'retired';
export type DataExposure = 'none' | 'public' | 'personal' | 'operational' | 'sensitive';

export type AuthContract =
  | 'none'
  | 'next-auth-protocol'
  | 'next-auth-user'
  | 'wallet-challenge'
  | 'wallet-signature'
  | 'wallet-session'
  | 'optional-wallet-session'
  | 'signed-evm-wallet-session'
  | 'admin-signed-wallet-allowlist'
  | 'game-session-token'
  | 'economy-internal-hmac'
  | 'economy-games-hmac'
  | 'competition-review-bearer'
  | 'competition-settlement-bearer'
  | 'telegram-cleanup-secret'
  | 'telegram-webhook-secret'
  | 'ifttt-webhook-secret'
  | 'retired';

export type RouteMethodPolicy = Readonly<{
  access: RouteAccess;
  authContract: AuthContract;
  runtime: RouteRuntime;
  sideEffect: boolean;
  dataExposure: DataExposure;
}>;

export type RoutePolicy = Readonly<Partial<Record<HttpMethod, RouteMethodPolicy>>>;

function policy(
  access: RouteAccess,
  authContract: AuthContract,
  runtime: RouteRuntime,
  sideEffect: boolean,
  dataExposure: DataExposure,
): RouteMethodPolicy {
  return { access, authContract, runtime, sideEffect, dataExposure };
}

export const ROUTE_ACCESS_POLICIES = {
  '/api/auth/[...nextauth]': {
    GET: policy('public', 'next-auth-protocol', 'all', true, 'personal'),
    POST: policy('public', 'next-auth-protocol', 'all', true, 'personal'),
  },
  '/api/auth/challenge': {
    POST: policy('public', 'wallet-challenge', 'all', true, 'public'),
  },
  '/api/auth/login': {
    POST: policy('public', 'wallet-signature', 'all', true, 'personal'),
  },
  '/api/chat/auto-sync': {
    GET: policy('admin', 'admin-signed-wallet-allowlist', 'all', false, 'operational'),
    POST: policy('admin', 'admin-signed-wallet-allowlist', 'all', true, 'operational'),
  },
  '/api/chat/configure-topics': {
    GET: policy('admin', 'admin-signed-wallet-allowlist', 'all', false, 'sensitive'),
    POST: policy('admin', 'admin-signed-wallet-allowlist', 'all', true, 'sensitive'),
  },
  '/api/chat/init': {
    POST: policy('admin', 'admin-signed-wallet-allowlist', 'all', true, 'operational'),
  },
  '/api/chat/rooms': {
    GET: policy('user', 'next-auth-user', 'all', false, 'operational'),
    POST: policy('admin', 'admin-signed-wallet-allowlist', 'all', true, 'operational'),
  },
  '/api/chat/rooms/[gameId]': {
    GET: policy('user', 'next-auth-user', 'all', false, 'operational'),
    PUT: policy('admin', 'admin-signed-wallet-allowlist', 'all', true, 'operational'),
  },
  '/api/chat/rooms/[gameId]/join': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
    DELETE: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/chat/rooms/[gameId]/messages': {
    GET: policy('user', 'wallet-session', 'all', false, 'personal'),
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/chat/sync-telegram': {
    GET: policy('admin', 'admin-signed-wallet-allowlist', 'all', false, 'operational'),
    POST: policy('admin', 'admin-signed-wallet-allowlist', 'all', true, 'sensitive'),
  },
  '/api/cukies': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/cukies/[tokenId]': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/cukies/breeding/candidates': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/cukies/breeding/completed': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/cukies/points': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/debug/chat-config': {
    GET: policy('admin', 'admin-signed-wallet-allowlist', 'local-only', false, 'sensitive'),
  },
  '/api/debug/env': {
    GET: policy('admin', 'admin-signed-wallet-allowlist', 'local-only', false, 'sensitive'),
  },
  '/api/discord/invite-url': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/discord/verify-membership': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/economy/v1/credits': {
    GET: policy('user', 'wallet-session', 'all', false, 'personal'),
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/economy/v1/cukie-master': {
    GET: policy('user', 'wallet-session', 'all', false, 'personal'),
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/economy/v1/cukie-pool': {
    GET: policy('user', 'wallet-session', 'all', false, 'personal'),
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/economy/v1/internal/credits/tick': {
    POST: policy('internal', 'economy-internal-hmac', 'all', true, 'operational'),
  },
  '/api/economy/v1/internal/cukie-master/admin': {
    POST: policy('internal', 'economy-internal-hmac', 'all', true, 'sensitive'),
  },
  '/api/economy/v1/internal/cukie-master/tick': {
    POST: policy('internal', 'economy-internal-hmac', 'all', true, 'operational'),
  },
  '/api/economy/v1/internal/cukie-pool/tick': {
    POST: policy('internal', 'economy-internal-hmac', 'all', true, 'operational'),
  },
  '/api/economy/v1/internal/game-admin/rules': {
    POST: policy('internal', 'economy-internal-hmac', 'all', true, 'sensitive'),
  },
  '/api/economy/v1/internal/games/commands': {
    POST: policy('internal', 'economy-games-hmac', 'all', true, 'sensitive'),
  },
  '/api/economy/v1/internal/games/tick': {
    POST: policy('internal', 'economy-internal-hmac', 'all', true, 'operational'),
  },
  '/api/economy/v1/internal/ranking/admin/rules': {
    POST: policy('internal', 'economy-internal-hmac', 'all', true, 'sensitive'),
  },
  '/api/economy/v1/internal/ranking/tick': {
    POST: policy('internal', 'economy-internal-hmac', 'all', true, 'operational'),
  },
  '/api/economy/v1/internal/rewards/commands': {
    POST: policy('internal', 'economy-internal-hmac', 'all', true, 'sensitive'),
  },
  '/api/economy/v1/rewards': {
    GET: policy('user', 'wallet-session', 'all', false, 'personal'),
  },
  '/api/email/send-verification': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/email/status': {
    GET: policy('admin', 'admin-signed-wallet-allowlist', 'all', false, 'operational'),
  },
  '/api/email/verify-code': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/games/active-session': {
    GET: policy('public', 'retired', 'retired', false, 'none'),
  },
  '/api/games/checkpoint': {
    POST: policy('user', 'game-session-token', 'all', true, 'personal'),
  },
  '/api/games/config': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/games/emergency-result': {
    POST: policy('public', 'retired', 'retired', false, 'none'),
  },
  '/api/games/end-session': {
    OPTIONS: policy('public', 'none', 'all', false, 'none'),
    POST: policy('user', 'game-session-token', 'all', true, 'personal'),
  },
  '/api/games/start-session': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/games/stats': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/games/treasure-hunt/competition': {
    GET: policy('public', 'optional-wallet-session', 'all', false, 'public'),
  },
  '/api/games/treasure-hunt/competition/attempts': {
    GET: policy('user', 'signed-evm-wallet-session', 'all', false, 'personal'),
    POST: policy('user', 'signed-evm-wallet-session', 'all', true, 'personal'),
  },
  '/api/games/treasure-hunt/competition/attempts/[attemptId]/checkpoint': {
    POST: policy('user', 'signed-evm-wallet-session', 'all', true, 'personal'),
  },
  '/api/games/treasure-hunt/competition/attempts/[attemptId]/finish': {
    POST: policy('user', 'signed-evm-wallet-session', 'all', true, 'personal'),
  },
  '/api/games/treasure-hunt/competition/leaderboard': {
    GET: policy('public', 'optional-wallet-session', 'all', false, 'public'),
  },
  '/api/games/treasure-hunt/competition/participant': {
    GET: policy('user', 'signed-evm-wallet-session', 'all', false, 'personal'),
    PATCH: policy('user', 'signed-evm-wallet-session', 'all', true, 'personal'),
  },
  '/api/games/treasure-hunt/multiplayer/matches': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/games/treasure-hunt/multiplayer/matches/[matchId]': {
    GET: policy('user', 'wallet-session', 'all', false, 'personal'),
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/games/treasure-hunt/multiplayer/matches/release': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/health': {
    GET: policy('public', 'none', 'all', false, 'operational'),
  },
  '/api/internal/games/treasure-hunt/competition/review': {
    GET: policy('internal', 'competition-review-bearer', 'all', false, 'sensitive'),
  },
  '/api/internal/games/treasure-hunt/competition/review/[attemptId]': {
    GET: policy('internal', 'competition-review-bearer', 'all', false, 'sensitive'),
    POST: policy('internal', 'competition-review-bearer', 'all', true, 'sensitive'),
  },
  '/api/internal/games/treasure-hunt/competition/settle': {
    POST: policy('internal', 'competition-settlement-bearer', 'all', true, 'sensitive'),
  },
  '/api/leaderboard': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/legacy-marketplace/breeding/candidates': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/legacy-marketplace/breeding/completed': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/legacy-marketplace/config': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/legacy-marketplace/cukies': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/legacy-marketplace/cukies/[tokenId]': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/legacy-marketplace/home': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/legacy-marketplace/points': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/oauth/discord': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/oauth/twitter': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/points': {
    GET: policy('user', 'wallet-session', 'all', false, 'personal'),
  },
  '/api/points/daily-claim': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/points/daily-status': {
    GET: policy('user', 'wallet-session', 'all', false, 'personal'),
  },
  '/api/presale/purchases': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/presale/referral/attribution': {
    POST: policy('public', 'none', 'all', true, 'public'),
  },
  '/api/presale/referral/ranking': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/presale/referral/status': {
    GET: policy('public', 'none', 'all', true, 'public'),
  },
  '/api/presale/status': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/profile/[username]': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/pusher/auth': {
    OPTIONS: policy('public', 'none', 'all', false, 'none'),
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/pusher/auth-simple': {
    OPTIONS: policy('public', 'retired', 'retired', false, 'none'),
    POST: policy('public', 'retired', 'retired', false, 'none'),
  },
  '/api/quests': {
    GET: policy('public', 'optional-wallet-session', 'all', false, 'personal'),
  },
  '/api/quests/[id]': {
    GET: policy('public', 'optional-wallet-session', 'all', false, 'personal'),
  },
  '/api/quests/claim': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/quests/verify': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/referral/[code]': {
    GET: policy('public', 'none', 'all', true, 'public'),
  },
  '/api/referrals': {
    GET: policy('user', 'wallet-session', 'all', false, 'personal'),
  },
  '/api/telegram/auto-sync': {
    GET: policy('admin', 'admin-signed-wallet-allowlist', 'all', false, 'operational'),
    POST: policy('admin', 'admin-signed-wallet-allowlist', 'all', true, 'sensitive'),
  },
  '/api/telegram/cleanup-codes': {
    GET: policy('admin', 'admin-signed-wallet-allowlist', 'local-only', false, 'operational'),
    POST: policy('internal', 'telegram-cleanup-secret', 'all', true, 'sensitive'),
  },
  '/api/telegram/generate-code': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/telegram/get-chat-id': {
    GET: policy('admin', 'admin-signed-wallet-allowlist', 'local-only', false, 'sensitive'),
  },
  '/api/telegram/get-my-id': {
    GET: policy('admin', 'admin-signed-wallet-allowlist', 'local-only', false, 'sensitive'),
  },
  '/api/telegram/get-user-id': {
    POST: policy('admin', 'admin-signed-wallet-allowlist', 'local-only', true, 'sensitive'),
  },
  '/api/telegram/group-invite': {
    GET: policy('user', 'wallet-session', 'all', false, 'sensitive'),
  },
  '/api/telegram/poll': {
    GET: policy('admin', 'admin-signed-wallet-allowlist', 'all', false, 'operational'),
    POST: policy('admin', 'admin-signed-wallet-allowlist', 'all', true, 'sensitive'),
  },
  '/api/telegram/test-config': {
    GET: policy('admin', 'admin-signed-wallet-allowlist', 'local-only', true, 'sensitive'),
  },
  '/api/telegram/test-send': {
    POST: policy('admin', 'admin-signed-wallet-allowlist', 'local-only', true, 'sensitive'),
  },
  '/api/telegram/verify-by-id': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/telegram/verify-membership': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/telegram/verify-simple': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/telegram/webhook': {
    POST: policy('webhook', 'telegram-webhook-secret', 'all', true, 'sensitive'),
  },
  '/api/user/avatar': {
    POST: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/user/profile': {
    GET: policy('user', 'wallet-session', 'all', false, 'personal'),
    PUT: policy('user', 'wallet-session', 'all', true, 'personal'),
  },
  '/api/user/stats': {
    GET: policy('public', 'none', 'all', false, 'public'),
  },
  '/api/user/validate-username': {
    POST: policy('user', 'wallet-session', 'all', false, 'personal'),
  },
  '/api/webhooks/twitter-follow': {
    GET: policy('admin', 'admin-signed-wallet-allowlist', 'local-only', false, 'operational'),
    POST: policy('webhook', 'ifttt-webhook-secret', 'all', true, 'sensitive'),
  },
  '/ref/[code]': {
    GET: policy('public', 'none', 'all', true, 'public'),
  },
} as const satisfies Readonly<Record<string, RoutePolicy>>;

export const OPERATIONAL_PAGE_POLICIES = {
  '/indexer': policy(
    'admin',
    'admin-signed-wallet-allowlist',
    'all',
    false,
    'sensitive',
  ),
} as const satisfies Readonly<Record<string, RouteMethodPolicy>>;
