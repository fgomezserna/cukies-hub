// Configuración centralizada de assets para Tower Builder
export const ASSETS_CONFIG = {
  images: {
    // Elementos del juego
    block: '/assets/images/block.png',        // Mostrado como 300x60px
    block1: '/assets/images/block-1.png',     // Variante 1
    block2: '/assets/images/block-2.png',     // Variante 2
    baseTower: '/assets/images/base-tower.png', // Mostrado como 300x70px
    background: '/assets/images/sky-tower.png',
    skySpace: '/assets/images/sky-space.png',  // Background para score 25+
    skyStars: '/assets/images/sky-stars.png',  // Background para score 35+
    cloudsPanner: '/assets/images/clouds-background.png',
    cityBack: '/assets/images/city-back.png',   // Edificios del fondo
    airplane: '/assets/images/airplane.png',    // Avión para altitudes
    rocket: '/assets/images/rocket.png',        // Cohete para score 30+
    
    // Elementos de UI
    ui: {
      button: '/assets/images/ui/button.png',
      scoreBg: '/assets/images/ui/score-bg.png',
    }
  },

  fonts: {
    // Fuentes del juego
    pixellari: '/assets/ui/fonts/Pixellari.ttf',
  },
  
  sounds: {
    // Efectos de juego
    blockPlace: '/assets/sounds/block-place.mp3',
    blockFall: '/assets/sounds/block-fall.mp3',
    gameOver: '/assets/sounds/game-over.mp3',
    
    // Efectos de UI
    buttonClick: '/assets/sounds/button-click.mp3',
    
    // Música de fondo (opcional)
    backgroundMusic: '/assets/sounds/background-music.mp3',
  },
  
  effects: {
    // Efectos visuales
    particles: '/assets/effects/particles.png',
    explosion: '/assets/effects/explosion.png',
    impact: '/assets/effects/impact.png',
  }
};

// Configuración de sprite sheets
export const SPRITE_CONFIG = {
  explosion: {
    frameWidth: 64,
    frameHeight: 64,
    frames: 4
  },
  
  particles: {
    frameWidth: 8,
    frameHeight: 8,
    frames: 64 // 8x8 grid
  }
};

// Configuración de sonidos
export const SOUND_CONFIG = {
  defaultVolume: 0.7,
  volumes: {
    effects: 0.8,
    ui: 0.6,
    music: 0.3
  }
}; 