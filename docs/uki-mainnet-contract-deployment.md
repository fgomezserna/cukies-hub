# UKI mainnet contract deployment

Este documento define el runbook para desplegar los contratos UKI en BNB Smart Chain mainnet. No contiene secretos. Las claves privadas, RPC privados, tokens de API y direcciones sensibles no aprobadas deben vivir solo en el entorno seguro del operador.

## Objetivo

Desplegar y dejar operativos en mainnet:

1. `UKIToken`.
2. `VestingVault`.
3. `Presale`.

El despliegue mainnet se divide en fases:

1. **Preflight/freeze**: confirmar bytecode, parámetros, roles esperados y timing.
2. **Operational deploy**: desplegar contratos, fondear vault, conceder rol de preventa y dejar `saleEnabled=true` para que abra automáticamente en `SALE_START`.
3. **Safe handover**: migrar ownership/admins y remanentes a wallets/Safes finales.
4. **Final preflight**: demostrar que el deployer ya no conserva permisos críticos.
5. **Dapp/indexer production update**: apuntar dapp y worker a contratos mainnet, reconstruir y verificar instancia pública.

## Red y scripts

Package:

```bash
packages/contracts
```

Scripts npm/pnpm relevantes:

```bash
pnpm --filter @cukies/contracts compile
pnpm --filter @cukies/contracts test
pnpm --filter @cukies/contracts coverage
pnpm --filter @cukies/contracts security:slither
pnpm --filter @cukies/contracts simulate:deploy
pnpm --filter @cukies/contracts freeze:manifest
pnpm --filter @cukies/contracts deploy:mainnet:operational
pnpm --filter @cukies/contracts handover:mainnet:safe
pnpm --filter @cukies/contracts preflight:presale --network bsc
```

Scripts directos:

```text
packages/contracts/scripts/deploy-mainnet-operational.cjs
packages/contracts/scripts/safe-handover-mainnet.cjs
packages/contracts/scripts/preflight-presale.cjs
packages/contracts/scripts/print-freeze-manifest.cjs
```

Hardhat mainnet está configurado como:

```text
network: bsc
chainId: 56
RPC env: BSC_RPC_URL
signer env: DEPLOYER_PRIVATE_KEY
BscScan env: BSCSCAN_API_KEY
```

## Timestamp aprobado

Hora de apertura aprobada:

```text
2026-06-15 17:00 Europe/Madrid
2026-06-15 15:00 UTC
SALE_START=1781535600
```

`deploy-mainnet-operational.cjs` falla si `SALE_START` no coincide con `1781535600`.

## Parámetros mainnet esperados

Variables requeridas para el deploy operacional:

```bash
DEPLOYER_PRIVATE_KEY=...
DEPLOYER_ADDRESS=...
BSC_RPC_URL=...
BSCSCAN_API_KEY=...

ASM_TOKEN_ADDRESS=0x40af8fd127dcd302d7ffa6f37cf5a002e54ac68c
SALE_TREASURY_ADDRESS=...
UKI_INITIAL_SUPPLY_RECEIVER=...
UKI_INITIAL_SUPPLY=1000000000000000000000000000

SALE_START=1781535600
SALE_END=...
VESTING_START=...
VESTING_DURATION=23328000

UKI_PER_ASM=100000000000000000000
MIN_ASM_PER_PURCHASE=5000000000000000000
TOTAL_UKI_FOR_SALE=250000000000000000000000000
```

Si `UKI_INITIAL_SUPPLY_RECEIVER` no es el deployer, también se requiere:

```bash
UKI_INITIAL_SUPPLY_RECEIVER_PRIVATE_KEY=...
```

porque esa wallet debe firmar la transferencia de `TOTAL_UKI_FOR_SALE` al `VestingVault`.

## Fase 0 — checks antes de tocar mainnet

Ejecutar desde la raíz del repo:

```bash
source ~/.zshrc >/dev/null 2>&1 && pnpm --filter @cukies/contracts compile
source ~/.zshrc >/dev/null 2>&1 && pnpm --filter @cukies/contracts test
source ~/.zshrc >/dev/null 2>&1 && pnpm --filter @cukies/contracts coverage
source ~/.zshrc >/dev/null 2>&1 && pnpm --filter @cukies/contracts security:slither
source ~/.zshrc >/dev/null 2>&1 && pnpm --filter @cukies/contracts simulate:deploy
source ~/.zshrc >/dev/null 2>&1 && pnpm --filter @cukies/contracts freeze:manifest
```

