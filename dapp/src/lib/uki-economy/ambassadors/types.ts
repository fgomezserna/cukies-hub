export const AMBASSADOR_ATTRIBUTION_POLICIES = Object.freeze({
  "ambassador-direct-v1": Object.freeze({
    version: "ambassador-direct-v1",
    commissionBps: 500,
    levels: 1,
  }),
  // Las filas históricas creadas antes de la política neutral por entorno
  // siguen siendo legibles. Las nuevas usan siempre ambassador-direct-v1.
  "ambassador-direct-staging-v1": Object.freeze({
    version: "ambassador-direct-staging-v1",
    commissionBps: 500,
    levels: 1,
  }),
} as const);

export type AmbassadorAttributionPolicyVersion =
  keyof typeof AMBASSADOR_ATTRIBUTION_POLICIES;

export const AMBASSADOR_ATTRIBUTION_POLICY =
  AMBASSADOR_ATTRIBUTION_POLICIES["ambassador-direct-v1"];

export type AmbassadorAttributionSource =
  | "presale_locked"
  | "presale_default"
  | "signed_wallet_session"
  | "admin_override";

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

export type AmbassadorProfile = {
  _id: string;
  walletNormalized: string;
  invitationCode: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AmbassadorEnrollment = {
  isPresaleParticipant: boolean;
  isCukieMaster?: boolean | null;
  hasConfirmedSponsor?: boolean;
  canChooseSponsor: boolean;
  canInvite: boolean;
  eligibilityReason?: string | null;
};

export type AmbassadorEligibility = {
  isCukieMaster: boolean | null;
  reason: string | null;
  sourceHash: string | null;
  observedAt: Date;
};

export interface AmbassadorAttributionRepository {
  acquireGraphWriteFence(now: Date): Promise<void>;
  hasPresaleParticipation(referredWalletNormalized: string): Promise<boolean>;
  findAttribution(
    referredWalletNormalized: string,
    effectiveAt?: Date,
  ): Promise<AmbassadorAttribution | null>;
  findLockedPresaleAmbassador(
    referredWalletNormalized: string
  ): Promise<LockedPresaleAmbassador | null>;
  insertAttribution(
    attribution: AmbassadorAttribution
  ): Promise<"inserted" | "duplicate">;
}
