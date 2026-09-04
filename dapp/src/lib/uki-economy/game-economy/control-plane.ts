import "server-only";

import { withEconomyTransaction } from "@/lib/indexer-db/mongodb";
import {
  assertRewardRule,
  rewardRuleEffectiveUntil,
} from "@/lib/uki-economy/rewards/rules";
import type { RewardRule } from "@/lib/uki-economy/rewards/types";

import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
  StaleFenceError,
} from "../errors";
import type { AuthorizedGameEvidence } from "./resource-ports";
import {
  assertGameEconomyRule,
  assertGameEconomyRuleSnapshot,
  assertProductiveGameRewardBinding,
  assertGameSessionIntegrity,
  buildGameRuleConfigHash,
  parseCanonicalRaw,
  stableGameEconomyHash,
  validGameDate,
  validGameText,
} from "./rules";
import {
  GAME_ECONOMY_RULE_SCOPE,
  type GameEconomyRule,
  type GameEconomyRuleSnapshot,
  type GameEconomySession,
} from "./types";

export type PersistGameEconomyRuleInput = Omit<
  GameEconomyRuleSnapshot,
  "configHash"
> & {
  active: boolean;
  activeFrom: Date;
  activeUntil?: Date;
  now: Date;
};

export type AuthorizeGameResultInput = {
  sessionId: string;
  evidenceReference: string;
  submissionPayloadHash: string;
  scoreRaw: string;
  idempotencyKey: string;
  now: Date;
};

type GameRuleState = {
  _id: string;
  gameId: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

function canonicalSha256(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new DomainValidationError(`${label} debe ser SHA-256 canonico.`);
  }
  return value;
}

function ruleSemanticHash(rule: GameEconomyRule) {
  return stableGameEconomyHash({
    _id: rule._id,
    scope: rule.scope,
    gameId: rule.gameId,
    version: rule.version,
    configHash: rule.configHash,
    sessionTtlMs: rule.sessionTtlMs,
    operationLeaseMs: rule.operationLeaseMs,
    credit: rule.credit,
    reward: rule.reward,
    cukie: rule.cukie,
    calculation: rule.calculation,
    active: rule.active,
    activeFrom: rule.activeFrom,
    activeUntil: rule.activeUntil ?? null,
  });
}

function buildRule(input: PersistGameEconomyRuleInput): GameEconomyRule {
  const now = validGameDate(input.now, "now");
  const activeFrom = validGameDate(input.activeFrom, "activeFrom");
  const activeUntil = input.activeUntil
    ? validGameDate(input.activeUntil, "activeUntil")
    : undefined;
  if (typeof input.active !== "boolean") {
    throw new DomainValidationError("active debe ser booleano.");
  }
  const withoutHash: Omit<GameEconomyRuleSnapshot, "configHash"> = {
    ...(input.calendar ? { calendar: { ...input.calendar } } : {}),
    gameId: validGameText(input.gameId, "gameId"),
    version: validGameText(input.version, "version"),
    sessionTtlMs: input.sessionTtlMs,
    operationLeaseMs: input.operationLeaseMs,
    credit: { ...input.credit },
    reward: { ...input.reward },
    cukie: { ...input.cukie },
    calculation: { ...input.calculation },
  };
  const hashInput = { ...withoutHash, configHash: "0".repeat(64) };
  const snapshot: GameEconomyRuleSnapshot = {
    ...withoutHash,
    configHash: buildGameRuleConfigHash(hashInput),
  };
  assertGameEconomyRuleSnapshot(snapshot);
  assertProductiveGameRewardBinding(snapshot);
  if (
    snapshot.cukie.required
    && snapshot.cukie.role !== "pool"
    && snapshot.cukie.role !== "own_or_pool"
  ) {
    throw new DomainValidationError(
      "El adaptador productivo solo admite seleccion server-side pool u own_or_pool.",
    );
  }
  const rule: GameEconomyRule = {
    _id: `${snapshot.gameId}:${snapshot.version}`,
    scope: GAME_ECONOMY_RULE_SCOPE,
    ...snapshot,
    active: input.active,
    activeFrom,
    ...(activeUntil ? { activeUntil } : {}),
    createdAt: now,
    updatedAt: now,
  };
  return assertGameEconomyRule(rule);
}

