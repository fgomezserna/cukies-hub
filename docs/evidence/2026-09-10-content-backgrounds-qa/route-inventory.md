# Inventario de fondos de contenido dentro de `AppLayout`

## Resumen (snapshot `56cd2e8`, diff compartido del implementador)

Se recorrieron las 40 `page.tsx` del dapp, los layouts raíz/segmentados y los componentes que actúan como raíz de página (shells de marketplace/legacy, dashboard, premios, Treasure Hunt, juegos, embajadores y `LaunchInfoPage`). En el árbol actual los wrappers internos ya usan `uki-theme` sin fondo; `uki-landing` queda en la landing pública `/` y el shell dedicado de Treasure Hunt ya usa `uki-theme`. Las dos ramas de `/indexer` también quedaron como `<div min-h-full>` sin `bg-background`. No quedan otras fuentes de fondo general en raíces de producto.

El shell de Treasure Hunt conserva `bg-[#09060f]` porque ocupa el viewport completo, sustituye la cabecera general y oculta el sidebar en el modo de juego movil y mantiene el iframe de juego; es una superficie de aplicación legítima. Los fondos de `Card`, `Panel`, hero/section acotados, diálogos/sheets, viewport de juego y overlays de bloqueo son locales y deben permanecer.

## Rutas y wrappers

| Ruta(s) | Wrapper/raíz observado | Origen del fondo | Ajuste sugerido | Certeza |
|---|---|---|---|---|
| `/` | `CukiesLanding` (`components/landing/sections.tsx:49-77`) | `.uki-landing` + `bg-[var(--uki-bg)]`, `uki-noise`, `uki-grid-bg`; landing pública | Preservar diseño y fondo; es la excepción pública | Alta |
| `/como-jugar` | `como-jugar/layout.tsx` → `AppLayout`; `LaunchInfoPage` `variant="workspace"` (`components/launch/info-page.tsx:56-70`) | Raíz actual `uki-theme`, sin bg; tarjetas/Panel internos | Mantener `uki-theme`; fondo lo pinta `AppLayout` | Alta |
| `/premios` | `premios/layout.tsx` → `AppLayout`; página `uki-theme` (`app/premios/page.tsx:10-12`) → `PremiosContent` | Raíz transparente/temática; hero y bloques acotados `bg-[#09060f]`, lilac/amber | Mantener superficies de `PremiosContent`; sin fondo raíz | Alta |
| `/vesting` y `/vesting-legacy` | `/vesting` bajo layout propio que renderiza AppLayout; legacy reexporta `app/vesting/page.tsx` (`(app)/vesting-legacy/page.tsx:1`) | Página `uki-theme` (`app/vesting/page.tsx:175-180`); paneles/metric tiles locales | Mantener paneles; sin bg raíz | Alta |
| `/wallet` | `wallet/page.tsx` | Redirección inmediata a `/dashboard` | Sin UI/fondo que ajustar | Alta |
| `/dashboard` | `(app)/layout.tsx` → `AppLayout`; `uki-theme` (`dashboard/page.tsx:13-22`) → `WalletDashboardWorkspace` | Sin fondo raíz; `DashboardOverviewPanel` tiene tarjetas/estados | Mantener superficies del panel | Alta |
| `/credits` | `uki-theme` (`credits/page.tsx:13-45`) → `CompetitionCreditPanel` | Sin fondo raíz; paneles/avisos locales | Mantener paneles | Alta |
| `/cukies` | `uki-theme` (`cukies/page.tsx:13-15`) → `MyCukiesPanel` | Sin fondo raíz; hero, tarjetas de Cukie y estados locales | Mantener superficies/gradientes de tarjetas | Alta |
| `/cukie-master` | `uki-theme` (`cukie-master/page.tsx:16-19`) → workspace + FAQ | Sin fondo raíz; hero/workspace y FAQ con superficies propias | Mantener hero/paneles | Alta |
| `/cukie-hodler` | `uki-theme` (`cukie-hodler/page.tsx:15-18`) + `CukiePool` | Sin fondo raíz; bloques/avisos/art cards locales | Mantener superficies locales | Alta |
| `/cukie-hodler/recuperar` | `uki-theme` (`.../recuperar/page.tsx:13-16`) + `NftVaultRecoveryPanel` | Sin fondo raíz; `<details>`/avisos/formulario con `bg-black/*` | Mantener panel de recuperación | Alta |
| `/games` | `uki-theme` (`games/page.tsx:41-57`) | Sin fondo raíz; hero destacado y cards de juegos con bg propio | Mantener hero/cards | Alta |
| `/games/hyppie-road` | Página → `GameLayout` | `GameLayout` limita `bg-card` al viewport/overlays; no wrapper general | Mantener viewport/controles | Alta |
| `/games/tower-builder` | Página → `GameLayout` | Igual que Hyppie Road; skeleton/gates son superficies de estado | Mantener | Alta |
| `/games/sybil-slayer` | `page.tsx` redirige al canonical Treasure Hunt | Sin render | Sin ajuste | Alta |
| `/games/treasure-hunt` | Nested layout → `TreasureHuntExperienceShell`; página devuelve `null` | Shell `section data-treasure-hunt-shell` `uki-theme bg-[#09060f]`, h-full/overflow-hidden (`components/games/treasure-hunt-experience-shell.tsx:152-255`) | Preservar `bg-[#09060f]` (superficie de juego); mantener `uki-theme`, no volver a `uki-landing` | Alta |
| `/games/treasure-hunt/rankings`, `/rules`, `/profile` | Mismo `TreasureHuntExperienceShell` + view raíz sin bg | Shell es dueño de superficie; vistas usan paneles/rows propios | Mantener vistas sin fondo general | Alta |
| `/games/treasure-hunt/competitions` | Redirige a `/games/treasure-hunt/rankings` | Sin render | Sin ajuste | Alta |
| `/marketplace` | `uki-theme` (`marketplace/page.tsx:18-20`) → Marketplace clients | Sin fondo raíz; header/filtros/listados con `bg-black/*`/cards | Mantener superficies de marketplace | Alta |
| `/marketplace/[tokenId]` | `uki-theme` (`marketplace/[tokenId]/page.tsx:315-317`) | Sin fondo raíz; ficha, imagen, timeline y metadata son paneles | Mantener paneles; no añadir bg al wrapper | Alta |
| `/marketplace/[tokenId]/loading`, `/not-found`, `/error` | Estados bajo mismo layout; raíces simples | Skeleton/error/not-found con `bg-white/*` o `bg-black/30` acotados | Mantener estados locales | Alta |
| `/bridge`, `/bridges/cukies` | Página → `BridgePageShell` (`components/legacy-marketplace/bridge-page-shell.tsx:13-16`) | Raíz sin bg; header/client/paneles `bg-black/30`, `bg-white/*` | Mantener superficies legacy | Alta |
| `/breeding`, `/breeding/breed`, `/active-breeds`, `/completed-breeds` | Páginas → `BreedingPageShell` (`.../breeding-page-shell.tsx:9-16`) | Raíz sin bg; header/client/paneles locales | Mantener | Alta |
| `/cukiepoints`, `/users/points` | Páginas → `CukiePointsPageShell` (`.../cukiepoints-page-shell.tsx:6-9`) | Raíz sin bg; tablas/avisos/paneles locales | Mantener | Alta |
| `/embajadores`, `/embajadores/[code]` | Página → `AmbassadorProgram` `uki-theme` (`components/ambassadors/ambassador-program.tsx:484-486`) | Sin fondo raíz; hero, métricas y alertas acotados | Mantener paneles | Alta |
| `/indexer` | `(app)/layout.tsx` → `AppLayout`; ramas actuales `<div min-h-full ...>` (`indexer/page.tsx:168-170`, `286-289`) | `bg-background`/`<main>` anidado eliminado en diff actual; cards y error panel son locales | No reintroducir `bg-background` ni `<main>` con canvas propio | Alta |
| `/leaderboard` | Raíz `div.relative flex` (`leaderboard/page.tsx:91-99`, `211-214`) | `Card` por defecto; `bg-background/80` solo overlay de bloqueo (`:191`) | Mantener Card y overlay | Alta |
| `/points` | Raíz `div.relative flex` (`points/page.tsx:414-418`) | Cards con gradientes; `bg-background/80` overlay de bloqueo (`:729`) | Mantener superficies/overlay | Alta |
| `/quests` | Raíz `div.relative flex` (`quests/page.tsx:1429-1434`) | Cards/accordions; `bg-background/80` overlays de bloqueo (`:1681`, `:1690`) | Mantener superficies/overlays | Alta |
| `/settings` | Raíz `div.max-w-4xl` (`settings/page.tsx:329-343`) | Cards, tabs e inputs con `bg-card`/gradientes; sin bg raíz | Mantener superficies | Alta |
| `/profile` | Raíz `div.max-w-4xl` (`profile/page.tsx:14-16`) | `TreasureHuntProfile` usa secciones propias; sin bg raíz | Mantener | Alta |
| `/profile/[username]` | Raíz `div.max-w-5xl` (`profile/[username]/page.tsx:156-169`) | Cards `bg-gradient-to-br from-card...`; sin bg raíz | Mantener tarjetas | Alta |

