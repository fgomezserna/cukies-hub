# UKI Launch - Backlog tecnico

Estado: borrador tecnico para convertir en GitHub Issues.
Cadena objetivo: BNB Smart Chain.
Fuente operativa de NFTs: Mongo Proxmox / marketplace.cukies.world.
Regla base: Mongo opera producto y juegos; BSC liquida valor, staking de UKI, vesting y claims.

## Convenciones

- `Milestone`: entrega tecnica verificable.
- `Epic`: issue padre.
- `Task`: issue hija.
- `UX image gate`: ninguna imagen se genera ni se inserta sin validacion previa del usuario.
- `On-chain`: contratos, transacciones, eventos, claims o custodia de valor.
- `Off-chain`: Mongo, API, indexers, juegos, ranking, creditos, snapshots y calculos.

## Labels sugeridas

- `area:contracts`
- `area:dapp`
- `area:games`
- `area:backend`
- `area:data`
- `area:ux`
- `area:security`
- `area:ops`
- `type:epic`
- `type:task`
- `priority:p0`
- `priority:p1`
- `priority:p2`
- `blocked`
- `needs-validation`
- `needs-ux-image`

## Reglas tecnicas ya decididas

1. La nueva economia UKI vive solo en BSC.
2. Los NFTs existentes pueden estar en BSC y Tron, pero la app y juegos pueden usar Mongo como fuente operativa.
3. El bridge entre redes ya existe en `marketplace.cukies.world`; no forma parte del core de este backlog salvo integracion de estados.
4. Las partidas, creditos, ranking, pools y calculos se resuelven off-chain.
5. Las compras, vesting, staking de UKI y claim final de UKI se resuelven on-chain en BSC.
6. Treasure Hunt es el primer juego, pero la arquitectura debe soportar multiples juegos.
7. Toda pantalla que tenga especificacion UX necesita imagen generada validada antes de implementacion visual final.

## Milestone M0 - Decisiones de arquitectura y alcance

Objetivo: cerrar limites de sistema antes de escribir contratos o pantallas.

### UKI-001 Epic - ADR: limites on-chain/off-chain

Tipo: Epic
Prioridad: P0
Areas: contracts, backend, data

Descripcion:
Crear un documento de arquitectura que defina que vive en BSC, que vive en Mongo y que datos cruzan entre ambos mundos.

Issues hijas:

- UKI-001.1 Task - Mapear operaciones economicas
  - Definir compra, vesting, staking UKI, soft staking NFT, pool de creditos, pool de Cukies, ranking, rewards y claim.
  - Documento de decision: `docs/adr-uki-economic-operations.md`.
  - Acceptance criteria:
    - Cada operacion tiene propietario: contrato, backend, job o UI.
    - Cada operacion indica fuente de verdad.
    - Cada operacion indica si requiere auditoria/event log.

- UKI-001.2 Task - Definir estados canonicos de wallet y assets
  - Estados minimos: `available`, `listed`, `bridging`, `soft_staked`, `in_pool`, `assigned_to_game`, `invalidated`, `unknown`.
  - Acceptance criteria:
    - Un NFT no puede estar simultaneamente en marketplace, bridge, staking y pool.
    - Hay reglas de recuperacion cuando Mongo y chain/indexer discrepan.

- UKI-001.3 Task - Definir politica de consistencia
  - Definir ventanas aceptables de sincronizacion para ownership NFT, staking, credits y rewards.
  - Acceptance criteria:
    - Queda definido que se calcula en snapshot diario/semanal.
    - Queda definido que se comprueba en tiempo real antes de iniciar partida.

Dependencias: ninguna.

### UKI-002 Epic - Auditoria de datos existentes en Mongo/marketplace

Tipo: Epic
Prioridad: P0
Areas: data, backend

Descripcion:
Entender las BDs actuales de Proxmox y marketplace para no duplicar modelos ni romper bridge/marketplace.

Issues hijas:

- UKI-002.1 Task - Inventariar bases, colecciones y campos NFT
  - Acceptance criteria:
    - Documento con colecciones relevantes por red.
    - Campos: contract/network, tokenId, owner, rarity, generation, metadata, listing status, bridge status.

- UKI-002.2 Task - Validar calidad de owner y rareza
  - Acceptance criteria:
    - Muestreo de NFTs BSC y Tron contra fuente esperada.
    - Informe de campos incompletos o inconsistentes.

- UKI-002.3 Task - Definir adaptador `NftInventoryService`
  - Acceptance criteria:
    - API interna propuesta con metodos:
      - `getWalletNfts(wallet)`
      - `getPlayableCukies(wallet)`
      - `getPoolEligibleCukies(wallet)`
      - `lockCukie(assetId, reason)`
      - `unlockCukie(assetId, reason)`
      - `validateOwnership(assetId, wallet)`

Dependencias: UKI-001.

### UKI-003 Epic - Matriz de riesgos legales/comunicacion tecnica

Tipo: Epic
Prioridad: P0
Areas: contracts, backend, ux

Descripcion:
Separar reglas tecnicas de lenguaje publico. Evitar que la UI prometa rentabilidad si legal no lo valida.

Issues hijas:

- UKI-003.1 Task - Marcar terminos sensibles
  - Terminos a revisar: `ingresos pasivos`, `retorno garantizado`, `premio`, `renta`, `yield`, `APR`, `garantizado`.
  - Acceptance criteria:
    - Lista de terminos permitidos, prohibidos y pendientes de legal.

