# UKI landing asset generation plan

Objetivo: sustituir los puntos donde la landing recicla imágenes o usa assets de baja resolución. No conectar estos assets al frontend hasta validación visual.

## 1. Hero full-bleed background

Estado actual: usa `dapp/public/brand/generated/uki-hero-stage-generated.png`, que funciona mejor ahora que el hero es full-bleed, pero no fue generado específicamente para encajar con consola a la derecha y copy a la izquierda.

Prompt propuesto:

```text
Use case: ads-marketing
Asset type: full-bleed website hero background, 16:9 wide, no text
Primary request: Create a premium cinematic Cukies World UKI presale hero background for a token sale landing page.
Scene/backdrop: dark teal fantasy vault chamber, glowing gold vault door, stacks of gold UKI coins, turquoise crystals, subtle sci-fi stone floor, atmospheric depth.
Subject: cute white axolotl-style Cukies mascot holding a large gold UKI coin, placed center-right with enough empty dark space on the left for a large headline and enough dark glass-safe space on the far right for a presale console overlay.
Composition: wide 21:9 crop, mascot around 58% horizontal, vault behind mascot, left 38% intentionally darker and readable, right 20% lower detail for UI overlay, foreground coins and crystals visible but not busy.
Style: polished 3D collectible character, high-end game launch key art, teal/cyan/gold palette, premium lighting, sharp but not noisy.
Avoid: text, logos, UI panels, watermarks, extra characters, oversaturated purple, cropped head or cropped UKI coin.
```

## 2. Timeline thumbnails

Estado actual: las tarjetas de timeline reutilizan un crop del hero; esto reduce fidelidad y hace que el bloque parezca placeholder.

Prompts propuestos, uno por tarjeta, todos en formato `4:3` horizontal:

```text
2021 Cukies NFTs: small cinematic thumbnail of early Cukies NFT collection launch, cute Cukies mascot tokens on a dark teal collector table, community spark, no text.
2022-2023 Ecosystem: small cinematic thumbnail of a Cukies marketplace and bridge concept, vault terminals, portals, teal/gold lighting, no text.
2024 Building: small cinematic thumbnail of game systems under construction, glowing game board pieces, code-like panels, teal/gold lighting, no text.
2026 UKI Launch: small cinematic thumbnail of gold UKI coin emerging from a vault with cyan light, no text.
Next Game Economy: small cinematic thumbnail of multiple Cukies game worlds connected by UKI routes, silhouettes of future games, no text.
```

## 3. Utility map background

Estado actual: reutiliza el hero como fondo. El bloque necesita un asset propio con más espacio central para el coin graph.

Prompt propuesto:

```text
Use case: stylized-concept
Asset type: wide background for token utility map, 16:9, no text
Primary request: Create a dark teal Cukies ecosystem map background with subtle vault architecture, soft cyan nodes, faint orbital paths and gold highlights.
Composition: empty central region for a large UKI coin overlay, six faint node zones around it, strong readability for UI labels, no characters in foreground.
Avoid: text, UI labels, large mascot faces, busy details, logos, watermarks.
```

## 4. Future game thumbnails

Estado actual: algunas tarjetas usan portadas antiguas con estilos y crops heterogéneos.

Prompt propuesto:

```text
Use case: stylized-concept
Asset type: four cohesive 16:9 mini game thumbnails
Primary request: Generate four Cukies World future-game teaser thumbnails in one consistent art direction: runner/action, board strategy, sports arcade, mystery future game.
Style: colorful but premium 3D game key art, cute Cukies mascots, dark teal/gold UI-friendly contrast.
Avoid: readable text inside images, logos, watermarks, violent weapons, low-resolution mobile-game clutter.
```

## 5. Treasure Hunt scene high-res

Estado actual: la landing vuelve a usar `dapp/public/brand/generated/uki-treasure-hunt-scene.png` para mantener fidelidad con la referencia aprobada, pero el archivo es de baja resolución (`347x181`). Antes de producción conviene regenerarlo con la misma composición y tono.

Prompt propuesto:

```text
Use case: game-key-art
Asset type: wide Treasure Hunt feature image, 16:9, no text
Primary request: Recreate a premium cinematic Treasure Hunt scene for Cukies World, matching the approved UKI landing reference.
Scene/backdrop: lush ancient jungle temple, teal shadows, warm gold treasure chest, small crystals and coins, soft atmospheric depth.
Subject: cute white axolotl-style Cukies explorer mascot on the left third, small friendly creature near the treasure chest, adventure gear but non-violent.
Composition: wide crop, mascot left, open treasure chest center-right, temple stairs in the background, enough dark edges for UI framing.
Style: polished game key art, consistent with the dark teal/gold UKI presale landing, more cinematic than cartoon mobile-board-game art.
Avoid: text, UI, logos, watermarks, bright purple sky, hex board tiles, cropped mascot face, extra main characters.
```

## 6. Final CTA crop

Estado actual: válido, pero si se regenera el hero conviene crear una imagen hermana para cierre de página.

Prompt propuesto:

```text
Use case: ads-marketing
Asset type: final CTA panel image, 16:9, no text
Primary request: Cukies mascot beside a glowing treasure chest of UKI coins and cyan crystals, dark vault background, warm gold highlights, premium game launch look.
Composition: mascot on right third, clean dark left third for CTA copy overlay if needed.
Avoid: text, logos, watermark, extra mascots.
```
