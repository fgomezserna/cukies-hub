# Cukies Chain Indexer

Indexer nuevo para reconstruir vistas Mongo desde eventos on-chain BSC/TRON sin depender del pipeline legacy.

## Scripts

```bash
pnpm --filter @cukies/chain-indexer run setup
pnpm --filter @cukies/chain-indexer run ingest:once
pnpm --filter @cukies/chain-indexer run import:legacy
pnpm --filter @cukies/chain-indexer run project:once
pnpm --filter @cukies/chain-indexer run dev
pnpm --filter @cukies/chain-indexer run status
```

## Base de datos

Por defecto escribe en `cukieshub-new` usando `CHAIN_INDEXER_MONGO_URL` o, si no existe, `DATABASE_URL`.

Variables principales:

- `CHAIN_INDEXER_DB_NAME`: nombre de la BD nueva. Default: `cukieshub-new`.
- `CHAIN_INDEXER_MONGO_URL`: URI Mongo para el indexer.
- `CHAIN_INDEXER_CHAINS`: `BSC,TRON`, `BSC` o `TRON`.
- `CHAIN_INDEXER_BSC_RPC_URL`: RPC BSC. Fallback: `BSC_RPC_URL`.
- `TRON_API_KEY` o `TRONGRID_API_KEY`: API key opcional de TronGrid.
- `CHAIN_INDEXER_START_BSC_BLOCK`: bloque inicial BSC. Default: `0`, que significa empezar live desde el ultimo bloque seguro. Para backfill historico usa un archive RPC y fija el bloque inicial legacy (`16906879`).
- `CHAIN_INDEXER_START_TRON_TIMESTAMP_MS`: timestamp inicial TRON. Default: `0`.
- `CHAIN_INDEXER_BSC_CONFIRMATIONS`: confirmaciones antes de ingerir. Default: `12`.
- `CHAIN_INDEXER_MAX_BLOCK_RANGE`: bloques BSC por pasada/evento. Default: `5000`.
- `CHAIN_INDEXER_TRON_PAGE_LIMIT`: eventos TRON por pagina. Default: `200`.
- `CHAIN_INDEXER_TRON_REQUEST_DELAY_MS`: pausa entre requests TronGrid. Default: `500`.
- `CHAIN_INDEXER_PROJECT_BATCH_SIZE`: eventos a proyectar por ciclo. Default: `100`.
- `CHAIN_INDEXER_IMPORT_LEGACY_LIMIT`: eventos de `processedEvents` legacy a importar por pasada. Default: `10000`.
- `CHAIN_INDEXER_IMPORT_LEGACY_NETWORK`: filtro opcional para importar solo `BSC`, `TRON` o `BSC,TRON`.

Colecciones principales:

- `chain_events`: event store inmutable/idempotente.
- `chain_cursors`: checkpoints por contrato/evento.
- `chain_indexer_runs`: historial operativo.
- `chain_dead_letters`: errores permanentes de proyeccion.
- `cukies`, `tx_nfts`, `point_transactions`, `point_balances`, `marketplace_listings`, `bridge_transfers`: vistas de lectura nuevas.

## Import legacy

`pnpm indexer:import:legacy` importa eventos desde `CUKIES_DATABASE_URL` (`processedEvents`) al nuevo `chain_events`, manteniendo idempotencia por `_id` normalizado. Sirve para sembrar `cukieshub-new` con historico legacy mientras la ingesta on-chain sigue viva/reconciliando.
