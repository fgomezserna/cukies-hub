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
  CreditRoute,
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
  const routes: CreditRoute[] = ['uki', 'nft'];
  const [accounts, pools, slots, watermarks, routeIncidentCounts, activeReservations] = await Promise.all([
    db.collection<CreditAccountPeriod>('competition_credit_account_periods').find({
      walletNormalized,
      periodId: period.periodId,
      route: { $in: routes },
    }).limit(3).toArray(),
    db.collection<CreditPoolPeriod>('competition_credit_pool_periods').find({
      periodId: period.periodId,
      route: { $in: routes },
    }).limit(3).toArray(),
    db.collection<CreditSnapshotSlot>('cukie_master_slots')
      .find({ walletNormalized, status: { $in: ['qualifying', 'active', 'grace'] } })
      .sort({ route: 1, ordinal: 1, _id: 1 })
      .limit(11)
      .toArray(),
    db.collection<CreditSourceWatermark>('competition_credit_source_watermarks').find({
      _id: { $in: ['cukie-master-slots:uki', 'cukie-master-slots:nft'] },
    }).limit(3).toArray(),
    Promise.all(routes.map(async (route) => ({
      route,
      count: await db.collection('competition_credit_incidents').countDocuments({
        status: 'open',
        route,
        $or: [{ walletNormalized }, { walletNormalized: null }],
      }, { limit: 1 }),
    }))),
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
  if (accounts.length > routes.length || pools.length > routes.length || watermarks.length > routes.length) {
    throw new DomainConflictError('La proyeccion de creditos contiene rutas duplicadas.');
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

  const emptyBalance = {
    grantedCredits: 0,
    poolDepositedCredits: 0,
    availableCredits: 0,
    reservedCredits: 0,
    spentCredits: 0,
    expiredCredits: 0,
    blocked: false,
  };
  const routeStatus = Object.fromEntries(routes.map((route) => {
    const account = accounts.find((candidate) => candidate.route === route);
    const pool = pools.find((candidate) => candidate.route === route);
    const watermark = watermarks.find((candidate) => candidate.route === route);
    const openIncidents = routeIncidentCounts.find((candidate) => candidate.route === route)?.count ?? 0;
    return [route, {
      balance: account ? {
        grantedCredits: exactCredits(account.grantedCredits, `${route}.grantedCredits`),
        poolDepositedCredits: exactCredits(account.poolDepositedCredits, `${route}.poolDepositedCredits`),
        availableCredits: exactCredits(account.availableCredits, `${route}.availableCredits`),
        reservedCredits: exactCredits(account.reservedCredits, `${route}.reservedCredits`),
        spentCredits: exactCredits(account.spentCredits, `${route}.spentCredits`),
        expiredCredits: exactCredits(account.expiredCredits, `${route}.expiredCredits`),
        blocked: account.blocked === true,
      } : { ...emptyBalance },
      pool: pool ? {
        availableCredits: exactCredits(pool.availableCredits, `${route}.pool.availableCredits`),
        reservedCredits: exactCredits(pool.reservedCredits, `${route}.pool.reservedCredits`),
        blocked: pool.blocked === true,
      } : { availableCredits: 0, reservedCredits: 0, blocked: false },
      grants: {
        healthy: watermark?.status === 'healthy' && openIncidents === 0,
        sourceObservedThrough: watermark?.observedThrough instanceof Date
          ? new Date(watermark.observedThrough.getTime())
          : null,
        openIncidents,
      },
    }];
  })) as Record<CreditRoute, {
    balance: typeof emptyBalance;
    pool: { availableCredits: number; reservedCredits: number; blocked: boolean };
    grants: { healthy: boolean; sourceObservedThrough: Date | null; openIncidents: number };
  }>;
  const balance = routes.reduce((total, route) => ({
    grantedCredits: total.grantedCredits + routeStatus[route].balance.grantedCredits,
    poolDepositedCredits: total.poolDepositedCredits + routeStatus[route].balance.poolDepositedCredits,
    availableCredits: total.availableCredits + routeStatus[route].balance.availableCredits,
    reservedCredits: total.reservedCredits + routeStatus[route].balance.reservedCredits,
    spentCredits: total.spentCredits + routeStatus[route].balance.spentCredits,
    expiredCredits: total.expiredCredits + routeStatus[route].balance.expiredCredits,
    blocked: total.blocked || routeStatus[route].balance.blocked,
  }), { ...emptyBalance });
  const poolBalance = routes.reduce((total, route) => ({
    availableCredits: total.availableCredits + routeStatus[route].pool.availableCredits,
    reservedCredits: total.reservedCredits + routeStatus[route].pool.reservedCredits,
    blocked: total.blocked || routeStatus[route].pool.blocked,
  }), { availableCredits: 0, reservedCredits: 0, blocked: false });
  const openIncidents = routeIncidentCounts.reduce((total, item) => total + item.count, 0);
  const observed = routes
    .map((route) => routeStatus[route].grants.sourceObservedThrough)
    .filter((value): value is Date => value instanceof Date);
  const sourceObservedThrough = observed.length === routes.length
    ? new Date(Math.min(...observed.map((value) => value.getTime())))
    : null;

  return {
    walletNormalized,
    rule: {
      version: rule.version,
      creditsPerSlot: rule.creditsPerSlot,
      cutoffHourUtc: rule.cutoffHourUtc,
      cutoffMinuteUtc: rule.cutoffMinuteUtc,
      costs: rule.costs.map((cost) => ({
        costCode: cost.costCode,
        credits: exactCredits(cost.credits, `rule.costs.${cost.costCode}.credits`),
        active: cost.active,
      })),
    },
    period,
    balance,
    pool: poolBalance,
    routes: routeStatus,
    configurations,
    activeReservations,
    grants: {
      healthy: routes.every((route) => routeStatus[route].grants.healthy),
      sourceObservedThrough,
      openIncidents,
    },
  };
}
