# UKI UX state matrix

Estado: especificacion UX inicial para implementacion.
Issue: #111 `UKI-070.2`.
Fecha: 2026-05-17.
Fuentes: `docs/uki-dapp-sitemap.md`, `docs/uki-current-operating-rules.md`, `docs/uki-technical-disclaimers.md`.

## Objetivo

Definir estados de UI para cada pantalla de la dapp UKI antes de implementar restyling o pantallas finales. La matriz evita que una pantalla mezcle responsabilidades o prometa acciones que todavia no estan disponibles.

## Estados globales

Estos estados se aplican a cualquier pantalla que dependa de wallet, red, datos on-chain o APIs internas.

| Estado | Cuando aparece | UI esperada | Accion principal | No hacer |
| --- | --- | --- | --- | --- |
| Wallet desconectada | No hay wallet conectada y la pantalla necesita datos personales o transaccion. | Estado vacio con explicacion corta y bloque de datos publicos si aplica. | Connect wallet. | Mostrar balances ficticios o rewards personales. |
| Chain incorrecta | Wallet conectada en red distinta de BNB Smart Chain para accion UKI. | Banner persistente y bloqueo de acciones on-chain. | Switch to BNB Smart Chain. | Permitir compra, staking, claim o pool actions. |
| Datos cargando | API, indexer o contrato aun responde. | Skeletons con estructura real de pantalla. | Ninguna o cancelar si aplica. | Cambiar layout al terminar de cargar. |
| Datos sincronizando | Hay cache parcial o indexer retrasado. | Aviso de sincronizacion y datos en solo lectura cuando sea seguro. | Retry / refresh. | Permitir acciones economicas si falta reconciliacion. |
| Error recuperable | API/contrato falla pero el usuario puede reintentar. | Mensaje tecnico corto, codigo si existe y accion retry. | Retry. | Perder contexto de formulario o seleccion. |
| Accion pendiente | Hay tx o job pendiente. | Estado de progreso con hash/job id cuando exista. | View on BscScan / View status. | Duplicar la accion sin idempotencia. |
| Accion confirmada | Tx/evento/job confirmado. | Confirmacion discreta y siguiente paso claro. | Continue / view details. | Marcar claim/compra como final sin evento confirmado. |
| Coming next | La fase no esta abierta pero se comunica utilidad futura. | Preview bloqueada con fase y criterio de apertura. | Read details / Join presale. | Simular disponibilidad real. |

## Landing / Launch

Ruta: `/`

| Estado | UI esperada | Accion principal | Secundarias |
| --- | --- | --- | --- |
| Publica ready | Hero de preventa cerrada, facts de UKI, BSC, ASM, vesting y utilidad futura. | Join UKI presale / Notify me segun estado real. | Read sale details, View Treasure Hunt. |
| Preventa aun cerrada | Mostrar fecha prevista o "coming soon" sin formulario transaccional. | Read sale details. | Connect wallet opcional si aporta valor. |
| Wallet desconectada | Landing sigue siendo navegable; modulo de compra muestra preview sin datos personales. | Connect wallet. | Read sale details. |
| Chain incorrecta | Banner si wallet conectada, sin bloquear lectura publica. | Switch network. | Read sale details. |
| Datos cargando | Skeleton solo para status strip/modulo dinamico. | Ninguna. | Ninguna. |
| Error de status | Mantener landing y marcar status de preventa como no disponible. | Retry status. | Read docs. |

## Preventa UKI

Ruta: `/presale`

| Estado | UI esperada | Accion principal | Secundarias |
| --- | --- | --- | --- |
| Preventa cerrada | Condiciones visibles: precio 0.01 USD, duracion 1 mes, ASM, vesting 9 meses, liquidez. Compra bloqueada. | Connect wallet / Read rules. | View vesting rules. |
| Wallet desconectada | Formulario en modo preview sin allowance ni balance personal. | Connect wallet. | Read sale details. |
| Chain incorrecta | Compra, approve y vesting personal bloqueados. | Switch to BNB Smart Chain. | View public sale facts. |
| Sin allowance ASM | Balance visible; compra bloqueada hasta approve. | Approve ASM. | Edit amount. |
| Allowance suficiente | Quote ASM -> UKI, vesting preview y riesgos visibles. | Buy UKI. | Edit amount, View BscScan config. |
| Compra pendiente | Hash visible, formulario bloqueado e idempotencia por tx. | View on BscScan. | Return to wallet. |
| Compra confirmada | Resumen comprado, vesting creado/pendiente de indexar. | View vesting. | Go to wallet. |
| Sale cap agotado | Compra bloqueada; explicar que preventa esta agotada. | View wallet. | Read tokenomics. |
| Error compra | Mantener amount/quote y mostrar motivo: allowance, cap, ventana, red o contrato pausado. | Retry. | Edit amount. |

