# UKI new economy database implementation map

Estado: la vertical v3 de créditos, Treasure Hunt, ranking y contabilidad de rewards está implementada con gates de activación independientes. Los contratos NFT siguen desplegados en BSC Testnet y sus identidades/cursores están verificados. La publicación de batches claimables y cualquier paso a mainnet continúan siendo operaciones separadas que exigen funding y aprobación explícita.
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

### Avance local Stage/Testnet del 2026-08-30

Se ha eliminado el fallback silencioso del cliente bridge hacia los contratos
mainnet. El runtime nuevo solo se habilita cuando toda la topologia es coherente:

- `APP_ENV=staging`.
- BSC chain `97` con coleccion y endpoint propios.
- TRON `nile` con RPC, coleccion y endpoint propios.
- Ninguna address coincide con los contratos legacy mainnet.
- La fixture BSC Testnet que solo emite eventos no puede configurarse como endpoint.

Sin esa topologia, `/bridge` queda apagado y no monta hooks de lectura, approvals ni
firmas on-chain. La configuracion se valida en
`dapp/src/lib/legacy-marketplace/bridge-runtime.ts`.

Tambien existe una primera vertical contractual local en
`packages/contracts/contracts/CukiesBridgeEndpoint.sol`. Dos instancias emulan
TRON y BSC con:

- lock/mint/release y vuelta completa;
- comision nativa exacta enviada a treasury;
- relayer allowlisted, pausa y ownership no renunciable;
- `transferId` de un solo uso y proteccion contra replay;
- bloqueo de doble circulacion y de liberacion de NFTs no registrados;
- metadata completa hasheada para tipo, generacion, seis skills, energia y vida;
- recovery solo para transferencias no registradas y con el endpoint pausado.

La emulacion local Stage se ejecuta sin desplegar ni firmar transacciones:

```bash
pnpm staging:bridge:verify-local
```

Evidencia obtenida por lecturas publicas el 2026-08-30, solo para auditar el modelo
legacy y no para reutilizarlo en Stage:

- TRON mainnet: `bridgePrice=10_000_000 SUN` (`10 TRX`) y `paused=false`.
- BSC mainnet: `bridgePrice=0`, `paused=false` y owner todavia
  `0x7894df8379c2e156f0e4d9df0829127d605bd52b`.
- Dos salidas BSC legacy confirmadas consumieron `223678` y `223666` gas:
  `0x0f1a9cfbb2d27e3eee58c52a00f1592ecea6e006b3b9d6ca8cdbdd67b03039ea`
  y `0x31116020150232ad1f006973140d8b71c0b371b1e4da5d462e64ad8c8d471acc`.

El relayer Stage-only ya existe en `packages/cukies-bridge-relayer`: procesa solo
`BridgeRequested` confirmados de Nile hacia BSC Testnet, deduplica por `transferId`,
verifica metadata/custodia, usa leases, backoff y DLQ, no reenvia receipts ambiguos
y reconcilia una unica representacion circulante. El profile Docker permanece
desactivado y exige gates explicitos de Stage.

Esto aun no cierra el bridge del documento. Faltan los despliegues reales en
Nile/BSC Testnet, allowlist/key handover, el E2E real con receipts y reconciliacion,
y sustituir los `10 TRX` por una tarifa derivada del coste BSC medido con buffer
aprobado.

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

Para considerar el bridge usable en staging ya no falta la arquitectura local:
el runtime, los endpoints lock/mint/release y el relayer idempotente estan
implementados y probados. Lo pendiente es operacional: desplegar endpoints y
colecciones reales en Nile/BSC Testnet, autorizar el relayer, hacer el handover de
claves y ejecutar un E2E firmado que reconcilie receipts, ownership, metadata y
una sola representacion circulante en ambos extremos. Antes de habilitarlo tambien
hay que reemplazar la tarifa fija legacy de 10 TRX por una tarifa derivada del gas
BSC medido y aprobar su buffer.

