import {
  TREASURE_HUNT_COMPETITION_GAME_ID,
  TREASURE_HUNT_COMPETITION_MODE,
  type CompetitionConfig,
} from './types';

export const BASIS_POINTS = BigInt(10_000);
export const UINT256_MAX_DECIMAL =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';
export const UINT256_MAX = BigInt(UINT256_MAX_DECIMAL);

const CANONICAL_RAW_PATTERN = /^(0|[1-9][0-9]*)$/;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const EVM_ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const ZERO_EVM_ADDRESS = `0x${'0'.repeat(40)}`;

export function parseUkiRaw(value: string): bigint {
  if (
    value.length === 0 ||
    value.length > UINT256_MAX_DECIMAL.length ||
    !CANONICAL_RAW_PATTERN.test(value) ||
    (
      value.length === UINT256_MAX_DECIMAL.length &&
      value > UINT256_MAX_DECIMAL
    )
  ) {
    throw new Error('UKI raw value must be a canonical non-negative integer');
  }

  return BigInt(value);
}

export function multiplyByBps(value: bigint, bps: number): bigint {
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > Number(BASIS_POINTS)) {
    throw new RangeError('Basis points must be an integer between 0 and 10000');
  }

  return (value * BigInt(bps)) / BASIS_POINTS;
}

function requiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

export function normalizeCompetitionContractAddress(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!EVM_ADDRESS_PATTERN.test(normalized) || normalized === ZERO_EVM_ADDRESS) {
    throw new Error('presaleContractAddress must be a non-zero EVM address');
  }
  return normalized;
}

export function parseCanonicalUtcDate(value: string, field = 'date') {
  if (!UTC_ISO_PATTERN.test(value)) {
    throw new Error(`${field} must be an ISO-8601 UTC date ending in Z`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${field} must be a valid date`);
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date`);
  const canonicalInput = value.includes('.') ? value : value.replace(/Z$/, '.000Z');
  if (date.toISOString() !== canonicalInput) {
    throw new Error(`${field} must be a real calendar date`);
  }
  return date;
}

export function createCompetitionConfig(input: {
  readonly campaignId: string;
  readonly rulesVersion: string;
  readonly presaleContractAddress: string;
  readonly startsAt: string;
  readonly endsAt: string;
}): CompetitionConfig {
  const startsAt = parseCanonicalUtcDate(input.startsAt, 'startsAt').toISOString();
  const endsAt = parseCanonicalUtcDate(input.endsAt, 'endsAt').toISOString();
  if (Date.parse(startsAt) >= Date.parse(endsAt)) {
    throw new Error('Competition endsAt must be after startsAt');
  }

  return Object.freeze({
    campaignId: requiredText(input.campaignId, 'campaignId'),
    gameId: TREASURE_HUNT_COMPETITION_GAME_ID,
    mode: TREASURE_HUNT_COMPETITION_MODE,
    rulesVersion: requiredText(input.rulesVersion, 'rulesVersion'),
    presaleContractAddress: normalizeCompetitionContractAddress(input.presaleContractAddress),
    startsAt,
    endsAt,
    poolBps: 2_500,
    playerRewardBps: 1_000,
    sponsorRewardBps: 2_500,
    maxWinningAttemptsPerWallet: 5,
    cliffMonths: 9,
    vestingMonths: 6,
  });
}
