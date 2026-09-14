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
import {
  EMPTY_CREDIT_LOT_ACCOUNTING,
  materializationStateRank,
  materializeCreditLots,
  worseMaterializationState,
  type CreditMaterializationState,
} from './materialization';
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
const MAX_PUBLIC_CREDIT_RUNS = 5_000;

const PUBLIC_CREDIT_RUN_STATUSES = [
  'snapshotted',
  'processing',
  'open',
  'open_with_holds',
  'blocked',
] as const satisfies readonly CompetitionCreditRun['status'][];

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

function isCreditRunStatus(value: unknown): value is CompetitionCreditRun['status'] {
  return typeof value === 'string'
    && (PUBLIC_CREDIT_RUN_STATUSES as readonly string[]).includes(value);
}

function aggregateCurrentRunStatus(
  runs: readonly Pick<CompetitionCreditRun, 'status'>[],
) {
  if (runs.length === 0) return 'missing' as const;
  if (runs.some((run) => run.status === 'blocked')) return 'blocked' as const;
  if (runs.some((run) => run.status === 'processing')) return 'processing' as const;
  if (runs.some((run) => run.status === 'snapshotted')) return 'snapshotted' as const;
  if (runs.some((run) => run.status === 'open_with_holds')) return 'open_with_holds' as const;
  return 'open' as const;
}

type PublicLotMaterialization = {
  state: CreditMaterializationState;
  totals: ReturnType<typeof materializeCreditLots>['totals'];
  usableCredits: number;
};

function markPublicLotIssue(
  current: CreditMaterializationState,
  next: CreditMaterializationState,
) {
  return materializationStateRank(current) >= materializationStateRank(next)
    ? current
    : next;
}

function materializePublicLots(input: {
  lots: CreditLot[];
  bucket: CreditLot['bucket'];
  walletNormalized: string;
  periodId: string;
  route: CreditRoute;
  openRunIdsByRoute: ReadonlyMap<CreditRoute, ReadonlySet<string>>;
  now: Date;
}): PublicLotMaterialization {
  const materialized = materializeCreditLots(input.lots, MAX_PUBLIC_CREDIT_LOTS);
  let state = materialized.state;
  let usableCredits = 0;
  for (const lot of input.lots) {
    if (
      lot.bucket !== input.bucket
      || lot.periodId !== input.periodId
      || lot.route !== input.route
      || typeof lot.runId !== 'string'
      || (input.bucket === 'own' && lot.walletNormalized !== input.walletNormalized)
      || (input.bucket === 'pool' && lot.walletNormalized !== null)
    ) {
      state = markPublicLotIssue(state, 'unknown');
      continue;
    }
    const inspected = materializeCreditLots([lot], 1);
    if (inspected.state !== 'ready') continue;
    if (
      !(lot.expiresAt instanceof Date)
      || Number.isNaN(lot.expiresAt.getTime())
    ) {
      state = markPublicLotIssue(state, 'unknown');
      continue;
    }
    const openRunIds = input.openRunIdsByRoute.get(input.route);
    if (
      !openRunIds?.has(lot.runId)
      || lot.expiresAt.getTime() <= input.now.getTime()
      || lot.availableCredits <= 0
    ) continue;
    const next = usableCredits + lot.availableCredits;
    if (!Number.isSafeInteger(next)) {
      state = markPublicLotIssue(state, 'unknown');
      continue;
    }
    usableCredits = next;
  }
  if (state !== 'ready') usableCredits = 0;
  return { state, totals: materialized.totals, usableCredits };
}

function projectionState(input: {
  lotMaterialization: PublicLotMaterialization;
  projection: Record<string, unknown> | null;
  expected: Record<string, number>;
  fields: readonly string[];
}): CreditMaterializationState {
  if (input.lotMaterialization.state !== 'ready') {
    return input.lotMaterialization.state;
  }
  if (!input.projection) return 'ready';
  if (input.projection.blocked === true) return 'blocked';
  if (input.projection.blocked !== false) return 'unknown';
  for (const field of input.fields) {
    const value = input.projection[field];
    if (!Number.isSafeInteger(value) || (value as number) < 0) return 'unknown';
    if (value !== input.expected[field]) return 'stale';
  }
  return 'ready';
}