## Estado revisable: creditos de competicion y pool de creditos

Fecha de comprobacion: 2026-08-20.

Veredicto: la vertical v4 está cerrada en código para probarla en staging. Los
gates permiten activar por separado snapshots/créditos, sesiones de juego,
ranking y cierres de rewards. Un fallo de una ruta UKI/NFT, una fuente tardía o
un cierre incompleto queda pendiente y no genera una liquidación parcial.

| Area | Implementado | Pendiente antes de activar |
| --- | --- | --- |
| Ledger | `grant`, `pool_deposit`, `reserve`, `release`, `spend`, `expire`, compensación tardía e historial auditable por ruta. | Publicar batches solo después de reconciliar el cierre off-chain. |
| Maduracion | Slots/epochs por ruta, mínimo 24h, máximo 5 por ruta, `cutoffBlock` canónico y reconstrucción histórica fail-closed. | Vigilar salud y cobertura histórica desde el baseline v3; no se inventa historia anterior. |
| Consumo | Saldo propio primero; si no alcanza, 10 créditos completos del pool; reserva a las 13:59 válida al finalizar tras el corte; abandono consume y no premia. | Ninguno para la prueba funcional v3. |
| Aportacion al pool | Configuración por slot/epoch, atribución al aportante, ledger y censo diario. | Ninguno para la prueba funcional v3. |
| Reparto | Cierre a las 16:00, garantía sobre ordinario + tramo previo, 5% ambassador del pago final y 80/10/10 de residuos. | Funding/publicación on-chain siguen separados del cálculo off-chain. |
| Semanal | Mejor score raw por wallet, 60/30/10, entropía BSC, payout lunes 17 y pools en siete tramos martes-lunes a las 16. | Publicación on-chain de los allocations ya sellados. |
| Economia de partida | `G=0..7.5`, `2` al bote semanal, `0.4` ambassador ordinario y `0.1` ambassador semanal; cuotas 30/10 solo con créditos prestados. | Ninguno para la prueba funcional v3. |
| Claims | Allocations finales de los cierres diario/semanal, Merkle reproducible, API de proofs y worker testnet-only implementados. El worker separa claims, transferencias 80/10 y quema 10, firma de forma durable y espera evidencia del indexador. | En el distributor UKI activo de staging falta cargar de forma segura la clave de su owner `0xba84...7820`; hasta entonces `REWARD_BATCH_PUBLISHER_ENABLED=false`. El canary aislado BSC97 publicó y reclamó 10 tokens de prueba el 20-08-2026 (`publish 0x5d44635e...9503`, `claim 0xa4e92d08...e104`). |

Reglas vigentes para la implementacion:

- Periodo diario `[14:00 UTC, 14:00 UTC siguiente)`.
- Los 100 creditos por cupo se hacen disponibles en el propio corte de las
  14:00 UTC; no esperan al cierre economico.
- El reparto se intenta desde las 16:00 UTC; si faltan datos queda pendiente y
  se recupera con el mismo `periodId`.
- 100 creditos por slot elegible tras al menos 24 horas y en el primer corte
  posterior.
- Los creditos no son transferibles entre usuarios; si pueden aportarse al pool
  mediante movimientos internos auditables.
- UKI y NFT deben sellarse y recuperarse de forma independiente.
- Treasure Hunt consume 10 creditos y separa nominalmente 7.5/2/0.5 UKI.

