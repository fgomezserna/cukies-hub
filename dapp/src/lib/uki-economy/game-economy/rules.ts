import "server-only";
import { assertEconomyCycleCalendar } from '../cycle-calendar';

import { createHash } from "node:crypto";

import { normalizeWalletAddress } from "@/lib/wallet-address";

import { DomainConflictError, DomainValidationError } from "../errors";
import {
  GAME_ECONOMY_RULE_SCOPE,
  GAME_ECONOMY_SESSION_STATUSES,
  type GameDistributionAllocation,
  type GameDistributionParticipant,
  type GameEconomyCalculationRule,
  type GameEconomyResourceKind,
  type GameEconomyRule,
  type GameEconomyRuleSnapshot,
  type GameEconomySession,
  type GameScoreResult,
} from "./types";

const MAX_TEXT_LENGTH = 160;
const MIN_SESSION_TTL_MS = 10_000;
const MAX_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_LEASE_MS = 1_000;
const MAX_LEASE_MS = 15 * 60 * 1000;
const MAX_CUKIE_ASSETS = 100;
const UINT256_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);
const TERMINAL_SESSION_STATUS = new Set([
  "settled",
  "forfeited",
  "expired",
  "rejected",
]);
export const GAME_ECONOMY_MAX_CONVERTIBLE_RAW = "7500000000000000000" as const;

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key.normalize("NFC"), child] as const)
      .sort(([left], [right]) => compareText(left, right));
    if (new Set(entries.map(([key]) => key)).size !== entries.length) {
      throw new DomainValidationError(
        "La configuracion contiene claves duplicadas tras normalizacion NFC."
      );
    }
    return Object.fromEntries(
      entries.map(([key, child]) => [key, stableValue(child)])
    );
  }
  return typeof value === "string" ? value.normalize("NFC") : value;
}

export function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function stableGameEconomyHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function validGameText(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new DomainValidationError(`${label} debe ser texto.`);
  }
  const normalized = value.trim().normalize("NFC");
  if (
    normalized.length === 0 ||
    normalized.length > MAX_TEXT_LENGTH ||
    !/^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(normalized)
  ) {
    throw new DomainValidationError(`${label} tiene un formato no permitido.`);
  }
  return normalized;
}

export function validGameDate(value: unknown, label: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainValidationError(`${label} debe ser una fecha valida.`);
  }
  return new Date(value.getTime());
}

export function validGameWallet(value: unknown) {
  if (typeof value !== "string" || value.length > 80) {
    throw new DomainValidationError("walletAddress no es valida.");
  }
  const normalized = normalizeWalletAddress(value);
  const evm = /^0x[0-9a-f]{40}$/.test(normalized);
  const tron = /^T[1-9A-HJ-NP-Za-km-z]{25,40}$/.test(normalized);
  if ((!evm && !tron) || /^0x0{40}$/.test(normalized)) {
    throw new DomainValidationError("walletAddress no es valida.");
  }
  return normalized;
}

export function parseCanonicalRaw(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9]\d*)$/.test(value) ||
    value.length > 78
  ) {
    throw new DomainValidationError(
      `${label} debe ser un entero decimal canonico sin signo.`
    );
  }
  const parsed = BigInt(value);
  if (parsed > UINT256_MAX) {
    throw new DomainValidationError(`${label} excede uint256.`);
  }
  return parsed;
}

function validInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new DomainValidationError(
      `${label} debe ser un entero entre ${minimum} y ${maximum}.`
    );
  }
  return value;
}

export function gameRuleConfigPayload(rule: GameEconomyRuleSnapshot) {
  return {
    ...(rule.calendar ? { calendar: rule.calendar } : {}),
    gameId: rule.gameId,
    version: rule.version,
    sessionTtlMs: rule.sessionTtlMs,
    operationLeaseMs: rule.operationLeaseMs,
    credit: rule.credit,
    reward: rule.reward,
    cukie: rule.cukie,
    calculation: rule.calculation,
  };
}

export function buildGameRuleConfigHash(rule: GameEconomyRuleSnapshot) {
  return stableGameEconomyHash(gameRuleConfigPayload(rule));
}

function assertCalculationRule(rule: GameEconomyCalculationRule) {
  parseCanonicalRaw(rule.scoreCapRaw, "calculation.scoreCapRaw");
  parseCanonicalRaw(rule.weightNumeratorRaw, "calculation.weightNumeratorRaw");
  const denominator = parseCanonicalRaw(
    rule.weightDenominatorRaw,
    "calculation.weightDenominatorRaw"
  );
  if (denominator === BigInt(0)) {
    throw new DomainValidationError(
      "calculation.weightDenominatorRaw no puede ser cero."
    );
  }
}

