# UKI NFT data inventory

Estado: inventario inicial para implementacion.
Issue: #20 `UKI-002.1`.
Fecha: 2026-05-12.

## Alcance

Este documento inventaria las bases, colecciones y campos NFT relevantes que deben alimentar `NftInventoryService` sin duplicar el marketplace ni romper bridge/listing existentes.

Fuentes revisadas en el repo:

- `dapp/src/lib/mongodb-cukies.ts`
- `dapp/src/lib/mongodb-hub.ts`
- `dapp/src/lib/user-sync.ts`
- `dapp/scripts/inspect-databases.mjs`
- `dapp/prisma/schema.prisma`
- `docs/adr-uki-economic-operations.md`

No se incluyen dumps, valores de documentos ni cadenas de conexion.

## Bases detectadas

| Base | Rol actual | Fuente en repo | Uso para UKI |
| --- | --- | --- | --- |
| `cukies` | Base historica/operativa de Cukies World y marketplace. | `dapp/src/lib/mongodb-cukies.ts` | Fuente operativa inicial para NFTs, wallets, owners, transacciones NFT y marketplace. |
| `cukies-hub` | Base de la dapp actual gestionada por Prisma/Mongo. | `dapp/prisma/schema.prisma`, `dapp/src/lib/mongodb-hub.ts` | Usuarios, sesiones, quests, puntos y futuras materializaciones UKI. No debe duplicar ownership NFT sin razon. |

## Colecciones relevantes en `cukies`

Estas colecciones aparecen como helpers explicitos en `dapp/src/lib/mongodb-cukies.ts`.

| Coleccion | Relevancia NFT | Campos esperados para inventario UKI | Observaciones |
| --- | --- | --- | --- |
| `users` | Relaciona usuarios historicos con wallets. | `_id`, `username`, `email`, `name`, `lastName`, `wallets[]` | `user-sync.ts` busca usuarios por ids de `wallets`. No debe ser fuente de ownership NFT. |
| `wallets` | Mapea wallet address a usuario historico. | `_id`, `address`, posible `network`/tipo si existe | `user-sync.ts` normaliza Tron como `T...` uppercase y EVM/BSC como lowercase. Es clave para owner lookup inicial. |
| `cukies` | Candidata principal para inventario NFT/personajes. | `_id`, `contract`, `network`, `tokenId`, `owner`, `wallet`, `rarity`, `generation`, `metadata`, `image`, `name`, `attributes` | Debe confirmarse contra datos reales. Si no contiene owner final, se cruza con `wallets` o transacciones. |
| `originals` | Candidata para NFTs originales / generacion 1. | `_id`, `tokenId`, `owner`, `wallet`, `rarity`, `metadata`, `image`, `name`, `attributes` | Necesaria para distinguir Originales vs 2a Generacion en reglas de pool. |
| `tx_nfts` | Historial de movimientos NFT. | `_id`, `txHash`, `contract`, `network`, `tokenId`, `from`, `to`, `owner`, `timestamp`, `type`, `status` | Util para reconciliacion y auditoria, no como unica fuente de estado actual si hay coleccion materializada. |
| `txMarketplace` | Historial/estado de marketplace. | `_id`, `txHash`, `contract`, `network`, `tokenId`, `seller`, `buyer`, `price`, `currency`, `listingStatus`, `status`, `timestamp` | Fuente esperada para `listed` y cambios de listing. Confirmar si contiene estado activo o solo eventos. |
| `processedEvents` | Control de indexacion/eventos procesados. | `_id`, `eventId`, `txHash`, `logIndex`, `contract`, `network`, `processedAt` | Puede servir como watermark de indexers. No es dominio NFT por si solo. |
| `completedEvents` | Control de eventos completados. | `_id`, `eventId`, `txHash`, `logIndex`, `contract`, `network`, `completedAt` | Similar a `processedEvents`; util para auditoria operacional. |
| `settings` | Configuracion historica. | `_id`, keys de config | Puede contener direcciones de contratos o flags de marketplace. No asumir sin inspeccion. |
| `config` | Configuracion historica. | `_id`, keys de config | Candidata para mapping de contracts/networks si existe. |

Colecciones no NFT directas pero existentes en helpers:

- `points`
- `tx_points`
- `referrals`
- `txLottery`

Estas no alimentan ownership NFT inicial, aunque pueden servir para migraciones o analisis historico de usuario.

## Colecciones relevantes en `cukies-hub`

La dapp actual usa Prisma sobre Mongo. En Prisma, las colecciones suelen mapear al nombre del modelo.

| Coleccion/modelo | Relevancia NFT | Campos actuales relevantes | Observaciones |
| --- | --- | --- | --- |
| `User` | Identidad principal de la dapp. | `walletAddress`, `username`, socials, `xp`, timestamps | No tiene inventario NFT. Sera consumidor de `NftInventoryService`. |
| `GameSession` | Sesiones de juego existentes. | `sessionToken`, `sessionId`, `userId`, `gameId`, `startedAt`, `endedAt`, `isActive` | Futura economia debe usar otro modelo o extender con `GameSessionEconomy`. |
| `GameResult` | Resultados de juego existentes. | `userId`, `gameId`, `finalScore`, `gameTime`, `metadata`, `isValid`, `xpEarned` | No decide rewards UKI. Puede alimentar migracion/compatibilidad. |
| `PointTransaction` | Ledger actual de puntos XP/quests. | `userId`, `amount`, `type`, `reason`, `metadata`, `createdAt` | No debe mezclarse con `CompetitionCreditTransaction` futuro. |

