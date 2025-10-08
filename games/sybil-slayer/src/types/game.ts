export interface Vector2D {
  x: number;
  y: number;
}

export interface GameObject extends Vector2D {
  id: string;
  radius: number;
  color: string; // Store color as HSL string e.g., 'hsl(180 100% 50%)'
  glow?: boolean;
}

export type Token = GameObject & {
  speed: number;
  velocity: Vector2D;
  boostTimer: number; // Timer for mega node speed boost (en ms, calculado en tiempo pausable)
  boostStartTime?: number; // Tiempo pausable cuando se activó el boost (getGameTime())
  immunityTimer: number; // Timer for purr immunity (en ms, calculado en tiempo pausable)
  immunityStartTime?: number; // Tiempo pausable cuando se activó la inmunidad (getGameTime())
  goatEliminationTimer?: number; // Duración restante del efecto GOAT para eliminar fees
  goatEliminationStartTime?: number; // Tiempo pausable cuando se activó el efecto GOAT
  goatImmunityTimer?: number; // Duración restante de la inmunidad GOAT (solo contra fees)
  goatImmunityStartTime?: number; // Tiempo pausable cuando comenzó la inmunidad GOAT
  glowTimer?: number; // Temporizador para el efecto de brillo
  direction?: DirectionType; // Dirección actual para sprites direccionales
  frameIndex?: number; // Para animación de sprites
  frameTimer?: number; // Tiempo acumulado para cambio de frame
}

export type ObstacleType = 'fee' | 'bug' | 'hacker';

export type DirectionType = 'up' | 'down' | 'left' | 'right' | 'north_east' | 'north_west' | 'south_east' | 'south_west';

export interface Obstacle extends GameObject {
  type: ObstacleType;
  velocity?: Vector2D; // For moving obstacles like fees/hackers
  rotation?: number; // For spinning bugs
  angularVelocity?: number; // For spinning bugs
  frameIndex?: number; // Para animación de sprites
  frameTimer?: number; // Tiempo acumulado para cambio de frame
  direction?: DirectionType; // Dirección actual para sprites direccionales
  hackerSpeedFactor?: number; // Factor de velocidad para hackers inteligentes
  hackerAccelFactor?: number; // Factor de aceleración para hackers inteligentes
  // Propiedades para las frases del hacker
  currentPhrase?: string; // Frase actual que está mostrando
  phraseTimer?: number; // Temporizador para controlar la duración de la frase
  phraseState?: 'showing' | 'paused'; // Estado de la frase: mostrando o en pausa
  lastPhraseIndex?: number; // Índice de la última frase mostrada para evitar repeticiones
  // Propiedades para pathfinding y detección de bloqueo
  lastPosition?: Vector2D; // Última posición válida para detectar si está atrapado
  stuckTimer?: number; // Tiempo que lleva atrapado
  isPathfinding?: boolean; // Si está actualmente usando pathfinding
  pathfindingTarget?: Vector2D; // Objetivo temporal del pathfinding
  // Propiedades para sistema de aceleración progresiva del hacker
  currentSpeed?: number; // Velocidad actual del hacker
  accelerationTimer?: number; // Tiempo acelerando desde última ralentización
  lastDirection?: Vector2D; // Última dirección de movimiento
  isSlowingDown?: boolean; // Si está ralentizando por cambio de dirección
  slowdownTimer?: number; // Tiempo restante de ralentización
  // Propiedades para el estado de aturdimiento después de tocar el token
  isStunned?: boolean; // Si está aturdido después de tocar al token
  stunTimer?: number; // Tiempo restante de aturdimiento
  // Propiedades para destierro temporal (desaparición del grid)
  isBanished?: boolean; // Si está desterrado temporalmente del grid
  banishTimer?: number; // Tiempo restante de destierro
  originalPosition?: Vector2D; // Posición original antes del destierro
  // Propiedades para retroceso visual después de tocar al token
  isRetreating?: boolean; // Si está retrocediendo después de tocar al token
  retreatDirection?: Vector2D; // Dirección del retroceso
  retreatSpeed?: number; // Velocidad del retroceso
  retreatTimer?: number; // Tiempo restante de retroceso visible
  retreatCollisionPosition?: Vector2D; // Posición donde ocurrió la colisión con el token
  // Nueva propiedad para contar energy recogidas por hacker
  energyCollected?: number; // Cantidad de energy que ha recogido este hacker
}

