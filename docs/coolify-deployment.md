# Coolify deployment

El despliegue de produccion debe usar `docker-compose.coolify.yml` como compose del proyecto.

## Servicios

- `dapp`: Next.js publico. Es el unico servicio con dominio, proxy y puerto HTTP.
- `chain-indexer`: worker interno. Lee blockchain, procesa historicos/live y proyecta en Mongo.
- `cuki-card-worker`: worker interno. Genera cards PNG, las sube a S3 y actualiza `cukies.img`.

Los workers no necesitan dominio ni Traefik. Deben quedar con `restart: unless-stopped`.

## Auto deploy

En Coolify:

1. Crear o editar el recurso como Docker Compose.
2. Repo: `fgomezserna/cukies-hub`.
3. Branch: `main`.
4. Compose file: `docker-compose.coolify.yml`.
5. Activar webhook/auto deploy para que cada push o merge a `main` reconstruya los tres servicios.
6. Configurar dominio solo en `dapp`.

## Variables obligatorias

Compartidas:

```bash
DATABASE_URL=...
CHAIN_INDEXER_MONGO_URL=...
CHAIN_INDEXER_DB_NAME=cukieshub-new
```

Indexer:

```bash
CHAIN_INDEXER_BSC_RPC_URL=...
CHAIN_INDEXER_TRON_RPC_URL=...
```

Card worker:

```bash
CARD_WORKER_MONGO_URL=...
CARD_WORKER_DB_NAME=cukieshub-new
CARD_WORKER_UPLOAD=true
CARD_WORKER_PUBLIC_BASE_URL=...
CARD_WORKER_S3_BUCKET=...
CARD_WORKER_S3_REGION=...
CARD_WORKER_S3_PREFIX=png/tokens/v2/TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

No activar `CARD_WORKER_UPLOAD=true` sin bucket, region, credenciales y base publica configurados. El worker esta protegido y no procesa en modo continuo sin upload real.

## Validacion post deploy

- Abrir la web publica y revisar `/api/health`.
- Abrir `/indexer?collection=chain_indexer_runs`.
- Abrir `/indexer?collection=card_generation_jobs`.
- Revisar logs de `chain-indexer` y confirmar que ejecuta `setup` y luego `run`.
- Revisar logs de `cuki-card-worker` y confirmar que ejecuta `setup` y luego `run`.
