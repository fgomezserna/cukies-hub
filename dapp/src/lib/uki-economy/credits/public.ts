import 'server-only';

import { getEconomyDb } from '@/lib/indexer-db/mongodb';

import { DomainConflictError } from '../errors';
import { assertCreditAmount } from '../money';
import {
  assertCompetitionCreditRule,
  currentCompetitionCreditPeriod,
  firstEligibleCreditCutoff,
  validCreditWallet,
} from './rules';
import { isBlockingCreditIncident } from './integrity';
import type {
  CompetitionCreditRule,
  CreditAccountPeriod,
  CreditIntegrityIncident,
  CreditPoolConfiguration,
  CreditPoolPeriod,
  CreditSnapshotSlot,
  CreditSourceWatermark,
  CreditRoute,
  CompetitionCreditRun,
  CreditLot,
} from './types';

const MAX_PUBLIC_CREDIT_LOTS = 5_000;

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

function sourceWatermarkIsFresh(
  observedThrough: Date | undefined,
  now: Date,
  freshnessMs: number,
) {
  if (!(observedThrough instanceof Date) || Number.isNaN(observedThrough.getTime())) return false;
  const timestamp = observedThrough.getTime();
  return timestamp <= now.getTime() && timestamp >= now.getTime() - freshnessMs;
}

function isOpenCreditRun(status: CompetitionCreditRun['status']) {
  return status === 'open' || status === 'open_with_holds';
}

