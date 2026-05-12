# UKI dapp sitemap

Estado: propuesta inicial.
Issue: #110 `UKI-070.1`.
Fecha: 2026-05-12.

## Objetivo

Separar pantallas por responsabilidad unica para que la dapp UKI no mezcle preventa, wallet, Cukie Master, pools, juegos, ranking, rewards y operacion interna en una sola experiencia.

Regla de este sitemap: cada pantalla tiene un CTA principal y maximo dos CTAs secundarios.

## Principios

- La landing vende y explica la primera accion: preventa UKI.
- La preventa ejecuta compra, allowance y vesting personal.
- El dashboard resume estado, pero no reemplaza pantallas especializadas.
- Cukie Master separa rutas de acceso: UKI staking y NFT points.
- Pools y juegos son superficies operativas, no marketing.
- Rewards Claim solo muestra y ejecuta claims disponibles; no calcula ranking.
- Admin/Ops queda separado de la dapp publica.

## Navegacion propuesta

```text
/
/presale
/wallet
/cukie-master
/pools/credits
/pools/cukies
/games/treasure-hunt
/arena
/rewards
/admin/ops
```

## Pantallas

| Pantalla | Ruta propuesta | Responsabilidad unica | CTA principal | CTA secundario 1 | CTA secundario 2 |
| --- | --- | --- | --- | --- | --- |
| Landing/Launch | `/` | Comunicar UKI launch, preventa, utilidad futura y primer juego. | Join UKI presale | Read sale details | View Treasure Hunt |
| Preventa UKI | `/presale` | Comprar UKI con ASM y consultar estado de venta. | Buy UKI | Approve ASM | View vesting |
| Dashboard Wallet | `/wallet` | Resumir wallet, UKI, NFTs, creditos, cupos y alertas. | Review wallet status | Go to Cukie Master | View rewards |
| Cukie Master | `/cukie-master` | Gestionar acceso/cupos por UKI staking y NFT points. | Activate Cukie Master | Stake UKI | Review NFT points |
| Pool de Creditos | `/pools/credits` | Configurar depositos/uso de creditos diarios. | Configure credits | View credit ledger | Open pool history |
| Pool de Cukies | `/pools/cukies` | Aportar o retirar Cukies del pool de juego. | Add Cukie to pool | Withdraw Cukie | View pool rewards |
| Treasure Hunt Entry | `/games/treasure-hunt` | Preparar recursos y entrar al primer juego conectado a UKI. | Start run | Select Cukie | View rules |
| Arena Ranking | `/arena` | Mostrar ranking semanal y progreso competitivo. | View my rank | View weekly rules | Open history |
| Rewards Claim | `/rewards` | Ver rewards claimable y ejecutar claim on-chain. | Claim rewards | View pending rewards | View claim history |
| Admin/Ops | `/admin/ops` | Operar jobs, snapshots, batches, inconsistencias y parametros. | Review pending actions | Open job monitor | Export audit report |

## Detalle por pantalla

### Landing/Launch

Responsabilidad:

- Explicar UKI Presale, BNB Smart Chain, compra con ASM, vesting y utilidad futura.
- Separar fase actual de Cukie Master/juegos posteriores.

Contenido minimo:

- Hero preventa.
- Sale facts.
- Como comprar.
- Token trust/vesting.
- Why UKI exists.
- Cukie Master coming next.
- Treasure Hunt como primer juego.
- FAQ.

No debe:

- Mostrar dashboard operativo completo.
- Simular claims o rewards disponibles.
- Mezclar staking como accion actual si aun no esta abierto.

### Preventa UKI

Responsabilidad:

- Ejecutar flujo ASM -> UKI.
- Mostrar estado de wallet, red, allowance, compra y vesting personal.

Contenido minimo:

- Estado de venta.
- Precio/ratio.
- Caps si aplican.
- Allowance ASM.
- Compra UKI.
- Vesting personal.
- Links a BscScan.

No debe:

- Calcular ranking.
- Gestionar pools.
- Presentar rewards futuras como claimable.

### Dashboard Wallet

Responsabilidad:

- Dar una vista de salud de wallet y accesos.

Contenido minimo:

