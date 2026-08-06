export type CukieMasterRoute = 'uki' | 'nft';

export type CukieMasterRouteRule = {
  route: CukieMasterRoute;
  initialGlobalSlots: number;
  maxSlotsPerWallet: number;
  requirementPerSlot: number;
  requirementRaw?: string;
};

export type CukieMasterSlotBreakdown = {
  ukiSlots: number;
  nftSlots: number;
  totalSlots: number;
  maxTotalSlots: number;
};

export const CUKIE_MASTER_RULE_VERSION = 'cukie-master-v1-5-per-route';
export const CUKIE_MASTER_UKI_DECIMALS = 18;
export const CUKIE_MASTER_UKI_REQUIREMENT_RAW = (
  BigInt(20_000) * (BigInt(10) ** BigInt(CUKIE_MASTER_UKI_DECIMALS))
).toString();

export const CUKIE_MASTER_ROUTE_RULES = {
  uki: {
    route: 'uki',
    initialGlobalSlots: 500,
    maxSlotsPerWallet: 5,
    requirementPerSlot: 20_000,
    requirementRaw: CUKIE_MASTER_UKI_REQUIREMENT_RAW,
  },
  nft: {
    route: 'nft',
    initialGlobalSlots: 500,
    maxSlotsPerWallet: 5,
    requirementPerSlot: 3,
  },
} as const satisfies Record<CukieMasterRoute, CukieMasterRouteRule>;

export const CUKIE_MASTER_DAILY_CREDITS_PER_SLOT = 100;
export const CUKIE_MASTER_FIRST_CREDIT_DELAY_HOURS = 24;
export const CUKIE_MASTER_REQUIREMENT_GRACE_HOURS = 48;

export const CUKIE_MASTER_MAX_TOTAL_SLOTS_PER_WALLET =
  CUKIE_MASTER_ROUTE_RULES.uki.maxSlotsPerWallet +
  CUKIE_MASTER_ROUTE_RULES.nft.maxSlotsPerWallet;

export const CUKIE_MASTER_ORIGINAL_RARITY_POINTS = {
  common: 1,
  uncommon: 2,
  rare: 4,
  epic: 7,
  legendary: 10,
  goat: 15,
} as const;

function assertNonNegativeFinite(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative finite number.`);
  }
}

export function calculateCukieMasterRouteSlots(
  value: number,
  rule: CukieMasterRouteRule,
) {
  assertNonNegativeFinite(value, rule.route);
  const earnedSlots = Math.floor(value / rule.requirementPerSlot);
  return Math.min(earnedSlots, rule.maxSlotsPerWallet);
}

export function calculateCukieMasterUkiRouteSlotsRaw(valueRaw: string | bigint) {
  const value = typeof valueRaw === 'bigint' ? valueRaw : BigInt(valueRaw);
  if (value < BigInt(0)) throw new Error('eligibleUkiRaw must be non-negative.');

  return Math.min(
    Number(value / BigInt(CUKIE_MASTER_UKI_REQUIREMENT_RAW)),
    CUKIE_MASTER_ROUTE_RULES.uki.maxSlotsPerWallet,
  );
}

export function calculateCukieMasterSlots(input: {
  eligibleUki: number;
  originalCukiePoints: number;
}): CukieMasterSlotBreakdown {
  const ukiSlots = calculateCukieMasterRouteSlots(
    input.eligibleUki,
    CUKIE_MASTER_ROUTE_RULES.uki,
  );
  const nftSlots = calculateCukieMasterRouteSlots(
    input.originalCukiePoints,
    CUKIE_MASTER_ROUTE_RULES.nft,
  );

  return {
    ukiSlots,
    nftSlots,
    totalSlots: ukiSlots + nftSlots,
    maxTotalSlots: CUKIE_MASTER_MAX_TOTAL_SLOTS_PER_WALLET,
  };
}
