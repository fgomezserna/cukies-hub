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
const DEFAULT_STAKE_PER_ATTEMPT_RAW = '2000000000000000000000';
const DEFAULT_BASE_PRIZE_UKI_RAW = '50000000000000000000000';
const DEFAULT_PRIZE_PER_WINNER_UKI_RAW = '10000000000000000000000';

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

export function normalizeCompetitionContractAddress(value: string, field = 'contractAddress') {
  const normalized = value.trim().toLowerCase();
  if (!EVM_ADDRESS_PATTERN.test(normalized) || normalized === ZERO_EVM_ADDRESS) {
    throw new Error(`${field} must be a non-zero EVM address`);
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
  readonly eligibilityKind?: 'presale' | 'uki_staking';
  readonly presaleContractAddress?: string;
  readonly stakingContractAddress?: string;
  readonly stakingChainId?: number;
  readonly stakePerAttemptRaw?: string;
  readonly topAttemptsPerWallet?: number;
  readonly pointsPerTicket?: number;
  readonly basePrizeUkiRaw?: string;
  readonly stakePrizeBps?: number;
  readonly prizePerWinnerUkiRaw?: string;
  readonly maxWinsPerWallet?: number;
  readonly startsAt: string;
  readonly endsAt: string;
}): CompetitionConfig {
  const startsAt = parseCanonicalUtcDate(input.startsAt, 'startsAt').toISOString();
  const endsAt = parseCanonicalUtcDate(input.endsAt, 'endsAt').toISOString();
  if (Date.parse(startsAt) >= Date.parse(endsAt)) {
    throw new Error('Competition endsAt must be after startsAt');
  }
  const eligibilityKind = input.eligibilityKind ?? 'presale';
  if (eligibilityKind !== 'presale' && eligibilityKind !== 'uki_staking') {
    throw new Error('eligibilityKind must be presale or uki_staking');
  }
  const presaleContractAddress = input.presaleContractAddress
    ? normalizeCompetitionContractAddress(input.presaleContractAddress, 'presaleContractAddress')
    : eligibilityKind === 'presale'
      ? normalizeCompetitionContractAddress('', 'presaleContractAddress')
      : ZERO_EVM_ADDRESS;
  const stakingContractAddress = input.stakingContractAddress
    ? normalizeCompetitionContractAddress(input.stakingContractAddress, 'stakingContractAddress')
    : null;
  if (eligibilityKind === 'uki_staking' && !stakingContractAddress) {
    throw new Error('stakingContractAddress is required for uki_staking eligibility');
  }
  const stakingChainId = input.stakingChainId ?? (eligibilityKind === 'uki_staking' ? 97 : null);
  if (stakingChainId !== null && stakingChainId !== 56 && stakingChainId !== 97) {
    throw new Error('stakingChainId must be 56 or 97');
  }
  const stakePerAttemptRaw = parseUkiRaw(
    input.stakePerAttemptRaw ?? DEFAULT_STAKE_PER_ATTEMPT_RAW,
  );
  if (eligibilityKind === 'uki_staking' && stakePerAttemptRaw === BigInt(0)) {
    throw new Error('stakePerAttemptRaw must be greater than zero');
  }
  const topAttemptsPerWallet = input.topAttemptsPerWallet
    ?? (eligibilityKind === 'uki_staking' ? 10 : 5);
  const pointsPerTicket = input.pointsPerTicket ?? 100;
  const maxWinsPerWallet = input.maxWinsPerWallet ?? 1;
  for (const [field, value] of [
    ['topAttemptsPerWallet', topAttemptsPerWallet],
    ['pointsPerTicket', pointsPerTicket],
    ['maxWinsPerWallet', maxWinsPerWallet],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${field} must be a positive safe integer`);
    }
  }
  if (eligibilityKind === 'uki_staking' && maxWinsPerWallet !== 1) {
    throw new Error('uki_staking currently requires maxWinsPerWallet to be exactly 1');
  }
  const stakePrizeBps = input.stakePrizeBps ?? 1_000;
  if (!Number.isSafeInteger(stakePrizeBps) || stakePrizeBps < 0 || stakePrizeBps > 10_000) {
    throw new Error('stakePrizeBps must be an integer between 0 and 10000');
  }
  const basePrizeUkiRaw = parseUkiRaw(
    input.basePrizeUkiRaw ?? DEFAULT_BASE_PRIZE_UKI_RAW,
  ).toString(10);
  const prizePerWinnerUkiRaw = parseUkiRaw(
    input.prizePerWinnerUkiRaw ?? DEFAULT_PRIZE_PER_WINNER_UKI_RAW,
  );
  if (prizePerWinnerUkiRaw === BigInt(0)) {
    throw new Error('prizePerWinnerUkiRaw must be greater than zero');
  }

  return Object.freeze({
    campaignId: requiredText(input.campaignId, 'campaignId'),
    gameId: TREASURE_HUNT_COMPETITION_GAME_ID,
    mode: TREASURE_HUNT_COMPETITION_MODE,
    rulesVersion: requiredText(input.rulesVersion, 'rulesVersion'),
    eligibilityKind,
    presaleContractAddress,
    stakingContractAddress,
    stakingChainId,
    stakePerAttemptRaw: stakePerAttemptRaw.toString(10),
    topAttemptsPerWallet,
    pointsPerTicket,
    basePrizeUkiRaw,
    stakePrizeBps,
    prizePerWinnerUkiRaw: prizePerWinnerUkiRaw.toString(10),
    maxWinsPerWallet,
    startsAt,
    endsAt,
    poolBps: 2_500,
    playerRewardBps: 1_000,
    sponsorRewardBps: 2_500,
    maxWinningAttemptsPerWallet: topAttemptsPerWallet,
    cliffMonths: 9,
    vestingMonths: 6,
  });
}
