#!/usr/bin/env node

import { MongoClient } from 'mongodb';

import {
  STAGING_ECONOMY_CONFIRMATION,
  STAGING_ECONOMY_CURSOR_EVENTS,
  STAGING_ECONOMY_RULESET,
  StagingEconomyRulesError,
  buildStagingEconomyRuleSet,
  ruleSemanticHash,
  validateStagingEconomyEnvironment,
} from './staging-economy-rules-policy.mjs';

const RULE_SPECS = Object.freeze([
  {
    kind: 'reward',
    collection: 'economy_rule_versions',
    stateCollection: 'reward_rule_state',
    stateId: 'reward_allocations',
    query: (rule) => ({ scope: rule.scope, version: rule.version }),
    overlap: (rule) => ({
      scope: rule.scope,
      active: true,
      _id: { $ne: rule._id },
      $or: [{ activeUntil: { $exists: false } }, { activeUntil: { $gt: rule.activeFrom } }],
    }),
  },
  {
    kind: 'credit',
    collection: 'economy_rule_versions',
    stateCollection: null,
    stateId: null,
    query: (rule) => ({ scope: rule.scope, version: rule.version }),
    overlap: (rule) => ({
      scope: rule.scope,
      active: true,
      _id: { $ne: rule._id },
      $or: [{ activeUntil: { $exists: false } }, { activeUntil: { $gt: rule.activeFrom } }],
    }),
  },
  {
    kind: 'game',
    collection: 'game_economy_rules',
    stateCollection: 'game_economy_rule_state',
    stateId: STAGING_ECONOMY_RULESET.gameId,
    query: (rule) => ({ gameId: rule.gameId, version: rule.version }),
    overlap: (rule) => ({
      gameId: rule.gameId,
      active: true,
      _id: { $ne: rule._id },
      $or: [{ activeUntil: { $exists: false } }, { activeUntil: { $gt: rule.activeFrom } }],
    }),
  },
  {
    kind: 'ranking',
    collection: 'economy_rule_versions',
    stateCollection: 'weekly_ranking_rule_state',
    stateId: 'weekly_arena_ranking',
    query: (rule) => ({ scope: rule.scope, version: rule.version }),
    overlap: (rule) => ({
      scope: rule.scope,
      active: true,
      _id: { $ne: rule._id },
      $or: [{ activeUntil: { $exists: false } }, { activeUntil: { $gt: rule.activeFrom } }],
    }),
  },
]);

function parseMode(argv) {
  const apply = argv.includes('--apply');
  const plan = argv.includes('--plan');
  if (apply === plan) {
    throw new StagingEconomyRulesError(['use exactly one of --plan or --apply']);
  }
  const confirmationIndex = argv.indexOf('--confirm');
  const confirmation = confirmationIndex >= 0 ? argv[confirmationIndex + 1] : null;
  if (apply && confirmation !== STAGING_ECONOMY_CONFIRMATION) {
    throw new StagingEconomyRulesError([
      `--apply requires --confirm ${STAGING_ECONOMY_CONFIRMATION}`,
    ]);
  }
  return apply ? 'apply' : 'plan';
}

async function inspectRules(db, rules, session) {
  const actions = [];
  const blockers = [];
  for (const spec of RULE_SPECS) {
    const rule = rules[spec.kind];
    const collection = db.collection(spec.collection);
    const options = session ? { session } : {};
    const existing = await collection.findOne(spec.query(rule), options);
    const overlap = await collection.findOne(spec.overlap(rule), options);
    if (overlap) {
      if (
        (spec.kind === 'reward' || spec.kind === 'credit' || spec.kind === 'game')
        && rule.version === (
          spec.kind === 'reward'
            ? STAGING_ECONOMY_RULESET.rewardVersion
            : spec.kind === 'credit'
              ? STAGING_ECONOMY_RULESET.creditVersion
              : STAGING_ECONOMY_RULESET.gameVersion
        )
        && typeof overlap._id === 'string'
        && overlap.activeFrom instanceof Date
        && overlap.activeFrom < rule.activeFrom
      ) {
        actions.push({ ...spec, rule, action: 'insert', supersedesId: overlap._id });
      } else {
        blockers.push(`${spec.kind} rule ${rule.version} overlaps active ${String(overlap.version)}`);
      }
      continue;
    }
    if (existing) {
      if (ruleSemanticHash(spec.kind, existing) !== ruleSemanticHash(spec.kind, rule)) {
        blockers.push(`${spec.kind} version ${rule.version} already exists with different semantics`);
      } else {
        actions.push({ ...spec, rule, action: 'replay' });
      }
      continue;
    }
    actions.push({ ...spec, rule, action: 'insert' });
  }
  return { actions, blockers };
}

