# UKI dapp sitemap

Estado: arquitectura corregida e implementacion local en curso; requiere
validacion visual local antes de desplegar en staging.

- Issue ejecutable: #289 `UKI-031.0`.
- Epic: #72 `UKI-031`.
- Fecha de auditoria: 2026-08-30.
- Fuente funcional: punto 5 de `Antes del 15.docx`, SHA-256
  `6492dd6207fc82870cda13eef2c1ef5bcf620b090f643bf174ae6eab9e4c94dd`.
- Fuente de reglas: `docs/uki-current-operating-rules.md`.
- Runtime auditado: Coolify app 28, commit `2af7544`, rama `staging`, BSC
  Testnet `97` para las acciones economicas.

## Objetivo

Reunir Cukies World en un unico sitio web no significa concentrar todas las
acciones en una sola pantalla. La arquitectura separa tres superficies:

1. Informacion publica sin login.
2. Area operativa autenticada, con un Dashboard que resume y enlaza.
3. Vesting de preventa consultable mediante la wallet, separado del login de
   la cuenta de juego.

Cada dominio conserva una pantalla especializada. El Dashboard no compra UKI,
no configura pools, no decide elegibilidad y no calcula rewards en cliente.

## Evidencia del estado actual

- En la rama de trabajo, `/dashboard` ya es la ruta canonica dentro del app
  shell y `/wallet` redirige a `/dashboard` como alias legacy. Este cambio aun
  no se ha desplegado en Stage.
- El Dashboard consume en una sola llamada privada
  `/api/dashboard/v1/summary` los modulos reales de Cukie Master, creditos,
  Cukie Pool, rewards, marketplace/Cukies, vesting y juego/ranking. Embajadores
  conserva su API de lectura/escritura separada.
- La wallet se deriva exclusivamente de la sesion EVM firmada; la API no
  acepta otra wallet por query o body.
- Cada modulo publica `ready`, `degraded` o `unavailable`, su timestamp y sus
  incidencias. Un fallo conserva los demas datos y nunca se convierte en cero.
- La UI muestra identidad, disponibilidad, ultima actualizacion, alertas y un
  cambio de red expresado con lenguaje de cliente.
- La home ya comunica el estado posterior a la preventa, la liquidez, el
  staking y el torneo.
- `/vesting` ya consulta la posicion on-chain de la wallet sin exigir una
  cuenta interna.
- Cukie Master, creditos, staking UKI y staking NFT conviven en
  `/cukie-master`, ahora dentro del app shell privado.
- El Cukie Pool se opera en `/cukie-hodler#mi-cukie-pool`, tambien dentro del
  app shell privado.
- Marketplace, inventario, juego y ranking tienen rutas propias. El ranking
  permanece dentro de Jugar y los premios vigentes se resumen en Dashboard.
- El workspace ya no duplica el header publico ni anida un segundo `main`
  dentro del app shell.
- El recorrido local responsive se ha validado en navegador real para
  Dashboard, Cukie Master, Cukie Pool, Marketplace, Ranking y la entrada al
  juego. Ninguno de estos cambios se ha desplegado todavia.
- Aun faltan el gate visual final y la validacion con datos integrados en el
  despliegue agrupado de Stage.

Por tanto, la frontera funcional y la navegacion del Dashboard estan cubiertas
localmente, pero el punto 5 del DOCX no se considera cerrado hasta validar el
candidato agrupado con los datos y servicios reales de Stage/Testnet.

## Decisiones de arquitectura propuestas

### Ruta canonica

- `/` es la landing publica y la unica portada sin app shell.
- `/dashboard` es la ruta canonica del resumen autenticado.
- `/wallet` es un alias de compatibilidad que redirige a `/dashboard`.
- No se mantendran dos dashboards con datos o responsabilidades distintas.

### Separacion de superficies

```text
Publico, sin login
└── /                         Landing e informacion vigente

Modo app con header y sidebar
├── /dashboard               Resumen, alertas y siguientes acciones
├── /como-jugar              Explicacion del flujo
├── /cukie-master            Slots, staking UKI/NFT y creditos
├── /cukie-hodler            Cukie Pool
├── /cukies                  Inventario y herramientas de Cukies
├── /marketplace             Marketplace
├── /vesting                 Vesting por wallet
├── /premios                 Informacion y progreso de premios
├── /games/treasure-hunt     Juego y recursos reservados
├── /games/treasure-hunt/rankings
└── /rewards                 Rewards pending/claimable/claimed (objetivo)

Operacion interna, nunca publica
└── /admin/ops               Jobs, batches, auditoria y reintentos
```

La autenticacion del Dashboard debe derivar la wallet de una sesion EVM
firmada. No se aceptara una wallet arbitraria por query o body para consultar
datos economicos privados.

## Navegacion aprobable

### Header publico

- Inicio.
- Mi dashboard.
- Staking.
- Jugar.
- Vesting.

