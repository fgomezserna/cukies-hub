# UKI current operating rules

Estado: fuente operativa vigente para especificacion tecnica y funcional.
Fecha de sincronizacion: 2026-08-20.
Fuentes base: `/Users/fgomezserna/Downloads/Token UKI.docx`, `/Users/fgomezserna/Downloads/Funcionamiento.docx` y `/Users/fgomezserna/Downloads/UKI/Preventa UKI.docx`.
Revision posterior: decisiones de producto sobre staking, Cukie Master, Cukie Pool, creditos, snapshots y rewards confirmadas en la conversacion hasta el 2026-08-20, incluido `Creditos de competicion y reparto.docx`. `6. comprobar.docx` se usa como comprobacion de consistencia, no como especificacion reducida que sustituya esas decisiones exhaustivas.

Este documento sustituye como referencia de producto a los documentos antiguos de `Funcionamiento`, `dudas` y `para comentar`. Si una issue o documento anterior contradice estas reglas, estas reglas prevalecen hasta que producto apruebe una version nueva.

Las reglas de este documento describen el comportamiento objetivo aprobado. No implican por si solas que la funcionalidad ya este desplegada. El estado real y las diferencias respecto a la implementacion se mantienen en `docs/uki-new-economy-db-implementation-map.md`.

## Reconciliacion con `6. comprobar.docx`

El documento de comprobacion coincide con la especificacion vigente salvo en
estos puntos, cerrados posteriormente en la conversacion:

- Los ejemplos de las 17:00 quedan sustituidos por corte e inicio de periodo a
  las 14:00 UTC y comienzo objetivo del settlement a las 16:00 UTC.
- En Cukie Pool no se entrega el NFT al jugador, pero cada partida si queda
  reservada contra un `assetId` concreto. La cuota diaria de un NFT puede
  repartirse entre varios jugadores; inicialmente solo se permite una partida
  activa simultanea por NFT.
- La prioridad Original -> Segunda Generacion -> Seiku se evalua al reservar
  cada partida. El reparto de cada generacion depende de las partidas validas
  que usaron realmente sus NFTs, no de comprobar al final del dia si quedo
  algun Original sin usar.
- Las 16:00 UTC son la hora objetivo para calcular y registrar el reparto
  off-chain. No garantizan que el UKI sea reclamable on-chain en ese mismo
  instante: la reclamacion requiere publicar y financiar el batch
  correspondiente.
- Los porcentajes, prioridad, cuotas, concurrencia, elegibilidad, gracia y
  rewards son reglas backend versionadas. Los contratos NFT solo fijan
  custodia y, para Cukie Pool, calendario y derecho de retirada.

### Guardarrail tecnico de emision

- Cada dia economico se contabilizan exactamente `500,000 UKI` del programa de
  recompensas. La parte asignada a jugadores, pools, embajadores y reservas
  semanales, mas la parte no distribuida, debe reconciliar exactamente ese
  importe. No es solo un cap variable.
- UKI tiene suministro fijo: esta contabilidad no crea supply nuevo. Los lotes
  de rewards se financian desde la reserva UKI prefundada y las entregas
  posteriores de importes ya reservados no vuelven a consumir presupuesto ni
  vuelven a mintear.
- El techo acumulado configurado para staging es `450,000,000 UKI`. A
  `500,000 UKI` diarios cubre 900 dias; la incompatibilidad con la comunicacion
  historica de seis anos sigue bloqueando una regla mainnet, no la validacion
  funcional en BSC Testnet.
- Antes de crear un manifest, allocation o accrual, el servicio reserva el
  total bruto de la fuente dentro de la misma transaccion Mongo. Los replays no
  vuelven a consumir presupuesto y un exceso diario o acumulado falla cerrado,
  sin crear claims implicitos.
- El ledger utiliza `reward_emission_budget_state`,
  `reward_emission_budget_days` y `reward_emission_budget_events`. El sello
  semanal vuelve a validar esas reservas antes de publicar un draft Merkle;
  una reserva ausente o manipulada bloquea el claim.
- La frontera diaria del presupuesto se configura inicialmente a las 14:00
  UTC. Una vez creada la primera reserva, esa frontera y el techo del programa
  no se mutan sobre el mismo ledger. Si producto cambia la hora, se coordina una
  nueva version de calendario y una migracion auditada del presupuesto para
  periodos futuros; nunca se reinterpretan periodos ni salidas ya cerrados.
- El reparto no distribuido usa tres destinos: 80% tesoreria, 10% una unica
  reserva de marketing y desarrollo y 10% reduccion de supply.
- La configuracion actual es de prueba para BSC Testnet y las bases de staging.
  No aprueba fechas ni wallets de produccion. Los schedulers permanecen
  desactivados hasta que sus fuentes, financiacion y credenciales se verifiquen
  manualmente.

## Preventa UKI

