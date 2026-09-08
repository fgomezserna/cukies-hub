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
pnpm cards:backfill
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
- `CARD_WORKER_PUBLIC_KEY_PREFIX`: prefijo S3 privado que el gateway añade internamente; si se configura, se omite de la URL pública.
- `CARD_WORKER_S3_BUCKET`: bucket S3.
- `CARD_WORKER_S3_REGION`: region S3.
- `CARD_WORKER_S3_PREFIX`: prefijo S3. Default: `png/tokens/v2/TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe`.
- `CARD_WORKER_S3_ENDPOINT`: opcional para S3-compatible.
- `CARD_WORKER_S3_FORCE_PATH_STYLE`: `true` para endpoints compatibles.
- `CARD_WORKER_S3_ACL`: ACL opcional del objeto; en staging se usa `private` y el bucket concede solo lectura publica.
- `CARD_WORKER_VERIFY_PUBLIC`: comprueba mediante `GET` público el PNG completo, MIME, longitud, hash y caché después de cada upload; default `true`.
- `CARD_WORKER_BACKFILL_CONCURRENCY`: concurrencia acotada del backfill; default `2`.
- `CARD_WORKER_BACKFILL_MANIFEST_PATH`: ruta obligatoria para `backfill`; guarda el run durable, checkpoints, inventario inicial y delta de reconciliación.
- `CARD_WORKER_SOURCE_FORMAT`: `indexed` por defecto. `legacy` sólo habilita el adaptador explícito de `cukies-legacy-staging`.
- `CARD_WORKER_LEGACY_STAGING_ENABLED`: debe ser `true` junto con `CARD_WORKER_SOURCE_FORMAT=legacy`; el guard rechaza cualquier DB distinta de `cukies-legacy-staging`.
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`: credenciales S3.

Cada PNG se publica bajo una clave inmutable `<prefix>/<tokenId-base64url>/<sha256>.png` y con `Cache-Control: public, max-age=31536000, immutable`. Una regeneracion con contenido distinto cambia la URL antes de actualizar Mongo, por lo que CDN y clientes no pueden mezclar la card nueva con una version cacheada anterior.

## Seleccion de pendientes

`process-once` busca Cukies con metadata suficiente (`type`/`rarity` y `skills.generation`/`generation`) y alguna de estas condiciones:

- `needsImage: true`
- `cardImageStatus: "pending"`
- `cardImageStatus: "failed"` con intentos disponibles
- `cardImageStatus: "processing"` con lock caducado
- `img` vacio, nulo o ausente

`render-token` genera una card local y registra un job `rendered_local`, pero no toca `cukies.img` ni estados finales. `generate-token` genera un token concreto y, si `CARD_WORKER_UPLOAD=true`, sube y actualiza Mongo.

`backfill` captura un manifiesto ordenado por `_id` y un cutoff al inicio, conserva una identidad explícita (`documentId`, `tokenId` visible y `assetIdentity` canónica), clasifica también metadata ausente o fuera de rango, y escribe checkpoints atómicos. Es reanudable: sólo un lease con propietario, versión y revisión de origen puede finalizar un documento; una URL del destino que responda correctamente se cuenta como `alreadyValid`. Los candidatos bloqueados, agotados o fallidos dejan el run incompleto y se reintentan en la siguiente ejecución. Los documentos creados o modificados después del cutoff entran en `deltaItems` sin sobrescribir el inventario inicial.

Los documentos del indexador nuevo pueden exponer `rarity` y `generation` a partir del evento canónico `CukieMetadataConfigured`; el renderer los adapta a la forma legacy sin inventar ni persistir atributos derivados.

## Fuente legacy staging

El perfil Compose `legacy-card-worker` está apagado por defecto. Se ejecuta sólo con `CARD_WORKER_SOURCE_FORMAT=legacy`, `CARD_WORKER_LEGACY_STAGING_ENABLED=true`, `CARD_WORKER_LEGACY_MONGO_URL` apuntando a la fuente staging y `CARD_WORKER_LEGACY_DB_NAME=cukies-legacy-staging`. El guard rechaza producción y no permite usar `cukieshub-new-staging` en este modo.

El adaptador valida cada documento antes de leerlo para render, reclamarlo o incluirlo en el censo: `_id` debe ser el entero decimal real usado como `tokenId`, `network` debe resolver a BSC 56/TOKEN o TRON mainnet/TOKEN, y cualquier `tokenId`, `chainId` o colección declarados en conflicto invalida el candidato. El `_id` original se conserva para leases, fencing y actualización; no se importan ni normalizan masivamente documentos al arrancar.

La proyección futura debe reutilizar `packages/chain-indexer/src/legacy/importer.ts` para copiar `img` ya actualizado por identidad inequívoca. Esa propagación sólo toca campos de imagen; no crea ni reescribe estado económico. Las 18 fixtures BSC97 permanecen en `cukieshub-new-staging` y usan su worker indexado separado.
