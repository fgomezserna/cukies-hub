import type { RuneType } from '@/types/game';

// Game Timing
export const GAME_DURATION_SECONDS = 30; // Duración inicial: 30 segundos (el jugador debe extenderla con checkpoints)
export const DIFFICULTY_INCREASE_INTERVAL_SECONDS = 30; // Cambio de nivel cada 30 segundos (4 niveles en total)
export const MAX_LEVEL_WITH_TOTEM = 4;
export const MAX_LEVEL = 5;

export const FPS = 60;
export const FRAME_TIME_MS = 1000 / FPS;
export const MEGA_NODE_BOOST_DURATION_MS = 7000; // 7 seconds - aumentado de 5 a 7 segundos para coincidir con purr
export const PURR_IMMUNITY_DURATION_MS = 7000; // 7 seconds - aumentado de 5 a 7 segundos
export const RAY_WARNING_DURATION_MS = 3000; // Tiempo que dura la luz de aviso antes de que aparezca el rayo
export const RAY_STAGE_INTERVAL_MS = 5000; // Tiempo entre la activación de cada rayo consecutivo dentro del ciclo
export const RAY_CYCLE_COOLDOWN_MS = 60000; // Tiempo de espera entre ciclos completos de rayos
export const RAY_THICKNESS = 60; // Grosor del rayo en píxeles para cubrir un borde completo

// Red Zone Properties
export const RED_ZONE_WARNING_DURATION_MS = 3000; // Tiempo de aviso parpadeando
export const RED_ZONE_ACTIVE_DURATION_MIN_MS = 5000; // Duración mínima activa
export const RED_ZONE_ACTIVE_DURATION_MAX_MS = 10000; // Duración máxima activa
export const RED_ZONE_SPAWN_INTERVAL_MIN_MS = 7000; // Tiempo mínimo entre spawns
export const RED_ZONE_SPAWN_INTERVAL_MAX_MS = 14000; // Tiempo máximo entre spawns
export const RED_ZONE_MAX_COUNT = 3; // Máximo de zonas simultáneas
export const RED_ZONE_MIN_WIDTH_RATIO = 0.18; // Cobertura mínima del ancho del canvas
export const RED_ZONE_MAX_WIDTH_RATIO = 0.32; // Cobertura máxima del ancho del canvas
export const RED_ZONE_MIN_HEIGHT_RATIO = 0.18; // Cobertura mínima del alto del canvas
export const RED_ZONE_MAX_HEIGHT_RATIO = 0.32; // Cobertura máxima del alto del canvas

// Token Properties
export const TOKEN_RADIUS = 24; // 48x48px - Mantener este como base
export const TOKEN_BASE_SPEED = 5;
export const TOKEN_BOOST_MULTIPLIER = 1.8;
export const TOKEN_COLOR = 'hsl(180 100% 50%)'; // Electric Blue

// Obstacle Properties
export const OBSTACLE_BASE_RADIUS = 24; // Base estándar
export const FEE_RADIUS = 26; // Reducido de 36 a 26 para ser similar al token
export const FEE_COLOR = 'hsl(0 100% 60%)'; // Neon Red
export const FEE_SPEED = 1.5; // Reducido de 2.5 a 1.5 para hacer el juego más jugable
export const BUG_RADIUS = 34; // Reducido de 50 a 34 para mejor homogeneidad
export const BUG_COLOR = 'hsl(60 100% 60%)'; // Neon Yellow
export const BUG_ANGULAR_VELOCITY = 0.05; // Radians per frame
export const HACKER_RADIUS = 30; // Reducido de 40 a 30 para mejor homogeneidad
export const HACKER_COLOR = 'hsl(270 100% 70%)'; // Neon Purple
export const HACKER_BASE_SPEED = 2.5; // Reducido de 4 a 2.5 para hacer el juego más jugable
export const HACKER_ACCELERATION = 0.015; // Aumentado de 0.01 a 0.015 para mejor persecución de coins

// Márgenes de seguridad para evitar que bugs bloqueen los extremos
export const SAFE_MARGIN = 60; // Margen de 60px desde los bordes para posicionamiento de bugs
export const BUG_SAFE_ZONE = BUG_RADIUS + SAFE_MARGIN; // Zona segura total para bugs (94px desde bordes)

// Obstacle Spawning
export const INITIAL_OBSTACLE_COUNT = 4; // 2 bugs + 2 fees en nivel 1
export const OBSTACLE_SPAWN_RATE_INCREASE = 3; // Aumentado de 2 a 3 para escalar más rápido
export const MAX_OBSTACLES = 20; // Límite máximo de obstáculos permitidos

