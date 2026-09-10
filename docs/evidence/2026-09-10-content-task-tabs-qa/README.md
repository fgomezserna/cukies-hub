# Organización del contenido por tareas

Solicitud del 10 de septiembre de 2026: agrupar tareas que estaban apiladas,
con Premios como ejemplo. Modo REDESIGN → VALIDATE, base `staging@19df664`.
El seguimiento de publicación pertenece a la fila 5 de
[`antes-del-15-seguimiento.md`](../../antes-del-15-seguimiento.md).

## Mapa y decisión

| Pantalla | Información común | Agrupación |
|---|---|---|
| Premios | Saldo compacto, actualización y resultado de cobro | Por cobrar / Historial. Ayuda plegable. |
| Créditos | Saldo confirmado, próximo corte, avisos y cambios sin guardar | Reparto / Historial. El borrador se conserva al alternar. |
| Pool de Cukies | Posición y estado de operaciones | En el pool / Aportar Cukies. Gestión de depósitos primero. |
| Cukie Master | Resumen de ambas vías | Gestionar UKI / Gestionar Cukies. Selector existente compactado; cada herramienta se monta al visitarla y se conserva después. |
| Marketplace | Cabecera y acceso a la colección | Comprar / Mis anuncios. Conserva filtros y borradores. |
| Bridge | Estado y resultado de operación | Preparar / Seguimiento. Se conserva el destino introducido. |
| Embajadores | Confirmación de invitación, métricas y feedback | Mi programa / Invitados / Comisiones. Reglas plegables. |
| Cukie Points | Saldos y filtros de actividad | Emitidos/quemados bajo «Datos globales». |
| Vesting | Calendario y cobro juntos | Explicación bajo «Cómo funciona tu vesting». |

No se añade otro nivel de pestañas a las rutas que ya separan tareas: Crías,
Treasure Hunt, Ajustes, Quests y Leaderboard. Los filtros de colección y actividad
siguen filtrando datos, no sustituyen la navegación. Aprobar/publicar,
calendario/cobrar y confirmar embajador conservan sus secuencias.
El [inventario anterior de 40 rutas](../2026-09-10-content-backgrounds-qa/route-inventory.md)
sirve de mapa de superficies; este lote modifica las nueve de la tabla.

## Diagnóstico observado

Lectura DOM de Stage con sesión conectada, viewport 1792 × 1017, web `ea62f948`:

| Pantalla | Bloque enterrado | Posición vertical | Altura del contenido |
|---|---|---:|---:|
| Premios | Historial | 1241 px | 1587 px |
| Créditos | Historial | 1425 px | 3876 px |
| Pool | Cukies depositados | 1879 px | 2486 px |

Estas cifras describen aquella sesión y sus datos. No son una medición general
de usabilidad ni un resultado de conversión. Véase [baseline DOM](before-live.json).

## Aceptación y evidencia local

- Una vista operativa visible por grupo; métricas y feedback compartidos fuera
  de las pestañas. Confirmar una invitación no queda oculto en ellas.
- Tabs Radix: nombres accesibles, estado seleccionado, relación con su panel,
  navegación por teclado y objetivos de al menos 44 px.
- Conservación de borradores, selección y operaciones al alternar. Se retiene
  el filtro de embajadores en Premios y los hashes anteriores.
- Back/Forward, vuelta a una URL sin hash y prioridad del hash UKI sobre un
  `tokenId` residual. Las lecturas periódicas no fuerzan saltos de scroll.
- Sin nuevo fondo general del contenido. Permanecen las superficies de tarjetas
  y formularios; no se cambian sidebar, identidad visual o contratos.

Las pruebas de navegador usan componentes reales con adaptadores locales de
wallet/RPC/API y datos sintéticos; las firmas están desactivadas. No certifican
saldos, compras, cobros ni retiradas reales. Marketplace prueba su contenedor
real con hijos sintéticos; el catálogo completo se contrasta tras publicar.

- [Premios](browser-checks.json): 1440, 390 y 320 px, sin overflow, pestañas
  visibles en el primer viewport del escenario vacío, teclado, categorías,
  enlaces históricos y Back/Forward.
- [Créditos y Pool](resources-browser-checks.json): seis combinaciones de ruta
  y ancho; borrador conservado, lista activa única, teclado, hashes y token ID.
- [Otras cinco superficies](secondary-browser-checks.json): quince
  combinaciones de ruta y ancho, selección de pestañas y disclosures; objetivos
  táctiles y ausencia de overflow. Master se cubre mediante pruebas funcionales
  y la comprobación de la ruta publicada, no con estos fixtures responsive.

Comparación local de Premios con los mismos datos sintéticos:
[antes](premios-before-desktop.png), [después escritorio](premios-after-1440.png),
[390 px](premios-after-390.png) y [320 px](premios-after-320.png).
Otras capturas: [Créditos](credits-after-390.png), [Pool](pool-after-390.png),
[Bridge](bridge-after-390.png) y [Vesting](vesting-after-390.png) y [Embajadores](ambassadors-after-390.png).

## Validación de código

[Resultados y huellas de los archivos](verification.json): 261 suites / 2.149
pruebas PASS, lint, tipos y build. Tras compactar las métricas y plegar las
reglas de Embajadores se repitieron sus 33 pruebas, lint, tipos y build: PASS.

## Revisión heurística

Escala 0–3; juicio de diseño sobre este alcance, no ensayo con usuarios.

| Criterio | Peso | Nota | Evidencia |
|---|---:|---:|---|
| Ajuste a la tarea | 3 | 3 | Cobro/historial y depósito/aportación tienen entradas directas. |
| Responsabilidad única | 3 | 3 | Una tarea por vista; confirmar y firmar siguen siendo secuencias. |
| Jerarquía | 2 | 3 | Resumen común compacto y acción antes del historial secundario. |
| Agrupación | 2 | 3 | Siete grupos de tabs y ayuda/datos secundarios plegables. |
| Carga cognitiva | 2 | 2 | Menos contenido simultáneo; algunos resúmenes siguen siendo extensos en móvil. |
| Descubribilidad | 2 | 2 | Etiquetas y chevrons visibles; no se ha realizado test con usuarios. |
| Consistencia | 1 | 3 | Primitiva Radix, misma paleta y altura táctil. |
| Accesibilidad | 1 | 3 | Foco, teclado, panel único y ancho comprobados en navegador. |

Resultado ponderado: 44/16 = **2,75/3**. Sin criterio crítico ≤1.
La verificación de publicación se registra por separado con SHA y CI; esta
evaluación no cierra incidencias de contratos, datos o migración legacy.