No hay modelos actuales para:

- `CukieAsset`
- `CukieAssetLock`
- `CukiePoolPosition`
- `CompetitionCreditAccount`
- `CompetitionCreditTransaction`
- `GameRewardPeriod`
- `RewardAllocation`
- `RewardClaimBatch`

Estos modelos aparecen como propuesta en `docs/uki-launch-technical-backlog.md` y deben depender del inventario normalizado, no reemplazar el marketplace.

## Campos NFT obligatorios para `NftInventoryService`

Todo asset normalizado debe exponer estos campos aunque algunos se deriven de varias colecciones:

| Campo normalizado | Fuente candidata | Requerido para |
| --- | --- | --- |
| `assetId` | Derivado: `network:contract:tokenId` o `_id` estable + mapping | Locks, idempotencia, auditoria. |
| `network` | `cukies`, `originals`, `tx_nfts`, config | Distinguir BSC/TRON y reglas de uso. |
| `contractAddress` | `cukies`, `originals`, `tx_nfts`, `txMarketplace`, config | Validacion por contrato y exploradores. |
| `tokenId` | `cukies`, `originals`, `tx_nfts`, `txMarketplace` | Identidad NFT. |
| `ownerWallet` | `cukies`, `wallets`, ultimo evento `tx_nfts`, marketplace/indexer | Elegibilidad, cupos y pool. |
| `rarity` | `cukies`, `originals`, `metadata.attributes` | Puntos NFT y ponderacion rewards. |
| `generation` | `cukies`, `originals`, metadata/config | Prioridad Originales vs 2a Generacion. |
| `metadata` | `cukies`, `originals`, metadata embebida | UI, soporte, debug. |
| `listingStatus` | `txMarketplace` o coleccion de listings si existe | Estado canonico `listed`. |
| `bridgeStatus` | Marketplace/bridge status si existe en `cukies`, `tx_nfts`, config o coleccion externa | Estado canonico `bridging`. |
| `imageUrl` | `cukies`, `originals`, metadata | UI. |
| `name` | `cukies`, `originals`, metadata | UI. |
| `lastSyncedAt` | `NftInventoryService` | Frescura/consistencia. |
| `sourceRefs` | Referencias a documentos originales | Auditoria y recuperacion. |

## Mapeo por red

| Red | Deteccion esperada | Normalizacion wallet | Riesgos |
| --- | --- | --- | --- |
| BSC | Contract EVM, wallet `0x...`, tx hashes EVM. | Lowercase para comparacion interna. | Chain/indexer puede ir retrasado; confirmar antes de lock economico. |
| Tron | Wallet `T...`, contratos/ids historicos del marketplace. | Uppercase segun `user-sync.ts`. | Bridge puede mover owner/red; bloquear si `bridgeStatus` no esta final. |
| Unknown | Falta contract/network o fuente inconsistente. | No normalizar como elegible. | Debe resolverse antes de pool, cupos o partida. |

## Gaps que debe confirmar el muestreo real

El codigo actual enumera colecciones, pero no confirma todos los campos reales. Antes de implementar `NftInventoryService`, el muestreo debe confirmar:

1. Si `cukies` contiene owner actual o solo metadata del personaje.
2. Si `originals` duplica NFTs de `cukies` o representa otra generacion.
3. Donde vive el estado activo de listing: `txMarketplace` como eventos o una coleccion materializada.
4. Donde vive el bridge status real.
5. Si `contract`/`network` estan en cada NFT o deben derivarse por coleccion.
6. Si `rarity` y `generation` son campos directos o atributos dentro de `metadata`.
7. Si hay colecciones no expuestas por `mongodb-cukies.ts` usadas por marketplace/bridge.

## Metodo de inspeccion seguro

No usar scripts que impriman documentos completos en logs compartidos. Para confirmar el inventario:

1. Conectar con variables de entorno, no URLs hardcodeadas.
2. Listar colecciones y conteos.
3. Para cada coleccion candidata, extraer solo nombres de campos, tipos y porcentaje aproximado de presencia.
4. Redactar o truncar wallets, emails, tx hashes y metadata extensa.
5. Guardar solo el resumen de estructura, nunca muestras completas.

Consulta recomendada por coleccion:

```js
const docs = await db.collection(name).find({}, { limit: 100 }).toArray();
const fieldStats = {};
for (const doc of docs) {
  for (const [key, value] of Object.entries(doc)) {
    fieldStats[key] ??= { count: 0, types: new Set() };
    fieldStats[key].count += 1;
    fieldStats[key].types.add(Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value);
  }
}
```

El resultado aceptable para Git debe ser una tabla de campos/tipos, no datos.

## Recomendacion para `NftInventoryService`

Crear una capa de lectura normalizada con prioridad:

1. Leer asset candidates desde `cukies` y `originals`.
2. Enriquecer owner desde `wallets` y/o ultimo movimiento valido en `tx_nfts`.
3. Enriquecer listing desde `txMarketplace` o coleccion activa de marketplace si existe.
4. Enriquecer bridge status desde fuente de bridge/marketplace.
5. Resolver `canonicalState` con `docs/adr-uki-canonical-asset-states.md`.
6. Exponer assets normalizados sin copiar documentos completos al hub.

## Impacto en issues siguientes

- #21 debe validar calidad real de `owner`, `rarity` y `generation` con muestreo BSC/TRON.
- #22 debe convertir este inventario en contrato de `NftInventoryService`.
- #51/#54 deben evitar hardcodear Treasure Hunt y consumir assets normalizados.

