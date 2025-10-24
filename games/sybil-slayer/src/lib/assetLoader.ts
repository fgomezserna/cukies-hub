// AssetLoader: Sistema optimizado de carga y gestión de assets para el juego

// Prioridades de carga
export enum AssetPriority {
  CRITICAL = 0,    // Assets necesarios para iniciar el juego
  HIGH = 1,        // Assets usados frecuentemente
  MEDIUM = 2,      // Assets de efectos especiales
  LOW = 3          // Assets opcionales/decorativos
}

// Tipos para los assets
export type AssetKey = 
  // Personajes
  | 'token'
  
  // Obstáculos
  | 'fee'
  | 'bug'
  | 'hacker'
  
  // Coleccionables
  | 'megaNode'
  | 'checkpoint'
  | 'heart'
  | 'energy_point'
  | 'purr'
  | 'vaul'
  | 'uki'
  | 'treasure'
  | 'treasure2'
  | 'treasure3'
  
  // Efectos especiales  
  | 'jeff_goit'
  | 'whalechadmode'
  | 'meow'
  
  // Game over images
  | 'gameover_time'
  | 'gameover_vidas'
  
  // Goat skin image
  | 'goatskin'
  
  // Heart image
  | 'corazoncukies'
  
  // Rune images
  | 'runa_miner'
  | 'runa_chef'
  | 'runa_engineer'
  | 'runa_farmer'
  | 'runa_gatherer'
  | 'unlisted'
  | 'giga_vault'
  | 'pay_tariffs'
  
  // UI básica
  | 'grid_background'
  | 'pantallajuego'
  | 'main_background'
  | 'clouds_background'
  | 'box_letters'
  
  // Botones
  | 'play_button'
  | 'pause_button'
  | 'reset_button'
  | 'music_on'
  | 'music_off'
  | 'sounds_on'
  | 'sounds_off'
  | 'button_info';

// Configuración de assets con prioridades
interface AssetConfig {
  path: string;
  priority: AssetPriority;
  preload?: boolean; // Si debe cargarse en la primera fase
}