function safeProjectedCredits(
  projection: Record<string, unknown> | null,
  field: string,
  label: string,
) {
  if (!projection) return null;
  if (!Number.isSafeInteger(projection[field]) || (projection[field] as number) < 0) {
    return null;
  }
  return exactCredits(projection[field], label);
}

function materializedOrProjectedCredits(
  materialization: PublicLotMaterialization,
  state: CreditMaterializationState,
  projection: Record<string, unknown> | null,
  field: keyof PublicLotMaterialization['totals'],
  label: string,
) {
  // Once every current-period lot has been reconciled, its accounting fields
  // are the source of truth even if the denormalized projection document has
  // not been written yet. Never use this fallback for blocked/unknown/stale
  // materializations: those states must remain visible to the caller.
  if (state === 'ready') {
    return exactCredits(materialization.totals[field], label);
  }
  return safeProjectedCredits(projection, field === 'totalCredits' ? 'grantedCredits' : field, label);
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
    // Delayed grants are materialized into the current settlement period, so
    // more than one run for a route can legitimately be open at once. Keep
    // every bounded run and aggregate its public status below.
    db.collection<CompetitionCreditRun>('competition_credit_runs').find({
      'settlementPeriod.periodId': period.periodId,
      'settlementPeriod.cutoff': { $lte: now },
      'settlementPeriod.nextCutoff': { $gt: now },
      route: { $in: routes },
    }, {
      projection: { _id: 0, runId: 1, route: 1, status: 1 },
    }).limit(MAX_PUBLIC_CREDIT_RUNS + 1).toArray(),
  ]);
  if (slots.length > 10) {
    throw new DomainConflictError('La wallet excede el maximo canonico de 10 slots.');
  }
  if (
    accounts.length > routes.length
    || pools.length > routes.length
    || watermarks.length > routes.length
  ) {
    throw new DomainConflictError('La proyeccion de creditos contiene rutas duplicadas.', {
      reason: 'CREDIT_PROJECTION_DUPLICATE_ROUTES',
    });
  }
  if (currentRuns.length > MAX_PUBLIC_CREDIT_RUNS) {
    throw new DomainConflictError('La proyeccion de runs de creditos excede el limite publico.', {
      reason: 'CREDIT_RUN_PROJECTION_TOO_LARGE',
    });
  }

  const seenCurrentRunIds = new Set<string>();
  const currentRunsByRoute = new Map<CreditRoute, CompetitionCreditRun[]>();
  const openRunIdsByRoute = new Map<CreditRoute, Set<string>>();
  for (const run of currentRuns) {
    if (
      !routes.includes(run.route)
      || typeof run.runId !== 'string'
      || run.runId.trim().length === 0
      || !isCreditRunStatus(run.status)
    ) {
      throw new DomainConflictError('La proyeccion de runs de creditos contiene datos invalidos.', {
        reason: 'CREDIT_RUN_PROJECTION_INVALID',
      });
    }
    if (seenCurrentRunIds.has(run.runId)) {
      throw new DomainConflictError('La proyeccion de runs de creditos contiene IDs duplicados.', {
        reason: 'CREDIT_RUN_PROJECTION_DUPLICATE_IDS',
      });
    }
    seenCurrentRunIds.add(run.runId);
    const routeRuns = currentRunsByRoute.get(run.route) ?? [];
    routeRuns.push(run);
    currentRunsByRoute.set(run.route, routeRuns);
    if (!isOpenCreditRun(run.status) || typeof run.runId !== 'string') continue;
    const ids = openRunIdsByRoute.get(run.route) ?? new Set<string>();
    ids.add(run.runId);
    openRunIdsByRoute.set(run.route, ids);
  }
  // Reconcile every lot in the current period, not only lots that happen to
  // be usable right now. A closed/blocked historical lot must not make an
  // absent or stale projection look healthy.
  const [ownLots, poolLots]: [CreditLot[], CreditLot[]] = await Promise.all([
    db.collection<CreditLot>('competition_credit_lots').find({
      walletNormalized,
      periodId: period.periodId,
      route: { $in: routes },
    }).limit(MAX_PUBLIC_CREDIT_LOTS + 1).toArray(),
    db.collection<CreditLot>('competition_credit_pool_lots').find({
      periodId: period.periodId,
      route: { $in: routes },
    }).limit(MAX_PUBLIC_CREDIT_LOTS + 1).toArray(),
  ]);
  const ownLotsByRoute = Object.fromEntries(routes.map((route) => [
    route,
    ownLots.filter((lot) => lot.route === route),
  ])) as Record<CreditRoute, CreditLot[]>;
  const poolLotsByRoute = Object.fromEntries(routes.map((route) => [
    route,
    poolLots.filter((lot) => lot.route === route),
  ])) as Record<CreditRoute, CreditLot[]>;
  const ownMaterialization = Object.fromEntries(routes.map((route) => [
    route,
    ownLots.length > MAX_PUBLIC_CREDIT_LOTS
      ? { state: 'too_large' as const, totals: { ...EMPTY_CREDIT_LOT_ACCOUNTING }, usableCredits: 0 }
      : materializePublicLots({
          lots: ownLotsByRoute[route],
          bucket: 'own',
          walletNormalized,
          periodId: period.periodId,
          route,
          openRunIdsByRoute,
          now,
        }),
  ])) as Record<CreditRoute, PublicLotMaterialization>;
  const poolMaterialization = Object.fromEntries(routes.map((route) => [
    route,
    poolLots.length > MAX_PUBLIC_CREDIT_LOTS
      ? { state: 'too_large' as const, totals: { ...EMPTY_CREDIT_LOT_ACCOUNTING }, usableCredits: 0 }
      : materializePublicLots({
          lots: poolLotsByRoute[route],
          bucket: 'pool',
          walletNormalized,
          periodId: period.periodId,
          route,
          openRunIdsByRoute,
          now,
        }),
  ])) as Record<CreditRoute, PublicLotMaterialization>;

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

  type PublicBalance = {
    grantedCredits: number | null;
    poolDepositedCredits: number | null;
    availableCredits: number;
    reservedCredits: number | null;
    spentCredits: number | null;
    expiredCredits: number | null;
    blocked: boolean;
    materialization: { state: CreditMaterializationState };
  };
  type PublicPoolBalance = {
    availableCredits: number;
    reservedCredits: number | null;
    blocked: boolean;
    materialization: { state: CreditMaterializationState };
  };
  const routeStatus = Object.fromEntries(routes.map((route) => {
    const account = accounts.find((candidate) => candidate.route === route);
    const pool = pools.find((candidate) => candidate.route === route);
    const ownLotState = ownMaterialization[route];
    const poolLotState = poolMaterialization[route];
    const accountState = projectionState({
      lotMaterialization: ownLotState,
      projection: account as unknown as Record<string, unknown> | null,
      expected: {
        grantedCredits: ownLotState.totals.totalCredits,
        poolDepositedCredits: ownLotState.totals.poolDepositedCredits,
        availableCredits: ownLotState.totals.availableCredits,
        reservedCredits: ownLotState.totals.reservedCredits,
        spentCredits: ownLotState.totals.spentCredits,
        expiredCredits: ownLotState.totals.expiredCredits,
      },
      fields: [
        'grantedCredits',
        'poolDepositedCredits',
        'availableCredits',
        'reservedCredits',
        'spentCredits',
        'expiredCredits',
      ],
    });
    const poolState = projectionState({
      lotMaterialization: poolLotState,
      projection: pool as unknown as Record<string, unknown> | null,
      expected: {
        contributedCredits: poolLotState.totals.totalCredits,
        availableCredits: poolLotState.totals.availableCredits,
        reservedCredits: poolLotState.totals.reservedCredits,
        spentCredits: poolLotState.totals.spentCredits,
        expiredCredits: poolLotState.totals.expiredCredits,
      },
      fields: [
        'contributedCredits',
        'availableCredits',
        'reservedCredits',
        'spentCredits',
        'expiredCredits',
      ],
    });
    const watermark = watermarks.find((candidate) => candidate.route === route);
    const openIncidents = routeIncidentCounts.find((candidate) => candidate.route === route)?.count ?? 0;
    const observedThrough = watermark?.observedThrough instanceof Date
      ? new Date(watermark.observedThrough.getTime())
      : null;
    const accountProjection = account as unknown as Record<string, unknown> | null;
    const poolProjection = pool as unknown as Record<string, unknown> | null;
    return [route, {
      balance: {
        grantedCredits: materializedOrProjectedCredits(ownLotState, accountState, accountProjection, 'totalCredits', `${route}.grantedCredits`),
        poolDepositedCredits: materializedOrProjectedCredits(ownLotState, accountState, accountProjection, 'poolDepositedCredits', `${route}.poolDepositedCredits`),
        availableCredits: accountState === 'ready' ? ownLotState.usableCredits : 0,
        reservedCredits: materializedOrProjectedCredits(ownLotState, accountState, accountProjection, 'reservedCredits', `${route}.reservedCredits`),
        spentCredits: materializedOrProjectedCredits(ownLotState, accountState, accountProjection, 'spentCredits', `${route}.spentCredits`),
        expiredCredits: materializedOrProjectedCredits(ownLotState, accountState, accountProjection, 'expiredCredits', `${route}.expiredCredits`),
        blocked: account?.blocked === true,
        materialization: { state: accountState },
      },
      pool: {
        availableCredits: poolState === 'ready' ? poolLotState.usableCredits : 0,
        reservedCredits: materializedOrProjectedCredits(poolLotState, poolState, poolProjection, 'reservedCredits', `${route}.pool.reservedCredits`),
        blocked: pool?.blocked === true,
        materialization: { state: poolState },
      },
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
    balance: PublicBalance;
    pool: PublicPoolBalance;
    grants: { healthy: boolean; sourceObservedThrough: Date | null; openIncidents: number };
  }>;
  const accountProjectionComplete = routes.every((route) => (
    routeStatus[route].balance.materialization.state === 'ready'
  ));
  const poolProjectionComplete = routes.every((route) => (
    routeStatus[route].pool.materialization.state === 'ready'
  ));
  const balanceMaterialization = routes.reduce<CreditMaterializationState>(
    (state, route) => worseMaterializationState(
      state,
      routeStatus[route].balance.materialization.state,
    ),
    'ready',
  );
  const poolMaterializationState = routes.reduce<CreditMaterializationState>(
    (state, route) => worseMaterializationState(
      state,
      routeStatus[route].pool.materialization.state,
    ),
    'ready',
  );
  const knownOpenIncidents = routeIncidentCounts.reduce((total, item) => total + item.count, 0);
  const openIncidents = knownOpenIncidents + unknownRouteIncidentCount;
  const globallyBlocked = openIncidents > 0 || blockedAccountCount > 0;
  const balance: PublicBalance = {
    grantedCredits: accountProjectionComplete
      ? routes.reduce((total, route) => total + (routeStatus[route].balance.grantedCredits ?? 0), 0)
      : null,
    poolDepositedCredits: accountProjectionComplete
      ? routes.reduce((total, route) => total + (routeStatus[route].balance.poolDepositedCredits ?? 0), 0)
      : null,
    availableCredits: balanceMaterialization === 'ready'
      ? routes.reduce((total, route) => total + routeStatus[route].balance.availableCredits, 0)
      : 0,
    reservedCredits: accountProjectionComplete
      ? routes.reduce((total, route) => total + (routeStatus[route].balance.reservedCredits ?? 0), 0)
      : null,
    spentCredits: accountProjectionComplete
      ? routes.reduce((total, route) => total + (routeStatus[route].balance.spentCredits ?? 0), 0)
      : null,
    expiredCredits: accountProjectionComplete
      ? routes.reduce((total, route) => total + (routeStatus[route].balance.expiredCredits ?? 0), 0)
      : null,
    blocked: routes.some((route) => routeStatus[route].balance.blocked) || globallyBlocked,
    materialization: { state: balanceMaterialization },
  };
  const poolBalance: PublicPoolBalance = {
    availableCredits: poolMaterializationState === 'ready'
      ? routes.reduce((total, route) => total + routeStatus[route].pool.availableCredits, 0)
      : 0,
    reservedCredits: poolProjectionComplete
      ? routes.reduce((total, route) => total + (routeStatus[route].pool.reservedCredits ?? 0), 0)
      : null,
    blocked: routes.some((route) => routeStatus[route].pool.blocked),
    materialization: { state: poolMaterializationState },
  };
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
    materialization: {
      balance: balanceMaterialization,
      pool: poolMaterializationState,
    },
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
        status: aggregateCurrentRunStatus(currentRunsByRoute.get(route) ?? []),
      })),
    },
  };
}
