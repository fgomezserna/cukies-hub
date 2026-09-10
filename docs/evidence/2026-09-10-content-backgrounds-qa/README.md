# Fondos de contenido: revisión visual

La superficie general pertenece a AppLayout. Las raíces internas conservan tema, tipografía y contraste sin pintar el fondo de la landing sobre el layout. Las cards, paneles, sheets y superficies de juego mantienen sus fondos acotados.

- Inventario estático de las 40 páginas y sus componentes raíz: [cobertura por ruta](route-inventory.md).
- CSS del build real comprobado en 14 secciones y la landing a 1440, 390 y 320 px: 45 observaciones sin desbordamiento, sin `.uki-landing` dentro del layout, un único main y raíces transparentes. La landing mantiene sus degradados y no tiene app shell.
- Gates: 261 suites / 2.132 tests, lint, typecheck y build PASS. Se adaptaron tres aserciones sobre la clase anterior; no cambia comportamiento de negocio.
- [Resultados estructurados](browser-checks.json). El navegador local usa configuración pública, sin sesión firmada ni Mongo. La ficha dinámica y el visor privado se cubren por inspección de código; el postdeploy verifica la presentación servida. No se firmaron operaciones.

Créditos antes, servido en staging (`85f9b586`):

![Créditos antes](credits-before-desktop.png)

Créditos después, candidato local:

![Créditos después](credits-after-1440.png)

Pool a 390 px y Marketplace a 320 px:

![Pool móvil](cukie-hodler-after-390.png)

![Marketplace móvil](marketplace-after-320.png)
