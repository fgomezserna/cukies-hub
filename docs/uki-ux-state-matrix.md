# Cukies Hub: matriz de estados UX

Fecha: 2026-09-08. **Especificación de aceptación; no certificación de que todos
los estados funcionen.** Sustituye la matriz del 30 de agosto, cuyas rutas y
mensajes de preventa ya no representan la navegación vigente.

Fuentes: [auditoría y arquitectura](uki-dapp-sitemap.md),
[reglas funcionales](uki-current-operating-rules.md) y
[seguimiento único](antes-del-15-seguimiento.md#5-dashboard-y-arquitectura-del-sitio).
Las prioridades y la evidencia LIVE están en la auditoría; aquí solo se define
cómo debe responder la interfaz. No se añaden reglas de economía ni pantallas.

## Estados comunes

| Estado | Información necesaria | Acción o salida | Evitar |
| --- | --- | --- | --- |
| Wallet desconectada | Qué permite consultar/conseguir al conectarla; lectura pública útil cuando exista. | Conectar wallet desde la tarea. | Cifras personales ficticias, exigir conectar para leer información pública. |
| Wallet conectada sin sesión firmada | Diferenciar conexión de acceso a datos privados. | Firmar sesión; conservar la navegación y el referido propuesto. | Confirmar patrocinador implícitamente o confundir esta firma con su confirmación específica. |
| Red incorrecta | Red conectada y red requerida para la acción concreta, incluida TRON/BSC legacy cuando corresponda. | Cambiar a la red requerida; lectura segura si está disponible. | Pedir conectar otra vez cuando ya está conectado, o tratar todos los contratos como la misma red. |
| Cargando | Geometría estable por módulo; todavía no hay resultado. | Esperar; refresco deshabilitado mientras corresponda. | Mostrar cero o «no tienes» antes de resolver la fuente. |
| Vacío confirmado | Alcance y periodo de la consulta; no hay datos/activos/operaciones en ese alcance. | Siguiente acción pertinente: jugar, explorar o gestionar recursos. | Equiparar vacío con error, o presentar un calendario personal sin asignación. |
| Parcial / origen no disponible | Qué se conoce, qué falta y qué acciones siguen siendo seguras. | Reintentar el módulo afectado; mantener acceso a los demás. | Totales parciales presentados como completos, cero de un origen desconocido o «Todo al día». |
| Datos anteriores / sincronizando | Última lectura verificada y efecto sobre la acción; indicar si puede consultarse una posición conocida. | Actualizar o consultar el estado existente. | Recomendar nuevos depósitos a partir de una falta de lectura; retirar acceso a recuperación segura sin motivo. |
| Error recuperable | Qué no se pudo completar, si hubo cambios y cómo continuar. | Reintentar conservando selección/filtros; ayuda cuando proceda. | Pantalla vacía, errores internos crudos o «vuelve más tarde» sin contexto. |
| Servicio pausado | Qué acción está desactivada y qué lectura/seguimiento sigue disponible. | Consultar operaciones previas, regresar a colección o actualizar disponibilidad. | Prometer fecha no aprobada, fingir un catálogo actualizado o un formulario operativo. |
| Revisión antes de firma | Activo/cantidad, red, moneda, fee/gas si aplica, destinatario y efecto sobre recursos/posición. | Una confirmación con propósito explícito. | Mezclar approve con operación final o usar la misma etiqueta para firma de sesión y transacción. |
| Firma rechazada | Operación cancelada por el usuario; estado real si existió una aprobación previa. | Volver a revisar, reintentar o salir. | Presentarlo como fallo del servicio o reiniciar silenciosamente una transacción. |
| Operación pendiente | Paso actual, referencia de transacción cuando exista y siguiente confirmación esperada. | Seguir estado; impedir duplicados. | Declarar completado por recibir un hash o por aceptar una solicitud. |
| Operación confirmada | Evidencia canónica del dominio; impacto y siguiente paso. | Volver a lista, ver posición, resultado o historial. | Confirmación optimista de compra/bridge/claim sin la evidencia requerida. |

Los componentes consumen estados de los dominios; no calculan balances,
elegibilidad, ranking o reparto en cliente. Las acciones mantienen idempotencia
y no muestran jobs, colecciones, endpoints o proofs crudos como instrucciones
de usuario. Los detalles técnicos útiles para soporte/explorador se separan.

## Casos específicos por recorrido

| Ruta / tarea | Escenarios que deben probarse | Resultado de UX requerido |
| --- | --- | --- |
| `/` · entrada pública | Torneo activo, edición cerrada, nuevo modo semanal; compra con monedas disponibles; lectura de estado fallida. | Hero, instrucciones, contador y CTA describen la misma fase. Compra y preventa terminada se distinguen. No se deduce ausencia de liquidez de un fallo de lectura. |
| `/dashboard` | Sin actividad, listo para jugar, retirada/cobro pendiente, fuente parcial, inventario/master/créditos con alcances diferentes. | Una siguiente acción respaldada por datos; fecha/periodo y avisos junto al módulo. Wallet derivada de la sesión; ningún query arbitrario expone datos privados. |
| `/cukie-master` | Vías UKI/Originales, vesting computable, requisito incompleto, validación, activo, gracia, retiro, datos sin reconciliar. | Distinguir requisito de saldo y cupos materializados. Mostrar qué falta o cuándo cambia el estado sin duplicar límites ni inducir un depósito innecesario. Efecto de retirar visible antes de firmar. |
| `/credits` | Saldo actual y futuro distintos, antes/después de corte, reparto guardado/cambiado, caducidad, error de historial o de configuración. | Disponible hoy, comprometido, aportado y próximo reparto separados. Cambios en múltiplos admitidos, cuándo se aplican y confirmación de guardado inequívocos. Historial no convierte entradas acumuladas en saldo disponible. |
| `/cukie-hodler` | Disponible en wallet, en custodia activándose, disponible para partidas, asignado, salida pedida, retirable, fuente incompleta. | Acción según estado y tiempo. Total en custodia no equivale a disponible para jugar. La indisponibilidad de inventario no afirma cero posiciones ni oculta recuperación de una posición conocida. |
| `/cukie-hodler/recuperar` | Depositado pero no visible, posición encontrada/no encontrada, red errónea, operación pendiente. | Explicar que es una posición existente. Si ya aparece en el pool, dirigir a su salida normal; conservar la recuperación directa validada. |
| `/cukies` | Wallet/Pool/Master, disponible/listado/bloqueado/bridge, datos parciales, imagen fallida. | Cada NFT tiene ficha y estado legible, más acción compatible. Origen/red visibles; fallback de imagen del producto. No presentar una fuente parcial como colección completa. |
| `/marketplace` y detalle | Ambos orígenes, filtros sin resultados, catálogo no disponible, listado cambiado, ownership/approval revocados, compra/publicación/cancelación pendientes. | Todos/Legacy/UKI con misma navegación; filtros de red/tipo/generación/habilidades/crías donde procedan. Precio con moneda; detalle y acción por contrato exacto. Regresar restaura filtros y posición. |
| `/bridge` | TRON → BSC, red/wallet destino, NFT no elegible, fee, servicio pausado, solicitud/confirmación/finalización y fallo recuperable. | Revisar origen/destino antes de aprobar; seguir ambas transacciones cuando existan. No anunciar finalizado al registrar la solicitud. No asumir reversa BSC → TRON como prioridad. |
| `/cukiepoints` | Saldo emitido, pendiente de staking, posiciones e historial por red; red no conectada, fuente fallida y acciones pausadas. | No sumar desconocido como cero ni mezclar saldo emitido con pendiente. No confundir con `/points` o créditos. Solo acciones soportadas por contrato; sin claim/conversión inventados. |
| `/breeding` y pestañas | Padres compatibles/no elegibles, coste/puntos, approve, inicio, cría activa, apertura/finalización, historial y corte de servicio. | Distinguir wallet, red, disponibilidad de fuente y falta de padres. URL refleja pestaña; conservar la familia y las operaciones ya iniciadas. Condiciones de corte siguen decisión de producto. |
| Treasure Hunt · entrada | Torneo de staking y modo semanal; saldo propio/pool, sin recursos, preparación, iframe bloqueado, reserva, finalización/abandono/error. | Nombre, coste, disponibilidad y botón coinciden entre portada/resumen/contenedor/juego. Nunca gastar recursos al navegar. Diferenciar reserva, consumo y liberación según resultado canónico. |
| Treasure Hunt · reglas/ranking | Semana actual, especiales cerrados, sin resultados, mi posición, histórico, créditos propios/pool. | Mismas reglas y cantidades en todas las ayudas; fecha y periodo claros. No confundir recompensa directa con clasificación. Las fechas de pruebas aceleradas salen del periodo real. |
| `/premios` | Sin premios, preparación, disponible, cobrado, caducado/revisión; claim pendiente/rechazado/fallido. | Importe cobrable y plazo primero. Preparado no es cobrable; embajadores se identifica como origen y conserva vínculo a su panel. Confirmar cobro con la evidencia canónica. |
| `/vesting` | Desconectado, sin asignación, bloqueado, liberación parcial, claim, contrato/lectura no disponible. | No aparentar calendario personal en un vacío; no presentar fallo como cero. Explicar disponible/próxima liberación y conservar datos de compra histórica. Ruta alternativa solo con diferencia/compatibilidad definida. |
| `/embajadores` y referido | Nuevo directo, con referido, confirmación pendiente, firma rechazada, ciclo, preventa sin sponsor, preventa con relación, confirmado. | Nuevos: firma específica sin gas antes de enlace propio. Navegar o firmar sesión no confirma. Preventa sin sponsor no puede añadirse uno; preservar enlaces elegibles. Mensaje específico de ciclo, sin confundirlo con relación ya fijada. |
| Cuenta / perfil / ajustes | Alias del ranking vs identificador público, nombre inmutable, foto ausente/errónea, validación, guardado y privacidad. | Explicar qué campo se publica y qué se puede cambiar. Avatar real o fallback local; guardar con feedback. No confundir wallet con identidad del ranking ni publicar datos privados. |
| Notificaciones | Sin actividad, nueva, leída, error y destino. | Contador real, sin mensaje fijo ni misión inventada. Nombre accesible. Abrir un elemento lleva a la operación/contenido que lo originó. |
| Puntos de cuenta, quests y juegos secundarios | Función publicada/no publicada, sin actividad, carga/error, XP y recompensas. | No prometer UKI ni misiones inexistentes. Idioma/identidad consistentes; mantener los sistemas de puntos diferenciados. Su presencia en código no obliga a añadirlos al menú. |
| `/indexer` · operación interna | Sin sesión, usuario sin permiso, autorizado, datos fallidos. | Sin datos privados para no autorizados y fuera del menú cliente. No se crea una ruta administrativa nueva para el rediseño. |

## Navegación, móvil y accesibilidad

- Mismos destinos y conceptos en escritorio/móvil y Stage/Main; cambios de red
  o contratos se explican cuando afecten a una decisión real.
- Menú activo en la ruta y sus hijas; logo/Inicio conservan `/`, Resumen usa
  `/dashboard`. Las herramientas de colección tienen entrada contextual.
- Drawer con nombre y cierre visible, foco contenido, Escape y retorno al
  activador al cancelar. Tras navegar, foco en el contenido nuevo de forma
  predecible. Comprobar historial del navegador y enlaces profundos.
- Objetivo táctil del proyecto: 44 × 44 px. Comprobar anchos 320, 391, 768 y
  1440 px, zoom y menú en altura reducida. Sin scroll horizontal global.
- Iconos y selectores tienen nombre accesible; errores y estados no dependen
  exclusivamente del color. Contraste y lector de pantalla se validan aparte.
- Un encabezado principal por pantalla operativa, dato decisivo y CTA antes de
  contenido secundario. Tablas pueden desplazarse dentro de su contenedor,
  manteniendo visibles sus etiquetas y unidades.

## Registro de validación

La auditoría del 8 de septiembre valida lecturas de 27 rutas, algunos estados
vacíos/degradados y el comportamiento parcial del menú. **No marca aprobadas
las filas transaccionales de esta matriz.** Para cada implementación registrar
ruta, escenario, fecha/SHA, viewport, datos de prueba y resultado en el
seguimiento existente; las pruebas de economía/contratos mantienen sus gates.
