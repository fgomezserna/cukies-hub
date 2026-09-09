# Cobertura de cambios actualizado y requisitos complementarios

Auditoría del 9 de septiembre de 2026. Se han leído las cinco páginas del DOCX, sus 23 párrafos OOXML y sus cinco capturas. La revisión desglosa **16 puntos originales, ampliados con las aclaraciones generales, en 57 comprobaciones**, más **37 comprobaciones** de los tres requisitos adicionales: **94 en total**. El documento original se conserva sin cambios.

Este apéndice aporta trazabilidad y evidencia fechada a las filas de [seguimiento operativo](antes-del-15-seguimiento.md). **No es otro backlog**: el estado vigente, las prioridades y los cierres se actualizan allí; cada fila inferior remite al mismo responsable y trabajo existente. Las conclusiones describen lo observado en esta auditoría, no certifican futuras versiones. Las [reglas operativas](uki-current-operating-rules.md) y las instrucciones directas actuales del usuario prevalecen sobre citas antiguas del DOCX.

## Conclusiones que cambian el plan

- **Venta:** el botón `Vender` existe, pero `my-collection.ts` lo concede a TRON o a `chainId === 56 && ukiMarketplacePublicConfig.ready`. Excluye los NFTs nuevos BSC97 incluso después de configurar V2 y acopla indebidamente la venta Legacy BSC a V2. Conservar los guards de propiedad, custodia, red y recibo; corregir la selección de la acción en el trabajo de Marketplace, sin crear otra implementación paralela.
- **Legacy:** Bridge, Crías y Cukie Points tienen rutas y enlaces desde Mis Cukies, pero faltan en el sidebar/drawer común. El Bridge actual solo admite `disabled/testnet` y la configuración BSC97/Nile; no satisface el uso solicitado de los contratos **Legacy mainnet** desde Stage. El worker de eventos Legacy y el relayer no aparecen entre los contenedores activos. Points Stage devuelve un conjunto vacío, mientras producción tiene historia; esto no acredita paridad ni saldo real cero.
- **V2:** su contrato implementa las cuatro reglas económicas principales; el checkout tiene una lista fija UKI/BNB/USDT y no ofrece ASM/USDC. Stage responde `503 UKI_MARKETPLACE_UNAVAILABLE`, con address pública vacía; el contrato y cliente V2 no están en el árbol `main` auditado. No existe una prueba de liquidación operativa V2 en ninguno de los dos entornos.
- **Créditos y juego:** la cifra 5.400 requiere reconciliación por wallet/período, aunque existen reparaciones anteriores verificadas. El selector antiguo y el texto de fallo de creación de intento siguen teniendo consumidores. El tótem de la captura pertenece a Treasure Hunt/Sybil Slayer; Moha es el jugador. Sus assets responden hoy HTTP 200 en ambos entornos, pero no se ha reproducido el render móvil exacto.
- **Master y Pool:** la custodia anterior de 98000001/003/004 está acreditada y explica que no sean candidatos para otro depósito. Los guards se integraron con PR347; la continuación tras aprobación sigue requiriendo una prueba del flujo concreto. PR355 está servida en Stage y el coordinador verificó estados, fechas y destinos de retirada. Los tres NFT conservan su custodia hasta la retirada real. No se identifica una retirada pendiente como error de wallet.
- **Embajadores:** PR351/352 y la evidencia de migración/QA cubren ampliamente el cambio solicitado. Administración ya dispone de API/CLI auditada. La visibilidad de producción sigue desactivada; ni la pérdida/recuperación real del rol con pagos ni los claims financiados se probaron en esta auditoría. El punto 7 solo confirma viabilidad futura.

## Fuente y localizadores

Fuente: `/Users/fgomezserna/Downloads/cambios actualizado.docx`, SHA-256 `6748aa52cd9eddd39742d280b6729b5e615b94171585f573821026b64a1547bd`. Render de lectura: cinco páginas. Sin tablas, comentarios, notas al pie ni notas finales. Los IDs P01–P23 siguen el orden de párrafos de `word/document.xml`; los saltos de línea dentro de un párrafo no crean IDs nuevos.

| Párrafos | Página | Contenido y cobertura |
| --- | --- | --- |
| P01–P03 | 1 | Jugar, cifra/cita Telegram y selector: J01–J05. |
| P04, P06, P08, P09, P14, P22 | 1–4 | Párrafos vacíos; inventariados, sin requisitos omitidos. |
| P05, P07 | 1–2 | Partida de Moha y captura del tótem: J06. |
| P10–P13 | 2–3 | Master, NFTs 1–6 y los dos estados de error: M01–M07. |
| P15–P16 | 3 | Retraso del período y captura de créditos: CR01–CR02. P16 también contiene el encabezado Embajadores. |
| P17 | 3–4 | Embajadores 1–4: E01–E20. |
| P18 | 4 | Embajadores 5–6: E21–E24. |
| P19 | 4 | Embajadores 7, solo viabilidad: E25–E26; encabezado Pool. |
| P20 | 4 | Imágenes al depositar: PO01. |
| P21 | 4 | Mis Cukies: MC01–MC10; encabezado En General. |
| P23 | 5 | UKI → cupo → créditos: G01–G05, incluidos los criterios adicionales de desconocido y reconexión. |

| Captura | Anclaje | Inspección visual y límite |
| --- | --- | --- |
| C1 `image1.png` | P03, p.1 | Selector «Selecciona modo de juego», error «No pudimos confirmar si el intento quedó creado. La partida no se inició; vuelve a intentarlo», dos imágenes de personajes rotas, Jugar 1P y multijugador Próximamente. No contiene respuesta API ni fecha de incidente. |
| C2 `image2.png` | P07, p.2 | Treasure Hunt móvil rotado: 210 puntos, nivel 1, 30 s, «Tótem de runas 2/5» y lateral casi vacío con iconos pequeños. El panel existe; no demuestra por sí solo cuál asset/CSS falló. |
| C3 `image3.png` | P11, p.2 | #98000002, 2 puntos, Hacer staking; #98000003, 4 puntos, Continuar staking y enlace de transacción. Ese enlace no demuestra firma o depósito de ese intento. |
| C4 `image4.png` | P12, p.3 | #98000001/#98000002 y mensaje genérico de rechazo/reversión. El texto también reporta #4, que no aparece en esa captura. |
| C5 `image5.png` | P16, p.3 | Es créditos: 300 para jugar, 0 en partidas, 0 usados, 300 aportados al Pool. Su proximidad a Embajadores no la convierte en evidencia de referidos. |