function summarizeUsableLots(input: {
  lots: CreditLot[];
  bucket: CreditLot['bucket'];
  walletNormalized: string;
  periodId: string;
  openRunIdsByRoute: ReadonlyMap<CreditRoute, ReadonlySet<string>>;
  now: Date;
}) {
  if (input.lots.length > MAX_PUBLIC_CREDIT_LOTS) {
    throw new DomainConflictError('La proyeccion publica de lotes de creditos excede el limite seguro.', {
      reason: 'CREDIT_LOT_PROJECTION_TOO_LARGE',
    });
  }
  const totals: Record<CreditRoute, number> = { uki: 0, nft: 0 };
  for (const lot of input.lots) {
    const openRunIds = input.openRunIdsByRoute.get(lot.route);
    if (
      lot.bucket !== input.bucket
      || lot.periodId !== input.periodId
      || !openRunIds?.has(lot.runId)
      || lot.blocked !== false
      || (input.bucket === 'own' && lot.walletNormalized !== input.walletNormalized)
      || (input.bucket === 'pool' && lot.walletNormalized !== null)
      || !(lot.expiresAt instanceof Date)
      || Number.isNaN(lot.expiresAt.getTime())
      || lot.expiresAt.getTime() <= input.now.getTime()
    ) {
      continue;
    }
    const availableCredits = exactCredits(
      lot.availableCredits,
      `${input.bucket}.${lot.lotId}.availableCredits`,
    );
    if (availableCredits <= 0) continue;
    totals[lot.route] = assertCreditAmount(totals[lot.route] + availableCredits);
  }
  return totals;
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
      { reason: rules.length === 0 ? 'CREDIT_RULE_MISSING' : 'CREDIT_RULE_OVERLAP' },
    );
  }
  const rule = assertCompetitionCreditRule(rules[0]);
  const period = currentCompetitionCreditPeriod(now, rule);
  const routes: CreditRoute[] = ['uki', 'nft'];
  const [
    accounts,
    pools,
    slots,
    watermarks,
    routeIncidentCounts,
    unknownRouteIncidentCount,
    blockedAccountCount,
    activeReservations,
    currentRuns,
  ] = await Promise.all([
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
      count: await db.collection<CreditIntegrityIncident>('competition_credit_incidents')
        .find({
          status: 'open',
          route,
          $or: [{ walletNormalized }, { walletNormalized: null }],
        }, {
          projection: {
            _id: 0,
            type: 1,
            status: 1,
            runId: 1,
            route: 1,
            periodId: 1,
            reasonCodes: 1,
            evidenceHash: 1,
            containment: 1,
            selectorCutoff: 1,
            planHash: 1,
          },
        })
        .toArray()
        .then((incidents) => incidents.filter((incident) =>
          isBlockingCreditIncident(incident, route, period.cutoff)
        ).length),
    }))),
    db.collection<CreditIntegrityIncident>('competition_credit_incidents').countDocuments({
      status: 'open',
      $and: [
        { $or: [{ walletNormalized }, { walletNormalized: null }] },
        { route: { $nin: routes } },
      ],
    }),
    db.collection<CreditAccountPeriod>('competition_credit_account_periods').countDocuments({
      walletNormalized,
      blocked: true,
    }),
    db.collection('competition_credit_reservations').countDocuments({
      walletNormalized,
      periodId: period.periodId,
      status: 'active',
      expiresAt: { $gt: now },
    }, { limit: 1_001 }),
    db.collection<CompetitionCreditRun>('competition_credit_runs').find({
      'settlementPeriod.periodId': period.periodId,
      'settlementPeriod.cutoff': { $lte: now },
      'settlementPeriod.nextCutoff': { $gt: now },
      route: { $in: routes },
    }, {
      projection: { _id: 0, runId: 1, route: 1, status: 1 },
    }).limit(routes.length + 1).toArray(),
  ]);
  if (slots.length > 10) {
    throw new DomainConflictError('La wallet excede el maximo canonico de 10 slots.');
  }
  if (
    accounts.length > routes.length
    || pools.length > routes.length
    || watermarks.length > routes.length
    || currentRuns.length > routes.length
  ) {
    throw new DomainConflictError('La proyeccion de creditos contiene rutas duplicadas.', {
      reason: 'CREDIT_PROJECTION_DUPLICATE_ROUTES',
    });
  }
  const seenCurrentRunRoutes = new Set<CreditRoute>();
  if (currentRuns.some((run) => {
    if (seenCurrentRunRoutes.has(run.route)) return true;
    seenCurrentRunRoutes.add(run.route);
    return false;
  })) {
    throw new DomainConflictError('La proyeccion de runs de creditos contiene rutas duplicadas.', {
      reason: 'CREDIT_PROJECTION_DUPLICATE_ROUTES',
    });
  }

  const openRunIdsByRoute = new Map<CreditRoute, Set<string>>();
  for (const run of currentRuns) {
    if (!isOpenCreditRun(run.status) || typeof run.runId !== 'string') continue;
    const ids = openRunIdsByRoute.get(run.route) ?? new Set<string>();
    ids.add(run.runId);
    openRunIdsByRoute.set(run.route, ids);
  }
  const openRunIds = [...openRunIdsByRoute.values()].flatMap((ids) => [...ids]);
  const [ownLots, poolLots]: [CreditLot[], CreditLot[]] = openRunIds.length === 0
    ? [[], []]
    : await Promise.all([
      db.collection<CreditLot>('competition_credit_lots').find({
        walletNormalized,
        periodId: period.periodId,
        route: { $in: routes },
        runId: { $in: openRunIds },
        blocked: false,
        availableCredits: { $gt: 0 },
        expiresAt: { $gt: now },
      }).limit(MAX_PUBLIC_CREDIT_LOTS + 1).toArray(),
      db.collection<CreditLot>('competition_credit_pool_lots').find({
        periodId: period.periodId,
        route: { $in: routes },
        runId: { $in: openRunIds },
        blocked: false,
        availableCredits: { $gt: 0 },
        expiresAt: { $gt: now },
      }).limit(MAX_PUBLIC_CREDIT_LOTS + 1).toArray(),
    ]);
  const usableOwnCredits = summarizeUsableLots({
    lots: ownLots,
    bucket: 'own',
    walletNormalized,
    periodId: period.periodId,
    openRunIdsByRoute,
    now,
  });
  const usablePoolCredits = summarizeUsableLots({
    lots: poolLots,
    bucket: 'pool',
    walletNormalized,
    periodId: period.periodId,
    openRunIdsByRoute,
    now,
  });

  const configurations = await Promise.all(slots.map(async (slot) => {
    const creditEligibleFrom = exactDate(slot.creditEligibleFrom, 'creditEligibleFrom');
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
      creditEligibleFrom,
      firstEligibleCutoff: firstEligibleCreditCutoff(creditEligibleFrom, rule),
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
    const observedThrough = watermark?.observedThrough instanceof Date
      ? new Date(watermark.observedThrough.getTime())
      : null;
    return [route, {
      balance: account ? {
        grantedCredits: exactCredits(account.grantedCredits, `${route}.grantedCredits`),
        poolDepositedCredits: exactCredits(account.poolDepositedCredits, `${route}.poolDepositedCredits`),
        availableCredits: usableOwnCredits[route],
        reservedCredits: exactCredits(account.reservedCredits, `${route}.reservedCredits`),
        spentCredits: exactCredits(account.spentCredits, `${route}.spentCredits`),
        expiredCredits: exactCredits(account.expiredCredits, `${route}.expiredCredits`),
        blocked: account.blocked === true,
      } : { ...emptyBalance },
      pool: pool ? {
        availableCredits: usablePoolCredits[route],
        reservedCredits: exactCredits(pool.reservedCredits, `${route}.pool.reservedCredits`),
        blocked: pool.blocked === true,
      } : { availableCredits: 0, reservedCredits: 0, blocked: false },
      grants: {
        healthy: watermark?.status === 'healthy'
          && sourceWatermarkIsFresh(observedThrough ?? undefined, now, rule.sourceFreshnessMs)
          && openIncidents === 0
          && unknownRouteIncidentCount === 0,
        sourceObservedThrough: observedThrough,
        openIncidents,
      },
    }];
  })) as Record<CreditRoute, {
    balance: typeof emptyBalance;
    pool: { availableCredits: number; reservedCredits: number; blocked: boolean };
    grants: { healthy: boolean; sourceObservedThrough: Date | null; openIncidents: number };
  }>;
  const knownOpenIncidents = routeIncidentCounts.reduce((total, item) => total + item.count, 0);
  const openIncidents = knownOpenIncidents + unknownRouteIncidentCount;
  const globallyBlocked = openIncidents > 0 || blockedAccountCount > 0;
  const balance = routes.reduce((total, route) => ({
    grantedCredits: total.grantedCredits + routeStatus[route].balance.grantedCredits,
    poolDepositedCredits: total.poolDepositedCredits + routeStatus[route].balance.poolDepositedCredits,
    availableCredits: total.availableCredits + routeStatus[route].balance.availableCredits,
    reservedCredits: total.reservedCredits + routeStatus[route].balance.reservedCredits,
    spentCredits: total.spentCredits + routeStatus[route].balance.spentCredits,
    expiredCredits: total.expiredCredits + routeStatus[route].balance.expiredCredits,
    blocked: total.blocked || routeStatus[route].balance.blocked || globallyBlocked,
  }), { ...emptyBalance });
  const poolBalance = routes.reduce((total, route) => ({
    availableCredits: total.availableCredits + routeStatus[route].pool.availableCredits,
    reservedCredits: total.reservedCredits + routeStatus[route].pool.reservedCredits,
    blocked: total.blocked || routeStatus[route].pool.blocked,
  }), { availableCredits: 0, reservedCredits: 0, blocked: false });
  const observed = routes
    .map((route) => routeStatus[route].grants.sourceObservedThrough)
    .filter((value): value is Date => value instanceof Date);
  const sourceObservedThrough = observed.length === routes.length
    ? new Date(Math.min(...observed.map((value) => value.getTime())))
    : null;

  return {
    walletNormalized,
    rule: {
      ...(rule.calendar ? { calendar: rule.calendar } : {}),
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
    currentRun: {
      periodCutoff: period.cutoff,
      routes: routes.map((route) => ({
        route,
        status: currentRuns.find((run) => run.route === route)?.status ?? 'missing',
      })),
    },
  };
}
