#!/usr/bin/env bash
set -Eeuo pipefail

readonly expected_resource_uuid='u4s804o4wwcckowgk0woo4wg'
readonly replica_set='cukies-staging-rs0'
readonly bootstrap_database='cukies_staging_mongo_admin'
readonly bootstrap_id='logical-staging-v1'

fail() {
  printf 'STAGING_MONGO_RESYNC_GUARD_FAILED: %s\n' "$1" >&2
  exit 64
}

require_value() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "falta ${name}"
}

[[ "${STAGING_ONLY_GUARD:-}" == 'true' ]] || fail 'STAGING_ONLY_GUARD debe ser true'
[[ "${APP_ENV:-}" == 'staging' ]] || fail 'APP_ENV debe ser staging'
[[ "${COOLIFY_RESOURCE_UUID:-}" == "$expected_resource_uuid" ]] \
  || fail 'COOLIFY_RESOURCE_UUID no corresponde a staging'

require_value MONGO_INITDB_ROOT_USERNAME
require_value MONGO_INITDB_ROOT_PASSWORD
[[ "$MONGO_INITDB_ROOT_USERNAME" == 'cukies_staging_root' ]] \
  || fail 'MONGO_INITDB_ROOT_USERNAME inesperado'

validate_source_url() {
  local name="$1"
  local expected_user="$2"
  local expected_database="$3"
  local value="${!name:-}"

  require_value "$name"
  [[ "$value" =~ ^mongodb://${expected_user}:[^@]+@192\.168\.1\.221:27017/${expected_database}(\?.*)?$ ]] \
    || fail "${name} no apunta al usuario, host y DB de staging esperados"
}

validate_source_url STAGING_MONGO_SOURCE_HUB_URL 'cukies_hub_staging_app' 'cukies-hub-staging'
validate_source_url STAGING_MONGO_SOURCE_LEGACY_URL 'cukies_legacy_staging_app' 'cukies-legacy-staging'
validate_source_url STAGING_MONGO_SOURCE_ECONOMY_URL 'cukies_economy_staging_app' 'cukieshub-new-staging'
validate_source_url STAGING_MONGO_SOURCE_CARD_URL 'cukies_card_staging_worker' 'cukieshub-new-staging'

mongo_admin=(
  mongo
  --quiet
  --host 127.0.0.1
  --port 27017
  --username "$MONGO_INITDB_ROOT_USERNAME"
  --password "$MONGO_INITDB_ROOT_PASSWORD"
  --authenticationDatabase admin
)

"${mongo_admin[@]}" admin --eval 'quit(db.isMaster().ismaster === true ? 0 : 1)' \
  >/dev/null || fail 'la replica staging no esta PRIMARY'

marker_count="$("${mongo_admin[@]}" "$bootstrap_database" --eval \
  "print(db.bootstrap_state.countDocuments({ _id: '$bootstrap_id' }))" | tail -n 1)"
[[ "$marker_count" == '1' ]] || fail 'falta el marcador de bootstrap inicial'

root_uri="mongodb://${MONGO_INITDB_ROOT_USERNAME}:${MONGO_INITDB_ROOT_PASSWORD}@127.0.0.1:27017/?authSource=admin&replicaSet=${replica_set}&directConnection=true"

resync_database() {
  local source_url="$1"
  local database="$2"
  printf 'Resincronizando DB logica de staging: %s\n' "$database"
  mongodump --quiet --uri "$source_url" --archive \
    | mongorestore --quiet --uri "$root_uri" --archive --drop --nsInclude "${database}.*"
}

resync_database "$STAGING_MONGO_SOURCE_HUB_URL" 'cukies-hub-staging'
resync_database "$STAGING_MONGO_SOURCE_LEGACY_URL" 'cukies-legacy-staging'
resync_database "$STAGING_MONGO_SOURCE_ECONOMY_URL" 'cukieshub-new-staging'

"${mongo_admin[@]}" "$bootstrap_database" --eval "
  const now = new Date();
  const result = db.bootstrap_state.updateOne(
    { _id: '$bootstrap_id' },
    {
      \$set: { lastResyncedAt: now, updatedAt: now },
      \$inc: { resyncCount: 1 },
    },
  );
  if (result.matchedCount !== 1) throw new Error('no se actualizo el marcador de resync');
" >/dev/null

"${mongo_admin[@]}" admin --eval '
  const names = ["cukies-hub-staging", "cukies-legacy-staging", "cukieshub-new-staging"];
  const result = {};
  names.forEach(function (name) {
    const stats = db.getSiblingDB(name).stats();
    result[name] = { collections: stats.collections, objects: stats.objects, indexes: stats.indexes };
  });
  print(JSON.stringify({ ok: true, databases: result }));
'