## Dashboard Wallet

Ruta: `/wallet`

| Estado | UI esperada | Accion principal | Secundarias |
| --- | --- | --- | --- |
| Wallet desconectada | Estado vacio con valor de conectar: UKI, NFTs, creditos, cupos. | Connect wallet. | Read sale details. |
| Chain incorrecta | Datos cacheados en solo lectura si son seguros; acciones bloqueadas. | Switch network. | Refresh data. |
| Loading | Skeleton por modulos: UKI, NFTs, creditos, rewards, alerts. | Ninguna. | Ninguna. |
| Sin actividad | Wallet conectada sin compra/stake/NFT detectado. | Go to presale. | Read Cukie Master. |
| Datos inconsistentes | Alertas por NFT/listing/bridge/indexer; acciones sensibles bloqueadas. | Refresh / contact support. | View details. |
| Ready | Resumen personal con alertas priorizadas y enlaces a pantallas especializadas. | Review wallet status. | Go to Cukie Master, View rewards. |

## Cukie Master

Ruta: `/cukie-master`

| Estado | UI esperada | Accion principal | Secundarias |
| --- | --- | --- | --- |
| Coming next | Explica cupos, rutas y regla de 24h sin permitir staking si la fase no esta abierta. | Read rules. | Go to presale. |
| Wallet desconectada | Preview de rutas y puntos por rareza; sin calculo personal. | Connect wallet. | Read rules. |
| Chain incorrecta | Acciones UKI/NFT BSC bloqueadas. | Switch network. | View read-only summary. |
| Sin cupos | Muestra requisito actual: 20,000 UKI o 3 puntos Cukies Originales. | Stake UKI / Review NFTs. | Go to presale. |
| Cupo activo | Cupos, espera 24h, creditos futuros y exceso stakeado. | Manage slots. | Configure credits. |
| Requisito subiendo | Aviso fuerte: requisito anterior/nuevo, cantidad adicional, fecha limite 48h y cupos que perderia. | Add stake / add points. | View deadline. |
| Unstake pendiente | Impacto claro en cupos y creditos futuros. | Confirm unstake. | Cancel. |

## Pool de Creditos

Ruta: `/pools/credits`

| Estado | UI esperada | Accion principal | Secundarias |
| --- | --- | --- | --- |
| Coming next | Explica aportes diarios y minimo vigente sin permitir configuracion. | Read rules. | Go to Cukie Master. |
| Sin cupo Cukie Master | Bloquear configuracion; explicar requisito. | Go to Cukie Master. | View rules. |
| Antes del corte | Permitir configurar multiplos de 10 para la proxima entrega. | Configure credits. | View ledger. |
| Despues del corte | Mostrar que cambios aplican al dia siguiente. | Schedule change. | View today's pool. |
| Sin creditos | Ledger visible; no permitir depositar manualmente si no hay creditos. | View next grant. | Go to Cukie Master. |
| Ready | Balance, configuracion, pool availability, minimo 0.75 UKI/10 creditos si aplica. | Configure credits. | View pool history. |
| Error ledger | Mantener configuracion local en solo lectura y permitir retry. | Retry. | Export visible rows. |

## Pool de Cukies

Ruta: `/pools/cukies`

| Estado | UI esperada | Accion principal | Secundarias |
| --- | --- | --- | --- |
| Coming next | Explica BSC-only para nuevas posiciones y separacion Originales/2a gen. | Read rules. | Go to wallet. |
| Wallet desconectada | Preview de rarezas, partidas y reparto; sin inventario personal. | Connect wallet. | Read rules. |
| Chain incorrecta | Acciones bloqueadas; inventario Tron solo como lectura/migracion si existe. | Switch network. | View migration note. |
| Sin Cukies elegibles | Explica si faltan NFTs, estan en Tron, listados, bridge o bloqueados. | View wallet. | Refresh inventory. |
| Cukie bloqueado | Mostrar razon: listed, bridging, in pool, assigned, soft staked, invalidated. | View details. | Refresh. |
| Ready | Lista densa de Cukies elegibles con rareza, generacion, partidas y estado. | Add Cukie to pool. | Withdraw Cukie, View rewards. |
| Retirada pendiente | Si esta asignado a partida, mostrar bloqueo/expiracion. | Request withdrawal. | View assignment. |

