#!/bin/sh

set -u

MOUNT=${1:-${MOUNT:-/srv}}
THRESHOLD=${PRUNE_THRESHOLD:-${THRESHOLD:-85}}
LOG_FILE=${LOG_FILE:-/var/log/codex-docker-prune.log}
LOCK_FILE=${LOCK_FILE:-/var/lock/codex-docker-prune-if-srv-high.lock}
DF_BIN=${DF_BIN:-df}
DOCKER_BIN=${DOCKER_BIN:-docker}
FLOCK_BIN=${FLOCK_BIN:-flock}

log() {
    printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >>"$LOG_FILE" 2>/dev/null || :
}

case "$THRESHOLD" in
    ''|*[!0-9]*) log "abortado: THRESHOLD no numerico"; exit 0 ;;
esac

exec 9>"$LOCK_FILE" 2>/dev/null || {
    log "abortado: no se pudo abrir el lock"
    exit 0
}
"$FLOCK_BIN" -n 9 2>/dev/null || {
    log "omitido: otra ejecucion mantiene el lock"
    exit 0
}

df_output=$("$DF_BIN" -P "$MOUNT" 2>&1)
df_status=$?
if [ "$df_status" -ne 0 ]; then
    log "abortado: df no verificable"
    exit 0
fi

usage_percent=$(printf '%s\n' "$df_output" | awk '
    NR > 1 && $5 ~ /^[0-9]+%$/ { gsub(/%/, "", $5); print $5; exit }
')
case "$usage_percent" in
    ''|*[!0-9]*) log "abortado: uso de $MOUNT no numerico"; exit 0 ;;
esac

if [ "$usage_percent" -lt "$THRESHOLD" ]; then
    log "omitido: $MOUNT al ${usage_percent}% (umbral ${THRESHOLD}%)"
    exit 0
fi

QUEUE_SQL="SELECT count(*) FROM application_deployment_queues WHERE status IN ('in_progress','queued')"
queue_is_empty() {
    queue_count=$(
        "$DOCKER_BIN" exec coolify-db psql -U coolify -d coolify -X -A -t -c "$QUEUE_SQL" 2>&1
    )
    queue_status=$?
    if [ "$queue_status" -ne 0 ]; then
        log "abortado: estado de despliegues no verificable"
        return 1
    fi
    case "$queue_count" in
        ''|*[!0-9]*) log "abortado: conteo de despliegues no numerico"; return 1 ;;
    esac
    if [ "$queue_count" -ne 0 ]; then
        log "omitido: $queue_count despliegue(s) in_progress/queued"
        return 1
    fi
    return 0
}

queue_is_empty || exit 0
queue_is_empty || exit 0

"$DOCKER_BIN" image prune -f --filter dangling=true --filter until=168h >>"$LOG_FILE" 2>&1 || {
    log "aviso: image prune fallo"
    exit 0
}
"$DOCKER_BIN" container prune -f --filter until=168h >>"$LOG_FILE" 2>&1 || {
    log "aviso: container prune fallo"
    exit 0
}
log "limpieza completada: dangling images y stopped containers con mas de 168h"
