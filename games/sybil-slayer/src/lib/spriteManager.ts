// SpriteManager: Sistema optimizado para manejo de sprites y animaciones

import { AssetLoader } from './assetLoader';

export interface SpriteSheet {
  frames: HTMLImageElement[];
  frameCount: number;
  frameWidth?: number;
  frameHeight?: number;
}

export interface SpriteAnimation {
  currentFrame: number;
  lastFrameTime: number;
  frameRate: number; // ms per frame
  loop: boolean;
  playing: boolean;
}

export class SpriteManager {
  private static instance: SpriteManager;
  private assetLoader: AssetLoader;
  private spriteSheets: Map<string, SpriteSheet> = new Map();
  private animations: Map<string, SpriteAnimation> = new Map();
  private loadedSprites: Map<string, HTMLImageElement> = new Map();

  constructor() {
    this.assetLoader = AssetLoader.getInstance();
  }

  public static getInstance(): SpriteManager {
    if (!SpriteManager.instance) {
      SpriteManager.instance = new SpriteManager();
    }
    return SpriteManager.instance;
  }

  // Cargar sprites de forma eficiente con concurrencia limitada
  public async loadSpriteSequence(
    basePath: string, 
    count: number, 
    key: string,
    startIndex: number = 1
  ): Promise<SpriteSheet> {
    const frames: HTMLImageElement[] = [];
    const loadPromises: Promise<HTMLImageElement>[] = [];

    // Crear promesas para cada frame
    for (let i = startIndex; i < startIndex + count; i++) {
      const promise = this.loadSingleSprite(`${basePath}_${i}.png`);
      loadPromises.push(promise);
    }

    try {
      // Cargar todos los frames en paralelo
      const loadedFrames = await Promise.all(loadPromises);
      frames.push(...loadedFrames);

      const spriteSheet: SpriteSheet = {
        frames,
        frameCount: count
      };

      this.spriteSheets.set(key, spriteSheet);
      console.log(`✅ SpriteSheet '${key}' cargado con ${count} frames`);
      
      return spriteSheet;
    } catch (error) {
      console.error(`❌ Error cargando sprite sequence '${key}':`, error);
      throw error;
    }
  }