function assertRewardBinding(rule: GameEconomyRuleSnapshot) {
  if (
    !rule.reward
    || validGameText(
      rule.reward.rewardRuleVersion,
      "rule.reward.rewardRuleVersion",
    ) !== rule.reward.rewardRuleVersion
    || !/^[0-9a-f]{64}$/.test(rule.reward.rewardRuleConfigHash)
  ) {
    throw new DomainValidationError("Binding de rewards invalido.");
  }
  const configuredMaximum = parseCanonicalRaw(
    rule.reward.maxConvertibleRaw,
    "rule.reward.maxConvertibleRaw",
  );
  if (configuredMaximum === BigInt(0)) {
    throw new DomainValidationError("El maximo convertible debe ser positivo.");
  }
  const scoreCap = parseCanonicalRaw(
    rule.calculation.scoreCapRaw,
    "calculation.scoreCapRaw",
  );
  const numerator = parseCanonicalRaw(
    rule.calculation.weightNumeratorRaw,
    "calculation.weightNumeratorRaw",
  );
  const denominator = parseCanonicalRaw(
    rule.calculation.weightDenominatorRaw,
    "calculation.weightDenominatorRaw",
  );
  const maximum = (scoreCap * numerator) / denominator;
  if (maximum !== configuredMaximum) {
    throw new DomainValidationError(
      "La formula de GameEconomy no alcanza exactamente el maximo convertible versionado.",
    );
  }
}

export function assertProductiveGameRewardBinding(
  rule: GameEconomyRuleSnapshot,
) {
  assertRewardBinding(rule);
  if (rule.reward.maxConvertibleRaw !== GAME_ECONOMY_MAX_CONVERTIBLE_RAW) {
    throw new DomainValidationError(
      "El maximo convertible productivo debe ser exactamente 7.5 UKI raw.",
    );
  }
  return rule.reward;
}

export function assertGameEconomyRuleSnapshot(
  rule: GameEconomyRuleSnapshot
) {
  if (!rule || typeof rule !== "object") {
    throw new DomainValidationError("La regla de juego es obligatoria.");
  }
  assertEconomyCycleCalendar(rule.calendar);
  if (
    validGameText(rule.gameId, "rule.gameId") !== rule.gameId ||
    validGameText(rule.version, "rule.version") !== rule.version
  ) {
    throw new DomainValidationError("La regla no esta en forma canonica.");
  }
  validInteger(
    rule.sessionTtlMs,
    "rule.sessionTtlMs",
    MIN_SESSION_TTL_MS,
    MAX_SESSION_TTL_MS
  );
  validInteger(
    rule.operationLeaseMs,
    "rule.operationLeaseMs",
    MIN_LEASE_MS,
    MAX_LEASE_MS
  );
  if (
    !rule.credit ||
    typeof rule.credit.required !== "boolean" ||
    typeof rule.credit.consumeOnSettle !== "boolean" ||
    validGameText(rule.credit.costCode, "rule.credit.costCode") !==
      rule.credit.costCode ||
    validGameText(rule.credit.creditRuleVersion, "rule.credit.creditRuleVersion") !==
      rule.credit.creditRuleVersion ||
    !/^[0-9a-f]{64}$/.test(rule.credit.creditRuleConfigHash)
  ) {
    throw new DomainValidationError("Config de creditos invalida.");
  }
  if (
    !rule.cukie ||
    typeof rule.cukie.required !== "boolean" ||
    typeof rule.cukie.consumeOnSettle !== "boolean" ||
    validGameText(rule.cukie.role, "rule.cukie.role") !== rule.cukie.role ||
    ![
      "pool_only_v1",
      "owned_bsc_quota_then_pool_v1",
      "legacy_client_assets_v1",
    ].includes(rule.cukie.selectionPolicy)
  ) {
    throw new DomainValidationError("Config de Cukie invalida.");
  }
  validInteger(rule.cukie.minAssets, "rule.cukie.minAssets", 0, MAX_CUKIE_ASSETS);
  validInteger(rule.cukie.maxAssets, "rule.cukie.maxAssets", 0, MAX_CUKIE_ASSETS);
  const usesServerSelection =
    rule.cukie.required &&
    (rule.cukie.role === "pool" || rule.cukie.role === "own_or_pool");
  const policyMatchesRole =
    (rule.cukie.role === "pool" && rule.cukie.selectionPolicy === "pool_only_v1") ||
    (rule.cukie.role === "own_or_pool" &&
      rule.cukie.selectionPolicy === "owned_bsc_quota_then_pool_v1") ||
    (!usesServerSelection && rule.cukie.selectionPolicy === "legacy_client_assets_v1");
  if (
    rule.cukie.minAssets > rule.cukie.maxAssets ||
    !policyMatchesRole ||
    (rule.cukie.required && !usesServerSelection && rule.cukie.minAssets < 1) ||
    (usesServerSelection && (rule.cukie.minAssets !== 0 || rule.cukie.maxAssets !== 0)) ||
    (!rule.cukie.required &&
      (rule.cukie.minAssets !== 0 || rule.cukie.maxAssets !== 0))
  ) {
    throw new DomainValidationError("Limites de Cukie incoherentes.");
  }
  assertCalculationRule(rule.calculation);
  assertRewardBinding(rule);
  if (
    !/^[0-9a-f]{64}$/.test(rule.configHash) ||
    buildGameRuleConfigHash(rule) !== rule.configHash
  ) {
    throw new DomainConflictError("configHash de regla de juego no coincide.");
  }
  return rule;
}

