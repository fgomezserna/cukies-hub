# UKI deployment environments

Estado: topología activa y checklist operativo.
Issue: #166 `UKI-090.4`.
Última comprobación documental: 2026-09-09.

## Decisión y alcance

`staging` sigue siendo el carril de integración y `main` el carril live. La
promoción a `main` continúa siendo controlada y no arrastra variables,
contratos ni datos de testnet. Treasure Hunt tiene un recurso Coolify separado.

La política de referencias permite `staging-YYYYMMDD.N` para candidatos
validados en staging y `prod-YYYYMMDD.N` para producción. Las ramas
`release/staging-YYYY-MM-DD` son opcionales cuando `staging` sigue avanzando
mientras se estabiliza una release.

| Scope | Recurso y rama | Ruta de despliegue | Datos y dominio |
| --- | --- | --- | --- |
| Stage / Hub | App 28 `game-hub-staging`, `staging`, UUID `u4s804o4wwcckowgk0woo4wg` | Push `staging` -> GitHub Actions `.github/workflows/cukies-images.yml` -> runner VM1012 `192.168.1.244` -> registry VM1007 `192.168.1.207:5000` -> API Coolify VM1001 `192.168.1.201` usando `docker-compose.images.yml`. Autodeploy Git de app 28: **OFF**. `CUKIES_STAGING_IMAGE_DEPLOY_ENABLED=true`. | BSC Testnet `97`; Mongo en LXC2007 `192.168.1.221:27018`, servicio `mongod-cukies-staging`; `https://cukieshub.eurekand.com`. |
| Main / Hub | App 12 `game-hub`, `main`, UUID `jookw8ow8woks088s44404ok` | Build/deploy legacy de Coolify con `docker-compose.coolify.yml`. Este carril no consume el pipeline de imágenes de app 28. | BSC mainnet y datos de producción; `https://cukies.world`. |
| Treasure Hunt | App 31 `game-treasurehunt-staging`, `staging`, UUID `lc04cw8gs4koo4swwws0c4ss` | Recurso independiente con Nixpacks (`build_pack=nixpacks`); no aplica `docker-compose.coolify.yml` ni `docker-compose.images.yml`. | Staging; `https://cukieshub.eurekand.com/treasurehunt-game`, con `NEXT_PUBLIC_GAME_BASE_PATH=/treasurehunt-game` y origen dapp de staging. |

En los hubs app 28 y app 12, solo `dapp` publica dominio mediante Traefik.
Workers y schedulers son internos; app 31 es un recurso independiente.
Las tres bases de Stage (`cukies-hub-staging`, `cukies-legacy-staging` y
`cukieshub-new-staging`) están fuera del Compose operativo y viven en el Mongo
dedicado de LXC2007, servicio `mongod-cukies-staging`, `192.168.1.221:27018`,
verificado como `PRIMARY`. El Mongo existente de `27017` permanece sin cambios.

## Topología local y de preview

| Entorno | Rama/ref | Hosting | Datos | Uso |
| --- | --- | --- | --- | --- |
| Local | Cualquier rama local | Máquina local | Dev/local o mocks | Implementación y pruebas focales. |
| Preview PR | Branch del PR | Coolify preview si se habilita | Datos aislados o mocks | Revisión visual/técnica. |

La fuente de topología para generar el Compose de imágenes es
[`docker-compose.coolify.yml`](../docker-compose.coolify.yml). No se trata como
el Compose operativo actual de Stage. Tras cambiar la fuente:

```bash
node scripts/ci/generate-images-compose.mjs --write
node scripts/ci/generate-images-compose.mjs --check
```

El segundo comando debe quedar limpio antes de integrar el cambio.

## Histórico: comprobaciones de agosto

Estas comprobaciones históricas de contratos y smoke se conservan como
referencia. No forman parte de esta reconciliación documental ni sustituyen
los gates actuales.

- Staging usa BSC Testnet (`97`) y la preventa
  `0xC0d7b04AC4DFCCc28790FD492FCB3CB16AcDfcdA`.
- `UKIStaking` es `0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205`, desplegado en
  el bloque `123359165`, tx
  `0xc09b84077e97fe32b198ed99f1a56829ccc60c1dbe401e7bb20b66983ddc670e`.
- `RewardsDistributor` es `0xc2252D797Da294D16b84282d213604b4Bcf6EE09`,
  desplegado en el bloque `123359171`, tx
  `0x5ecf613df4c13ff7d918f072dd7a01e0256fa933a805c14e5074ff5230852639`.
