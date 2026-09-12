# Seguimiento operativo de `Antes del 15.docx`

Estado del documento: fuente unica del estado vigente; vivo y versionado.

Ultima actualizacion: 2026-09-12; horas de evidencia indicadas en UTC.

Contexto vigente: revisión completa de las nuevas pruebas del 12 de septiembre,
agrupadas en cuatro lotes de PR. Sus diez puntos numerados se relacionan con
las observaciones del día 11; los parches anteriores son antecedentes, no prueba
de que los fallos nuevamente reportados estén resueltos.
Se conserva la correccion de producto del 2026-09-07 y el contraste focalizado de la evidencia
disponible. Las decisiones explicitas
del usuario fijan el alcance; su confirmacion de funcionamiento queda registrada
como tal. La evidencia nueva se fecha y cualquier contradiccion se reconcilia.
La comprobacion remota de economia fechada el 2026-09-07 a las 11:44 se
conserva como evidencia historica; no sustituye el estado actual.

## Fuente, alcance y reglas de uso

- Fuente original, conservada sin modificar:
  `/Users/fgomezserna/Downloads/Antes del 15.docx`.
- SHA-256 de la fuente revisada:
  `6492dd6207fc82870cda13eef2c1ef5bcf620b090f643bf174ae6eab9e4c94dd`.
- Este archivo es la tabla unica de estado y evidencia. Las reglas funcionales
  siguen en `docs/uki-current-operating-rules.md`; el detalle tecnico y las
  decisiones de datos siguen en `docs/uki-new-economy-db-implementation-map.md`.
- `CONFIRMADO POR USUARIO` es autoridad de producto; `OBSERVADO LIVE` incluye
  URL, fecha UTC y alcance de la comprobacion; `PENDIENTE DE CONTRASTE` no
  degrada una confirmacion anterior.
- La prioridad actual es la seccion **ANTES DEL 15 DE SEPTIEMBRE**. La seccion
  posterior se inventaria al final para no perderla, pero no se considera parte
  de la entrega inmediata salvo instruccion expresa.
- El trabajo ordinario se integra en `staging`. Los contratos nuevos se prueban
  en testnet; por decision del 2026-09-07 los workers legacy consumen los
  contratos existentes BSC `56`/TRON mainnet tambien desde Stage, con datos y
  cursores aislados de produccion. No se redepliega legacy en testnet.
- Los cambios ordinarios siguen staging -> main. Los hotfixes autorizados van
  primero a main y se propagan a staging para no perderlos. Esta revision
  documental no ejecuta despliegues ni publicaciones.
- Un test unitario no demuestra por si solo que algo este desplegado. Cada punto
  diferencia evidencia local, Stage remoto y produccion.

## Entornos y referencias de esta revision

| Referencia | Uso vigente |
| --- | --- |
| Stage | Coolify web `32`, juego `31` y workers `28`, rama `staging`, `https://cukieshub.eurekand.com`; contratos nuevos en testnet `97`, fuentes legacy BSC `56`/TRON mainnet existentes y destinos Stage aislados. La decision de fuentes no equivale a activacion observada de workers. |
| Produccion | Coolify app `12`, rama `main`, `https://cukies.world`; BSC Mainnet `56`. En esta revision solo lecturas publicas para A/B y health. |
| Fotos Git con 37/47 commits y candidatos locales | Historia de trabajo; no son el estado actual ni autorizan deploy/publicacion. Los SHAs se conservan en el registro historico inferior. |

## Leyenda de estado

La tabla vigente distingue autoridad de producto, comprobacion observable y
trabajo aun no contrastado. Las etiquetas historicas (`VERIFICADO LOCAL`,
`PARCIAL`, `BLOQUEADO`, `POST-15`) se conservan solo dentro de sus fuentes
fechadas y no sustituyen la tabla vigente.

## Resumen de progreso antes del 15

`D`, `1`, `2A`, `2B`, `2C`, `post1` y `post2` pertenecen a un unico bloque de
Migracion legacy: seguridad, identidad, datos, bridge, marketplace, Cukie Points
y crias. Su secuencia es inventario -> portar al Hub sobre la infraestructura
nueva -> migrar y reconciliar datos -> probar flujos -> cortar dependencias ->
retirar los servicios antiguos y dejar de usar su repo cuando queden cero
consumidores de runtime. La ejecucion autorizada comienza por cubrir todos los
eventos, incluido breeding, y workers legacy en Stage. La UX funcional sigue
a la reconciliacion; menu/sidebar/dashboard se reorganizan sobre esos flujos.

