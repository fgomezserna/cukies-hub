# ADR: UKI consistency policy

Estado: aceptado para implementacion inicial.
Issue: #18 `UKI-001.3`.
Fecha: 2026-05-12.

## Contexto

La economia UKI combina BNB Smart Chain, Mongo, marketplace, indexers y jobs periodicos. No todos los datos necesitan la misma frescura. Una compra o claim debe depender de BSC; una partida necesita validar recursos justo antes de empezar; un ranking semanal puede cerrarse por snapshot.

Esta politica define ventanas aceptables de sincronizacion, que se calcula por snapshot diario/semanal y que debe comprobarse en tiempo real antes de iniciar partida.

## Decision

Usamos consistencia fuerte solo en los puntos donde se reserva o mueve valor operativo:

- transacciones BSC confirmadas,
- reserva de creditos,
- locks de NFT para pool/partida,
- inicio y cierre de game sessions,
- generacion de batches de claim.

Usamos consistencia eventual con snapshots versionados para dashboards, ranking, rewards calculadas y cupos agregados. Si un dato no esta suficientemente fresco para una accion economica, la accion se bloquea y la UI muestra estado de reconciliacion.

## Politica por dominio

| Dominio | Fuente canonica | Frescura aceptable para lectura UI | Frescura requerida para accion | Snapshot / cierre |
| --- | --- | --- | --- | --- |
| Compra ASM -> UKI | BSC `Presale` | Cache indexado hasta 60s si se muestra tx hash/estado pendiente | Confirmacion BSC antes de mostrar compra finalizada | No aplica; eventos por tx |
| Vesting UKI | BSC `VestingVault` | Cache hasta 5 min para dashboard | Lectura BSC o indexer confirmado antes de release/claim | Snapshot diario opcional para analytics |
| UKI staked | BSC `UKIStaking` | Cache hasta 5 min | Revalidar stake antes de crear o renovar cupo Cukie Master | Snapshot diario para cupos y auditoria |
| Ownership NFT | Mongo/marketplace normalizado + reconciliacion | Cache hasta 15 min con timestamp visible si hay dudas | Revalidar owner/listing/bridge/lock antes de pool, soft staking o game assignment | Snapshot diario de inventario elegible |
| Listing/bridge NFT | Marketplace/bridge status | Cache hasta 5 min | Revalidar inmediatamente antes de lock economico | Snapshot diario de excepciones |
| Creditos | Mongo ledger append-only | Lectura materializada hasta 60s | Transaccion atomica al reservar/gastar | Cierre diario para expiracion y grants |
| Pool de creditos | Mongo ledger + balances por periodo | Lectura hasta 60s | Reserva atomica por session id | Cierre diario y semanal segun reglas |
| Pool de Cukies | Mongo locks/positions | Lectura hasta 5 min | Lock atomico antes de asignar a partida | Snapshot diario para elegibilidad/rewards |
| Game session | Mongo `GameSessionEconomy` | Estado actual desde API | Transicion atomica con idempotency key | Expiracion por job; settlement por evento de session |
| Ranking semanal | Mongo ranking snapshots | Lectura hasta 5 min | No se usa para iniciar partida | Cierre semanal |
| Reward allocation | Mongo allocations versionadas | Lectura hasta 5 min tras cierre | No claimable hasta batch/root aprobado | Cierre diario/semanal |
| Reward claim | BSC `RewardsDistributor` | Cache indexado hasta 60s | Evento BSC confirmado para marcar claimed | Batch por periodo |

## Confirmaciones y finalizacion BSC

Valores iniciales:

- BSC testnet: 3 confirmaciones para UI de exito normal.
- BSC mainnet: 6 confirmaciones para compras, vesting release, staking/unstaking y claims.
- Operaciones administrativas o multisig: 12 confirmaciones antes de que jobs las usen para cierre.

La UI puede mostrar `pending` antes de esas confirmaciones, pero no debe conceder recursos off-chain definitivos hasta alcanzar la politica de confirmacion.

## Snapshots diarios

Se calculan diariamente:

- Inventario NFT elegible por wallet.
- Estados conflictivos `unknown`/`invalidated`.
- Cupos Cukie Master por ruta NFT.
- Cupos Cukie Master por ruta UKI usando stake indexado.
- Grants de creditos diarios.
- Expiracion de creditos no usados.
- Posiciones activas en pool de Cukies.
- Allocations diarias si la regla de rewards diaria esta activa.

Cada snapshot debe guardar:

- `period`
- `snapshotAt`
- `sourceWatermarks`
- `ruleVersion`
- `inputHash`
- `outputHash`
- `jobRunId`

## Snapshots semanales

Se calculan semanalmente:

- Ranking por juego/periodo.
- Movimiento de ranks con limites +2/-2.
- Elegibilidad por minimo de partidas.
- Allocations semanales.
- Batch candidato para rewards claimable si aplica.

Los snapshots semanales no deben depender de datos que aun esten `pending` en BSC. Si hay operaciones pendientes al cierre, se tratan segun una regla explicita de periodo siguiente o bloqueo de batch.

## Checks en tiempo real antes de iniciar partida

Antes de iniciar una partida con economia, el backend debe comprobar en la misma operacion logica:

1. Wallet existe y no esta `ops_blocked`.
2. Game economy config vigente para `gameId`.
3. Creditos disponibles propios o creditos prestables del pool.
4. NFT propio seleccionado sigue en estado permitido, si aplica.
5. Cukie de pool asignado sigue `in_pool` y no `assigned_to_game`.
6. No hay listing/bridge/invalidacion conocida para el NFT usado.
7. Reserva atomica de creditos.
8. Lock atomico de Cukie si hay asset asignado.
9. Creacion de `GameSessionEconomy` con idempotency key.