- Inicio previsto: primera semana de junio de 2026.
- Duracion prevista: 1 mes.
- Precio preventa: 1 UKI = 0.01 USD.
- Precio de listing: al menos 0.012 USD. Si ASM sube durante la preventa, se puede anunciar un listing mayor para incentivar compra.
- Compra principal: ASM.
- Ratio ASM -> UKI: se configura al inicio de la preventa con el valor de ASM en ese momento. La Launch Safe puede actualizarlo durante la preventa si ASM sufre una variacion brusca; el cambio aplica solo a compras futuras.
- Ejemplo de ratio: si ASM vale 6 USD al inicio, 1 ASM = 600 UKI.
- Compra minima on-chain: 5 ASM.
- Maximo por compra o por wallet: no hay limite especifico aprobado.
- Maximo total vendible: 250,000,000 UKI, correspondiente al pool de ecosistema asignado como techo de venta.
- BNB/USDT: opcion pendiente. Si se permite, debe convertirse automaticamente a ASM o guardarse para conversion posterior a ASM.
- ASM recaudado: debe usarse para aportar liquidez contra UKI.
- Liquidez inicial: se quema o se bloquea durante al menos 9 meses.
- Compradores de preventa: vesting lineal de 9 meses, sin cliff. El inicio del vesting se fija en TGE, cuando se aporte liquidez en Pancake, y debe congelarse antes de permitir claims.
- Incentivos Concilium/Ascensum: la cantidad vendida en preventa a esa comunidad se iguala con UKI para Marcel, destinada a incentivos de Concilium/Ascensum.
- Vesting de incentivos Concilium/Ascensum: mismas condiciones que team, 9 meses de cliff y 24 meses de vesting.
- Incentivo por compra y referral: pendiente de definir, posiblemente sorteo o regalo de Cukies.

## Tokenomics

Suministro total: 1,000,000,000 UKI.

| Pool | Porcentaje | Uso |
| --- | ---: | --- |
| Programa de Recompensas Cukie Masters | 45% | Entrega durante 6 anos segun programa de recompensas. |
| Ecosistema | 25% | Preventa, airdrops, reservas, marketing, eventos y oportunidades. |
| Liquidez | 18% | Listing en Pancake, market making, liquidez posterior o exchange centralizado. |
| Equipo | 12% | Team y asignaciones de incentivos Concilium/Ascensum. |

## Matriz de pools y vesting UKI

Esta matriz es la referencia para configurar `VestingVault` y cualquier contrato futuro de rewards. Si producto cambia una fecha o beneficiario, debe actualizarse aqui antes del deploy.

| Pool | % supply | UKI | Regla actual | Representacion tecnica |
| --- | ---: | ---: | --- | --- |
| Compradores preventa | Sale desde ecosistema | Hasta 250,000,000 | 9 meses lineal, sin cliff, inicio en TGE/Pancake liquidity. | `PRESALE_SCHEDULE_ID`; `presaleVestingStart = TGE`, `presaleVestingDuration = 9 meses`, congelar con `freezePresaleVestingConfig()` antes de claims. |
| Ecosistema - desbloqueo 40 dias | 3% supply total | 30,000,000 | Cliff de 40 dias desde TGE y desbloqueo inmediato, sin vesting lineal. | Schedule dedicada tipo `ECOSYSTEM_40D` con `duration = 0`, que desbloquea el 100% en el cliff. |
| Ecosistema - resto | Resto del 25% no vendido ni asignado al desbloqueo 40d | TBD segun venta real | 9 meses cliff + 12 meses vesting lineal. | Schedule dedicada tipo `ECOSYSTEM_REMAINDER`; amount final depende de UKI vendido en preventa y subasignaciones aprobadas. |
| Equipo | 12% | 120,000,000 | 9 meses cliff + 24 meses vesting. | Schedules por beneficiario o grupo; ids versionados tipo `TEAM_*`. |
| Incentivos Concilium/Ascensum para Marcel | Variable dentro de equipo | Igual a cantidad vendida a esa comunidad | Mismas condiciones que team: 9 meses cliff + 24 meses vesting. | Schedule separada tipo `CONCILIUM_INCENTIVES`; amount final depende de ventas atribuidas. |
| Programa de recompensas Cukie Masters | 45% | 450,000,000 | Entrega durante 6 anos segun programa de recompensas. La documentacion actual no concreta cliff/start/duration unico. | No congelar como schedule unica hasta definir calendario; probablemente requiere `RewardsDistributor` por periodos o vesting por tramos. |
| Liquidez | 18% | 180,000,000 | Liquidez inicial en Pancake; ASM recaudado se usa para liquidez UKI. Bloqueo o quema LP minimo 9 meses. | No es vesting de usuario; registrar tx de liquidez y bloqueo/quema LP. |

Puntos pendientes antes de mainnet:

- Definir si el programa de recompensas del 45% usa contrato de rewards por periodos, varios vestings por tramo o una combinacion.
- Definir beneficiario exacto y operational owner de `ECOSYSTEM_40D`.
- Calcular `ECOSYSTEM_REMAINDER` despues de cerrar la preventa: `250M - UKI vendido - 30M - otras subasignaciones aprobadas`.
- Confirmar si la preventa realmente puede usar todo el pool de ecosistema como cap o si producto aprueba una subasignacion menor antes del deploy.

Reglas de ecosistema:

- Los tokens vendidos durante preventa salen del pool de ecosistema.
- El pool de ecosistema completo es 250,000,000 UKI. Ese es el maximo absoluto que la preventa puede vender si no se aprueba una subasignacion menor antes del deploy.
- 3% del suministro total, 30,000,000 UKI, se libera 40 dias despues del TGE como subasignacion de ecosistema.
- Ese 3% del suministro total solo se usa si aparece una oportunidad concreta: partner, marketing, evento u otra accion aprobada.
- El resto del ecosistema tiene 9 meses de cliff y 12 meses de vesting lineal.

## Periodos diarios

