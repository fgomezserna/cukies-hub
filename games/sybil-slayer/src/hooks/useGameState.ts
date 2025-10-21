import { useState, useCallback, useRef, useEffect } from 'react';
import type { GameState, Token, Obstacle, Collectible, Vector2D, ObstacleType, GameStatus, CollectibleType, GameObject, VisualEffect, RayHazard, RayCycleState, RayOrientation, RedZone, TreasureState, RuneState, RuneType, LevelStatsEntry } from '@/types/game';
import type { SoundType } from './useAudio';
import {
  GAME_DURATION_SECONDS,
  TOKEN_RADIUS, TOKEN_BASE_SPEED, TOKEN_COLOR, TOKEN_BOOST_MULTIPLIER,
  MEGA_NODE_BOOST_DURATION_MS, PURR_IMMUNITY_DURATION_MS, MAX_OBSTACLES, INITIAL_OBSTACLE_COUNT, OBSTACLE_SPAWN_RATE_INCREASE,
  COLLISION_PENALTY_SECONDS, FEE_SPEED, HACKER_BASE_SPEED, HACKER_ACCELERATION, BUG_ANGULAR_VELOCITY, FRAME_TIME_MS,
  CHECKPOINT_APPEAR_THRESHOLD, CHECKPOINT_TIME_BONUS_START, CHECKPOINT_TIME_BONUS_STEP, CHECKPOINT_TIME_BONUS_MIN,
  HACKER_RADIUS, FEE_RADIUS, BUG_RADIUS, MEGA_NODE_SPAWN_CHANCE, PURR_SPAWN_CHANCE, VAUL_SPAWN_CHANCE, VAUL_ACTIVATION_TIME_MS, VAUL_PROGRESS_RATE,
  MEGA_NODE_SPAWN_INTERVAL_MIN_MS, MEGA_NODE_SPAWN_INTERVAL_MAX_MS, HEART_SPAWN_INTERVAL_MIN_MS, HEART_SPAWN_INTERVAL_MAX_MS, HEART_BONUS_POINTS_BASE, HEART_LIFETIME_MS, HEART_BLINK_WARNING_MS, VAUL_FIRST_SPAWN_MS, VAUL_NEXT_SPAWN_MS,
  VAUL_EFFECT_TYPES, VAUL_MULTIPLIER, VAUL_MULTIPLIER_DURATION_MIN_MS, VAUL_MULTIPLIER_DURATION_MAX_MS,
  VAUL_DOUBLE_ENERGY_COUNT, VAUL_DOUBLE_UKI_COUNT, VAUL_DOUBLE_DURATION_MIN_MS, VAUL_DOUBLE_DURATION_MAX_MS,
  VAUL_ENERGY_TO_UKI_DURATION_MIN_MS, VAUL_ENERGY_TO_UKI_DURATION_MAX_MS, VAUL_ELIMINATE_ENEMIES_MIN, VAUL_ELIMINATE_ENEMIES_MAX,
  COLLECTIBLE_LIFETIME_MS, COLLECTIBLE_BLINK_WARNING_MS, MAX_ENERGY_POINTS, INITIAL_ENERGY_POINTS, MAX_UKI_POINTS,
  ENERGY_POINT_RADIUS, ENERGY_POINT_COLOR, ENERGY_POINT_VALUE,
  UKI_RADIUS, UKI_COLOR, UKI_VALUE,
  HACKER_PHRASES, HACKER_PHRASE_DURATION_MS, HACKER_PHRASE_PAUSE_MS, HACKER_STUN_DURATION_MS, HACKER_BANISH_DURATION_MS,
  RAY_WARNING_DURATION_MS, RAY_STAGE_INTERVAL_MS, RAY_BLOCK_DISAPPEAR_DELAY_MS, RAY_FIRST_BLOCK_START_MS, RAY_BLOCK_INTERVAL_MS, RAY_THICKNESS, RAY_MIN_SEPARATION,
  RED_ZONE_WARNING_DURATION_MS, RED_ZONE_ACTIVE_DURATION_MIN_MS, RED_ZONE_ACTIVE_DURATION_MAX_MS,
  RED_ZONE_SPAWN_INTERVAL_MIN_MS, RED_ZONE_SPAWN_INTERVAL_MAX_MS, RED_ZONE_MAX_COUNT,
  RED_ZONE_MIN_WIDTH_RATIO, RED_ZONE_MAX_WIDTH_RATIO, RED_ZONE_MIN_HEIGHT_RATIO, RED_ZONE_MAX_HEIGHT_RATIO,
  RED_ZONE_MIN_SEPARATION,
  RUNE_FIRST_SPAWN_MS, RUNE_NEXT_SPAWN_MS, RUNE_SCORE_INCREMENT, MAX_LEVEL_WITH_TOTEM, MAX_LEVEL, RUNE_TYPES,
  GOAT_ELIMINATION_DURATION_MS, GOAT_IMMUNITY_DURATION_MS, TOKEN_DAMAGE_IMMUNITY_MS
} from '../lib/constants';
import { clamp, checkCollision, getRandomInt, getRandomFloat, normalizeVector, distanceBetweenPoints, createObstacle, generateId, getRandomObstacleType, createEnergyCollectible, createUkiCollectible, createTreasureCollectible, createMegaNodeCollectible, createPurrCollectible, createVaulCollectible, createCheckpointCollectible, createHeartCollectible, createStrategicBug, createRuneCollectible, createGoatSkinCollectible, resetIdCounter } from '@/lib/utils';
import { useGameTime } from './useGameTime';
import { TREASURE_LIFETIME_MS, TREASURE_BLINK_WARNING_MS, TREASURE_NEXT_BLOCK_MIN_S, TREASURE_NEXT_BLOCK_MAX_S, TREASURE_BLOCK_BASE_POINTS } from '../lib/constants';
import { randomManager } from '@/lib/random';

const initialTokenState = (canvasWidth: number, canvasHeight: number): Token => ({
  id: 'token',
  x: canvasWidth / 2,
  y: canvasHeight / 2,
  radius: TOKEN_RADIUS,
  color: TOKEN_COLOR,
  speed: TOKEN_BASE_SPEED,
  velocity: { x: 0, y: 0 },
  boostTimer: 0,
  boostStartTime: undefined, // Inicialmente sin boost
  immunityTimer: 0,
  immunityStartTime: undefined, // Inicialmente sin inmunidad
  goatEliminationTimer: 0,
  goatEliminationStartTime: undefined,
  goatImmunityTimer: 0,
  goatImmunityStartTime: undefined,
  glowTimer: 0,
  glow: false,
  direction: 'down',
  frameIndex: 0,
  frameTimer: 0,
});

const createInitialRuneState = (level: number): RuneState => {
  const active = level <= MAX_LEVEL_WITH_TOTEM;
  return {
    active,
    slots: RUNE_TYPES.map(type => ({ type, collected: false })),
    collectedTypes: [],
    runePickupCount: 0,
    lastSpawnTime: null,
    nextSpawnTime: null,
  };
};

const createEmptyLevelStatsEntry = (level: number, startTime: number | null = null): LevelStatsEntry => ({
  level,
  startTime,
  endTime: null,
  durationMs: 0,
  counts: {
    gems: 0,
    gemsX5: 0,
    ukis: 0,
    ukisX5: 0,
    treasures: 0,
    hearts: 0,
    runes: 0,
    levelCompletionBonus: 0,
  },
  points: {
    gems: 0,
    gemsX5: 0,
    ukis: 0,
    ukisX5: 0,
    treasures: 0,
    hearts: 0,
    runes: 0,
    levelCompletionBonus: 0,
  },
});

const getInitialGameState = (canvasWidth: number, canvasHeight: number, level: number = 1): GameState => ({
  status: 'idle',
  token: initialTokenState(canvasWidth, canvasHeight),
  obstacles: [],
  collectibles: [],
  score: 0,
  timer: GAME_DURATION_SECONDS,
  gameStartTime: null,
  level: level,
  isFrenzyMode: false,
  canvasSize: { width: canvasWidth, height: canvasHeight },
  hearts: getInitialHeartsForLevel(level), // Corazones iniciales escalados
  maxHearts: getMaxHeartsForLevel(level), // Máximo de corazones basado en el nivel
  lastDamageTime: null, // Inicializar
  lastDamageSource: null, // Inicializar el tipo de obstáculo que causó el último daño
  gameOverReason: undefined,
  scoreMultiplier: 1, // Multiplicador inicial normal
  multiplierEndTime: null, // Sin multiplicador activo al inicio
  multiplierTimeRemaining: 0, // Sin tiempo restante inicialmente
  checkpointTimeBonus: 0, // Tiempo extra acumulado por checkpoints
  timePenalties: 0, // Penalizaciones de tiempo acumuladas
  // Sistema de rondas equilibradas para assets positivos
  positiveAssetsRound: ['megaNode', 'heart', 'vaul'], // Purr temporalmente desactivado
  currentRoundNumber: 1, // Empezar en ronda 1
  // Sistema de garantía mínima de assets positivos
  lastPositiveAssetTime: null, // Sin assets spawneados inicialmente
  positiveAssetsIn30s: 0, // Contador inicial en 0
  periodStartTime: null, // Se establecerá cuando empiece el juego
  // Nuevo sistema de timing independiente
  lastMegaNodeSpawn: null, // Última vez que spawneó un megaNode
  nextMegaNodeInterval: null, // Próximo intervalo aleatorio para meganode
  lastHeartSpawn: null, // Última vez que spawneó un heart
  nextHeartInterval: null, // Próximo intervalo aleatorio para heart
  heartsCollectedWithFullLife: 0, // Contador de corazones recogidos con 3 vidas (para puntuación progresiva)
  lastVaulSpawn: null, // Última vez que spawneó un vaul
  // Sistema de aparición progresiva de assets negativos (cada 10s)
  negativeSpawnCycle: 1, // Empezar en paso 1 (fee)
  lastNegativeSpawnTime: null, // Sin spawns iniciales
  hackerSpawned: false, // No se ha spawneado hacker aún
  vaulCollectedCount: 0, // Inicializar contador de vaults recogidos
  // Efectos del Vault
  activeVaulEffect: null, // Tipo de efecto activo del vault
  vaulEffectStartTime: null, // Tiempo pausable cuando empezó el efecto
  vaulEffectTimeRemaining: 0, // Tiempo restante en segundos
  vaulEffectData: null, // Datos del efecto (multiplicador, etc)
  eliminateEnemiesDisplay: null, // Para mostrar temporalmente enemigos eliminados
  // Efectos visuales
  visualEffects: [], // Sin efectos iniciales
  // Efecto de robo de score por hacker
  scoreStealEffect: null,
  // Rayos
  rays: [],
  rayCycle: {
    stage: 'idle',
    stageStartTime: null,
    nextCycleStartTime: null,
    lastCycleEndTime: null,
    firstOrientation: null,
    secondOrientation: null,
    thirdOrientation: null,
  },
  redZones: [],
  nextRedZoneSpawnTime: null,
  treasureState: createInitialTreasureState(),
  runeState: createInitialRuneState(level),
  levelStats: [],
  currentLevelStartTime: null,
});

const isOverlapping = (obj: GameObject, others: GameObject[], minDist: number = 0) => {
  return others.some(o => {
    // MEJORADO: Lista completa de elementos recogibles incluyendo rune
    const collectibleTypes = ['energy', 'megaNode', 'purr', 'vaul', 'heart', 'checkpoint', 'uki', 'goatSkin', 'treasure', 'rune'];
    const isAssetPositive = ('type' in obj) && collectibleTypes.includes((obj as any).type);
    const isBug = ('type' in o) && o.type === 'bug';
    const isOtherAssetPositive = ('type' in o) && collectibleTypes.includes((o as any).type);
    const isObjBug = ('type' in obj) && (obj as any).type === 'bug';
    const isToken = !('type' in o) && 'speed' in o; // Token no tiene 'type' pero tiene 'speed'
    
    // Casos a verificar:
    // 1. Asset positivo vs Bug (evitar que assets aparezcan sobre bugs)
    // 2. Bug vs Asset positivo (evitar que bugs aparezcan sobre assets)
    // 3. Assets positivos entre sí (IMPORTANTE: evitar solapamiento entre recogibles)
    // 4. Bugs entre sí (como antes)
    // 5. Asset positivo vs Token (evitar que assets aparezcan sobre el token)
    const shouldCheck = (isAssetPositive && isBug) || 
                       (isObjBug && isOtherAssetPositive) ||
                       (isAssetPositive && isOtherAssetPositive) ||
                       (isObjBug && ('type' in o) && o.type === 'bug') ||
                       (isAssetPositive && isToken);
    
    if (shouldCheck) {
      const dx = obj.x - o.x;
      const dy = obj.y - o.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const isOverlappingResult = dist < (obj.radius + o.radius + minDist);
      
      // DEBUG: Log para verificar colisiones entre recogibles
      if ('type' in obj && collectibleTypes.includes((obj as any).type) && 
          'type' in o && collectibleTypes.includes((o as any).type)) {
        console.log(`[OVERLAP DEBUG] ${(obj as any).type} vs ${(o as any).type} - Distance: ${dist.toFixed(1)}px, Required: ${(obj.radius + o.radius + minDist).toFixed(1)}px, Overlapping: ${isOverlappingResult}`);
      }
      
      return isOverlappingResult;
    }
    return false;
  });
};

// Añadir probabilidad de aparición de heart
const HEART_SPAWN_CHANCE = 0.02; // 2% por frame, ajustable

// --- FASE 1: ESCALADO DE ENEMIGOS ---
// Funciones auxiliares para escalado lineal
const getObstacleCountForLevel = (level: number) => {
  return getObstacleCountByTypeAndLevel(level, 'bug') + 
         getObstacleCountByTypeAndLevel(level, 'fee') + 
         getObstacleCountByTypeAndLevel(level, 'hacker');
};
const getFeeSpeedForLevel = (level: number) => {
  switch (level) {
    case 1:
      return FEE_SPEED; // Velocidad base
    case 2:
      return FEE_SPEED * 1.02; // Reducido: 2% más rápido (era 5%)
    case 3:
      return FEE_SPEED * 1.05; // Reducido: 5% más rápido (era 10%)
    case 4:
      return FEE_SPEED * 1.08; // Reducido: 8% más rápido (era 15%)
    default:
      return FEE_SPEED * 1.08; // Nivel 5+ igual que nivel 4
  }
};

// Nueva función para generar velocidad aleatoria para cada fee individual con variaciones dramáticas
const getRandomFeeSpeed = (level: number): number => {
  const baseSpeed = getFeeSpeedForLevel(level);
  
  // Definir categorías de velocidad con probabilidades y rangos MUY EXAGERADOS
  const random = randomManager.random('token-speed-tier');
  let speedMultiplier: number;
  let category: string;
  
  if (random < 0.3) {
    // 30% - Fees MUY LENTOS (30% - 50% de velocidad base)
    speedMultiplier = 0.3 + randomManager.random('token-speed') * 0.2; // 0.3x a 0.5x
    category = "MUY LENTO";
  } else if (random < 0.7) {
    // 40% - Fees NORMALES (80% - 120% de velocidad base)  
    speedMultiplier = 0.8 + randomManager.random('token-speed') * 0.4; // 0.8x a 1.2x
    category = "NORMAL";
  } else if (random < 0.9) {
    // 20% - Fees VELOCES (150% - 200% de velocidad base)
    speedMultiplier = 1.5 + randomManager.random('token-speed') * 0.5; // 1.5x a 2.0x
    category = "VELOZ";
  } else {
    // 10% - Fees SÚPER RÁPIDOS (250% - 350% de velocidad base)
    speedMultiplier = 2.5 + randomManager.random('token-speed') * 1.0; // 2.5x a 3.5x
    category = "SÚPER RÁPIDO";
  }
  
  const finalSpeed = baseSpeed * speedMultiplier;
  
  
  return finalSpeed;
};

const getBugAngularVelocityForLevel = (level: number) => {
  // Progresión más suave: de 0.05 base a incrementos de 0.01 por nivel
  return BUG_ANGULAR_VELOCITY + (level - 1) * 0.01;
};
const getHackerSpeedForLevel = (level: number) => {
  // Reducido: El hacker va 8% más rápido por cada nivel (era 15%)
  return HACKER_BASE_SPEED * (1 + (level - 1) * 0.08);
};
const getHackerAccelerationForLevel = (level: number) => {
  // La aceleración también aumenta 15% por nivel para perseguir coins más eficientemente
  return HACKER_ACCELERATION * (1 + (level - 1) * 0.15);
};

// --- FASE 2: ESCALADO DE ENERGÍA ---
const getInitialEnergyForLevel = (level: number) => INITIAL_ENERGY_POINTS; // Siempre 10 energy iniciales, independiente del nivel
const getMaxEnergyForLevel = (level: number) => MAX_ENERGY_POINTS; // Siempre mantener exactamente 10 energy en pantalla
const getEnergyRespawnChanceForLevel = (level: number) => 1.0; // Siempre respawn inmediato para mantener 10 energy

// --- FASE 3: ESCALADO DE CHECKPOINTS ---
const getCheckpointCooldownForLevel = (level: number) => 15 + (level - 1) * 5; // Cooldown en segundos, aumenta 5s por nivel
let lastCheckpointTime = 0;

// --- FASE 4: ESCALADO DE CORAZONES ---
const getHeartSpawnChanceForLevel = (level: number) => Math.max(0.005, 0.02 - (level - 1) * 0.003); // Baja 0.3% por nivel, mínimo 0.5%
const getInitialHeartsForLevel = (level: number) => 3; // Siempre 3 corazones iniciales en todos los niveles
const getMaxHeartsForLevel = (level: number) => 3; // Siempre 3 huecos máximos en todos los niveles

// --- FASE 5: ESCALADO DE PENALIZACIONES ---
const getCollisionPenaltySecondsForLevel = (level: number) => COLLISION_PENALTY_SECONDS + (level - 1) * 2; // Penalización de tiempo sube 2s por nivel
const getCollisionHeartLossForLevel = (level: number) => Math.min(3, 1 + Math.floor((level - 1) / 3)); // Pierde más corazones cada 3 niveles, máximo 3

const getLevelScoreMultiplier = (level: number): number => {
  // Multiplicador basado en el nivel: nivel 2 = x2, nivel 3 = x3, nivel 4 = x4, nivel 5 = x5
  if (level >= 2) return level;
  return 1; // Nivel 1 = x1
};

// Referencia para controlar el tiempo de congelamiento del token después de un impacto
const TOKEN_FREEZE_TIME_MS = 500; // Tiempo en ms que el token queda congelado tras ser tocado

// --- SISTEMA DE EFECTOS VISUALES ---
// Crear efecto de explosión cuando fee recoge energy
const createExplosionEffect = (x: number, y: number): VisualEffect => ({
  id: generateId(),
  type: 'explosion',
  x,
  y,
  scale: 0.1, // Empezar pequeño
  opacity: 1.0, // Empezar opaco
  duration: 800, // 800ms de duración
  elapsedTime: 0,
  frameIndex: 0,
  frameTimer: 0
});

// Crear efecto de explosión específico cuando hacker recoge energy (Explosion_(n))
const createHackerExplosionEffect = (x: number, y: number): VisualEffect => ({
  id: generateId(),
  type: 'Explosion_(n)',
  x,
  y,
  scale: 0.2, // Empezar un poco más grande que fee
  opacity: 1.0, // Empezar opaco
  duration: 800, // 800ms de duración
  elapsedTime: 0,
  frameIndex: 0,
  frameTimer: 0
});

// Crear efecto de explosión dorado para vault activado
const createVaultActivationEffect = (x: number, y: number): VisualEffect => ({
  id: generateId(),
  type: 'vault_activation',
  x,
  y,
  scale: 0.3, // Empezar más grande
  opacity: 1.0,
  duration: 1000, // Duración más larga para efecto épico
  elapsedTime: 0,
  frameIndex: 0,
  frameTimer: 0
});

// Actualizar efectos visuales
const updateVisualEffects = (effects: VisualEffect[], deltaTime: number): VisualEffect[] => {
  return effects
    .map(effect => {
      // Actualizar tiempo transcurrido
      const newEffect = { ...effect };
      newEffect.elapsedTime += deltaTime;
      
      // Calcular progreso (0-1)
      const progress = Math.min(newEffect.elapsedTime / newEffect.duration, 1);
      
      if (newEffect.type === 'explosion') {
        // Animación de explosión: crece rápido, luego se desvanece
        if (progress < 0.3) {
          // Fase 1: Crecimiento rápido (primeros 30%)
          newEffect.scale = 0.1 + (progress / 0.3) * 1.4; // De 0.1 a 1.5
          newEffect.opacity = 1.0;
        } else if (progress < 0.7) {
          // Fase 2: Mantener tamaño, empezar a desvanecer (30%-70%)
          newEffect.scale = 1.5;
          newEffect.opacity = 1.0 - ((progress - 0.3) / 0.4) * 0.4; // De 1.0 a 0.6
        } else {
          // Fase 3: Decrecer y desvanecer rápidamente (70%-100%)
          const finalPhase = (progress - 0.7) / 0.3;
          newEffect.scale = 1.5 - finalPhase * 0.8; // De 1.5 a 0.7
          newEffect.opacity = 0.6 - finalPhase * 0.6; // De 0.6 a 0.0
        }
        
        // Actualizar animación de sprites (simulada con frameIndex)
        newEffect.frameTimer = (newEffect.frameTimer || 0) + deltaTime;
        if (newEffect.frameTimer >= 50) { // Cambiar frame cada 50ms
          newEffect.frameIndex = ((newEffect.frameIndex || 0) + 1) % 8; // 8 frames de explosión
          newEffect.frameTimer = 0;
        }
      } else if (newEffect.type === 'vault_activation') {
        // Animación épica para activación del vault
        if (progress < 0.2) {
          // Fase 1: Expansión rápida
          newEffect.scale = 0.3 + (progress / 0.2) * 1.2; // De 0.3 a 1.5
          newEffect.opacity = 1.0;
        } else if (progress < 0.8) {
          // Fase 2: Mantener tamaño con efecto pulsante
          const pulseProgress = (progress - 0.2) / 0.6;
          newEffect.scale = 1.5 + Math.sin(pulseProgress * Math.PI * 3) * 0.2;
          newEffect.opacity = 1.0 - ((progress - 0.2) / 0.6) * 0.3; // De 1.0 a 0.7
        } else {
          // Fase 3: Desvanecer
          newEffect.scale = 1.5 - ((progress - 0.8) / 0.2) * 1.0; // De 1.5 a 0.5
          newEffect.opacity = 0.7 - ((progress - 0.8) / 0.2) * 0.7; // De 0.7 a 0.0
        }
      } else if (newEffect.type === 'Explosion_(n)') {
        // Animación específica para hacker: más dramática e intensa
        if (progress < 0.2) {
          // Fase 1: Crecimiento explosivo inicial (primeros 20%)
          newEffect.scale = 0.2 + (progress / 0.2) * 1.8; // De 0.2 a 2.0 (más grande)
          newEffect.opacity = 1.0;
        } else if (progress < 0.5) {
          // Fase 2: Mantener tamaño máximo más tiempo (20%-50%)
          newEffect.scale = 2.0;
          newEffect.opacity = 1.0;
        } else if (progress < 0.8) {
          // Fase 3: Empezar a desvanecer pero mantener tamaño (50%-80%)
          newEffect.scale = 2.0;
          newEffect.opacity = 1.0 - ((progress - 0.5) / 0.3) * 0.5; // De 1.0 a 0.5
        } else {
          // Fase 4: Desvanecimiento y decrecimiento final (80%-100%)
          const finalPhase = (progress - 0.8) / 0.2;
          newEffect.scale = 2.0 - finalPhase * 1.2; // De 2.0 a 0.8
          newEffect.opacity = 0.5 - finalPhase * 0.5; // De 0.5 a 0.0
        }
        
        // Actualizar animación de sprites más rápida para hacker
        newEffect.frameTimer = (newEffect.frameTimer || 0) + deltaTime;
        if (newEffect.frameTimer >= 40) { // Más rápido: cambiar frame cada 40ms
          newEffect.frameIndex = ((newEffect.frameIndex || 0) + 1) % 10; // 10 frames para hacker
          newEffect.frameTimer = 0;
        }
      }
      
      return newEffect;
    })
    .filter(effect => effect.elapsedTime < effect.duration); // Remover efectos terminados
};

interface ZoneBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const getRandomOrientation = (): RayOrientation =>
  (randomManager.random('ray-orientation') < 0.5 ? 'vertical' : 'horizontal');

const computeTokenZone = (
  token: Token,
  rays: RayHazard[],
  canvasSize: { width: number; height: number }
): ZoneBounds => {
  const verticalRays = rays
    .filter(ray => ray.orientation === 'vertical' && ray.phase === 'active')
    .sort((a, b) => a.x - b.x);
  const horizontalRays = rays
    .filter(ray => ray.orientation === 'horizontal' && ray.phase === 'active')
    .sort((a, b) => a.y - b.y);

  let xMin = 0;
  let xMax = canvasSize.width;

  for (const ray of verticalRays) {
    if (token.x < ray.x) {
      xMax = Math.min(xMax, ray.x);
      break;
    }
    if (token.x > ray.x + ray.width) {
      xMin = Math.max(xMin, ray.x + ray.width);
      continue;
    }
    // Token dentro del rayo (raro), limitar a la anchura del rayo
    xMin = Math.max(xMin, ray.x);
    xMax = Math.min(xMax, ray.x + ray.width);
    break;
  }

  let yMin = 0;
  let yMax = canvasSize.height;

  for (const ray of horizontalRays) {
    if (token.y < ray.y) {
      yMax = Math.min(yMax, ray.y);
      break;
    }
    if (token.y > ray.y + ray.height) {
      yMin = Math.max(yMin, ray.y + ray.height);
      continue;
    }
    yMin = Math.max(yMin, ray.y);
    yMax = Math.min(yMax, ray.y + ray.height);
    break;
  }

  if (xMax - xMin <= 0) {
    const fallback = clamp(token.x, 0, canvasSize.width);
    xMin = Math.max(0, fallback - 10);
    xMax = Math.min(canvasSize.width, fallback + 10);
  }

  if (yMax - yMin <= 0) {
    const fallback = clamp(token.y, 0, canvasSize.height);
    yMin = Math.max(0, fallback - 10);
    yMax = Math.min(canvasSize.height, fallback + 10);
  }

  return { xMin, xMax, yMin, yMax };
};

