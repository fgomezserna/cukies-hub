import { createHash } from "node:crypto";

import { getAddress, isAddress } from "viem";

import { DomainValidationError } from "../errors";
import {
  AMBASSADOR_ATTRIBUTION_POLICIES,
  AMBASSADOR_ATTRIBUTION_POLICY,
  type AmbassadorAttribution,
  type AmbassadorAttributionPolicyVersion,
  type AmbassadorAttributionSource,
} from "./types";

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key.normalize("NFC"), stableValue(child)]),
    );
  }
  return typeof value === "string" ? value.normalize("NFC") : value;
}

export function stableAmbassadorHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function validAmbassadorWallet(value: unknown, label = "wallet") {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new DomainValidationError(`${label} debe ser una direccion EVM valida.`);
  }
  const normalized = getAddress(value).toLowerCase();
  if (/^0x0{40}$/i.test(normalized)) {
    throw new DomainValidationError(`${label} no puede ser la direccion cero.`);
  }
  return normalized;
}

function validDate(value: unknown, label: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainValidationError(`${label} debe ser una fecha valida.`);
  }
  return new Date(value.getTime());
}

function validHash(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new DomainValidationError(`${label} debe ser un sha256 canonico.`);
  }
  return value;
}

export function assertAmbassadorRuntime(
  environment: Record<string, string | undefined>,
) {
  const appEnvironment = environment.APP_ENV?.trim().toLowerCase();
  const publicChainId = Number(environment.NEXT_PUBLIC_UKI_CHAIN_ID);
  const indexerChainId = Number(environment.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID);
  if (appEnvironment === "staging") {
    if (
      environment.STAGING_ONLY_GUARD !== "true"
      || publicChainId !== 97
      || indexerChainId !== 97
    ) throw new TypeError("AMBASSADOR_RUNTIME_MISCONFIGURED");
    return {
      environment: "staging" as const,
      chainId: 97 as const,
      policy: AMBASSADOR_ATTRIBUTION_POLICY,
    };
  }
  if (appEnvironment === "production") {
    if (
      environment.STAGING_ONLY_GUARD === "true"
      || publicChainId !== 56
      || indexerChainId !== 56
    ) throw new TypeError("AMBASSADOR_RUNTIME_MISCONFIGURED");
    return {
      environment: "production" as const,
      chainId: 56 as const,
      policy: AMBASSADOR_ATTRIBUTION_POLICY,
    };
  }
  throw new TypeError("AMBASSADOR_RUNTIME_MISCONFIGURED");
}

export function assertAmbassadorInvitationCode(value: unknown) {
  if (typeof value !== "string") {
    throw new DomainValidationError("El codigo de invitacion no es valido.");
  }
  const normalized = value.trim().toLowerCase();
  if (!/^cw-[0-9a-f]{12}$/.test(normalized)) {
    throw new DomainValidationError("El codigo de invitacion no es valido.");
  }
  return normalized;
}

export function ambassadorInvitationCode(wallet: string) {
  const walletNormalized = validAmbassadorWallet(wallet);
  return `cw-${stableAmbassadorHash({
    kind: "ambassador-invitation-code-v1",
    walletNormalized,
  }).slice(0, 12)}`;
}

export function buildAmbassadorAttribution(input: {
  referredWallet: string;
  ambassadorWallet: string;
  source: AmbassadorAttributionSource;
  sourceReferenceHash: string;
  acceptedAt: Date;
  now: Date;
  policyVersion?: AmbassadorAttributionPolicyVersion;
}) {
  const referredWalletNormalized = validAmbassadorWallet(
    input.referredWallet,
    "referredWallet",
  );
  const ambassadorWalletNormalized = validAmbassadorWallet(
    input.ambassadorWallet,
    "ambassadorWallet",
  );
  if (referredWalletNormalized === ambassadorWalletNormalized) {
    throw new DomainValidationError("Una wallet no puede ser su propio embajador.");
  }
  const acceptedAt = validDate(input.acceptedAt, "acceptedAt");
  const now = validDate(input.now, "now");
  if (acceptedAt.getTime() > now.getTime()) {
    throw new DomainValidationError("acceptedAt no puede ser posterior a su materializacion.");
  }
  const sourceReferenceHash = validHash(
    input.sourceReferenceHash,
    "sourceReferenceHash",
  );
  if (input.source !== "presale_locked" && input.source !== "signed_wallet_session") {
    throw new DomainValidationError("La fuente de atribucion ambassador no esta soportada.");
  }
  const policy = AMBASSADOR_ATTRIBUTION_POLICIES[
    input.policyVersion ?? AMBASSADOR_ATTRIBUTION_POLICY.version
  ];
  if (!policy) {
    throw new DomainValidationError("La politica ambassador no esta soportada.");
  }
  const attributionId = `ambassador-attribution:${referredWalletNormalized}`;
  const immutable = {
    attributionId,
    referredWalletNormalized,
    ambassadorWalletNormalized,
    source: input.source,
    sourceReferenceHash,
    policyVersion: policy.version,
    commissionBpsSnapshot: policy.commissionBps,
    levelsSnapshot: policy.levels,
    acceptedAt,
  };
  return {
    _id: attributionId,
    ...immutable,
    evidenceHash: stableAmbassadorHash(immutable),
    createdAt: now,
    updatedAt: now,
  } satisfies AmbassadorAttribution;
}

export function assertAmbassadorAttribution(value: AmbassadorAttribution) {
  const policy = AMBASSADOR_ATTRIBUTION_POLICIES[value.policyVersion];
  if (!policy) {
    throw new DomainValidationError("La politica ambassador guardada no esta soportada.");
  }
  const expected = buildAmbassadorAttribution({
    referredWallet: value.referredWalletNormalized,
    ambassadorWallet: value.ambassadorWalletNormalized,
    source: value.source,
    sourceReferenceHash: value.sourceReferenceHash,
    acceptedAt: value.acceptedAt,
    now: value.createdAt,
    policyVersion: value.policyVersion,
  });
  const updatedAt = validDate(value.updatedAt, "updatedAt");
  if (
    value._id !== expected._id ||
    value.attributionId !== expected.attributionId ||
    value.referredWalletNormalized !== expected.referredWalletNormalized ||
    value.ambassadorWalletNormalized !== expected.ambassadorWalletNormalized ||
    value.source !== expected.source ||
    value.sourceReferenceHash !== expected.sourceReferenceHash ||
    value.policyVersion !== policy.version ||
    value.commissionBpsSnapshot !== policy.commissionBps ||
    value.levelsSnapshot !== policy.levels ||
    value.acceptedAt.getTime() !== expected.acceptedAt.getTime() ||
    value.evidenceHash !== expected.evidenceHash ||
    updatedAt.getTime() !== value.createdAt.getTime()
  ) {
    throw new DomainValidationError("La atribucion ambassador no coincide con su evidencia.");
  }
  return value;
}
