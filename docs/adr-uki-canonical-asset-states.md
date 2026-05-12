# ADR: UKI canonical wallet and asset states

Estado: aceptado para implementacion inicial.
Issue: #17 `UKI-001.2`.
Fecha: 2026-05-12.

## Contexto

La dapp UKI necesita usar NFTs existentes que pueden estar en BSC o Tron, listados en marketplace, en bridge, aportados a pools, usados para cupos Cukie Master o asignados temporalmente a partidas. Si cada modulo interpreta el estado por separado, un mismo NFT podria aparecer disponible en varias superficies incompatibles.

Este ADR fija estados canonicos para assets NFT y reglas de recuperacion cuando Mongo, marketplace, chain o indexers no coinciden. Complementa `docs/adr-uki-economic-operations.md`.

## Decision

Cada NFT normalizado debe tener un unico `canonicalState` operativo en Mongo. Los datos externos pueden producir flags o evidencias, pero el backend debe resolverlos a un estado unico antes de exponer acciones a dapp o juegos.

Estados canonicos:

- `available`
- `listed`
- `bridging`
- `soft_staked`
- `in_pool`
- `assigned_to_game`
- `invalidated`
- `unknown`

La wallet tambien debe tener estados derivados para UX, pero esos estados no sustituyen los estados de asset.

## Modelo conceptual

```text
wallet
  owns/controls many CukieAsset

CukieAsset
  network: bsc | tron | unknown
  contractAddress
  tokenId
  ownerWallet
  rarity
  generation
  canonicalState
  stateReason
  stateUpdatedAt
  evidence[]
  locks[]
```

`canonicalState` decide si el usuario puede listar, aportar a pool, usar para Cukie Master, asignar a juego o retirar.

`evidence[]` registra las senales que llevaron al estado: owner indexado, listing activo, bridge pendiente, lock interno, asignacion de partida, reconciliacion fallida.

## Estados canonicos de asset

| Estado | Significado | Fuente primaria | Acciones permitidas | Recuperacion |
| --- | --- | --- | --- | --- |
| `available` | NFT usable por la dapp y sin bloqueo economico activo. | `NftInventoryService` tras reconciliar owner, listing, bridge y locks. | Usar para cupos NFT, aportar a pool, seleccionar para juego si la feature lo permite. | Si aparece evidencia externa incompatible, pasar al estado de mayor precedencia. |
| `listed` | NFT listado en marketplace o con venta activa. | Marketplace/Mongo operativo del marketplace. | Ver en dashboard, abrir marketplace. No aportar a pool ni asignar a juego. | Si el listing desaparece, reconciliar owner y volver a `available` o al siguiente bloqueo aplicable. |
| `bridging` | NFT en proceso de bridge o con estado de red no finalizado. | Marketplace/bridge status + indexer. | Solo lectura y aviso. No usar en economia. | Si bridge finaliza, actualizar `network`, owner y recalcular estado. Si queda atascado, marcar `unknown` y crear alerta ops. |
| `soft_staked` | NFT bloqueado off-chain para participar en Cukie Master o una mecanica equivalente sin moverlo on-chain. | Mongo lock interno. | Ver posicion, retirar si reglas/ventana lo permiten. No listar desde dapp, no aportar a otro pool. | Si owner cambia o listing aparece, invalidar lock y pasar a `invalidated` hasta reconciliar. |
| `in_pool` | NFT aportado al pool de Cukies para asignacion a partidas/rewards. | Mongo `CukiePoolPosition` + lock interno. | Ver posicion, solicitar salida si no esta asignado. No usar como NFT propio en partida ni listar desde dapp. | Si owner cambia, cerrar posicion como invalidada. Si solicita salida, pasar a `available` solo tras liberar locks. |
| `assigned_to_game` | NFT reservado temporalmente para una game session. | Mongo `GameSessionEconomy` + lock temporal. | Solo usado por la session asignada. No retirar ni reasignar. | Al finalizar/expirar session, liberar lock y volver a `in_pool`, `soft_staked` o `available` segun `previousState`. |
| `invalidated` | El asset tenia uso economico activo, pero una evidencia lo invalida. | Reconciliador backend. | Solo lectura, soporte/ops. No acciones economicas. | Requiere job o intervencion ops para cerrar locks, ajustar allocations futuras y recalcular estado. |
| `unknown` | El sistema no puede determinar estado seguro. | Reconciliador/backend. | Solo lectura. No acciones economicas. | Reintentar indexacion. Si se resuelve owner/listing/bridge/locks, recalcular. Si no, abrir alerta ops. |

