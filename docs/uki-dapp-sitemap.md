# Cukies Hub: arquitectura de navegación y auditoría UX

Fecha: **2026-09-08, Europe/Andorra (CEST)**. Modo: auditoría y propuesta;
no se ha implementado el rediseño. Sustituye el mapa del 30 de agosto que aún
situaba el Dashboard únicamente en local y proponía rutas/API hoy obsoletas.
El estado del punto 5 se mantiene únicamente en
[Seguimiento antes del 15](antes-del-15-seguimiento.md#5-dashboard-y-arquitectura-del-sitio).
Las [reglas de producto](uki-current-operating-rules.md) prevalecen sobre las
propuestas de este informe. Referencias de coordinación: #289 / epic #72;
sus estados de GitHub no se han revisado en esta auditoría.

## Alcance y evidencia

- Runtime: [Stage](https://cukieshub.eurekand.com), app 28, SHA
  `ed2d50da47ef5eeef83162b9cfda9e247821c930`. `/api/health` devuelve `ok` y ese
  SHA. La sesión de revisión del 8 de septiembre local corresponde a la
  **noche del 7 de septiembre UTC**; las lecturas se hicieron durante las 23 h UTC.
- Código: mismo árbol que ese SHA, contrastado con `origin/staging`.
  Dos auditores Luna revisaron áreas independientes; el coordinador contrastó
  los hallazgos en Edge con una sesión existente y datos servidos por Stage.
- **27 rutas visitadas**, además de sus componentes y wrappers. Escritorio y
  móvil con viewport CSS medido **391 × 844**; no es una prueba en un teléfono
  físico. Se inspeccionaron capturas y árboles de accesibilidad. No se guardaron
  capturas de la cuenta en Git; las capturas quedan en esta tarea.
- Se probó abrir/cerrar el drawer, navegar desde él, Escape y entrada con Tab.
  No se firmó, jugó, cambió red, editó perfil, cobró ni movió ningún activo.
  Se restauró el tamaño del navegador y se conservó la sesión del usuario.
- `LIVE` significa contenido observado; **no acredita que un saldo sea correcto**
  ni que las escrituras funcionen. `CÓDIGO` identifica variantes sin recorrido
  live. Producción, wallets sin sesión, iOS/Android, lectores de pantalla y
  estados transaccionales completos quedan fuera de esta pasada.
- Los contratos legacy existentes y sus workers siguen el programa de
  migración. Un catálogo vacío en esta visita no demuestra ausencia de NFTs,
  anuncios ni eventos. No se reabren como fallos la liquidez y el torneo de
  producción que el usuario confirmó operativos.

## Diagnóstico

La aplicación dispone de superficies útiles, pero al navegar cambia el modelo
que presenta al usuario: cuenta frente a perfil del torneo, intentos frente a
créditos, puntos de cuenta frente a Cukie Points y datos desconocidos frente a
cero. El primer trabajo debe asegurar que el mismo estado se explica igual en
cada pantalla; después, reducir navegación y contenido repetidos.

Se conservan estas piezas que sí ayudan: landing separada de la aplicación,
secciones propias para Master/Créditos/Pool, pestañas del juego, cierre del menú
al navegar, menú público móvil con cierre visible y retorno de foco tras Escape,
recuperación del pool con un caso de uso explícito, distinción de
premios disponibles/en preparación/cobrados, y confirmación de embajador sin
gas antes de habilitar la invitación propia. No necesitan rehacerse por sistema.

Las prioridades siguientes ordenan **trabajo UX**, no son nuevos bloqueos de
lanzamiento ni certificaciones de errores económicos.

## Hallazgos priorizados

| ID | Prioridad | Hecho y efecto sobre el usuario | Corrección propuesta y aceptación |
| --- | --- | --- | --- |
| UX-01 | Alta | LIVE: Créditos muestra seis cupos activos; Master muestra cero y «Consigue tu primer cupo». En la misma sesión, colección muestra nueve disponibles mientras Pool presenta un aviso de actualización, cero disponibles y «Todo al día». No queda claro qué es conocido, qué está pendiente y qué significa cada disponibilidad. | Separar cupos que generan créditos de requisito/posición y etiquetar fecha/periodo; en datos incompletos, mostrar «No podemos confirmar…» y conservar únicamente cifras verificadas. No sugerir nuevos depósitos basándose en un dato desconocido. Cada discrepancia debe tener explicación de alcance o pasar a revisión de datos. |
| UX-02 | Alta | LIVE: `/como-jugar` anuncia 2,5 créditos para el bote; `/games/treasure-hunt/rules` explica 2 UKI al bote + 0,5 de reserva de embajadores. La primera además muestra «Pendiente de decisión de producto…» y otra explicación de asignación de Cukie. | Una explicación canónica por modo de juego; ayuda breve enlazada al detalle vigente, sin repetir tablas independientes. Cero notas internas y ninguna diferencia de cantidades, unidades o selección de recursos entre ambas rutas. |
| UX-03 | Alta | LIVE + código: campana fija con «1 mensaje sin leer», avatar de ejemplo y primera misión. «Ver todo» lleva a `/quests`, donde en esta cuenta no hay misiones. El botón de la campana carece de nombre accesible. | Mostrar notificaciones reales o un estado vacío sin contador. «Ver todo» debe abrir contenido de notificaciones. Nombre accesible «Notificaciones» y contador real; sin fabricar actividad. Un centro completo puede esperar. |
| UX-04 | Alta | LIVE: diez entradas planas de sidebar, sin Resumen. `/dashboard` existe y la landing enlaza a él, pero dentro de la app falta el regreso directo; la página no marca ninguna sección activa. | Añadir Resumen → `/dashboard`, conservar Inicio/logo → `/`. Hacer visible el contexto activo en rutas hijas y dar a las herramientas de colección un acceso contextual estable. Llegar al resumen desde cualquier área operativa en un paso. |
| UX-05 | Media | LIVE + código: drawer de la app sin cierre visible; el botón `Close` tiene `display:none`. Escape cierra pero el foco termina en `body`, no en el activador. Entradas de 40 px de alto. Tab entra en el diálogo y no hubo desbordamiento horizontal a 391 px. El menú público sí tiene cierre visible y devuelve el foco tras Escape. | Cierre visible «Cerrar menú», retorno de foco al activador al cancelar y foco útil tras navegar. Objetivo táctil de proyecto de al menos 44 × 44 px; validar recorrido completo de foco y menú desplazable en pantallas bajas. No se afirma una auditoría WCAG completa. |
| UX-06 | Alta | LIVE: «Mi perfil» edita solo el alias del ranking. `/settings` permite foto, identidad pública y preferencias pero no aparece en el menú de cuenta. Este muestra XP/rango y «Mi wallet» deshabilitado. El avatar visible es un placeholder «100 × 100». | Una entrada «Mi cuenta» que explique perfil público, alias de competición y wallet como conceptos distintos, con accesos a los ajustes existentes. Avatar real o iniciales/identicon local. Eliminar controles sin función o darles destino real. No fusionar identificadores a nivel de datos desde UX. |
| UX-07 | Media | LIVE: Dashboard duplica encabezados y wallet, y antepone dos banners generales al resumen; juego queda al final. En móvil Créditos aún repite introducciones antes de enseñar el saldo; en Juegos la imagen desplaza «Jugar ahora» fuera del primer viewport. | Una cabecera corta; estado y siguiente acción antes de decoración. Saldo de hoy separado del reparto futuro. Avisos junto al dato afectado, manteniendo arriba los que bloqueen la acción principal. Una CTA primaria y hasta dos secundarias por tarea. |
| UX-08 | Alta | LIVE Stage: portada anima al torneo y muestra siete intentos junto a una edición finalizada; el Dashboard conserva siete intentos y «Juego disponible», pero el juego abre el modo semanal sin créditos. El iframe presenta «JUGAR 1P» aunque el panel indica «No se iniciará la partida». | Derivar nombre de modo, coste, disponibilidad, acción y destino de una misma condición vigente. Intentos históricos identificados como tales; no proponer staking para resolver un requisito de créditos. El iframe debe comunicar el mismo bloqueo que su contenedor. No se pulsó JUGAR: no se afirma un bypass de cobro. |
| UX-09 | Alta, ligada a migración | LIVE: Marketplace tiene búsqueda, red, tipo, generación, orden y reset. CÓDIGO: elige feed legacy **o** UKI según configuración; falta la lista conjunta aprobada. No se observaron anuncios comprables en esta sesión. | Todos/Legacy/UKI, filtros comunes y badge Legacy por card; red y moneda explícitas, detalle/acciones por contrato exacto. Conservar habilidades/crías donde existan. Nunca ordenar importes de monedas distintas como si fueran comparables. Validar con datos reconciliados, sin interpretar cero resultados como fallo del worker. |
| UX-10 | Alta, ligada a migración | LIVE + código: Mis Cukies promete «Abre una ficha», pero los Cukies disponibles y depositados ofrecen solo una acción a Pool/Master, sin enlace de ficha. Bridge, Crías y Cukie Points no son descubribles desde esa colección. | Ficha accesible para cada Cukie independientemente de su estado; acción compatible separada. Añadir herramientas contextuales de colección. Conservar red/origen/estado al pasar de listado a detalle y al volver. |
| UX-11 | Media, ligada a migración | LIVE: Cukie Points mezcla saldo personal con «Rows», totales emitidos/quemados y actividad global; saldos de red «-» conviven con total 0. Bridge explica su indisponibilidad correctamente pero carece de siguiente paso. Crías pide conectar/red BSC aun con wallet EVM conectada y usa botones en inglés. | Cukie Points: saldo emitido, pendiente e historial personal primero; métricas globales secundarias. Desconocido no suma cero. Bridge: estado/seguimiento o regreso a colección. Crías: distinguir conexión, red incorrecta, fuente no disponible y ausencia de padres; etiquetas en castellano. |
| UX-12 | Media | LIVE: Ajustes rosa/cian, perfil verde/cian, superficies legacy en inglés y app lila. `/points`, `/quests`, `/leaderboard`, Hyppie Road y Tower Builder mantienen conceptos de XP/misiones distintos de UKI. | Aplicar tokens actuales y vocabulario coherente; aclarar qué superficies participan en la economía UKI. No añadir todas al sidebar ni retirar datos/rutas sin decidir su alcance. Mantener los puntos de cuenta separados de Cukie Points y créditos. |
| UX-13 | Media | LIVE: `/vesting` indica que no hay asignación pero muestra inicio y final pendiente; `/vesting-legacy` mantiene otro diseño y habla de «después de una compra correcta» de preventa. Son dos implementaciones, no un simple redirect. | Estado sin asignación breve y sin calendario personal aparente. Revisar consumidores de la ruta alternativa; conservar `/vesting` como destino de navegación. Si hay una diferencia contractual real, explicarla; si no, compartir vista y mantener compatibilidad. No cambiar contratos ni borrar rutas por su nombre. |
| UX-14 | Media | LIVE: la portada ofrece selector ES/EN, pero ajustes, puntos y crías mezclan ambos idiomas; el formulario de compra muestra ASM mientras otros textos enumeran más monedas. Hay texto de entorno («En testnet…») dentro del flujo. | Definir y aplicar el idioma de la sesión a todas las superficies publicadas. Las monedas ofrecidas y las ayudas deben seguir capacidades reales del formulario. Mantener información de red necesaria para firmar, evitando copy de despliegue. No afirmar que falte liquidez en Main a partir de Stage. |

### Fuentes de los hallazgos

Cada referencia corresponde al árbol del SHA auditado; las observaciones LIVE
son las descritas arriba y no una prueba adicional del backend.

| IDs | Código principal (máximo dos referencias por hallazgo) |
| --- | --- |
| UX-01 | `dapp/src/components/cukie-master/status-panel.tsx`; `dapp/src/components/cukie-pool/status-panel.tsx` |
| UX-02 | `dapp/src/app/como-jugar/page.tsx`; `dapp/src/components/games/treasure-hunt-rules-view.tsx` |
| UX-03 | `dapp/src/components/layout/header.tsx`; `dapp/src/app/(app)/quests/page.tsx` |
| UX-04 | `dapp/src/components/layout/app-layout.tsx`; `dapp/src/app/(app)/dashboard/page.tsx` |
| UX-05 | `dapp/src/components/ui/sidebar.tsx`; `dapp/src/components/layout/header.tsx` |
| UX-06 | `dapp/src/components/layout/header.tsx`; `dapp/src/app/(app)/settings/page.tsx` |
| UX-07 | `dapp/src/components/wallet/dashboard-overview-panel.tsx`; `dapp/src/app/(app)/credits/page.tsx` |
| UX-08 | `dapp/src/components/games/treasure-hunt-credit-mode.tsx`; `dapp/src/components/landing/sections.tsx` |
| UX-09 | `dapp/src/app/(app)/marketplace/page.tsx`; `dapp/src/components/legacy-marketplace/marketplace-client.tsx` |
| UX-10 | `dapp/src/components/cukies/my-cukies-panel.tsx`; `dapp/src/app/(app)/cukies/page.tsx` |
| UX-11 | `dapp/src/components/legacy-marketplace/cukiepoints-client.tsx`; `dapp/src/components/legacy-marketplace/breeding-client.tsx` |
| UX-12 | `dapp/src/components/profile/treasure-hunt-profile.tsx`; `dapp/src/app/(app)/settings/page.tsx` |
| UX-13 | `dapp/src/app/vesting/page.tsx`; `dapp/src/app/(app)/vesting-legacy/page.tsx` |
| UX-14 | `dapp/src/components/landing/sections.tsx`; `dapp/src/components/landing/uki-swap-panel.tsx` |

## Arquitectura propuesta

Propuesta de navegación aprobada por el usuario el 8 de septiembre. Su estado
de implementación se mantiene en el seguimiento único. Conserva las
rutas existentes y el significado aprobado de Inicio. Los grupos sirven a
tareas reales, no añaden pantallas intermedias obligatorias.

| Zona | Entrada y destino | Papel |
| --- | --- | --- |
| Acceso principal | Resumen `/dashboard`; Jugar `/games` | Estado personal y siguiente acción; selección de juego. |
| Recursos | Cukie Master `/cukie-master`; Créditos `/credits`; Pool de Cukies `/cukie-hodler#mi-cukie-pool` | Conseguir cupos, decidir reparto, aportar/recuperar Cukies. |
| Colección | Mis Cukies `/cukies`; Marketplace `/marketplace` | Inventario y compraventa. Dentro de colección: ficha, Bridge `/bridge`, Crías `/breeding`, Cukie Points `/cukiepoints`. |
| Cobros | Premios `/premios`; Vesting `/vesting` | Premios de actividad y asignaciones de liberación gradual, claramente distintos. |
| Invitaciones | Embajadores `/embajadores` | Confirmar relación o compartir y consultar comisiones según estado. |
| Cuenta y ayuda | Avatar → cuenta/perfil y ajustes existentes; ayuda → `/como-jugar`; Inicio → `/` | Identidad, wallet y soporte de la tarea. Logo mantiene `/`. |

En móvil se conserva la misma arquitectura en un drawer con cierre y sección
activa. No se añaden simultáneamente barra inferior y drawer duplicando todos
los destinos. Bridge/Crías/Puntos quedan a un máximo de dos pasos desde el menú,
con acceso directo desde el Cukie correspondiente. Las funciones pausadas se
explican en contexto; no se convierten en botones que parezcan operativos.

La landing informa y capta; Resumen permite continuar. El juego puede conservar
su vista inmersiva, con regreso a Juegos y acceso a ranking, reglas y perfil.
El estado activo debe marcar el grupo correspondiente incluso en las herramientas
legacy, sin hacer que el enlace Inicio cambie de destino.

### Dashboard propuesto

Orden: identidad breve → siguiente acción según datos fiables → recursos para
jugar → posiciones/operaciones pendientes → cobros → enlaces especializados.
Un único bloque de alerta global se reserva para problemas que bloqueen esa
acción. El fallo de un módulo debe permanecer junto a ese módulo.

- Con recursos y sin operación pendiente: «Jugar Treasure Hunt», con modo y coste.
- Sin recursos confirmados: explicar el requisito que falta y enlazar a gestionarlo.
- Con origen sin verificar: «Actualizar estado»; no recomendar depositar más.
- Con retirada o premio que exige atención: mostrar importe/activo, estado y plazo;
  el usuario abre la pantalla especializada para confirmar la operación.
- Sin actividad: entrada breve al juego y explicación de recursos; sin siete
  grandes tarjetas vacías que aparenten problemas.

El resumen **no** compra, deposita, retira ni calcula elegibilidad en cliente.
Usa el agregado existente `/api/dashboard/v1/summary`, derivado de la sesión
EVM firmada. No se propone otra API ni una wallet arbitraria por query/body.
Los estados, fecha y origen deben conservarse al resumir cada servicio.

## Revisión de cada pantalla

La columna «orden propuesto» identifica el dato decisivo y la acción dominante.
No constituye una aprobación de nuevas reglas económicas.

| Pantalla / cobertura | Qué debe resolver y qué comunica hoy | Orden propuesto / qué conservar |
| --- | --- | --- |
| `/` · LIVE escritorio/móvil | UKI activo, compra, staking, torneo y accesos de preventa. La edición mostrada en Stage está cerrada aunque el hero invite a entrar. Menú público móvil con cierre y retorno del foco correctos en la prueba. | Mantener identidad e información pública; CTA y explicación según fase real. Compra con capacidades actuales; vesting/preventa como consulta separada. UX-08/14. |
| `/dashboard` · LIVE escritorio/móvil | Resumen de siete dominios; repite introducción y no prioriza continuación. | Aplicar orden anterior y UX-01/04/07/08. Una única wallet abreviada con acceso a detalle. |
| `/games` · LIVE móvil | Treasure Hunt recomendado y tres mundos externos. | Mantener recomendación; título y CTA antes de gran imagen en móvil. Indicar destino externo y relación de cada juego con créditos/premios. No declarar equivalencia económica sin verificar. |
| `/games/treasure-hunt` · LIVE móvil | Modo semanal: 10 créditos, saldo insuficiente; iframe con JUGAR 1P. | Modo → recursos/coste → acción coherente → juego; conservar fullscreen y pestañas. UX-08. |
| `/games/treasure-hunt/rankings` · LIVE escritorio | Semana actual, torneos especiales, mi posición y reglas de elegibilidad. | La distinción ya existe y se conserva. Periodo y posición propia primero; vacío con acceso a jugar y explicación de crédito elegible. |
| `/games/treasure-hunt/rules` · LIVE escritorio | Reglas semanales, recursos, reparto, ranking, abandonos/fallos. | Fuente detallada canónica; resumen «Antes / Durante / Después» y detalle desplegable. Mantener distinción recompensa directa/ranking. UX-02. |
| `/games/treasure-hunt/profile` · CÓDIGO | Componente de alias de competición compartido con perfil propio. | Nombre público del ranking → edición → guardar; conservar separación respecto al identificador de cuenta y enlazar a mi posición. |
| `/credits` · LIVE móvil | Saldo de hoy, próximo reparto por cupo, configuración e historial. | Saldo/caducidad → reparto futuro y efecto → guardar → ajuste por cupo → historial. Conservar presets y texto que explica cuándo aplica; no mostrar seis cupos sin reconciliar su significado con Master. |
| `/cukie-master` · LIVE móvil | Cupos por UKI/Originales y gestión del staking. | Estado confirmado → requisito restante/activación por vía → depositar o retirar según intención → reglas. Conservar límites independientes y consideración del vesting. UX-01. |
| `/cukie-hodler` · LIVE móvil | Aportar, consultar posición y recuperar Cukies; aviso de actualización con vacíos concluyentes. | Estados y siguiente acción → posiciones → aportar → reglas. Diferenciar en custodia, activándose, disponible para partida y retirable. UX-01. |
| `/cukie-hodler/recuperar` · LIVE escritorio | Herramienta para un Cukie depositado que no aparece, con regreso al pool. | El criterio ya es claro: conservarlo. Consulta de posición → resultado → recuperación permitida. No añadir pasos que dupliquen su explicación. Escritura no probada. |
| `/cukies` · LIVE móvil | Total en wallet/Pool/Master y acción contextual por NFT. | Resumen compacto → filtros/estados → cards con ficha siempre accesible → acción válida; herramientas de colección en segundo nivel. UX-10. |
| `/marketplace` · LIVE móvil | Búsqueda, filtros, 0 resultados, paginación y refresco. | Lista conjunta, filtros conservados al volver, origen/red/moneda visibles. Diferenciar cero ofertas, filtro sin coincidencias y catálogo incompleto. No se compró ni publicó. UX-09. |
| `/marketplace/[tokenId]` · CÓDIGO | Ficha, habilidades, estado, historia, familia y acciones legacy. | Identidad/origen → precio/propietario/estado → acción según contrato → habilidades/familia/historial. No había anuncio navegable en la muestra live; pendiente verificar detalle y vuelta conservando filtros con fixtures de ambos orígenes. |
| `/bridge` · LIVE móvil | Transferencias no disponibles; informa que los Cukies no se moverán. | Conservar bloqueo honesto; origen/destino → NFT/fee → revisión → seguimiento, con retorno a colección. Operaciones existentes deben seguir siendo consultables según datos disponibles. |
| `/cukiepoints` · LIVE móvil | Puntos por wallet, totales globales y actividad; castellano/inglés mezclados. | Saldo emitido y pendiente separados → posiciones de staking legacy → historial personal por red. Vista global secundaria. No inventar claim ni conversión nueva. UX-11. |
| `/breeding` · LIVE móvil | Padres, puntos, red, iniciar/activos/completados; campos vacíos y cambio de red. | Elegibilidad/red → dos padres → coste y condiciones → firma → cría pendiente/finalización. Mantener pestañas y enlaces a puntos/familia; no confundir vacío con fuente caída. |
| `/embajadores` · LIVE móvil | Propone Cukies World, explica firma sin gas, bloquea enlace propio hasta confirmar y separa comisiones. | Conservar reglas. Para nuevo usuario: confirmar → compartir; para confirmado: enlace → invitados → comisiones. Reducir tres repeticiones de «pendiente», dejando reglas como apoyo. |
| `/embajadores/[code]` · CÓDIGO | Misma pantalla con invitación específica; contempla errores y elegibilidad. | Destacar quién invita y permanencia de la relación. Conexión/navegación no confirman; firma específica sin gas. No probar un referido arbitrario ni alterar atribuciones en esta auditoría. |
| `/premios` · LIVE escritorio | Disponible, preparación, cobrado e historial, con explicaciones de estados. | Conservar estructura funcional; reducir altura de hero y tarjetas vacías. Cobrar domina solo si hay algo cobrable; filtro de origen y plazos en el detalle. Claims no probados. |
| `/vesting` · LIVE escritorio | Asignado/disponible/bloqueado/calendario; la wallet observada no tiene asignación. | Disponible y próxima liberación cuando existan; vacío sencillo si no hay asignación. Evitar calendario personal aparente y cifras repetidas. UX-13. |
| `/vesting-legacy` · LIVE escritorio | Otra implementación de consulta y claim de preventa, con texto técnico. | Revisar diferencia contractual/consumidores antes de consolidar. No mantener dos relatos de la misma tarea ni eliminar la ruta sin compatibilidad. |
| `/como-jugar` · LIVE escritorio, acordeón abierto | Introducción y ayuda con reparto distinto y nota interna. | Guía breve de entrada enlazada a reglas canónicas del modo vigente; limpiar contenido obsoleto. UX-02. |
| `/profile` · LIVE escritorio | «Mi perfil» es una edición de alias del torneo y wallet de solo lectura. | Convertir el acceso en puerta clara de cuenta, conservando edición del alias del ranking como tarea identificada. UX-06. |
| `/settings` · LIVE escritorio | Nombre público, foto, email, bio y pestaña de preferencias; inglés y otra paleta. | Agrupar perfil público/alias/wallet, explicar qué se publica y qué solo puede elegirse una vez; guardar por tarea. No se modificaron campos ni se validó persistencia. |
| `/profile/[username]` · CÓDIGO | Perfil público con estadísticas/quests/puntos. | Presentación pública consistente y sin datos privados; no equiparar XP con créditos. Sin una URL de perfil público confirmada, no se probó contenido de otro usuario. |
| `/points` · LIVE escritorio | Puntos de cuenta, tier, ranking y Daily Drop bloqueado por una misión. | Decidir si este sistema se publica en la fase actual. Si permanece, nombrarlo explícitamente «Puntos de cuenta», con procedencia y tareas reales. Nunca sumarlo a Cukie Points. |
| `/quests` · LIVE escritorio | Mission Center vacío para esta sesión, destino del «Ver todo» de notificaciones. | Misiones reales con su estado; no usarlo como centro de notificaciones ni crear obligación ficticia de completar una misión. |
| `/leaderboard` · LIVE escritorio | Clasificación XP, filtros temporales y juegos; vacío. | Distinguir clasificación de cuenta de ranking económico de Treasure Hunt, enlazándola únicamente desde su propio contexto si se mantiene publicada. |
| `/games/tower-builder` · LIVE escritorio | Hyppie Tower, iframe, score/rango/XP, textos en inglés. | Identidad del juego → acción → resultado; adaptar marco/idioma. No se inició partida ni se certificó carga completa o economía del iframe. |
| `/games/hyppie-road` · LIVE escritorio | Juego con copy de apuestas/rewards, score/rango/XP, textos en inglés. | Aclarar disponibilidad y significado de recompensas antes de entrada; mismas convenciones de juego. No afirmar premios UKI o apuestas operativas sin contrastarlos. |
| `/indexer` · CÓDIGO, interno | Consola de operación; no es una pantalla de cliente. | Mantener acceso autorizado y fuera de la navegación pública. Esta auditoría no prueba controles de autorización ni inspecciona bases. |

### Compatibilidad y rutas que no son nuevas pantallas

- `/wallet` → `/dashboard`, `/games/sybil-slayer` → Treasure Hunt y
  `/games/treasure-hunt/competitions` → rankings son redirects revisados en
  código. Su existencia no es un defecto y no necesita aviso de migración.
- `/bridges/cukies` comparte Bridge; `/users/points` comparte Cukie Points.
  Documentar un destino preferente en los enlaces sin romper consumidores.
- `/breeding/breed`, `/breeding/active-breeds` y
  `/breeding/completed-breeds` conservan enlaces profundos a pestañas. Son útiles;
  comprobar que el estado/pestaña y volver atrás se conservan al implementarlos.
- La ruta `/vesting-legacy` sí renderiza otra implementación y se trata arriba.
- No se añaden rutas ficticias `/rewards`, `/arena`, `/pools/credits` o
  `/admin/ops` al menú; usar las rutas de producto/operación existentes.

## Orden de trabajo y criterios medibles

1. **Confianza y contenido:** UX-01/02/03/08. Reconciliar significados y fuentes
   visibles; errores y parciales honestos; ayuda canónica; campana sin actividad
   inventada. Depende de los estados reales que sirvan los dominios, no de un
   restyling general.
2. **Recorridos legacy completos:** UX-09/10/11 con workers y datos reconciliados.
   Probar lista/ficha/compra/publicación por origen, bridge pendiente/finalizado,
   puntos emitidos/pendientes y crías activas/terminadas. No activar escrituras
   mainnet legacy desde Stage como parte de una prueba visual.
3. **Navegación y cuenta:** UX-04/05/06/07/12/13/14 sobre esos recorridos; menú,
   móvil, dashboard, perfil y tokens comunes. La propuesta puede revisarse ya;
   la integración final no debe fingir que las acciones legacy están listas.

Criterios para aprobar el candidato:

- Resumen accesible desde cualquier pantalla del shell; herramienta de colección
  en como máximo dos pasos desde el menú; todos los destinos visibles existen.
- Una acción primaria y hasta dos secundarias por tarea. En 391 × 844, primer
  viewport de páginas operativas muestra estado decisivo y acción o bloqueo
  explicado; ilustraciones y encabezados repetidos no los desplazan.
- Igual wallet, periodo y fuente producen etiquetas y números compatibles entre
  Resumen, Master, Créditos, colección y Pool. Toda diferencia por alcance se
  explica; fuente desconocida no genera «Todo al día» ni una CTA de depósito.
- Cada estado de la [matriz UX](uki-ux-state-matrix.md) tiene escenario de prueba:
  carga, vacío, parcial, error, sesión, red y acción pendiente/confirmada/rechazada.
- Menú usable a 320, 391, 768 y 1440 px; sin desbordamiento horizontal de la
  página, cierre visible, foco contenido y retorno correcto; nombres accesibles
  para iconos/selectores y objetivos táctiles de al menos 44 × 44 px.
- Regresar del detalle restaura filtros, origen y posición de lista. Cada card
  y revisión de compra identifica red, moneda y Legacy/UKI.
- Sin notas de producto, placeholders de ejemplo ni notificaciones inventadas.
  Idioma consistente; cantidades/unidades/fechas y zona horaria inequívocas.
- Prueba futura con cinco personas: al menos cuatro encuentran jugar, gestionar
  créditos, retirar un Cukie, consultar premios y cambiar alias sin ayuda; al
  menos cuatro explican correctamente el próximo reparto y la confirmación del
  embajador. **Estos resultados no se han medido en esta auditoría.**

### Rúbrica de auditoría

Valoración heurística del estado observado, escala 0–3; no es una medición de
usuarios ni una certificación de accesibilidad.

| Criterio | Peso | Actual | Motivo |
| --- | --- | --- | --- |
| Ajuste de apartados a tareas | 3 | 2 | Dominios separados, pero falta puerta al resumen y herramientas de colección. |
| Responsabilidad de cada pantalla | 3 | 2 | Premios/Pool tienen tarea clara; cuenta/puntos/ayuda se solapan. |
| Jerarquía visual | 2 | 1 | Introducciones y banners desplazan datos/acciones, especialmente en móvil. |
| Agrupación | 2 | 2 | Buenas pestañas y bloques locales; navegación principal plana. |
| Carga cognitiva | 2 | 1 | Reglas y estados contradictorios exigen interpretación. |
| Descubribilidad | 2 | 1 | Resumen, ajustes y herramientas sin acceso contextual suficiente. |
| Consistencia | 1 | 1 | Idioma, identidad, monedas/periodos y estilos divergentes. |
| Accesibilidad observada | 1 | 1 | Campana/selectores sin nombre y cierre/foco móvil mejorables; revisión parcial. |

Resultado orientativo: **1,50/3**. La jerarquía actual requiere corrección antes
de dar por validado el rediseño UX; esto no cambia el estado de lanzamiento de
los demás puntos. La propuesta fija tareas, layout y aceptación sin vacíos de
arquitectura conocidos; su validación visual y con usuarios sigue pendiente.
Objetivo del candidato: al menos 2,5/3, sin ninguno de los tres primeros
criterios por debajo de 2. No se asigna una nota de éxito a una propuesta aún
sin implementar.

## Decisiones que se conservan

- Landing `/` independiente; Inicio/logo regresan a ella; `/dashboard` es el
  resumen de cuenta. Master, Créditos, Pool y cobros mantienen responsabilidades.
- Mismas rutas, componentes y reglas de copy en Stage/Main; los datos y contratos
  cambian por entorno. La UX de red muestra lo necesario para operar correctamente.
- Legacy se reutiliza en sus redes existentes; UKI/v2 tiene despliegues distintos.
  La convivencia se presenta dentro del producto común con origen explícito.
- Embajadores: confirmar con firma específica sin gas; nuevos usuarios sin enlace
  propio hasta confirmar; preventa conserva elegibilidad y relaciones cerradas.
- Paleta vigente lila `#e45cff`, fondo `#04030a`, oro `#f2c34b`; no introducir
  cian/teal como color de acción. El color semántico nunca sustituye una etiqueta.
- No se generan imágenes ni se implementa styling final en esta auditoría.
  Cualquier fase visual que use una imagen de referencia seguirá el plan de
  validación correspondiente; esta revisión no precisa generar una.