// Verifica si dos rayos del mismo tipo están demasiado cerca
const areRaysTooClose = (ray1: RayHazard, ray2: RayHazard, minSeparation: number = RAY_MIN_SEPARATION): boolean => {
  // Solo verificar si son del mismo tipo (misma orientación)
  if (ray1.orientation !== ray2.orientation) {
    return false;
  }

  if (ray1.orientation === 'vertical') {
    // Para rayos verticales, verificar distancia horizontal entre sus centros
    const center1 = ray1.x + ray1.width / 2;
    const center2 = ray2.x + ray2.width / 2;
    const distance = Math.abs(center1 - center2);
    return distance < minSeparation;
  } else {
    // Para rayos horizontales, verificar distancia vertical entre sus centros
    const center1 = ray1.y + ray1.height / 2;
    const center2 = ray2.y + ray2.height / 2;
    const distance = Math.abs(center1 - center2);
    return distance < minSeparation;
  }
};

// Crea un rayo evitando que esté demasiado cerca de otros rayos del mismo tipo
const safeCreateRayInZone = (
  orientation: RayOrientation,
  zone: ZoneBounds,
  canvasSize: { width: number; height: number },
  warningStartTime: number,
  existingRays: RayHazard[],
  maxAttempts: number = 20
): RayHazard | null => {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const candidate = createRayInZone(orientation, zone, canvasSize, warningStartTime);
    
    if (!candidate) {
      return null; // No se puede crear el rayo en esta zona
    }
    
    // Verificar si este rayo está demasiado cerca de otros rayos del mismo tipo
    const isTooClose = existingRays.some(existingRay => 
      areRaysTooClose(candidate, existingRay)
    );
    
    if (!isTooClose) {
      return candidate;
    }
    
    attempts++;
  }
  
  // Si después de muchos intentos no se puede colocar, retornar null
  console.warn(`[RAY] No se pudo encontrar una posición válida para rayo ${orientation} sin solapamiento`);
  return null;
};

const createRayInZone = (
  orientation: RayOrientation,
  zone: ZoneBounds,
  canvasSize: { width: number; height: number },
  warningStartTime: number
): RayHazard | null => {
  if (orientation === 'vertical') {
    const availableWidth = zone.xMax - zone.xMin;
    if (availableWidth <= 0) {
      return null;
    }

    const width = Math.min(RAY_THICKNESS, canvasSize.width);
    const globalMinCenter = canvasSize.width * 0.2;
    const globalMaxCenter = canvasSize.width * 0.8;
    const zoneMinCenter = zone.xMin;
    const zoneMaxCenter = zone.xMax;

    const minCenter = Math.max(zoneMinCenter, globalMinCenter);
    const maxCenter = Math.min(zoneMaxCenter, globalMaxCenter);

    if (maxCenter < minCenter) {
      return null;
    }

    const center = getRandomFloat(minCenter, maxCenter);
    let x = center - width / 2;
    x = clamp(x, 0, Math.max(0, canvasSize.width - width));

    return {
      id: generateId(),
      orientation,
      phase: 'warning',
      warningStartTime,
      x,
      y: 0,
      width,
      height: canvasSize.height,
    };
  }

  const availableHeight = zone.yMax - zone.yMin;
  if (availableHeight <= 0) {
    return null;
  }

  const height = Math.min(RAY_THICKNESS, canvasSize.height);
  const globalMinCenter = canvasSize.height * 0.2;
  const globalMaxCenter = canvasSize.height * 0.8;
  const zoneMinCenter = zone.yMin;
  const zoneMaxCenter = zone.yMax;

  const minCenter = Math.max(zoneMinCenter, globalMinCenter);
  const maxCenter = Math.min(zoneMaxCenter, globalMaxCenter);

  if (maxCenter < minCenter) {
    return null;
  }

  const center = getRandomFloat(minCenter, maxCenter);
  let y = center - height / 2;
  y = clamp(y, 0, Math.max(0, canvasSize.height - height));

  return {
    id: generateId(),
    orientation,
    phase: 'warning',
    warningStartTime,
    x: 0,
    y,
    width: canvasSize.width,
    height,
  };
};

const isTokenCollidingWithRay = (token: Token, ray: RayHazard): boolean => {
  if (ray.phase !== 'active') {
    return false;
  }

  const closestX = clamp(token.x, ray.x, ray.x + ray.width);
  const closestY = clamp(token.y, ray.y, ray.y + ray.height);
  const dx = token.x - closestX;
  const dy = token.y - closestY;
  return dx * dx + dy * dy <= token.radius * token.radius;
};

const createRedZone = (
  canvasSize: { width: number; height: number },
  warningStartTime: number
): RedZone => {
  const widthRatio = getRandomFloat(RED_ZONE_MIN_WIDTH_RATIO, RED_ZONE_MAX_WIDTH_RATIO);
  const heightRatio = getRandomFloat(RED_ZONE_MIN_HEIGHT_RATIO, RED_ZONE_MAX_HEIGHT_RATIO);
  const width = Math.max(20, Math.min(canvasSize.width * widthRatio, canvasSize.width));
  const height = Math.max(20, Math.min(canvasSize.height * heightRatio, canvasSize.height));
  const maxX = Math.max(0, canvasSize.width - width);
  const maxY = Math.max(0, canvasSize.height - height);
  const x = getRandomFloat(0, maxX);
  const y = getRandomFloat(0, maxY);
  const activeDuration = getRandomFloat(RED_ZONE_ACTIVE_DURATION_MIN_MS, RED_ZONE_ACTIVE_DURATION_MAX_MS);

  return {
    id: generateId(),
    phase: 'warning',
    warningStartTime,
    activeDuration,
    x,
    y,
    width,
    height,
  };
};

// Verifica si dos zonas rojas se solapan o están demasiado cerca
const doRedZonesOverlap = (zone1: RedZone, zone2: RedZone, minSeparation: number = RED_ZONE_MIN_SEPARATION): boolean => {
  // Calculamos la distancia mínima necesaria considerando el margen de separación
  // Si las zonas están más cerca que minSeparation, consideramos que hay solapamiento
  
  // Encontrar el punto más cercano de zone2 a zone1
  const closestX = clamp(zone1.x + zone1.width / 2, zone2.x, zone2.x + zone2.width);
  const closestY = clamp(zone1.y + zone1.height / 2, zone2.y, zone2.y + zone2.height);
  
  // Encontrar el punto más cercano de zone1 a zone2
  const closestX2 = clamp(zone2.x + zone2.width / 2, zone1.x, zone1.x + zone1.width);
  const closestY2 = clamp(zone2.y + zone2.height / 2, zone1.y, zone1.y + zone1.height);
  
  // Calcular distancia entre los bordes más cercanos
  const dx = Math.abs((zone1.x + zone1.width / 2) - closestX);
  const dy = Math.abs((zone1.y + zone1.height / 2) - closestY);
  const distance1 = Math.sqrt(dx * dx + dy * dy);
  
  const dx2 = Math.abs((zone2.x + zone2.width / 2) - closestX2);
  const dy2 = Math.abs((zone2.y + zone2.height / 2) - closestY2);
  const distance2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
  
  const minDistance = Math.min(distance1, distance2);
  
  // También verificar solapamiento directo de rectángulos
  const overlap = !(
    zone1.x + zone1.width < zone2.x ||
    zone2.x + zone2.width < zone1.x ||
    zone1.y + zone1.height < zone2.y ||
    zone2.y + zone2.height < zone1.y
  );
  
  return overlap || minDistance < minSeparation;
};

// Crea una zona roja evitando solapamientos con otras zonas existentes
const safeCreateRedZone = (
  canvasSize: { width: number; height: number },
  existingZones: RedZone[],
  warningStartTime: number,
  maxAttempts: number = 30
): RedZone | null => {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const newZone = createRedZone(canvasSize, warningStartTime);
    
    // Verificar si esta zona se solapa con alguna zona existente
    const hasOverlap = existingZones.some(existingZone => 
      doRedZonesOverlap(newZone, existingZone)
    );
    
    if (!hasOverlap) {
      return newZone;
    }
    
    attempts++;
  }
  
  // Si después de muchos intentos no se puede colocar, retornar null
  console.warn('[RED ZONE] No se pudo encontrar una posición válida sin solapamiento');
  return null;
};

const isTokenInsideRedZone = (token: Token, zone: RedZone): boolean => {
  const closestX = clamp(token.x, zone.x, zone.x + zone.width);
  const closestY = clamp(token.y, zone.y, zone.y + zone.height);
  const dx = token.x - closestX;
  const dy = token.y - closestY;
  return dx * dx + dy * dy <= token.radius * token.radius;
};

const createInitialTreasureState = (): TreasureState => ({
  activeTreasureId: null,
  activeSpawnTime: null,
  nextSpawnTime: null,
  treasuresCollectedInBlock: 0,
  successfulBlocks: 0,
  lastTreasurePosition: null,
});

// --- FUNCIONES HELPER PARA SISTEMA DE TIMING INDEPENDIENTE ---
// Función para generar intervalo aleatorio entre min y max
const getRandomInterval = (minMs: number, maxMs: number): number => {
  return getRandomInt(minMs, maxMs + 1); // +1 para incluir maxMs
};

// --- SISTEMA DE RONDAS EQUILIBRADAS PARA ASSETS POSITIVOS ---
// Función para obtener un asset disponible de la ronda actual
const getNextPositiveAsset = (availableAssets: ('megaNode' | 'heart' | 'purr' | 'vaul')[]): ('megaNode' | 'heart' | 'purr' | 'vaul') | null => {
  if (availableAssets.length === 0) {
    return null; // No hay assets disponibles
  }
  
  // Seleccionar aleatoriamente entre los assets disponibles
  const randomIndex = Math.floor(randomManager.random('positive-assets') * availableAssets.length);
  return availableAssets[randomIndex];
};

// Función para quitar un asset de la ronda actual
const removeAssetFromRound = (availableAssets: ('megaNode' | 'heart' | 'purr' | 'vaul')[], assetType: ('megaNode' | 'heart' | 'purr' | 'vaul')): ('megaNode' | 'heart' | 'purr' | 'vaul')[] => {
  return availableAssets.filter(asset => asset !== assetType);
};

// Función para resetear la ronda cuando se completa
const resetPositiveAssetsRound = (): ('megaNode' | 'heart' | 'purr' | 'vaul')[] => {
  return ['megaNode', 'heart', 'vaul']; // Purr temporalmente desactivado
};

// --- SISTEMA DE GARANTÍA MÍNIMA DE ASSETS POSITIVOS ---
const MINIMUM_ASSETS_PER_30S = 2; // Mínimo 2 assets cada 30 segundos
const PERIOD_DURATION_MS = 30000; // 30 segundos en millisegundos

// Función para verificar si necesitamos forzar spawn de assets
const shouldForcePositiveAssetSpawn = (currentTime: number, periodStartTime: number | null, positiveAssetsIn30s: number): boolean => {
  if (!periodStartTime) return false;
  
  const timeInCurrentPeriod = currentTime - periodStartTime;
  const timeRemainingInPeriod = PERIOD_DURATION_MS - timeInCurrentPeriod;
  
  // Si quedan menos de 10 segundos y no hemos cumplido el mínimo, forzar spawn
  if (timeRemainingInPeriod <= 10000 && positiveAssetsIn30s < MINIMUM_ASSETS_PER_30S) {
    return true;
  }
  
  // Si quedan menos de 5 segundos y solo tenemos 1 asset, forzar spawn del segundo
  if (timeRemainingInPeriod <= 5000 && positiveAssetsIn30s < MINIMUM_ASSETS_PER_30S) {
    return true;
  }
  
  return false;
};

// Función para calcular probabilidad dinámica basada en el progreso del período
const getDynamicSpawnChance = (currentTime: number, periodStartTime: number | null, positiveAssetsIn30s: number): number => {
  const BASE_CHANCE = 0.002; // Probabilidad base
  
  if (!periodStartTime) return BASE_CHANCE;
  
  const timeInCurrentPeriod = currentTime - periodStartTime;
  const progressRatio = timeInCurrentPeriod / PERIOD_DURATION_MS; // 0.0 a 1.0
  
  // Si vamos retrasados respecto al objetivo, aumentar probabilidad
  const expectedAssets = Math.floor(progressRatio * MINIMUM_ASSETS_PER_30S);
  const deficit = Math.max(0, expectedAssets - positiveAssetsIn30s);
  
  // Aumentar probabilidad exponencialmente si vamos retrasados
  const multiplier = 1 + (deficit * 2); // x1, x3, x5 según el déficit
  
  return Math.min(BASE_CHANCE * multiplier, 0.02); // Máximo 2% de probabilidad
};

// --- SISTEMA DE APARICIÓN PROGRESIVA DE ASSETS NEGATIVOS ---
const NEGATIVE_SPAWN_INTERVAL_MS = 10000; // 10 segundos

// Patrón de spawn: 1.fee -> 2.fee -> 3.fee -> 4.fee -> 5.fee (bugs desactivados temporalmente)
const getNegativeSpawnPattern = (cycle: number, hackerExists: boolean): { type: ObstacleType; count: number } => {
  const normalizedCycle = ((cycle - 1) % 5) + 1; // Ciclo 1-5 que se repite
  
  switch (normalizedCycle) {
    case 1:
      return { type: 'fee', count: 1 }; // 1 fee
    case 2:
      return { type: 'fee', count: 1 }; // 1 fee (cambiado de 2 a 1)
    case 3:
      return { type: 'fee', count: 1 }; // 1 fee (cambiado de 2 a 1)
    case 4:
      return { type: 'fee', count: 1 }; // 1 fee (antes era bug, ahora fee)
    case 5:
      // BUGS TEMPORALMENTE DESACTIVADOS - Siempre spawn fee en su lugar
      // if (hackerExists) {
      //   return { type: 'bug', count: 1 }; // 1 bug (reemplazo del hacker)
      // } else {
      //   return { type: 'hacker', count: 1 }; // 1 hacker único
      // }
      return { type: 'fee', count: 1 }; // Siempre fee (bugs y hackers desactivados)
    default:
      return { type: 'fee', count: 1 }; // Fallback
  }
};

// Función para verificar si es tiempo de hacer spawn progresivo
const shouldSpawnNegativeAssets = (currentTime: number, lastSpawnTime: number | null, gameStartTime: number | null): boolean => {
  if (!gameStartTime || !lastSpawnTime) {
    // Primer spawn después de 10 segundos del inicio del juego
    return gameStartTime !== null && (currentTime - gameStartTime >= NEGATIVE_SPAWN_INTERVAL_MS);
  }
  
  // Spawns subsecuentes cada 10 segundos
  return (currentTime - lastSpawnTime >= NEGATIVE_SPAWN_INTERVAL_MS);
};

// Función para crear obstáculos según el patrón
const createObstaclesByPattern = (
  pattern: { type: ObstacleType; count: number },
  width: number,
  height: number,
  existingObstacles: Obstacle[],
  token: Token,
  level: number,
  existingCollectibles: any[] = []
): Obstacle[] => {
  const newObstacles: Obstacle[] = [];
  
  for (let i = 0; i < pattern.count; i++) {
    let newObstacle: Obstacle;
    let attempts = 0;
    
    do {
      if (pattern.type === 'hacker') {
        newObstacle = createSmartHacker(generateId(), width, height, token, level);
      } else if (pattern.type === 'bug') {
        // MEJORADO: Pasar también collectibles para evitar spawn sobre assets positivos
        newObstacle = createStrategicBug(generateId(), width, height, [...existingObstacles, ...newObstacles], level, existingCollectibles);
      } else { // fee
        newObstacle = createObstacle(generateId(), 'fee', width, height);
        // Asignar velocidad aleatoria para el nivel actual
        if (newObstacle.velocity) {
          const randomFeeSpeed = getRandomFeeSpeed(level);
          const magnitude = Math.sqrt(newObstacle.velocity.x * newObstacle.velocity.x + newObstacle.velocity.y * newObstacle.velocity.y);
          if (magnitude > 0) {
            const normalizedX = newObstacle.velocity.x / magnitude;
            const normalizedY = newObstacle.velocity.y / magnitude;
            newObstacle.velocity = {
              x: normalizedX * randomFeeSpeed,
              y: normalizedY * randomFeeSpeed
            };
          }
        }
      }
      attempts++;
    } while (
      distanceBetweenPoints(newObstacle, token) < TOKEN_RADIUS * 12 && 
      attempts < 20
    );
    
    // Solo añadir si está lo suficientemente lejos del token
    if (distanceBetweenPoints(newObstacle, token) >= TOKEN_RADIUS * 10) {
      newObstacles.push(newObstacle);
    }
  }
  
  return newObstacles;
};

// Función para generar bugs adicionales cuando sube el nivel - TEMPORALMENTE DESACTIVADA
const addBugsForLevelUp = (currentLevel: number, width: number, height: number, existingObstacles: Obstacle[], token: Token, existingCollectibles: any[] = []): Obstacle[] => {
  // TEMPORALMENTE DESACTIVADO: No agregar bugs cuando sube el nivel
  console.log(`Bugs desactivados temporalmente - no se agregarán bugs para nivel ${currentLevel}`);
  return []; // Retornar array vacío
};

// Función auxiliar para incrementar la velocidad de los fees existentes
const upgradeFeeSpeed = (obstacles: Obstacle[], level: number): Obstacle[] => {
  return obstacles.map(obs => {
    if (obs.type === 'fee') {
      // Incrementar la velocidad en un 5% por cada nivel (reducido del 10%)
      const speedMultiplier = 1 + (0.05 * (level - 1));
      
      // Asegurar que los fees siempre tengan velocidad
      if (!obs.velocity) {
        obs.velocity = { 
          x: getRandomFloat(-1, 1) || (randomManager.random('obstacle-velocity') > 0.5 ? 0.5 : -0.5), 
          y: getRandomFloat(-1, 1) || (randomManager.random('obstacle-velocity') > 0.5 ? 0.5 : -0.5) 
        };
      }
      
      // Incrementar la magnitud de la velocidad manteniendo la dirección
      const currentSpeed = Math.sqrt(obs.velocity.x * obs.velocity.x + obs.velocity.y * obs.velocity.y);
      if (currentSpeed > 0) {
        const dirX = obs.velocity.x / currentSpeed;
        const dirY = obs.velocity.y / currentSpeed;
        
        // Aplicar el nuevo factor de velocidad
        const newSpeed = getFeeSpeedForLevel(level) * speedMultiplier;
        
        obs.velocity = {
          x: dirX * newSpeed,
          y: dirY * newSpeed
        };
      }
    }
    return obs;
  });
};

// Modificar la getRandomObstacleType para mantener alineamiento con los valores fijos por nivel
/**
 * Returns a random obstacle type that respects the configured quantities per level
 */
const getObstacleTypeWithLevelAdjustment = (level: number): ObstacleType => {
  // Esta función se asegura de que las probabilidades se alineen con las cantidades
  // fijas establecidas en getObstacleCountByTypeAndLevel
  if (level === 1) {
    // Nivel 1: 50% fees, 50% bugs, 0% hackers
    return randomManager.random('negative-spawn-pattern') < 0.5 ? 'fee' : 'bug';
  } else if (level === 2) {
    // Nivel 2: ~37.5% fees, ~50% bugs, ~12.5% hackers (3:4:1 ratio)
    const rand = randomManager.random('negative-spawn-pattern');
    if (rand < 0.375) return 'fee';
    if (rand < 0.875) return 'bug';
    return 'hacker';
  } else if (level === 3) {
    // Nivel 3: ~31% fees, ~46% bugs, ~23% hackers (4:6:3 ratio)
    const rand = randomManager.random('negative-spawn-pattern');
    if (rand < 0.31) return 'fee';
    if (rand < 0.77) return 'bug';
    return 'hacker';
  } else {
    // Nivel 4+: ~29% fees, ~47% bugs, ~24% hackers (5:8:4 ratio)
    const rand = randomManager.random('negative-spawn-pattern');
    if (rand < 0.29) return 'fee';
    if (rand < 0.76) return 'bug';
    return 'hacker';
  }
};

// Mejorar la inteligencia de los hackers existentes de forma más gradual
const upgradeHackers = (obstacles: Obstacle[], level: number): Obstacle[] => {
  return obstacles.map(obs => {
    if (obs.type === 'hacker') {
      // Aumentar la velocidad base del hacker según el nivel: 3% por nivel (reducido del 5%)
      const speedMultiplier = 1 + (level - 1) * 0.03; // 3% por nivel
      
      // Asegurar que los hackers siempre tengan una velocidad mínima
      if (!obs.velocity) {
        obs.velocity = { x: 0, y: 0 };
      }
      
      // Aumentar el factor de velocidad con el nivel
      obs.hackerSpeedFactor = getHackerSpeedForLevel(level) * speedMultiplier;
      obs.hackerAccelFactor = getHackerAccelerationForLevel(level) * speedMultiplier;
    }
    return obs;
  });
};

// Función para generar específicamente un hacker inteligente
const createSmartHacker = (id: string, width: number, height: number, token: Token, level: number): Obstacle => {
  // Decidir si el hacker aparece lejos o cerca de forma más gradual
  const ambushProbability = Math.min(0.4, (level - 2) * 0.1); // 0% en nivel 2, aumenta 10% por nivel hasta 40%
  const isAmbush = randomManager.random('ambush') < ambushProbability;
  
  let x, y;
  if (isAmbush) {
    // Emboscada: aparecer relativamente cerca del token pero fuera de vista
    const angle = randomManager.random('ambush-angle') * Math.PI * 2; // Ángulo aleatorio
    const distance = Math.min(width, height) * 0.4; // Distancia moderada
    x = token.x + Math.cos(angle) * distance;
    y = token.y + Math.sin(angle) * distance;
  } else {
    // MEJORADO: Posición inteligente en el borde más lejano al token
    // Definir las 4 esquinas del canvas
    const corners = [
      { x: HACKER_RADIUS, y: HACKER_RADIUS }, // Esquina superior izquierda
      { x: width - HACKER_RADIUS, y: HACKER_RADIUS }, // Esquina superior derecha
      { x: HACKER_RADIUS, y: height - HACKER_RADIUS }, // Esquina inferior izquierda
      { x: width - HACKER_RADIUS, y: height - HACKER_RADIUS } // Esquina inferior derecha
    ];
    
    // Calcular la distancia de cada esquina al token y encontrar la más lejana
    let maxDistance = 0;
    let bestCorner = corners[0];
    
    for (const corner of corners) {
      const distance = Math.sqrt(
        Math.pow(corner.x - token.x, 2) + 
        Math.pow(corner.y - token.y, 2)
      );
      if (distance > maxDistance) {
        maxDistance = distance;
        bestCorner = corner;
      }
    }
    
    // Agregar variación aleatoria cerca de la esquina más lejana
    const randomOffset = 80; // Mayor variación para spawn inicial
    const offsetX = getRandomFloat(-randomOffset, randomOffset);
    const offsetY = getRandomFloat(-randomOffset, randomOffset);
    
    x = bestCorner.x + offsetX;
    y = bestCorner.y + offsetY;
  }
  
  // Ajustar coordenadas para que estén dentro de los límites
  x = clamp(x, HACKER_RADIUS, width - HACKER_RADIUS);
  y = clamp(y, HACKER_RADIUS, height - HACKER_RADIUS);
  
  // Velocidad y aceleración aumentadas con el nivel de forma más gradual
  const speedMultiplier = 1 + (level - 1) * 0.05; // 5% por nivel en lugar de 50%
  
  return {
    id,
    type: 'hacker',
    x,
    y,
    radius: HACKER_RADIUS,
    color: `hsl(${getRandomInt(260, 290)} 100% 70%)`, // Tonos morados
    velocity: { x: 0, y: 0 },
    glow: false,
    hackerSpeedFactor: getHackerSpeedForLevel(level) * speedMultiplier,
    hackerAccelFactor: getHackerAccelerationForLevel(level) * speedMultiplier,
    energyCollected: 0, // NUEVO: Inicializar contador de energy recogidas
  };
};

// Función para obtener la cantidad exacta de obstáculos por nivel y tipo
const getObstacleCountByTypeAndLevel = (level: number, type: ObstacleType): number => {
  // TEMPORALMENTE DESACTIVADO: Bugs deshabilitados
  if (type === 'bug') {
    return 0; // No spawn bugs
  }
  
  switch (level) {
    case 1:
      return type === 'fee' ? 2 : 0; // 0 bugs (desactivados), 2 fees, 0 hackers
    case 2:
      return type === 'fee' ? 3 : 1; // 0 bugs (desactivados), 3 fees, 1 hacker
    case 3:
      return type === 'fee' ? 4 : 1; // 0 bugs (desactivados), 4 fees, 1 hacker
    case 4:
      return type === 'fee' ? 5 : 1; // 0 bugs (desactivados), 5 fees, 1 hacker
    default:
      return type === 'fee' ? 5 : 1; // Nivel 5+ igual que nivel 4, pero solo 1 hacker
  }
};