const assetConfigs: Record<AssetKey, AssetConfig> = {
  // CRÍTICOS - Necesarios para iniciar el juego
  token: { path: '/assets/characters/token.png', priority: AssetPriority.CRITICAL, preload: true },
  grid_background: { path: '/assets/ui/game-container/grid-background.png', priority: AssetPriority.CRITICAL, preload: true },
  pantallajuego: { path: '/assets/ui/game-container/pantallajuego.png', priority: AssetPriority.CRITICAL, preload: true },
  main_background: { path: '/assets/ui/game-container/background-playing.png', priority: AssetPriority.CRITICAL, preload: true },
  box_letters: { path: '/assets/ui/buttons/box_letters.png', priority: AssetPriority.CRITICAL, preload: true },
  
  // ALTA PRIORIDAD - Obstáculos y coleccionables básicos
  fee: { path: '/assets/obstacles/fee.png', priority: AssetPriority.HIGH, preload: true },
  bug: { path: '/assets/obstacles/bug.png', priority: AssetPriority.HIGH, preload: true },
  hacker: { path: '/assets/obstacles/trump.png', priority: AssetPriority.HIGH, preload: true },
  megaNode: { path: '/assets/collectibles/haku.png', priority: AssetPriority.HIGH, preload: true },
  checkpoint: { path: '/assets/collectibles/checkpointcukies.png', priority: AssetPriority.HIGH, preload: true },
  heart: { path: '/assets/collectibles/heart.png', priority: AssetPriority.HIGH, preload: true },
  energy_point: { path: '/assets/collectibles/resource_rare_metals.png', priority: AssetPriority.HIGH, preload: true },
  uki: { path: '/assets/collectibles/uki.png', priority: AssetPriority.HIGH, preload: true },
  treasure: { path: '/assets/collectibles/tesoro.png', priority: AssetPriority.HIGH, preload: true },
  treasure2: { path: '/assets/collectibles/tesoro2.png', priority: AssetPriority.HIGH, preload: true },
  treasure3: { path: '/assets/collectibles/tesoro3.png', priority: AssetPriority.HIGH, preload: true },
  
  // BOTONES ESENCIALES
  play_button: { path: '/assets/ui/buttons/play-button.png', priority: AssetPriority.HIGH, preload: true },
  pause_button: { path: '/assets/ui/buttons/pause-button.png', priority: AssetPriority.HIGH, preload: true },
  reset_button: { path: '/assets/ui/buttons/reset-button.png', priority: AssetPriority.HIGH, preload: true },
  
  // PRIORIDAD MEDIA - Efectos especiales
  jeff_goit: { path: '/assets/collectibles/jeff_goit.png', priority: AssetPriority.MEDIUM },
  whalechadmode: { path: '/assets/collectibles/whalechadmode.png', priority: AssetPriority.MEDIUM },
  meow: { path: '/assets/collectibles/meow.png', priority: AssetPriority.MEDIUM },
  unlisted: { path: '/assets/collectibles/unlisted.png', priority: AssetPriority.MEDIUM },
  giga_vault: { path: '/assets/collectibles/giga_vault.png', priority: AssetPriority.MEDIUM },
  pay_tariffs: { path: '/assets/collectibles/pay_tariffs.png', priority: AssetPriority.MEDIUM },
  purr: { path: '/assets/collectibles/purr/purr_1.png', priority: AssetPriority.MEDIUM },
  vaul: { path: '/assets/collectibles/vault.png', priority: AssetPriority.MEDIUM },
  
  // Game over images
  gameover_time: { path: '/assets/collectibles/gameover_time.png', priority: AssetPriority.HIGH, preload: true },
  gameover_vidas: { path: '/assets/collectibles/gameover_vidas.png', priority: AssetPriority.HIGH, preload: true },
  
  // Goat skin image
  goatskin: { path: '/assets/collectibles/goatskin.png', priority: AssetPriority.HIGH, preload: true },
  
  // Heart image
  corazoncukies: { path: '/assets/collectibles/corazoncukies.png', priority: AssetPriority.HIGH, preload: true },
  
  // Rune images
  runa_miner: { path: '/assets/collectibles/runa_miner.png', priority: AssetPriority.HIGH, preload: true },
  runa_chef: { path: '/assets/collectibles/runa_chef.png', priority: AssetPriority.HIGH, preload: true },
  runa_engineer: { path: '/assets/collectibles/runa_engineer.png', priority: AssetPriority.HIGH, preload: true },
  runa_farmer: { path: '/assets/collectibles/runa_farmer.png', priority: AssetPriority.HIGH, preload: true },
  runa_gatherer: { path: '/assets/collectibles/runa_gatherer.png', priority: AssetPriority.HIGH, preload: true },
  
  // BAJA PRIORIDAD - Elementos decorativos
  clouds_background: { path: '/assets/ui/game-container/clouds-background.png', priority: AssetPriority.LOW },
  music_on: { path: '/assets/ui/buttons/music_on.png', priority: AssetPriority.LOW },
  music_off: { path: '/assets/ui/buttons/music_off.png', priority: AssetPriority.LOW },
  sounds_on: { path: '/assets/ui/buttons/sounds_on.png', priority: AssetPriority.LOW },
  sounds_off: { path: '/assets/ui/buttons/sounds_off.png', priority: AssetPriority.LOW },
  button_info: { path: '/assets/ui/buttons/button_info.png', priority: AssetPriority.LOW },
};

// Para backward compatibility
const assetPaths: Record<AssetKey, string> = Object.fromEntries(
  Object.entries(assetConfigs).map(([key, config]) => [key, config.path])
) as Record<AssetKey, string>;

// Sprite sheets para assets repetitivos
interface SpriteSheet {
  image: HTMLImageElement | null;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  path: string;
}

