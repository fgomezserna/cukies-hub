import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { MongoClient } from 'mongodb';

const DATABASE_NAME = 'cukieshub-new-staging';
const CHAIN_ID = 97;
const CONFIRMATION = 'APPLY_NFT_SLOT_HISTORY_REPAIR_STAGE97';
const VAULT_ALIAS = 'CUKIE_MASTER_NFT_VAULT';
const WITHDRAWAL_EVENT = 'CukieMasterWithdrawn';

function exactAddressRegex(address) {
  return new RegExp(`^${address}$`, 'i');
}

function required(name, environment = process.env) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio.`);
  return value;
}

function databaseNameFromMongoUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'mongodb:' && url.protocol !== 'mongodb+srv:') {
    throw new Error('CHAIN_INDEXER_MONGO_URL debe ser una URL MongoDB.');
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, '')).trim();
  if (!name) throw new Error('CHAIN_INDEXER_MONGO_URL debe incluir la base explicita.');
  return name;
}

export function validateRepairEnvironment(environment = process.env) {
  if (environment.APP_ENV?.trim() !== 'staging') throw new Error('APP_ENV debe ser staging.');
  if (environment.STAGING_ONLY_GUARD?.trim() !== 'true') throw new Error('STAGING_ONLY_GUARD debe ser true.');
  if (environment.NEXT_PUBLIC_UKI_CHAIN_ID?.trim() !== String(CHAIN_ID)) throw new Error('NEXT_PUBLIC_UKI_CHAIN_ID debe ser 97.');
  const mongoUrl = required('CHAIN_INDEXER_MONGO_URL', environment);
  if (databaseNameFromMongoUrl(mongoUrl) !== DATABASE_NAME) throw new Error(`CHAIN_INDEXER_MONGO_URL debe apuntar a ${DATABASE_NAME}.`);
  if (environment.CHAIN_INDEXER_DB_NAME?.trim() !== DATABASE_NAME) throw new Error(`CHAIN_INDEXER_DB_NAME debe ser ${DATABASE_NAME}.`);
  const vaultAddress = required('CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_ADDRESS', environment).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(vaultAddress) || /^0x0{40}$/.test(vaultAddress)) throw new Error('CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_ADDRESS no es valida.');
  return { mongoUrl, databaseName: DATABASE_NAME, vaultAddress };
}

function dateFromTimestampMs(value) {
  if (!Number.isSafeInteger(value) || value < 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validHash(value) { return typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value); }
function validAddress(value) { return typeof value === 'string' && /^0x[0-9a-f]{40}$/.test(value.toLowerCase()) && !/^0x0{40}$/.test(value.toLowerCase()); }

function validWithdrawal(event, vaultAddress) {
  const blockTimestamp = dateFromTimestampMs(event.timestampMs);
  return event.chain === 'BSC' && event.chainId === CHAIN_ID && event.status === 'projected'
    && event.contractAlias === VAULT_ALIAS && event.contractAddress?.toLowerCase() === vaultAddress
    && event.eventName === WITHDRAWAL_EVENT && validAddress(event.normalized?.beneficiaryNormalized)
    && Number.isSafeInteger(event.blockNumber) && event.blockNumber >= 0 && validHash(event.blockHash)
    && Number.isSafeInteger(event.logIndex) && event.logIndex >= 0 && blockTimestamp !== null;
}

function validCheckpoint(checkpoint, now = null) {
  return checkpoint && Number.isSafeInteger(checkpoint.safeBlockNumber) && checkpoint.safeBlockNumber >= 0
    && validHash(checkpoint.safeBlockHash) && checkpoint.checkedAt instanceof Date && !Number.isNaN(checkpoint.checkedAt.getTime())
    && (!now || checkpoint.checkedAt.getTime() >= now.getTime() - 15 * 60 * 1_000);
}

function validPositionEvent(event) {
  return event && typeof event._id === 'string' && event._id.length > 0
    && event.createdAt instanceof Date && !Number.isNaN(event.createdAt.getTime())
    && event.eventType === 'slot_transitioned' && event.reason === 'slot_eligibility_lost'
    && event.route === 'nft' && validAddress(event.walletNormalized)
    && typeof event.requestIdempotencyKey === 'string' && event.requestIdempotencyKey.startsWith('outbox:')
    && event.previousSlot?.route === 'nft' && event.nextSlot?.route === 'nft'
    && event.previousSlot.walletNormalized === event.walletNormalized && event.nextSlot.walletNormalized === event.walletNormalized
    && (event.previousSlot.status === 'active' || event.previousSlot.status === 'grace') && event.nextSlot.status === 'inactive'
    && event.previousSlot.ruleVersion === event.nextSlot.ruleVersion && event.previousSlot.roundId === event.nextSlot.roundId
    && event.previousSlot.eligibilityEpoch === event.nextSlot.eligibilityEpoch
    && typeof event.nextSlot.sourceHash === 'string' && /^[0-9a-f]{64}$/.test(event.nextSlot.sourceHash)
    && event.next?.route === 'nft' && event.next?.sourceHash === event.nextSlot.sourceHash
    && event.next.ruleVersion === event.nextSlot.ruleVersion && event.next.roundId === event.nextSlot.roundId;
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => [key, stableValue(child)]));
  return value;
}

function payloadHash(value) { return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex'); }

export function assertExistingRepairPayload(existing, planned) {
  if (existing) {
    const { repairPayloadHash: _storedHash, ...storedPayload } = existing;
    if (
      existing.repairPayloadHash !== planned.repairPayloadHash
      || payloadHash(storedPayload) !== planned.repairPayloadHash
    ) {
      throw new Error(`La correccion ${planned.version._id} ya existe con payload distinto.`);
    }
  }
}

export function assertNonEmptyRepairPlan(plan, scope) {
  const explicitScope = scope.wallet !== null || scope.fromBlock !== null || scope.toBlock !== null;
  if (explicitScope && plan.plans.length === 0) {
    throw new Error('El repair no contiene correcciones para el scope explicito; se aborta sin exito silencioso.');
  }
}

function validTemporalVersion(version) {
  return version && typeof version._id === 'string' && typeof version.slotId === 'string' && version.route === 'nft'
    && Number.isSafeInteger(version.effectiveBlockNumber) && validHash(version.effectiveBlockHash)
    && version.effectiveBlockTimestamp instanceof Date && !Number.isNaN(version.effectiveBlockTimestamp.getTime())
    && version.slot && typeof version.slot._id === 'string' && Number.isSafeInteger(version.slot.revision);
}

function versionAtRevision(versions, slotId, revision) {
  return versions.filter((version) => validTemporalVersion(version)
    && !String(version._id).startsWith('repair:')
    && version.slotId === slotId && version.slot.revision === revision);
}

function eventSort(left, right) { return left.blockNumber - right.blockNumber || left.logIndex - right.logIndex || String(left._id).localeCompare(String(right._id)); }

function parseArgs(argv) {
  const result = { wallet: null, fromBlock: null, toBlock: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--wallet') result.wallet = argv[++index]?.toLowerCase() ?? null;
    else if (arg === '--from-block') result.fromBlock = Number(argv[++index]);
    else if (arg === '--to-block') result.toBlock = Number(argv[++index]);
    else if (arg === '--confirm') index += 1;
    else if (arg !== '--plan' && arg !== '--apply') throw new Error(`Argumento desconocido: ${arg}`);
  }
  if (result.wallet !== null && !validAddress(result.wallet)) throw new Error('--wallet no es una direccion BSC valida.');
  for (const [name, value] of [['--from-block', result.fromBlock], ['--to-block', result.toBlock]]) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new Error(`${name} no es un bloque valido.`);
  }
  if (result.fromBlock !== null && result.toBlock !== null && result.fromBlock > result.toBlock) throw new Error('--from-block no puede superar --to-block.');
  return result;
}

export function planSlotHistoryRepair({ withdrawals, positionEvents, jobs, versions, checkpoint, vaultAddress, wallet = null, fromBlock = null, toBlock = null, now = null }) {
  if (!validCheckpoint(checkpoint, now)) throw new Error('El checkpoint BSC no es saludable o esta caducado.');
  const validWithdrawals = withdrawals.filter((event) => validWithdrawal(event, vaultAddress));
  const confirmed = validWithdrawals
    .filter((event) => !wallet || event.normalized.beneficiaryNormalized.toLowerCase() === wallet)
    .filter((event) => fromBlock === null || event.blockNumber >= fromBlock)
    .filter((event) => toBlock === null || event.blockNumber <= toBlock).sort(eventSort);
  const invalidWithdrawals = withdrawals.length - validWithdrawals.length;
  const outOfScopeWithdrawals = validWithdrawals.length - confirmed.length;
  const validVersions = versions.filter(validTemporalVersion);
  const plans = [];
  const mismatches = [];
  const usedPositionEvents = new Set();
  for (const withdrawal of confirmed) {
    if (withdrawal.blockNumber > checkpoint.safeBlockNumber) { mismatches.push({ code: 'WITHDRAWAL_AFTER_SAFE_CHECKPOINT', eventId: withdrawal._id }); continue; }
    const walletNormalized = withdrawal.normalized.beneficiaryNormalized.toLowerCase();
    const matchingJobs = jobs.filter((job) => job.status === 'completed' && job.route === 'nft'
      && job.walletNormalized === walletNormalized && job.sourceEventId === withdrawal._id
      && job.sourceType === 'chain_event' && typeof job._id === 'string');
    if (matchingJobs.length !== 1) { mismatches.push({ code: 'WITHDRAWAL_JOB_LINK_AMBIGUOUS', eventId: withdrawal._id, count: matchingJobs.length }); continue; }
    const job = matchingJobs[0];
    const triggerTime = dateFromTimestampMs(withdrawal.timestampMs);
    const completedAt = job.completedAt instanceof Date ? job.completedAt : null;
    if (!completedAt || completedAt.getTime() < triggerTime.getTime()) { mismatches.push({ code: 'JOB_COMPLETION_TIME_INVALID', eventId: withdrawal._id }); continue; }
    const laterEvents = withdrawals.filter((event) => validWithdrawal(event, vaultAddress)
      && event.normalized.beneficiaryNormalized.toLowerCase() === walletNormalized && event._id !== withdrawal._id
      && event.blockNumber > withdrawal.blockNumber && dateFromTimestampMs(event.timestampMs)?.getTime() <= completedAt.getTime());
    if (laterEvents.length > 0) { mismatches.push({ code: 'LATER_ELIGIBILITY_EVENT_BEFORE_JOB_COMPLETION', eventId: withdrawal._id, count: laterEvents.length }); continue; }
    const matchingEvents = positionEvents.filter((event) => validPositionEvent(event)
      && event.walletNormalized === walletNormalized && event.requestIdempotencyKey === `outbox:${job._id}`);
    if (matchingEvents.length === 0) { mismatches.push({ code: 'POSITION_EVENT_MISSING', eventId: withdrawal._id }); continue; }
    for (const positionEvent of matchingEvents) {
      if (usedPositionEvents.has(positionEvent._id)) continue;
      usedPositionEvents.add(positionEvent._id);
      const slotId = positionEvent.nextSlot._id;
      const candidates = versionAtRevision(validVersions, slotId, positionEvent.nextSlot.revision);
      if (candidates.length > 1) { mismatches.push({ code: 'CANONICAL_VERSION_REVISION_AMBIGUOUS', eventId: positionEvent._id, slotId }); continue; }
      if (candidates.length === 0) { mismatches.push({ code: 'CANONICAL_VERSION_REVISION_MISSING', eventId: positionEvent._id, slotId }); continue; }
      const original = candidates[0];
      const validFrom = original?.validFrom instanceof Date && !Number.isNaN(original.validFrom.getTime()) ? original.validFrom : positionEvent.createdAt;
      const validUntil = original?.validUntil instanceof Date && !Number.isNaN(original.validUntil.getTime()) ? original.validUntil : undefined;
      const correctedSlot = { ...positionEvent.nextSlot, sourceBlockNumber: withdrawal.blockNumber, sourceBlockHash: withdrawal.blockHash.toLowerCase(), sourceBlockTimestamp: triggerTime };
      const version = { _id: `repair:${positionEvent._id}`, slotId, route: 'nft', validFrom, ...(validUntil ? { validUntil } : {}), effectiveBlockNumber: withdrawal.blockNumber, effectiveBlockHash: withdrawal.blockHash.toLowerCase(), effectiveBlockTimestamp: triggerTime, observedAt: positionEvent.createdAt, slot: correctedSlot, createdAt: positionEvent.createdAt, repairSourceEventId: withdrawal._id, repairSourcePositionEventId: positionEvent._id, repairReason: 'confirmed_cukie_master_withdrawal' };
      const hash = payloadHash(version);
      plans.push({ withdrawal, job, positionEvent, original, version: { ...version, repairPayloadHash: hash }, repairPayloadHash: hash });
    }
  }
  return { plans, invalidWithdrawals, outOfScopeWithdrawals, mismatches, checkpoint, scope: { wallet, fromBlock, toBlock }, planHash: payloadHash(plans.map((plan) => ({ id: plan.version._id, hash: plan.repairPayloadHash }))) };
}

async function readPlan(db, input, session = null) {
  const options = session ? { session } : undefined;
  const checkpoint = await db.collection('chain_bsc_checkpoints').findOne({ _id: 'canonical-safe' }, options);
  const filter = { chain: 'BSC', chainId: CHAIN_ID, status: 'projected', contractAlias: VAULT_ALIAS, contractAddress: exactAddressRegex(input.vaultAddress), eventName: WITHDRAWAL_EVENT };
  const findMany = (collection, query) => db.collection(collection).find(query, options).toArray();
  let withdrawals;
  let jobs;
  let positionEvents;
  let versions;
  if (session) {
    withdrawals = await findMany('chain_events', filter);
    jobs = await findMany('cukie_master_recalculation_jobs', { route: 'nft', sourceType: 'chain_event', status: 'completed' });
    positionEvents = await findMany('cukie_master_position_events', { eventType: 'slot_transitioned', route: 'nft', reason: 'slot_eligibility_lost' });
    versions = await findMany('cukie_master_slot_versions', { route: 'nft' });
  } else {
    [withdrawals, jobs, positionEvents, versions] = await Promise.all([
      findMany('chain_events', filter),
      findMany('cukie_master_recalculation_jobs', { route: 'nft', sourceType: 'chain_event', status: 'completed' }),
      findMany('cukie_master_position_events', { eventType: 'slot_transitioned', route: 'nft', reason: 'slot_eligibility_lost' }),
      findMany('cukie_master_slot_versions', { route: 'nft' }),
    ]);
  }
  return planSlotHistoryRepair({ ...input, withdrawals, jobs, positionEvents, versions, checkpoint, now: new Date() });
}

function summary({ apply, db, plan }) {
  return { mode: apply ? 'apply' : 'plan', database: db.databaseName, chainId: CHAIN_ID, checkpoint: { safeBlockNumber: plan.checkpoint.safeBlockNumber, safeBlockHash: plan.checkpoint.safeBlockHash }, plannedCorrections: plan.plans.length, mismatches: plan.mismatches, invalidWithdrawals: plan.invalidWithdrawals, outOfScopeWithdrawals: plan.outOfScopeWithdrawals, writes: apply ? { slotVersionsInserted: plan.plans.length } : { slotVersionsInserted: 0 }, scope: ['cukie_master_slot_versions'], untouched: ['competition_credit_runs', 'competition_credit_run_items', 'competition_credit_ledger', 'cukie_master_slots', 'competition_credit_lots', 'competition_credit_pool_lots'], planHash: plan.planHash };
}

async function applyPlan(db, client, input, expectedPlanHash) {
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const fresh = await readPlan(db, input, session);
      if (fresh.planHash !== expectedPlanHash || fresh.mismatches.length > 0 || fresh.invalidWithdrawals > 0) throw new Error('El plan cambio, contiene entradas invalidas o mismatches; se aborta el apply.');
      const versions = db.collection('cukie_master_slot_versions');
      let inserted = 0;
      let existingCount = 0;
      for (const item of fresh.plans) {
        const existing = await versions.findOne({ _id: item.version._id }, { session });
        if (existing) {
          assertExistingRepairPayload(existing, item);
          existingCount += 1;
          continue;
        }
        await versions.insertOne(item.version, { session });
        inserted += 1;
      }
      return { inserted, existing: existingCount };
    });
  } finally { await session.endSession(); }
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  const apply = argv.includes('--apply');
  const planOnly = argv.includes('--plan');
  if (apply === planOnly) throw new Error('Usa exactamente --plan o --apply.');
  const input = parseArgs(argv);
  const guard = validateRepairEnvironment(environment);
  input.vaultAddress = guard.vaultAddress;
  if (apply && argv[argv.indexOf('--confirm') + 1] !== CONFIRMATION) throw new Error(`--apply requiere --confirm ${CONFIRMATION}.`);
  const client = new MongoClient(guard.mongoUrl);
  try {
    await client.connect();
    const db = client.db(guard.databaseName);
    const plan = await readPlan(db, input);
    if (plan.mismatches.length > 0 || plan.invalidWithdrawals > 0) throw new Error(`Repair abortado por ${plan.mismatches.length} mismatch(s) y ${plan.invalidWithdrawals} retirada(s) invalida(s).`);
    assertNonEmptyRepairPlan(plan, input);
    console.log(JSON.stringify(summary({ apply, db, plan }), null, 2));
    if (apply && plan.plans.length > 0) {
      const result = await applyPlan(db, client, input, plan.planHash);
      console.log(JSON.stringify({ applied: true, ...result }, null, 2));
    }
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