- UKI-003.2 Task - Crear disclaimers tecnicos para rewards
  - Documento de disclaimers: `docs/uki-technical-disclaimers.md`.
  - Acceptance criteria:
    - Textos cortos para UI de rewards, staking y preventa.
    - Los textos no bloquean implementacion, pero quedan marcados como `needs-legal-validation`.

Dependencias: ninguna.

## Milestone M0.5 - Comunicacion, UX y restyling

Objetivo: poder empezar a comunicar el lanzamiento antes de que contratos/backend esten completos, sin arrastrar la web antigua ni una UX improvisada.

### UKI-004 Epic - Comunicacion, restyling y sistema visual de lanzamiento

Tipo: Epic
Prioridad: P0
Areas: ux, dapp, brand, copy, visual-design

Descripcion:
Primero hay que cerrar narrativa, arquitectura UX, sistema visual e imagenes validadas. La implementacion economica completa puede avanzar despues, pero la comunicacion publica necesita una base visual y de producto coherente desde el inicio.

UX image gate:
- Estado: pendiente de validacion del usuario.
- Pantallas iniciales: Landing Launch, Preventa UKI, Dashboard Wallet, Cukie Master, Games Entry/App Shell.
- Regla: ningun prompt se genera como imagen sin validacion previa, y ninguna imagen se usa como referencia final sin aprobacion posterior.

Issues hijas:

- UKI-004.1 Task - Auditoria de web actual y superficies a restylar
  - Acceptance criteria:
    - Inventario de paginas actuales y funcion real de cada una.
    - Lista de mensajes obsoletos o contradictorios con UKI launch.
    - Priorizacion de superficies: landing, preventa, dashboard, games entry, header/nav, OG/social.

- UKI-004.2 Task - Narrativa tecnica de lanzamiento y mapa de comunicacion
  - Acceptance criteria:
    - Mensaje principal aprobado.
    - Mensajes secundarios para Cukie Master, pools, juegos, BSC y preventa.
    - Lista de terminos sensibles que no deben usarse sin validacion legal.
    - Jerarquia de comunicacion para web, dapp, Discord/X/Telegram y marketplace.

- UKI-004.3 Task - Sistema visual UKI launch
  - Acceptance criteria:
    - Paleta, tipografia, espaciado, botones, cards, tablas, estados y motion definidos.
    - Reglas para assets Cukies, UKI, BSC, creditos, pools y rewards.
    - Guia responsive desktop/mobile.
    - Componentes criticos identificados para reutilizacion.

- UKI-004.4 Task - Validar imagenes generadas de landing, preventa y app shell
  - Acceptance criteria:
    - Prompt de cada pantalla validado antes de generar.
    - Imagen generada enlazada en la issue correspondiente.
    - Imagen aprobada antes de implementar restyling visual final.
    - No se usan imagenes como sustituto de reglas UX; son referencia visual aprobada.

- UKI-004.5 Task - Restyling de shell publico y primeras pantallas
  - Acceptance criteria:
    - Header/nav alineado con UKI launch.
    - Home/landing no comunica solo el ecosistema antiguo.
    - Games entry presenta Treasure Hunt como primer juego, no como economia completa.
    - CTA de preventa y Cukie Master aparecen sin bloquear UX si contratos aun estan en testnet.
    - Estados wallet desconectada/chain incorrecta definidos.

- UKI-004.6 Task - Kit tecnico de comunicacion launch
  - Acceptance criteria:
    - OG image y metadatos para landing/preventa.
    - Banners basicos para X/Discord/Telegram.
    - Screenshots aprobados de pantallas clave.
    - Copy corto reutilizable para anuncios tecnicos sin promesas de rentabilidad.

Dependencias: UKI-003, UKI-070, UKI-071.

## Milestone M1 - Contratos BSC y entorno de desarrollo

Objetivo: definir y probar contratos base antes de conectarlos a la dapp.

### UKI-010 Epic - Setup contratos BSC

Tipo: Epic
Prioridad: P0
Areas: contracts, ops

Descripcion:
Crear workspace de contratos con compilacion, tests, scripts de deploy y configuracion de redes.

Issues hijas:

- UKI-010.1 Task - Elegir framework de contratos
  - Recomendacion: Foundry para tests rapidos y fuzzing; Hardhat solo si el equipo ya lo usa.
  - Acceptance criteria:
    - Decision documentada.
    - Comandos de build/test/deploy definidos.

- UKI-010.2 Task - Configurar BSC testnet y mainnet
  - Acceptance criteria:
    - Variables de entorno separadas.
    - Scripts no exponen claves.
    - Verificacion en explorer contemplada.

- UKI-010.3 Task - Pipeline de seguridad de contratos
  - Acceptance criteria:
    - Tests unitarios obligatorios.
    - Slither/Mythril o alternativa documentada.
    - Checklist de auditoria externa listo.

Dependencias: UKI-001.

### UKI-011 Epic - `UKIToken`

Tipo: Epic
Prioridad: P0
Areas: contracts

Descripcion:
Implementar token UKI BEP-20/ERC-20 en BSC con supply, roles y restricciones definidas.

Issues hijas:

- UKI-011.1 Task - Especificar token
  - Acceptance criteria:
    - Nombre, simbolo, decimales y supply definidos.
    - Roles definidos: owner/admin/minter si aplica.
    - Politica de mint/burn cerrada.

- UKI-011.2 Task - Implementar contrato token
  - Acceptance criteria:
    - Usa OpenZeppelin.
    - Tests de transfer, allowance, roles, supply y errores.

- UKI-011.3 Task - Script de deploy y verificacion
  - Acceptance criteria:
    - Deploy testnet reproducible.
    - Contract verification documentada.

Dependencias: UKI-010.

