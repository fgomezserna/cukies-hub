# Cukies Chain Indexer

Indexer nuevo para reconstruir vistas Mongo desde eventos on-chain BSC/TRON sin depender del pipeline legacy.

## Scripts

```bash
pnpm --filter @cukies/chain-indexer run setup
pnpm --filter @cukies/chain-indexer run ingest:once
pnpm --filter @cukies/chain-indexer run import:legacy
pnpm --filter @cukies/chain-indexer run project:once
pnpm --filter @cukies/chain-indexer run dev
pnpm --filter @cukies/chain-indexer run status
```

## Base de datos

Por defecto escribe en `cukieshub-new` usando `CHAIN_INDEXER_MONGO_URL` o, si no existe, `DATABASE_URL`.

Variables principales:

- `CHAIN_INDEXER_DB_NAME`: nombre de la BD nueva. Default: `cukieshub-new`.
- `CHAIN_INDEXER_MONGO_URL`: URI Mongo para el indexer.
- `CHAIN_INDEXER_CHAINS`: `BSC,TRON`, `BSC` o `TRON`.
- `CHAIN_INDEXER_CONTRACT_ALIASES`: filtro explicito por alias. Configurar una address por si sola no activa el contrato. `TOKEN` conserva la coleccion legacy; `TOKEN_V2` identifica de forma independiente la nueva coleccion ERC-721 custodiable.
- `CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID`: solo `56` o `97`. Cada RPC debe responder con ese chain id. Default: `56`.
- `CHAIN_INDEXER_BSC_RPC_URLS`: lista de RPCs BSC separados por coma. El indexer valida el chain id antes de usar cada uno y prueba el siguiente si uno falla.
- `CHAIN_INDEXER_BSC_RPC_URL`: RPC BSC unico. En chain `56`, `BSC_RPC_URL` y `https://bsc.rpc.blxrbdn.com` quedan como fallback legacy. En chain `97` se exige un RPC explicito y nunca se añade un fallback mainnet.
- `TRON_API_KEY` o `TRONGRID_API_KEY`: API key opcional de TronGrid.
- `CHAIN_INDEXER_START_BSC_BLOCK`: bloque inicial BSC. Default: `0`, que significa empezar live desde el ultimo bloque seguro. Para backfill historico usa un archive RPC y fija el bloque inicial legacy (`16906879`).
- `CHAIN_INDEXER_UKI_STAKING_ADDRESS` y `CHAIN_INDEXER_UKI_STAKING_START_BSC_BLOCK`: address y bloque de despliegue obligatorios al activar `UKI_STAKING`.
- `CHAIN_INDEXER_TOKEN_ADDRESS`, `CHAIN_INDEXER_MARKETPLACE_ADDRESS` y `CHAIN_INDEXER_BRIDGE_ADDRESS`: fuentes NFT BSC legacy explicitas. En chain `97` no existe fallback a las direcciones legacy de mainnet.
- `CHAIN_INDEXER_TOKEN_V2_ADDRESS`: nueva coleccion ERC-721 custodiable. Usa identidad y cursor propios y nunca reutiliza la address ni la identidad verificada de `TOKEN`.
- `CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_ADDRESS` y `CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_ADDRESS`: contratos de custodia para Cukie Master y Cukie Pool. Cada uno se activa como alias independiente.
- Cada alias NFT requiere `*_START_BSC_BLOCK`, `*_DEPLOYMENT_BSC_BLOCK`, `*_DEPLOYMENT_TX_HASH` y `*_RUNTIME_CODE_HASH`. El start block debe coincidir exactamente con el bloque de despliegue.
- `CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS` y `CHAIN_INDEXER_REWARDS_DISTRIBUTOR_START_BSC_BLOCK`: address y bloque de despliegue obligatorios al activar `REWARDS_DISTRIBUTOR`.
- `CHAIN_INDEXER_START_TRON_TIMESTAMP_MS`: timestamp inicial TRON. Default: `0`.
- `CHAIN_INDEXER_BSC_CONFIRMATIONS`: confirmaciones antes de ingerir. Default: `12`.
- `CHAIN_INDEXER_MAX_BLOCK_RANGE`: bloques BSC por pasada/evento. Default: `5000`.
- `CHAIN_INDEXER_TRON_PAGE_LIMIT`: eventos TRON por pagina. Default: `200`.
- `CHAIN_INDEXER_TRON_REQUEST_DELAY_MS`: pausa entre requests TronGrid. Default: `500`.
- `CHAIN_INDEXER_PROJECT_BATCH_SIZE`: eventos a proyectar por ciclo. Default: `100`.
- `CHAIN_INDEXER_IMPORT_LEGACY_LIMIT`: eventos de `processedEvents` legacy a importar por pasada. Default: `10000`.
- `CHAIN_INDEXER_IMPORT_LEGACY_NETWORK`: filtro opcional para importar solo `BSC`, `TRON` o `BSC,TRON`.

Colecciones principales:

- `chain_events`: event store inmutable/idempotente.
- `chain_cursors`: checkpoints por contrato/evento.
- `chain_indexer_runs`: historial operativo.
- `chain_dead_letters`: errores permanentes de proyeccion.
- `cukies`, `tx_nfts`, `point_transactions`, `point_balances`, `marketplace_listings`, `bridge_transfers`: vistas de lectura nuevas.
- `CukieMetadataConfigured` materializa la rareza `1..6` y generacion `1..2` despues de su `Transfer` de mint verificado. Para `TOKEN_V2`, la identidad Mongo es compuesta por `chainId + collectionAddress + tokenId`, evitando colisiones con `TOKEN`.
- `nft_vault_collections`, `cukie_master_nft_positions`, `cukie_pool_nft_vault_positions`, `cukie_pool_calendar_versions` y `nft_vault_recovery_audit`: allowlists, posiciones custodiadas, calendario y recuperaciones de los vaults NFT.
- `uki_staking_positions`, `uki_staking_state`: balances absolutos por wallet y total global observados desde `Staked`/`Unstaked`.
- `reward_claim_batches`, `reward_claims`: lotes publicados/cerrados y claims confirmados de `RewardsDistributor`.

## Import legacy

`pnpm indexer:import:legacy` importa eventos desde `CUKIES_DATABASE_URL` (`processedEvents`) al nuevo `chain_events`, manteniendo idempotencia por `_id` normalizado. Sirve para sembrar `cukieshub-new` con historico legacy mientras la ingesta on-chain sigue viva/reconciliando.
