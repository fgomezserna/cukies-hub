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
- Live actual: Coolify app `game-hub`, application ID `12`, UUID `jookw8ow8woks088s44404ok`, rama `main`, URL `https://cukies.world`.
- Ambos recursos usan `docker-compose.coolify.yml`; solo `dapp` se publica mediante Traefik.
- Staging usa BSC Testnet (`97`) y la preventa `0xC0d7b04AC4DFCCc28790FD492FCB3CB16AcDfcdA`.
- Staging usa `UKIStaking` `0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205` (bloque `123359165`) y `RewardsDistributor` `0xc2252D797Da294D16b84282d213604b4Bcf6EE09` (bloque `123359171`). Ambos apuntan al UKI testnet existente.
- El smoke `STAGING_SMOKE_C31176A_2026_08_05` movio temporalmente `1 UKI` por contrato y termino con staking, reservas y balance del distribuidor a cero. No representa una cifra de producto.
- Staging usa `cukies-hub-staging`, `cukies-legacy-staging` y `cukieshub-new-staging` sobre Mongo replica set `rs0`.
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

- completar usuarios/credenciales Mongo limitados a las tres bases staging antes de QA externa,
- separar OAuth, Pusher, Resend y Telegram,
- desplegar los contratos de economia pendientes y mantener schedulers desactivados hasta completar sus gates,
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
| `NEXT_PUBLIC_TREASURE_HUNT_MULTIPLAYER_ENABLED` (`sybil-slayer`) | `true` solo durante QA autorizada | `false` | Variable de build del recurso separado; exige rebuild. |
| `NEXT_PUBLIC_DAPP_ORIGIN` (`sybil-slayer`) | `https://cukieshub.eurekand.com` | Origen dapp production | Variable de build y origen exacto permitido por `frame-ancestors`. |
| `NEXT_PUBLIC_UKI_CHAIN_ID` | `97` | `56` | BSC testnet vs BSC mainnet. |
| `NEXT_PUBLIC_ASM_TOKEN_ADDRESS` | ASM testnet | ASM mainnet | Verificado por chain. |
| `NEXT_PUBLIC_UKI_TOKEN_ADDRESS` | UKI testnet | UKI mainnet | Desde freeze/deploy. |
| `NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS` | Vault testnet | Vault mainnet | Desde freeze/deploy. |
| `NEXT_PUBLIC_UKI_PRESALE_ADDRESS` | Presale testnet | Presale mainnet | Desde freeze/deploy. |
| `NEXT_PUBLIC_UKI_STAKING_ADDRESS` | `0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205` | Staking mainnet pendiente | Contrato de custodia UKI sin rewards ni lock. |
| `NEXT_PUBLIC_UKI_REWARDS_DISTRIBUTOR_ADDRESS` | `0xc2252D797Da294D16b84282d213604b4Bcf6EE09` | Distributor mainnet pendiente | Sin fondos/lotes de producto hasta aprobar reglas. |
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
| `CHAIN_INDEXER_CONTRACT_ALIASES` | `PRESALE,UKI_STAKING,REWARDS_DISTRIBUTOR` | Activacion explicita; una address por si sola no habilita ingesta. |
| `CHAIN_INDEXER_UKI_STAKING_ADDRESS` | `0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205` | Debe coincidir con la variable publica. |
| `CHAIN_INDEXER_UKI_STAKING_START_BSC_BLOCK` | `123359165` | Bloque exacto de despliegue. |
| `CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS` | `0xc2252D797Da294D16b84282d213604b4Bcf6EE09` | Debe coincidir con la variable publica. |
| `CHAIN_INDEXER_REWARDS_DISTRIBUTOR_START_BSC_BLOCK` | `123359171` | Bloque exacto de despliegue. |
| `CHAIN_INDEXER_BSC_CONFIRMATIONS` | `12` | Gate de finalidad para las proyecciones UKI. |

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
- [x] Separar las tres bases staging y habilitar transacciones mediante Mongo replica set `rs0`.
- [x] Desplegar y financiar un nuevo `VestingVault` y `Presale` en BSC Testnet.
- [x] Ejecutar una compra on-chain smoke de `5 tASM -> 500 UKI` y validar pago, venta y vesting.
- [x] Migrar la verificacion del explorer a Etherscan API V2 y verificar el source de Vault/Presale.
- [ ] Crear usuarios Mongo con minimo privilegio y habilitar `security.authorization` tras validar los consumidores legacy.
- [x] Desplegar `UKIStaking` y `RewardsDistributor`, configurar sus cinco cursores y proyectar un smoke completo en Mongo staging (PR #192, merge `c31176ab`).
- [ ] Publicar el source de ambos contratos en BscScan cuando haya `ETHERSCAN_API_KEY`/`BSCSCAN_API_KEY`; el entorno actual no conserva ninguna.
- [ ] Configurar HMAC exclusivos de staging y ejecutar el setup de economia v2.
- [ ] Cargar reglas aprobadas de creditos, juegos, pools y ranking.
- [ ] Desplegar los cinco schedulers con gates desactivados; activarlos uno a uno tras validar heartbeats, leases e idempotencia.
- [ ] Dar al card worker un bucket/prefijo staging propio o retirarlo del compose de staging.
- [ ] Separar OAuth, Pusher, Resend y Telegram antes de QA externa.
- [ ] Completar smoke E2E con una segunda wallet desde la UI y conservar evidencia de APIs, Mongo e indexer.

El siguiente bloque recomendado es configurar HMAC exclusivos de staging y ejecutar el setup transaccional de economia v2. Despues deben cargarse reglas aprobadas y validarse APIs/leases antes de habilitar ningun scheduler.

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
