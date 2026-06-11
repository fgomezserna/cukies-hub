# Contract ownership inventory

Estado: inventario operativo de seguridad.
Ultima comprobacion on-chain: 2026-06-04.

Este documento registra las direcciones de contratos conocidas y los owners/admins observados. Si una direccion marcada como critica aparece todavia como owner/admin, debe tratarse como riesgo activo hasta completar rotacion a una wallet limpia o multisig.

## Alerta critica

La wallet `0x7894df8379c2e156f0e4d9df0829127d605bd52b` sigue siendo `owner()` de los contratos legacy BSC mainnet listados abajo.

Se debe rotar con prioridad critica porque:

- Es una EOA, no una multisig.
- BscScan muestra una transaccion saliente a una direccion etiquetada como `Fake_Phishing679116` el 2024-12-10.
- La wallet tuvo actividad saliente reciente el 2026-04-24.
- Mientras conserve ownership, puede ejecutar funciones owner/admin en contratos legacy.

Accion requerida: transferir ownership de todos los contratos legacy BSC mainnet a una wallet segura o multisig aprobada, y registrar tx hashes de la rotacion.

## Legacy Cukies BSC mainnet

Network: BNB Smart Chain mainnet.
Chain id: `56`.
Owner critico actual: `0x7894df8379c2e156f0e4d9df0829127d605bd52b`.
Comprobacion: `owner()` por RPC publico de BSC mainnet.

| Alias | Contract address | Owner actual | Prioridad |
| --- | --- | --- | --- |
| `TOKEN` | `0x0dbDeBCC62f11005BF434ABFad74564E896aC861` | `0x7894df8379c2e156f0e4d9df0829127d605bd52b` | Critico: rotar |
| `POINTS` | `0x6875F0C9547c35F7EE700230FE8B9A7687F3ddB2` | `0x7894df8379c2e156f0e4d9df0829127d605bd52b` | Critico: rotar |
| `STAKING_POINTS` | `0xF381bfB59A2ae9623eFBce2C83AafF60f783cc6F` | `0x7894df8379c2e156f0e4d9df0829127d605bd52b` | Critico: rotar |
| `BREEDING_POINTS` | `0x39Be8C4FA342C5f3C10d7c16941A0946D29Ade4A` | `0x7894df8379c2e156f0e4d9df0829127d605bd52b` | Critico: rotar |
| `MARKETPLACE` | `0x2C291aD4C491aCA75Fb3fb5a17465bBC871FBF91` | `0x7894df8379c2e156f0e4d9df0829127d605bd52b` | Critico: rotar |
| `BRIDGE` | `0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E` | `0x7894df8379c2e156f0e4d9df0829127d605bd52b` | Critico: rotar |

## UKI presale BSC testnet

Network: BSC testnet.
Chain id: `97`.
Fuente de direcciones: `docker-compose.coolify.yml` y `docs/coolify-deployment.md`.
Comprobacion: RPC publico de BSC testnet.

| Alias | Contract / wallet address | Owner/admin observado | Nota |
| --- | --- | --- | --- |
| `ASM_TESTNET` | `0xf93dd40Bf8bD8dDf7C785AA87dc13C3c3FeB6c8C` | No expone `owner()` en la comprobacion usada | Token ASM testnet / `tASM`. |
| `UKI_TOKEN` | `0x90f87D01984A336eD1AaF8fFcdA7BcDaF839ae36` | `0xba84bffad693edbd4b3f7899fb6e3ccb0c1d7820` | `owner()`. |
| `VESTING_VAULT` | `0xA22AF68c7AF2e13C9d7217fDA705132080e91Ba5` | `0xba84bffad693edbd4b3f7899fb6e3ccb0c1d7820` | `DEFAULT_ADMIN_ROLE`. |
| `PRESALE` | `0x24aC03c96649C7fb8DDF4E92fB9aB072592f2ED0` | `0xba84bffad693edbd4b3f7899fb6e3ccb0c1d7820` | `owner()`. |
| `PRESALE_TREASURY` | `0x19907a00abf02975fb60d616c99565894c08d859` | N/A | `Presale.treasury()`. |

## ASM BSC mainnet

Network: BNB Smart Chain mainnet.
Chain id: `56`.

| Alias | Address | Owner/admin observado | Nota |
| --- | --- | --- | --- |
| `ASM_MAINNET` / `CONCILIUM` | `0x40af8fd127dcd302d7ffa6f37cf5a002e54ac68c` | No comprobado en este inventario | Direccion aprobada en docs de deployment para produccion. |
