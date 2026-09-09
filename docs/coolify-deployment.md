# Coolify deployment

Esta página es una entrada corta. La guía operativa única de entornos, imágenes,
Mongo, límites del builder, secretos y validación está en
[docs/deployment-environments.md](deployment-environments.md). El handoff de
datos de staging está en
[infrastructure/ci/staging-data-handoff.md](../infrastructure/ci/staging-data-handoff.md).

## Alcance actual

| Recurso | Ruta activa | Compose | Alcance |
| --- | --- | --- | --- |
| Coolify app32 web + app28 workers | `staging` -> workflow `.github/workflows/cukies-images.yml` | Web Docker Image; `docker-compose.workers.yml` generado | Imágenes por digest, web gradual y workers independientes. Autodeploy Git desactivado; `CUKIES_DELIVERY_MODE=rolling`, `CUKIES_IMAGE_DEPLOY_ENABLED=true`. |
| Coolify app 12, `game-hub` | `main` -> build/deploy existente | `docker-compose.coolify.yml` | Producción live; conserva la ruta legacy de Coolify. |
| Coolify app 31, `game-treasurehunt-staging` | `staging` -> recurso independiente | No aplica; Nixpacks (`build_pack=nixpacks`, rama `staging`) | Treasure Hunt se mantiene separado del hub y sigue su build/deploy independiente. |

En staging se publica app32 y en producción todavía `dapp` de app12;
workers y schedulers son internos. App 31 es un recurso independiente y no se
incluye en el Compose del hub. App 28 usa Mongo externo en LXC 2007
(`192.168.1.221:27018`); el Compose de imágenes no crea ni administra Mongo.

## Flujo de staging app 28

El pipeline recorre `staging` en el runner `cukies-builder-1012` de VM1012
(`192.168.1.244`), reutiliza el builder/cache cuando corresponde, publica
referencias con digest en el registry de VM1007 (`192.168.1.207:5000`) y aplica
el digest de la web en app32 y `docker-compose.workers.yml` en app28 mediante la API de Coolify en VM1001
(`192.168.1.201`). La fuente de topología es
`docker-compose.coolify.yml`; la regeneración reproducible es:

```bash
node scripts/ci/generate-images-compose.mjs --write
node scripts/ci/generate-images-compose.mjs --check
```

Los detalles de Nx affected, BuildKit, límites, reutilización de digests,
storage, gates, rollback y postflight viven únicamente en la guía principal.

## Ruta legacy aplicable a main y juegos

La app 12 continúa usando el despliegue Compose/build de Coolify basado en
`docker-compose.coolify.yml`, con sus variables runtime y sus servicios legacy.
No debe tomar imágenes, Mongo, secretos ni flags de staging.

Treasure Hunt app 31 es un recurso Coolify independiente. Mantiene su build
propio y sus variables de build (`NEXT_PUBLIC_GAME_BASE_PATH` y
`NEXT_PUBLIC_DAPP_ORIGIN`) según el entorno. Su publicación bajo
`/treasurehunt-game` no convierte el juego en parte del Compose del hub ni de
la promoción de imágenes de app 28.

## Secretos y validación

Las credenciales CI del registry y Coolify viven en el GitHub Environment
`cukies-staging`. Los secretos runtime de Mongo, OAuth, HMAC, RPC y S3/MinIO
viven en Coolify o en el entorno local ignorado. Los nombres
de variables, hashes de configuración, SHA, tags y digests del manifest son
metadatos operativos; nunca se documentan sus valores secretos.

Para comprobar un despliegue de staging hay que validar el manifest, el digest
que corre en cada servicio, `/api/health`, el endpoint Mongo de staging y los
logs de los workers. Un build verde o un job terminado no demuestra por sí solo
que el runtime servido sea el esperado. La última fuente de releases es el
[workflow de imágenes de staging](https://github.com/fgomezserna/cukies-hub/actions/workflows/cukies-images.yml);
no se duplican aquí cronologías de runs.