export type RuneType = 'ember' | 'tide' | 'gale' | 'stone' | 'void';

export interface RuneSlot {
  type: RuneType;
  collected: boolean;
}

export interface RuneState {
  active: boolean;
  slots: RuneSlot[];
  collectedTypes: RuneType[];
  runePickupCount: number;
  lastSpawnTime: number | null;
  nextSpawnTime: number | null;
}

export type CollectibleType = 'energy' | 'megaNode' | 'checkpoint' | 'heart' | 'purr' | 'vaul' | 'uki' | 'treasure' | 'rune' | 'goatSkin';

// Tipos para efectos visuales
export interface VisualEffect {
  id: string;
  type: 'explosion' | 'burst' | 'sparkle' | 'Explosion_(n)' | 'vault_activation';
  x: number;
  y: number;
  scale: number;
  opacity: number;
  duration: number; // Duración total del efecto en ms
  elapsedTime: number; // Tiempo transcurrido desde el inicio
  frameIndex?: number; // Para animaciones con sprites
  frameTimer?: number; // Timer para cambio de frames
}

export interface Collectible extends GameObject {
  type: CollectibleType;
  value: number; // Score value
  runeType?: RuneType; // Tipo de runa cuando corresponde
  // Propiedades para animación de pulsación
  pulseEffect?: boolean; // Si debe pulsar
  pulseScale?: number; // Escala actual de pulsación
  pulseDirection?: number; // Dirección de la pulsación (1: creciendo, -1: decreciendo)
  createdAt?: number; // Timestamp de creación para objetos con tiempo de vida limitado
  isBlinking?: boolean; // Si debe parpadear (cuando está a punto de desaparecer)
  // Propiedades específicas para vaul (activación por tiempo)
  contactStartTime?: number; // Tiempo cuando empezó el contacto actual con el token
  isBeingTouched?: boolean; // Si está siendo tocado actualmente
  activationProgress?: number; // Progreso acumulativo de activación (0-1) - NO se resetea al perder contacto
  isActivated?: boolean; // Si el vaul ya fue activado y debe ser removido
  // Nueva lógica de timer pausable para vault
  lifetimePaused?: boolean; // Si el timer de vida está pausado (cuando se toca)
  timeOnTouch?: number; // Tiempo acumulado cuando se está tocando
}

export type GameStatus = 'idle' | 'countdown' | 'playing' | 'paused' | 'gameOver';

export type RayOrientation = 'vertical' | 'horizontal';
export type RayPhase = 'warning' | 'active';

