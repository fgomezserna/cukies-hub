# UKI mainnet: listing intermedio, staking y competición

Este runbook es la fuente operativa para la fase intermedia aprobada en agosto de 2026. No configura todavía el vesting de preventa ni despliega rewards on-chain.

## Decisiones cerradas

- Red: BNB Smart Chain Mainnet, chain id `56`.
- DEX: PancakeSwap V2.
- Par: UKI/ASM.
- ASM: `0x707F0f4a39a4a26239F7D00463B15AB5656861f9`, `Ascensum token`, símbolo `ASM`, 18 decimales.
- UKI: `0x51646bc7A6359f88A79FDC8d7ACB735f1AbF67fA`, `Cukies UKI`, símbolo `UKI`, 18 decimales.
- Presale: `0x6E29448282bCc1c568Ec9450Bef50a01d67845C2`.
- PancakeSwap V2 factory: `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73`.
- PancakeSwap V2 router: `0x10ED43C718714eb63d5aA57B78B54704E256024E`.
- ASM destinado al listing: 50% exacto de `Presale.totalAsmRaised()` en un bloque snapshot inmutable.
- Precio inicial objetivo: `0,012 USD/UKI` usando el spot on-chain ASM/USDT V2 del mismo bloque snapshot, contrastado con un precio ASM/USD aprobado.
- LP propios: se emiten directamente al locker; nunca pasan por la wallet de despliegue ni por el Safe.
- Lock: `SixMonthLiquidityLocker`, exactamente `180 days` desde el bloque de despliegue.
- Beneficiario del locker y owner de `UKIStaking`: el mismo Safe de lanzamiento.
- Safe inicial: un owner Ledger, threshold `1`; posteriormente se añade el socio y se sube el threshold sin cambiar la dirección del Safe.
- Competición: off-chain, `2.000 UKI` confirmados por intento, top 10 resultados, retirada confirmada durante la ventana implica descalificación.
- Vesting preventa: fase posterior; fecha aprobada `2026-09-15`, hora UTC todavía pendiente. No congelar ni habilitar claims en este flujo.

`UKIStaking` no tiene parámetros económicos modificables. El token UKI queda inmutable al desplegar; el owner sólo puede pausar/reanudar depósitos y transferir el ownership mediante aceptación en dos pasos. Una pausa nunca bloquea retiradas. Los `2.000 UKI` por intento, top 10, premios, fechas y descalificación son reglas off-chain de la competición y no alteran el contrato de staking.

## Evidencia mainnet previa

Comprobación RPC realizada en el bloque BSC `118364770` el 27 de agosto de 2026:

- `Presale.asmToken()` apunta al ASM correcto `0x707F…61f9`.
- `Presale.totalAsmRaised()` es `5.996,0696 ASM`.
- El treasury de preventa es `0x538b7EC80B13325ecf7DC3b9b73A58ac56492e01`.
- El treasury mantiene `5.996,0696 ASM` y `0 BNB`.
- El 50% exacto es `2.998,0348 ASM`.
- El par UKI/ASM no existe todavía en la factory V2.
- La wallet owner de UKI mantiene `750.000.000 UKI` y aproximadamente `0,0099967 BNB`.

Estos saldos son observaciones, no constantes. El preflight vuelve a leerlos antes de cualquier firma.

## Responsabilidades

### Usuario / firmante

1. Crear el Safe BSC Mainnet `1/1` usando el Ledger como único owner.
2. Compartir únicamente las direcciones públicas del Safe y del owner Ledger. No compartir seed ni claves privadas.
3. Enviar BNB al treasury hardware, que actualmente no tiene gas, para poder transferir ASM.
4. Mantener BNB suficiente en el owner Ledger para crear/probar el Safe y ejecutar su lote.
5. Aprobar el contraste de precio ASM/USD mostrado por el preflight y guardar su bloque snapshot.
6. Confirmar en Ledger las dos transferencias de financiación al Safe.
7. Importar, revisar y firmar el lote JSON en Transaction Builder de Safe.
8. Aprobar la hora UTC exacta de inicio y fin de la competición antes de activarla.
9. Cuando vuelva el socio, añadir su owner al mismo Safe y cambiar el threshold.

### Operación técnica