// Collectible Properties
export const ENERGY_POINT_RADIUS = 22; // Mantener
export const ENERGY_POINT_COLOR = 'hsl(120 100% 60%)'; // Neon Green
export const ENERGY_POINT_VALUE = 1;
export const MEGA_NODE_RADIUS = 32; // Reducido de 44 a 32 para mejor homogeneidad
export const MEGA_NODE_COLOR = 'hsl(210, 100%, 60%)'; // Cambiado de amarillo a azul para coincidir con el sprite (ballena)
export const MEGA_NODE_VALUE = 0; // Cambiado a 0, solo proporciona boost sin puntos
export const PURR_RADIUS = 30; // Tamaño similar al mega node
export const PURR_COLOR = 'hsl(300, 100%, 70%)'; // Color púrpura para diferenciarlo
export const PURR_VALUE = 0; // Solo proporciona inmunidad, sin puntos
export const VAUL_RADIUS = 35; // Tamaño ligeramente mayor por ser un cofre especial
export const VAUL_COLOR = 'hsl(45, 100%, 60%)'; // Color dorado para el cofre
export const VAUL_VALUE = 0; // Solo proporciona efectos especiales, sin puntos directos
export const VAUL_ACTIVATION_TIME_MS = 3000; // 3 segundos para llenar la barra completamente
export const VAUL_PROGRESS_RATE = 1.0; // Correcto: 1.0 para 3 segundos exactos

// Efectos aleatorios del Vault (se elige uno al activarse)
export const VAUL_EFFECT_TYPES = ['multiplier', 'double_collectibles', 'energy_to_uki', 'eliminate_enemies'] as const;
// Efecto 1: Multiplicador aleatorio
export const VAUL_MULTIPLIER_MIN = 2;
export const VAUL_MULTIPLIER_MAX = 5;
export const VAUL_MULTIPLIER_DURATION_MIN_MS = 5000; // 5 segundos
export const VAUL_MULTIPLIER_DURATION_MAX_MS = 10000; // 10 segundos
// Efecto 2: Doble de collectibles
export const VAUL_DOUBLE_ENERGY_COUNT = 20; // 20 energy en vez de 10
export const VAUL_DOUBLE_UKI_COUNT = 6; // 6 uki en vez de 3
export const VAUL_DOUBLE_DURATION_MIN_MS = 10000; // 10 segundos
export const VAUL_DOUBLE_DURATION_MAX_MS = 30000; // 30 segundos
// Efecto 3: Energy a Uki
export const VAUL_ENERGY_TO_UKI_DURATION_MS = 30000; // 30 segundos
// Efecto 4: Eliminar enemigos
export const VAUL_ELIMINATE_ENEMIES_MIN = 1;
export const VAUL_ELIMINATE_ENEMIES_MAX = 3;

// Mantener compatibilidad con código antiguo (deprecated)
export const VAUL_MULTIPLIER = 5; // Multiplicador de score x5
export const VAUL_DURATION_MS = 7000; // 7 segundos de duración del multiplicador

// Uki Properties
export const UKI_RADIUS = 25; // Tamaño similar a energy
export const UKI_COLOR = 'hsl(200, 100%, 60%)'; // Color azul para diferenciarlo
export const UKI_VALUE = 5; // 5 puntos cuando lo recoge el token

// Treasure (Tesoro) Properties
export const TREASURE_RADIUS = 26;
export const TREASURE_COLOR = 'hsl(35, 100%, 55%)';
export const TREASURE_LIFETIME_MS = 7000; // 7s visibles
export const TREASURE_BLINK_WARNING_MS = 3000; // Parpadeo últimos 3s
export const TREASURE_FIRST_APPEAR_MIN_S = 0; // desde inicio
export const TREASURE_FIRST_APPEAR_MAX_S = 60; // dentro de primeros 60s
export const TREASURE_NEXT_BLOCK_MIN_S = 45; // entre 45 y 60s después de terminar bloque
export const TREASURE_NEXT_BLOCK_MAX_S = 60;
// Puntuación por bloque (3 tesoros). El primer bloque: 5,5,15 = 25.
export const TREASURE_BLOCK_BASE_POINTS: [number, number, number] = [5, 5, 15];
export const TREASURE_BLOCK_INCREMENT = 25; // incremento por bloque completado

