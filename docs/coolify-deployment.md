# Coolify deployment

Los despliegues de staging y produccion deben usar `docker-compose.coolify.yml` como compose del proyecto.

## Servicios

- `dapp`: Next.js publico. Es el unico servicio con dominio, proxy y puerto HTTP.
- `chain-indexer`: worker interno. Lee blockchain, procesa historicos/live y proyecta en Mongo.
- `cuki-card-worker`: worker interno. Genera cards PNG, las sube a S3 y actualiza `cukies.img`.

Los workers no necesitan dominio ni Traefik. Deben quedar con `restart: unless-stopped`.

## Auto deploy

En Coolify:

1. Crear o editar el recurso como Docker Compose.
2. Repo: `fgomezserna/cukies-hub`.
3. Branch: `staging` para integracion y `main` para el live actual.
4. Compose file: `docker-compose.coolify.yml`.
5. Activar webhook/auto deploy solo para la rama asignada al recurso.
6. Configurar dominio solo en `dapp`.

## Variables obligatorias

Compartidas:

```bash
DATABASE_URL=...
CHAIN_INDEXER_MONGO_URL=...
CHAIN_INDEXER_DB_NAME=cukieshub-new
```

Dapp presale testnet:

```bash
NEXT_PUBLIC_UKI_CHAIN_ID=97
NEXT_PUBLIC_ASM_TOKEN_ADDRESS=0xf93dd40Bf8bD8dDf7C785AA87dc13C3c3FeB6c8C
NEXT_PUBLIC_UKI_TOKEN_ADDRESS=0x42895bBEc6A6EC1b4aF0B11E144Cd2777589C23c
NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS=0xE7cFcebA1342946ff8c382Be8D7B55F0323b1154
NEXT_PUBLIC_UKI_PRESALE_ADDRESS=0xC0d7b04AC4DFCCc28790FD492FCB3CB16AcDfcdA
NEXT_PUBLIC_BSCSCAN_BASE_URL=https://testnet.bscscan.com
NEXT_PUBLIC_UKI_PRESALE_START_ISO=2026-08-05T10:59:20.000Z
NEXT_PUBLIC_UKI_PRESALE_START_LABEL=testnet abierta
NEXT_PUBLIC_UKI_PRESALE_START_SHORT_LABEL=abierta
```

Las variables `NEXT_PUBLIC_*` se inyectan tambien como build args. Tras cambiarlas en Coolify hay que reconstruir la imagen, no solo reiniciar el contenedor.

Treasure Hunt multiplayer (solo staging):

Antes de activar el flag servidor es obligatorio ejecutar este preflight en la base indicada por `DATABASE_URL`. La coleccion `TreasureHuntMultiplayerMatch` debe ser nueva/vacia o ambas agregaciones deben devolver cero documentos:

```javascript
// Un GameSession no puede estar ligado a mas de un match, incluidos terminales.
db.TreasureHuntMultiplayerMatch.aggregate([
  { $unwind: "$players" },
  { $match: { "players.gameSessionId": { $type: "string" } } },
  { $group: { _id: "$players.gameSessionId", matches: { $addToSet: "$matchId" } } },
  { $match: { "matches.1": { $exists: true } } }
])

// Una wallet solo puede estar activa en un match. La expresion reproduce el backfill legacy.
db.TreasureHuntMultiplayerMatch.aggregate([
  {
    $set: {
      effectiveActiveUserIds: {
        $cond: [
          { $in: ["$status", ["finished", "abandoned"]] },
          [],
          { $ifNull: ["$activeUserIds", "$players.userId"] }
        ]
      }
    }
  },
  { $unwind: "$effectiveActiveUserIds" },
  { $group: { _id: "$effectiveActiveUserIds", matches: { $addToSet: "$matchId" } } },
  { $match: { "matches.1": { $exists: true } } }
])
```

Si aparece cualquier fila, no activar `TREASURE_HUNT_MULTIPLAYER_ENABLED`: exportar/respaldar la coleccion y limpiar o terminalizar los duplicados de forma explicita, o usar una coleccion nueva. El arranque crea indices unicos sobre `players.gameSessionId` y wallets activas y debe fallar cerrado si el dataset no cumple estas invariantes.

```bash
TREASURE_HUNT_MULTIPLAYER_ENABLED=true
```

El compose mantiene este flag servidor en `false` por defecto. Solo debe activarse en el recurso de staging/integracion mientras el modo siga siendo `staging_unranked`; produccion debe conservarlo en `false`. El rate limiter de estas rutas vive en memoria del proceso y presupone una unica replica de `dapp`. Antes de escalar a varias replicas hay que mover los buckets a un almacenamiento compartido y distribuido.

El juego `sybil-slayer` se despliega como recurso separado y necesita estas variables de build para el mismo gate:

```bash
NEXT_PUBLIC_TREASURE_HUNT_MULTIPLAYER_ENABLED=true
NEXT_PUBLIC_DAPP_ORIGIN=https://cukieshub.eurekand.com
```

Ambas se incorporan al bundle de Next.js: tras cambiarlas hay que reconstruir la imagen del juego. En produccion, `NEXT_PUBLIC_TREASURE_HUNT_MULTIPLAYER_ENABLED` debe seguir en `false` y `NEXT_PUBLIC_DAPP_ORIGIN` debe ser el origen real de la dapp de produccion. Ese origen tambien delimita el `frame-ancestors` del CSP; no se debe usar `*` ni mezclar el origen de staging con produccion.

Indexer:

```bash
CHAIN_INDEXER_CHAINS=BSC
CHAIN_INDEXER_CONTRACT_ALIASES=PRESALE
CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID=97
CHAIN_INDEXER_BSC_RPC_URLS=https://bsc-testnet-rpc.publicnode.com,https://data-seed-prebsc-1-s1.bnbchain.org:8545,https://data-seed-prebsc-2-s1.bnbchain.org:8545
CHAIN_INDEXER_BSC_RPC_URL=https://bsc-testnet-rpc.publicnode.com
CHAIN_INDEXER_TRON_API_BASE_URL=https://api.trongrid.io/v1
CHAIN_INDEXER_PRESALE_ADDRESS=0xC0d7b04AC4DFCCc28790FD492FCB3CB16AcDfcdA
CHAIN_INDEXER_START_BSC_BLOCK=123291898
CHAIN_INDEXER_BSC_CONFIRMATIONS=12
```

`CHAIN_INDEXER_PRESALE_ADDRESS` debe ser el contrato `Presale` real del entorno. Si no se define, el worker seguira indexando Cukies legacy, marketplace y bridge, pero no leera compras de preventa ni generara `presale_purchases`, `presale_participants` o `presale_referral_contributions`.

`CHAIN_INDEXER_START_BSC_BLOCK` debe apuntar al bloque de despliegue del contrato de preventa o a un bloque anterior cercano. Para backfill historico amplio, usar un RPC que soporte rangos de logs suficientemente antiguos.

### Escenario de preventa staging 2026-08-05

