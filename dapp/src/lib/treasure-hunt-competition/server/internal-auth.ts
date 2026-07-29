import { createHash, timingSafeEqual } from 'node:crypto';

type CompetitionEnvironment = Partial<Record<string, string | undefined>>;

const MINIMUM_INTERNAL_SECRET_LENGTH = 32;

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest();
}

function configuredSecret(
  environment: CompetitionEnvironment,
  key: string,
) {
  const secret = environment[key]?.trim();
  return secret && secret.length >= MINIMUM_INTERNAL_SECRET_LENGTH ? secret : null;
}

export function getCompetitionReviewSecret(
  environment: CompetitionEnvironment = process.env,
) {
  return configuredSecret(environment, 'TREASURE_HUNT_COMPETITION_REVIEW_SECRET');
}

export function getCompetitionSettlementSecret(
  environment: CompetitionEnvironment = process.env,
) {
  return configuredSecret(environment, 'TREASURE_HUNT_COMPETITION_SETTLEMENT_SECRET');
}

export function getCompetitionReviewActor(
  environment: CompetitionEnvironment = process.env,
) {
  const secret = getCompetitionReviewSecret(environment);
  if (!secret) return null;
  return `review-key:${createHash('sha256').update(secret, 'utf8').digest('hex').slice(0, 16)}`;
}

export function hasValidCompetitionInternalAuthorization(
  request: Request,
  secret: string,
) {
  const authorization = request.headers.get('authorization') ?? '';
  const candidate = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  return candidate.length > 0 && timingSafeEqual(digest(candidate), digest(secret));
}