- Cukie Master, creditos y Cukie Pool usan un mismo calendario diario versionado.
- Cada periodo comienza en la hora de corte y termina en el corte del dia siguiente.
- Horario inicial aprobado: periodos
  `[14:00 UTC, 14:00 UTC del dia siguiente)`, con cierre economico a las 14:00
  UTC y ejecucion objetivo del reparto de pools a las 16:00 UTC.
- Las dos horas entre corte y reparto son una ventana de finalizacion y
  reconciliacion; no extienden el periodo ni la custodia de los NFTs.
- Para cada corte se fija `cutoffBlock`: el ultimo bloque canonico de BSC cuyo
  `block.timestamp` es estrictamente anterior a `cutoffAt`.
- Una operacion pertenece al periodo que termina si fue incluida en un bloque
  menor o igual que `cutoffBlock`. Un bloque con timestamp igual o posterior a
  `cutoffAt` pertenece al periodo siguiente.
- Las confirmaciones solo determinan cuando puede sellarse el snapshot; no
  cambian retroactivamente el periodo de una operacion ya incluida.
- `CukiePoolNftVault` usa un calendario on-chain versionado. La version inicial
  tiene `periodAnchor = 14:00 UTC` y periodos ordinarios de 24 horas.
- La Safe puede programar otra hora para periodos futuros sin desplegar un vault
  nuevo. El cambio declara version, `effectiveAt` y primer corte nuevo; nunca
  reescribe el periodo en curso y debe anunciarse antes de que empiece el primer
  periodo afectado.
- Una version nueva cambia activaciones y `withdrawableAt` de solicitudes de
  salida futuras. Una salida ya solicitada conserva el timestamp prometido y
  no puede retrasarse por administracion; como excepcion protectora, una
  migracion puede adelantarlo, nunca posponerlo.
- `settlementScheduledAt` es una hora operativa versionada del backend, no un
  dato de custodia. Su valor inicial es 16:00 UTC y puede cambiar para periodos
  futuros. Si a esa hora quedan fuentes atrasadas, el periodo permanece
  `pending_reconciliation` y se liquida despues con su mismo `periodId`.

## Resumen de staking y custodia

| Ruta | Custodia | Primera recompensa | Salida | Uso mientras esta depositado |
| --- | --- | --- | --- | --- |
| Cukie Master por UKI | `UKIStaking` | Primer corte despues de mantener el cupo al menos 24h | Inmediata, sin cooldown/penalizacion/blackout | UKI inmovilizado en el contrato; no existe uso interno durante esas horas. |
| Cukie Master por NFT | `CukieMasterNftVault` | Primer corte despues de mantener el cupo al menos 24h | NFT devuelto inmediatamente | Inicialmente no puede jugar, prestarse, listarse ni transferirse. |
| Cukie Pool | `CukiePoolNftVault` | Se activa en el periodo siguiente, devenga al terminar su primer periodo activo y se calcula desde el settlement posterior | Solicitud en D, sin reward de D, retirable al terminar D | Presta partidas desde su activacion hasta el corte de la salida. |

Toda coleccion que conserve alguna posicion abierta en cualquiera de los dos
vaults debe permanecer en la lista publica historica de recuperacion, aunque ya
no admita depositos nuevos. Solo puede retirarse de esa lista tras verificar
cero posiciones abiertas en ambos vaults. La salida directa consulta el
contrato y no depende de autenticacion, API ni estado del indexador.

## Cukie Master

Hay dos rutas independientes para obtener cupos de Cukie Master. Cada ruta tiene su propio contrato o fuente on-chain, su propio requisito y un maximo independiente de cinco cupos por wallet.

### Ruta 1: staking de Cukies Originales

- Cupos iniciales disponibles: 500.
- Requisito inicial: 3 puntos en Cukies Originales por cupo.
- Solo participan Cukies Originales en BSC.
- El NFT entra fisicamente en un contrato dedicado `CukieMasterNftVault`; Mongo es una proyeccion indexada, no la autoridad de custodia.
- Un NFT dentro de este vault no puede venderse, transferirse, prestarse en Cukie Pool ni utilizarse para jugar.
- El unstake devuelve el NFT inmediatamente, sin cooldown ni permanencia minima. Una pausa puede bloquear nuevas entradas, pero nunca la salida del propietario.
- El contrato no calcula rareza, puntos, cupos ni creditos. Esos calculos permanecen off-chain y se reconstruyen desde eventos confirmados.

Puntos por rareza:

| Rareza | Puntos |
| --- | ---: |
| Comun | 1 |
| No Comun | 2 |
| Raro | 4 |
| Epico | 7 |
| Legendario | 10 |
| Goat | 15 |

### Ruta 2: staking de UKI

- Cupos iniciales disponibles: 500.
- Requisito inicial: 20,000 UKI por cupo.
- Los UKI comprados en preventa con vesting cuentan directamente para los cupos.
- Para evitar doble conteo, el saldo elegible es
  `asignacionVestingNoReclamada + UKIStaked`. La primera parte equivale a
  `allocatedRaw - claimedRaw`; al reclamar UKI deja de contar por vesting y
  solo vuelve a contar si se deposita en `UKIStaking`.
- Un usuario puede stakear mas UKI de los que necesita. El exceso no da beneficios adicionales, pero funciona como margen si sube el requisito.
- No hay permanencia minima, penalizacion ni cooldown de retirada.
- El unstake de UKI permanece disponible incluso si se pausan nuevas entradas al contrato.
- No se establece una ventana diaria en la que se prohiba hacer unstake.

### Maduracion, salida y reentrada

