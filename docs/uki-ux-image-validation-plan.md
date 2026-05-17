# UKI UX image validation plan

Estado: prompts preparados, imagenes no generadas.
Issues: #145 `UKI-004.4`, #112 `UKI-070.3`.
Fecha: 2026-05-17.
Fuentes: `docs/uki-brand-token-book.md`, `docs/uki-dapp-sitemap.md`, `docs/uki-ux-state-matrix.md`, `docs/uki-current-operating-rules.md`.

## Regla de gate

No se genera ninguna imagen de pantalla hasta que producto apruebe el prompt correspondiente. Ninguna imagen generada se usa como referencia final de implementacion sin aprobacion posterior.

Este documento deja preparados prompts y criterios de validacion. El estado actual de todas las pantallas es `prompt draft`.

## Proceso

1. Producto revisa el prompt de una pantalla.
2. Si lo aprueba, se genera una imagen horizontal de referencia para esa pantalla.
3. La imagen se enlaza en la issue correspondiente.
4. Producto aprueba, rechaza o pide iteracion.
5. Solo con imagen aprobada se puede implementar restyling visual final, salvo excepcion explicita.

## Criterios de rechazo

Rechazar una propuesta visual si:

- Parece una presentacion/deck en vez de una pantalla navegable.
- Usa una landing generica con hero decorativo sin producto visible.
- Mezcla preventa, Cukie Master, ranking, pools y rewards como si todo estuviera activo.
- Promete rentabilidad, retorno garantizado o resultados economicos no aprobados.
- Oculta estados importantes: compra cerrada, wallet desconectada, chain incorrecta, vesting, bloqueo o coming next.
- Usa una paleta monocromatica sin jerarquia funcional.
- Abusa de cards decorativas, glow o composicion de marketing sin controles reales.
- No deja claro que la fase actual es Phase 0 / compra cerrada.

## Criterios de aprobacion

Una imagen puede aprobarse si:

- La pantalla tiene una responsabilidad unica.
- El CTA principal coincide con el sitemap.
- Los estados bloqueados o coming next son visibles sin parecer error.
- La jerarquia visual permite escanear: estado, accion, datos clave y siguiente paso.
- Usa Cukies como identidad, pero UKI y BSC transmiten confianza y claridad.
- Mantiene lenguaje legalmente prudente.
- Puede implementarse con componentes reales de la dapp sin inventar flujos.

## Pantallas iniciales #145

### Landing / Launch

Estado: `prompt draft`.
Issue: #145.
Ruta: `/`.

Prompt propuesto:

```text
Pantalla web horizontal para Cukies World UKI launch, Phase 0 compra cerrada. Landing navegable, no deck. Hero con modulo real de preventa en estado coming soon, precio 0.01 USD, compra principal con ASM, BNB Smart Chain, vesting 9 meses y listing minimo 0.012. Visual premium gaming-finance, oscuro verdoso con acentos gold/teal controlados, Cukie como identidad jugable y UKI coin/vault como senal de token. Secciones visibles: sale facts, como comprar, token trust, Cukie Master coming next, Treasure Hunt primer juego. Sin promesas de rentabilidad, sin claims activos, sin dashboard completo, sin composicion de presentacion.
```

Debe mostrar:

- Fase actual: compra cerrada / coming soon.
- CTA principal hacia preventa o aviso.
- Sale facts escaneables.
- Cukie Master y Treasure Hunt como utilidad posterior, no accion activa.

No debe mostrar:

- Claimable rewards.
- Ranking activo.
- Staking activo.
- ROI, APY o retornos prometidos.

### Preventa UKI

Estado: `prompt draft`.
Issue: #145.
Ruta: `/presale`.

Prompt propuesto:

```text
Pantalla de preventa UKI para una dapp en BNB Smart Chain, estado compra cerrada o prelaunch. Interfaz funcional, no landing generica. Panel principal ASM -> UKI con wallet desconectada y chain status, precio 0.01 USD, ratio ASM/UKI pendiente de fijar al inicio, duracion 1 mes, vesting comprador 9 meses lineal sin cliff, liquidez ASM -> UKI con bloqueo/quema minimo 9 meses. Layout denso pero claro, controles reales de connect wallet, approve ASM deshabilitado, buy UKI deshabilitado hasta apertura, resumen de tokenomics y enlaces BscScan/config. Dark mode teal/gold sobrio, sin promesas de rentabilidad.
```

Debe mostrar:

- Wallet desconectada o compra cerrada como estado esperado.
- Bloqueo de approve/buy mientras no abra la venta.
- Ratio ASM como dato pendiente hasta inicio.
- Vesting y liquidez visibles.

No debe mostrar:

- BNB/USDT como flujo activo.
- Rewards o Cukie Master como accion actual.
- Compra confirmada ficticia.

### Dashboard Wallet

Estado: `prompt draft`.
Issue: #145.
Ruta: `/wallet`.

Prompt propuesto:

```text
Dashboard wallet para economia Cukies UKI en prelaunch, pantalla de producto densa y operativa. Resumen de wallet conectada o estado desconectado, UKI comprado/staked, NFTs disponibles o bloqueados, creditos, cupos Cukie Master, rewards pendientes y alertas de chain/bridge/listing. Debe diferenciar datos activos, coming next y datos bloqueados. Estilo app gaming-finance, oscuro, teal/gold, tablas compactas, badges de estado, sin hero marketing. No mostrar rewards como claimable si no hay batch/proof.
```

