// AssetLoader: Sistema de carga y gestión de imágenes para el juego

// Tipos para los assets
export type AssetKey = 
  // Personajes
  | 'token'
  
  // Obstáculos
  | 'fee'
  | 'bug'
  | 'hacker'
  
  // Coleccionables
  // | 'energy' // ELIMINADO: Se usan sprites animados
  | 'megaNode'
  | 'checkpoint'
  | 'heart'
  
  // Efectos
  | 'boost'
  | 'glow'
  | 'frenzy'
  
  // UI
  | 'gameOver'
  | 'paused'
  | 'startScreen'
  | 'scoreIcon'
  | 'timerIcon';

// Mapeo de claves a rutas de archivos
const assetPaths: Record<AssetKey, string> = {
  // Personajes
  token: '/assets/characters/token.png',
  
  // Obstáculos
  fee: '/assets/obstacles/fee.png',
  bug: '/assets/obstacles/bug.png',
  hacker: '/assets/obstacles/trump.png',
  
  // Coleccionables
  // energy: '/assets/collectibles/energy.png', // ELIMINADO: Se usan sprites animados
  megaNode: '/assets/collectibles/mega_node.png',
  checkpoint: '/assets/collectibles/checkpoint.png',
  heart: '/assets/collectibles/heart.png',
  
  // Efectos
  boost: '/assets/effects/boost.png',
  glow: '/assets/effects/glow.png',
  frenzy: '/assets/effects/frenzy.png',
  
  // UI
  gameOver: '/assets/ui/game_over.png',
  paused: '/assets/ui/paused.png',
  startScreen: '/assets/ui/start_screen.png',
  scoreIcon: '/assets/ui/score_icon.png',
  timerIcon: '/assets/ui/timer_icon.png',
};

// Clase AssetLoader
export class AssetLoader {
  private static instance: AssetLoader;
  private loadedAssets: Map<AssetKey, HTMLImageElement> = new Map();
  private loading = false;
  private loadPromise: Promise<void> | null = null;
  private onProgressCallback: ((progress: number) => void) | null = null;

  // Singleton
  public static getInstance(): AssetLoader {
    if (!AssetLoader.instance) {
      AssetLoader.instance = new AssetLoader();
    }
    return AssetLoader.instance;
  }

  // Precargar todos los assets
  public preloadAll(onProgress?: (progress: number) => void): Promise<void> {
    if (this.loading) return this.loadPromise as Promise<void>;
    
    this.onProgressCallback = onProgress || null;
    this.loading = true;

    const assetKeys = Object.keys(assetPaths) as AssetKey[];
    const totalAssets = assetKeys.length;
    let loadedCount = 0;

    this.loadPromise = new Promise<void>((resolve, reject) => {
      // Si no hay assets para cargar, resolver inmediatamente
      if (totalAssets === 0) {
        this.loading = false;
        resolve();
        return;
      }

      // Función para actualizar progreso
      const updateProgress = () => {
        loadedCount++;
        const progress = loadedCount / totalAssets;
        if (this.onProgressCallback) {
          this.onProgressCallback(progress);
        }

        // Si todos los assets han sido cargados, resolver la promesa
        if (loadedCount === totalAssets) {
          this.loading = false;
          resolve();
        }
      };

      // Cargar cada asset
      assetKeys.forEach((key) => {
        const img = new Image();
        img.onload = () => {
          this.loadedAssets.set(key, img);
          updateProgress();
        };
        img.onerror = (e) => {
          console.error(`Error loading asset: ${key}`, e);
          updateProgress();
        };
        img.src = assetPaths[key];
      });
    });

    return this.loadPromise;
  }

  // Obtener un asset
  public getAsset(key: AssetKey): HTMLImageElement | null {
    return this.loadedAssets.get(key) || null;
  }

  // Comprobar si todos los assets están cargados
  public areAllAssetsLoaded(): boolean {
    return Object.keys(assetPaths).length === this.loadedAssets.size;
  }

  // Comprobar si un asset específico está cargado
  public isAssetLoaded(key: AssetKey): boolean {
    return this.loadedAssets.has(key);
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