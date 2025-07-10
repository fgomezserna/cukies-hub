# Guía de Assets - Efectos Visuales

## Especificaciones Técnicas

### 🎆 Tipos de Efectos

#### Efectos de Partículas
- **`particles.png`** - Sprite sheet de partículas
  - Tamaño: 64x64px (8x8 partículas de 8x8px cada una)
  - Formato: PNG con transparencia
  - Colores: Variados (azul, naranja, amarillo, rojo)

#### Efectos de Explosión
- **`explosion.png`** - Sprite sheet de explosión
  - Tamaño: 256x64px (4 frames de 64x64px cada uno)
  - Formato: PNG con transparencia
  - Animación: 4 frames para animación de explosión

#### Efectos de Impacto
- **`impact.png`** - Efecto al impactar bloques
  - Tamaño: 32x32px
  - Formato: PNG con transparencia
  - Estilo: Estrella o rayos de impacto

### 🌟 Especificaciones de Animación

#### Explosión de Bloques
```
Frame 1: Inicio de explosión (pequeña)
Frame 2: Expansión media
Frame 3: Explosión completa
Frame 4: Desvanecimiento
```

#### Partículas Cayendo
```
Velocidad: 60-120 pixels/segundo
Rotación: 0-360 grados aleatorio
Fade out: 1-2 segundos
Gravedad: Aplicar física realista
```

## Uso en el Código

```typescript
// Cargar sprite sheets
this.load.spritesheet('explosion', '/assets/effects/explosion.png', {
  frameWidth: 64,
  frameHeight: 64
});

this.load.spritesheet('particles', '/assets/effects/particles.png', {
  frameWidth: 8,
  frameHeight: 8
});

// Crear animaciones
this.anims.create({
  key: 'explode',
  frames: this.anims.generateFrameNumbers('explosion', { start: 0, end: 3 }),
  frameRate: 10,
  repeat: 0
});
```

## Paleta de Colores para Efectos

```
Explosión: #FF6B35, #F7931E, #FFD23F
Partículas: #4A90E2, #F39C12, #E74C3C, #27AE60
Impacto: #FFFFFF, #FFD700
```

## Herramientas Recomendadas

- **Sprite Sheets**: TexturePacker, Aseprite
- **Efectos**: After Effects, Blender
- **Pixelart**: Aseprite, Piskel
- **Edición**: GIMP, Photoshop

## Checklist de Assets

- [ ] `particles.png` - Sprite sheet de partículas
- [ ] `explosion.png` - Sprite sheet de explosión
- [ ] `impact.png` - Efecto de impacto
- [ ] `smoke.png` - Efecto de humo (opcional)
- [ ] `sparkles.png` - Destellos (opcional)

## Consideraciones de Rendimiento

- **Tamaño máximo**: 256x256px por sprite sheet
- **Formato**: PNG con transparencia optimizada
- **Compresión**: Usar herramientas como TinyPNG
- **Frames**: Máximo 8 frames por animación
- **Reutilización**: Usar los mismos efectos para múltiples situaciones 