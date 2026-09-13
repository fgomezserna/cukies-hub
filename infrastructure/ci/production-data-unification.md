# Runbook: unificación de datos de producción

Estado: preparación de código y configuración. El snapshot, la restauración, la
migración y el corte live **no están ejecutados**.

## Decisión de destino

- Instancia: MongoDB dedicada de producción, provisionada y verificada aparte de
  la instancia de staging (`192.168.1.221:27018`). El endpoint definitivo se
  guarda únicamente en Coolify; nunca se escribe en el repositorio.
- Base lógica única: `cukieshub-new`.
- Identidad runtime: un usuario de aplicación con los permisos mínimos sobre
  `cukieshub-new`, la misma URI y `authSource` para todos los servicios.
- Recursos: App33 (`uo8gswsg84c488cowko0kkkg`, web candidata), App13
  (`tkkggwcosc4gksckcc480cwg`, juego) y App12
  (`jookw8ow8woks088s44404ok`, workers/legacy). App12/App13 conservan tráfico
  hasta completar el ensayo de entrega gradual.
- Red: BSC mainnet (`56`). Staging (`97`) y la instancia de staging no se
  reutilizan.

## Variables canónicas

Las variables pueden conservar nombres históricos por compatibilidad, pero sus
valores deben ser idénticos en endpoint, usuario runtime, `authSource` y base:

El Compose no toma el valor antiguo de esos aliases desde Coolify: los deriva de
`DATABASE_URL` y `CHAIN_INDEXER_DB_NAME`. Así una variable obsoleta no puede
desviar un contenedor; los guards siguen validando la identidad cuando un
servicio se ejecuta fuera del Compose.

| Servicio | Variables | Valor requerido |
| --- | --- | --- |
| Dapp y APIs | `DATABASE_URL`, `CUKIES_DATABASE_URL` | URI única, base `cukieshub-new` |
| Indexer y economía | `CHAIN_INDEXER_MONGO_URL`, `CHAIN_INDEXER_DB_NAME` | Misma URI; `cukieshub-new` |
| Legacy indexer | `CUKIES_LEGACY_INDEXER_MONGO_URL`, `CUKIES_LEGACY_INDEXER_DB_NAME` | Misma URI; `cukieshub-new` |
| Card indexado | `CARD_WORKER_MONGO_URL`, `CARD_WORKER_DB_NAME` | Misma URI; `cukieshub-new` |
| Schedulers | `DATABASE_URL`, `CHAIN_INDEXER_MONGO_URL`, `CHAIN_INDEXER_DB_NAME` | Misma URI; gates independientes |

El perfil `cuki-card-worker-legacy` sigue siendo exclusivo de staging porque su
fuente y su guard dependen de assets legacy de Testnet; no se activa en
producción como parte de este corte. Si se necesita en producción, requiere un
lote separado que adapte fuente, contratos y guard, y una nueva validación.

Los guards de producción rechazan una base antigua, una URI divergente o una
identidad Mongo distinta. También rechazan cualquier variable de base/URL que
apunte a `eventlog`.

## Colecciones y reconciliación

1. Exportar un inventario de nombres, índices y recuentos estimados de cada origen
   sin mostrar credenciales ni documentos sensibles.
2. Mantener como canónicas las colecciones que ya escribe el indexer/economía en
   `cukieshub-new` (`chain_events`, `chain_cursors`, `chain_indexer_runs`,
   `chain_bsc_canonical_blocks`, `point_transactions`, balances, marketplace y
   jobs de cards).
3. Importar las entidades Hub (`User`, `UserWallet`, sesiones/resultados y
   checkpoints) con sus nombres actuales, tras validar índices y referencias.
4. Importar el legado bajo nombres explícitos (por ejemplo `legacy_users`,
   `legacy_wallets`, `legacy_points`, `legacy_tx_nfts`) o proyectarlo a las
   colecciones canónicas mediante un transformador idempotente. No sobrescribir
   `cukies` ni `tx_nfts` sin reconciliar red, contrato, `tokenId`, wallet y estado.
5. Resolver `users`/`User`, `wallets`/`UserWallet` y `points`/`point_transactions`
   por identidad wallet/ID legado y registrar cada conflicto. No generar IDs
   sintéticos ni convertir eventos incompletos en balances.
