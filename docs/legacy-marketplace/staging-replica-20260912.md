# Réplica funcional legacy a staging

Fecha de diseño: 2026-09-12. Este documento describe el lote controlado de
datos para probar juntas las lecturas legacy y las novedades del Hub. No es un
plan de consolidación de bases ni un cambio de autoridad de los servicios.

## Alcance y frontera

El origen es la base `cukies` de producción, leída en modo autenticado y solo
lectura. Los destinos permitidos son:

| Uso | Base | Escrituras de este lote |
| --- | --- | --- |
| Réplica compatible con las rutas legacy | `cukies-legacy-staging` | Colecciones allowlisted, con upsert por `_id` y procedencia |
| Proyecciones mínimas para las lecturas nuevas | `cukieshub-new-staging` | `cukies`, `tx_nfts`, `point_transactions` y `legacy_snapshot_events` |
| Aplicación/identidad | `cukies-hub-staging` | **Ninguna** |

La fuente de producción nunca se modifica. No se copian usuarios, wallets,
passwords, sesiones, tokens, roles, emails, teléfonos, credenciales, claves,
configuración runtime ni posiciones/rewards/créditos históricos. Tampoco se
firma, compra, retira, puentea, genera una compensación ni se cambian writers.
No se hace `drop`, `replace` ciego o `delete`.

La consolidación futura (una única base de datos, migración de writers/readers,
auth y repunteo de todos los servicios) queda expresamente fuera de este lote.
Mientras existan getters, setter, APIs o workers legacy, no se debe marcar
`cukies` como read-only ni retirar sus credenciales.

## Evidencia de inventario disponible

El inventario live recibido el 2026-09-12 está en
[`evidence/2026-09-12-production-source-audit.json`](evidence/2026-09-12-production-source-audit.json).
Es una observación reportada, no una nueva exportación ejecutada por este
script; por tanto sus cifras no se interpretan como paridad.

| Base observada | Función reportada | Colecciones/filas relevantes | Consumidores reportados |
| --- | --- | --- | --- |
| `cukies` (producción) | Proyecciones y worker legacy | `cukies` 17.464; `processedEvents` 191.607; `completedEvents` 119.441; `tx_nfts` 25.662; `txMarketplace` 9.240 | getters BSC/TRON, setter, cards, APIs legacy |
| `cukieshub-new` (producción) | Indexación/economía nueva | `cukies` 17.464; `chain_events` 41.835; `tx_nfts` 15.395 | cobertura reportada BSC `PRESALE`/`UKI_STAKING` |

La diferencia preliminar de estado (2.939 con clave no única
`UPPER(network)+cukiNumber`) no es un recuento de NFTs incorrectos. La
reconciliación debe usar red, colección, `tokenId` y cortes comparables, y
separar owner/custodia de una mera coincidencia de identificadores.

## Manifiesto de colecciones

El manifiesto ejecutable y su schema son la fuente de verdad del lote:
[`scripts/legacy-staging-replica.mjs`](../../scripts/legacy-staging-replica.mjs).
`export --execute` genera `manifest.json`, `manifest.sha256` y un JSONL por
colección con permisos `0600`. Cada fila contiene un envelope `_replica` con
`snapshotId`, colección/red, `identityKey`, fingerprint funcional, cutoff de
referencia y `verifiedOnChain: false`. Cada entrada del manifiesto declara
destino legacy y, cuando existe, `projectionTarget`, además de contadores de
filas, identidades únicas, duplicados, huérfanos (`identityValid=false`) y
conflictos pendientes de resolver contra el destino.

| Colección fuente | Destino legacy | Identidad/reconciliación | Estado funcional incluido | Proyección nueva |
| --- | --- | --- | --- | --- |
| `cukies` | `cukies` | red + TOKEN legacy canónico + `tokenId` (`_id` fallback) | metadata, imagen, owner/user, estado, precio, skills, padres/hijos, historial relacionado | `cukies` con `metadataSource=legacy.snapshot` |
| `originals` | `originals` | `_id` | catálogo/tipo/skills | ninguna |
| `tx_nfts` | `tx_nfts` | red + tx + token + evento/log + `_id` | historial NFT | `tx_nfts` con `runtimeScope=legacy` |
| `points` | `points` | red + POINTS + wallet + tx + `_id` | ledger de puntos | `point_transactions` con `runtimeScope=legacy` |
| `tx_points` | `tx_points` | red + POINTS + wallet + tx + `_id` | compatibilidad de historial | ninguna |
| `txMarketplace` | `txMarketplace` | red + tx + token + tipo + `_id` | historial de marketplace | ninguna; el estado activo vive en `cukies.state` |
| `txLottery` | `txLottery` | red + evento/tx + `_id` | historial de lotería | ninguna |
| `processedEvents` | `processedEvents` | red + contrato + tx + bloque/log + `_id` | snapshot de eventos procesados | `legacy_snapshot_events`, no `chain_events` |
| `completedEvents` | `completedEvents` | `eventId` + `_id` | marcas históricas de procesamiento | ninguna |
| `blockTimestamps` | `blockTimestamps` | red + bloque + `_id` | caché temporal | ninguna |

