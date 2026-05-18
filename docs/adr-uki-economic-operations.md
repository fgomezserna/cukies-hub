# ADR: UKI economic operations map

Estado: aceptado para implementacion inicial.
Issue: #16 `UKI-001.1`.
Fecha: 2026-05-12.
Fuente de reglas vigente: `docs/uki-current-operating-rules.md` sincronizado el 2026-05-17.

## Contexto

La economia UKI combina contratos en BNB Smart Chain, datos existentes de NFTs en Mongo/marketplace y logica de juego off-chain. Antes de implementar contratos o pantallas de compra, el sistema necesita una separacion explicita de responsabilidades para evitar que una misma operacion tenga dos fuentes de verdad.

Reglas base heredadas del backlog tecnico:

- La nueva economia UKI vive en BNB Smart Chain.
- Mongo opera producto, juegos, creditos, rankings, pools, snapshots y calculos.
- BSC liquida valor, compras, vesting, staking de UKI y claims finales.
- Treasure Hunt es el primer juego, pero las reglas deben soportar multiples juegos.
- El bridge/marketplace existente no se reimplementa dentro de este lanzamiento.
- Direccion actual de producto: las nuevas posiciones de staking Cukie Master y pool de Cukies operan solo en BSC; Tron se mantiene para lectura, reconciliacion y migracion salvo decision posterior.

## Decision

Usamos BSC como fuente de verdad para valor transferible y derechos on-chain. Usamos Mongo como fuente de verdad operativa para producto, sesiones, creditos, locks temporales, snapshots, rankings y asignaciones calculadas. La dapp solo orquesta acciones y muestra estados derivados; no decide saldos, elegibilidad ni recompensas.

## Matriz de operaciones

