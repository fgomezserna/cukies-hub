# Guía de Integración de Assets

## Cómo Integrar los Assets en el Código

### 1. Importar la Configuración

```typescript
// En game-container.tsx
import { ASSETS_CONFIG, SPRITE_CONFIG, SOUND_CONFIG } from '../lib/assets-config';
```

### 2. Actualizar el Método `preload()`

```typescript
// ANTES (usando CDN)
preload() {
  this.load.image('block', 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/141552/block_1.png');
}

// DESPUÉS (usando assets locales)
preload() {
  // Cargar imágenes
  this.load.image('block', ASSETS_CONFIG.images.block);
  this.load.image('background', ASSETS_CONFIG.images.background);
  
  // Cargar sonidos
  this.load.audio('blockPlace', ASSETS_CONFIG.sounds.blockPlace);
  this.load.audio('blockFall', ASSETS_CONFIG.sounds.blockFall);
  this.load.audio('gameOver', ASSETS_CONFIG.sounds.gameOver);
  
  // Cargar efectos (sprite sheets)
  this.load.spritesheet('explosion', ASSETS_CONFIG.effects.explosion, {
    frameWidth: SPRITE_CONFIG.explosion.frameWidth,
    frameHeight: SPRITE_CONFIG.explosion.frameHeight
  });
  
  this.load.spritesheet('particles', ASSETS_CONFIG.effects.particles, {
    frameWidth: SPRITE_CONFIG.particles.frameWidth,
    frameHeight: SPRITE_CONFIG.particles.frameHeight
  });
}
```

### 3. Configurar Sonidos en `create()`

```typescript
create() {
  // ... código existente ...
  
  // Configurar sonidos
  this.sounds = {
    blockPlace: this.sound.add('blockPlace', { volume: SOUND_CONFIG.volumes.effects }),
    blockFall: this.sound.add('blockFall', { volume: SOUND_CONFIG.volumes.effects }),
    gameOver: this.sound.add('gameOver', { volume: SOUND_CONFIG.volumes.effects })
  };
  
  // Configurar animaciones
  this.anims.create({
    key: 'explode',
    frames: this.anims.generateFrameNumbers('explosion', { 
      start: 0, 
      end: SPRITE_CONFIG.explosion.frames - 1 
    }),
    frameRate: 10,
    repeat: 0
  });
}
```

### 4. Usar Sonidos en el Juego

```typescript
// En el método placeBlock()
placeBlock() {
  if (!this.topBlock || this.isBlockFalling) return;
  
  // Reproducir sonido al colocar bloque
  this.sounds.blockPlace.play();
  
  // ... resto del código ...
}

// En el método gameOver()
gameOver() {
  this.gameState = 'gameOver';
  
  // Reproducir sonido de game over
  this.sounds.gameOver.play();
  
  // ... resto del código ...
}
```

### 5. Agregar Efectos Visuales

```typescript
// En createFallingPieces()
createFallingPieces(block, supportedLeft, supportedRight) {
  // ... código existente ...
  
  // Agregar efecto de explosión
  const explosion = this.add.sprite(block.x, block.y, 'explosion');
  explosion.play('explode');
  
  // Destruir el efecto después de la animación
  explosion.on('animationcomplete', () => {
    explosion.destroy();
  });
  
  // ... resto del código ...
}
```

### 6. Agregar Fondo del Juego

```typescript
create() {
  // Agregar fondo antes de otros elementos
  this.add.image(0, 0, 'background').setOrigin(0, 0);
  
  // ... resto del código ...
}
```

## Checklist de Integración

- [ ] Importar `ASSETS_CONFIG` en `game-container.tsx`
- [ ] Actualizar método `preload()` para usar assets locales
- [ ] Configurar sonidos en método `create()`
- [ ] Agregar efectos visuales en los métodos apropiados
- [ ] Agregar fondo del juego
- [ ] Probar que todos los assets se cargan correctamente
- [ ] Verificar volúmenes de sonido
- [ ] Optimizar rendimiento si es necesario

## Notas Importantes

1. **Fallbacks**: Considera agregar fallbacks para assets que no se carguen
2. **Carga Asíncrona**: Los assets se cargan de forma asíncrona
3. **Optimización**: Usa sprite sheets para múltiples imágenes pequeñas
4. **Caché**: Los navegadores cachearán los assets locales automáticamente 