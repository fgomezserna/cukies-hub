# UKI NftInventoryService specification

Estado: especificacion inicial.
Issue: #22 `UKI-002.3`.
Fecha: 2026-05-12.

## Objetivo

`NftInventoryService` es la capa estable entre las bases existentes de Cukies/marketplace y la nueva economia UKI. Su responsabilidad es devolver NFTs normalizados, validar ownership, resolver estado canonico y proteger acciones economicas contra doble uso.

No debe duplicar el marketplace ni custodiar NFTs. Debe leer fuentes existentes, normalizarlas y aplicar reglas de consistencia/locks.

## Fuentes

La implementacion debe usar como base:

- `docs/uki-nft-data-inventory.md`
- `docs/uki-nft-data-quality-report.md`
- `docs/adr-uki-economic-operations.md`
- `docs/adr-uki-canonical-asset-states.md`
- `docs/adr-uki-consistency-policy.md`

## Responsabilidades

El servicio debe:

- normalizar NFTs BSC/TRON,
- exponer owner, rareza, generacion, metadata minima y estado canonico,
- validar ownership antes de locks o acciones economicas,
- detectar listing/bridge/locks incompatibles,
- crear y liberar locks atomicos,
- proteger pool, Cukie Master y game sessions frente a doble uso,
- exponer timestamps/freshness para UI y jobs,
- producir logs auditables para cambios de estado y locks.

El servicio no debe:

- calcular rewards,
- calcular ranking,
- mover UKI,
- ejecutar compras/claims,
- decidir tokenomics,
- confiar en datos enviados por cliente.

## Tipos normalizados

```ts
type ChainNetwork = 'bsc' | 'tron' | 'unknown';

type CukieAssetState =
  | 'available'
  | 'listed'
  | 'bridging'
  | 'soft_staked'
  | 'in_pool'
  | 'assigned_to_game'
  | 'invalidated'
  | 'unknown';

type CukieGeneration = 'original' | 'second_generation' | 'unknown';

type CukieRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'goat'
  | 'unknown';

type CukieAsset = {
  assetId: string;
  network: ChainNetwork;
  contractAddress: string | null;
  tokenId: string | null;
  ownerWallet: string | null;
  rarity: CukieRarity;
  generation: CukieGeneration;
  canonicalState: CukieAssetState;
  stateReason: string | null;
  imageUrl: string | null;
  name: string | null;
  metadata: Record<string, unknown> | null;
  listingStatus: string | null;
  bridgeStatus: string | null;
  sourceRefs: SourceRef[];
  freshness: DataFreshness;
};

type SourceRef = {
  source: 'cukies' | 'originals' | 'wallets' | 'tx_nfts' | 'txMarketplace' | 'indexer' | 'manual';
  collection?: string;
  documentId?: string;
  observedAt: string;
};

type DataFreshness = {
  lastSyncedAt: string | null;
  ownerCheckedAt: string | null;
  marketplaceCheckedAt: string | null;
  bridgeCheckedAt: string | null;
  isStale: boolean;
  staleReasons: string[];
};
```

## API propuesta

### `getWalletNfts(wallet)`

Devuelve todos los NFTs conocidos para una wallet, sin filtrar por uso.

```ts
type GetWalletNftsInput = {
  wallet: string;
  includeStale?: boolean;
  includeInvalidated?: boolean;
};

type GetWalletNftsResult = {
  wallet: string;
  normalizedWallet: string;
  assets: CukieAsset[];
  warnings: InventoryWarning[];
};
```

Reglas:

- Normalizar wallet: BSC lowercase, Tron uppercase.
- Incluir assets `listed`, `bridging`, `unknown` e `invalidated` salvo que se filtren explicitamente.
- No habilitar acciones solo por aparecer en esta respuesta.
- Incluir warnings si la fuente esta stale o incompleta.

### `getPlayableCukies(wallet)`

Devuelve NFTs que pueden usarse en flujo de juego propio.

```ts
type GetPlayableCukiesInput = {
  wallet: string;
  gameId?: string;
  requireFreshOwnership?: boolean;
};

type GetPlayableCukiesResult = {
  wallet: string;
  assets: CukieAsset[];
  rejected: RejectedAsset[];
};
```

Reglas:

- Permitidos inicialmente: `available`.
- Excluir `listed`, `bridging`, `in_pool`, `assigned_to_game`, `invalidated`, `unknown`.
- Revalidar owner/listing/bridge si `requireFreshOwnership` es true.
- No asignar locks; solo lectura filtrada.

### `getPoolEligibleCukies(wallet)`

Devuelve NFTs que pueden aportarse al pool de Cukies.

```ts
type GetPoolEligibleCukiesInput = {
  wallet: string;
  poolId?: string;
  requireFreshOwnership?: boolean;
};

type GetPoolEligibleCukiesResult = {
  wallet: string;
  assets: CukieAsset[];
  rejected: RejectedAsset[];
};
```

Reglas:

- Permitidos: `available`.
- Requerir `ownerWallet`, `network`, `tokenId`, `rarity` y `generation` resueltos.
- Excluir cualquier asset con listing/bridge/lock activo.
- Si `generation` o `rarity` es `unknown`, rechazar con motivo recuperable.

### `lockCukie(assetId, reason)`

Crea un lock atomico para uso economico.

```ts
type CukieLockReason =
  | 'pool_deposit'
  | 'game_assignment'
  | 'soft_stake'
  | 'ops_hold'
  | 'reconciliation';

type LockCukieInput = {
  assetId: string;
  reason: CukieLockReason;
  wallet?: string;
  sessionId?: string;
  poolId?: string;
  ttlSeconds?: number;
  idempotencyKey: string;
};

type LockCukieResult = {
  lockId: string;
  asset: CukieAsset;
  previousState: CukieAssetState;
  nextState: CukieAssetState;
  expiresAt: string | null;
};
```

