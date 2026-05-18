#!/bin/sh
set -eu

case "${CUKIES_SERVICE:-dapp}" in
  dapp)
    exec pnpm --filter dapp exec next start --hostname 0.0.0.0 -p "${PORT:-3000}"
    ;;
  chain-indexer)
    pnpm --filter @cukies/chain-indexer run setup:prod
    exec pnpm --filter @cukies/chain-indexer run start
    ;;
  cuki-card-worker)
    pnpm --filter @cukies/cuki-card-worker run setup:prod
    exec pnpm --filter @cukies/cuki-card-worker run start
    ;;
  *)
    echo "CUKIES_SERVICE no soportado: ${CUKIES_SERVICE:-}"
    exit 1
    ;;
esac
