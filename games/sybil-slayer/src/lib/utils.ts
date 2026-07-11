import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Vector2D, GameObject, RuneType, Obstacle, ObstacleType, Collectible } from "../types/game";
import { GAMEPLAY_RANDOM_STREAMS, randomManager } from "./random";
import {
  ENERGY_POINT_RADIUS,
  ENERGY_POINT_COLOR,
  ENERGY_POINT_VALUE,
  MEGA_NODE_RADIUS,
  MEGA_NODE_COLOR,
  MEGA_NODE_VALUE,
  PURR_RADIUS,
  PURR_COLOR,
  PURR_VALUE,
  VAUL_RADIUS,
  VAUL_COLOR,
  VAUL_VALUE,
  GOAT_SKIN_RADIUS,
  GOAT_SKIN_COLOR,
  GOAT_SKIN_VALUE,
  UKI_RADIUS,
  UKI_COLOR,
  UKI_VALUE,
  TREASURE_RADIUS,
  TREASURE2_RADIUS,
  TREASURE3_RADIUS,
  TREASURE_COLOR,
  FEE_RADIUS,
  BUG_RADIUS,
  HACKER_RADIUS,
  BUG_SAFE_ZONE,
  RUNE_RADIUS,
  RUNE_CONFIG,
  RUNE_TYPES,
} from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type SpawnRandomRecord = { readonly index: number; attempts: number };
const spawnRandomCounters: Record<string, number> = {};
const spawnRandomRecords = new Map<string, SpawnRandomRecord>();
let observedSeedVersion = randomManager.seedVersion();

function resetSpawnRandomEvents() {
  for (const key of Object.keys(spawnRandomCounters)) delete spawnRandomCounters[key];
  spawnRandomRecords.clear();
  observedSeedVersion = randomManager.seedVersion();
}

function withSpawnRandom<T>(
  streamName: (typeof GAMEPLAY_RANDOM_STREAMS)[keyof typeof GAMEPLAY_RANDOM_STREAMS],
  logicalSpawnId: string,
  run: () => T,
): T {
  if (observedSeedVersion !== randomManager.seedVersion()) resetSpawnRandomEvents();
  const recordKey = `${streamName}:${logicalSpawnId}`;
  let record = spawnRandomRecords.get(recordKey);
  if (!record) {
    const index = spawnRandomCounters[streamName] ?? 0;
    spawnRandomCounters[streamName] = index + 1;
    record = { index, attempts: 0 };
    spawnRandomRecords.set(recordKey, record);
  }
  const attempt = record.attempts;
  record.attempts += 1;
  return randomManager.withEvent(streamName, `${record.index}:attempt:${attempt}`, run);
}

/**
 * Generates a random integer between min (inclusive) and max (exclusive).
 */
export function getRandomInt(min: number, max: number, streamName?: string): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(randomManager.random(streamName) * (max - min) + min);
}

/**
 * Generates a random float between min (inclusive) and max (exclusive).
 */
export function getRandomFloat(min: number, max: number, streamName?: string): number {
  return randomManager.random(streamName) * (max - min) + min;
}


/**
 * Checks for collision between two circular objects.
 */
export function checkCollision(obj1: GameObject, obj2: GameObject): boolean {
  const dx = obj1.x - obj2.x;
  const dy = obj1.y - obj2.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < obj1.radius + obj2.radius;
}

/**
 * Clamps a value between a minimum and maximum value.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
* Returns a random HSL color string with fixed saturation and lightness.
*/
export function getRandomNeonColor(): string {
 const hue = getRandomInt(0, 360);
 return `hsl(${hue} 100% 60%)`;
}

/**
 * Normalizes a vector.
 */
export function normalizeVector(vector: Vector2D): Vector2D {
  const magnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (magnitude === 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
  };
}

/**
 * Calculates the distance between two points.
 */