- La verificación pública conservada está en [UKIStaking en Sourcify](https://repo.sourcify.dev/97/0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205),
  [RewardsDistributor en Sourcify](https://repo.sourcify.dev/97/0xc2252D797Da294D16b84282d213604b4Bcf6EE09),
  [UKIStaking en BscScan Testnet](https://testnet.bscscan.com/address/0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205#code) y
  [RewardsDistributor en BscScan Testnet](https://testnet.bscscan.com/address/0xc2252D797Da294D16b84282d213604b4Bcf6EE09#code).
- El smoke `STAGING_SMOKE_C31176A_2026_08_05` movió temporalmente `1 UKI` por
  contrato y terminó con staking, reservas y balance del distribuidor a cero;
  no representa una cifra de producto.

## Validacion local antes de desplegar

El trabajo de una rama se prueba localmente por bloques y no provoca un despliegue de Coolify por cada cambio. Para contratos, el comando reproducible es:

```bash
pnpm test:staging:contracts
pnpm staging:cukie-master:verify-local
pnpm staging:credits:verify-local
pnpm staging:dashboard:verify-local
pnpm staging:game-rewards:verify-local
pnpm staging:marketplace:verify-local
pnpm staging:weekly-rewards:verify-local
```

Este comando levanta la red Hardhat efimera con `chainId=97` y usa contratos mock para UKI, USDT, WBNB, NFT y router cuando el escenario lo requiere. No se conecta a BSC Testnet, no usa fondos y no escribe en las bases de staging. Las pruebas de dapp e indexer deben ejecutarse con sus flags de staging y fixtures de chain `97`; las pruebas que escriben usan exclusivamente servicios locales o en memoria.

El gate especifico de Marketplace ejecuta conjuntamente contrato, plan de deploy Testnet, DApp,
API, indexador y typechecks. El checkout UKI directo es el nucleo habilitable; BNB y USDT son
rutas opcionales independientes y permanecen ocultas si su configuracion no esta completa. El
mensaje final del gate confirma expresamente que no se ha desplegado ni firmado ninguna
transaccion real.

El gate de Cukie Master cubre los contratos de staking UKI y vault NFT, las dos rutas de cupos,
la entrega/configuracion de creditos, API, cliente e indexador. Incluye regresiones de recarga:
reintento inicial acotado, conservacion de la ultima lectura confirmada ante un fallo transitorio,
bloqueo de estimaciones sensibles y rechazo de respuestas antiguas que lleguen fuera de orden.

El gate de creditos fija Stage y chain `97`, valida la regla de 100 creditos diarios por cupo,
las rutas UKI/NFT, la configuracion own/pool, la reserva para jugar, la caducidad conjunta de
creditos propios y aportados al pool, la idempotencia, el catch-up, el scheduler HMAC y los
indices/cortes canonicos del indexador. No conecta con la base ni firma transacciones de Stage.

El gate de juego y recompensas recorre las cuatro combinaciones de creditos y Cukies propios o
prestados, la prioridad Original -> Segunda Generacion -> Seiku, cuotas, settlement autoritativo,
reparto a jugador/pools, minimo del pool de creditos, presupuesto diario, recuperacion de rewards,
APIs privadas, schedulers e indices. La recuperacion filtra en Mongo los sources ya materializados
antes de limitar el batch, evitando que el historial procesado oculte una partida sin premio.

El gate semanal cubre exclusivamente Stage/chain `97`: ranking solo con creditos prestados,
persistencia del ultimo rango aunque haya semanas sin actividad, 60/30/10, entropia BSC,
siete tramos, minimo del pool de creditos, 80/10/10 no distribuido y embajadores directos al 5%.
Tambien verifica APIs, HMAC, indices y la preparacion preview-only de claims y destinos; no firma,
publica ni escribe en Stage.

El gate del dashboard valida la ruta canonica `/dashboard`, el alias legacy `/wallet`, la
navegacion, el contrato agregado `/api/dashboard/v1/summary`, la sesion EVM firmante, la
degradacion parcial, los timestamps, la red del navegador y los adaptadores de todos los
dominios. Ejecuta todo con Stage/chain `97`, los runtimes automaticos desactivados y repositorios
mock o en memoria; no despliega, firma ni escribe en las bases de Stage.

Solo cuando varios bloques formen un candidato coherente se integra en `staging`, se despliega una vez y se ejecuta el E2E real contra BSC Testnet y las bases aisladas de staging. Una simulacion local aprobada no se presenta como evidencia de que el despliegue real haya pasado.

## Calendario acelerado de pruebas (preparado; activacion pendiente)

- Alcance aprobado el 2026-09-04: staging puede reiniciar sus datos economicos de prueba; no se requiere migrar partidas, creditos, rankings ni repartos antiguos.
- Objetivo: ciclos de 1.800 segundos y semanas de siete ciclos (3 h 30 min), con siete entregas posteriores separadas por un ciclo. Se mantiene el reloj real de BSC Testnet.
- La configuracion incluye un ancla UTC explicita e inmutable por escenario. Las reglas y snapshots conservan su calendario y hashes; sin configuracion se mantienen las duraciones originales de produccion.
- No escalar expiracion de sesiones de autenticacion, HMAC, leases, tiempo de partida, confirmaciones ni freshness de RPC.
- Orden: probar localmente y desplegar pool en chain 97; preparar variables con gates economicos deshabilitados; integrar codigo en staging y dejar que el workflow de imagenes haga la entrega; detener workers durante el reset; ejecutar plan/apply y bootstrap; habilitar gates y verificar el postflight de CI. No lanzar redeploy manual ni tocar main.
- Antes del reset, validar recurso `u4s804o4wwcckowgk0woo4wg`, chain 97 y base `cukieshub-new-staging`. No borrar bases completas ni colecciones de usuarios, embajadores, preventa o assets no necesarias. No tocar main, produccion ni servicios externos.
- Descartar el historial off-chain no mueve activos entre contratos. Las posiciones del vault anterior no aparecen en el nuevo; se usan NFTs de prueba disponibles para el nuevo escenario.
- Variables exclusivas de app28: `ECONOMY_CYCLE_SECONDS=1800`, `ECONOMY_CYCLE_ANCHOR_AT=<ISO UTC alineado futuro>`, `COMPETITION_CREDITS_RULE_VERSION=credits-staging-cycle-v1`, `REWARD_ACCOUNTING_RULE_VERSION=rewards-staging-cycle-v1`, `WEEKLY_RANKING_SCHEDULER_INTERVAL_MS=60000`. El bootstrap mantiene game version `staging-test-v4`, cuyo hash incluye el nuevo calendario; ranking version `weekly-ranking-staging-cycle-v1`.
- Pool desplegado y verificado el 2026-09-04: `0x359b8FC829eB6D320DF6301C8F323AF9AE773B41`, bloque `129039386`, tx `0xb0ecdb8b7f0c1e38057b017d0bfecdece89611376427d4d09717306a8f84ba47`, runtime hash `0x27a137898fe63a8090049e1b595b0d0ee4f8a8a0a59979880f745fd33f030479`. Getter `PERIOD_DURATION=1800`; coleccion autorizada `0xD4C7B16DB234D7f62Ba6a8f30153FAF85feaBec8`. Script pool-only: `packages/contracts/scripts/deploy-fast-pool.testnet.cjs`.
- Reset: `dapp/scripts/reset-staging-economy.mjs --plan` y luego `--apply --confirm RESET_TEST_ECONOMY_APP28`, con `STAGING_ECONOMY_WRITERS_STOPPED=true` y `STAGING_PREVIOUS_POOL_ADDRESS=0xd405acff1bba872be893e796c39f3eacbde2872b`. Preserva usuarios, embajadores, preventa, inventario, staking on-chain, slots Master maduros y sus historiales fuente. Solo elimina el historial de economia y las proyecciones del pool sustituido; conserva indices. No permite repetir el reset del mismo ancla.
- Bootstrap posterior: `dapp/scripts/bootstrap-staging-economy-rules.mjs --plan`, seguido de `--apply --confirm APPLY_STAGING_TESTNET_97_RULES_V4`. Exige cursores verificados recientes y duracion on-chain del nuevo pool igual al calendario.
- Inventario previo: ocho slots Master activos, ninguno con primera entrega futura ni en gracia; no hace falta reconstruir esos slots. Sin partidas abiertas ni locks de juego pendientes.
- Validacion local: build DApp, typechecks DApp/indexer, lint focalizado, 1.055 tests DApp, 30 tests de contratos en chain97; los ciclos cortos se rechazan en otras redes. Creditos cubren gasto, reserva atravesando corte, caducidad, siguiente entrega e idempotencia; rewards cubre cierre semanal y siete tramos.

## Reglas de ramas

| Rama | Regla |
| --- | --- |
| `codex/issue-<numero>-<slug>` | Trabajo aislado por issue. PR draft hasta validar. |
| `staging` | Integracion. Debe ser segura para testnet y datos staging. |
| `main` | Live actual. Solo recibe cambios promovidos tras QA. |
| `release/staging-YYYY-MM-DD` | Congela un candidato cuando `staging` necesita seguir avanzando. |

Protecciones recomendadas para `main`:

- bloquear pushes directos,
- requerir PR,
- requerir al menos una aprobacion,
- requerir status checks de build/test relevantes,
- requerir comentario de go/no-go en la release,
- restringir quien puede hacer merge.

Protecciones recomendadas para `staging`:

- PR obligatorio,
- checks de area cuando existan,
- permitir PRs draft para trabajo en curso,
- no exigir que todo este listo para produccion, solo que sea seguro para staging.

## Flujo de promocion

1. Issue hoja -> rama `codex/issue-*`.
2. PR draft -> validacion tecnica.
3. PR ready -> merge a `staging`.
4. `staging` -> deploy a staging.
5. Staging QA -> evidencia en issue/release candidate.
6. Release candidate -> go/no-go.
7. Merge controlado de `staging` a `main` y tag `prod-*`.
8. Deploy production.
9. Validacion post-deploy.
10. Cierre de issues que realmente quedaron publicadas o cumplidas.

## Configuracion Coolify

### Despliegue de imagenes inmutables de staging

El reemplazo gradual está en validación; recursos, bootstrap y pruebas en
[`deployment-rolling-transition.md`](deployment-rolling-transition.md). Hasta
completar el ensayo, el modo efectivo del Environment determina el destino.

El unico flujo CI de este carril es `.github/workflows/cukies-images.yml`: acepta un
`push` a `staging`, usa el GitHub Environment `cukies-staging` y el runner con las etiquetas
`self-hosted`, `linux`, `x64` y `cukies-builder`. No se habilitan eventos de pull request,
refs arbitrarios ni un disparador manual. El Environment contiene las credenciales del registry
y Coolify para CI; `CUKIES_STAGING_BUILD_ENV_JSON` es una variable pública validada por
allowlist, no un almacén de secretos runtime. Los secretos runtime de Mongo, OAuth, HMAC, RPC
y S3/MinIO se configuran en Coolify.

El pipeline usa Node 22, pnpm 10.19 y Nx 23.2. La primera ejecución, un estado ausente o una
base que no sea ancestro del SHA de GitHub construye los cinco targets CI (`dapp`,
`chain-indexer`, `cuki-card-worker`, `schedulers` y `cukies-bridge-relayer`). En ejecuciones
posteriores Nx affected y el diff de seguridad seleccionan los targets; los demás reutilizan el
digest guardado. Cada imagen se publica con el tag inmutable `<sha>-<configHash>` y el Compose
usa una referencia `image` por componente con digest obligatorio. `cuki-card-worker-legacy`
comparte la imagen del card worker; los schedulers tienen una imagen propia. El manifest del
workflow es la fuente primaria para saber si una release construyó o reutilizó cada imagen.

El builder BuildKit persistente se llama `cukies-ci`, usa el driver `docker-container`, una sola
compilación concurrente (`max-parallelism=1`) y caches de capas separados por componente y
entorno en el registry. El perfil live del 2026-09-09 es host de 8 GiB y contenedor de 6 GiB.
`scripts/ci/prepare-buildx.sh` reutiliza el builder existente y **no reconcilia** sus límites ni
su configuración; solo crea el builder cuando falta. Nx conserva artefactos y base de datos
juntos bajo el mount `/app/.nx`, con `NX_CACHE_DIRECTORY` y `NX_WORKSPACE_DATA_DIRECTORY`
explícitos; Next conserva su cache incremental por separado. El cache del registry no sustituye
esos mounts.

La creación inicial fija la política GC de BuildKit en `minFreeSpace=20GB`,
`reservedSpace=10GB` y `maxUsedSpace=40GB`. El límite de 40 GB es del builder,
no una política de retención del registry. Las ejecuciones posteriores solo
inspeccionan y arrancan el builder existente. No se hace prune, SSH ni limpieza
destructiva desde el workflow.

El estado durable vive en `/srv/cukies-ci/state/staging/release.json` y contiene el ultimo SHA
desplegado correctamente, el hash de configuracion y el digest de cada componente. Se escribe
con rename atomico unicamente despues de que Coolify termine el deployment y la URL de health
confirme el mismo SHA. El manifest JSON se adjunta como artefacto de cada ejecucion, tambien si
un paso falla. Un fallo de deploy no adelanta la base de Nx ni modifica el estado durable.

`docker-compose.images.yml` se genera de forma reproducible desde `docker-compose.coolify.yml`.
Conserva perfiles, guards, comandos, variables, `label_file` si aparece en la fuente y la red
externa `coolify`; elimina todos los `build`, `staging-mongo` y sus volumenes. Las BBDD y sus
volumenes siguen fuera del Compose de la aplicacion. Las imagenes CI llevan
`coolify.managed=true` para que la limpieza de Docker no las trate como imagenes huerfanas.

Antes de iniciar Coolify, el flujo hace PATCH de `git_commit_sha`, `docker_compose_location` y
`docker_compose_raw`, vuelve a leer la aplicación para confirmar el SHA exacto, actualiza las
referencias de imagen mediante `PATCH /applications/{uuid}/envs/bulk` y arranca el deployment
por API. Coolify descarga y guarda el runtime local y reinicia el Compose aunque las imágenes
se reutilicen. La API beta ejecuta `stop_running_container(force:true)` antes de arrancar el
Compose: la selección de qué construir permanece selectiva, pero los servicios del mismo Compose
pueden reiniciarse juntos. El flujo no promete que los workers permanezcan levantados ni intenta
cambiar esa política.

El pipeline de staging se activa con `CUKIES_STAGING_IMAGE_DEPLOY_ENABLED=true` en el
Environment `cukies-staging`; el autodeploy Git de app 28 permanece desactivado para evitar
builds duplicados. Las cinco referencias `CUKIES_IMAGE_*`, `IMAGE_REVISION` y
`CUKIES_BUILD_ENV_HASH` deben estar disponibles tanto en buildtime como runtime: Coolify
interpola el Compose durante ambas fases aunque no exista ningún `build`. Son metadatos
públicos; los secretos runtime siguen en Coolify.

Coolify puede devolver `commit=HEAD` al crear un job. Se considera identidad pendiente
solo en `queued`/`in_progress`; un SHA concreto diferente se rechaza y `finished` exige
el SHA exacto. Health debe confirmar `status=ok`, `environment=staging`, el mismo SHA y
`coolify.resourceUuid=u4s804o4wwcckowgk0woo4wg`. Un fallo no avanza el estado durable.
Los cambios exclusivos del monitor, selector, persistencia de estado y sus tests se
revisan desde el checkout CI y pueden reutilizar las imágenes; no alteran el runtime.
Un cambio limitado al stage final `dapp` de `Dockerfile.ci`, acompañado solo de
documentación/orquestación, puede reconstruir únicamente dapp. La comparación exige
prefijo y sufijo idénticos fuera de ese stage; cualquier otro cambio conserva la
selección conservadora. El manifest registra esta selección por componente.

La prueba vigente de reutilización es el [run `34379350360`](https://github.com/fgomezserna/cukies-hub/actions/runs/34379350360): terminó `SUCCESS`,
con `build=[]` y reutilización de las cinco imágenes. El release commit fue
`7f56123`; las cinco imágenes conservaron `sourceSha=e6e3cbb5f8edcab77a2d13551a71ae2d23fd5a1e` y health devolvió
HTTP 200 con el SHA exacto. El deployment Coolify `1466`
(`vwc0soksswksoc8kw88okc8c`) terminó a las 16:56:39 UTC. Esta evidencia prueba
reuse de imágenes y runtime identificado; la comprobación visual de la UI queda
fuera de este runbook. El manifest del workflow es la fuente final y no se
duplican aquí cronologías de ejecuciones.

El carril de producción no cambia. Coolify conserva el despliegue de la aplicación;
este trabajo no incorpora autoescalado. La retención y GC de versiones del registry
requieren su propia política; el límite de 40 GB corresponde a la caché del builder.

El builder dedicado está instalado en VM1012 (`192.168.1.244`, 4 vCPU, 8 GiB RAM,
120 GiB disco). El runner `cukies-builder-1012` está registrado. Mongo de staging funciona
en LXC2007, `192.168.1.221:27018`, mediante `mongod-cukies-staging`; el Mongo compartido de
`27017` se conserva sin cambios.

El 2026-09-09 se sustituyó el cron de limpieza agresiva de VM1001 por
`infrastructure/ci/docker-prune-safe.sh`: omite limpieza si Coolify tiene despliegues
activos/en cola o no se puede consultar su estado; solo considera objetos antiguos
y no limpia volúmenes ni caché de build. Se desactivó el modo forzado de limpieza
interna de Coolify en los dos registros del mismo servidor.

### Espacio y recuperación de card workers

El guard de tarjetas mantiene un suelo independiente de 10 GiB tanto en Coolify
como en MinIO. Su heartbeat debe ser menor de 45 s; ante una pausa se esperan
30 s y se reanuda automáticamente sin bajar el guard. Esta política es distinta
de la GC del builder descrita arriba. La recuperación de storage autorizada el
2026-09-09 retiró 5 imágenes antiguas de Stage y 54 IDs exactos de caché regular
privada e inmutable: el espacio pasó de 3.684.106.240 a 22.697.099.264 bytes.
Los guards de ambos card workers pasaron; no hubo reinicios, borrado de
volúmenes ni limpieza de caché Nx en VM1012. La evidencia está en
[`2026-09-09-storage-recovery-evidence.json`](../infrastructure/ci/2026-09-09-storage-recovery-evidence.json).
La retención del registry no está automatizada.

Para recuperar capacidad, coordinar una ventana sin builds ni deployments activos
o en cola. Inventariar imágenes y referencias de todos los contenedores, incluidos
los detenidos, y conservar los digests del manifest anterior y los volúmenes de
rollback. Retirar únicamente referencias obsoletas verificadas, sin forzar la
eliminación. No imprimir historiales Docker ni entornos completos: pueden contener
credenciales.

Si el disco no se libera, comprobar qué registros de BuildKit siguen reteniendo
esas capas. La limpieza debe limitarse a identificadores comprobados como privados,
sin uso e inmutables; no usar una limpieza global ni borrar mounts de caché. Los
IDs de la evidencia anterior son históricos y no constituyen una lista reutilizable
de borrado. Medir el espacio real del sistema de archivos después de la operación.

El postflight exige un heartbeat fresco en
`/run/cukies-card-capacity/capacity.json`, ambos valores de capacidad por encima
del mínimo y el guard real de cada worker correcto. Confirmar que no aparecen nuevos
errores de capacidad. Si no hay trabajos pendientes, los workers quedan esperando;
no crear ni regenerar tarjetas solo para probar la recuperación.

Durante el despliegue previo `1457` el host agotó `/srv`; se recuperó el servicio
reduciendo del 5 % al 1 % los bloques reservados de esa partición de datos y
retirando cuatro imágenes antiguas sin referencias. Los volúmenes se conservaron.
El job quedó cancelado tras ENOSPC; no se presenta como despliegue exitoso. La
aplicación con SHA `53088a3` se verificó tras recrear sus clientes hacia el LXC.

El proveedor activo observado es Coolify. `cukieshub.eurekand.com` sigue `staging`; `cukies.world` sigue `main`.

La migración de Mongo al LXC está completada y su procedimiento queda como histórico o
repetición controlada en [`staging-data-handoff.md`](../infrastructure/ci/staging-data-handoff.md).
Las integraciones externas, schedulers y gates económicos mantienen sus perfiles y credenciales
separadas; nada de esto debe usar secrets en el repo.

### Diagnóstico de Nx después de OOM

En Nx 23.2, `task_invocations` persiste una fila identificada por `root_pid` y
`task_id`; el cleanup solo elimina filas con más de 24 horas. Después de un OOM,
la reutilización de un PID puede chocar con una fila pendiente. En el incidente
no se verificó una fila huérfana ni se borró ninguna; el mecanismo queda como
hipótesis hasta correlacionar logs y estado del contenedor. La inspección SQL se
limita a metadata; nunca se hace un reset global ni se atribuye la causa como
confirmada sin evidencia. La fuente primaria es
[`task_invocation_tracker.rs`](https://github.com/nrwl/nx/blob/23.2.0/packages/nx/src/native/tasks/task_invocation_tracker.rs).

Tras un OOM se confirman primero logs y estado del contenedor. No se reintenta a ciegas.

### Rollback de imágenes

La vía ordinaria es revertir el cambio mediante un PR hacia `staging` y dejar
que una nueva ejecución de CI publique y despliegue las imágenes resultantes.
Para un incidente operativo, un operador puede restaurar el manifest previo y
su configuración pública por digest durante una ventana confirmada. En ambos
casos se comprueban health con el commit esperado y los digests del manifest
servido. No se vuelve al `docker-compose.coolify.yml` legacy ni se cambia Mongo.
Si ya hubo escrituras, cualquier rollback de datos exige reconciliar el delta y
seguir el procedimiento separado del handoff de Mongo.

### Configuracion Coolify objetivo

| Entorno | Coolify project | Coolify environment | Branch | Dominio |
| --- | --- | --- | --- | --- |
| Staging/integracion | `cukies.world` | `production` en Coolify | `staging` | `cukieshub.eurekand.com` |
| Production/live | `cukies.world` | `production` en Coolify | `main` | `cukies.world` |

Reglas operativas:

- staging debe tener `NEXTAUTH_URL` y callbacks OAuth propios,
- staging debe usar base de datos y secrets separados,
- `STAGING_ONLY_GUARD=true` es obligatorio en la app Coolify `28`; el arranque de `dapp`, `chain-indexer` y `cuki-card-worker` se detiene antes de cualquier setup si el guard no valida el perimetro,
- `main` solo debe recibir merges promovidos tras QA y go/no-go,
- `cukies.world` no debe recibir variables ni contratos de staging,
- los nombres de routers Traefik deben ser unicos por entorno,
- ambos servicios deben vivir en la red Docker externa `coolify`.

### Preflight staging-only

El guard `pnpm guard:staging` valida sin imprimir secretos:

- `APP_ENV=staging`;
- `NEXT_PUBLIC_APP_ENV=staging` en el bundle público;
- rama real inyectada por Coolify `COOLIFY_BRANCH=staging`;
- UUID real del recurso `u4s804o4wwcckowgk0woo4wg` (app `28`);
- BSC Testnet `97` tanto en la dapp como en el indexer;
- explorer público exacto `https://testnet.bscscan.com` y ausencia de enlaces PancakeSwap mainnet;
- `DATABASE_URL` -> `cukies-hub-staging`;
- `CUKIES_DATABASE_URL` -> `cukies-legacy-staging`;
- `CHAIN_INDEXER_DB_NAME` y `CARD_WORKER_DB_NAME` -> `cukieshub-new-staging`;
- `NEXTAUTH_URL` -> uno de los hosts HTTPS aprobados de staging.

El mismo guard se ejecuta automaticamente en `scripts/docker-start.sh` con alcance por servicio y antes de los setups que escriben en Mongo. Los wrappers manuales `pnpm staging:indexer:setup` y `pnpm staging:cards:setup` aplican el alcance correspondiente; `pnpm guard:staging` ejecuta el preflight completo. `pnpm guard:staging:test` cubre explicitamente los rechazos de `main`, app/UUID de produccion, chain `56`, bases live y `cukies.world`.

El schema de economia se inicializa de forma deliberada, no durante el arranque normal del indexer:

1. comprobar el sentinel en `cukieshub-new-staging`;
2. si no existe, ejecutar dentro del contenedor de staging `pnpm staging:economy:setup:prod`;
3. si existe en v1, usar `pnpm staging:economy:migrate:v2:prod` y despues repetir el setup;
4. verificar `schemaVersion=2`, `dbName=cukieshub-new-staging` y `transactionVerifiedAt`;
5. mantener todos los schedulers desactivados hasta cargar reglas y probar leases/idempotencia.

Ambos comandos vuelven a ejecutar el guard staging-only antes de crear indices, escribir el sentinel o abrir la transaccion de prueba. Ademas, el arranque normal de `chain-indexer` ejecuta primero `setup:prod` y `setup:economy:prod`; asi cualquier coleccion o indice nuevo de Economy v2 queda instalado antes de iniciar el loop del indexer. Los wrappers manuales se conservan para diagnostico o reparacion controlada.

### BBDD fuera del Compose de imagenes

El Compose de imagenes no crea `staging-mongo`, no declara sus volumenes y no contiene una ruta
fallback a Mongo. La aplicacion conserva las URLs y credenciales de BBDD que ya administra el
entorno de staging; este flujo no apaga, migra, resincroniza ni cambia datos. Cualquier cambio de
topologia o migracion de BBDD requiere una operacion separada con su propio plan y validacion.

## Matriz de envs

### Dapp

| Variable | Staging | Production | Nota |
| --- | --- | --- | --- |
| `DATABASE_URL` | Mongo staging | Mongo production | Nunca compartir escritura con produccion. |
| `CUKIES_DATABASE_URL` | Mongo legacy staging | Mongo legacy production | Usar replica sanitizada de `cukies`, no produccion directa. |
| `NEXTAUTH_URL` | URL staging | URL production | Debe coincidir con OAuth callbacks. |
| `NEXTAUTH_SECRET` | Secret staging | Secret production | Distinto por entorno. |
| `ADMIN_WALLET_ALLOWLIST` | Wallets EVM admin separadas por coma | Wallets EVM admin separadas por coma | `/indexer` devuelve 404 sin sesion firmada allowlisted; vacio falla cerrado y no abre Mongo. |
| `DISCORD_CLIENT_ID` | OAuth staging/dev app | OAuth production app | Callbacks separados. |
| `DISCORD_CLIENT_SECRET` | Secret staging | Secret production | No reutilizar si se puede evitar. |
| `DISCORD_GUILD_ID` | Guild staging o real segun QA | Guild production | Definir antes de QA. |
| `TWITTER_CLIENT_ID` | OAuth staging/dev app | OAuth production app | Callbacks separados. |
| `TWITTER_CLIENT_SECRET` | Secret staging | Secret production | Distinto por entorno. |
| `IFTTT_WEBHOOK_SECRET` | Secret staging | Secret production | Separado por entorno. |
| `TREASURE_HUNT_MULTIPLAYER_ENABLED` | `true` solo durante QA autorizada | `false` | Gate servidor; el limiter actual exige una unica replica de `dapp`. |
| `TREASURE_HUNT_COMPETITION_ELIGIBILITY_KIND` | `uki_staking` | `uki_staking` tras aprobar mainnet | No reutilizar `presale` para esta campaña. |
| `TREASURE_HUNT_COMPETITION_ENABLED` | `true` durante QA | `false` hasta aprobar mainnet | Gate servidor independiente de la UI. |
| `TREASURE_HUNT_COMPETITION_ID` | `uki-staking-testnet-2026-08` | ID mainnet nuevo | La configuración de campaña es inmutable. |
| `TREASURE_HUNT_COMPETITION_STARTS_AT` | `2026-08-26T00:00:00.000Z` | Ventana mainnet aprobada | Inicio inmediato de la prueba integrada. |
| `TREASURE_HUNT_COMPETITION_ENDS_AT` | `2026-09-15T15:00:00.000Z` | Ventana mainnet aprobada | Una retirada confirmada antes de este instante descalifica. |
| `TREASURE_HUNT_COMPETITION_STAKING_ADDRESS` | `0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205` | Staking mainnet aprobado | Debe coincidir con `NEXT_PUBLIC_*` e indexador. |
| `TREASURE_HUNT_COMPETITION_STAKE_PER_ATTEMPT_RAW` | `2000000000000000000000` | Igual si se aprueba | 2.000 UKI por intento. |
| `TREASURE_HUNT_COMPETITION_TOP_ATTEMPTS_PER_WALLET` | `10` | Igual si se aprueba | Top válido que genera tickets. |
| `TREASURE_HUNT_COMPETITION_POINTS_PER_TICKET` | `100` | Igual si se aprueba | División entera por intento. |
| `TREASURE_HUNT_COMPETITION_BASE_PRIZE_UKI_RAW` | `50000000000000000000000` | Igual si se aprueba | Base de 50.000 UKI. |
| `TREASURE_HUNT_COMPETITION_STAKE_PRIZE_BPS` | `1000` | Igual si se aprueba | Suma 10% del staking total al cierre. |
| `TREASURE_HUNT_COMPETITION_PRIZE_PER_WINNER_UKI_RAW` | `10000000000000000000000` | Igual si se aprueba | 10.000 UKI por ganador. |
| `TREASURE_HUNT_COMPETITION_MAX_WINS_PER_WALLET` | `1` | Igual si se aprueba | Sin ganadores duplicados. |
| `NEXT_PUBLIC_TREASURE_HUNT_MULTIPLAYER_ENABLED` (`sybil-slayer`) | `true` solo durante QA autorizada | `false` | Variable de build del recurso separado; exige rebuild. |
| `NEXT_PUBLIC_DAPP_ORIGIN` (`sybil-slayer`) | `https://cukieshub.eurekand.com` | Origen dapp production | Variable de build y origen exacto permitido por `frame-ancestors`. |
| `NEXT_PUBLIC_APP_ENV` | `staging` | `production` | Se deriva de `APP_ENV` durante el build para que el cliente también falle cerrado. |
| `NEXT_PUBLIC_UKI_CHAIN_ID` | `97` | `56` | BSC testnet vs BSC mainnet. |
| `NEXT_PUBLIC_ASM_TOKEN_ADDRESS` | `0xf93dd40Bf8bD8dDf7C785AA87dc13C3c3FeB6c8C` | ASM mainnet | Verificado por chain. |
| `NEXT_PUBLIC_UKI_TOKEN_ADDRESS` | `0x42895bBEc6A6EC1b4aF0B11E144Cd2777589C23c` | UKI mainnet | Desde freeze/deploy. |
| `NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS` | Vault testnet | Vault mainnet | Desde freeze/deploy. |
| `NEXT_PUBLIC_UKI_PRESALE_ADDRESS` | Presale testnet | Presale mainnet | Desde freeze/deploy. |
| `NEXT_PUBLIC_UKI_STAKING_ADDRESS` | `0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205` | Staking mainnet pendiente | Contrato de custodia UKI sin rewards ni lock. |
| `NEXT_PUBLIC_UKI_REWARDS_DISTRIBUTOR_ADDRESS` | `0xc2252D797Da294D16b84282d213604b4Bcf6EE09` | Distributor mainnet pendiente | Sin fondos/lotes de producto hasta aprobar reglas. |
| `NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS` | Vacío hasta desplegar y verificar el contrato nuevo en chain `97` | Marketplace UKI mainnet pendiente | Debe coincidir con `CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS`; vacío mantiene la API cerrada. |
| `NEXT_PUBLIC_UKI_MARKETPLACE_ROUTER_ADDRESS` | `0xD99D1c33F9fC3444f8101754aBC46c52416550D1` solo tras desplegar Marketplace | Router mainnet pendiente | Pancake V2 Testnet fijado por el deploy; no habilita por sí solo BNB/USDT. |
| `NEXT_PUBLIC_UKI_MARKETPLACE_WBNB_ADDRESS` | `0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd` solo tras desplegar Marketplace | WBNB mainnet pendiente | Debe coincidir con `router.WETH()` en chain `97`. |
| `NEXT_PUBLIC_UKI_MARKETPLACE_USDT_ADDRESS` | Vacío | USDT mainnet pendiente | No existe token/ruta Testnet aprobada; vacío mantiene solo USDT cerrado y no bloquea UKI directo. |
| `NEXT_PUBLIC_UKI_MARKETPLACE_{BNB,USDT}_PATH` | Vacío | Rutas mainnet pendientes | Solo se rellenan después de que el verificador pruebe la ruta completa en la chain objetivo. |
| `NEXT_PUBLIC_UKI_LIQUIDITY_PAIR_ADDRESS` | `0x8fa397B4E1DED911161f13C128DF369cE9a95B3A` | Pair mainnet oficial | Pair ASM/UKI de Pancake V2 verificado en chain 97; el guard rechaza cualquier otro. |
| `NEXT_PUBLIC_UKI_LIQUIDITY_LOCKER_ADDRESS` | Vacío hasta verificar un locker testnet | Locker mainnet oficial | Si está vacío, la home no anuncia ni enlaza liquidez bloqueada. |
| `NEXT_PUBLIC_UKI_LIQUIDITY_UNLOCK_LABEL` | Vacío sin locker testnet | Fecha UTC aprobada | Es solo texto; exige un locker configurado para mostrarse. |
| `NEXT_PUBLIC_UKI_SWAP_URL` | `https://pancakeswap.finance/swap?chain=bscTestnet&inputCurrency=0xf93dd40Bf8bD8dDf7C785AA87dc13C3c3FeB6c8C&outputCurrency=0x42895bBEc6A6EC1b4aF0B11E144Cd2777589C23c` | Opcional; mainnet se construye con ASM/UKI | Stage habilita solo la ruta directa ASM/UKI y exige el pair verificado. BNB y USDT siguen deshabilitados hasta que el verificador demuestre una ruta. |
| `NEXT_PUBLIC_CUKIES_NFT_COLLECTION_ADDRESS` | `0xD4C7B16DB234D7f62Ba6a8f30153FAF85feaBec8` | Colección mainnet pendiente | Colección ERC-721 V2 custodiable de staging. |
| `NEXT_PUBLIC_CUKIES_BRIDGE_MODE` | `disabled` hasta completar E2E; despues `testnet` | `disabled`; `live` no esta soportado | Nunca habilitar parcialmente. |
| `NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID` | `97` | Sin configurar | Esta entrega rechaza expresamente chain `56`. |
| `NEXT_PUBLIC_CUKIES_BRIDGE_BSC_COLLECTION_ADDRESS` | Coleccion bridge BSC Testnet pendiente | Sin configurar | No usar la fixture que solo emite eventos. |
| `NEXT_PUBLIC_CUKIES_BRIDGE_BSC_ENDPOINT_ADDRESS` | Endpoint custodial BSC Testnet pendiente | Sin configurar | Stage rechaza expresamente el bridge legacy mainnet. |
| `NEXT_PUBLIC_CUKIES_BRIDGE_TRON_NETWORK` | `nile` | Sin configurar | Esta entrega rechaza expresamente `mainnet`. |
| `NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL` | `https://nile.trongrid.io` | Sin configurar | Se valida el origin HTTPS exacto. |
| `NEXT_PUBLIC_CUKIES_BRIDGE_TRON_COLLECTION_ADDRESS` | Coleccion Nile pendiente | Sin configurar | No reutilizar `TVkQ...` en Stage. |
| `NEXT_PUBLIC_CUKIES_BRIDGE_TRON_ENDPOINT_ADDRESS` | Endpoint custodial Nile pendiente | Sin configurar | No reutilizar `TXVr...` en Stage. |
| `NEXT_PUBLIC_CUKIE_MASTER_NFT_VAULT_ADDRESS` | `0x4482ebA4D55a1DF6aA102a8CC22A4fBa252D7eDB` | Vault mainnet pendiente | Custodia NFT para la ruta Cukie Master. |
| `NEXT_PUBLIC_CUKIE_POOL_NFT_VAULT_ADDRESS` | `0xd405aCFf1Bba872bE893e796C39f3eaCBdE2872b` | Vault mainnet pendiente | Custodia NFT para el Cukie Pool. |
| `NEXT_PUBLIC_BSCSCAN_BASE_URL` | `https://testnet.bscscan.com` | `https://bscscan.com` | Enlaces de tx/address. |
| `NEXT_PUBLIC_GAME_HYPPIE_ROAD` | URL staging game | URL production game | Si el juego vive separado. |
| `NEXT_PUBLIC_GAME_SYBIL_SLAYER` | URL staging game | URL production game | Si el juego vive separado. |
| `NEXT_PUBLIC_PUSHER_KEY` | App/key staging | App/key production | Separar canales si hay trafico real. |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Cluster staging | Cluster production | Puede coincidir, app no. |
| `PUSHER_APP_ID` | App staging | App production | Si aplica al servidor. |
| `PUSHER_SECRET` | Secret staging | Secret production | Separado. |
| `TELEGRAM_BOT_TOKEN` | Bot staging | Bot production | Evitar publicar en chats reales durante QA. |
| `TELEGRAM_CHAT_ID` | Chat staging | Chat production | Separado. |
| `TELEGRAM_CLEANUP_SECRET` | Secret staging | Secret production | Separado. |

### Contracts deploy

| Variable | Staging/testnet | Production/mainnet | Nota |
| --- | --- | --- | --- |
| `BSC_TESTNET_RPC_URL` | RPC testnet | - | No usar mainnet. |
| `BSC_RPC_URL` | - | RPC mainnet | Solo para mainnet. |
| `DEPLOYER_PRIVATE_KEY` | Deployer testnet | Deployer mainnet controlado | Nunca commitear. |
| `BSCSCAN_API_KEY` | BscScan testnet/mainnet | BscScan testnet/mainnet | Puede ser el mismo token de API. |
| `ASM_TOKEN_ADDRESS` | ASM testnet | ASM mainnet | Debe estar verificado. |
| `UKI_TOKEN_ADDRESS` | Opcional attach testnet | Opcional attach mainnet | Solo si se reutiliza. |
| `UKI_VESTING_VAULT_ADDRESS` | Opcional attach testnet | Opcional attach mainnet | Solo si se reutiliza. |
| `SALE_OWNER_ADDRESS` | Admin/multisig testnet | Multisig mainnet | Obligatorio en redes no locales. |
| `SALE_TREASURY_ADDRESS` | Treasury testnet | Treasury mainnet | Controlado. |
| `AMBASSADOR_DEFAULT_WALLET_ADDRESS` | `0x19907a00aBF02975fb60D616C99565894c08d859` | `0x538b7EC80B13325ecf7DC3b9b73A58ac56492e01` | Tesorerias verificadas el 2026-09-07 con `Presale.treasury()` en cadenas 97 y 56. Configurar por separado en apps 28 y 12; sin fallback entre entornos. |
| `SALE_START` | Timestamp testnet | Timestamp mainnet | UTC. |
| `SALE_END` | Timestamp testnet | Timestamp mainnet | UTC. |
| `UKI_PER_ASM` | Ratio testnet | Ratio mainnet | Raw `1e18` scale. |
| `MIN_ASM_PER_PURCHASE` | 5 ASM testnet | 5 ASM mainnet | Raw units. |
| `TOTAL_UKI_FOR_SALE` | Cap testnet | 250M UKI mainnet | Raw units. |
| `SALE_ENABLED` | Estado testnet | Estado mainnet | `false` antes de abrir compras; `true` durante preventa abierta. |
| `VESTING_START` | TGE testnet | TGE mainnet | UTC; final value lives in `VestingVault`. |
| `VESTING_DURATION` | Duracion testnet | Duracion mainnet | Segundos. |
| `VESTING_CONFIG_FROZEN` | Estado testnet | Estado mainnet | `false` antes de TGE; `true` antes de claims. |

### Chain indexer

| Variable | Staging | Nota |
| --- | --- | --- |
| `CHAIN_INDEXER_CONTRACT_ALIASES` | Aliases previos más `UKI_STAKING,TOKEN_V2,CUKIE_MASTER_NFT_VAULT,CUKIE_POOL_NFT_VAULT`; añadir `UKI_MARKETPLACE` solo tras su despliegue verificado | Nunca sustituir ni reiniciar aliases existentes. `MARKETPLACE` conserva las órdenes Legacy BNB; `UKI_MARKETPLACE` es independiente. |
| `CHAIN_INDEXER_TOKEN_ADDRESS` | Fuente legacy ya verificada | Se conserva sin cambios, con su identidad y cursores existentes. |
| `CHAIN_INDEXER_TOKEN_V2_ADDRESS` | `0xD4C7B16DB234D7f62Ba6a8f30153FAF85feaBec8` | Nueva colección ERC-721 custodiable de chain `97`; sin fallback a `TOKEN`. |
| `CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_ADDRESS` | `0x4482ebA4D55a1DF6aA102a8CC22A4fBa252D7eDB` | Vault custodial independiente para Cukie Master. |
| `CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_ADDRESS` | `0xd405aCFf1Bba872bE893e796C39f3eaCBdE2872b` | Vault custodial independiente para Cukie Pool. |
| `CHAIN_INDEXER_MARKETPLACE_ADDRESS` | Pendiente de `deploy:testnet:nft-source` | Emisor testnet de eventos marketplace, sin custodia ni valor. |
| `CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS` | Vacío hasta desplegar y verificar el contrato nuevo | Marketplace no custodial con precios UKI; no reutiliza la address Legacy BNB. |
| `CHAIN_INDEXER_UKI_MARKETPLACE_{START_BSC_BLOCK,DEPLOYMENT_BSC_BLOCK}` | Vacío hasta despliegue | Ambos deben coincidir con el bloque exacto del receipt Testnet. |
| `CHAIN_INDEXER_UKI_MARKETPLACE_DEPLOYMENT_TX_HASH` | Vacío hasta despliegue | Evidencia exacta del receipt BSC Testnet. |
| `CHAIN_INDEXER_UKI_MARKETPLACE_RUNTIME_CODE_HASH` | Vacío hasta despliegue | Keccak-256 del bytecode runtime verificado. |
| `CHAIN_INDEXER_BRIDGE_ADDRESS` | Pendiente de `deploy:testnet:nft-source` | Emisor testnet de eventos bridge, sin custodia ni valor. |
| `CHAIN_INDEXER_TOKEN_V2_{START_BSC_BLOCK,DEPLOYMENT_BSC_BLOCK}` | `125280412` | Start y deployment block coinciden. |
| `CHAIN_INDEXER_TOKEN_V2_DEPLOYMENT_TX_HASH` | `0xef06344f418e176f1f1a5d7a4f7acf98680fcfd344331ff7323d0cf1ac7e77a9` | Receipt BSC Testnet verificado. |
| `CHAIN_INDEXER_TOKEN_V2_RUNTIME_CODE_HASH` | `0x2a4da6545f6e1d1d7c304819582ca4e9ec91a8712ead55cf2383547c72e79994` | Keccak-256 del bytecode runtime. |
| `CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_{START_BSC_BLOCK,DEPLOYMENT_BSC_BLOCK}` | `125280540` | Start y deployment block coinciden. |
| `CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_DEPLOYMENT_TX_HASH` | `0xfad52ef19f3e98efe7cd7eede83982407e59fabcd82b7e62451da176df9a77fa` | Receipt BSC Testnet verificado. |
| `CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_RUNTIME_CODE_HASH` | `0x2cab642a77ad5d19819d4698594a8b73011bb80f0c0372dc01a43b0fbb6de3b7` | Keccak-256 del bytecode runtime. |
| `CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_{START_BSC_BLOCK,DEPLOYMENT_BSC_BLOCK}` | `125280547` | Start y deployment block coinciden. |
| `CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_DEPLOYMENT_TX_HASH` | `0x07a032f881b437f8264491fcc603466b55873a2921b16051d65f0aeecb01632f` | Receipt BSC Testnet verificado. |
| `CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_RUNTIME_CODE_HASH` | `0x36c0f9144323fc23ce9ab02063196943f7d633abb207a8df519db35caf26637a` | Keccak-256 del bytecode runtime. |
| `CHAIN_INDEXER_PRESALE_ADDRESS` | `0xC0d7b04AC4DFCCc28790FD492FCB3CB16AcDfcdA` | Debe coincidir con la variable publica. |
| `CHAIN_INDEXER_PRESALE_START_BSC_BLOCK` | `123291898` | Bloque exacto de despliegue. |
| `CHAIN_INDEXER_PRESALE_DEPLOYMENT_BSC_BLOCK` | `123291898` | Debe coincidir con el receipt de despliegue y con el start block. |
| `CHAIN_INDEXER_PRESALE_DEPLOYMENT_TX_HASH` | `0x846987138438bc3e77bfa8a957011b7cf6bbfc7b8fae59a548949102a0abc80e` | Receipt BSC Testnet verificado. |
| `CHAIN_INDEXER_PRESALE_RUNTIME_CODE_HASH` | `0xb913b21342f583078dc890e77a2e0bb43b4e77ae02f04a180284aee3ceb7b8a3` | Keccak-256 del bytecode runtime testnet actual. |
| `CHAIN_INDEXER_UKI_STAKING_ADDRESS` | `0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205` | Debe coincidir con la variable publica. |
| `CHAIN_INDEXER_UKI_STAKING_START_BSC_BLOCK` | `123359165` | Bloque exacto de despliegue. |
| `CHAIN_INDEXER_UKI_STAKING_DEPLOYMENT_BSC_BLOCK` | `123359165` | Debe coincidir con el receipt de despliegue y con el start block. |
| `CHAIN_INDEXER_UKI_STAKING_DEPLOYMENT_TX_HASH` | `0xc09b84077e97fe32b198ed99f1a56829ccc60c1dbe401e7bb20b66983ddc670e` | Evidencia publica testnet; el indexer verifica status, address y bloque. |
| `CHAIN_INDEXER_UKI_STAKING_RUNTIME_CODE_HASH` | `0xb4976a78dc9d9792842ce7d6a8fa689bc187661cf7c076753e326fd07e20d732` | Keccak-256 del bytecode runtime testnet actual. |
| `CHAIN_INDEXER_VESTING_VAULT_ADDRESS` | `0xE7cFcebA1342946ff8c382Be8D7B55F0323b1154` | VestingVault testnet de la preventa staging. |
| `CHAIN_INDEXER_VESTING_VAULT_START_BSC_BLOCK` | `123291890` | Bloque exacto de despliegue. |
| `CHAIN_INDEXER_VESTING_VAULT_DEPLOYMENT_BSC_BLOCK` | `123291890` | Debe coincidir con el receipt de despliegue y con el start block. |
| `CHAIN_INDEXER_VESTING_VAULT_DEPLOYMENT_TX_HASH` | `0x14292fc576ddff260572c4d7de7a7538d8f0aed8f3147d20f65d2cb77a0fa00b` | Evidencia publica testnet; el indexer verifica status, address y bloque. |
| `CHAIN_INDEXER_VESTING_VAULT_RUNTIME_CODE_HASH` | `0x7fa2f464e4ee11ac2c37c4adeb28b0b81c261b1e6a755ca65d159dfb3a60249c` | Keccak-256 del bytecode runtime testnet actual. |
| `CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS` | `0xc2252D797Da294D16b84282d213604b4Bcf6EE09` | Debe coincidir con la variable publica. |
| `CHAIN_INDEXER_REWARDS_DISTRIBUTOR_START_BSC_BLOCK` | `123359171` | Bloque exacto de despliegue. |
| `CHAIN_INDEXER_REWARDS_DISTRIBUTOR_DEPLOYMENT_BSC_BLOCK` | `123359171` | Debe coincidir con el receipt de despliegue y con el start block. |
| `CHAIN_INDEXER_REWARDS_DISTRIBUTOR_DEPLOYMENT_TX_HASH` | `0x5ecf613df4c13ff7d918f072dd7a01e0256fa933a805c14e5074ff5230852639` | Receipt BSC Testnet verificado. |
| `CHAIN_INDEXER_REWARDS_DISTRIBUTOR_RUNTIME_CODE_HASH` | `0x654fa2495a76004361c98bf51a10d5b9e7a50564ca4b89ee9e95af04cb92b4fc` | Keccak-256 del bytecode runtime testnet actual. |
| `CHAIN_INDEXER_BSC_CONFIRMATIONS` | `12` | Gate de finalidad para las proyecciones UKI. |

Cada alias BSC con verificacion de identidad incluido en `CHAIN_INDEXER_CONTRACT_ALIASES` requiere su address y los cuatro campos de identidad (`START_BSC_BLOCK`, `DEPLOYMENT_BSC_BLOCK`, `DEPLOYMENT_TX_HASH` y `RUNTIME_CODE_HASH`). Los dos bloques deben ser iguales; `CHAIN_INDEXER_START_BSC_BLOCK` no sustituye esta evidencia por contrato. Las identidades de `PRESALE` y `REWARDS_DISTRIBUTOR` se contrastaron por RPC el 2026-09-07 a las 23:01 UTC (chain 97, receipt, address, bloque y bytecode runtime). `CHAIN_INDEXER_UKI_TOKEN_ADDRESS` se configura explícitamente en Coolify y no se deriva de `NEXT_PUBLIC_UKI_TOKEN_ADDRESS`.

### Publicador de rewards en staging

`reward-batch-publisher` usa la misma imagen versionada que la Dapp, pero es un
proceso separado. Consume únicamente `reward_accounting_allocations` finales,
prefonda `RewardsDistributor`, publica el batch y ejecuta por separado la
transferencia a tesorería, la reserva única de marketing/desarrollo y la quema.
UKI tiene supply fijo: este proceso materializa la reserva existente, no mintea.

| Variable | Valor staging | Regla |
| --- | --- | --- |
| `REWARD_BATCH_PUBLISHER_ENABLED` | `true` desde el canary controlado del 01-09-2026 | Gate explícito; nunca hereda el gate contable. Antes de activarlo se validaron owner, chain, contratos, base y primer cierre. |
| `REWARD_BATCH_PUBLISHER_EXPECTED_SIGNER_ADDRESS` | owner de `RewardsDistributor` | La clave debe resolver exactamente a esta address y el preflight vuelve a contrastarla on-chain. |
| `REWARD_BATCH_PUBLISHER_PRIVATE_KEY` | secreto Coolify cargado, solo runtime | Solo se inyecta en el contenedor del publicador; no es build arg y no se comparte con Dapp, indexer ni schedulers. |
| `REWARD_BATCH_PUBLISHER_CONFIRMATIONS` | `12` | Cada operación queda firmada de forma durable antes del broadcast y confirmada antes de avanzar. |
| `REWARD_BATCH_CLAIM_WINDOW_SECONDS` | `7776000` | Ventana inicial de 90 días para staging. |

La preparación del borrador no requiere ni acepta autoridad on-chain. Con el
publicador apagado, un operador puede materializar exactamente un cierre
elegible como plan, batch y proofs `previewOnly` mediante:

```bash
REWARD_BATCH_PREPARER_ENABLED=true pnpm staging:rewards:prepare
```

El comando es staging-only, exige BSC Testnet `97`, la base
`cukieshub-new-staging` y `REWARD_BATCH_PUBLISHER_ENABLED=false`. No carga RPC,
signer ni clave privada; no autoriza, firma, publica, transfiere o quema. Los
replays no duplican artifacts. La revisión del plan preparado es una operación
separada de la activación posterior del publicador.

El worker rechaza cualquier entorno que no sea rama `staging`, recurso
`u4s804o4wwcckowgk0woo4wg`, base `cukieshub-new-staging` y BSC Testnet `97`.
El canary aislado del 20-08-2026 desplegó token/distributor temporales, publicó
el batch `0xb0ea3773...1dd7f` (`0x5d44635e...9503`) y reclamó exactamente 10
tokens (`0xa4e92d08...e104`). El 01-09-2026 se verificó también el primer cierre
real de staging contra los contratos UKI activos: `reward-daily:2026-08-21`
quedó `completed`, con 400.000 UKI a tesorería (`0xf9974402...ce57`), 50.000
UKI a marketing/desarrollo (`0x9a23fe1c...c895`) y quema de 50.000 UKI
(`0xd431914c...c377`), los tres receipts con estado `success`.

El indexer no marca un cursor UKI como `verified` por confiar en la configuracion. En cada arranque comprueba chain ID, receipt de despliegue, address, bloque y hash del bytecode runtime; despues sella el checkpoint canonico y la identidad de configuracion en los cursores. `VestingCreated` y `TokensReleased` se guardan en un ledger inmutable y reconstruyen la posicion por wallet/schedule, de modo que un replay repara una escritura parcial sin duplicar importes.

`TOKEN` sigue siendo la fuente legacy verificada de staging y no se modifica. La nueva colección custodiable está desplegada e indexada como `TOKEN_V2`, con address, start/deployment block, transaction hash, runtime code hash y cursores independientes. Los vaults de Cukie Master y Cukie Pool aplican el mismo sellado de identidad. El deployment Coolify `1136` (`2df68a6`) confirmó los 13 cursores de los tres aliases nuevos en chain `97`; los cuatro cursores de `TOKEN` y `UKI_STAKING` conservaron sus direcciones, bloques, estados `verified` y avance sin reset.

### Card worker en staging

`cuki-card-worker` queda fuera del arranque mediante el profile Compose `card-worker`: `COMPOSE_PROFILES` está retirado y `CARD_WORKER_UPLOAD=false`. No se permiten uploads hasta volver a validar y aprobar un destino S3/MinIO exclusivo de staging. Las URLs inmutables de #216, dos regeneraciones con hashes distintos, los headers de cache, el setup y la limpieza completa se validaron el 6 de agosto de 2026; esa evidencia histórica no sustituye el gate actual apagado.

Controles operativos:

1. mantener `CARD_WORKER_UPLOAD=false`; solo puede volver a `true` tras validar de nuevo un destino staging aislado y aprobar expresamente la escritura;
2. validar tras cada deploy el guard `staging-only`, `setup:prod`, `start`, acceso `HeadBucket`, Mongo ping y `restartCount=0`;
3. comprobar que una regeneracion con contenido distinto produce otra URL `<prefix>/<tokenId-base64url>/<sha256>.png` con `Cache-Control: public, max-age=31536000, immutable`;
4. para desactivarlo, cambiar `CARD_WORKER_UPLOAD=false`, retirar `COMPOSE_PROFILES` solo en la app 28 y redesplegar; no modificar la app 12.

## Gates para staging

Antes de considerar staging valido:

- deploy de staging apunta a `staging` o a una release candidate acordada,
- env staging no comparte DB ni secrets con produccion,
- `NEXT_PUBLIC_UKI_CHAIN_ID=97` si hay flujo on-chain,
- contratos testnet y direcciones documentadas si la pantalla los usa,
- smoke test de rutas criticas documentado,
- fallos de lint/typecheck/test documentados si son preexistentes.

### Checklist posterior a la separacion

- [x] Integrar el guardarrail de RPC/chain id de BSC Testnet en `staging` (PR #188, merge `290cc643`).
- [x] Anadir preflight staging-only fail-closed para rama, recurso Coolify, chain, bases y URL de autenticacion antes de arrancar o ejecutar setups.
- [x] Reapuntar el recurso Coolify staging a la rama `staging`.
- [x] Separar los tres namespaces y los cuatro usuarios staging sin reapuntar ninguna base live.
- [x] Completar el cutover de esos namespaces a la instancia fisica exclusiva `cukies-staging-rs0` y validar replica PRIMARY, aislamiento de usuarios y transacciones Economy v2 tras el cambio de URLs.
- [x] Desplegar y financiar un nuevo `VestingVault` y `Presale` en BSC Testnet.
- [x] Ejecutar una compra on-chain smoke de `5 tASM -> 500 UKI` y validar pago, venta y vesting.
- [x] Migrar la verificacion del explorer a Etherscan API V2 y verificar el source de Vault/Presale.
- [x] Crear cuatro usuarios Mongo staging con roles `readWrite` + `dbAdmin` limitados a su unica base.
- [x] Desplegar `UKIStaking` y `RewardsDistributor`, configurar sus cinco cursores y proyectar un smoke completo en Mongo staging (PR #192, merge `c31176ab`).
- [x] Publicar el source de ambos contratos en Sourcify para BSC Testnet con coincidencia exacta de creacion y runtime (`UKIStaking` match `43348012`; `RewardsDistributor` match `43348027`).
- [x] Confirmar el mirror secundario en las paginas publicas de BscScan Testnet: `UKIStaking` y `RewardsDistributor` muestran source verificado con coincidencia exacta, compilador `0.8.28` y 200 runs; no fue necesario obtener ni exponer una API key.
- [x] Configurar HMAC distintas para administracion y juegos en staging y ejecutar dos veces el setup idempotente de economia v2.
- [x] Implementar el ledger global fail-closed de presupuesto diario/acumulado, con fencing, replay por `sourceId` y auditoria de saldos; el runtime no contiene defaults ni activa schedulers (issue #213).
- [x] Reconciliar `500,000 UKI/dia` como presupuesto fijo en staging, `450,000,000 UKI` como techo acumulado, transformaciones semanales sin doble emision y reparto no distribuido 80/10/10 con una unica reserva de marketing y desarrollo.
- [x] Versionar el ruleset exclusivo hasta `staging-test-v4`: reglas de créditos, juego y rewards v4; periodos y entrega de créditos a las 14:00 UTC, cierre UKI/pools a las 16:00 UTC, gracia de catch-up auditable y siete destinos sink `0x97...`; los parámetros equivalentes de producción siguen sin aprobar.
- [x] Implementar un bootstrap atomico `plan/apply` para rewards, competition credits, Treasure Hunt y ranking, con replay idempotente y rechazo de chain, base, recurso, gates o cursores no verificados (PR #226).
- [x] Auditar y cerrar el motor de requisito dinamico: capacidad llena, gracia fija de 48h, proteccion, barrido paginado y cierre de ronda versionado (#61; implementado en PR #209).
- [x] Desplegar `TOKEN_V2` y los dos vaults NFT, añadir sus aliases sin retirar `TOKEN` ni `UKI_STAKING` y verificar 13 cursores nuevos más cuatro conservados en chain `97` (deployment Coolify `1136`, commit `2df68a6`).
- [ ] Ejecutar `pnpm staging:economy:rules:plan` y despues `pnpm staging:economy:rules:apply`; repetir el plan y exigir cuatro acciones `replay`.
- [ ] Ejecutar ticks manuales, de uno en uno y con gates controlados, para Cukie Master, creditos, Game Economy, Cukie Pool y ranking; comprobar fencing, idempotencia, auditoria y ausencia de escrituras fuera de staging.
- [ ] Habilitar como maximo un scheduler, observar al menos dos ciclos y volver a apagarlo antes de avanzar al siguiente.
- [x] Desplegar los seis schedulers economicos con gates independientes y verificar guardas, credencial limitada y ausencia de ejecucion cuando cada gate esta apagado.
- [x] Desplegar `reward-batch-publisher`, cargar por canal secreto la autoridad testnet del owner `0xba84...7820`, verificar que es solo runtime y completar el primer cierre UKI real de staging con tres receipts `success` (`reward-daily:2026-08-21`, 01-09-2026).
- [x] Retirar el card worker del arranque por defecto de staging mediante el profile `card-worker`.
- [x] Provisionar bucket MinIO, hostname publico, prefijo y credenciales exclusivos de staging; validar setup, upload/render real y limpieza completa del fixture.
- [x] Desplegar URLs de card inmutables (#216), repetir dos regeneraciones con hashes distintos, limpiar el fixture y activar el profile `card-worker` solo en la app 28 (PR #217; despliegue 1109).
- [x] Vaciar OAuth social, Pusher, Resend, Telegram e IFTTT en staging; quedan deshabilitados hasta tener destinos exclusivos.
- [x] Completar smoke E2E con una segunda wallet desde la UI: login firmado, cookie segura, BSC Testnet `97`, transacciones bloqueadas, APIs de competicion `200`, registro `1/1` en Mongo staging y `0/0` en la base productiva.
- [x] Rotar preventivamente `STAGING_MONGO_REPLICA_KEY` en una ventana controlada, reiniciar solo la replica staging y repetir health/transacciones sin reutilizar ni cambiar credenciales de produccion.

El siguiente bloqueo NFT es ejecutar desde una wallet QA el smoke firmado approve/deposit/withdraw de Cukie Master y el flujo deposit/request-exit/withdraw del Cukie Pool respetando el corte. Rewards on-chain ya tiene la autoridad testnet exacta del owner y completó el primer cierre UKI real contra los contratos activos; falta observar el drenaje ordenado del backlog y ejecutar un claim de usuario sobre el distributor UKI activo cuando exista el primer cierre con beneficiarios reclamables.

## Gates para produccion

Antes de publicar produccion:

- release candidate validada en staging,
- PR/merge de promocion hacia `main` aprobado,
- tag `prod-*` creado,
- env production revisado por ops,
- contratos mainnet congelados y verificados si la release toca on-chain,
- rollback plan escrito,
- monitorizacion minima activa,
- responsable de guardia definido.

## Rollback

Rollback de app:

1. identificar tag/commit estable anterior,
2. redeploy desde el commit estable anterior de `main` o desde el tag anterior,
3. validar health/smoke,
4. comentar issue de release con hora, commit y motivo.

Rollback de env:

1. restaurar valor anterior en proveedor,
2. redeploy si el proveedor lo requiere,
3. validar ruta afectada,
4. registrar valor logico, no secret.

Contratos:

1. pausar `Presale` o `UKIToken` si aplica,
2. revocar roles si aplica,
3. bloquear UI por env o deploy,
4. reconciliar backend/indexer,
5. no asumir que se puede hacer rollback on-chain.

## Resultado esperado

El equipo integra en `staging`, valida contra BSC Testnet y bases aisladas, y solo promociona a `main` mediante una release aprobada. Produccion no comparte contratos, datos ni secretos con staging.
