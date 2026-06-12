# UKI sale contracts

Estado: implementacion inicial.
Issues: #27, #28, #29, #31, #32, #33, #35, #36, #68.
Fecha: 2026-05-12.
Fuente de producto vigente: `docs/uki-current-operating-rules.md` sincronizado el 2026-05-17.

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
- `PRESALE_VESTING_ROLE` crea schedules de compradores de preventa.
- `ALLOCATION_MANAGER_ROLE` crea schedules internos de team, ecosistema, advisors o recompensas aprobadas.
- Release lineal por beneficiario.
- Permite acumular compras multiples de preventa bajo la configuracion global de TGE del vault.
- No permite schedules conflictivos para el mismo beneficiario.

### `Presale`

- Compra con ASM via `transferFrom`.
- Envia ASM a `treasury`.
- Calcula UKI con `ukiPerAsm` escalado a `1e18`.
- Crea vesting para el comprador en `VestingVault`.
- Emite `Purchased`.
- Tiene ventana `saleStart/saleEnd`.
- Tiene minimo de compra.
- No tiene maximo por compra ni cap por wallet aprobados.
- Tiene cap global en UKI vendido.
- Requiere `saleEnabled == true` para aceptar compras.
- Permite editar parametros por Launch Safe durante la venta.
- Pausable por owner.

## Reglas de preventa implementadas

| Regla | Implementacion |
| --- | --- |
| Fecha inicio | `saleStart` |
| Fecha fin | `saleEnd` |
| Ratio ASM/UKI | `ukiPerAsm`, escalado a `1e18`, editable por Launch Safe |
| Min compra | `minAsmPerPurchase` |
| Cap venta | `totalUkiForSale` |
| Apertura operativa | `saleEnabled` con `setSaleEnabled(true/false)` |
| Pausas | `pause()` / `unpause()` |
| Vesting comprador | `VestingVault.createVesting`; TGE/vesting global en `VestingVault` |
| Eventos | `Purchased`, config update events, OZ pause events |

Casos de borde:

- Compra antes/despues de ventana: revert `SaleNotOpen`.
- Compra antes de habilitar venta: revert `SaleNotEnabled`.
- Compra por debajo de minimo: revert `PurchaseTooSmall`.
- Cap global agotado: revert `SaleCapExceeded`.
- Contrato pausado: revert `EnforcedPause`.
- Vault sin UKI suficiente: revert `InsufficientUnallocatedBalance`.
- Allowance ASM insuficiente: revert del ERC-20.

Refund:

- No se implementa refund automatico.
- Una compra confirmada crea vesting.
- Cualquier politica de refund necesita decision separada y contrato adicional o funcion admin auditada.

## Parametros de producto vigentes 2026-05-17

Estos parametros no deben entenderse como hardcodeados si el contrato los recibe por configuracion de deploy o admin. Son la referencia de producto actual para configurar preventa, UI y runbooks:

| Parametro | Valor vigente |
| --- | --- |
| Inicio previsto | Primera semana de junio de 2026, fecha exacta pendiente. |
| Duracion | 1 mes. |
| Precio preventa | 1 UKI = 0.01 USD. |
| Listing minimo | 1 UKI >= 0.012 USD. |
| Medio principal de compra | ASM. |
| Ratio ASM/UKI | Configurado al inicio y editable por Launch Safe durante preventa si ASM tiene una variacion brusca; aplica solo a compras futuras. |
| Comprador | Vesting lineal 9 meses, sin cliff. |
| Compra minima | 5 ASM. |
| Maximo por compra/wallet | No hay limite aprobado. |
| Maximo total vendible | 250,000,000 UKI del pool de ecosistema. |
| Liquidez | ASM recaudado se usa para liquidez UKI; liquidez inicial bloqueada o quemada al menos 9 meses. |
| BNB/USDT | Extension opcional pendiente; si se acepta, debe convertirse a ASM o reservarse para conversion posterior. |
| Incentivos Concilium/Ascensum | Se iguala cantidad vendida a esa comunidad para Marcel; 9 meses cliff + 24 meses vesting. |
| Ecosistema | 30,000,000 UKI, equivalente al 3% del suministro total, liberados 40 dias tras TGE; resto 9 meses cliff + 12 meses lineal. |

## BSC testnet/mainnet

Runbook operativo para mainnet:

- `docs/uki-mainnet-contract-deployment.md`

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