1. Ejecutar el preflight mainnet y entregar las cantidades exactas.
2. Desplegar `UKIStaking` y `SixMonthLiquidityLocker` desde una wallet limpia de despliegue que sólo tenga BNB para gas.
3. Verificar los contratos y publicar direcciones, bloques, hashes y unlock UTC.
4. Generar el lote Safe con approvals exactos y `addLiquidity` dirigido al locker.
5. Verificar el receipt después de 12 confirmaciones.
6. Configurar dapp, indexador y juego separado con la misma versión de código manteniendo la competición desactivada.
7. Comprobar cursores, autenticación wallet, staking y partida smoke antes de habilitar la competición.

## 1. Crear y comprobar el Safe

En `https://app.safe.global`:

1. Seleccionar BNB Smart Chain.
2. Conectar el Ledger.
3. Crear un Safe con un único owner: la dirección del Ledger.
4. Threshold: `1`.
5. Copiar la dirección del Safe y comprobarla de nuevo en BscScan.
6. Hacer una operación pequeña de ida y vuelta antes de usar fondos del listing.

El preflight exige bytecode de Safe, exactamente un owner y threshold `1`. Si se proporciona `MAINNET_LAUNCH_SAFE_OWNER_ADDRESS`, también exige que el owner observado coincida con el Ledger aprobado.

## 2. Preflight económico y de identidades

No guardar secretos en el repositorio. Cargar un archivo local ignorado o exportar sólo durante la sesión:

```bash
export MAINNET_LAUNCH_SAFE_ADDRESS=0x...
export MAINNET_LAUNCH_SAFE_OWNER_ADDRESS=0x...
export UKI_LIQUIDITY_SOURCE_ADDRESS=0x...
export ASM_REFERENCE_PRICE_USD=7.13
export ASM_REFERENCE_MAX_DEVIATION_BPS=100
pnpm --filter @cukies/contracts preflight:mainnet:uki-launch
```

`ASM_REFERENCE_PRICE_USD` no se copia de este ejemplo: se decide al ejecutar el preflight. Es un control humano; el script lo compara con el spot del par ASM/USDT V2 y falla si difiere más de 100 bps por defecto. Las cantidades se calculan con el spot on-chain, no con el valor escrito manualmente.

El resultado debe acreditar:

- chain `56`;
- identidades exactas ASM/UKI/Presale/Factory/Router;
- Safe `1/1` correcto;
- par UKI/ASM inexistente;
- `2.998,0348 ASM` si `totalAsmRaised` no ha cambiado;
- cantidad UKI calculada para `0,012 USD/UKI`;
- fondos suficientes en treasury y source UKI.

El resultado imprime `MAINNET_LIQUIDITY_SNAPSHOT_BLOCK`. Ese bloque fija conjuntamente `totalAsmRaised`, reservas ASM/USDT y precio usado. Debe conservarse sin editar durante financiación, generación del lote y verificación; así las compras posteriores de preventa no alteran el 50% ya aprobado.

## 3. Despliegue de staking mainnet

La wallet de despliegue puede ser la misma que desplegó UKI y la preventa si su clave ya está almacenada en un archivo local ignorado y no hace falta volver a exportarla. Nunca se pega en chat, commits o logs.

La wallet no recibe ASM, UKI ni LP y no obtiene permisos:

- `UKIStaking` nace con owner = Safe.
- No recibe LP ni obtiene permisos nuevos sobre el staking.

Despliegue:

```bash
export BSC_RPC_URL=https://...
export DEPLOYER_PRIVATE_KEY=...
export DEPLOYER_ADDRESS=0x...
export MAINNET_LAUNCH_SAFE_ADDRESS=0x...
export MAINNET_LAUNCH_SAFE_OWNER_ADDRESS=0x...
export MAINNET_STAKING_DEPLOY_CONFIRM=DEPLOY_UKI_STAKING_ON_BSC_MAINNET
export MAINNET_STAKING_MANIFEST_PATH=/ruta/privada/uki-mainnet-staking.json
pnpm --filter @cukies/contracts deploy:mainnet:staking
```

El archivo se crea con modo `0600` y el script no sobrescribe un archivo existente. El output contiene:

- dirección, tx, bloque y runtime hash de `UKIStaking`;
- Safe owner/threshold observado.

El locker no se despliega en esta fase para que sus 180 días no empiecen antes de crear el pool.

## 4. Verificar source en BscScan

Con las direcciones y argumentos del manifest:

```bash
pnpm --filter @cukies/contracts exec hardhat verify --network bsc \
  <UKI_STAKING_ADDRESS> \
  0x51646bc7A6359f88A79FDC8d7ACB735f1AbF67fA \
  <SAFE_ADDRESS>

```

No financiar ni firmar el lote de liquidez hasta comprobar que el código publicado coincide exactamente.