- Cada cupo nuevo debe cumplir al menos 24 horas antes de recibir su primera entrega de creditos.
- La primera entrega ocurre en el primer corte diario posterior a completar esas 24 horas. La espera efectiva puede ser de algo mas de 24 horas hasta casi 48 horas.
- Si un usuario deja de cumplir el requisito antes del corte, no recibe nuevos creditos en ese corte.
- Los creditos ya concedidos no se revocan por hacer unstake; conservan su caducidad normal.
- Si vuelve a hacer stake y recupera un cupo perdido, ese cupo abre un nuevo epoch y reinicia la espera minima.
- En una retirada parcial, los cupos que se mantienen conservan su antiguedad. Solo reinician la espera los cupos perdidos y recuperados posteriormente.

### Limites y requisito dinamico

- Maximo por wallet en la ruta UKI: 5 cupos de Cukie Master.
- Maximo por wallet en la ruta NFT/Cukies Originales: 5 cupos de Cukie Master.
- Las rutas no comparten limite: una wallet puede alcanzar 10 cupos potenciales si cumple 5 por UKI y 5 por NFT/Cukies Originales.
- Maximo global de cupos previsto: 5,000.
- Si una ruta llena sus 500 cupos iniciales y se decide no abrir mas cupos en ese momento, el requisito sube.
- Cuando el requisito de una ruta sube, se abre inicialmente una ventana de gracia de 48 horas para que sus Cukie Masters ajusten el staking.
- Las 48 horas son una regla backend versionada y configurable para cambios futuros; no quedan fijadas de forma inmutable en los contratos.
- Una ventana de gracia ya iniciada puede ampliarse para dar mas tiempo, pero
  nunca acortarse ni cerrarse antes de la fecha comunicada a los usuarios.
- Si, al cierre de la ventana, un usuario no cumple el nuevo requisito, pierde los cupos que no pueda mantener.
- El contador no se cancela aunque otros usuarios hagan unstake y el numero de cupos ocupados vuelva a bajar.
- Un usuario que quiera tomar un hueco durante la ventana debe cumplir el requisito nuevo.

La UI debe mostrar el requisito anterior y nuevo, los cupos que se conservaran, la cantidad adicional necesaria y la fecha/hora limite.

## Creditos de competicion

- Los creditos son unidades internas off-chain, no un token blockchain.
- No se pueden vender ni enviar de un usuario a otro.
- Cada cupo de Cukie Master elegible recibe 100 creditos por periodo diario.
- Los creditos no usados caducan segun el cierre diario y el ledger conserva su historial.
- Los creditos pueden utilizarse para jugar o asignarse al pool de creditos.
- La aportacion al pool no es una transferencia manual posterior: el usuario configura antes del corte que parte de su siguiente entrega ira a saldo propio y que parte ira al pool.
- La aportacion al pool es irrevocable para ese periodo, pero conserva la atribucion del usuario para calcular sus rewards.
- Una configuracion hecha despues del corte aplica al periodo siguiente.

### Cortes, indexador y snapshots

- La elegibilidad se calcula con un snapshot historico `as-of-cutoff`, usando
  `cutoffBlock` una vez que alcanza la profundidad de confirmacion requerida.
- El snapshot debe guardar como minimo `cutoff`, numero/hash de bloque, confirmaciones, watermarks por fuente, version de regla, hashes de entrada/salida y `jobRunId`.
- Un unstake incluido en un bloque menor o igual que `cutoffBlock` afecta al
  periodo que termina. Si se incluye en un bloque posterior, afecta al periodo
  siguiente, aunque alcance las confirmaciones requeridas mas tarde.
- El unstake nunca se bloquea durante la hora previa al corte. Puede mostrarse un aviso de transaccion pendiente, pero no retener fondos para compensar retrasos del indexador.
- Si una fuente no esta actualizada, el periodo queda `pending_reconciliation`; no se genera un snapshot incompleto ni se pierde la entrega.
- Cuando los datos se recuperan, el job reconstruye el estado del corte y liquida una sola vez de forma idempotente.
- La salud y liquidacion de UKI y NFT se separan para que el fallo de una ruta no bloquee la otra.
- Una entrega retrasada no puede nacer caducada ni perderse por un fallo
  operativo. El ledger conserva `earnedPeriodId` como periodo de origen, pero
  materializa los creditos en el periodo vigente de settlement para que tengan
  una ventana util completa.
- Si la entrega se recupera mas de 24 horas despues de su corte, cada cupo
  recibe una unica compensacion adicional de 100 creditos. La entrega original
  y la compensacion conservan exactamente la configuracion propia/pool fijada
  para el corte perdido y son idempotentes por cupo, ruta y periodo de origen.
- La salud, watermark, run y materializacion se separan entre la ruta UKI y la
  ruta NFT; una ruta sana puede liquidarse aunque la otra permanezca retenida.

Estos retrasos deben ser excepcionales, no parte del funcionamiento normal.
Pueden producirse por caida o lag del RPC/indexador, una reorganizacion BSC
dentro de la ventana de confirmaciones, indisponibilidad temporal de Mongo o un
worker interrumpido durante el cierre. El objetivo operativo es cerrar en los
primeros minutos posteriores al corte el snapshot de elegibilidad; superar 30
minutos genera alerta. El settlement de pools se intenta desde las 16:00 UTC.
En ambos casos, el periodo sigue pendiente hasta
poder reconstruirse correctamente.

## Pool de creditos