export function useGameState(canvasWidth: number, canvasHeight: number, onEnergyCollected?: () => void, onDamage?: () => void, onPlaySound?: (soundType: SoundType) => void, onHackerEscape?: () => void) {
  const [gameState, setGameState] = useState<GameState>(() => getInitialGameState(canvasWidth, canvasHeight));
   // Ref to store the latest input state without causing re-renders on input change
   const inputRef = useRef<{ direction: Vector2D; pauseToggled: boolean; startToggled: boolean }>({
     direction: { x: 0, y: 0 },
     pauseToggled: false,
     startToggled: false,
   });
   
   // Ref para mantener el multiplierEndTime entre renders
   const multiplierEndTimeRef = useRef<number | null>(null);

   // Contador de checkpoints recogidos
   const checkpointCountRef = useRef<number>(0);

   // Ref para invulnerabilidad tras daño
   const tokenFrozenUntilRef = useRef<number>(0);

   // Ref para invulnerabilidad inicial tras empezar partida
   const gameStartInvulnRef = useRef<number>(0);

   // Sistema de tiempo pausable
   const { 
     getGameTime, 
     getElapsedSeconds, 
     startGame: startGameTime, 
     pauseGame: pauseGameTime, 
     resumeGame: resumeGameTime, 
     resetTime,
     getAdjustedTimestamp
   } = useGameTime();

   // Update canvas size if props change
   useEffect(() => {
     setGameState(prev => ({
       ...prev,
       canvasSize: { width: canvasWidth, height: canvasHeight },
       // Optionally reset positions if canvas size changes drastically mid-game?
       // token: initialTokenState(canvasWidth, canvasHeight),
     }));
   }, [canvasWidth, canvasHeight]);

  const resetGame = useCallback(() => {
    console.log("Resetting game state");
    
    // Resetear referencias al resetear partida
    checkpointCountRef.current = 0;
    tokenFrozenUntilRef.current = 0;
    gameStartInvulnRef.current = 0;
    lastCheckpointTime = 0;
    resetIdCounter();
    
    // Resetear el sistema de tiempo
    resetTime();
    
    setGameState(getInitialGameState(canvasWidth, canvasHeight));
     // Ensure spawners run on reset if starting immediately
     // initializeGameObjects(1, canvasWidth, canvasHeight); // Level 1
  }, [canvasWidth, canvasHeight, resetTime]);


 const initializeGameObjects = useCallback((level: number, width: number, height: number) => {
     // Crear 1 fee inicial para que haya enemigo desde el primer segundo
     const obstacles: Obstacle[] = [];
     
     // Crear un fee inicial
     let initialFee: Obstacle;
         let attempts = 0;
         do {
       initialFee = createObstacle(generateId(), 'fee', width, height);
       // Asignar velocidad aleatoria para el nivel actual
       if (initialFee.velocity) {
         const randomFeeSpeed = getRandomFeeSpeed(level);
         const magnitude = Math.sqrt(initialFee.velocity.x * initialFee.velocity.x + initialFee.velocity.y * initialFee.velocity.y);
                 if (magnitude > 0) {
           const normalizedX = initialFee.velocity.x / magnitude;
           const normalizedY = initialFee.velocity.y / magnitude;
           initialFee.velocity = {
                         x: normalizedX * randomFeeSpeed,
                         y: normalizedY * randomFeeSpeed
                     };
                 } else {
           initialFee.velocity = {
                         x: (randomManager.random('fee-initial') > 0.5 ? 1 : -1) * randomFeeSpeed * 0.7,
                         y: (randomManager.random('fee-initial') > 0.5 ? 1 : -1) * randomFeeSpeed * 0.7
                     };
                 }
             }
             attempts++;
     } while (
       distanceBetweenPoints(initialFee, initialTokenState(width, height)) < TOKEN_RADIUS * 12 && 
       attempts < 20
     );
     
     // Solo añadir si está lo suficientemente lejos del token
     if (distanceBetweenPoints(initialFee, initialTokenState(width, height)) >= TOKEN_RADIUS * 10) {
       obstacles.push(initialFee);
     }
     
     // COMENTADO: Creación de obstáculos adicionales reemplazada por sistema progresivo
     /*
     // Todo el código comentado anterior...
     */

    const collectibles: Collectible[] = [];
    const initialEnergy = getInitialEnergyForLevel(level);
    const tokenObj = initialTokenState(width, height);
    
    for (let i = 0; i < initialEnergy; i++) {
        // MEJORADO: Verificar distancia con todos los objetos (energy ya creados, token, y obstáculos)
        const newEnergy = safeSpawnCollectible(
          createEnergyCollectible, 
          generateId(), 
          width, 
          height, 
          [...collectibles, tokenObj, ...obstacles] // Verificar con todos los objetos
        );
        collectibles.push(newEnergy);
    }

    console.log(`Juego inicializado con 1 fee inicial. Más enemigos aparecerán progresivamente cada 10s. Energía inicial: ${initialEnergy}`);
    
    return { obstacles, collectibles, level };
 }, []);


  const startGame = useCallback(() => {
    if (gameState.status === 'idle' || gameState.status === 'gameOver') {
      console.log("Starting countdown...");
      
      // Resetear referencias al empezar nueva partida
      checkpointCountRef.current = 0;
      tokenFrozenUntilRef.current = 0;
      gameStartInvulnRef.current = 0;
      lastCheckpointTime = 0;
      resetIdCounter();
      
      // Resetear e iniciar el sistema de tiempo
      resetTime();
      startGameTime();
      
      setGameState(prev => {
        const countdownStartTime = getGameTime();
        const { obstacles, collectibles } = initializeGameObjects(1, prev.canvasSize.width, prev.canvasSize.height); // Obtener datos
        const initialTreasureState = createInitialTreasureState();
        initialTreasureState.nextSpawnTime = countdownStartTime + getRandomFloat(0, 30000);
        // Configurar primer spawn del corazón entre 25-35s
        const initialHeartInterval = getRandomFloat(25000, 35000);
        return {
          ...prev, // Keep the newly initialized objects
          status: 'countdown',
          countdown: 3, // Empezar en 3
          countdownStartTime,
          timer: GAME_DURATION_SECONDS,
          score: 0,
          level: 1,
          isFrenzyMode: false,
          gameStartTime: null, // Se establecerá cuando termine el countdown usando getGameTime()
          token: initialTokenState(prev.canvasSize.width, prev.canvasSize.height), // Ensure token is reset too
          obstacles, // Usar los generados
          collectibles, // Usar los generados
          hearts: getInitialHeartsForLevel(1), // Reiniciar corazones
          maxHearts: getMaxHeartsForLevel(1), // Reiniciar max corazones (nivel 1 = 3 max)
          checkpointTimeBonus: 0, // Resetear bonus de checkpoints
          timePenalties: 0, // Resetear penalizaciones de tiempo
          scoreMultiplier: 1, // Resetear multiplicador
          multiplierEndTime: null, // Resetear multiplicador de vaul
          lastDamageTime: null, // Resetear último daño
          lastDamageSource: null, // Resetear fuente de daño
          // Sistema de rondas equilibradas para assets positivos
          positiveAssetsRound: ['megaNode', 'heart', 'vaul'], // Resetear ronda completa (Purr temporalmente desactivado)
          currentRoundNumber: 1, // Empezar en ronda 1
          // Sistema de garantía mínima de assets positivos
          lastPositiveAssetTime: null, // Sin assets spawneados inicialmente
          positiveAssetsIn30s: 0, // Contador inicial en 0
          periodStartTime: null, // Se establecerá cuando empiece el juego
          // Nuevo sistema de timing independiente
          lastMegaNodeSpawn: null, // Última vez que spawneó un megaNode
          nextMegaNodeInterval: null, // Próximo intervalo aleatorio para meganode
          lastHeartSpawn: null, // Última vez que spawneó un heart
          nextHeartInterval: initialHeartInterval, // Primer intervalo especial 25-35s
          heartsCollectedWithFullLife: 0, // Contador de corazones recogidos con 3 vidas (para puntuación progresiva)
          lastVaulSpawn: null, // Última vez que spawneó un vaul
          // Sistema de aparición progresiva de assets negativos (cada 10s)
          negativeSpawnCycle: 1, // Empezar en paso 1 (fee)
          lastNegativeSpawnTime: null, // Sin spawns iniciales
          hackerSpawned: false, // No se ha spawneado hacker aún
          vaulCollectedCount: 0, // BUGFIX: Resetear contador de vaults al iniciar nueva partida
          runeState: {
            ...createInitialRuneState(1),
            nextSpawnTime: null, // No spawn runes during countdown
          },
          // Efectos del Vault
          activeVaulEffect: null, // Resetear efecto del vault
          vaulEffectStartTime: null, // Resetear tiempo del efecto
          vaulEffectTimeRemaining: 0, // Resetear tiempo restante
          vaulEffectData: null, // Resetear datos del efecto
          eliminateEnemiesDisplay: null, // Resetear display de enemigos eliminados
          // Efectos visuales
          visualEffects: [], // Sin efectos iniciales
          // Efecto de robo de score por hacker
          scoreStealEffect: null,
          rays: [],
          rayCycle: {
            stage: 'idle',
            stageStartTime: null,
            nextCycleStartTime: null,
            lastCycleEndTime: null,
            firstOrientation: null,
            secondOrientation: null,
            thirdOrientation: null,
          },
          redZones: [],
          nextRedZoneSpawnTime: null,
          treasureState: initialTreasureState,
          levelStats: [],
          currentLevelStartTime: null,
        };
      });
    }
  }, [gameState.status, initializeGameObjects, resetTime, startGameTime, getGameTime]);


 const togglePause = useCallback(() => {
     setGameState(prev => {
         if (prev.status === 'playing') {
             console.log("Pausing game");
             pauseGameTime(); // Pausar el tiempo del juego
             return { ...prev, status: 'paused' };
         } else if (prev.status === 'paused') {
             console.log("Resuming game");
             resumeGameTime(); // Reanudar el tiempo del juego
             return { ...prev, status: 'playing' };
         }
         return prev; // No change for other statuses
     });
 }, [pauseGameTime, resumeGameTime]);


   // Function to be called by the input hook to update the internal ref
  const updateInputRef = useCallback((newInputState: { direction: Vector2D; pauseToggled: boolean; startToggled: boolean }) => {
     inputRef.current = newInputState;
  }, []);

  const forceGameOver = useCallback((reason: GameState['gameOverReason'] = 'multiplayer') => {
    setGameState(prev => {
      if (prev.status === 'gameOver') {
        return prev;
      }
      return {
        ...prev,
        status: 'gameOver',
        timer: 0,
        gameOverReason: reason,
      };
    });
  }, []);


  // The main game update logic
  const updateGame = useCallback((deltaTime: number, isPaused?: boolean) => {
      const { status } = gameState; // Get current status at the beginning of the update

      // Handle status changes based on input first
      if (inputRef.current.startToggled && (status === 'idle' || status === 'gameOver')) {
        startGame();
        inputRef.current.startToggled = false; // Consume the toggle
        return; // Exit early as state is changing
      }
      if (inputRef.current.pauseToggled && (status === 'playing' || status === 'paused')) {
        togglePause();
        inputRef.current.pauseToggled = false; // Consume the toggle
        // No early exit needed for pause/resume, just update status
      }

      // Handle countdown logic
      if (gameState.status === 'countdown') {
        setGameState(prev => {
          const now = getGameTime();
          const elapsed = now - (prev.countdownStartTime || now);
          const currentCountdown = Math.max(0, 3 - Math.floor(elapsed / 1000));
          
          if (currentCountdown === 0 && elapsed >= 3000) {
            // Countdown terminado, iniciar el juego
            const gameStartTime = now;
            gameStartInvulnRef.current = gameStartTime;
            console.log("Countdown finished! Starting game...");

            const existingLevelStats = prev.levelStats.map(stat => ({
              ...stat,
              counts: { ...stat.counts },
              points: { ...stat.points },
            }));
            const levelStatsIndex = existingLevelStats.findIndex(stat => stat.level === prev.level);
            let levelStats: LevelStatsEntry[];
            if (levelStatsIndex === -1) {
              levelStats = [...existingLevelStats, createEmptyLevelStatsEntry(prev.level, gameStartTime)];
            } else {
              const updatedEntry = {
                ...existingLevelStats[levelStatsIndex],
                startTime: existingLevelStats[levelStatsIndex].startTime ?? gameStartTime,
              };
              existingLevelStats[levelStatsIndex] = updatedEntry;
              levelStats = existingLevelStats;
            }
            
            // Initialize rune spawn timer when game actually starts playing
            const updatedRuneState = {
              ...prev.runeState,
              nextSpawnTime: now + RUNE_FIRST_SPAWN_MS,
            };
            
            return {
              ...prev,
              status: 'playing',
              gameStartTime,
              countdown: undefined,
              countdownStartTime: undefined,
              runeState: updatedRuneState,
              currentLevelStartTime: gameStartTime,
              levelStats,
            };
          } else {
            // Actualizar countdown
            return {
              ...prev,
              countdown: currentCountdown === 0 ? 0 : currentCountdown, // Mostrar 0 un momento antes de iniciar
            };
          }
        });
        return; // No procesar más lógica durante countdown
      }

      // Only run game logic if playing
      if (gameState.status !== 'playing') { // Check the potentially updated status
        return;
      }

    setGameState(prev => {
      let lastDamageTime = prev.lastDamageTime;
      let lastDamageSource = prev.lastDamageSource;
      let scoreStealEffect = prev.scoreStealEffect;
      let rays = prev.rays.map(ray => ({ ...ray }));
      let rayCycle = { ...prev.rayCycle };
      let redZones = prev.redZones.map(zone => ({ ...zone }));
      let nextRedZoneSpawnTime = prev.nextRedZoneSpawnTime;
      let treasureState = prev.treasureState ? { ...prev.treasureState } : createInitialTreasureState();
      let runeState: RuneState = {
        ...prev.runeState,
        slots: prev.runeState.slots.map(slot => ({ ...slot })),
        collectedTypes: [...prev.runeState.collectedTypes],
      };
      // --- Timer basado en tiempo pausable ---
      // IMPORTANTE: Usar getGameTime() garantiza que TODOS los timers se pausan correctamente
      // Esto incluye: timer principal, multiplicador vault, boost megaNode, inmunidad purr
      const now = getGameTime();
      let remainingTime;
      
      if (prev.gameStartTime) {
        // Calcular tiempo transcurrido pausable desde que empezó el juego
        const gameTimeElapsed = (now - prev.gameStartTime) / 1000; // en segundos
        remainingTime = GAME_DURATION_SECONDS - gameTimeElapsed;
        
        // Aplicar bonificaciones de tiempo de checkpoints y restar penalizaciones
        remainingTime += prev.checkpointTimeBonus - prev.timePenalties;
      } else {
        // Si no hay gameStartTime, usar el timer anterior (fallback)
        remainingTime = prev.timer;
      }
      
      // Debug temporal: Log para verificar que el tiempo se pausa correctamente
      if (randomManager.random('hacker-logs') < 0.01) { // Solo 1% de las veces para no spam
        const gameTimeElapsed = prev.gameStartTime ? (now - prev.gameStartTime) / 1000 : 0;
      }
      
      // Tiempo transcurrido pausable desde el inicio del juego (para logs e IA)
      const gameTimeElapsed = prev.gameStartTime ? (now - prev.gameStartTime) / 1000 : 0;
      let currentLevel = prev.level;
      runeState.active = currentLevel <= MAX_LEVEL_WITH_TOTEM;
      const levelMultiplier = getLevelScoreMultiplier(prev.level);
      
      let gameOver = false;
      let gameOverReason: GameState['gameOverReason'] | undefined = undefined;
      let currentLevelStartTime = prev.currentLevelStartTime;

      let levelStats = prev.levelStats.map(stat => ({
        ...stat,
        counts: { ...stat.counts },
        points: { ...stat.points },
      }));
      let currentLevelStatsIndex = levelStats.findIndex(stat => stat.level === prev.level);
      if (currentLevelStatsIndex === -1) {
        const startTime = currentLevelStartTime ?? now;
        const newEntry = createEmptyLevelStatsEntry(prev.level, startTime);
        levelStats = [...levelStats, newEntry];
        currentLevelStatsIndex = levelStats.length - 1;
      } else if (currentLevelStartTime && levelStats[currentLevelStatsIndex].startTime === null) {
        levelStats[currentLevelStatsIndex] = {
          ...levelStats[currentLevelStatsIndex],
          startTime: currentLevelStartTime,
        };
      }
      let currentLevelStats = currentLevelStatsIndex >= 0 ? levelStats[currentLevelStatsIndex] : null;

      let energyCollectedThisFrame = 0;
      let energyValueSumThisFrame = 0;
      let ukiCollectedThisFrame = 0;
      let ukiValueSumThisFrame = 0;
      let treasureCollectedThisFrame = 0;
      let treasureBasePointsThisFrame = 0;
      let heartsCollectedThisFrame = 0;
      let runeCollectedThisFrame = 0;
      let runeBasePointsThisFrame = 0;
      let runeCompletionBonusThisFrame = 0;

      // --- Update Token ---
      const { direction } = inputRef.current;
      let newToken = { ...prev.token };
      
      // Comprobar si el token está congelado por daño reciente
      const isFrozen = now < getAdjustedTimestamp(tokenFrozenUntilRef.current);
      
      // Solo actualizar velocidad y posición si no está congelado
      if (!isFrozen) {
        newToken.velocity = { x: direction.x, y: direction.y };

        // Calcular dirección del token con soporte para direcciones diagonales
        if (direction.x !== 0 || direction.y !== 0) {
          // Detectar movimiento diagonal
          const isDiagonal = Math.abs(direction.x) > 0 && Math.abs(direction.y) > 0;
          
          if (isDiagonal) {
            // Movimiento diagonal
            if (direction.x > 0 && direction.y < 0) {
              newToken.direction = 'north_east';
            } else if (direction.x < 0 && direction.y < 0) {
              newToken.direction = 'north_west';
            } else if (direction.x > 0 && direction.y > 0) {
              newToken.direction = 'south_east';
            } else if (direction.x < 0 && direction.y > 0) {
              newToken.direction = 'south_west';
            }
          } else {
            // Movimiento cardinal
            if (Math.abs(direction.x) > Math.abs(direction.y)) {
              newToken.direction = direction.x > 0 ? 'right' : 'left';
            } else {
              newToken.direction = direction.y > 0 ? 'down' : 'up';
            }
          }
        }

        // Apply boost
        let currentSpeed = newToken.boostTimer > 0 ? TOKEN_BASE_SPEED * TOKEN_BOOST_MULTIPLIER : TOKEN_BASE_SPEED;
        
        // Check if token is inside an active red zone and apply speed reduction
        const isInRedZone = redZones.some(zone => 
          zone.phase === 'active' && isTokenInsideRedZone(newToken, zone)
        );
        
        if (isInRedZone) {
          currentSpeed *= 0.5; // Reduce speed to 50% when inside red zone
        }
        
        newToken.x += newToken.velocity.x * currentSpeed * (deltaTime / (1000 / 60)); // Scale movement by deltaTime
        newToken.y += newToken.velocity.y * currentSpeed * (deltaTime / (1000 / 60));

        // Keep token within bounds
        newToken.x = clamp(newToken.x, newToken.radius, prev.canvasSize.width - newToken.radius);
        newToken.y = clamp(newToken.y, newToken.radius, prev.canvasSize.height - newToken.radius);
      } else {
        // Si está congelado, mantener la posición pero mostrar que está parado
        newToken.velocity = { x: 0, y: 0 };
      }

      // Actualizar animación de sprites del token
      if (newToken.frameTimer === undefined) {
        newToken.frameTimer = 0;
        newToken.frameIndex = 0;
      }
      newToken.frameTimer += deltaTime;
      if (newToken.frameTimer >= 150) { // 150ms entre frames
        newToken.frameIndex = ((newToken.frameIndex || 0) + 1) % 6; // 6 frames por dirección
        newToken.frameTimer = 0;
      }

      // Variable para detectar si el boost acaba de terminar
      let boostJustEnded = false;
      
      // Update boost timer - CORREGIDO: usar tiempo pausable como todos los demás timers
      if (newToken.boostTimer > 0 && newToken.boostStartTime) {
          // Calcular tiempo transcurrido en tiempo pausable desde la activación
          const pausableTimeElapsed = now - newToken.boostStartTime;
          const timeRemaining = MEGA_NODE_BOOST_DURATION_MS - pausableTimeElapsed;
          
          if (timeRemaining <= 0) {
              // El boost ha terminado
              newToken.boostTimer = 0;
              newToken.boostStartTime = undefined;
              boostJustEnded = true;
              console.log("[MEGA_NODE] Boost terminado (tiempo pausable)");
          } else {
              // Actualizar el timer con el tiempo restante pausable
              newToken.boostTimer = timeRemaining;
              
              // Log cada segundo para debugging
              const secondsLeft = Math.ceil(timeRemaining / 1000);
              const previousSecondsLeft = Math.ceil((timeRemaining + 50) / 1000); // Aproximar frame anterior
              if (secondsLeft !== previousSecondsLeft) {
                  console.log(`[MEGA_NODE] Boost activo: ${secondsLeft}s restantes (tiempo pausable)`);
              }
          }
      } else if (newToken.boostTimer > 0 && !newToken.boostStartTime) {
          // Fallback: si hay boostTimer pero no startTime, usar el método anterior
          newToken.boostTimer -= deltaTime;
          if (newToken.boostTimer <= 0) {
              newToken.boostTimer = 0;
              boostJustEnded = true;
              console.log("[MEGA_NODE] Boost terminado (fallback)");
          }
      }
      
      // Update immunity timer - CORREGIDO: usar tiempo pausable como todos los demás timers
      if (newToken.immunityTimer > 0 && newToken.immunityStartTime) {
          // Calcular tiempo transcurrido en tiempo pausable desde la activación
          const pausableTimeElapsed = now - newToken.immunityStartTime;
          const timeRemaining = PURR_IMMUNITY_DURATION_MS - pausableTimeElapsed;
          
          if (timeRemaining <= 0) {
              // La inmunidad ha terminado
              newToken.immunityTimer = 0;
              newToken.immunityStartTime = undefined;
              console.log("[PURR] Inmunidad terminada (tiempo pausable)");
          } else {
              // Actualizar el timer con el tiempo restante pausable
              newToken.immunityTimer = timeRemaining;
              
              // Log cada segundo para debugging
              const secondsLeft = Math.ceil(timeRemaining / 1000);
              const previousSecondsLeft = Math.ceil((timeRemaining + 50) / 1000); // Aproximar frame anterior
              if (secondsLeft !== previousSecondsLeft) {
                  console.log(`[PURR] Inmunidad activa: ${secondsLeft}s restantes (tiempo pausable)`);
              }
          }
      } else if (newToken.immunityTimer > 0 && !newToken.immunityStartTime) {
          // Fallback: si hay immunityTimer pero no startTime, usar el método anterior
          newToken.immunityTimer -= deltaTime;
          if (newToken.immunityTimer <= 0) {
              newToken.immunityTimer = 0;
              console.log("[PURR] Inmunidad terminada (fallback)");
          }
      }
      
      // Update GOAT elimination timer (tiempo pausable)
      if ((newToken.goatEliminationTimer || 0) > 0) {
          if (newToken.goatEliminationStartTime) {
              const elapsed = now - newToken.goatEliminationStartTime;
              const remaining = GOAT_ELIMINATION_DURATION_MS - elapsed;
              
              if (remaining <= 0) {
                  newToken.goatEliminationTimer = 0;
                  newToken.goatEliminationStartTime = undefined;
                  // Activar inmunidad cuando termine la eliminación
                  newToken.goatImmunityStartTime = now;
                  newToken.goatImmunityTimer = GOAT_IMMUNITY_DURATION_MS;
                  console.log("[GOAT] Efecto de eliminación finalizado. Inmunidad activada.");
              } else {
                  newToken.goatEliminationTimer = remaining;
              }
          } else {
              // Fallback para compatibilidad si no hay startTime
              newToken.goatEliminationTimer = Math.max(0, (newToken.goatEliminationTimer || 0) - deltaTime);
              if ((newToken.goatEliminationTimer || 0) === 0) {
                  // Activar inmunidad cuando termine la eliminación (fallback)
                  newToken.goatImmunityStartTime = now;
                  newToken.goatImmunityTimer = GOAT_IMMUNITY_DURATION_MS;
                  console.log("[GOAT] Efecto de eliminación terminado (fallback). Inmunidad activada.");
              }
          }
      }
      
      // Update GOAT immunity timer (tiempo pausable, solo contra fees)
      if ((newToken.goatImmunityTimer || 0) > 0) {
          if (newToken.goatImmunityStartTime) {
              const elapsed = now - newToken.goatImmunityStartTime;
              const remaining = GOAT_IMMUNITY_DURATION_MS - elapsed;
              
              if (remaining <= 0) {
                  newToken.goatImmunityTimer = 0;
                  newToken.goatImmunityStartTime = undefined;
                  console.log("[GOAT] Inmunidad contra fees finalizada");
              } else {
                  newToken.goatImmunityTimer = remaining;
              }
          } else {
              newToken.goatImmunityTimer = Math.max(0, (newToken.goatImmunityTimer || 0) - deltaTime);
              if ((newToken.goatImmunityTimer || 0) === 0) {
                  console.log("[GOAT] Inmunidad contra fees finalizada (fallback)");
              }
          }
      }
      
      // Update glow timer (para efectos visuales temporales)
      if (newToken.glowTimer && newToken.glowTimer > 0) {
          newToken.glowTimer -= deltaTime;
          newToken.glow = true; // Mantener el brillo mientras el timer > 0
          if (newToken.glowTimer <= 0) {
              newToken.glowTimer = 0;
              newToken.glow = false; // Desactivar brillo
              console.log("Glow effect ended");
          }
      }

      // --- Update Obstacles ---
      let newObstacles = prev.obstacles.map(obs => {
        let newObs = { ...obs };
        switch (newObs.type) {
          case 'fee':
             if (!newObs.velocity) newObs.velocity = { x: getRandomFloat(-1, 1), y: getRandomFloat(-1, 1) };
            
            // Mover usando la velocidad individual del fee - LOS FEES ATRAVIESAN BUGS
            newObs.x += newObs.velocity.x * (deltaTime / (1000 / 60));
            newObs.y += newObs.velocity.y * (deltaTime / (1000 / 60));
            
             // Bounce off walls only (no collision with bugs)
             if (newObs.x <= newObs.radius || newObs.x >= prev.canvasSize.width - newObs.radius) newObs.velocity.x *= -1;
             if (newObs.y <= newObs.radius || newObs.y >= prev.canvasSize.height - newObs.radius) newObs.velocity.y *= -1;
              newObs.x = clamp(newObs.x, newObs.radius, prev.canvasSize.width - newObs.radius);
              newObs.y = clamp(newObs.y, newObs.radius, prev.canvasSize.height - newObs.radius);
              
              // Actualizar animación de sprites
              if (newObs.frameTimer === undefined) {
                newObs.frameTimer = 0;
                newObs.frameIndex = 0;
              }
              
              // Actualizar la dirección basada en el vector de velocidad
              if (Math.abs(newObs.velocity.x) > Math.abs(newObs.velocity.y)) {
                newObs.direction = newObs.velocity.x > 0 ? 'right' : 'left';
              } else {
                newObs.direction = newObs.velocity.y > 0 ? 'down' : 'up';
              }
              
              // Actualizar timer de frames y cambiar frame si es necesario
              newObs.frameTimer += deltaTime;
              if (newObs.frameTimer >= 150) { // 150ms entre frames (ajustable)
                newObs.frameIndex = ((newObs.frameIndex || 0) + 1) % 6; // 6 frames por dirección (actualizado de 4 a 6)
                newObs.frameTimer = 0;
              }
            break;
          case 'bug':
            // PRUEBA: Temporalmente desactivada la rotación para probar si es causa de problemas de colisión
            // if (newObs.rotation !== undefined && newObs.angularVelocity) {
            //   // Escalar velocidad angular
            //   const bugAngular = getBugAngularVelocityForLevel(currentLevel) * (newObs.angularVelocity > 0 ? 1 : -1);
            //   newObs.rotation += bugAngular * (deltaTime / (1000 / 60));
            // }
            // Mantener la rotación fija en 0 para facilitar colisiones
            newObs.rotation = 0;
            break;
          case 'hacker':
             // Manejar estado de huida hacia los bordes
             if (newObs.isRetreating) {
               // Mover hacia el borde en la dirección de escape
               if (newObs.retreatDirection && newObs.retreatSpeed) {
                 const moveX = newObs.retreatDirection.x * newObs.retreatSpeed * (deltaTime / 16);
                 const moveY = newObs.retreatDirection.y * newObs.retreatSpeed * (deltaTime / 16);
                 
                 newObs.x += moveX;
                 newObs.y += moveY;
                 newObs.velocity = {
                   x: newObs.retreatDirection.x * newObs.retreatSpeed,
                   y: newObs.retreatDirection.y * newObs.retreatSpeed
                 };
                 
                 // Verificar si ha tocado algún borde del canvas
                 const touchedBorder = 
                   newObs.x <= newObs.radius || 
                   newObs.x >= prev.canvasSize.width - newObs.radius ||
                   newObs.y <= newObs.radius || 
                   newObs.y >= prev.canvasSize.height - newObs.radius;
                 
                 if (touchedBorder) {
                   // Ha tocado el borde - ahora desaparecer
                   newObs.isRetreating = false;
                   newObs.isBanished = true;
                   newObs.banishTimer = HACKER_BANISH_DURATION_MS;
                   
                   // Limpiar propiedades de retroceso
                   newObs.retreatDirection = undefined;
                   newObs.retreatSpeed = undefined;
                   newObs.retreatTimer = undefined;
                   newObs.retreatCollisionPosition = undefined;
                   
                   console.log(`[HACKER] ¡Tocó el borde! Desapareciendo por ${HACKER_BANISH_DURATION_MS / 1000}s`);
                 } else {
                   console.log(`[HACKER] Huyendo hacia el borde... pos: (${newObs.x.toFixed(1)}, ${newObs.y.toFixed(1)})`);
                 }
               }
               break; // Salir del case sin hacer más procesamiento mientras huye
             }
             
             // NUEVO: Manejar estado de destierro temporal
             if (newObs.isBanished) {
               // Actualizar el timer de destierro
               newObs.banishTimer = (newObs.banishTimer || 0) - deltaTime;
               
               if (newObs.banishTimer <= 0) {
                 // El destierro ha terminado - reaparecer en posición aleatoria
                 newObs.isBanished = false;
                 newObs.banishTimer = 0;
                 
                 // MEJORADO: Reaparecer en la posición más lejana al token en el borde del canvas
                 const tokenX = prev.token.x;
                 const tokenY = prev.token.y;
                 const canvasWidth = prev.canvasSize.width;
                 const canvasHeight = prev.canvasSize.height;
                 
                 // Definir las 4 esquinas del canvas
                 const corners = [
                   { x: newObs.radius, y: newObs.radius }, // Esquina superior izquierda
                   { x: canvasWidth - newObs.radius, y: newObs.radius }, // Esquina superior derecha
                   { x: newObs.radius, y: canvasHeight - newObs.radius }, // Esquina inferior izquierda
                   { x: canvasWidth - newObs.radius, y: canvasHeight - newObs.radius } // Esquina inferior derecha
                 ];
                 
                 // Calcular la distancia de cada esquina al token y encontrar la más lejana
                 let maxDistance = 0;
                 let bestCorner = corners[0];
                 
                 for (const corner of corners) {
                   const distance = Math.sqrt(
                     Math.pow(corner.x - tokenX, 2) + 
                     Math.pow(corner.y - tokenY, 2)
                   );
                   if (distance > maxDistance) {
                     maxDistance = distance;
                     bestCorner = corner;
                   }
                 }
                 
                 // Agregar un poco de variación aleatoria cerca de la esquina más lejana
                 // para evitar que siempre aparezca en el mismo píxel exacto
                 const randomOffset = 50; // 50px de variación
                 const offsetX = getRandomFloat(-randomOffset, randomOffset);
                 const offsetY = getRandomFloat(-randomOffset, randomOffset);
                 
                 newObs.x = clamp(
                   bestCorner.x + offsetX, 
                   newObs.radius, 
                   canvasWidth - newObs.radius
                 );
                 newObs.y = clamp(
                   bestCorner.y + offsetY, 
                   newObs.radius, 
                   canvasHeight - newObs.radius
                 );
                 
                 // Reset propiedades de movimiento
                 newObs.velocity = { x: 0, y: 0 };
                 newObs.currentSpeed = 0.5;
                 newObs.accelerationTimer = 0;
                 newObs.isSlowingDown = false;
                 newObs.slowdownTimer = 0;
                 
                 // Reset propiedades de retroceso
                 newObs.isRetreating = false;
                 newObs.retreatDirection = undefined;
                 newObs.retreatSpeed = undefined;
                 newObs.retreatTimer = undefined;
                 newObs.retreatCollisionPosition = undefined;
                 
                 // CORREGIDO: Reset contador de energías recogidas para que vuelva a necesitar 5
                 newObs.energyCollected = 0;
                 
                 console.log(`[HACKER] 🔄 DESTIERRO TERMINADO - ID: ${newObs.id} - Reapareciendo en (${newObs.x.toFixed(1)}, ${newObs.y.toFixed(1)}) - CONTADOR ENERGÍA RESETEADO A: ${newObs.energyCollected}`);
               } else {
                 // Mantener al hacker fuera del canvas (posición invisible)
                 newObs.x = -1000; // Fuera del canvas
                 newObs.y = -1000;
                 newObs.velocity = { x: 0, y: 0 };
                 console.log(`[HACKER] Desterrado por ${(newObs.banishTimer / 1000).toFixed(1)}s más`);
                 break; // Salir del case sin hacer más procesamiento
               }
             }
             
             // Manejar el estado de aturdimiento después del destierro
             if (newObs.isStunned) {
               // Actualizar el timer de aturdimiento
               newObs.stunTimer = (newObs.stunTimer || 0) - deltaTime;
               
               if (newObs.stunTimer <= 0) {
                 // El aturdimiento ha terminado
                 newObs.isStunned = false;
                 newObs.stunTimer = 0;
                 console.log(`[HACKER] Aturdimiento terminado, volviendo a perseguir al token`);
               } else {
                 // Mantener al hacker inmóvil mientras está aturdido
                 newObs.velocity = { x: 0, y: 0 };
                 console.log(`[HACKER] Aturdido por ${(newObs.stunTimer / 1000).toFixed(1)}s más`);
                 break; // Salir del case sin hacer más procesamiento
               }
             }
             
             // NUEVO COMPORTAMIENTO: el hacker persigue AL JUGADOR (token), no a las energy
             // Buscar la posición del jugador como objetivo
             let targetX = prev.token.x;
             let targetY = prev.token.y;
             let closestDistance = Math.sqrt(
               Math.pow(targetX - newObs.x, 2) + 
               Math.pow(targetY - newObs.y, 2)
             );
             
             // Inicializar propiedades de pathfinding si no existen
             if (newObs.lastPosition === undefined) {
               newObs.lastPosition = { x: newObs.x, y: newObs.y };
               newObs.stuckTimer = 0;
               newObs.isPathfinding = false;
             }
             
             // Detectar si está atrapado (se ha movido muy poco)
             const movementDistance = Math.sqrt(
               Math.pow(newObs.x - newObs.lastPosition!.x, 2) + 
               Math.pow(newObs.y - newObs.lastPosition!.y, 2)
             );
             
             if (movementDistance < 2.0) { // Si se ha movido menos de 2px
               newObs.stuckTimer = (newObs.stuckTimer || 0) + deltaTime;
             } else {
               newObs.stuckTimer = 0;
               newObs.lastPosition = { x: newObs.x, y: newObs.y };
               newObs.isPathfinding = false; // Reset pathfinding si se está moviendo bien
             }
             
             // MEJORADO: Detección más sensible de atascamiento (1.5 segundos en lugar de 2)
             const isStuckLongTime = (newObs.stuckTimer || 0) > 1500;
             
             // NUEVO: Sistema de detección proactiva de bugs para rodearlos
             // Verificar si hay bugs en el camino directo al token
             const dx = targetX - newObs.x;
             const dy = targetY - newObs.y;
             const directChaseDir = normalizeVector({ x: dx, y: dy });
             
             // Detectar bugs en el camino directo (próximos 80px)
             let bugInPath = null;
             let bugDistance = Infinity;
             const lookAheadDistance = 80; // Distancia de anticipación
             
             for (const otherObs of prev.obstacles) {
               if (otherObs.type === 'bug' && otherObs.id !== newObs.id) {
                 // Verificar si el bug está en la dirección hacia el token
                 const bugDx = otherObs.x - newObs.x;
                 const bugDy = otherObs.y - newObs.y;
                 const bugDist = Math.sqrt(bugDx * bugDx + bugDy * bugDy);
                 
                 // Verificar si el bug está dentro del rango de anticipación
                 if (bugDist <= lookAheadDistance) {
                   // Verificar si está aproximadamente en la dirección del token (dot product)
                   const bugDir = normalizeVector({ x: bugDx, y: bugDy });
                   const dotProduct = directChaseDir.x * bugDir.x + directChaseDir.y * bugDir.y;
                   
                   // Si está en la dirección general (dot product > 0.3) y es el más cercano
                   if (dotProduct > 0.3 && bugDist < bugDistance) {
                     bugInPath = otherObs;
                     bugDistance = bugDist;
                   }
                 }
               }
             }
             
             let chaseDir = directChaseDir;
             
             // Si hay un bug en el camino, calcular ruta de rodeo
             if (bugInPath && !isStuckLongTime) {
               console.log(`[HACKER] Bug detectado en el camino a ${bugDistance.toFixed(1)}px - calculando rodeo`);
               
               // Calcular vector perpendicular para rodear el bug
               const bugDx = bugInPath.x - newObs.x;
               const bugDy = bugInPath.y - newObs.y;
               
               // Dos direcciones perpendiculares posibles
               const perpLeft = { x: -bugDy, y: bugDx };
               const perpRight = { x: bugDy, y: -bugDx };
               
               // Normalizar las direcciones perpendiculares
               const perpLeftNorm = normalizeVector(perpLeft);
               const perpRightNorm = normalizeVector(perpRight);
               
               // Elegir la dirección perpendicular que nos acerque más al token
               // Calcular hacia dónde nos llevaría cada dirección perpendicular
               const leftTestX = newObs.x + perpLeftNorm.x * 60;
               const leftTestY = newObs.y + perpLeftNorm.y * 60;
               const rightTestX = newObs.x + perpRightNorm.x * 60;
               const rightTestY = newObs.y + perpRightNorm.y * 60;
               
               const leftDistToToken = Math.sqrt((leftTestX - targetX) ** 2 + (leftTestY - targetY) ** 2);
               const rightDistToToken = Math.sqrt((rightTestX - targetX) ** 2 + (rightTestY - targetY) ** 2);
               
               // Elegir la dirección que nos acerca más al token
               const chosenPerp = leftDistToToken < rightDistToToken ? perpLeftNorm : perpRightNorm;
               
               // Combinar dirección hacia el token con rodeo perpendicular
               // Más peso al rodeo cuando está muy cerca del bug
               const avoidanceWeight = Math.max(0.3, Math.min(0.8, (lookAheadDistance - bugDistance) / lookAheadDistance));
               const chaseWeight = 1 - avoidanceWeight;
               
               chaseDir = normalizeVector({
                 x: directChaseDir.x * chaseWeight + chosenPerp.x * avoidanceWeight,
                 y: directChaseDir.y * chaseWeight + chosenPerp.y * avoidanceWeight
               });
               
               console.log(`[HACKER] Rodeando bug - peso evasión: ${avoidanceWeight.toFixed(2)}, peso persecución: ${chaseWeight.toFixed(2)}`);
             }
             
             // Siempre perseguir al jugador (usando dirección calculada con/sin rodeo)
             if (!isStuckLongTime) {
               
               // --- SISTEMA DE ACELERACIÓN PROGRESIVA CON RALENTIZACIÓN EN GIROS ---
               
               // Inicializar propiedades de aceleración si no existen
               if (newObs.currentSpeed === undefined) {
                 newObs.currentSpeed = 0.5; // Velocidad inicial muy baja
                 newObs.accelerationTimer = 0;
                 newObs.lastDirection = { x: 0, y: 0 };
                 newObs.isSlowingDown = false;
                 newObs.slowdownTimer = 0;
               }
               
               // Detectar cambio de dirección significativo
               const lastDir = newObs.lastDirection!;
               const directionChange = Math.sqrt(
                 Math.pow(chaseDir.x - lastDir.x, 2) + 
                 Math.pow(chaseDir.y - lastDir.y, 2)
               );
               
               // Si hay un cambio de dirección significativo (> 0.7), ralentizar
               if (directionChange > 0.7 && !newObs.isSlowingDown && newObs.accelerationTimer! > 500) {
                 newObs.isSlowingDown = true;
                 newObs.slowdownTimer = 800; // 800ms de ralentización
                 newObs.currentSpeed = newObs.currentSpeed! * 0.3; // Reducir velocidad al 30%
                 console.log(`[HACKER] Cambio de dirección detectado (${directionChange.toFixed(2)}) - RALENTIZANDO por 800ms`);
               }
               
               // Gestionar estado de ralentización
               if (newObs.isSlowingDown) {
                 newObs.slowdownTimer! -= deltaTime;
                 if (newObs.slowdownTimer! <= 0) {
                   newObs.isSlowingDown = false;
                   newObs.accelerationTimer = 0; // Reset timer de aceleración
                   console.log(`[HACKER] Ralentización terminada - empezando nueva aceleración`);
                 }
               } else {
                 // Aceleración progresiva cuando no está ralentizando
                 newObs.accelerationTimer! += deltaTime;
                 
                 // Velocidades base y máxima según nivel - REDUCIDAS PARA MEJOR JUGABILIDAD
                 const baseSpeed = getHackerSpeedForLevel(currentLevel) * 0.4; // 40% de velocidad base (era 30%)
                 const maxSpeed = getHackerSpeedForLevel(currentLevel) * (1 + (currentLevel - 1) * 0.1); // Velocidad máxima reducida (era 0.2)
                 
                 // Aceleración progresiva en 3 segundos
                 const accelerationProgress = Math.min(1.0, newObs.accelerationTimer! / 3000); // 3 segundos para llegar a max
                 const targetSpeed = baseSpeed + (maxSpeed - baseSpeed) * accelerationProgress;
                 
                 // Acelerar gradualmente hacia la velocidad objetivo
                 const accelerationRate = 0.02 * (deltaTime / 16); // Suavizado de aceleración
                 newObs.currentSpeed = newObs.currentSpeed! + (targetSpeed - newObs.currentSpeed!) * accelerationRate;
               }
               
               // Aplicar velocidad con aceleración más cuando está lejos - REDUCIDO
               const distanceMultiplier = Math.min(1.2, Math.max(0.7, closestDistance / 120)); // Entre 0.7x y 1.2x según distancia (era 0.8x-1.5x)
               const finalSpeed = newObs.currentSpeed! * distanceMultiplier;
               
               // Actualizar velocidad
               newObs.velocity = {
                 x: chaseDir.x * finalSpeed,
                 y: chaseDir.y * finalSpeed
               };
               
               // Guardar dirección actual para próxima comparación
               newObs.lastDirection = { x: chaseDir.x, y: chaseDir.y };
               
               console.log(`[HACKER] Nivel ${currentLevel} - Persiguiendo jugador a ${closestDistance.toFixed(1)}px, velocidad: ${finalSpeed.toFixed(2)} (accel: ${(newObs.accelerationTimer! / 1000).toFixed(1)}s, ralentizando: ${newObs.isSlowingDown})`);
             } else if (isStuckLongTime) {
               // Pathfinding forzado cuando está atrapado por mucho tiempo
               console.log(`[HACKER] Atrapado por ${(newObs.stuckTimer! / 1000).toFixed(1)}s - activando escape forzado`);
               
               // Buscar la dirección con más espacio libre
               const directions = [
                 { x: 1, y: 0 },   // derecha
                 { x: -1, y: 0 },  // izquierda
                 { x: 0, y: 1 },   // abajo
                 { x: 0, y: -1 },  // arriba
                 { x: 0.707, y: 0.707 },   // diagonal abajo-derecha
                 { x: -0.707, y: 0.707 },  // diagonal abajo-izquierda
                 { x: 0.707, y: -0.707 },  // diagonal arriba-derecha
                 { x: -0.707, y: -0.707 }  // diagonal arriba-izquierda
               ];
               
               let bestDirection = { x: 1, y: 0 };
               let maxFreeSpace = 0;
               
               for (const dir of directions) {
                 // Calcular qué tan lejos puede moverse en esta dirección sin chocar
                 let freeSpace = 0;
                 const stepSize = 10;
                 const maxSteps = 20;
                 
                 for (let step = 1; step <= maxSteps; step++) {
                   const testX = newObs.x + dir.x * stepSize * step;
                   const testY = newObs.y + dir.y * stepSize * step;
                   
                   // Verificar límites del canvas
                   if (testX < newObs.radius || testX > prev.canvasSize.width - newObs.radius ||
                       testY < newObs.radius || testY > prev.canvasSize.height - newObs.radius) {
                     break;
                   }
                   
                   // Verificar colisión con bugs
                   let collision = false;
                   for (const otherObs of prev.obstacles) {
                     if (otherObs.type === 'bug' && otherObs.id !== newObs.id) {
                       const dx = testX - otherObs.x;
                       const dy = testY - otherObs.y;
                       const distance = Math.sqrt(dx * dx + dy * dy);
                       if (distance < newObs.radius + otherObs.radius + 15) {
                         collision = true;
                         break;
                       }
                     }
                   }
                   
                   if (collision) break;
                   freeSpace = stepSize * step;
                 }
                 
                 if (freeSpace > maxFreeSpace) {
                   maxFreeSpace = freeSpace;
                   bestDirection = dir;
                 }
               }
               
               // Aplicar movimiento en la mejor dirección con velocidad alta
               const escapeSpeed = getHackerSpeedForLevel(currentLevel) * 1.5;
               newObs.velocity = {
                 x: bestDirection.x * escapeSpeed,
                 y: bestDirection.y * escapeSpeed
               };
               newObs.isPathfinding = true;
               
               // Reset sistema de aceleración cuando entra en pathfinding forzado
               newObs.currentSpeed = escapeSpeed;
               newObs.accelerationTimer = 0;
               newObs.isSlowingDown = false;
               newObs.slowdownTimer = 0;
               newObs.lastDirection = { x: bestDirection.x, y: bestDirection.y };
               
               console.log(`[HACKER] Escape forzado - dirección: (${bestDirection.x.toFixed(2)}, ${bestDirection.y.toFixed(2)}), espacio libre: ${maxFreeSpace}px`);
             }

             // Calcular nueva posición del hacker
             const newHackerX = newObs.x + (newObs.velocity?.x || 0) * (deltaTime / (1000 / 60));
             const newHackerY = newObs.y + (newObs.velocity?.y || 0) * (deltaTime / (1000 / 60));
             
             // Verificar colisión con bugs antes de mover
             let hackerCollided = false;
             let blockedByBug = false;
             let closestBug: Obstacle | null = null;
             let closestBugDistance = Infinity;
             
             for (const otherObs of prev.obstacles) {
               if (otherObs.type === 'bug' && otherObs.id !== newObs.id) {
                 const dx = newHackerX - otherObs.x;
                 const dy = newHackerY - otherObs.y;
                 const distance = Math.sqrt(dx * dx + dy * dy);
                 const minDistance = newObs.radius + otherObs.radius + 8; // Aumentado de 5 a 8px de margen
                 
                 if (distance < minDistance) {
                   blockedByBug = true;
                   if (distance < closestBugDistance) {
                     closestBugDistance = distance;
                     closestBug = otherObs;
                   }
                 }
               }
             }

             // MEJORADO: Lógica inteligente de rebote que intenta rodear el bug
             if (blockedByBug && closestBug) {
               console.log(`[HACKER] Colisión inevitable con bug - aplicando maniobra evasiva inteligente`);
               
               // Calcular dirección para alejarse del bug
               const dx = newHackerX - closestBug.x;
               const dy = newHackerY - closestBug.y;
               const awayFromBugAngle = Math.atan2(dy, dx);
               
               // Calcular dirección hacia el token
               const toTokenAngle = Math.atan2(targetY - newObs.y, targetX - newObs.x);
               
               // Elegir la dirección perpendicular al bug que más se acerque al token
               const perpLeft = awayFromBugAngle + Math.PI / 2;
               const perpRight = awayFromBugAngle - Math.PI / 2;
               
               // Calcular qué dirección perpendicular nos acerca más al token
               const leftDotProduct = Math.cos(perpLeft) * Math.cos(toTokenAngle) + Math.sin(perpLeft) * Math.sin(toTokenAngle);
               const rightDotProduct = Math.cos(perpRight) * Math.cos(toTokenAngle) + Math.sin(perpRight) * Math.sin(toTokenAngle);
               
               // Elegir la mejor dirección perpendicular
               const bestPerpAngle = leftDotProduct > rightDotProduct ? perpLeft : perpRight;
               
               // Combinar alejamiento del bug con dirección hacia el token
               // 60% peso a rodeo, 40% peso a persecución del token
               const avoidWeight = 0.6;
               const chaseWeight = 0.4;
               
               const finalAngle = Math.atan2(
                 Math.sin(bestPerpAngle) * avoidWeight + Math.sin(toTokenAngle) * chaseWeight,
                 Math.cos(bestPerpAngle) * avoidWeight + Math.cos(toTokenAngle) * chaseWeight
               );
               
               const currentSpeed = Math.sqrt((newObs.velocity?.x || 0) ** 2 + (newObs.velocity?.y || 0) ** 2);
               const newSpeed = Math.max(currentSpeed * 0.9, getHackerSpeedForLevel(currentLevel) * 0.5);
               
               newObs.velocity = {
                 x: Math.cos(finalAngle) * newSpeed,
                 y: Math.sin(finalAngle) * newSpeed
               };
               
               // Reset sistema de aceleración cuando rebota con bug
               if (newObs.currentSpeed !== undefined) {
                 newObs.isSlowingDown = true;
                 newObs.slowdownTimer = 400; // Reducido de 600ms a 400ms
                 newObs.currentSpeed = newObs.currentSpeed * 0.6; // Menos penalización: 60% en lugar de 40%
                 newObs.lastDirection = { x: Math.cos(finalAngle), y: Math.sin(finalAngle) };
                 console.log(`[HACKER] Maniobra evasiva aplicada - ángulo: ${(finalAngle * 180 / Math.PI).toFixed(1)}°`);
               }
               
               // Separación física mejorada
               const minDistance = newObs.radius + closestBug.radius + 12; // Aumentado de 8 a 12
               const separationDistance = minDistance + 5; // Aumentado de 3 a 5
               const separationX = (Math.cos(awayFromBugAngle) * separationDistance) + closestBug.x;
               const separationY = (Math.sin(awayFromBugAngle) * separationDistance) + closestBug.y;
               
               newObs.x = clamp(separationX, newObs.radius, prev.canvasSize.width - newObs.radius);
               newObs.y = clamp(separationY, newObs.radius, prev.canvasSize.height - newObs.radius);
               
               hackerCollided = true;
               // NOTA: NO reproducir sonido aquí - esta es una colisión hacker vs bug, no hacker vs token
             }
             
             // Solo mover si NO hubo colisión
             if (!hackerCollided) {
               newObs.x += (newObs.velocity?.x || 0) * (deltaTime / (1000 / 60));
               newObs.y += (newObs.velocity?.y || 0) * (deltaTime / (1000 / 60));
               
               // Manejo inteligente de colisiones con los límites del canvas
               let bounced = false;
               
               // Verificar colisión con límites horizontales
               if (newObs.x <= newObs.radius) {
                 newObs.x = newObs.radius;
                 if (newObs.velocity && newObs.velocity.x < 0) {
                   newObs.velocity.x = Math.abs(newObs.velocity.x); // Invertir dirección horizontal
                   bounced = true;
                 }
               } else if (newObs.x >= prev.canvasSize.width - newObs.radius) {
                 newObs.x = prev.canvasSize.width - newObs.radius;
                 if (newObs.velocity && newObs.velocity.x > 0) {
                   newObs.velocity.x = -Math.abs(newObs.velocity.x); // Invertir dirección horizontal
                   bounced = true;
                 }
               }
               
               // Verificar colisión con límites verticales
               if (newObs.y <= newObs.radius) {
                 newObs.y = newObs.radius;
                 if (newObs.velocity && newObs.velocity.y < 0) {
                   newObs.velocity.y = Math.abs(newObs.velocity.y); // Invertir dirección vertical
                   bounced = true;
                 }
               } else if (newObs.y >= prev.canvasSize.height - newObs.radius) {
                 newObs.y = prev.canvasSize.height - newObs.radius;
                 if (newObs.velocity && newObs.velocity.y > 0) {
                   newObs.velocity.y = -Math.abs(newObs.velocity.y); // Invertir dirección vertical
                   bounced = true;
                 }
               }
               
               // Si rebotó en un límite, agregar variación aleatoria para evitar patrones repetitivos
               if (bounced) {
                 const randomVariation = (randomManager.random('hacker-bounce') - 0.5) * 0.3; // ±15% de variación
                 if (newObs.velocity) {
                   newObs.velocity.x *= (1 + randomVariation);
                   newObs.velocity.y *= (1 + randomVariation);
                 }
                 
                 // Reset sistema de aceleración cuando rebota en límites (cambio de dirección forzado)
                 if (newObs.currentSpeed !== undefined) {
                   newObs.isSlowingDown = true;
                   newObs.slowdownTimer = 500; // 500ms de ralentización por rebote en límite
                   newObs.currentSpeed = newObs.currentSpeed * 0.5; // Reducir velocidad al 50%
                   console.log(`[HACKER] Rebote en límite - RALENTIZANDO por 500ms`);
                 }
                 
                 console.log(`[HACKER] Rebote en límite del canvas con variación: ${(randomVariation * 100).toFixed(1)}%`);
               }
             }
             
             // Actualizar animación de sprites
             if (newObs.frameTimer === undefined) {
               newObs.frameTimer = 0;
               newObs.frameIndex = 0;
             }
             
             // Actualizar dirección basada en velocidad
             if (newObs.velocity) {
               if (newObs.velocity.y < 0 && Math.abs(newObs.velocity.y) > Math.abs(newObs.velocity.x)) {
                 newObs.direction = 'up';
               } else {
                 newObs.direction = newObs.velocity.x >= 0 ? 'right' : 'left';
               }
             }
             
             // Actualizar frames
             newObs.frameTimer += deltaTime;
             if (newObs.frameTimer >= 200) {
               newObs.frameIndex = ((newObs.frameIndex || 0) + 1) % 5;
               newObs.frameTimer = 0;
             }
             
             // Gestionar frases del hacker
             if (newObs.phraseState === undefined) {
               newObs.phraseState = 'paused';
               newObs.phraseTimer = 0;
               newObs.phraseTimer = randomManager.random('hacker-phrase') * (HACKER_PHRASE_PAUSE_MS + HACKER_PHRASE_DURATION_MS);
             }

             if (newObs.phraseTimer !== undefined) {
               newObs.phraseTimer += deltaTime;
               
               if (newObs.phraseState === 'showing' && newObs.phraseTimer >= HACKER_PHRASE_DURATION_MS) {
                 newObs.phraseState = 'paused';
                 newObs.phraseTimer = 0;
                 newObs.currentPhrase = undefined;
               } else if (newObs.phraseState === 'paused' && newObs.phraseTimer >= HACKER_PHRASE_PAUSE_MS) {
                 newObs.phraseState = 'showing';
                 newObs.phraseTimer = 0;
                 
                 let randomIndex;
                 do {
                   randomIndex = Math.floor(randomManager.random('hacker-phrase') * HACKER_PHRASES.length);
                 } while (randomIndex === newObs.lastPhraseIndex && HACKER_PHRASES.length > 1);
                 
                 newObs.lastPhraseIndex = randomIndex;
                 newObs.currentPhrase = HACKER_PHRASES[randomIndex];
               }
             }
            break;
        }
        return newObs;
      });
      const obstaclesMarkedForRemoval = new Set<string>();

      // --- Update Collectibles (e.g., slight movement or effects) ---
      let newCollectibles = [...prev.collectibles];
      let newVisualEffects = [...prev.visualEffects]; // Mover declaración aquí
       
       // Actualizar efectos visuales (pulsación)
       newCollectibles = newCollectibles.map(collectible => {
         if (collectible.pulseEffect) {
           // Calcular nueva escala basada en dirección
           const pulseSpeed = 0.003 * (deltaTime / 16); // Velocidad de pulsación
           const minScale = 0.8; // Escala mínima
           const maxScale = 1.2; // Escala máxima
           
           let newScale = (collectible.pulseScale || 1.0) + (collectible.pulseDirection || 1) * pulseSpeed;
           
           // Cambiar de dirección si alcanza los límites
           if (newScale >= maxScale) {
             newScale = maxScale;
             collectible.pulseDirection = -1; // Comenzar a decrecer
           } else if (newScale <= minScale) {
             newScale = minScale;
             collectible.pulseDirection = 1; // Comenzar a crecer
           }
           
           collectible.pulseScale = newScale;
       }
        return collectible;
      });

      const runeSystemActive = currentLevel <= MAX_LEVEL_WITH_TOTEM;
      runeState.active = runeSystemActive;

      const runeOnField = newCollectibles.some(collectible => collectible.type === 'rune');

      if (runeSystemActive) {
        // Inicializar nextSpawnTime si es null (primera runa a los 10s de partida)
        if (runeState.nextSpawnTime === null && prev.gameStartTime) {
          runeState.nextSpawnTime = prev.gameStartTime + RUNE_FIRST_SPAWN_MS;
          console.log(`[RUNE] Primera runa programada para ${(RUNE_FIRST_SPAWN_MS / 1000)}s de partida`);
        }

        if (!runeOnField && runeState.nextSpawnTime !== null && now >= runeState.nextSpawnTime) {
          const missingRunes = runeState.slots.filter(slot => !slot.collected).map(slot => slot.type);
          let candidatePool: RuneType[] = RUNE_TYPES;
          if (missingRunes.length > 0) {
        candidatePool = randomManager.random('rune-selection') < 0.7 ? missingRunes : RUNE_TYPES;
          }
          const selectedRuneType = candidatePool[Math.floor(randomManager.random('rune-selection') * candidatePool.length)];
          const runeFactory = (id: string, width: number, height: number, gameTime?: number) =>
            createRuneCollectible(id, width, height, selectedRuneType, gameTime);
          const runeCollectible = safeSpawnCollectible(
            runeFactory,
            generateId(),
            prev.canvasSize.width,
            prev.canvasSize.height,
            [...newCollectibles, prev.token, ...newObstacles],
            now
          );

          newCollectibles.push(runeCollectible);
          runeState.lastSpawnTime = now;
          // NO establecer nextSpawnTime aquí - se establecerá cuando se recoja la runa
          runeState.nextSpawnTime = null;
          console.log(`[RUNE] Nueva runa ${selectedRuneType} generada. Siguiente aparecerá ${(RUNE_NEXT_SPAWN_MS / 1000)}s después de recoger esta`);
        }
      } else {
        if (runeOnField) {
          newCollectibles = newCollectibles.filter(collectible => collectible.type !== 'rune');
        }
        runeState.lastSpawnTime = null;
        runeState.nextSpawnTime = null;
      }

       // Actualizar efectos visuales de explosión
       newVisualEffects = updateVisualEffects(newVisualEffects, deltaTime);

       // Actualizar efecto de aura roja del marcador de score
      if (scoreStealEffect && scoreStealEffect.active) {
        const timeSinceSteal = now - scoreStealEffect.startTime;
        if (timeSinceSteal >= 3000) { // 3 segundos de duración
          scoreStealEffect = null; // Desactivar el efecto
          console.log('[SCORE STEAL] Efecto de aura roja terminado');
        }
      }

      // --- Update Ray Cycle ---
      if (prev.status === 'playing') {
        if (rays.length > 0) {
          rays = rays.map(ray => {
            const width = Math.min(ray.width, prev.canvasSize.width);
            const height = Math.min(ray.height, prev.canvasSize.height);
            const x = clamp(ray.x, 0, Math.max(0, prev.canvasSize.width - width));
            const y = clamp(ray.y, 0, Math.max(0, prev.canvasSize.height - height));
            return {
              ...ray,
              x,
              y,
              width,
              height,
            };
          });
        }

        // --- Ray System Logic ---
        if (rayCycle.stage === 'idle') {
          if (rayCycle.nextCycleStartTime === null) {
            if (rayCycle.lastCycleEndTime) {
              // Bloques subsecuentes: 44s después de que termine el bloque anterior
              rayCycle.nextCycleStartTime = rayCycle.lastCycleEndTime + RAY_BLOCK_INTERVAL_MS;
            } else if (prev.gameStartTime) {
              // Primer bloque: 32s después del inicio de partida
              rayCycle.nextCycleStartTime = prev.gameStartTime + RAY_FIRST_BLOCK_START_MS;
            }
          } else if (now >= rayCycle.nextCycleStartTime) {
            const orientation = getRandomOrientation();
            const firstRay = safeCreateRayInZone(
              orientation,
              { xMin: 0, xMax: prev.canvasSize.width, yMin: 0, yMax: prev.canvasSize.height },
              prev.canvasSize,
              now,
              rays
            );

            if (firstRay) {
              rays = [firstRay];
              rayCycle.stage = 'warning1';
              rayCycle.stageStartTime = now;
              rayCycle.nextCycleStartTime = null;
              rayCycle.firstOrientation = orientation;
              rayCycle.secondOrientation = null;
              rayCycle.thirdOrientation = null;
              console.log(`[RAY] Inicio de bloque - aviso rayo 1 ${orientation} en (${firstRay.x.toFixed(1)}, ${firstRay.y.toFixed(1)})`);
            } else {
              console.warn('[RAY] No se pudo crear el primer rayo, reintentando en 1s');
              rayCycle.nextCycleStartTime = now + 1000;
            }
          }
        } else if (rayCycle.stage === 'warning1') {
          if (rayCycle.stageStartTime && now - rayCycle.stageStartTime >= RAY_WARNING_DURATION_MS) {
            rays = rays.map(ray => (
              ray.phase === 'warning'
                ? { ...ray, phase: 'active', activeStartTime: now }
                : ray
            ));
            rayCycle.stage = 'active1';
            rayCycle.stageStartTime = now;
            console.log('[RAY] Activación del primer rayo');
          }
        } else if (rayCycle.stage === 'active1') {
          // Ray 2 empieza a parpadear 2s después de que salga el ray 1
          if (rayCycle.stageStartTime && now - rayCycle.stageStartTime >= RAY_STAGE_INTERVAL_MS) {
            const zone = computeTokenZone(newToken, rays, prev.canvasSize);
            const preferredOrientation: RayOrientation = (rayCycle.firstOrientation === 'vertical') ? 'horizontal' : 'vertical';
            const fallbackOrientation: RayOrientation = preferredOrientation === 'vertical' ? 'horizontal' : 'vertical';
            const orientations: RayOrientation[] = [preferredOrientation, fallbackOrientation];

            let secondRay: RayHazard | null = null;
            let chosenOrientation: RayOrientation | null = null;
            for (const option of orientations) {
              const candidate = safeCreateRayInZone(option, zone, prev.canvasSize, now, rays);
              if (candidate) {
                secondRay = candidate;
                chosenOrientation = option;
                break;
              }
            }

            if (secondRay && chosenOrientation) {
              rays = [...rays, secondRay];
              rayCycle.stage = 'warning2';
              rayCycle.stageStartTime = now;
              rayCycle.secondOrientation = chosenOrientation;
              console.log(`[RAY] Aviso rayo 2 ${chosenOrientation} en (${secondRay.x.toFixed(1)}, ${secondRay.y.toFixed(1)})`);
            } else {
              console.warn('[RAY] No se pudo posicionar el segundo rayo dentro de la zona del token');
              rayCycle.stageStartTime = now; // Reintentar tras siguiente intervalo
            }
          }
        } else if (rayCycle.stage === 'warning2') {
          if (rayCycle.stageStartTime && now - rayCycle.stageStartTime >= RAY_WARNING_DURATION_MS) {
            rays = rays.map(ray => (
              ray.phase === 'warning'
                ? { ...ray, phase: 'active', activeStartTime: now }
                : ray
            ));
            rayCycle.stage = 'active2';
            rayCycle.stageStartTime = now;
            console.log('[RAY] Activación del segundo rayo');
          }
        } else if (rayCycle.stage === 'active2') {
          // Ray 3 empieza a parpadear 2s después de que salga el ray 2
          if (rayCycle.stageStartTime && now - rayCycle.stageStartTime >= RAY_STAGE_INTERVAL_MS) {
            const zone = computeTokenZone(newToken, rays, prev.canvasSize);
            const orientations: RayOrientation[] = [getRandomOrientation()];
            orientations.push(orientations[0] === 'vertical' ? 'horizontal' : 'vertical');

            let thirdRay: RayHazard | null = null;
            let chosenOrientation: RayOrientation | null = null;
            for (const option of orientations) {
              const candidate = safeCreateRayInZone(option, zone, prev.canvasSize, now, rays);
              if (candidate) {
                thirdRay = candidate;
                chosenOrientation = option;
                break;
              }
            }

            if (thirdRay && chosenOrientation) {
              rays = [...rays, thirdRay];
              rayCycle.stage = 'warning3';
              rayCycle.stageStartTime = now;
              rayCycle.thirdOrientation = chosenOrientation;
              console.log(`[RAY] Aviso rayo 3 ${chosenOrientation} en (${thirdRay.x.toFixed(1)}, ${thirdRay.y.toFixed(1)})`);
            } else {
              console.warn('[RAY] No se pudo posicionar el tercer rayo dentro de la zona del token');
              rayCycle.stageStartTime = now; // Reintentar tras siguiente intervalo
            }
          }
        } else if (rayCycle.stage === 'warning3') {
          if (rayCycle.stageStartTime && now - rayCycle.stageStartTime >= RAY_WARNING_DURATION_MS) {
            rays = rays.map(ray => (
              ray.phase === 'warning'
                ? { ...ray, phase: 'active', activeStartTime: now }
                : ray
            ));
            rayCycle.stage = 'active3';
            rayCycle.stageStartTime = now;
            console.log('[RAY] Activación del tercer rayo - bloque completo activo');
          }
        } else if (rayCycle.stage === 'active3') {
          // Los 3 rayos desaparecen 3s después de que aparezca el 3º rayo
          if (rayCycle.stageStartTime && now - rayCycle.stageStartTime >= RAY_BLOCK_DISAPPEAR_DELAY_MS) {
            rays = [];
            rayCycle.stage = 'idle';
            rayCycle.stageStartTime = null;
            rayCycle.lastCycleEndTime = now;
            rayCycle.nextCycleStartTime = null; // Se establecerá en el próximo frame
            rayCycle.firstOrientation = null;
            rayCycle.secondOrientation = null;
            rayCycle.thirdOrientation = null;
            console.log('[RAY] Bloque finalizado, los 3 rayos han desaparecido');
          }
        }

        // --- Update Red Zones ---
        if (nextRedZoneSpawnTime === null) {
          nextRedZoneSpawnTime = now + getRandomFloat(RED_ZONE_SPAWN_INTERVAL_MIN_MS, RED_ZONE_SPAWN_INTERVAL_MAX_MS);
        }

        const updatedRedZones: RedZone[] = [];
        for (const zone of redZones) {
          const zoneCopy: RedZone = { ...zone };

          if (zoneCopy.phase === 'warning' && now - zoneCopy.warningStartTime >= RED_ZONE_WARNING_DURATION_MS) {
            zoneCopy.phase = 'active';
            zoneCopy.activeStartTime = now;
            console.log('[RED ZONE] Zona activada - reduce velocidad del token a 50%');
          }

          if (zoneCopy.phase === 'active' && zoneCopy.activeStartTime !== undefined) {
            if (now - zoneCopy.activeStartTime >= zoneCopy.activeDuration) {
              console.log('[RED ZONE] Zona expirada y eliminada');
              continue; // Remove expired zone
            }
            // La zona activa solo reduce la velocidad, ya no mata al token
          }

          updatedRedZones.push(zoneCopy);
        }

        redZones = updatedRedZones;

        if (
          redZones.length < RED_ZONE_MAX_COUNT &&
          nextRedZoneSpawnTime !== null &&
          now >= nextRedZoneSpawnTime
        ) {
          const newZone = safeCreateRedZone(prev.canvasSize, redZones, now);
          if (newZone) {
            redZones.push(newZone);
            console.log(`[RED ZONE] Nueva zona en (${newZone.x.toFixed(1)}, ${newZone.y.toFixed(1)}) - ${newZone.width.toFixed(1)}x${newZone.height.toFixed(1)}px`);
          } else {
            console.log('[RED ZONE] No se pudo crear zona sin solapamiento, se reintentará en el siguiente ciclo');
          }
          nextRedZoneSpawnTime = now + getRandomFloat(RED_ZONE_SPAWN_INTERVAL_MIN_MS, RED_ZONE_SPAWN_INTERVAL_MAX_MS);
        }

        if (
          treasureState.activeTreasureId &&
          treasureState.activeSpawnTime !== null &&
          now - treasureState.activeSpawnTime >= TREASURE_LIFETIME_MS
        ) {
          newCollectibles = newCollectibles.filter(c => c.id !== treasureState.activeTreasureId);
          treasureState.activeTreasureId = null;
          treasureState.activeSpawnTime = null;
          treasureState.treasuresCollectedInBlock = 0;
          treasureState.lastTreasurePosition = null; // Resetear posición al reiniciar bloque
          // CORREGIDO: NO resetear successfulBlocks - mantener el progreso de bloques completados
          treasureState.nextSpawnTime = now + getRandomFloat(
            TREASURE_NEXT_BLOCK_MIN_S * 1000,
            TREASURE_NEXT_BLOCK_MAX_S * 1000
          );
          console.log(`[TREASURE] 🛑 Tesoro expirado sin recoger. Reiniciando bloque (multiplicador mantiene: ${treasureState.successfulBlocks + 1}).`);
        }

        if (
          !treasureState.activeTreasureId &&
          treasureState.nextSpawnTime !== null &&
          now >= treasureState.nextSpawnTime
        ) {
          const treasureId = generateId();
          // Usar safeSpawnTreasure para asegurar distancia mínima entre tesoros del mismo bloque
          const treasureCollectible = safeSpawnTreasure(
            treasureId,
            prev.canvasSize.width,
            prev.canvasSize.height,
            [...prev.collectibles, ...newCollectibles, prev.token, ...newObstacles],
            now,
            treasureState.lastTreasurePosition // Pasar la posición del tesoro anterior
          );
          treasureCollectible.createdAt = now;
          newCollectibles = newCollectibles.filter(c => c.type !== 'treasure');
          newCollectibles.push(treasureCollectible);
          treasureState.activeTreasureId = treasureId;
          treasureState.activeSpawnTime = now;
          treasureState.nextSpawnTime = null;
          // Guardar la posición del tesoro spawneado para el siguiente del bloque
          treasureState.lastTreasurePosition = { x: treasureCollectible.x, y: treasureCollectible.y };
          console.log(`[TREASURE] ✨ Tesoro ${treasureState.treasuresCollectedInBlock + 1} del bloque actual spawneado en (${treasureCollectible.x.toFixed(0)}, ${treasureCollectible.y.toFixed(0)})`);
        }
      }

      // --- Collision Detection ---
      let scoreToAdd = 0;
      let scoreToAddWithVaultMultiplier = 0; // Puntuación de energy/uki (recibe multiplicador del vault)
      let scoreToAddWithoutVaultMultiplier = 0; // Puntuación de otros coleccionables (NO recibe multiplicador del vault)
      let heartScoreToAdd = 0; // Puntuación de corazones (NO recibe multiplicador de nivel ni de vault)
      let hearts = prev.hearts;
      let scoreToSubtract = 0; // Para descontar puntos por Hacker
      let vaulCollectedCount = prev.vaulCollectedCount || 0;
      let vaulBonusToAdd = 0; // Bonus directo de vaul (NO debe pasar por multiplicador)
      let runeCompletionBonus = 0; // Bonus directo por completar tótem
      let levelShouldIncrease = false;
      let nextLevelTarget = currentLevel;
      let levelJustIncreased = false;
      let remainingCollectibles: Collectible[] = [];
      let vaultJustActivated = false; // Flag para saber si se activó un vault en este frame
      let vaultExpired = false; // Detectar si un vault expiró sin activarse
      let vaultEffectJustEnded = false; // Detectar si un efecto del vault acaba de terminar
      let heartCollected = false; // Detectar si un heart fue recogido
      let heartExpired = false; // Detectar si un heart expiró sin ser recogido
      let goatSkinCollected = false; // Detectar si se recogió la piel de GOAT
      // Variables para timing de spawns independientes
      let newLastMegaNodeSpawn = prev.lastMegaNodeSpawn;
      let newNextMegaNodeInterval = prev.nextMegaNodeInterval;
      let newLastHeartSpawn = prev.lastHeartSpawn;
      let newNextHeartInterval = prev.nextHeartInterval;
      let newLastVaulSpawn = prev.lastVaulSpawn;
      // Variables para efectos del vault
      let activeVaulEffect = prev.activeVaulEffect;
      let vaulEffectStartTime = prev.vaulEffectStartTime;
      let vaulEffectData = prev.vaulEffectData;
      let eliminateEnemiesDisplay = prev.eliminateEnemiesDisplay;

       // --- NEW: Fees y Hackers roban energía ---
       // Comprobar colisión entre obstáculos y Energy
       
       for (const obstacle of newObstacles) {
         if (gameOver) {
           break;
         }
         // Saltar hackers desterrados - no pueden robar energía
         if (obstacle.type === 'hacker' && obstacle.isBanished) {
             continue;
         }
         
         // Fees y Hackers pueden robar energía
         if (obstacle.type === 'hacker' || obstacle.type === 'fee') {
           // Radio de recolección (hackers tienen ventaja por nivel)
           const collectionRadius = obstacle.type === 'hacker' 
             ? obstacle.radius + (currentLevel - 1) * 5 // +5px por nivel para hackers
             : obstacle.radius; // Radio normal para fees
           
          // Solo quedarse con los coleccionables que NO colisionan con hacker/fee
          newCollectibles = newCollectibles.filter(collectible => {
            if (collectible.type === 'energy' || collectible.type === 'uki') {
               // Usar radio expandido para colisión
               const distance = Math.sqrt(
                 Math.pow(obstacle.x - collectible.x, 2) + 
                 Math.pow(obstacle.y - collectible.y, 2)
               );
               
               if (distance <= collectionRadius + collectible.radius) {
                 // TEMPORALMENTE DESHABILITADO: Explosiones cuando enemigos recogen energy
                 // Para reactivar en el futuro, descomentar las siguientes líneas:
                 /*
                 // NUEVO: Crear efecto visual según el tipo de obstacle
                 let explosionEffect: VisualEffect;
                if (obstacle.type === 'hacker') {
                   explosionEffect = createHackerExplosionEffect(collectible.x, collectible.y);
                 } else {
                   explosionEffect = createExplosionEffect(collectible.x, collectible.y);
                 }
                 newVisualEffects.push(explosionEffect);
                 */
                   
                  // NUEVO: Contar energy recogida por hacker (solo energy, no uki)
                  if (collectible.type === 'energy' && obstacle.type === 'hacker') {
                    obstacle.energyCollected = (obstacle.energyCollected || 0) + 1;
                    console.log(`[HACKER] ¡Ha robado energía! Energy recogidas: ${obstacle.energyCollected}/5 (Nivel ${currentLevel}, radio: ${collectionRadius}px) - DEBUG: Estado actual del hacker ID: ${obstacle.id}`);
                  }
                   
                   // NUEVO: Si recoge 5 energy, activar retroceso automático
                   if (obstacle.type === 'hacker' && (obstacle.energyCollected || 0) >= 5) {
                     console.log(`[HACKER] 🚀 ¡ESCAPE! ID: ${obstacle.id} - Ha recogido 5 energy! Iniciando retroceso automático hacia el borde...`);
                     
                     // NUEVO: Reproducir sonido especial cuando el hacker escapa por 5 energy
                     onPlaySound?.('hacker_escape');
                     
                     // NUEVO: Notificar al container para activar animación lateral
                     onHackerEscape?.();
                     
                     obstacle.isRetreating = true;
                     obstacle.retreatCollisionPosition = { x: obstacle.x, y: obstacle.y };
                     
                     // Calcular dirección hacia el borde más cercano
                     const distanceToLeft = obstacle.x;
                     const distanceToRight = prev.canvasSize.width - obstacle.x;
                     const distanceToTop = obstacle.y;
                     const distanceToBottom = prev.canvasSize.height - obstacle.y;
                     
                     const minDistance = Math.min(distanceToLeft, distanceToRight, distanceToTop, distanceToBottom);
                     
                     let escapeDirection: Vector2D;
                     if (minDistance === distanceToLeft) {
                       escapeDirection = { x: -1, y: 0 }; // Huir hacia la izquierda
                     } else if (minDistance === distanceToRight) {
                       escapeDirection = { x: 1, y: 0 }; // Huir hacia la derecha
                     } else if (minDistance === distanceToTop) {
                       escapeDirection = { x: 0, y: -1 }; // Huir hacia arriba
                     } else {
                       escapeDirection = { x: 0, y: 1 }; // Huir hacia abajo
                     }
                     
                     obstacle.retreatDirection = escapeDirection;
                     obstacle.retreatSpeed = 6.0; // Velocidad rápida de huida
                     obstacle.retreatTimer = -1; // Sin límite de tiempo, hasta que toque el borde
                     
                   }
                 
                 // ELIMINADO: No ejecutar callback de energía para enemigos para evitar sonido de coin.mp3
                 // if (onEnergyCollected) onEnergyCollected();
                 return false; // Eliminar este coleccionable
               }
             }
             return true; // Mantener este coleccionable
           });
         }
       }

       // Token vs Collectibles
       let checkpointBonus = 0;
       let timePenaltyAccumulator = 0;
       
       // Procesar cada collectible individualmente
      for (const collectible of newCollectibles) {
        if (gameOver) {
          break;
        }
        const isColliding = checkCollision(newToken, collectible);

        if (collectible.type === 'treasure') {
          if (treasureState.activeTreasureId !== collectible.id) {
            // Tesoro obsoleto, eliminarlo silenciosamente
            continue;
          }

          const createdAt = collectible.createdAt ?? treasureState.activeSpawnTime ?? now;
          const timeAlive = now - createdAt;
          const timeRemaining = TREASURE_LIFETIME_MS - timeAlive;
          collectible.isBlinking = timeRemaining <= TREASURE_BLINK_WARNING_MS && timeRemaining > 0;

          if (isColliding) {
            const currentIndex = treasureState.treasuresCollectedInBlock;
            const basePoints = TREASURE_BLOCK_BASE_POINTS[Math.min(currentIndex, TREASURE_BLOCK_BASE_POINTS.length - 1)];
            const multiplier = treasureState.successfulBlocks + 1;
            const treasurePoints = basePoints * multiplier;
            treasureCollectedThisFrame += 1;
            treasureBasePointsThisFrame += treasurePoints;
            // Los treasures NO reciben multiplicador de nivel ni de vault, se suman directamente
            // Reproducir sonido según el tesoro del bloque (1, 2 o 3)
            const treasureSoundMap: Record<number, 'treasure_collect_1' | 'treasure_collect_2' | '3bis'> = {
              0: 'treasure_collect_1',
              1: 'treasure_collect_2',
              2: '3bis'
            };
            onPlaySound?.(treasureSoundMap[currentIndex] || 'treasure_collect_1');
            treasureState.treasuresCollectedInBlock = currentIndex + 1;
            treasureState.activeTreasureId = null;
            treasureState.activeSpawnTime = null;

            if (treasureState.treasuresCollectedInBlock >= 3) {
              treasureState.successfulBlocks += 1;
              treasureState.treasuresCollectedInBlock = 0;
              treasureState.lastTreasurePosition = null; // Resetear posición al completar bloque
              treasureState.nextSpawnTime = now + getRandomFloat(
                TREASURE_NEXT_BLOCK_MIN_S * 1000,
                TREASURE_NEXT_BLOCK_MAX_S * 1000
              );
              console.log(`[TREASURE] ✅ Bloque completado. Siguiente bloque en ${(treasureState.nextSpawnTime - now) / 1000}s`);
            } else {
              treasureState.nextSpawnTime = now;
              console.log(`[TREASURE] 🎯 Tesoro ${currentIndex + 1} recogido. Próximo en ${treasureState.treasuresCollectedInBlock + 1}`);
            }

            continue;
          }
          continue;
        }

        // Lógica especial para vaul (sistema de barra de progreso acumulativa)
        if (collectible.type === 'vaul') {
           if (isColliding) {
             // Token está tocando el vaul
             if (!collectible.isBeingTouched) {
               // Nuevo contacto iniciado - NO resetear activationProgress aquí
               collectible.isBeingTouched = true;
               collectible.contactStartTime = now; // Usar tiempo pausable del juego
               // NUEVO: Pausar el timer de vida mientras se toca
               collectible.lifetimePaused = true;
               console.log(`[VAUL] Contacto iniciado - Timer pausado - Progreso actual: ${((collectible.activationProgress || 0) * 100).toFixed(1)}%`);
             }
             
             // CORREGIDO: Usar tiempo real del juego para progreso consistente entre dispositivos
             if (collectible.contactStartTime) {
               const contactDuration = now - collectible.contactStartTime;
               
               // Calcular el progreso total acumulado: tiempo previo + tiempo del contacto actual
               const totalContactTime = (collectible.timeOnTouch || 0) + contactDuration;
               collectible.activationProgress = Math.min(1, totalContactTime / VAUL_ACTIVATION_TIME_MS);
               
               // Log para debug del progreso
               if (contactDuration % 500 < 16) { // Log cada ~500ms
                 console.log(`[VAUL] Progreso: ${((collectible.activationProgress || 0) * 100).toFixed(1)}% (Tiempo total: ${(totalContactTime / 1000).toFixed(1)}s, Contacto actual: ${(contactDuration / 1000).toFixed(1)}s, Acumulado previo: ${((collectible.timeOnTouch || 0) / 1000).toFixed(1)}s)`);
               }
             }
             
             // Verificar si se ha completado la activación
             if ((collectible.activationProgress || 0) >= 1 && !collectible.isActivated) {
             // ¡Vault activado! Elegir efecto aleatorio
            const randomIndex = Math.floor(randomManager.random('vaul-effect') * VAUL_EFFECT_TYPES.length);
             const selectedEffect = VAUL_EFFECT_TYPES[randomIndex];
              
              const newVaulCount = (prev.vaulCollectedCount || 0) + 1;
              
              // Variables para el logging detallado
              let effectDetails = '';
              
              // Aplicar el efecto seleccionado y preparar detalles para logging
              if (selectedEffect === 'multiplier') {
                // Efecto 1: Multiplicador x5 fijo durante 10-15 segundos
                const multiplier = VAUL_MULTIPLIER; // x5 fijo
                const duration = Math.floor(randomManager.random('vaul-duration') * (VAUL_MULTIPLIER_DURATION_MAX_MS - VAUL_MULTIPLIER_DURATION_MIN_MS + 1)) + VAUL_MULTIPLIER_DURATION_MIN_MS;
                
                // CORREGIDO: Usar tiempo pausable para el multiplicador (igual que MegaNode y Purr)
                // Guardar datos del efecto usando tiempo pausable
                vaulEffectData = { multiplier, duration };
                vaulEffectStartTime = now; // Tiempo pausable cuando empezó
                activeVaulEffect = 'multiplier';
                
                effectDetails = `x${multiplier} durante ${(duration / 1000).toFixed(1)}s`;
                
              } else if (selectedEffect === 'double_collectibles') {
                // Efecto 2: Doble de energy (20) y uki (6) durante 10-15 segundos
                const duration = Math.floor(randomManager.random('vaul-duration') * (VAUL_DOUBLE_DURATION_MAX_MS - VAUL_DOUBLE_DURATION_MIN_MS + 1)) + VAUL_DOUBLE_DURATION_MIN_MS;
                
                // CORREGIDO: Usar tiempo pausable
                vaulEffectData = { duration };
                vaulEffectStartTime = now; // Tiempo pausable cuando empezó
                activeVaulEffect = 'double_collectibles';
                
                effectDetails = `durante ${(duration / 1000).toFixed(1)}s`;
                
              } else if (selectedEffect === 'energy_to_uki') {
                // Efecto 3: Energy se convierten en uki durante 10-15 segundos
                const duration = Math.floor(randomManager.random('vaul-duration') * (VAUL_ENERGY_TO_UKI_DURATION_MAX_MS - VAUL_ENERGY_TO_UKI_DURATION_MIN_MS + 1)) + VAUL_ENERGY_TO_UKI_DURATION_MIN_MS;
                
                // CORREGIDO: Usar tiempo pausable
                vaulEffectData = { duration };
                vaulEffectStartTime = now; // Tiempo pausable cuando empezó
                activeVaulEffect = 'energy_to_uki';
                
                effectDetails = `durante ${(duration / 1000).toFixed(1)}s`;
                
              } else if (selectedEffect === 'eliminate_enemies') {
                // Efecto 4: Eliminar 3-5 enemigos aleatorios
                const randomValue = randomManager.random('vaul-eliminate');
                const range = VAUL_ELIMINATE_ENEMIES_MAX - VAUL_ELIMINATE_ENEMIES_MIN + 1;
                const enemiesToEliminate = Math.floor(randomValue * range) + VAUL_ELIMINATE_ENEMIES_MIN;
                
                console.log(`[VAUL] 🎲 Cálculo aleatorio de enemigos:
                  - Random: ${randomValue.toFixed(4)}
                  - Rango (MAX-MIN+1): ${range}
                  - Cálculo: Math.floor(${randomValue.toFixed(4)} * ${range}) + ${VAUL_ELIMINATE_ENEMIES_MIN}
                  - Resultado: ${enemiesToEliminate} enemigos`);
                
                // Filtrar obstáculos que pueden ser eliminados
                const eliminableObstacles = newObstacles.filter(obs => !obs.isRetreating && !obs.banishTimer);
                const toEliminate = Math.min(enemiesToEliminate, eliminableObstacles.length);
                
                console.log(`[VAUL] Enemigos disponibles: ${eliminableObstacles.length}, a eliminar: ${toEliminate}`);
                
                // Seleccionar enemigos aleatorios
                const shuffled = [...eliminableObstacles].sort(() => randomManager.random('vaul-eliminate') - 0.5);
                const eliminated = shuffled.slice(0, toEliminate);
                
                // Eliminar los enemigos seleccionados
                newObstacles = newObstacles.filter(obs => !eliminated.includes(obs));
                
                effectDetails = `${toEliminate} enemigos eliminados`;
                
                // Guardar para mostrar en UI temporalmente (3 segundos)
                eliminateEnemiesDisplay = {
                  count: toEliminate,
                  timestamp: now // Usar tiempo pausable
                };
                
                // Este efecto es instantáneo, no necesita tracking de tiempo
                activeVaulEffect = null;
                vaulEffectStartTime = null;
                vaulEffectData = null;
              }
              
              // Logging consolidado con todos los detalles
              console.log(`╔═══════════════════════════════════════════════════╗`);
              console.log(`║   🎲 VAULT ACTIVADO 🎲                           ║`);
              console.log(`║   Efecto: ${selectedEffect.padEnd(39)}║`);
              console.log(`║   Detalles: ${effectDetails.padEnd(37)}║`);
              console.log(`║   Random Index: ${randomIndex} / ${VAUL_EFFECT_TYPES.length - 1}${' '.repeat(30)}║`);
              console.log(`╚═══════════════════════════════════════════════════╝`);
              
              onPlaySound?.('vaul_collect');
              
              // Crear efecto visual de activación del vault
              const vaultEffect = createVaultActivationEffect(collectible.x, collectible.y);
              newVisualEffects.push(vaultEffect);
              
              // Marcar el vault como activado para que se elimine
               collectible.isActivated = true;
               vaulCollectedCount = newVaulCount;
               vaultJustActivated = true;
               continue;
             }
           } else {
             // Token no está tocando el vaul - conservar progreso pero detener acumulación
             if (collectible.isBeingTouched) {
               // Acumular el tiempo del contacto actual al tiempo total
               if (collectible.contactStartTime) {
                 const currentContactDuration = now - collectible.contactStartTime;
                 collectible.timeOnTouch = (collectible.timeOnTouch || 0) + currentContactDuration;
               }
               
               console.log(`[VAUL] Contacto perdido - Progreso conservado: ${((collectible.activationProgress || 0) * 100).toFixed(1)}% (Tiempo acumulado: ${((collectible.timeOnTouch || 0) / 1000).toFixed(1)}s)`);
               collectible.isBeingTouched = false;
               collectible.contactStartTime = undefined;
               // NUEVO: Reiniciar timer de vida (darle otros 10 segundos COMPLETOS)
               collectible.lifetimePaused = false;
               collectible.createdAt = now; // Reiniciar completamente el timer usando tiempo pausable
               collectible.isBlinking = false;
               console.log(`[VAUL] Timer reiniciado - Nuevos 10 segundos de vida`);
               // IMPORTANTE: El progreso acumulado se mantiene en timeOnTouch
             }
           }
           // El vaul siempre se mantiene (no se consume hasta activarse)
           continue;
         }
         
         // Lógica normal para otros collectibles
         if (isColliding) {
         if (collectible.type === 'checkpoint') {
            let bonus = CHECKPOINT_TIME_BONUS_START - checkpointCountRef.current * CHECKPOINT_TIME_BONUS_STEP;
            if (bonus < CHECKPOINT_TIME_BONUS_MIN) bonus = CHECKPOINT_TIME_BONUS_MIN;
            checkpointBonus += bonus;
            checkpointCountRef.current++;
             
             // Añadir efecto visual similar al mega node (solo visual, sin funcionalidad de boost)
             console.log("Checkpoint collected! Visual effect activated.");
             newToken.glow = true;
             // Usar un temporizador de brillo (1 segundo) sin cambiar la velocidad
             newToken.glowTimer = 1000; // 1 segundo de brillo
             
            continue;
          }
          if (collectible.type === 'rune') {
            runeCollectedThisFrame += 1;
            runeState.runePickupCount += 1;
            const runePoints = RUNE_SCORE_INCREMENT * runeState.runePickupCount;
            runeBasePointsThisFrame += runePoints;
            scoreToAddWithoutVaultMultiplier += runePoints; // Runas NO reciben multiplicador del vault
            onPlaySound?.('rune_collect');

            // Programar la siguiente runa 10s después de recoger esta
            runeState.nextSpawnTime = now + RUNE_NEXT_SPAWN_MS;
            console.log(`[RUNE] Runa recogida! Siguiente runa en ${(RUNE_NEXT_SPAWN_MS / 1000)}s`);

            if (
              runeState.active &&
              collectible.runeType &&
              !runeState.collectedTypes.includes(collectible.runeType)
            ) {
              runeState.collectedTypes.push(collectible.runeType);
              runeState.slots = runeState.slots.map(slot =>
                slot.type === collectible.runeType ? { ...slot, collected: true } : slot
              );

              if (!levelShouldIncrease) {
                const allCollected = runeState.slots.every(slot => slot.collected);
                if (allCollected && currentLevel < MAX_LEVEL) {
                  levelShouldIncrease = true;
                  nextLevelTarget = Math.min(MAX_LEVEL, currentLevel + 1);
                  const safeRemainingTime = Math.max(0, remainingTime);
                  const completionBonus = Math.ceil(safeRemainingTime) * RUNE_SCORE_INCREMENT;
                  runeCompletionBonus += completionBonus;
                  runeCompletionBonusThisFrame += completionBonus;
                  runeState.active = false;
                  console.log(`[RUNE] Tótem completado en nivel ${currentLevel}. Bono: ${runeCompletionBonus} puntos`);
                }
              }
            }
            continue;
          }
         if (collectible.type === 'energy') {
           energyCollectedThisFrame += 1;
           energyValueSumThisFrame += collectible.value;
           onPlaySound?.('energy_collect');
           if (onEnergyCollected) onEnergyCollected();
         }
          if (collectible.type === 'uki') {
            ukiCollectedThisFrame += 1;
            ukiValueSumThisFrame += collectible.value;
            console.log("Uki collected! +5 points.");
            onPlaySound?.('purr_collect'); // Sonido Token 1.mp3
            if (onEnergyCollected) onEnergyCollected(); // Disparar mismo efecto visual que energy
          }
          if (collectible.type === 'heart') {
             heartCollected = true; // Marcar que se recogió un corazón
            heartsCollectedThisFrame += 1;
            if (hearts < prev.maxHearts) {
              hearts++;
              console.log(`[HEART] ❤️ Corazón recogido! +1 vida (${hearts}/${prev.maxHearts}). Reproduciendo life.mp3`);
              console.log(`[HEART] 🚨 Función onPlaySound disponible: ${onPlaySound ? 'SÍ' : 'NO'}`);
              onPlaySound?.('heart_collect');
              // NOTA: El contador de corazones con vida llena NO se resetea al recuperar vida
            } else {
              // Si ya tiene máximo de vidas, otorgar puntos progresivos
              // NOTA: Usamos el contador actual + 1 para calcular puntos, pero el contador real se incrementa en la línea 3840
              const heartCount = (prev.heartsCollectedWithFullLife || 0) + 1;
              const heartPoints = HEART_BONUS_POINTS_BASE * heartCount;
              heartScoreToAdd += heartPoints; // Hearts NO reciben multiplicador de nivel
              console.log(`[HEART] ❤️ Corazón #${heartCount} recogido con vida máxima (${prev.maxHearts})! +${heartPoints} puntos (${HEART_BONUS_POINTS_BASE} * ${heartCount})`);
              console.log(`[HEART] 🔍 DEBUG: Contador anterior: ${prev.heartsCollectedWithFullLife}, Contador temporal: ${heartCount}`);
              onPlaySound?.('heart_collect');
            }
             continue; // No añadir el heart a los restantes
           }
           if (collectible.type === 'purr') {
               console.log("Purr collected! Immunity activated.");
               // ✅ CORREGIDO: Usar tiempo de juego pausable para la inmunidad del purr
               newToken.immunityStartTime = now; // Tiempo de juego pausable (now = getGameTime())
               newToken.immunityTimer = PURR_IMMUNITY_DURATION_MS; // Duración total
               onPlaySound?.('purr_collect');
               continue;
           }
           if (collectible.type === 'goatSkin') {
               console.log("[GOAT] Piel GOAT recogida. Habilidad de eliminación activada.");
               newToken.goatEliminationStartTime = now;
               newToken.goatEliminationTimer = GOAT_ELIMINATION_DURATION_MS;
               // La inmunidad se activará después de que termine la eliminación
               newToken.goatImmunityStartTime = undefined;
               newToken.goatImmunityTimer = 0;
               
               // NUEVA LÓGICA: Al recoger piel de GOAT, resetear timer del Haku para que empiece a contar de nuevo
               goatSkinCollected = true;
               console.log("[GOAT] Resetear timer de Haku - empezará a contar desde ahora");
               
               onPlaySound?.('goat_collect');
               continue;
           }
           // Separar puntos según si reciben o no el multiplicador del vault
           if (collectible.type === 'energy' || collectible.type === 'uki') {
             scoreToAddWithVaultMultiplier += collectible.value; // Energy y Uki SÍ reciben multiplicador del vault
           } else {
             scoreToAddWithoutVaultMultiplier += collectible.value; // Resto NO recibe multiplicador del vault
           }
           if (collectible.type === 'megaNode') {
               console.log("Mega Node collected! Boost activated.");
               // ✅ CORREGIDO: Usar tiempo de juego pausable para el boost del mega_node
               newToken.boostStartTime = now; // Tiempo de juego pausable (now = getGameTime())
               newToken.boostTimer = MEGA_NODE_BOOST_DURATION_MS; // Duración total
           }
           if (collectible.type === 'energy'){
                 // MEJORADO: Crear energy de reemplazo con verificación de distancia, incluyendo obstáculos
                 const replacementEnergy = safeSpawnCollectible(
                   createEnergyCollectible, 
                   generateId(), 
                   prev.canvasSize.width, 
                   prev.canvasSize.height, 
                   // Evitar solapar con TODOS los existentes y en proceso (energy, uki, etc.)
                   [...remainingCollectibles, ...newCollectibles, newToken, ...newObstacles]
                 );
                 remainingCollectibles.push(replacementEnergy);
            }
            if (collectible.type === 'uki'){
                 // Crear uki de reemplazo con verificación de distancia, incluyendo obstáculos
                 const replacementUki = safeSpawnCollectible(
                   createUkiCollectible, 
                   generateId(), 
                   prev.canvasSize.width, 
                   prev.canvasSize.height, 
                   // Evitar solapar con TODOS los existentes y en proceso (energy, uki, etc.)
                   [...remainingCollectibles, ...newCollectibles, newToken, ...newObstacles]
                 );
                 remainingCollectibles.push(replacementUki);
            }
            // NOTA: La lógica de treasure ya se maneja arriba (líneas 2124-2167) con continue
            // para evitar procesamiento duplicado
        } 
      }

      if (levelShouldIncrease) {
        currentLevel = nextLevelTarget;
        levelJustIncreased = currentLevel > prev.level;
        console.log(`[RUNE] Avanzando al nivel ${currentLevel}`);
        runeState = createInitialRuneState(currentLevel);
        if (runeState.active) {
          runeState.lastSpawnTime = now;
          runeState.nextSpawnTime = now + RUNE_FIRST_SPAWN_MS;
        } else {
          runeState.slots = RUNE_TYPES.map(type => ({ type, collected: true }));
          runeState.collectedTypes = [...RUNE_TYPES];
          runeState.runePickupCount = 0;
          runeState.lastSpawnTime = null;
          runeState.nextSpawnTime = null;
        }
      }

       // Filtramos los collectibles basados en el tiempo de vida y colisión
                // Los Mega_node, Heart, Purr y Vaul desaparecen después de 10 segundos (COLLECTIBLE_LIFETIME_MS)
         remainingCollectibles = []; // Limpiamos la lista para evitar duplicación
         const currentTime = getGameTime();
         let megaNodeExpired = false; // Detectar si un megaNode expiró sin ser recogido
         for (const collectible of newCollectibles) {
           // Si el jugador ha recogido este coleccionable, no lo añadimos de nuevo
           if (checkCollision(newToken, collectible) && collectible.type !== 'vaul') {
            // Si es energía, spawneamos una nueva en otro lugar
            if (collectible.type === 'energy') {
               // MEJORADO: Crear energy de reemplazo con verificación de distancia, incluyendo obstáculos
               const replacementEnergy = safeSpawnCollectible(
                 createEnergyCollectible, 
                 generateId(), 
                 prev.canvasSize.width, 
                 prev.canvasSize.height, 
                // Evitar solapar con TODOS los existentes y en proceso (energy, uki, etc.)
                [...remainingCollectibles, ...newCollectibles, newToken, ...newObstacles]
               );
               remainingCollectibles.push(replacementEnergy);
             }
            // Si es uki, spawneamos una nueva en otro lugar
            else if (collectible.type === 'uki') {
               // Crear uki de reemplazo con verificación de distancia, incluyendo obstáculos
               const replacementUki = safeSpawnCollectible(
                 createUkiCollectible, 
                 generateId(), 
                 prev.canvasSize.width, 
                 prev.canvasSize.height, 
                // Evitar solapar con TODOS los existentes y en proceso (energy, uki, etc.)
               [...remainingCollectibles, ...newCollectibles, newToken, ...newObstacles]
              );
              remainingCollectibles.push(replacementUki);
            }
            // Los otros tipos no se añaden si fueron recogidos
            continue;
          }

          if (collectible.type === 'treasure') {
            if (treasureState.activeTreasureId !== collectible.id) {
              continue;
            }

            const createdAt = collectible.createdAt ?? treasureState.activeSpawnTime ?? currentTime;
            const timeAlive = currentTime - createdAt;
            if (timeAlive >= TREASURE_LIFETIME_MS) {
              continue;
            }
            const timeRemaining = TREASURE_LIFETIME_MS - timeAlive;
            collectible.isBlinking = timeRemaining <= TREASURE_BLINK_WARNING_MS && timeRemaining > 0;
            remainingCollectibles.push(collectible);
            continue;
          }

          // Comprobamos el tiempo de vida para Mega_node, Heart, Purr y Vaul
          if (collectible.type === 'megaNode' || collectible.type === 'heart' || collectible.type === 'purr' || collectible.type === 'vaul') {
             // Lógica especial para vaul que requiere tiempo de contacto para activarse
             if (collectible.type === 'vaul') {
               // Solo agregar si no ha sido activado
               if (collectible.isActivated) {
                 continue; // No añadir si ya fue activado
               }
               
               // NUEVA LÓGICA: Si el vault está siendo tocado, NO verificar tiempo de vida
               if (collectible.lifetimePaused) {
                 // Timer pausado - mantener sin verificar tiempo
                 collectible.isBlinking = false; // No parpadear mientras se toca
                 remainingCollectibles.push(collectible);
                 continue; // Saltar verificación de tiempo
               }
             }
             
            // Determinar el tiempo de vida según el tipo de coleccionable
            const isTreasure = (collectible.type as CollectibleType) === 'treasure';
            const isHeart = (collectible.type as CollectibleType) === 'heart';
            const lifetimeMs = isTreasure ? TREASURE_LIFETIME_MS : (isHeart ? HEART_LIFETIME_MS : COLLECTIBLE_LIFETIME_MS);
            const blinkWarningMs = isTreasure ? TREASURE_BLINK_WARNING_MS : (isHeart ? HEART_BLINK_WARNING_MS : COLLECTIBLE_BLINK_WARNING_MS);
             
             // Si tiene tiempo de creación y no ha pasado el tiempo límite
             if (collectible.createdAt && (currentTime - collectible.createdAt < lifetimeMs)) {
               // Calcular si debe parpadear (últimos 3 segundos)
               const timeAlive = currentTime - collectible.createdAt;
               const timeRemaining = lifetimeMs - timeAlive;
               collectible.isBlinking = timeRemaining <= blinkWarningMs;
               
               // Log específico para vault cuando empieza a parpadear
               if (collectible.type === 'vaul' && collectible.isBlinking && !collectible.lifetimePaused) {
                 console.log(`[VAUL] ¡Empezando a parpadear! Tiempo restante: ${(timeRemaining / 1000).toFixed(1)}s`);
               }
               
              // Log específico para treasure cuando empieza a parpadear
              if (isTreasure && collectible.isBlinking) {
                console.log(`[TREASURE] ¡Empezando a parpadear! Tiempo restante: ${(timeRemaining / 1000).toFixed(1)}s`);
              }
               
               remainingCollectibles.push(collectible);
             } else if (!collectible.createdAt) {
               // Si no tiene tiempo de creación (para compatibilidad con objetos existentes)
               // le asignamos uno ahora
               collectible.createdAt = currentTime;
               collectible.isBlinking = false; // Recién creado, no debe parpadear
               remainingCollectibles.push(collectible);
             } else {
               // Si ha expirado, no lo añadimos a los collectibles restantes
               if (collectible.type === 'megaNode') {
                 megaNodeExpired = true;
                 console.log('[MEGANODE] Haku expiró sin ser recogido');
               } else if (collectible.type === 'heart') {
                 heartExpired = true;
                 console.log('[HEART] Corazón expiró sin ser recogido');
               } else if (collectible.type === 'vaul') {
                 vaultExpired = true;
                 console.log('[VAUL] Vault expiró sin ser activado');
               }
             }
           } else {
             // Otros tipos de collectibles (energy, checkpoint) no tienen tiempo de vida
             remainingCollectibles.push(collectible);
           }
       }


       // Token vs Obstacles
       let collidedObstacle = false;
       
       // BUGFIX: Solo procesar colisiones durante 'playing', NO durante 'countdown'
       if (prev.status === 'playing') {
         const goatEliminateActive = (newToken.goatEliminationTimer || 0) > 0;
         const goatImmunityActive = (newToken.goatImmunityTimer || 0) > 0;
         for (const obstacle of newObstacles) {
            if (gameOver) {
                break;
            }
            // Saltar hackers desterrados o en retroceso - no pueden colisionar
            if (obstacle.type === 'hacker' && (obstacle.isBanished || obstacle.isRetreating)) {
                continue;
            }
             
            if (checkCollision(newToken, obstacle)) {
                if (obstacle.type === 'fee' && goatEliminateActive) {
                    obstaclesMarkedForRemoval.add(obstacle.id);
                    // Explosión amarilla cuando goat elimina fee
                    newVisualEffects.push(createExplosionEffect(obstacle.x, obstacle.y));
                    onPlaySound?.('auch');
                    console.log(`[GOAT] Fee eliminado por contacto (ID: ${obstacle.id})`);
                    continue;
                }
                
                if (obstacle.type === 'fee' && goatImmunityActive) {
                    const separation = 12;
                    const angleFromFee = Math.atan2(newToken.y - obstacle.y, newToken.x - obstacle.x);
                    newToken.x += Math.cos(angleFromFee) * separation;
                    newToken.y += Math.sin(angleFromFee) * separation;
                    newToken.x = clamp(newToken.x, newToken.radius, prev.canvasSize.width - newToken.radius);
                    newToken.y = clamp(newToken.y, newToken.radius, prev.canvasSize.height - newToken.radius);
                    console.log(`[GOAT] Inmunidad activa: Fee ${obstacle.id} no causa daño`);
                    continue;
                }

                // TEMPORALMENTE DESACTIVADO: Saltar colisiones con bugs
                if (obstacle.type === 'bug') {
                    console.log('[BUG] Colisión con bug ignorada - bugs desactivados temporalmente');
                    continue; // Saltar esta colisión
                }
                
                // NUEVA LÓGICA SIMPLIFICADA DE COLISIÓN - Reescrita para bugs
                const now = getGameTime();
                
                // Registrar cada colisión detectada para depuración con más detalle
                console.log(`[COLISIÓN] ¡Detectada con ${obstacle.type}! Token: (${newToken.x.toFixed(1)}, ${newToken.y.toFixed(1)}) - ${obstacle.type}: (${obstacle.x.toFixed(1)}, ${obstacle.y.toFixed(1)})`);
                
                // BUGS TEMPORALMENTE DESACTIVADOS - Ya no hay lógica de colisión con bugs
                 
                 // Control de invulnerabilidad para otros obstáculos
                 const timeSinceLastDamage = prev.lastDamageTime ? now - prev.lastDamageTime : Infinity;
                 console.log(`[DEBUG] Tiempo desde último daño: ${timeSinceLastDamage}ms (invulnerable si < ${TOKEN_DAMAGE_IMMUNITY_MS}ms)`);
                 
                 // El hacker ROBA 20% de las monedas del jugador
                 if (obstacle.type === 'hacker') {
                     // CORREGIDO: Sonido del hacker se reproduce SIEMPRE que toque al token
                     console.log(`[HACKER] 🎵 Reproduciendo voz de Trump al tocar TOKEN`);
                     onPlaySound?.('hacker_collision');
                     
                     // Verificar inmunidad de purr para hacker
                     if (newToken.immunityTimer > 0) {
                         console.log(`[HACKER] ¡Colisión con hacker pero inmune por purr! Inmunidad restante: ${newToken.immunityTimer}ms - No roba monedas.`);
                     } else if (timeSinceLastDamage >= TOKEN_DAMAGE_IMMUNITY_MS) { // Período de invulnerabilidad
                         const scoreToSteal = Math.floor(prev.score * 0.2); // 20% del score actual redondeado a entero
                         scoreToSubtract = scoreToSteal;
                         console.log(`[HACKER] ¡Colisión con hacker! Robó ${scoreToSteal} monedas (20% del score).`);
                         console.log(`[HACKER] 🚨 Función onPlaySound disponible: ${onPlaySound ? 'SÍ' : 'NO'}`);
                         
                         // Activar efecto de aura roja en el marcador de score
                         scoreStealEffect = {
                           active: true,
                           startTime: now
                         };
                         
                         // CORREGIDO: Hacker huye hacia los límites del grid
                         obstacle.isRetreating = true;
                         obstacle.retreatCollisionPosition = { x: obstacle.x, y: obstacle.y };
                         
                         // Calcular dirección hacia el borde más cercano
                         const distanceToLeft = obstacle.x;
                         const distanceToRight = prev.canvasSize.width - obstacle.x;
                         const distanceToTop = obstacle.y;
                         const distanceToBottom = prev.canvasSize.height - obstacle.y;
                         
                         const minDistance = Math.min(distanceToLeft, distanceToRight, distanceToTop, distanceToBottom);
                         
                         let escapeDirection: Vector2D;
                         if (minDistance === distanceToLeft) {
                           escapeDirection = { x: -1, y: 0 }; // Huir hacia la izquierda
                         } else if (minDistance === distanceToRight) {
                           escapeDirection = { x: 1, y: 0 }; // Huir hacia la derecha
                         } else if (minDistance === distanceToTop) {
                           escapeDirection = { x: 0, y: -1 }; // Huir hacia arriba
                         } else {
                           escapeDirection = { x: 0, y: 1 }; // Huir hacia abajo
                         }
                         
                         obstacle.retreatDirection = escapeDirection;
                         obstacle.retreatSpeed = 6.0; // Velocidad rápida de huida
                         obstacle.retreatTimer = -1; // Sin límite de tiempo, hasta que toque el borde
                         
                         console.log(`[HACKER] ¡Hacker huye hacia el borde! Dirección: (${escapeDirection.x}, ${escapeDirection.y})`);
                         
                         // Actualizar tiempo del último daño
                         lastDamageTime = now;
                         lastDamageSource = obstacle.type;
                     } else {
                         console.log(`[HACKER] ¡Colisión con hacker en invulnerabilidad! No roba monedas.`);
                     }
                 } else if (timeSinceLastDamage >= TOKEN_DAMAGE_IMMUNITY_MS) { // Período de invulnerabilidad para otros obstáculos
                     // Verificar inmunidad de purr para fee
                     if (obstacle.type === 'fee' && newToken.immunityTimer > 0) {
                         console.log(`[FEE] ¡Colisión con fee pero inmune por purr! Inmunidad restante: ${newToken.immunityTimer}ms - No hay daño.`);
                     } else {
                         // FEE CAUSA DAÑO - LOG DETALLADO para fees
                         if (obstacle.type === 'fee') {
                             console.log(`[FEE] ¡FEE CAUSA DAÑO! Invulnerabilidad OK (${timeSinceLastDamage}ms >= ${TOKEN_DAMAGE_IMMUNITY_MS}ms), Sin inmunidad purr (${newToken.immunityTimer || 0}ms)`);
                         }
                         
                         // Lógica de daño de vida - SOLO para fees y otros obstáculos (NO hacker)
                         hearts--;
                         console.log(`[CORAZONES] Quitado 1 corazón por ${obstacle.type.toUpperCase()}, quedan: ${hearts}`);
                         console.log(`[DEBUG HEARTS] Estado anterior: ${prev.hearts}, nueva variable local: ${hearts}`);
                         
                         // Verificar si el juego debe terminar inmediatamente
                        if (hearts <= 0) {
                            console.log(`[GAME OVER] ¡Sin corazones! Terminando juego inmediatamente.`);
                            hearts = 0;
                            gameOver = true;
                            gameOverReason = 'hearts';
                            collidedObstacle = true;
                            break;
                        }
                         
                         // Activar efecto visual de daño
                         if (onDamage) onDamage();
                         
                         // Actualizar tiempo del último daño y congelar al jugador
                         lastDamageTime = now;
                         lastDamageSource = obstacle.type;
                         tokenFrozenUntilRef.current = now + TOKEN_FREEZE_TIME_MS;
                         
                         // Penalizaciones específicas por tipo - FEES NO QUITAN TIEMPO
                         if (obstacle.type === 'fee') {
                             // Fee: Solo quita corazones, SIN penalización de tiempo ni puntos
                             console.log(`[FEE] Solo daño de corazón, sin penalización de tiempo`);
                             
                             // NUEVO: Rebote fuerte específico para fees cuando causan daño
                             // Calcular dirección del fee alejándose del token
                             const bounceAngle = Math.atan2(obstacle.y - newToken.y, obstacle.x - newToken.x);
                             const bounceSpeed = 3.0; // Velocidad fuerte de rebote
                             
                             // Hacer que el fee rebote en dirección opuesta al token
                             obstacle.velocity = {
                                 x: Math.cos(bounceAngle) * bounceSpeed,
                                 y: Math.sin(bounceAngle) * bounceSpeed
                             };
                             
                             // Aplicar separación fuerte inmediata
                             const strongSeparation = 25; // Separación más fuerte para fees
                             obstacle.x += Math.cos(bounceAngle) * strongSeparation;
                             obstacle.y += Math.sin(bounceAngle) * strongSeparation;
                             
                             // Mantener el fee dentro de los límites del canvas
                             obstacle.x = clamp(obstacle.x, obstacle.radius, prev.canvasSize.width - obstacle.radius);
                             obstacle.y = clamp(obstacle.y, obstacle.radius, prev.canvasSize.height - obstacle.radius);
                             
                             console.log(`[FEE] Rebote aplicado - nueva velocidad: (${obstacle.velocity.x.toFixed(2)}, ${obstacle.velocity.y.toFixed(2)})`);
                         }
                         else {
                             // Otros tipos (por si se añaden más, excluyendo hacker y fee)
                             const penalty = getCollisionPenaltySecondsForLevel(currentLevel);
                             timePenaltyAccumulator += penalty;
                             console.log(`[OTRO] Penalización de ${penalty}s`);
                         }
                     }
                 } else {
                     console.log(`[INVULNERABLE] Jugador en invulnerabilidad (${TOKEN_DAMAGE_IMMUNITY_MS - timeSinceLastDamage}ms restantes)`);
                 }
                 
                 // Siempre aplicar pushback aunque esté en invulnerabilidad
                 // Pushback más fuerte para fees para evitar colisiones consecutivas
                 let pushBack;
                 if (obstacle.type === 'hacker') {
                     pushBack = 5; // Pushback reducido para hacker (solo separación)
                 } else if (obstacle.type === 'fee') {
                     pushBack = 15; // Pushback más fuerte para fees
                 } else {
                     pushBack = 8; // Pushback normal para otros tipos
                 }
                 
                 const angle = Math.atan2(newToken.y - obstacle.y, newToken.x - obstacle.x);
                 newToken.x += Math.cos(angle) * pushBack;
                 newToken.y += Math.sin(angle) * pushBack;
                 newToken.x = clamp(newToken.x, newToken.radius, prev.canvasSize.width - newToken.radius);
                 newToken.y = clamp(newToken.y, newToken.radius, prev.canvasSize.height - newToken.radius);
                 
                collidedObstacle = true;
                break; // Solo manejar una colisión por frame
            }
        }
        if (!collidedObstacle && rays.length > 0) {
          for (const ray of rays) {
            if (ray.phase !== 'active') {
              continue;
            }

            if (isTokenCollidingWithRay(newToken, ray)) {
              const timeSinceLastDamage = lastDamageTime ? now - lastDamageTime : Infinity;

              if (timeSinceLastDamage >= TOKEN_DAMAGE_IMMUNITY_MS) {
                hearts--;
                console.log(`[RAY] Impacto en rayo ${ray.orientation} (${ray.x.toFixed(1)}, ${ray.y.toFixed(1)}) - corazones restantes: ${hearts}`);

                if (onDamage) onDamage();
                lastDamageTime = now;
                lastDamageSource = 'ray';
                tokenFrozenUntilRef.current = now + TOKEN_FREEZE_TIME_MS;

                if (ray.orientation === 'vertical') {
                  const rayLeft = ray.x;
                  const rayRight = ray.x + ray.width;
                  const rayCenter = (rayLeft + rayRight) / 2;
                  if (newToken.x <= rayCenter) {
                    newToken.x = rayLeft - newToken.radius;
                  } else {
                    newToken.x = rayRight + newToken.radius;
                  }
                  newToken.x = clamp(newToken.x, newToken.radius, prev.canvasSize.width - newToken.radius);
                } else {
                  const rayTop = ray.y;
                  const rayBottom = ray.y + ray.height;
                  const rayCenter = (rayTop + rayBottom) / 2;
                  if (newToken.y <= rayCenter) {
                    newToken.y = rayTop - newToken.radius;
                  } else {
                    newToken.y = rayBottom + newToken.radius;
                  }
                  newToken.y = clamp(newToken.y, newToken.radius, prev.canvasSize.height - newToken.radius);
                }

                if (hearts <= 0) {
                  hearts = 0;
                  gameOver = true;
                  gameOverReason = 'hearts';
                  collidedObstacle = true;
                  break;
                }
              } else {
                console.log('[RAY] Impacto durante invulnerabilidad, sin pérdida de corazón');
              }

              collidedObstacle = true;
              break;
            }
          }
        }
      } // Cerrar el bloque if para las colisiones durante 'playing'

      // Game over flags tras colisiones y tiempo
      if (hearts <= 0 && !gameOver) {
        hearts = 0;
        gameOver = true;
        gameOverReason = 'hearts';
      }

      if (!gameOver && remainingTime <= 0) {
        remainingTime = 0;
        gameOver = true;
        gameOverReason = 'time';
      }

      // --- Verificar y aplicar efectos activos del vault ---
      // CORREGIDO: Usar tiempo pausable para verificar expiración (igual que MegaNode y Purr)
      let vaulEffectTimeRemaining = 0;
      
      if (activeVaulEffect && vaulEffectStartTime && vaulEffectData?.duration) {
        const pausableTimeElapsed = now - vaulEffectStartTime;
        const timeRemaining = vaulEffectData.duration - pausableTimeElapsed;
        
        if (timeRemaining <= 0) {
          console.log(`[VAUL] Efecto ${activeVaulEffect} ha expirado (tiempo pausable)`);
          vaultEffectJustEnded = true; // Marcar que el efecto terminó
          activeVaulEffect = null;
          vaulEffectStartTime = null;
          vaulEffectData = null;
          vaulEffectTimeRemaining = 0;
        } else {
          // Actualizar tiempo restante en segundos para la UI
          vaulEffectTimeRemaining = Math.ceil(timeRemaining / 1000);
          
          // Log cuando cambia el tiempo restante
          if (vaulEffectTimeRemaining !== prev.vaulEffectTimeRemaining) {
            console.log(`[VAUL] Efecto ${activeVaulEffect} - ${vaulEffectTimeRemaining}s restantes`);
          }
        }
      }
      
      // Verificar si el display de enemigos eliminados debe ocultarse (después de 3 segundos)
      if (eliminateEnemiesDisplay && eliminateEnemiesDisplay.timestamp) {
        const displayDuration = 3000; // 3 segundos en pantalla
        const displayElapsed = now - eliminateEnemiesDisplay.timestamp;
        
        if (displayElapsed >= displayDuration) {
          console.log(`[VAUL] Ocultando display de enemigos eliminados`);
          eliminateEnemiesDisplay = null;
        }
      }

      // --- Aparición de energía (respawn) ---
      let maxEnergy = getMaxEnergyForLevel(currentLevel);
      let maxUki = MAX_UKI_POINTS;
      const energyToUkiJustActivated = activeVaulEffect === 'energy_to_uki' && prev.activeVaulEffect !== 'energy_to_uki';
      const energyToUkiJustEnded = prev.activeVaulEffect === 'energy_to_uki' && activeVaulEffect !== 'energy_to_uki';
      
      // Efecto 2: Doble de collectibles
      if (activeVaulEffect === 'double_collectibles') {
        maxEnergy = VAUL_DOUBLE_ENERGY_COUNT; // 20 en vez de 10
        maxUki = VAUL_DOUBLE_UKI_COUNT; // 6 en vez de 3
      }
      
      // Restaurar los energy cuando termina el efecto 3
      if (energyToUkiJustEnded) {
        // Obtener TODOS los uki en pantalla (tanto convertidos como originales)
        const allUkis = remainingCollectibles.filter(c => c.type === 'uki');
        const totalUkis = allUkis.length;
        
        if (totalUkis > 0) {
          // Seleccionar aleatoriamente 3 uki para mantener como uki
          const ukisToKeep = Math.min(3, totalUkis);
          const shuffledUkis = [...allUkis].sort(() => randomManager.random('uki-respawn') - 0.5);
          const ukisToKeepList = shuffledUkis.slice(0, ukisToKeep);
          const ukiIdsToKeep = new Set(ukisToKeepList.map(u => u.id));
          
          let convertedToEnergyCount = 0;
          remainingCollectibles = remainingCollectibles.map(collectible => {
            if (collectible.type === 'uki' && !ukiIdsToKeep.has(collectible.id)) {
              // Convertir este uki a energy (manteniendo posición)
              convertedToEnergyCount++;
              const { convertedFromEnergy: _flag, ...rest } = collectible;
              return {
                ...rest,
                type: 'energy',
                radius: ENERGY_POINT_RADIUS,
                color: ENERGY_POINT_COLOR,
                value: ENERGY_POINT_VALUE,
              };
            }
            // Mantener como uki (tanto originales como los 3 seleccionados)
            return collectible;
          });
          
          console.log(`[VAUL] Efecto energy_to_uki terminado: ${convertedToEnergyCount} uki → energy, ${ukisToKeep} uki mantenidos (de ${totalUkis} total)`);
          // CORREGIDO: Ajustar maxEnergy temporalmente para evitar eliminación/creación de energy
          maxEnergy = convertedToEnergyCount;
        }
      }

      // Efecto 3: Energy se convierten en uki
      if (activeVaulEffect === 'energy_to_uki') {
        let conversions = 0;
        remainingCollectibles = remainingCollectibles.map(collectible => {
          if (collectible.type !== 'energy') {
            return collectible;
          }
          conversions++;
          return {
            ...collectible,
            type: 'uki',
            radius: UKI_RADIUS,
            color: UKI_COLOR,
            value: UKI_VALUE,
            convertedFromEnergy: true,
          };
        });
        if (conversions > 0 && energyToUkiJustActivated) {
          console.log(`[VAUL] Convertidas ${conversions} energy a uki manteniendo posiciones originales`);
        }
        // No spawear energy adicionales, solo uki
        maxEnergy = 0;
        maxUki = MAX_UKI_POINTS + getMaxEnergyForLevel(currentLevel); // Combinar ambos (13 total)
      }
      
      let energyCount = remainingCollectibles.filter(c => c.type === 'energy').length;
      let ukiCount = remainingCollectibles.filter(c => c.type === 'uki').length;
      
      // Si hay más collectibles de los necesarios (por ejemplo, cuando un efecto expira), eliminar el exceso aleatoriamente
      if (energyCount > maxEnergy) {
        const energyCollectibles = remainingCollectibles.filter(c => c.type === 'energy');
        const toRemove = energyCount - maxEnergy;
        const shuffled = [...energyCollectibles].sort(() => randomManager.random('energy-trim') - 0.5);
        const toRemoveIds = shuffled.slice(0, toRemove).map(c => c.id);
        remainingCollectibles = remainingCollectibles.filter(c => !toRemoveIds.includes(c.id));
        console.log(`[VAUL] Eliminando ${toRemove} energy sobrantes (tenía ${energyCount}, máximo ${maxEnergy})`);
        energyCount = maxEnergy;
      }
      
      if (ukiCount > maxUki) {
        const ukiCollectibles = remainingCollectibles.filter(c => c.type === 'uki');
        const toRemove = ukiCount - maxUki;
        const shuffled = [...ukiCollectibles].sort(() => randomManager.random('uki-trim') - 0.5);
        const toRemoveIds = shuffled.slice(0, toRemove).map(c => c.id);
        remainingCollectibles = remainingCollectibles.filter(c => !toRemoveIds.includes(c.id));
        console.log(`[VAUL] Eliminando ${toRemove} uki sobrantes (tenía ${ukiCount}, máximo ${maxUki})`);
        ukiCount = maxUki;
      }
      
      // Mantener la cantidad correcta de energy en pantalla
      while (energyCount < maxEnergy) {
        // MEJORADO: Crear energy con verificación de distancia para evitar solapamiento, incluyendo obstáculos
        const newEnergy = safeSpawnCollectible(
          createEnergyCollectible, 
          generateId(), 
          prev.canvasSize.width, 
          prev.canvasSize.height, 
          // Evitar solapar con TODA la lista actual y en proceso (incluye ukis)
          [...remainingCollectibles, ...newCollectibles, newToken, ...newObstacles]
        );
        remainingCollectibles.push(newEnergy);
        // Actualizar el contador para el siguiente ciclo
        energyCount = remainingCollectibles.filter(c => c.type === 'energy').length;
      }

      // --- Aparición de uki (respawn) ---
      // Mantener la cantidad correcta de uki en pantalla
      while (ukiCount < maxUki) {
        // Crear uki con verificación de distancia para evitar solapamiento
        const newUki = safeSpawnCollectible(
          createUkiCollectible, 
          generateId(), 
          prev.canvasSize.width, 
          prev.canvasSize.height, 
          // Evitar solapar con TODA la lista actual y en proceso (incluye energy)
          [...remainingCollectibles, ...newCollectibles, newToken, ...newObstacles]
        );
        remainingCollectibles.push(newUki);
        // Actualizar el contador para el siguiente ciclo
        ukiCount = remainingCollectibles.filter(c => c.type === 'uki').length;
      }

      // --- Lógica del multiplicador de vaul ---
      let currentMultiplier = 1;
      let multiplierTimeRemaining = 0;
      
      // CORREGIDO: Usar tiempo pausable para el multiplicador (igual que MegaNode y Purr)
      if (activeVaulEffect === 'multiplier' && vaulEffectStartTime && vaulEffectData?.multiplier && vaulEffectData?.duration) {
        const pausableTimeElapsed = now - vaulEffectStartTime;
        const timeRemaining = vaulEffectData.duration - pausableTimeElapsed;
        
        if (timeRemaining > 0) {
          // El multiplicador está activo
          currentMultiplier = vaulEffectData.multiplier;
          multiplierTimeRemaining = Math.ceil(timeRemaining / 1000);
          
          // Log solo cuando cambia el valor o se activa
          if (vaultJustActivated || multiplierTimeRemaining !== prev.multiplierTimeRemaining) {
            console.log(`[VAUL] Multiplicador ACTIVO: x${currentMultiplier} - ${multiplierTimeRemaining}s restantes (tiempo pausable)`);
          }
        }
      }
      
      // Calcular score total antes de multiplicadores
      scoreToAdd = scoreToAddWithVaultMultiplier + scoreToAddWithoutVaultMultiplier;
      
      if (levelMultiplier !== 1 && scoreToAdd > 0) {
        console.log(`[LEVEL] Multiplicador de nivel (${prev.level}) x${levelMultiplier} - Energy/Uki: ${scoreToAddWithVaultMultiplier}, Otros: ${scoreToAddWithoutVaultMultiplier}`);
      }

      // Aplicar multiplicadores:
      // - Energy/Uki: reciben multiplicador de nivel Y multiplicador del vault
      // - Corazones: YA tienen multiplicador de nivel aplicado, NO aplicar de nuevo
      // - Otros coleccionables: solo reciben multiplicador de nivel
      // - Treasures: NO reciben ningún multiplicador, se suman directamente
      const finalScoreEnergyUki = scoreToAddWithVaultMultiplier * levelMultiplier * currentMultiplier;
      const finalScoreOthers = scoreToAddWithoutVaultMultiplier * levelMultiplier;
      const finalScoreTreasures = treasureBasePointsThisFrame; // Sin multiplicadores
      const finalScoreToAdd = finalScoreEnergyUki + finalScoreOthers + finalScoreTreasures;
      
      // Log para depuración de multiplicador del vaul
      if (currentMultiplier > 1 && scoreToAddWithVaultMultiplier > 0) {
        console.log(`[VAUL MULTIPLIER] x${currentMultiplier} aplicado SOLO a Energy/Uki: ${scoreToAddWithVaultMultiplier} -> ${finalScoreEnergyUki} pts (nivel x${levelMultiplier})`);
        if (scoreToAddWithoutVaultMultiplier > 0) {
          console.log(`[VAUL MULTIPLIER] Otros coleccionables SIN multiplicador vault: ${scoreToAddWithoutVaultMultiplier} -> ${finalScoreOthers} pts (solo nivel x${levelMultiplier})`);
        }
      }

      const heartPointsThisFrame = heartScoreToAdd;
      const treasurePointsThisFrame = treasureBasePointsThisFrame; // Treasures NO reciben multiplicador de nivel
      const runePointsWithLevel = runeBasePointsThisFrame * levelMultiplier;
      const runePointsTotalThisFrame = runePointsWithLevel + runeCompletionBonusThisFrame;
      const multiplierIsX5 = currentMultiplier >= VAUL_MULTIPLIER;
      const energyPointsThisFrame = energyValueSumThisFrame * levelMultiplier * currentMultiplier;
      const ukiPointsThisFrame = ukiValueSumThisFrame * levelMultiplier * currentMultiplier;

      if (currentLevelStats) {
        if (currentLevelStats.startTime === null) {
          currentLevelStats.startTime = currentLevelStartTime ?? now;
        }
        if (currentLevelStats.startTime !== null) {
          currentLevelStats.durationMs = Math.max(0, now - currentLevelStats.startTime);
        }

        if (multiplierIsX5) {
          currentLevelStats.counts.gemsX5 += energyCollectedThisFrame;
          currentLevelStats.points.gemsX5 += energyPointsThisFrame;
          currentLevelStats.counts.ukisX5 += ukiCollectedThisFrame;
          currentLevelStats.points.ukisX5 += ukiPointsThisFrame;
        } else {
          currentLevelStats.counts.gems += energyCollectedThisFrame;
          currentLevelStats.points.gems += energyPointsThisFrame;
          currentLevelStats.counts.ukis += ukiCollectedThisFrame;
          currentLevelStats.points.ukis += ukiPointsThisFrame;
        }

        currentLevelStats.counts.treasures += treasureCollectedThisFrame;
        currentLevelStats.points.treasures += treasurePointsThisFrame;
        currentLevelStats.counts.hearts += heartsCollectedThisFrame;
        currentLevelStats.points.hearts += heartPointsThisFrame;
        currentLevelStats.counts.runes += runeCollectedThisFrame;
        currentLevelStats.points.runes += runePointsWithLevel; // Solo puntos de runas individuales
        currentLevelStats.counts.levelCompletionBonus += runeCompletionBonusThisFrame > 0 ? 1 : 0; // Contar completaciones
        currentLevelStats.points.levelCompletionBonus += runeCompletionBonusThisFrame; // Bonus por completar tótem
      }

      if (levelJustIncreased) {
        if (currentLevelStats) {
          if (currentLevelStats.startTime === null) {
            currentLevelStats.startTime = currentLevelStartTime ?? now;
          }
          if (currentLevelStats.startTime !== null) {
            currentLevelStats.endTime = now;
            currentLevelStats.durationMs = Math.max(0, now - currentLevelStats.startTime);
          }
        }
        const newEntry = createEmptyLevelStatsEntry(currentLevel, now);
        levelStats = [...levelStats, newEntry];
        currentLevelStatsIndex = levelStats.length - 1;
        currentLevelStats = newEntry;
        currentLevelStartTime = now;
      }

      if (gameOver && currentLevelStatsIndex >= 0) {
        const entry = levelStats[currentLevelStatsIndex];
        if (entry.startTime === null) {
          entry.startTime = currentLevelStartTime ?? now;
        }
        entry.endTime = now;
        if (entry.startTime !== null) {
          entry.durationMs = Math.max(0, now - entry.startTime);
        }
      }

       if (obstaclesMarkedForRemoval.size > 0) {
       newObstacles = newObstacles.filter(obs => !obstaclesMarkedForRemoval.has(obs.id));
      }

      if (levelJustIncreased) {
        const goatOnField = remainingCollectibles.some(c => c.type === 'goatSkin');
        if (!goatOnField) {
          // CORREGIDO: Incluir token en la lista de objetos a evitar
          const goatCollectible = safeSpawnCollectible(
            createGoatSkinCollectible,
            generateId(),
            prev.canvasSize.width,
            prev.canvasSize.height,
            [...remainingCollectibles, prev.token, ...newObstacles],
            currentTime
          );
          remainingCollectibles.push(goatCollectible);
          console.log(`[GOAT] Piel GOAT generada para nivel ${currentLevel}`);
          
          // NUEVA LÓGICA: Si cuando aparece la piel de GOAT hay un Haku en pantalla o el token tiene poder del Haku
          const hasMegaNodeOnField = remainingCollectibles.some(c => c.type === 'megaNode');
          const tokenHasHakuPower = newToken.boostTimer > 0;
          
          if (hasMegaNodeOnField || tokenHasHakuPower) {
            // Pausar el spawn del Haku estableciendo lastMegaNodeSpawn a null
            // Esto evita que cuente el tiempo hasta que se recoja la piel de GOAT
            newLastMegaNodeSpawn = null;
            console.log(`[GOAT] Piel GOAT apareció con Haku activo (en pantalla: ${hasMegaNodeOnField}, poder activo: ${tokenHasHakuPower}). Timer del Haku pausado hasta que se recoja la piel.`);
          }
        } else {
          console.log('[GOAT] Nivel aumentado sin generar nueva piel (ya existe una en el mapa)');
        }
      }

       // --- Spawning Logic ---
       // Spawn new obstacles if level increased
       let obstaclesToSpawn = [...newObstacles];
       
       // NOTA: Sistema de spawn de obstáculos movido a aparición progresiva temporal (cada 10s)
       // La lógica antigua de level-up está comentada ya que ahora usamos el patrón temporal
       /*
       if (currentLevel > prev.level) {
           console.log(`Level Up: ${prev.level} -> ${currentLevel} (Tiempo transcurrido: ${(gameTimeElapsed).toFixed(1)}s)`);
           
           // Al subir de nivel, reemplazar todos los obstáculos con la cantidad correcta
           // para el nuevo nivel en lugar de solo añadir más
           
           // Primero calcular cuántos obstáculos de cada tipo necesitamos
           const bugsNeeded = getObstacleCountByTypeAndLevel(currentLevel, 'bug');
           const feesNeeded = getObstacleCountByTypeAndLevel(currentLevel, 'fee');
           const hackersNeeded = getObstacleCountByTypeAndLevel(currentLevel, 'hacker');
           
           // Contar cuántos de cada tipo tenemos actualmente
           const currentBugs = obstaclesToSpawn.filter(o => o.type === 'bug').length;
           const currentFees = obstaclesToSpawn.filter(o => o.type === 'fee').length;
           const currentHackers = obstaclesToSpawn.filter(o => o.type === 'hacker').length;
           
           // Calcular cuántos de cada tipo necesitamos añadir
           const bugsToAdd = Math.max(0, bugsNeeded - currentBugs);
           const feesToAdd = Math.max(0, feesNeeded - currentFees);
           const hackersToAdd = Math.max(0, hackersNeeded - currentHackers);
           
           console.log(`Nivel ${currentLevel}: Añadiendo ${bugsToAdd} bugs, ${feesToAdd} fees, y ${hackersToAdd} hackers`);
           
           // 1. Aumentar la velocidad de los fees existentes manteniendo variaciones aleatorias
           obstaclesToSpawn = obstaclesToSpawn.map(obs => {
               if (obs.type === 'fee') {
                   // Asignar nueva velocidad aleatoria para el nuevo nivel
                   const newRandomSpeed = getRandomFeeSpeed(currentLevel);
                   // Normalizar el vector de velocidad y aplicar la nueva velocidad aleatoria
                   const currentVelocity = obs.velocity || { x: getRandomFloat(-1, 1), y: getRandomFloat(-1, 1) };
                   const magnitude = Math.sqrt(currentVelocity.x * currentVelocity.x + currentVelocity.y * currentVelocity.y);
                   if (magnitude > 0) {
                       const normalizedX = currentVelocity.x / magnitude;
                       const normalizedY = currentVelocity.y / magnitude;
                       obs.velocity = {
                           x: normalizedX * newRandomSpeed,
                           y: normalizedY * newRandomSpeed
                       };
                   } else {
                       obs.velocity = {
                           x: (randomManager.random('fee-levelup') > 0.5 ? 1 : -1) * newRandomSpeed * 0.7,
                           y: (randomManager.random('fee-levelup') > 0.5 ? 1 : -1) * newRandomSpeed * 0.7
                       };
                   }
                   console.log(`[FEE] Fee existente actualizado con nueva velocidad aleatoria: ${newRandomSpeed.toFixed(2)}`);
               }
               return obs;
           });
           
           // 2. Añadir los nuevos bugs
           for (let i = 0; i < bugsToAdd; i++) {
               const bug = createStrategicBug(generateId(), prev.canvasSize.width, prev.canvasSize.height, [...prev.obstacles, ...addBugsForLevelUp(currentLevel, prev.canvasSize.width, prev.canvasSize.height, prev.obstacles, prev.token)], currentLevel);
               if (distanceBetweenPoints(bug, prev.token) >= TOKEN_RADIUS * 10) {
                   obstaclesToSpawn.push(bug);
               } else {
                   // Si está muy cerca del token, intentar de nuevo
                   i--;
               }
           }
           
           // 3. Añadir los nuevos fees con velocidades aleatorias
           for (let i = 0; i < feesToAdd; i++) {
               let fee: Obstacle;
               let attempts = 0;
               do {
                   fee = createObstacle(generateId(), 'fee', prev.canvasSize.width, prev.canvasSize.height);
                   // Asignar velocidad aleatoria única para cada nuevo fee
                   if (fee.velocity) {
                       const randomFeeSpeed = getRandomFeeSpeed(currentLevel);
                       const magnitude = Math.sqrt(fee.velocity.x * fee.velocity.x + fee.velocity.y * fee.velocity.y);
                       if (magnitude > 0) {
                           const normalizedX = fee.velocity.x / magnitude;
                           const normalizedY = fee.velocity.y / magnitude;
                           fee.velocity = {
                               x: normalizedX * randomFeeSpeed,
                               y: normalizedY * randomFeeSpeed
                           };
                       } else {
                           fee.velocity = {
                               x: (randomManager.random('fee-levelup') > 0.5 ? 1 : -1) * randomFeeSpeed * 0.7,
                               y: (randomManager.random('fee-levelup') > 0.5 ? 1 : -1) * randomFeeSpeed * 0.7
                           };
                       }
                       console.log(`[FEE] Nuevo fee añadido en level-up con velocidad: ${randomFeeSpeed.toFixed(2)}`);
                   }
                   attempts++;
               } while (distanceBetweenPoints(fee, prev.token) < TOKEN_RADIUS * 10 && attempts < 20);
               
               if (distanceBetweenPoints(fee, prev.token) >= TOKEN_RADIUS * 8) {
                   obstaclesToSpawn.push(fee);
               }
           }
           
           // 4. Añadir los nuevos hackers
           for (let i = 0; i < hackersToAdd; i++) {
               const hacker = createSmartHacker(generateId(), prev.canvasSize.width, prev.canvasSize.height, prev.token, currentLevel);
               if (distanceBetweenPoints(hacker, prev.token) >= TOKEN_RADIUS * 10) {
                   obstaclesToSpawn.push(hacker);
               }
           }
       }
       */

        // --- SISTEMA DE APARICIÓN PROGRESIVA DE ASSETS NEGATIVOS ---
        // En lugar de spawn basado en niveles, usar patrón temporal cada 10s
        let newNegativeSpawnCycle = prev.negativeSpawnCycle;
        let newLastNegativeSpawnTime = prev.lastNegativeSpawnTime;
        let newHackerSpawned = prev.hackerSpawned;
        
        // Verificar si es tiempo de hacer spawn progresivo
        if (shouldSpawnNegativeAssets(currentTime, newLastNegativeSpawnTime, prev.gameStartTime)) {
          // HACKER TEMPORALMENTE DESACTIVADO - No verificar existencia de hacker
          // const existingHacker = obstaclesToSpawn.find(obs => obs.type === 'hacker');
          // const hackerExists = existingHacker !== undefined || newHackerSpawned;
          
          // Obtener el patrón de spawn para el ciclo actual (hackerExists siempre false)
          const spawnPattern = getNegativeSpawnPattern(newNegativeSpawnCycle, false);
          
          // Crear los obstáculos según el patrón
          const newObstaclesFromPattern = createObstaclesByPattern(
            spawnPattern,
            prev.canvasSize.width,
            prev.canvasSize.height,
            obstaclesToSpawn,
            newToken,
            currentLevel,
            remainingCollectibles
          );
          
          // Añadir los nuevos obstáculos
          obstaclesToSpawn.push(...newObstaclesFromPattern);
          
          // Actualizar el tracking
          newLastNegativeSpawnTime = currentTime;
          // HACKER TEMPORALMENTE DESACTIVADO - No actualizar hackerSpawned
          // if (spawnPattern.type === 'hacker') {
          //   newHackerSpawned = true;
          // }
          
          // Log detallado del spawn
          const timeFromStart = prev.gameStartTime ? (currentTime - prev.gameStartTime) / 1000 : 0;
          console.log(`[SPAWN PROGRESIVO] Ciclo ${newNegativeSpawnCycle}: ${spawnPattern.count}x ${spawnPattern.type}(s) - Tiempo: ${timeFromStart.toFixed(1)}s - Total obstáculos: ${obstaclesToSpawn.length}`);
          
          // Avanzar al siguiente ciclo
          newNegativeSpawnCycle++;
        }

        // --- NUEVO SISTEMA DE TIMING INDEPENDIENTE CON INTERVALOS ALEATORIOS ---
        // (Variables ya declaradas al inicio del bloque)
        
        // Si el boost acaba de terminar, actualizar el timestamp para el próximo spawn
        if (boostJustEnded) {
          newLastMegaNodeSpawn = currentTime;
          newNextMegaNodeInterval = getRandomInterval(MEGA_NODE_SPAWN_INTERVAL_MIN_MS, MEGA_NODE_SPAWN_INTERVAL_MAX_MS);
          console.log(`[MEGANODE] Boost terminado. Próximo Haku en ${newNextMegaNodeInterval/1000}s (aleatorio)`);
        }
        
        // Si un megaNode expiró sin ser recogido, actualizar el timestamp para el próximo spawn
        if (megaNodeExpired) {
          newLastMegaNodeSpawn = currentTime;
          newNextMegaNodeInterval = getRandomInterval(MEGA_NODE_SPAWN_INTERVAL_MIN_MS, MEGA_NODE_SPAWN_INTERVAL_MAX_MS);
          console.log(`[MEGANODE] Haku expiró. Próximo Haku en ${newNextMegaNodeInterval/1000}s (aleatorio)`);
        }
        
        // NUEVA LÓGICA: Si se recogió la piel de GOAT, resetear timer del Haku
        if (goatSkinCollected) {
          newLastMegaNodeSpawn = currentTime;
          newNextMegaNodeInterval = getRandomInterval(MEGA_NODE_SPAWN_INTERVAL_MIN_MS, MEGA_NODE_SPAWN_INTERVAL_MAX_MS);
          console.log(`[MEGANODE] Piel GOAT recogida. Próximo Haku en ${newNextMegaNodeInterval/1000}s (aleatorio)`);
        }
        
        // Si un corazón fue recogido o expiró, actualizar el timestamp para el próximo spawn
        if (heartCollected || heartExpired) {
          newLastHeartSpawn = currentTime;
          newNextHeartInterval = getRandomInterval(HEART_SPAWN_INTERVAL_MIN_MS, HEART_SPAWN_INTERVAL_MAX_MS);
          const action = heartCollected ? 'recogido' : 'expiró';
          console.log(`[HEART] Corazón ${action}. Próximo corazón en ${newNextHeartInterval/1000}s (aleatorio)`);
        }
        
        // Si un vault fue activado, expiró, o su efecto terminó, actualizar el timestamp para el próximo spawn
        if (vaultJustActivated || vaultExpired || vaultEffectJustEnded) {
          newLastVaulSpawn = currentTime;
          let reason = 'desconocida';
          if (vaultJustActivated) reason = 'activado';
          else if (vaultExpired) reason = 'expirado';
          else if (vaultEffectJustEnded) reason = 'efecto terminado';
          console.log(`[VAUL] Vault ${reason}. Próximo Vault en ${VAUL_NEXT_SPAWN_MS/1000}s`);
        }
        
        // Verificar si ya existe alguno de estos collectibles
        const hasMegaNode = remainingCollectibles.some(c => c.type === 'megaNode');
        const hasHeart = remainingCollectibles.some(c => c.type === 'heart');
        const hasVaul = remainingCollectibles.some(c => c.type === 'vaul');
        const hasGoatSkin = remainingCollectibles.some(c => c.type === 'goatSkin');
        
        // SPAWN MEGANODE - Intervalo aleatorio entre 15-25s
        // NUEVA LÓGICA: El Haku no aparece mientras esté la piel de GOAT en pantalla
        if (!hasMegaNode && !hasGoatSkin) {
          // Generar primer intervalo si no existe
          if (newNextMegaNodeInterval === null) {
            newNextMegaNodeInterval = getRandomInterval(MEGA_NODE_SPAWN_INTERVAL_MIN_MS, MEGA_NODE_SPAWN_INTERVAL_MAX_MS);
            console.log(`[MEGANODE] Primer intervalo generado: ${newNextMegaNodeInterval/1000}s`);
          }
          
          // Verificar si es hora de spawnear
          const timeSinceLastSpawn = newLastMegaNodeSpawn ? (currentTime - newLastMegaNodeSpawn) : (prev.gameStartTime ? (currentTime - prev.gameStartTime) : 0);
          if (timeSinceLastSpawn >= newNextMegaNodeInterval) {
            // CORREGIDO: Incluir token en la lista de objetos a evitar
            const newCollectible = safeSpawnCollectible(createMegaNodeCollectible, generateId(), prev.canvasSize.width, prev.canvasSize.height, [...remainingCollectibles, ...obstaclesToSpawn, prev.token], currentTime);
            if (newCollectible) {
              remainingCollectibles.push(newCollectible);
              newLastMegaNodeSpawn = currentTime;
              // Generar próximo intervalo aleatorio
              newNextMegaNodeInterval = getRandomInterval(MEGA_NODE_SPAWN_INTERVAL_MIN_MS, MEGA_NODE_SPAWN_INTERVAL_MAX_MS);
              console.log(`[MEGANODE] Spawned independientemente - próximo en ${newNextMegaNodeInterval/1000}s (aleatorio)`);
            }
          }
        } else if (!hasMegaNode && hasGoatSkin) {
          // Si hay piel de GOAT en pantalla, el Haku no puede aparecer
          console.log(`[MEGANODE] Spawn bloqueado - piel de GOAT en pantalla`);
        }
        
        // SPAWN HEART - Intervalo aleatorio entre 20-30s - Siempre aparece
        if (!hasHeart) {
          // Generar primer intervalo si no existe
          if (newNextHeartInterval === null) {
            newNextHeartInterval = getRandomInterval(HEART_SPAWN_INTERVAL_MIN_MS, HEART_SPAWN_INTERVAL_MAX_MS);
            console.log(`[HEART] Primer intervalo generado: ${newNextHeartInterval/1000}s`);
          }
          
          // Verificar si es hora de spawnear
          const timeSinceLastSpawn = newLastHeartSpawn ? (currentTime - newLastHeartSpawn) : (prev.gameStartTime ? (currentTime - prev.gameStartTime) : 0);
          if (timeSinceLastSpawn >= newNextHeartInterval) {
            // CORREGIDO: Incluir token en la lista de objetos a evitar
            const newCollectible = safeSpawnCollectible(createHeartCollectible, generateId(), prev.canvasSize.width, prev.canvasSize.height, [...remainingCollectibles, ...obstaclesToSpawn, prev.token], currentTime);
            if (newCollectible) {
              remainingCollectibles.push(newCollectible);
              newLastHeartSpawn = currentTime;
              // Generar próximo intervalo aleatorio
              newNextHeartInterval = getRandomInterval(HEART_SPAWN_INTERVAL_MIN_MS, HEART_SPAWN_INTERVAL_MAX_MS);
              console.log(`[HEART] Spawned independientemente - próximo en ${newNextHeartInterval/1000}s (aleatorio)`);
            }
          }
        }
        
        // SPAWN VAULT - 30s para el primero, 30s después de terminar efecto o expirar
        if (!hasVaul) {
          // Determinar el intervalo correcto según si es el primero o no
          const spawnInterval = newLastVaulSpawn === null ? VAUL_FIRST_SPAWN_MS : VAUL_NEXT_SPAWN_MS;
          
          // Verificar si es hora de spawnear
          const timeSinceLastSpawn = newLastVaulSpawn ? (currentTime - newLastVaulSpawn) : (prev.gameStartTime ? (currentTime - prev.gameStartTime) : 0);
          if (timeSinceLastSpawn >= spawnInterval) {
            // CORREGIDO: Incluir token en la lista de objetos a evitar
            const newCollectible = safeSpawnCollectible(createVaulCollectible, generateId(), prev.canvasSize.width, prev.canvasSize.height, [...remainingCollectibles, ...obstaclesToSpawn, prev.token], currentTime);
            if (newCollectible) {
              remainingCollectibles.push(newCollectible);
              newLastVaulSpawn = currentTime;
              const nextInterval = VAUL_NEXT_SPAWN_MS / 1000;
              console.log(`[VAULT] Spawned - próximo en ${nextInterval}s (después de terminar efecto o expirar)`);
            }
          }
        }

      // --- Aparición de checkpoint ---
      let checkpointCount = checkpointCountRef.current;
      let hasCheckpoint = prev.collectibles.some(c => c.type === 'checkpoint');
      const checkpointCooldown = getCheckpointCooldownForLevel(currentLevel);
      const nowTime = getGameTime();
      
    
      
      if (!hasCheckpoint && remainingTime <= CHECKPOINT_APPEAR_THRESHOLD) {
        // CORREGIDO: Incluir token en la lista de objetos a evitar
        remainingCollectibles.push(safeSpawnCollectible(createCheckpointCollectible, generateId(), prev.canvasSize.width, prev.canvasSize.height, [...remainingCollectibles, ...obstaclesToSpawn, prev.token], currentTime));
        lastCheckpointTime = nowTime;
      }

      // --- Final State Update ---
      
      // Log final para depuración de hearts
      if (hearts !== prev.hearts) {
        console.log(`[HEARTS DEBUG] Hearts en return final: ${prev.hearts} -> ${hearts}`);
      }
      
      // Log para depuración del multiplicador
      if (currentMultiplier !== prev.scoreMultiplier || multiplierTimeRemaining !== prev.multiplierTimeRemaining) {
        if (currentMultiplier > 1) {
          console.log(`[VAUL] 🎯 Multiplicador UI actualizado: x${currentMultiplier} - ${multiplierTimeRemaining}s restantes`);
        } else if (prev.scoreMultiplier > 1) {
          console.log(`[VAUL] ❌ Multiplicador desactivado (era x${prev.scoreMultiplier})`);
        }
      }
      
      return {
        ...prev,
        status: gameOver ? 'gameOver' : 'playing',
        token: newToken,
        obstacles: obstaclesToSpawn,
        collectibles: remainingCollectibles,
        score: Math.max(0, prev.score + finalScoreToAdd + heartScoreToAdd + vaulBonusToAdd + runeCompletionBonus - scoreToSubtract), // Sumamos bonus directos sin multiplicadores
        timer: gameOver ? 0 : Math.max(0, remainingTime),
        level: currentLevel,
        isFrenzyMode: false,
        hearts,
        maxHearts: getMaxHeartsForLevel(currentLevel), // Actualizar maxHearts según el nivel actual
        lastDamageTime,
        lastDamageSource,
        scoreMultiplier: currentMultiplier,
        multiplierEndTime: null, // Ya no se usa, mantener para compatibilidad
        multiplierTimeRemaining,
        checkpointTimeBonus: prev.checkpointTimeBonus + checkpointBonus,
        timePenalties: prev.timePenalties + timePenaltyAccumulator,
        // Sistema de rondas equilibradas para assets positivos (mantenido para compatibilidad)
        positiveAssetsRound: prev.positiveAssetsRound, // Ya no se usa activamente
        currentRoundNumber: prev.currentRoundNumber, // Ya no se usa activamente
        // Sistema de garantía mínima de assets positivos (mantenido para compatibilidad)
        lastPositiveAssetTime: prev.lastPositiveAssetTime, // Ya no se usa activamente
        positiveAssetsIn30s: prev.positiveAssetsIn30s, // Ya no se usa activamente
        periodStartTime: prev.periodStartTime, // Ya no se usa activamente
        // Nuevo sistema de timing independiente
        lastMegaNodeSpawn: newLastMegaNodeSpawn,
        nextMegaNodeInterval: newNextMegaNodeInterval,
        lastHeartSpawn: newLastHeartSpawn,
        nextHeartInterval: newNextHeartInterval,
        heartsCollectedWithFullLife: heartCollected && prev.hearts >= prev.maxHearts ? (prev.heartsCollectedWithFullLife || 0) + 1 : (prev.heartsCollectedWithFullLife || 0),
        lastVaulSpawn: newLastVaulSpawn,
        // Sistema de aparición progresiva de assets negativos
        negativeSpawnCycle: newNegativeSpawnCycle,
        lastNegativeSpawnTime: newLastNegativeSpawnTime,
        hackerSpawned: newHackerSpawned,
        visualEffects: newVisualEffects,
        // Efecto de robo de score por hacker
        scoreStealEffect,
        vaulCollectedCount,
        // Efectos del Vault
        activeVaulEffect,
        vaulEffectStartTime,
        vaulEffectTimeRemaining,
        vaulEffectData,
        eliminateEnemiesDisplay,
        rays,
        rayCycle,
        redZones,
        nextRedZoneSpawnTime,
        treasureState,
        runeState,
        gameOverReason: gameOver ? (gameOverReason ?? prev.gameOverReason) : undefined,
        levelStats,
        currentLevelStartTime,
      };
    });
  }, [startGame, togglePause, getGameTime]); // Dependencies - Removido gameState para evitar stale closures

  return { gameState, updateGame, updateInputRef, startGame, togglePause, resetGame, forceGameOver };
}