Si cualquiera falla, no se inicia la partida. El cliente recibe motivo recuperable: `insufficient_credits`, `asset_unavailable`, `wallet_blocked`, `stale_inventory`, `pool_empty`, `config_unavailable` o `reconciliation_required`.

## Reglas de degradacion

### Indexer BSC retrasado

- Lectura UI: mostrar ultimo dato con timestamp y estado `syncing`.
- Accion economica: leer BSC directo si es viable; si no, bloquear.
- Jobs de cierre: esperar hasta ventana maxima o marcar periodo `pending_reconciliation`.

### Marketplace/bridge no disponible

- Lectura UI: mostrar inventario cacheado con warning.
- Nueva accion sobre NFT: bloquear salvo que haya evidencia fresca dentro de la ventana.
- Jobs: registrar fallo y reintentar; si supera ventana, pasar assets afectados a `unknown`.

### Mongo disponible, BSC no disponible

- Se permiten lecturas off-chain.
- No se permiten compras, staking, releases ni claims.
- No se deben cerrar batches de rewards si dependen de eventos BSC recientes.

### BSC confirma cambio que contradice Mongo

- BSC gana para valor transferible y staking.
- Para NFT ownership, se aplica politica de `NftInventoryService` y estado canonico.
- Locks off-chain afectados pasan a `invalidated` si el cambio rompe elegibilidad.

## Ventanas iniciales

| Proceso | Ventana objetivo | Ventana maxima antes de alerta |
| --- | --- | --- |
| Indexar evento `Presale` | 60s | 5 min |
| Indexar staking/unstaking | 2 min | 10 min |
| Indexar release/claim | 60s | 5 min |
| Reconciliar ownership NFT | 15 min | 2 h |
| Reconciliar listing/bridge | 5 min | 30 min |
| Liberar lock de game session expirada | 1 min | 10 min |
| Entrega diaria de creditos | Hora fija + 5 min | Hora fija + 30 min |
| Cierre semanal ranking | Hora fija + 15 min | Hora fija + 2 h |
| Generar reward batch | Tras cierre + 30 min | Tras cierre + 6 h |

Estas ventanas son parametros operativos. Deben vivir en config, no hardcodeadas.

## Idempotencia

Toda operacion que reserve, conceda, gaste o cierre valor off-chain debe tener idempotency key:

- Compra indexada: `chainId:txHash:logIndex`.
- Grant diario: `daily-credit:{wallet}:{slotId}:{period}`.
- Expiracion: `credit-expire:{wallet}:{period}`.
- Game session start: `game-start:{wallet}:{gameId}:{clientRequestId}`.
- Settlement: `game-settle:{sessionId}:{resultHash}`.
- Ranking close: `ranking-close:{gameId}:{week}`.
- Reward allocation: `reward-allocation:{period}:{ruleVersion}:{inputHash}`.
- Claim batch: `claim-batch:{period}:{allocationHash}`.

Reintentar una key debe devolver el resultado previo o fallar sin duplicar efectos.

## Politica de recuperacion

### Periodo abierto

Si se detecta inconsistencia durante un periodo abierto:

- bloquear nuevas acciones afectadas,
- reconciliar estado canonico,
- corregir materializaciones,
- mantener ledger append-only,
- registrar `reconciliation_event`.

### Periodo cerrado sin batch on-chain

Si el periodo ya cerro pero aun no hay root/batch publicado:

- recalcular allocation si la inconsistencia afecta el resultado,
- guardar nuevo `inputHash`/`outputHash`,
- marcar batch anterior como `superseded`.

### Periodo cerrado con batch on-chain

Si el root o batch ya esta publicado:

- no mutar claims ya liquidados,
- abrir ajuste en periodo futuro si procede,
- registrar decision ops/legal/treasury,
- documentar wallet, amount y motivo.

## Reglas para UI

La UI debe distinguir:

- `confirmed`: fuente canonica confirmada.
- `pending`: tx o job en curso.
- `syncing`: datos antiguos pero no bloqueantes para lectura.
- `stale`: datos demasiado antiguos para accion.
- `blocked`: accion no permitida por consistencia.
- `needs_reconciliation`: requiere job/ops antes de continuar.

No debe presentar un dato cacheado como definitivo cuando desbloquea una accion economica.

## Impacto por area

### Contratos

- Eventos deben ser indexables por wallet, periodo y batch.
- Operaciones administrativas necesitan suficiente metadata/eventos para reconciliacion.

### Backend/datos

- Separar ledger append-only de balances materializados.
- Guardar watermarks de fuentes por snapshot.
- Implementar jobs reentrantes con idempotency keys.
- Exponer freshness/timestamps en APIs criticas.

### Juegos

- No iniciar partida sin reserva atomica confirmada.
- No confiar en recursos enviados por cliente.
- Expirar sessions incompletas y liberar locks rapidamente.

### Dapp

- Mostrar estados de sincronizacion y bloqueo de forma explicita.
- Reconsultar antes de acciones criticas.
- Enlazar tx BscScan cuando una accion depende de BSC.

## Decisiones pendientes

- Parametros finales de confirmaciones y ventanas por entorno.
- Hora exacta de cierre diario y semanal.
- Si rewards diarias y semanales comparten batch o tienen batch separado.
- Politica legal/ops para ajustes post-batch cuando hay claims ya ejecutados.

