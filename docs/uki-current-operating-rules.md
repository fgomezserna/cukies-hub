# UKI current operating rules

Estado: fuente operativa vigente para especificacion tecnica.
Fecha de sincronizacion: 2026-05-17.
Fuentes: `/Users/fgomezserna/Downloads/Funcionamiento.docx` y `/Users/fgomezserna/Downloads/UKI/Preventa UKI.docx`.

Este documento sustituye como referencia de producto a los documentos antiguos de `Funcionamiento`, `dudas` y `para comentar`. Si una issue o documento anterior contradice estas reglas, estas reglas prevalecen hasta que producto apruebe una version nueva.

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

## Cukie Master

Hay dos rutas independientes para obtener cupos de Cukie Master.

### Ruta 1: staking de Cukies Originales

- Cupos iniciales disponibles: 500.
- Requisito inicial: 3 puntos en Cukies Originales.
- Los Cukies stakeados se pueden usar para jugar.
- Los Cukies stakeados para Cukie Master no quedan disponibles para ser prestados a otros jugadores.

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
- Los UKI comprados en preventa con vesting cuentan directamente para staking y asignan cupos a holders.
- Para calcular cupos se suma UKI con vesting y UKI liberado/stakeado adicional.
- Un usuario puede stakear mas UKI de los que necesita. El exceso no da beneficios adicionales, pero funciona como margen si sube el requisito.

### Limites y requisito dinamico

- Maximo por wallet: 5 cupos de Cukie Master sumando ruta NFT y ruta UKI.
- Maximo global de cupos previsto: 5,000.
- Si una ruta llena sus 500 cupos iniciales y se decide no abrir mas cupos en ese momento, el requisito sube.
- Cuando el requisito sube, se abre una ventana de 48 horas para que los Cukie Masters ajusten staking y conserven posicion.
- Si, al cierre de la ventana, un usuario no cumple el nuevo requisito, pierde los cupos que no pueda mantener.
- El contador de 48 horas no se cancela aunque alguien haga unstake y el numero de cupos ocupados baje por debajo de 500.
- Cualquier usuario que quiera tomar un hueco libre durante esa ventana debe hacerlo cumpliendo el nuevo requisito.

La UI debe avisar con impacto concreto:

- Requisito anterior y nuevo.
- Cupos actuales y cupos que conservara si no actua.
- Cantidad adicional de puntos NFT o UKI necesaria para conservar cupos.
- Fecha/hora limite.

## Creditos de competicion

- Cada cupo de Cukie Master recibe 100 creditos diarios.
- La entrega se hace siempre a la misma hora.
- Un usuario debe ser Cukie Master durante al menos 24 horas antes de recibir la primera asignacion.
- Si deja de cumplir el requisito, conserva los creditos ya asignados, pero no recibe futuras entregas.
- Si vuelve a hacer staking para ser Cukie Master, el periodo de 24 horas empieza de nuevo.
- Los creditos no usados durante el dia se pierden.
- Los creditos se pueden usar para jugar o aportar al pool de creditos.

## Pool de creditos

- Los Cukie Masters pueden indicar cuantos creditos diarios quieren enviar al pool.
- La configuracion debe ser en multiplos de 10.
- La configuracion debe hacerse antes de la hora diaria de entrega.
- Si no se configura antes del corte, aplica al dia siguiente.
- Los UKI del pool se asignan diariamente a quienes aportaron creditos ese dia, de forma proporcional a su aportacion.
- Si un usuario aporto creditos al pool, recibira la recompensa de ese dia aunque deje de ser Cukie Master antes de la entrega de recompensas.
- Los jugadores sin creditos propios reciben creditos del pool mientras haya disponibilidad.

Retorno minimo inicial:

- El retorno inicial garantizado equivale a convertir el 20% de los creditos del pool.
- En el calculo diario, si la cantidad por cada 10 creditos aportados queda por debajo de 0.75 UKI, se asignan 0.75 UKI por cada 10 creditos.

Pool semanal:

- Cada semana, los mejores jugadores se reparten el bote semanal.
- Si las partidas ganadoras usaron creditos del pool y/o Cukies del pool, un porcentaje del premio se asigna al pool correspondiente.
- Ese importe no se reparte el mismo dia; se asigna a los participantes del pool de la semana siguiente.
- La distribucion se hace diariamente, repartiendo 1/7 cada dia.
- Estos UKI son adicionales al minimo diario del pool de creditos.

## Pool de Cukies