## Precedencia de estados

Cuando varias evidencias compiten, se aplica esta precedencia, de mayor a menor:

1. `invalidated`
2. `unknown`
3. `bridging`
4. `assigned_to_game`
5. `listed`
6. `in_pool`
7. `soft_staked`
8. `available`

Razonamiento:

- `invalidated` y `unknown` bloquean por seguridad.
- `bridging` bloquea porque owner/red puede cambiar.
- `assigned_to_game` protege sesiones en curso.
- `listed` evita usar economicamente un NFT que el usuario intenta vender.
- `in_pool` y `soft_staked` son locks internos controlables por backend.
- `available` solo existe cuando no hay evidencia incompatible.

## Exclusiones duras

Un NFT no puede estar simultaneamente en:

- `listed` y `in_pool`
- `listed` y `soft_staked`
- `listed` y `assigned_to_game`
- `bridging` y cualquier estado economico activo
- `in_pool` y `soft_staked`, salvo que una decision futura defina un pool como subtipo de soft staking
- `assigned_to_game` y otra `assigned_to_game` activa
- `invalidated` y cualquier accion economica permitida
- `unknown` y cualquier accion economica permitida

La implementacion puede guardar locks historicos, pero solo uno puede ser activo para una misma dimension economica.

## Flags derivados permitidos

Estos flags pueden coexistir con `canonicalState`, pero no son estados canonicos:

- `isOwnerVerified`
- `isOriginalGeneration`
- `isSecondGeneration`
- `isEligibleForCukieMaster`
- `isEligibleForPool`
- `hasActiveListing`
- `hasBridgePending`
- `hasInternalLock`
- `hasGameReservation`
- `needsReconciliation`
- `requiresOpsReview`

La UI debe mostrar acciones desde `canonicalState` + permisos derivados, no desde flags aislados.

## Estados de wallet

La wallet puede tener estados derivados para UX y API:

| Estado wallet | Significado | Impacto |
| --- | --- | --- |
| `disconnected` | No hay wallet conectada. | UI pide conectar. No hay acciones economicas. |
| `wrong_chain` | Wallet EVM conectada a red distinta de BSC para acciones UKI. | UI pide switch a BSC. Puede mostrar datos cacheados solo lectura. |
| `connected_unverified` | Wallet conectada, pero inventario/indexer no reconciliado. | Solo lectura parcial. Acciones NFT bloqueadas. |
| `ready` | Wallet conectada, red correcta y datos reconciliados. | Acciones segun estado de cada asset. |
| `ops_blocked` | Wallet marcada para revision operativa o riesgo. | Acciones economicas bloqueadas hasta resolver. |

Estos estados no sustituyen a los estados de cada NFT. Una wallet `ready` puede tener assets `unknown` o `invalidated`.

## Reglas de recuperacion

### Mongo dice available, marketplace dice listed

Resultado: `listed`.

Accion:

- Bloquear pool/staking/game assignment.
- Crear audit log `state_reconciled`.
- Si existia lock interno, marcar lock como `conflicted` y abrir alerta ops.

### Mongo dice in_pool, owner chain/indexer cambio

Resultado: `invalidated`.

Accion:

- Cerrar posicion de pool para periodos futuros.
- No revertir rewards ya cerrados sin decision ops.
- Evitar nueva asignacion a partida.
- Crear alerta con owner anterior, owner nuevo y fuente.