- Los Cukie Masters configuran la aportacion de su siguiente entrega en multiplos de 10 por cupo.
- La configuracion debe hacerse antes del corte diario; un cambio posterior aplica al siguiente periodo.
- Los jugadores sin creditos propios reciben creditos del pool mientras haya disponibilidad.
- Los UKI diarios del pool se distribuyen proporcionalmente entre quienes aportaron creditos en ese periodo.
- Quien aporto creditos conserva el derecho de ese periodo aunque despues pierda su cupo o haga unstake.

Garantia inicial:

- Para cada 10 creditos aportados se suma el reparto ordinario del dia y el
  tramo de un septimo que corresponda del bote semanal anterior.
- El pago final es `max(reparto ordinario + tramo semanal, 0.75 UKI)`. El tramo
  semanal no se añade otra vez despues de aplicar el minimo.
- El complemento necesario para alcanzar 0.75 UKI sale de la reserva del pool
  de creditos. Si el beneficiario tiene embajador, este recibe el 5% del pago
  final, incluido cualquier complemento de garantia. Las rewards del propio
  embajador no generan otra comision.

Complemento procedente del bote semanal:

- Al cerrar el bote semanal de mejores jugadores, una parte del premio puede corresponder al pool de creditos o al Cukie Pool segun los recursos utilizados por las partidas premiadas.
- Esa parte no se entrega completa al cierre semanal: se divide en siete tramos
  deterministas, desde el martes a las 16:00 UTC hasta el lunes siguiente a las
  16:00 UTC.
- Cada tramo se reparte entre quienes participan en el pool el dia de ese tramo;
  no se congela el censo de la semana que genero el bote.
- El tramo semanal participa en la garantia conjunta descrita arriba; no es un
  extra que se vuelva a sumar despues de alcanzar el minimo.

## Pool de Cukies

### Custodia y separacion de pools

- Existe un unico contrato `CukiePoolNftVault` que custodia fisicamente Cukies Originales y de Segunda Generacion en BSC.
- Dentro del contrato, las generaciones comparten custodia. En backend y rewards existen dos pools logicos separados: Originales y Segunda Generacion.
- Un NFT en el vault no puede listarse, transferirse, entrar en Cukie Master ni utilizarse como NFT propio.
- El jugador nunca recibe el NFT en su wallet. El backend le reserva una
  partida asociada a un `assetId` concreto, formado por cadena, contrato de
  coleccion y `tokenId`.
- Primero se prestan Originales; si no hay capacidad disponible, Segunda Generacion; si tampoco hay, se asigna un Seiku.

### Ciclo de entrada y salida

Estados live: `pending_activation`, `active`, `exit_requested` y `withdrawable`.
`withdrawn` es el evento terminal del epoch; despues de retirarlo, el asset
vuelve al estado de custodia `wallet/available`.

- Un NFT depositado durante el periodo D queda `pending_activation`: permanece custodiado, no se presta y no participa en rewards durante el resto de D.
- Al comenzar D+1 pasa a `active`, recibe su cuota diaria completa y puede prestarse.
- Si permanece activo todo D+1, devenga su primera recompensa al cerrar D+1 y
  esta se calcula/liquida desde el settlement posterior. El primer devengo se
  produce entre algo mas de 24 horas y casi 48 horas despues del deposito.
- Una solicitud de unstake durante D es irreversible y cambia solo ese NFT a `exit_requested`.
- Si se solicita mientras aun esta `pending_activation`, sigue sin prestarse ni cobrar y queda igualmente retirable al finalizar D.
- Si la salida se solicita desde `active`, el NFT sigue disponible para partidas hasta el cierre de D, pero queda excluido del reparto completo de D desde la solicitud, incluso si se hace un minuto antes del corte.
- Las partidas que utilicen ese NFT siguen alimentando el pool de su generacion. El NFT que sale no recibe unidades del reparto; los demas NFTs de la misma wallet siguen participando con normalidad.
- Al finalizar D pasa a `withdrawable`, deja de recibir nuevas asignaciones y el propietario puede retirarlo sin esperar al snapshot ni al pago de UKI.
- `withdrawableAt` es exactamente el instante desde el que el propietario puede
  recuperar su NFT. Al solicitar la salida se fija como el final del periodo
  on-chain al que pertenece `requestExit`.
- Ejemplo con corte a las 14:00 UTC: una salida incluida durante P queda
  retirable a las 14:00 UTC que cierra P. Si la transaccion se incluye despues
  de ese corte, pertenece a P+1 y queda retirable al corte siguiente.
- Ni backend ni administrador pueden prolongar `withdrawableAt`
  retroactivamente, y no se espera al reparto previsto para las 16:00 UTC.
- El NFT no se envia automaticamente: el propietario ejecuta `withdraw` cuando quiera a partir de `withdrawableAt`.
- Una pausa puede bloquear depositos nuevos, pero nunca `requestExit` ni
  `withdraw` cuando ya se cumpla `withdrawableAt`.
- Para volver al pool debe retirarse y depositarse de nuevo; el nuevo deposito vuelve a quedar pendiente hasta el siguiente periodo.

En el corte se congela el censo de NFTs elegibles y las reservas creadas durante
el periodo. El manifiesto de actividad se cierra por separado cuando esas
reservas hayan terminado o agotado su TTL. Una partida reservada antes del
corte mantiene el `periodId` de origen y puede finalizar dentro de su TTL
aunque el NFT ya sea retirable. Su liquidacion es un derecho historico desligado
de la custodia actual: no impide retirar el NFT, depositarlo despues en otro
vault ni aplica la partida a ese nuevo epoch. Despues del corte no se crean
nuevas asignaciones imputables al periodo que acaba; las nuevas sesiones
pertenecen al periodo siguiente y solo pueden usar NFTs que sigan `active`.

