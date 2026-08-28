# UKI deployment environments

Estado: topologia activa y checklist operativo.
Issue: #166 `UKI-090.4`.
Fecha de ultima comprobacion: 2026-08-05.

## Decision

Usamos dos carriles separados:

- `staging` -> staging/integracion sobre BSC Testnet y bases staging.
- `main` -> live actual sobre `cukies.world`.

Los cambios se validan primero en `staging`. El paso a `main` requiere una promocion controlada y no debe arrastrar variables, contratos ni datos de testnet.

La estrategia de tags recomendada es:

- `staging-YYYYMMDD.N` para candidatos validados en staging si hace falta fijar un punto.
- `prod-YYYYMMDD.N` para lo que se publica en produccion.

Las ramas `release/staging-YYYY-MM-DD` son opcionales y se usan solo cuando `staging` sigue avanzando mientras una release se estabiliza.

## Estado actual observado

- Staging/integracion: Coolify app `game-hub-staging`, application ID `28`, UUID `u4s804o4wwcckowgk0woo4wg`, rama `staging`, URL `https://cukieshub.eurekand.com`.
- El iframe Treasure Hunt de staging se despliega como recurso Coolify independiente `game-treasurehunt-staging` (application ID `31`, UUID `lc04cw8gs4koo4swwws0c4ss`) desde la misma rama y se publica bajo `https://cukieshub.eurekand.com/treasurehunt-game`, con `NEXT_PUBLIC_GAME_BASE_PATH=/treasurehunt-game` y `NEXT_PUBLIC_DAPP_ORIGIN=https://cukieshub.eurekand.com`.
- Live actual: Coolify app `game-hub`, application ID `12`, UUID `jookw8ow8woks088s44404ok`, rama `main`, URL `https://cukies.world`.
- Ambos recursos usan `docker-compose.coolify.yml`; solo `dapp` se publica mediante Traefik.
- Staging usa BSC Testnet (`97`) y la preventa `0xC0d7b04AC4DFCCc28790FD492FCB3CB16AcDfcdA`.
- Staging usa `UKIStaking` `0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205` (bloque `123359165`, tx `0xc09b84077e97fe32b198ed99f1a56829ccc60c1dbe401e7bb20b66983ddc670e`) y `RewardsDistributor` `0xc2252D797Da294D16b84282d213604b4Bcf6EE09` (bloque `123359171`, tx `0x5ecf613df4c13ff7d918f072dd7a01e0256fa933a805c14e5074ff5230852639`). Ambos apuntan al UKI testnet existente y tienen source publico con coincidencia exacta en Sourcify y BscScan Testnet.
- Verificacion publica: [UKIStaking en Sourcify](https://repo.sourcify.dev/97/0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205), [RewardsDistributor en Sourcify](https://repo.sourcify.dev/97/0xc2252D797Da294D16b84282d213604b4Bcf6EE09), [UKIStaking en BscScan Testnet](https://testnet.bscscan.com/address/0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205#code) y [RewardsDistributor en BscScan Testnet](https://testnet.bscscan.com/address/0xc2252D797Da294D16b84282d213604b4Bcf6EE09#code). BscScan muestra `Source Code Verified`, `Exact Match`, Solidity `v0.8.28+commit.7893614a` y optimizacion de 200 runs para ambos contratos (comprobado el 6 de agosto de 2026).
- El smoke `STAGING_SMOKE_C31176A_2026_08_05` movio temporalmente `1 UKI` por contrato y termino con staking, reservas y balance del distribuidor a cero. No representa una cifra de producto.
- Staging usa las bases logicas `cukies-hub-staging`, `cukies-legacy-staging` y `cukieshub-new-staging`. El cutover a la instancia fisica exclusiva `cukies-staging-rs0` se prepara en dos despliegues para no apuntar la aplicacion a una replica a medio inicializar.
- Produccion conserva BSC mainnet y sus bases de produccion; no se han reapuntado durante esta separacion.
- La VM Coolify/Traefik observada es `1001` (`192.168.1.201`) y publica Traefik en `80/443`.
- Cloudflare Tunnel ya tiene ruta para `cukieshub.eurekand.com` hacia `https://192.168.1.201:443`.

## Topologia objetivo

| Entorno | Rama/ref | Hosting | Chain | Datos | Uso |
| --- | --- | --- | --- | --- | --- |
| Local | Cualquier rama local | Maquina local | Hardhat/local o testnet puntual | Dev/local | Implementacion rapida. |
| Preview PR | Branch del PR | Coolify preview si se habilita | Sin valor real | Datos aislados o mocks | Revision visual/tecnica. |
| Staging | `staging` | Coolify `game-hub-staging` | BSC testnet | DB staging | QA integrada. |
| Production | `main` + tag `prod-*` | Coolify `game-hub` | BSC mainnet | DB production | Usuarios reales. |

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

El proveedor activo observado es Coolify. `cukieshub.eurekand.com` sigue `staging`; `cukies.world` sigue `main`.

Trabajo pendiente en Coolify:

- completar el cutover desde las bases logicas staging del host compartido a `cukies-staging-rs0`, sin leer ni escribir las bases live,
- sustituir las integraciones externas deshabilitadas por credenciales realmente exclusivas cuando QA las necesite,
- mantener los seis schedulers economicos y el publicador de batches desplegados con gates independientes,
- documentar rollback por commit y por variables para cada promocion a `main`.

Nada de esto debe usar secrets en el repo.

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
- rama real inyectada por Coolify `COOLIFY_BRANCH=staging`;
- UUID real del recurso `u4s804o4wwcckowgk0woo4wg` (app `28`);
- BSC Testnet `97` tanto en la dapp como en el indexer;
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

### Mongo fisico exclusivo de staging

El servicio `staging-mongo` del compose crea un replica set de un solo nodo llamado `cukies-staging-rs0`, sin puerto publico y con volumenes exclusivos de la app Coolify `28`. Su entrypoint falla cerrado salvo que coincidan `APP_ENV=staging`, `STAGING_ONLY_GUARD=true` y el UUID `u4s804o4wwcckowgk0woo4wg`.

El cutover se hace siempre en dos despliegues:

1. desplegar `staging-mongo` manteniendo las cuatro URLs de aplicacion en el origen actual;
2. el bootstrap valida que solo lee los tres namespaces `*-staging`, los copia a la replica exclusiva, conserva los cuatro usuarios limitados y escribe el marcador `logical-staging-v1`;
3. verificar replica PRIMARY, conteos, indices, sentinel v2, usuarios/roles y transacciones;
4. detener temporalmente solo los contenedores de la app `28` y ejecutar `cukies-staging-mongo-resync` dentro del nuevo Mongo para cerrar el delta con las tres fuentes staging ya quietas;
5. cambiar solo las URLs de la app `28` al alias interno `cukies-hub-staging-mongo-u4s804o4wwcckowgk0woo4wg:27017`, con `replicaSet=cukies-staging-rs0`;
6. redesplegar y repetir health, schema setup y comprobaciones de no escritura de los schedulers.

No se migra ningun namespace de produccion. Si falta el marcador, el bootstrap solo acepta como origen el host `192.168.1.221:27017`, los cuatro usuarios de staging conocidos y los tres nombres de base exactos; cualquier otra combinacion aborta el contenedor.

## Matriz de envs

### Dapp

| Variable | Staging | Production | Nota |
| --- | --- | --- | --- |
| `DATABASE_URL` | Mongo staging | Mongo production | Nunca compartir escritura con produccion. |
| `CUKIES_DATABASE_URL` | Mongo legacy staging | Mongo legacy production | Usar replica sanitizada de `cukies`, no produccion directa. |
| `NEXTAUTH_URL` | URL staging | URL production | Debe coincidir con OAuth callbacks. |
| `NEXTAUTH_SECRET` | Secret staging | Secret production | Distinto por entorno. |
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
| `NEXT_PUBLIC_UKI_CHAIN_ID` | `97` | `56` | BSC testnet vs BSC mainnet. |
| `NEXT_PUBLIC_ASM_TOKEN_ADDRESS` | ASM testnet | ASM mainnet | Verificado por chain. |
| `NEXT_PUBLIC_UKI_TOKEN_ADDRESS` | UKI testnet | UKI mainnet | Desde freeze/deploy. |
| `NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS` | Vault testnet | Vault mainnet | Desde freeze/deploy. |
| `NEXT_PUBLIC_UKI_PRESALE_ADDRESS` | Presale testnet | Presale mainnet | Desde freeze/deploy. |
| `NEXT_PUBLIC_UKI_STAKING_ADDRESS` | `0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205` | Staking mainnet pendiente | Contrato de custodia UKI sin rewards ni lock. |
| `NEXT_PUBLIC_UKI_REWARDS_DISTRIBUTOR_ADDRESS` | `0xc2252D797Da294D16b84282d213604b4Bcf6EE09` | Distributor mainnet pendiente | Sin fondos/lotes de producto hasta aprobar reglas. |
| `NEXT_PUBLIC_CUKIES_NFT_COLLECTION_ADDRESS` | `0xD4C7B16DB234D7f62Ba6a8f30153FAF85feaBec8` | Colección mainnet pendiente | Colección ERC-721 V2 custodiable de staging. |
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
| `CHAIN_INDEXER_CONTRACT_ALIASES` | Aliases previos más `UKI_STAKING,TOKEN_V2,CUKIE_MASTER_NFT_VAULT,CUKIE_POOL_NFT_VAULT` | `UKI_STAKING` es obligatorio para elegibilidad y descalificación; nunca sustituir ni reiniciar aliases existentes. |
| `CHAIN_INDEXER_TOKEN_ADDRESS` | Fuente legacy ya verificada | Se conserva sin cambios, con su identidad y cursores existentes. |
| `CHAIN_INDEXER_TOKEN_V2_ADDRESS` | `0xD4C7B16DB234D7f62Ba6a8f30153FAF85feaBec8` | Nueva colección ERC-721 custodiable de chain `97`; sin fallback a `TOKEN`. |
| `CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_ADDRESS` | `0x4482ebA4D55a1DF6aA102a8CC22A4fBa252D7eDB` | Vault custodial independiente para Cukie Master. |
| `CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_ADDRESS` | `0xd405aCFf1Bba872bE893e796C39f3eaCBdE2872b` | Vault custodial independiente para Cukie Pool. |
| `CHAIN_INDEXER_MARKETPLACE_ADDRESS` | Pendiente de `deploy:testnet:nft-source` | Emisor testnet de eventos marketplace, sin custodia ni valor. |
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
| `CHAIN_INDEXER_BSC_CONFIRMATIONS` | `12` | Gate de finalidad para las proyecciones UKI. |

### Publicador de rewards en staging

`reward-batch-publisher` usa la misma imagen versionada que la Dapp, pero es un
proceso separado. Consume únicamente `reward_accounting_allocations` finales,
prefonda `RewardsDistributor`, publica el batch y ejecuta por separado la
transferencia a tesorería, la reserva única de marketing/desarrollo y la quema.
UKI tiene supply fijo: este proceso materializa la reserva existente, no mintea.

| Variable | Valor staging | Regla |
| --- | --- | --- |
| `REWARD_BATCH_PUBLISHER_ENABLED` | `false` hasta cargar autoridad | Gate explícito; nunca hereda el gate contable. |
| `REWARD_BATCH_PUBLISHER_EXPECTED_SIGNER_ADDRESS` | owner de `RewardsDistributor` | La clave debe resolver exactamente a esta address y el preflight vuelve a contrastarla on-chain. |
| `REWARD_BATCH_PUBLISHER_PRIVATE_KEY` | secreto Coolify pendiente | Solo se inyecta en el contenedor del publicador; no en Dapp, indexer ni schedulers. |
| `REWARD_BATCH_PUBLISHER_CONFIRMATIONS` | `12` | Cada operación queda firmada de forma durable antes del broadcast y confirmada antes de avanzar. |
| `REWARD_BATCH_CLAIM_WINDOW_SECONDS` | `7776000` | Ventana inicial de 90 días para staging. |

El worker rechaza cualquier entorno que no sea rama `staging`, recurso
`u4s804o4wwcckowgk0woo4wg`, base `cukieshub-new-staging` y BSC Testnet `97`.
El canary aislado del 20-08-2026 desplegó token/distributor temporales, publicó
el batch `0xb0ea3773...1dd7f` (`0x5d44635e...9503`) y reclamó exactamente 10
tokens (`0xa4e92d08...e104`). Los contratos UKI activos no se tocaron.

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
- [ ] Desplegar `reward-batch-publisher` apagado y cargar la autoridad testnet del owner `0xba84...7820` por canal secreto antes del primer batch UKI real; no reutilizar la clave del deployer mainnet.
- [x] Retirar el card worker del arranque por defecto de staging mediante el profile `card-worker`.
- [x] Provisionar bucket MinIO, hostname publico, prefijo y credenciales exclusivos de staging; validar setup, upload/render real y limpieza completa del fixture.
- [x] Desplegar URLs de card inmutables (#216), repetir dos regeneraciones con hashes distintos, limpiar el fixture y activar el profile `card-worker` solo en la app 28 (PR #217; despliegue 1109).
- [x] Vaciar OAuth social, Pusher, Resend, Telegram e IFTTT en staging; quedan deshabilitados hasta tener destinos exclusivos.
- [x] Completar smoke E2E con una segunda wallet desde la UI: login firmado, cookie segura, BSC Testnet `97`, transacciones bloqueadas, APIs de competicion `200`, registro `1/1` en Mongo staging y `0/0` en la base productiva.
- [x] Rotar preventivamente `STAGING_MONGO_REPLICA_KEY` en una ventana controlada, reiniciar solo la replica staging y repetir health/transacciones sin reutilizar ni cambiar credenciales de produccion.

El siguiente bloqueo NFT es ejecutar desde una wallet QA el smoke firmado approve/deposit/withdraw de Cukie Master y el flujo deposit/request-exit/withdraw del Cukie Pool respetando el corte. Para rewards on-chain queda cargar por canal secreto la autoridad testnet exacta del owner y ejecutar el primer batch UKI real; el canary aislado ya prueba funding, publicación y claim sin tocar los contratos activos.

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