### UKI-012 Epic - `Presale` y compra con ASM

Tipo: Epic
Prioridad: P0
Areas: contracts, dapp

Descripcion:
Contrato para preventa UKI usando ASM como medio principal. BNB/USDT quedan como extension si se confirma.

Issues hijas:

- UKI-012.1 Task - Cerrar reglas de preventa
  - Campos: fecha inicio, fecha fin, precio UKI, ratio ASM/UKI fijo al inicio, max/min compra, wallet caps, pausas.
  - Acceptance criteria:
    - Reglas versionadas.
    - Casos de borde definidos: preventa agotada, compra fuera de ventana, ASM ratio, refund si aplica.

- UKI-012.2 Task - Implementar contrato `Presale`
  - Acceptance criteria:
    - Compra con ASM.
    - Emite eventos `Purchased`.
    - Guarda asignacion comprada o conecta con vesting.
    - Tests de happy path y reverts.

- UKI-012.3 Task - Extension opcional BNB/USDT
  - Acceptance criteria:
    - Marcado como opcional.
    - Si se activa, define conversion a ASM o tesoreria separada.

Dependencias: UKI-011.

### UKI-013 Epic - `VestingVault`

Tipo: Epic
Prioridad: P0
Areas: contracts, dapp

Descripcion:
Gestionar vesting lineal de compradores y pools internos.

Issues hijas:

- UKI-013.1 Task - Especificar calendarios de vesting
  - Compradores: lineal 9 meses sin cliff.
  - Team/Marcel/Concilium: 9 meses cliff + 24 meses vesting.
  - Ecosistema: reglas segun tokenomics final.
  - Acceptance criteria:
    - Cada pool tiene calendario, cliff, start, end y beneficiarios.

- UKI-013.2 Task - Implementar vault
  - Acceptance criteria:
    - `claimable(address)` determinista.
    - `claim()` seguro contra reentrancy.
    - Tests de cliff, linealidad y claims parciales.

- UKI-013.3 Task - Integracion con preventa
  - Acceptance criteria:
    - Compras alimentan vesting o quedan asignadas para posterior import.
    - Eventos suficientes para indexer.

Dependencias: UKI-012.

### UKI-014 Epic - `UKIStaking` para Cukie Master

Tipo: Epic
Prioridad: P0
Areas: contracts, backend, dapp

Descripcion:
Staking on-chain de UKI para cupos Cukie Master.

Issues hijas:

- UKI-014.1 Task - Especificar cupos por UKI
  - Inicial: 20,000 UKI por cupo.
  - Maximo: 5 cupos por wallet sumando rutas.
  - Requisito dinamico si se llenan cupos.
  - Acceptance criteria:
    - Formula versionada.
    - Reglas de subida de requisito y ventana 48-72h definidas.

- UKI-014.2 Task - Implementar staking UKI
  - Acceptance criteria:
    - Stake/unstake.
    - Eventos para backend.
    - Consulta de staked balance.
    - Tests con multiples wallets.

- UKI-014.3 Task - Exponer snapshots para cupos
  - Acceptance criteria:
    - Backend puede calcular cupos por wallet desde eventos o lectura directa.
    - Se contemplan tokens con vesting que cuentan para staking segun regla final.

Dependencias: UKI-011, UKI-013.

### UKI-015 Epic - `RewardsDistributor`

Tipo: Epic
Prioridad: P0
Areas: contracts, backend

Descripcion:
Contrato de claim para recompensas UKI calculadas off-chain y liquidadas en BSC.

Issues hijas:

- UKI-015.1 Task - Elegir mecanismo de claim
  - Opciones: Merkle root por periodo o firma EIP-712 por wallet/periodo.
  - Recomendacion: Merkle root por lote diario/semanal.
  - Acceptance criteria:
    - Decision documentada con costes, seguridad y UX.

- UKI-015.2 Task - Implementar distributor
  - Acceptance criteria:
    - Publicacion de root por admin/multisig.
    - Claim idempotente.
    - Proteccion contra doble claim.
    - Tests de proof invalida, periodo cerrado y doble claim.

- UKI-015.3 Task - Script generador de Merkle root
  - Acceptance criteria:
    - Entrada desde Mongo/export CSV/JSON.
    - Salida reproducible.
    - Hash del lote almacenado.

Dependencias: UKI-011, UKI-050.

## Milestone M2 - Backend, datos y servicios internos

Objetivo: construir la capa operativa que usaran dapp y juegos.

### UKI-020 Epic - Modelo de datos de economia

Tipo: Epic
Prioridad: P0
Areas: backend, data

Descripcion:
Ampliar el modelo actual para soportar economia multi-juego sin hardcodear Treasure Hunt.

Issues hijas:

- UKI-020.1 Task - Disenar modelos Prisma/Mongo
  - Modelos propuestos:
    - `GameEconomyConfig`
    - `CukieAsset`
    - `CukieAssetLock`
    - `CukieMasterSlot`
    - `CompetitionCreditAccount`
    - `CompetitionCreditTransaction`
    - `CukiePoolPosition`
    - `GameRewardPeriod`
    - `GameSessionEconomy`
    - `RewardAllocation`
    - `RewardClaimBatch`
  - Acceptance criteria:
    - Cada modelo tiene indices necesarios.
    - No duplica datos del marketplace sin razon.
    - Incluye audit fields.

- UKI-020.2 Task - Definir ledger interno de creditos
  - Acceptance criteria:
    - Todo cambio de creditos es transaccion append-only.
    - Balance derivable o materializado con reconciliacion.