Ejecutar el reparto desde las 16:00 UTC aporta dos horas para cerrar
estas partidas. La regla activa de Treasure Hunt debe cumplir
`sessionTtlMs + validationRetryWindow < 2 horas`. Una sesion sin resultado al
vencer su TTL expira y no genera rewards. Si el resultado valido entro dentro
del TTL pero un fallo operativo retrasa su validacion o settlement, el periodo
queda pendiente y se recupera sin perder esa partida.

### Cuotas y concurrencia

- Las cuotas se regeneran en cada periodo diario, no en cada deposito.
- La cuota no utilizada no se acumula.
- Cada reserva descuenta una unidad; una partida cancelada o expirada devuelve esa unidad dentro del mismo periodo y una partida validada la consume definitivamente.
- La fuente de verdad de cuota es `assetId + depositEpoch + periodId`, donde
  `assetId` incluye `chainId + collectionAddress + tokenId`; retirar y volver a
  depositar no puede restaurar usos del mismo periodo.
- Para el lanzamiento se permite una sola partida activa simultaneamente por NFT, aunque tenga mas cuota diaria.
- El limite de concurrencia es una regla backend versionable. Se medira si se asignan Seikus por NFT ocupado pese a quedar cuota antes de aumentarlo.

Partidas disponibles por periodo:

| Rareza | Original | Segunda generacion |
| --- | ---: | ---: |
| Comun | 2 | 1 |
| No Comun | 4 | 2 |
| Raro | 6 | 3 |
| Epico | 8 | 4 |
| Legendario | 10 | 5 |
| Goat | 12 | 6 |

### Formacion y reparto

- Todas las partidas validas finalizadas con un Cukie prestado alimentan el pool logico de la generacion utilizada.
- No existe un porcentaje fijo previo entre Originales y Segunda Generacion: cada generacion acumula lo producido por sus propios usos.
- Cada NFT elegible representa una unidad dentro de los tramos de su rareza; las partidas jugadas no multiplican sus unidades de participacion.
- El reparto dentro de cada pool es acumulativo:

| Tramo de rareza | Porcentaje | NFTs elegibles |
| --- | ---: | --- |
| Todos | 45% | Todas las rarezas |
| No Comun o superior | 20% | No Comun, Raro, Epico, Legendario y Goat |
| Raro o superior | 15% | Raro, Epico, Legendario y Goat |
| Epico o superior | 12% | Epico, Legendario y Goat |
| Legendario o superior | 7% | Legendario y Goat |
| Goat | 1% | Goat |

- Cada tramo se divide proporcionalmente por numero de NFTs elegibles en ese tramo.
- Un tramo sin NFTs elegibles no se redistribuye a otra rareza ni a la otra generacion; pasa a `undistributed_pending`.
- La generacion, rareza, propietario economico, epoch de deposito y estado de salida se congelan en el snapshot del periodo.

### Seiku

- Seiku es un recurso sintetico de juego, no un NFT ni un participante del Cukie Pool.
- Una partida con Seiku no alimenta el pool Original ni el de Segunda Generacion.
- La cantidad que habria correspondido al Cukie Pool no vuelve al jugador ni se reparte entre otros pools: pasa a `undistributed_pending`.
- Si se usaron creditos del pool, la parte correspondiente al pool de creditos se mantiene.

## Arena ranking

- Este ranking de eficiencia #1 a #9 es distinto del leaderboard semanal de
  mejor puntuacion que reparte el bote de premios.
- Solo se rankean los jugadores que usan creditos del pool.
- Los jugadores empiezan en ranking #5.
- El ranking se actualiza semanalmente.
- El movimiento maximo semanal es de 2 categorias hacia arriba o hacia abajo.
- Para poder subir hay que jugar al menos 20 partidas durante la semana.
- Para poder bajar hay que jugar al menos 10 partidas durante la semana.
- Para calcular el porcentaje convertido se usa solo el tramo de rendimiento de
  hasta 7.5 UKI. Los 2 UKI del bote semanal y los 0.5 UKI reservados para el
  programa de embajadores quedan fuera del score y del ranking.
- Para actualizar ranking no se cuentan los UKI asignados por estar entre los mejores jugadores de la semana.

Tabla de ranking:

| Ranking | Recompensa | Ascenso | Descenso |
| --- | ---: | ---: | ---: |
| #1 | 100% | No aplica | <70% |
| #2 | 90% | >80% | <60% |
| #3 | 80% | >70% | <50% |
| #4 | 70% | >60% | <40% |
| #5 | 60% | >50% | <30% |
| #6 | 50% | >40% | <20% |
| #7 | 40% | >30% | <10% |
| #8 | 30% | >20% | <5% |
| #9 | 20% | >10% | No aplica |

La recompensa por ranking se aplica sobre la parte del jugador que queda despues de las asignaciones a pools definidas por la regla versionada del periodo.

## Treasure Hunt

- Una partida requiere 10 creditos de competicion y un Cukie con partidas disponibles.
- Cada partida valida tiene un presupuesto nominal maximo de 10 UKI:
  - 7.5 UKI, el 75%, forman el tramo de rendimiento diario dependiente del score.
  - 2 UKI, el 20%, se reservan para el bote semanal de mejores jugadores.
  - 0.4 UKI reservan la comision ordinaria de embajadores.
  - 0.1 UKI reservan la comision de embajadores asociada al bote semanal.
