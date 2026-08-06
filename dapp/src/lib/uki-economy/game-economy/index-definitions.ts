/**
 * Definiciones puras para que el inicializador central pueda integrarlas sin
 * hacer que la DApp dependa del paquete del indexer.
 */
export const GAME_ECONOMY_COLLECTIONS = [
  "game_economy_rule_state",
  "game_economy_rules",
  "game_economy_sessions",
  "game_economy_events",
  "game_economy_resource_bindings",
  "game_owned_cukie_epochs",
  "game_owned_cukie_assignments",
  "game_owned_cukie_events",
  "game_result_evidence",
  "game_economy_runtime_state",
  "game_economy_runtime_runs",
] as const;

export const GAME_ECONOMY_INDEX_DEFINITIONS = [
  {
    collection: "game_economy_rule_state",
    keys: { gameId: 1 },
    options: { unique: true, name: "game_rule_state_game_unique" },
  },
  {
    collection: "game_economy_rules",
    keys: { gameId: 1, version: 1 },
    options: { unique: true, name: "game_rule_version_unique" },
  },
  {
    collection: "game_economy_rules",
    keys: { gameId: 1, active: 1, activeFrom: -1, activeUntil: 1 },
    options: { name: "game_rule_active_window" },
  },
  {
    collection: "game_economy_rules",
    keys: { gameId: 1, configHash: 1 },
    options: { name: "game_rule_config_integrity" },
  },
  {
    collection: "game_economy_sessions",
    keys: { sessionId: 1 },
    options: { unique: true, name: "game_session_id_unique" },
  },
  {
    collection: "game_economy_sessions",
    keys: { "createCommand.idempotencyKey": 1 },
    options: { unique: true, name: "game_session_create_idempotency_unique" },
  },
  {
    collection: "game_economy_sessions",
    keys: { "validation.evidenceId": 1 },
    options: {
      unique: true,
      name: "game_session_evidence_once",
      partialFilterExpression: { "validation.evidenceId": { $type: "string" } },
    },
  },
  {
    collection: "game_economy_sessions",
    keys: { walletNormalized: 1, gameId: 1, createdAt: -1 },
    options: { name: "game_session_wallet_history" },
  },
  {
    collection: "game_economy_sessions",
    keys: { status: 1, expiresAt: 1, _id: 1 },
    options: { name: "game_session_expiry_scan" },
  },
  {
    collection: "game_economy_sessions",
    keys: { status: 1, settledAt: 1, sessionId: 1 },
    options: { name: "game_session_reward_census" },
  },
  {
    collection: "game_economy_sessions",
    keys: { "settlementIntent.decidedAt": 1, _id: 1 },
    options: {
      name: "game_session_pending_settlement_census",
      partialFilterExpression: {
        "settlementIntent.decidedAt": { $type: "date" },
        settlementCommand: { $exists: false },
      },
    },
  },
  {
    collection: "game_economy_sessions",
    keys: { "operation.leaseExpiresAt": 1, status: 1, _id: 1 },
    options: { name: "game_session_stale_operation_scan" },
  },
  {
    collection: "game_economy_events",
    keys: { eventId: 1 },
    options: { unique: true, name: "game_event_id_unique" },
  },
  {
    collection: "game_economy_events",
    keys: { sessionId: 1, toRevision: 1 },
    options: { unique: true, name: "game_event_session_revision_unique" },
  },
  {
    collection: "game_economy_events",
    keys: { sessionId: 1, createdAt: 1, _id: 1 },
    options: { name: "game_event_session_history" },
  },
  {
    collection: "game_economy_resource_bindings",
    keys: { sessionId: 1, kind: 1 },
    options: { unique: true, name: "game_resource_session_kind_unique" },
  },
  {
    collection: "game_economy_resource_bindings",
    keys: { reservationIdempotencyKey: 1 },
    options: { unique: true, name: "game_resource_idempotency_unique" },
  },
  {
    collection: "game_economy_resource_bindings",
    keys: { kind: 1, reservationId: 1 },
    options: {
      unique: true,
      name: "game_resource_external_reservation_unique",
      partialFilterExpression: { reservationId: { $type: "string" } },
    },
  },
  {
    collection: "game_economy_resource_bindings",
    keys: { status: 1, updatedAt: 1, _id: 1 },
    options: { name: "game_resource_reconciliation_scan" },
  },
  {
    collection: "game_owned_cukie_epochs",
    keys: { epochId: 1 },
    options: { unique: true, name: "game_owned_cukie_epoch_unique" },
  },
  {
    collection: "game_owned_cukie_epochs",
    keys: { assetId: 1, ownerNormalized: 1, ownershipEventId: 1 },
    options: { unique: true, name: "game_owned_cukie_ownership_epoch_unique" },
  },
  {
    collection: "game_owned_cukie_epochs",
    keys: { ownerNormalized: 1, status: 1, gamesRemaining: -1, _id: 1 },
    options: { name: "game_owned_cukie_wallet_quota" },
  },
  {
    collection: "game_owned_cukie_assignments",
    keys: { assignmentId: 1 },
    options: { unique: true, name: "game_owned_cukie_assignment_unique" },
  },
  {
    collection: "game_owned_cukie_assignments",
    keys: { sessionId: 1 },
    options: { unique: true, name: "game_owned_cukie_session_unique" },
  },
  {
    collection: "game_owned_cukie_assignments",
    keys: { idempotencyKey: 1 },
    options: { unique: true, name: "game_owned_cukie_idempotency_unique" },
  },
  {
    collection: "game_owned_cukie_assignments",
    keys: { epochId: 1, status: 1 },
    options: {
      unique: true,
      name: "game_owned_cukie_active_epoch_unique",
      partialFilterExpression: { status: "active" },
    },
  },
  {
    collection: "game_owned_cukie_assignments",
    keys: { status: 1, expiresAt: 1, _id: 1 },
    options: { name: "game_owned_cukie_expiry_scan" },
  },
  {
    collection: "game_owned_cukie_events",
    keys: { eventId: 1 },
    options: { unique: true, name: "game_owned_cukie_event_unique" },
  },
  {
    collection: "game_owned_cukie_events",
    keys: { idempotencyKey: 1 },
    options: { unique: true, name: "game_owned_cukie_event_idempotency_unique" },
  },
  {
    collection: "game_owned_cukie_events",
    keys: { assignmentId: 1, createdAt: 1, _id: 1 },
    options: { name: "game_owned_cukie_assignment_history" },
  },
  {
    collection: "game_result_evidence",
    keys: { evidenceId: 1 },
    options: { unique: true, name: "game_evidence_id_unique" },
  },
  {
    collection: "game_result_evidence",
    keys: { evidenceReference: 1 },
    options: { unique: true, name: "game_evidence_reference_unique" },
  },
  {
    collection: "game_result_evidence",
    keys: { idempotencyKey: 1 },
    options: { unique: true, name: "game_evidence_idempotency_unique" },
  },
  {
    collection: "game_result_evidence",
    keys: { sessionId: 1, status: 1 },
    options: { name: "game_evidence_session_status" },
  },
  {
    collection: "game_economy_runtime_state",
    keys: { updatedAt: -1 },
    options: { name: "game_runtime_state_health" },
  },
  {
    collection: "game_economy_runtime_runs",
    keys: { status: 1, endedAt: -1 },
    options: { name: "game_runtime_run_health" },
  },
  {
    collection: "game_economy_runtime_runs",
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0, name: "game_runtime_run_expiry" },
  },
] as const;