- UKI-020.3 Task - Definir idempotencia
  - Acceptance criteria:
    - Jobs diarios no duplican creditos/rewards.
    - Game session finalization no se puede aplicar dos veces.

Dependencias: UKI-001, UKI-002.

### UKI-021 Epic - `NftInventoryService`

Tipo: Epic
Prioridad: P0
Areas: backend, data

Descripcion:
Capa estable entre BDs existentes de NFTs/marketplace y la nueva dapp/juegos.

Issues hijas:

- UKI-021.1 Task - Implementar lectura normalizada BSC/TRON
  - Acceptance criteria:
    - Devuelve NFTs por wallet con red, tokenId, rareza, generacion y estado.
    - No filtra por UI; filtra por dominio.

- UKI-021.2 Task - Implementar lock/unlock atomico
  - Acceptance criteria:
    - Evita doble uso entre marketplace, bridge, staking y pool.
    - Guarda `reason`, `createdBy`, `expiresAt` si aplica.

- UKI-021.3 Task - Job de reconciliacion ownership
  - Acceptance criteria:
    - Detecta cambio de owner.
    - Invalida locks/staking/pool cuando procede.
    - Reporta inconsistencias.

Dependencias: UKI-002, UKI-020.

### UKI-022 Epic - Servicio Cukie Master

Tipo: Epic
Prioridad: P0
Areas: backend, contracts

Descripcion:
Calcular cupos Cukie Master combinando UKI staked/vesting en BSC y puntos NFT desde Mongo.

Issues hijas:

- UKI-022.1 Task - Calculo por ruta UKI
  - Acceptance criteria:
    - Lee staked UKI on-chain/indexado.
    - Incluye UKI con vesting si la regla final lo confirma.

- UKI-022.2 Task - Calculo por ruta NFT
  - Puntos: comun 1, no comun 2, raro 4, epico 7, legendario 10, goat 15.
  - Acceptance criteria:
    - Calcula slots por puntos actuales.
    - Respeta maximo 5 slots por wallet.

- UKI-022.3 Task - Motor de requisito dinamico
  - Acceptance criteria:
    - Detecta cupos llenos.
    - Inicia ventana 48-72h.
    - Calcula quien conserva/pierde cupo al cierre.

Dependencias: UKI-014, UKI-021.

### UKI-023 Epic - Jobs diarios y semanales

Tipo: Epic
Prioridad: P0
Areas: backend, ops

Descripcion:
Automatizar creditos diarios, snapshots, cierre de periodos y lotes de rewards.

Issues hijas:

- UKI-023.1 Task - Job de entrega diaria de creditos
  - Regla: 100 creditos por cupo tras 24h como Cukie Master.
  - Acceptance criteria:
    - Entrega siempre a hora fija.
    - Respeta primera entrega tras 24h.
    - No entrega dos veces por periodo.

- UKI-023.2 Task - Job de expiracion de creditos
  - Acceptance criteria:
    - Creditos no usados caducan al final del dia.
    - Ledger conserva historial.

- UKI-023.3 Task - Job de cierre semanal ranking
  - Acceptance criteria:
    - Actualiza ranking #1-#9.
    - Maximo movimiento semanal +2/-2.
    - Minimo partidas para subir/bajar aplicado.

- UKI-023.4 Task - Job de cierre rewards
  - Acceptance criteria:
    - Genera `RewardAllocation`.
    - Genera lote claimable.
    - Publica root o deja pendiente para aprobacion.

Dependencias: UKI-020, UKI-022, UKI-040, UKI-050.

## Milestone M3 - Preventa y dashboard de wallet

Objetivo: permitir compra, seguimiento de vesting y preparacion de Cukie Master.

### UKI-030 Epic - UX/API preventa

Tipo: Epic
Prioridad: P0
Areas: dapp, contracts, ux

Descripcion:
Pantalla de preventa con wallet BSC, calculo ASM/UKI, compra, estado y vesting.

UX image gate:
- Estado: pendiente de validacion del usuario.
- Pantalla: `Preventa UKI`.
- Prompt propuesto para imagen:
  - "Pantalla web premium de preventa para Cukies UKI en BNB Smart Chain, estilo gaming limpio, oscuro verdoso, panel de compra ASM a UKI, modulo de vesting, contador de fecha, estado de wallet y resumen de liquidez, sin texto legal largo, enfoque funcional."
- No generar hasta recibir validacion explicita.

Issues hijas:

- UKI-030.1 Task - API de estado de preventa
  - Acceptance criteria:
    - Devuelve fechas, precio, ratio ASM/UKI, caps, wallet purchase, vesting summary.

- UKI-030.2 Task - UI conectar BSC
  - Acceptance criteria:
    - Detecta chain incorrecta.
    - Pide switch a BSC.
    - No permite comprar desde Tron.

- UKI-030.3 Task - UI compra ASM -> UKI
  - Acceptance criteria:
    - Approve ASM.
    - Buy.
    - Estado loading/error/success.
    - Link a BscScan.

- UKI-030.4 Task - UI vesting personal
  - Acceptance criteria:
    - Muestra total comprado, liberado, pendiente, proximo desbloqueo.
    - No mezcla tokens liberados con claimable si no aplica.

Dependencias: UKI-012, UKI-013.

### UKI-031 Epic - Dashboard tecnico de wallet

Tipo: Epic
Prioridad: P1
Areas: dapp, backend, ux

Descripcion:
Vista operativa del usuario: NFTs, UKI, Cukie Master, creditos, pools, rewards.