| ID | Estado y alcance actual | Fuente y fecha | Proximo paso + issue real |
| --- | --- | --- | --- |
| INFRA | **REGISTRY ACTIVO EN STAGE: WEB, JUEGO Y WORKERS**: web32 sirve `4de6cf1` (PR394,10Sep17:36UTC); Treasure Hunt31 y workers28 conservan imagenes `82d5b511`, config `af434649…`; Mongo LXC2007, builder VM1012 (12 GiB/BuildKit 9 GiB) y registry VM1007. Coolify descarga imágenes; Git autodeploy OFF. | 2026-09-09 23:20 UTC: [evidencia de entrega](../infrastructure/ci/2026-09-09-rolling-delivery-evidence.json). CI34412775416 construyó seis imágenes; el bootstrap del juego falló por `COOLIFY_BRANCH` ausente y se recuperó explícitamente, conservando el juego anterior hasta readiness. Candidato fallido, rollback web entre imágenes con cierre gradual, vuelta a `dc4c21e` y reemplazo aislado del juego: **1472/1472 HTTP200** entre origen y público. Web/workers y producción conservaron IDs/digests en game-only. Juego 4,31 GB → 510 MB; 551 archivos públicos y 12 JS/CSS comprobados. Indexador: cinco ciclos completos, bloques 130109312→130109562. Journals reconciliados. | PR365 `d1403a5`, CI34416957133 SUCCESS: build vacío, seis imágenes reutilizadas y entrega omitida; 15 IDs/imágenes Stage/Prod y estado durable conservados a las23:28:43UTC. Lote359/358 integrado en PR366 `f2818618`, CI34419415547 SUCCESS: DApp reconstruida, otras cinco imágenes reutilizadas y 14 contenedores protegidos conservados. [Evidencia](evidence/2026-09-10-seller-legacy-integration.json). PR367 `11de87e4`, CI34421399357 SUCCESS: Bridge `legacy-readonly` servido y verificado; se reconstruyeron DApp y juego por el hash público compartido, con cuatro imágenes workers reutilizadas. Postflight00:39UTC: 13 contenedores workers/producción conservados, journal limpio y guards PASS; cuatro endpoints públicos200. La raíz verificó la vista Bridge y Aprobar/Iniciar deshabilitados. PR369/370 publicaron créditos y lecturas Legacy; PR371 `9d3e728`, CI34430206966 SUCCESS, reutilizó seis imágenes y omitió la entrega. World integrado mediante PR372/373/374, código final `26ae560`. CI de PR34435382990 y publicación34435609267 SUCCESS: solo dos imágenes World construidas, seis referencias activas reutilizadas; pull por digest, OCI y harness Mongo/Redis sintéticos ejecutados. La sonda del HEAD final usó state y Nx observados;133 checks CI PASS. Estado durable con ocho referencias y journal limpio, entrega omitida por Compose activo idéntico. Postflight04:19:57UTC:15 contenedores protegidos conservan IDs/imágenes/reinicios y UUIDs; web32 sigue `4a08053`, juego31 `11de87e4`, cuatro probes públicos200. Runtime/escrituras nuevos World OFF. [Evidencia final y fallos previos conservados](evidence/2026-09-10-world-ci-integration.json). Existe además un stack Legacy preexistente activo de ocho contenedores, recurso `service-vokgw84g4g4cs0woog0g8o0k`, fuera del inventario del baseline; no se afirma igualdad histórica de sus IDs ni se retira. Su reconciliación de consumidores permanece en D. Actualizacion10Sep16:07UTC: PR390 recuperada con las imagenes del intento1 y deliverRelease; web32 SHA070/ready y workers28 finished070. Diez workers saludables/activos con0reinicios y destinosStage; game31/produccion/Legacy conservados. CI34493616684 sigue rojo: helper ausente en intento1 y EBUSY al restaurar cache Nx en intento2. PR391 `09afcaf` corrige los submontajes Next con cache externo;10testsCI, dockercheck y reproduccion sintetica PASS. CI34500772284 construyo todas las imagenes y paso el smoke, pero la guarda de branch tip impidio publicar porque staging habia avanzado. PR392 `4751104` quedo sustituida en la cola por PR393 `82d5b511`; la entrega conjunta391/392/393 termino en CI34502941058SUCCESS a10Sep17:11:12UTC. Web/game y estado durable82d5 verificados;10workers activos sin reinicios ni cambios de bases/gates,15contenedores protegidos conservados. [Entrega393](evidence/2026-09-10-own-ranking-delivery.json). No se adelanta staging durante una publicacion activa. [Evidencia y limites](evidence/2026-09-10-pool-credit-delivery.json). Un único propietario conserva CI/Compose/Nx/lock. Main/app12/app13 siguen en su ruta actual; PR361 draft `72ba26a`, app33 sin arrancar, CI prod false. Práctica anónima bloqueada por un guard funcional anterior; no se afirma QA de partida autenticada ni autoscalado. |
| 0 | Documentado; detalles pendientes de convertir en criterios. | Fuente original; 2026-09-07. | Convertir cada detalle en criterio verificable. |
| A | **CONFIRMADO POR USUARIO + OBSERVADO LIVE**: pool de liquidez activa desde hace mas de una semana. | `output/verification/pancake-mainnet-20260907.json`, BSC `56`, bloque `120529300`, `2026-09-07T16:50:13Z`; reservas `1.148.104,4871 UKI` + `4.658,0014 ASM`, LP bloqueada hasta `2027-02-23T15:33:10Z`; swaps `2026-08-31` y `2026-09-07`. | Registrar reservas/swaps/locker en cada revision; comprobar logo/ficha y la ruta USDC anunciada en el copy. Rutas BNB/USDT multihop acreditadas. |
| B | **CONFIRMADO POR USUARIO + OBSERVADO LIVE**: staking y torneo actual post-preventa funcionan. Producto: `Torneo Lanzamiento UKI`; no es el torneo antiguo de preventa. | `https://cukies.world/api/games/treasure-hunt/competition`, HTTP 200, `2026-09-07T16:50:56Z`; contrato `0xad18...59696`, campaña activa hasta `2026-09-15T15:00Z`. | Mantener evidencia de participante/firma separada; no reabrir approve/stake como fallo de estado. |
| C | **RESUELTO · confirmado por el usuario**: cierre funcional aceptado. | Confirmacion de producto; 2026-09-07. | No reabrir por falta de una prueba adicional; conservar checks como historial. |
| D | **MIGRACION LEGACY Y WORLD POR COMPLETAR; PORT Y PUBLICACION CI VERIFICADOS**: faltan datos, identidad y consumidores en la infraestructura nueva. Learn/Ludo, auth/GraphQL y operación Unreal/Agones siguen en el alcance total. | 2026-09-10 04:19:57 UTC: [PR346](https://github.com/fgomezserna/cukies-hub/pull/346) cerrada como sustituida por372/373/374; origen `f4cae5e307fed2a84acf0de3e33d0dae9b25b0a1`, rama y worktree originales intactos. De205 deltas se importaron200 archivos:199 conservan blob/modo exacto y el README se adaptó al CI. Procedencia histórica y checkout principal `6f13b05` preservados. Stage código `26ae560`, CI34435609267SUCCESS: World API/MM publicados y registrados, seis referencias activas y15 contenedores protegidos sin cambios. [Evidencia y cobertura](evidence/2026-09-10-world-ci-integration.json). | CI World cerrado; nuevo runtime/escrituras OFF. Se inventarían ocho contenedores Legacy activos preexistentes en `service-vokgw84g4g4cs0woog0g8o0k`: auth, GraphQL, REST, Learn, Ludo, game, marketplace y matchmaking. El baseline no los incluía: no se afirma comparación histórica ni obsolescencia. Reconciliar consumidores, datos/IDs, emisor Hub→World y cliente; acreditar un único escritor antes del cambio de tráfico y cero consumidores antes de retirar servicios. Fuente World `01a085a9-ce55-75e0-831e-b356608c2ab9` conservada; Legacy blockchain `01a08727-0cdb-7993-bbab-6829bcf3d333` atiende el lote independiente de identidad de padres. |
| 1 | **BRIDGE LEGACY MAINNET PUBLICADO EN MODO LECTURA**: navegación y consultas sobre contratos existentes; aprobar y transferir siguen deshabilitados. | 2026-09-10: PR367 `11de87e4`, CI34421399357 SUCCESS, config `b9a493e1…` y health/ready web+juego200. QA de raíz: la vista ya carga, muestra coste contractual10TRX y estado Disponible; el aviso de solo lectura y los dos botones de transacción deshabilitados son visibles. [Evidencia del lote](evidence/2026-09-10-seller-legacy-integration.json). | Responsable Legacy `01a08727-0cdb-7993-bbab-6829bcf3d333`; INFRA cambió únicamente `NEXT_PUBLIC_CUKIES_BRIDGE_MODE` a `legacy-readonly`, con BSC56/TRON mainnet y operationsEnabled=false. RPC archive/#321, custodia, historial completo, relayer, fee/pausa y E2E siguen pendientes antes de activar operaciones. Esta QA no firmó ni cambió wallet/red y no acredita paridad completa. Producción sin cambios. |
| 2A-C | **MARKETPLACE LEGACY PUBLICADO; COMPRA TRON CON FALLO REPORTADO Y EN CORRECCION**: catálogo publico verificado contra contratos BSC/TRON, ficha rica y permalink histórico, venta/compra/cancelación/cambio de precio con revalidación final, bloqueo de doble envío y reconciliación Mongo tras recibo. El catálogo descarta candidatos obsoletos sin mutar el conjunto mientras pagina; el inventario vendedor pagina más de 60 NFTs. **V2 PUBLICADO Y VERIFICADO EN STAGING** el 11Sep02:53UTC: imágenes de anuncios, compra en sheet responsive, cinco monedas y cancelación directa desde Mis Cukies. Los dos anuncios del usuario permanecen visibles con imagen y botón Cancelar venta. Cinco compras firmadas UKI/ASM/BNB/USDT/USDC y una cancelación verificadas con NFTs de prueba en BSC97; cada vendedor recibió1250UKI y el fee quedó en la moneda de pago. Producción sin cambios. | V2: [PR #410](https://github.com/fgomezserna/cukies-hub/pull/410), Stage `cb39b5575a38fe2ee91e388caffbc3a09282a0a6`, [CI34554177044](https://github.com/fgomezserna/cukies-hub/actions/runs/34554177044) SUCCESS. Health/ready200, imágenes MinIO200 y QA pública1440/390/320px; sesión del usuario confirma12Cukies,2enventa y sheet de cancelación exacto sin firma.269suites/2231tests,lint/tipos/build,131invariantes y11tests de contrato PASS. Diezworkers activos sin reinicios y80contenedores protegidos conservados. [Entrega, transacciones y capturas](evidence/2026-09-11-marketplace-v2-complete.json). Histórico Legacy: [PR #342](https://github.com/fgomezserna/cukies-hub/pull/342), [PR #344](https://github.com/fgomezserna/cukies-hub/pull/344), [PR #348](https://github.com/fgomezserna/cukies-hub/pull/348) y [PR #350](https://github.com/fgomezserna/cukies-hub/pull/350). Stage `ac521466`, [workflow `34358986091`](https://github.com/fgomezserna/cukies-hub/actions/runs/34358986091) `success`, Coolify `1463` / `qcwgsg8g8c0cogc044w0wow4` terminado 2026-09-09 13:54:36 UTC. [QA final](https://github.com/fgomezserna/cukies-hub/pull/348#issuecomment-5603123628): BSC #1000000000029 = 0,195 BNB / vendedor `0xEE73...4910`; TRON #4000000007954 = 900 TRX / vendedor `TBwucs...wD1`; ambas reconciliaciones `changed=false`, responsive 390/1440 sin overflow ni errores y logo directo/optimizado HTTP 200. | Responsable `01a0854e-bdff-7fe0-a7b5-2916abed2270`: PR359 integrada con PR358 en PR366, Stage `f2818618`, CI34419415547 SUCCESS. QA autenticada: colección12=3wallet+8Pool+1Master y enlace de98000007 conserva colección/red97; V2 sin configurar mantiene cerrada la venta de esa colección. No se acredita una publicación positiva ni transacción de venta con esta wallet. [Evidencia del lote](evidence/2026-09-10-seller-legacy-integration.json). Configuracion/liquidacion V2/UKI siguen como lote separado. El worker `legacy-chain-indexer` sigue inactivo y no se afirma paridad general ni orden global de precio ante cambios externos todavía no proyectados. No se activa sin provisionar destino/cursor y resolver RPC de archivo BSC. Completar backfill/replay y pruebas transaccionales controladas. No se firmaron transacciones en QA. Producción/main no se modifica. Actualización10Sep09:13UTC: Marketplace V2 sin addresses públicas/indexer ni router en runtime. Existe pool Testnet ASM/UKI y cotiza; UKI directo no necesita swap. Usuario aprueba **fee500bps (5%) para Testnet**, editable por owner para anuncios nuevos (máximo10%); los existentes conservan su fee. Inventariar despliegues previos, pasar gate local, desplegar/verificar BSC97 y coordinar configuración/indexer. BNB sin ruta, USDT sin token configurado y USDC sin verificar; la cotización ASM no acredita checkout implementado. Añadir acciones contextuales de venta/cancelación en Mis Cukies y mejorar cabecera/filtros tras el parche global de wallets. [Hallazgos y decisión](evidence/2026-09-10-cukies-management-findings.json). Contrato V2 ya desplegado y verificado BscScan el10Sep: `0x0ECeE45B7fF8dA15F8231484208540A6dCAd2C4D`, BSC97/bloque130192587, fee500bps, owner y receptor de prueba `0x3d80cbEd6CA067a154A22659224EB5194aDCe24C`. Coleccion NFT de Testnet permitida; UKI directo, pagos alternativosOFF. Gate local17contrato+62DApp+17indexer y tipos PASS. Activacion prioritaria por raiz10Sep13:55UTC: identidad on-chain revalidada en bloque130226230, gate local de Marketplace PASS. Plan acotado web32/indexer28 y configuracion publica GH: completar addresses/router/WBNB, identidad de despliegue y alias UKI_MARKETPLACE; nueva fuente sin cursores previos, sin reiniciar los demas. UKI directo sin dependencia de pools; pagos alternativosOFF. PR388 publicada en Stage `fab7910` el10Sep14:15:17UTC, workflow34486524384SUCCESS, web32 y juego31 con hashpublicoaf4346; produccion intacta. Se configuran web32/indexer28 y GH, fuente UKI_MARKETPLACE con15cursores verificados y al safeBlock desde deployment130192587. Smoke dedicado NFT98009010: list1UKI, cancelacion y nuevaorden2UKI, cancelacionfinal y approvalrevocado; indexer proyecta ambos eventos y catalogo pasa1→2→0anuncios. Checkout publico abre1UKI+0.05fee=1.05; compra firmada pendiente por operador sin UKItest, sin usar wallet/NFT del usuario. Pagos alternativosOFF. Fallo inicial Coolify1508 por raw=false/ComposeWorld: se recreo solo indexer con digestidentico y se corrigio raw=true/app28+Compose efectivo sin World; rollout completo PR390 verifica raw mode el10Sep16:05UTC. Nueve workersStage y contenedoresProd preservados. UX `f81b0ec`+`153cf2e` entregada/revisada; nuevo requisito del usuario10Sep14:36UTC entra en mismo lote antes de publicar: Vender en card abre modal con NFT/precio/comisiones/neto, Aprobar Cukie y despues Poner en venta como pasos separados, con flujo real Legacy/V2 y guardas. Implementacion corta asignada a `marketplace_sale_modal` LunaMax en `marketplace-v2-ui-20260910`; tarea nativa anterior cede propiedad para evitar duplicados. APIs y BBDD actuales, migracion canonica aplazada. Nueva incidencia del usuario: comprar TRON #2000000004314 (3333TRX) termina en error generico; BSC se comprueba por separado. Copy tecnico Stage/validacionlive es incondicional y se elimina del producto. Selector y menu los corrige `wallet_global_ux` en area separada. Sin firmas con wallet del usuario. [Evidencia de activacion](evidence/2026-09-10-marketplace-v2-activation.json). El cambio15min fue parado por el usuario. [Deployment y verificaciones](evidence/2026-09-10-cukies-management-findings.json). Actualización11Sep: contrato V2 existente, fee500bps; cuatro rutas Pancake con liquidez y allowlist confirmadas. Cada compra de prueba entrega1250UKI al vendedor y retiene el fee en la moneda del comprador; cancelación conserva propiedad. Se usan seis NFT99091101–99091106 de prueba y wallets efímeras, sin operar los NFT98000005/7 del usuario. Estos últimos sí tienen imagen MinIO y owner correctos en Mongo; el API de anuncios omitía metadata y el checkout se renderizaba dentro de la card. Se corrige el manejo En venta durante el retraso del índice y se añade cancelación directa desde Mis Cukies. [Evidencia y límites](evidence/2026-09-11-marketplace-v2-complete.json). Entrega cerrada en PR410/Stagecb39b55 con postflight11Sep02:53UTC y QA pública. El historial previo de pagos alternativosOFF queda supersedido para staging: las cinco monedas están activas y cotizan en el sheet; tUSDT/tUSDC son fixtures de Testnet. La compra firmada se verificó con cuentas/NFTs de prueba, no con los del usuario. Producción intacta y 30→15min cancelado. |
| 3 | **EN STAGING, EN PRUEBAS · NUEVAS INCIDENCIAS DE CUSTODIA, RANKING Y REWARDS EN INVESTIGACION**: Cukie Master, creditos, pools, prestamos y rewards. | 2026-09-09, PR362 y Stage `bdab82c`: Transfer #98000007 proyectado a las 21:45:11 en intento6; dead-letter0 y tx_nfts1 verificados a las 21:47. Fuentes UKI/NFT frescas despues de22:01, dos ticks Master sin ownership aplazado y corte22:00 procesado22:01:17 sin pendientes. QA autenticada22:08:59:3NFT/0UKI,300creditos =200jugar+100pool. Reconciliacion22:18 de134 asientos/33items/33lotes: sin claves duplicadas, referencias ausentes ni diferencias. [Evidencia de cierre](evidence/2026-09-09-nft-recovery-close.json). Los5400historicos corresponden a3000grants+2400compensacion, expiradosel7/9; no permiten atribuir la captura sinwallet/periodo exactos. [RCA y evidencia anterior](evidence/2026-09-09-master-credit-coherence.json). | Responsables vigentes y cola: [programa del documento del 11 de septiembre](#programa-del-documento-actualizado-del-11-de-septiembre), lotes L1–L5/L7. La tarea anterior `01a0814e-0ea0-7070-877c-701f264243e7` conserva solo su historial; no se reactiva en paralelo. Recuperacion limitada al evento bloqueado y lecturas actuales; no se escribieron manualmente saldos/cupos/cursores/watermarks. El agregado bruto pool_deposit200 incluye ambos lados contables: aporte real100. Continuar las pruebas amplias de economia/UX de #289 y el recorrido de juego; conservar cierre historico #326 y avisos independientes de Vesting. Produccion `4475baa` sin cambios en esta recuperacion. Decision vigente10Sep: **cambio30→15min parado por el usuario; no reactivarlo**. RO10:04UTC confirma web32 e indexer28 con `ECONOMY_CYCLE_SECONDS=1800`, sin reemplazo de contenedores. Nueva prioridad asignada a esta misma tarea con LunaMax: custodia y operacion pendiente de NFT; usuario confirma wallet `0x2678…0c13`, Pool#98000006 bloqueado en Actualizando deposito desde9Sep12:07UTC y Master#98000001/3/4 atribuidos a Pool, donde indica que solo estan#2/#6. Contrastar los seis NFTs por chain97/coleccion/vault/ownerOf/recibo/proyeccion; las capturas no prueban la causa. Despues, seguir partidas recientes con puntuacion positiva hasta ranking, asignacion UKI y cierre/publicacion/claim. Usuario reporta ranking ausente y sospecha UKI no asignados; solo confirma wallet, sin hora/puntos. No declarar resuelta esta incidencia con la QA anterior de0puntos ni alterar incidentes historicos. Entregas por lote y despliegue staging tras revision; Wallets y Resumen publicados/verificados en PR384/385; dos ajustes de texto y legibilidad de Resumen se validan en el candidato `052d627`. [Solicitud y comprobacion de reloj](evidence/2026-09-10-cukies-management-findings.json). Nueva peticion10Sep: PR independiente para #98000001/3/4, salida mostrada14:00UTC frente al relojStage30min. Mismo responsable Datos contrasta requestExit, calendario y contrato desplegado; la coincidencia de Mongo/on-chain no acredita que el calendario sea correcto para pruebas. Candidato `de02156` sobre `c3424a9` entregado: conserva lecturas parciales e identifica el deposito por chain/coleccion/token/vault/epoch. Tres suites/30tests, lint y tipos PASS informados; fuente limpia y revision de raiz solicita NFT-R01: los nuevos await receipt/positionOf necesitan volver a comprobar vigencia/contexto y la operacion exacta antes de persistir o limpiar, para no afectar a una tx sustitutiva. NFT-R01 corregido en fuente `bc936c5`; raiz integra `603bd1f`+`4ac30b3`+`357ee59` conservando PR380/384/386 y revisa fencing completo tras await/operacionexacta. PR389 publicada en Stage `e71c32c8` el10Sep14:46:27UTC, CI34490483988SUCCESS, health200/SHAexacto; lint/tipos/build y249suites/2047tests PASS sobre candidato357ee59. QA de raiz: #98000006 muestra Solicitar devolucion del Cukie Pool habilitado, sin Actualizando deposito. MisCukies12=5wallet+7Pool, Master0; Pool resume4posiciones actuales y omite3retiradas de vault anterior que MisCukies si incluye: diferencia de resumen registrada para correccion posterior. No se firmo ni se capturo la operacion local historica del usuario. Solo DApp sustituida,91de92contenedores conservados. [Evidencia](evidence/2026-09-10-nft-deposit-coherence-delivery.json). Plazos1/3/4 ya corregidos on-chain y UI publicada en PR381/`eaabd91`; ver fila Retiradas de prueba. Auditoria de Datos10Sep reporta cinco runs recientes OWN settled, scores43/2/6/117/6. El codigo y reglas posteriores excluyen OWN del weekly; contraste DOCX10Sep identifica que esa conclusion confundio Arena #1-9 con leaderboard semanal. La peticion del usuario exige incluir las partidas propias validas en clasificacion semanal, conservando Arena y recompensa directa. Siguiente alcance RO del mismo responsable: seguir esos UKI por fuente diaria, snapshot, settlement, asignacion y publicacion, distinguiendo flags/gates runtime; ausencia de weekly sources no explica por si sola la falta de rewards directos. El conflicto historico torneo26Ago/resetQA/cierre1Sep queda separado y no se reabre. Entrada`57a8b3e` sigue pendiente de revision del mismo responsable. Nueva tarea independiente own=0/pool utilizable: `01a08af8-0666-7640-8cb6-694f655d1aea`, rama `codex/pool-credit-zero-balance-20260910`, candidato `786b475` y regresion vertical `86ae98f`. Prueba local createSession/startSession reserva10 del pool e idempotencia PASS; la lectura publica filtra lotes vigentes. Sin PR/deploy/partida live. Revision independiente10Sep12:16UTC solicita correccion P1 de falso cero con lotes validos sin proyeccion account/pool y P2 de acceso mostrado tras error de refetch; asignada al mismo responsable junto con regresion open_with_holds. Gates finales e integracion por raiz tras corregir. Actualizacion13:05UTC: fuente `edcac24`+`11e35fa` en revision; auditoria de correccion solicita cambios COR01/COR02: proyeccion existente obsoleta puede quedar negativa y lectura publica no comparte los requisitos de materializacion para lotes bloqueados/desconocidos/exceso. COR01/COR02 corregidos en85663c8, COR03 en f2f0312 y harness endurecido f7e4c37, aceptados por raiz. Replica Mongo local8.0.4:4escenarios reales y3tests de aislamiento PASS. Integracion raiz `6067807`: lint/tipos/build y253suites/2074tests PASS. Incluye prueba de namespace rewards725dac8 sin cambio de producto; no detecta bug de doble prefijo. PR390 merged070cb373 y publicada16:05:20UTC mediante recuperacion acotada de imagenes inmutables tras fallosCI; webSHA/ready y workers verificados. QA firmada con operador dedicado a16:06:51UTC: APIcreditos200, own0, pool70, materializacionready. Sin partida ni consumo: no acredita E2E. [Entrega](evidence/2026-09-10-pool-credit-delivery.json). Nueva aclaracion del usuario10Sep13:53UTC: cinco partidas con creditos y Cukies propios; cuestiona exclusion OWN del ranking semanal. Contrastar documentos canonicos, ranking/bote/reward directo y origen de NFT registrado (seiku/pool_original en la auditoria), sin cambiar reglas ni saldos por inferencia. El juego debe comunicar recursos/partidas propias restantes y excluir activos enMaster/Pool/enventa. RCA actual14:25UTC confirma fiveOWNcredits con seiku2/pool_original3 token98000002; `cukies.ownershipEventId` ausente hace que own-cukie descarte activos aunque inventario los muestre. Responsable Datos entrega c8b0cce+f35e2d3+c8aef87 para nuevas reservas: ownership/CAS canonico soloBSC, guard de truncamiento y proyeccionTRON historica conservada. Integrado en PR393 `82d5b511`, sin cambiar sesioneshistoricas. Raiz verifica254suites/2085tests, lint/tipos/build e indexer90PASS/1skip, mas cruce OWN/weekly24tests. Merge y publicacion confirmados: CI34502941058SUCCESS, SHA82d5 servido desde17:11:12UTC; no reescribe sesioneshistoricas. Correccion de interpretacion10Sep15:00UTC: Funcionamiento.docx separa Pool semanal (no formula exclusion OWN) de Arena #1-9 (solo pool). Nueva decision del usuario: OWN tambien aparece en weekly; candidato raiz1085114 integra34f8cd4+08f4975, permite OWN en semanal y evita falso pendiente si conserva un resultado mejor;254suites2082tests, lint/tipos/build PASS. Integrado en PR392 `4751104`; publicada junto a PR393 en CI34502941058SUCCESS/SHA82d5; siguen pendientes reconciliacion historica y activacion revisada de los gates. Mantiene Arena pool-only/formula/periodos sellados. Auditoria RO15:39UTC confirma5sesiones settled con scores43/2/6/117/6,0weeklybests y0manifests/allocations/accruals; sus2periodos terminaron pero siguen abiertos sin sello. Recuperacion [#414](https://github.com/fgomezserna/cukies-hub/issues/414) verificada11Sep05:33UTC: las5sesiones settled quedan representadas por mejores43/117 en sus2periodos originales del8/10Sep. Operador revisado `7f5c4e1`, pruebas `d9c90ce`; plan `c0d46b81…` aplicado con2bests insertados y2revisiones de periodo, replay0escrituras. Sesiones, runs, reservas, asignaciones NFT y sources conservan sus hashes; manifests/allocations/accruals siguen0, gatesOFF y1800s intactos. No cambia Arena ni la fuente NFT registrada(2Seiku/3Pool). La lista publica consulta el periodo actual; no muestra estos periodos historicos.270suites/2246tests,15regresiones finales, tipos/lint/build y Mongo realPASS. [PR415](https://github.com/fgomezserna/cukies-hub/pull/415) integrada y desplegada en staging `5b5ba019` el11Sep06:16UTC; [CI34566864794](https://github.com/fgomezserna/cukies-hub/actions/runs/34566864794) PASS en intento2 del mismo SHA tras un timeout no reproducido de un test previo del provider, sin modificar codigo ni timeout. Health sirve `5b5ba019`, ready200,10workers activos sin reinicios,82contenedores protegidos conservados y produccion `e962897` intacta. Lectura posterior confirma los2bests y hashes/guardas/finanzas sin cambios; no se repitio la reparacion. Replica local y plan temporal remoto retirados. [Evidencia y limites](evidence/2026-09-11-historical-own-weekly-reprojection.json). Cuota propia implementada por epoch sin reset diario ni consulta UX de usos restantes. Revisión11Sep: la matriz Original2/4/6/8/10/12 y gen2+1/2/3/4/5/6 del DOCX y de las reglas canónicas pertenece al Pool, no acredita por sí sola la cadencia OWN. **Decisión de producto pendiente en [#412](https://github.com/fgomezserna/cukies-hub/issues/412)**: propuesta de misma matriz diaria para OWN, cuota estable por NFT/periodo sin reset al transferir/vender/recuperar, y visibilidad antes de jugar. Conservar ownershipEventId como identidad de tenencia y no usar lastEventId; implementación después de confirmar la propuesta, sin reescribir históricos. [Auditoría y alcance](evidence/2026-09-11-own-cukie-quota-review.md). Rewards directos: auditoría RO11Sep07:35:36UTC (web5b5ba019) confirma5bindings íntegros y0manifests/allocations/accruals; el scheduler de settlement sigueOFF. Backlogcompleto6, uno score0 fuera del lote5. Dos fuentes8Sep superaron reserva presupuestaria9Sep14:00UTC (DAY_CLOSED); las tres10Sep pasan prefiltro replicado solo hasta11Sep10:00UTC, no una liquidación canónica. Cálculo esperado conjunto al jugador0.2175UKI, aún sin acreditar; fuentes2Seiku/3Pool conservadas. Se prepara recuperación acotada y revisión de cierres antes de activar circuitos generales. La clave del publisher también estaba configurada en web32: retiradas sus entradas runtime/preview de app32 el11Sep08:02UTC, conservando app28 y el resto de variables. Ausencia en contenedor pendiente del siguiente deployweb. [Diseño acotado revisado](evidence/2026-09-11-direct-rewards-recovery-design.md), aún sin implementar/aplicar; cap diario500kUKI y vital450MUKI, materializar dos días supondría1Mnominal. Sin escriturasfinancieras, firmas, cambio de gates ni producción. [Readiness y plan acotado](evidence/2026-09-11-direct-rewards-readiness.json); recuperación y aislamiento coordinados en[#418](https://github.com/fgomezserna/cukies-hub/issues/418). Nueva incidencia10Sep18:00UTC: retiradas Pool firmadas vuelven a ofrecer Retirar con aviso de datos degradados. Reproduccion local confirma que una respuesta sourceHealthy=false/positions=[] limpia el pendiente de withdraw mientras la UI retiene la posicion anterior. Parche revisado `d304d0d`+`780962d` en `codex/pool-withdrawal-receipt-fix-20260910`: conserva hash/bloqueo hasta lectura saludable y evita copy/contadores que pidan otra firma tras confirmar. RO18:19UTC: #98000006/#98000009 retirados con receipts success a18:00:07/18:00:20UTC; #98000010/#98000011 siguen disponibles para retirar. Latencia total chain→proyeccion45/64s; procesamiento posterior a ingesta~1s. 261suites/2131tests, lint, tipos y buildStagePASS. [PR396](https://github.com/fgomezserna/cukies-hub/pull/396) integrada y publicada en Stage `1e480a7`; [CI34514771577](https://github.com/fgomezserna/cukies-hub/actions/runs/34514771577) SUCCESS. Postflight18:40UTC: healthSHA exacto, ready200, web saludable, 10workers sin reinicios y25/25contenedores protegidos conservados. Recarga publica: #98000006/#98000009 en wallet; #98000010/#98000011 en Pool listos para retirar, sin aviso degradado. Sin nueva firma, contrato ni cambio de ciclos; solo imagen web modificada. [Evidencia de retirada/refresco](evidence/2026-09-10-pool-withdrawal-refresh.json). Incidencia11Sep de refresco tras transacción confirmada: corrección publicada en Stage mediante [PR404](https://github.com/fgomezserna/cukies-hub/pull/404) (Master/runtime), [PR405](https://github.com/fgomezserna/cukies-hub/pull/405) (Pool/recuperación, marketplace y premios), [PR406](https://github.com/fgomezserna/cukies-hub/pull/406) (colección/Vesting) y [PR407](https://github.com/fgomezserna/cukies-hub/pull/407) (Bridge/Crías y receipt TRON). El depósito Master#98000002/epoch4 confirmó18:05:43UTC y llegó a la proyección18:06:40.996UTC (57.996s): la UI conserva la confirmación por activo y actualiza automáticamente las vistas dependientes, con reintentos acotados y comprobación sin nueva firma. Los cambios de wallet/red y las respuestas tardías quedan aislados por operación. Candidato final `fc9a6af`: 266 suites/2.210 tests, lint sin avisos, tipos y build correctos en worktree aislado. Publicación `e82b2b8`, [CI34548404036](https://github.com/fgomezserna/cukies-hub/actions/runs/34548404036) SUCCESS; postflight 2026-09-11 01:02 UTC: health SHA exacto, ready200, imágenes verificadas, diez workers sin reinicios, 25/25 contenedores protegidos y producción `e962897` preservados. QA autenticada: Master#98000002 permite retirada, colección conserva12tarjetas al actualizar y carga los estados de venta, Pool/marketplace/premios/Vesting y Bridge/Crías revisados en lectura. Sin firmas reales ni cambios de contratos, economía o gates Legacy; el cambio15min sigue cancelado. Los escenarios de confirmación tardía se validan en regresiones, sin presentar health como prueba de una operación económica real. [Evidencia completa y límites](evidence/2026-09-11-transaction-refresh.json). Auditoría Pool11Sep07:21–07:29UTC sobre fuente31e558cb/web5b5ba019: vault activo359b tiene7 depósitos históricos de6NFT distintos (98000006 tiene2epochs),2abiertos98000010/11 y0activos; Master98000002. Lectura ownerOf confirma también98000001/3/4 en recoveryvaultd405, fuera de esa consulta, y6NFT en wallet. Se corrige el texto del Dashboard a «depósitos registrados»; no cambian contadores ni custodia. [PR417](https://github.com/fgomezserna/cukies-hub/pull/417) mergeado y servido en staging `03de2a7`: CI34575131969 verde (270suites/2246tests), postflight11Sep07:56UTC con readiness200, diezworkers y82contenedoresprotegidos conservados, produccióne962897 sin cambios. Solo cambió la imagenweb; ciclos1800s y gates financierosOFF. [Evidencia por vault/epoch](evidence/2026-09-11-pool-summary-vault-identity.json). El panel Pool presenta2posicionesactuales y MisCukies5custodiadas(2actuales+3recuperación), ningunaactiva: la unificación de acceso y contadores queda en[#419](https://github.com/fgomezserna/cukies-hub/issues/419), sin volver a tocar históricos. |
| 4 | **HOTFIX VERIFICADO EN MAIN Y STAGING; PUBLICACION DE PRODUCTO PENDIENTE**: Cukie Master y sponsor confirmado para invitar, mismo codigo tras recuperar el rol, conservacion de referidos y correccion administrativa auditada. | Decision del usuario; [PR #351](https://github.com/fgomezserna/cukies-hub/pull/351), Main `4475baa`, Coolify `1464` (2026-09-09 14:09:27 UTC); [PR #352](https://github.com/fgomezserna/cukies-hub/pull/352), Stage `e6e3cbb`, CI `34362306780` intento 3 y Coolify `1465` (14:54:12 UTC), ambos health con SHA exacto. Migraciones CW: Main 19 y Stage 2; relaciones/codigos previos intactos y replay 0. Stage: login/navegacion sin sponsor, confirmacion gasless y correccion administrativa con restauracion verificadas. [Evidencia](evidence/2026-09-09-ambassadors-lifecycle.json). | Coordinador `01a07aec-6bc1-7203-8f43-357ed4b8931c`. Nueva autorizacion expresa10Sep: hotfix en MAIN/produccion y traslado a staging para invitaciones inexistentes, malformadas o de sponsor sin Cukie Master. Deben ofrecer Cukies World con consentimiento y firma especificos; una lectura desconocida/503 conserva la invitacion. PR382 publicada en Main `e962897`, Coolify1500 terminado10Sep12:01:38UTC: health interno200 con SHA exacto, DApp/indexer saludables y cuatro ciclos de indexer avanzando sin errores. QA publica del enlace inexistente ofrece Cukies World y habilita Confirmar al marcar consentimiento; se desmarca sin firmar. Candidato `dcf5603`:172suites/1488tests, lint/tipos y build chain56 PASS. Backport PR383 publicado en Stage `bc03749` a12:14:05UTC, workflow34474927269 SUCCESS y health interno200 con SHA exacto;248suites/2016tests, lint/tipos y build97 PASS. Stage sustituye solo DApp y conserva91de92contenedores. QA autenticada Stage recuperada despues en PR384: la cuenta conserva su sponsor Cukies World ya confirmado; no se cambia su relacion ni se prueba una confirmacion nueva. [Evidencia del hotfix](evidence/2026-09-10-ambassadors-invalid-invite-delivery.json). La autorizacion no incluye PR361 ni la activacion general del programa. Validar aparte publicacion y claims con fondos. Visibilidad de produccion sigue desactivada; no activa porcentajes o niveles nuevos. |
| 5 | **DATOS COMPARTIDOS EN STAGING · RESUMEN Y WALLETS BSC/TRON EN REVISIÓN**: wallet, red, cache y recuperacion en `AppRuntimeProvider` persistente; aviso comun del layout; Resumen, Master/NFT, Creditos y Pool consumen lecturas compartidas. Cada operacion conserva su guard final. | 2026-09-09, [PR #340](https://github.com/fgomezserna/cukies-hub/pull/340), Stage `43d8a2f`, deploy terminado 09:28:48 UTC. Lint, tipos, build y 1.773 tests PASS; sesion QA coherente con 3 cupos NFT/0 UKI y 300 creditos. [Evidencia y limites](legacy-marketplace/evidence/2026-09-09-shared-app-runtime.json). | Responsables: datos/estados/juego `01a0814e-0ea0-7070-877c-701f264243e7`, navegación Legacy `01a08727-0cdb-7993-bbab-6829bcf3d333`, venta/fichas `01a0854e-bdff-7fe0-a7b5-2916abed2270`; coordinación y QA final por raíz. QA compartida Master/Creditos22:08:59UTC en `bdab82c` coincide en3NFT/0UKI y200jugar+100pool; ver cierre y evidencia en fila3. PR358/359 publicadas en PR366 `f2818618`: lint/tipos/build y236suites/1.911tests PASS, DApp reconstruida y cinco imágenes reutilizadas. QA desktop de navegación y colección realizada; móvil sin validar porque el override no cambió el ancho real. Persisten ceros iniciales de colección. Diagnóstico Legacy revisado: Points429 procede de cuatro constantes simultáneas al TronGrid del wallet; Crías mezcla disponibilidad de firma y lectura, aunque los valores0/1 sí coinciden con consulta independiente BSC56. PR370 publicó la corrección de lectura/estados en4a08053: Crías consulta y actualiza BSC sin cambio de red, Points muestra BSC y TRON verificados. QA detectó selección de padres sin filtro de chain/colección:12NFT97 y6sin identidad completa aparecen ante contratos56; ver post1-2. Escrituras cerradas. QA de juego con recursos reprodujo rechazo antes de partida. Dos incidencias históricas NFT contenidas siguen abiertas para excluir recompensas, pero la reserva las contaba como bloqueo general. Candidato `d855930` revisado: aplica la política existente y alinea disponibilidad pública, preservando incidentes, exclusión histórica y otros bloqueos. PR369 publicada en Stage `0cf0019`, CI34428083750SUCCESS: solo DApp/reuse5, configb9 y juego11de87e4 conservados, diez workersStage y tres contenedoresProd sin cambios. 73tests focales, lint/tipos y236suites/1.922tests reportados PASS. QA de Créditos confirma200jugar/0reservados/0usados/100pool y3cuposNFT; no acredita reserva ni partida. [Diagnóstico y revisión](evidence/2026-09-10-game-credit-containment.json). Recovery `52318743` y filtro Legacy `55458601` publicados juntos en [PR #376](https://github.com/fgomezserna/cukies-hub/pull/376), Stage `0aad3fee`, CI34449216097SUCCESS. Candidato combinado `ec0f34f`: lint/tipos/build92 y242suites/1.975tests PASS; merge con árbol idéntico. Plan real solo DApp/reuse7; web32 sirve digest31aa1dda, otros22contenedores de juego/workers/producción/Legacy preservados y World nuevo OFF. QA desktop10Sep07:35UTC: una partida autorizada con10créditos personales arranca, termina a30s/0puntos y confirma el cargo usando Cukie del pool; saldo200→190,0reservados,10usados,100pool. Recarga conserva resultado y saldo; Master y Créditos coinciden en3NFT/0UKI. No se capturó la identidad HTTP de la rotación histórica ni se certifica todo el ledger. Recompensa directa sigue «Calculándose» sin certificar liquidación. J05 de imágenes publicado después en [PR #378](https://github.com/fgomezserna/cukies-hub/pull/378), Stage `2e8c472`, CI34455959295SUCCESS: web32/juego31 sustituidos y otros21contenedores preservados, seisrefs reutilizadas. Selector1P/2P muestra ambos personajes en Edge; nuevo resultado live sin validar porque la práctica conserva el aviso de sesión. El candidato de entrada `57a8b3e` sigue separado. [Postflight y límites](evidence/2026-09-10-game-images-delivery.json). J06 arranque/cierre desktop acreditado dentro de esta prueba; móvil y otras variantes pendientes. Legacy cerrado por withdrawal sin evidencia subyacente permanece pending. Sin reparaciones directas ni firmas/transacciones on-chain; [revisión, entrega y QA](evidence/2026-09-10-game-legacy-candidate-review.json). Completar variantes UX y paridad legacy. `DOMAIN_CONFLICT` del9/9 atribuido al Transfer sin proyectar queda recuperado mediante PR362 y reencolado selectivo (fila3). El exito externo del scheduler no acredita salud si el resultado interno esta bloqueado; se comprobaron fuentes, propiedad y corte reales. El banner de red en QA exige Testnet para firmar y conserva lecturas. Completar continuidad approval → stake → Master → créditos, no ejercitada en esta prueba de juego. No se reabre la reparacion historica del punto 3 ni se afirma resiliencia completa del backend. Main conserva `4475baa`. Nuevo encargo del usuario10Sep: rediseñar `/dashboard` y corregir Comprar con wallets independientes EVM/BSC y TRON. Tarea Resumen solicitada con Luna Max (preparación `client-new-thread:1909a8e6-3216-46a4-bf35-f2b1c3f5fe80`); Marketplace `01a0854e-bdff-7fe0-a7b5-2916abed2270` reactivada para diagnóstico del flujo global. Cada operación debe iniciar su conexión/red y conservar la sesión; la segunda cartera no vincula cuentas ni mezcla recursos. Diagnóstico live: ficha TRON7954 con error genérico al comprar; Wallets en implementación aislada. Resumen entregó `ffa285b`, con tipos/lint y20tests focales informados PASS; la revisión de raíz exige corregir cupos sin reconciliar en la franja superior, Actualizar ausente en ready, gates de CTA financiero y cabecera móvil antes de integrar. Ninguno de estos cambios está publicado. Archivos separados: Resumen UI y pruebas frente a wallets/auth/marketplace; revisión e integración por raíz en `codex/dashboard-wallet-integration-20260910`. Nuevos criterios10Sep: las tarjetas deben conservar NFT/red/colección/contrato y ofrecer solo acciones válidas de venta, Master y Pool. La ruta de retirada recibida desde la tarjeta debe consultar automáticamente la posición, explicar de qué Pool/Master sale y su plazo, y continuar a confirmación/firma; eliminar token ID/Comprobar posición del recorrido normal sin retirar validaciones ni firmar automáticamente. Encargo asociado a Marketplace como lote posterior al coordinador de wallets. Aún sin publicar. Estado10Sep11:55UTC: Wallets2f182b0+30cee0e publicado en PR380/`4d4e1ce`, workflow34468013429 SUCCESS, release10:55:50UTC, solo DApp y91de92contenedores conservados. QA detecta perdida de restauracion al hidratar TRON antes que EVM; reproduccion `4f9e0e5` y candidato `a73d981` en `codex/wallet-hydration-review-20260910`. La revision detecto mezcla de wallet del perfil con firmante real TRON/EVM. Corregida en `c697b09`: restoreSession exige tipo y direccion firmantes exactos, sin autofirma ni promocion de la segunda wallet tras logout. Raiz integro el candidato `183672a`:248suites/2024tests, lint/tipos y build97 PASS. PR384 publicada en Stage `3da2ad9` a12:32:36UTC, workflow34476524018 SUCCESS, health interno200 con SHA exacto y91de92IDs conservados; solo DApp/reuse7. QA publica Edge: recarga recupera cuenta `0x2678…0c13`, mantiene EVM y TronLink independientes y conserva sesion al navegar a Mis Cukies, sin pedir firma. [Evidencia](evidence/2026-09-10-wallet-session-restoration.json). Resumen `ffa285b`+`336b4dc` integrado sobre PR384 en `codex/dashboard-summary-integration-20260910`; raiz ajusta solo la asercion de subtitulo retirado en el test de ruta, candidato `99b8e50`.248suites/2034tests, lint/tipos y build97 PASS. PR385 publicada en `0fc3123` a12:48:19UTC, workflow34477973649 SUCCESS, health interno200 con SHA exacto; solo DApp/reuse7 y91de92IDs previos conservados, mas un helper Coolify auxiliar observado. QA real400/1440CSS sin overflow y Actualizar conserva datos y vuelve a ready. Dos hallazgos acotados corregidos en fuente `d191eb6`, integrada como `052d627` en `codex/dashboard-reward-state-integration-20260910`: distingue sin premios/asignaciones pendientes/reclamables y da mas espacio al estado. Reviewer terminado;248suites/2038tests, lint/tipos/build97 PASS. PR387 publicada en Stage `f9685b9` a13:21:32UTC, workflow34481399948 SUCCESS, health interno200 con SHA exacto; solo DApp/reuse7 y91de92IDs del host conservados. QA publica400/1440CSS confirma Sin premios asignados, sin En preparacion ni desbordamiento. Viewport restablecido. [Evidencia](evidence/2026-09-10-dashboard-reward-state-delivery.json). [Entrega y limites](evidence/2026-09-10-dashboard-summary-delivery.json). Tarjetas y acciones contextuales `98d40be`+`7a11ed0` revisadas y aceptadas: autolectura, retry visible, identidad de red valida y rechazo de respuestas tardias, sin formulario tecnico ni firma al abrir. Integradas en `codex/nft-card-actions-integration-20260910`, candidato `f8e1bc6`, PR386 publicada en Stage `4b6b60f` a13:06:21UTC, workflow34479688999 SUCCESS y health interno200 con SHA exacto;248suites/2037tests, lint/tipos/build97 PASS. Solo DApp/reuse7. QA Edge: enlace desde la tarjeta98000001 conserva chain97/coleccion/vault, carga la posicion automaticamente, muestra propietario verificado y Retirar del Cukie Pool habilitado, sin inputs ni Comprobar posicion; no se firmo. [Entrega y limites](evidence/2026-09-10-nft-card-actions-delivery.json). Actualizacion10Sep13:55UTC: cuatro frentes Luna Max independientes activos por instruccion del usuario: own0/pool, investigacion de rewards y origen de Cukie, correccion NFT-R01 y Marketplace/UX. Marketplace atiende cabecera/filtros en paralelo; raiz activa V2 en web32/indexer28/GH sin cambiar CI/Compose. Integraciones y publicaciones seriales, sin esperar a tareas ajenas. Cada lote termina tras merge, deploy y comprobacion live; staging ya autorizado. Actualizacion10Sep17:24UTC: wallet/Marketplace integrado sobre82d5 en `codex/wallet-marketplace-integration-20260910`, producto7fd47d3. Selector deduplicado, EVM-only sin provider abre explicacion; menu UKI/creditos/Cukies con APIprivada, desconocido separado de0, BSC/TRON independientes. Venta desde tarjeta en modal precio/fee/net, aprobar y publicar separados; txidTRON conservado antes de polling y receipt exitoso resuelto aun si cambia el anuncio o falla su relectura. RevisionAstra P1/P2 corregida5041253 e integrada2cc5d48; regresionesa869d42PASS. QA local sintetica sin firmas: menu320px, selector320x568, modal390/1280sin overflow y precio12,5 aceptado. BSC56 simulacion read-only de buyToken con balanceoverridePASS, sin compra firmada. Gates finales sobre7fd47d3:261suites/2127tests, lint/tipos/build92PASS. Capturas sinteticas en [QAvisual](evidence/2026-09-10-wallet-marketplace-qa/README.md). PR394 publicada4de6cf1, CI34508285315SUCCESS; health/readySHAexacto, journal limpio y25contenedores protegidos conservados a10Sep17:36:38UTC. QApublicaEdge: menu1,092UKI/30creditos/12Cukies(5wallet), ambaswallets conservadas; anuncioTRON2000000004314 a3333TRX llega aConfirmarcompra sin textoStage. Tarjeta98000002 abre modal, precio12,5/feecomprador5%, aprobar habilitado/publicar deshabilitado hastaaprobar; cerrado sinoperacion. APIresumenanonima401/private-no-store. [Entrega y limites](evidence/2026-09-10-wallet-marketplace-delivery.json). No se firmaron compras ni anuncios; compra firmadaTRON/BSC sigue sin acreditar. Nueva peticion10Sep20:01local: sustituir la venta por sheet lateral/inferior y mejorar cards con colores, iconos y etiquetas flotantes. Lote aislado `codex/nft-cards-sale-sheet-20260910` desde Stage `dff4037`: la paleta del portal no heredaba `--uki-*` y las utilities var/alpha no generaban CSS. Se corrigen esos scopes y la presentacion conservando protocolo, comisiones, custodia y #396. Implementacion y QA local responsive terminadas: sheet derecha/inferior, CTA segun paso, labels flotantes y acciones agrupadas; colores efectivos verificados, 320/390/1440px sin overflow y foco devuelto a Vender. [QA visual y limites](evidence/2026-09-10-nft-cards-sale-sheet-qa/README.md). Gate final: 261suites/2132tests, lint, tipos y build PASS. PR398 integrada y publicada como `85f9b586` el10Sep19:38:49UTC, CI34520888641SUCCESS. Health/ready200 y SHAservido exacto; QA publica Edge12cards, sheet560px, precio12,5/fee5%, CTA lila y foco devuelto aVender al cerrar. Diezworkers sinreinicios y25contenedores protegidos conservados, produccionSHAe962897 intacto. [Entrega verificada](evidence/2026-09-10-nft-cards-sale-sheet-delivery.json). Sinfirmas ni cambio30→15min. Fondos de contenido10Sep: inventariadas40paginas; wrappers de producto usan tema sin fondo y el layout conserva la superficie general. La landing publica y superficies de cards/paneles/sheets se conservan; Indexer deja de anidar un main con fondo. PR400: 261suites/2132tests, lint/tipos/buildPASS; 45observaciones CSS en14secciones+landing a1440/390/320px, sin desbordamiento ni fondo general añadido. [QA e inventario](evidence/2026-09-10-content-backgrounds-qa/README.md). PR400 publicada como `ea62f948` el10Sep20:13:43UTC, CI34524368627SUCCESS; health/ready200 y SHAservido exacto. QApublica14secciones+landing y fichaNFT sin fondo general; Edge12cards y sheet560px/fixed/fondopropio/CTAlila, sinfirmas. Diezworkers sinreinicios,25contenedores protegidos y produccionSHAe962897 conservados. [Entrega verificada](evidence/2026-09-10-content-backgrounds-delivery.json). Organización por tareas10Sep: lote `codex/content-task-tabs-20260910` desde `19df664`; Premios, Créditos, Pool, Master, Marketplace, Bridge y Embajadores con vistas por tarea; datos secundarios y ayuda plegables en Points/Vesting/Embajadores. Borradores, filtros, hashes y operación pendiente conservados. PR402 integrada y publicada como `6f755b86` el10Sep21:33UTC, CI34531912745SUCCESS; 261suites/2149tests, lint/tipos/buildPASS. QApublica9rutas: panel único, borradorCréditos/importeMaster/filtroMarketplace conservados y restaurados sin guardar; Pool separa2depositados/6disponibles; reglas y datos plegables y hashhistorial enfocado. Health/ready200 y SHAexacto;10workers sinreinicios,25contenedores protegidos y produccióne962897 conservados. [Entrega verificada](evidence/2026-09-10-content-task-tabs-delivery.json). Sinfirmas ni cambios de duración de ciclos. [Alcance y QA](evidence/2026-09-10-content-task-tabs-qa/README.md). |
| 6 | **SIN CAMBIO**: conservar tokenomics, evidencia y decision previa; no inventar un estado nuevo. | `docs/uki-current-operating-rules.md` y evidencia previa; contraste 2026-09-07. | Reconciliar solo cuando exista una nueva decision versionada. |
| post1-2 | **ANTES DEL 15 · IDENTIDAD PUBLICADA Y EXCLUSIÓN VERIFICADA EN STAGING · ESCRITURAS CERRADAS**: Crías y Cukie Points están en la navegación; la prueba positiva con padres mainnet sigue abierta. | 2026-09-10: [PR #376](https://github.com/fgomezserna/cukies-hub/pull/376), Stage `0aad3fee`, CI34449216097SUCCESS;242suites/1.975tests, lint/tipos/build92 PASS sobre candidato combinado. Solo DApp/reuse7; otros22contenedores protegidos sin cambios. QA con la wallet existente: BSC verificada,0puntos/máximo1, Actualizar operativo sin cambiar red de firma y ningún candidato testnet o sin identidad verificable visible; aprobar/iniciar deshabilitados. [Revisión, publicación y límites](evidence/2026-09-10-game-legacy-candidate-review.json). Lecturas de Points publicadas anteriormente en [PR #370](https://github.com/fgomezserna/cukies-hub/pull/370); su QA histórica permanece en [evidencia](evidence/2026-09-10-legacy-readonly-qa.json). | Responsable Legacy `01a08727-0cdb-7993-bbab-6829bcf3d333`, implementación congelada tras integrar `55458601`; cuatro commits fuente y alternativa `a78b139` intactos. Hallazgo de mezcla97/56 corregido con identidad/red/colección, ownerOf/max/contador actuales, TRON exacto y preview; el margen BSC no acreditado se excluye como partial. Inventario BSC56 independiente de la red de firma. No se acredita una pareja mainnet elegible, semántica contractual completa ni operaciones. Próximo alcance: prueba positiva con evidencia autorizada, reconciliar historial/events/cursores e identificar Bread por address/bytecode/ABI; no activar escrituras ni cerrar toda la migración por esta exclusión negativa. Incidencia Cukie Points10Sep09:13UTC confirmada: API Global200/source=mongo/items0; destino nuevo `point_transactions=0`, `point_balances=0` y eventosPOINTS=0, mientras Legacy Stage conserva `points=23515` y `tx_points=23529`. Los totales contractuales no acreditan migración del historial. Reconciliar esas fuentes, procedencia, cobertura e ingesta continua; mostrar historial no disponible/parcial cuando corresponda, nunca un cero global engañoso. Lote asignado a Legacy con Luna Max tras la entrega del candidato Resumen; sin copiar registros, activar workers o reparar cursores a ciegas. [Evidencia RO](evidence/2026-09-10-cukies-management-findings.json). Candidato historial `440168b` revisado e incorporado localmente como `485f098`: consulta explicita de `points`, fuente historical/partial, filtros TRON exactos y BSC normalizados, sin union o migracion con escritura. Raiz simplifica aviso y oculta detalles internos de errores;4suites/10tests focales PASS. RO de raiz09:44UTC confirma23515 movimientos/suma6151157, fechas string uniformes y puntos enteros con signo; una clave red/tx/tipo repetida requiere identificacion de logs antes de deduplicar. Publicado y comprobado el10Sep10:38UTC en PR379 / Stage8033007, CI34465858191 SUCCESS: historial Global23515, BSC3094, TRON20421, filtros y segunda pagina verificados en API y Edge; aviso de cobertura parcial visible. Lint/tipos/build y245suites/1986tests PASS. Solo cambia DApp; siete imagenes reutilizadas,91de92contenedores del host conservados. [Evidencia publicada](evidence/2026-09-10-cukie-points-publication.json). No equivale a migracion completa ni a balance contractual actual. |
| post3-9 | Alcance conservado como inventario posterior, sin afirmar codigo definitivo ni cierre. | Registro historico; 2026-09-07. | Mantener scope y esperar decision/evidencia especifica. |

## Coordinación de ejecución autorizada — 9 de septiembre de 2026

La petición de coordinar los pendientes reactiva las tareas indicadas en las
mismas filas anteriores. Marketplace y Legacy comienzan sus primeros lotes;
datos/juego prepara el intake y recibe el siguiente slot disponible. Máximo dos
implementadores funcionales simultáneos; los coordinadores revisan evidencia y
no duplican ejecución rutinaria. El diseño UX ya elaborado sirve de referencia;
esta asignación no encarga otro rediseño visual.

INFRA mantiene el control exclusivo de CI/CD y de la ventana de staging. Los
responsables funcionales trabajan en ramas aisladas y entregan commits/PRs;
la raíz revisa y ordena el merge/deploy cuando INFRA libere explícitamente la
ventana. Publicación main, transacciones Legacy mainnet, relayers/signers y
movimientos de liquidez requieren su revisión concreta; no se deducen de un
resultado local. Los lotes aprobados deben terminar desplegados y verificados
en staging, registrando requisito, SHA servido y resultado real por cada fila.

Actualizacion del 10 de septiembre: la PR346 de la tarea **Identifica los dos
proyectos** forma parte de esta misma coordinacion, aunque proceda de un proyecto
de Codex que agrupa Hub y legacy. Se conserva su worktree aislado y la
procedencia exacta del port; la separación de proyectos en la aplicación no crea
repositorios Git ni ventanas de despliegue independientes.

INFRA completó la base CI364/365. La raíz integró el lote conjunto358/359 como
PR366 `f2818618` y conservó las dos ramas originales. PR367 `11de87e4` publicó
Bridge en modo lectura; CI, postflight y QA de la raíz están verificados.
Los hallazgos de lecturas parciales quedan en las filas1/post1-2, con dueño Legacy.
PR371 `9d3e728`, CI34430206966 SUCCESS, reutilizó las seis imágenes y omitió
la entrega. PR369 ya entregó el parche de bloqueo de créditos en `0cf0019`;
PR370 entregó las lecturas Legacy en `4a08053`, con QA y límites registrados.

El port World se integró en PR372/373/374 y `staging` llegó a `26ae560`.
PR346 queda cerrada como sustituida, conservando su rama/worktree `f4cae5e`;
199 archivos importados mantienen blob/modo exacto, el README se adaptó al CI
y los hashes de procedencia histórica siguen intactos. La carpeta principal
`codex/legacy-migration-inventory` conserva `6f13b05` y sus archivos ajenos.
La sonda raíz del HEAD final con state y Nx observados seleccionó solo World;
CI34435609267 confirmó build2/reuse6, smoke real y registro de ocho referencias.
La entrega se omitió porque no cambia el Compose servido. Postflight del10Sep
04:19:57UTC:15 contenedores protegidos sin cambios, journal limpio y cuatro
probes públicos200. Los fallos y correcciones de372/373 se conservan en
[la evidencia](evidence/2026-09-10-world-ci-integration.json).

El nuevo runtime World permanece apagado. Los ocho contenedores del stack
Legacy preexistente siguen activos; no estaban en el baseline comparativo.
Su identidad, datos y consumidores se reconcilian antes de mover tráfico
o retirar servicios. INFRA termina este lote. La tarea Legacy recibe
`LEGACY-BREEDING-IDENTITY`, en aislamiento y sin tocar CI/World; Datos/juego
mantiene su alcance de recuperación de autoridad. Toda entrega requiere
revisión raíz antes de publicar. Los lotes358/359 no sustituyen el port World.

Los cruces documentales se resuelven conservando filas y evidencia fechada.
No se aplica un Compose/lock/seguimiento antiguo completo ni se resuelven
conflictos de forma indiscriminada con ours/theirs. Registrar imágenes no
activa World ni su escritor; el cambio de tráfico requiere las verificaciones
operativas de la fila D. La rama original `f4cae5e` y el checkout principal
siguen intactos.

## Programa vigente de las pruebas del 12 de septiembre

Fuente: `/Users/fgomezserna/Downloads/cambios actualizado (12-Sept).docx`,
SHA-256 `bfdec23577d1f9fee391bb3e8b72bf4a163bf70f3ba71ae74bf6365ac9ae0193`.
Revisadas sus cuatro páginas renderizadas y las siete capturas, conservando el
original sin editar. La [extracción trazable](evidence/2026-09-12-document-review.json)
relaciona cada punto con página, párrafo, captura y observación anterior.

El usuario solicita una tarea por PR, revisión del coordinador, integración y
seguimiento hasta el despliegue. Se reutilizan las issues abiertas para conservar
el contexto; las nuevas tareas sustituyen los encargos terminados del día 11 en
estos alcances. Los puntos anteriores ausentes de esta revisión mantienen su
última evidencia: la omisión no demuestra una validación positiva nueva.

### Tabla vigente del documento del 12

Se conserva la numeración del documento, incluidos sus saltos. Jugar 1 contiene
tres síntomas y Otros 2 contiene los ejemplos UKI y NFT; todos quedan incluidos.
Los estados de código, despliegue y prueba funcional se actualizan por separado.

| Punto | Trabajo y criterio de cierre | Lote / issue | Estado y próximo paso |
| --- | --- | --- | --- |
| 12-J1 · Jugar 1 | Terminar y guardar la partida; resolver el aviso persistente; volver a iniciar 1P sin reconectar. La captura muestra 24 puntos con créditos y Cukie propios. | D12-1 · #418; aviso compartido con D12-3 | PR449 código `56462244` aceptado: handshake petición/respuesta corrige ready→load, load→ready y recarga del iframe; reintentos acotados distinguen carreras transitorias de errores definitivos. Base staging actualizada sin conflictos; checks finales raíz en curso. |
| 12-J3 · Jugar 3 | Registrar la puntuación, reservar el bote y permitir el reparto del periodo correcto. | D12-1 · #418 / #423 | PR449 en validación final. El cierre vuelve a leer estado y reintenta fences/colisiones transitorias conservando ranking y reserva idempotentes. Probar operaciones nuevas, sin reconstrucción histórica. |
| 12-M2 · Cukie Master 2 | Tras aprobar el NFT y cancelar el depósito, ofrecer Continuar depósito; conservar la elegibilidad y revalidar antes de firmar. | D12-2 · #419 · PR447 | PR447 integrada en staging `4d997fc8` el 12-Sep a las 13:55 UTC; CI34697774329 terminó correctamente a las 14:03 UTC y health sirve el SHA exacto. Código aceptado tras revisar continuación, aprobación residual y posición RPC desconocida; 272 suites/2378 tests correctos. Entrega técnica completada; no se firmó una transacción con la wallet personal. |
| 12-C2 · Créditos 2 | Finalizar el corte, mostrar créditos vigentes y permitir configurar el reparto siguiente con una fuente actual. | D12-3 · #421 | PR450 se entrega como lote acotado de lectura de créditos/avisos. Código `a2ba5c09` revisado; se retira la prueba O2 insuficiente antes de aceptar. O2 se separa para no bloquear esta corrección. |
| 12-W1 · Premios 1 | Acreditar los UKI de una partida nueva y mostrar su estado e importe canónicos. | D12-1 · #418 / #423 | PR449 en validación final: los reintentos completan la misma liquidación y mantienen autoridad/payload originales. 67 pruebas existentes de economía y contabilidad correctas según la tarea; no se afirma una acreditación live todavía. |
| 12-W3 · Premios 3 | Reservar los UKI semanales de las partidas y llevarlos al cierre y reparto correspondientes. | D12-1 · #418 / #423 | PR449 en validación final: mantiene el registro idempotente de la fuente semanal y los guards del periodo; no cambia reglas ni salta validaciones de cierre. |
| 12-A1 · Embajadores 1 | El enlace activo `cw-876fe531558b` funciona estable en producción; distinguir indisponibilidad temporal de invitación inválida. | D12-4 · #424 · PR448 | PR448 producción `cf08e813` verificada: diez consultas nuevas200 y página200. Backport PR451 integrado a staging `2c7a3882` a las 14:12UTC; CI34698620345 en curso. |
| 12-A3 · Embajadores 3 | Mostrar el alias público disponible encima de la wallet; fallback a dirección si no existe. | D12-4 · #424 · PR448 | PR448 desplegada en producción. Alias elegido semanal/runtime y username público exacto; wallet si no existen. PR451 ya integrada en staging `2c7a3882`, despliegue en curso. |
| 12-O1 · Otros 1 | Mostrar el total restante del conjunto de Cukies propios elegibles y actualizar el consumo al jugar. | D12-1 · #412, ya cerrada por PR442 | Implementado y desplegado el 12-Sep a las 12:22 UTC. Contrastar el flujo autenticado actual antes de abrir otro parche; los límites están definidos. |
| 12-O2 · Otros 2 | Tras staking/retirada UKI o NFT confirmados, mostrar saldo, cupos, créditos y avisos coherentes sin recargar; comprobaciones adicionales en segundo plano. | D12-3 · #421 / #419 | Implementación separada de PR450. La raíz exige reutilizar expectativas UKI y prueba NFT por identidad/operación, consultar Master+Credits aunque una pantalla no esté montada, y evitar declarar coherentes dos respuestas antiguas. Conserva gracia/créditos; no depende de validación humana. |

### Lotes de PR y propietarios

| Lote | Tarea | Rama y destino | Límites y entrega |
| --- | --- | --- | --- |
| D12-1 | **12-Sep · Partidas, ranking y premios**, tarea `01a095b4-c1c5-7591-979b-82bd2025c076` | `codex/doc12-game-settlement` → `staging` | Guardado/settlement, ranking, reserva y lectura de premios; contraste de O1 existente. #418 coordina y #423 recibe la evidencia de cierre. PR449 código `56462244` aceptado tras revisión de handshake y retries. Base staging incorporada; checks finales en coordinación antes de desplegar web y juego. |
| D12-2 | **12-Sep · Continuar depósito en Master**, tarea `01a095b2-dbc0-7460-b97b-fcced4dea445` | `codex/doc12-master-resume` → `staging` | PR447. Código `b882fe46` aceptado tras corregir los dos hallazgos de revisión; validación final raíz 272 suites/2378 tests. Integrada a staging `4d997fc8`; despliegue CI34697774329 terminado y SHA servido verificado. Worktree `c700`. |
| D12-3 | **12-Sep · Créditos y actualización de cupos**, tarea `01a095b3-7ec0-7280-8d5f-694bf44a18bc` | `codex/doc12-credit-coherence` → `staging` | Créditos/cortes y coordinación compartida de saldo, cupos y avisos. Dueño del refresco global; D12-1/2 consumen su contrato. **En curso**, worktree `54f6`. PR450 se acota a C2 y avisos; O2 se entrega después en PR separada dentro de la misma tarea. Su contrato de expectativas/proyecciones está en revisión técnica. |
| D12-4 | **12-Sep · Hotfix de embajadores**, tarea `01a095b2-4772-7df0-afb8-db9254e56135` | `codex/doc12-ambassadors-hotfix` desde `main`, después propagación a `staging` | PR448 integrada en main `cf08e813`. Revisión raíz y 173 suites/1510 tests del candidato `7509735d` correctos. Coolify1554 finalizada y health confirma main `cf08e813`. Diez respuestas200 de la invitación exacta y página200 verificadas. PR451 integrada a staging `2c7a3882`; CI34698620345 en curso. Worktree `2b5e`. |

Cada tarea usa Luna Max y entrega una PR con reproducción, cambios y pruebas
focales. El coordinador conserva la revisión, los checks completos por candidato,
el orden de integración y la verificación servida. Los cambios en archivos
compartidos tienen un único propietario; cualquier ampliación de ese límite se
coordina antes de editar. Las entregas al mismo entorno se serializan.

Seguimiento de esta revisión activo cada 30 minutos mediante
`coordinar-pruebas-cukies-12-sep`, con avisos de avances materiales. Se elimina
cuando la entrega técnica esté completada o solo queden comprobaciones humanas;
no mantiene abiertos los encargos anteriores por una validación indefinida.

Se mantienen los ciclos de 1800 segundos, el umbral de 20000 UKI y la matriz de
partidas originales 2/4/6/8/10/12, segunda generación 1/2/3/4/5/6. Los ejemplos
del documento no cambian las reglas de cupos, gracia ni caducidad. Staging no
requiere recuperar partidas, créditos o premios antiguos. CI/CD, contratos,
destinos de datos y firmas personales quedan fuera de estos encargos.

## Programa del documento actualizado del 11 de septiembre

Registro del corte anterior. Para los puntos nuevamente reportados, prevalecen
la tabla del 12 y sus encargos; este historial conserva los parches y límites de
verificación previos sin presentarlos como una nueva confirmación de producto.

Fuente recibida: `cambios actualizado (11-Sept).docx`, SHA-256
`e1132a57a6842f4a00aaf5fd3d52bbddeba4b61f9430c058e52f3c76811d5d8b`.
Se revisaron el texto completo y las **15 capturas**, con **18 observaciones**
agrupadas en **siete PR previstas**. La [extracción de requisitos](evidence/2026-09-11-document-intake.json)
conserva la correspondencia exacta entre observación, bloque, captura e issue;
no mantiene otro estado ni modifica el Word.

**Decisión del usuario del 11 de septiembre: staging no requiere recuperación
histórica.** Se corrige la causa y se comprueba que las operaciones y los
periodos nuevos funcionen desde el arreglo. Las pruebas fallidas anteriores
no son deuda que deba recuperarse ni un bloqueo de entrega. Se cancelan censos
para recuperación, compensaciones, acreditaciones retroactivas, backfills de
partidas/cortes y el uso de `recover_late_settlement`. Los datos antiguos se
conservan únicamente como evidencia de diagnóstico; esta decisión no ordena
borrarlos ni modifica el tratamiento de producción.

**Decisión del usuario del 12 de septiembre: pausar la coordinación de cada
30 minutos cuando todos los cambios estén integrados y desplegados.** Antes de
pausarla se comprueban las versiones servidas y las entregas pendientes. Las
pruebas manuales, partidas nuevas o cobros personales pendientes no prolongan
la coordinación si la implementación y el despliegue están terminados. Los
puntos con diagnóstico, definición o implementación pendientes siguen abiertos;
no se dan por terminados para forzar la pausa.

Esta sección es el estado vigente de este lote y amplía las filas **3, 4 y 5**.
Los cierres anteriores solo acreditan su alcance y fecha: no resuelven por sí
solos los nuevos síntomas. El censo de custodia de las 07:29 UTC es histórico;
el usuario ha retirado NFTs después y se comprobará de nuevo por identidad.
El alias de competición y el nombre público general son fuentes distintas;
no se supone una relación entre ambos sin verificarla.

Historial de entregas del **11 de septiembre de 2026**; la tabla inferior recoge
el estado vigente. PR426 está
servida en producción; PR428, PR425 y PR427 están integradas y servidas en
staging. PR427 no ha ejecutado recuperación ni acreditado UKI. L2 entregó
PR430, revisada para R1/C1/C2 y aún parcial en R2; PR429 se integró
en staging `0ca4c8e` tras272suites/2301tests, lint y tipos correctos.
Su despliegue CI34618773937 terminó correctamente; postflight16:02UTC
acredita SHA servido y readiness200. PR430 está integrada en6e63ca5,
CI34619798496SUCCESS y postflight16:16UTC correctos. PR431 está integrada
y servida en419371f: CI34621416333SUCCESS y postflight16:32UTC correctos,
tras272suites/2312tests/lint/tipos. Limita la activación futura por inicio de
sesión exclusivamente en staging97, sin activar gates. Las tres entregas
reemplazaron solo DApp y conservaron los diez workers y82contenedores
protegidos. No quedan PR429/430/431 esperando integración. PR432 está integrada y servida en `50521eb3`; CI34628683317 y
postflight17:49UTC correctos. El corte NFT, detenido en09:00, avanzó
a17:30 con el primer tick del nuevo despliegue a17:48:40; permanecen
los tres dead letters de Transfer. Ambas rutas abrieron también el corte18:00.
PR433 está integrada y servida en `c82498be`, tras revisión y272suites/2342tests;
CI34630108075SUCCESS y postflight18:09UTC verifican readiness200, journal limpio,
solo DApp reemplazada, diez workers y82contenedores protegidos conservados.
L4 entregó [PR434](https://github.com/fgomezserna/cukies-hub/pull/434):
la revisión rechazó la selección histórica por createdAt y luego la inanición
de colas por planes terminados y límites previos. La corrección `c56eea10`
superó la reproducción independiente de esos casos: históricos intactos,
periodos nuevos alcanzables y reanudación del plan pendiente sin alterar hashes.
El ranking incorpora `3f419b35`, con frontera y calendario de la regla sucesora.
La raíz integró ambos en `2e13c72c` y la misma variable en Compose web/workers.
Gate conjunto correcto:272suites/2352tests,lint/tipos,31tests de publisher,
22de schedulers y4de Compose; generación de Compose coherente.
PR434 está integrada y servida en75d8cc8f; CI34635473631SUCCESS y
postflight19:30:47UTC: readiness200, journal limpio, diez workers sin reinicios,
clave solo en publisher y81contenedores protegidos conservados. Se reconstruyeron
las ocho imágenes del manifiesto; World runtime permaneceOFF.
El control de PR34635143169 pasó. T configurada en ambas apps:2026-09-11T20:30:00.000Z (22:30Andorra).
Web1546 y workers1547 terminaron. Postflight19:45UTC verifica la configuración,
readiness, imágenes conservadas y82contenedores protegidos (incluido juego31).
Partidas, Pool, contabilidad y publicador tienen heartbeat success; publicador idle.
Las ocho colecciones financieras seleccionadas mantienen sus conteos/hashes previos.
Durante la primera activación, ranking devolvía409 al esperar el primer periodo completo. Corrección en
`codex/doc11-ranking-forward-waiting`, sin cambiar T ni recuperar el pasado.
Corrección revisada en `d9294c2f`, integrada en `c2374837`: espera explícita hasta
00:02:30UTC del12Sep, sin crear cierres; mantiene los conflictos reales.
Validación:272suites/2357tests,16tests focales de ranking y18de API,lint/tipos PASS.
PR435 integrada y servida en987729bf, CI34642459565SUCCESS; control de PR34642340413 correcto.
Baseline19:56UTC preserva web75d8cc8f y93contenedores.
Postflight2026-09-11T20:19:41.182877+00:00: readiness200, cinco heartbeats correctos,
ranking waiting con0cierres y readyAt00:02:30UTC del12Sep. Solo DApp cambia;
diez workers, juego31 y82contenedores protegidos conservados. T permanece20:30UTC. Pool necesita conservar su
limpieza normal de leases/locks expirados; no recupera premios históricos.
L6 terminó el diagnóstico sin parche nuevo; A1 permanece abierto. L7 se reactiva
el12-Sep tras la aclaración expresa del usuario: OWN y Pool comparten la matriz
diaria y la UX muestra el total de partidas del conjunto de Cukies elegibles.
La definición deja de ser un bloqueo; implementación, revisión y entrega siguen
pendientes. La automatización de coordinación cada30min está eliminada por
petición del usuario; esta activación puntual no la recrea.
Modelo de las siete: **Luna Max**, con revisión e integración
de **Astra Max** en la tarea raíz `01a07aec-6bc1-7203-8f43-357ed4b8931c`.
Último cambio de producto integrado y servido en staging: `8bfa143be7c8e7a017d54756d16c518b612f3965` (PR440);
verificación live: 2026-09-12T03:57:45.882443+00:00. La entrega documental anterior
PR439 tiene SHA `fcfd73b3f784362ce9f4b16383c710743df370ad` y conserva las imágenes;
main `d1a71495f83d16f6b22425f52e05ec5a2e8ea191` (PR426).
Producción: deploy1534 terminado a las14:01:08UTC. Staging: CI34607972412
correcto y postflight14:16UTC con readiness200, journal limpio, diez workers
sin cambios y82contenedores protegidos conservados. La clave de publicación
ya no está presente en web32 y permanece únicamente en publisher28; gates
financieros OFF y ciclos1800s. [Entrega y límites](evidence/2026-09-11-ambassadors-hotfix-production.json).

Revisión registrada en [PR425](https://github.com/fgomezserna/cukies-hub/pull/425#issuecomment-5634965800)
y [PR426](https://github.com/fgomezserna/cukies-hub/pull/426#issuecomment-5634966184).
L1 conserva locks, distingue vault/epoch y compara el bloque RPC con la
proyección antes de liberar custodia; deposit/exit consultan estado actual.
L6 ya espera el resumen antes de consultar invitaciones autenticadas.
[PR427](https://github.com/fgomezserna/cukies-hub/pull/427#issuecomment-5635807059)
incorporó un plan protegido por runtime y hashes completos. Queda como código
integrado sin aplicar: el usuario ha cancelado la recuperación histórica.
CI34611669131 terminó correctamente. Postflight15:08UTC: SHA servido y
readiness200, journal limpio, diez workers sin cambios,82contenedores
protegidos conservados y producción `d1a7149`. El funcionamiento normal de
partidas nuevas sigue pendiente de comprobar; este despliegue no lo acredita.
El sondeo productivo de las14:02UTC sí reprodujo A1:
`cw-56918691f339` devuelve503 `AMBASSADOR_ELIGIBILITY_UNAVAILABLE` tanto en
origen como en público. Los errores ya son privados/no-store. La UX conserva
la invitación y permite reintentar. La lectura posterior del mismo artefacto
devuelve404 y acredita que ese patrocinador no alcanza el requisito actual.
La hipótesis de un error legacy/custodial quedó descartada al contrastar el
bundle; tampoco se pudo probar la causa del503 histórico por falta de log del
catch. RPC transitorio es solo una hipótesis. La rama
`codex/doc11-ambassadors-eligibility` queda limpia, sin PR. A1 necesita un
enlace actualmente elegible e instrumentación focal si vuelve a fallar.
[Diagnóstico y límites](evidence/2026-09-11-ambassadors-a1-diagnostic.json).

**Primera semana nueva verificada el 12 de septiembre, 00:14 UTC.** El periodo
`C1800-W:2026-09-11T20:30:00.000Z` termina a las00:00UTC; el ranking se selló
a las00:03:28 y su contabilidad a las00:05:32. Existe un solo manifiesto, run,
estado de periodo y evento de sellado. Las dos entradas del primer tick son el
cierre y la relectura idempotente de las mismas identidades; no son dos semanas
ni recuperación histórica. Coinciden los hashes recalculados de manifiesto,
run, audit y contabilidad semanal. Los siete cierres diarios están incluidos.
El periodo está vacío: cero participantes, ganadores, asignaciones y claims;
no acredita todavía una recompensa personal o su cobro. [Evidencia y límites](evidence/2026-09-11-doc11-forward-rewards-delivery.json).

**Seguimiento del segundo cierre, 12 de septiembre, 03:34 UTC.** Los ticks
03:30–03:32 registraron tres `DOMAIN_CONFLICT`; el siguiente cerró el periodo
`C1800-W:2026-09-12T00:00:00.000Z` a las03:33. La espera introducida en PR435
solo contempla el primer periodo forward. Se prepara una corrección acotada
en `codex/doc11-weekly-close-wait` para esperar también el retardo de cada
candidato posterior, conservando validaciones, frontera y calendario. El
diagnóstico de solo lectura confirma la coincidencia con el retardo de150s;
el cuerpo exacto del409 no queda registrado en el scheduler. La regresión y
el parche están validados: dos suites focales/16tests, 272suites/2358tests de
DApp, lint y tipos correctos. [PR440](https://github.com/fgomezserna/cukies-hub/pull/440)
integrada y servida en `8bfa143b`, CI34671318138SUCCESS. Postflight03:57:45UTC:
health/ready200, journal limpio y cinco procesos correctos, con un tick de
ranking posterior al arranque de la nueva web. Solo cambia DApp:92de93
contenedores y7de8componentes conservados; diez workers y producción intactos.
La siguiente ventana natural de espera y una partida/premio personales aún no
se han observado; la frontera exacta está cubierta por la regresión.
[Diagnóstico, validación y entrega](evidence/2026-09-11-doc11-forward-rewards-delivery.json).

### Estado por observación del documento

Tabla canónica de las18observaciones; se conserva completa en cada feedback.
La evidencia detallada y las tareas propietarias se enlazan en los lotes siguientes.

| Punto | Alcance | Estado real | Falta por comprobar o decidir |
| --- | --- | --- | --- |
| R1 | Intentos en Resumen | Desplegado · PR430 | Comprobar con sesión iniciada. |
| R2 | Avisos en Resumen | Corrección de fuente desplegada · PR432 | Comprobar el resultado visual autenticado. |
| J1 | Bote en Jugar | Corrección desplegada · PR440; nuevo diagnóstico técnico abierto el 12-Sep 12:24 UTC | Ranking devuelve HTTP 409, 110 fallos consecutivos y último éxito 10:31 UTC. L4 investiga el motivo y su efecto en periodos nuevos; no es solo QA humana. [Evidencia](evidence/2026-09-12-own-cukie-quota.json). |
| J2 | Alias | Desplegado · PR429 | Guardar y recargar con sesión. |
| J3 | Reparto | Lector canónico corregido y desplegado · PR43752684bb8 ·21:47UTC | Validación autenticada del reparto de una partida nueva. |
| M1 | Master tras retirar del Pool | Desplegado · PR425 | Operación posterior al parche y convergencia autenticada. |
| M2 | Originales elegibles | Desplegado · PR425 | Comprobar selección autenticada. |
| C1 | Cuatro indicadores de créditos | Desplegado · PR430 | Comprobar indicadores con sesión. |
| C2 | Cortes de créditos | Procesamiento UKI/NFT verificado · PR432 | Concesión nueva a wallet elegible y UX autenticada. |
| P1 | Depósito del Pool atascado | Desplegado · PR425 | Depósito nuevo posterior al arreglo. |
| W1 | UKI por partida | Proceso verificado; frontera20:30UTC | Partida nueva iniciada desde la frontera y recompensa. |
| W2 | Recompensa del prestador | Proceso verificado; reparto sin verificar | Atribución a los prestadores reales y reparto nuevos. |
| W3 | Premios por periodo y cobro | Diarios publicados y primer semanal vacío verificados; nuevo error 409 del ranking en investigación | Determinar bloqueo del cierre semanal nuevo. La partida, reparto y cobro personales siguen sin verificar. [Evidencia 12-Sep](evidence/2026-09-12-own-cukie-quota.json). |
| A1 | Invitación válida intermitente | Diagnóstico abierto | Causa del503 sin demostrar; reproducir con sponsor elegible. |
| A2 | Aviso tras confirmar embajador | Desplegado main426/staging428 | Comprobación positiva autenticada. |
| A3 | Nombre y wallet del embajador | Desplegado main426/staging428 | Comprobación positiva autenticada. |
| O1 | Partidas diarias disponibles con Cukies propios elegibles | Desplegado · [PR442](https://github.com/fgomezserna/cukies-hub/pull/442) `44ff9e7c` · 12-Sep 12:24 UTC | 2368 tests, tipos, lint y Mongo real correctos. Web e indexador servidos, health/ready 200; consulta real: al menos 62 partidas de 11 Cukies y 1 pendiente. Contador visible en desktop y móvil; falta observar una partida personal y su consumo. [Evidencia](evidence/2026-09-12-own-cukie-quota.json). |
| O2 | Actualización de saldo UKI, cupos y avisos tras staking o retirada | Corrección parcial desplegada · PR425; alcance aclarado el 12-Sep | Comprobar que una operación nueva confirmada actualiza saldo, estado de cupos y aviso coherentemente, sin recargar. PR425 evita mostrar cupos/umbrales obsoletos durante el recálculo; no acredita el recorrido completo. La prueba del 11-Sep carecía de sesión (API 401). Verificación técnica a cargo de L1/coordinador; no falta una decisión del usuario ni puede darse por resuelto. |

| Lote | Cobertura y resultado exigido | Issue y tarea responsable | Estado, rama y destino |
| --- | --- | --- | --- |
| L1 | M1, M2, P1, O2: custodia entre Master/Pool/Mis Cukies, elegibilidad de Originales y convergencia tras recibo. | [#419](https://github.com/fgomezserna/cukies-hub/issues/419) · **11-Sep · Custodia y actualización de Cukies**, tarea `01a09068-1787-7a20-a4bf-c2c2b28f5586` | [PR425](https://github.com/fgomezserna/cukies-hub/pull/425) publicada en staging `f4134d7`, CI34609723488SUCCESS; postflight14:33UTC, readiness200, journal limpio,10workers y82protegidos intactos.271suites/2282tests/lint/tipos/build correctos. A las14:36UTC, bloque130424039:11NFT en wallet,98000007 en Pool,0Master; Mongo concuerda sin solapamiento. M1/M2/P1: parches desplegados; falta comprobar una operación NUEVA y la convergencia autenticada. O2 es parcial: se ocultan cupos/umbrales obsoletos, pero no está acreditada la actualización conjunta de saldo, cupos y aviso. No cambiar el umbral de20000UKI por el ejemplo25000→5000. No se exige recuperar pending histórico. [Evidencia](evidence/2026-09-11-doc11-custody-delivery.json). Rama `codex/doc11-custody-refresh` integrada. |
| L2 | R1, R2, C1, C2: intentos obsoletos, avisos de Resumen, cuatro indicadores de créditos y finalización de nuevos cortes. | [#421](https://github.com/fgomezserna/cukies-hub/issues/421) · **11-Sep · Créditos y datos de Resumen**, tarea `01a09068-7652-7c61-86e8-cccc3647b589` | [PR430](https://github.com/fgomezserna/cukies-hub/pull/430), `b7e7d54`, en integración con staging0ca4c8e: R1/C1 implementados, navegación conservada y C2 avanza al corte actual de testnet sin alterar el catch-up diario de producción. Revisión raíz añade2c602df para conservar grantedCredits cuando la proyección está obsoleta;114tests focales correctos. Combinado d61a85a validado con272suites/2309tests/lint/tipos; merge6e63ca5 servido, CI34619798496SUCCESS y postflight16:16UTC:readiness200/journal limpio/soloDApp/10workers y82protegidos conservados. R1/C1 desplegados con QA autenticada pendiente. [Evidencia](evidence/2026-09-11-doc11-alias-credits-delivery.json). R2/C2: sonda16:02UTC acredita UKI abierto16:00, NFT detenido09:00 por SOURCE_UNHEALTHY/CHAIN_DEAD_LETTERS_OPEN/CHAIN_EVENTS_NOT_PROJECTED. PR432 en `codex/doc11-credit-source-health` corrige la fuente actual; P1 del predicado y aislamiento de metadata corregidos en0cea45df; revisión raíz aceptada y gate final correcto:272suites/2334tests/lint/tipos. Integrada y servida50521eb3; CI34628683317SUCCESS y postflight17:49UTC correctos. Corte NFT nuevo17:30 abierto a17:48:40, tres dead letters conservados. Falta verificar acreditación con cupos elegibles y UX autenticada. [Evidencia](evidence/2026-09-11-doc11-credits-source-delivery.json). No reparar ni compensar cortes antiguos. PR430 usa Refs421 y no cierra el lote por esos cambios parciales. `codex/doc11-credits-summary` → `staging`. Consume L1; créditos separados de UKI/L4. |
| L3 | J2: guardar y volver a leer el alias del perfil con sesión válida. | [#422](https://github.com/fgomezserna/cukies-hub/issues/422) · **Implement weekly Treasure Hunt alias scope**, tarea `01a09068-a8af-79e0-877d-228e413065a1` | [PR429](https://github.com/fgomezserna/cukies-hub/pull/429), corrección `b351a44` revisada y aceptada: GET sin renombrar el ranking, fallback personalizado y PATCH semanal. Integrada el11-Sept15:53UTC en staging0ca4c8e,272suites/2301tests/lint/tipos correctos. CI34618773937SUCCESS y postflight16:02UTC: SHA/readiness200, journal limpio,10workers y82protegidos conservados. QA autenticada pendiente por timeout al seleccionar la pestaña. [Evidencia](evidence/2026-09-11-doc11-alias-credits-delivery.json). `codex/doc11-profile-alias` → `staging`. La raíz incorpora esta decisión de alcance en el mismo carril documental. |
| L4 | J1, W1, W2: reserva del bote, UKI directo y reparto a los prestadores reales en partidas NUEVAS. | [#418](https://github.com/fgomezserna/cukies-hub/issues/418) · **11-Sep · Recompensas y bote semanal**, tarea `01a09068-e5f9-7a01-838b-82f98da5a5a2` | **12-Sep 12:24 UTC:** reactivado diagnóstico acotado de `WEEKLY_RANKING_TICK_HTTP_409`: 110 fallos consecutivos, último éxito 10:31:40 UTC, candidato esperando hasta 10:32:30 UTC. Los otros cuatro procesos económicos están correctos. No aplicar recuperación ni mover la frontera; determinar causa antes de corregir. [Evidencia](evidence/2026-09-12-own-cukie-quota.json). **12-Sep03:57UTC:** ajuste de coordinación PR4408bfa143b servido; espera de cada candidato forward validada con272suites/2358tests y tick posterior al despliegue correcto, sin cambiar retardo ni frontera. **12-Sep00:14UTC:** primer ranking semanal vacío sellado a00:03:28, con un solo manifiesto/run/estado y hashes verificados. El replay reutiliza las mismas identidades; la partida nueva y el reparto a prestadores siguen pendientes. [PR427](https://github.com/fgomezserna/cukies-hub/pull/427) integrada y servida en staging `bf34f17`, CI34611669131SUCCESS, postflight15:08UTC correcto;271suites/2291tests/lint/tipos previos. Recuperación histórica CANCELADA, nunca aplicada. [PR431](https://github.com/fgomezserna/cukies-hub/pull/431),5350b08, revisión raíz aceptada: límite por inicio canónico de sesión exclusivamente staging97; producción conserva su comportamiento.272suites/2312tests/lint/tipos correctos; merge419371f servido, CI34621416333SUCCESS y postflight16:32UTC:readiness200/journal limpio/soloDApp/10workers y82protegidos conservados. GatesOFF; activación, partida nueva, atribución al prestador y reparto siguen pendientes. Lectura on-chain16:23UTC confirma0UKIlibres y7.5UKIreservados en distributor97; preparar financiación exacta del primer lote NUEVO sin consumir reservas anteriores. [Evidencia](evidence/2026-09-11-doc11-alias-credits-delivery.json). No exigir censo histórico, apply ni asignaciones retroactivas. L4 entregó [PR434](https://github.com/fgomezserna/cukies-hub/pull/434),correcciónc56eea10; revisión independiente PASS para periodo canónico, cola sin inanición y reanudación inmutable. Ranking3f419b35 y propagación de la frontera integrados en2e13c72c. Gate conjunto:272suites/2352tests,lint/tipos,31publisher,22schedulers y4Compose PASS. Integrada y servida75d8cc8f; CI34635473631SUCCESS y postflight19:30:47UTC con10workers saludables,81protegidos conservados y gatesOFF. T configurada20:30UTC; web1546/workers1547 terminados. PR435987729bf sirve la corrección de espera; CI34642459565SUCCESS. Cinco procesos verificados; ranking waiting con cero cierres hasta00:02:30UTC del12Sep. Diez workers y82contenedores protegidos conservados; solo DApp cambió. Ocho colecciones financieras sin cambios antes deT. No cambiar esa frontera. [Revisión y validación](evidence/2026-09-11-doc11-forward-rewards-delivery.json). La activación se alinea con un periodo diario y semanal completo, sin recuperar el historial. |
| L5 | J3, W3: cierre de un periodo NUEVO, publicación, estado del premio y disponibilidad para cobrar. | [#423](https://github.com/fgomezserna/cukies-hub/issues/423) · **11-Sep · Cierre y cobro de premios**, tarea `01a09069-25af-7e12-9a37-7054fdc8dcac` | **12-Sep00:14UTC:** primer accounting semanal sellado a00:05:32 y hash canónico verificado; siete diarios, cero asignaciones/claims y ningún plan semanal. El cobro personal sigue pendiente. **Actualización21:48UTC del11Sep:** [PR437](https://github.com/fgomezserna/cukies-hub/pull/437) servida52684bb8, CI34649628143SUCCESS; publicador y lector verifican ambassadorSnapshots como el writer.272suites/2358tests/lint/tipos y32publisher correctos; cinco procesos success,10workers activos y82protegidos conservados. Primer diario20:30 completado, cierre/hash sellados intactos y tres recibos BSC97 verificados (400k tesorería,50k marketing/desarrollo,50k quema). Sin partidas nuevas ni claims personales; W1/W2/W3 funcionales siguen pendientes en ese alcance. [Evidencia](evidence/2026-09-11-doc11-forward-rewards-delivery.json). [PR433](https://github.com/fgomezserna/cukies-hub/pull/433),d843c74e: P1 multiwallet y P2 del total limitado a100claims corregidos; revisión independiente PASS,12tests focales y reproducciones multiwallet/101claims. Gate conjunto c12ed45f correcto:272suites/2342tests/lint/tipos. Integrada y servida c82498be; CI34630108075SUCCESS y postflight18:09UTC: readiness200, journal limpio, diez workers y82protegidos conservados. [Entrega](evidence/2026-09-11-doc11-rewards-state-delivery.json). Alcance: estados e importes canónicos, no activación del recorrido financiero. Consume allocations canónicas de partidas nuevas de L4; no depende de recuperar partidas o premios antiguos ni de aplicar PR427. Preparar orden de activación/publicación/claim y cálculo canónico del importe necesario para el primer lote NUEVO, pues el distributor tiene0UKIlibres en bloque130438381. La comprobación18:55:52UTC/bloque130458669 acredita493244946.3UKI y0.024154984BNB en el owner: el publicador aporta automáticamente el déficit exacto del lote; saldo libre0 no es por sí solo bloqueo. No se ha transferido nada. Rama `codex/doc11-rewards-publication` → `staging`. |
| L6 | A1, A2, A3: invitación válida, relación ya confirmada y nombre público del patrocinador. | [#424](https://github.com/fgomezserna/cukies-hub/issues/424) · **11-Sep · Hotfix de embajadores**, tarea `01a09068-3c90-7ff3-b7a5-16dac47d66c1` | [PR426](https://github.com/fgomezserna/cukies-hub/pull/426) publicada en main `d1a7149` y [PR428](https://github.com/fgomezserna/cukies-hub/pull/428) en staging `ecbf7b9`. Gates main173suites/1501tests/build y staging271/2259/lint/tipos correctos. A1:503 histórico y lectura posterior404/no elegible; diagnóstico termina sin RCA probada ni parche nuevo. Rama `codex/doc11-ambassadors-eligibility` limpia. A2/A3 cubiertos por regresiones; relación y nombre de sponsor elegible no acreditados por los sondeos live. |
| L7 | O1: total de partidas diarias restantes del conjunto de Cukies propios elegibles, con la misma matriz que el Pool. | [#412](https://github.com/fgomezserna/cukies-hub/issues/412) · **11-Sep · Partidas con Cukies propios**, tarea `01a09069-7cdf-71d1-b03d-5d246eacc44e` | Entregado en [PR442](https://github.com/fgomezserna/cukies-hub/pull/442), staging `44ff9e7c`, CI34692607989 SUCCESS a las 12:22 UTC. Código final: 272 suites / 2368 tests, lint, tipos, 16 tests de esquema e índices y Mongo real. Comprobación servida 12:24 UTC: DApp e indexador con el SHA esperado, readiness 200, journal limpio, producción y 82 contenedores protegidos conservados; ciclos de 1800 s. Consulta de solo lectura: al menos 62 partidas de 11 Cukies, 1 pendiente de comprobar. Contador visible en desktop y 384 px CSS sin desbordamiento, con wallet desconectada. La partida personal y el contador autenticado no se han ejercitado; no son trabajo de implementación pendiente. El postflight global detecta un error de ranking anterior a la entrega, reenviado a L4; no se declara toda la economía correcta. [Evidencia](evidence/2026-09-12-own-cukie-quota.json). |

### Dependencias, integración y comprobación

Revisión de L2 a las17:33UTC: [PR432](https://github.com/fgomezserna/cukies-hub/pull/432),
`0cea45df`, resuelve el predicado invertido y limita la excepción a
TOKEN_V2:Transfer. Metadata, eventos desconocidos y eventos del vault sin
beneficiario conservan bloqueo; la revisión raíz acepta este alcance. Gate
final correcto:272suites/2334tests, lint y tipos. Integrada50521eb3;
CI34628683317SUCCESS y postflight17:49UTC acreditan SHA servido,
readiness200, journal limpio, diez workers sin cambios y82contenedores
protegidos conservados. El tick normal de17:48:40 abrió el corte NFT17:30,
sin recrear los cortes intermedios desde09:00 ni tocar los tres dead letters.
Sonda18:01:57UTC: ambas rutas abrieron además el corte18:00; se conservan
los tres dead letters y no hay pendientes de aplicación. C2 tiene continuidad
del proceso observada; falta comprobar la acreditación con cupos
elegibles y la UX autenticada de R2. [Evidencia](evidence/2026-09-11-doc11-credits-source-delivery.json).

Revisión independiente de L5 a las17:33UTC: [PR433](https://github.com/fgomezserna/cukies-hub/pull/433),
`d843c74e`, revisión independiente PASS tras corregir P1 multiwallet y P2
del total de claims truncado a100;12tests focales y reproducciones independientes
con dos beneficiarios y101claims. Conserva detección de datos corruptos fuera
de la página visible. El combinado c12ed45f con staging50521eb3 pasó272suites/2342tests, lint y tipos. La entrega previa91456a9b fue rechazada con ambos casos
reproducidos. El alcance real es estado/presentación canónica de premios;
no acredita cierre, financiación, publicación ni cobro live. Integrada y servida
en c82498be; CI34630108075SUCCESS y postflight18:09UTC correctos.
[Entrega](evidence/2026-09-11-doc11-rewards-state-delivery.json).

- L2 y L5 han terminado sus correcciones;432y433ya están servidas.
  L1 completó su pasada LIVE de solo lectura y acotó el
  consumidor del catálogo público; no firmó ni mutó la cuenta.
  A17:45UTC, bloque130449097, Master no tiene posiciones98000001..12;
  Pool tiene98000007 y los demás están en wallet. Ese depósito es de10:02UTC,
  anterior al parche425: no acredita una operación nueva tras el arreglo.
  Las APIs autenticadas devolvieron401 en la sesión disponible; M1/M2/P1/O2
  conservan la QA autenticada pendiente.
  Su catálogo público legacy no es fuente operativa de esas cuatro pantallas.
  Bridge sí lo consume sin revalidar ownerOf antes de preparar la acción;
  es un hallazgo de código, sin afirmar el modo live. Seguimiento registrado
  en [issue419](https://github.com/fgomezserna/cukies-hub/issues/419#issuecomment-5638555984).
  PR434 ya superó la revisión focal en c56eea10: rechaza periodos anteriores,
  salta planes completed/blocked y alcanza periodos nuevos detrás de50cierres
  o1000planes históricos. La reanudación conserva hashes, operaciones y destinos.
  El ranking3f419b35 usa el primer periodo completo y el calendario de su regla
  sucesora; producción conserva el catch-up. Ambos están integrados y validados
  en2e13c72c. La raíz entrega el código y prepara en paralelo la activación
  con frontera futura alineada; gatesOFF hasta concretarla. No se requiere
  reescribir el historial del Pool ni financiar reservas anteriores.
  La revisión Astra independiente de433 terminó sin hallazgos pendientes.
  L1 tiene pendiente validar operaciones nuevas en el
  producto servido. L5 consume los resultados canónicos nuevos de L4. L7 está
  activada tras la aclaración de producto del12-Sep y posee los archivos de
  disponibilidad OWN; L4 ya entregó su alcance. Una dependencia
  no detiene otro lote independiente.
- Una tarea en cola no es trabajo terminado: la raíz debe activarla con la base
  actual, revisar su PR, resolver hallazgos y llevarla a la entrega autorizada.
  Un borrador o tests verdes tampoco equivalen a corrección publicada.
- L1 posee fuentes de custodia, pending operations y aviso/refresco global.
  L2 posee Dashboard, créditos y su materialización. L3 escribe el alias;
  L6 lee identidad pública de patrocinadores. L4 produce la contabilidad de
  partidas y reserva; L5 consume cierres, publicación y claim. L7 posee la cuota
  OWN. Cualquier archivo compartido exige coordinar al dueño antes de editar.
- La raíz conserva CI, Compose, Nx, lockfile, runtime y esta tabla. No adelantar
  staging mientras una entrega esté en su guarda final. Mantener las imágenes
  y contenedores que no cambien, y verificar SHA servido, readiness y recorrido
  funcional después de cada entrega.
- L6 es un **hotfix aislado desde main, seguido de propagación a staging**,
  autorizado por el usuario. No promociona las otras mejoras ni PR361 a
  producción. Las demás PR se entregan a staging.
- El cambio de 30 a 15 minutos permanece **cancelado**: conservar 1800s. No alterar
  periodos sellados, reescribir fuentes históricas ni repetir el backfill del
  ranking #414/PR415.
- Finanzas L4/L5: los gates siguen OFF en el postflight16:32UTC. La lectura
  on-chain de16:23:42UTC, chain97/bloque130438381, confirma distributor sin
  saldo libre y7.5UKIreservados; no se financió ni firmó ninguna operación. Preparar
  la configuración mínima para que las NUEVAS partidas y periodos recorran
  settlement, cierre, publicación y claim. Inspección17:25UTC: PR431 limita
  settlement, pero closeNextDaily/nextWeeklyPeriod y el preparador/publicador
  todavía seleccionan pendientes anteriores sin frontera futura. Completar
  ese aislamiento antes de activar; conservar reglas, caps y ciclos1800s. La raíz revisa límites, roles y
  efectos de la operación antes de activar o financiar; evitar que esa
  activación drene pendientes históricos. No exige recuperar pruebas antiguas
  ni prepara otro plan de recuperación. Un draft o un gate desactivado no
  acreditan el flujo funcionando.
- El parche sin terminar de #419 está conservado sin tocar su worktree
  original; L1 lo integra en su nuevo worktree y completa los casos de lectura
  parcial, cambio de identidad y deep link. Se conserva también PR420 de
  evidencia, que registra pendientes reales sin esperar al cierre futuro de L1.

Criterio de entrega por lote: código y causa contrastados, regresiones focales,
revisión de raíz, PR integrada en el destino correcto y evidencia de producto
servido con UTC/SHA/alcance. Si el bloqueo es runtime o una decisión, registrar
la operación o decisión precisa; no cerrar la issue como resuelta.

## Cobertura histórica del 9 de septiembre y requisitos adicionales

El [apéndice de cobertura del 9 de septiembre](antes-del-15-cobertura-cambios-20260909.md)
reconcilia las cinco páginas, 23 párrafos y cinco capturas de `cambios actualizado.docx`
y los requisitos adicionales de venta, contratos Legacy y Marketplace V2:
16 puntos originales, tres adicionales y 94 comprobaciones atómicas. Los IDs del
apéndice son localizadores de evidencia; las filas anteriores conservan el estado
canónico y los responsables. No constituye otro backlog ni reabre cierres de
alcance limitado por falta de una prueba adicional.

- Filas **3 y 5**: los 5.400 créditos tienen correspondencia contable documentada
  en la fila 3; falta atribuir la captura y verificar el intento de juego,
  la continuidad de staking tras aprobación y la secuencia
  UKI → cupo → créditos. La custodia de los NFTs 98000001/003/004 ya está acreditada;
  su retirada y experiencia de Pool se siguen en el bloque de PR355 existente.
  El resumen de Mis Cukies aún usa ceros mientras su fuente es desconocida.
- Filas **2A-C y 5**: el P2 de PR359 se corrigió y quedó publicado mediante PR366 (2026-09-10):
  origen de anuncio y destinos de publicación separados; colección original BSC56
  conserva acceso UKI cuando la configuración exacta lo permite. Revisión del
  coordinador superada y gates del lote final verificados; la QA conserva colección/red del enlace y mantiene V2 cerrado por configuración, sin acreditar una venta positiva.
  El contrato V2 cubre precio/cobro UKI,
  conversión de la parte del vendedor y fee en moneda de entrada; su UI solo
  contempla UKI/BNB/USDT y Stage responde `UKI_MARKETPLACE_UNAVAILABLE`. No se
  certifica operación V2 en Stage ni producción. La fee BNB queda acreditada
  hasta su retirada; no equivale a cobro inmediato.
- Filas **D, 1, post1, post2 y 5**: Bridge/Crías/Points están publicados en la navegación
  común. Bridge Legacy MAINNET desde Stage está servido en modo lectura mediante367;
  el worker de eventos Legacy y el relayer no están activos. La paridad de
  Points/Breeding y la identidad contractual Bread siguen pendientes. El objetivo
  conserva los mismos contratos Legacy mainnet en Stage y producción, con datos
  y cursores separados; no autoriza redespliegues Legacy ni activación de relayers.
- Fila **C/5**: la captura del tótem corresponde a Treasure Hunt/Sybil Slayer, de
  este monorepo. Los assets actuales responden correctamente; falta reproducir
  el render móvil y el recorrido del selector antiguo. No se atribuye a Unreal.
- Fila **4**: conservar PR351/352, la migración y la herramienta administrativa.
  La publicación y las pruebas económicas tienen su propio cierre. Los ejemplos
  5%/2% y segundo nivel al 3% son únicamente viabilidad futura.

Evidencia: [inventario, referencias Git y sondas de esta auditoría](evidence/2026-09-09-cambios-docx-audit.json)
y [assets del juego](evidence/2026-09-09-game-docx-probes.json). No se ejecutaron
transacciones, escrituras de datos, despliegues ni cierres de issues durante la auditoría.

## Definicion de cerrado por punto

Un punto solo pasa a cerrado cuando constan las cuatro evidencias que le
correspondan:

1. Requisito funcional contrastado con la fuente vigente.
2. Implementacion y gates locales Stage/Testnet verdes.
3. Despliegue del SHA exacto en Stage y smoke real: contratos nuevos en testnet;
   contratos legacy existentes con fuentes mainnet y destino de datos Stage.
4. Notas de promocion a produccion, incluyendo configuracion, seguridad,
   operaciones, observabilidad y rollback.

Si el punto mueve valor on-chain, se exige ademas recibo, address, bloque,
runtime code hash y evidencia del indexador. Si escribe economia off-chain, se
exige idempotencia, reconciliacion y aislamiento de base.

## Procedimiento para futuros despliegues Stage

Plantilla de validacion por lote; las casillas no representan el estado actual
de los puntos ya desplegados o en pruebas.

- [ ] Congelar el lote exacto de commits que se va a desplegar; no desplegar por
  inercia todo el acumulado local sin revisar su alcance.
- [ ] Revisar `git diff origin/staging...<release-candidate>` y separar cualquier
  trabajo que no sea necesario para esta entrega.
- [ ] Ejecutar los gates locales del lote sobre Mongo local replica set
  `127.0.0.1:37018`: nueva economia BSC `97`, legacy BSC `56`/TRON mainnet
  mediante fixtures/replay y lecturas verificadas. Sin escrituras a produccion.
- [ ] Ejecutar lint, typecheck, tests y builds de DApp, indexer y cada juego
  afectado. Para cambios exclusivamente documentales, validar diff, referencias y
  coherencia; no repetir pruebas de producto.
- [ ] Validar `pnpm guard:staging:test` y `pnpm guard:staging` con UUID de Coolify
  `u4s804o4wwcckowgk0woo4wg`, rama `staging`, chain `97` y las tres bases Stage.
- [ ] Preparar backup/snapshot y plan de migracion antes de cualquier cambio de
  schema o backfill.
- [ ] Cargar secretos solo en Coolify; nunca en Git, logs o archivos generados.
- [ ] Mantener apagados publisher y schedulers que aun no tengan autoridad,
  funding o aprobacion operacional.
- [ ] Integrar un unico lote en `staging` y seguir el workflow de seis componentes
  (web32, lane `treasure-hunt` de app31 y workers app28); no lanzar un build manual
  ni activar autodeploy Git en Coolify. Comprobar el SHA de release en `/api/health`
  y cada digest contra el manifest, admitiendo `sourceSha` anterior cuando la imagen
  se reutiliza. App31 sigue siendo un recurso independiente fuera del Compose de
  workers, pero usa el mismo workflow. Verificar también health/ready del juego,
  su `gameCommit` y el `sourceSha` de su imagen.
- [ ] Comprobar `/api/health`, autenticacion administrativa de `/indexer`,
  cursores, dead letters, incidentes, heartbeats y logs de workers.
- [ ] Ejecutar smokes de wallet y UX en escritorio y movil; para acciones
  on-chain, usar exclusivamente wallet QA y tBNB autorizado.
- [ ] Registrar addresses, tx hashes, bloques, resultados, capturas y cualquier
  desviacion directamente en este seguimiento o en el runbook enlazado.
- [ ] Simular rollback de app/config. Para contratos, documentar pause/revoke y
  cambio de env: no asumir rollback on-chain.

## Checklist global para promover a produccion

- [ ] No promocionar mientras quede un punto critico `PARCIAL`, `BLOQUEADO` o
  sin smoke Stage aplicable.
- [ ] Congelar el SHA aprobado en Stage y revisar el diff de promocion hacia
  `main`; no mezclar otros cambios.
- [ ] Go/no-go explicito de tech lead, producto/QA y ops; sumar owner/multisig si
  hay contratos y comms/legal si cambia copy sensible.
- [ ] Sustituir todas las identidades Testnet por identidades Mainnet verificadas:
  chain `56`, contratos, start blocks, runtime hashes, explorers, tokens, routers,
  vaults, owners y wallets sink.
- [ ] Ejecutar los preflight mainnet en modo read-only y congelar manifest,
  config hashes, fechas UTC, presupuesto y reglas.
- [ ] Usar Safe/multisig y hardware wallets para ownership, funding y acciones
  irreversibles; no reutilizar claves de Testnet.
- [ ] Crear backups de bases de produccion y verificar migraciones/backfills con
  plan de vuelta aplicable a datos y app.
- [ ] Desplegar con feature flags y schedulers de riesgo apagados; habilitarlos
  de uno en uno tras observabilidad y smoke.
- [ ] Ejecutar smoke post-deploy sobre web, auth, indexador, workers, contratos y
  flujos de valor antes de comunicar disponibilidad.
- [ ] Registrar release/tag, SHA, aprobadores, contratos, transacciones,
  configuracion, resultados y rollback ejecutable.

## A. UKI en PancakeSwap

### Estado comprobado

Lectura live del `2026-09-07T16:50:13Z`, conservada en
[pancake-mainnet-20260907.json](../output/verification/pancake-mainnet-20260907.json).

- Pair ASM/UKI de BSC Mainnet:
  `0x40b315f31421b5D31DE018055Cb30f78265024Be`.
- Verificación RPC Mainnet live en el bloque `120529300`:
  - token0 UKI: `0x51646bc7A6359f88A79FDC8d7ACB735f1AbF67fA`;
  - token1 ASM: `0x707F0f4a39a4a26239F7D00463B15AB5656861f9`;
  - reservas: `1.148.104,487125773506027771 UKI` y
    `4.658,001439841752636269 ASM`;
  - suministro LP total: `73.070,219754849786296135 LP`; locker
    `73.070,219754849786295135 LP`, con `1000` raw en zero address;
  - locker: `0xb3E43944DF782EEeD9A99f0CFA4301c72b9629E6`, con
    `releasable=0` y desbloqueo el `2027-02-23T15:33:10Z`.
- Actividad on-chain acreditada en dos fechas separadas por mas de siete dias:
  [Swap del 31-08 a las 14:12:07 UTC](https://bscscan.com/tx/0xa4e7560505281ac5ad9e666997095090d42beea177b906fb4e201acf218ff251),
  bloque `119165282`, y
  [Swap del 07-09 a las 16:16:27 UTC](https://bscscan.com/tx/0x00cfad4b08522c3c0d0926224e97951b48f1c1a31d3cee78d678c51888433a61),
  bloque `120524799`. No implica actividad ininterrumpida.
- Pair ASM/UKI de BSC Testnet:
  `0x8fa397B4E1DED911161f13C128DF369cE9a95B3A`.
- El verificador read-only es
  `pnpm --filter @cukies/contracts verify:testnet:pancake-liquidity`.
- La ruta Stage habilitable es ASM -> UKI.
- No hay pair directo WBNB/ASM ni WBNB/UKI, pero la ruta Mainnet
  WBNB -> USDT -> ASM -> UKI tiene quote observado; USDT -> ASM -> UKI tambien.
- USDC Mainnet sigue pendiente de verificacion explicita; no se deduce su ruta
  por la ausencia de un pair directo UKI/USDC.
- El asset de logo usado por la DApp es
  `dapp/public/brand/official/uki-token-cukies-world-coin.png`.
- PancakeSwap no ofrece un switch de metadata de Testnet dentro de este repo y
  sus listas no incluyen chain `97`. Logo y ficha del token de produccion son
  un proceso externo que no debe fingirse como completado desde codigo.

### Evidencia live incorporada y controles siguientes

- Verificados pair, tokens, reservas, locker y swaps en BSC Mainnet en el
  JSON fechado arriba; el LP custodiado es `totalSupply - 1000` de
  `MINIMUM_LIQUIDITY` y `releasable=0`.
- En cada revision del pool, registrar fecha/bloque, ambas reservas, ultimo
  `Swap`, `totalSupply`, balance del locker, `releasable` y fecha de unlock.
  Investigar discrepancias de custodia o desbloqueo y distinguir RPC caido de
  ausencia de operaciones. Este checklist no configura una automatizacion.
- Verificar por separado USDC, ya mencionado por el copy publico; ASM -> UKI,
  USDT -> ASM -> UKI y WBNB -> USDT -> ASM -> UKI tienen quote observado.
- Comprobar logo/ficha de PancakeSwap Mainnet y guardar enlace o captura; esta
  lectura RPC no acredita su estado. Verificar tambien la presentacion y el
  enlace de compra de la portada tras cualquier cambio de rutas.

## B. Staking de UKI simplificado

### Estado vigente y alcance

El usuario confirma que el staking y el torneo post-preventa funcionan. El
nombre de producto vigente es **Torneo Lanzamiento UKI** (el codigo usa
`TREASURE_HUNT_LAUNCH_TOURNAMENT_NAME`); no debe confundirse con el torneo de
compradores de preventa ya cerrado. La API publica se observo activa en Mainnet
el `2026-09-07T16:50:56Z`; que no incluya identidad de participante no invalida
el estado funcional confirmado.

La [API de competicion](https://cukies.world/api/games/treasure-hunt/competition)
respondio HTTP `200`, `configured=true`, `enabled=true`, `phase=active`,
campaña `uki-staking-mainnet-2026-08`, elegibilidad `uki_staking`, chain `56`,
contrato `0xad18ff665e99d0033c3bb9d73182c2b03df59696` y `2.000 UKI` por intento.
Ventana: `2026-08-27T13:13:00Z` a `2026-09-15T15:00:00Z`. Su campo tecnico
`mode=presale_competition` no cambia el nombre de producto. Fue una lectura sin
participante autenticado, no una nueva operacion de staking firmada.

- `/cukie-master` se centra en staking UKI y creditos de la ruta UKI.
- La gestion NFT se conserva en `/cukie-master/cukies` para no perder la ruta
  existente ni la recuperacion directa.
- FAQ operacional: approve + stake, gas, ausencia de lock/fee/yield, madurez de
  24 horas para creditos, gracia de 48 horas y retirada incluso con UI/API
  degradada.
- Errores y receipts revertidos no se presentan como exito.
- Una operacion pendiente bloquea acciones y navegacion accidental.
- Direcciones exactas Stage/Testnet fijadas por guard.
- Commit: `785698b` (`fix: harden Cukie Master UKI flow for staging`).

### Evidencia tecnica conservada

- `pnpm staging:cukie-master:verify-local`.
- `pnpm staging:uki-credits:verify-mongo`.
- Lifecycle local unstake/restake con madurez exacta de 24 horas.
- Typecheck DApp/indexer y build DApp con env Stage/Testnet.

### Seguimiento operativo

Los siguientes son criterios de auditoria y de cualquier cambio contractual
futuro; no son pendientes que rebajen el staking Mainnet confirmado:

- Registrar SHA/configuracion live y separar wallet QA, receipts, indexacion,
  retirada de emergencia, pausa de depositos y FAQ responsive.
- Para una nueva campaña, fijar contrato, owner Safe/multisig, monitorizacion,
  reglas de capacidad y procedimiento de gracia sin prometer yield.

## C. Nueva competicion Treasure Hunt

### Estado vigente confirmado por usuario

C esta **RESUELTO · confirmado por el usuario**. No se reabre por falta de tests adicionales ni por la
foto de una campaña anterior. El bloque siguiente describe evidencia y
requisitos conservados para trazabilidad.

### Contexto historico observado

- La campaña Stage `uki-staking-testnet-2026-08`, chain `97`, staking
  `0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205` y
  `stakePerAttemptRaw=2000000000000000000000` se cerro de forma controlada el
  `2026-09-01T11:33:00Z`; ya no debe tratarse como activa.
- Ya no es cierto que nadie haya jugado: el leaderboard Stage contenia tres
  intentos aprobados al revisarlo.
- La frontera matematica `1.999,999 -> 0`, `2.000 -> 1`, `4.000 -> 2` esta
  cubierta en el servicio.
- La elegibilidad falla cerrada si el indexador no esta sano, el snapshot esta
  stale, la identidad de staking no coincide o la wallet retiro durante la
  campaña.
- El fix `7fc3f2a` oculta el arte pesado de cabecera en movil. Ademas, el juego
  desactiva la textura animada en dispositivos tactiles y el iframe/viewport
  usan aislamiento de composicion.
- La revision local actual corrige el metadata `viewport/themeColor` de Next 15
  y conserva el dedo propietario del D-pad: terminar o cancelar otro touch ya
  no interrumpe el movimiento.
- El guard de Stage fija campaña, reglas, tipo `uki_staking`, chain `97`,
  address, umbral, ventana y la identidad completa del contrato: bloque
  `123359165`, tx `0xc09b...670e` y runtime hash `0xb497...d732`. El interruptor
  `TREASURE_HUNT_COMPETITION_ENABLED=false` sigue siendo valido y no impide
  arrancar la DApp.
- La fuente de elegibilidad exige identidad coherente en cursores, estado y
  posicion. Una posicion manipulada o incompleta devuelve saldo confiable `0`
  y `ready=false`.
- Smoke local con iframe real y scroll:
  - `360x800`: iframe estable `342x248,1796875`.
  - `390x844`: iframe estable `372x270`.
  - `393x852`: iframe estable `375x272,1796875`.
  - Jugar, Rankings, Reglas y Perfil mantuvieron el shell montado, ocultaron el
    arte pesado y no generaron errores de consola.
- Gates de esta revision: guard/Compose `57/57`, servicio de competicion
  `63/63`, cutoff `3/3` con seis corrupciones de identidad, touch real DOM
  `2/2` mediante `pnpm --filter sybil-slayer test`, viewport/controles `5/5`,
  typecheck DApp/juego y build juego verdes.

### Registro historico (no reabre C)

- Matriz visual local terminada en `360x800`, `390x844` y
  `393x852`, en Jugar, Rankings, Reglas y Perfil.
- Iframe real probado, no solo el shell del Hub.
- Guard de despliegue fijado con ID, version, elegibilidad, chain, address,
  identidad contractual, `2.000 UKI` y fechas, conservando el kill switch.
- Validacion en cursores, estado y posicion chain/deployment/tx/code/config
  hash, no solo saldo raw.
- Copy y frontera `2.000 UKI` quedan como criterios de una campaña futura; no
  reabren C.

### Criterios de una campaña futura o de auditoria (no pendientes de C)

- Criterio futuro: congelar el SHA y revisar que solo contiene este bloque y sus
  dependencias; `main` queda fuera.
- Criterio futuro: verificar antes de arrancar Coolify app `28` que los env de campaña e
  identidad coinciden exactamente con el guard. Un valor vacio debe abortar el
  despliegue, salvo el kill switch booleano.
- Criterio futuro: desplegar el Hub (app `28`) y el iframe separado
  `game-treasurehunt-staging` (app `31`) desde el mismo SHA aprobado; registrar
  ambos deployment IDs.
- Criterio futuro: confirmar el SHA en `/api/health`, la campaña en
  `/api/games/treasure-hunt/competition` y que el iframe carga desde
  `/treasurehunt-game` sin assets `4xx/5xx` ni errores de consola.
- Criterio futuro: repetir `360x800`, `390x844`, `393x852` y horizontal en Android/iOS o
  emulacion equivalente, incluyendo scroll repetido, rotacion, pantalla
  completa y multitouch durante una partida.
- Criterio futuro: con wallet QA y tBNB verificar `1.999 -> 0`, `2.000 -> 1`, replay
  idempotente, abandono/uso consume slot, retirada descalifica y `+2.000`
  habilita exactamente otro intento cuando corresponda.
- Criterio futuro: vigilar checkpoint, cursores, dead letters y lag mientras se juega. Si
  aparece identidad incoherente, `ready=false` o flicker, activar el kill
  switch y volver ambos recursos al SHA anterior.

### Requisitos de promocion futura

- Criterio futuro: crear ID y ventana Mainnet nuevos; nunca reutilizar campaña Testnet.
- Criterio futuro: crear el equivalente del guard para produccion con chain `56`, address,
  deployment block, tx, runtime/config hash y umbral aprobados; mantener un
  kill switch que no pueda tumbar la DApp.
- Criterio futuro: congelar contrato, bloque de inicio, runtime hash y cutoff policy.
- Criterio futuro: revisar todos los textos si el umbral Mainnet no es exactamente
  `2.000 UKI`; no permitir divergencia entre API, Hub e iframe.
- Criterio futuro: ejecutar QA movil en dispositivos Android/iOS reales y navegadores wallet.
- Criterio futuro: tener alertas de indexer stale, rechazos de intento, checkpoints y
  descalificaciones.
- Criterio futuro: aprobar reglas publicas y procedimiento de soporte antes de abrir.

### Corte anticipado Stage y paso al modo de creditos (2026-09-01)

- [x] Cierre controlado de `uki-staking-testnet-2026-08` a las
  `2026-09-01T11:33:00Z`, sin modificar `main` ni produccion.
- [x] Entropia de cierre fijada con el primer bloque BSC Testnet posterior al
  corte: bloque `128479727`, hash
  `0x1560abab735a67ea52f0667026481642137305b4214dfcfe9f2e7e6747fe782b`.
- [x] Settlement inmutable: tres intentos registrados; cero elegibles porque
  la unica wallet con intentos retiro UKI durante la campaña y quedo
  descalificada. Pool al cierre: `52.600 UKI`; no se genero ganador.
- [x] Snapshot provisional preservado con tres entradas (`111`, `39`, `19`) y
  snapshot final preservado con cero entradas. La API y la UI de
  `Finalizadas` leen estos archivos; la historia no se recalcula desde el
  ranking vivo.
- [x] Compatibilidad del settlement con Mongo `4.4` corregida en
  `7078ee53c36fd5d8ff6a15bdfdf7ae52eaa7a4e0`; despliegue Coolify
  `o0gw0g8cckk08kk0kgoogw8w` finalizado y los once servicios quedaron sanos.
- [x] Smoke economico posterior al torneo: dos partidas Stage consumieron
  exactamente `10` creditos propios cada una; reservas `consumed`, sesiones y
  runs `settled`, asignacion Cukie del pool `completed`, scores `123` y `157`,
  mejores semanales y `reward_weekly_game_sources` creados. La segunda llamada
  devolvio al cliente `leaderboardEligible=true`, `rewardEligible=true` y
  `jackpotEligible=true`.
- [x] El Hub muestra el torneo como `Competicion finalizada`; cuando el endpoint
  competitivo responde `COMPETITION_NOT_ACTIVE`, el coordinador abre el run
  economico de creditos. El smoke visual sin wallet confirma el estado cerrado;
  queda la partida manual firmada para probar el mismo camino desde el iframe.

Regla operativa obligatoria desde este corte: al terminar un torneo se crea un
snapshot inmutable del ranking y se publica en `Torneos pasados/Finalizadas`.
Si existe fase provisional y final, se conservan ambas; nunca se reescribe la
historia desde datos vivos. Produccion requiere su propio corte, campaign ID,
reglas, entropia, aprobacion y evidencia: no se copian la campaña, los datos ni
los snapshots de Stage.

## D. Reporte de seguridad de Nico

### Estado

El usuario fija D como un programa de migracion: portar al Hub la funcionalidad
legacy necesaria con infraestructura nueva, integrar auth/datos/contratos de
forma segura y retirar el repositorio antiguo cuando haya cero consumidores de
runtime. Esto es alcance vigente, no cierre ni autorizacion de retirada. Los
contratos ya desplegados validos se inventarian, auditan y reutilizan o migran
segun el plan; no se sustituyen por defecto. Los parrafos tecnicos siguientes
conservan evidencia historica y no rebajan esta decision:

- Hub `staging`: commit `5e2ce9a`. Redacta las URI Mongo versionadas, excluye
  Markdown y dumps del contexto Docker, elimina sesiones/tokens/passwords y
  anonimiza emails con aliases unicos. `staging-pii-v2` usa markers con estado,
  lock atomico con propietario, origen/destino exactos y recuperacion por
  snapshot; DApp/indexer no arrancan sin los markers `ready` de Hub y legacy.
- Hub `staging`: commit `a057428`. El cliente GraphQL es `server-only` y solo
  permite el endpoint fijo de produccion cuando `APP_ENV`,
  `NEXT_PUBLIC_APP_ENV` son `production`, `NEXT_PUBLIC_UKI_CHAIN_ID=56` y
  `CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID=56`. Stage/Testnet, entornos desconocidos o señales
  contradictorias cortan antes de `fetch`; `/home` devuelve `503`, `/config`
  oculta GraphQL/auth, listado/detalle fallan cerrados si Mongo no responde,
  las redirecciones estan prohibidas y ningun error interno se refleja.
- Legacy `cukiesworld-stack`: PR #18 sigue borrador en `87e28a8`. El candidato
  `c0241eb` combino en un clon temporal limpio los heads verificados de #8
  `e454226b`, #5 `52ca5283`, #18 `87e28a8` y #9 `f6c37439`, mas la correccion del
  scanner. El clon temporal ya no existe y el candidato nunca se pusheo: queda
  como evidencia de integracion/pruebas, no como SHA desplegable o durable.
- Foto historica del 31-08: Stage estaba en
  `81281521a31c435466c0b6bf1fea7c98adf90559`, conservaba `Wallet.user` y sus
  adapters consultaban/publicaban GraphQL/auth productivos. No representa el
  despliegue actual. La migracion debe comprobar otra vez los consumidores y
  el aislamiento; este antecedente no basta para afirmar una exposicion live.

### Procedencia del codigo legacy

- El adapter que se cambia y prueba en esta entrega vive en este repo,
  `dapp/src/lib/legacy-marketplace` y `dapp/src/app/api/legacy-marketplace`.
- El codigo fuente legacy auditado vive en el monorepo Nx
  `/Users/fgomezserna/Proyectos/cukies-world`: GraphQL en
  `apps/backend/data-graphql`, auth en `apps/backend/auth` y schemas compartidos
  en `libs/shared/backend/schemas`.
- Ese checkout apunta a `https://github.com/fgomezserna/cukiesworld-stack.git`
  y al remote historico `https://gitlab.3fera.com/crypto/cukies-world`. Estaba
  sucio y no se modifico; las pruebas de los PR se hicieron sobre un clon limpio.
- `https://github.com/fgomezserna/cukies-world` y el checkout local
  `cukies-world-game` son otra linea Turbo/pnpm y no se usaron como fuente del
  GraphQL legacy.
- Falta demostrar que la imagen que sirve hoy `api.cukies.world` fue construida
  desde un repo, rama y SHA concretos. La respuesta live demuestra el
  comportamiento desplegado, no la procedencia de su binario.

### Decision de arquitectura: retirar la dependencia legacy

El backend y el repositorio legacy quedan como material temporal de auditoria,
contencion, importacion y reconciliacion. Toda funcionalidad necesaria que falte
se porta a `cukies-hub`; no se desarrollan capacidades nuevas sobre GraphQL/auth
legacy ni se acepta ese runtime como arquitectura final. Se conservan datos,
assets, contratos y asociaciones wallet-usuario legitimas tras revalidarlas; se
excluyen secretos, sesiones y privilegios heredados automaticos.

El corte se hara por slices verticales: inventario, contrato local equivalente,
importacion/reconciliacion de datos, pruebas con identidad Stage/Testnet, smoke
en app `28` y retirada de la llamada antigua. Al final deben quedar a cero tanto
los POST a `api.cukies.world` como el acceso runtime directo al Mongo legacy
mediante `CUKIES_DATABASE_URL`.

### Mapa coordinado de ocho capas

| Capa | Trabajo coordinado y criterio de salida |
| --- | --- |
| Auth/perfiles/wallets | Importar solo campos permitidos, revalidar asociaciones y revocar sesiones heredadas. |
| Inventario/ownership | Normalizar `chainId+collection+tokenId`, reconciliar conteos y aprobar diferencias. |
| Marketplace/fees | Auditar contratos y rutas, decidir fee/moneda y eliminar consumidores legacy. |
| Contratos/eventos | Reconciliar eventos cross-chain, roles y bridge E2E antes de activar relayer. |
| Staking/custodia | Fijar baseline legacy y aceptar nuevas posiciones solo en contratos Hub/BSC autorizados. |
| Cukie Points | Exportar claimed/pending con cutoff y evitar doble credito; conversion futura queda versionada. |
| Crias | Pausar cuando exista autorizacion, conservar historial y decidir lectura o nueva mecanica. |
| Runtime/assets | Servir desde Hub, retirar llamadas GraphQL/auth/DB legacy, imagenes y repo tras health/smokes. |

Inventario de codigo actualizado el 2026-09-07: checkout `Development`, HEAD
`f6ed108682260c8e62844b686a60299843bbd619`, con cambios locales previos conservados.
La matriz tecnica vive en [legacy-marketplace/README.md](legacy-marketplace/README.md);
no equivale a migracion terminada. Incluye la historia
`tx_nfts`, los balances/movimientos `points` y `tx_points`, los datos necesarios
de `completedEvents`/`originals`, la identidad minima `users`/`wallets` y los
assets que aun apunten al S3 antiguo. Se retiran, en vez de copiarse, el agregado
GraphQL `/home`, CRUD/admin de Data REST, mutaciones GraphQL, auth
password/Google/Telegram, blacklist JWT, wallet custodial Saakuru y las colas
producer/consumer/sync una vez probada la paridad. `game` y `matchmaking`
antiguos no son autoridad para Treasure Hunt, creditos ni rewards UKI. Retirar
una implementacion antigua exige cubrir antes su funcionalidad necesaria en el
Hub; no implica descartar identidades o asociaciones legitimas.

Coordinacion GitHub comprobada el 2026-09-07, sin cambios remotos en esta pasada:
[#19](https://github.com/fgomezserna/cukies-hub/issues/19) auditoria de datos y
marketplace, [#249](https://github.com/fgomezserna/cukies-hub/issues/249) herramienta
de transicion preview-only y [#160](https://github.com/fgomezserna/cukies-hub/issues/160)
rotacion de secretos legacy siguen abiertas. El candidato `7914f35` de #249
debe revisarse e integrarse; una herramienta preview no ejecuta el corte.

Evidencia local cerrada:

- `pnpm guard:staging:test`: `70/70`.
- Sintaxis shell/Node, Compose y `git diff --check`: OK.
- E2E Mongo real: restore de Hub/legacy con indices `email unique`, dos usuarios
  por base, exclusion del marker fuente, cero sesiones/tokens/passwords,
  aliases `invalid.local`, markers del mismo lote y archivos `0600`: OK.
- Carrera real de locks: un proceso `CLAIMED`, el segundo `REJECTED`; si legacy
  ya esta ocupado, Hub libera su lock sin tocar los datos: OK.
- Evidencia historica del clon efimero legacy: GraphQL `13`, auth `55`, config
  `95`, frontend `12` y suite security `92` tests; lint y builds GraphQL/auth
  verdes. No es reproducible hasta reconstruir el candidato; falta ademas el
  gate OCI con credenciales del registry protegido.
- Aislamiento GraphQL Hub: `30/30` pruebas focalizadas; el gate completo
  `pnpm staging:marketplace:verify-local` pasa `17` tests de contrato, `149` de
  DApp, `31` del bloque de indexador, Mongo Stage local y ambos typechecks sobre
  chain `97`.
- Build DApp con identidad Stage/Testnet: OK. Smoke del artefacto compilado:
  `/api/legacy-marketplace/home` responde `503` + `Cache-Control: no-store` sin
  abrir el upstream, y `/api/legacy-marketplace/config` devuelve GraphQL/auth a
  `null`. Revision independiente: sin bypass P0/P1.
- Compatibilidad Mongo `4.4` comprobada con la imagen exacta
  `mongo:4.4.30-focal@sha256:4be76f674fc4b27859816811b8baa3c51830eb1dbf4ca81a51e26b79edd662ef`
  (`4.4.30-focal`, Database Tools `100.10.0`): sanitizador, `_getEnv`, pipelines,
  `findOneAndUpdate`, contadores y flags dump/restore funcionan. El target Docker
  fijado por digest tambien construye. Se corrigio ademas el uso de una URI root
  interpolada: restore recibe usuario/password como argumentos separados.
- Riesgo residual de validacion: falta el E2E reproducible de topologia completa
  sobre esa imagen exacta —bootstrap, resync, locks, markers y fallo cerrado en
  una red Docker interna con datos sinteticos—. La comprobacion de primitivas y
  el build no sustituyen ese gate previo al despliegue Stage.

### Antes de Stage

- [x] Implementar y probar localmente sanitizacion Mongo, locks, markers,
  exclusiones Docker y gate de consumidores (`5e2ce9a`).
- [x] Implementar y probar localmente el aislamiento Stage -> GraphQL de
  produccion (`a057428`).
- [x] Integrar y probar en un clon efimero el candidato legacy combinado
  (`c0241eb`); esta evidencia no equivale a una rama disponible.
- [ ] Confirmar en la infraestructura legacy que repo, rama, SHA y digest OCI
  construyen realmente `api.cukies.world`; no inferirlo por el nombre del repo.
- [x] Inventariar resolvers, auth, schemas, jobs y lecturas Mongo legacy que aun
  necesita el Hub; clasificar cada pieza como ya portada, por portar, importacion
  de datos o descartable. Matriz y orden de slices registrados en
  `docs/legacy-marketplace/README.md`.
- [ ] Portar al Hub los slices necesarios y retirar cada consumidor externo al
  pasar su gate Stage/Testnet. No reconstruir `c0241eb` como dependencia de
  producto; usarlo solo como evidencia historica o contencion de emergencia.
- [ ] Repetir el E2E contra la imagen exacta Mongo `4.4` usada por el target
  `staging-mongo`.
- [ ] Congelar SHA Hub, registrar la procedencia legacy disponible, crear
  snapshot del volumen y rollback. Detener
  DApp, indexer, schedulers, card worker y bridge relayer; verificar cero
  conexiones remotas antes de invalidar markers.
- [ ] Rotar la credencial Mongo que estuvo versionada y cargar credenciales
  exclusivas de Stage. No reutilizar ningun secreto de produccion.
- [ ] Para el primer arranque v2, definir temporalmente
  `STAGING_MONGO_MAINTENANCE_CONFIRMATION=staging-pii-v2-all-consumers-stopped`;
  retirarla despues de verificar `ready`.
- [ ] Desplegar `staging-mongo`, DApp e indexer con nombres exactos
  `cukies-hub-staging` y `cukies-legacy-staging`. Exigir health verde, un unico
  marker v2 por base y estado admin `ready`.
- [ ] Verificar cero `Session`, verificaciones, sesiones/resultados de juego,
  OAuth tokens, passwords y `blacklistedtokens`; probar que sesiones/bearers
  anteriores fallan y crear identidades QA nuevas.
- [ ] Mantener GraphQL/auth legacy cerrado o con contencion minima mientras se
  migra: sin `users`, `wallets`, `User.password` ni `Wallet.user`; acceso anonimo
  y mutaciones admin fail-closed; ningun valor sensible en salida/logs. No
  reabrirlo para soportar nuevas funciones del Hub.
- [ ] Desplegar un SHA Hub que contenga `a057428` y comprobar en app `28` que
  `/api/legacy-marketplace/home` devuelve `503`, `/config` no publica GraphQL ni
  auth productivos y una caida controlada de Mongo no activa ningun fallback a
  produccion. Acreditar cero POST salientes al upstream en logs/egress.
- [ ] Ejecutar scanner sobre arbol, historial, bundle e imagen OCI y revisar los
  resultados mientras cualquier componente legacy siga accesible. Login y
  multiwallet nuevos se implementan en el Hub, no reabriendo auth legacy.

### Antes de produccion

- [ ] Cerrar formalmente el incidente: alcance, timeline, datos potencialmente
  accesibles, owners, decisiones y aprobadores.
- [ ] Rotar/revocar credenciales Mongo, JWT/auth, OAuth, Telegram, HMAC, RPC y
  cualquier secreto heredado afectado; registrar owner, fecha y evidencia sin
  guardar valores en Git.
- [ ] Invalidar sesiones NextAuth, tokens legacy y `GameSession`; revisar/resetear
  cuentas afectadas y demostrar que los bearers antiguos ya no funcionan.
- [ ] No ejecutar ningun refresh Stage -> produccion. Crear backup de produccion
  y usar solo migraciones/backfills revisados, con dry-run y rollback.
- [ ] Reconstruir sin cache y retirar imagenes/caches anteriores que pudieron
  contener los Markdown versionados; escanear arbol, historial y OCI. Una
  reescritura de Git requiere una operacion coordinada aparte.
- [ ] Promover solo SHAs revisados tras smoke Stage completo; comprobar APIs
  propias del Hub, login, account linking, roles administrativos y recuperacion
  de cuenta con identidades Mainnet separadas.
- [ ] Mientras produccion conserve temporalmente el proxy legacy, habilitarlo
  solo con `APP_ENV` y
  `NEXT_PUBLIC_APP_ENV` en `production`, `NEXT_PUBLIC_UKI_CHAIN_ID=56` y
  `CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID=56`; endpoint allowlisted sin redirects,
  queries minimas, errores normalizados, rate limit y observabilidad sin PII.
  No habilitarlo por una unica variable publica y fijar fecha de retirada.
- [ ] Importar y reconciliar en colecciones propias todos los datos historicos
  necesarios; demostrar cero llamadas a GraphQL/auth legacy y cero consumidores
  de `CUKIES_DATABASE_URL` antes de desactivar la API/Mongo antiguos.
- [ ] Si una contencion de emergencia exige reconstruir legacy, hacerlo desde
  un SHA auditado y registrar digest OCI; esa imagen no se convierte en runtime
  permanente ni justifica reabrir GraphQL/auth.
- [ ] Activar logging/alertas sin PII sensible, deteccion de enumeracion/abuso y
  runbook de respuesta. Login legacy/multiwallet permanece cerrado hasta ello.

## 1. Bridge Tron -> BSC

### Estado

- Destino BSC Testnet y relayer dedicado estan preparados/verificados.
- El inventario del programa debe contrastar fuente Nile y E2E firmado; esta
  nota no deduce ausencia de despliegue por una configuracion antigua.
- La tarifa no debe mantenerse en `10 TRX` por costumbre: debe calcularse con
  gas BSC medido, precios BNB/TRX y buffer aprobado.
- No esta resuelta documentalmente la relacion entre la wallet comprometida y
  el bridge; debe tratarse como una comprobacion de seguridad independiente.

### Criterios Stage/Testnet del programa (no estado actual)

- [ ] Financiar solo la wallet QA Nile dedicada.
- [ ] Desplegar/verificar fuente Nile y fijar addresses/code hashes.
- [ ] Ejecutar lock/burn Tron -> relayer -> mint/release BSC, replay rechazado y
  destino correcto.
- [ ] Medir `destinationGasUsed` y ejecutar `bridge:calculate-fee`.
- [ ] Probar pausa, reintento, doble uso, token inexistente y relayer no
  autorizado.

### Para produccion

- [ ] Auditoria de ambos extremos y del relayer.
- [ ] Wallet operacional con saldo limitado, alertas y rotacion.
- [ ] Fee TRX versionado y actualizable con gobernanza/owner aprobado.
- [ ] Politica explicita: el usuario paga en Tron y el relayer paga BSC, o flujo
  alternativo. La UI y los contratos deben coincidir.
- [ ] Plan de pausa/reconciliacion; un bridge on-chain no se revierte como una
  app.

## 2. Marketplace

### 2A. Estado correcto de listings, staking, Cukies y Cukie Points

- Lote de elegibilidad `MC09 / SV01–SV04 / V12`, 2026-09-09, sobre base
  `1646602`, rama `codex/seller-eligibility-v2`, [PR #359](https://github.com/fgomezserna/cukies-hub/pull/359),
  **REVISIÓN P2 SUPERADA**: coordinador Astra confirmó `33f7ef59` sin nuevos
  bloqueos de código. Sin integración ni aceptación live de este lote.
  La revisión sobre `1f13cd99` detectó que priorizar Legacy por colección excluía
  republicación UKI y enviaba una orden UKI existente al detalle equivocado.
  Corrección acotada, según las reglas de convivencia Legacy/UKI:

  1. `marketplaceSurface` usa `saleKind` reconciliado para anuncios activos;
     detalle/cancelación conservan origen y contrato exactos, incluso si se
     deshabilita la configuración de publicación UKI.
  2. `sellSurfaces` separa destinos elegibles de publicación. La colección original
     BSC56 disponible conserva Legacy y añade «Vender en UKI» cuando readiness,
     cadena y allowlist exactas lo permiten. Un anuncio activo no ofrece venta
     nueva: hay que cancelar antes de republicar; no hay migración automática.
  3. Rechazo de colección Legacy56 atribuida a97 y guardas de propiedad, custodia
     y estado conservados. Regresiones de doble elegibilidad, orden UKI activa y
     anuncio Legacy sin migración en helper, ensamblado y UI.

  Mismo Luna high, sin activación V2 completa ni infraestructura. Al entregar
  se libera el hueco para Datos/juego. Rama actualizada con `staging` `c7b33c1`:
  conflicto exclusivamente documental resuelto conservando INFRA y coordinación;
  código de producto del lote intacto. No se repiten los 1.898 tests por este
  arrastre del baseline. Merge/deploy sujetos al coordinador y handoff INFRA.
  No amplía el inventario canónico EVM de Mis Cukies a TRON: sus NFTs mantienen
  el panel vendedor Legacy. Despliegue y aceptación live de este lote pendientes;
  la activación económica V2 conserva los requisitos de la sección 2C.
  Verificación tras P2: `pnpm dapp lint` sin avisos,
  `pnpm --filter dapp typecheck` OK y `pnpm dapp test --runInBand`
  con 234 suites / 1.898 tests OK; `git diff --check` OK.
  Suite focal de colección: 13 tests OK, incluidos ensamblado con V2 ready
  true/false, ambos orígenes activos y destinos para republicación. Se conservan
  cobertura BSC56/BSC97, red contradictoria, propiedad/custodia/estado,
  token homónimo y URL inválida. Sin QA visual/live ni firmas en este lote.
  No hay cambios de contratos, configuración económica, CI/CD ni producción.
- Cierre Marketplace del 2026-09-09 en `staging`: el catálogo no publica todo
  el inventario Mongo; verifica estado y precio en los contratos Legacy BSC/TRON,
  degrada cada red por separado y conserva estable el cursor sin escribir durante
  la lectura. Las acciones vuelven a comprobar propietario, anuncio, precio,
  cuenta y red inmediatamente antes de firmar, mantienen el bloqueo hasta el
  recibo y reconcilian por CAS la misma base `cukies-legacy-staging` después de
  confirmarlo.
- La ficha histórica `/marketplace/4000000008733` responde y conserva atributos,
  familia e historial aunque no esté en venta. La identidad es
  `network + collection + tokenId`; BSC admite checksum equivalente y TRON base58
  conserva comparación sensible a mayúsculas.
- Evidencia sin transacción real: Stage `32b27fc` sirvió 24/24 candidatos activos;
  #1000000000029 BSC = 0,195 BNB, #4000000007954 TRON = 900 TRX, un comprado y
  un cancelado históricos quedaron fuera. PR #344 añade la reconciliación tras
  recibo y pruebas simuladas de cambio de precio/cuenta/red y paginación 60+.
- PR #348 corrige la custodia por escrow: mientras el listing está activo usa el
  vendedor del contrato Marketplace y reserva `ownerOf` para NFTs fuera de venta.
  En Stage `0896fbd` ambos documentos de prueba recuperaron sus vendedores reales
  y una segunda reconciliación devolvió `changed=false`, sin transacción on-chain.
- La aceptación final se ejecutó sobre Stage `ac521466`: workflow
  [`34358986091`](https://github.com/fgomezserna/cukies-hub/actions/runs/34358986091)
  `success` y Coolify `1463` terminado. Catálogo a 390/1440 px y ficha BSC #29
  quedaron sin overflow ni errores de consola; el logo público y su optimización
  respondieron HTTP 200. Las sondas BSC/TRON conservaron vendedores, precios y
  `changed=false`. [Registro QA](https://github.com/fgomezserna/cukies-hub/pull/348#issuecomment-5603123628).
- El gate local Stage detecta listings invalidos por transferencia, cambio de
  owner, staking o falta de approval, elimina duplicados visibles y hace la
  proyeccion idempotente.
- El rol de negocio es unico en ambos entornos: `CUKIES_NFT`. Stage resuelve
  exactamente chain `97` + `0xD4C7...Bec8` al alias tecnico historico
  `TOKEN_V2`; el binding futuro de produccion sera chain `56` + `0x0dbD...C861`
  al alias interno `TOKEN`, solo tras migracion, backfill y gate explicito.
- `b288ad5` preserva `chainId + collection + tokenId` en enlaces, keys,
  historial y relaciones, y rechaza identidades, redes o colecciones
  contradictorias. Tambien impide configurar cualquier address `TOKEN_V2` en
  chain `56`, incluso si queda fuera de la allowlist.
- El alias `TOKEN_V2` no se renombra en Mongo/indexador porque forma parte de
  IDs de eventos y cursores ya existentes. No debe exponerse como nombre de
  producto ni usarse como frontera de dominio nueva.
- Falta ejecutar y auditar el backfill sobre Stage remoto.

Stage:

- [ ] Backup, dry-run, conteos antes/despues y lista de divergencias.
- [ ] Ejecutar backfill paginado y reconciliar contra chain.
- [x] Smoke de lectura con casos reales listados, comprados y cancelados en BSC/TRON.
- [ ] Prueba transaccional controlada de approve/listar/comprar/cancelar/cambiar
  precio; no se ejecutó una operación real durante este cierre.

Produccion:

- [ ] Repetir dry-run con snapshot de produccion y ventana controlada.
- [ ] Mantener historial privado sin publicar listings invalidos.
- [ ] Alertas de drift owner/approval/listing e interruptor de lectura segura.

### 2B. Fees legacy

| Accion | BSC Legacy | Tron Legacy |
| --- | --- | --- |
| Venta | `10%` | `10%` si el contrato/config Mainnet lo confirma al promover |
| Cancelacion | `0` | `0` |
| Cambio de precio | `0.0002 BNB` | `10 TRX` |
| Unstake | Sin fee | Sin fee, sujeto a lectura del contrato correspondiente |

Las cifras deben releerse en los contratos Mainnet antes de publicar copy de
produccion.

### 2C. Marketplace UKI no custodial

- UKI directo esta implementado y probado localmente.
- BNB y USDT se mantienen cerrados si no existe ruta exact-output completa y
  verificada.
- El diseño del contrato nuevo no reutiliza el marketplace Legacy; su
  configuracion y despliegue actuales deben inventariarse, y un env vacio no
  prueba que no exista contrato.

Stage:

- [x] Usuario aprueba fee inicial **5% (500bps) para BSC Testnet** el 10/9.
  `setFeeConfig` permite al owner actualizarlo hasta10%; cada anuncio conserva
  el porcentaje vigente al crearse. Produccion sigue sin fijar/publicar.
- [ ] Desplegar/verificar contrato en BSC97 y activar alias independiente del
  indexador.
- [ ] Probar approve, firma/publicacion, compra atomica UKI, cancelacion on-chain,
  expiracion, transferencia externa y retirada de approval.
- [ ] Mantener BNB/USDT ocultos hasta que el verificador pruebe cada ruta.

Produccion:

- [ ] Auditoria, Safe owner y politica on-chain de nonce/cancelacion congelada.
  El contrato actual publica con `createOrder`; no implementa ordenes EIP-712.
- [ ] Router/token/path Mainnet exactos y liquidez suficiente para cada moneda.
- [ ] Plan de coexistencia: Legacy BNB no se migra silenciosamente; el vendedor
  cancela y republica en UKI.
- [ ] Lista conjunta Legacy/UKI con filtros comunes, origen y distintivo Legacy
  por tarjeta. Reponer filtros legacy activos de habilidades y crias; conservar
  contrato, red y moneda en detalle/acciones. Esta decision sustituye tanto las
  dos secciones locales como el selector excluyente observado en Stage.
- [ ] Definir la compra Tron y migracion automatica como flujo separado; no
  mezclarla con el contrato BSC sin E2E y politica aprobados.

## 3. Cukie Master, creditos, pools, prestamos y rewards

Estado vigente: **PROBANDOSE AHORA** en staging. La tabla conserva requisitos y
gates tecnicos; sus marcas antiguas de local/Stage no sustituyen la fila 3 de
la tabla unica. La comprobacion del 07-09 a las 11:44 UTC registro smoke `42/42`,
Cukie Master/creditos `ready` y `800` creditos en `8` asignaciones sin
duplicados. Es evidencia de ese corte; el resto de escenarios se completa con
las pruebas en curso. La publicacion on-chain se comprueba por separado.

| Requisito original | Gate tecnico conservado | Escenario Stage a registrar | Requisito de produccion |
| --- | --- | --- | --- |
| Abrir cupos o subir requisito por ruta | CAS, HMAC, expansion y gracia 48h | Cambio no destructivo de cupos/requisito con fixture | Gobernanza/roles, regla inicial y comunicacion aprobadas |
| Dar 100 creditos diarios por posicion | `staging:uki-credits:verify-mongo`, rutas UKI/NFT | Asignacion por posicion en un corte real y replay sin duplicados | Regla Mainnet, cutoff y monitoring |
| Usarlos para jugar o aportarlos al pool | `staging:uki-credit-usage:verify-mongo` | Smoke API/UI y ledger real Stage | Antifraude, limites y reconciliacion Mainnet |
| Ganar/perder posicion por stake/unstake | Lifecycle y epochs idempotentes | Stake/unstake wallet QA e indexacion | Contrato/indexer Mainnet y soporte de recovery |
| Caducar creditos no usados | `staging:credit-expiry:verify-mongo` | Observar corte real, reserva viva y replay | Regla/cutoff Mainnet y auditoria de ledger |
| Repartir jugador/credit pool/Cukie pool | `staging:game-rewards:verify-mongo` y aprobación manual `2c2e71c` | Cierre Stage con sources reales; revisar/aprobar/publicar un único plan | Batches financiados, auditados y claimables |
| Repartir UKI de pools | `staging:pool-rewards:verify-mongo` | Materializar y revisar allocations reales | Claim Mainnet y soporte de discrepancias |
| Garantizar minimo del Credit Pool | Top-up y conservacion exacta | Verificar caso bajo minimo en Stage | Aprobar minimo/regla y funding Mainnet |
| Jugar con recursos propios/prestados | Cuatro combinaciones y leases | E2E DApp/iframe con wallets QA | Capacidad, alertas, soporte y antifraude |
| Ranking semanal y reparto siguiente | `staging:borrowed-game-ranking:verify-mongo`, siete tramos | Sellar una semana Stage y revisar manifest | Regla Mainnet, cierre firmado y claim |
| Prioridad Original -> Segunda -> Seiku | Commit `ce557f9` y gate Mongo | Smoke con inventario Stage real | Censo Mainnet y monitor de starvation |
| Ranking solo con creditos prestados | 20 pool incluidas, 6 propias excluidas | Revisar ranking Stage tras corte | Reglas/umbrales Mainnet aprobados |
| UKI no asignado 80/10/10 | Tesoreria 80%, bucket M+D 10%, supply 10% | Revisar wallets sink y allocations | Safe/wallets Mainnet y ejecucion auditable |
| Reserva programa embajadores | Allocations separadas y no recursivas | Claim simultaneo referido/sponsor | Funding y politica Mainnet |

La regla economica historica `credits-staging-test-v4` conserva sin mutacion su
set completo de `sourceContractAddresses`, incluido `TOKEN_V2`, y mantiene el
mismo `configHash`. `37418fe` añade para reglas nuevas el binding versionado
`sourceBindings.CUKIES_NFT`: Cukie Master y creditos resuelven desde el rol y la
chain al alias tecnico exacto (`TOKEN_V2` en `97`, `TOKEN` en `56`) y dejan de
tratar el alias como concepto funcional. Un binding hibrido, ambiguo, cruzado de
chain o con otra coleccion falla cerrado.

La foto del 31-08 acreditaba este soporte local con v4 en Stage. No establece
la version activa hoy. Cualquier cambio posterior de regla requiere fijar
`activeFrom` UTC, crear la version de creditos y la version de juego enlazada a
su `configHash`, aplicar ambas juntas en Stage y ejecutar los smokes del primer
corte. La regla v4 no se reescribe y produccion permanece fuera de alcance hasta
migracion, backfill y gate en chain `56`.

### Evidencia historica y criterios de publicacion/liquidacion

- El `RewardsDistributor` Stage
  `0xc2252D797Da294D16b84282d213604b4Bcf6EE09` estaba desplegado y tenia
  en la foto anterior `0 UKI`, `totalReserved=0` y ningun batch real publicado;
  estos valores deben reconsultarse antes de una operacion de liquidacion.
- La publicacion on-chain requiere cargar por canal secreto la autoridad exacta
  del owner Testnet, prefondar, aprobar un batch, publicarlo, reclamarlo e
  indexarlo; este gate no invalida la prueba economica off-chain activa.
- La UI reclama por batch: una semana sin reclamar no se pierde dentro de la
  ventana, pero puede requerir varias transacciones y gas. Stage configura una
  ventana de `90 dias`; despues expira el derecho contractual de ese batch y
  falta cerrar la politica operativa del remanente.
- `2c2e71c` ya obliga a preparar, revisar y aprobar manualmente hashes y totales
  exactos antes de que el publisher pueda firmar. También bloquea transferencias
  80/10/10 si el plan no genera batch. Antes de publicar, comprobar la version
  desplegada, los indices de `staging:economy:setup` y la aprobacion del plan;
  esta exigencia no declara pendiente el despliegue actual de la economia.
- No activar automaticamente el backlog de cierres 21-29 de agosto sin revision.
- Falta el E2E firmado `requestExit/withdraw` del Cukie Pool desde la wallet QA
  beneficiaria.

## 4. Programa de embajadores

### Estado vigente: hotfix verificado en MAIN y STAGING; publicacion pendiente

La confirmacion de producto separa merge/deploy tecnico de publicacion visible.
Las reglas, pruebas locales y observaciones live descritas debajo son evidencia de alcance;
no declaran el programa publicado ni autorizan claim.

- Decision del 2026-09-09 implementada en [PR #351](https://github.com/fgomezserna/cukies-hub/pull/351): se exige Cukie Master y sponsor confirmado antes de invitar. La perdida del rol conserva referidos/codigo e interrumpe nuevas comisiones; recuperarlo reactiva el mismo enlace.
- Login y navegacion no fijan sponsor. La primera entrada sin sponsor muestra solo su confirmacion especifica, firmada sin gas; despues permite estadisticas y enlace cuando corresponde.
- Referencias de preventa conservadas. Los compradores sin sponsor reciben Cukies World sin recalcular pagos pasados. Administracion puede corregir relaciones con HMAC dedicado, motivo, sponsor esperado, idempotencia e historial; el autoservicio no puede reasignarlas.
- Main `4475baa`, Coolify `1464` terminado el 2026-09-09 14:09:27 UTC. Migracion real: 19 asignaciones CW nuevas, 377 relaciones y 15 codigos anteriores intactos por hash, replay 0; indexador avanza despues del despliegue. Sonda de 15 enlaces: 3 aceptados y 12 inactivos, sin 503; un 404 por si solo no diagnostica el motivo de inactividad.
- Validacion local Main: lint, tipos, build chain 56 y 1.479 tests; administracion live rechaza peticion sin firma (401) y autorreferencia firmada (409). No se han firmado transacciones con wallets de usuarios ni movido fondos.
- Stage `e6e3cbb` en [PR #352](https://github.com/fgomezserna/cukies-hub/pull/352): [CI 34362306780, intento 3](https://github.com/fgomezserna/cukies-hub/actions/runs/34362306780) correcto y Coolify `1465` terminado el 2026-09-09 14:54:12 UTC. Health con SHA exacto, 11 servicios usando los digests previstos y Mongo de staging preservado. Lint, tipos, build chain 97, 232 suites / 1.870 tests y guard de staging 105/105 correctos.
- Migracion Stage: 2 asignaciones CW, 1 relacion y 2 codigos previos intactos por hash; replay 0. Prueba con wallet QA nueva: firma de login y navegacion mantienen sponsor nulo; confirmacion dedicada CW devuelve 201 y activa estadisticas, sin enlace por no ser Master. Correccion administrativa QA: cambio, replay idempotente, rechazo de ciclo/conflicto y restauracion a CW correctos. No se cambio el sponsor de usuarios reales.
- Las pruebas del ciclo de elegibilidad y de comisiones son de regresion local; el smoke live no fuerza una perdida/recuperacion de Master ni liquida premios. [Artefacto de verificacion](evidence/2026-09-09-ambassadors-lifecycle.json).
- Sigue un unico nivel al `5%` para el sponsor elegible, con la misma disponibilidad del premio del referido. Los ejemplos futuros `5%/2%` y segundo nivel `3%` son posibles mediante reglas versionadas; no estan activos. Reglas funcionales y procedimiento de correccion: [uki-current-operating-rules.md](uki-current-operating-rules.md#embajadores).

### Criterios de publicacion y validacion (sin afirmar publicacion)

- [ ] Validar la publicacion del endpoint/UI ya integrado en main, conservando
  las pruebas de alta, conflicto y sponsor de preventa.
- [ ] Verificar premio diario, semanal, Credit Pool y Cukie Pool con datos Stage.
- [ ] Publicar/reclamar batch de referido y sponsor y comprobar misma
  disponibilidad.
- [ ] Revisar privacidad, abuso, wallets autocontroladas y ciclos.

### Criterios de produccion futura

- [x] Conservar referencias de preventa y materializar los 19 compradores sin sponsor en Main con conteos y replay verificados (PR #351, 2026-09-09).
- [ ] Congelar porcentaje, niveles y fecha de vigencia en una regla versionada.
- [ ] Controles antifraude y proceso de disputa/correccion antes del cierre.
- [ ] Funding y claim Mainnet con evidencia del sponsor.

## 5. Dashboard y arquitectura del sitio

Fuente de arquitectura y auditoria: [uki-dapp-sitemap.md](uki-dapp-sitemap.md).
Criterios por escenario: [uki-ux-state-matrix.md](uki-ux-state-matrix.md).

Incluye landing publica, vesting, dashboard, Cukie Master, Cukies, Marketplace,
Cukie Pool, Treasure Hunt, rankings y rewards. El dashboard no debe inventar
datos: diferencia `ready`, `partial`, `stale`, `unavailable` y estados vacios.

### Coordinacion compartida del layout — 2026-09-09

Decision del usuario: centralizar wallet, red, disponibilidad, cache y
recuperacion de lecturas en un provider persistente bajo `AppProviders`.
Las pantallas consumen este estado; la validacion final de cada operacion
conserva la identidad y la red del contrato correspondiente. La supervision
de workers sigue en backend y no depende de mantener una pagina abierta.

Implementacion en `codex/shared-app-runtime`, partiendo de `82e8d43`:
estado autenticado por servicio, aviso comun del layout y migracion de las
lecturas de Resumen, Master, NFT, Creditos y Pool. Criterios: deduplicacion,
descarte de respuestas de otra wallet, recuperacion al reconectar, ninguna
lectura privada iniciada desde la landing, y cero solo cuando esta confirmado.
La regresion postmutacion exige terminar un GET anterior y realizar otro
posterior al guardado; no basta con reutilizar la peticion en vuelo. Los tests
cubren timeout del cuerpo JSON, identidad, desconexion, drafts e historial.
Gates locales PASS: lint sin avisos, typecheck, build Dapp y Jest completo
(219 suites, 1.773 tests). QA local desktop 1440 y movil 390: aviso comun sin
overflow; landing sin lecturas privadas. Integrado en [PR #340](https://github.com/fgomezserna/cukies-hub/pull/340):
Stage sirve `43d8a2f` desde las 09:28:48 UTC, deployment
`qog48gg4o0s0os4gcows004g`, guard PASS sin cancelaciones. La version anterior
era `80608ea`. El 2026-09-09 a las 09:10 UTC la sesion QA
muestra 3 cupos NFT y 0 UKI en Master y Creditos, con 300 creditos previstos;
esta observacion reemplaza el cero historico como referencia de este rollout.
Resumen renovo su fecha DOM de `09:34:28.957Z` a `09:35:30.200Z` sin pulsar
Actualizar y sin aviso general de servicio. Master NFT muestra seis imagenes
cargadas y el legendario #98000005 depositado (10 puntos, tres cupos). Pool
muestra 0 posiciones y 11 disponibles (5 Originales y 6 de Segunda Generacion),
sin aviso de sincronizacion. El endpoint rechaza peticiones sin sesion (401);
la UI firmada consume el
estado comun. Indexer, Master y Creditos tienen evidencia `ready` a las
09:32 UTC. El error de creditos `DOMAIN_CONFLICT` del corte 09:30 se recupero
sin intervencion; tambien existia a las 08:30 y 09:00, antes del rollout.
Se conserva como diagnostico pendiente, sin ocultarlo como cero ni confundirlo
con un fallo del layout. Los 12 servicios estan running sin reinicios;
los gates previos se conservan y los cuatro servicios adicionales del compose
normal permanecen deshabilitados. [Evidencia](legacy-marketplace/evidence/2026-09-09-shared-app-runtime.json).
Este alcance no modifica saldos, contratos, reglas economicas, procesos de
reparacion remotos ni produccion.

### Creditos por periodo y custodia de la coleccion — 2026-09-09

La prueba de las 09:49 UTC de la wallet `0x26789b…0c13` confirma tres cupos NFT
activos, cero UKI y 300 creditos del periodo 09:30–10:00 UTC. La captura anterior
de cinco cupos no representa su estado actual. En staging la validacion de 24 h
se escala a 30 minutos y despues aplica el primer corte elegible: un deposito
reconocido a las 12:05 madura a las 12:35 y entra como pronto en el corte 13:00.
Configurar el reparto de un cupo en validacion no adelanta esa elegibilidad.

Seguimiento de este lote en `codex/credit-cycle-and-cukie-actions`:

| Punto | Evidencia y estado | Criterio de cierre |
| --- | --- | --- |
| Corte de creditos | Desplegado en Stage `bae6f3b`: el corte 11:00 abre ambas rutas a las 11:00:54.863. El primer intento registra `CREDIT_CUTOFF_BLOCK_MISSING` y `CREDIT_WATERMARK_UNHEALTHY_OR_STALE`. La UI informa reparto en proceso y retira el aviso automaticamente al terminar. | Verificado un corte posterior al deploy; conserva la espera del indexador y no promete liquidacion instantanea. |
| Configuracion de cupos pendientes | Stage `bae6f3b`: fecha elegible por cupo, configuracion futura agrupada por corte y controles habilitados durante `qualifying`. La UI real muestra tres NFT elegibles desde el corte 11:30 y reparto preparado 200 jugar / 100 pool. | Configuracion anticipada comprobada sin adelantar grants ni guardar cambios de reparto en QA. |
| Retiradas de prueba del Pool sustituido | **CORRECCIÓN TESTNET CONFIRMADA el 2026-09-10 11:05 UTC**: las solicitudes de `98000001`, `98000003` y `98000004` se registraron el 9Sep 16:54–16:58 UTC en el vault `0xd405…2872b`, cuyo calendario conservaba 24 h. Por eso figuraba 10Sep14:00 UTC, aunque el Pool actual de Stage usa 30 minutos. Tres transacciones administrativas `advanceWithdrawableAt` adelantan únicamente esas posiciones al primer corte de 30 minutos posterior: **9Sep17:00 UTC**. Receipts confirmados en bloques `130203980`, `130203993` y `130204008`; lectura posterior muestra `lifecycle=4`, beneficiario `0x26789b…0c13` y NFT todavía en el vault. [Evidencia de la corrección](evidence/2026-09-10-pool-withdrawal-deadline-correction.json). La prueba anterior de PR355/`6803252` y la retirada de #7 quedan como [histórico](evidence/2026-09-09-pool-test-retirements.json). | **Disponibles on-chain; no retirados físicamente.** El propietario debe firmar la retirada. UI publicada en [PR #381](https://github.com/fgomezserna/cukies-hub/pull/381), Stage `eaabd91`, el 10Sep11:32:35 UTC; workflow34471121051 SUCCESS, release durable y health/ready con SHA exacto. Lint, tipos, build y248suites/2007tests PASS. Solo se reemplazo DApp;91de92contenedores conservados y siete imagenes reutilizadas. La comprobacion visual personal sigue pendiente por la restauracion de sesion de Wallets; no se acredita una retirada firmada. No cambia el calendario global de 30 minutos, la duración del vault, contratos ni producción. |
| Actualizacion y acciones | **Desplegado y contrastado en Stage, 2026-09-09 13:21 UTC.** PR [#347](https://github.com/fgomezserna/cukies-hub/pull/347), merge `8d89676`, servido dentro de `0896fbd` (PR #349). El despliegue `a76af1841ccb57fbdc12d071` termino a las 13:16:47 UTC usando las imagenes publicadas; el primer workflow CI quedo fallido y se recupero el despliegue explicitamente. Custodia y ciclo transaccional compartidos; inventario y pendientes conservados por identidad. QA autenticada Master/Pool/Mis Cukies y sonda RO Mongo+BSC 97 coherentes: 12 Cukies = 2 wallet + 9 Pool (5 actuales y 4 anteriores) + 1 Master; indexador `ready`, sin errores de consola. Master ya bloquea `98000001`, `03`, `04` por estar en Pool. Lint, tipos, build y 228 suites / 1.844 tests correctos. [Evidencia](legacy-marketplace/evidence/2026-09-09-credit-period-and-pool-custody.json). | Codigo publicado y lecturas verificadas. La conservacion durante refresh/transaccion queda cubierta por regresion; no se firmaron depositos ni retiradas de la wallet en QA. El cierre del pipeline y su prueba de reutilizacion se siguen en la fila INFRA. |

El candidato de recuperacion se contrasto a las 10:24 UTC contra Mongo y
`ownerOf`/`positionOf` de BSC 97, sin escrituras: reconoce los cuatro NFTs del
Pool anterior y ocho disponibles. El `98000005` ya habia vuelto a la wallet
desde la observacion de las 09:49; ambos estados quedan fechados, no se fuerza
un saldo historico como expectativa actual. Los ocho disponibles no ofrecen
venta UKI porque ese contrato no esta configurado en staging.

Decision del usuario del 2026-09-09: la sustitucion del contrato de pruebas no
introduce un producto llamado «Pool anterior». La experiencia habitual muestra
el Pool y las retiradas de cada Cukie; el destino concreto sigue validandose
internamente y no convierte los depositos existentes en saldo disponible.
La sustitucion en Stage se hizo para acelerar su calendario de pruebas. Las
posiciones conservadas en el contrato sustituido mantienen el calendario con
el que se depositaron hasta su retirada real.

Las operaciones autorizadas de esta tarde son `withdraw` de `98000007`
(`0x3e2441756f5f7842bee3b40246aff064599d2dfd013fd5c0ca1948f4f2ad8587`) y
`requestExit` de `98000001`, `98000003` y `98000004`; sus hashes completos,
recibos y estado en un mismo bloque estan en la evidencia enlazada en la fila.
Son operaciones BSC 97, valor nativo cero, del beneficiario al contrato
sustituido. No se operaron los depositos del Pool actual ni produccion. No
retirar el contrato sustituido de la allowlist mientras conserve posiciones
pendientes. La retirada de los tres NFT tras el plazo aun no se ha ejecutado.

La configuracion publica `NEXT_PUBLIC_CUKIE_POOL_RECOVERY_VAULT_ADDRESSES`
admite solo vaults anteriores declarados para la red configurada. En app 28
se incorpora `0xd405acff1bba872be893e796c39f3eacbde2872b`; conserva su
calendario diario y requiere solicitud de salida/retirada firmada por el
beneficiario. La lista queda vacia por defecto. El despliegue actual del Pool
sigue siendo `0x359b8fc829eb6d320df6301c8f323af9ae773b41`.

A las 10:35 UTC el candidato final confirma una coleccion mixta: siete
disponibles, cuatro en el Pool anterior y uno en Master. La recuperacion
excluye correctamente las posiciones actuales de sus consultas historicas.
[Evidencia de ambos contrastes y del corte](legacy-marketplace/evidence/2026-09-09-credit-period-and-pool-custody.json).

PR [#343](https://github.com/fgomezserna/cukies-hub/pull/343), integrada sobre
`32b27fc` (PR #342), desplegada como `bae6f3b022297ac431aa417ac8e8127d82d1913c`.
Coolify `mk0wos4gs4wwkosg0gkg8w4c` termino a las 10:53:22 UTC; `/api/health`
confirma el SHA. Lint, typecheck, build, compose config y 222 suites / 1.810
tests correctos. Doce servicios running, cero reinicios y gates previos
conservados; indexer, Master y Creditos con estado `ready` a las 10:54 UTC.
El guard mantuvo un minimo de 11.446.267.904 bytes libres, sobre el suelo de
10 GiB. Main/app 12 queda fuera del alcance.

QA con sesion real: Creditos en escritorio y movil; filtros de Mis Cukies;
recuperacion de `98000001` con el vault anterior seleccionado y propietario
verificado; siete aprobaciones y cuatro solicitudes de salida simuladas
correctamente contra los contratos, sin enviar transacciones. Sin overflow
horizontal en Creditos, Mis Cukies y recovery a 391 px. Pool actual contrastado
en escritorio. El corte 11:00 confirma una espera de unos 55 s, similar a la
observacion previa: mejora la coherencia y el diagnostico, no elimina la espera
por evidencia de cadena. Un corte observado no constituye una garantia de latencia.

Observacion residual: Wagmi registro `ProviderNotFoundError` durante una
recarga a las 10:59:44; la sesion se recupero y las pantallas quedaron operativas.
La causa concreta de ese aviso transitorio no se ha aislado; no se presenta
esta verificacion como ausencia total de errores de conectores.

### Auditoria del 2026-09-08

Observado en `https://cukieshub.eurekand.com`, app 28, SHA
`ed2d50da47ef5eeef83162b9cfda9e247821c930`, con `/api/health` en `ok`.
Fecha local 8 de septiembre CEST, durante la noche del 7 de septiembre UTC.
Dos agentes Luna auditaron codigo y el coordinador contrasto 27 rutas en Edge,
con sesion existente, escritorio y viewport CSS movil 391 x 844. No hubo
firmas, partidas, claims, cambios de cuenta ni operaciones sobre activos.

Hallazgos principales:

- Resumen existe pero no tiene entrada en el sidebar; Ajustes y las herramientas
  legacy carecen de un acceso contextual suficiente.
- Campana con mensaje fijo de mision y contador inventado; avatar de ejemplo,
  perfil del torneo y ajustes generales forman recorridos distintos.
- Menu movil de la app cierra al navegar y con Escape, pero oculta el cierre
  visible y no devuelve el foco al activador. El menu publico si tiene cierre
  visible y retorno de foco correcto. No se observo overflow horizontal a 391 px.
- Master, Creditos, coleccion y Pool muestran estados cuyo alcance no se explica
  de forma coherente. Se registra la contradiccion UX, sin adjudicar que saldo
  economico es correcto ni convertir la migracion pendiente en una regresion.
- Como jugar y Reglas contienen explicaciones distintas del reparto; la ayuda
  conserva una nota interna. En Stage, portada/resumen e inicio del juego no
  comunican consistentemente torneo historico frente a modo semanal.
- Marketplace conjunto, fichas accesibles y herramientas de coleccion siguen
  ligados a completar la UX legacy/v2 sobre datos reconciliados.

La propuesta conserva los flujos utiles de Premios, Embajadores, recuperacion
del Pool y pestanas del juego. Incluye mapa por pantalla, prioridades, fuentes
y criterios de aceptacion. **Auditoria no equivale a rediseño implementado ni
a punto cerrado.** No cambia el estado confirmado de A/B/C ni de produccion.
Los documentos anteriores se han reconciliado; dejan de proponer rutas/API
inexistentes como si fueran el flujo actual.

### Implementacion y datos: 8 de septiembre

El usuario autoriza aplicar la propuesta y aporta capturas de Master con cero
cupos, NFT/Pool sincronizando y un cupo UKI que permanece activo tras retirar.
La comprobacion remota encuentra el proceso healthy pero iteraciones fallidas
por RPC (503/403, recibos ausentes e historico podado). Los cursores Staked y
Unstaked siguen en `129722220`, actualizados el 7 a las 22:52 UTC. El backend
conserva 20.500 UKI; la lectura de contrato y la pantalla de staking muestran
cero. El runtime de creditos bloquea por `SOURCE_UNHEALTHY`,
`CANONICAL_CHECKPOINT_UNHEALTHY` e `INDEXER_RUN_UNHEALTHY`.

Se ha validado otro RPC de BSC Testnet desde el contenedor: diez identidades
de contrato correctas y un evento Staked conocido recuperado. Se configura
en Coolify app 28. El despliegue `roowww4o00g0goc0gkooscwg` del mismo `ed2d50d`
termina a las 09:40 UTC. Runtime contrastado con RPC Sentio, rango 100.000 y
poll 10 segundos (guard Stage activo). El backend recupera a las 09:47 UTC
el unstake `0xc149213fe36b229a3a46214609bae5773b2d33986165fe44d05ac7ac9c2f9e09`,
bloque `129802234`, confirmado on-chain a las 08:52:04: saldo UKI cero.
A las 10:20 UTC, los 77 cursores configurados alcanzan el bloque actual
y el checkpoint canonico se actualiza a `129813877`. Esto recupera el
historico, pero no certifica aun Master/creditos/inventario. Esta accion no publica todavia el
parche local. Se conservan cursores, posiciones y ledger:
no hay reset, salto de bloques ni revocacion de creditos emitidos.

La salida de UKI deja de dar cupos cuando ya no cumple el requisito; los
creditos concedidos mantienen su caducidad. La gracia corresponde a cambios
del requisito, no a retrasos del indexador. Los cambios locales distinguen
vigencia pendiente, saldo emitido/caducado y datos desconocidos; el refresco
debe conservar repartos en edicion y descartar respuestas de otra sesion.

Evidencia operativa: [recuperacion Stage del 8 de septiembre](legacy-marketplace/evidence/2026-09-08-stage-data-recovery.json).
No contiene credenciales ni sustituye este seguimiento. Tras confirmar el checkpoint fresco, a las 10:20:58 UTC se adelanta solo
el trabajo UKI fallido de la wallet de QA (sin borrar intentos ni modificar
saldos). El runtime vuelve a rechazarlo a las 10:21:33: `RECALCULATION_FAILED`.
Los cupos materializados siguen siendo cinco NFT y uno UKI. El RCA posterior
confirma un defecto de consulta: health UKI encuentra 14 cursores y toma solo
5 sin orden; health NFT custodial encuentra 13 y toma solo 7. Tras incorporar
nuevos eventos, esos limites dejan fuera `UKI_STAKING:Unstaked`,
`VESTING_VAULT:VestingCreated/TokensReleased` y
`TOKEN_V2:Transfer/CukieMetadataConfigured`, aunque existen y estan al dia.
No hay incidentes de integridad ni dead letters. El cursor obsoleto no causa
el bloqueo. Se corrige seleccionando el manifiesto requerido antes del limite,
sin relajar identidad/frescura. La baja del cupo debe comprobarse tras publicar
el parche; no se certifica por la consulta corregida en aislamiento.

Validacion final local del 8/09: `pnpm dapp lint`, `typecheck`, `test --runInBand`
(215 suites, 1.715 tests) y `pnpm build:dapp` OK. Sybil Slayer: lint (warnings),
typecheck y build OK. Chain indexer: 86 tests pasados, una integracion Mongo
opt-in omitida; typecheck y build OK. Diff sin errores. Ninguno de estos checks
sustituye la validacion firmada y economica posterior al despliegue.

El 8/09 el usuario autoriza integrar la PR #322 y desplegarla en staging, y
establece que futuras peticiones de implementar/corregir incluyen esos pasos
y la comprobacion publicada. La regla operativa queda en `AGENTS.md`;
produccion conserva su autorizacion independiente.

La PR #322 se integra en `26dd990` y el despliegue
`oo00cw8k08cg8c4koc8w4kkg` termina a las 12:28:12 UTC. Health publico y
contenedores confirman la nueva version. A las 12:31:12 el job de unstake
termina (13 intentos) sin reencolar manualmente: cero cupos UKI y cinco NFT,
respaldados por tres posiciones custodiales y 27 puntos. Master y Creditos,
con la misma sesion firmada, coinciden en cinco activos y reparto 500
(110 jugar, 390 pool); los seis Originales se muestran sin aviso de carga.
El runtime de creditos termina correctamente y no hay duplicados en las
claves de cuentas por periodo ni items de ejecucion comprobados. Los saldos
emitidos se conservan con su caducidad. Main sigue en `fb2b190`.

La comprobacion descubre un defecto residual del Pool: selecciona 11 cursores
del vault y exige exactamente los siete funcionales. Los cuatro eventos
administrativos provocan `unavailable` y fuerzan inventario vacio aunque hay
nueve disponibles (coleccion: 12, tres en Master, cero en Pool). La correccion
filtra el manifiesto antes del limite y conserva los guards. Se integra en
[PR #323](https://github.com/fgomezserna/cukies-hub/pull/323), `16e7f07`; el
despliegue `agw4kgccgkk88wko4g8o0g4g` termina a las 12:54:18 UTC. Health
publico confirma el SHA y la misma sesion muestra nueve NFTs disponibles
(tres Originales, seis Segunda Generacion), sus acciones y ningun aviso de
actualizacion. El inventario se corresponde con los tres NFTs depositados
en Master y ninguno en Pool. No hubo firmas ni operaciones de staking en
esta comprobacion. Parche validado: 14 tests focales y gates dapp completos (lint, typecheck, 215 suites /
1.716 tests y build correctos).

### Seguimiento de continuidad: 8 de septiembre, 14:05 UTC

El usuario comunica una nueva recaida. Se contrasta la pestaña Dashboard ya
abierta con una nueva lectura de la misma wallet. La primera conserva cinco
cupos; Dashboard nuevo, Master y Creditos indican cero cupos configurables.
Las retiradas de los NFT `98000006` y `98000005` se indexan a las 13:53:07 y
13:54:31 UTC; sus trabajos terminan sin reintentos. Queda `98000002`, con dos
puntos de rareza: al requerir tres por cupo, cero es correcto. En ese momento
se observa tambien saldo 110 / 390; el contraste posterior de los cortes
descarta que la nueva emision de las 14:00 sea legitima (ver seguimiento).

El defecto reproducido es la ausencia de refresco automatico del resumen:
`cache: no-store` evita cache HTTP, pero no actualiza el estado de una pestaña
abierta. El parche incorpora actualizacion al volver a la pestaña y cada
30 segundos mientras esta visible, sin peticiones solapadas y descartando
respuestas de una identidad anterior. Las peticiones tienen un plazo de
20 segundos y la pantalla muestra la hora de su ultima lectura. Una
actualizacion fallida conserva esa lectura con un aviso explicito; no
fabrica ceros actuales.

No se observa repeticion del incidente RPC en el intervalo 13:12–14:03 UTC:
los procesos tienen cero reinicios y los 77 rangos del indexador avanzan.
Un `DOMAIN_CONFLICT` de creditos a las 14:00:20 UTC queda seguido de ejecuciones
correctas; no prueba una interrupcion persistente. Esta observacion acotada
no certifica estabilidad indefinida.

Marketplace tiene un bloqueo separado: faltan las variables de address del
contrato UKI en app 28 y su runtime no esta listo; el catalogo Legacy responde.
La address Stage `0x95780d891461e3183562B5D785f2D2c1c72ecE65` se contrasta
por codigo on-chain: corresponde a `StagingCukiesMarketplaceSource`, fixture
de eventos, y no a `CukiesMarketplace`. El despliegue UKI operativo no queda
acreditado; su identidad y configuracion siguen pendientes segun
`deployment-environments.md`. No se activa usando una address de pruebas.
No se confunde este aviso con una perdida de cupos ni con latencia RPC.
La comprobacion publicada del refresco se coordina en [#289](https://github.com/fgomezserna/cukies-hub/issues/289);
la evidencia historica de 12:54 sigue siendo valida para aquel estado.

### Historial de cupos y cortes: 8 de septiembre, 14:44 UTC

PR #325 queda publicada en `78fb0f8` a las 14:37:25 UTC. En la pestaña
original el timestamp de lectura avanza automaticamente de `14:39:24.786Z`
a `14:40:24.781Z`, con cero cupos; main sigue en `fb2b190`. Esto verifica
el refresco y no cierra la coherencia economica.

La revision del corte descubre una segunda causa: `listSourceSlotsAtCutoff`
selecciona revisiones activas antiguas de `cukie_master_slot_versions` aunque
la proyeccion actual ya este inactiva. Los NFT 98000006 y 98000005 se retiran
antes del bloque de corte `129843288` (13:59:59 UTC); el reparto NFT de las
14:00 debia excluirlos. Tanto ese corte como el de 14:30 contienen cinco
items y 500 creditos. Los cortes de 13:00/13:30 son anteriores a las retiradas
y no se clasifican como erroneos. UKI tiene una revision inactiva efectiva
en `129802234`; no se afirma que todo su historico sea incorrecto.

A las 14:44:12 UTC se detuvo solo `competition-credit-scheduler` de app 28
como contencion reversible y se persistio `COMPETITION_CREDITS_RUNTIME_ENABLED=false`.
El indexador y Master siguieron activos. Los cortes incorrectos contienen diez
items: 1.000 creditos de prueba, 110 propios y 390 de pool por corte, sin
consumo ni reserva de esos lotes. Se conservan las emisiones que ocurrieron,
sus runs y ledger. El corte 14:00 habia caducado; el 14:30 caduca por el
flujo normal tras reactivar el repartidor a las 18:13 UTC.

Durante un despliegue paralelo, `/srv` llego al 100% (175G y cero espacio
libre). Mongo registro `WiredTiger errno 28 / No space left on device` y
`WT_PANIC`; tambien fallo Coolify DB. Esta caida de infraestructura es distinta
del defecto de historial. Tras recuperar el servicio se observaron 23G
libres. Cancelar el deploy `p4sso0c00wo8gk0ocgkc4484` libero aproximadamente
1G; no se atribuyen a esa accion los otros 25G recuperados previamente, cuya
causa no quedo establecida. Estas tareas no ejecutaron prune ni borraron datos.

La [PR #329](https://github.com/fgomezserna/cukies-hub/pull/329) incorpora la
correccion de historial y su reparador basado en eventos confirmados. La
[PR #330](https://github.com/fgomezserna/cukies-hub/pull/330) excluye de
`listCreditContributors` los runs con incidentes de integridad abiertos.
Las ocho posiciones de pool historicas permanecen registradas: bloquearlas
sin bloquear sus runs romperia la reconciliacion financiera. La
[PR #331](https://github.com/fgomezserna/cukies-hub/pull/331) adapta el join
`$lookup` a Mongo Stage 4.4.29 mediante `let/$expr`; la incompatibilidad de
la primera variante se detecto antes de servirla o insertar incidentes.
Los gates de accounting/publicacion de rewards estaban desactivados y
permanecen asi; se observaron cero allocations, cierres, batches y proofs.

Cuatro intentos de build quedaron cancelados antes de sustituir el runtime.
En los dos ultimos se acredito un timeout de lectura API de Coolify de unos
tres segundos con disco disponible, no otra caida de Mongo. Se ajusto la
supervision: consulta API de hasta 15s, tolerancia acotada de 45s solo para
disponibilidad y vigilancia independiente de disco cada 2,5s con minimo
10GiB. Identidad/payload invalidos o un segundo build siguen cancelando.
El despliegue unico `zck88go4sgk48owcsswkcgkw` termino a las 17:57:38 UTC,
sin cancelaciones del guard, sirviendo `2620904915ce3522d22a74271c9e92dc9ec4bc03`.
Health publico de staging verificado y Mongo/indexador/dapp healthy. Los
checks del lote final son lint, typecheck, build y 215 suites / 1.725 tests;
reparador de historial 4/4 y helper de incidentes 9/9.

A las 17:58–18:00 UTC se ejecuto el plan congelado
`da5c561d99fdb5d9fd4c87b7392573f402654f1a946b39211b0a0107074f2026`:
cinco nuevas versiones de reparacion, sin modificar las filas originales.
La consulta historica pasa de cinco cupos activos en todos los cortes a
5 antes de la primera retirada, 4 en bloque 129842320 y 0 desde 129842496,
incluido el corte 14:00 y el ultimo bloque seguro. UKI sigue en 0. El replay
inserta cero y reconoce cinco existentes. Se conservan las mismas huellas
de las 54 versiones QA originales, los 1.008 asientos QA y la proyeccion
actual completa. Las ventanas temporales antiguas con `temporalWindowValid=false`
se conservan como evidencia; esta reparacion corrige la seleccion por bloque
y no normaliza retrospectivamente todas las fechas historicas.

Se insertan dos incidentes `SOURCE_SLOT_HISTORY_CORRECTED` mediante plan
`55bfd468f859ca1ecc6c01e0c15d3652d152563721426b74420c7047f84934b9`;
el replay inserta cero. La agregacion real de Mongo a las 18:00:42 UTC
conserva los 390 de pool del corte legitimo 13:30 y excluye los 390 de cada
corte incorrecto 14:00/14:30. Las filas financieras siguen intactas y no
se ha materializado ningun premio de esos cortes. Los incidentes quedan
abiertos para mantener esa exclusion; resolverlos requiere reconciliar
antes su efecto en premios.

A las 18:00 UTC se restituye solo la variable de creditos a `true` en Coolify
app 28. El despliegue normal `cgw8gc40ook0socwsww0s48c` termina a las
18:13:05 UTC con el mismo SHA y el gate efectivo activo. Los ticks posteriores
avanzan UKI y caducan normalmente los 110 propios y 390 de pool pendientes,
sin nuevos grants para QA. **NFT sigue bloqueado con `DOMAIN_CONFLICT`**;
el status success del tick no certifica el resultado de ambas rutas.

La comprobacion de UI detecto `projectionFresh=false`: PR #329 incorpora
la evidencia de la ultima retirada al sourceHash, pero la proyeccion
preservada conservaba el hash anterior. El worker Master estaba activo;
los jobs anteriores ya completados y la reconciliacion completa cada 24h
no programaban una recalculacion inmediata. Se inventariaron las cuatro
proyecciones NFT: solo una necesitaba rematerializacion. El plan
`0a040ce4dcef468be7bdc3acba95d3a7bfe5a3d714adb1eca85c8bfe305f25e4`
inserto un job determinista a las 18:33:57 UTC y el worker normal lo
completo a las 18:34:11 UTC. Replay antes y despues de completarse:
cero inserciones y un job existente. No se reabrieron jobs completados
ni se editaron cupos directamente. La precondicion del hash antiguo se
comprobo dentro de la transaccion; no es un CAS de la posicion, y el
worker vuelve a leer la fuente actual al procesar el job.

A las 18:39:10 UTC las cuatro fuentes estaban completas y sus proyecciones
frescas; no se proponia ningun job adicional. QA conserva cero cupos y
el selector historico 5→4→0 NFT / UKI 0. La UI firmada de `/cukie-master`
muestra 0 activos, 0 creditos diarios y ya no presenta el aviso de
materializacion. La rematerializacion normal añade cinco versiones y
la caducidad normal añade dos asientos: la igualdad de hashes descrita
arriba corresponde exclusivamente a la reparacion previa a reactivar.

El `DOMAIN_CONFLICT` restante procede de `readSnapshotGate`: cualquier
incidente abierto bloqueaba todos los cortes nuevos de su ruta. Los dos
incidentes historicos deben seguir abiertos para excluir sus aportaciones
de premios. El parche `e02d394` permite solo cortes estrictamente posteriores
cuando el incidente tiene exclusivamente `SOURCE_SLOT_HISTORY_CORRECTED`,
la contencion exacta del selector de premios, selectorCutoff 0 y metadatos
validos de run, periodo, plan y evidencia. Incidentes normales, ambiguos,
invalidos o del mismo corte siguen bloqueando; los otros gates se conservan.

Prueba de los repositorios actuales contra Mongo real a las 18:38:20 UTC,
solo lectura: dos bloqueos para 14:00, uno para 14:30 y cero desde 15:00.
El lector de premios conserva 390 para 13:30 y excluye 14:00/14:30 con cero
contribuciones. Checks finales del parche: 56 focales, 215 suites / 1.737
tests, lint, typecheck y build PASS. La [PR #332](https://github.com/fgomezserna/cukies-hub/pull/332)
se integra y despliega como `bd5567f`; queue `sg0sokccg48ggkg8cw0g8w8k`
termina a las 19:06:47 UTC. Dapp/indexador healthy, creditos activos,
18.446.892 KiB libres. El guard registra un timeout API de 15s recuperado
a los 20,8s, dentro de los 45s permitidos; la sonda de disco continua y
no hay cancelacion. Durante la sustitucion hubo ausencia temporal de
servicios y HTTP 404, resuelto al terminar. A las 19:07:35 UTC NFT ya ha
abierto los cortes 15:00/15:30, UKI llega a 19:00 y QA tiene cero grants
posteriores a las retiradas. El catchup sigue en curso en esta observacion.

La comprobacion transversal descubre dos consumidores adicionales del
problema de frescura. `credits/public.ts` contaba toda incidencia abierta,
aunque el gate ya permitia superar la contencion historica. Ademas, la
rama `waiting` del runtime salia antes de refrescar el watermark: Mongo
18:57:47 UTC muestra UKI observado a las 18:30:30, frente a una frescura
maxima de 15 minutos y repartos Stage cada 30 minutos. Esto explica el
aviso recurrente a mitad del ciclo.

El siguiente lote usa el mismo predicado en el lector publico con corte
vigente, manteniendo filtro wallet/global y ruta; la rama waiting valida
y refresca la fuente sin abrir runs. Las fuentes enfermas siguen bloqueadas
y el bloque comun de caducidad se conserva. Inventario de consumidores:
lector publico, gate de repository, mirror de testing, dashboard/panel
que consumen grants.healthy y rewards que mantiene su exclusion por runId.
No se modifica el limite de frescura ni el lector de premios.

Gates del lote: 215 suites / 1.746 tests, lint, typecheck y build PASS.
Mongo real con el lector candidato a las 19:07:35 UTC: ambas rutas healthy,
cero incidentes bloqueantes actuales, saldos y cupos configurables cero;
la misma fuente evaluada 16 minutos despues devuelve healthy=false para
ambas rutas. Premios sigue conservando 390 de 13:30 y cero de 14:00/14:30.
La [PR #333](https://github.com/fgomezserna/cukies-hub/pull/333) queda integrada
y desplegada como `67303f66f0b64797fffa21a4722b3f0a672a07c1`; queue
`xkkg08gk4c84ss8ww0gc4w8o` termina a las 19:25:51 UTC. Health publico y
SHA exacto verificados, dapp/indexador healthy, creditos activos, rewards
apagados y card worker contenido. Disco libre: 18.450.132 KiB. El guard
arranco tras identificar la queue en progreso y termino sin cancelaciones
ni diagnosticos; no se presenta como activo antes de identificarla.

Verificacion live 19:26:54→19:27:56 UTC, dentro del corte 19:00 y sin nuevo
reparto: ambas rutas siguen waiting, cero items aplicados, y los watermarks
avanzan UKI 19:26:29→19:27:25 y NFT 19:26:34→19:27:30. Ambas fuentes son
healthy y no hay incidentes bloqueantes actuales. Los dos incidentes
historicos permanecen abiertos para la exclusion de premios. A las
19:28:28 UTC UKI y NFT estan al dia y todos los cortes QA desde 15:00
contienen cero items/grants. No se ha cambiado ningun balance manualmente.

Con la misma sesion QA, sin reconectar wallet: Cukie Master muestra cero
activos y ningun aviso de materializacion; Creditos muestra cero y ningun
aviso de vigencia pendiente; Resumen coincide para Master, Creditos y Pool.
Vesting sigue como aviso independiente sin asignacion. Produccion permanece en
`fb2b19023e7edd824bc6eb86dc5409025cc3ee1e`,
health OK. Se cierra [#326](https://github.com/fgomezserna/cukies-hub/issues/326)
en este alcance; la validacion amplia de UX/economia/legacy sigue en #289.

Alcance del codigo `5fbe106` en [PR #322](https://github.com/fgomezserna/cukies-hub/pull/322), publicado en staging `26dd990`:

| Puntos UX | Cambio o comprobacion | Estado / limite |
| --- | --- | --- |
| UX-01 | Fuente, proyeccion y saldo emitido separados; descarte de respuestas de otra wallet; refresco de creditos conservando borradores | Publicado y verificado con sesion QA: 0 UKI + 5 NFT y 500 creditos, fuentes frescas y job completado. Pool tambien publicado en PR #323: nueve NFTs disponibles y aviso retirado |
| UX-02/08 | Reglas y fase de torneo coherentes; acceso de juego pendiente cuando falta autoridad | Tests focales; Sybil Slayer lint, typecheck y build OK el 8/09 (warnings de lint); sin pruebas de compra/partida real |
| UX-03/04/05/06/12 | Inicio y Resumen, grupos de sidebar, cuenta/avatar/ajustes, retirada de campana estatica, cierre y foco movil | IAB local `320x568`: cierre por Escape devuelve foco; ultimo enlace accesible y foco en MAIN; sin desbordamiento. Destino hash probado tras cierre Radix: foco en MAIN, cancelacion conserva activador |
| UX-07 | Resumen compacto; prioridad de CTA de Juegos en movil | Dashboard compacto; CTA Juegos visible sin scroll en IAB 391x844 y 320x568 |
| UX-09 | Catalogo conjunto Legacy/UKI, identidad por cadena/coleccion y navegacion paginada | **Legacy verificado live en Stage `ac521466`**: catálogo y permalink #8733, venta/compra/cancelación/cambio de precio, fuente parcial explícita e inventario vendedor 60+. PR #344 añade reconciliación post-recibo con CAS; PR #348 conserva el vendedor durante escrow y PR #350 corrige los assets standalone. QA final 390/1440 px sin overflow ni errores, logo directo/optimizado HTTP 200 y sondas BSC/TRON idempotentes. El catálogo muestra precio live pero conserva el orden/cursor indexado hasta que exista proyección continua. UKI V2 continúa `unavailable` porque falta contrato/configuración BSC97; no se representa como cero |
| UX-10/11 | Ficha, tools de coleccion y estados de Bridge/Points/Crias | Rutas comunes `/bridge`, `/breeding` y `/cukiepoints` publicadas mediante366/367; [LEG10–LEG11](legacy-marketplace/evidence/2026-09-09-legacy-domain-stage.md). QA y límites vigentes en filas1/post1-2/5; sin certificación transaccional. |
| UX-13 | Vesting comparte vista y no muestra calendario personal sin asignacion | Parche local y tests focales; sin claim real |
| UX-14 | Idioma de las superficies publicadas y ayuda de monedas/red de compra | Compra usa monedas de swapConfig y red objetivo; ES/EN de portada coherentes. App publicada en castellano; formularios antiguos sin consumidores no reactivados |

Stage:

- [x] Auditoria de lectura de las 27 rutas indicadas y revision de wrappers y
  variantes en codigo; capturas en la tarea. Movil CSS `391x844` y escritorio.
- [ ] Validacion del rediseño aprobado en escritorio/movil, todas las variantes
  de wallet, teclado/lector de pantalla y flujos transaccionales.
- [ ] Verificar enlaces permanentes de recovery, wallet incorrecta, chain
  incorrecta, datos stale y modulos apagados.
- [x] Contrastar el caso reportado con APIs/indexador y sesion firmada: Master
  0 UKI + 5 NFT, Creditos 500 por reparto y Pool nueve disponibles. Las
  variantes restantes conservan su validacion pendiente en la matriz UX.

Produccion:

- [ ] Reemplazar todas las direcciones/datos Stage por fuentes Mainnet.
- [ ] Mantener ocultas o claramente cerradas las funciones no activadas.
- [ ] Validar privacidad: ningun resumen publico expone identidad o saldos
  privados sin autenticacion/firma.
- [ ] Smoke de enlaces, analytics/errores y soporte antes de comunicar el sitio.

## 6. Tokenomics

### Respuesta a la duda del documento

Si se puede pasar de `500.000` a `600.000 UKI/dia`, pero solo con una nueva
version de regla efectiva desde un corte futuro que aun no se haya abierto.
Nunca se modifican dias cerrados, reservas, allocations, accruals, tramos o
batches anteriores. El techo total de `450.000.000 UKI` no aumenta: a mayor
ritmo, menor duracion restante del programa.

### Stage

- [ ] Mantener `500.000 UKI/dia` y techo `450M` como regla de prueba v4.
- [ ] Reconciliar cada dia: jugadores + pools + embajadores + reservas + no
  distribuido = `500.000` exactamente.
- [ ] Verificar supersesion futura en un corte no abierto y rechazo de mutacion
  historica.
- [ ] No publicar batches hasta aprobar backlog, funding y owner.

### Produccion

- [ ] Resolver la incompatibilidad entre `500.000/dia`, techo `450M` y cualquier
  comunicacion publica de seis años.
- [ ] Aprobar regla inicial, fecha, cutoff, wallets sink y calendario.
- [ ] Congelar `configHash` y manifest; cambios futuros requieren nueva version y
  go/no-go.
- [ ] El suministro es fijo: rewards se prefundan desde reserva; nunca se mintea
  por cerrar un dia.

## Inventario y bloque LEGACY antes del 15

El detalle técnico y la evidencia durable viven en
[legacy-marketplace/README.md](legacy-marketplace/README.md). Esta tabla es el
resumen operativo único: una pieza puede estar portada en código y seguir
desplegada o consumida por legacy. El inventario live del 2026-09-07 observó 34
contenedores `running`; eso no demuestra paridad ni retirada.

| Bloque | Estado local | Stage/Prod observado | Criterio de salida antes de retirar |
| --- | --- | --- | --- |
| Contratos legacy: 14 addresses mainnet (8 TRON, 6 BSC), 16 ABI originales | Inventariados; checkout antiguo conserva 1 `.sol` aislado y Hub tiene 4 bundles BSC recuperados desde Sourcify (3 `exact_match`, 1 `match`) | Código/owners live confirmados; custodia de claves y fuentes verificadas de 2 BSC y 8 TRON siguen pendientes | Evidencia de procedencia/ownership, sin asumir compilación local, custodia rotada y snapshot de owners/supply/eventos |
| Producers/consumer/sync y eventos | Chain-indexer/importers portados parcialmente | `chain-indexer` live; legacy getters/setter también `running` | Replay idempotente, diferencias de `processedEvents`/`completedEvents` aceptadas y cero consumidores legacy |
| Cards/assets | **OPERATIVO EN STAGING**, verificado 2026-09-09 04:43 UTC. Indexed **18/18** = 16 generadas + 2 válidas; legacy **17.464/17.464** = 17.462 generadas + 2 válidas; `complete`, delta 0, fallos 0. Reconciliados los 17.482 IDs con Mongo/URL/jobs; 37 GET públicos por red/generación/rareza pasan hash/longitud/MIME. Mis Cukies 12/12 y Master 6/6 con imágenes reales. Catálogo #8733 hidrata también su hijo `4000000015494`, sin fallback AWS. Los dos daemons permanentes pasan una regeneración real CAS de NFT existente por fuente: intentos 1→2, un job nuevo, GET 200 íntegro, Mongo generado y PNG temporal retirado; censos sin cambios | [Catálogo #8733](https://cukieshub.eurekand.com/api/marketplace/v1/catalog?scope=legacy&search=8733&limit=4), [PR #337](https://github.com/fgomezserna/cukies-hub/pull/337), [PR #338](https://github.com/fgomezserna/cukies-hub/pull/338). DApp y código de workers sirven `80608ea`; configuración `740fb44` corrige exclusivamente `exec sh` del daemon legacy mediante recreate sin build/dependencias/pull, misma imagen `68405ec`. Deploy `ucwock0gs8o80888c8gs8c4c` terminado 04:29:32 UTC con guard HOST PASS, cancelaciones 0 y mínimo VM 14.509.424.640 bytes. Evidencia VM1001: `/srv/cukies-card-publish-20260908/reconciliation-final.json` y `/srv/cukies-card-close-20260909/` (`deploy-2/result.json`, `legacy-recreate-2/result.json`, `daemon-runtime.json`, `daemon-canaries/`, `daemon-canary-cleanup.json`). Workers: 1 CPU/1 GiB, tmpfs privado 128 MiB, capacidad RO fresca de ambos discos y suelo 10 GiB; indexed BSC/97 explícito y legacy separado. Negativa real sin heartbeat falla antes de claim. Monitores privados permanentes activos; temporales y tokens de guard retirados, writer permanente y copias de recuperación conservados | Cierre limitado a imágenes: no implica retirar todo legacy. El 404 histórico de `/marketplace/4000000008733` quedó resuelto por PR #342 y se observó HTTP 200 en Stage `32b27fc`; no prueba una compra real. El deploy materializó cinco schedulers ya definidos: cuatro con gate false quedaron parados; créditos conserva su gate true previamente autorizado y está restaurado. Actividad e interrupción 04:34:23–04:35:12 documentadas en `credit-effects.json` y artefacto operativo, sin afirmar cero efectos ni revertir saldos; no se reorganizaron perfiles. No importación entre fuentes, ni activación del indexador legacy, ni cambios en main/app12/remotion. Backfill/manifiestos, snapshots y muestras se conservan; no repetir la regeneración masiva |
| Auth/GraphQL/REST legacy | NextAuth/API Hub parcial; upstream legacy sigue inventariado | Servicios auth/GraphQL/REST live; `CUKIES_DATABASE_URL` observado | Identidad mínima migrada, cero llamadas/mutaciones legacy y secretos revocados |
| `cukies`, `tx_nfts`, `points`, `tx_points`, `originals`, usuarios/wallets | Importación parcial; conteos son metadatos (`estimatedDocumentCount` o `collStats.count`), no reconciliación | Stage legacy 17.464 `cukies`; nuevo Stage 18 fixtures aislados; Hub Stage `User` 335, `UserWallet` 336 y `GameSession` 5.759 | Manifest por colección, colisiones/huérfanos explicados y paridad por wallet/token/evento; no comparar fixtures Stage con main |
| Cukie Points (`post1`) | No ejecutado; permanece ANTES DEL 15 | Claimed/pending y cutoff por contrastar BSC/TRON | Export read-only con cutoff aprobado; no conversión automática a créditos |
| Crías y Originales (`post2`) | No ejecutado; permanece ANTES DEL 15 | Dry-run, pausa y snapshot BSC/TRON por decidir | Listado Originales con/sin cría, historial conservado y pausa autorizada |
| Game y matchmaking | Censo pendiente; no descartado | `game-api` y `matchmaking-api` legacy live | Criterio funcional, consumidores y datos cubiertos en Hub o decisión explícita |
| Learn y Ludo | Censo pendiente; no descartado | `data-rest-learn-api`, `data-rest-ludo-api`, `learn-bot-worker` live | Rutas, usuarios y datos reconciliados o criterio funcional aprobado |

No se declara `legacy retirado` por health verde, conteo igual, código portado,
merge o contenedor `running`. Los estados válidos son `portado`, `desplegado`,
`gate activo`, `paridad` y `retirado`, con evidencia separada en cada caso.

## Resto del inventario posterior al 15

Cukie Points y crias (post1 y post2) se adelantan al bloque legacy anterior.
Los puntos post3 a post9 conservan su alcance posterior; este inventario no
los adelanta ni declara resueltos.

| ID / titulo | Codigo | Local | Stage | Prod | Proximo paso / evidencia |
| --- | --- | --- | --- | --- | --- |
| 3. Tablas de premios preventa/competicion | `sin verificar` | No reejecutado esta pasada | Manifest, revisión y pago sin verificar | Tabla final y vesting 9+6 sin verificar | Generar tablas sin PII; detalle histórico en [settlement](../dapp/src/lib/treasure-hunt-competition/settlement.ts), no revalidado. |
| 4. Login user/password y multiples wallets | `sin verificar` | No reejecutado esta pasada | Auditoría, recuperación y delegación sin verificar | Auditoría de roles/auth y delegación sin verificar | Revalidar aislamiento, unicidad y account-linking; detalle histórico en [legacy auth](legacy-marketplace/README.md), no revalidado. |
| 5. Liberacion progresiva de UKI | `sin verificar` | No reejecutado esta pasada | Regla exacta, congelación y contrato sin verificar | Modelo económico/legal y tesorería sin verificar | Definir modelo, invariantes y contrato; detalle histórico en [runbook vesting](uki-mainnet-intermediate-listing-runbook.md), no revalidado. |
| 6. Multiplayer Treasure Hunt | `Parcial: multijugador sin apuestas` | No reejecutado esta pasada | Código de tipos/config en `origin/staging`, sin runtime ni apuestas verificadas | Settlement de valor real sin verificar | Diseñar apuestas, antifraude y settlement; detalle en `dapp/src/lib/treasure-hunt-multiplayer/`, no revalidado. |
| 7. Gambling | `sin verificar` | No reejecutado esta pasada | Decisión legal/producto y controles sin verificar | Igual, sin verificación | Obtener decisión legal/producto antes de código o fondos; detalle histórico en este seguimiento, no revalidado. |
| 8. Compra de Cukies desde el juego | `sin verificar` | No reejecutado esta pasada | Configuración, contrato y ruta de pago sin verificar; address no configurada no prueba ausencia de deploy | Compra atómica, fees y liquidez sin verificar | Completar configuración y verificar contrato/rutas; detalle histórico en `dapp/src/lib/uki-marketplace/inventory.ts`, no revalidado. |
| 9. Cambiar Explorador por Cocinero en NFTs | `sin verificar` | No reejecutado esta pasada | Muestra Testnet, refresh y metadata sin verificar | Estrategia metadata/pinning/cache sin verificar | Censar metadata/assets y probar en Testnet; detalle histórico en `dapp/src/lib/treasure-hunt-multiplayer/types.ts`, no revalidado. |

## Registro de actualizaciones

| Fecha | Cambio | Evidencia |
| --- | --- | --- |
| 2026-08-30 | Creado seguimiento versionado a partir del Word original, sin modificarlo. | SHA-256 de fuente y foto Git/Stage registradas arriba. |
| 2026-08-30 | Cerrada la pasada local de Cukie Master UKI; pendiente promocion/smoke Stage. | Commit `785698b` y gates descritos en B. |
| 2026-08-30 | Treasure Hunt confirmado activo a 2.000 UKI y con tres intentos reales; audit movil/frontera exacta sigue abierto. | API/leaderboard Stage, tests focalizados y seccion C. |
| 2026-08-30 | Cerrado el bloque local movil e identidad de Treasure Hunt; queda despliegue/smoke Stage y wallet QA exacta. | Matriz Playwright local, guard `57/57`, tests DApp/juego y seccion C. |
| 2026-08-31 | Cerrado el hardening local reproducible del Hub para Mongo y aislamiento GraphQL, y documentados por separado los gates de activacion Stage y promocion a produccion. El incidente permanece bloqueado hasta procedencia legacy, rotacion, reviews y smokes remotos. | Commits Hub `5e2ce9a` y `a057428`; guard `70/70`, E2E Mongo real, prueba de lock concurrente, `30/30` tests GraphQL y smoke compilado Stage/Testnet. `c0241eb` queda solo como evidencia de una integracion efimera ya retirada. |
| 2026-08-31 | Cerrado el slice local de identidad `CUKIES_NFT`: Stage y el futuro binding mainnet comparten rol funcional, mientras `TOKEN`/`TOKEN_V2` quedan como aliases tecnicos internos. Clientes legacy, relaciones e historial fallan cerrados ante mezcla de redes o colecciones. | Commit `b288ad5`; gate local `17` contrato + `149` DApp + `31` indexador, Mongo Stage y typechecks. Revision de especificacion y calidad aprobadas; sin push, despliegue ni cambios en `main`. |
| 2026-08-31 | Cerrado localmente el desacoplamiento de `CUKIES_NFT` en Cukie Master y creditos. La v4 real permanece legible e inmutable; las reglas nuevas usan un binding versionado y los runtimes seleccionan el alias tecnico por chain. Tambien se corrigieron leases sin propietario bloqueados por relojes futuros y los gates acumulativos conservan exactamente el estado previo. | Commit `37418fe`; `213/213` suites DApp (`1703` tests), typecheck, lint, policy `12/12`, guard `70/70`, `staging:cukie-master:verify-mongo` y `staging:credits:verify-mongo` OK sobre `127.0.0.1:37018`, Stage/Testnet `97`. Sin push, despliegue ni cambios en `main`; v5 pendiente de corte y regla de juego enlazada. |
| 2026-08-31 | Cerrado localmente el gate de aprobación de pagos: el publisher ya no puede autoautorizar drafts ni ejecutar destinos de sistema sin revisión manual inmutable. | Commit `2c2e71c`; publisher `40/40`, DApp `213/213` (`1703` tests), indexador `60/60` más economy `18/18`, contratos rewards `25/25`, guard Stage `70/70`, typecheck/lint y `staging:reward-approval:verify-mongo` OK en chain `97`. El setup local de índices no se ejecutó por límite del revisor de uso; queda como primer paso al desplegar. Sin push, despliegue ni cambios en `main`. |
| 2026-09-01 | Cerrado anticipadamente el torneo Stage, sellados y publicados los snapshots provisional/final y activada de hecho la ruta posterior de partidas por creditos. | Corte `2026-09-01T11:33:00Z`, bloque Testnet `128479727`, commit desplegado `7078ee5`, settlement `3` intentos/`0` elegibles, pool `52.600 UKI`, UI `Finalizadas` verificada y smoke economico `500 -> 490 -> 480` con dos partidas de coste `10`, ranking y sources de rewards. `main` y produccion no se modificaron. |
| 2026-09-07 | Reconciliado el estado con producto: A operativo; B torneo lanzamiento activo; C resuelto; legacy con Points/crias antes del 15; 3 en pruebas Stage; 4 en main pendiente de publicar; 5 revision UX. | Secciones A/B/D, evidencia on-chain con bloques/tx, API publica de torneo y `output/verification/pancake-mainnet-20260907.json`. |
| 2026-09-08 | Auditoria UX del punto 5: 27 rutas leidas en Stage, propuesta de navegacion y mapa por pantalla; se conservan los estados de producto de los demas puntos. | Stage `ed2d50d`, capturas/lecturas Edge en la tarea, `docs/uki-dapp-sitemap.md` y `docs/uki-ux-state-matrix.md`. Solo documentacion; sin rediseño implementado, firmas ni despliegue. |
