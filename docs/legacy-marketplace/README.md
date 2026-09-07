# Legacy Cukies World -> Cukies Hub

Inventario de procedencia, runtime, contratos, datos y migración. Esta ficha es
la fuente de detalle del legado; [antes-del-15-seguimiento.md](../antes-del-15-seguimiento.md)
es la fuente del resumen de lanzamiento y no sustituye los gates de esta ficha.

**Corte auditado:** 2026-09-07. **Modo del inventario:** solo lectura; ese corte
no incluyo migraciones, despliegues, firmas, rotaciones ni cambios en el runtime
legacy. La implementacion local posterior se registra en el seguimiento de
lanzamiento enlazado arriba; no convierte el inventario en prueba de despliegue.

**Estado de migracion: parcial.** El Hub ya tiene indexacion, proyecciones,
importacion parcial de metadata/eventos y worker de cards. Convive con los
workers y APIs antiguos y mantiene lecturas de datos legacy. Se han inventariado
14 contratos, 34 contenedores y 16 instancias de base en tres destinos; faltan
paridad de datos/funciones, custodia acreditada y corte de consumidores.

Fuentes de trabajo auditadas:

- Código legacy: `/Users/fgomezserna/Proyectos/cukies-world`, rama `Development`,
  HEAD `f6ed108682260c8e62844b686a60299843bbd619`.
- Hub: rama `staging`, HEAD `4fcf4ea81553cba74e418b84ea20e6de1e9e1b12` en el
  momento de la auditoría.
- Informes read-only: inventario de contratos y de workers/datos del
  2026-09-07. Las evidencias durables se enlazan al final; no se enlazan
  archivos temporales de `/tmp`.

## Cómo leer los estados

Una capacidad puede estar en estados distintos a la vez. **Código portado**
significa que existe una implementación en el Hub. **Desplegado** significa que
ese código aparece en un recurso live. **Gate activo** significa que una bandera
de runtime permite ejecutar la capacidad. **Paridad** exige reconciliación de
datos y comportamiento con criterios aprobados. **Legacy retirado** exige cero
consumidores, rollback de solo lectura y revocación/rotación de las credenciales
que ya no deban existir. Ningún estado se infiere de otro: un contenedor
`running`, un health check o un test unitario no demuestra paridad ni publicación.

## 1. Contratos y procedencia

El checkout legacy contiene **1 fuente `.sol`**, **16 JSON de ABI** (8 TRON y
8 BSC), **0 artefactos compilados** y **0 scripts de deploy/migration**. La
fuente, `apps/contracts/MarketplaceInGame.sol`, es un contrato aislado
ERC1155/ERC20 y no prueba el origen de los 14 contratos operativos listados
abajo. Después de esa auditoría se recuperaron desde Sourcify APIv2 cuatro
bundles de fuente BSC en `packages/contracts/legacy/bsc/{token,points,staking_points,bridge}`:
TOKEN, POINTS y BRIDGE tienen `exact_match`; STAKING_POINTS tiene `match` con
metadata no exacta. Todos usan `solc 0.5.4` y optimizer 200 según la evidencia.
No se ha ejecutado compilación local. Las direcciones son mainnet legacy y se
conservan en el registro canónico [`contracts.json`](contracts.json); fixtures,
`TOKEN_V2` y chain 97 no son direcciones de este inventario.

Los ABI originales se conservan como referencia en el checkout legacy; el Hub
consume los ABI normalizados bajo `dapp/src/lib/legacy-marketplace/abis` y sus
adaptadores. El material de contrato que se incorpore al monorepo debe quedar en
`packages/contracts/legacy/{bsc,tron,reference}/`, fuera de
`packages/contracts/contracts` y de su compilación Hardhat 0.8.28. No se deben
copiar ABI a otra ruta consumidora.

### TRON mainnet