### Mongo dice assigned_to_game, session expirada

Resultado: volver a `previousState` si no hay evidencia externa mas fuerte.

Accion:

- Job libera lock temporal.
- Registra `game_assignment_expired`.
- Recalcula estado aplicando precedencia completa.

### Bridge pendiente sin confirmacion

Resultado: `bridging`.

Accion:

- Bloquear acciones economicas.
- Reintentar por job.
- Si supera la ventana definida en #18, pasar a `unknown` con `requiresOpsReview`.

### Indexer no responde

Resultado: conservar ultimo estado seguro si no habilita nuevas acciones; si se necesita decidir una accion nueva, usar `unknown`.

Accion:

- La UI puede mostrar datos antiguos con timestamp.
- No permitir nueva entrada a pool, nueva asignacion o nuevo cupo NFT hasta reconciliar.

### Listing desaparece del marketplace

Resultado: recalcular.

Accion:

- Validar owner.
- Aplicar locks internos activos.
- Volver a `available`, `in_pool`, `soft_staked` o `assigned_to_game` segun corresponda.

## Reglas para acciones

| Accion | Estados permitidos | Validacion inmediata |
| --- | --- | --- |
| Mostrar en inventario | Todos | Ninguna, pero mostrar warning en `unknown`/`invalidated`. |
| Usar para cupo NFT | `available`, `soft_staked` si la ruta NFT lo define asi | Owner verificado, rareza conocida, no bridge/listing activo. |
| Aportar a pool | `available` | Owner verificado, rareza conocida, no listing, no bridge, no lock activo. |
| Retirar de pool | `in_pool` | No `assigned_to_game`, ventana/regla de salida cumplida. |
| Asignar a partida propia | `available` o estado especifico futuro | Owner verificado y session reservation atomica. |
| Asignar desde pool | `in_pool` | Lock temporal atomico y no estar ya asignado. |
| Liberar asignacion de partida | `assigned_to_game` | Session finalizada, expirada o rechazada. |
| Listar desde dapp futura | `available` | No lock activo y owner verificado. |

## Auditoria minima

Cada cambio de `canonicalState` debe registrar:

- `assetId`
- `previousState`
- `nextState`
- `reason`
- `source`
- `evidenceHash` o referencias a evidencias
- `actor`: `system`, `job`, `admin`, `user`
- `jobRunId` si aplica
- `createdAt`

Los cambios que afecten rewards, cupos o partidas deben ser append-only y nunca sobrescribir el historial.

## Implicaciones para implementacion

### `NftInventoryService`

Debe exponer:

- `getWalletNfts(wallet)`
- `getAssetState(assetId)`
- `reconcileAsset(assetId)`
- `lockAsset(assetId, reason, owner, ttl?)`
- `unlockAsset(assetId, reason)`
- `assertActionAllowed(assetId, action)`

### Modelo de datos

El modelo futuro debe separar:

- asset normalizado,
- evidencias externas,
- locks internos,
- cambios de estado,
- posiciones de pool,
- asignaciones temporales de partida.

No conviene guardar un unico campo `status` sin historial.

### Dapp

La dapp debe renderizar acciones desde `canonicalState`:

- `available`: acciones principales.
- `listed`/`bridging`: solo lectura con CTA informativo.
- `in_pool`/`soft_staked`: gestion de posicion.
- `assigned_to_game`: estado temporal.
- `unknown`/`invalidated`: bloqueo y soporte.

### Contratos

Los contratos no deben conocer estos estados NFT. Solo deben exponer eventos de UKI, staking y claims. La excepcion seria una futura decision de mover staking NFT on-chain, que requeriria un ADR nuevo.

## Decisiones pendientes para #18

- Ventana maxima de tolerancia para indexer/bridge no disponible.
- Numero de confirmaciones BSC antes de considerar eventos finales.
- Politica de correccion si un NFT invalidado ya genero rewards en un periodo cerrado.
- Frecuencia de reconciliacion de ownership/listing/bridge.

