#!/bin/sh
set -eu

case "${APP_ENV:-}" in
  staging)
    if [ "${STAGING_ONLY_GUARD:-}" != "true" ]; then
      echo "STAGING-ONLY guard is mandatory for the staging deployment"
      exit 1
    fi
    node scripts/assert-staging-only.mjs --scope "${CUKIES_SERVICE:-dapp}"
    ;;
  production)
    if [ "${STAGING_ONLY_GUARD:-}" != "false" ]; then
      echo "STAGING-ONLY guard must be disabled for the production deployment"
      exit 1
    fi
    node scripts/assert-production.mjs --scope "${CUKIES_SERVICE:-dapp}"
    ;;
  *)
    echo "APP_ENV must be staging or production"
    exit 1
    ;;
esac

case "${CUKIES_SERVICE:-dapp}" in
  dapp)
    exec pnpm --filter dapp exec next start --hostname 0.0.0.0 -p "${PORT:-3000}"
    ;;
  chain-indexer)
    pnpm --filter @cukies/chain-indexer run setup:prod
    pnpm --filter @cukies/chain-indexer run setup:economy:prod
    exec pnpm --filter @cukies/chain-indexer run start
    ;;
  cuki-card-worker)
    pnpm --filter @cukies/cuki-card-worker run setup:prod
    exec pnpm --filter @cukies/cuki-card-worker run start
    ;;
  cukies-bridge-relayer)
    pnpm --filter @cukies/cukies-bridge-relayer run setup:prod
    exec pnpm --filter @cukies/cukies-bridge-relayer run start
    ;;
  *)
    echo "CUKIES_SERVICE no soportado: ${CUKIES_SERVICE:-}"
    exit 1
    ;;
esac
