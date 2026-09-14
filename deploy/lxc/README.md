# Producción Cukies fuera de Coolify

El runtime directo usa `docker-compose.images.yml` (generado, solo imágenes
inmutables) más `docker-compose.production.lxc.yml` (Traefik, web y Treasure
Hunt). El builder publica en el registry privado; el LXC solo hace `pull` y
`up`. El entregador copia también los labels de `infrastructure/ci/production-game.labels`.

## Topología actual

- LXC de aplicación: `pve-04`, VMID `2050`, IP `192.168.1.245`.
- Ingress: Traefik en el LXC, puertos 80/443; el túnel Cloudflare 2002 se
  cambia al final para `cukies.world`/`www.cukies.world` y
  `treasurehunt.cukies.world`.
- Datos: se mantienen los Mongo de producción existentes; no se copian bases
  durante el despliegue de imágenes.
- Redis: el Hub actual no lo usa. El legacy usa Bull y sigue en sus dos
  endpoints gestionados hasta completar una migración de colas y endurecer el
  Redis LXC 2008. No activar Redis en esta pila por defecto.

## Requisitos del host

Crear la red externa una sola vez:

```bash
docker network inspect coolify >/dev/null 2>&1 || docker network create coolify
```

Mantener un `/opt/cukies/prod/runtime.env` con modo `0600`, fuera del repo,
contiene secretos y configuración de producción. No guardar valores en Git ni
en los artefactos de CI. El fichero debe incluir al menos:

- `APP_ENV=production`, `STAGING_ONLY_GUARD=false`, `COOLIFY_BRANCH=main` y el
  UUID de producción compatible con el guard actual.
- `COOLIFY_RESOURCE_UUID=jookw8ow8woks088s44404ok` para indexer/relayer y
  `CUKIES_WEB_RESOURCE_UUID=uo8gswsg84c488cowko0kkkg` para el guard de la imagen
  web (el overlay conserva ambos alias en la red interna).
- `DATABASE_URL`, `CUKIES_DATABASE_URL`, `CHAIN_INDEXER_MONGO_URL` y sus
  nombres de base exactos.
- RPC, contratos, Pusher, OAuth/HMAC y claves del relayer.
- `CUKIES_DAPP_TRAEFIK_LABEL_FILE=deploy/coolify/labels/dapp-production.labels`.

El fichero de release que crea CI (`release.env`) solo contiene referencias de
imagen por digest, `IMAGE_REVISION` y el hash de configuración; nunca contiene
secretos.

## Arranque y comprobación local

```bash
docker compose --env-file runtime.env --env-file release.env \
  -f docker-compose.images.yml -f docker-compose.production.lxc.yml \
  --profile bridge-relayer up -d --remove-orphans

curl -kfsS -H 'Host: cukies.world' https://127.0.0.1/api/health
curl -kfsS -H 'Host: cukies.world' https://127.0.0.1/api/ready
curl -kfsS -H 'Host: treasurehunt.cukies.world' https://127.0.0.1/api/health
curl -kfsS -H 'Host: treasurehunt.cukies.world' https://127.0.0.1/api/ready
```

La comprobación válida exige `status=ok`, `environment=production`, el SHA de
la release y `ready` HTTP 200. El tráfico público no se cambia hasta que estas
pruebas, logs del indexer/relayer y el smoke del marketplace pasen.

## Rollback

Cada release se guarda en `/opt/cukies/prod/releases/<sha>/`. Para recuperar la
anterior, vuelve a usar su `release.env`, ejecuta el mismo `docker compose up`
y verifica `/api/health`/`/api/ready`. Mantén Coolify y el túnel apuntando a su
destino actual hasta cerrar la ventana de rollback.
