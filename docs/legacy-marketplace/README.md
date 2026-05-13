# Legacy Marketplace Cukies World

Auditoria inicial de `https://marketplace.cukies.world/` para reconstruir el sistema en la nueva plataforma Cukies Hub.

Fecha de extraccion: 2026-05-12.

## Fuentes revisadas

- SPA publica: https://marketplace.cukies.world/
- Manifest: https://marketplace.cukies.world/manifest.json
- Bundle principal detectado: `main.42c14afc676a9b01.js`
- ABIs publicas bajo `https://marketplace.cukies.world/assets/contracts/...`
- API GraphQL: https://api.cukies.world/data-graphql/graphql
- API auth legacy: https://api.cukies.world/auth
- Validacion visual y rutas con Playwright sobre la SPA publica.
- Issue de rotacion de secretos expuestos: https://github.com/fgomezserna/cukies-hub/issues/160

## Stack legacy detectado

- React SPA compilada con Nx/Webpack, servida como assets estaticos detras de Cloudflare.
- Routing con React Router.
- Apollo Client contra GraphQL.
- BSC con `ethers@5`, `@web3-onboard/react` y `@web3-onboard/injected-wallets`.
- TRON con `tronweb`.
- UI legacy basada en Bootstrap/React Bootstrap, Font Awesome y CSS propio.

La web publica redirige `/` a `/home`. El HTML base solo carga el root React; la informacion util esta en los bundles y en assets JSON de contratos.

## Contratos

El manifiesto machine-readable esta en `contracts.json`.

### TRON

| Alias | Address |
| --- | --- |
| `MINT` | `TUrjiyFSa1pq8TGZJnsTAHcgyxnnRmZjN7` |
| `TOKEN` | `TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe` |
| `REFERRALS` | `TZ4QM9RF1pxfoxnPY8UGAQEEwq5SDoZXk4` |
| `POINTS` | `TWwNJEySYrkNXTpDBF7WfGwkoW4YTZ4yKA` |
| `STAKING_POINTS` | `TUfbQaVERA1TmT31LU3HWJS6xsW3B8VfUY` |
| `BREEDING_POINTS` | `TXrvQKgzWpsMkp9ebiF1uXNPRgKxNanB9S` |
| `MARKETPLACE` | `TWDoJEq4eVd9vUgQ6f5knjqouRBPyGDzSB` |
| `BRIDGE` | `TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ` |

### BSC

| Alias | Address |
| --- | --- |
| `TOKEN` | `0x0dbDeBCC62f11005BF434ABFad74564E896aC861` |
| `POINTS` | `0x6875F0C9547c35F7EE700230FE8B9A7687F3ddB2` |
| `STAKING_POINTS` | `0xF381bfB59A2ae9623eFBce2C83AafF60f783cc6F` |
| `BREEDING_POINTS` | `0x39Be8C4FA342C5f3C10d7c16941A0946D29Ade4A` |
| `MARKETPLACE` | `0x2C291aD4C491aCA75Fb3fb5a17465bBC871FBF91` |
| `BRIDGE` | `0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E` |

## ABIs extraidas

Las ABIs normalizadas estan en:

- BSC: `docs/legacy-marketplace/abis/bsc/*.abi.json`
- TRON: `docs/legacy-marketplace/abis/tron/*.abi.json`

Contratos extraidos:

- BSC: `token`, `points`, `stakingPoints`, `breedingPoints`, `marketplace`, `bridge`.
- TRON: `referrals`, `mint`, `token`, `points`, `stakingPoints`, `breedingPoints`, `marketplace`, `bridge`.

Notas de formato:

- BSC publica cada ABI como array JSON directo.
- TRON publica JSON con `bytecode` y `abi.entrys`; aqui se ha guardado solo el array de ABI.

## Vistas legacy

Rutas navegables detectadas en el router:

- `/home`
- `/ecommerce/marketplace`
- `/ecommerce/product-page/:cukiID`
- `/ecommerce/gems` coming soon
- `/ecommerce/lands` coming soon
- `/ecommerce/resources` coming soon
- `/farming/cukies`
- `/farming/gems` coming soon
- `/farming/lands` coming soon
- `/breeding/breed`
- `/breeding/active-breeds`
- `/breeding/completed-breeds`
- `/bridges/cukies`
- `/bridges/gems` coming soon
- `/bridges/resources` coming soon
- `/users/profile`
- `/users/cukies`
- `/users/rewards` coming soon
- `/users/points`
- `/user/uki` coming soon
- `/user/gemd` coming soon

