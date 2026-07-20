# Sistema de Audio del Juego

Este directorio contiene todos los archivos de audio organizados por categorías.

## Estructura de Carpetas

### `/effects` - Efectos de Sonido del Juego
- `coin.mp3` - Sonido al recoger energía
- `power_up.mp3` - Sonido al recoger un mega node (ballena)
- `meow-4.mp3` - Sonido al recoger un purr (gato con inmunidad)
- `checkpoint_collect.mp3` - Sonido al recoger un checkpoint (legacy)
- `checkpoint.wav` - Sonido principal al recoger un checkpoint (nuevo)
- `life.mp3` - Sonido al recoger un corazón (nuevo)
- `life.wav` - Sonido alternativo de vida (legacy)
- `collision_damage.mp3` - Sonido al recibir daño por colisión
- `auch.mp3` - Sonido específico cuando el token recibe impacto de un enemigo
- `bug_collision.mp3` - Sonido cuando los enemigos chocan entre sí
- `voice_trump.mp3` - Voz de Trump cuando el hacker toca al token
- `level_up.mp3` - Sonido al subir de nivel

### `/ui` - Sonidos de Interfaz
- `button-click-01.mp3` - Sonido de clic en botones
- `game_start.mp3` - Sonido al iniciar el juego
- `pause.mp3` - Sonido al pausar
- `resume.mp3` - Sonido al reanudar

### `/voice` - Efectos de Voz
- `jeff_goit.mp3` - Voz/efecto cuando aparece Jeff Goit
- `whale_chad.mp3` - Voz/efecto cuando aparece Whale Chad

### `/effects` - Efectos Especiales de Voz
- `voice_trump.mp3` - Voz de Trump cuando el hacker roba monedas del jugador
- `life.mp3` - Sonido especial cuando el jugador recoge un corazón para ganar vida

### `/music` - Música de Fondo
- `HoliznaCC0 - Game BOI 4.mp3` - Música principal del juego (se alterna automáticamente)
- `HoliznaCC0 - Track 1.mp3` - Música alternativa del juego (se alterna automáticamente)
- `frenzy_mode.mp3` - Música para modo frenzy (loop)
- `game_over.wav` - Música de game over (se reproduce cuando el juego termina)

## Configuración de Audio

El sistema de audio está configurado en `/src/hooks/useAudio.ts` con:

- **Volúmenes por categoría**: Cada tipo de sonido tiene su propio nivel de volumen
- **Precarga automática**: Todos los sonidos se cargan al iniciar
- **Control de música**: Solo una música puede reproducirse a la vez
- **Alternancia automática**: Las dos canciones de fondo se alternan automáticamente
- **Volumen reducido**: Música configurada al 20% para no ser intrusiva
- **Gestión de errores**: Manejo graceful de archivos faltantes

## Formatos Recomendados

- **MP3**: Para compatibilidad máxima
- **Calidad**: 128-192 kbps para efectos, 256 kbps para música
- **Duración**: Efectos cortos (0.5-2s), música en loop

## Integración

Los sonidos se activan automáticamente en:
- ✅ Recolección de objetos
- ✅ Colisiones y daño
- ✅ Cambios de nivel
- ✅ Interacciones de UI
- ✅ Música de fondo continua (menú, juego, pausa)
- ✅ Música especial de game over
- ✅ Animaciones especiales (Jeff Goit, Whale Chad)

## Control de Música

- ✅ **Botón de música**: Permite activar/desactivar toda la música del juego
- ✅ **Estados visuales**: `music_on.png` cuando está activa, `music_off.png` cuando está desactivada
- ✅ **Persistencia**: El estado se mantiene durante toda la sesión de juego
- ✅ **Efectos de sonido**: Los efectos de sonido (coins, colisiones, etc.) no se ven afectados por este control

## Mecánica de Game Over

- ✅ **Transición musical**: Al llegar a game over, la música del juego se detiene automáticamente
- ✅ **Música especial**: Se reproduce `game_over.wav` exclusivamente durante el estado de game over
- ✅ **Reactivación**: Al hacer clic en RESET o PLAY desde game over, se detiene la música de game over y se reanuda la música normal del juego
- ✅ **Respeto al control**: Si la música está desactivada, no se reproduce ninguna música (ni de juego ni de game over) 