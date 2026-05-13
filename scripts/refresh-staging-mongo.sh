#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Refresh Mongo staging databases from production snapshots.

Required env vars:
  PROD_DATABASE_URL            Mongo URI for production hub DB.
  PROD_CUKIES_DATABASE_URL     Mongo URI for production legacy Cukies DB.
  STAGING_DATABASE_URL         Mongo URI for staging hub DB.
  STAGING_CUKIES_DATABASE_URL  Mongo URI for staging legacy Cukies DB.

Safety env vars:
  DRY_RUN=1                    Print the plan without dumping/restoring.
  CONFIRM_REFRESH_STAGING=1    Required for real execution.
  BACKUP_DIR=./.mongo-refresh  Directory for archives.
  ALLOW_NON_STAGING_TARGET=1   Override target DB name guard.
  SKIP_HUB=1                   Skip hub refresh.
  SKIP_LEGACY=1                Skip legacy Cukies refresh.

The script never prints Mongo credentials.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
}

uri_db() {
  URI_VALUE="$1" python3 - <<'PY'
import os
from urllib.parse import urlsplit

uri = os.environ["URI_VALUE"]
path = urlsplit(uri).path.lstrip("/")
print(path)
PY
}

safe_uri_summary() {
  URI_VALUE="$1" python3 - <<'PY'
import os
from urllib.parse import parse_qs, urlsplit

uri = os.environ["URI_VALUE"]
p = urlsplit(uri)
host = p.hostname or ""
port = p.port or ""
db = p.path.lstrip("/")
query_keys = ",".join(sorted(parse_qs(p.query).keys()))
print(f"{p.scheme}://{host}:{port}/{db} query=[{query_keys}]")
PY
}

ensure_staging_target() {
  local label="$1"
  local source_db="$2"
  local target_db="$3"

  if [[ "$source_db" == "$target_db" ]]; then
    echo "Refusing $label refresh: source and target DB are both '$source_db'." >&2
    exit 1
  fi

  if [[ "${ALLOW_NON_STAGING_TARGET:-0}" != "1" && "$target_db" != *staging* ]]; then
    echo "Refusing $label refresh: target DB '$target_db' does not look like staging." >&2
    exit 1
  fi
}

db_exists() {
  local uri="$1"
  local database="$2"
  TARGET_DB="$database" mongosh "$uri" --quiet --eval '
const names = db.adminCommand({ listDatabases: 1, nameOnly: true }).databases.map(function(d) { return d.name; });
print(names.includes(process.env.TARGET_DB) ? "yes" : "no");
' | tail -n 1
}

dump_db() {
  local uri="$1"
  local database="$2"
  local archive="$3"
  mongodump --uri="$uri" --db="$database" --archive="$archive" --gzip >/dev/null
}

restore_db() {
  local uri="$1"
  local source_db="$2"
  local target_db="$3"
  local archive="$4"
  mongorestore \
    --uri="$uri" \
    --archive="$archive" \
    --gzip \
    --drop \
    --nsFrom="${source_db}.*" \
    --nsTo="${target_db}.*" >/dev/null
}

sanitize_hub() {
  local uri="$1"
  local source_db="$2"
  local target_db="$3"

  SOURCE_DB="$source_db" TARGET_DB="$target_db" mongosh "$uri" --quiet --eval '
const d = db.getSiblingDB(process.env.TARGET_DB);
d.Session.drop();
d.VerificationToken.drop();
d.EmailVerification.drop();
d.Account.updateMany({}, {
  $unset: {
    refresh_token: "",
    access_token: "",
    id_token: "",
    session_state: "",
    oauth_token: "",
    oauth_token_secret: ""
  }
});
d.User.updateMany({}, { $set: { email: null } });
d.TwitterFollower.updateMany({}, { $unset: { webhookData: "" } });
d.__staging_refresh.deleteMany({});
d.__staging_refresh.insertOne({
  sourceDb: process.env.SOURCE_DB,
  targetDb: process.env.TARGET_DB,
  refreshedAt: new Date(),
  sanitizer: "hub-v1",
  notes: [
    "Dropped Session, VerificationToken and EmailVerification.",
    "Unset OAuth token fields from Account.",
    "Cleared User.email and TwitterFollower.webhookData."
  ]
});
print("hub sanitized");
' >/dev/null
}

