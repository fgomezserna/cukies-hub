#!/bin/sh
set -eu

if [ "${WORLD_RUNTIME_ENABLED:-false}" != "true" ]; then
  echo "WORLD_RUNTIME_ENABLED must be true when the World runtime is selected" >&2
  exit 1
fi

case "${WORLD_SERVICE}" in
  api)
    exec node /app/packages/world-api/dist/main.js
    ;;
  matchmaking)
    exec node /app/packages/world-matchmaking/dist/main.js
    ;;
  *)
    echo "WORLD_SERVICE must be api or matchmaking" >&2
    exit 1
    ;;
esac