## 5. Desplegar el locker inmediatamente antes del pool

Repetir las comprobaciones de Safe, deployer, tokens y Factory. El script acepta que el par no exista o exista vacío, calcula la dirección V2 correcta y fija 180 días desde el bloque del locker:

```bash
export BSC_RPC_URL=https://...
export DEPLOYER_PRIVATE_KEY=...
export DEPLOYER_ADDRESS=0x...
export MAINNET_LAUNCH_SAFE_ADDRESS=0x...
export MAINNET_LAUNCH_SAFE_OWNER_ADDRESS=0x...
export MAINNET_LOCKER_DEPLOY_CONFIRM=DEPLOY_180_DAY_LIQUIDITY_LOCKER_ON_BSC_MAINNET
export MAINNET_LOCKER_MANIFEST_PATH=/ruta/privada/uki-mainnet-locker.json
pnpm --filter @cukies/contracts deploy:mainnet:liquidity-locker
```

Esperar 12 confirmaciones y verificar en BscScan:

```bash
pnpm --filter @cukies/contracts exec hardhat verify --network bsc \
  <LIQUIDITY_LOCKER_ADDRESS> \
  <PREDICTED_PAIR_ADDRESS> \
  <SAFE_ADDRESS>
```

## 6. Financiar el Safe

Las cantidades salen del preflight inmediatamente anterior:

1. Enviar BNB al treasury hardware para gas. No enviar ASM antes de confirmar que BSC Mainnet está seleccionada.
2. Desde `0x538b…2e01`, enviar al Safe exactamente la cantidad ASM indicada (`2.998,0348 ASM` para el snapshot observado en este documento).
3. Desde la source UKI, enviar al Safe exactamente los UKI indicados por el preflight.
4. Esperar 12 confirmaciones y volver a comprobar ambos balances del Safe.

No redondear manualmente la cantidad UKI y no usar un approval ilimitado.

## 7. Generar y firmar el lote Safe

Generar el JSON sólo cuando los fondos estén confirmados y se pueda firmar dentro de los siguientes 30 minutos:

```bash
export MAINNET_LAUNCH_SAFE_ADDRESS=0x...
export MAINNET_LAUNCH_SAFE_OWNER_ADDRESS=0x...
export UKI_STAKING_ADDRESS=0x...
export LIQUIDITY_LOCKER_ADDRESS=0x...
export MAINNET_LIQUIDITY_SNAPSHOT_BLOCK=<BLOQUE_DEL_PREFLIGHT>
export ASM_REFERENCE_PRICE_USD=<MISMO_PRECIO_APROBADO_EN_PREFLIGHT>
export ASM_REFERENCE_MAX_DEVIATION_BPS=100
export SAFE_BATCH_DEADLINE_SECONDS=1800
export SAFE_BATCH_OUTPUT_PATH=/ruta/privada/uki-asm-v2-safe-batch.json
pnpm --filter @cukies/contracts prepare:mainnet:liquidity-safe-batch
```

El lote contiene, en este orden:

1. Reset de allowance ASM si existiera.
2. Approval ASM exacto al router V2.
3. Reset de allowance UKI si existiera.
4. Approval UKI exacto al router V2.
5. `addLiquidity` con:
   - cantidades deseadas exactas;
   - mínimos iguales a las cantidades deseadas;
   - destinatario LP igual al locker;
   - deadline corto.

Importar el JSON en Safe Transaction Builder. Antes de firmar, comparar cada dirección y cantidad con el resumen que imprime el script. Si el deadline ha vencido, regenerar el lote; nunca ampliarlo editando el JSON a mano.

## 8. Verificación post-listing

```bash
export MAINNET_LAUNCH_SAFE_ADDRESS=0x...
export MAINNET_LAUNCH_SAFE_OWNER_ADDRESS=0x...
export UKI_STAKING_ADDRESS=0x...
export LIQUIDITY_LOCKER_ADDRESS=0x...
export UKI_STAKING_DEPLOYMENT_TX_HASH=0x...
export LIQUIDITY_LOCKER_DEPLOYMENT_TX_HASH=0x...
export LIQUIDITY_TX_HASH=0x...
export MAINNET_LIQUIDITY_SNAPSHOT_BLOCK=<MISMO_BLOQUE_DEL_PREFLIGHT>
export ASM_REFERENCE_PRICE_USD=<MISMO_PRECIO_APROBADO_EN_PREFLIGHT>
export ASM_REFERENCE_MAX_DEVIATION_BPS=100
export MAINNET_LAUNCH_VERIFICATION_PATH=/ruta/privada/uki-mainnet-verification.json
pnpm --filter @cukies/contracts verify:mainnet:uki-launch
```