| Operacion | Propietario principal | Fuente de verdad | Auditoria / event log requerido |
| --- | --- | --- | --- |
| Compra ASM -> UKI | Contrato `Presale` | BSC: eventos `TokensPurchased`, balances ASM/UKI y estado de compra por wallet | Si. Evento on-chain por compra, tx hash, wallet, ASM pagado, UKI asignado, precio aplicado y periodo de venta. Backend indexa para UI y soporte, pero no corrige el evento. |
| Allowance/approve ASM | Contrato ASM + wallet UI | BSC: allowance del token ASM hacia `Presale` | Si. No requiere evento propio del sistema UKI, pero la UI debe enlazar tx y leer allowance en tiempo real antes de comprar. |
| Vesting de UKI comprado | Contrato `VestingVault` | BSC: schedule, total vested, liberado y claimable por wallet | Si. Eventos `VestingCreated`, `TokensReleased` y cambios administrativos. Backend puede cachear para dashboard, pero el contrato decide liberacion. |
| Vesting equipo/tesoreria | Contrato `VestingVault` o vault dedicado | BSC: schedules por beneficiario/rol | Si. Eventos por schedule y release. Requiere roles/multisig y trazabilidad publica. |
| Staking UKI para Cukie Master | Contrato `UKIStaking` | BSC: cantidad staked, lock si aplica y timestamps | Si. Eventos `Staked`, `Unstaked`, `StakeExtended` si hay duracion. Backend/indexer deriva cupos, pero no inventa stake. |
| Cupos por ruta UKI | Backend `CukieMasterService` | Derivado de BSC indexado: UKI staked y regla vigente de cupos | Si. Audit log off-chain con version de regla, snapshot usado y cupos calculados. No necesita evento on-chain porque es una autorizacion de producto derivada. |
| Cupos por ruta NFT | Backend `CukieMasterService` | Mongo/marketplace normalizado por `NftInventoryService` | Si. Audit log off-chain con wallet, NFTs considerados, rareza, puntos y version de regla. Debe poder recalcularse desde snapshot. |
| Soft staking NFT / aportar Cukie a pool | Backend `NftInventoryService` + `CukiePoolService` | Mongo: lock/position operativa sobre NFT normalizado y elegibilidad BSC para nuevas posiciones | Si. Event log off-chain append-only para `pool_entered`, `pool_exited`, `lock_created`, `lock_released`, owner verificado y snapshot de rareza. La direccion actual no mueve NFT en partida y limita nuevas posiciones a BSC, manteniendo Tron para migracion/reconciliacion. |
| Estado de NFT usable | Backend `NftInventoryService` | Mongo normalizado + reconciliacion con owner/bridge/listing | Si. Cambios de estado deben dejar audit log cuando afecten uso economico: `available`, `listed`, `bridging`, `soft_staked`, `in_pool`, `assigned_to_game`, `invalidated`, `unknown`. |
| Creditos diarios de Cukie Master | Job diario + `CompetitionCreditService` | Mongo ledger append-only de creditos | Si. Ledger off-chain obligatorio con `grant`, periodo, slot/cupo origen, idempotency key y job run id. |
| Deposito de creditos a pool | Job diario + `CompetitionCreditService` | Mongo ledger append-only | Si. Ledger con `pool_deposit`, config aplicada, hora de corte, wallet, slot y periodo. |
| Gasto de creditos en partida | Backend game economy API | Mongo ledger + `GameSessionEconomy` | Si. Ledger con `spend`, session id, game id, recurso usado y idempotency key. No se confia en el cliente. |
| Pool de creditos prestados | Backend `CompetitionCreditService` | Mongo: balance de pool por periodo/juego + ledger | Si. Ledger con origen de creditos, asignacion a partida, expiracion y liquidacion. |
| Asignacion de Cukie prestado a partida | Backend `CukiePoolService` | Mongo locks temporales de `NftInventoryService` | Si. Event log off-chain con Cukie, wallet propietaria, jugador, game session, expiracion y liberacion. |
| Sesion de juego economy | Backend `GameEconomyService` | Mongo: `GameSessionEconomy` | Si. Audit log por transiciones `created`, `resources_reserved`, `started`, `submitted`, `validated`, `settled`, `expired`, `rejected`. |
| Score validado | Backend/game validation | Mongo: resultado validado y metadata antifraude | Si. Guardar score bruto, score validado, version de validador, señales antifraude y decision. |
| Ranking semanal | Job semanal + `RankingService` | Mongo: snapshot/ranking por juego y semana | Si. Audit log con periodo, entradas elegibles, regla de subida/bajada, rank anterior/nuevo y motivo. |
| Calculo de rewards | Job de cierre + `RewardAllocationService` | Mongo: `RewardAllocation` por periodo | Si. Audit log con inputs, version de regla, periodo, wallet, cantidad y categoria. Debe ser reproducible. |
| Batch claimable de rewards | Backend job + contrato `RewardsDistributor` | Mongo para allocations y BSC para root publicado/claims | Si. Mongo guarda batch, root, hash de input y proof. BSC emite `RootPublished`/equivalente y `Claimed`. |
| Claim final de rewards UKI | Contrato `RewardsDistributor` | BSC: claim ejecutado por wallet/batch | Si. Evento on-chain `Claimed` con wallet, batch, amount. Backend indexa y marca status, pero no puede dar por reclamado sin evento o tx confirmada. |
| Tesoreria, liquidez y supply no vendido | Contratos + multisig | BSC para movimientos de valor; docs/config para politica aprobada | Si. Eventos on-chain, tx multisig y registro operativo. Cualquier calculo previo vive en backend como propuesta pendiente de ejecucion. |

## Contratos como propietarios

Los contratos deben poseer solo las operaciones que mueven valor transferible o derechos on-chain:

- `UKIToken`: supply, roles minimos, pausas si se decide, transfers.
- `Presale`: compra ASM -> UKI, caps, fechas, precio/ratio y eventos de compra.
- `VestingVault`: schedules y release de UKI comprado/equipo/tesoreria.
- `UKIStaking`: staking/unstaking para ruta UKI de Cukie Master.
- `RewardsDistributor`: claims de rewards calculados off-chain.

Los contratos no deben calcular rankings, scores, creditos diarios, asignacion de Cukies prestados ni rarezas NFT.

## Backend como propietario

El backend debe poseer operaciones de producto y economia off-chain:

- Normalizacion de NFTs existentes desde Mongo/marketplace.
- Locks y estados operativos de NFTs.
- Calculo de cupos por ruta NFT y cupos derivados de stake indexado.
- Ledger append-only de creditos.
- Reservas de recursos antes de partidas.
- Validacion de sesiones y scores.
- Rankings semanales.
- Calculo de allocations y generacion de batches de claim.
- Reconciliacion entre eventos BSC y Mongo.

