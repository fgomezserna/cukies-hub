#!/bin/sh

set -u

SCRIPT=${SCRIPT:-"$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/docker-prune-safe.sh"}
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/cukies-prune-test.XXXXXX") || exit 1
trap 'rm -rf "$ROOT"' 0 1 2 3 15

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
assert_file() { [ -f "$1" ] || fail "falta $1"; }
assert_empty() { [ ! -s "$1" ] || fail "se esperaba vacio: $1"; }
assert_text() { grep -F -- "$2" "$1" >/dev/null 2>&1 || fail "falta [$2] en $1"; }

make_mocks() {
    CASE_DIR=$ROOT/$1
    MOCK_DF_PERCENT=94
    MOCK_SQL_OUTPUT=0
    MOCK_SQL_STATUS=0
    mkdir -p "$CASE_DIR/bin"
    : >"$CASE_DIR/docker.log"
    : >"$CASE_DIR/flock.log"
    cat >"$CASE_DIR/bin/df" <<'EOF_DF'
#!/bin/sh
printf '%s\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf 'mockfs 100 94 6 %s /srv\n' "${MOCK_DF_PERCENT:-94}%"
EOF_DF
    cat >"$CASE_DIR/bin/flock" <<'EOF_FLOCK'
#!/bin/sh
printf '%s\n' "$*" >>"$FLOCK_LOG"
exit 0
EOF_FLOCK
    cat >"$CASE_DIR/bin/docker" <<'EOF_DOCKER'
#!/bin/sh
printf '%s\n' "$*" >>"$DOCKER_LOG"
if [ "$1" = exec ]; then
    printf '%s\n' "${MOCK_SQL_OUTPUT:-0}"
    exit "${MOCK_SQL_STATUS:-0}"
fi
case "$*" in
    'image prune -f --filter dangling=true --filter until=168h'|'container prune -f --filter until=168h') exit 0 ;;
esac
exit 99
EOF_DOCKER
    chmod +x "$CASE_DIR/bin/df" "$CASE_DIR/bin/flock" "$CASE_DIR/bin/docker"
}

run_case() {
    CASE_DIR=$1
    shift
    PATH="$CASE_DIR/bin:$PATH" \
    DOCKER_LOG="$CASE_DIR/docker.log" \
    FLOCK_LOG="$CASE_DIR/flock.log" \
    LOG_FILE="$CASE_DIR/run.log" \
    LOCK_FILE="$CASE_DIR/run.lock" \
    MOCK_DF_PERCENT=${MOCK_DF_PERCENT:-94} \
    MOCK_SQL_OUTPUT=${MOCK_SQL_OUTPUT:-0} \
    MOCK_SQL_STATUS=${MOCK_SQL_STATUS:-0} \
    MOUNT=/srv THRESHOLD=85 \
    "$@"
}

assert_file "$SCRIPT"

make_mocks active
MOCK_DF_PERCENT=94 MOCK_SQL_OUTPUT=1 run_case "$CASE_DIR" "$SCRIPT"
assert_text "$CASE_DIR/docker.log" '-A -t -c SELECT count(*) FROM application_deployment_queues'
[ "$(wc -l <"$CASE_DIR/docker.log" | tr -d ' ')" -eq 1 ] || fail 'despliegue activo limpio'

make_mocks sql_error
MOCK_DF_PERCENT=94 MOCK_SQL_OUTPUT=error MOCK_SQL_STATUS=1 run_case "$CASE_DIR" "$SCRIPT"
[ "$(wc -l <"$CASE_DIR/docker.log" | tr -d ' ')" -eq 1 ] || fail 'error SQL limpio'
assert_text "$CASE_DIR/run.log" 'estado de despliegues no verificable'

make_mocks non_numeric
MOCK_DF_PERCENT=94 MOCK_SQL_OUTPUT=abc run_case "$CASE_DIR" "$SCRIPT"
[ "$(wc -l <"$CASE_DIR/docker.log" | tr -d ' ')" -eq 1 ] || fail 'conteo no numerico limpio'
assert_text "$CASE_DIR/run.log" 'conteo de despliegues no numerico'

make_mocks below_threshold
MOCK_DF_PERCENT=84 run_case "$CASE_DIR" "$SCRIPT"
assert_empty "$CASE_DIR/docker.log"

make_mocks eligible
MOCK_DF_PERCENT=94 MOCK_SQL_OUTPUT=0 run_case "$CASE_DIR" "$SCRIPT"
[ "$(wc -l <"$CASE_DIR/docker.log" | tr -d ' ')" -eq 4 ] || fail 'numero de operaciones elegibles'
assert_text "$CASE_DIR/docker.log" 'image prune -f --filter dangling=true --filter until=168h'
assert_text "$CASE_DIR/docker.log" 'container prune -f --filter until=168h'
! grep -E 'builder prune|image prune -a|volume prune|system prune' "$CASE_DIR/docker.log" >/dev/null 2>&1 || fail 'operacion prohibida'
assert_text "$CASE_DIR/docker.log" 'until=168h'
[ "$(grep -F -c -- '-A -t -c SELECT count(*) FROM application_deployment_queues' "$CASE_DIR/docker.log")" -eq 2 ] || fail 'reconsulta final ausente'

printf '%s\n' 'OK: guards, umbral, reconsulta y filtros verificados'