El verificador exige:

- 12 confirmaciones para los tres receipts;
- un único evento `Mint` con las cantidades exactas;
- par V2 UKI/ASM correcto;
- LP en el locker y cero LP en el Safe;
- approvals Safe -> Router consumidos a cero;
- beneficiary Safe y lock 180 días;
- `UKIStaking` no pausado, enlazado a UKI y controlado por el Safe.

También genera las variables públicas e identidades del indexador. No contiene secretos.

## 9. Configuración producción con competición apagada

Auditoría read-only de Coolify realizada el 27 de agosto de 2026:

- dapp producción: `game-hub`, application ID `12`, UUID `jookw8ow8woks088s44404ok`, rama `main`, Docker Compose;
- juego producción: `game-treasurehunt`, application ID `13`, UUID `tkkggwcosc4gksckcc480cwg`, rama `main`, Nixpacks;
- la dapp actual usa chain `56`, pero todavía tiene `CHAIN_INDEXER_BSC_CONFIRMATIONS=6`, aliases sólo `PRESALE` y la competición anterior habilitada;
- el juego actual confía también en orígenes de staging y su imagen data del 3 de agosto de 2026.

Por tanto no basta con redesplegar `game-hub`: hay que actualizar `12` y `13`, subir confirmaciones a `12`, añadir `UKI_STAKING` sin borrar `PRESALE`, y dejar fuera los orígenes de staging del juego de producción.

Desplegar primero con:

```bash
NEXT_PUBLIC_UKI_CHAIN_ID=56
NEXT_PUBLIC_ASM_TOKEN_ADDRESS=0x707F0f4a39a4a26239F7D00463B15AB5656861f9
NEXT_PUBLIC_UKI_TOKEN_ADDRESS=0x51646bc7A6359f88A79FDC8d7ACB735f1AbF67fA
NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS=0x95780d891461e3183562B5D785f2D2c1c72ecE65
NEXT_PUBLIC_UKI_PRESALE_ADDRESS=0x6E29448282bCc1c568Ec9450Bef50a01d67845C2
NEXT_PUBLIC_UKI_STAKING_ADDRESS=<UKI_STAKING_MAINNET>
NEXT_PUBLIC_BSCSCAN_BASE_URL=https://bscscan.com

CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID=56
CHAIN_INDEXER_BSC_CONFIRMATIONS=12
CHAIN_INDEXER_UKI_STAKING_ADDRESS=<UKI_STAKING_MAINNET>
CHAIN_INDEXER_UKI_STAKING_START_BSC_BLOCK=<DEPLOYMENT_BLOCK>
CHAIN_INDEXER_UKI_STAKING_DEPLOYMENT_BSC_BLOCK=<DEPLOYMENT_BLOCK>
CHAIN_INDEXER_UKI_STAKING_DEPLOYMENT_TX_HASH=<DEPLOYMENT_TX>
CHAIN_INDEXER_UKI_STAKING_RUNTIME_CODE_HASH=<RUNTIME_HASH>
# Añadir UKI_STAKING a los aliases existentes, sin reemplazarlos.
CHAIN_INDEXER_CONTRACT_ALIASES=<ALIASES_EXISTENTES>,UKI_STAKING

TREASURE_HUNT_COMPETITION_ENABLED=false
TREASURE_HUNT_COMPETITION_ID=uki-staking-mainnet-2026-08
TREASURE_HUNT_COMPETITION_RULES_VERSION=1
TREASURE_HUNT_COMPETITION_ELIGIBILITY_KIND=uki_staking
TREASURE_HUNT_COMPETITION_STAKING_ADDRESS=<UKI_STAKING_MAINNET>
TREASURE_HUNT_COMPETITION_STAKE_PER_ATTEMPT_RAW=2000000000000000000000
TREASURE_HUNT_COMPETITION_TOP_ATTEMPTS_PER_WALLET=10
TREASURE_HUNT_COMPETITION_POINTS_PER_TICKET=100
TREASURE_HUNT_COMPETITION_BASE_PRIZE_UKI_RAW=50000000000000000000000
TREASURE_HUNT_COMPETITION_STAKE_PRIZE_BPS=1000
TREASURE_HUNT_COMPETITION_PRIZE_PER_WINNER_UKI_RAW=10000000000000000000000
TREASURE_HUNT_COMPETITION_MAX_WINS_PER_WALLET=1
TREASURE_HUNT_COMPETITION_INDEXER_MAX_AGE_MS=300000
TREASURE_HUNT_COMPETITION_STARTS_AT=<UTC_APROBADO>
TREASURE_HUNT_COMPETITION_ENDS_AT=<UTC_APROBADO>
```

