export const AMBASSADOR_ATTRIBUTION_POLICIES = Object.freeze({
  "ambassador-direct-staging-v1": Object.freeze({
    version: "ambassador-direct-staging-v1",
    commissionBps: 500,
    levels: 1,
  }),
} as const);

export type AmbassadorAttributionPolicyVersion =
  keyof typeof AMBASSADOR_ATTRIBUTION_POLICIES;

export const AMBASSADOR_ATTRIBUTION_POLICY =
  AMBASSADOR_ATTRIBUTION_POLICIES["ambassador-direct-staging-v1"];

export type AmbassadorAttributionSource =
  | "presale_locked"
  | "signed_wallet_session";

export type AmbassadorAttribution = {
  _id: string;
  attributionId: string;
  referredWalletNormalized: string;
  ambassadorWalletNormalized: string;
  source: AmbassadorAttributionSource;
  sourceReferenceHash: string;
  policyVersion: AmbassadorAttributionPolicyVersion;
  commissionBpsSnapshot: number;
  levelsSnapshot: number;
  acceptedAt: Date;
  evidenceHash: string;
  createdAt: Date;
  updatedAt: Date;
};

export type LockedPresaleAmbassador = {
  referredWalletNormalized: string;
  ambassadorWalletNormalized: string;
  lockedAt: Date;
  sourceReferenceHash: string;
};

export interface AmbassadorAttributionRepository {
  findAttribution(referredWalletNormalized: string): Promise<AmbassadorAttribution | null>;
  findLockedPresaleAmbassador(
    referredWalletNormalized: string,
  ): Promise<LockedPresaleAmbassador | null>;
  insertAttribution(attribution: AmbassadorAttribution): Promise<"inserted" | "duplicate">;
}