// Collectible Spawning - Sistema de timing independiente
export const INITIAL_ENERGY_POINTS = 10; // Siempre 10 energy iniciales
export const MEGA_NODE_SPAWN_CHANCE = 0.0005; // Reducido de 0.002 a 0.0005 (4 veces menos frecuente)
export const PURR_SPAWN_CHANCE = 0.0003; // Reducido de 0.0015 a 0.0003 (5 veces menos frecuente)
export const VAUL_SPAWN_CHANCE = 0.0002; // Reducido de 0.001 a 0.0002 (5 veces menos frecuente)
export const MAX_ENERGY_POINTS = 10; // Siempre mantener exactamente 10 energy en pantalla
export const MAX_UKI_POINTS = 3; // Siempre mantener exactamente 3 uki en pantalla

// Nuevo sistema de timing independiente
export const MEGA_NODE_SPAWN_INTERVAL_MIN_MS = 30000; // 30s mínimo
export const MEGA_NODE_SPAWN_INTERVAL_MAX_MS = 45000; // 45s máximo
export const HEART_SPAWN_INTERVAL_MIN_MS = 30000; // 30s mínimo
export const HEART_SPAWN_INTERVAL_MAX_MS = 45000; // 45s máximo
export const HEART_BONUS_POINTS = 10; // Puntos cuando se recolecta con 3 vidas
export const VAUL_SPAWN_INTERVAL_MS = 60000; // 60s fijo

// Rune system
export const RUNE_SPAWN_INTERVAL_MS = 20000; // Una runa cada 20 segundos
export const RUNE_SCORE_INCREMENT = 10; // Incremento base de puntuación por runa
export const RUNE_RADIUS = 26;
export const RUNE_TYPES: RuneType[] = ['ember', 'tide', 'gale', 'stone', 'void'];
export const RUNE_CONFIG: Record<RuneType, { color: string; label: string }> = {
  ember: { color: '#ff7043', label: 'Miner' },
  tide: { color: '#29b6f6', label: 'Engineer' },
  gale: { color: '#9ccc65', label: 'Chef' },
  stone: { color: '#8d6e63', label: 'Farmer' },
  void: { color: '#ab47bc', label: 'Gatherer' },
};

// Tiempo de vida en ms para Mega_node y Heart
export const COLLECTIBLE_LIFETIME_MS = 10000; // 10 segundos
export const COLLECTIBLE_BLINK_WARNING_MS = 3000; // 3 segundos de parpadeo antes de desaparecer

// Frases del hacker (Trump) y sus configuraciones
export const HACKER_PHRASES = [
  "These coins are mine now!",
  "I'll take those shiny tokens!",
  "Coin collector coming through!",
  "Nobody collects better than me!",
  "Make my wallet great again!"
];
export const HACKER_PHRASE_DURATION_MS = 4000; // 4 segundos mostrando la frase
export const HACKER_PHRASE_PAUSE_MS = 3000; // 3 segundos de pausa entre frases
export const HACKER_STUN_DURATION_MS = 2000; // 2 segundos de pausa después de tocar al token
export const HACKER_BANISH_DURATION_MS = 15000; // 15 segundos de destierro del grid después de tocar al token

// Collision Penalties
export const COLLISION_PENALTY_SECONDS = 5;

// UI
export const SCORE_FONT = '28px Pixellari';
export const TIMER_FONT = '28px Pixellari';
export const MESSAGE_FONT = '42px Pixellari';
export const PAUSE_FONT = '54px Pixellari';
export const PRIMARY_COLOR_CSS = 'hsl(var(--primary))'; // Electric Blue from CSS
export const FOREGROUND_COLOR_CSS = 'hsl(var(--foreground))';
export const DESTRUCTIVE_COLOR_CSS = 'hsl(var(--destructive))'; // Neon Red from CSS
export const ACCENT_COLOR_CSS = 'hsl(var(--accent))';

// Input Controls
export const KEY_UP = 'KeyW';
export const KEY_DOWN = 'KeyS';
export const KEY_LEFT = 'KeyA';
export const KEY_RIGHT = 'KeyD';
export const KEY_PAUSE = 'KeyP';
export const KEY_START = 'Space'; // Or Enter

// Checkpoint (tiempo extra)
export const CHECKPOINT_TIME_BONUS_START = 30; // Tiempo fijo para todos los checkpoints
export const CHECKPOINT_TIME_BONUS_MIN = 30;  // Igual al tiempo de bonificación inicial
export const CHECKPOINT_TIME_BONUS_STEP = 0;  // Sin reducción de tiempo por checkpoint
export const CHECKPOINT_APPEAR_THRESHOLD = 10; // Segundos restantes para que aparezca

export const BASE_GAME_WIDTH = 1100; // ancho lógico de todo el HUD + canvas
export const BASE_GAME_HEIGHT = 800; // alto lógico total (HUD + canvas + botones)
