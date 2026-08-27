# Mongo staging aislado

Estado: operativo en Coolify `game-hub-staging`.
Ultima validacion: 2026-08-06.

## Objetivo

Staging funciona con una instancia Mongo propia y no usa las bases logicas de produccion durante el runtime normal. La copia inicial se hizo una sola vez para disponer de datos representativos; desde el corte, la dapp y los workers apuntan exclusivamente al servicio Mongo del recurso de staging.

## Topologia activa

| Elemento | Valor |
| --- | --- |
| Recurso Coolify | `game-hub-staging`, application ID `28`, UUID `u4s804o4wwcckowgk0woo4wg` |
| Servicio | `staging-mongo` en `docker-compose.coolify.yml` |
| Alias interno | `cukies-hub-staging-mongo-u4s804o4wwcckowgk0woo4wg:27017` |
| Replica set | `cukies-staging-rs0`, un nodo `PRIMARY` |
| Red | Docker `coolify`, sin dominio ni puerto publicado |
| Persistencia | Volumenes dedicados `staging-mongo-data` y `staging-mongo-config` |
| Limites | 2 GB de memoria y 1.5 CPU |

Bases logicas y consumidores:

| Base | Consumidor | Usuario de minimo privilegio |
| --- | --- | --- |
| `cukies-hub-staging` | Dapp Prisma y acceso Mongo del hub | `cukies_hub_staging_app` |
| `cukies-legacy-staging` | Lecturas legacy de Cukies/NFT/wallets | `cukies_legacy_staging_app` |
| `cukieshub-new-staging` | Indexer y economia v3 | `cukies_economy_staging_app` |
| `cukieshub-new-staging` | Card worker, cuando tenga destino S3 propio | `cukies_card_staging_worker` |

Cada usuario esta limitado a `readWrite` y `dbAdmin` sobre su base. Las credenciales viven en Coolify y no se documentan ni se guardan en Git.

## Invariantes de seguridad

El arranque de `infrastructure/staging-mongo/entrypoint.sh` falla cerrado salvo que se cumpla todo lo siguiente:

- `APP_ENV=staging`.
- `STAGING_ONLY_GUARD=true`.
- `COOLIFY_RESOURCE_UUID=u4s804o4wwcckowgk0woo4wg`.
- Replica set y hostname internos coinciden con los valores de staging.
- Usuario root esperado y secretos con longitud/formato validos.
- Existe exactamente un marcador `_id=logical-staging-v1` en `cukies_staging_mongo_admin.bootstrap_state` tras el bootstrap.

El compose no publica `27017`. `dapp`, `chain-indexer` y los schedulers comparten la red `coolify`; solo la dapp tiene proxy publico.

Las URLs runtime deben contener explicitamente estos nombres:

```text
DATABASE_URL             -> cukies-hub-staging
CUKIES_DATABASE_URL      -> cukies-legacy-staging
CHAIN_INDEXER_MONGO_URL  -> cukieshub-new-staging
CHAIN_INDEXER_DB_NAME    -> cukieshub-new-staging
CARD_WORKER_MONGO_URL    -> cukieshub-new-staging
CARD_WORKER_DB_NAME      -> cukieshub-new-staging
```

Los clientes Mongo de la dapp y el importador legacy derivan la base de la URL. No tienen fallbacks a `cukies-hub`, `cukies` ni a `192.168.1.221`.

## Estado validado tras el corte

- Mongo staging: `PRIMARY` y health check correcto.
- Dapp: usa `cukies-hub-staging` y `cukies-legacy-staging`.
- Indexer y economia: usan `cukieshub-new-staging`; la migracion operativa actual es schema version `3` y conserva la verificacion transaccional.
- Segunda wallet firmada: un `User` y un `UserWallet` creados en `cukies-hub-staging`; cero registros para esa dirección en `cukies-hub` de produccion.
- Seis schedulers: contenedores independientes para Cukie Master, creditos, Game Economy, Cukie Pool, ranking semanal y contabilidad de rewards. Cada uno conserva su gate explicito.
- Card worker: desactivado hasta disponer de bucket/prefijo S3 exclusivo de staging.

## Refresh futuro

`infrastructure/staging-mongo/resync.sh` existe para una resincronizacion controlada, pero no forma parte del arranque normal. Su ejecucion hace `--drop` solamente sobre las tres bases con sufijo `-staging` del Mongo dedicado y exige las guardas de recurso anteriores.

Antes de cualquier refresh:

1. Abrir una ventana de mantenimiento solo para staging.
2. Registrar SHA, health y fingerprints de produccion sin cambiar su configuracion.
3. Crear snapshot recuperable de los volumenes Mongo de staging.
4. Detener exclusivamente los writers del recurso `28`.
5. Proporcionar al proceso, de forma temporal, URLs fuente acotadas a las bases logicas de staging del Mongo compartido; no reutilizar las URLs runtime de la dapp.
6. Ejecutar `resync.sh` dentro de `staging-mongo` y comprobar que el marcador incrementa `resyncCount` una sola vez.
7. Reaplicar el schema de economia v3 y verificar una transaccion abortada sin residuos.
8. Arrancar los servicios de staging y validar `/api/health`, indexer, card jobs y logs.
9. Confirmar de nuevo que SHA, variables y health de produccion no han cambiado.

No ejecutar un refresh mientras haya escrituras manuales de QA sin inventariar. No usar `mongorestore --drop` contra el host, las URLs o los nombres de BBDD de produccion.

## Recuperacion y limites actuales

Los volumenes dedicados son la fuente de recuperacion normal. Si se pierden, el contenedor no puede recrear silenciosamente staging desde las URLs runtime ya aisladas: el bootstrap falla cerrado y exige una intervencion operativa explicita.

Pendiente antes de automatizar disaster recovery:

- separar en Coolify las variables fuente de bootstrap de las URLs runtime;
- definir backup cifrado y retencion de los volumenes de staging;
- documentar un restore probado sin acceso de escritura a produccion;
- decidir la cadencia de refresh y la sanitizacion adicional de datos personales.