La regla `credits-staging-test-v4` separa explícitamente entrega de créditos a
las 14:00 y liquidación UKI/pools a las 16:00. El publicador de batches es un
worker independiente: su secreto no se comparte con la Dapp y no puede arrancar
en mainnet, otra base, otra rama, otra chain o con una clave que no resuelva a la
wallet owner esperada.

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
| `ambassador_attributions` | Relacion directa e inmutable aceptada por sesion EVM firmada, con politica 500 bps/1 nivel y evidencia; materializa sponsors bloqueados de preventa con precedencia. | Snapshot de embajador para jugador, Credit Pool y Cukie Pool sin exigir compra ni permitir cambios retroactivos. |
| `weekly_ranking_sources` / `game_weekly_rankings` | Sources canonicos y snapshot semanal con rank aplicado y siguiente rank. | Ranking #1-#9 solo con creditos del pool. |
| `weekly_ranking_manifests` / `weekly_ranking_runs` / `weekly_ranking_audit_events` | Sellado, replay y auditoria del cierre semanal. | Umbrales, minimos y movimiento maximo semanal. |
| `reward_allocations` / `reward_pool_accruals` / `reward_source_manifests` | Claims finales y obligaciones intermedias no claimables, fenced y reproducibles. | Jugador, bote semanal, `ambassador_program_pending`, pool creditos, pool Cukies y destinos 80/10/10 sin doble pago. |
| `reward_emission_budget_state` / `reward_emission_budget_days` / `reward_emission_budget_events` / `reward_daily_capacity_materializations` | Reserva atomica, techo diario/acumulado, fencing, materializacion hasta el `dailyCapRaw` de cada regla e idempotencia. La supersesion operativa cierra solo la vigencia futura sin mutar el `configHash` anterior. | Exactamente el cap versionado por dia (500,000 UKI en la regla Stage actual), techo 450M inmutable y excesos fail-closed. Una regla futura puede usar 600,000 desde un corte no abierto. |
| `reward_daily_accounting` / `reward_weekly_prize_accounting` / `reward_accounting_allocations` | Cierres inmutables y salida plana por wallet con funding `daily_emission` o `reserved_no_mint`. | Repartos diario/semanal auditables sin volver a consumir presupuesto. |
| `reward_claim_batches` | Batches publicables para claim on-chain. | Claim final de rewards UKI. |
| `reward_claim_proofs` / `reward_claims` | Proofs separados y estado indexado de claims por wallet/batch. | Claim ejecutado y soporte a batches grandes. |

## Puntos del documento y plan de implementacion