| Rol | Address canónica | Evidencia disponible | Consumidor/destino | Estado y hueco |
| --- | --- | --- | --- | --- |
| MINT | `TUrjiyFSa1pq8TGZJnsTAHcgyxnnRmZjN7` | Código desplegado, ABI y `owner()` observados live; source verificado no acreditado | `legacy-marketplace` y adaptador TRON | Deploy tx/source reproducible pendientes |
| TOKEN (NFT) | `TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe` | Código, ABI, `owner()` y code hash live; source TRON no verificado | Marketplace, staking, breeding, bridge; indexer/card worker | Lecturas portadas parcialmente; supply/owners/eventos por reconciliar |
| REFERRALS | `TZ4QM9RF1pxfoxnPY8UGAQEEwq5SDoZXk4` | Código desplegado, ABI y `owner()` observados live; source verificado no acreditado | Adaptador legacy | Modelo de tres niveles no se migra automáticamente |
| POINTS | `TWwNJEySYrkNXTpDBF7WfGwkoW4YTZ4yKA` | Código desplegado, ABI y `owner()` observados live; source TRON no verificado | Indexer y adaptadores legacy | Balances e historia por reconciliar |
| STAKING_POINTS | `TUfbQaVERA1TmT31LU3HWJS6xsW3B8VfUY` | Código desplegado, ABI y `owner()` observados live; source TRON no verificado | Adaptador legacy | Separar de UKI staking nuevo; posiciones por reconciliar |
| BREEDING_POINTS | `TXrvQKgzWpsMkp9ebiF1uXNPRgKxNanB9S` | Código desplegado, ABI y `owner()` observados live; source TRON no verificado | Adaptador legacy | Padres, hijos y eventos por reconciliar |
| MARKETPLACE | `TWDoJEq4eVd9vUgQ6f5knjqouRBPyGDzSB` | Código desplegado, ABI y `owner()` observados live; source TRON no verificado | Lecturas marketplace/bridge | No es `CukiesMarketplace.sol` nuevo |
| BRIDGE | `TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ` | Código desplegado, ABI y `owner()` observados live; source TRON no verificado | Bridge runtime/relayer como identidad mainnet | Custodia y origen por acreditar |

### BSC mainnet (chain 56)

| Rol | Address canónica | Evidencia disponible | Consumidor/destino | Estado y hueco |
| --- | --- | --- | --- | --- |
| TOKEN (NFT) | `0x0dbDeBCC62f11005BF434ABFad74564E896aC861` | Código live; Sourcify `exact_match`; deploy tx/bloque/deployer registrados | Marketplace, staking, breeding, bridge | Bundle recuperado; separar de fixtures Stage y `TOKEN_V2`; reconciliar ownership |
| POINTS | `0x6875F0C9547c35F7EE700230FE8B9A7687F3ddB2` | Código live; Sourcify `exact_match`; deploy tx/bloque/deployer registrados | Indexer y adaptadores legacy | Bundle recuperado; balances/eventos por reconciliar |
| STAKING_POINTS | `0xF381bfB59A2ae9623eFBce2C83AafF60f783cc6F` | Código live; Sourcify `match` (metadata no exacta); deploy tx/bloque/deployer registrados | Adaptador legacy | Bundle recuperado; separar de `UKIStaking` nuevo |
| BREEDING_POINTS | `0x39Be8C4FA342C5f3C10d7c16941A0946D29Ade4A` | Código live y owner observados; source Sourcify no encontrado | Adaptador legacy | Deploy tx/source reproducible pendientes; relaciones e historial por reconciliar |
| MARKETPLACE | `0x2C291aD4C491aCA75Fb3fb5a17465bBC871FBF91` | Código live y owner observados; source Sourcify no encontrado | Lecturas marketplace legacy | Deploy tx/source reproducible pendientes; no reutilizar para marketplace UKI |
| BRIDGE | `0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E` | Código live; Sourcify `exact_match`; deploy tx/bloque/deployer registrados | `packages/cukies-bridge-relayer` y bridge runtime | Bundle recuperado; no usar en chain 97; custodia y retirada pendientes |

El owner BSC observado live el 2026-09-07 es
`0x7894df8379c2e156f0e4d9df0829127d605bd52b` para los seis contratos BSC. En
TRON, `owner()` live confirmó tres grupos: MINT/TOKEN/REFERRALS ->
`TJUqscjJxgnPq7S3YgLVZjGhbW7iPjfX4G`; POINTS/STAKING_POINTS/BREEDING_POINTS ->
`THESbAsrsX8JfRiYm7P1Kupcs1i7JaB1cM`; MARKETPLACE/BRIDGE ->
`TKAR18UKjMQzBkZLoiViUeYWKTft8Sz3k2`. Estos owners observados no acreditan
custodia de las claves. Hay deploy tx/bloque/deployer registrados para los cuatro
bundles BSC recuperados; BREEDING_POINTS y MARKETPLACE BSC siguen sin source
Sourcify encontrado. No se ha ejecutado compilación local. En el bloque BSC
`120535004` se calcularon los hashes de runtime de los seis contratos; los
cuatro bundles recuperados coinciden con el bytecode on-chain registrado por
Sourcify. Esto no sustituye la auditoria funcional ni de seguridad.