- Vault: `0xE7cFcebA1342946ff8c382Be8D7B55F0323b1154`; deploy tx `0x14292fc576ddff260572c4d7de7a7538d8f0aed8f3147d20f65d2cb77a0fa00b`.
- Presale: `0xC0d7b04AC4DFCCc28790FD492FCB3CB16AcDfcdA`; deploy tx `0x846987138438bc3e77bfa8a957011b7cf6bbfc7b8fae59a548949102a0abc80e`.
- Parametros: `100 UKI/ASM`, minimo `5 ASM`, cap `250,000,000 UKI`, ventana de 30 dias y vesting lineal de 9 meses.
- Vault financiado: tx `0xaafce634b0221268ced2d9e64a1ab8438365072e09cd11aa016dafadf3e65444`.
- Rol y apertura: tx `0x51117e37bf957a911626d797c7045c03e6ab27d9e98a21a9632d81a74e7a7b1a` y `0x4e8c4ec8ca66c7b2c449a68f60eec23b4a27b7ccbf8d8204ad1f901015cf3ed8`.
- Compra smoke: `5 tASM -> 500 UKI` en tx `0x9b5f3a5724028f464fa582be7d3178dbf872964b6161123cd0987daf3010f9bd`.
- Source verificado mediante Etherscan API V2: [VestingVault](https://testnet.bscscan.com/address/0xE7cFcebA1342946ff8c382Be8D7B55F0323b1154#code) y [Presale](https://testnet.bscscan.com/address/0xC0d7b04AC4DFCCc28790FD492FCB3CB16AcDfcdA#code).

Config inicial en Mongo para referidos de preventa:

```js
db.presale_referral_campaign_config.updateOne(
  { active: true },
  {
    $set: {
      active: true,
      minimumUkiToUnlockLink: 0,
      levelOneWeight: 1,
      levelTwoWeight: 0.5,
      levelThreeWeight: 0.25,
      updatedAt: new Date()
    },
    $setOnInsert: {
      createdAt: new Date()
    }
  },
  { upsert: true }
)
```

Cambiar `minimumUkiToUnlockLink` y pesos por los valores finales antes de abrir la campana.

Card worker:

```bash
CARD_WORKER_MONGO_URL=...
CARD_WORKER_DB_NAME=cukieshub-new
CARD_WORKER_UPLOAD=false
CARD_WORKER_PUBLIC_BASE_URL=...
CARD_WORKER_S3_BUCKET=...
CARD_WORKER_S3_REGION=...
CARD_WORKER_S3_PREFIX=png/tokens/v2/TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

En staging, el destino exclusivo es el bucket MinIO `cukies-cards-staging`. Las URLs inmutables de #216 y el smoke real quedaron validados, por lo que `CARD_WORKER_UPLOAD=true` y `COMPOSE_PROFILES=card-worker` estan activos solo en la app Coolify 28 desde el despliegue 1109. El valor `false` del ejemplo sigue siendo el default seguro para cualquier recurso nuevo. No usar nunca el destino compartido de produccion ni copiar las credenciales de app 28.

## Preflight de rutas operativas y Telegram

Los cambios de seguridad de rutas no autorizan por sí mismos ninguna modificación
en Coolify, Telegram, IFTTT ni producción. El estado actual de staging mantiene esas
integraciones externas vacías hasta disponer de destinos exclusivos. En ese modo el
candidato se puede desplegar de forma segura: los webhooks responden `503`, las
rutas admin responden `503` sin allowlist y `Join Group` queda oculto. Esto es el
comportamiento fail-closed esperado, no un motivo para activar integraciones reales.

La activación posterior es un cambio operativo separado y exige autorización. Solo
entonces:

1. Cargar en la app 28 una `ADMIN_WALLET_ALLOWLIST` de wallets EVM administrativas
   de staging y valores exclusivos para `IFTTT_WEBHOOK_SECRET`,
   `TELEGRAM_WEBHOOK_SECRET` y `TELEGRAM_CLEANUP_SECRET`. Cada secreto debe tener al
   menos 32 bytes, 12 caracteres distintos y no puede reutilizarse ni exponerse como
   `NEXT_PUBLIC_*`.
2. Generar `TELEGRAM_WEBHOOK_SECRET` desde 32 bytes aleatorios en base64url: 43
   caracteres sin `=`, usando solo `A-Z`, `a-z`, `0-9`, `_` y `-`. Telegram limita
   `secret_token` a 256 caracteres.
3. Configurar `TELEGRAM_GROUP_INVITE` con el enlace `https://t.me/...` exclusivo del
   entorno. Si falta o no es válido, `/api/telegram/group-invite` falla cerrado y la
   UI no muestra `Join Group`.
4. Confirmar primero el modo de ingreso de Telegram. `setWebhook` y `getUpdates` no
   pueden operar simultáneamente; no convertir un entorno que usa polling sin una
   ventana y una decisión operativa separadas.
5. Configurar el mismo `IFTTT_WEBHOOK_SECRET` privado dentro del JSON de la acción
   IFTTT antes de habilitar su trigger. La app no mantiene una ventana de doble
   secreto: cualquier rotación posterior exige una ventana coordinada y reintentar
   los eventos que coincidan con el corte.

La primera migración de un webhook Telegram que todavía apunta a una versión sin
validación de cabecera puede hacerse en dos fases:

1. Guardar el nuevo valor en la configuración del siguiente despliegue, sin
   redesplegar todavía.
2. Actualizar `setWebhook` con ese mismo `secret_token` mientras la versión anterior
   aún tolera la nueva cabecera y comprobar que Telegram sigue entregando updates.
3. Desplegar el candidato y verificar que una cabecera ausente o errónea devuelve
   `401`, la correcta permite el update y el cuerpo no aparece en logs.

Las rotaciones posteriores también requieren ventana coordinada porque el runtime
acepta un único secreto; no se debe reutilizar el procedimiento anterior como si la
versión ya protegida tolerase simultáneamente el valor viejo y el nuevo.

La promoción a producción requiere evidencia de staging, un go/no-go independiente
y repetir la rotación con valores de producción. Nunca copiar los de staging ni
aplicar este runbook directamente sobre `cukies.world` como parte de un PR.

## Validacion post deploy

- Abrir la web publica y revisar `/api/health`.
- Iniciar una sesión firmada con una wallet EVM incluida en `ADMIN_WALLET_ALLOWLIST`.
- Abrir `/indexer?collection=chain_indexer_runs`; sin esa sesión debe responder como ruta inexistente y no abrir Mongo.
- Abrir `/indexer?collection=presale_purchases` tras una compra de prueba confirmada.
- Abrir `/indexer?collection=presale_participants` y comprobar `totalUkiPurchased`, `referralUnlockedAt`, sponsor provisional/bloqueado y acumulados N1/N2/N3.
- Abrir `/indexer?collection=presale_referral_contributions` y verificar que una compra atribuida crea hasta tres filas, una por nivel.
- Abrir `/indexer?collection=card_generation_jobs`.
- Revisar logs de `chain-indexer` y confirmar que ejecuta `setup` y luego `run`.
- Revisar logs de `cuki-card-worker` y confirmar que ejecuta `setup` y luego `run`.