export async function persistGameEconomyRule(
  input: PersistGameEconomyRuleInput,
) {
  const candidate = buildRule(input);
  return withEconomyTransaction(async (db, session) => {
    const rewardRule = await db.collection<RewardRule>("economy_rule_versions")
      .findOne({
        scope: "reward_allocations",
        version: candidate.reward.rewardRuleVersion,
        configHash: candidate.reward.rewardRuleConfigHash,
      }, { session });
    if (!rewardRule) {
      throw new DomainConflictError(
        "La regla GameEconomy no liga una regla rewards inmutable existente.",
      );
    }
    assertRewardRule(rewardRule);
    const rewardEffectiveUntil = rewardRuleEffectiveUntil(rewardRule);
    const rewardCoversGameWindow =
      rewardRule.active
      && rewardRule.activeFrom.getTime() <= candidate.activeFrom.getTime()
      && (candidate.activeUntil
        ? !rewardEffectiveUntil
          || rewardEffectiveUntil.getTime() >= candidate.activeUntil.getTime()
        : !rewardEffectiveUntil);
    if (!rewardCoversGameWindow) {
      throw new DomainConflictError(
        "La vigencia rewards no cubre toda la vigencia de la regla GameEconomy.",
      );
    }
    const rules = db.collection<GameEconomyRule>("game_economy_rules");
    const states = db.collection<GameRuleState>("game_economy_rule_state");
    const existing = await rules.findOne({ _id: candidate._id }, { session });
    if (existing) {
      assertGameEconomyRule(existing);
      if (ruleSemanticHash(existing) !== ruleSemanticHash(candidate)) {
        throw new DomainConflictError(
          `La version ${candidate.version} de ${candidate.gameId} ya es inmutable.`,
        );
      }
      return existing;
    }

    const state = await states.findOne({ _id: candidate.gameId }, { session });
    if (!state) {
      await states.insertOne({
        _id: candidate.gameId,
        gameId: candidate.gameId,
        revision: 0,
        createdAt: candidate.createdAt,
        updatedAt: candidate.createdAt,
      }, { session });
    } else {
      const fenced = await states.updateOne(
        { _id: state._id, revision: state.revision },
        { $inc: { revision: 1 }, $set: { updatedAt: candidate.createdAt } },
        { session },
      );
      if (fenced.matchedCount !== 1) {
        throw new StaleFenceError("Otra regla de juego gano el fence de escritura.");
      }
    }

    if (candidate.active) {
      const overlap = await rules.findOne({
        _id: { $ne: candidate._id },
        gameId: candidate.gameId,
        active: true,
        ...(candidate.activeUntil
          ? { activeFrom: { $lt: candidate.activeUntil } }
          : {}),
        $or: [
          { activeUntil: { $exists: false } },
          { activeUntil: { $gt: candidate.activeFrom } },
        ],
      }, { session });
      if (overlap) {
        throw new DomainConflictError(
          `La regla ${candidate.version} se solapa con ${overlap.version}.`,
        );
      }
    }
    await rules.insertOne(candidate, { session });
    return candidate;
  });
}

function authorizedEvidencePayload(
  evidence: Omit<AuthorizedGameEvidence, "_id" | "payloadHash" | "createdAt">,
) {
  return {
    evidenceId: evidence.evidenceId,
    authorization: evidence.authorization,
    status: evidence.status,
    sessionId: evidence.sessionId,
    walletNormalized: evidence.walletNormalized,
    gameId: evidence.gameId,
    ruleVersion: evidence.ruleVersion,
    ruleConfigHash: evidence.ruleConfigHash,
    evidenceReference: evidence.evidenceReference,
    submissionPayloadHash: evidence.submissionPayloadHash,
    scoreRaw: evidence.scoreRaw,
    evidenceHash: evidence.evidenceHash,
    idempotencyKey: evidence.idempotencyKey,
    requestHash: evidence.requestHash,
  };
}

export async function authorizeGameResult(input: AuthorizeGameResultInput) {
  const now = validGameDate(input.now, "now");
  const sessionId = validGameText(input.sessionId, "sessionId");
  const evidenceReference = validGameText(
    input.evidenceReference,
    "evidenceReference",
  );
  const submissionPayloadHash = canonicalSha256(
    input.submissionPayloadHash,
    "submissionPayloadHash",
  );
  const scoreRaw = parseCanonicalRaw(input.scoreRaw, "scoreRaw").toString(10);
  const idempotencyKey = validGameText(input.idempotencyKey, "idempotencyKey");
  const requestHash = stableGameEconomyHash({
    sessionId,
    evidenceReference,
    submissionPayloadHash,
    scoreRaw,
  });

  return withEconomyTransaction(async (db, session) => {
    const game = await db.collection<GameEconomySession>("game_economy_sessions")
      .findOne({ _id: sessionId }, { session });
    if (!game) throw new DomainNotFoundError(`No existe la sesion ${sessionId}.`);
    assertGameSessionIntegrity(game);
    if (
      !game.submission
      || game.submission.evidenceReference !== evidenceReference
      || game.submission.payloadHash !== submissionPayloadHash
      || !["submitted", "validated", "settled"].includes(game.status)
    ) {
      throw new DomainConflictError(
        "La evidencia no coincide con una submission persistida y autorizable.",
      );
    }

    const evidenceId = stableGameEconomyHash({
      kind: "authorized-game-evidence-id",
      sessionId,
      evidenceReference,
    });
    const evidenceHash = stableGameEconomyHash({
      kind: "authorized-game-result",
      sessionId,
      walletNormalized: game.walletNormalized,
      gameId: game.gameId,
      ruleVersion: game.rule.version,
      ruleConfigHash: game.rule.configHash,
      evidenceReference,
      submissionPayloadHash,
      scoreRaw,
    });
    const immutable = {
      evidenceId,
      authorization: "server_authorized" as const,
      status: "ready" as const,
      sessionId,
      walletNormalized: game.walletNormalized,
      gameId: game.gameId,
      ruleVersion: game.rule.version,
      ruleConfigHash: game.rule.configHash,
      evidenceReference,
      submissionPayloadHash,
      scoreRaw,
      evidenceHash,
      idempotencyKey,
      requestHash,
    };
    const value: AuthorizedGameEvidence = {
      _id: evidenceId,
      ...immutable,
      payloadHash: stableGameEconomyHash({
        kind: "authorized-game-evidence",
        ...authorizedEvidencePayload({ ...immutable }),
      }),
      createdAt: now,
    };
    const evidences = db.collection<AuthorizedGameEvidence>("game_result_evidence");
    const existing = await evidences.findOne({
      $or: [
        { _id: evidenceId },
        { idempotencyKey },
        { evidenceReference },
      ],
    }, { session });
    if (existing) {
      if (
        existing._id !== value._id
        || existing.requestHash !== requestHash
        || existing.payloadHash !== value.payloadHash
      ) {
        throw new DomainConflictError(
          "La evidencia o clave de idempotencia ya pertenece a otro resultado.",
        );
      }
      return existing;
    }
    await evidences.insertOne(value, { session });
    return value;
  });
}