export interface RayHazard {
  id: string;
  orientation: RayOrientation;
  phase: RayPhase;
  warningStartTime: number; // Tiempo cuando empezó el aviso
  activeStartTime?: number; // Tiempo cuando se activó el rayo
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RayCycleState {
  stage: 'idle' | 'warning1' | 'active1' | 'warning2' | 'active2' | 'warning3' | 'active3';
  stageStartTime: number | null;
  nextCycleStartTime: number | null;
  lastCycleEndTime: number | null;
  firstOrientation: RayOrientation | null;
  secondOrientation: RayOrientation | null;
  thirdOrientation: RayOrientation | null;
}

export type HazardPhase = 'warning' | 'active';

export interface RedZone {
  id: string;
  phase: HazardPhase;
  warningStartTime: number;
  activeStartTime?: number;
  activeDuration: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreasureState {
  activeTreasureId: string | null;
  activeSpawnTime: number | null;
  nextSpawnTime: number | null;
  treasuresCollectedInBlock: number;
  successfulBlocks: number;
}

export interface GameState {
  status: GameStatus;
  token: Token;
  obstacles: Obstacle[];
  collectibles: Collectible[];
  score: number;
  timer: number; // Remaining time in seconds
  gameStartTime: number | null; // Timestamp when game started
  level: number; // To track difficulty increase
  isFrenzyMode: boolean;
  canvasSize: { width: number; height: number };
  hearts: number; // Vidas del token
  maxHearts: number; // Máximo de corazones permitidos (aumenta con el nivel)
  lastDamageTime?: number | null; // Tiempo del último daño
  lastDamageSource?: ObstacleType | 'ray' | 'redZone' | null; // Tipo de obstáculo que causó el último daño
  gameOverReason?: 'bug' | 'time' | 'hearts' | 'redZone'; // Razón del game over
  countdown?: number; // Número actual de la cuenta atrás (3, 2, 1)
  countdownStartTime?: number; // Timestamp cuando empezó la cuenta atrás
  // Propiedades para el multiplicador de vaul
  scoreMultiplier: number; // Multiplicador actual del score (1 normal, 5 con vaul)
  multiplierEndTime?: number | null; // Timestamp cuando termina el multiplicador
  multiplierTimeRemaining?: number; // Tiempo restante del multiplicador en segundos (para UI)
  checkpointTimeBonus: number; // Tiempo extra acumulado por checkpoints
  timePenalties: number; // Penalizaciones de tiempo acumuladas
  // Sistema de rondas equilibradas para assets positivos
  positiveAssetsRound: ('megaNode' | 'heart' | 'purr' | 'vaul')[]; // Assets disponibles en la ronda actual
  currentRoundNumber: number; // Número de ronda actual para tracking
  // Sistema de garantía mínima de assets positivos
  lastPositiveAssetTime: number | null; // Timestamp del último asset positivo spawneado
  positiveAssetsIn30s: number; // Contador de assets positivos aparecidos en los últimos 30s
  periodStartTime: number | null; // Inicio del período actual de 30s
  // Nuevo sistema de timing independiente
  lastMegaNodeSpawn: number | null; // Última vez que spawneó un megaNode
  nextMegaNodeInterval: number | null; // Próximo intervalo aleatorio para meganode
  lastHeartSpawn: number | null; // Última vez que spawneó un heart
  nextHeartInterval: number | null; // Próximo intervalo aleatorio para heart
  heartsCollectedWithFullLife: number; // Contador de corazones recogidos con 3 vidas (para puntuación progresiva)
  lastVaulSpawn: number | null; // Última vez que spawneó un vaul
  // Sistema de aparición progresiva de assets negativos (cada 10s)
  negativeSpawnCycle: number; // Posición actual en el ciclo (1-5)
  lastNegativeSpawnTime: number | null; // Timestamp del último spawn de asset negativo
  hackerSpawned: boolean; // Si ya se spawneó el hacker único en el juego
  // NUEVO: Contador de vaults recogidos en la partida
  vaulCollectedCount: number;
  // Efectos del Vault
  activeVaulEffect: 'multiplier' | 'double_collectibles' | 'energy_to_uki' | 'eliminate_enemies' | null;
  vaulEffectStartTime: number | null; // Tiempo pausable cuando empezó el efecto (getGameTime())
  vaulEffectTimeRemaining: number; // Tiempo restante en segundos para mostrar en UI
  vaulEffectData: {
    multiplier?: number;
    duration?: number;
    enemiesEliminated?: number; // Para efecto eliminate_enemies
  } | null;
  // Para mostrar temporalmente el efecto instantáneo de eliminación
  eliminateEnemiesDisplay: {
    count: number;
    timestamp: number;
  } | null;
  // Efectos visuales
  visualEffects: VisualEffect[]; // Array de efectos visuales activos
  // Efecto de robo de score por hacker
  scoreStealEffect: {
    active: boolean;
    startTime: number;
  } | null;
  // Rayos (hazards periódicos)
  rays: RayHazard[];
  rayCycle: RayCycleState;
  // Zonas rojas temporales
  redZones: RedZone[];
  nextRedZoneSpawnTime: number | null;
  // Sistema de tesoros
  treasureState: TreasureState;
  // Sistema de runas y tótem
  runeState: RuneState;
}
