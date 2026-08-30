import "server-only";

import { DomainConflictError, DomainValidationError } from "../errors";
import type { RewardTransactionRunner } from "./repository";
import { mongoRewardTransactionRunner } from "./repository";
import {
  assertRewardRule,
  stableRewardHash,
  validRewardDate,
} from "./rules";
import type { PersistRewardRuleInput, RewardRule } from "./types";

const DAY_MS = 86_400_000;

function ruleIdentity(rule: RewardRule) {
  return stableRewardHash({
    _id: rule._id,
    scope: rule.scope,
    version: rule.version,
    active: rule.active,
    activeFrom: rule.activeFrom,
    activeUntil: rule.activeUntil,
    configHash: rule.configHash,
  });
}

function isMongoDuplicateKey(error: unknown) {
  return Boolean(
    error && typeof error === "object" && "code" in error
    && (error as { code?: unknown }).code === 11000
  );
}

function sameGlobalEmissionLedger(left: RewardRule, right: RewardRule) {
  const current = left.emissionBudget;
  const next = right.emissionBudget;
  return current.programStartsAt.getTime() === next.programStartsAt.getTime()
    && current.dayBoundarySecondUtc === next.dayBoundarySecondUtc
    && current.lateReservationGraceSeconds === next.lateReservationGraceSeconds
    && current.lifetimeCapRaw === next.lifetimeCapRaw
    && current.unusedDailyCapacity === next.unusedDailyCapacity
    && current.overflowPolicy === next.overflowPolicy;
}

function assertFutureRuleTransition(
  current: RewardRule,
  next: RewardRule,
  now: Date,
) {
  if (next.activeFrom.getTime() <= now.getTime()) {
    throw new DomainConflictError(
      `La regla ${next.version} solo puede superseder otra desde un corte futuro.`,
    );
  }
  if (current.activeFrom.getTime() >= next.activeFrom.getTime()) {
    throw new DomainConflictError(
      `La regla ${next.version} no es posterior a ${current.version}.`,
    );
  }
  const boundaryMs = next.emissionBudget.dayBoundarySecondUtc * 1_000;
  if ((next.activeFrom.getTime() - boundaryMs) % DAY_MS !== 0) {
    throw new DomainConflictError(
      `La regla ${next.version} debe empezar exactamente en un corte diario.`,
    );
  }
  if (!sameGlobalEmissionLedger(current, next)) {
    throw new DomainConflictError(
      "La supersesion puede cambiar el cap diario, pero no reiniciar calendario, politicas ni lifetime cap.",
    );
  }
}

export class RewardRuleService {
  constructor(private readonly runTransaction: RewardTransactionRunner) {}

  async persistRule(input: PersistRewardRuleInput) {
    const { now: nowInput, activeUntil, ...ruleInput } = input;
    const now = validRewardDate(nowInput, "now");
    const rule: RewardRule = {
      ...ruleInput,
      ...(activeUntil ? { activeUntil } : {}),
      createdAt: now,
      updatedAt: now,
    };
    if (rule.supersededAt || rule.supersededByVersion) {
      throw new DomainValidationError(
        "La supersesion es metadata operativa y no puede venir en la regla candidata.",
      );
    }
    assertRewardRule(rule);
    if (rule.activeUntil && rule.activeUntil.getTime() <= now.getTime()) {
      throw new DomainValidationError("No se puede crear una regla ya vencida.");
    }
    const attempt = () => this.runTransaction(async (repository) => {
      const existing = await repository.findRuleByVersion(rule.version);
      if (existing) {
        assertRewardRule(existing);
        if (ruleIdentity(existing) !== ruleIdentity(rule)) {
          throw new DomainConflictError(`La regla ${rule.version} ya tiene otra configuracion.`);
        }
        return { rule: existing, replayed: true };
      }
      // Todas las versiones nuevas escriben el mismo guard. Dos ventanas
      // distintas no pueden superar el check de overlap por write-skew.
      await repository.advanceRuleScope(now);
      if (rule.active) {
        const overlap = await repository.findOverlappingActiveRule(
          rule.activeFrom,
          rule.activeUntil,
        );
        if (overlap) {
          assertRewardRule(overlap);
          assertFutureRuleTransition(overlap, rule, now);
          await repository.supersedeRule(
            overlap.version,
            rule.activeFrom,
            rule.version,
            now,
          );
        }
      }
      await repository.insertRule(rule);
      return { rule, replayed: false };
    });
    try {
      return await attempt();
    } catch (error) {
      if (isMongoDuplicateKey(error)) return attempt();
      throw error;
    }
  }
}

export const rewardRuleService = new RewardRuleService(mongoRewardTransactionRunner);