## Fuentes compartidas y residuos legítimos

- El dueño del fondo general del shell es `AppLayout`: contenedor `bg-[#0b0810]` y capas absolutas de gradiente/grid (`components/layout/app-layout.tsx:160-220`); los efectos ambientales se desactivan en marketplace/Treasure Hunt (`:224-250`). El `body` conserva `@apply bg-background` como fallback (`app/globals.css:128-140`), no como fondo de contenido.
- `globals.css:335-352` deja `uki-theme` con variables/tipografía/posición; solo `.uki-landing` conserva el gradiente general (`:354-359`). Esto permite wrappers internos temáticos sin pintar canvas adicional.
- `Panel`/`uki-panel-shell` + `uki-panel-core` (`components/landing/primitives.tsx:53-60`, `app/globals.css:809-824`) son superficies locales. `Card` aplica `bg-card` por diseño (`components/ui/card.tsx:14-22`).
- Sheets/dialogs y chat son superficies aisladas: `presale-purchase-panel.tsx:521` (`SheetContent`), `cukies/cukie-sale-dialog.tsx:1339` (`SheetContent uki-theme bg-[var(--uki-bg)]`) y `ui/GameChat.tsx:228` (`bg-card`). No deben eliminarse.
- Fondos de imágenes/gradientes dentro de hero/card (`PremiosContent`, `CukieMasterWorkspace`, `MyCukiesPanel`, `GamesPage`, marketplace) quedan acotados por bordes/radius/overflow; no son fondos generales.

## Cobertura y límites

Auditoría estática focalizada (sin editar repo ni mutar sistemas): rutas `app/` y componentes raíz relacionados, búsqueda de `uki-landing`, `uki-theme`, `bg-*`, `background`, `style` y wrappers de layout. El estado mostrado es el snapshot local con cambios concurrentes del implementador; los artefactos `.playwright-cli/`/`output/playwright/` no se evaluaron como código de producto. No se ejecutaron tests de producto por tratarse de inventario CSS.