## 2. Custodia y secretos: solo presencia

Se documentan nombres y ubicaciones, nunca valores. La presencia histórica o
actual de una variable no demuestra vigencia, pero bloquea la reutilización hasta
rotar/revocar y acreditar custodio.

| Rol | Presencia observada | Custodio/falta | Gate antes de reutilizar |
| --- | --- | --- | --- |
| Owner/admin BSC | `BSC_ADMIN_WALLETS`, `NX_BSC_ADMIN_WALLETS` en environments legacy | EOA observada; custodio de la clave no probado | Rotación a wallet segura/multisig y prueba de control |
| Owner/admin TRON | `TRON_ADMIN_WALLETS`, `NX_TRON_ADMIN_WALLETS` | Tres owners on-chain identificados; custodios de las claves sin acreditar | Relacionar cada firmante con sus roles y resolver la rotacion antes de operar |
| Signer sync BSC | `ethers.Wallet`/private key en `apps/backend/sync/utils/bscLib.js` | Clave histórica presente en fuente legacy | Revocar/rotar; no copiar al Hub |
| Signer sync TRON | `privateKey` en `apps/backend/sync/utils/tronLib.js` | Clave histórica presente en fuente legacy | Revocar/rotar; no copiar al Hub |
| Fallback signer frontend BSC | `NX_SHARED_BSC_PRIVATE_KEY` en hook legacy | Clave referenciada desde frontend | Retirar y rotar |
| Fallback/API TRON frontend | `TronWeb` fallback y credenciales de proveedor | Vigencia/custodio no probado | Retirar y rotar |
| RPC, S3, auth y aplicación | Nombres en `.env`, producers, sync/cards, Docker/CI | Valores y custodios no inventariados en esta pasada | Rotación, mínimo privilegio y scanner de historial/imagen |

En live solo se registraron nombres de variables como `NEXTAUTH_SECRET`,
`AUTH_SECRET`, `AWS_SECRET_ACCESS_KEY`, HMAC de economía/competición y
`REWARD_BATCH_PUBLISHER_PRIVATE_KEY`; sus valores no forman parte de esta
documentación. La consulta de producción que observa `NX_MONGO_URL` es una
**configuración observada**: por sí sola no prueba qué URI usa la imagen que
sirve el runtime ni acredita procedencia de código. La guía antigua contiene
credenciales en claro; se trata como hallazgo para rotación y el issue #160,
nunca como secreto vigente.

## 3. Workers, APIs y destino

| Fuente legacy | Equivalente Hub | Estado auditado | Gate/paridad pendiente |
| --- | --- | --- | --- |
| `producer/{bsc,tron}` listeners y Bull | `packages/chain-indexer/src/chains`, `normalize`, `projectors` | Código portado parcial | Comparar todos los eventos/senders, cursors y efectos antes de parar producer |
| `consumer` + `senders-manager` | projectors transaccionales, `storage/mongo`, dead letters | Código portado parcial | No existe colección `completedEvents` equivalente; reconciliar estados |
| `sync/getter`, `setter`, handlers | `chain-indexer` ingest/import/project | Importador parcial | Eventos no reconocidos y estado `processing` no quedan equivalentes; replay idempotente pendiente |
| `cards`/`sync/cards.js` Bull | `packages/cuki-card-worker` con locks Mongo y objetos content-addressed | Código portado; contenedor Hub observado live | Verificar jobs, assets y paridad de imágenes; `running` no demuestra despliegue funcional |
| `auth` REST (`/login/*`) | NextAuth, challenge/wallet y `user-sync` | Código portado parcial | Migrar identidad mínima; excluir passwords, tokens, sesiones, blacklist y privilegios |
| `data-graphql` | APIs Hub `legacy-marketplace` y lecturas locales | Referencia/parcial; GraphQL legacy sigue runtime | Cero consumidores GraphQL y reconciliación de home/detalle/puntos |
| `data-rest` | Rutas Next.js e indexer | Parcial; no equivalencia 1:1 | Inventariar consumidores y retirar CRUD/mutaciones no necesarios |
| `dashboard_cache` cron diario | Sin scheduler Hub equivalente identificado | Sin paridad verificada | Decidir reemplazo funcional o retirar tras criterio de producto |
| `game`, `matchmaking`, `commander` | Sesiones/resultados/quests Hub solo cubren parte | Referencia, sin port directo de schemas | Censo funcional y criterio de salida antes del corte |
| `learn`, `ludo` y `learn-bot` | Sin equivalente Hub identificado | Referencia, no descartado | Censo de rutas, datos y usuarios antes de retirar |

