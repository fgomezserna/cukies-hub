# Guía de Assets - Sonidos

## Especificaciones Técnicas

### 🎵 Formato de Audio
- **Formato principal**: MP3 (compatible universalmente)
- **Formato alternativo**: OGG (código abierto)
- **Calidad**: 128kbps - 192kbps
- **Sampling rate**: 44.1kHz

### 🔊 Tipos de Sonidos

#### Efectos de Juego
- **`block-place.mp3`** - Sonido al colocar un bloque exitosamente
  - Duración: 0.2-0.5 segundos
  - Estilo: "Pop" satisfactorio, tono medio-alto
  
- **`block-fall.mp3`** - Sonido cuando las partes del bloque caen
  - Duración: 0.5-1 segundo
  - Estilo: Sonido de caída, tono descendente

- **`game-over.mp3`** - Sonido de fin de juego
  - Duración: 1-2 segundos
  - Estilo: Tono descendente, melancólico

#### Efectos de UI
- **`button-click.mp3`** - Sonido al hacer clic en botones
  - Duración: 0.1-0.2 segundos
  - Estilo: "Click" suave y claro

#### Música de Fondo (Opcional)
- **`background-music.mp3`** - Música de fondo del juego
  - Duración: 2-3 minutos (loop)
  - Estilo: Ambient, no intrusiva
  - Volumen: Bajo, para no interferir con efectos

## Niveles de Volumen

```
Efectos de juego: 70-80%
Efectos de UI: 60-70%
Música de fondo: 30-40%
```

## Herramientas Recomendadas

- **Creación**: Audacity (gratuito), FL Studio, Logic Pro
- **Edición**: Audacity, Adobe Audition
- **Efectos**: Freesound.org, Zapsplat

## Checklist de Assets

- [ ] `block-place.mp3` - Colocar bloque
- [ ] `block-fall.mp3` - Bloque cayendo
- [ ] `game-over.mp3` - Fin de juego
- [ ] `button-click.mp3` - Click de botón
- [ ] `background-music.mp3` - Música de fondo (opcional)

## Consideraciones

- **Accesibilidad**: Incluir opción para desactivar sonidos
- **Rendimiento**: Archivos pequeños (< 100KB por efecto)
- **Compatibilidad**: Probar en diferentes navegadores
- **Licencias**: Usar sonidos libres de derechos 