UX image gate:
- Estado: pendiente de validacion del usuario.
- Pantalla: `Dashboard Wallet`.
- Prompt propuesto para imagen:
  - "Dashboard de wallet para economia Cukies, layout denso pero limpio, resumen de cupos Cukie Master, UKI staked, NFTs disponibles, creditos diarios, rewards pendientes y acciones principales, estilo app gaming financiera, dark mode teal, sin elementos de landing."
- No generar hasta recibir validacion explicita.

Issues hijas:

- UKI-031.1 Task - API resumen wallet
  - Acceptance criteria:
    - Devuelve wallet, slots, staked UKI, NFTs, creditos, rankings, rewards.

- UKI-031.2 Task - UI resumen slots Cukie Master
  - Acceptance criteria:
    - Explica ruta UKI y ruta NFT por separado.
    - Muestra maximo 5 slots.
    - Muestra avisos de requisito dinamico.

- UKI-031.3 Task - UI alertas de estado NFT
  - Acceptance criteria:
    - Muestra si NFT esta en marketplace, bridge, pool, staking o bloqueado.
    - Evita acciones incompatibles.

Dependencias: UKI-021, UKI-022.

## Milestone M4 - Cukie Master, creditos y pools

Objetivo: operar Cukie Master y recursos diarios para juegos.

### UKI-040 Epic - Creditos de competicion

Tipo: Epic
Prioridad: P0
Areas: backend, dapp, games

Descripcion:
Sistema off-chain de creditos diarios consumibles por juegos.

Issues hijas:

- UKI-040.1 Task - Ledger de creditos
  - Acceptance criteria:
    - Transacciones: grant, spend, pool_deposit, pool_withdraw_if_allowed, expire, admin_adjustment.
    - Balances auditables.

- UKI-040.2 Task - Deposito automatico a pool
  - Regla: Cukie Master configura multiplos de 10 antes de hora diaria.
  - Acceptance criteria:
    - Config por wallet/slot.
    - Se aplica al recibir creditos.
    - Cambios fuera de ventana aplican al dia siguiente.

- UKI-040.3 Task - API disponibilidad para juegos
  - Acceptance criteria:
    - Devuelve si el jugador tiene creditos propios.
    - Si no, intenta asignar 10 creditos del pool.
    - Idempotencia por game session.

Dependencias: UKI-022, UKI-023.

### UKI-041 Epic - Pool de Cukies

Tipo: Epic
Prioridad: P0
Areas: backend, data, dapp

Descripcion:
Soft staking/pool de Cukies para que otros jugadores los usen sin llamadas chain en partida.

UX image gate:
- Estado: pendiente de validacion del usuario.
- Pantalla: `Pool de Cukies`.
- Prompt propuesto para imagen:
  - "Pantalla de gestion de pool de NFTs Cukies, lista de Cukies con rareza, red BSC o Tron, estado disponible/bloqueado/en pool, accion aportar o retirar, resumen de recompensas por rareza, interfaz gaming limpia y operativa."
- No generar hasta recibir validacion explicita.

Issues hijas:

- UKI-041.1 Task - Reglas soft staking NFT
  - Acceptance criteria:
    - Define si se permite BSC, Tron o ambos para pool.
    - Define unstake y efecto si el Cukie esta asignado a una partida.
    - Define prioridad Originales vs 2a Generacion.

- UKI-041.2 Task - Implementar pool positions
  - Acceptance criteria:
    - Lock atomico via `NftInventoryService`.
    - Snapshot de elegibilidad tras 24h.
    - Recompensas ponderadas por rareza.

- UKI-041.3 Task - Asignacion de Cukie prestado a partida
  - Acceptance criteria:
    - Primero Originales, luego 2a Generacion.
    - Si no hay disponible, asigna Seiku ficticio.
    - Libera lock temporal al finalizar/expirar sesion.

Dependencias: UKI-021, UKI-040.

### UKI-042 Epic - UI Cukie Master

Tipo: Epic
Prioridad: P1
Areas: dapp, ux

Descripcion:
Pantalla para gestionar rutas de Cukie Master: UKI staking, NFT points, cupos y creditos.

UX image gate:
- Estado: pendiente de validacion del usuario.
- Pantalla: `Cukie Master`.
- Prompt propuesto para imagen:
  - "Pantalla Cukie Master para Cukies World, dos rutas de desbloqueo UKI staking y NFT points, contador de cupos, limite 5 por wallet, configuracion de creditos diarios, avisos de requisito dinamico, dark mode con acentos teal y magenta moderados."
- No generar hasta recibir validacion explicita.

Issues hijas:

- UKI-042.1 Task - UI ruta UKI staking
  - Acceptance criteria:
    - Stake/unstake UKI.
    - Muestra requisito actual y exceso staked.
    - Muestra impacto en cupos.

- UKI-042.2 Task - UI ruta NFT points
  - Acceptance criteria:
    - Lista Cukies elegibles.
    - Suma puntos por rareza.
    - Muestra cuantas piezas faltan para siguiente cupo.

- UKI-042.3 Task - UI configuracion creditos diarios
  - Acceptance criteria:
    - Slider/input en multiplos de 10.
    - Explica hora de corte.
    - Muestra proxima aplicacion.

Dependencias: UKI-022, UKI-040, UKI-041.

## Milestone M5 - Multi-game economy y Treasure Hunt

Objetivo: integrar Treasure Hunt sin bloquear futuros juegos.

### UKI-050 Epic - Motor multi-juego de economia

Tipo: Epic
Prioridad: P0
Areas: backend, games

Descripcion:
Crear una capa comun para coste de partida, recursos asignados, score validado, conversion UKI y reward allocation.

Issues hijas:

- UKI-050.1 Task - `GameEconomyConfig`
  - Acceptance criteria:
    - Config por juego: coste creditos, conversion max, score cap, weekly prize split, rank rules.
    - Versionado por fecha.

- UKI-050.2 Task - Session economy lifecycle
  - Estados: `created`, `resources_reserved`, `started`, `submitted`, `validated`, `settled`, `expired`, `rejected`.
  - Acceptance criteria:
    - Una partida no liquida sin validacion.
    - Recursos reservados expiran si la partida no termina.

- UKI-050.3 Task - API comun para juegos
  - Endpoints propuestos:
    - `POST /api/economy/games/:gameId/session/start`
    - `POST /api/economy/games/:gameId/session/:id/result`
    - `GET /api/economy/games/:gameId/session/:id`
  - Acceptance criteria:
    - No contiene reglas hardcodeadas de Treasure Hunt fuera de config.

Dependencias: UKI-020, UKI-040, UKI-041.

### UKI-051 Epic - Treasure Hunt economia v1

Tipo: Epic
Prioridad: P0
Areas: games, backend, dapp

Descripcion:
Aplicar reglas de Treasure Hunt: 10 creditos, 2.5 a pool semanal, 7.5 en juego, conversion lineal 0-3000 puntos.

UX image gate:
- Estado: pendiente de validacion del usuario.
- Pantalla: `Treasure Hunt Play Entry`.
- Prompt propuesto para imagen:
  - "Pantalla de entrada a Treasure Hunt dentro de Cukies dapp, muestra creditos disponibles, selector de Cukie propio o asignacion de pool, coste 10 creditos, premio potencial basado en 3000 puntos, ranking semanal y boton iniciar partida, estilo game UI funcional."
- No generar hasta recibir validacion explicita.

Issues hijas:

- UKI-051.1 Task - Preparacion de recursos antes de partida
  - Acceptance criteria:
    - Si hay creditos propios, se usan primero.
    - Si no hay, asigna creditos del pool.
    - Si hay Cukie propio con partidas, usuario selecciona.
    - Si no, asigna Cukie del pool o Seiku.

- UKI-051.2 Task - Calculo de UKI generado
  - Acceptance criteria:
    - 0-3000 puntos escala lineal a 0-7.5 UKI.
    - 2.5 creditos van directo a pool semanal.
    - Tests para 0, 1000, 1500, 3000, >3000.

- UKI-051.3 Task - Settlement segun recursos usados
  - Casos:
    - Creditos prestados + Cukie prestado.
    - Creditos prestados + Cukie propio.
    - Creditos propios + Cukie prestado.
    - Creditos propios + Cukie propio.
  - Acceptance criteria:
    - Repartos coinciden con documento de funcionamiento.
    - Ranking solo afecta cuando usa creditos prestados.

- UKI-051.4 Task - Integracion con juego existente
  - Acceptance criteria:
    - El iframe/juego recibe session economy token.
    - El resultado vuelve al backend con session id.
    - No se confia en score solo cliente sin validacion minima.

Dependencias: UKI-050.

### UKI-052 Epic - Ranking semanal

Tipo: Epic
Prioridad: P0
Areas: backend, dapp, games

Descripcion:
Ranking #1 a #9 para jugadores que usan creditos del pool.

UX image gate:
- Estado: pendiente de validacion del usuario.
- Pantalla: `Arena Ranking Semanal`.
- Prompt propuesto para imagen:
  - "Pantalla Arena Ranking Semanal de Cukies, escalera de ranks #1 a #9, movimiento maximo +2/-2, progreso semanal, partidas minimas, porcentaje de recompensa por rank, vista tipo dashboard game economy."
- No generar hasta recibir validacion explicita.

Issues hijas:

- UKI-052.1 Task - Modelo de rank por juego/semana
  - Acceptance criteria:
    - Guarda rank actual, rank anterior, periodo, eligible games.

- UKI-052.2 Task - Calculo de performance semanal
  - Acceptance criteria:
    - Excluye 2.5 creditos directos a pool semanal.
    - Excluye premios semanales.
    - Calcula porcentaje conversion real.

- UKI-052.3 Task - Aplicar reglas subida/bajada
  - Acceptance criteria:
    - Minimo 20 partidas para subir.
    - Minimo 10 partidas para bajar.
    - Maximo 2 categorias por semana.

Dependencias: UKI-051.

## Milestone M6 - Rewards, claims y tesoreria

Objetivo: convertir calculos off-chain en claims BSC auditables.

### UKI-060 Epic - Reward allocation engine

Tipo: Epic
Prioridad: P0
Areas: backend, contracts

Descripcion:
Calcular asignaciones diarias/semanales a Cukie Masters, pool de Cukies, jugadores y tesoreria.

Issues hijas:

- UKI-060.1 Task - Reglas de pool de creditos
  - Acceptance criteria:
    - Define si existe retorno minimo del 20% y como se financia.
    - Si no esta validado, queda feature flag off.

- UKI-060.2 Task - Reglas de pool de Cukies
  - Acceptance criteria:
    - Ponderacion por rareza.
    - Snapshot de NFTs en pool durante periodo.
    - Originales y 2a Generacion separados si aplica.

- UKI-060.3 Task - Reglas de tesoreria para UKI no convertidos
  - Acceptance criteria:
    - 85% tesoreria/reserva/liquidez/ecosistema.
    - 5% marketing/desarrollo.
    - 10% reduccion supply.
    - Marcado como pendiente si falta decision on-chain/off-chain.

Dependencias: UKI-050, UKI-052.

### UKI-061 Epic - Claim UX/API

Tipo: Epic
Prioridad: P1
Areas: dapp, contracts, backend, ux