// Función específica para spawnear tesoros con distancia mínima entre ellos en el mismo bloque
function safeSpawnTreasure(
  id: string, 
  width: number, 
  height: number, 
  others: GameObject[], 
  gameTime: number,
  lastTreasurePosition: { x: number; y: number } | null
): Collectible {
  let treasure;
  let attempts = 0;
  const maxAttempts = 100; // Más intentos para tesoros ya que tienen restricciones adicionales
  const MIN_DISTANCE_BETWEEN_TREASURES = 300; // Distancia mínima entre tesoros del mismo bloque
  
  do {
    treasure = createTreasureCollectible(id, width, height, gameTime);
    attempts++;
    
    // Verificar solapamiento con otros elementos (usa la lógica normal de 400px)
    const overlapping = isOverlapping(treasure, others, 400);
    
    // Verificar distancia con el tesoro anterior del bloque (si existe)
    let tooCloseToLastTreasure = false;
    if (lastTreasurePosition) {
      const distanceToLastTreasure = Math.sqrt(
        Math.pow(treasure.x - lastTreasurePosition.x, 2) + 
        Math.pow(treasure.y - lastTreasurePosition.y, 2)
      );
      tooCloseToLastTreasure = distanceToLastTreasure < MIN_DISTANCE_BETWEEN_TREASURES;
      
      if (attempts % 10 === 0 || (!overlapping && !tooCloseToLastTreasure)) {
        console.log(`[TREASURE SPAWN] Attempt ${attempts}/${maxAttempts}, Distance to last treasure: ${distanceToLastTreasure.toFixed(0)}px (min: ${MIN_DISTANCE_BETWEEN_TREASURES}px), Overlapping: ${overlapping}`);
      }
    }
    
    // Debe cumplir ambas condiciones: no solapar con otros Y estar lejos del tesoro anterior
    if (!overlapping && !tooCloseToLastTreasure) break;
    
  } while (attempts < maxAttempts);
  
  // Advertencia si se alcanzó el máximo de intentos
  if (attempts >= maxAttempts) {
    console.warn(`[TREASURE SPAWN WARNING] Treasure spawned after ${maxAttempts} attempts - may not meet distance requirements`);
  } else {
    console.log(`[TREASURE SPAWN] ✅ Treasure spawned successfully after ${attempts} attempts`);
  }
  
  return treasure;
}