  // Cargar sprite individual con cache
  public async loadSingleSprite(path: string): Promise<HTMLImageElement> {
    // Verificar cache primero
    if (this.loadedSprites.has(path)) {
      return this.loadedSprites.get(path)!;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        this.loadedSprites.set(path, img);
        resolve(img);
      };
      
      img.onerror = () => {
        reject(new Error(`Failed to load sprite: ${path}`));
      };
      
      img.src = path;
    });
  }

  // Cargar sprites direccionales (up, down, left, right)
  public async loadDirectionalSprites(
    basePath: string, 
    framesPerDirection: number,
    key: string
  ): Promise<Record<string, SpriteSheet>> {
    const directions = ['up', 'down', 'left', 'right'];
    const directionalSheets: Record<string, SpriteSheet> = {};

    const loadPromises = directions.map(async direction => {
      const frames: HTMLImageElement[] = [];
      const framePromises: Promise<HTMLImageElement>[] = [];

      for (let i = 1; i <= framesPerDirection; i++) {
        const spritePath = `${basePath}_${direction}_${i}.png`;
        framePromises.push(this.loadSingleSprite(spritePath));
      }

      try {
        const loadedFrames = await Promise.all(framePromises);
        frames.push(...loadedFrames);

        directionalSheets[direction] = {
          frames,
          frameCount: framesPerDirection
        };
      } catch (error) {
        console.warn(`⚠️ Error cargando sprites direccionales para ${direction}:`, error);
        // Continuar con otras direcciones aunque una falle
      }
    });

    await Promise.all(loadPromises);
    
    console.log(`✅ Sprites direccionales '${key}' cargados para ${Object.keys(directionalSheets).length} direcciones`);
    return directionalSheets;
  }

  // Cargar sprites del personaje Cukie con esquema propio de archivos
  public async loadCukieDirectionalSprites(
    keyPrefix: string,
    framesPerDirection: number = 8
  ): Promise<void> {
    const configs = [
      { dir: 'north', abbr: 'n', key: `${keyPrefix}_up` },
      { dir: 'south', abbr: 's', key: `${keyPrefix}_down` },
      { dir: 'west', abbr: 'w', key: `${keyPrefix}_left` },
      { dir: 'east', abbr: 'e', key: `${keyPrefix}_right` },
      { dir: 'north_east', abbr: 'ne', key: `${keyPrefix}_north_east` },
      { dir: 'north_west', abbr: 'nw', key: `${keyPrefix}_north_west` },
      { dir: 'south_east', abbr: 'se', key: `${keyPrefix}_south_east` },
      { dir: 'south_west', abbr: 'sw', key: `${keyPrefix}_south_west` }
    ];

    const pad2 = (n: number) => n.toString().padStart(2, '0');

    const tasks = configs.map(async ({ dir, abbr, key }) => {
      const frames: HTMLImageElement[] = [];
      for (let i = 1; i <= framesPerDirection; i++) {
        const path = `/assets/characters/cukiesprites/${dir}/cukie_walk_${abbr}_${pad2(i)}.png`;
        try {
          const img = await this.loadSingleSprite(path);
          frames.push(img);
        } catch (e) {
          console.error(`❌ Error cargando Cukie sprite: ${path}`);
        }
      }
      if (frames.length) {
        this.spriteSheets.set(key, { frames, frameCount: frames.length });
      }
    });

    await Promise.all(tasks);
  }

  // Obtener sprite sheet
  public getSpriteSheet(key: string): SpriteSheet | null {
    return this.spriteSheets.get(key) || null;
  }

  // Obtener frame específico de una animación
  public getCurrentFrame(key: string): HTMLImageElement | null {
    const animation = this.animations.get(key);
    const spriteSheet = this.spriteSheets.get(key);
    
    if (!animation || !spriteSheet) return null;
    
    const frameIndex = Math.floor(animation.currentFrame) % spriteSheet.frameCount;
    return spriteSheet.frames[frameIndex] || null;
  }

  // Crear animación
  public createAnimation(
    key: string, 
    frameRate: number = 100, 
    loop: boolean = true
  ): void {
    this.animations.set(key, {
      currentFrame: 0,
      lastFrameTime: Date.now(),
      frameRate,
      loop,
      playing: true
    });
  }

  // Actualizar animaciones
  public updateAnimations(deltaTime: number): void {
    const now = Date.now();
    
    for (const [key, animation] of this.animations) {
      if (!animation.playing) continue;
      
      const timeSinceLastFrame = now - animation.lastFrameTime;
      
      if (timeSinceLastFrame >= animation.frameRate) {
        const spriteSheet = this.spriteSheets.get(key);
        if (!spriteSheet) continue;
        
        animation.currentFrame++;
        
        if (animation.currentFrame >= spriteSheet.frameCount) {
          if (animation.loop) {
            animation.currentFrame = 0;
          } else {
            animation.currentFrame = spriteSheet.frameCount - 1;
            animation.playing = false;
          }
        }
        
        animation.lastFrameTime = now;
      }
    }
  }

  // Batch loading para todos los sprites del juego
  public async loadGameSprites(): Promise<void> {
    console.log('🎮 Iniciando carga batch de sprites del juego...');
    
    const loadPromises: Promise<any>[] = [];

    try {
      // Cargar sprites básicos de personajes
      loadPromises.push(
        // Nuevo personaje: Cukie (usa su propio esquema de nombres)
        this.loadCukieDirectionalSprites('token'),
        // Para animación de carrera reutilizamos la misma secuencia por ahora
        this.loadCukieDirectionalSprites('token_run'),
        this.loadDirectionalSprites('/assets/characters/feesprites/fee', 6, 'fee'),
        (async () => {
          // Cargar una única imagen de recurso y duplicarla como 6 frames para 'energy'
          try {
            const resource = await this.loadSingleSprite('/assets/collectibles/gemas.png');
            const frames = Array.from({ length: 6 }, () => resource);
            this.spriteSheets.set('energy', { frames, frameCount: 6 });
            console.log("✅ SpriteSheet 'energy' cargado usando gemas.png (6 frames repetidos)");
          } catch (e) {
            console.warn('⚠️ gemas.png no encontrado, usando sprites antiguos de energy numerados');
            await this.loadSpriteSequence('/assets/collectibles/energy/energy', 6, 'energy');
          }
        })(),
        this.loadSpriteSequence('/assets/collectibles/mega_node/mega_node', 3, 'mega_node'),
        this.loadSpriteSequence('/assets/collectibles/purr/purr', 3, 'purr'),
        this.loadSpriteSequence('/assets/characters/bug/bug', 3, 'bug')
      );

      // Cargar sprites de efectos
      loadPromises.push(
        this.loadSpriteSequence('/assets/effects/Explosion', 10, 'explosion'),
        this.loadSpriteSequence('/assets/effects/En-Explosion', 10, 'energy_explosion'),
        this.loadSpriteSequence('/assets/effects/green-Explosion', 10, 'green_explosion')
      );

      // Cargar sprites de hacker (con lógica especial para nombres inconsistentes)
      loadPromises.push(this.loadHackerSprites());

      // Ejecutar todas las cargas en paralelo
      await Promise.all(loadPromises);
      
      console.log('✨ Carga batch de sprites completada exitosamente');
      
    } catch (error) {
      console.error('❌ Error en carga batch de sprites:', error);
      throw error;
    }
  }

  // Método especial para cargar sprites del hacker con nombres inconsistentes
  private async loadHackerSprites(): Promise<void> {
    const directions = ['up', 'left', 'right'];
    const hackerSheets: Record<string, SpriteSheet> = {};

    for (const direction of directions) {
      const frames: HTMLImageElement[] = [];
      
      for (let i = 1; i <= 5; i++) {
        try {
          // Intentar primero con 'Trump'
          let fileName = direction === 'right' && i > 1 ? 'trump' : 'Trump';
          let spritePath = `/assets/characters/trumpsprites/${fileName}_${direction}_${i}.png`;
          
          const img = await this.loadSingleSprite(spritePath);
          frames.push(img);
        } catch (error) {
          console.warn(`⚠️ Fallback para hacker sprite ${direction}_${i}`);
          // Fallback con nombre alternativo
          try {
            let altFileName = direction === 'right' && i > 1 ? 'Trump' : 'trump';
            let altPath = `/assets/characters/trumpsprites/${altFileName}_${direction}_${i}.png`;
            const altImg = await this.loadSingleSprite(altPath);
            frames.push(altImg);
          } catch (altError) {
            console.error(`❌ No se pudo cargar hacker sprite ${direction}_${i}`);
          }
        }
      }
      
      if (frames.length > 0) {
        hackerSheets[direction] = {
          frames,
          frameCount: frames.length
        };
      }
    }

    // Guardar los sprites del hacker
    for (const [direction, sheet] of Object.entries(hackerSheets)) {
      this.spriteSheets.set(`hacker_${direction}`, sheet);
    }
    
    console.log('✅ Sprites del hacker cargados');
  }

  // Limpiar cache de sprites no utilizados
  public cleanup(): void {
    // Mantener solo sprites esenciales
    const essentialSprites = ['token_normal', 'token_run', 'fee', 'energy', 'mega_node'];
    
    for (const [key] of this.spriteSheets) {
      if (!essentialSprites.some(essential => key.includes(essential))) {
        this.spriteSheets.delete(key);
      }
    }
    
    // Limpiar cache de imágenes también
    this.loadedSprites.clear();
    
    console.log('🧹 Cache de sprites limpiado');
  }

  // Obtener estadísticas de sprites cargados
  public getStats(): { spriteSheets: number; cachedImages: number; animations: number } {
    return {
      spriteSheets: this.spriteSheets.size,
      cachedImages: this.loadedSprites.size,
      animations: this.animations.size
    };
  }
}

// Exportar instancia singleton
export const spriteManager = SpriteManager.getInstance();