`state=onSale`, `staking`, `breeding` e `inBridge`, junto con owner, precio y
relaciones, se conservan como estado de la vista `cukies`; no se inventa una
tabla de listings/posiciones nueva ni se mezcla con la economía testnet. El
historial de marketplace, staking, breeding y bridge se conserva en los
registros allowlisted de `txMarketplace`/`tx_nfts` y en sus referencias
sanitizadas.

Quedan fuera, con razón explícita: `users` (auth/PII), `wallets`
(identidad/auth), `referrals` (atribución/recompensas), `blacklistedtokens`
(sesión/auth) y `config/settings` (runtime potencialmente sensible). La lista
completa y la razón se emiten también en `manifest.json`.

## Red y cortes de finality

El legado mantiene sus contratos de producción: BSC mainnet chain 56 y TRON
mainnet. No se sustituyen por BSC testnet 97 ni por los contratos nuevos.

La exportación exige dos cortes independientes, tomados antes de abrir la
transacción snapshot:

- `LEGACY_REPLICA_BSC_SAFE_BLOCK`, su hash `0x` de 32 bytes y, opcionalmente,
  `LEGACY_REPLICA_BSC_CONFIRMATIONS`.
- `LEGACY_REPLICA_TRON_SOLIDIFIED_BLOCK`, su hash hexadecimal de 32 bytes.

No se acepta un único número de bloque para ambas redes. Los cortes quedan en
`chainCutoffs` del manifiesto; un snapshot Mongo, un `updatedAt` o un conteo no
acreditan custodia ni verdad on-chain.

## Ejecución segura

El plan no toca Mongo y no exige las URLs. Desde el root del monorepo:

```bash
pnpm legacy:replica plan
pnpm legacy:replica:test
```

Para una exportación real, inyectar las URLs desde el gestor de secretos (no
versionarlas ni imprimirlas) y fijar todos los cortes:

```bash
export LEGACY_REPLICA_SOURCE_ENV=production
export LEGACY_REPLICA_TARGET_ENV=staging
export LEGACY_REPLICA_SOURCE_MONGO_URL='mongodb://…/cukies'
export LEGACY_REPLICA_TARGET_MONGO_URL='mongodb://…/cukies-legacy-staging'
export LEGACY_REPLICA_NEW_TARGET_MONGO_URL='mongodb://…/cukieshub-new-staging'
export LEGACY_REPLICA_BSC_SAFE_BLOCK='<bloque-56>'
export LEGACY_REPLICA_BSC_SAFE_BLOCK_HASH='0x<hash-56-32-bytes>'
export LEGACY_REPLICA_BSC_CONFIRMATIONS='<confirmaciones>'
export LEGACY_REPLICA_TRON_SOLIDIFIED_BLOCK='<bloque-tron>'
export LEGACY_REPLICA_TRON_SOLIDIFIED_BLOCK_HASH='<hash-tron-32-bytes>'
pnpm legacy:replica export --output /ruta/segura/replica --execute
```

La URL de origen debe nombrar `cukies`; los dos destinos deben nombrar
exactamente sus bases staging y ser distintos del origen. La lectura usa una
transacción MongoDB con `readPreference=primary`, `retryWrites=false`,
`readConcern=snapshot` y `writeConcern=majority`; si no puede obtener una
instantánea coherente, falla sin fallback a lecturas mezcladas.

La carga y la proyección son dry-run salvo que se indiquen `--apply` y la
confirmación exacta:

```bash
pnpm legacy:replica load --bundle /ruta/segura/replica
pnpm legacy:replica project --bundle /ruta/segura/replica

export APPLY_LEGACY_STAGING_REPLICA=1
pnpm legacy:replica load --bundle /ruta/segura/replica --apply
pnpm legacy:replica project --bundle /ruta/segura/replica --apply
pnpm legacy:replica verify --bundle /ruta/segura/replica --scope both
```

Cada documento existente se compara por fingerprint funcional. Si difiere, se
registra conflicto y no se toca hasta proporcionar un fichero de selección
con el `manifestSha256`, una decisión `source` y una razón/evidencia explícita.
La segunda ejecución con el mismo manifiesto debe quedar en `unchanged`; una
decisión ausente nunca convierte el origen en ganador automático. Los markers
de ejecución y conflictos, cuando se aplica, se limitan a
`__legacy_replica_runs` y `__legacy_replica_conflicts`.

## Proveniencia y QA pendiente

Las proyecciones nuevas llevan `legacySnapshot: true`, `runtimeScope: legacy`
cuando corresponde y `verifiedOnChain: false`. Los snapshots de
`processedEvents`/`completedEvents` se mantienen separados de
`chain_events`: no son logs crudos verificados y no activan créditos,
recompensas, balances o posiciones.

Después de que el coordinador revise el manifiesto y los dry-runs, el QA live
debe comprobar en `https://cukieshub.eurekand.com`, desktop y móvil, la
colección legacy, marketplace, Cukie Master, Pool, bridge, breeding y puntos,
sin firmar contra mainnet. También debe contrastar `/api/health`, las vistas
indexer autenticadas y logs de indexer/card-worker. Este documento no afirma
que esa carga, despliegue o QA live ya se hayan ejecutado.
