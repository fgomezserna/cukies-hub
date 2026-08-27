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

export class RewardRuleService {
  constructor(private readonly runTransaction: RewardTransactionRunner) {}

  async persistRule(input: PersistRewardRuleInput) {
    const { now: nowInput, ...ruleInput } = input;
    const now = validRewardDate(nowInput, "now");
    const rule: RewardRule = {
      ...ruleInput,
      createdAt: now,
      updatedAt: now,
    };
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
          throw new DomainConflictError(
            `La regla ${rule.version} solapa la ventana activa de ${overlap.version}.`,
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
