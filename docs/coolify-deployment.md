# Coolify deployment

El despliegue de produccion debe usar `docker-compose.coolify.yml` como compose del proyecto.

## Servicios

- `dapp`: Next.js publico. Es el unico servicio con dominio, proxy y puerto HTTP.
- `chain-indexer`: worker interno. Lee blockchain, procesa historicos/live y proyecta en Mongo.
- `cuki-card-worker`: worker interno. Genera cards PNG, las sube a S3 y actualiza `cukies.img`.

Los workers no necesitan dominio ni Traefik. Deben quedar con `restart: unless-stopped`.

## Auto deploy

En Coolify:

1. Crear o editar el recurso como Docker Compose.
2. Repo: `fgomezserna/cukies-hub`.
3. Branch: `main`.
4. Compose file: `docker-compose.coolify.yml`.
5. Activar webhook/auto deploy para que cada push o merge a `main` reconstruya los tres servicios.
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
NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS=0x02E854eeF861B517d996D676C27B1be62665035B
NEXT_PUBLIC_UKI_PRESALE_ADDRESS=0xb6aB8eaB37061AffCD415950C051a2EBD61Bb2C8
NEXT_PUBLIC_BSCSCAN_BASE_URL=https://testnet.bscscan.com
NEXT_PUBLIC_UKI_PRESALE_START_ISO=2026-06-11T10:59:10.000Z
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
CHAIN_INDEXER_BSC_RPC_URL=https://bsc-testnet-rpc.publicnode.com
CHAIN_INDEXER_TRON_API_BASE_URL=https://api.trongrid.io/v1
CHAIN_INDEXER_PRESALE_ADDRESS=0xb6aB8eaB37061AffCD415950C051a2EBD61Bb2C8
CHAIN_INDEXER_START_BSC_BLOCK=112739000
CHAIN_INDEXER_BSC_CONFIRMATIONS=3
```

`CHAIN_INDEXER_PRESALE_ADDRESS` debe ser el contrato `Presale` real del entorno. Si no se define, el worker seguira indexando Cukies legacy, marketplace y bridge, pero no leera compras de preventa ni generara `presale_purchases`, `presale_participants` o `presale_referral_contributions`.

`CHAIN_INDEXER_START_BSC_BLOCK` debe apuntar al bloque de despliegue del contrato de preventa o a un bloque anterior cercano. Para backfill historico amplio, usar un RPC que soporte rangos de logs suficientemente antiguos.

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
CARD_WORKER_UPLOAD=true
CARD_WORKER_PUBLIC_BASE_URL=...
CARD_WORKER_S3_BUCKET=...
CARD_WORKER_S3_REGION=...
CARD_WORKER_S3_PREFIX=png/tokens/v2/TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

No activar `CARD_WORKER_UPLOAD=true` sin bucket, region, credenciales y base publica configurados. El worker esta protegido y no procesa en modo continuo sin upload real.

## Validacion post deploy

- Abrir la web publica y revisar `/api/health`.
- Abrir `/indexer?collection=chain_indexer_runs`.
- Abrir `/indexer?collection=presale_purchases` tras una compra de prueba confirmada.
- Abrir `/indexer?collection=presale_participants` y comprobar `totalUkiPurchased`, `referralUnlockedAt`, sponsor provisional/bloqueado y acumulados N1/N2/N3.
- Abrir `/indexer?collection=presale_referral_contributions` y verificar que una compra atribuida crea hasta tres filas, una por nivel.
- Abrir `/indexer?collection=card_generation_jobs`.
- Revisar logs de `chain-indexer` y confirmar que ejecuta `setup` y luego `run`.
- Revisar logs de `cuki-card-worker` y confirmar que ejecuta `setup` y luego `run`.