El header publico no debe volver a presentar la preventa terminada como una
compra activa. La compra actual de UKI puede enlazar al pool oficial, pero no
ocupa la responsabilidad del Dashboard.

### App shell autenticado

| Etiqueta | Destino | Funcion |
| --- | --- | --- |
| Inicio | `/` | Volver a la landing publica. |
| Jugar | `/games/treasure-hunt` | Entrar al juego; el ranking vive dentro de este flujo. |
| Cukie Master | `/cukie-master` | Cupos y staking UKI/NFT. |
| Creditos | `/cukie-master#competition-credits` | Usar o aportar creditos. |
| Pool de Cukies | `/cukie-hodler#mi-cukie-pool` | Gestionar el pool. |
| Mis Cukies | `/cukies` | Ver Cukies y su estado. |
| Marketplace | `/marketplace` | Comprar, vender y revisar anuncios. |
| Premios | `/dashboard#rewards-summary` | Consultar premios reclamables actuales. |
| Vesting | `/vesting` | Consultar y reclamar el vesting de preventa. |

No se usan grupos decorativos en el menu. No se crea `/rewards` hasta que
exista una pantalla completa de cobro; el enlace actual nunca apunta a una
ruta ficticia.

`/como-jugar`, `/premios` y `/vesting` tambien usan el app shell aunque no
tengan una entrada propia en el menu lateral. Ninguna de esas pantallas repite
el header publico, el footer ni el contenedor exterior de la landing.

## Regla de promocion entre entornos

- Staging y produccion comparten rutas, layout, menu, componentes y copy.
- Solo cambian variables de entorno, direcciones de contratos y servicios.
- La interfaz no muestra `stage`, `staging`, `testnet`, IDs de chain, batches,
  endpoints, colecciones ni otros conceptos operativos internos.
- El contrato del Dashboard es `dashboard-v1` en ambos entornos; staging usa
  BSC 97 y produccion BSC 56 mediante validacion de runtime.

En una fase posterior, creditos y Cukie Pool pueden separarse en
`/pools/credits` y `/pools/cukies`. Para el MVP se reutilizan las superficies
operativas ya existentes y se evitan migraciones de rutas innecesarias.

## Dashboard Wallet

### Responsabilidad unica

Responder rapidamente a cuatro preguntas:

1. Quien soy y en que red estoy.
2. Que recursos tengo disponibles para jugar o aportar.
3. Que necesita mi atencion antes del siguiente corte o partida.
4. Cual es mi siguiente accion segura.

### Jerarquia de contenido

1. **Identidad y salud**: cuenta, wallet firmada, red, sincronizacion y ultima
   actualizacion.
2. **Necesita tu atencion**: chain incorrecta, requisito en gracia, creditos que
   vencen, NFT bloqueado/inconsistente, retirada pendiente o reward reclamable.
3. **Acciones principales**: jugar, gestionar Cukie Master y revisar rewards.
4. **Resumen por dominio**:
   - UKI: vesting computable, staking y enlace a la pantalla correspondiente.
   - Cukie Master: slots por ruta UKI y NFT, maximo `5 + 5`, madurez y deficit.
   - Creditos: propios, destinados al pool, disponibles para partida y proximo
     corte/expiracion.
   - Cukies: disponibles, en Cukie Master, en Cukie Pool, asignados, listados o
     bloqueados.
   - Juego/ranking: recursos para jugar, mejor score y rank vigente cuando
     exista un periodo valido.
   - Rewards: `pending`, `claimable` y `claimed`, siempre con fuente y periodo.
5. **Accesos especializados**: enlaces claros, sin formularios avanzados dentro
   del Dashboard.

### No debe hacer

- No ejecutar compra de UKI.
- No permitir stake/unstake o depositos/retiros de pools dentro del resumen.
- No seleccionar Cukies ni reservar recursos para una partida.
- No calcular slots, elegibilidad, ranking ni rewards en el navegador.
- No mostrar cero cuando un origen ha fallado; debe mostrar `partial` o
  `unavailable`.
- No presentar rewards estimadas o pending como claimable.
- No exponer colecciones Mongo, jobs internos o datos de otra wallet.

## Contrato agregado propuesto

El futuro `GET /api/economy/v1/dashboard` sera un orquestador de lectura. Debe
usar los servicios de dominio existentes y no leer colecciones Mongo de forma
ad hoc.

```text
dashboard
├── identity        wallet firmada, chain y session
├── health          status, asOf, freshness y fuentes parciales
├── alerts[]        prioridad, codigo, dominio, accion y href
├── uki             vesting computable y staking
├── cukieMaster     ruta UKI, ruta NFT, slots y gracia
├── credits         propios, pool, expiracion y siguiente corte
├── cukies          conteos por estado canonico
├── game            disponibilidad, ranking y periodo
└── rewards         pending, claimable y claimed
```

