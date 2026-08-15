# UKI new economy database implementation map

Estado: implementación desplegada en staging y contratos NFT desplegados en BSC Testnet; las identidades y cursores de los cinco aliases preservados/nuevos están verificados. El smoke firmado de depósitos/retiros y la activación de los runtimes económicos siguen bloqueados hasta completar sus verificaciones. Las decisiones de producto del 2026-08-14 sustituyen varios flujos ya implementados y se marcan como gaps, no como fallback válido.
Decision vigente: Cukie Master permite 5 cupos por ruta UKI y 5 cupos por ruta NFT/Cukies Originales por wallet.
Decision vigente: Cukie Master NFT y Cukie Pool requieren vaults custodiales BSC separados; el soft staking Mongo actual queda superseded.

## Objetivo

La economia nueva de UKI no debe escribirse en la base legacy `cukies`. La base legacy queda como fuente de lectura, importacion y reconciliacion durante la transicion. La base nueva `cukieshub-new` es la fuente operativa para:

- inventario normalizado y locks internos,
- Cukie Master,
- creditos de competicion,
- pools,
- sesiones economicas de juego,
- ranking,
- allocations de rewards,
- batches de claim.

BSC sigue siendo la fuente de verdad para valor transferible y custodia: UKI, ASM, preventa, vesting, staking UKI, vaults NFT y claims finales.

## Estado revisable: bridge NFT Tron -> BSC

Fecha de comprobacion: 2026-08-15.

Veredicto: la integracion legacy es parcial. Hay UI para iniciar `jumpInBridge`,
ABIs, lectura de eventos y proyeccion `inBridge -> available`, pero el
repositorio no contiene el executor/relayer que complete el salto entre redes.
El fixture BSC Testnet solo emite eventos y no custodia, quema, acuña ni mueve
NFTs. Por tanto, staging permite probar indexacion, pero no un bridge
Tron -> BSC real end-to-end.

| Componente | Estado comprobado |
| --- | --- |
| UI de entrada y approval | Implementada; el despliegue actual sigue configurado con contratos mainnet. |
| Indexer BSC y Tron | Implementado como lector; proyecta `JumpInBridge` y `JumpOutBridge`. |
| Executor/relayer cross-chain | Ausente del repositorio. |
| Custodia o burn/mint verificable | No demostrada: falta source verificado o auditoria de los contratos legacy. |
| BSC Testnet | NFT y fuentes de eventos desplegados; la fuente bridge no ejecuta bridge. |
| Tron testnet/Nile | Sin contrato fuente ni activos de prueba comprobados. |
| E2E ownership/supply/replay/recovery | Ausente. |

Direcciones legacy mainnet documentadas:

- Tron NFT: `TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe`.
- Tron bridge: `TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ`.
- BSC NFT: `0x0dbDeBCC62f11005BF434ABFad74564E896aC861`.
- BSC bridge: `0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E`.

Fixtures BSC Testnet comprobados:

- NFT legacy, alias `TOKEN`: `0x51646bc7A6359f88A79FDC8d7ACB735f1AbF67fA`.
- Fuente de marketplace: `0x95780d891461e3183562B5D785f2D2c1c72ecE65`.
- Fuente de eventos bridge: `0x6E29448282bCc1c568Ec9450Bef50a01d67845C2`.

La colección ERC-721 real para probar los vaults se indexa con un alias nuevo
`TOKEN_V2`. Nunca sustituye `TOKEN`: ambos aliases mantienen identidad, cursor,
bloque de despliegue, transacción y code hash independientes. Así se conserva
el histórico de staging y se evita reiniciar o reinterpretar sus eventos.
`TOKEN_V2` está desplegado en BSC Testnet en
`0xD4C7B16DB234D7f62Ba6a8f30153FAF85feaBec8`.

## Evidencias de despliegue NFT en BSC Testnet

Fecha de despliegue y comprobación: 2026-08-15. Chain ID: `97`.

