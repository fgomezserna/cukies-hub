export const AMBASSADOR_ECONOMY_COLLECTIONS = [
  "ambassador_attributions",
] as const;

export const AMBASSADOR_ECONOMY_INDEX_DEFINITIONS = [
  {
    collection: "ambassador_attributions",
    keys: { referredWalletNormalized: 1 },
    options: { unique: true, name: "ambassador_referred_wallet_unique" },
  },
  {
    collection: "ambassador_attributions",
    keys: { ambassadorWalletNormalized: 1, acceptedAt: -1, _id: 1 },
    options: { name: "ambassador_direct_referrals" },
  },
  {
    collection: "ambassador_attributions",
    keys: { source: 1, policyVersion: 1, acceptedAt: -1 },
    options: { name: "ambassador_policy_audit" },
  },
] as const;