export function assertGameEconomyRule(rule: GameEconomyRule) {
  assertGameEconomyRuleSnapshot(rule);
  if (
    rule.scope !== GAME_ECONOMY_RULE_SCOPE ||
    validGameText(rule._id, "rule._id") !== rule._id ||
    typeof rule.active !== "boolean"
  ) {
    throw new DomainValidationError("Documento de regla de juego invalido.");
  }
  const activeFrom = validGameDate(rule.activeFrom, "rule.activeFrom");
  const createdAt = validGameDate(rule.createdAt, "rule.createdAt");
  const updatedAt = validGameDate(rule.updatedAt, "rule.updatedAt");
  if (
    rule._id !== `${rule.gameId}:${rule.version}` ||
    (rule.activeUntil &&
      validGameDate(rule.activeUntil, "rule.activeUntil").getTime() <=
        activeFrom.getTime()) ||
    updatedAt.getTime() < createdAt.getTime()
  ) {
    throw new DomainValidationError("Metadatos de regla de juego incoherentes.");
  }
  return rule;
}

export function toGameRuleSnapshot(
  rule: GameEconomyRule
): GameEconomyRuleSnapshot {
  assertGameEconomyRule(rule);
  return {
    ...(rule.calendar ? { calendar: { ...rule.calendar } } : {}),
    gameId: rule.gameId,
    version: rule.version,
    configHash: rule.configHash,
    sessionTtlMs: rule.sessionTtlMs,
    operationLeaseMs: rule.operationLeaseMs,
    credit: { ...rule.credit },
    reward: { ...rule.reward },
    cukie: { ...rule.cukie },
    calculation: { ...rule.calculation },
  };
}

export function canonicalCukieAssetIds(
  values: unknown,
  rule: GameEconomyRuleSnapshot
) {
  if (!Array.isArray(values)) {
    throw new DomainValidationError("cukieAssetIds debe ser una lista.");
  }
  const normalized = values.map((value, index) =>
    validGameText(value, `cukieAssetIds.${index}`)
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new DomainValidationError("cukieAssetIds contiene duplicados.");
  }
  normalized.sort(compareText);
  if (
    normalized.length < rule.cukie.minAssets ||
    normalized.length > rule.cukie.maxAssets
  ) {
    throw new DomainValidationError(
      `La sesion requiere entre ${rule.cukie.minAssets} y ${rule.cukie.maxAssets} Cukies.`
    );
  }
  return normalized;
}

export function buildGameCreateRequestHash(input: {
  walletNormalized: string;
  gameId: string;
  cukieAssetIds: string[];
  expectedRuleVersion: string | null;
}) {
  return stableGameEconomyHash({
    walletNormalized: input.walletNormalized,
    gameId: input.gameId,
    cukieAssetIds: input.cukieAssetIds,
    expectedRuleVersion: input.expectedRuleVersion,
  });
}

export function buildGameStartRequestHash(input: {
  sessionId: string;
  walletNormalized: string;
}) {
  return stableGameEconomyHash(input);
}

export function buildGameSubmissionRequestHash(input: {
  sessionId: string;
  walletNormalized: string;
  evidenceReference: string;
  payloadHash: string;
}) {
  return stableGameEconomyHash(input);
}