Se reutilizan `packages/chain-indexer/src/legacy` para import/reconcile,
`packages/cuki-card-worker`, `packages/cukies-bridge-relayer` y las APIs propias
del Hub. No se recrean Bull, producers, consumers ni el backend Nx como nueva
autoridad.

### Frontera del worker legacy acordada

Diseno en preparacion; esta seccion no acredita un servicio desplegado.
`legacy-chain-indexer` reutilizara el motor del Hub para leer los 14 contratos
canonicos de `contracts.json`: BSC 56 y TRON mainnet tanto en Stage como en
produccion. Usara un perfil Compose propio, sin dominio publico, firmantes ni
operaciones on-chain. El relayer que completa transfers es una responsabilidad
distinta y no debe duplicar envios contra los mismos contratos.

| Frontera | Stage | Produccion |
| --- | --- | --- |
| Contratos legacy | Los existentes BSC 56/TRON mainnet | Los mismos contratos |
| Base dedicada propuesta | `cukies-legacy-indexer-staging` | `cukies-legacy-indexer` |
| Contratos nuevos | Deployments de testnet | Deployments propios de mainnet |
| Cursores y credenciales | Exclusivos de Stage | Exclusivos de produccion |

La configuracion legacy sera explicita y no heredara la URI, RPC, addresses o
checkpoints del indexer de economia. Las bases dedicadas evitan prefijos
redundantes en las colecciones. Dentro de cada base, NFTs/listings se identifican
por red, coleccion NFT canonica y tokenId; el address emisor de staking, breeding
o marketplace no sustituye al address de esa coleccion. Los puntos incorporan
red, contrato POINTS y wallet. Un mismo tokenId en TRON y BSC debe conservar dos
estados independientes. La ingesta legacy no genera outbox de economia nueva,
creditos ni rewards.

Antes de arrancar la ingesta en Stage: verificar identidad y red de cada fuente,
fijar el inicio historico y probar backfill/replay sin duplicados. Durante la
ingesta se comparan estados con contratos y datos legacy y se registran cursores
y discrepancias; los consumidores se cambian solo tras reconciliar. Una ABI
cubierta solo acredita que se reconocen sus eventos; no acredita paridad de datos
ni una UX operativa.

Para los contratos existentes, la prueba de fuente puede acreditar address
canonica, red y hash de runtime observado sin afirmar un deploy reproducible.
Debe quedar identificada como `legacy-existing`, con su procedencia y checkpoint;
no se inventan transacciones o bloques de despliegue. La cobertura historica se
registra aparte. Esta modalidad no sustituye el bootstrap de identidad exigido a
los contratos nuevos. La evidencia actual acredita runtime de los seis contratos
BSC, pero solo cuatro tienen deploy tx/bloque registrados; en TRON el `codeHash`
observado por el proveedor tampoco equivale a codigo fuente verificado.

### Activacion Stage y criterios de reconciliacion

El primer destino es exclusivamente Coolify app `28`, UUID
`u4s804o4wwcckowgk0woo4wg`, rama `staging`. El perfil Compose
`legacy-indexer` se anade a los perfiles ya activos, conservandolos. El
servicio `legacy-chain-indexer` requiere `CUKIES_LEGACY_INDEXER_ENABLED=true`
y credenciales Mongo limitadas a `cukies-legacy-indexer-staging`. La URI debe
nombrar esa misma base. La configuracion concreta se revisa con el SHA de la PR
antes del merge; no se copia un entorno completo desde el runtime antiguo.

Destino comprobado por SSH el 2026-09-07: el Mongo exclusivo de Stage anuncia
`cukies-hub-staging-mongo-u4s804o4wwcckowgk0woo4wg:27017` en la red `coolify`,
replica set `cukies-staging-rs0`, `isWritablePrimary=true`. Ese hostname y
`replicaSet=cukies-staging-rs0` forman la parte publica de la URI propuesta; la
base y su usuario dedicado se provisionan para este worker. Esta lectura de
`hello` no ha creado bases, usuarios ni un servicio nuevo.