P17.2 contiene la frase inconsistente «pero tendrá link para recomendar ni ganará». Se interpreta según el resto del párrafo y la petición directa vigente: **sin Master no tiene enlace activo ni nuevas comisiones**. La cita Telegram de P02 —800 créditos, 42/42 y PR317— queda como antecedente, no como prueba actual ni autorización de operar.

## Inventario y separación de estados

El [registro de evidencia](evidence/2026-09-09-cambios-docx-audit.json) conserva las referencias, el inventario completo y las sondas. Inventario inicial: **61 worktrees, 31 prunable y 13 sucios**, todos preservados; **87 refs remotas** (incluye `origin/HEAD`), **121 issues abiertas**, seis milestones, 120 PR recientes examinadas y un inventario completo de **15 PR abiertas**. La consulta completa añadió PR185, fuera de esas 120 recientes; PR355 fue incorporada después como delta de integración. No se borró ni limpió ningún worktree.

El checkout inicial era `main` `4475baa`; se creó `codex/docx-coverage-audit-20260909` desde `origin/staging` `9745194c`. El código principal se auditó en esa base. Para preservar el bloque de retiradas ajeno, el worktree documental avanzó después a `6803252` (PR355); los cambios propios siguen siendo exclusivamente documentales.

| Capa | Stage | Producción |
| --- | --- | --- |
| Git integrado | `9745194c` al comienzo; `6803252` tras PR355, merge 17:20:01 UTC. | `4475baaa9a9d560711b8b9e14a38055aecb79c1f`. |
| Runtime observado durante auditoría | App 28: la primera lectura sirvió `9745194c`, con cinco imágenes de código `e6e3cbb`, tras PR354/Coolify 1467. Handoff final del coordinador, 17:29–17:33 UTC: **`6803252` servido**, CI 34382259657 y Coolify `q8cgs8c0sgc8osko8w084sos` terminados; DApp reconstruida y cuatro imágenes reutilizadas. QA de Pool contrastada con límites en la fila canónica. | App 12 sirve `4475baa`, coincide con `main`. El SHA de la DApp no identifica por sí solo el binario del juego. |
| Identidad nueva | BSC97; `cukies-hub-staging`, `cukies-legacy-staging`, `cukieshub-new-staging`. | BSC56; `cukies-hub`, legacy `cukies`, economía `cukieshub-new`. |
| Legacy | Las mismas 14 addresses BSC56/TRON mainnet que producción; destinos/cursores Stage separados. | Contratos Legacy existentes. No se autorizó redespliegue, transacción ni mutación en mainnet. |
| Gates observados | Créditos `true`; Game economy, reward accounting, Cukie Pool y weekly ranking `false`; Bridge `disabled`; Marketplace V2 address vacía; HMAC administrativo configurado. Tener contenedor running no significa gate activo. | Los cinco gates económicos anteriores `false`; pipeline Master NFT `false`; Embajadores visible `false`; HMAC administrativo configurado. |

### Responsables existentes

| Clave | Tarea, rama y coordinación |
| --- | --- |
| ORQ | «Orquestador de tareas», `01a07aec-6bc1-7203-8f43-357ed4b8931c`; integra hallazgos y secuencia. Créditos/runtime PR329–333, 340, 343, 345, 347, 349. |
| POOL | ORQ, `codex/pool-single-experience`, worktree `pool-single-experience/cukies-hub`, PR355, commit funcional `d4e2cc9`, merge `6803252`. No se editó esa rama. |
| EMB | «Actualizar reglas de embajadores», `01a08621-beff-7d40-9aa8-db104e643659`; PR351 main y PR352/353 Stage/evidencia. Antecedente: «Ajusta flujo de embajadores (3)», `01a0814e-0ea0-7070-877c-701f264243e7`. |
| MKT | «Recupera precios, compraventa y fichas…», `01a0854e-bdff-7fe0-a7b5-2916abed2270`; worktree `e3dc`, `codex/marketplace-final-evidence`, `4e7c370`; PR342/344/348/350. Trabajo previo Legacy cerrado en su alcance; los huecos nuevos se coordinan por ORQ en fila 2A-C. |
| LEG | Fila D/1/post1/post2; `codex/legacy-migration-inventory`, `codex/nft-recurrence-deploy-evidence`, PR346 para Game/matchmaking. Issues 160/249/321 y PR250 cubren seguridad, preview e indexación. No hay responsable de implementación confirmado para cada flujo restante; asignación por ORQ. |
| UX | «Diseña la experiencia integral de Cukies…», `01a08145-3d11-7711-b921-a54e029929a1`, worktree `2cf0`; diseño/prototipo, no implementación. Fila 5/#289 conserva coordinación. |
| IMG | «Publica assets NFT en MinIO y regenera…», `01a0817d-b179-7ba0-aa3e-bbeca0d0dc0a`, worktree `8e53`, `codex/card-assets-final-evidence`, `60ea427`; PR337–339. |
| GAME | `games/sybil-slayer` de este monorepo, Treasure Hunt; Stage app31 y proxy `/treasurehunt-game`, producción `https://treasurehunt.cukies.world/`. PR298 y ramas `treasure-hunt-polish`/`treasure-hunt-ux-redesign` son antecedentes, no fixes acreditados de C1/C2. Owner de implementación pendiente de asignar por ORQ. |
| INFRA | «Optimiza despliegues lentos en stage», `01a0859a-cf4d-77a0-a137-6db60a0a0f96`; PR349/350/354. Ventana cedida a POOL tras postflight `9745194c` y devuelta a INFRA tras QA `6803252`; se preserva su fila. |

Los milestones actuales son Phase 0–5. Se leyeron #141 y sus comentarios, y #287: conservan texto histórico de M0.5/PR295 que no reemplaza el estado servido actual. Esta auditoría responde al alcance explícito del usuario, no selecciona una implementación de otra fase. No se cerraron issues ni se añadieron nuevas para duplicar tareas existentes.

## Índice de evidencia