La home legacy muestra tres bloques de actividad: `Recently Created`, `Recently Listed` y `Recently Sold`. El marketplace tiene filtros por venta, red, tipo, skills, generacion e hijos, pero actualmente queda en `LOADING...` y muestra `NaN - / Results` cuando la API no responde bien.

## APIs detectadas

### GraphQL

Endpoint usado por Apollo:

```text
https://api.cukies.world/data-graphql/graphql
```

La introspeccion responde. Campos de query detectados:

- `cukies`, `newCuki`, `cuki`, `countCukies`
- `lastMinted`, `specificCukies`
- `lastFiveBred`, `lastFiveSold`, `lastFiveListed`
- `bredCukies`, `dashboardCache`, `getHomeHistoryEvents`, `getEventPrice`
- `transactions`
- `points`, `point`
- `referrals`, `referral`
- `users`, `user`
- `login`
- `wallets`, `wallet`

Mutations detectadas:

- `createCuki`, `updateCuki`, `deleteCuki`
- `updateOwner`, `addChild`
- `createEvent`, `createCompletedEvent`, `createNftTransaction`
- `createPoint`, `updatePoint`, `deletePoint`
- `createReferral`, `updateReferral`, `deleteReferral`
- `createUser`, `updateUser`, `updatePassword`, `deleteUser`
- `linkWallet`
- `createWallet`, `updateWallet`, `deleteWallet`

Observacion: `lastFiveListed` respondio con `INTERNAL_SERVER_ERROR`; `countCukies` y `cukies` hicieron timeout en pruebas sin autenticacion.

### Auth REST legacy

Base detectada:

```text
https://api.cukies.world/auth
```

Rutas usadas por la SPA:

- `GET /login/logout`
- `POST /login/user`
- `POST /login/wallet`
- `POST /login/google`
- `POST /login/google/register`

### Assets

Imagenes NFT:

```text
https://cukies.s3.eu-west-3.amazonaws.com/png/tokens/v2/TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe/<tokenId>.png
```

Nota de migracion: Mongo legacy todavia guarda muchas URLs sin `/v2/`, por ejemplo
`/png/tokens/TVk.../<tokenId>.png`. Esas rutas antiguas pueden devolver error, asi
que la nueva capa normaliza siempre a la ruta `v2`.

## Operaciones on-chain usadas por UI

Marketplace:

- Comprar: `marketplace.buyToken(tokenId)`
- Leer fee de cancelacion: `marketplace.feeCancelPrice()`
- Cancelar venta: `marketplace.cancelTokenSale(tokenId)`
- Aprobar marketplace: `token.isApprovedForAll(owner, marketplaceAddress)` y `token.setApprovalForAll(marketplaceAddress, true)`
- Poner en venta: `marketplace.putTokenOnSale(tokenId, price)`

Token/NFT:

- Transferir: `token.transferFrom(from, to, tokenId)`
- Leer ownership, URI, supply, tipos y skills desde ABI `token`.

Farming:

- Aprobar staking: `token.setApprovalForAll(stakingPointsAddress, true)`
- Stake: `stakingPoints.stake(tokenId)`
- Unstake: `stakingPoints.unstake(tokenId)`
- Leer `getTokensOwner`, `calcPoints`, `pointsToType`.

Breeding:

- Leer `breedingPoints.getMaxBreedsByCukie()`
- Leer `breedingPoints.getAllBreedsOwner(address)`
- Iniciar breeding: `breedingPoints.start(parent1, parent2)`
- Finalizar: `breedingPoints.breed(breedId)`
- Leer costes y estados: `getCostPoints`, `getBreed`, `getActiveBreedsOwner`.

Bridges:

- Contratos `bridge` existen en ambas redes.
- Funciones principales: `jumpInBridge`, `jumpOutBridge`, `bridgePrice`, `changeBridgePrice`, `pause`, `unpause`.

## Riesgos y decisiones antes de migrar

