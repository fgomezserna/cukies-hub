# UKI sale contracts

Estado: implementacion inicial.
Issues: #27, #28, #29, #31, #32, #33, #35, #36, #68.
Fecha: 2026-05-12.

## Decision de framework

Se usa Hardhat con OpenZeppelin.

Motivos:

- El usuario pidio explicitamente Hardhat + OpenZeppelin para la venta.
- La dapp ya es TypeScript/Node/pnpm y Hardhat encaja con el monorepo.
- OpenZeppelin cubre ERC-20, Ownable, Pausable, AccessControl, ReentrancyGuard y SafeERC20.
- Hardhat permite tests unitarios, scripts de deploy, verificacion BscScan y export de ABI a la dapp.

Comandos:

```bash
pnpm --filter @cukies/contracts compile
pnpm --filter @cukies/contracts test
pnpm --filter @cukies/contracts deploy:testnet
pnpm --filter @cukies/contracts export:abi
```

## Contratos

### `UKIToken`

- ERC-20/BEP-20 compatible.
- Nombre: `Cukies UKI`.
- Simbolo: `UKI`.
- Decimales: 18.
- Supply inicial fijo en constructor.
- Mint inicial a `initialSupplyReceiver`.
- Burn habilitado por holders.
- Pausable por owner.
- Sin minter publico posterior.

Politica mint/burn:

- Mint solo en constructor.
- Burn permitido via `ERC20Burnable`.
- Supply adicional requiere contrato nuevo o decision explicita posterior.

### `VestingVault`

- Custodia UKI reservado para vesting.
- `VESTING_MANAGER_ROLE` crea schedules.
- Release lineal por beneficiario.
- Permite acumular compras multiples si comparten `start` y `duration`.
- No permite schedules conflictivos para el mismo beneficiario.

### `Presale`

- Compra con ASM via `transferFrom`.
- Envia ASM a `treasury`.
- Calcula UKI con `ukiPerAsm` escalado a `1e18`.
- Crea vesting para el comprador en `VestingVault`.
- Emite `Purchased`.
- Tiene ventana `saleStart/saleEnd`.
- Tiene min/max por compra.
- Tiene cap por wallet en ASM.
- Tiene cap global en UKI vendido.
- Pausable por owner.

## Reglas de preventa implementadas

| Regla | Implementacion |
| --- | --- |
| Fecha inicio | `saleStart` |
| Fecha fin | `saleEnd` |
| Ratio ASM/UKI | `ukiPerAsm`, escalado a `1e18` |
| Min compra | `minAsmPerPurchase` |
| Max compra | `maxAsmPerPurchase` |
| Wallet cap | `walletAsmCap` |
| Cap venta | `totalUkiForSale` |
| Pausas | `pause()` / `unpause()` |
| Vesting comprador | `VestingVault.createVesting` |
| Eventos | `Purchased`, config update events, OZ pause events |

Casos de borde:

- Compra antes/despues de ventana: revert `SaleNotOpen`.
- Compra por debajo de minimo: revert `PurchaseTooSmall`.
- Compra por encima de maximo: revert `PurchaseTooLarge`.
- Wallet supera cap: revert `WalletCapExceeded`.
- Cap global agotado: revert `SaleCapExceeded`.
- Contrato pausado: revert `EnforcedPause`.
- Vault sin UKI suficiente: revert `InsufficientUnallocatedBalance`.
- Allowance ASM insuficiente: revert del ERC-20.

Refund:

- No se implementa refund automatico.
- Una compra confirmada crea vesting.
- Cualquier politica de refund necesita decision separada y contrato adicional o funcion admin auditada.

## BSC testnet/mainnet

Configuracion en `packages/contracts/hardhat.config.cjs`:

- `bscTestnet`, chain id `97`.
- `bsc`, chain id `56`.
- RPC por env (`BSC_TESTNET_RPC_URL`, `BSC_RPC_URL`).
- Private key por env (`DEPLOYER_PRIVATE_KEY`).
- BscScan API key por env (`BSCSCAN_API_KEY`).

No se hardcodean claves.

## Seguridad

Pipeline inicial:

- Tests unitarios obligatorios con Hardhat.
- `solidity-coverage` preparado.
- Checklist operativo en `packages/contracts/docs/SECURITY.md`.
- Configuracion Slither en `packages/contracts/slither.config.json`.
- OpenZeppelin para primitives de seguridad.
- `ReentrancyGuard` en compra.
- `SafeERC20` para ASM/UKI.
- `Pausable` para token y presale.
- `AccessControl` para managers de vesting.

Pendiente antes de mainnet:

- Ejecutar Slither en entorno con Python/Solc instalado.
- Revisión externa de contratos.
- Multisig como owner/admin.
- Dry run en BSC testnet.

## Dapp link

La dapp queda enlazada por:

- `dapp/src/lib/contracts/uki-sale.ts`
- ABIs exportados en `dapp/src/lib/contracts/abis/`
- API `GET /api/presale/status`
- Env `NEXT_PUBLIC_UKI_*`

La API devuelve:

- fechas,
- red,
- direcciones,
- ratio ASM/UKI,
- limites,
- totales,
- estado `isOpen`.

Si `NEXT_PUBLIC_UKI_PRESALE_ADDRESS` no esta configurado, devuelve estado static/configurado false sin romper la landing.