Todas las rutas de código siguientes están en el SHA base `9745194c`, salvo indicación expresa. Los resultados de pruebas previas se atribuyen a sus artefactos; no se reejecutaron suites de producto para este cambio documental.

| Clave | Evidencia y alcance |
| --- | --- |
| R | [Sondas e inventario 9/09](evidence/2026-09-09-cambios-docx-audit.json): health, catálogo/orders, contratos públicos, Points, docker ps/inspect con allowlist de campos. Stage catálogo 200, V2 orders 503; main ambos endpoints V2/catálogo conjunto 404. Los 404 del reinicio no se clasifican como defecto estable. |
| A | [Embajadores lifecycle](evidence/2026-09-09-ambassadors-lifecycle.json): main 4475baa/Coolify 1464, Stage e6e3cbb/Coolify 1465, migraciones 19/2, preservación y replay 0; QA gasless/admin restaurada. Código: `ambassadors/repository.ts:298–389`, `eligibility.ts:166–244`, `confirmation.ts:68–148`, `admin.ts:279–383`; componente `ambassador-program.tsx:318–422,460–565`; reglas `uki-current-operating-rules.md:477–543`. |
| A2 | Política/contabilidad: `ambassadors/types.ts`, `rewards/accounting.ts:536–610`, `rewards/accounting-repository.ts`, `game-economy/treasure-hunt.ts`, `treasure-hunt-competition/server/settlement-mongo.ts`; API `internal/ambassadors/sponsor/route.ts:24–139` y CLI `dapp/scripts/ambassadors-admin.ts`. Un nivel 500 bps actual, no activación de ejemplos futuros. |
| C | [Recuperación créditos](legacy-marketplace/evidence/2026-09-08-stage-data-recovery.json): grants incorrectos contenidos, fuentes 5 → 4 → 0, incidentes e historial preservados. [Corte y custodia](legacy-marketplace/evidence/2026-09-09-credit-period-and-pool-custody.json): corte 11:00 abierto 11:00:54.863, latencia y QA fechadas. |
| S | [Runtime compartido](legacy-marketplace/evidence/2026-09-09-shared-app-runtime.json), PR340/341; `app-runtime-provider.tsx:287–411,482–590,661–719`; `credits/public.ts:166–227`. Código ausente de main auditado. |
| N | `cukies-data/my-collection.ts:49–80,348–400`; `my-cukies-panel.tsx:96–160,267–286,312–388`; `cukie-master/nft-vault-panel.tsx:38–248`; contrato `CukieMasterNftVault.sol:85–137,195–209`; PR347. Main tiene vault/contrato previos, pero no el nuevo panel de Mis Cukies ni la coordinación compartida. |
| P | [Retiradas de prueba](evidence/2026-09-09-pool-test-retirements.json), relectura root del bloque 130059996, 17:05:20Z: #98000007 fuera; #98000001/003/004 en Pool anterior hasta 10/09 14:00 UTC (16:00 Andorra). Fuente inicial válida `/tmp/cukies-pool-retirements-root-verified.json`; se descarta `/tmp/cukies-pool-previous-final-evidence.json`. PR355 sirve `6803252`; QA del coordinador 17:29–17:33 UTC: colección 12 = 2 wallet + 9 Pool + 1 Master; pantalla Pool con seis posiciones actuales y tres antiguas pendientes accesibles desde la colección. [Informe UI del coordinador](evidence/2026-09-09-pool-ui-qa.md); health/manifest/plan/deploy y handoff quedan en R. Las capturas solo existen inline en su tarea; runtime Luna es un resumen atribuido sin archivo raw propio. No hubo firmas de esta auditoría. |
| I | Fila Cards/assets de [seguimiento](antes-del-15-seguimiento.md#inventario-y-bloque-legacy-antes-del-15): 18 indexed y 17.464 legacy conciliados, canarios CAS y 37 GET anteriores. `cukie-pool/status-panel.tsx` conserva `CukiImage`; guards de dos workers observados por INFRA. No equivale a depósito firmado y comprobado ahora. |
| V | `packages/contracts/contracts/CukiesMarketplace.sol:203–245,291–375,433–502`; tests `packages/contracts/test/cukies-marketplace.test.cjs`; UI `uki-marketplace/buyer-checkout.tsx:44–70,143–418,452–475`; config `uki-marketplace/public-config.ts:76–145`; listing/checkout/inventory/ABI en misma carpeta; seller panel 582–816. Árbol main sin V2. |
| V2 | Indexer `packages/chain-indexer/src/normalize.ts:234–274`, `projectors/index.ts:687–909`; `uki_marketplace_orders`. `StagingCukiesMarketplaceSource` es fixture de eventos, no evidencia de un deploy operativo de `CukiesMarketplace`. |
| L | [Inventario Legacy](legacy-marketplace/README.md), [14 contratos](legacy-marketplace/contracts.json), ABIs BSC/TRON; `config/event-manifest.ts`, `legacy/contracts.ts`, `config/legacy-env.ts`, `legacy/identity.ts`; consumers/producers en README. Source repo `/Users/fgomezserna/Proyectos/cukies-world`, Development `f6ed108682260c8e62844b686a60299843bbd619`. |
| L2 | `legacy-marketplace/bridge-runtime.ts:98–213`, `bridge-client.tsx:237–272`; `breeding-client.tsx:302–360,649–734`, `cukiepoints-client.tsx:119–190,249–336`; sidebar `layout/app-layout.tsx:96–128`, herramientas `my-cukies-panel.tsx:377–388`. |
| M | `legacy-marketplace/marketplace-actions.tsx:371–442,578–673,694–800`, seller-panel, adapters BSC/TRON; `marketplace/[tokenId]/page.tsx:278–352`, `marketplace/page.tsx:35–65`; catálogo/filtros `legacy-marketplace/marketplace-client.tsx`; PR344/348 y QA previa de MKT. |
| J | [Sondas de juego](evidence/2026-09-09-game-docx-probes.json): config de ambos hosts, tótem+5 overlays+1p/vs y rewrite raíz; 17 GET PNG 200 con hash/MIME/longitud. `game-container.tsx:78–179,1687–1759`; `mode-select-modal.tsx`; `treasure-hunt-competition/client/coordinator.ts:202–301`; endpoint `/api/games/treasure-hunt/competition/attempts`; `use-treasure-hunt-credit-access.ts:80–150`. |

## Comprobaciones del DOCX

En las tablas, **C** significa código integrado, **S** evidencia de Stage y **P** producción. «QA previa» siempre tiene fecha/SHA en la evidencia referenciada; «sin verificar» no se convierte en fallo confirmado. La fila canónica identifica el único lugar de seguimiento. No se certifican firmas o transacciones nuevas.

### Jugar y Cukie Master

| ID y fuente | Fila | Requisito | Resultado fechado | Evidencia | Responsable y siguiente acción |
| --- | --- | --- | --- | --- | --- |
| J01 P02 | 3 | Explicar los 5.400 créditos. | S: cifra reportada no reconciliada; los 800 de PR317 / 300 de QA posterior no la explican. P: economía nueva desactivada. | C,R | ORQ: ledger por wallet y período exactos. |
| J02 P02 | 3 | Comprobar acumulación, replays y caducidad de repartos atrasados. | C: ledger/idempotencia/expiración; S: incidentes históricos contenidos sin reescribir emisiones. Falta reconciliar esos 5.400. | C | ORQ: grants/reservas/consumo/expiración y procedencia sin otro backfill. |
| J03 P03/C1 | 3/5 | Con créditos, entrar correctamente a jugar. | C: guards y callback exacto localizados; S: no reproducido intento de la captura; P: tampoco. No atribuir a saldo o wallet sin endpoint. | J,S | GAME/ORQ: correlacionar sesión, intento y reserva. |
| J04 P03/C1 | 5 | Eliminar el menú antiguo del recorrido solicitado. | C: `mode-select-modal` sigue consumido; ninguna PR acreditada lo elimina de este recorrido. | J | GAME/UX: definir una sola entrada y conservar creación idempotente. |
| J05 C1 | 5 | Corregir personajes rotos del selector. | S/P: 1p.png y vs.png (200, PNG) hoy. El fallo histórico no se reproduce solo con GET. | J | GAME: render en viewport/contexto real de C1. |
| J06 P05/P07/C2 | C/5 | Mostrar tótem durante partida de Moha en mainnet. | C: HUD identificado en Treasure Hunt; S/P: tótem/overlays 200. Falta render exacto; no incidencia de Unreal acreditada. | J | GAME: layout/carga del HUD móvil y 2/5 runas; preservar owner del monorepo. |
| M01 P10/P11/C3 | 3/5 | No pasar a Continuar staking sin evidencia de fase previa. | C: estado `approval_confirmed` reanudable; enlace de captura no prueba depósito. S: caso histórico no reproducido; P: UX anterior. | N,P | ORQ: estado persistido por identidad+receipt de aprobación. |
| M02 P10/P11/C3 | 3/5 | Continuar staking debe responder. | C: guard / continuación existe; S: #3 sigue en otro Pool y no debe depositarse. No está acreditado el flujo limpio approve→resume→deposit. | N,P | ORQ: probar continuidad con NFT disponible, sin alterar el caso custodiado. |
| M03 P12/C4 | 3 | Investigar fallo de NFT 98000001. | S: custodia Pool anterior acreditada y guard PR347 integrado; no candidato a Master. El rechazo no prueba fallo wallet. | N,P | POOL: mantener salida solicitada y acción correcta hasta 14:00 UTC del 10/09. |
| M04 P12 | 3 | Investigar fallo de NFT 98000004. | S: misma custodia previa acreditada; no aparece en C4 pero sí en texto y lectura root. | N,P | POOL: mismo criterio; no repetir depósito. |
| M05 P13 | 3 | Preservar funcionamiento NFT 98000002. | Reporte positivo del usuario; C: guard por token. Sin transacción nueva para ese NFT. | N,C | ORQ: control positivo cuando se valide flujo autorizado. |
| M06 P13 | 3 | Preservar funcionamiento NFT 98000005. | Reporte positivo; las observaciones de custodia cambiaron durante el 9/09 y están fechadas. No fijar una captura como saldo actual. | N,C | ORQ: control positivo owner/posición/recibo por bloque. |
| M07 P13 | 3 | Preservar funcionamiento NFT 98000006. | Reporte positivo; no se degrada por ausencia de nueva firma. | N,C | ORQ: incluir en matriz token / custodia, sin repetir transacción. |
| CR01 P15 | 3 | Explicar y reducir espera de unos 3 min al corte. | S: corte 11:00 abrió 54,863 s después; C: espera de bloque/watermarks y aviso. No hay SLA 3 min ni prueba de todos los cortes. | C,S | ORQ: medir serie de cortes y resolver causas de espera, sin adelantar maduración. |
| CR02 P16/C5 | 3 | Coherencia 300 para jugar / 0 en partidas / 0 usados / 300 aportados al Pool. | Captura registra reparto por destinos; no equivale a 600 libres para jugar ni demuestra 5.400. S: falta su período exacto. | C | ORQ: asociar los cuatro indicadores al mismo período/fuente. |

### Embajadores

Para E01–E24: C está integrado en main 4475baa y Stage e6e3cbb y servido en ambos. S permite publicación; P conserva `NEXT_PUBLIC_AMBASSADORS_VISIBLE=false`. A conserva la QA anterior y sus límites; R revalida identidad y flags, sin mutar patrocinadores. No se duplican PR351/352.

| ID y fuente | Fila | Requisito | Resultado fechado | Evidencia | Responsable y siguiente acción |
| --- | --- | --- | --- | --- | --- |
| E01 P17.1 | 4 | Master necesario para enlace personal. | C: `canInvite = Master && sponsor`, excepción raíz CW explícita. S: QA sin Master sin link. | A,R | EMB: conservar; validar ciclo real del rol. |
| E02 P17.1 | 4 | Master necesario para nuevas comisiones. | C: captura elegibilidad por fuente y liquidación; sin pago financiado live en esta auditoría. | A2 | EMB: prueba económica separada de visibilidad. |
| E03 P17.1 | 4 | Conservar referidos al perder rol. | C: no se borran relaciones; QA migración conservó historia. P/S: no pérdida real forzada. | A | EMB: probar pérdida sin borrar historial. |
| E04 P17.1 | 4 | Desactivar enlace al perder rol. | C: lookup revalida `canInvite`; QA anterior enlaces 404. Un 404 solo no prueba causa. | A | EMB: contraste con rol conocido al mismo bloque. |
| E05 P17.1 | 4 | Reactivar el mismo enlace al recuperar rol. | C: código determinista y `$setOnInsert`; migración preservó códigos. Ciclo live completo no ejecutado. | A | EMB: loss/recovery controlado y código idéntico. |
| E06 P17.1 | 4 | Reanudar futuras comisiones al recuperar rol. | C: fuente nueva con elegibilidad nueva; sin retroactividad ni cobro live demostrado. | A2 | EMB: validar límites temporales en fuente/claim. |
| E07 P17.2 | 4 | Conservar referidos de preventa. | S/P: migración verificada, relaciones/códigos previos intactos y replay 0. | A | EMB: no repetir migración por esta auditoría. |
| E08 P17.2 | 4 | Consultar esos referidos sin Master. | C: panel y lista independientes del permiso de invitar; QA sin Master. P: listado público desactivado. | A | EMB: QA de cuenta histórica con referidos. |
| E09 P17.2 | 4 | Preventa sin Master no concede enlace. | C: participación no sustituye Master; interpretación explícita de errata P17. | A | EMB: preservar criterio en regresión. |
| E10 P17.2 | 4 | Preventa sin Master no genera nuevas comisiones. | C: también protege nuevos manifiestos legacy; anteriores no se recalculan. | A2 | EMB: probar fuente legacy + manifest existente, sin retroactividad. |
| E11 P17.3 | 4 | Preventa sin sponsor asignada a CW. | P: 19 materializados; S: 2; QA/replay verificados antes, flags actuales correctos. | A,R | EMB: conservar evidencia, sin otra escritura. |
| E12 P17.3 | 4 | Impedir autoasignación tardía de preventa. | C: `canChooseSponsor` excluye participantes, override solo admin. | A,A2 | EMB: mantener negativo autoservicio. |
| E13 P17.4 | 4 | Navegar sin fijar/perder sponsor. | S: QA login→Dashboard→Master conservó sin confirmar; C: invitación en sesión pestaña. | A | EMB: conservar, validar variante con link. |
| E14 P17.4 | 4 | Firmar login no confirma sponsor. | C/S: retos separados, QA antes/después. | A | EMB: no mezclar autenticación con consentimiento. |
| E15 P17.4 | 4 | Antes de confirmar ver solo el paso de sponsor. | C: `canShowDashboard` requiere sponsor; no permite estadísticas previas. Falta QA visual de todas variantes. | A | EMB: revisar móvil/nuevo/presale/raíz. |
| E16 P17.4 | 4 | Sin enlace proponer CW. | S: QA gasless CW completa; C: no fallback silencioso de invitación inválida. | A | EMB: mantener distinción vacío/inválido. |
| E17 P17.4 | 4 | Con enlace proponer wallet invitadora. | C: resuelve código y muestra wallet masked; código condicionado a elegibilidad. No nueva aceptación real con link. | A | EMB: variante sponsor Master activo y pérdida durante confirmación. |
| E18 P17.4 + directo | 4 | Confirmación específica sin gas. | C/S: signMessage, reto de 5 min por wallet/sesión/origen/red/sponsor; no tx. | A | EMB: conservar reto y verificación anti-replay. |
| E19 P17.4 | 4 | Estadísticas después de confirmar. | C/S: dashboard tras atribución en QA; no mutación en esta auditoría. | A | EMB: conservar orden. |
| E20 P17.4 | 4 | Mostrar enlace propio solo si cumple rol. | C: frontend y backend; sin Master devuelve profile/enlace no utilizable. | A | EMB: pruebas con ambas rutas Master. |
| E21 P18.5 | 4 | Evitar autorreferencias y ciclos. | Usuario confirma prueba; C: fence Mongo, recorrido y override; S: QA rechaza 409. | A,A2 | EMB: conservar; no reabrir por ausencia de otra prueba. |
| E22 P18.5 | 4 | Sponsor asignado antes de invitar. | C: gate exige Sponsor; raíz CW exenta por regla institucional. | A | EMB: no exigir sponsor artificial a raíz. |
| E23 P18.6 | 4 | Administración puede asignar sponsor. | API/CLI implementadas, HMAC dedicado presente S/P; QA Stage hizo asignación y restauración. No panel admin acreditado. | A,A2,R | EMB: operar por canal existente con motivo/precondición. |
| E24 P18.6 | 4 | Administración puede corregir sponsor. | C: override auditado/idempotente, sin backdating ni rehacer pagos; S: replay/conflicto/restauración probados. | A,A2 | EMB: no duplicar servicio; UI admin solo si se solicita. |
| E25 P19.7 | 4 | Viabilidad requisitos y porcentajes distintos, ejemplo 5% / 2%. | **Viable como evolución**, exige política versionada y presupuesto; actualmente un nivel 500 bps. No activar. | A2,reglas 477–543 | EMB/Producto: especificación futura, sin tarea de activación ahora. |
| E26 P19.7 | 4 | Viabilidad de un segundo nivel al 3% con cinco Master directos. | **Viable**, requiere snapshot de grafo/rol, presupuesto, vigencia y antirrecursión. No existe activación de ese nivel. | A2,reglas 477–543 | EMB/Producto: diseño futuro separado; sin nuevos porcentajes. |

### Pool, Mis Cukies y sincronización

| ID y fuente | Fila | Requisito | Resultado fechado | Evidencia | Responsable y siguiente acción |
| --- | --- | --- | --- | --- | --- |
| PO01 P20 | 3/5 | Mantener imágenes al depositar y mostrar posición. | C: imágenes/pendientes conservados; S: QA previa + pipeline assets recuperado; depósito exacto antes/después no reproducido. P: sin paridad. | I,N,P | IMG/POOL: comprobar card durante pending/syncing/depositada, sin backfill masivo. |
| MC01 P21 | 5/2A | Ordenar/filtrar en venta. | C: filtro `listed` y prioridad 0; S: panel QA previo; P: panel nuevo ausente. | N | ORQ/MKT: incluir Legacy/V2 y paginación completa. |
| MC02 P21 | 5/3 | Ordenar/filtrar en préstamo. | C: Pool actual/recuperación prioridad 1; préstamo de partida no equivale a transferir NFT. | N,P | POOL: comprobar estado activo/pendiente/salida. |
| MC03 P21 | 5/3 | Ordenar/filtrar staking Master. | C: filtro Master; S: inventario QA reconoce custodia. | N,C | ORQ: mantener beneficial owner y filtro. |
| MC04 P21 | 5/3 | Ordenar/filtrar disponibles para jugar. | C: wallet + available; S: snapshots difieren por transacciones reales. No contar custodiados como disponibles. | N,P | ORQ: validar fuente completa antes de habilitar uso. |
| MC05 P21 | 3/5 | Retirar staking Master desde card. | C: CTA contextual y guard final en vault; S: lectura QA, sin firma nueva. | N | ORQ: cerrar recorrido token→retirada→receipt. |
| MC06 P21 | 3/5 | Solicitar/retirar Pool según estado. | C/S: PR355/`6803252` servida; QA root confirma Salida solicitada, fecha y Ver retirada para #1/3/4, sin botón prematuro; #7 Disponible. | P,N | POOL: cambio de experiencia verificado; retirar los tres NFT tras el plazo solo con autorización vigente y comprobar cadena/indexación. |
| MC07 P21 | 2A/5 | Cancelar venta desde card. | C: ruta diferente Legacy/UKI; S: Legacy QA de lectura, sin cancelación firmada ahora. | N,M | MKT: validar vendedor escrow, receipt y reconciliación. |
| MC08 P21 | 3/5 | Depositar Pool si está disponible en wallet. | C: `deposit_pool` por readiness / custodia; destino conserva token. S: prueba lectura. | N | POOL: validar acción final y actualización común. |
| MC09 P21 | 2A-C/5 | Poner en venta desde card. | **Hueco confirmado C**: `canSell` excluye 97 y depende de V2 para 56. S: V2 no configurado. | N,V,R | MKT/ORQ: corregir regla de acción e identidad sin duplicar panel. |
| MC10 P21 | 3/5 | Stakear Master solo Originales disponibles. | C: generación original + readiness; contrato/guard final. S: casos 1/4 bloqueados por custodia correctamente. | N,P | ORQ: control Original vs segunda/seiku y owner actual. |
| G01 P23 | 5/B | Actualizar 19.000 + 1.500 → 20.500 UKI. | C/S: runtime compartido/refresh posttx; suma concreta no reproducida. P: runtime compartido ausente. | S | ORQ: correlación receipt→fuente → UI sin duplicar fuente. |
| G02 P23 | 5/3 | Reflejar el nuevo cupo Master al mismo tiempo lógico. | C: refresco compartido, cuota distingue elegibilidad/materialización. No prometer crédito inmediato antes de madurar. | S,C | ORQ: misma identidad/corte y mensaje de sincronización. |
| G03 P23 | 5/3 | Créditos reconoce ese Master sin otra espera de navegación. | S: QA de coherencia previa; falta prueba secuencia exacta cruzando 20.000. | S,C | ORQ: un refresh posttx y medición de watermarks. |
| G04 Directo general | 5 | No representar desconocido como 0. | S: recursos de runtime distinguen `unknown`; **hueco C** en resumen de Mis Cukies: ``summary?.total/inWallet/... ?? 0`` se renderiza antes de resolver carga. | N (267–286),S | ORQ/UX: extender estado común a resumen de Colección, sin otro provider. |
| G05 Directo general | 5 | Recuperar estado sin reconectar wallet. | C/S: provider persistente y reintentos; resiliencia de todos los escenarios no acreditada. El coordinador confirma que persiste el banner global «Estamos recuperando el estado» tras PR355; ya aparecía antes del deploy. Su causa no está acreditada. | S,R | ORQ: prueba offline / stale / cambio de identidad y guard final. |

## Requisitos adicionales

Son comprobaciones de cobertura dentro de las mismas filas; no son nuevas tareas. Las coincidencias con MC09, D/1 y 2C se enlazan expresamente.

### Venta y contratos Legacy

| ID y fuente | Fila | Requisito | Resultado fechado | Evidencia | Responsable y siguiente acción |
| --- | --- | --- | --- | --- | --- |
| SV01 adicional1 | 2A-C/5 | Botón «Vender» visible desde Mis Cukies. | Véase MC09: el CTA existe; su predicado de disponibilidad excluye BSC97 y acopla Legacy BSC56 a V2. | N | MKT/ORQ: única corrección de disponibilidad. |
| SV02 adicional1 | 2A-C | Venta desde ficha. | C: la ficha Legacy monta `MarketplaceActions` con estado/owner; gestión V2 separada. Sin prueba firmada. | M,V | MKT: ficha/CTA coherente con tipo de activo. |
| SV03 adicional1 | 2A-C | Venta desde Marketplace. | C/S: «Vender / mis anuncios» y panel Legacy; V2 muestra no configurado. | M,R | MKT: preservar entrada visible y motivo de bloqueo. |
| SV04 adicional1 | 2A-C | Propiedad, venta, custodia, red y acción final. | C: revalidación Legacy BSC/TRON; V2 owner/approval/nonce. QA de lectura no prueba listing firmado. | M,V,N | MKT: matriz de guardas y receipt/evento/catálogo. |
| L01 adicional2 | D/5 | Sidebar contiene Bridge/Crías/Points. | **Falta C** en `navigationGroups`; solo herramientas de Mis Cukies. | L2 | LEG/UX: acceso común a flujos existentes. |
| L02 adicional2 | D/5 | Menú móvil coherente con sidebar. | El mismo array compartido: faltan los tres también en móvil. | L2 | LEG/UX: resolver con la misma navegación, validar foco/scroll. |
| L03 adicional2 | 1 | Bridge funcional en Stage con Legacy mainnet. | **Configuración actual incompatible**: guard disabled/testnet Nile 97; runtime disabled, relayer ausente. | L2,R | LEG: ruta Legacy mainnet, custodia/fee/replay, sin activar Nile como sustituto. |
| L04 adicional2 | post2/D | Breeding funcional Stage sobre Legacy mainnet. | C: UI/ABIs; S: paridad de ciclos/lecturas/acciones no certificada. | L,L2 | LEG: padres/hijos, start/finish, permisos y backfill/replay. |
| L05 adicional2 | D/post2 | Distinguir breeding del contrato Bread. | Inventario de 14 addresses sin alias Bread. Repo Legacy contiene ítems Bread 10178–10181/10214–10217; **contrato Bread solicitado sin identificar**, no asumir equivalencia. | L, repo Legacy output/items | LEG/ORQ: obtener address/ABI/deployment antes de concluir existencia/ausencia contractual. |
| L06 adicional2 | post1/D | Cukie Points funcional Stage sobre Legacy mainnet. | C: interfaz/ABIs; S: `/api/cukies/points` vacío; P: historia 3094 BSC en sonda. No están acreditados ni la paridad de datos ni un saldo real de cero. | L2,R | LEG: reconciliar claimed/pending por red + wallet + cutoff. |
| L07 adicional2 | D | Mismo Legacy en producción. | Config pública S/P coincide en 14 addresses BSC56/TRON; misma fuente, distintos destinos. | R,L | LEG: conservar contratos, verificar consumidores. |
| L08 adicional2 | D/3/2C | Contratos nuevos Stage en testnet. | Config 97 y DBs Stage observadas; V2 address vacía. | R,V | ORQ: exigir identidad 97 completa por contrato. |
| L09 adicional2 | D/3/2C | Contratos nuevos de producción serán otros. | Requisito registrado; no promover addresses/fixtures 97. V2 no está en main. | R,V,L | ORQ: manifest 56 separado cuando toque, no deploy ahora. |
| L10 adicional2 | D | No redesplegar Legacy en testnet ni mezclar BD/identidad. | C: identity/red + contrato; R: destinos Stage/Prod separados. Paridad de datos incompleta. | L,R | LEG: seguir aislamiento, no pruebas con writes mainnet. |
| L11 adicional2 | D | Auditar contratos e interfaces ABI. | Inventario de 14 addresses/16 ABIs y bundles de fuente; Bread fuera de identidad. Owners/keys no equivalen a custodia acreditada. | L | LEG: cerrar proveniencia/roles por contrato antes de operar. |
| L12 adicional2 | D | Auditar los eventos, incluido breeding. | C: manifest/projectores; no hay replay completo vivo certificado. | L | LEG: cubrir Mint/Burn/Stake/Unstake/Breeding/Bridge/listings por red. |
| L13 adicional2 | D | Auditar indexadores y cursores. | R: nuevo indexer running; `legacy-chain-indexer` ausente. #321 RPC archivo sigue abierta. | L,R | LEG: #321/PR250, identidad/cutoff/reorg/replay antes de activar. |
| L14 adicional2 | D/1 | Auditar workers/relayers. | R: dos card workers running; legacy indexer/bridge relayer ausentes. Infra conserva 11 servicios app28 con gates false. | R,L | LEG: mapear producer/consumer/sync, no inferir avance por health. |
| L15 adicional2 | D/post1/post2 | Auditar datos completos y paridad. | C: inventario/source proofs previos; S: Points vacío y catálogo de fuente parcial. No retirar BBDD/repo Legacy. | L,R | LEG: reconciliación por contrato con discrepancias, no por muestra exclusiva. |

### Marketplace V2

Respuesta expresa a las **cuatro reglas**:

| Regla | Contrato integrado en Stage | UI | Config/live actual | Conclusión actual |
| --- | --- | --- | --- | --- |
| Precio y cobro del vendedor en UKI | `ukiPrice`; `buyWithUki` y swaps exact-output entregan exactamente ese UKI al seller. | Publicación precio UKI; validación de decimales 18. | Stage address vacía/orders 503; main no V2. | Sí en código; no operativo verificado. |
| Comprador elige token permitido | `paymentTokenAllowed`, UKI directo, `nativePaymentAllowed` y paths. | Solo UKI/BNB/USDT. ASM/USDC no tienen selector/config. | Allowlist/rutas/liquidez operativas V2 no acreditadas. | Parcial en UI; lista definitiva por aprobar. |
| Otro token convierte solo la parte vendedor a UKI | `swapTokensForExactTokens` / `swapETHForExactTokens`, receptor seller; input limitado y refund. | Quote, `maxPayment`, deadline y 1% slippage en swaps. | Sin swap/receipt V2 real probado. | Sí en código; E2E pendiente. |
| Fee de plataforma queda en moneda de entrada | ERC20 a `feeRecipient`; BNB acreditado en `claimableNativeFees` y retirable. La fee no entra al swap. | Quote separa importe/fee/total; depende de config real. | Sin balances/liquidación/cobro V2 observados. | Sí en código; fee BNB acreditada no es cobrada. |

La secuencia exacta importa: antes del swap se limita `maxSwapInput` reservando margen para fee. **Después** se calcula la fee real sobre el input gastado, se devuelve el sobrante y se entrega el NFT. Para ERC20 la fee se transfiere en esa moneda; para BNB permanece en el contrato hasta `claimNativeFees`. No se puede afirmar que la transferencia definitiva de fee ocurra antes del swap. Es una transacción atómica con protección de reentrada; su funcionamiento real exige router, liquidez, allowlists, configuración y contratos correctos. El porcentaje se captura por orden desde configuración; no se inventa uno nuevo en esta auditoría.

| ID y fuente | Fila | Requisito | Resultado fechado | Evidencia | Responsable y siguiente acción |
| --- | --- | --- | --- | --- | --- |
| V01 adicional3 | 2C | Vendedor lista precio UKI. | C: `createOrder`/`ukiPrice`; P: ausente. S: no disponible. | V,R | MKT: identidad + listing QA cuando autorizado. |
| V02 adicional3 | 2C | Vendedor cobra UKI exacto. | C: transfer/exact-output al seller; no hay balance after real. | V | MKT: reconciliar neto UKI con receipt. |
| V03 adicional3 | 2C | Comprador elige token permitido. | C: contrato genérico; UI limitada a UKI/BNB/USDT. | V | MKT/Producto: lista definitiva y config por entorno. |
| V04 adicional3 | 2C | Convertir seller share a UKI. | C: router exact-output; fee distinta y refund. Sin E2E. | V | MKT: cotización → swap → seller → NFT. |
| V05 adicional3 | 2C | Fee en moneda del comprador. | C: ERC20 transfer; BNB crédito retirable; no depende de convertir fee. | V | MKT: balances fee + claim BNB separados. |
| V06 adicional3 | 2C | Cotización real y presupuesto. | C: lecturas de order/router/token/path/fee y redondeo conservador. No hay cotización V2 live. | V | MKT: validar quote contra router configurado. |
| V07 adicional3 | 2C | Slippage/deadline. | C: 1% en swaps/`maxPayment`; UKI directo sin margen; deadline en contrato. | V | MKT: probar precio cambia/deadline expira/revert atómico. |
| V08 adicional3 | 2C | Decimales. | C: UKI 18 exigidos; USDT leídos; no hay configuración genérica ASM/USDC. | V | MKT: unidades raw/redondeo por token aprobado. |
| V09 adicional3 | 2C | Approvals NFT/ERC20. | C: owner/approval/nonce y allowance; router `forceApprove`/clear. | V | MKT: aprobación revocada, cambio de red/wallet, amount máximo. |
| V10 adicional3 | 2C | Liquidación atómica. | C: preparación de orden + swap/refund/NFT `nonReentrant`; no hay evento real. | V | MKT: owner, buyer, seller, fee, refund y estado de orden. |
| V11 adicional3 | 2C | Recibos/eventos/indexación. | C: `OrderCreated/Filled/Cancelled/Invalidated/Nonce/fees`; proyector. Fixture Stage no es Marketplace operativo. | V2 | MKT/LEG: matching receipt + codehash + cursor + replay. |
| V12 adicional3 | 2C/5 | UX del recorrido completo. | C: seller panel/checkout; S: cerrado por config; venta MC09 defectuosa. | V,N,R | MKT/UX: un recorrido por activo, error/espera/éxito verificables. |
| V13 adicional3 | 2A-C | Catálogo conjunto Legacy/V2. | C: unión por origen; S: Legacy 200, UKI unavailable explícito. P: conjunto V2 ausente. | M,R | MKT: activar V2 sin perder Legacy ni presentar unknown como cero. |
| V14 adicional3 | 2A-C | Filtros Legacy/V2. | C: all/legacy/uki, red/tipo; S: lecturas Legacy verificadas anteriores. | M | MKT: cursor/precio mutable/identidad por fuente. |
| V15 adicional3 | 2A-C/5 | Cards con marca Legacy. | C: source badge + red/precio; catálogo responde `source=legacy`. Sin nuevo censo visual autenticado. | M,R | MKT/UX: contraste Legacy/V2 sin confundir monedas. |
| V16 adicional3 | 2C | No inventar porcentaje de fee. | Config por orden/contrato; no hay fee productiva V2 verificada; fee Legacy 10% no es regla V2. | V,M | Producto/MKT: fijar/leer fee verificada antes de E2E. |
| V17 adicional3 | 2C | Ejemplos ASM/BNB/USDT/USDC/UKI no son lista definitiva. | Registrado; faltan ASM/USDC UI. No asumir permisos de tokens ni rutas. | V | Producto/MKT: decisión de allowlist + slippage/decimales/rutas. |
| V18 adicional3 | 2C | No inventar contratos desplegados. | S address vacía; fixture identificada; main no V2. Ausencia de config no afirma ausencia universal on-chain. | V2,R | MKT: deployment receipt/codehash/roles/addresses por entorno. |

## Secuencia sin duplicaciones

1. **Fila 3/5, POOL/ORQ:** conservar el cierre de experiencia PR355/`6803252` y su QA. Mantener pendientes las tres retiradas físicas hasta el 10/09 a las 14:00 UTC y su comprobación posterior; la colección incluye las tres posiciones antiguas que no forman parte de las seis actuales de la pantalla Pool. Añadir continuidad Master/imágenes al recorrido existente cuando corresponda. Esta auditoría no inició ni aprobó nuevas retiradas.
2. **Fila 2A-C/5, MKT/ORQ:** corregir el predicado de venta y conectar las tres entradas. Mantener el Marketplace Legacy ya recuperado; separar contrato/config/checkout V2 y ampliar monedas solo tras decisión concreta. El E2E Stage futuro debe cubrir las cuatro reglas y separar fee BNB acreditada/cobrada.
3. **Fila D/1/post1/post2, LEG:** cerrar contratos/interfaces/eventos/datos y permisos Legacy BSC56/TRON mainnet; #321/PR250 y el inventario existente antes de activar workers. Resolver Bridge mainnet y acceso sidebar/móvil sobre esos flujos. Identificar Bread sin equipararlo a breeding. No activar Nile ni importar identidades Stage97 al Legacy.
4. **Fila 3/5, ORQ/GAME:** reconstruir 5.400 y una serie de cortes; correlacionar el intento bloqueado con API/reserva. Después retirar el selector antiguo del flujo definido. El caso tótem se reproduce en Treasure Hunt móvil; los GET actuales ya están hechos.
5. **Fila 5, ORQ/UX:** diagnosticar el banner global persistente con evidencia por dominio, completar semántica unknown/pending en Mis Cukies y validar el recorrido UKI → Master → Créditos desde el provider existente. El prototipo UX de 2cf0 no sustituye implementación ni QA transaccional.
6. **Fila 4, EMB:** conservar hotfix/migración/admin; cerrar publicación y pruebas económicas únicamente en su alcance autorizado. E25/E26 quedan como viabilidad, sin activación de nuevos niveles/porcentajes.

## Límites y validación documental

La revisión no firmó, no compró, no inició partidas, no cambió bases, flags, claves, contratos o infraestructura, no hizo deploy ni cerró issues. Los GET públicos no certifican sesiones/roles privados ni transacciones; la lectura de Docker no demuestra progreso por sí sola. Las comprobaciones de datos históricas mantienen su timestamp y se reutilizan donde prueban el mismo requisito. La pestaña Edge 1995115583 y MetaMask quedaron reservadas al orquestador. La QA final del Pool se incorpora desde su informe: no equivale a una prueba realizada por este auditor; la evidencia raw de CI se distingue del resumen del verificador y de las capturas inline.

Se validaron la unicidad de 94 IDs, el mapeo de 23 párrafos/5 capturas, los enlaces locales y `git diff --check`. Los estados de Pool que cambien después pertenecen al bloque canónico y su prueba de despliegue; este apéndice no los duplica ni los cierra automáticamente.