| Alias | Dirección | Bloque | Transacción | Hash de bytecode runtime |
| --- | --- | ---: | --- | --- |
| `TOKEN_V2` | `0xD4C7B16DB234D7f62Ba6a8f30153FAF85feaBec8` | `125280412` | `0xef06344f418e176f1f1a5d7a4f7acf98680fcfd344331ff7323d0cf1ac7e77a9` | `0x2a4da6545f6e1d1d7c304819582ca4e9ec91a8712ead55cf2383547c72e79994` |
| `CUKIE_MASTER_NFT_VAULT` | `0x4482ebA4D55a1DF6aA102a8CC22A4fBa252D7eDB` | `125280540` | `0xfad52ef19f3e98efe7cd7eede83982407e59fabcd82b7e62451da176df9a77fa` | `0x2cab642a77ad5d19819d4698594a8b73011bb80f0c0372dc01a43b0fbb6de3b7` |
| `CUKIE_POOL_NFT_VAULT` | `0xd405aCFf1Bba872bE893e796C39f3eaCBdE2872b` | `125280547` | `0x07a032f881b437f8264491fcc603466b55873a2921b16051d65f0aeecb01632f` | `0x36c0f9144323fc23ce9ab02063196943f7d633abb207a8df519db35caf26637a` |

Los dos vaults admiten exclusivamente `TOKEN_V2`, conservan al deployer
operativo como owner sin handoff pendiente y se comprobaron sin pausa. El Pool
mantiene su calendario inicial diario con corte a las 14:00 UTC. Las tres
identidades están cargadas en Coolify sin retirar `TOKEN` ni `UKI_STAKING`. El
deployment Coolify `1136` del commit `2df68a6` verificó los 13 cursores de los
tres aliases nuevos, además de conservar verificados y avanzando los cuatro
cursores legacy de `TOKEN` y `UKI_STAKING`.

Para considerar el bridge usable en staging faltan configuracion por entorno,
origen Tron testnet, executor idempotente, confirmaciones, proteccion de replay,
reintentos/dead-letter, receipts visibles en UI y una prueba que reconcilie
ownership y supply en ambos extremos. Antes de produccion tambien hay que cerrar
si el modelo real es lock/escrow o burn/mint y auditar los privilegios legacy.

## Estado revisable: creditos de competicion y pool de creditos

Fecha de comprobacion: 2026-08-15.

Veredicto: existe una base tecnica amplia, pero la economia real no debe
activarse todavia. El codigo desplegado incluye ledger, lotes, reservas,
configuracion de aportacion, APIs, scheduler y panel, pero el runtime permanece
desactivado en staging y faltan requisitos P0 aprobados.

| Area | Implementado | Pendiente antes de activar |
| --- | --- | --- |
| Ledger | `grant`, `pool_deposit`, `reserve`, `release`, `spend`, `expire` e historial auditable. | Snapshot historico real `as-of-cutoffBlock`, no balance live tardio. |
| Maduracion | Slots por ruta, epochs, minimo 24h, maximo 5 por ruta y jobs de recálculo UKI/NFT independientes. | Snapshot histórico real y validación E2E de ambas rutas desplegadas. |
| Consumo | Saldo propio completo primero; si no alcanza, reserva 10 creditos completos del pool; idempotencia por sesion. | Recuperar resultados recibidos dentro de TTL aunque su validacion se procese despues. |
| Aportacion al pool | Configuracion por slot/epoch en multiplos de 10 y API/UI. | Coordinador productivo de liquidacion proporcional diaria. |
| Reparto | Calculador proporcional, base 20% y floor previstos. | Settlement desde las 16:00 UTC, catch-up sin perdida y funding operativo. |
| Semanal | Ranking y modelos base existentes. | Convertir las partes de pools del bote semanal en siete tramos diarios posteriores. |
| Economia de partida | Tramo variable `G=0..7.5`, reserva fija de `2` al bote semanal y `0.5` a `ambassador_program_pending`, todos en unidades raw y bajo regla versionada. | Crear y aprobar la regla real de staging; los schedulers siguen apagados. |
| Claims | `RewardsDistributor`, Merkle y API de proofs implementados. | Deployment/funding verificado y publicacion automatizada de batches. |

Reglas vigentes para la implementacion:

- Periodo diario `[14:00 UTC, 14:00 UTC siguiente)`.
- El reparto se intenta desde las 16:00 UTC; si faltan datos queda pendiente y
  se recupera con el mismo `periodId`.
- 100 creditos por slot elegible tras al menos 24 horas y en el primer corte
  posterior.
- Los creditos no son transferibles entre usuarios; si pueden aportarse al pool
  mediante movimientos internos auditables.
- UKI y NFT deben sellarse y recuperarse de forma independiente.
- Treasure Hunt consume 10 creditos y separa nominalmente 7.5/2/0.5 UKI.

En staging la API existe y exige sesion wallet, pero
`COMPETITION_CREDITS_RUNTIME_ENABLED` permanece apagado. La activacion segura
requiere primero cerrar los gaps anteriores, crear la regla versionada de
14:00/16:00, ejecutar un tick manual controlado y auditar runs, ledger, lotes,
pool, expiraciones y batches antes de encender el scheduler.

## Regla Cukie Master

| Ruta | Cupos iniciales globales | Requisito inicial | Maximo por wallet |
| --- | ---: | ---: | ---: |
| UKI | 500 | 20,000 UKI por cupo | 5 cupos |
| NFT/Cukies Originales | 500 | 3 puntos de rareza por cupo | 5 cupos |

El maximo potencial por wallet es 10 cupos si el usuario alcanza 5 por ruta. Esta decision reemplaza cualquier texto anterior que hablara de 5 cupos sumando ambas rutas.

## Frontera de bases de datos

| Fuente | Rol | Escrituras nuevas UKI |
| --- | --- | --- |
| `cukies` legacy | Fuente historica de Cukies, marketplace, bridge, Cukie Points y referencias de usuario. | No. Solo lectura/import/reconciliacion. |
| `cukieshub-new` | Base operativa nueva para eventos, vistas normalizadas y economia off-chain UKI. | Si. Es la base objetivo. |
| Prisma `DATABASE_URL` hub | Auth, usuarios, sesiones base, quests y datos existentes de dapp. | Solo si el dato pertenece a la cuenta/app, no a la economia UKI. |
| BSC | Valor transferible, vesting, staking UKI, custodia NFT en ambos vaults y claim final. | Via contratos, no Mongo. |
| `cukies-world` game backend | Runtime de juego, inventario/XP del juego y APIs server-authorized. | No como fuente de rewards UKI. El hub reserva/liquida economia. |

## Colecciones nuevas en `cukieshub-new`