| Parametro | Valor o criterio de Stage |
| --- | --- |
| `APP_ENV` / `STAGING_ONLY_GUARD` | `staging` / `true` |
| `COOLIFY_BRANCH` / `COOLIFY_RESOURCE_UUID` | `staging` / UUID de app 28 |
| `CUKIES_SERVICE` | `legacy-chain-indexer` |
| `CUKIES_LEGACY_INDEXER_DB_NAME` | `cukies-legacy-indexer-staging` |
| `CUKIES_LEGACY_INDEXER_MONGO_URL` | Secreto exclusivo de esa base en Coolify; nunca versionado |
| `CUKIES_LEGACY_BSC_CHAIN_ID` / `CUKIES_LEGACY_BSC_RPC_URLS` | `56` / proveedores mainnet capaces de servir el historico elegido |
| `CUKIES_LEGACY_TRON_NETWORK` / `CUKIES_LEGACY_TRON_API_BASE_URL` | `mainnet` / API mainnet con eventos historicos; credencial opcional exclusiva |
| `CUKIES_LEGACY_BSC_START_BLOCK` | Inicio explicito; `0` significa historia completa en el worker dedicado, no empezar desde el head |
| `CUKIES_LEGACY_TRON_START_TIMESTAMP_MS` | Inicio explicito; `0` evita asumir una fecha de despliegue no acreditada |

El inicio completo es conservador y no garantiza terminar antes del 15. Se debe
medir el avance real por contrato/evento, limites RPC y errores 429, ajustar rango
y frecuencia de lectura, y registrar una estimacion de duracion observada. No se
acorta el historico silenciosamente para aparentar que el worker esta al dia.
Una importacion de `processedEvents` puede acelerar la migracion, pero requiere
comprobar identidad, eventos ausentes y checkpoint de cada fuente antes de usarla
como cobertura. El `setup` de una base vacia no demuestra backfill.

La reconciliacion se registra por familia en esta ficha, junto a la evidencia
fechada, con estos criterios:

| Familia | Comparacion necesaria para cambiar consumidores |
| --- | --- |
| NFT y cards | Inventario, owner actual, metadata/atributos y URL de card; identidad red + coleccion + tokenId; muestras de wallets y recuentos completos |
| Marketplace | Ordenes activas, precio, moneda, vendedor y estado terminal frente a contratos; legacy y UKI se reconcilian por separado antes de agregarlos en UI |
| Cukie Points y staking | Ledger mint/burn, saldo por wallet, posiciones stake/unstake y puntos pendientes calculados por contrato; sin convertirlos automaticamente en creditos nuevos |
| Breeding | Cada ciclo start/finish, padres/hijos y operaciones pendientes; replay sin duplicados ni mezcla entre ciclos |
| Bridge | Solicitudes, completados y huerfanos; contrato/ruta/coleccion/token/owner; legacy y endpoint v2 mantienen protocolos distintos |
| Administracion y ERC20 | Roles, permisos, pausas, cambios de owner/configuracion y ledger UKI; auditables sin generar rewards ni balances internos |

El gate para UX es: fuentes verificadas, cobertura historica explicita, cero
errores criticos sin explicar y diferencias de datos resueltas o visibles como
limitacion de producto. La posterior retirada exige ademas cero consumidores del
repo y servicios antiguos. El rollback de esta primera activacion consiste en
detener solo `legacy-chain-indexer` y conservar su base/cursores para diagnostico;
la dapp y los workers actuales siguen con sus fuentes hasta superar el gate.

### Runtime live observado

El inventario live del 2026-09-07 observó **34 contenedores, todos `running`**,
en recursos Stage, producción Hub y servicios legacy. El censo de servicios es:

