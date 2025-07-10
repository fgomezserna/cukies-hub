# Assets para Tower Builder

Esta carpeta contiene todos los assets visuales y de audio para el juego Tower Builder.

## Estructura de Carpetas

### 📁 images/
Contiene todas las imágenes del juego:
- `block.png` - Imagen principal del bloque ✅ **COMPLETADO**
- `base-tower.png` - Base de la torre ✅ **COMPLETADO**
- `background.png` - Fondo del juego
- `ui/` - Elementos de interfaz de usuario
  - `button.png` - Botones del juego
  - `score-bg.png` - Fondo para el marcador

### 📁 sounds/
Contiene todos los sonidos del juego:
- `block-place.mp3` - Sonido al colocar un bloque
- `block-fall.mp3` - Sonido cuando un bloque cae
- `game-over.mp3` - Sonido de fin de juego
- `background-music.mp3` - Música de fondo (opcional)

### 📁 effects/
Contiene efectos visuales:
- `explosion.png` - Efectos de explosión
- `particles.png` - Partículas para efectos

## Uso en el Código

Para usar estos assets en el juego, actualiza las rutas en `game-container.tsx`:

```typescript
// ✅ YA IMPLEMENTADO - En lugar de usar CDN
this.load.image('block', 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/141552/block_1.png');

// ✅ YA IMPLEMENTADO - Usa assets locales
this.load.image('block', ASSETS_CONFIG.images.block);
this.load.image('baseTower', ASSETS_CONFIG.images.baseTower);
this.load.audio('blockPlace', '/assets/sounds/block-place.mp3');
```

## Recomendaciones de Formatos

### Imágenes
- **PNG**: Para elementos con transparencia (bloques, UI)
- **JPG**: Para fondos sin transparencia
- **SVG**: Para iconos simples

### Audio
- **MP3**: Formato universal compatible
- **OGG**: Alternativa de código abierto (opcional)

## Notas de Diseño

- Los bloques deben tener un tamaño base de **100x40px** 
- Usar colores que contrasten bien con el fondo
- Mantener un estilo visual consistente
- Considerar efectos de sombra para dar profundidad 