| Coleccion | Proposito | Punto del DOCX que cubre |
| --- | --- | --- |
| `economy_rule_versions` | Versionar reglas activas: requisitos, limites, conversiones, ventanas y cambios. | Cukie Master, creditos, pools, ranking, Treasure Hunt, conversion Cukie Points. |
| `nft_asset_locks` | Locks temporales internos para evitar doble reserva de juego. No sustituyen custodia. | Asignaciones de partida y reconciliacion; Cukie Master/Pool se proyectan desde vaults BSC. |
| `cukie_master_snapshots` | Snapshot por wallet/periodo con cupos UKI, cupos NFT y total. | Cupos 5 por ruta, requisito dinamico, ventana 48h. |
| `cukie_master_slot_events` | Event log append-only de altas, bajas, recalculos y cambios de cupos. | Auditoria Cukie Master y perdida/conservacion de cupos. |
| `competition_credit_account_periods` | Balance materializado de creditos por wallet y periodo. | 100 creditos diarios por cupo, creditos propios. |
| `competition_credit_ledger` | Ledger append-only de grant, expiracion, pool deposit, spend y settlement. | Creditos diarios, pool de creditos, gasto en Treasure Hunt. |
| `competition_credit_lots` / `competition_credit_pool_lots` | Lotes FIFO exactos propios y de pool. | Prioridad de creditos propios y fallback al pool sin mezcla parcial. |
| `competition_credit_reservations` | Reserva fenced/idempotente por sesión. | Gasto server-authorized y liberación/consumo terminal. |
| `competition_credit_runtime_state` / `competition_credit_runtime_runs` | Lease, heartbeat y auditoría del job diario. | Corte diario, reintentos y health operativo. |
| `credit_pool_positions` | Aportaciones de creditos al pool por periodo/slot. | Pool de creditos, minimo diario, reparto siguiente semana. |
| `cukie_pool_positions` / `cukie_pool_assignments` / `cukie_pool_events` | Posiciones legacy, asignaciones por sesion y eventos append-only durante la transicion. La custodia nueva se proyecta por separado. | Compatibilidad legacy y trazabilidad del dispatcher. |
| `cukie_pool_nft_vault_positions` / `cukie_pool_calendar_versions` | Proyeccion canonica de custodia, epochs, activacion, salida y calendario on-chain versionado. | Lifecycle `pending_activation/active/exit_requested/withdrawable/withdrawn` a partir de eventos BSC. |
| `cukie_pool_vault_asset_leases` / `cukie_pool_vault_period_usage` | Lease exclusivo por NFT y contador de cuota por `assetId + depositEpoch + periodId`, con indices unicos y auditoria. | Prioridad, concurrencia inicial 1, reset diario sin bypass por redeposito y consumo solo al completar. |
| `cukie_pool_runtime_state` / `cukie_pool_runtime_runs` | Lease, heartbeat, reconciliacion y auditoria del pool NFT. | Expiraciones, ownership y recuperacion operativa. |
| `game_economy_rules` | Config versionada y fechada por juego. | Motor multi-juego sin hardcodear Treasure Hunt. |
| `game_economy_sessions` / `game_economy_events` | Reserva, ciclo de vida y auditoria append-only de una partida. | Treasure Hunt: creditos, Cukie asignado, score, validacion, settlement. |
| `game_economy_resource_bindings` / `game_result_evidence` | Fences de recursos y evidencia autorizada por servidor. | Evitar dobles reservas, replays y score cliente no autorizado. |
| `game_economy_runtime_state` / `game_economy_runtime_runs` | Recuperacion de sagas, expiracion y health del motor de juegos. | Operacion independiente del servidor Unreal. |
| `game_owned_cukie_epochs` / `game_owned_cukie_assignments` / `game_owned_cukie_events` | Cuota por epoch de ownership, asignacion propia y auditoria. | Usar Cukie propio antes del pool sin aceptar seleccion del cliente. |
| `weekly_ranking_sources` / `game_weekly_rankings` | Sources canonicos y snapshot semanal con rank aplicado y siguiente rank. | Ranking #1-#9 solo con creditos del pool. |
| `weekly_ranking_manifests` / `weekly_ranking_runs` / `weekly_ranking_audit_events` | Sellado, replay y auditoria del cierre semanal. | Umbrales, minimos y movimiento maximo semanal. |
| `reward_allocations` / `reward_pool_accruals` / `reward_source_manifests` | Claims finales y obligaciones intermedias no claimables, fenced y reproducibles. | Jugador, bote semanal, `ambassador_program_pending`, pool creditos, pool Cukies y destinos 80/10/10 sin doble pago. |
| `reward_emission_budget_state` / `reward_emission_budget_days` / `reward_emission_budget_events` | Reserva atomica, techo diario/acumulado, fencing e idempotencia del presupuesto UKI. | Maximo 500,000 UKI/dia, techo 450M, capacidad no usada expira y excesos fallan cerrados. |
| `reward_claim_batches` | Batches publicables para claim on-chain. | Claim final de rewards UKI. |
| `reward_claim_proofs` / `reward_claims` | Proofs separados y estado indexado de claims por wallet/batch. | Claim ejecutado y soporte a batches grandes. |

## Puntos del documento y plan de implementacion

