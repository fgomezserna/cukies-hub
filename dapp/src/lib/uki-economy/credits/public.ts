import 'server-only';

import { getEconomyDb } from '@/lib/indexer-db/mongodb';

import { DomainConflictError } from '../errors';
import { assertCreditAmount } from '../money';
import {
  assertCompetitionCreditRule,
  currentCompetitionCreditPeriod,
  validCreditWallet,
} from './rules';
import type {
  CompetitionCreditRule,
  CreditAccountPeriod,
  CreditPoolConfiguration,
  CreditPoolPeriod,
  CreditSnapshotSlot,
  CreditSourceWatermark,
} from './types';

function exactCredits(value: unknown, label: string) {
  if (typeof value !== 'number') throw new DomainConflictError(`${label} no es numerico.`);
  return assertCreditAmount(value);
}

function exactDate(value: unknown, label: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainConflictError(`${label} no contiene una fecha valida.`);
  }
  return new Date(value.getTime());
}

export async function getCompetitionCreditWalletStatus(
  walletAddress: string,
  nowInput = new Date(),
) {
  const walletNormalized = validCreditWallet(walletAddress);
  const now = exactDate(nowInput, 'now');
  const db = await getEconomyDb();
  const rules = await db.collection<CompetitionCreditRule>('economy_rule_versions')
    .find({
      scope: 'competition_credits',
      active: true,
      activeFrom: { $lte: now },
      $or: [{ activeUntil: { $exists: false } }, { activeUntil: { $gt: now } }],
    })
    .sort({ activeFrom: -1, _id: 1 })
    .limit(2)
    .toArray();
  if (rules.length !== 1) {
    throw new DomainConflictError(
      rules.length === 0
        ? 'No existe una regla activa de creditos.'
        : 'Hay reglas activas de creditos solapadas.',
    );
  }
  const rule = assertCompetitionCreditRule(rules[0]);
  const period = currentCompetitionCreditPeriod(now, rule);
  const [account, pool, slots, watermark, openIncidents, activeReservations] = await Promise.all([
    db.collection<CreditAccountPeriod>('competition_credit_account_periods').findOne({
      walletNormalized,
      periodId: period.periodId,
    }),
    db.collection<CreditPoolPeriod>('competition_credit_pool_periods').findOne({
      periodId: period.periodId,
    }),
    db.collection<CreditSnapshotSlot>('cukie_master_slots')
      .find({ walletNormalized, status: { $in: ['qualifying', 'active', 'grace'] } })
      .sort({ route: 1, ordinal: 1, _id: 1 })
      .limit(11)
      .toArray(),
    db.collection<CreditSourceWatermark>('competition_credit_source_watermarks').findOne({
      _id: 'cukie-master-slots',
    }),
    db.collection('competition_credit_incidents').countDocuments({
      status: 'open',
      $or: [{ walletNormalized }, { walletNormalized: null }],
    }, { limit: 1 }),
    db.collection('competition_credit_reservations').countDocuments({
      walletNormalized,
      periodId: period.periodId,
      status: 'active',
      expiresAt: { $gt: now },
    }, { limit: 1_001 }),
  ]);
  if (slots.length > 10) {
    throw new DomainConflictError('La wallet excede el maximo canonico de 10 slots.');
  }

  const configurations = await Promise.all(slots.map(async (slot) => {
    const config = await db.collection<CreditPoolConfiguration>('competition_credit_pool_configs')
      .findOne({
        walletNormalized,
        slotId: slot._id,
        eligibilityEpoch: slot.eligibilityEpoch,
        ruleVersion: rule.version,
        ruleConfigHash: rule.configHash,
      }, { sort: { effectiveCutoff: -1, requestedAt: -1, _id: -1 } });
    return {
      slotId: slot._id,
      route: slot.route,
      ordinal: slot.ordinal,
      eligibilityEpoch: slot.eligibilityEpoch,
      status: slot.status,
      poolCreditsPerSlot: config ? exactCredits(config.poolCreditsPerSlot, 'poolCreditsPerSlot') : 0,
      effectiveCutoff: config ? exactDate(config.effectiveCutoff, 'effectiveCutoff') : null,
    };
  }));

  const balance = account ? {
    grantedCredits: exactCredits(account.grantedCredits, 'grantedCredits'),
    poolDepositedCredits: exactCredits(account.poolDepositedCredits, 'poolDepositedCredits'),
    availableCredits: exactCredits(account.availableCredits, 'availableCredits'),
    reservedCredits: exactCredits(account.reservedCredits, 'reservedCredits'),
    spentCredits: exactCredits(account.spentCredits, 'spentCredits'),
    expiredCredits: exactCredits(account.expiredCredits, 'expiredCredits'),
    blocked: account.blocked === true,
  } : {
    grantedCredits: 0,
    poolDepositedCredits: 0,
    availableCredits: 0,
    reservedCredits: 0,
    spentCredits: 0,
    expiredCredits: 0,
    blocked: false,
  };
  const poolBalance = pool ? {
    availableCredits: exactCredits(pool.availableCredits, 'pool.availableCredits'),
    reservedCredits: exactCredits(pool.reservedCredits, 'pool.reservedCredits'),
    blocked: pool.blocked === true,
  } : { availableCredits: 0, reservedCredits: 0, blocked: false };
  const sourceObservedThrough = watermark?.observedThrough instanceof Date
    ? watermark.observedThrough
    : null;

  return {
    walletNormalized,
    rule: {
      version: rule.version,
      creditsPerSlot: rule.creditsPerSlot,
      cutoffHourUtc: rule.cutoffHourUtc,
      cutoffMinuteUtc: rule.cutoffMinuteUtc,
    },
    period,
    balance,
    pool: poolBalance,
    configurations,
    activeReservations,
    grants: {
      healthy: watermark?.status === 'healthy' && openIncidents === 0,
      sourceObservedThrough,
      openIncidents,
    },
  };
}
