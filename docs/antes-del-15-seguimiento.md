# Seguimiento operativo de `Antes del 15.docx`

Estado del documento: fuente unica del estado vigente; vivo y versionado.

Ultima actualizacion: 2026-09-07.

Contexto de esta actualizacion: correccion de producto del 2026-09-07 y
contraste focalizado de la evidencia disponible. Las decisiones explicitas
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
| 0 | Documentado; detalles pendientes de convertir en criterios. | Fuente original; 2026-09-07. | Convertir cada detalle en criterio verificable. |
| A | **CONFIRMADO POR USUARIO + OBSERVADO LIVE**: pool de liquidez activa desde hace mas de una semana. | `output/verification/pancake-mainnet-20260907.json`, BSC `56`, bloque `120529300`, `2026-09-07T16:50:13Z`; reservas `1.148.104,4871 UKI` + `4.658,0014 ASM`, LP bloqueada hasta `2027-02-23T15:33:10Z`; swaps `2026-08-31` y `2026-09-07`. | Registrar reservas/swaps/locker en cada revision; comprobar logo/ficha y la ruta USDC anunciada en el copy. Rutas BNB/USDT multihop acreditadas. |
| B | **CONFIRMADO POR USUARIO + OBSERVADO LIVE**: staking y torneo actual post-preventa funcionan. Producto: `Torneo Lanzamiento UKI`; no es el torneo antiguo de preventa. | `https://cukies.world/api/games/treasure-hunt/competition`, HTTP 200, `2026-09-07T16:50:56Z`; contrato `0xad18...59696`, campaña activa hasta `2026-09-15T15:00Z`. | Mantener evidencia de participante/firma separada; no reabrir approve/stake como fallo de estado. |
| C | **RESUELTO · confirmado por el usuario**: cierre funcional aceptado. | Confirmacion de producto; 2026-09-07. | No reabrir por falta de una prueba adicional; conservar checks como historial. |
| D | **MIGRACION POR COMPLETAR**: migrar toda funcionalidad legacy al Hub con infraestructura nueva, auth, datos y contratos seguros; dejar de usar el repo antiguo. | Decision de producto e [inventario de migracion](legacy-marketplace/README.md); 2026-09-07: 14 contratos, 34 contenedores y 16 instancias de base. | Inventario registrado; seguir con importacion preview y paridad por flujos completos; coordinar [#160](https://github.com/fgomezserna/cukies-hub/issues/160); cero consumidores runtime antes de retirar. |
| 1 | **EN PROGRAMA DE MIGRACION LEGACY**: bridge Tron -> BSC, con seguridad, E2E y fees dentro del alcance. | Decision de producto; 2026-09-07. | Revalidar fuente, relayer, rutas, fee y pausa; sin presentar el bridge como cerrado. |
| 2A-C | **EN IMPLEMENTACION DEL BLOQUE DE EVENTOS**: datos/listings, fees y marketplace UKI. Legacy y UKI conviviran en una lista con filtros y distintivo Legacy por tarjeta. | Decision explicita de producto; 2026-09-07; [reglas funcionales](uki-current-operating-rules.md#contratos-legacy-eventos-y-convivencia-decision-del-2026-09-07). | Completar eventos/approvals/breeding y workers aislados, reconciliar datos y despues integrar lista/filtros/acciones. Staging observado `d4bc372`: API UKI 503 y listado legacy; main `fb2b190`: API UKI 404. No equivale a ausencia de un contrato desplegado. |
| 3 | **EN STAGING, EN PRUEBAS**: Cukie Master, creditos, pools, prestamos y rewards. | Confirmacion de producto; 2026-09-07; smoke 11:44 UTC como evidencia fechada. | Registrar resultados de consumo/caducidad de creditos, stake/unstake, prestamos, cierres, reparto e idempotencia; completar los flujos pendientes segun esas pruebas. |
| 4 | **EN MAIN, PENDIENTE DE PUBLICAR PRODUCTO**: embajadores y reglas asociadas siguen dentro del programa. | Confirmacion de producto; 2026-09-07; [PR317](https://github.com/fgomezserna/cukies-hub/pull/317), [PR318](https://github.com/fgomezserna/cukies-hub/pull/318). | Separar merge/deploy tecnico de publicacion, copy, allocations y claim. |
| 5 | **SECUENCIADO TRAS LA UX FUNCIONAL LEGACY/V2**: menu, sidebar, dashboard inicial, perfil, avatar y notificaciones. | Decision de producto; 2026-09-07. | Primero eventos/workers y flujos completos; despues reorganizar navegacion y dashboard segun acciones y estados reales. |
| 6 | **SIN CAMBIO**: conservar tokenomics, evidencia y decision previa; no inventar un estado nuevo. | `docs/uki-current-operating-rules.md` y evidencia previa; contraste 2026-09-07. | Reconciliar solo cuando exista una nueva decision versionada. |
| post1-2 | **ANTES DEL 15 · MIGRACION LEGACY**: Cukie Points y crias siguen ligados al bloque de migracion; no son activos POST-15. | Decision de producto; 2026-09-07. | Inventario y migracion validada; no ejecutar pausa/corte en este seguimiento. |
| post3-9 | Alcance conservado como inventario posterior, sin afirmar codigo definitivo ni cierre. | Registro historico; 2026-09-07. | Mantener scope y esperar decision/evidencia especifica. |

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
  afectado.
- [ ] Validar `pnpm guard:staging:test` y `pnpm guard:staging` con UUID de Coolify
  `u4s804o4wwcckowgk0woo4wg`, rama `staging`, chain `97` y las tres bases Stage.
- [ ] Preparar backup/snapshot y plan de migracion antes de cualquier cambio de
  schema o backfill.
- [ ] Cargar secretos solo en Coolify; nunca en Git, logs o archivos generados.
- [ ] Mantener apagados publisher y schedulers que aun no tengan autoridad,
  funding o aprobacion operacional.
- [ ] Desplegar un unico SHA identificable y comprobar que `/api/health` lo
  publica.
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
- [ ] Smoke con casos reales listados, transferidos, stakeados y cancelados.

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

### Estado vigente: EN MAIN, pendiente de publicar producto

La confirmacion de producto separa merge/deploy tecnico de publicacion visible.
Las reglas y la implementacion local descritas debajo son evidencia de alcance;
no declaran el programa publicado ni autorizan claim.

- Alta de sponsor por wallet firmada, sin compra.
- Un nivel directo inicial.
- `5%` sobre el pago final del referido.
- Sponsor cobra en el mismo cierre/disponibilidad que el referido.
- Referidos bloqueados de preventa tienen precedencia y no se reasignan.
- Segundo nivel recibe cero con la regla actual.

### Criterios de publicacion y validacion (sin afirmar publicacion)

- [ ] Validar la publicacion del endpoint/UI ya integrado en main, conservando
  las pruebas de alta, conflicto y sponsor de preventa.
- [ ] Verificar premio diario, semanal, Credit Pool y Cukie Pool con datos Stage.
- [ ] Publicar/reclamar batch de referido y sponsor y comprobar misma
  disponibilidad.
- [ ] Revisar privacidad, abuso, wallets autocontroladas y ciclos.

### Criterios de produccion futura

- [ ] Importar referidos de preventa con manifest y conteos aprobados.
- [ ] Congelar porcentaje, niveles y fecha de vigencia en una regla versionada.
- [ ] Controles antifraude y proceso de disputa/correccion antes del cierre.
- [ ] Funding y claim Mainnet con evidencia del sponsor.

## 5. Dashboard y arquitectura del sitio

Fuente de arquitectura: `docs/uki-dapp-sitemap.md` y
`docs/uki-ux-state-matrix.md`.

Incluye landing publica, vesting, dashboard, Cukie Master, Cukies, Marketplace,
Cukie Pool, Treasure Hunt, rankings y rewards. El dashboard no debe inventar
datos: diferencia `ready`, `partial`, `stale`, `unavailable` y estados vacios.

La revision solicitada cubre menu y sidebar (orden, agrupacion, ruta activa y
movil), zona de perfil (cuenta, wallet y accesos), avatar y sus estados de
carga/error, y notificaciones (visibilidad, leidas/no leidas y destino). Registrar
por hallazgo ruta, escenario, captura y correccion; revisar tambien consistencia
entre landing, dashboard y juego, navegacion con teclado y controles tactiles.

Stage:

- [ ] Recorrido movil `390x844` y escritorio por todas las rutas.
- [ ] Verificar enlaces permanentes de recovery, wallet incorrecta, chain
  incorrecta, datos stale y modulos apagados.
- [ ] Contrastar conteos con APIs/indexador y no con mocks.

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
| Cards/assets | `cuki-card-worker` portado en código | Worker Hub live observado; jobs/paridad de imágenes sin cierre | Assets y jobs reconciliados, URLs antiguas fuera de respuestas y smoke de card worker |
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