export function buildGameValidationRequestHash(sessionId: string) {
  return stableGameEconomyHash({ sessionId });
}

export function buildGameSettlementRequestHash(input: {
  sessionId: string;
  resourceActions: {
    credit: "consume" | "release";
    cukie: "consume" | "release";
  };
}) {
  return stableGameEconomyHash(input);
}

export function buildLegacyGameSettlementRequestHash(sessionId: string) {
  return stableGameEconomyHash({ sessionId: validGameText(sessionId, "sessionId") });
}

export function buildGameTerminalRequestHash(input: {
  sessionId: string;
  status: "expired" | "rejected" | "forfeited";
  reasonCode: string;
}) {
  return stableGameEconomyHash(input);
}

export function buildGameValidationResultHash(input: {
  sessionId: string;
  ruleConfigHash: string;
  submissionEvidenceReference: string;
  submissionPayloadHash: string;
  evidenceId: string;
  evidenceHash: string;
  scoreRaw: string;
  cappedScoreRaw: string;
  weightRaw: string;
}) {
  return stableGameEconomyHash(input);
}

export function buildGameResourceReservationRequestHash(input: {
  kind: GameEconomyResourceKind;
  sessionId: string;
  walletNormalized: string;
  gameId: string;
  rule: GameEconomyRuleSnapshot;
  cukieAssetIds: string[];
  expiresAt: Date;
}) {
  return stableGameEconomyHash({
    kind: input.kind,
    sessionId: input.sessionId,
    walletNormalized: input.walletNormalized,
    gameId: input.gameId,
    ruleVersion: input.rule.version,
    ruleConfigHash: input.rule.configHash,
    expiresAt: input.expiresAt,
    resource:
      input.kind === "credit"
        ? {
            costCode: input.rule.credit.costCode,
            creditRuleVersion: input.rule.credit.creditRuleVersion,
            creditRuleConfigHash: input.rule.credit.creditRuleConfigHash,
          }
        : { role: input.rule.cukie.role, assetIds: input.cukieAssetIds },
  });
}

export function buildGameResourceReservationResultHash(input: {
  requestHash: string;
  reservationId: string;
  evidenceHash: string;
}) {
  return stableGameEconomyHash({
    requestHash: input.requestHash,
    reservationId: input.reservationId,
    evidenceHash: input.evidenceHash,
  });
}

export function calculateGameScore(
  rule: GameEconomyCalculationRule,
  verifiedScoreRaw: string
): GameScoreResult {
  assertCalculationRule(rule);
  const score = parseCanonicalRaw(verifiedScoreRaw, "verifiedScoreRaw");
  const cap = parseCanonicalRaw(rule.scoreCapRaw, "scoreCapRaw");
  const numerator = parseCanonicalRaw(
    rule.weightNumeratorRaw,
    "weightNumeratorRaw"
  );
  const denominator = parseCanonicalRaw(
    rule.weightDenominatorRaw,
    "weightDenominatorRaw"
  );
  const capped = score > cap ? cap : score;
  const weight = (capped * numerator) / denominator;
  if (weight > UINT256_MAX) {
    throw new DomainValidationError("El peso calculado excede uint256.");
  }
  return {
    scoreRaw: score.toString(10),
    cappedScoreRaw: capped.toString(10),
    weightRaw: weight.toString(10),
  };
}

export function distributeGameAmountExact(
  totalRaw: string,
  participants: readonly GameDistributionParticipant[]
): GameDistributionAllocation[] {
  const total = parseCanonicalRaw(totalRaw, "totalRaw");
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new DomainValidationError("participants no puede estar vacio.");
  }
  if (participants.length > 10_000) {
    throw new DomainValidationError("participants excede el limite seguro.");
  }
  const normalized = participants.map((participant) => ({
    participantId: validGameText(
      participant.participantId,
      "participantId"
    ),
    weight: parseCanonicalRaw(participant.weightRaw, "participant.weightRaw"),
  }));
  if (new Set(normalized.map((item) => item.participantId)).size !== normalized.length) {
    throw new DomainValidationError("participantId debe ser unico.");
  }
  const totalWeight = normalized.reduce(
    (sum, item) => sum + item.weight,
    BigInt(0)
  );
  if (totalWeight === BigInt(0)) {
    throw new DomainValidationError("El peso total no puede ser cero.");
  }
  const provisional = normalized.map((item) => {
    const product = total * item.weight;
    return {
      participantId: item.participantId,
      amount: product / totalWeight,
      remainder: product % totalWeight,
    };
  });
  const allocated = provisional.reduce(
    (sum, item) => sum + item.amount,
    BigInt(0)
  );
  const undistributed = total - allocated;
  if (undistributed < BigInt(0) || undistributed >= BigInt(provisional.length)) {
    throw new DomainConflictError(
      "El reparto proporcional no conserva el resto esperado."
    );
  }
  // Conversion exacta: el resto esta probado por debajo de las <= 10.000 filas.
  const remainderUnits = Number(undistributed);
  const priority = [...provisional].sort(
    (left, right) =>
      left.remainder === right.remainder
        ? compareText(left.participantId, right.participantId)
        : left.remainder > right.remainder
          ? -1
          : 1
  );
  for (let index = 0; index < remainderUnits; index += 1) {
    priority[index].amount += BigInt(1);
  }
  return provisional
    .sort((left, right) => compareText(left.participantId, right.participantId))
    .map((item) => ({
      participantId: item.participantId,
      amountRaw: item.amount.toString(10),
    }));
}