| Punto | Decision tecnica | Estado |
| --- | --- | --- |
| Pausar generacion de Cukie Points | Operacion legacy controlada por contrato; antes de ejecutar, generar snapshot de claimed + pending usando `points` + `calcPoints(tokenId)`. Resultado se importa como baseline a `cukieshub-new`. | Biblioteca preview-only, manifest, plan sin firma y verificador implementados; snapshot/report live y ejecución siguen pendientes de aprobación. |
| Tabla por wallet de Cukie Points | Export desde legacy `points` + wallets/user linkage + pending on-chain. Guardar resumen estructural, no datos sensibles en Git. | Serializadores JSONL/CSV canónicos implementados; falta proporcionar fuentes/cutoffs live autorizados. |
| Pausar crias con Cukie Points | Operacion legacy: pausar contrato/UI. No crear nueva mecanica de breeding en UKI. | Pendiente de accion ops. |
| Bridge Tron -> BSC | Migracion unidireccional a BSC; nueva economia solo acepta nuevas posiciones BSC. `NftInventoryService` marca Tron como lectura/migracion. | Parcial: contrato, UI fail-closed y relayer idempotente estan emulados localmente; faltan deploy Nile/BSC Testnet y E2E real. |
| Incidente GraphQL de usuarios | El backend legacy no puede exponer enumeración masiva, hashes de contraseña ni la relación anidada wallet→usuario. JWT y firmas de wallet deben fallar cerrados; ninguna credencial de chain puede vivir en código. | El parche base sigue en el PR borrador `cukiesworld-stack#18` contra `Development`. La rama local dependiente queda en `c218e13b`: GraphQL 4 suites/13 tests, auth 2 suites/23 tests, scanner 31 tests, lint sin errores, frontend y commander compilan para Stage, y tanto el árbol Git como el bundle de Stage pasan el escáner sin material sensible. También se retiraron credenciales versionadas, claves privadas del navegador, tests contra bases remotas y contraseñas Telegram predecibles; los contenedores reciben el token privado por BuildKit. Aún faltan push/revisión, build de auth/GraphQL/productores con un `NPM_TOKEN` nuevo para resolver los paquetes privados `@3fera`, rotación de todas las credenciales expuestas, invalidación de sesiones, reset/revisión de cuentas y smoke negativo en Stage. No se considera cerrado hasta completar esas acciones operativas. |
| Marketplace legacy | Mantenerlo como fuente histórica durante la migración, pero publicar solo órdenes con evidencia owner/listing coherente. `Stake`, `Transfer`, bridge, compra o cancelación invalidan o cierran la orden; Cukie Points se repara con eventos absolutos. | Implementado y probado localmente sobre el indexador Stage. Tarifas legacy verificadas por lectura: venta 10%, cancelación 0, cambio 0.0002 BNB/10 TRX y unstake sin fee. Falta ejecutar y auditar el backfill antes de trasladar el filtro a producción. |
| Marketplace UKI | Contrato BSC no custodial: el NFT permanece en la wallet hasta la compra; owner y approval se revalidan al llenar. Precio exacto al vendedor en UKI y comisión pagada por el comprador en UKI, BNB o USDT mediante rutas configuradas. | Contrato, API/UI, indexación, replay y estados `active/sold/cancelled/expired/invalid` implementados. El gate local `pnpm staging:marketplace:verify-local` emula chain `97` y valida UKI directo de forma independiente: BNB/USDT se ocultan si sus rutas no están completas y BNB además nace bloqueado on-chain. Sigue cerrado en Stage porque el contrato no está desplegado/verificado; BNB/USDT no tienen hoy ruta verificada y la comisión nueva requiere decisión de producto antes del deploy. |
| Premios preventa | Registrar elegibilidad/ranking off-chain; mint/entrega de NFTs requiere flujo BSC/ops especifico. | Pendiente. |
| Cierre preventa y extension | Contrato `Presale` permite mover ventanas; decision de prolongar se decide por estado on-chain/indexado. | Implementado en contrato, pendiente de politica ops. |
| Torneo compradores preventa | Crear entitlement ledger: 1 partida por cada 1,000 UKI comprados, basado en eventos `Purchased`. | Pendiente. |
| Cukie Master ruta UKI | Calculo desde vesting/preventa/stake BSC indexado. Maximo 5 por wallet en esta ruta. | **Ya implementado y desplegado en staging.** `UKIStaking` esta activo en BSC Testnet (chain `97`) en `0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205`; se conservan el contrato y sus posiciones, sin migracion ni redeployment. Proyeccion, servicio, runtime, reconciliacion, API/UI y panel approve/stake/unstake estan implementados. |
| Cukie Master ruta NFT | Custodia en `CukieMasterNftVault`; calculo desde eventos confirmados, rareza y epochs. Maximo 5 por wallet. NFT no jugable mientras esta depositado. | Vertical desplegada: contrato, ABI, colección ERC721 V2, metadata/indexador, recálculo aislado, API y UI approve/deposit/withdraw. Contrato, configuración, backfill inicial e identidad/cursores están verificados en staging. La recuperación directa no depende de API/indexador y conserva una lista pública histórica separada de las colecciones activas. Pendiente smoke E2E firmado de approve/deposit/withdraw. |
| Recarga de Cukie Master | Una recarga o actualización no puede hacer desaparecer temporalmente Cukies/cupos confirmados ni permitir que una respuesta antigua reemplace otra más nueva. | Corregido y probado localmente: carga inicial con tres reintentos acotados, última lectura confirmada conservada en modo degradado, estimaciones sensibles anuladas mientras está degradado, inventario NFT bloqueado para nuevos depósitos y respuestas fuera de orden ignoradas. Gate reproducible: `pnpm staging:cukie-master:verify-local`. |
| Capacidad/requisito Cukie Master | Empezar en 500 por ruta, ampliar hasta 5,000 o subir requisito con 48h de gracia. | Control HMAC, CAS/evento idempotente, expansion solo creciente, barrido paginado y deficit de conservacion en UI implementados. |
| Creditos diarios | Job diario crea `grant` de 100 créditos por cupo tras 24h, reconstruido `as-of-cutoffBlock`. | Implementado v3: rutas UKI/NFT independientes, bloque/hash canónico, journal temporal, catch-up sin pérdida y compensación >24h idempotente. El baseline anterior a v3 falla cerrado. El gate `pnpm staging:credits:verify-local` reproduce Stage/chain 97 y demuestra grant único, uso, caducidad y replay. |
| Pool de creditos | Depósitos en múltiplos de 10 antes del corte; reparto diario y arrastre semanal versionado. | Implementado v3: censo diario, proporcionalidad, garantía `max(ordinario + 1/7, 0.75/10)`, topup desde capacidad diaria y comisión ambassador sobre el pago final. La regresión local prueba que los lotes propios y los aportados al pool caducan exactamente una vez en el mismo corte diario. |
| Pool de Cukies | Un `CukiePoolNftVault` custodia ambas generaciones; lifecycle y cuotas son diarios; Original/Segunda se liquidan separados; Seiku no alimenta pools. | Vertical desplegada: contrato/ABI, calendario 14:00 versionado, proyección, API/UI, prioridad Original→Segunda→Seiku, lease exclusivo, cuota por epoch+periodo, salida al corte y dispatcher GameEconomy. Contrato, configuración, backfill inicial e identidad/cursores están verificados en staging. La retirada directa sigue operativa para colecciones históricas mientras existan posiciones. El calculador aplica tramos acumulativos 45/20/15/12/7/1; Seiku y tramos sin elegibles pasan a `undistributed_pending`. Pendientes smoke E2E firmado y coordinador productivo de liquidación. |
| Ranking semanal | Solo partidas con créditos del pool; rank #1-#9, subida/bajada semanal y mínimos. | Implementado v3: mejor score raw, desempate temporal, snapshot de rank anterior sellado y runtime independiente. |
| Treasure Hunt | El hub crea `game_economy_sessions`, reserva recursos y liquida; el juego no decide rewards. | Integración v3 completa: autoridad económica, checkpoints, cuotas 30/10, abandono, recuperación, periodo anclado a reserva e integración real DApp/iframe. |
| Reparto de recompensas | `G=0..7.5`, 2 UKI semanales, reservas ambassador separadas, pools por generación/rareza y Seiku no distribuido. | Implementado v3 con cierre diario, semanal, siete tramos, censo diario y salida plana por wallet. La publicación de batches on-chain permanece separada. |
| Programa de embajadores | Atribucion canonica por wallet firmada, sin compra, un nivel directo inicial y 5% sobre el pago final; sponsors bloqueados de preventa tienen precedencia. | Implementado para staging: endpoint firmado, snapshot por run/corte, replay idempotente, relacion inmutable y comision no recursiva en el mismo cierre del referido. |
| Claim diferido | Las partes de pools del bote semanal se dividen en siete disponibilidades durante la semana siguiente. | Implementado con censo de participantes de cada día receptor, de martes a lunes a las 16:00, funding `reserved_no_mint`. |
| UKI no distribuido | `dailyCapRaw de la regla - todas las asignaciones/reservas del día`; residuos posteriores del semanal siguen el mismo destino. | Implementado: 500,000 en Stage actual, cap futuro versionable solo desde un corte no abierto, y reparto 80% tesorería, 10% bucket conjunto marketing/desarrollo y 10% reducción de supply, tanto diario como semanal. |
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
