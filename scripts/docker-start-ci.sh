#!/bin/sh
set -eu

service="${CUKIES_SERVICE:-dapp}"

case "${APP_ENV:-}" in
  staging)
    if [ "${STAGING_ONLY_GUARD:-}" != "true" ]; then
      echo "STAGING-ONLY guard is mandatory for the staging deployment"
      exit 1
    fi
    node scripts/assert-staging-only.mjs --scope "${service}"
    ;;
  production)
    if [ "${STAGING_ONLY_GUARD:-}" != "false" ]; then
      echo "STAGING-ONLY guard must be disabled for the production deployment"
      exit 1
    fi
    node scripts/assert-production.mjs --scope "${service}"
    ;;
  *)
    echo "APP_ENV must be staging or production"
    exit 1
    ;;
esac

case "${service}" in
  dapp)
    if [ -f /app/server.js ]; then
      exec node /app/server.js
    fi
    exec node /app/dapp/server.js
    ;;
  chain-indexer)
    pnpm --dir /app/packages/chain-indexer run setup:prod
    pnpm --dir /app/packages/chain-indexer run setup:economy:prod
    exec pnpm --dir /app/packages/chain-indexer run start
    ;;
  cuki-card-worker)
    pnpm --dir /app/packages/cuki-card-worker run setup:prod
    exec pnpm --dir /app/packages/cuki-card-worker run start
    ;;
  *)
    echo "CUKIES_SERVICE no soportado: ${service}"
    exit 1
    ;;
esac