| Grupo | Servicios observados | Lectura del estado |
| --- | --- | --- |
| Hub Stage | `dapp` (1), `chain-indexer` (1), `staging-mongo` (1), `cuki-card-worker` (1), `cukie-master-scheduler`, `competition-credit-scheduler`, `game-economy-scheduler`, `cukie-pool-scheduler`, `reward-accounting-scheduler`, `reward-batch-publisher`, `weekly-ranking-scheduler` | Desplegado observado; gates individuales siguen mandando. Stage chain 97, commit observado `d4bc3727b18aa9161f9da43cf0c543e02c2ee1e4`; no equivale a paridad legacy |
| Hub producción | `dapp` (1), `chain-indexer` (1) | Desplegado observado en commit `fb2b19023e7edd824bc6eb86dc5409025cc3ee1e`; producción mantiene `CUKIES_DATABASE_URL` según configuración observada |
| Legacy producción/staging | `mongodb` (1), `marketplace` (2), `auth-api` (2), `data-graphql-api` (2), `data-rest-api` (2), `data-rest-learn-api` (2), `data-rest-ludo-api` (2), `game-api` (2), `matchmaking-api` (1), `learn-bot-worker` (1), `getter-bsc-worker` (1), `getter-tron-worker` (1), `setter-worker` (1), `cards-worker` (1) | Live y `running` observado; sigue dentro del inventario y no se puede declarar retirado por estar portado el código |

Los gates Stage observados incluyen chain 97,
`COMPETITION_CREDITS_RUNTIME_ENABLED=true`,
`CHAIN_INDEXER_CUKIE_MASTER_ENABLED=true`, `CARD_WORKER_UPLOAD=true` y
`TREASURE_HUNT_COMPETITION_ENABLED=true`; economía, rewards, pool, ranking y
bridge aparecen desactivados según la variable concreta. Esto describe
configuración live, no aprobación de producto ni paridad.

## 4. Bases y colecciones reales

Los conteos principales de esta sección son metadatos, no un snapshot reconciliado ni
prueban igualdad de contenido: las lecturas LXC usan
`estimatedDocumentCount` y la copia Docker usa `collStats.count`. Las tres vistas
Docker se identifican con su `viewOn` y se cuentan por agregacion, porque no
admiten `collStats`; no se exportan sus documentos. La evidencia
durable reúne **16 instancias de base y 630 entradas de colección/vista** en tres
destinos/capturas, con lecturas autenticadas completadas. En `cukies-hub-staging`
se observaron `User` 335, `UserWallet` 336 y `GameSession` 5.759. El store
`cukieshub-new-staging` contiene 18 fixtures de Stage en aislamiento; no se debe
comparar ese fixture con main como si fuera una paridad o una migración fallida.

### Producción observada

| Base | Colecciones clave y conteo estimado | Destino/estado |
| --- | --- | --- |
| `cukies` | `cukies` 17.464; `processedEvents` 191.607; `completedEvents` 119.441; `tx_nfts` 25.662; `points` 23.515; `wallets` 4.328; `users` 1.337; `originals` 12.100; `txMarketplace` 9.240; `blockTimestamps` 15.781; `settings` 36; `txLottery` 98; `config` 1 | Mongo legacy; importar/reconciliar por colección, nunca copiar sesiones/secretos |
| `cukieshub-new` | `chain_events` 41.826; `tx_nfts` 15.395; `cukies` 17.464; `point_transactions` 3.494; `chain_cursors` 21; `card_generation_jobs` 5 | Store Hub; paridad y diferencias contra legacy abiertas |
| `cukies-hub` | `User` 484; `UserWallet` 488; `GameSession` 18.916; `GameResult` 420; `GameCheckpoint` 8.179; `PointTransaction` 268 | Identidad y juego del Hub, separados de los modelos legacy y de `cukieshub-new` |
| `cukies-staging` | `cukies` 17.459; `tx_nfts` 22.886; `users` 1.292; `wallets` 3.662; `txPoints` 37.844; `points` 15.309; `originals` 12.100; `completedEvents` 119.441; `txMarketplace` 9.240; `txLottery` 98 | Base observada en captura de producción; no asumir que sea Stage canónico |
| `cukies-game`, `cukies-learn` | Instancias registradas; `cukies-learn.users` 32, `games` 13.460, `coin_movements` 646, `point_movements` 173, `token_movements` 69, `credit_movements` 17, `meme_movements` 140; `cukies-game` tiene 11 colecciones registradas | Censo funcional antes de retirada |

### Stage observado

