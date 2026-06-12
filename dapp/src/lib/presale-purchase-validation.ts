export function isBelowContractMinimumPurchase(amount?: bigint | null, minimum?: bigint | null) {
  if (!amount || minimum === undefined || minimum === null || minimum <= BigInt(0)) return false;

  return amount < minimum;
}