export class AssetLoader {
  private static instance: AssetLoader;
  private loadedAssets: Map<AssetKey, HTMLImageElement> = new Map();
  private spriteSheets: Map<string, SpriteSheet> = new Map();
  private loading = false;
  private preloadPromise: Promise<void> | null = null;
  private fullLoadPromise: Promise<void> | null = null;
  private onProgressCallback: ((progress: number, phase: 'preload' | 'full') => void) | null = null;
  private retryCount: Map<string, number> = new Map();
  private maxRetries = 3;
  private cache: Map<string, HTMLImageElement> = new Map();

  // Singleton
  public static getInstance(): AssetLoader {
    if (!AssetLoader.instance) {
      AssetLoader.instance = new AssetLoader();
    }
    return AssetLoader.instance;
  }

  // Carga progresiva: primero assets críticos, luego el resto
  public async preloadCritical(onProgress?: (progress: number, phase: 'preload' | 'full') => void): Promise<void> {
    if (this.preloadPromise) return this.preloadPromise;
    
    this.onProgressCallback = onProgress || null;
    
    // Filtrar solo assets críticos y de alta prioridad
    const criticalAssets = Object.entries(assetConfigs)
      .filter(([, config]) => config.preload === true)
      .map(([key]) => key as AssetKey);
    
    console.log(`🚀 Precargando ${criticalAssets.length} assets críticos...`);
    
    this.preloadPromise = this.loadAssetBatch(criticalAssets, 'preload');
    await this.preloadPromise;
    
    console.log('✅ Assets críticos cargados');
    return this.preloadPromise;
  }

  // Cargar todos los assets restantes
  public async loadRemaining(onProgress?: (progress: number, phase: 'preload' | 'full') => void): Promise<void> {
    if (this.fullLoadPromise) return this.fullLoadPromise;
    
    this.onProgressCallback = onProgress || null;
    
    // Cargar assets que no fueron precargados
    const remainingAssets = Object.entries(assetConfigs)
      .filter(([, config]) => !config.preload)
      .map(([key]) => key as AssetKey);
    
    console.log(`⏳ Cargando ${remainingAssets.length} assets adicionales...`);
    
    this.fullLoadPromise = this.loadAssetBatch(remainingAssets, 'full');
    await this.fullLoadPromise;
    
    console.log('✅ Todos los assets cargados');
    return this.fullLoadPromise;
  }

  // Método optimizado para cargar lotes de assets
  private loadAssetBatch(assetKeys: AssetKey[], phase: 'preload' | 'full'): Promise<void> {
    const totalAssets = assetKeys.length;
    let loadedCount = 0;

    return new Promise<void>((resolve) => {
      if (totalAssets === 0) {
        resolve();
        return;
      }

      const updateProgress = () => {
        loadedCount++;
        const progress = loadedCount / totalAssets;
        if (this.onProgressCallback) {
          this.onProgressCallback(progress, phase);
        }

        if (loadedCount === totalAssets) {
          resolve();
        }
      };

      // Cargar assets con límite de concurrencia para evitar sobrecarga
      this.loadAssetsWithConcurrencyLimit(assetKeys, 6, updateProgress);
    });
  }

  // Cargar assets con límite de concurrencia
  private async loadAssetsWithConcurrencyLimit(
    assetKeys: AssetKey[], 
    limit: number, 
    onComplete: () => void
  ): Promise<void> {
    const semaphore = new Array(limit).fill(null);
    let index = 0;
    
    const loadNext = async (): Promise<void> => {
      if (index >= assetKeys.length) return;
      
      const currentIndex = index++;
      const key = assetKeys[currentIndex];
      
      try {
        await this.loadAssetWithRetry(key);
      } catch (error) {
        console.warn(`⚠️ Failed to load asset ${key} after retries:`, error);
      }
      
      onComplete();
      return loadNext();
    };
    
    // Iniciar workers concurrentes
    await Promise.all(semaphore.map(() => loadNext()));
  }

  // Cargar asset individual con reintento
  private loadAssetWithRetry(key: AssetKey): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const config = assetConfigs[key];
      const path = config.path;
      
      // Verificar cache primero
      if (this.cache.has(path)) {
        const cachedImage = this.cache.get(path)!;
        this.loadedAssets.set(key, cachedImage);
        resolve(cachedImage);
        return;
      }
      
