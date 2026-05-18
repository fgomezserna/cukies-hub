# Cuki Card Worker

Worker para generar las cards PNG de NFTs Cukies desde `cukieshub-new`.

El worker sustituye al legacy `apps/backend/cards` y al script `apps/backend/sync/cards.js`.
No usa Redis/Bull: reclama documentos en Mongo con locks temporales, genera la card, sube a S3 si esta configurado y actualiza `cukies.img`.
Por seguridad, `process-once` y `run` solo funcionan con `CARD_WORKER_UPLOAD=true`; asi no se marcan NFTs como generados sin una URL publica real.

## Scripts

```bash
pnpm cards:setup
pnpm cards:status
pnpm cards:render -- <tokenId>
pnpm cards:generate -- <tokenId>
pnpm cards:process
pnpm cards:dev
```

## Entorno

- `CARD_WORKER_MONGO_URL`: URI Mongo. Fallback: `CHAIN_INDEXER_MONGO_URL` o `DATABASE_URL`.
- `CARD_WORKER_DB_NAME`: base de datos. Fallback: `CHAIN_INDEXER_DB_NAME` o `cukieshub-new`.
- `CARD_WORKER_ASSETS_DIR`: assets de backgrounds/fuentes. Default: `packages/cuki-card-worker/assets`.
- `CARD_WORKER_OUTPUT_DIR`: salida local para renders. Default: `.tmp/cards` dentro del paquete.
- `CARD_WORKER_POLL_INTERVAL_MS`: intervalo del loop. Default: `5000`.
- `CARD_WORKER_MAX_ATTEMPTS`: reintentos por token. Default: `5`.
- `CARD_WORKER_STALE_LOCK_MS`: tiempo para recuperar locks antiguos. Default: `900000`.
- `CARD_WORKER_UPLOAD`: `true` para subir a S3; default `false`.
- `CARD_WORKER_PUBLIC_BASE_URL`: base publica para componer `img` despues de upload.
- `CARD_WORKER_S3_BUCKET`: bucket S3.
- `CARD_WORKER_S3_REGION`: region S3.
- `CARD_WORKER_S3_PREFIX`: prefijo S3. Default: `png/tokens/v2/TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe`.
- `CARD_WORKER_S3_ENDPOINT`: opcional para S3-compatible.
- `CARD_WORKER_S3_FORCE_PATH_STYLE`: `true` para endpoints compatibles.
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`: credenciales S3.

## Seleccion de pendientes

`process-once` busca Cukies con metadata suficiente (`type`, `skills.generation`) y alguna de estas condiciones:

- `needsImage: true`
- `cardImageStatus: "pending"`
- `cardImageStatus: "failed"` con intentos disponibles
- `cardImageStatus: "processing"` con lock caducado
- `img` vacio, nulo o ausente

`render-token` genera una card local y registra un job `rendered_local`, pero no toca `cukies.img` ni estados finales. `generate-token` genera un token concreto y, si `CARD_WORKER_UPLOAD=true`, sube y actualiza Mongo.