export function assertGameSessionIntegrity(session: GameEconomySession) {
  if (!session || session._id !== session.sessionId) {
    throw new DomainConflictError("Documento de sesion manipulado.");
  }
  const wallet = validGameWallet(session.walletNormalized);
  const gameId = validGameText(session.gameId, "session.gameId");
  assertGameEconomyRuleSnapshot(session.rule);
  validGameDate(session.createdAt, "session.createdAt");
  validGameDate(session.updatedAt, "session.updatedAt");
  validGameDate(session.expiresAt, "session.expiresAt");
  if (
    wallet !== session.walletNormalized ||
    gameId !== session.gameId ||
    gameId !== session.rule.gameId ||
    !GAME_ECONOMY_SESSION_STATUSES.includes(session.status) ||
    !Number.isSafeInteger(session.revision) ||
    session.revision < 0 ||
    !Number.isSafeInteger(session.fenceToken) ||
    session.fenceToken < 0 ||
    session.expiresAt.getTime() !==
      session.createdAt.getTime() + session.rule.sessionTtlMs ||
    session.updatedAt.getTime() < session.createdAt.getTime()
  ) {
    throw new DomainConflictError("Invariantes de sesion no coinciden.");
  }
  if (
    session.expectedRuleVersion !== null &&
    (validGameText(session.expectedRuleVersion, "expectedRuleVersion") !==
      session.expectedRuleVersion ||
      session.expectedRuleVersion !== session.rule.version)
  ) {
    throw new DomainConflictError("expectedRuleVersion no es canonica.");
  }
  function assertCommand(
    command: GameEconomySession["createCommand"],
    label: string
  ) {
    if (
      validGameText(command?.idempotencyKey, `${label}.idempotencyKey`) !==
        command.idempotencyKey ||
      !/^[0-9a-f]{64}$/.test(command.requestHash) ||
      !Number.isSafeInteger(command.resultingRevision) ||
      command.resultingRevision < 0 ||
      command.resultingRevision > session.revision
    ) {
      throw new DomainConflictError(`${label} esta manipulado.`);
    }
    validGameDate(command.completedAt, `${label}.completedAt`);
  }
  assertCommand(session.createCommand, "createCommand");
  if (
    session.createCommand.resultingRevision !== 0 ||
    session.createCommand.requestHash !==
      buildGameCreateRequestHash({
        walletNormalized: session.walletNormalized,
        gameId: session.gameId,
        cukieAssetIds: session.cukieAssetIds,
        expectedRuleVersion: session.expectedRuleVersion,
      }) ||
    session.sessionId !==
      gameSessionId(
        session.createCommand.idempotencyKey,
        session.createCommand.requestHash
      )
  ) {
    throw new DomainConflictError("Identidad de sesion no coincide.");
  }
  if (session.startCommand) {
    assertCommand(session.startCommand, "startCommand");
    if (
      session.startCommand.requestHash !==
      buildGameStartRequestHash({
        sessionId: session.sessionId,
        walletNormalized: session.walletNormalized,
      })
    ) {
      throw new DomainConflictError("startCommand no liga su payload.");
    }
  }
  if (session.submission) {
    assertCommand(session.submission.command, "submission.command");
    validGameText(session.submission.evidenceReference, "evidenceReference");
    validGameDate(session.submission.submittedAt, "submission.submittedAt");
    if (
      !/^[0-9a-f]{64}$/.test(session.submission.payloadHash) ||
      session.submission.command.requestHash !==
        buildGameSubmissionRequestHash({
          sessionId: session.sessionId,
          walletNormalized: session.walletNormalized,
          evidenceReference: session.submission.evidenceReference,
          payloadHash: session.submission.payloadHash,
        })
    ) {
      throw new DomainConflictError("payloadHash de submission manipulado.");
    }
  }
  if (session.validation) {
    assertCommand(session.validation.command, "validation.command");
    validGameText(session.validation.evidenceId, "validation.evidenceId");
    validGameDate(session.validation.verifiedAt, "validation.verifiedAt");
    const calculated = calculateGameScore(
      session.rule.calculation,
      session.validation.scoreRaw
    );
    if (
      !session.submission ||
      session.validation.command.requestHash !==
        buildGameValidationRequestHash(session.sessionId) ||
      session.validation.verifier !== "server_authorized" ||
      !/^[0-9a-f]{64}$/.test(session.validation.evidenceHash) ||
      calculated.cappedScoreRaw !== session.validation.cappedScoreRaw ||
      calculated.weightRaw !== session.validation.weightRaw ||
      session.validation.resultHash !==
        buildGameValidationResultHash({
          sessionId: session.sessionId,
          ruleConfigHash: session.rule.configHash,
          submissionEvidenceReference:
            session.submission?.evidenceReference ?? "missing",
          submissionPayloadHash: session.submission?.payloadHash ?? "missing",
          evidenceId: session.validation.evidenceId,
          evidenceHash: session.validation.evidenceHash,
          scoreRaw: session.validation.scoreRaw,
          cappedScoreRaw: session.validation.cappedScoreRaw,
          weightRaw: session.validation.weightRaw,
        })
    ) {
      throw new DomainConflictError("Validacion de resultado manipulada.");
    }
  }
  if (session.settlementCommand) {
    assertCommand(session.settlementCommand, "settlementCommand");
    if (
      session.settlementCommand.requestHash !==
      (session.settlementIntent && !session.settlementIntent.resourceActions
        ? buildLegacyGameSettlementRequestHash(session.sessionId)
        : buildGameSettlementRequestHash({
            sessionId: session.sessionId,
            resourceActions: session.settlementIntent?.resourceActions ?? {
              credit: session.rule.credit.consumeOnSettle ? "consume" : "release",
              cukie: session.rule.cukie.consumeOnSettle ? "consume" : "release",
            },
          }))
    ) {
      throw new DomainConflictError("settlementCommand no liga su payload.");
    }
  }
  if (session.terminal) {
    assertCommand(session.terminal.command, "terminal.command");
    validGameText(session.terminal.reasonCode, "terminal.reasonCode");
    validGameDate(session.terminal.terminalAt, "terminal.terminalAt");
  }
  function assertIntent(
    intent: {
      idempotencyKey: string;
      requestHash: string;
      decidedAt: Date;
    },
    label: string
  ) {
    validGameText(intent.idempotencyKey, `${label}.idempotencyKey`);
    if (!/^[0-9a-f]{64}$/.test(intent.requestHash)) {
      throw new DomainConflictError(`${label}.requestHash manipulado.`);
    }
    validGameDate(intent.decidedAt, `${label}.decidedAt`);
  }
  if (session.settlementIntent) {
    assertIntent(session.settlementIntent, "settlementIntent");
    const actions = session.settlementIntent.resourceActions;
    const expectedHash = actions
      ? buildGameSettlementRequestHash({ sessionId: session.sessionId, resourceActions: actions })
      : buildLegacyGameSettlementRequestHash(session.sessionId);
    if (
      (actions && (
        !["consume", "release"].includes(actions.credit) ||
        !["consume", "release"].includes(actions.cukie)
      )) ||
      session.settlementIntent.requestHash !== expectedHash
    ) {
      throw new DomainConflictError("settlementIntent no liga su payload.");
    }
  }
  if (session.terminalIntent) {
    assertIntent(session.terminalIntent, "terminalIntent");
    validGameText(session.terminalIntent.reasonCode, "terminalIntent.reasonCode");
    if (
      session.terminalIntent.requestHash !==
      buildGameTerminalRequestHash({
        sessionId: session.sessionId,
        status: session.terminalIntent.status,
        reasonCode: session.terminalIntent.reasonCode,
      })
    ) {
      throw new DomainConflictError("terminalIntent no liga su payload.");
    }
  }
  const latestLifecycleDate =
    session.validation?.verifiedAt ??
    session.submission?.submittedAt ??
    session.startedAt ??
    session.createdAt;
  if (
    (session.settlementIntent &&
      session.settlementIntent.decidedAt.getTime() <
        latestLifecycleDate.getTime()) ||
    (session.terminalIntent &&
      session.terminalIntent.decidedAt.getTime() <
        latestLifecycleDate.getTime()) ||
    (session.settledAt &&
      session.settlementIntent &&
      session.settledAt.getTime() <
        session.settlementIntent.decidedAt.getTime()) ||
    (session.terminal &&
      session.terminalIntent &&
      session.terminal.terminalAt.getTime() <
        session.terminalIntent.decidedAt.getTime())
  ) {
    throw new DomainConflictError("La cronologia de decisiones retrocede.");
  }
  const canonicalAssets = canonicalCukieAssetIds(
    session.cukieAssetIds,
    session.rule
  );
  if (
    canonicalAssets.length !== session.cukieAssetIds.length ||
    canonicalAssets.some((assetId, index) => assetId !== session.cukieAssetIds[index])
  ) {
    throw new DomainConflictError("cukieAssetIds no esta en forma canonica.");
  }
  for (const [kind, resource, required] of [
    ["credit", session.credit, session.rule.credit.required],
    ["cukie", session.cukie, session.rule.cukie.required],
  ] as const) {
    const expectedReservationRequestHash =
      buildGameResourceReservationRequestHash({
        kind,
        sessionId: session.sessionId,
        walletNormalized: session.walletNormalized,
        gameId: session.gameId,
        rule: session.rule,
        cukieAssetIds: session.cukieAssetIds,
        expiresAt: session.expiresAt,
      });
    if (
      resource.kind !== kind ||
      !["not_required", "pending", "active", "consumed", "released"].includes(
        resource.state
      ) ||
      resource.operationIdempotencyKey !== `${session.sessionId}:${kind}` ||
      resource.reservationRequestHash !== expectedReservationRequestHash ||
      (required && resource.state === "not_required") ||
      (!required && resource.state !== "not_required") ||
      ((resource.state === "active" || resource.state === "consumed") &&
        required &&
        (!resource.reservationId ||
          !resource.evidenceHash ||
          !resource.reservationResultHash)) ||
      (resource.reservationId !== null &&
        validGameText(resource.reservationId, `${kind}.reservationId`) !==
          resource.reservationId) ||
      (resource.evidenceHash !== null &&
        !/^[0-9a-f]{64}$/.test(resource.evidenceHash)) ||
      ((resource.reservationId === null) !==
        (resource.evidenceHash === null)) ||
      ((resource.reservationId === null) !==
        (resource.reservationResultHash === null)) ||
      ((resource.reservationId === null || resource.evidenceHash === null) &&
        resource.reservationResultHash !== null) ||
      (resource.reservationId !== null &&
        resource.evidenceHash !== null &&
        resource.reservationResultHash !==
          buildGameResourceReservationResultHash({
            requestHash: resource.reservationRequestHash,
            reservationId: resource.reservationId,
            evidenceHash: resource.evidenceHash,
          })) ||
      ((resource.state === "pending" || resource.state === "not_required") &&
        (resource.reservationId !== null || resource.evidenceHash !== null))
    ) {
      throw new DomainConflictError(`Recurso ${kind} incoherente.`);
    }
    validGameDate(resource.updatedAt, `${kind}.updatedAt`);
    if (resource.updatedAt.getTime() > session.updatedAt.getTime()) {
      throw new DomainConflictError(`updatedAt de ${kind} esta en el futuro.`);
    }
  }
  const requiresReadyResources = [
    "resources_reserved",
    "started",
    "submitted",
    "validated",
    "settled",
  ].includes(session.status);
  const settledActions = session.settlementIntent?.resourceActions ?? {
    credit: session.rule.credit.consumeOnSettle ? "consume" as const : "release" as const,
    cukie: session.rule.cukie.consumeOnSettle ? "consume" as const : "release" as const,
  };
  const settledCreditState = settledActions.credit === "consume"
    ? "consumed"
    : "released";
  const settledCukieState = settledActions.cukie === "consume"
    ? "consumed"
    : "released";
  if (session.operation) {
    validGameDate(session.operation.acquiredAt, "operation.acquiredAt");
    validGameDate(session.operation.leaseExpiresAt, "operation.leaseExpiresAt");
  }
  if (
    !["reserving", "compensating", "ready"].includes(
      session.reservationPhase
    ) ||
    (requiresReadyResources && session.reservationPhase !== "ready") ||
    (requiresReadyResources &&
      [session.credit, session.cukie].some(
        (resource) => resource.state === "pending"
      )) ||
    (["started", "submitted", "validated", "settled"].includes(
      session.status
    ) &&
      (!session.startedAt || !session.startCommand)) ||
    (["submitted", "validated", "settled"].includes(session.status) &&
      !session.submission) ||
    (["validated", "settled"].includes(session.status) &&
      !session.validation) ||
    (session.status === "settled" &&
      (!session.settlementCommand ||
        !session.settledAt ||
        !session.settlementIntent)) ||
    (session.status === "settled" &&
      ((session.rule.credit.required &&
        session.credit.state !== settledCreditState) ||
        (session.rule.cukie.required &&
          session.cukie.state !== settledCukieState))) ||
    (["expired", "rejected", "forfeited"].includes(session.status) &&
      (!session.terminal || !session.terminalIntent)) ||
    (["expired", "rejected"].includes(session.status) &&
      ((session.rule.credit.required && session.credit.state !== "released") ||
        (session.rule.cukie.required && session.cukie.state !== "released"))) ||
    (session.status === "forfeited" &&
      ((session.rule.credit.required && session.credit.state !== "consumed") ||
        (session.rule.cukie.required && session.cukie.state !== "consumed"))) ||
    (TERMINAL_SESSION_STATUS.has(session.status) && session.operation) ||
    (session.settlementIntent !== undefined &&
      session.terminalIntent !== undefined) ||
    (session.terminalIntent &&
      !["expired", "rejected", "forfeited"].includes(
        session.terminalIntent.status,
      )) ||
    (session.terminal &&
      session.terminalIntent?.status !== session.status) ||
    (session.settlementCommand &&
      (!session.settlementIntent ||
        session.settlementCommand.idempotencyKey !==
          session.settlementIntent.idempotencyKey ||
        session.settlementCommand.requestHash !==
          session.settlementIntent.requestHash)) ||
    (session.terminal &&
      (!session.terminalIntent ||
        session.terminal.command.idempotencyKey !==
          session.terminalIntent.idempotencyKey ||
        session.terminal.command.requestHash !==
          session.terminalIntent.requestHash ||
        session.terminal.reasonCode !== session.terminalIntent.reasonCode)) ||
    (session.operation &&
      (session.operation.fenceToken !== session.fenceToken ||
        !["reserve", "compensate", "validate", "settle", "release"].includes(
          session.operation.kind
        ) ||
        validGameText(session.operation.owner, "operation.owner") !==
          session.operation.owner ||
        session.operation.acquiredAt.getTime() <
          latestLifecycleDate.getTime() ||
        session.operation.leaseExpiresAt.getTime() <=
          session.operation.acquiredAt.getTime() ||
        session.operation.leaseExpiresAt.getTime() !==
          session.operation.acquiredAt.getTime() +
            session.rule.operationLeaseMs))
  ) {
    throw new DomainConflictError("Estado y evidencias de sesion no coinciden.");
  }
  if (session.startedAt) validGameDate(session.startedAt, "startedAt");
  if (session.settledAt) validGameDate(session.settledAt, "settledAt");
  const timeline = [
    session.createdAt,
    session.startedAt,
    session.submission?.submittedAt,
    session.validation?.verifiedAt,
    session.settledAt ?? session.terminal?.terminalAt,
  ].filter((value): value is Date => value instanceof Date);
  for (let index = 1; index < timeline.length; index += 1) {
    if (timeline[index].getTime() < timeline[index - 1].getTime()) {
      throw new DomainConflictError("La cronologia de sesion retrocede.");
    }
  }
  const latestRecordedAt = [
    ...timeline,
    session.settlementIntent?.decidedAt,
    session.terminalIntent?.decidedAt,
    session.operation?.acquiredAt,
  ]
    .filter((value): value is Date => value instanceof Date)
    .reduce(
      (latest, value) => Math.max(latest, value.getTime()),
      session.createdAt.getTime()
    );
  if (session.updatedAt.getTime() < latestRecordedAt) {
    throw new DomainConflictError("updatedAt no cubre el ultimo evento.");
  }
  return session;
}

export function gameSessionId(
  idempotencyKey: string,
  requestHash: string
) {
  return `game-session:${stableGameEconomyHash({
    kind: "game-session",
    idempotencyKey,
    requestHash,
  })}`;
}