- El embajador recibe el 5% de lo que genere efectivamente su referido,
  incluyendo pagos a jugadores o pools y complementos de garantia. Las
  comisiones no generan comision recursiva. La reserva que no se utiliza porque
  no existe embajador o porque el pago efectivo es menor pasa a no distribuido.
- Conversion de score: lineal entre 0 y 3,000 puntos.
- El tramo de rendimiento se calcula como
  `performanceUki = 7.5 UKI * clamp(score, 0, 3000) / 3000`, con redondeo
  determinista en unidades raw.
- 3,000 puntos o mas convierten los 7.5 UKI completos.
- 1,500 puntos convierten 3.75 UKI; 1,000 puntos convierten 2.5 UKI.
- La diferencia entre 7.5 UKI y `performanceUki` no se reparte entre jugador o
  pools: pasa a `undistributed_pending`.

Uso de creditos:

- Si el jugador tiene creditos propios, se usan sus creditos.
- Las partidas con creditos propios no computan para ranking y no aplican el rank al jugador.
- Si no tiene creditos propios, se asignan 10 creditos del pool mientras haya disponibilidad.
- Las partidas con creditos del pool computan para ranking y aplican el rank sobre la parte del jugador.
- Con creditos propios no hay limite diario de partidas y esas partidas no
  incrementan los contadores de uso del pool.
- Con creditos del pool existe un limite de 30 partidas por dia economico y un
  limite de 10 partidas con puntuacion menor que 100. Una puntuacion exactamente
  igual a 100 no es baja.
- Al reservar una partida con creditos prestados se reserva tambien capacidad
  para una posible partida baja. Un resultado de 100 o superior libera esa
  capacidad; una puntuacion inferior o un abandono la consume.
- Si el jugador abandona o cierra voluntariamente la partida, se consumen los
  10 creditos, la cuota del Cukie y ambos contadores aplicables; el rendimiento
  es cero y la partida no entra en ranking, rewards ni bote semanal.
- Un fallo atribuible al sistema libera creditos y cuota, no incrementa
  contadores y no genera ranking ni rewards.
- Una partida reservada antes de las 14:00 UTC conserva el periodo de entrada y
  puede finalizar despues del corte dentro de su TTL normal.

Uso de Cukies:

- Si el jugador tiene Cukies propios con partidas disponibles, la politica actual los selecciona automaticamente.
- Si no tiene Cukies propios disponibles, se asigna un Cukie del pool siguiendo prioridad Original, Segunda Generacion y Seiku.
- El game server no puede elegir libremente `assetIds`; recibe una reserva autorizada por el motor economico.
- Una futura seleccion manual del Cukie propio requerira otra politica versionada.

El reparto se aplica sobre `performanceUki`, no sobre los 7.5 UKI maximos si el
score convierte menos:

| Caso | Pool creditos | Pool Cukies | Jugador antes de ranking | Maximo con 3,000 puntos |
| --- | ---: | ---: | ---: | --- |
| Creditos prestados + Cukie prestado | 50% | 25% | 25% | 3.75 / 1.875 / 1.875 UKI |
| Creditos prestados + Cukie propio | 50% | 0% | 50% | 3.75 / 0 / 3.75 UKI |
| Creditos propios + Cukie prestado | 0% | 50% | 50% | 0 / 3.75 / 3.75 UKI |
| Creditos propios + Cukie propio | 0% | 0% | 100% | 0 / 0 / 7.5 UKI |

Ejemplo con 1,500 puntos: `performanceUki = 3.75`. Con creditos propios y Cukie
prestado se asignan 1.875 UKI al Cukie Pool y 1.875 UKI al jugador. Con ambos
recursos prestados se asignan 1.875 UKI al pool de creditos, 0.9375 UKI al
Cukie Pool y hasta 0.9375 UKI al jugador antes de ranking.

Estos porcentajes permanecen fuera de los contratos y quedan aprobados como
regla base. La version aplicada se fija al abrir cada periodo y solo puede
cambiar para periodos futuros. Cualquier reduccion por ranking sobre la parte
del jugador pasa tambien a `undistributed_pending`.

### Bote semanal y entrega diferida

- Los 2 UKI reservados por cada partida valida alimentan el bote semanal de mejores jugadores.
- El leaderboard conserva una unica mejor puntuacion raw por wallet, sin tope
  de 3,000 puntos. Solo reemplaza el resultado si la nueva puntuacion es mayor;
  en empate queda primero quien la logro antes. `winningGameId` identifica la
  partida exacta que origina cualquier reparto.
- El 60% se reparte entre el Top 10 con porcentajes
  `9/8/7/6.5/6/5.5/5/4.5/4.5/4`. El 30% se reparte a partes iguales entre los
  puestos 11 a 25, 2% cada uno. El 10% se sortea entre diez wallets fuera del
  Top 25, 1% cada una, que hayan completado al menos diez partidas semanales
  con puntuacion mayor que 100.
- El sorteo usa una fuente de entropia BSC canonica posterior al cierre y queda
  pendiente, sin elegir ganadores, mientras esa evidencia no este confirmada.
- Los pagos a jugadores se sellan el lunes a las 17:00 UTC. Si no existen todos
  los puestos o ganadores elegibles, la parte vacante pasa a no distribuido.
