# Mongo staging refresh

Estado: propuesta operativa lista para ejecutar con confirmacion.
Fecha: 2026-05-13.

## Inventario observado

Mongo activo: `192.168.1.221:27017`.

Conexiones usadas por Coolify production `game-hub`:

| Env var | DB |
| --- | --- |
| `DATABASE_URL` | `cukies-hub` |
| `CUKIES_DATABASE_URL` | `cukies` |

Bases relevantes observadas:

| DB | Tamano aprox. | Uso |
| --- | ---: | --- |
| `cukies-hub` | 0.07 MB | Dapp Prisma actual. |
| `cukies` | 74.98 MB | Legacy Cukies/marketplace/NFTs. |
| `cukies-staging` | 88.14 MB | Staging legacy existente, no alineado con produccion. |
| `cukies-game` | 4.09 MB | Juego legacy/operativo. |
| `cukies-game-staging` | 6.02 MB | Staging juego existente. |

No se observo `cukies-hub-staging`.

## Colecciones clave

`cukies-hub`:

| Coleccion | Docs |
| --- | ---: |
| `User` | 4 |

`cukies`:

| Coleccion | Docs |
| --- | ---: |
| `processedEvents` | 191495 |
| `completedEvents` | 119441 |
| `tx_nfts` | 25603 |
| `tx_points` | 23516 |
| `points` | 23502 |
| `cukies` | 17464 |
| `blockTimestamps` | 15781 |
| `originals` | 12100 |
| `buysComissions` | 9422 |
| `txMarketplace` | 9240 |
| `wallets` | 4293 |
| `referrals` | 3364 |
| `users` | 1337 |

## Estado de `cukies-staging`

`cukies-staging` no debe considerarse replica fiable de `cukies`.

Diferencias relevantes:

| Coleccion | Produccion | Staging | Delta |
| --- | ---: | ---: | ---: |
| `processedEvents` | 191495 | 0 | -191495 |
| `blockTimestamps` | 15781 | 0 | -15781 |
| `points` | 23502 | 15309 | -8193 |
| `tx_nfts` | 25603 | 22886 | -2717 |
| `wallets` | 4293 | 3661 | -632 |
| `users` | 1337 | 1292 | -45 |
| `cukies` | 17464 | 17459 | -5 |
| `settings` | 36 | 0 | -36 |
| `tx` | 0 | 10092 | +10092 |
| `txPoints` | 0 | 37844 | +37844 |

## Decision recomendada

Staging debe poder refrescarse desde production bajo demanda, pero no con una copia ciega.

Reglas:

- Crear o usar `cukies-hub-staging` para la dapp Prisma.
- Usar `cukies-staging` como destino legacy, pero solo tras backup previo.
- Hacer `mongodump` de produccion.
- Hacer `mongodump` del staging actual antes de sobrescribirlo.
- Restaurar con `mongorestore --drop` y remapeo de namespace.
- Sanitizar datos de sesion, OAuth, verificacion y passwords/tokens.
- Mantener wallets, inventario NFT, marketplace, puntos y transacciones para QA fiel.
- Registrar cada refresh en `__staging_refresh`.

## Tooling

Script:

```bash
scripts/refresh-staging-mongo.sh
```

Ejecucion dry-run:

```bash
DRY_RUN=1 \
PROD_DATABASE_URL="mongodb://..." \
PROD_CUKIES_DATABASE_URL="mongodb://..." \
STAGING_DATABASE_URL="mongodb://.../cukies-hub-staging?authSource=admin" \
STAGING_CUKIES_DATABASE_URL="mongodb://.../cukies-staging?authSource=admin" \
bash scripts/refresh-staging-mongo.sh
```

Ejecucion real:

```bash
CONFIRM_REFRESH_STAGING=1 \
PROD_DATABASE_URL="mongodb://..." \
PROD_CUKIES_DATABASE_URL="mongodb://..." \
STAGING_DATABASE_URL="mongodb://.../cukies-hub-staging?authSource=admin" \
STAGING_CUKIES_DATABASE_URL="mongodb://.../cukies-staging?authSource=admin" \
bash scripts/refresh-staging-mongo.sh
```

El script no imprime credenciales. Exige que los destinos parezcan staging y rechaza source/target iguales.

## Sanitizacion aplicada

Hub:

- elimina `Session`,
- elimina `VerificationToken`,
- elimina `EmailVerification`,
- elimina tokens OAuth de `Account`,
- limpia `User.email`,
- elimina `TwitterFollower.webhookData`.

Legacy:

- elimina `blacklistedtokens`,
- limpia `users.email`,
- elimina campos tipo password/token en `users`,
- conserva wallets, NFTs, marketplace, puntos y transacciones.

## Pendiente antes de ejecutar

- Confirmar que no hay datos manuales valiosos en `cukies-staging`.
- Definir si staging debe refrescarse manualmente por release candidate o con job programado.
- Cargar en Coolify staging:
  - `DATABASE_URL` apuntando a `cukies-hub-staging`,
  - `CUKIES_DATABASE_URL` apuntando a `cukies-staging`,
  - resto de secrets no DB separados por entorno.