// Al crear collectibles, evitar solapamiento con otros objetos
function safeSpawnCollectible(createFn: (id: string, w: number, h: number, gameTime?: number) => Collectible, id: string, width: number, height: number, others: GameObject[], gameTime?: number): Collectible {
  let collectible;
  let attempts = 0;
  const maxAttempts = 50; // Aumentado a 50 intentos para mejor distribución
  
  do {
    collectible = createFn(id, width, height, gameTime);
    attempts++;
    
    // MEJORADO: Distancias mínimas ajustadas para evitar solapamiento entre elementos recogibles
    // El radio típico de los elementos es ~20-30px, así que aseguramos suficiente separación
    let minDistance: number;
    
    switch (collectible.type) {
      case 'treasure':
      case 'heart':
        // Elementos de alto valor: máxima distancia del token y otros elementos
        minDistance = 400;
        break;
      case 'vaul':
        // Vaul: buena distancia para destacar
        minDistance = 200;
        break;
      case 'megaNode':
      case 'goatSkin':
      case 'rune':
      case 'checkpoint':
      case 'purr':
        // Elementos especiales: distancia media-alta para evitar solapamiento
        minDistance = 80;
        break;
      case 'energy':
      case 'uki':
        // Elementos comunes: distancia suficiente para que no se solapen visualmente
        // Aumentado de 40 a 60 para mejor separación
        minDistance = 60;
        break;
      default:
        minDistance = 50;
    }
    
    // Reducción progresiva de distancia si no se encuentra ubicación
    let adjustedMinDistance = minDistance;
    if (attempts > 15) {
      // Para elementos especiales, mantener siempre una distancia mínima decente
      if (collectible.type === 'heart' || collectible.type === 'treasure' || collectible.type === 'vaul') {
        adjustedMinDistance = Math.max(minDistance * 0.6, 120); // Mínimo 120px
      } else if (collectible.type === 'megaNode' || collectible.type === 'goatSkin' || 
                 collectible.type === 'rune' || collectible.type === 'checkpoint' || collectible.type === 'purr') {
        adjustedMinDistance = Math.max(minDistance * 0.5, 50); // Mínimo 50px
      } else {
        // Energy y uki: pueden estar más cerca después de muchos intentos pero nunca solapados
        adjustedMinDistance = Math.max(minDistance * 0.4, 35); // Mínimo 35px
      }
    }
    
    const overlapping = isOverlapping(collectible, others, adjustedMinDistance);
    
    // DEBUG: Log detallado para elementos recogibles
    if (attempts % 10 === 0 || !overlapping) {
      const collectibles = others.filter(o => 'type' in o);
      console.log(`[SPAWN DEBUG] ${collectible.type} - Attempt ${attempts}/${maxAttempts}, Min distance: ${adjustedMinDistance.toFixed(0)}px, Overlapping: ${overlapping}, Nearby collectibles: ${collectibles.length}`);
    }
    
    if (!overlapping) break;
    
  } while (attempts < maxAttempts);
  
  // Advertencia si se alcanzó el máximo de intentos
  if (attempts >= maxAttempts) {
    console.warn(`[SPAWN WARNING] ${collectible.type} spawned after ${maxAttempts} attempts - may be close to other elements`);
  }
  
  return collectible;
}