| Base | Colecciones clave y conteo estimado | Destino/estado |
| --- | --- | --- |
| `cukies-legacy-staging` | `cukies` 17.464; `processedEvents` 191.607; `completedEvents` 119.441; `tx_nfts` 25.662; `points` 23.515; `wallets` 4.319; `users` 1.337; `originals` 12.100; `txMarketplace` 9.240; `blockTimestamps` 15.781; `settings` 36; `txLottery` 98; `config` 1 | Fuente legacy Stage; no es evidencia de paridad con producción ni autorización de mutación |
| `cukieshub-new-staging` | `chain_events` 116; `tx_nfts` 24; `cukies` 18; `chain_cursors` 29; `point_transactions` 0; `card_generation_jobs` 0 | Fixture aislado de Stage; probar sus invariantes propias, sin usarlo como comparación de paridad con main |
| `cukies-hub-staging` | `User` 335; `UserWallet` 336; `GameSession` 5.759; `TreasureHuntMultiplayerMatch` 0 | Lectura autenticada completa; destino Hub Stage |
| `cukies-game-staging`, `cukies-learn-staging` | 16 y 26 entradas de colección registradas respectivamente en la captura durable | Mantener en alcance; no borrar ni excluir antes de criterio funcional |

### Copia Docker legacy observada en paralelo

La captura `legacy-container-copy` procede del contenedor `cukies-mongodb` en
`192.168.1.201` y es distinta del LXC `192.168.1.221`. Sus nombres de base se
solapan con producción, pero sus conteos difieren: por ejemplo, `cukies` tiene
17.464 `cukies`, 191.521 `processedEvents`, 25.606 `tx_nfts`, 23.505 `points`,
1.341 `users` y 4.324 `wallets`. También registra `cukies` con 40 colecciones,
`cukies-game` con 11, `cukies-game-staging` con 16, `cukies-learn` con 28 y
`cukies-staging` con 51. No se deben fusionar, declarar equivalentes ni retirar
esta copia hasta acreditar consumidores, escrituras y cutoff.

El hecho de que `cukies` legacy tenga 17.464 documentos en dos capturas no
prueba igualdad de contenido. Del mismo modo, `processedEvents` 191.607 frente
a `chain_events` 41.826, o `tx_nfts` 25.662 frente a 15.395, no son relaciones
1:1 sin una reconciliación por identidad, red, evento, token y estado.

### Modelos y destino de reconciliación

| Legacy | Destino Hub | Estado |
| --- | --- | --- |
| `processedEvents`, `completedEvents`, `settings`, `blockTimestamps` | `chain_events`, `chain_dead_letters`, `chain_cursors`, timestamps normalizados | Parcial; estados y eventos no reconocidos pendientes |
| `cukies`, `originals` | `cukies` con identidad `chainId + collection + tokenId` | Metadata/estado parcial; originales pendientes |
| `tx_nfts` | `tx_nfts` con `eventId` único | Parcial; campos y semántica por reconciliar |
| `points`, `tx_points` | `point_balances`, `point_transactions` | Parcial; no confundir con puntos Prisma de quests/games |
| `users`, `wallets`, `referrals` | `User`, `UserWallet` y reglas Hub | Parcial y bajo demanda; no importar credenciales heredadas |
| `txMarketplace`, `txLottery`, `dashboard_cache`, `config` | Sin equivalente confirmado | Solo referencia hasta criterio funcional |

### Censo game, matchmaking, learn y ludo

Este bloque sigue dentro del alcance de legado indicado por producto. No se
descarta ni se mueve fuera del corte ANTES DEL 15 sin un criterio funcional
explícito, consumidor identificado y criterio de salida aprobado.

| Área | Servicios/DB | Datos observados | Estado |
| --- | --- | --- | --- |
| Game | `game-api`, `cukies-game`, `cukies-game-staging` | `building`, `crafting`, `cuki-mission`, `inventory`, `item`, `map`, `mission`, `missionGroup`, `missionStep`, `resource`, `resourceMap`, `tile`, `userMap`, `movement`, `stats` | Sin equivalente 1:1; censo y paridad funcional pendientes |
| Matchmaking | `matchmaking-api`; `cukies-game*` | Sesiones/colas y configuración runtime legacy | Sin port directo identificado; no retirar sin pruebas de consumidores |
| Learn | `data-rest-learn-api`, `learn-bot-worker`; `cukies-learn*` | Usuarios, rutas REST y contenido learn | Referencia viva; autorización y uso por verificar |
| Ludo | `data-rest-ludo-api`; `cukies-learn*` | Rutas REST ludo y datos compartidos learn | Referencia viva; definir contrato funcional antes de retirar |

## 5. Fases y criterios de salida