      const tryLoad = (attempt: number) => {
        const img = new Image();
        
        img.onload = () => {
          this.loadedAssets.set(key, img);
          this.cache.set(path, img);
          this.retryCount.delete(path);
          resolve(img);
        };
        
        img.onerror = () => {
          if (attempt < this.maxRetries) {
            console.log(`🔄 Reintentando ${key} (${attempt + 1}/${this.maxRetries})`);
            // Exponential backoff
            setTimeout(() => tryLoad(attempt + 1), Math.pow(2, attempt) * 1000);
          } else {
            console.error(`❌ Asset ${key} falló después de ${this.maxRetries} intentos`);
            reject(new Error(`Failed to load ${key}`));
          }
        };
        
        img.src = path;
      };
      
      tryLoad(0);
    });
  }

  // Método de compatibilidad para el código existente
  public preloadAll(onProgress?: (progress: number) => void): Promise<void> {
    return this.preloadCritical((progress, phase) => {
      if (onProgress) onProgress(progress);
    });
  }

  // Obtener un asset
  public getAsset(key: AssetKey): HTMLImageElement | null {
    return this.loadedAssets.get(key) || null;
  }

  // Comprobar si los assets críticos están cargados
  public areCriticalAssetsLoaded(): boolean {
    const criticalAssets = Object.entries(assetConfigs)
      .filter(([, config]) => config.preload === true)
      .map(([key]) => key as AssetKey);
    
    return criticalAssets.every(key => this.loadedAssets.has(key));
  }

  // Comprobar si todos los assets están cargados
  public areAllAssetsLoaded(): boolean {
    const allKeys = Object.keys(assetConfigs) as AssetKey[];
    return allKeys.every(key => this.loadedAssets.has(key));
  }

  // Comprobar si un asset específico está cargado
  public isAssetLoaded(key: AssetKey): boolean {
    return this.loadedAssets.has(key);
  }

  // Obtener estadísticas de carga
  public getLoadingStats(): { loaded: number; total: number; critical: number; criticalLoaded: number } {
    const allKeys = Object.keys(assetConfigs) as AssetKey[];
    const criticalKeys = Object.entries(assetConfigs)
      .filter(([, config]) => config.preload === true)
      .map(([key]) => key as AssetKey);
    
    return {
      loaded: this.loadedAssets.size,
      total: allKeys.length,
      critical: criticalKeys.length,
      criticalLoaded: criticalKeys.filter(key => this.loadedAssets.has(key)).length
    };
  }

  // Limpiar cache y assets no utilizados
  public cleanup(): void {
    // Mantener solo assets críticos en memoria
    const criticalAssets = Object.entries(assetConfigs)
      .filter(([, config]) => config.preload === true)
      .map(([key]) => key as AssetKey);
    
    for (const [key] of this.loadedAssets) {
      if (!criticalAssets.includes(key)) {
        this.loadedAssets.delete(key);
      }
    }
    
    console.log('🧹 Asset cache limpiado');
  }
}

// Exportar instancia singleton
export const assetLoader = AssetLoader.getInstance();

// Función de ayuda para dibujar un asset en el canvas
export function drawAsset(
  ctx: CanvasRenderingContext2D, 
  key: AssetKey, 
  x: number, 
  y: number, 
  width?: number, 
  height?: number,
  rotation: number = 0
): void {
  const img = assetLoader.getAsset(key);
  if (!img) return;
  
  ctx.save();
  
  // Si hay rotación, rotar el canvas alrededor del centro de la imagen
  if (rotation !== 0) {
    ctx.translate(x, y);
    ctx.rotate(rotation);
    x = 0;
    y = 0;
  }
  
  // Dibujar la imagen
  if (width !== undefined && height !== undefined) {
    // Si se proporciona ancho y alto, dibujar con esas dimensiones
    ctx.drawImage(img, x - width/2, y - height/2, width, height);
  } else {
    // Si no, dibujar con tamaño original centrado en (x,y)
    ctx.drawImage(img, x - img.width/2, y - img.height/2);
  }
  
  ctx.restore();
} 