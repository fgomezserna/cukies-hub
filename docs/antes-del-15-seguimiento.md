# Seguimiento operativo de `Antes del 15.docx`

Estado del documento: fuente unica del estado vigente; vivo y versionado.

Ultima actualizacion: 2026-09-09.

Contexto de esta actualizacion: coordinacion compartida del layout y despliegue
staging del 2026-09-09, continuando la auditoria UX y recuperacion de datos.
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
| Stage | Coolify app `28`, rama `staging`, `https://cukieshub.eurekand.com`; contratos nuevos en testnet `97`, fuentes legacy BSC `56`/TRON mainnet existentes y destinos Stage aislados. La decision de fuentes no equivale a activacion observada de workers. |
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
| INFRA | **WEB GRADUAL Y WORKERS SEPARADOS EN STAGING**: web app32, workers app28, Mongo LXC2007 `27018`, builder VM1012 y registry VM1007. | 2026-09-09 20:15 UTC: release `1646602`, [evidencia de transición](../infrastructure/ci/2026-09-09-rolling-delivery-evidence.json), web `ocs0ok0gowo08s0k8ck8w4w0` y workers `wg400g044k8s0gwk4o444owk` finished. [CI 34388372470](https://github.com/fgomezserna/cukies-hub/actions/runs/34388372470) SUCCESS. Diez workers, digests del manifest, indexador avanzando, Mongo PRIMARY y dos guards de tarjetas PASS. Sesión abierta conserva 12 Cukies = 2 wallet + 9 Pool + 1 Master tras actualizar colección. [Migración Mongo](../infrastructure/ci/2026-09-09-mongo-lxc-evidence.json) y [recuperación de espacio](../infrastructure/ci/2026-09-09-storage-recovery-evidence.json) conservadas. | Responsable exclusivo: tarea `01a0859a-cf4d-77a0-a137-6db60a0a0f96`; ventana retenida hasta ensayos de actualización automática, candidato unhealthy y rollback. `CUKIES_DELIVERY_MODE=rolling`, gate CI true; autodeploy Git false. [Procedimiento](deployment-rolling-transition.md). Producción sigue `4475baa` en app12; app33 provisionada sin tráfico y backport sin publicar. App31 mantiene su build independiente. GC y autoscalado no implementados. |
| 0 | Documentado; detalles pendientes de convertir en criterios. | Fuente original; 2026-09-07. | Convertir cada detalle en criterio verificable. |
| A | **CONFIRMADO POR USUARIO + OBSERVADO LIVE**: pool de liquidez activa desde hace mas de una semana. | `output/verification/pancake-mainnet-20260907.json`, BSC `56`, bloque `120529300`, `2026-09-07T16:50:13Z`; reservas `1.148.104,4871 UKI` + `4.658,0014 ASM`, LP bloqueada hasta `2027-02-23T15:33:10Z`; swaps `2026-08-31` y `2026-09-07`. | Registrar reservas/swaps/locker en cada revision; comprobar logo/ficha y la ruta USDC anunciada en el copy. Rutas BNB/USDT multihop acreditadas. |
| B | **CONFIRMADO POR USUARIO + OBSERVADO LIVE**: staking y torneo actual post-preventa funcionan. Producto: `Torneo Lanzamiento UKI`; no es el torneo antiguo de preventa. | `https://cukies.world/api/games/treasure-hunt/competition`, HTTP 200, `2026-09-07T16:50:56Z`; contrato `0xad18...59696`, campaña activa hasta `2026-09-15T15:00Z`. | Mantener evidencia de participante/firma separada; no reabrir approve/stake como fallo de estado. |
| C | **RESUELTO · confirmado por el usuario**: cierre funcional aceptado. | Confirmacion de producto; 2026-09-07. | No reabrir por falta de una prueba adicional; conservar checks como historial. |
| D | **MIGRACION POR COMPLETAR**: migrar toda funcionalidad legacy al Hub con infraestructura nueva, auth, datos y contratos seguros; dejar de usar el repo antiguo. | Decision de producto e [inventario de migracion](legacy-marketplace/README.md); 2026-09-07: 14 contratos, 34 contenedores y 16 instancias de base. | Implementación asignada el 2026-09-09 a `01a08727-0cdb-7993-bbab-6829bcf3d333` (Legacy, Luna high): primer lote de configuración por dominio y navegación; después workers y reconciliación. Inventario registrado; seguir con importacion preview y paridad por flujos completos; coordinar [#160](https://github.com/fgomezserna/cukies-hub/issues/160); cero consumidores runtime antes de retirar. |
| 1 | **EN IMPLEMENTACION LOCAL · LEGACY POR DOMINIO**: Bridge conserva las identidades BSC/TRON existentes y añade vista `legacy-readonly` en Stage; approvals, transferencias y relayer siguen bloqueados. | [LEG01–LEG06](legacy-marketplace/evidence/2026-09-09-legacy-domain-stage.md), base `origin/staging` `16466025030bfb9a0a3c784431988c5840430f93`; tests focales OK en el worktree `codex/legacy-domain-stage`. | Revisar PR #358 y publicar en Stage con la configuración servida; resolver RPC archive/#321, custodia, relayer y E2E antes de activar cualquier operación. Producción no se modifica. |
| 2A-C | **MARKETPLACE LEGACY OPERATIVO EN STAGING; PARIDAD HISTORICA PENDIENTE**: catálogo publico verificado contra contratos BSC/TRON, ficha rica y permalink histórico, venta/compra/cancelación/cambio de precio con revalidación final, bloqueo de doble envío y reconciliación Mongo tras recibo. El catálogo descarta candidatos obsoletos sin mutar el conjunto mientras pagina; el inventario vendedor pagina más de 60 NFTs. UKI V2 permanece cerrado de forma segura. | [PR #342](https://github.com/fgomezserna/cukies-hub/pull/342), [PR #344](https://github.com/fgomezserna/cukies-hub/pull/344), [PR #348](https://github.com/fgomezserna/cukies-hub/pull/348) y [PR #350](https://github.com/fgomezserna/cukies-hub/pull/350). Stage `ac521466`, [workflow `34358986091`](https://github.com/fgomezserna/cukies-hub/actions/runs/34358986091) `success`, Coolify `1463` / `qcwgsg8g8c0cogc044w0wow4` terminado 2026-09-09 13:54:36 UTC. [QA final](https://github.com/fgomezserna/cukies-hub/pull/348#issuecomment-5603123628): BSC #1000000000029 = 0,195 BNB / vendedor `0xEE73...4910`; TRON #4000000007954 = 900 TRX / vendedor `TBwucs...wD1`; ambas reconciliaciones `changed=false`, responsive 390/1440 sin overflow ni errores y logo directo/optimizado HTTP 200. | Implementación retomada el 2026-09-09 por `01a0854e-bdff-7fe0-a7b5-2916abed2270`: primero elegibilidad Vender; después configuración y liquidación V2/UKI, revisadas como lote separado. El worker `legacy-chain-indexer` sigue inactivo y no se afirma paridad general ni orden global de precio ante cambios externos todavía no proyectados. No se activa sin provisionar destino/cursor y resolver RPC de archivo BSC. Completar backfill/replay y pruebas transaccionales controladas. No se firmaron transacciones en QA. Producción/main no se modifica. |
| 3 | **EN STAGING, EN PRUEBAS · INCIDENCIA DE CUPOS/CRÉDITOS RESUELTA**: Cukie Master, creditos, pools, prestamos y rewards. | 2026-09-08 19:28 UTC, Stage `67303f6` (PR #329–#333): historial 5→4→0 NFT / UKI 0, ambas rutas al dia y 0 grants QA posteriores a retiradas. Dos ticks waiting renuevan ambas fuentes; Master/Créditos/Resumen coherentes y sin sus avisos incorrectos. 1.746 tests y gates PASS. [Evidencia](legacy-marketplace/evidence/2026-09-08-stage-data-recovery.json). | Responsable `01a0814e-0ea0-7070-877c-701f264243e7` (datos/juego, Luna high): intake asignado y ejecución en cola hasta liberar uno de los dos slots. Conserva los cierres históricos y atiende los casos nuevos del DOCX. Cierre de [#326](https://github.com/fgomezserna/cukies-hub/issues/326) limitado a esta incidencia. Continuan las pruebas amplias de economia/UX en [#289](https://github.com/fgomezserna/cukies-hub/issues/289); Vesting sigue siendo un aviso independiente. Produccion `fb2b190` sin cambios. |
| 4 | **HOTFIX VERIFICADO EN MAIN Y STAGING; PUBLICACION DE PRODUCTO PENDIENTE**: Cukie Master y sponsor confirmado para invitar, mismo codigo tras recuperar el rol, conservacion de referidos y correccion administrativa auditada. | Decision del usuario; [PR #351](https://github.com/fgomezserna/cukies-hub/pull/351), Main `4475baa`, Coolify `1464` (2026-09-09 14:09:27 UTC); [PR #352](https://github.com/fgomezserna/cukies-hub/pull/352), Stage `e6e3cbb`, CI `34362306780` intento 3 y Coolify `1465` (14:54:12 UTC), ambos health con SHA exacto. Migraciones CW: Main 19 y Stage 2; relaciones/codigos previos intactos y replay 0. Stage: login/navegacion sin sponsor, confirmacion gasless y correccion administrativa con restauracion verificadas. [Evidencia](evidence/2026-09-09-ambassadors-lifecycle.json). | Responsable de cierre de publicación y validación pendiente: coordinador `01a07aec-6bc1-7203-8f43-357ed4b8931c`; hotfix finalizado, sin nueva implementación ni activación de producción autorizada por esta coordinación. Validar aparte publicacion y claims con fondos. Visibilidad de produccion sigue desactivada; no activa porcentajes o niveles nuevos. |
| 5 | **PUBLICADO EN STAGING · RUNTIME COMPARTIDO VERIFICADO · PRUEBAS UX ABIERTAS**: wallet, red, cache y recuperacion en `AppRuntimeProvider` persistente; aviso comun del layout; Resumen, Master/NFT, Creditos y Pool consumen lecturas compartidas. Cada operacion conserva su guard final. | 2026-09-09, [PR #340](https://github.com/fgomezserna/cukies-hub/pull/340), Stage `43d8a2f`, deploy terminado 09:28:48 UTC. Lint, tipos, build y 1.773 tests PASS; sesion QA coherente con 3 cupos NFT/0 UKI y 300 creditos. [Evidencia y limites](legacy-marketplace/evidence/2026-09-09-shared-app-runtime.json). | Responsables: datos/estados/juego `01a0814e-0ea0-7070-877c-701f264243e7` (en cola), navegación Legacy `01a08727-0cdb-7993-bbab-6829bcf3d333`, venta/fichas `01a0854e-bdff-7fe0-a7b5-2916abed2270`; coordinación y QA final por raíz. Completar variantes UX y paridad legacy. Diagnosticar `DOMAIN_CONFLICT` recurrente en cortes de creditos: existia antes del rollout y recupera en ticks posteriores. No se reabre la reparacion historica del punto 3 ni se afirma resiliencia completa del backend. Main sigue `fb2b190`. |
| 6 | **SIN CAMBIO**: conservar tokenomics, evidencia y decision previa; no inventar un estado nuevo. | `docs/uki-current-operating-rules.md` y evidencia previa; contraste 2026-09-07. | Reconciliar solo cuando exista una nueva decision versionada. |
| post1-2 | **EN IMPLEMENTACION LOCAL · LECTURA LEGACY**: Cukie Points y Crías consultan las identidades Legacy existentes desde Stage con datos aislados; las escrituras permanecen cerradas por gate. | [LEG07–LEG09](legacy-marketplace/evidence/2026-09-09-legacy-domain-stage.md), `runtime.ts`, `breeding-client.tsx`, `cukiepoints-client.tsx`; base `origin/staging` `16466025030bfb9a0a3c784431988c5840430f93`. | Reconciliar claimed/pending, eventos y cursores BSC/TRON; identificar Bread por address/bytecode/ABI; activar operaciones solo tras revisión explícita. Siguen siendo bloque de migración anterior al 15. |
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

## Cobertura de cambios actualizado y requisitos adicionales

El [apéndice de cobertura del 9 de septiembre](antes-del-15-cobertura-cambios-20260909.md)
reconcilia las cinco páginas, 23 párrafos y cinco capturas de `cambios actualizado.docx`
y los requisitos adicionales de venta, contratos Legacy y Marketplace V2:
16 puntos originales, tres adicionales y 94 comprobaciones atómicas. Los IDs del
apéndice son localizadores de evidencia; las filas anteriores conservan el estado
canónico y los responsables. No constituye otro backlog ni reabre cierres de
alcance limitado por falta de una prueba adicional.

- Filas **3 y 5**: quedan por reconciliar los 5.400 créditos reportados y el intento
  de juego de la captura, la continuidad de staking tras aprobación y la secuencia
  UKI → cupo → créditos. La custodia de los NFTs 98000001/003/004 ya está acreditada;
  su retirada y experiencia de Pool se siguen en el bloque de PR355 existente.
  El resumen de Mis Cukies aún usa ceros mientras su fuente es desconocida.
- Filas **2A-C y 5**: el CTA `Vender` existe, pero su predicado excluye BSC97 y liga
  la venta BSC56 a la disponibilidad de V2. El contrato V2 cubre precio/cobro UKI,
  conversión de la parte del vendedor y fee en moneda de entrada; su UI solo
  contempla UKI/BNB/USDT y Stage responde `UKI_MARKETPLACE_UNAVAILABLE`. No se
  certifica operación V2 en Stage ni producción. La fee BNB queda acreditada
  hasta su retirada; no equivale a cobro inmediato.
- Filas **D, 1, post1, post2 y 5**: faltan Bridge/Crías/Points en la navegación
  común. El modo Bridge BSC97/Nile no cubre el requisito Legacy MAINNET desde
  Stage; el worker de eventos Legacy y el relayer no están activos. La paridad de
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
- [ ] Integrar un unico lote en `staging` y seguir el workflow de imagenes de
  app28; no lanzar un build manual ni activar su autodeploy Git en Coolify.
  Comprobar el SHA de release en `/api/health` y cada digest contra el manifest,
  admitiendo `sourceSha` anterior cuando la imagen se reutiliza. El juego app31
  sigue un despliegue independiente; coordinar tambien su ventana y espacio.
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

- [ ] Aprobar fee del marketplace nuevo.
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
| Retiradas de prueba del Pool sustituido | **BSC Testnet verificado el 2026-09-09 a las 17:05 UTC**, bloque `130059996`: `98000007` vuelve a la wallet `0x26789b…0c13`; `98000001`, `98000003` y `98000004` tienen salida solicitada y siguen depositados hasta **2026-09-10 14:00 UTC / 16:00 Andorra**. Cuatro recibos correctos y lectura conjunta de propietario/posicion. [Evidencia RPC](evidence/2026-09-09-pool-test-retirements.json). **Experiencia publicada y verificada en Stage** con [PR #355](https://github.com/fgomezserna/cukies-hub/pull/355), SHA `6803252`, QA del coordinador 17:29–17:33 UTC: Mis Cukies conserva 12 = 2 wallet + 9 Pool + 1 Master; los tres pendientes muestran Salida solicitada, fecha y Ver retirada; #7 figura Disponible. El enlace de #3 valida token, coleccion, vault y beneficiario, sin permitir retirada anticipada. La pantalla Pool muestra seis posiciones actuales (cinco disponibles para partidas y #8 retirable), dos en wallet y ningun banner de vault anterior. CI [34382259657](https://github.com/fgomezserna/cukies-hub/actions/runs/34382259657) SUCCESS; Coolify `q8cgs8c0sgc8osko8w084sos` finished; DApp reconstruida y cuatro imagenes reutilizadas. [Informe UI del coordinador](evidence/2026-09-09-pool-ui-qa.md) y [handoff con artefactos de runtime](evidence/2026-09-09-cambios-docx-audit.json). Runtime atribuido al verificador Luna, sin archivo raw propio; capturas inline en la tarea del coordinador. | Cambio de experiencia/custodia verificado; quedan las tres retiradas fisicas tras el plazo y su contraste de cadena/indexacion. Los nueve NFT de Pool en la coleccion incluyen tres posiciones antiguas pendientes; los seis de la pantalla Pool son actuales. No se declara custodia unica, contrato anterior vacio ni migracion global terminada. QA desktop y responsive sin overflow (viewport efectivo 521 CSS px a zoom 75%). Runtime: 11 servicios running, reinicios 0; DApp/indexer/schedulers healthy; dos guards PASS, heartbeat de capacidad 26 s, imagesMissing 0 e indexer sin errores hasta 130063570. Mongo: solo TCP 221:27018 comprobado en este cierre; PRIMARY corresponde a la observacion INFRA de 17:18. Persiste el banner global de recuperacion previo al deploy y la repeticion visual de titulo/token en la retirada: siguen en UX, fuera del cierre textual. Ventana devuelta a INFRA; sin deploy documental. |
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
| UX-10/11 | Ficha, tools de coleccion y estados de Bridge/Points/Crias | Rutas comunes `/bridge`, `/breeding` y `/cukiepoints` añadidas al `navigationGroups` compartido; [LEG10–LEG11](legacy-marketplace/evidence/2026-09-09-legacy-domain-stage.md). Sin publicación ni certificación transaccional. |
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