6. Cargar las colecciones game/learn no colisionantes en un namespace definido;
   conservar cualquier fuente que aún tenga consumidores hasta cerrar su criterio
   funcional. No borrar `cukies-game`, `cukies-learn` ni snapshots antiguos durante
   esta ventana.
7. Reejecutar los índices del indexer/economía y los índices de las APIs después
   de la carga. Verificar especialmente unicidad/sparse de `tx_nfts.eventId`,
   leases, TTL y claves parciales.

## Secuencia de la ventana de 60 minutos

### Antes de la ventana

- Provisionar la instancia dedicada y comprobar desde el mismo endpoint que el
  usuario runtime puede autenticarse, crear índices y hacer `ping` únicamente en
  `cukieshub-new`.
- Hacer snapshot del volumen y `mongodump` cifrado de cada origen; probar una
  restauración aislada y guardar hashes, tamaño, fecha y versión del servidor.
- Congelar una release inmutable y desactivar autodeploy de App12/App13; preparar
  App33 sin ruta pública. Registrar `COOLIFY_BRANCH=main`, UUID y manifest.
- Ensayar el import en una copia restaurada, medir duración y producir un informe
  de diferencias con umbrales de abortar.

### Durante la ventana

1. Anunciar mantenimiento y poner en modo lectura los escritores de Hub, legacy,
   indexer, cards y schedulers. Confirmar que no quedan leases ni trabajos de
   escritura en curso.
2. Crear un snapshot adicional y registrar el punto de corte.
3. Ejecutar importaciones/reconciliaciones idempotentes en el orden de la sección
   anterior. Registrar por lote origen, destino, leídos, escritos, omitidos,
   conflictos y hash de entrada.
4. Ejecutar setup de índices y una comprobación de consistencia read-only.
5. Configurar en Coolify las variables canónicas para App33 y App12. Mantener
   `CUKIES_BRIDGE_RELAYER_ENABLED=false`; el relayer actual solo admite Nile→BSC
   Testnet y no se convierte en un escritor mainnet por este runbook.
6. Arrancar App33 sin tráfico y comprobar `/api/health`, `/api/ready`, login,
   lecturas de marketplace, inventario, puntos y una sesión de juego. Verificar
   logs de indexer/card y que todos muestran el mismo fingerprint sin secretos.
7. Transferir el router web al candidato, observar métricas y después recrear los
   workers con el Compose generado. Habilitar cada scheduler solo con su gate y
   tras validar idempotencia; no activar economía/rewards por defecto.
8. Mantener la fuente anterior disponible y observar el smoke autenticado durante
   el resto de la ventana.

### Criterios de abortar

Abortar y restaurar tráfico anterior si falla cualquiera de estos puntos: backup no
restaurable, endpoint/usuario no coincidente, discrepancia de identidad sin regla,
índice único que no pueda reconciliarse, error de `/api/ready`, escritura en una
fuente antigua, duplicación de writer o una ruta crítica sin datos.

## Rollback

El rollback de aplicación usa el manifest/digest anterior y el router anterior;
no implica restaurar datos automáticamente. Si ya hubo escrituras en el destino,
primero se congela el tráfico, se exporta el delta y se reconcilia antes de volver
a una copia. Las bases antiguas y sus snapshots se conservan hasta cerrar la
validación posterior y firmar el informe.

## Retirada de `eventlog`

`eventlog` no se migra ni se mantiene como base de producción. Los getters TRON
leen directamente de la cadena/proveedor; cualquier dato histórico necesario se
reconcilia en las colecciones del destino. Las variables `NX_TRON_DB`, `TRON_DB`,
`CUKIES_TRON_DB` y `EVENTLOG_*` deben eliminarse de Coolify y los guards las
rechazan si reaparecen. Las imágenes legacy externas que todavía las declaren
requieren rebuild/revisión antes de considerarlas aptas para producción.

## Cierre

El corte solo se registra como completado cuando existe evidencia del endpoint
único, snapshot restaurado, conteos/reconciliación, índices, manifest servido,
health/ready, smoke autenticado y ausencia de referencias `eventlog`. Hasta ese
momento, producción continúa con App12/App13 y sus fuentes actuales.