Reglas del contrato:

- Chain fija `97` en Stage.
- Wallet derivada exclusivamente de la sesion EVM firmada.
- Respuesta `no-store` y sin datos sensibles de otras wallets.
- Cada modulo incluye `status`, `asOf` y, cuando proceda, `source`.
- Un fallo aislado produce respuesta `partial`; no sustituye datos desconocidos
  por ceros.
- Los estados economicos salen de servicios canonicos y snapshots sellados.
- El API no dispara ticks, reconciliaciones, claims ni transacciones.

## Estados UX obligatorios

| Estado | Resultado esperado |
| --- | --- |
| Wallet desconectada | Explica el valor del Dashboard y pide conectar. No muestra cifras personales. |
| Wallet conectada sin firma | Pide firmar la sesion antes de consultar datos privados. |
| Chain incorrecta | Permite lectura segura si existe, bloquea acciones y pide BSC Testnet 97 en Stage. |
| Loading | Skeleton estable por modulo; no cambia la geometria al resolver. |
| Partial | Muestra los modulos validos y marca cada origen no disponible. |
| Stale | Conserva lectura con `asOf`, aviso y accion de refresco; bloquea acciones sensibles. |
| Sin actividad | No inventa balances; ofrece Cukie Master, inventario o juego como siguientes pasos. |
| Ready | Resumen personal, alertas priorizadas y enlaces a pantallas especializadas. |
| Error total | Codigo recuperable, retry y soporte; no presenta ceros como verdad. |

## Matriz de trazabilidad del DOCX

| Requisito del punto 5 | Ubicacion propuesta | Papel del Dashboard |
| --- | --- | --- |
| Marketplace | `/marketplace` | Conteo/listings y enlace. |
| Juego | `/games/treasure-hunt` | Disponibilidad de recursos, rank y CTA. |
| Pool de Cukie Master | `/cukie-master` | Slots por ruta, madurez y alertas. |
| Pools de staking | `/cukie-master` y `/cukie-hodler` | Resumen de posiciones y enlace. |
| Pool de creditos | Panel actual de `/cukie-master`; ruta dedicada posterior | Balance, asignacion y corte. |
| Cukies disponibles | `/cukies` | Conteos por estado canonico y bloqueos. |
| Informacion sin login | `/`, `/como-jugar` y reglas publicas | Fuera del area autenticada. |
| Vesting de preventa | `/vesting` | Resumen/enlace; consulta wallet-based separada. |

## MVP requerido para el 15

1. Ruta `/dashboard` funcional y autenticada; `/wallet` deja de ser una ficha
   estatica duplicada.
2. API agregado con aislamiento Stage/Testnet y degradacion parcial.
3. Identidad/red/freshness visibles.
4. Modulos de UKI, Cukie Master, creditos, Cukies, juego/ranking y rewards con
   datos reales o estado explicito de indisponibilidad.
5. Alertas priorizadas y CTAs hacia las pantallas ya existentes.
6. Navegacion que separe el sitio publico del app shell autenticado.
7. Tests de contrato, auth, parcialidad, estados vacios y render responsive.

Estado local de implementacion:

- Puntos 1-7: implementados y cubiertos por el gate
  `pnpm staging:dashboard:verify-local`.

Validacion responsive local realizada con el build de produccion y runtime
emulado como Stage/chain `97`:

- Desktop `1200px`: Dashboard con app shell, navegacion agrupada y un unico
  landmark `main`.
- Mobile `390x844`: Dashboard -> Cukie Master -> Cukie Pool -> Marketplace ->
  Ranking, cerrando el drawer despues de cada navegacion.
- Ranking, Reglas y Perfil conservan el app shell; solo la ruta exacta del
  juego `/games/treasure-hunt` entra en modo inmersivo.
- La prueba local no habilita schedulers, firmas ni escrituras. Sin una Mongo
  local aislada, Marketplace muestra sus estados seguros de no disponibilidad;
  el inventario real se comprobara una sola vez en el despliegue agrupado de
  Stage.

## Ampliaciones posteriores

- Rutas dedicadas `/pools/credits` y `/pools/cukies`.
- Actividad unificada y filtros historicos.
- Multiples wallets por cuenta y delegacion de jugadores.
- Acciones rapidas, solo si mantienen las confirmaciones y reglas del dominio.
- Centro de notificaciones y preferencias.
- Consola `/admin/ops`, siempre aislada por rol.

## Gate visual

La arquitectura y el contrato de datos pueden implementarse antes de aprobar
una imagen. El styling visual final no puede comenzar hasta aprobar:

1. El prompt actualizado de `docs/uki-ux-image-validation-plan.md`.
2. La imagen de referencia resultante.

La referencia debe parecer una aplicacion operativa y navegable. Se rechazara
cualquier propuesta que parezca una landing, una infografia o un deck.