Debe mostrar:

- Alertas de chain/datos stale.
- Modulos separados para UKI, NFTs, creditos, cupos y rewards.
- Estados bloqueados/coming next.

No debe mostrar:

- Compra principal dentro del dashboard.
- Configuracion avanzada de pools.
- Claims finales sin proof.

### Cukie Master

Estado: `prompt draft`.
Issue: #145.
Ruta: `/cukie-master`.

Prompt propuesto:

```text
Pantalla Cukie Master para Cukies World UKI, fase coming next. Dos rutas de cupos: staking UKI y puntos de Cukies Originales. Mostrar 500 cupos iniciales por ruta, maximo 5 cupos por wallet, requisito 20,000 UKI por cupo, 3 puntos de Cukies Originales, UKI con vesting cuenta para cupos, espera 24h para creditos diarios y aviso de requisito dinamico con ventana 48h. UI operativa con contadores, sliders/inputs de stake, tabla de rarezas, alertas claras, dark mode teal/gold. Sin ranking completo, sin partida concreta, sin prometer recompensas economicas.
```

Debe mostrar:

- Dos rutas separadas.
- Limite 5 cupos por wallet.
- Requisito dinamico y aviso 48h.
- Fase posterior/coming next si no esta activo.

No debe mostrar:

- Cukies prestados como disponibles si estan stakeados para Cukie Master.
- Recompensas garantizadas como promesa financiera.

### Games Entry / App Shell

Estado: `prompt draft`.
Issue: #145.
Ruta: `/games/treasure-hunt` o shell de juegos.

Prompt propuesto:

```text
Pantalla de entrada a juegos de Cukies UKI con Treasure Hunt como primer juego, no como economia completa. App shell navegable con sidebar/header compacto, wallet status, creditos disponibles, Cukie propio o pool/Seiku, coste 10 creditos, 2.5 al pool semanal y 7.5 en juego, ranking semanal solo para partidas con creditos del pool. Mostrar estados de recursos reservados y start run bloqueado si faltan recursos. Estilo game UI funcional, oscuro, claro para jugar, sin landing ni deck, sin promesas de rentabilidad.
```

Debe mostrar:

- Treasure Hunt como primer juego conectado.
- Coste y recursos necesarios.
- Diferencia entre creditos propios y creditos del pool.
- Preparacion de sesion antes de entrar al juego.

No debe mostrar:

- Treasure Hunt como unico futuro del ecosistema.
- Score/reward final sin validacion.
- Ranking aplicado a creditos propios.

## Pantallas de segunda tanda #112

Estas pantallas pueden prepararse despues de validar la tanda inicial.

| Pantalla | Estado | Prompt base |
| --- | --- | --- |
| Pool de Creditos | `prompt draft` | Pantalla operativa para configurar creditos diarios en multiplos de 10 antes de la hora de corte, ledger de grants/spend/deposit/expire, pool availability, minimo 0.75 UKI por cada 10 creditos si aplica, coming next si fase cerrada. |
| Pool de Cukies | `prompt draft` | Gestion de pool BSC-only para nuevas posiciones, inventario de Cukies con rareza/generacion, Originales y segunda generacion separados, locks, partidas disponibles y rewards/allocations sin promesas. |
| Arena Ranking | `prompt draft` | Dashboard de ranking semanal #1-#9, rank actual/anterior, partidas validas, minimos 20 para subir y 10 para bajar, movimiento maximo +2/-2, sin claim directo. |
| Rewards Claim | `prompt draft` | Pantalla de rewards pendientes/claimable por batch, proof status, claim on-chain en BSC, historial y estados pending/confirmed, sin mostrar estimaciones como claimable. |
| Admin/Ops | `prompt draft` | Consola interna compacta para jobs, snapshots, reward batches, Merkle roots, inconsistencias NFT, parametros por juego y auditoria, fuera de navegacion publica. |

## Registro de validacion

| Pantalla | Prompt | Imagen | Decision | Issue |
| --- | --- | --- | --- | --- |
| Landing / Launch | Draft pendiente | No generada | Pendiente | #145 |
| Preventa UKI | Draft pendiente | No generada | Pendiente | #145 |
| Dashboard Wallet | Draft pendiente | No generada | Pendiente | #145 |
| Cukie Master | Draft pendiente | No generada | Pendiente | #145 |
| Games Entry / App Shell | Draft pendiente | No generada | Pendiente | #145 |
| Pool de Creditos | Draft pendiente | No generada | Pendiente | #112 |
| Pool de Cukies | Draft pendiente | No generada | Pendiente | #112 |
| Arena Ranking | Draft pendiente | No generada | Pendiente | #112 |
| Rewards Claim | Draft pendiente | No generada | Pendiente | #112 |
| Admin/Ops | Draft pendiente | No generada | Pendiente | #112 |

## Notas para implementacion posterior

- Las imagenes aprobadas son direccion visual, no fuente de reglas economicas.
- Si una imagen contradice `docs/uki-current-operating-rules.md`, gana el documento de reglas.
- Si una pantalla necesita estado no cubierto, se actualiza primero `docs/uki-ux-state-matrix.md`.
- El restyling final de #146 debe consumir imagenes aprobadas o una excepcion explicita documentada en la issue.