El backend no debe custodiar UKI transferible ni marcar un claim como finalizado sin evidencia BSC.

## Jobs como propietarios

Los jobs son responsables de operaciones periodicas o diferidas:

- Entrega diaria de creditos.
- Expiracion diaria de creditos.
- Snapshots de Cukie Master, pools y rankings.
- Cierre semanal de ranking.
- Cierre de rewards y preparacion de batch claimable.
- Reconciliacion de ownership NFT, locks invalidados y claims on-chain.

Cada job debe tener `jobRunId`, periodo, idempotency key y logs de entradas/salidas.

## UI/dapp como propietaria

La UI solo puede poseer:

- Orquestacion de wallet, red y transacciones.
- Lectura de estados desde contratos/API.
- Mensajes de error, loading, success y enlaces a BscScan.
- Bloqueos de UX para chain incorrecta, wallet desconectada o preventa cerrada.

La UI no debe calcular saldos finales, rewards finales, ranking final, elegibilidad final ni vesting final. Puede mostrar previews explicitos cuando el backend/contrato aun no confirme.

## Datos que cruzan BSC y Mongo

| Dato | Origen | Consumidor | Regla |
| --- | --- | --- | --- |
| Compras de preventa | BSC `Presale` | API/dapp/dashboard | Se indexa por evento. Mongo puede cachear, no corregir. |
| Vesting personal | BSC `VestingVault` | API/dapp | Se lee en tiempo real o cache corto. BSC manda. |
| UKI staked | BSC `UKIStaking` | `CukieMasterService` | Backend deriva cupos desde snapshot/indexer. |
| NFT ownership/rareza | Mongo/marketplace + reconciliacion | `NftInventoryService` | Mongo es fuente operativa; ownership critico se valida antes de lock/uso. |
| Creditos y partidas | Mongo ledger/sessions | dapp/games/jobs | Off-chain, append-only e idempotente. |
| Reward allocations | Mongo | `RewardsDistributor` tooling | Mongo calcula; root/proof publicado en BSC liquida. |
| Claim status | BSC `RewardsDistributor` | Mongo/API/dapp | BSC manda. Mongo refleja estado indexado. |

## Reglas de auditoria

1. Toda operacion economica off-chain debe ser append-only o reconstruible desde snapshots versionados.
2. Toda transicion de sesion o lock debe tener idempotency key.
3. Todo calculo de rewards debe guardar version de regla, periodo, inputs y hash del lote.
4. Toda operacion on-chain relevante debe exponer evento suficiente para indexacion.
5. Mongo puede tener caches/materializaciones, pero cada campo debe indicar su origen canonico.
6. Las acciones administrativas requieren actor, motivo y enlace a tx/multisig cuando muevan valor.

## Impacto por area

### Contratos

- Implementar eventos detallados desde el principio; no depender de storage privado para soporte.
- Separar `Presale`, `VestingVault`, `UKIStaking` y `RewardsDistributor`.
- No meter reglas de juego en contratos.

### Backend/datos

- Priorizar modelo de ledger append-only para creditos y allocations.
- Definir `NftInventoryService` antes de pool de Cukies.
- Definir reconciliadores para ownership, stake, vesting y claims.

### Dapp

- La preventa debe leer BSC para compra/vesting y API para estado agregado.
- Las pantallas de Cukie Master, juegos y rewards deben distinguir estado calculado off-chain de estado liquidado on-chain.
- Wallet desconectada y chain incorrecta son estados de UI, no estados de dominio.

### Juegos

- Los juegos reciben un session economy token o session id ya reservado.
- El cliente no decide rewards ni settlement.
- El motor debe aceptar multiples juegos por config, no solo Treasure Hunt.

## Decisiones pendientes para issues siguientes

- #17 debe fijar estados canonicos exactos de wallet/assets y reglas de incompatibilidad.
- #18 debe fijar ventanas de consistencia, confirmaciones BSC minimas y politicas de recuperacion.
- #27 debe elegir framework de contratos con esta separacion como requisito.
- #47 debe decidir si `RewardsDistributor` usa Merkle root por periodo o firmas EIP-712.