- Los usuarios pueden aportar Cukies para que otros jugadores los usen.
- Hay dos pools separados: Cukies Originales y Cukies de segunda generacion.
- Primero se prestan Cukies Originales.
- Si se agotan los Originales, se prestan Cukies de segunda generacion.
- Si no hay ningun Cukie disponible, se asigna un Seiku ficticio.
- El reparto con Seiku se trata de forma similar a jugar con un Cukie Comun Original.
- Los UKI generados para propietarios se reparten en el pool correspondiente segun si el jugador uso Original o segunda generacion.
- El usuario debe tener el Cukie en staking al menos 24 horas antes de recibir la primera recompensa.
- Si hace unstake, al volver a stakear empieza de nuevo la espera minima de 24 horas.

Reparto por rareza:

| Tramo de rareza | Porcentaje |
| --- | ---: |
| Todos | 16.66% |
| No Comun o superior | 16.66% |
| Raro o superior | 16.66% |
| Epico o superior | 16.66% |
| Legendario o superior | 16.66% |
| Goat | 16.66% |

Partidas disponibles por Cukie:

| Rareza | Original | Segunda generacion o superior |
| --- | ---: | ---: |
| Comun | 2 | 1 |
| No Comun | 4 | 2 |
| Raro | 6 | 3 |
| Epico | 8 | 4 |
| Legendario | 10 | 5 |
| Goat | 12 | 6 |

## Arena ranking

- Solo se rankean los jugadores que usan creditos del pool.
- Los jugadores empiezan en ranking #5.
- El ranking se actualiza semanalmente.
- El movimiento maximo semanal es de 2 categorias hacia arriba o hacia abajo.
- Para poder subir hay que jugar al menos 20 partidas durante la semana.
- Para poder bajar hay que jugar al menos 10 partidas durante la semana.
- Para calcular el porcentaje de creditos convertidos no se cuentan los 2.5 creditos que se convierten al iniciar una partida y van al pool semanal.
- Para actualizar ranking no se cuentan los UKI ganados por estar entre los mejores jugadores de la semana.

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

La recompensa por ranking aplica sobre los tokens que quedan despues de asignar 50% al pool de creditos y, si corresponde, 25% al pool de Cukies.

## Treasure Hunt

- Una partida requiere 10 creditos de competicion y un Cukie con partidas disponibles.
- 2.5 creditos se convierten inmediatamente a UKI y van al pool semanal de premios.
- Los 7.5 creditos restantes estan en juego.
- Conversion de score: lineal entre 0 y 3,000 puntos.
- 3,000 puntos o mas convierten el 100% de los 7.5 creditos.
- 1,000 puntos convierten 33.33%.

Uso de creditos:

- Si el jugador tiene creditos propios, se usan sus creditos.
- Las partidas con creditos propios no computan para ranking.
- En partidas con creditos propios no se mira el ranking para calcular UKI del jugador.
- Si el jugador no tiene creditos propios, se asignan 10 creditos del pool.
- Las partidas con creditos del pool computan para ranking.
- En partidas con creditos del pool se usa el ranking del jugador para calcular su parte.

Uso de Cukies:

- Si el jugador tiene Cukies con partidas disponibles, la propuesta actual es que seleccione cual usar.
- Si no tiene Cukies con partidas disponibles, se asigna un Cukie del pool.
- Decision pendiente: confirmar si la seleccion manual del Cukie propio es necesaria o si conviene automatizarla.

Settlement si se convierten 7.5 UKI:

| Caso | Pool creditos | Pool Cukies | Jugador |
| --- | ---: | ---: | --- |
| Creditos prestados + Cukie prestado | 3.75 UKI | 1.875 UKI | Porcentaje de ranking sobre 1.875 UKI |
| Creditos prestados + Cukie propio | 3.75 UKI | 0 | Porcentaje de ranking sobre 3.75 UKI |
| Creditos propios + Cukie prestado | 0 | 3.75 UKI | 3.75 UKI |
| Creditos propios + Cukie propio | 0 | 0 | 7.5 UKI |

## UKI no distribuidos

Reserva diaria prevista para recompensas a usuarios: 500,000 UKI.

Puede quedar UKI sin distribuir si:

- Hay menos de 5,000 Cukie Masters.
- Hay creditos que no se usan.
- Hay creditos que se usan pero no se convierten a UKI.
- Un jugador no tiene ranking #1 y por tanto no recibe el 100% de la parte restante.

Distribucion propuesta:

| Destino | Porcentaje |
| --- | ---: |
| Tesoreria | 80% |
| Marketing | 5% |
| Desarrollo | 5% |
| Reducir supply | 10% |

Usos previstos de tesoreria:

- Ampliar duracion del programa de recompensas.
- Aportar liquidez al token.
- Reserva.
- Crecimiento del ecosistema.
- Eventos, promociones e incentivos.

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
- Fecha de corte para Cukie Points generados por Cukies en staking.
- Fecha de cierre para generar crias.
- Ratios y limites finales de conversion Cukie Points -> creditos.
- Detalle operativo de migracion Tron -> BSC y posible cobro de TRX para fee.