sanitize_legacy() {
  local uri="$1"
  local source_db="$2"
  local target_db="$3"

  SOURCE_DB="$source_db" TARGET_DB="$target_db" mongosh "$uri" --quiet --eval '
const d = db.getSiblingDB(process.env.TARGET_DB);
d.blacklistedtokens.drop();
d.users.updateMany({}, {
  $set: { email: null },
  $unset: {
    password: "",
    token: "",
    refreshToken: "",
    resetPasswordToken: "",
    verificationToken: ""
  }
});
d.__staging_refresh.deleteMany({});
d.__staging_refresh.insertOne({
  sourceDb: process.env.SOURCE_DB,
  targetDb: process.env.TARGET_DB,
  refreshedAt: new Date(),
  sanitizer: "legacy-v1",
  notes: [
    "Dropped blacklistedtokens.",
    "Cleared user email and auth token/password-like fields.",
    "Kept wallets, NFT inventory, marketplace and points data for faithful QA."
  ]
});
print("legacy sanitized");
' >/dev/null
}

print_counts() {
  local uri="$1"
  local database="$2"

  TARGET_DB="$database" mongosh "$uri" --quiet --eval '
const d = db.getSiblingDB(process.env.TARGET_DB);
const rows = d.getCollectionNames().sort().map(function(name) {
  let count = null;
  try { count = d.runCommand({ collStats: name }).count; } catch (e) {}
  return { collection: name, count: count };
});
print(JSON.stringify(rows, null, 2));
'
}

refresh_pair() {
  local label="$1"
  local source_uri="$2"
  local target_uri="$3"
  local sanitizer="$4"
  local timestamp="$5"

  local source_db target_db source_archive target_backup exists
  source_db="$(uri_db "$source_uri")"
  target_db="$(uri_db "$target_uri")"
  ensure_staging_target "$label" "$source_db" "$target_db"

  source_archive="${BACKUP_DIR}/${timestamp}-${label}-${source_db}.archive.gz"
  target_backup="${BACKUP_DIR}/${timestamp}-${label}-${target_db}-before-refresh.archive.gz"

  echo ""
  echo "[$label]"
  echo "  source: $(safe_uri_summary "$source_uri")"
  echo "  target: $(safe_uri_summary "$target_uri")"
  echo "  source archive: $source_archive"
  echo "  target backup:  $target_backup"

  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "  dry-run: would dump source, backup target, restore with --drop, sanitize target."
    return
  fi

  exists="$(db_exists "$target_uri" "$target_db")"
  if [[ "$exists" == "yes" ]]; then
    echo "  backing up current target..."
    dump_db "$target_uri" "$target_db" "$target_backup"
  else
    echo "  target DB does not exist yet; skipping target backup."
  fi

  echo "  dumping source..."
  dump_db "$source_uri" "$source_db" "$source_archive"

  echo "  restoring into target..."
  restore_db "$target_uri" "$source_db" "$target_db" "$source_archive"

  echo "  sanitizing target..."
  "$sanitizer" "$target_uri" "$source_db" "$target_db"

  echo "  target counts:"
  print_counts "$target_uri" "$target_db"
}

main() {
  require_command python3
  require_command mongosh
  require_command mongodump
  require_command mongorestore

  require_env PROD_DATABASE_URL
  require_env PROD_CUKIES_DATABASE_URL
  require_env STAGING_DATABASE_URL
  require_env STAGING_CUKIES_DATABASE_URL

  if [[ "${DRY_RUN:-0}" != "1" && "${CONFIRM_REFRESH_STAGING:-0}" != "1" ]]; then
    echo "Refusing real refresh without CONFIRM_REFRESH_STAGING=1." >&2
    exit 1
  fi

  BACKUP_DIR="${BACKUP_DIR:-.mongo-refresh}"
  mkdir -p "$BACKUP_DIR"

  local timestamp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

  if [[ "${SKIP_HUB:-0}" != "1" ]]; then
    refresh_pair "hub" "$PROD_DATABASE_URL" "$STAGING_DATABASE_URL" sanitize_hub "$timestamp"
  fi

  if [[ "${SKIP_LEGACY:-0}" != "1" ]]; then
    refresh_pair "legacy" "$PROD_CUKIES_DATABASE_URL" "$STAGING_CUKIES_DATABASE_URL" sanitize_legacy "$timestamp"
  fi
}

main "$@"