No seguir si hay fallos no justificados en tests, coverage, Slither o simulación.

## Fase 1 — deploy operacional mainnet

Ejecutar solo cuando el entorno seguro tenga las variables requeridas:

```bash
source ~/.zshrc >/dev/null 2>&1 && pnpm --filter @cukies/contracts deploy:mainnet:operational
```

El script debe:

1. Validar `network=bsc` y `chainId=56`.
2. Validar que `DEPLOYER_PRIVATE_KEY` resuelve a `DEPLOYER_ADDRESS`.
3. Rechazar direcciones attach antiguas; es un deploy fresco.
4. Validar ASM mainnet: `0x40af8fd127dcd302d7ffa6f37cf5a002e54ac68c`.
5. Validar `SALE_START=1781535600`.
6. Desplegar `UKIToken`.
7. Desplegar `VestingVault`.
8. Desplegar `Presale`.
9. Transferir `TOTAL_UKI_FOR_SALE` al vault.
10. Conceder `PRESALE_VESTING_ROLE` al `Presale`.
11. Dejar `saleEnabled=true` si se aprueba abrir automáticamente en `SALE_START`.
12. Emitir JSON con direcciones, parámetros y checks.

Guardar el JSON del deploy como evidencia de release. No guardar secretos.

## Fase 2 — verificación en BscScan

Verificar los contratos con constructor args exactos registrados por el deploy.

Ejemplo de forma general:

```bash
source ~/.zshrc >/dev/null 2>&1 && pnpm --filter @cukies/contracts exec hardhat verify --network bsc <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS...>
```

Registrar tx hashes y URLs BscScan de:

- deploy `UKIToken`, `VestingVault`, `Presale`;
- transferencia de UKI al vault;
- grant de `PRESALE_VESTING_ROLE`;
- `saleEnabled=true` si aparece como tx separada;
- verificaciones BscScan.

## Fase 3 — Safe handover

Después del deploy operacional y antes de considerarlo final, ejecutar la migración a Safe/wallets finales.

Variables requeridas:

```bash
DEPLOYER_PRIVATE_KEY=...
DEPLOYER_ADDRESS=...
SAFE_OWNER_ADDRESS=...
FINAL_ASM_TREASURY_ADDRESS=...
UKI_REMAINDER_RECEIVER_ADDRESS=...

UKI_TOKEN_ADDRESS=...
UKI_VESTING_VAULT_ADDRESS=...
UKI_PRESALE_ADDRESS=...

SALE_START=1781535600
SALE_END=...
VESTING_START=...
VESTING_DURATION=23328000
UKI_PER_ASM=...
MIN_ASM_PER_PURCHASE=...
TOTAL_UKI_FOR_SALE=...
SALE_ENABLED_AFTER_HANDOVER=true
```

Opcionales:

```bash
ALLOCATION_MANAGER_ADDRESS=...
UKI_REMAINDER_SOURCE_ADDRESS=...
UKI_REMAINDER_SOURCE_PRIVATE_KEY=...
```

Comando:

```bash
source ~/.zshrc >/dev/null 2>&1 && pnpm --filter @cukies/contracts handover:mainnet:safe
```

El handover debe:

1. Confirmar que el deployer sigue siendo owner/admin antes de migrar.
2. Configurar treasury final si procede.
3. Confirmar ventana, precio, mínimo, cap y `saleEnabled`.
4. Confirmar `unallocatedWithdrawalUnlockTime == SALE_END`.
5. Confirmar `PRESALE_VESTING_ROLE` en `Presale`.
6. Limpiar/configurar `ALLOCATION_MANAGER_ROLE`.
7. Mover UKI remanente al receptor final.
8. Transferir ownership de `UKIToken` al Safe.
9. Transferir ownership de `Presale` al Safe.
10. Dar `VestingVault.DEFAULT_ADMIN_ROLE` al Safe.
11. Revocar `VestingVault.DEFAULT_ADMIN_ROLE` del deployer.
12. Verificar sets exactos de roles.

## Fase 4 — preflight final

Ejecutar con owner/admin final, no con supuestos temporales:

```bash
source ~/.zshrc >/dev/null 2>&1 && \
SALE_OWNER_ADDRESS=<SAFE_OWNER_ADDRESS> \
DEPLOYER_ADDRESS=<OLD_DEPLOYER_ADDRESS> \
UKI_TOKEN_ADDRESS=<UKI_MAINNET> \
UKI_VESTING_VAULT_ADDRESS=<VAULT_MAINNET> \
UKI_PRESALE_ADDRESS=<PRESALE_MAINNET> \
SALE_START=1781535600 \
SALE_END=<SALE_END> \
VESTING_START=<VESTING_START> \
VESTING_DURATION=23328000 \
UKI_PER_ASM=100000000000000000000 \
MIN_ASM_PER_PURCHASE=5000000000000000000 \
TOTAL_UKI_FOR_SALE=250000000000000000000000000 \
pnpm --filter @cukies/contracts preflight:presale --network bsc
```

El preflight final debe demostrar:

- `UKIToken.owner() == SAFE_OWNER_ADDRESS`.
- `Presale.owner() == SAFE_OWNER_ADDRESS`.
- `VestingVault.DEFAULT_ADMIN_ROLE` tiene exactamente el Safe.
- El deployer antiguo no conserva owner/admin/manager powers.
- `PRESALE_VESTING_ROLE` tiene exactamente el `Presale`.
- `ALLOCATION_MANAGER_ROLE` está vacío o coincide exactamente con el manager aprobado.
- El vault tiene al menos `TOTAL_UKI_FOR_SALE` sin asignar.
- `unallocatedWithdrawalUnlockTime == SALE_END`.
- Precio, mínimo, fechas, treasury y estado de venta coinciden con env.

No anunciar mainnet como listo si este preflight no pasa.

## Fase 5 — conectar dapp e indexer a mainnet

Tras contratos verificados y handover/preflight final:

### Dapp production env

```bash
NEXT_PUBLIC_UKI_CHAIN_ID=56
NEXT_PUBLIC_ASM_TOKEN_ADDRESS=0x40af8fd127dcd302d7ffa6f37cf5a002e54ac68c
NEXT_PUBLIC_UKI_TOKEN_ADDRESS=<UKI_MAINNET>
NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS=<VAULT_MAINNET>
NEXT_PUBLIC_UKI_PRESALE_ADDRESS=<PRESALE_MAINNET>
NEXT_PUBLIC_BSCSCAN_BASE_URL=https://bscscan.com
NEXT_PUBLIC_UKI_PRESALE_START_ISO=2026-06-15T15:00:00.000Z
NEXT_PUBLIC_UKI_PRESALE_START_LABEL=15 de junio de 2026
NEXT_PUBLIC_UKI_PRESALE_START_SHORT_LABEL=15 de junio
```

### Indexer production env

```bash
CHAIN_INDEXER_CHAINS=BSC
CHAIN_INDEXER_CONTRACT_ALIASES=PRESALE
CHAIN_INDEXER_BSC_RPC_URL=<BSC_MAINNET_RPC>
CHAIN_INDEXER_PRESALE_ADDRESS=<PRESALE_MAINNET>
CHAIN_INDEXER_START_BSC_BLOCK=<DEPLOY_BLOCK_OR_EARLIER>
CHAIN_INDEXER_BSC_CONFIRMATIONS=6
```

En Coolify, `NEXT_PUBLIC_*` son build-time. Actualizar variables en Coolify y hacer rebuild, no solo restart.

## Evidencia mínima de release

Guardar en el issue/PR/release notes:

- commit/tag de contratos;
- freeze manifest;
- parámetros mainnet aprobados;
- direcciones finales;
- tx hashes;
- URLs BscScan verificadas;
- resultado del deploy JSON;
- resultado del handover JSON/log;
- resultado del preflight final;
- commit de dapp con direcciones mainnet;
- `/api/health` de producción;
- logs del `chain-indexer` con `run started` y `loop ok`;
- smoke test compra/estado/referrals o go/no-go explícito si la compra aún no debe probarse.

## Rollback / emergencia

Los contratos mainnet no se revierten como una app. Si hay incidente:

1. Pausar `Presale` o `UKIToken` si aplica.
2. Retirar permisos comprometidos.
3. Bloquear UI de compra/claim.
4. Parar o aislar indexer/backend si proyecta datos incorrectos.
5. Reconciliar compras/eventos.
6. Desplegar contrato corregido solo con nueva release aprobada.
