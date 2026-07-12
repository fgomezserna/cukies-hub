# UKI deployment environments

Estado: decision operativa inicial.
Issue: #166 `UKI-090.4`.
Fecha: 2026-05-13.

## Decision

Usamos dos carriles permanentes:

- `main` -> staging.
- `production` -> produccion.

Produccion no debe seguir automaticamente a `main`. El paso a produccion se hace mediante release aprobada, con PR o merge controlado hacia `production` y tag versionado.

La estrategia de tags recomendada es:

- `staging-YYYYMMDD.N` para candidatos validados en staging si hace falta fijar un punto.
- `prod-YYYYMMDD.N` para lo que se publica en produccion.

Las ramas `release/staging-YYYY-MM-DD` son opcionales y se usan solo cuando `main` sigue avanzando mientras una release se estabiliza.

## Estado actual observado

- Existe `main`.
- Existe rama remota `production`, creada desde `origin/main` el 2026-05-13.
- `production` tiene proteccion de rama en GitHub:
  - PR obligatorio,
  - una aprobacion requerida,
  - conversaciones resueltas,
  - admins incluidos,
  - force push y borrado deshabilitados.
- La dapp tiene `dapp/apphosting.yaml`, pero el hosting activo observado es Coolify.
- Coolify tiene una app live/integracion para `game-hub`:
  - `applicationId`: `12`.
  - `uuid`: `jookw8ow8woks088s44404ok`.
  - `resourceName`/`serviceName`: `game-hub`.
  - `project`: `cukies.world`.
  - `environmentName`: `production` en Coolify, aunque logicamente opera como staging/integracion.
  - rama configurada: `main`.
  - dominio: `cukieshub.eurekand.com`.
  - autodespliegue: activado para seguir `main`.
- Coolify tiene una app placeholder de produccion para `game-hub`:
  - `uuid`: `u4s804o4wwcckowgk0woo4wg`.
  - `name`: `game-hub-production`.
  - rama configurada: `production`.
  - dominio publico: ninguno todavia.
  - autodespliegue: desactivado.
- `cukies.world` esta actualmente ocupado por la app `cukiesworld-web` (`x8s8g8o04kwg0csg8w4ww8sg`) en rama `main`.
- La VM Coolify/Traefik observada es `1001` (`192.168.1.201`) y publica Traefik en `80/443`.
- Cloudflare Tunnel ya tiene ruta para `cukieshub.eurekand.com` hacia `https://192.168.1.201:443`.
- No se ha modificado Cloudflare para publicar `game-hub-production` en `cukies.world`.
- No se ha observado `.github/workflows`, `vercel.json`, `netlify.toml` ni configuracion de produccion en repo.
- `dapp/.next-dev/` aparece como archivo local no trackeado y no forma parte de este trabajo.

## Topologia objetivo

| Entorno | Rama/ref | Hosting | Chain | Datos | Uso |
| --- | --- | --- | --- | --- | --- |
| Local | Cualquier rama local | Maquina local | Hardhat/local o testnet puntual | Dev/local | Implementacion rapida. |
| Preview PR | Branch del PR | Coolify preview si se habilita | Sin valor real | Datos aislados o mocks | Revision visual/tecnica. |
| Staging | `main` o `release/staging-*` | Coolify app/env staging | BSC testnet | DB staging | QA integrada. |
| Production | `production` + tag `prod-*` | Coolify app/env production | BSC mainnet | DB production | Usuarios reales. |

## Reglas de ramas

| Rama | Regla |
| --- | --- |
| `codex/issue-<numero>-<slug>` | Trabajo aislado por issue. PR draft hasta validar. |
| `main` | Integracion. Debe poder desplegarse a staging. No publica a produccion. |
| `release/staging-YYYY-MM-DD` | Congela un candidato cuando `main` necesita seguir avanzando. |
| `production` | Rama protegida. Solo recibe release aprobada. |

Protecciones recomendadas para `production`:

- bloquear pushes directos,
- requerir PR,
- requerir al menos una aprobacion,
- requerir status checks de build/test relevantes,
- requerir comentario de go/no-go en la release,
- restringir quien puede hacer merge.

Protecciones recomendadas para `main`:

- PR obligatorio,
- checks de area cuando existan,
- permitir PRs draft para trabajo en curso,
- no exigir que todo este listo para produccion, solo que sea staging-safe.

## Flujo de promocion

1. Issue hoja -> rama `codex/issue-*`.
2. PR draft -> validacion tecnica.
3. PR ready -> merge a `main`.
4. `main` -> deploy a staging.
5. Staging QA -> evidencia en issue/release candidate.
6. Release candidate -> go/no-go.
7. Merge controlado a `production` o tag `prod-*`.
8. Deploy production.
9. Validacion post-deploy.
10. Cierre de issues que realmente quedaron publicadas o cumplidas.

## Configuracion Coolify

El proveedor activo observado es Coolify. La app que sirve `cukieshub.eurekand.com` debe seguir `main`. La app de produccion real queda preparada como placeholder sobre `production`, sin dominio publico ni autodespliegue hasta go/no-go.

Trabajo pendiente en Coolify:

- separar secrets/env vars por entorno,
- cargar `DATABASE_URL` staging y secrets OAuth/Pusher/Resend/Telegram separados,
- cargar `CUKIES_DATABASE_URL` staging contra la replica legacy sanitizada,
- ejecutar o verificar deploy de `cukieshub.eurekand.com` desde `main`,
- antes de go-live, asignar `cukies.world` a `game-hub-production` y retirar o reemplazar la app actual `cukiesworld-web`,
- no modificar Cloudflare para `cukies.world` hasta aprobacion de publicacion,
- documentar rollback concreto desde Coolify tras el primer deploy,
- confirmar si los juegos tienen hosting separado o se sirven desde la dapp.

Nada de esto debe usar secrets en el repo.

### Configuracion Coolify objetivo

| Entorno | Coolify project | Coolify environment | Branch | Dominio |
| --- | --- | --- | --- | --- |
| Staging/integracion | `cukies.world` | `production` en Coolify | `main` | `cukieshub.eurekand.com` |
| Production placeholder | `cukies.world` | `production` | `production` | sin dominio hasta go-live |
| Production final | `cukies.world` | `production` | `production` | `cukies.world` |

Reglas operativas:

- staging debe tener `NEXTAUTH_URL` y callbacks OAuth propios,
- staging debe usar base de datos y secrets separados,
- production no debe autodesplegar commits de `main`,
- `cukies.world` no debe reasignarse al hub hasta aprobacion de publicacion,
- los nombres de routers Traefik deben ser unicos por entorno,
- ambos servicios deben vivir en la red Docker externa `coolify`.

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
| `NEXT_PUBLIC_BSCSCAN_BASE_URL` | `https://testnet.bscscan.com` | `https://bscscan.com` | Enlaces de tx/address. |
| `NEXT_PUBLIC_GAME_HYPPIE_ROAD` | URL staging game | URL production game | Si el juego vive separado. |
| `NEXT_PUBLIC_GAME_SYBIL_SLAYER` | URL staging game | URL production game | Si el juego vive separado. |
| `NEXT_PUBLIC_PUSHER_KEY` | App/key staging | App/key production | Separar canales si hay trafico real. |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Cluster staging | Cluster production | Puede coincidir, app no. |
| `PUSHER_APP_ID` | App staging | App production | Si aplica al servidor. |
| `PUSHER_SECRET` | Secret staging | Secret production | Separado. |
| `TELEGRAM_BOT_TOKEN` | Bot staging | Bot production | Evitar publicar en chats reales durante QA. |
| `TELEGRAM_CHAT_ID` | Chat staging | Chat production | Separado. |
| `TELEGRAM_WEBHOOK_SECRET` | Secret webhook staging | Secret webhook production | Obligatorio, distinto por entorno y registrado como `secret_token` en `setWebhook`. |
| `TELEGRAM_CLEANUP_SECRET` | Secret staging | Secret production | Separado. |

Tras configurar la URL y los secretos de cada entorno, registra el webhook con el
`secret_token` del mismo entorno. Telegram lo enviará en
`X-Telegram-Bot-Api-Secret-Token`; la DApp rechaza el webhook si falta o no coincide.
No reutilices el token del bot como secreto del webhook.

```bash
curl --fail-with-body --silent --show-error \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=${NEXTAUTH_URL}/api/telegram/webhook" \
  --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

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

## Gates para staging

Antes de considerar staging valido:

- deploy de staging apunta a `main` o release candidate acordada,
- env staging no comparte DB ni secrets con produccion,
- `NEXT_PUBLIC_UKI_CHAIN_ID=97` si hay flujo on-chain,
- contratos testnet y direcciones documentadas si la pantalla los usa,
- smoke test de rutas criticas documentado,
- fallos de lint/typecheck/test documentados si son preexistentes.

## Gates para produccion

Antes de publicar produccion:

- release candidate validada en staging,
- PR/merge hacia `production` aprobado,
- tag `prod-*` creado,
- env production revisado por ops,
- contratos mainnet congelados y verificados si la release toca on-chain,
- rollback plan escrito,
- monitorizacion minima activa,
- responsable de guardia definido.

## Rollback

Rollback de app:

1. identificar tag/commit estable anterior,
2. redeploy desde `production` anterior o tag anterior,
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

## Checklist de ejecucion para #166

- [x] Crear rama remota `production` desde un commit aprobado.
- [x] Proteger `production`.
- [x] Configurar `cukieshub.eurekand.com` para seguir `main`.
- [x] Crear placeholder production sobre rama `production` sin dominio publico.
- [x] Confirmar que no se publica `cukies.world` todavia.
- [x] Documentar refresh Mongo production -> staging con backup y sanitizacion.
- [ ] Separar secrets/env vars.
- [x] Documentar URLs finales de staging y produccion.
- [ ] Documentar rollback concreto del proveedor.
- [ ] Ejecutar dry-run de release en #168.

## Resultado esperado

Despues de aplicar esta decision, el equipo puede seguir desarrollando en `main` y ramas de issue mientras produccion solo cambia por release aprobada. Staging se convierte en el punto de integracion real y deja de ser una idea informal.