export function distanceBetweenPoints(p1: Vector2D, p2: Vector2D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Returns a random obstacle type based on weighted probabilities that scale with level
 * NOTA: Esta función solo se utiliza en situaciones donde se necesitan obstáculos aleatorios,
 * no para la generación inicial de los obstáculos de cada nivel, que sigue un número fijo.
 */
export function getRandomObstacleType(level: number = 1): ObstacleType {
  return randomManager.withIndexedEvent(
    GAMEPLAY_RANDOM_STREAMS.HAZARDS,
    'obstacle-type',
    () => {
      // Ajustar probabilidades para que coincidan con la dificultad de cada nivel
      if (level === 1) {
        return randomManager.random(GAMEPLAY_RANDOM_STREAMS.HAZARDS) < 0.5 ? 'fee' : 'bug';
      } else if (level === 2) {
        const rand = randomManager.random(GAMEPLAY_RANDOM_STREAMS.HAZARDS);
        if (rand < 0.4) return 'fee';
        if (rand < 0.9) return 'bug';
        return 'hacker';
      } else if (level === 3) {
        const rand = randomManager.random(GAMEPLAY_RANDOM_STREAMS.HAZARDS);
        if (rand < 0.35) return 'fee';
        if (rand < 0.75) return 'bug';
        return 'hacker';
      }
      const rand = randomManager.random(GAMEPLAY_RANDOM_STREAMS.HAZARDS);
      if (rand < 0.3) return 'fee';
      if (rand < 0.7) return 'bug';
      return 'hacker';
    },
  );
}

/**
 * Creates a new obstacle with random properties based on type.
 */
export function createObstacle(id: string, type: ObstacleType, canvasWidth: number, canvasHeight: number): Obstacle {
  return withSpawnRandom(GAMEPLAY_RANDOM_STREAMS.HAZARDS, id, () => {
    const baseProps = {
      id,
      x: getRandomFloat(0, canvasWidth, GAMEPLAY_RANDOM_STREAMS.HAZARDS),
      y: getRandomFloat(0, canvasHeight, GAMEPLAY_RANDOM_STREAMS.HAZARDS),
    };

    switch (type) {
      case 'fee':
        return {
        ...baseProps,
        type: 'fee',
        radius: FEE_RADIUS,
        color: `hsl(${getRandomInt(0, 30, GAMEPLAY_RANDOM_STREAMS.HAZARDS)} 100% 60%)`, // Red/Orange hues
        velocity: {
          x: getRandomFloat(-2, 2, GAMEPLAY_RANDOM_STREAMS.HAZARDS) || (randomManager.random(GAMEPLAY_RANDOM_STREAMS.HAZARDS) > 0.5 ? 1 : -1), // Ensure non-zero initial velocity
          y: getRandomFloat(-2, 2, GAMEPLAY_RANDOM_STREAMS.HAZARDS) || (randomManager.random(GAMEPLAY_RANDOM_STREAMS.HAZARDS) > 0.5 ? 1 : -1),
        },
         glow: false,
      };
      case 'bug': {
        // CORREGIDO: Usar zona segura para evitar que bugs se queden atrapados en los extremos
        const safeBugX = getRandomFloat(BUG_SAFE_ZONE, canvasWidth - BUG_SAFE_ZONE, GAMEPLAY_RANDOM_STREAMS.HAZARDS);
        const safeBugY = getRandomFloat(BUG_SAFE_ZONE, canvasHeight - BUG_SAFE_ZONE, GAMEPLAY_RANDOM_STREAMS.HAZARDS);
        return {
        ...baseProps,
        x: safeBugX,
        y: safeBugY,
        type: 'bug',
        radius: BUG_RADIUS,
        color: `hsl(${getRandomInt(45, 75, GAMEPLAY_RANDOM_STREAMS.HAZARDS)} 100% 60%)`, // Yellow hues
        rotation: getRandomFloat(0, Math.PI * 2, GAMEPLAY_RANDOM_STREAMS.HAZARDS),
        angularVelocity: getRandomFloat(0.03, 0.07, GAMEPLAY_RANDOM_STREAMS.HAZARDS) * (randomManager.random(GAMEPLAY_RANDOM_STREAMS.HAZARDS) > 0.5 ? 1 : -1), // Random direction
        glow: false,
        };
      }
      case 'hacker':
        return {
        ...baseProps,
        type: 'hacker',
        radius: HACKER_RADIUS,
        color: `hsl(${getRandomInt(260, 290, GAMEPLAY_RANDOM_STREAMS.HAZARDS)} 100% 70%)`, // Purple hues
        velocity: { x: 0, y: 0 }, // Starts stationary, then chases
        glow: false,
        energyCollected: 0, // NUEVO: Inicializar contador de energy recogidas
        };
    }
  });
}

/**
 * Generates a unique ID string.
 */
let generatedIdCounter = 0;
let generatedIdSeedVersion = randomManager.seedVersion();
export function generateId(prefix: string = 'obj'): string {
  const currentSeedVersion = randomManager.seedVersion();
  if (generatedIdSeedVersion !== currentSeedVersion) {
    generatedIdCounter = 0;
    generatedIdSeedVersion = currentSeedVersion;
  }
  generatedIdCounter += 1;
  return `${prefix}-${generatedIdCounter}`;
}

export function resetIdCounter() {
  generatedIdCounter = 0;
  resetSpawnRandomEvents();
}

/**
 * Creates a new energy collectible.
 */
export function createEnergyCollectible(id: string, canvasWidth: number, canvasHeight: number): Collectible {
  return withSpawnRandom(GAMEPLAY_RANDOM_STREAMS.ITEMS, id, () => ({
    id,
    type: 'energy',
    x: getRandomFloat(ENERGY_POINT_RADIUS, canvasWidth - ENERGY_POINT_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    y: getRandomFloat(ENERGY_POINT_RADIUS, canvasHeight - ENERGY_POINT_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    radius: ENERGY_POINT_RADIUS,
    color: ENERGY_POINT_COLOR,
    value: ENERGY_POINT_VALUE,
    glow: false,
  }));
}

/**
 * Creates a new uki collectible.
 */
export function createUkiCollectible(id: string, canvasWidth: number, canvasHeight: number): Collectible {
  return withSpawnRandom(GAMEPLAY_RANDOM_STREAMS.ITEMS, id, () => ({
    id,
    type: 'uki',
    x: getRandomFloat(UKI_RADIUS, canvasWidth - UKI_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    y: getRandomFloat(UKI_RADIUS, canvasHeight - UKI_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    radius: UKI_RADIUS,
    color: UKI_COLOR,
    value: UKI_VALUE,
    glow: false,
  }));
}

/**
 * Creates a new treasure collectible (tesoro).
 */
export function createTreasureCollectible(id: string, canvasWidth: number, canvasHeight: number, gameTime?: number, treasureNumber?: number): Collectible {
  return withSpawnRandom(GAMEPLAY_RANDOM_STREAMS.CHESTS, id, () => {
    // Asignación defensiva del tipo de tesoro según su orden en el bloque.
    // Mapeo esperado: 1 -> treasure, 2 -> treasure2, 3+ -> treasure3; undefined/0 -> treasure
    const ordinal = Math.max(1, Math.min(3, (treasureNumber ?? 1))); // normaliza a [1,3]
    let treasureType: 'treasure' | 'treasure2' | 'treasure3' = 'treasure';
    let treasureRadius = TREASURE_RADIUS;

    if (ordinal === 2) {
      treasureType = 'treasure2';
      treasureRadius = TREASURE2_RADIUS;
    } else if (ordinal === 3) {
      treasureType = 'treasure3';
      treasureRadius = TREASURE3_RADIUS;
    }

    return {
      id,
      type: treasureType,
      radius: treasureRadius,
      x: getRandomFloat(treasureRadius, canvasWidth - treasureRadius, GAMEPLAY_RANDOM_STREAMS.CHESTS),
      y: getRandomFloat(treasureRadius, canvasHeight - treasureRadius, GAMEPLAY_RANDOM_STREAMS.CHESTS),
      color: TREASURE_COLOR,
      value: 0, // valor dinámico por bloque, se suma en lógica
      glow: false,
      createdAt: gameTime ?? Date.now(),
    };
  });
}

/**
 * Creates a new mega node collectible.
 */
export function createMegaNodeCollectible(id: string, canvasWidth: number, canvasHeight: number, gameTime?: number): Collectible {
  return withSpawnRandom(GAMEPLAY_RANDOM_STREAMS.ITEMS, id, () => ({
    id,
    type: 'megaNode',
    x: getRandomFloat(MEGA_NODE_RADIUS, canvasWidth - MEGA_NODE_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    y: getRandomFloat(MEGA_NODE_RADIUS, canvasHeight - MEGA_NODE_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    radius: MEGA_NODE_RADIUS,
    color: MEGA_NODE_COLOR,
    value: MEGA_NODE_VALUE,
    glow: false,
    createdAt: gameTime ?? Date.now(), // ✅ Usar tiempo de juego pausable si está disponible
    // Eliminadas propiedades de pulsación
  }));
}

/**
 * Creates a new checkpoint collectible.
 */
export function createCheckpointCollectible(id: string, canvasWidth: number, canvasHeight: number): Collectible {
  return withSpawnRandom(GAMEPLAY_RANDOM_STREAMS.ITEMS, id, () => ({
    id,
    type: 'checkpoint',
    x: getRandomFloat(ENERGY_POINT_RADIUS, canvasWidth - ENERGY_POINT_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    y: getRandomFloat(ENERGY_POINT_RADIUS, canvasHeight - ENERGY_POINT_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    radius: 32, // Aumentado de 28 a 32 para ajustarse mejor a la altura de la imagen rectangular
    color: '#FFD700', // Amarillo dorado, solo como fallback
    value: 0, // No da puntos, solo tiempo
    glow: false,
    pulseEffect: true,
    pulseScale: 1.0,
    pulseDirection: 1,
  }));
}

/**
 * Creates a new heart collectible.
 */
export function createHeartCollectible(id: string, canvasWidth: number, canvasHeight: number, gameTime?: number): Collectible {
  return withSpawnRandom(GAMEPLAY_RANDOM_STREAMS.ITEMS, id, () => ({
    id,
    type: 'heart',
    x: getRandomFloat(ENERGY_POINT_RADIUS, canvasWidth - ENERGY_POINT_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    y: getRandomFloat(ENERGY_POINT_RADIUS, canvasHeight - ENERGY_POINT_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    radius: 28, // Tamaño similar a energy
    color: '#FF4B6E', // Rosa/rojo, solo como fallback
    value: 0, // No da puntos, solo vida
    glow: false,
    createdAt: gameTime ?? Date.now(), // ✅ Usar tiempo de juego pausable si está disponible
  }));
}

/**
 * Creates a new GOAT skin collectible (special power-up).
 */
export function createGoatSkinCollectible(id: string, canvasWidth: number, canvasHeight: number, _gameTime?: number): Collectible {
  return withSpawnRandom(GAMEPLAY_RANDOM_STREAMS.ITEMS, id, () => ({
    id,
    type: 'goatSkin',
    x: getRandomFloat(GOAT_SKIN_RADIUS, canvasWidth - GOAT_SKIN_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    y: getRandomFloat(GOAT_SKIN_RADIUS, canvasHeight - GOAT_SKIN_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    radius: GOAT_SKIN_RADIUS,
    color: GOAT_SKIN_COLOR,
    value: GOAT_SKIN_VALUE,
    glow: false,
    pulseEffect: true,
    pulseScale: 1.0,
    pulseDirection: 1,
  }));
}

/**
 * Creates a new rune collectible for the level totem.
 */
export function createRuneCollectible(
  id: string,
  canvasWidth: number,
  canvasHeight: number,
  runeType?: RuneType,
  gameTime?: number
): Collectible {
  return withSpawnRandom(GAMEPLAY_RANDOM_STREAMS.RUNES, id, () => {
    const selectedRune = runeType ?? RUNE_TYPES[Math.floor(randomManager.random(GAMEPLAY_RANDOM_STREAMS.RUNES) * RUNE_TYPES.length)];
    const runeConfig = RUNE_CONFIG[selectedRune];

    return {
      id,
      type: 'rune',
      runeType: selectedRune,
      x: getRandomFloat(RUNE_RADIUS, canvasWidth - RUNE_RADIUS, GAMEPLAY_RANDOM_STREAMS.RUNES),
      y: getRandomFloat(RUNE_RADIUS, canvasHeight - RUNE_RADIUS, GAMEPLAY_RANDOM_STREAMS.RUNES),
      radius: RUNE_RADIUS,
      color: runeConfig?.color ?? '#ffffff',
      value: 0,
      glow: false,
      createdAt: gameTime ?? Date.now(),
    };
  });
}

/**
 * Crea un bug en una posición estratégica dentro del grid
 * MEJORADO: Evita spawn sobre assets positivos (energy, megaNode, purr, vaul, heart, checkpoint)
 */
export function createStrategicBug(id: string, canvasWidth: number, canvasHeight: number, existingObstacles: Obstacle[], level: number = 1, existingCollectibles: any[] = []): Obstacle {
  return withSpawnRandom(
    GAMEPLAY_RANDOM_STREAMS.HAZARDS,
    id,
    () => createStrategicBugForEvent(
      id,
      canvasWidth,
      canvasHeight,
      existingObstacles,
      level,
      existingCollectibles,
    ),
  );
}

function createStrategicBugForEvent(id: string, canvasWidth: number, canvasHeight: number, existingObstacles: Obstacle[], level: number = 1, existingCollectibles: any[] = []): Obstacle {
  // CORREGIDO: Usar zona segura para evitar bugs en los extremos
  const safeWidth = canvasWidth - (2 * BUG_SAFE_ZONE);
  const safeHeight = canvasHeight - (2 * BUG_SAFE_ZONE);
  
  // Crear grid virtual para ubicaciones estratégicas dentro de la zona segura
  const gridSize = 100; // Tamaño de las celdas del grid aumentado para mejor distribución
  const cols = Math.floor(safeWidth / gridSize);
  const rows = Math.floor(safeHeight / gridSize);
  
  // Crear una matriz para rastrear qué celdas ya están ocupadas
  const occupiedCells: boolean[][] = Array(rows).fill(0).map(() => Array(cols).fill(false));
  
  // MEJORADO: Marcar celdas ocupadas por bugs existentes (ajustado para zona segura)
  existingObstacles.forEach(obstacle => {
    if (obstacle.type === 'bug') {
      // Convertir coordenadas globales a coordenadas de zona segura
      const safeX = obstacle.x - BUG_SAFE_ZONE;
      const safeY = obstacle.y - BUG_SAFE_ZONE;
      const col = Math.floor(safeX / gridSize);
      const row = Math.floor(safeY / gridSize);
      if (col >= 0 && col < cols && row >= 0 && row < rows) {
        occupiedCells[row][col] = true;
        // También marcar celdas adyacentes para evitar que los bugs se toquen
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const r = row + dr;
            const c = col + dc;
            if (r >= 0 && r < rows && c >= 0 && c < cols) {
              occupiedCells[r][c] = true;
            }
          }
        }
      }
    }
  });
  
  // NUEVO: Marcar celdas ocupadas por assets positivos para evitar taparlos
  existingCollectibles.forEach(collectible => {
    if (collectible && collectible.type && ['energy', 'megaNode', 'purr', 'vaul', 'heart', 'checkpoint'].includes(collectible.type)) {
      // Convertir coordenadas globales a coordenadas de zona segura
      const safeX = collectible.x - BUG_SAFE_ZONE;
      const safeY = collectible.y - BUG_SAFE_ZONE;
      const col = Math.floor(safeX / gridSize);
      const row = Math.floor(safeY / gridSize);
      if (col >= 0 && col < cols && row >= 0 && row < rows) {
        // Marcar la celda del asset Y celdas adyacentes para dar espacio extra
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const r = row + dr;
            const c = col + dc;
            if (r >= 0 && r < rows && c >= 0 && c < cols) {
              occupiedCells[r][c] = true;
            }
          }
        }
        console.log(`[BUG SPAWN] Evitando asset positivo ${collectible.type} en (${collectible.x.toFixed(1)}, ${collectible.y.toFixed(1)})`);
      }
    }
  });
  
  // Recopilar celdas libres
  const freeCells: {row: number, col: number}[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!occupiedCells[row][col]) {
        freeCells.push({row, col});
      }
    }
  }
  
  let posX: number;
  let posY: number;
  
  if (freeCells.length > 0) {
    // Seleccionar aleatoriamente una celda libre
    const randomCell = freeCells[Math.floor(randomManager.random(GAMEPLAY_RANDOM_STREAMS.HAZARDS) * freeCells.length)];
    
    // Posicionar en el centro de la celda con una pequeña variación
    // CORREGIDO: Convertir coordenadas de zona segura a coordenadas globales
    const safeX = randomCell.col * gridSize + gridSize/2 + getRandomFloat(-10, 10, GAMEPLAY_RANDOM_STREAMS.HAZARDS);
    const safeY = randomCell.row * gridSize + gridSize/2 + getRandomFloat(-10, 10, GAMEPLAY_RANDOM_STREAMS.HAZARDS);
    posX = safeX + BUG_SAFE_ZONE; // Añadir offset de zona segura
    posY = safeY + BUG_SAFE_ZONE; // Añadir offset de zona segura
  } else {
    // Si no hay celdas libres, intentar colocar en una posición aleatoria que no se superponga con otros bugs
    let attempt = 0;
    const maxAttempts = 50;
    
    // CORREGIDO: Valores iniciales por defecto usando zona segura
    posX = getRandomFloat(BUG_SAFE_ZONE, canvasWidth - BUG_SAFE_ZONE, GAMEPLAY_RANDOM_STREAMS.HAZARDS);
    posY = getRandomFloat(BUG_SAFE_ZONE, canvasHeight - BUG_SAFE_ZONE, GAMEPLAY_RANDOM_STREAMS.HAZARDS);
    
    let validPosition = false;
    
    while (attempt < maxAttempts && !validPosition) {
      posX = getRandomFloat(BUG_SAFE_ZONE, canvasWidth - BUG_SAFE_ZONE, GAMEPLAY_RANDOM_STREAMS.HAZARDS);
      posY = getRandomFloat(BUG_SAFE_ZONE, canvasHeight - BUG_SAFE_ZONE, GAMEPLAY_RANDOM_STREAMS.HAZARDS);
      
      // Comprobar si esta posición está lo suficientemente lejos de otros bugs
      validPosition = !existingObstacles.some(obs => 
        obs.type === 'bug' && 
        distanceBetweenPoints(obs, {x: posX, y: posY}) < BUG_RADIUS * 3
      );
      
      attempt++;
    }
  }
  
  // CORREGIDO: Ajustar si está fuera de los límites usando zona segura
  posX = clamp(posX, BUG_SAFE_ZONE, canvasWidth - BUG_SAFE_ZONE);
  posY = clamp(posY, BUG_SAFE_ZONE, canvasHeight - BUG_SAFE_ZONE);
  
  // Velocidad angular más suave en niveles bajos
  const angularVelocityBase = 0.03 + (level - 1) * 0.005; // Aumenta ligeramente por nivel
  
  // Crear el bug con la posición estratégica
  const bug: Obstacle = {
    id,
    type: 'bug',
    x: posX,
    y: posY,
    radius: BUG_RADIUS,
    color: `hsl(${getRandomInt(45, 75, GAMEPLAY_RANDOM_STREAMS.HAZARDS)} 100% 60%)`, // Yellow hues
    rotation: getRandomFloat(0, Math.PI * 2, GAMEPLAY_RANDOM_STREAMS.HAZARDS),
    angularVelocity: angularVelocityBase * (randomManager.random(GAMEPLAY_RANDOM_STREAMS.HAZARDS) > 0.5 ? 1 : -1), // Random direction
    glow: false,
  };
  
  console.log(`[BUG CREADO] ID: ${id}, Posición: (${posX.toFixed(1)}, ${posY.toFixed(1)}), Radio: ${BUG_RADIUS}`);
  return bug;
}

/**
 * Creates a new purr collectible.
 */
export function createPurrCollectible(id: string, canvasWidth: number, canvasHeight: number, gameTime?: number): Collectible {
  return withSpawnRandom(GAMEPLAY_RANDOM_STREAMS.ITEMS, id, () => ({
    id,
    type: 'purr',
    x: getRandomFloat(PURR_RADIUS, canvasWidth - PURR_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    y: getRandomFloat(PURR_RADIUS, canvasHeight - PURR_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    radius: PURR_RADIUS,
    color: PURR_COLOR,
    value: PURR_VALUE,
    glow: false,
    createdAt: gameTime ?? Date.now(), // ✅ Usar tiempo de juego pausable si está disponible
  }));
}

/**
 * Creates a new vaul collectible.
 */
export function createVaulCollectible(id: string, canvasWidth: number, canvasHeight: number, gameTime?: number): Collectible {
  return withSpawnRandom(GAMEPLAY_RANDOM_STREAMS.ITEMS, id, () => ({
    id,
    type: 'vaul',
    x: getRandomFloat(VAUL_RADIUS, canvasWidth - VAUL_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    y: getRandomFloat(VAUL_RADIUS, canvasHeight - VAUL_RADIUS, GAMEPLAY_RANDOM_STREAMS.ITEMS),
    radius: VAUL_RADIUS,
    color: VAUL_COLOR,
    value: VAUL_VALUE,
    glow: false,
    createdAt: gameTime ?? Date.now(), // ✅ Usar tiempo de juego pausable si está disponible
    activationProgress: 0, // Inicializar progreso acumulativo en 0
    isBeingTouched: false,
    isActivated: false,
    timeOnTouch: 0, // Inicializar tiempo acumulado de contacto en 0
  }));
}
