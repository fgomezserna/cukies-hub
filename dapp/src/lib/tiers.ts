export const tiers = [
  { name: 'Hyppie Master', minXP: 50000, color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  { name: 'Hyperliquid Veteran', minXP: 20000, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  { name: 'Gold', minXP: 10000, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' },
  { name: 'Silver', minXP: 5000, color: 'text-gray-400', bgColor: 'bg-gray-400/10' },
  { name: 'Bronze', minXP: 1000, color: 'text-amber-600', bgColor: 'bg-amber-600/10' },
  { name: 'Rookie', minXP: 0, color: 'text-gray-500', bgColor: 'bg-gray-500/10' },
];

export function getUserTier(xp: number) {
  return tiers.find(tier => xp >= tier.minXP) || tiers[tiers.length - 1];
}

export function getNextTier(xp: number) {
  const currentTierIndex = tiers.findIndex(tier => xp >= tier.minXP);
  if (currentTierIndex > 0) {
    return tiers[currentTierIndex - 1];
  }
  return null; // Already at the highest tier
}

export function getProgressToNextTier(xp: number) {
  const nextTier = getNextTier(xp);
  if (!nextTier) return { progress: 100, xpNeeded: 0 }; // Already at max tier
  
  const currentTier = getUserTier(xp);
  const currentTierXP = currentTier.minXP;
  const nextTierXP = nextTier.minXP;
  
  const progress = ((xp - currentTierXP) / (nextTierXP - currentTierXP)) * 100;
  const xpNeeded = nextTierXP - xp;
  
  return { progress: Math.min(progress, 100), xpNeeded: Math.max(xpNeeded, 0) };
} 