| Punto | Decision tecnica | Estado |
| --- | --- | --- |
| Pausar generacion de Cukie Points | Operacion legacy controlada por contrato; antes de ejecutar, generar snapshot de claimed + pending usando `points` + `calcPoints(tokenId)`. Resultado se importa como baseline a `cukieshub-new`. | Biblioteca preview-only, manifest, plan sin firma y verificador implementados; snapshot/report live y ejecución siguen pendientes de aprobación. |
| Tabla por wallet de Cukie Points | Export desde legacy `points` + wallets/user linkage + pending on-chain. Guardar resumen estructural, no datos sensibles en Git. | Serializadores JSONL/CSV canónicos implementados; falta proporcionar fuentes/cutoffs live autorizados. |
| Pausar crias con Cukie Points | Operacion legacy: pausar contrato/UI. No crear nueva mecanica de breeding en UKI. | Pendiente de accion ops. |
| Bridge Tron -> BSC | Mantener bridge existente como flujo legacy; nueva economia solo acepta nuevas posiciones BSC. `NftInventoryService` marca Tron como lectura/migracion. | Parcial: UI e indexer existen, pero no hay executor/relayer ni E2E testnet; el fixture solo emite eventos. |
| Marketplace legacy | Mantener lectura/acciones legacy mientras se migra. Nuevo marketplace con UKI seria feature separada; el marketplace actual usa moneda nativa. | Parcial: vistas legacy existentes. |
| Premios preventa | Registrar elegibilidad/ranking off-chain; mint/entrega de NFTs requiere flujo BSC/ops especifico. | Pendiente. |
| Cierre preventa y extension | Contrato `Presale` permite mover ventanas; decision de prolongar se decide por estado on-chain/indexado. | Implementado en contrato, pendiente de politica ops. |
| Torneo compradores preventa | Crear entitlement ledger: 1 partida por cada 1,000 UKI comprados, basado en eventos `Purchased`. | Pendiente. |
| Cukie Master ruta UKI | Calculo desde vesting/preventa/stake BSC indexado. Maximo 5 por wallet en esta ruta. | **Ya implementado y desplegado en staging.** `UKIStaking` esta activo en BSC Testnet (chain `97`) en `0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205`; se conservan el contrato y sus posiciones, sin migracion ni redeployment. Proyeccion, servicio, runtime, reconciliacion, API/UI y panel approve/stake/unstake estan implementados. |
| Cukie Master ruta NFT | Custodia en `CukieMasterNftVault`; calculo desde eventos confirmados, rareza y epochs. Maximo 5 por wallet. NFT no jugable mientras esta depositado. | Vertical desplegada: contrato, ABI, colección ERC721 V2, metadata/indexador, recálculo aislado, API y UI approve/deposit/withdraw. Contrato, configuración, backfill inicial e identidad/cursores están verificados en staging. La recuperación directa no depende de API/indexador y conserva una lista pública histórica separada de las colecciones activas. Pendiente smoke E2E firmado de approve/deposit/withdraw. |
| Capacidad/requisito Cukie Master | Empezar en 500 por ruta, ampliar hasta 5,000 o subir requisito con 48h de gracia. | Control HMAC, CAS/evento idempotente, expansion solo creciente, barrido paginado y deficit de conservacion en UI implementados. |
| Creditos diarios | Job diario crea ledger `grant` de 100 creditos por cupo tras 24h, reconstruido `as-of-cutoff`. | Parcial: ledger/lotes, snapshot, runtime, scheduler y recálculo de fuentes UKI/NFT por rutas separadas existen. Falta `cutoffBlock` historico real, catch-up sin perdida, ventana util de grants tardios y separar tambien los watermarks/sellado del ledger por ruta. |
| Pool de creditos | Depositos en multiplos de 10 antes del corte; reparto diario y arrastre semanal versionado. | Config por slot, corte, deposito, reservas FIFO y UI/API implementados. El calculador proporcional/floor existe, pero el payout productivo y el consumo fenced del arrastre semanal no se activan hasta cerrar funding y coordinador de reparto. |
| Pool de Cukies | Un `CukiePoolNftVault` custodia ambas generaciones; lifecycle y cuotas son diarios; Original/Segunda se liquidan separados; Seiku no alimenta pools. | Vertical desplegada: contrato/ABI, calendario 14:00 versionado, proyección, API/UI, prioridad Original→Segunda→Seiku, lease exclusivo, cuota por epoch+periodo, salida al corte y dispatcher GameEconomy. Contrato, configuración, backfill inicial e identidad/cursores están verificados en staging. La retirada directa sigue operativa para colecciones históricas mientras existan posiciones. El calculador aplica tramos acumulativos 45/20/15/12/7/1; Seiku y tramos sin elegibles pasan a `undistributed_pending`. Pendientes smoke E2E firmado y coordinador productivo de liquidación. |
| Ranking semanal | Solo partidas con creditos del pool; rank #1-#9, subida/bajada semanal, minimos de partidas. | Regla inmutable, sources, snapshots, manifest, catch-up, runtime, scheduler, health e integracion con rewards implementados; falta crear la regla aprobada y activar live. |
| Treasure Hunt | El hub crea `game_economy_sessions`, reserva recursos y liquida. El juego no decide rewards. Horario inicial: cutoff 14:00 UTC y settlement desde 16:00 UTC, ambos versionados para cambios futuros. | Motor multi-juego, HMAC dedicado, evidencia autorizada, Cukie propio -> pool/Seiku, reserva/settlement, recuperacion y scheduler implementados. El esquema generico permite TTL de sesion hasta 24h; la regla activa debe cumplir `sessionTtlMs + validationRetryWindow < 2h` para un settlement predecible, mientras los fixtures actuales usan 10 minutos. Un resultado valido recibido dentro del TTL sigue siendo recuperable aunque se procese tarde. |
| Reparto de recompensas | `reward_allocations` calcula claims y `reward_pool_accruals` separa `G=0..7.5` segun score, 2 UKI semanales, 0.5 UKI de embajadores, pools y no distribuido. Todas las partidas validas con Cukie prestado alimentan su generacion; rareza 45/20/15/12/7/1. Seiku no alimenta el pool y su parte pasa a `undistributed_pending`. | Cálculo local alineado y cubierto por tests. Faltan regla real aprobada, funding, coordinadores de liquidación diaria/semanal y E2E antes de activar accruals. |
| Claim diferido | Las partes de pools derivadas del bote semanal se dividen en siete disponibilidades diarias durante la semana siguiente. | Cadencia aprobada. Falta confirmar censo diario de la semana siguiente frente a censo congelado de la semana origen, decidir representacion tecnica (`availableAt` o batches separados), implementar scheduler y probar que nunca se revoca un tramo ya cerrado. |
| UKI no distribuido | Registrar primero como `undistributed_pending`, incluyendo `7.5-G`, Seiku, tramos sin elegibles, ranking y residuos; materializar 80% tesoreria, 10% marketing y desarrollo y 10% reduccion de supply. | Seiku y tramos vacíos ya quedan no claimables en `undistributed_pending`. Falta sustituir los campos legacy marketing/desarrollo por el bucket conjunto aprobado, materializar el manifiesto 80/10/10 y definir el mecanismo on-chain de reducción de supply. |
| Conversion futura Cukie Points -> creditos | Crear regla versionada y ledger de grants diarios durante 7 dias con limites global/wallet. | Pendiente. |
| Web IA | Las paginas publicas pueden explicar fases, pero no deben fingir que los servicios estan activos si falta backend/contrato. | Parcial: paginas coming next existentes. |

## Secuencia recomendada

1. Convertir Mongo a replica set autorizado. La instancia actual standalone no permite activar la economía.
2. Si existe sentinel v1, ejecutar `pnpm indexer:migrate:economy:v2`; después `pnpm indexer:setup` y verificar transacciones/índices.
3. Configurar identidades BSC, start/deployment blocks y code hashes; ejecutar indexación/reconciliación sin activar aún Cukie Master.
4. Proporcionar fuentes/cutoffs legacy reales, generar paquete preview-only y revisar manifest/excepciones. No ejecutar pause/cutover sin aprobación separada.
5. Crear y aprobar reglas versionadas de Cukie Master, créditos, juegos y rewards; activar primero en staging con dos wallets.
6. Activar schedulers Cukie Master/créditos y exigir `/api/health` verde.
7. Integrar el servidor autorizado de cada juego contra el motor del hub; nunca confiar en score cliente.
8. Activar el cierre semanal de ranking y verificar catch-up, manifest y health antes de calcular rewards.
9. Generar solo drafts de claim, reconciliar totals y desplegar/publicar contrato/batch mediante un cambio operativo separado.