- Wallet conectada/red.
- UKI comprado/staked/resumen.
- NFTs disponibles o bloqueados.
- Credit balance.
- Cupos Cukie Master.
- Rewards pendientes/claimable.
- Alertas de chain, bridge, listing o datos stale.

No debe:

- Ser lugar principal para comprar.
- Ejecutar configuraciones avanzadas de pools.

### Cukie Master

Responsabilidad:

- Gestionar rutas de desbloqueo/cupos.

Contenido minimo:

- Ruta UKI staking.
- Ruta NFT points.
- Maximo de cupos.
- Requisito dinamico si aplica.
- Estado de cada cupo.

No debe:

- Gestionar partida concreta.
- Mostrar leaderboard completo.

### Pool de Creditos

Responsabilidad:

- Configurar creditos diarios y aportacion al pool.

Contenido minimo:

- Balance de creditos.
- Configuracion diaria en multiplos permitidos.
- Hora de corte.
- Ledger de grants/spend/deposit/expire.
- Pool availability.

No debe:

- Mostrar claim UKI como si fueran creditos.
- Cambiar reglas de ranking.

### Pool de Cukies

Responsabilidad:

- Gestionar aportacion de NFTs al pool.

Contenido minimo:

- Cukies elegibles.
- Estado canonico de cada NFT.
- Rarity/generation.
- Locks activos.
- Solicitud de retirada.
- Recompensas/allocations si existen.

No debe:

- Permitir assets `listed`, `bridging`, `unknown` o `invalidated`.
- Ocultar si un Cukie esta asignado a una partida.

### Treasure Hunt Entry

Responsabilidad:

- Preparar recursos antes de entrar al juego.

Contenido minimo:

- Coste de entrada.
- Credit source: propios o pool.
- Cukie propio o asignado.
- Session economy status.
- Reglas de score/reward del juego.

No debe:

- Confiar en el cliente para recursos.
- Crear session sin reserva atomica.

### Arena Ranking

Responsabilidad:

- Mostrar ranking semanal y reglas de movimiento.

Contenido minimo:

- Rank actual.
- Rank anterior.
- Periodo semanal.
- Partidas validas.
- Reglas +2/-2.
- Historial por periodo.

No debe:

- Ejecutar claims.
- Recalcular rewards en cliente.

### Rewards Claim

Responsabilidad:

- Mostrar rewards por periodo y permitir claim on-chain cuando exista proof/batch.

Contenido minimo:

- Pending rewards.
- Claimable rewards.
- Batch/proof status.
- Claim action.
- Historial de claims.
- Estado BSC.

No debe:

- Mostrar estimaciones como claimable.
- Marcar claimed sin evento on-chain confirmado.

### Admin/Ops

Responsabilidad:

- Operar la economia desde una consola interna.

Contenido minimo:

- Jobs diarios/semanales.
- Snapshots.
- Reward batches.
- Merkle roots/proofs.
- Inconsistencias NFT.
- Parametros por juego.
- Auditoria.

No debe:

- Estar en navegacion publica.
- Permitir acciones sin rol/admin.

## Relaciones entre pantallas

| Desde | Hacia | Motivo |
| --- | --- | --- |
| Landing/Launch | Preventa UKI | Convertir interes en compra. |
| Preventa UKI | Dashboard Wallet | Ver estado tras comprar/conectar. |
| Dashboard Wallet | Cukie Master | Gestionar cupos y acceso. |
| Cukie Master | Pool de Creditos | Configurar recursos diarios. |
| Cukie Master | Pool de Cukies | Aportar NFTs. |
| Dashboard Wallet | Treasure Hunt Entry | Jugar con recursos disponibles. |
| Treasure Hunt Entry | Arena Ranking | Ver impacto competitivo. |
| Arena Ranking | Rewards Claim | Revisar rewards cerradas. |
| Rewards Claim | BscScan | Confirmar tx/claim. |

## Implicaciones para implementacion

- La navegacion publica debe priorizar `/`, `/presale`, `/wallet`, `/games/treasure-hunt` y `/rewards`.
- Pools, Cukie Master y Arena pueden aparecer bloqueados/coming next hasta que contratos/backend esten listos.
- Cada pantalla debe consumir APIs de dominio, no leer colecciones Mongo directamente.
- Los estados UX detallados quedan para `#111`.
- Las imagenes o referencias visuales por pantalla quedan para `#112`.