async function advanceRuleState(db, action, now, session) {
  if (!action.stateCollection || !action.stateId) return;
  const states = db.collection(action.stateCollection);
  const state = await states.findOne({ _id: action.stateId }, { session });
  if (!state) {
    await states.insertOne(
      {
        _id: action.stateId,
        ...(action.kind === 'game' ? { gameId: action.stateId } : { scope: action.stateId }),
        revision: 0,
        createdAt: now,
        updatedAt: now,
      },
      { session },
    );
    return;
  }
  const updated = await states.updateOne(
    { _id: state._id, revision: state.revision },
    { $inc: { revision: 1 }, $set: { updatedAt: now } },
    { session },
  );
  if (updated.matchedCount !== 1) {
    throw new StagingEconomyRulesError([`${action.kind} rule state lost its write fence`]);
  }
}

function publicSummary(mode, rules, inspection, applied = false) {
  return {
    status: inspection.blockers.length === 0 ? 'ready' : 'blocked',
    mode,
    applied,
    target: {
      environment: 'staging',
      chainId: 97,
      database: 'cukieshub-new-staging',
      ruleset: STAGING_ECONOMY_RULESET.id,
    },
    policy: {
      activeFrom: rules.reward.activeFrom,
      dayBoundarySecondUtc: rules.reward.emissionBudget.dayBoundarySecondUtc,
      lateReservationGraceSeconds: rules.reward.emissionBudget.lateReservationGraceSeconds,
      dailyCapRaw: rules.reward.emissionBudget.dailyCapRaw,
      lifetimeCapRaw: rules.reward.emissionBudget.lifetimeCapRaw,
      unusedDailyCapacity: rules.reward.emissionBudget.unusedDailyCapacity,
      overflowPolicy: rules.reward.emissionBudget.overflowPolicy,
    },
    rules: inspection.actions.map((action) => ({
      kind: action.kind,
      version: action.rule.version,
      configHash: action.rule.configHash,
      action: action.action,
    })),
    blockers: inspection.blockers,
  };
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  validateStagingEconomyEnvironment(process.env);
  const client = new MongoClient(process.env.CHAIN_INDEXER_MONGO_URL, {
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    await client.connect();
    const db = client.db(process.env.CHAIN_INDEXER_DB_NAME);
    const cursors = await db.collection('chain_cursors').find({
      contractAlias: { $in: Object.keys(STAGING_ECONOMY_CURSOR_EVENTS) },
    }).toArray();
    const schema = await db.collection('economy_schema_metadata').findOne({ _id: 'uki-economy' });
    if (schema?.schemaVersion !== 3 || !(schema.migratedAt instanceof Date)) {
      throw new StagingEconomyRulesError([
        'credit v3 requires an economy schema v3 sentinel with migratedAt baseline',
      ]);
    }
    const now = new Date();
    const rules = buildStagingEconomyRuleSet({
      environment: process.env,
      cursors,
      now,
      creditBaselineAt: schema.migratedAt,
    });
    const inspection = await inspectRules(db, rules);
    if (mode === 'plan') {
      console.log(JSON.stringify(publicSummary(mode, rules, inspection), null, 2));
      if (inspection.blockers.length > 0) process.exitCode = 2;
      return;
    }
    if (inspection.blockers.length > 0) {
      console.log(JSON.stringify(publicSummary(mode, rules, inspection), null, 2));
      process.exitCode = 2;
      return;
    }

    const session = client.startSession();
    let appliedInspection;
    try {
      await session.withTransaction(async () => {
        appliedInspection = await inspectRules(db, rules, session);
        if (appliedInspection.blockers.length > 0) {
          throw new StagingEconomyRulesError(appliedInspection.blockers);
        }
        for (const action of appliedInspection.actions.filter((item) => item.action === 'insert')) {
          if (action.supersedesId) {
            const retired = await db.collection(action.collection).updateOne(
              {
                _id: action.supersedesId,
                active: true,
                $or: [
                  { activeUntil: { $exists: false } },
                  { activeUntil: { $gt: action.rule.activeFrom } },
                ],
              },
              {
                $set: {
                  active: true,
                  activeUntil: action.rule.activeFrom,
                  supersededByVersion: action.rule.version,
                  supersededReason: 'unrecoverable_pre_migration',
                  updatedAt: now,
                },
              },
              { session },
            );
            if (retired.matchedCount !== 1) {
              throw new StagingEconomyRulesError([
                `${action.kind} ${action.rule.version} lost its supersession fence`,
              ]);
            }
          }
          await advanceRuleState(db, action, now, session);
          await db.collection(action.collection).insertOne(action.rule, { session });
        }
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
    } finally {
      await session.endSession();
    }
    const verification = await inspectRules(db, rules);
    if (verification.blockers.length > 0 || verification.actions.some((item) => item.action !== 'replay')) {
      throw new StagingEconomyRulesError(['post-apply verification did not find all exact rules']);
    }
    console.log(JSON.stringify(publicSummary(mode, rules, verification, true), null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