- El origen de creditos y Cukie se toma de la partida ganadora concreta. La
  parte correspondiente al pool de creditos o al pool de la generacion del
  Cukie se reserva para esos pools; Seiku no genera parte de Cukie Pool.
- Las cantidades derivadas a pools se dividen en siete tramos desde el martes
  siguiente a las 16:00 UTC hasta el lunes siguiente a las 16:00 UTC. Cada
  tramo usa el censo elegible de su propio dia y no vuelve a mintear ni a
  descontar presupuesto del dia de pago.
- La reserva semanal de embajadores acompana al beneficiario final de cada
  parte. Lo no pagado por ausencia de embajador pasa a no distribuido.

## UKI no distribuidos

Presupuesto diario fijo de recompensas: 500,000 UKI.

En cada cierre debe cumplirse exactamente:

`jugadores + pool de creditos + Cukie Pools + embajadores ordinarios + bote semanal + embajadores semanales + no distribuido = 500,000 UKI`.

El bote semanal y su reserva de embajadores se descuentan el dia en que se
generan. Su pago posterior transforma una obligacion ya reservada con delta de
emision cero; no se vuelve a descontar ni a financiar desde otro dia.

Puede quedar UKI sin distribuir si:

- Hay menos Cukie Masters o actividad que el presupuesto maximo.
- Hay creditos que no se usan o no se convierten.
- El score convierte menos de los 7.5 UKI maximos del tramo de rendimiento.
- El ranking reduce la parte final del jugador.
- Una partida utiliza Seiku y elimina la parte que habria correspondido al Cukie Pool.
- Un tramo acumulativo de rareza no tiene NFTs elegibles.
- Un puesto semanal o ganador de sorteo queda vacante.
- Un beneficiario no tiene embajador o la comision real es menor que la reserva.
- Un redondeo o regla versionada deja un residuo sin destinatario.

Todo importe sin destinatario queda primero en `undistributed_pending`: no es
claimable y no se reasigna retroactivamente a jugadores o pools. Al cerrar la
liquidacion se reparte de esta forma:

| Destino | Porcentaje |
| --- | ---: |
| Tesoreria | 80% |
| Marketing y desarrollo | 10% |
| Reduccion del supply | 10% |

Marketing y desarrollo forman un unico bucket del 10%; su reparto interno se
definira operativamente mas adelante. La reduccion de supply requiere fijar el
mecanismo on-chain concreto de burn o retirada permanente antes de ejecutar la
primera liquidacion. Ninguna de estas cantidades entra en un claim de usuario.

## BSC, Tron y migracion

- Direccion actual de producto: staking para Cukie Master y staking de Cukies para prestar solo en BSC.
- Esto implica empujar a los usuarios a migrar de Tron a BSC para participar.
- Pendiente: revisar si se cobra TRX para cubrir fee posterior en BSC.
- Direccion actual: no priorizar bridge de vuelta de BSC a Tron si no cambian las condiciones.

## Cukie Points y crias

Necesidades:

- Saber cuantos Cukie Points existen en mercado.
- Saber cuantos Cukie Points tiene cada usuario, incluyendo pendientes de reclamar.
- Definir una fecha a partir de la cual los Cukies en staking dejan de generar Cukie Points.
- Parar la opcion de generar crias a partir de una fecha.

Usos propuestos para Cukie Points:

1. Conversion a creditos.
   - Definir ratio Cukie Points -> creditos.
   - Limite diario global, ejemplo: 10,000 creditos al dia.
   - Limite diario por wallet, ejemplo: 500 creditos al dia.
   - Conversion solo en multiplos de 70.
   - Los creditos convertidos se asignan durante 7 dias.
   - Ejemplo: convertir 70 da 10 creditos diarios durante 7 dias.
   - La primera asignacion se hace a la misma hora diaria que Cukie Master.
   - Estos creditos tambien pueden configurarse para entrar en el pool.

2. Torneos.
   - Si en el futuro se permite jugar torneos pagando con UKI, permitir usar Cukie Points en lugar de UKI.
   - El objetivo seria calificar entre mejores de la semana.

3. Sorteo de NFTs.
   - Vender tickets en Cukie Points.
   - Ejecutar sorteo cuando se alcance una cantidad total definida.

## Decisiones pendientes

- Fecha exacta de inicio de preventa.
- Si BNB/USDT se aceptan en preventa y bajo que flujo.
- Incentivo concreto por compra.
- Incentivo concreto por invitar usuarios.
- Si el usuario elige manualmente Cukie propio en Treasure Hunt o se automatiza.
- Antes del primer cambio del horario diario, aprobar como se trata el periodo
  de transicion si resulta mas corto que 24 horas. El cambio nunca puede
  retrasar una salida ya solicitada.
- Si en una version futura los NFTs custodiados para Cukie Master pueden jugar.
  El lanzamiento los mantiene estrictamente no jugables y cualquier cambio
  requerira una regla nueva aplicable solo a periodos futuros.
- Definir el mecanismo on-chain exacto para ejecutar el 10% de reduccion de
  supply de `undistributed_pending`.
- Antes de mainnet, reconciliar el presupuesto fijo de 500,000 UKI diarios con
  la reserva de 450M y la duracion historicamente comunicada de seis anos.
- Fecha de corte para Cukie Points generados por Cukies en staking.
- Fecha de cierre para generar crias.
- Ratios y limites finales de conversion Cukie Points -> creditos.
- Detalle operativo de migracion Tron -> BSC y posible cobro de TRX para fee.