La decision de producto del 2026-09-07 fija la reutilizacion de los contratos
legacy mainnet tambien desde Stage, sin redeploys testnet. El orden vigente es
eventos completos (incluido breeding) y workers aislados -> reconciliacion ->
UX funcional con marketplace Legacy/UKI conjunto -> sidebar/menu/dashboard.
Las reglas viven en [reglas operativas](../uki-current-operating-rules.md#contratos-legacy-eventos-y-convivencia-decision-del-2026-09-07)
y el estado se actualiza en [seguimiento](../antes-del-15-seguimiento.md).
Los contratos nuevos si tienen deployments distintos por entorno. La
autorizacion de implementar no significa que los workers ya esten activados.

| Fase | Trabajo | Criterio de salida verificable |
| --- | --- | --- |
| P0 Inventario | Congelar manifests, addresses, fuentes, custodias, 34 contenedores y bases; registrar owners sin valores secretos | Evidencias durables de contracts/runtime/databases; cada pieza tiene destino y bloqueo; cero secretos en docs |
| P1 Eventos y workers | Completar el catalogo ABI legacy/nuevo, ingesta, proyecciones y auditoria de approvals/admin; incluir breeding y correlacion de bridge. Worker legacy dedicado con destino Stage separado | Cobertura ABI automatizada, replay idempotente, fechas/identidades preservadas, ningun evento desconocido descartado y guards de fuente/destino verificados |
| P2 Datos y paridad Stage | Importadores reanudables de metadata, eventos, `tx_nfts`, points, users/wallets/referrals, originals y assets; dry-run antes de backfill acotado | Manifest por coleccion con origen/version/checkpoint; divergencias y huerfanos explicados por cadena/contrato/token/wallet; worker activo y observado tras reinicio |
| P3 UX funcional | Marketplace conjunto Legacy/UKI, filtros historicos activos y acciones; bridge, puntos/staking y breeding completos; despues navegacion/dashboard. Conservar game/matchmaking/learn/ludo en su censo funcional | Flujos escritorio/movil, estados degradados y red/contrato exactos; las tarjetas legacy se identifican sin separar el catalogo en dos productos excluyentes |
| P4 Corte | Cambiar consumidores por slice, validar auth/ownership/assets y observar egress. Los contratos legacy siguen donde estan desplegados | Cero llamadas del slice al GraphQL/auth/Mongo antiguo; rollback de consumidores documentado; no se detienen contratos on-chain por retirar el repo |
| P5 Retirada | Detener workers antiguos por servicio, rotar/revocar credenciales, mantener evidencia y soporte minimo | Cero consumidores y conexiones a los servicios sustituidos; health/smoke del Hub; solo entonces declarar `legacy retirado` |

Puntos Cukie Points y crías tienen además el corte de producto del seguimiento
ANTES DEL 15: exportar claimed/pending y conservar historial/Originales con
cutoff aprobado. No se convierten automáticamente a créditos ni se pausan
contratos sin autorización explícita.

## 6. Evidencia y referencias durables

- [Runtime live 2026-09-07](evidence/2026-09-07-runtime.json): 34 contenedores,
  imagen/commit observado, DB targets, gates y presencia nominal de secretos.
- [Databases 2026-09-07](evidence/2026-09-07-databases.json): bases,
  colecciones y conteos `estimatedDocumentCount`, con el método documentado.
- [Contracts 2026-09-07](evidence/2026-09-07-contracts.json): addresses
  canónicas, código/owners live de las 14 direcciones, cuatro bundles BSC
  recuperados desde Sourcify APIv2, deploy tx/bloque/deployer y huecos de
  procedencia.
- [`packages/contracts/legacy/README.md`](../../packages/contracts/legacy/README.md):
  namespace y reglas para material legacy fuera del árbol compilable.
- [`TRACKERS_AUDIT.md`](TRACKERS_AUDIT.md): divergencias históricas de shapes,
  timestamps, duplicados y handlers; sigue siendo referencia técnica, no una
  autorización de corte.

## Regla de retirada

El repositorio/API legacy quedan como material de auditoría, contención, lectura,
importación y reconciliación. Toda funcionalidad necesaria debe existir en el
Hub con APIs, autenticación, modelos, indexación y tests propios. No se añaden
nuevas llamadas a GraphQL/auth legacy, no se copian claves privadas y no se
declara migración terminada mientras falte paridad o exista un consumidor live.