- El bundle publico contiene variables de entorno sensibles de la build legacy. No se han copiado a este repo. Hay que rotar credenciales, tokens de admin, claves privadas y secretos asociados antes de reutilizar infraestructura.
- La UI legacy incluye un signer BSC de fallback en cliente. En la nueva plataforma no debe existir ninguna clave privada en frontend.
- La API GraphQL legacy responde a introspeccion, pero varias queries publicas fallan o hacen timeout. Para producto nuevo conviene construir una capa propia de API/indexacion y tratar GraphQL legacy como fuente temporal, no como dependencia critica.
- Hay referencias a `dappEnv.NFTS` para `marketplace/update/<txId>`, pero no he encontrado un valor publico resuelto en la configuracion efectiva del frontend. Requiere validacion si se quiere conservar ese flujo.
- El diseno visual no deberia portarse tal cual. La nueva implementacion debe usar el lenguaje de la home actual y rescatar solo funcionalidad, datos y contratos.

## Propuesta de migracion

1. Crear una capa `legacy-marketplace` en la dapp actual con configuracion de redes, contratos y ABIs versionadas.
2. Implementar BSC con `wagmi/viem`, alineado con el provider actual de la plataforma.
3. Aislar TRON en un adapter propio, cargado solo en las vistas que lo necesiten.
4. Rehacer el marketplace como flujo nuevo: listado, detalle NFT, compra, venta/cancelacion, farming, breeding y bridges.
5. Indexar eventos on-chain y snapshots en Mongo/backend para no depender de queries lentas del GraphQL legacy.
6. Reusar el diseno de la home como sistema visual, con tablas/filtros densos para marketplace y paneles compactos para acciones on-chain.

## Integracion inicial en Cukies Hub

- Configuracion importable: `dapp/src/lib/legacy-marketplace/config.ts`
- ABIs importables: `dapp/src/lib/legacy-marketplace/abis.ts`
- Adapter BSC con `viem`: `dapp/src/lib/legacy-marketplace/bsc.ts`
- Adapter TRON para TronLink: `dapp/src/lib/legacy-marketplace/tron.ts`
- Endpoint interno de configuracion: `/api/legacy-marketplace/config`
- Endpoint interno de actividad legacy con timeout y errores aislados: `/api/legacy-marketplace/home`
- Endpoint interno de inventario: `/api/legacy-marketplace/cukies`
- Endpoint interno de detalle: `/api/legacy-marketplace/cukies/:tokenId`
- Endpoint interno de CukiePoints: `/api/legacy-marketplace/points`
- Endpoint interno de candidatos breeding: `/api/legacy-marketplace/breeding/candidates`
- Endpoint interno de nacimientos breeding: `/api/legacy-marketplace/breeding/completed`
- Vista interna implementada: `/marketplace`
- Detalle NFT implementado: `/marketplace/:tokenId`
- Vista CukiePoints implementada: `/cukiepoints`, con alias legacy `/users/points`
- Vista breeding implementada: `/breeding`, con aliases legacy `/breeding/breed`,
  `/breeding/active-breeds` y `/breeding/completed-breeds`
- Vista bridge implementada: `/bridge`, con alias legacy `/bridges/cukies`

La implementacion actual usa Mongo legacy como fuente principal cuando `CUKIES_DATABASE_URL` esta disponible y conserva GraphQL como fallback. Las acciones on-chain usan wallet del usuario: BSC con `wagmi/viem` y TRON con TronLink. No hay signers ni claves privadas en cliente.

La ficha nueva replica la estructura funcional de la ficha legacy: `General info`,
`Skills`, `Family` e `History`. El detalle hidrata padres/hijos desde la coleccion
`cukies` y resuelve referencias de historial contra `tx_nfts` y `processedEvents`
cuando el registro legacy solo contiene IDs de transaccion.

El modulo de breeding reconstruye las tres vistas legacy: seleccion de dos padres
Gen 1 disponibles, consulta de puntos/coste y approval, lectura de breeds activos
desde `breedingPoints.getAllBreedsOwner/getBreed`, apertura con
`breedingPoints.breed(breedId)` y listado de Cukies nacidos desde Mongo con
`origin: breed`.

La vista CukiePoints reconstruye `/users/points`: balance por wallet desde
`points.getPoints(address)`, supply emitida/quemada desde el ABI `points` y
actividad indexada desde la coleccion Mongo legacy `points`.

La vista bridge reconstruye `/bridges/cukies`: selecciona Cukies disponibles
por wallet/red, lee `bridge.bridgePrice()` y `bridge.paused()`, gestiona
approval contra el contrato `bridge` y ejecuta `jumpInBridge(tokenId,
destOwner, chainPrefix)`. Los Cukies pendientes se monitorizan desde Mongo con
estado `inBridge`. `jumpOutBridge` queda tratado como flujo operativo/backend
porque requiere metadata completa del NFT en el ABI.