Generar cuatro secretos diferentes de al menos 32 bytes para proof, alias, review y settlement y cargarlos únicamente en Coolify. `TREASURE_HUNT_COMPETITION_DRAW_SEED` y `TREASURE_HUNT_COMPETITION_DRAW_SOURCE_BLOCK` se dejan vacíos hasta después del cierre.

Las variables `NEXT_PUBLIC_*` son de build. Es obligatorio reconstruir, no sólo reiniciar.

La dapp y el recurso separado de `sybil-slayer`/Treasure Hunt deben usar la misma rama/SHA. El juego necesita:

```bash
NEXT_PUBLIC_DAPP_ORIGIN=https://cukies.world,https://www.cukies.world
```

No incluir `https://cukieshub.eurekand.com` ni `https://cukies-hub.eurekand.com`: pertenecen a staging y no deben ser padres confiables del iframe de producción.

## 10. Smoke antes de habilitar la competición

Con `TREASURE_HUNT_COMPETITION_ENABLED=false`:

1. Verificar health de dapp e indexador.
2. Confirmar los cursores `UKI_STAKING/Staked` y `UKI_STAKING/Unstaked` con identidad `verified` y 12 confirmaciones.
3. Conectar una wallet mainnet de prueba con una cantidad pequeña de UKI.
4. Aprobar y depositar.
5. Confirmar que Cukie Master refleja el staking.
6. Retirar y confirmar devolución completa.
7. Repetir el depósito que se utilizará para el smoke de competición.
8. Abrir Treasure Hunt y comprobar que el modo práctica funciona mientras la competición está apagada.
9. Confirmar que el iframe no exige créditos/Cukie en el flujo staking cuando la competición quede activa.

## 11. Activación de la competición

Antes de activarla deben estar cerradas la hora UTC de inicio y fin. Desplegar ambas primero con `TREASURE_HUNT_COMPETITION_ENABLED=false`; una vez el indexador esté al día y el smoke sea verde, cambiar solamente:

```bash
TREASURE_HUNT_COMPETITION_ENABLED=true
```

Pruebas inmediatas:

1. `1.999 UKI` -> cero intentos.
2. `2.000 UKI` -> un intento tras 12 confirmaciones.
3. Abandono -> intento consumido, sin sesión atascada.
4. Nuevo bloque de `2.000 UKI` -> nuevo intento.
5. Once partidas -> sólo cuentan los diez mejores resultados.
6. Retirada mínima -> descalificación persistente durante la campaña.
7. Ranking y aviso personal reflejan la descalificación.

No reutilizar el reset de wallet de staging: su guard impide producción deliberadamente.

## 12. Sorteo y snapshot al cierre

El seed no se elige manualmente. La regla pública es: hash del primer bloque BSC Mainnet cuyo timestamp sea estrictamente posterior a `TREASURE_HUNT_COMPETITION_ENDS_AT`, una vez tenga al menos 12 confirmaciones.

```bash
export TREASURE_HUNT_COMPETITION_ENDS_AT=<MISMO_ISO_DE_PRODUCCION>
pnpm --filter @cukies/contracts derive:mainnet:competition-draw-seed
```

Guardar el bloque/hash emitido y cargar exactamente las dos variables impresas: `TREASURE_HUNT_COMPETITION_DRAW_SEED` y `TREASURE_HUNT_COMPETITION_DRAW_SOURCE_BLOCK`. El endpoint de cierre vuelve a consultar BSC y rechaza un hash sustituido, un bloque posterior elegido por el operador o un bloque con menos de 12 confirmaciones. Después se revisan los intentos pendientes y se ejecuta el settlement una sola vez. El snapshot final conserva inputs, ranking, tickets, sorteo y hashes de salida; la sección `Finalizadas` lee ese snapshot sin recalcular.

## 13. Fase posterior

Fuera de este lanzamiento:

- añadir el owner del socio al Safe y subir el threshold;
- decidir si se usa `2/2` o `2/3` con una llave de recuperación separada;
- fijar hora UTC del 15 de septiembre de 2026;
- configurar y congelar `presaleVestingStart` antes de habilitar claims;
- segunda aportación de liquidez y soporte de precio.
