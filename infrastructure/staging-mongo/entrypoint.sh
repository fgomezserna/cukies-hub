#!/usr/bin/env bash
set -Eeuo pipefail

readonly expected_resource_uuid='u4s804o4wwcckowgk0woo4wg'
readonly replica_set='cukies-staging-rs0'
readonly replica_host='cukies-hub-staging-mongo-u4s804o4wwcckowgk0woo4wg:27017'
readonly source_host='192.168.1.221:27017'
readonly bootstrap_database='cukies_staging_mongo_admin'
readonly bootstrap_id='logical-staging-v1'
readonly keyfile='/tmp/cukies-staging-mongo-keyfile'

fail() {
  printf 'STAGING_MONGO_GUARD_FAILED: %s\n' "$1" >&2
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
require_value STAGING_MONGO_REPLICA_KEY

[[ "${#STAGING_MONGO_REPLICA_KEY}" -ge 32 ]] \
  || fail 'STAGING_MONGO_REPLICA_KEY es demasiado corta'
[[ "${#STAGING_MONGO_REPLICA_KEY}" -le 1024 ]] \
  || fail 'STAGING_MONGO_REPLICA_KEY supera el limite de MongoDB'
[[ "$STAGING_MONGO_REPLICA_KEY" =~ ^[A-Za-z0-9+/=]+$ ]] \
  || fail 'STAGING_MONGO_REPLICA_KEY contiene caracteres no permitidos'
[[ "$MONGO_INITDB_ROOT_USERNAME" == 'cukies_staging_root' ]] \
  || fail 'MONGO_INITDB_ROOT_USERNAME inesperado'
[[ "${#MONGO_INITDB_ROOT_PASSWORD}" -ge 48 ]] \
  || fail 'MONGO_INITDB_ROOT_PASSWORD es demasiado corta'

install -m 0600 /dev/null "$keyfile"
printf '%s' "$STAGING_MONGO_REPLICA_KEY" > "$keyfile"
chown mongodb:mongodb "$keyfile"
chmod 0400 "$keyfile"

/usr/local/bin/docker-entrypoint.sh mongod \
  --bind_ip_all \
  --replSet "$replica_set" \
  --keyFile "$keyfile" \
  --wiredTigerCacheSizeGB 0.5 &
mongod_pid=$!

terminate() {
  if kill -0 "$mongod_pid" 2>/dev/null; then
    kill -TERM "$mongod_pid"
  fi
  wait "$mongod_pid" || true
}
trap terminate TERM INT

mongo_admin=(
  mongo
  --quiet
  --host 127.0.0.1
  --port 27017
  --username "$MONGO_INITDB_ROOT_USERNAME"
  --password "$MONGO_INITDB_ROOT_PASSWORD"
  --authenticationDatabase admin
)

for _ in $(seq 1 90); do
  if "${mongo_admin[@]}" admin --eval 'db.adminCommand({ ping: 1 }).ok' >/dev/null 2>&1; then
    break
  fi
  kill -0 "$mongod_pid" 2>/dev/null || fail 'mongod termino durante el arranque'
  sleep 2
done
"${mongo_admin[@]}" admin --eval 'db.adminCommand({ ping: 1 }).ok' >/dev/null \
  || fail 'mongod no responde con autenticacion root'

replica_status="$("${mongo_admin[@]}" admin --eval '
  try {
    const status = rs.status();
    if (status.ok === 1) print("ready");
    else if (status.code === 94 || status.codeName === "NotYetInitialized") print("not-initialized");
    else print("not-ready");
  } catch (error) {
    if (error.code === 94 || error.codeName === "NotYetInitialized") print("not-initialized");
    else throw error;
  }
' | tail -n 1)"

if [[ "$replica_status" == 'not-initialized' ]]; then
  "${mongo_admin[@]}" admin --eval "
    const result = rs.initiate({
      _id: '$replica_set',
      members: [{ _id: 0, host: '$replica_host' }],
    });
    if (result.ok !== 1) throw new Error('rs.initiate fallo');
  " >/dev/null
elif [[ "$replica_status" != 'ready' ]]; then
  fail 'estado inesperado del replica set'
fi

for _ in $(seq 1 90); do
  if "${mongo_admin[@]}" admin --eval 'quit(db.isMaster().ismaster === true ? 0 : 1)' \
    >/dev/null 2>&1; then
    break
  fi
  kill -0 "$mongod_pid" 2>/dev/null || fail 'mongod termino antes de ser primary'
  sleep 2
done
"${mongo_admin[@]}" admin --eval 'quit(db.isMaster().ismaster === true ? 0 : 1)' \
  >/dev/null || fail 'el replica set no alcanzo PRIMARY'

marker_count="$("${mongo_admin[@]}" "$bootstrap_database" --eval \
  "print(db.bootstrap_state.countDocuments({ _id: '$bootstrap_id' }))" | tail -n 1)"

validate_source_url() {
  local name="$1"
  local expected_user="$2"
  local expected_database="$3"
  local value="${!name:-}"

  require_value "$name"
  [[ "$value" =~ ^mongodb://${expected_user}:[^@]+@192\.168\.1\.221:27017/${expected_database}(\?.*)?$ ]] \
    || fail "${name} no apunta al usuario, host y DB de staging esperados"
}

if [[ "$marker_count" == '0' ]]; then
  validate_source_url STAGING_MONGO_SOURCE_HUB_URL 'cukies_hub_staging_app' 'cukies-hub-staging'
  validate_source_url STAGING_MONGO_SOURCE_LEGACY_URL 'cukies_legacy_staging_app' 'cukies-legacy-staging'
  validate_source_url STAGING_MONGO_SOURCE_ECONOMY_URL 'cukies_economy_staging_app' 'cukieshub-new-staging'
  validate_source_url STAGING_MONGO_SOURCE_CARD_URL 'cukies_card_staging_worker' 'cukieshub-new-staging'

  root_uri="mongodb://${MONGO_INITDB_ROOT_USERNAME}:${MONGO_INITDB_ROOT_PASSWORD}@127.0.0.1:27017/?authSource=admin&replicaSet=${replica_set}&directConnection=true"

  migrate_database() {
    local source_url="$1"
    local database="$2"
    printf 'Migrando DB logica de staging: %s\n' "$database"
    mongodump --quiet --uri "$source_url" --archive \
      | mongorestore --quiet --uri "$root_uri" --archive --drop --nsInclude "${database}.*"
  }

  migrate_database "$STAGING_MONGO_SOURCE_HUB_URL" 'cukies-hub-staging'
  migrate_database "$STAGING_MONGO_SOURCE_LEGACY_URL" 'cukies-legacy-staging'
  migrate_database "$STAGING_MONGO_SOURCE_ECONOMY_URL" 'cukieshub-new-staging'

  "${mongo_admin[@]}" admin --eval '
    function parseScopedUrl(environmentName, expectedUser, expectedDatabase) {
      const value = _getEnv(environmentName);
      const match = /^mongodb:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]+)(?:\?.*)?$/.exec(value);
      if (!match) throw new Error(environmentName + " tiene formato invalido");
      const user = decodeURIComponent(match[1]);
      const password = decodeURIComponent(match[2]);
      const databaseName = decodeURIComponent(match[4]);
      if (user !== expectedUser || databaseName !== expectedDatabase) {
        throw new Error(environmentName + " no coincide con la identidad staging esperada");
      }
      return { user: user, password: password, databaseName: databaseName };
    }

    const specs = [
      parseScopedUrl("STAGING_MONGO_SOURCE_HUB_URL", "cukies_hub_staging_app", "cukies-hub-staging"),
      parseScopedUrl("STAGING_MONGO_SOURCE_LEGACY_URL", "cukies_legacy_staging_app", "cukies-legacy-staging"),
      parseScopedUrl("STAGING_MONGO_SOURCE_ECONOMY_URL", "cukies_economy_staging_app", "cukieshub-new-staging"),
      parseScopedUrl("STAGING_MONGO_SOURCE_CARD_URL", "cukies_card_staging_worker", "cukieshub-new-staging"),
    ];

    specs.forEach(function (spec) {
      const target = db.getSiblingDB(spec.databaseName);
      const roles = [
        { role: "readWrite", db: spec.databaseName },
        { role: "dbAdmin", db: spec.databaseName },
      ];
      const existing = target.runCommand({ usersInfo: spec.user }).users;
      if (existing.length === 0) target.createUser({ user: spec.user, pwd: spec.password, roles: roles });
      else target.updateUser(spec.user, { pwd: spec.password, roles: roles });
    });
  ' >/dev/null

  "${mongo_admin[@]}" "$bootstrap_database" --eval "
    db.bootstrap_state.updateOne(
      { _id: '$bootstrap_id' },
      {
        \$setOnInsert: {
          _id: '$bootstrap_id',
          completedAt: new Date(),
          sourceHost: '$source_host',
          replicaSet: '$replica_set',
          databases: ['cukies-hub-staging', 'cukies-legacy-staging', 'cukieshub-new-staging'],
        },
      },
      { upsert: true },
    );
  " >/dev/null
elif [[ "$marker_count" != '1' ]]; then
  fail 'estado inesperado del marcador de bootstrap'
fi

printf 'STAGING_MONGO_READY replicaSet=%s resource=%s\n' "$replica_set" "$expected_resource_uuid"
wait "$mongod_pid"