Descripcion:
Permitir al usuario ver y reclamar recompensas UKI en BSC.

UX image gate:
- Estado: pendiente de validacion del usuario.
- Pantalla: `Rewards Claim`.
- Prompt propuesto para imagen:
  - "Pantalla de recompensas UKI para Cukies, lista de periodos diarios y semanales, UKI pendiente, proof disponible, boton reclamar en BSC, historial de claims, estados pendiente/procesando/reclamado, UI sobria de game finance."
- No generar hasta recibir validacion explicita.

Issues hijas:

- UKI-061.1 Task - API rewards claimable
  - Acceptance criteria:
    - Devuelve allocations, batch id, proof, status on-chain.

- UKI-061.2 Task - UI claim
  - Acceptance criteria:
    - Claim por lote.
    - Estados loading/error/success.
    - Link a BscScan.

- UKI-061.3 Task - Reconciliacion claim on-chain/off-chain
  - Acceptance criteria:
    - Detecta claims hechos.
    - Marca status en Mongo.
    - Job de backfill por eventos.

Dependencias: UKI-015, UKI-060.

## Milestone M7 - UX tecnica y superficies de producto

Objetivo: definir pantallas con suficiente precision para diseno, imagen validada e implementacion.

### UKI-070 Epic - Arquitectura de informacion dapp UKI

Tipo: Epic
Prioridad: P0
Areas: ux, dapp

Descripcion:
Separar pantallas por responsabilidad unica para evitar una dapp confusa.

Issues hijas:

- UKI-070.1 Task - Sitemap propuesto
  - Pantallas:
    - Landing/Launch
    - Preventa UKI
    - Dashboard Wallet
    - Cukie Master
    - Pool de Creditos
    - Pool de Cukies
    - Treasure Hunt Entry
    - Arena Ranking
    - Rewards Claim
    - Admin/Ops
  - Acceptance criteria:
    - Cada pantalla tiene CTA principal y maximo dos secundarias.

- UKI-070.2 Task - Matriz de estados UX
  - Acceptance criteria:
    - Empty/loading/error/success para cada pantalla.
    - Chain incorrecta y wallet desconectada definidos.

- UKI-070.3 Task - Validacion de imagenes por pantalla
  - Acceptance criteria:
    - Cada pantalla tiene prompt validado por usuario antes de generar.
    - Cada imagen generada queda linkada en el issue correspondiente.
    - No se implementa visual final sin imagen aprobada o excepcion explicita.

Dependencias: UKI-030, UKI-031, UKI-042, UKI-061.

### UKI-071 Epic - Landing tecnica de lanzamiento

Tipo: Epic
Prioridad: P1
Areas: dapp, ux

Descripcion:
Actualizar web para explicar la nueva economia sin depender de Treasure Hunt como unico futuro juego.

UX image gate:
- Estado: pendiente de validacion del usuario.
- Pantalla: `Landing Launch`.
- Prompt propuesto para imagen:
  - "Homepage de relanzamiento Cukies World 2026, proyecto NFT 2021 evoluciona a economia de juegos con UKI, hero con Cukie como activo jugable, secciones para preventa, Cukie Master, juegos, rewards y BSC, visual premium gaming no infantil, dark teal, sin promesas de rentabilidad."
- No generar hasta recibir validacion explicita.

Issues hijas:

- UKI-071.1 Task - Nueva narrativa tecnica
  - Acceptance criteria:
    - No dice que Treasure Hunt es el unico juego.
    - Presenta Cukies Game Economy.
    - CTA hacia preventa y Cukie Master.

- UKI-071.2 Task - Secciones de producto
  - Acceptance criteria:
    - Explica UKI, Cukie Master, pools, ranking, rewards y juegos.
    - Incluye bloque de decisiones BSC.

- UKI-071.3 Task - SEO/metadatos
  - Acceptance criteria:
    - Title, description, OG image y favicon actualizados.

Dependencias: UKI-003, UKI-070.

### UKI-072 Epic - Admin/Ops console

Tipo: Epic
Prioridad: P1
Areas: dapp, backend, ops, ux

Descripcion:
Panel interno para supervisar jobs, snapshots, batches, inconsistencias y parametros de economia.

UX image gate:
- Estado: pendiente de validacion del usuario.
- Pantalla: `Admin Economy Ops`.
- Prompt propuesto para imagen:
  - "Panel admin interno para economia UKI, tablas compactas de jobs diarios, snapshots, reward batches, Merkle roots, inconsistencias NFT, parametros por juego y botones de aprobar/publicar, estilo operativo serio y oscuro."
- No generar hasta recibir validacion explicita.

Issues hijas:

- UKI-072.1 Task - Roles admin
  - Acceptance criteria:
    - Solo wallets/users autorizados.
    - Acciones sensibles requieren confirmacion.

- UKI-072.2 Task - Dashboard jobs
  - Acceptance criteria:
    - Estado ultimos jobs diarios/semanales.
    - Reintentos controlados.
    - Logs visibles.

- UKI-072.3 Task - Batch approval
  - Acceptance criteria:
    - Revisar allocations antes de publicar root.
    - Export CSV/JSON.
    - Publicar root requiere firma/transaccion.

Dependencias: UKI-023, UKI-015, UKI-060.

## Milestone M8 - Seguridad, antifraude y QA

Objetivo: reducir riesgo antes de mainnet.

### UKI-080 Epic - Antifraude de partidas

Tipo: Epic
Prioridad: P0
Areas: games, backend, security

Descripcion:
Evitar que el cliente pueda inflar scores o reusar sesiones.

Issues hijas:

- UKI-080.1 Task - Firmar session economy token
  - Acceptance criteria:
    - Token con session id, wallet, game id, nonce, expiresAt.
    - Verificacion server-side.

- UKI-080.2 Task - Validacion minima de score
  - Acceptance criteria:
    - Checkpoints razonables.
    - Duracion, puntuacion maxima, eventos clave.
    - Marca `isValid=false` si falla.

- UKI-080.3 Task - Rate limits y cooldowns
  - Acceptance criteria:
    - Limites por wallet/IP/session.
    - Alertas por patrones anormales.

Dependencias: UKI-050, UKI-051.

### UKI-081 Epic - Seguridad contratos

Tipo: Epic
Prioridad: P0
Areas: contracts, security

Descripcion:
Preparar contratos para auditoria y deploy seguro.

Issues hijas:

- UKI-081.1 Task - Test coverage contratos
  - Acceptance criteria:
    - Cobertura para token, presale, vesting, staking, rewards.
    - Casos de permisos y reentrancy.

- UKI-081.2 Task - Threat model
  - Acceptance criteria:
    - Ataques: double claim, root malicioso, admin key compromise, vesting bypass, presale price error.

- UKI-081.3 Task - Multisig y roles
  - Acceptance criteria:
    - Admins en multisig.
    - Pausable donde proceda.
    - Runbook de emergencia.

Dependencias: UKI-010, UKI-015.

### UKI-082 Epic - QA end-to-end testnet

Tipo: Epic
Prioridad: P0
Areas: dapp, games, backend, contracts, ops

Descripcion:
Simular el ciclo completo en BSC testnet.

Issues hijas:

- UKI-082.1 Task - Flujo preventa completo
  - Acceptance criteria:
    - Compra ASM testnet.
    - Vesting visible.
    - Eventos indexados.

- UKI-082.2 Task - Flujo Cukie Master completo
  - Acceptance criteria:
    - Staking UKI.
    - NFT soft staking.
    - Creditos diarios.

- UKI-082.3 Task - Flujo juego completo
  - Acceptance criteria:
    - Iniciar Treasure Hunt.
    - Reservar recursos.
    - Enviar score.
    - Calcular rewards.
    - Claim testnet.

Dependencias: M1, M2, M3, M4, M5, M6.

## Milestone M9 - Launch, monitorizacion y operacion

Objetivo: publicar de forma controlada y operar los primeros ciclos.

### UKI-090 Epic - Launch readiness

Tipo: Epic
Prioridad: P0
Areas: ops, security, dapp

Descripcion:
Checklist final antes de abrir preventa y economia.

Issues hijas:

- UKI-090.1 Task - Freeze de contratos
  - Acceptance criteria:
    - Direcciones finales documentadas.
    - Verificacion explorer completa.
    - ABI versionadas.

- UKI-090.2 Task - Monitorizacion
  - Acceptance criteria:
    - Alertas para jobs fallidos, claim anomalies, presale volume, RPC failures.

- UKI-090.3 Task - Runbook lanzamiento
  - Acceptance criteria:
    - Orden de operaciones.
    - Rollback/pausa.
    - Responsables.

Dependencias: UKI-082.

### UKI-091 Epic - Primeros 7 dias de operacion

Tipo: Epic
Prioridad: P1
Areas: ops, backend, support

Descripcion:
Soporte intensivo tras apertura para corregir datos, UX y reglas operativas.

Issues hijas:

- UKI-091.1 Task - Daily reconciliation
  - Acceptance criteria:
    - Comparar Mongo, eventos BSC y UI.
    - Reporte diario.

- UKI-091.2 Task - Soporte a wallets/NFTs
  - Acceptance criteria:
    - Playbook para NFTs bloqueados, owner incorrecto, bridge status, chain incorrecta.

- UKI-091.3 Task - Ajuste de parametros con governance interna
  - Acceptance criteria:
    - Cambios de parametros quedan versionados.
    - No se cambian reglas retroactivas sin decision documentada.

Dependencias: UKI-090.

## Orden recomendado de ejecucion

1. M0 y M0.5 son lo primero: decisiones, narrativa, UX, restyling, imagenes validadas y comunicacion inicial.
2. M1 y M2 avanzan despues o en paralelo, pero sin bloquear la preparacion publica del lanzamiento.
3. M3 se puede implementar contra mocks de contratos y luego conectar testnet.
4. M4 y M5 deben cerrarse juntos porque creditos/pools afectan partidas.
5. M6 no debe abrir mainnet sin QA end-to-end.
6. M7 queda para superficies UX internas/restantes que no bloqueen comunicacion inicial.
7. M8 es obligatorio antes de lanzamiento publico.

## Bloqueadores actuales

1. Confirmar si soft staking de NFTs permite BSC y Tron o solo BSC para pools.
2. Confirmar si el retorno minimo del 20% al pool de creditos se mantiene, se elimina o queda como feature flag.
3. Confirmar si preventa acepta solo ASM o tambien BNB/USDT.
4. Confirmar mecanismo de claim: Merkle root o firma EIP-712.
5. Confirmar si los UKI con vesting cuentan automaticamente para staking Cukie Master.
6. Confirmar frases permitidas a nivel legal para rewards.

## Plantilla para convertir cada bloque en GitHub Issue

```md
## Contexto

## Alcance

## Fuera de alcance

## Dependencias

## Tareas
- [ ] 

## Criterios de aceptacion
- [ ] 

## Tests / QA
- [ ] 

## UX image gate
Estado: no aplica | pendiente de prompt | prompt validado | imagen generada | imagen aprobada
Prompt:
Imagen aprobada:
```