## Treasure Hunt Entry

Ruta: `/games/treasure-hunt`

| Estado | UI esperada | Accion principal | Secundarias |
| --- | --- | --- | --- |
| Coming next | Explica coste 10 creditos, 2.5 pool semanal y 7.5 en juego. | View rules. | Go to wallet. |
| Wallet desconectada | Reglas publicas y bloqueo de start. | Connect wallet. | View rules. |
| Sin creditos propios | Intentar asignar pool solo al iniciar, mostrando disponibilidad. | Start with pool credits. | View pool status. |
| Con creditos propios | Indicar que no computa ranking ni usa rank para settlement. | Start run. | Select Cukie. |
| Sin Cukie propio disponible | Mostrar asignacion de pool/Seiku al iniciar. | Start with pool Cukie. | View rules. |
| Cukie propio disponible | Selector o decision automatica pendiente; mostrar impacto de partidas disponibles. | Select Cukie. | Start run. |
| Recursos reservando | Bloquear doble start hasta session economy id. | Ninguna. | Cancel si backend lo permite. |
| Session ready | Entrar al juego con token de sesion. | Start run. | View session details. |
| Score enviado | Resultado en revision antes de ranking/rewards. | View result. | Go to Arena. |

## Arena Ranking

Ruta: `/arena`

| Estado | UI esperada | Accion principal | Secundarias |
| --- | --- | --- | --- |
| Coming next | Explica ranking #1-#9 y minimos sin clasificacion activa. | Read rules. | View Treasure Hunt. |
| Wallet desconectada | Ranking publico si existe; datos personales ocultos. | Connect wallet. | View rules. |
| Sin partidas rankeables | Rank inicial #5 o sin periodo; explicar que solo cuentan creditos del pool. | Play Treasure Hunt. | View rules. |
| Periodo activo | Rank actual, progreso, partidas validas, % conversion sin 2.5 iniciales. | View my rank. | View weekly rules. |
| Cierre en progreso | Congelar cambios visibles y mostrar periodo en calculo. | Refresh. | View previous period. |
| Ready cerrado | Rank final, movimiento +2/-2 aplicado y enlace a rewards pendientes. | View rewards. | Open history. |

## Rewards Claim

Ruta: `/rewards`

| Estado | UI esperada | Accion principal | Secundarias |
| --- | --- | --- | --- |
| Wallet desconectada | Explica pending vs claimable sin datos personales. | Connect wallet. | Read disclaimers. |
| Chain incorrecta | Claims bloqueados; historial cacheado en solo lectura si es seguro. | Switch network. | View history. |
| Sin rewards | Empty state con origenes posibles: preventa, Cukie Master, pools, ranking. | Go to wallet. | View rules. |
| Pending rewards | Mostrar como no claimable hasta batch/proof. | View pending details. | Refresh. |
| Claimable | Mostrar batch/proof, importe y disclaimer final on-chain. | Claim rewards. | View proof. |
| Claim pendiente | Hash visible y boton BscScan. | View on BscScan. | Refresh. |
| Claim confirmado | Estado confirmed solo con evento on-chain indexado. | View history. | Go to wallet. |
| Error claim | Mantener batch/proof y motivo de fallo. | Retry claim. | View details. |

## Admin / Ops

Ruta: `/admin/ops`

| Estado | UI esperada | Accion principal | Secundarias |
| --- | --- | --- | --- |
| No autorizado | Bloqueo total sin datos sensibles. | Return home. | Contact admin. |
| Loading | Skeleton de jobs, batches, snapshots, inconsistencias. | Ninguna. | Ninguna. |
| Sin acciones pendientes | Estado limpio con ultimo job y proximo run. | Review schedule. | Export report. |
| Acciones pendientes | Cola priorizada: jobs fallidos, batch approval, inconsistencias NFT, parametros. | Review pending actions. | Open job monitor. |
| Error job | Mostrar jobRunId, periodo, input hash y retry seguro. | Retry job. | Export logs. |
| Accion sensible | Confirmacion con actor, motivo y previsualizacion de impacto. | Confirm action. | Cancel. |

## Reglas de implementacion

- Los componentes deben reservar espacio estable para cada estado y evitar saltos de layout.
- Los estados `pending`, `claimable`, `confirmed` y `failed` deben tener origen claro: contrato, backend, job o cache.
- La UI puede mostrar previews, pero debe etiquetarlos como previews y no como saldos finales.
- La pantalla no decide elegibilidad final; consume APIs de dominio o lectura de contrato.
- Las acciones economicas necesitan idempotencia por tx, session id o jobRunId.