Reglas:

- Debe ser atomico por `assetId`.
- Debe revalidar estado antes de crear lock.
- Debe rechazar si existe lock incompatible activo.
- Debe guardar `previousState` para desbloqueos temporales.
- Debe ser idempotente por `idempotencyKey`.

Mapeo de estado:

| Reason | Estado resultante |
| --- | --- |
| `pool_deposit` | `in_pool` |
| `game_assignment` | `assigned_to_game` |
| `soft_stake` | `soft_staked` |
| `ops_hold` | `invalidated` o `unknown` segun causa |
| `reconciliation` | `unknown` |

### `unlockCukie(assetId, reason)`

Libera un lock activo.

```ts
type UnlockCukieInput = {
  assetId: string;
  lockId?: string;
  reason: 'pool_withdraw' | 'game_finished' | 'game_expired' | 'ops_release' | 'reconciliation_resolved';
  idempotencyKey: string;
};

type UnlockCukieResult = {
  asset: CukieAsset;
  releasedLockIds: string[];
  previousState: CukieAssetState;
  nextState: CukieAssetState;
};
```

Reglas:

- Debe liberar solo locks compatibles con el motivo.
- Debe recalcular estado canonico tras liberar.
- Si hay listing/bridge/owner conflict al liberar, no volver a `available`; usar precedencia canonica.
- Debe ser idempotente.

### `validateOwnership(assetId, wallet)`

Comprueba si una wallet puede actuar sobre un asset.

```ts
type ValidateOwnershipInput = {
  assetId: string;
  wallet: string;
  requireFresh?: boolean;
  action?: 'play' | 'pool_deposit' | 'pool_withdraw' | 'soft_stake' | 'list' | 'admin_review';
};

type ValidateOwnershipResult = {
  isOwner: boolean;
  normalizedWallet: string;
  ownerWallet: string | null;
  asset: CukieAsset;
  freshness: DataFreshness;
  blockers: InventoryBlocker[];
};
```

Reglas:

- Debe comparar wallets normalizadas por red.
- Si `requireFresh` y la fuente esta stale, devolver blocker `stale_ownership`.
- Si `canonicalState` bloquea la accion, devolver blocker de estado.
- No debe crear locks.

## Errores y blockers

```ts
type InventoryBlocker =
  | 'asset_not_found'
  | 'owner_mismatch'
  | 'unknown_owner'
  | 'unknown_network'
  | 'missing_token_id'
  | 'missing_rarity'
  | 'missing_generation'
  | 'listed'
  | 'bridging'
  | 'already_locked'
  | 'assigned_to_game'
  | 'invalidated'
  | 'unknown_state'
  | 'stale_ownership'
  | 'stale_marketplace'
  | 'stale_bridge'
  | 'ops_blocked';
```

Los blockers deben ser legibles por UI y jobs. No devolver solo `false` sin motivo.

## Locks y auditoria

Cada lock debe guardar:

- `lockId`
- `assetId`
- `reason`
- `wallet`
- `sessionId`
- `poolId`
- `previousState`
- `nextState`
- `idempotencyKey`
- `createdAt`
- `expiresAt`
- `releasedAt`
- `releasedReason`
- `createdBy`

Cada cambio de estado debe registrar:

- `assetId`
- `previousState`
- `nextState`
- `reason`
- `source`
- `evidenceRefs`
- `jobRunId`
- `createdAt`

## Resolucion de fuentes

Orden inicial de resolucion:

1. Asset candidates desde `cukies` y `originals`.
2. Identity fields: `network`, `contractAddress`, `tokenId`.
3. Owner desde campo directo si existe; si no, `wallets` o ultimo movimiento valido `tx_nfts`.
4. Rarity/generation desde campos directos; si no, metadata/attributes o mapping de coleccion.
5. Listing desde `txMarketplace` o fuente activa de marketplace si se detecta.
6. Bridge desde campo/fuente de bridge si se detecta.
7. Locks internos de la nueva dapp.
8. Resolucion de `canonicalState`.

Si una fuente necesaria no existe, el servicio debe devolver blocker y no inventar elegibilidad.

## Semantica de consistencia

Antes de acciones economicas:

- `lockCukie`: requiere datos frescos de owner/listing/bridge segun `docs/adr-uki-consistency-policy.md`.
- `validateOwnership(requireFresh: true)`: debe bloquear si no puede revalidar.
- `getWalletNfts`: puede devolver datos stale con warnings.
- `getPlayableCukies` y `getPoolEligibleCukies`: por defecto no deben incluir stale/unknown.

## Uso por modulo

| Consumidor | Metodos |
| --- | --- |
| Dashboard wallet | `getWalletNfts` |
| Cukie Master ruta NFT | `getWalletNfts`, `validateOwnership` |
| Pool de Cukies | `getPoolEligibleCukies`, `lockCukie`, `unlockCukie` |
| Game economy session | `getPlayableCukies`, `lockCukie`, `unlockCukie` |
| Reconciliacion | `validateOwnership`, `unlockCukie`, locks `reconciliation` |
| Admin/Ops | `getWalletNfts`, audit logs, blockers |

## Criterios para implementacion posterior

- No crear una dependencia directa desde UI a colecciones historicas.
- No devolver documentos Mongo originales al cliente.
- No permitir acciones economicas con `unknown`, `invalidated`, `bridging` o `listed`.
- No permitir dos locks activos incompatibles sobre el mismo asset.
- No hardcodear Treasure Hunt dentro del servicio.
- Exponer errores recuperables para UI y jobs.

