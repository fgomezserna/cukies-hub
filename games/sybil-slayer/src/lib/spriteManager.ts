// SpriteManager: precarga centralizada y reutilizable de los sprites del juego.

import { gamePublicPath } from './public-path';

export interface SpriteSheet {
  frames: HTMLImageElement[];
  frameCount: number;
  frameWidth?: number;
  frameHeight?: number;
}

export interface SpriteAnimation {
  currentFrame: number;
  lastFrameTime: number;
  frameRate: number;
  loop: boolean;
  playing: boolean;
}

const sequence = (basePath: string, frames: number[]): string[] =>
  frames.map(frame => `${basePath}/${frame}.png`);

const numberedSequence = (basePath: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${basePath}_${index + 1}.png`);

const cukieDirections = {
  up: { directory: 'north', abbreviation: 'n' },
  down: { directory: 'south', abbreviation: 's' },
  left: { directory: 'west', abbreviation: 'w' },
  right: { directory: 'east', abbreviation: 'e' },
  north_east: { directory: 'north_east', abbreviation: 'ne' },
  north_west: { directory: 'north_west', abbreviation: 'nw' },
  south_east: { directory: 'south_east', abbreviation: 'se' },
  south_west: { directory: 'south_west', abbreviation: 'sw' },
} as const;

const cukieSpriteGroups = Object.fromEntries(
  Object.entries(cukieDirections).map(([direction, config]) => [
    `token_${direction}`,
    Array.from({ length: 8 }, (_, index) => {
      const frame = String(index + 1).padStart(2, '0');
      return `/assets/characters/cukiesprites/${config.directory}/cukie_walk_${config.abbreviation}_${frame}.png`;
    }),
  ]),
) as Record<string, string[]>;

const feeSpriteGroups: Record<string, string[]> = {
  fee_up: sequence('/assets/characters/malvado3/north', [37, 38, 39, 41, 42, 44, 45, 47]),
  fee_down: sequence(
    '/assets/characters/malvado3/South',
    Array.from({ length: 14 }, (_, index) => index + 1),
  ),
  fee_left: sequence('/assets/characters/malvado3/west', [15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35]),
  fee_right: sequence('/assets/characters/malvado3/est', [16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36]),
  fee_north_east: sequence('/assets/characters/malvado3/north-est', [69, 71, 73, 75, 77, 79, 81, 83, 85, 87]),
  fee_north_west: sequence('/assets/characters/malvado3/north-west', [68, 70, 72, 74, 76, 78, 80, 82, 84, 86]),
  fee_south_east: sequence('/assets/characters/malvado3/south-est', [49, 51, 53, 55, 57, 59, 61, 63, 65, 67]),
  fee_south_west: sequence('/assets/characters/malvado3/south-west', [48, 50, 52, 54, 56, 58, 60, 62, 64, 66]),
};

const hackerSpriteGroups: Record<string, string[]> = {
  hacker_up: numberedSequence('/assets/characters/trumpsprites/Trump_up', 5),
  hacker_left: numberedSequence('/assets/characters/trumpsprites/Trump_left', 5),
  hacker_right: [
    '/assets/characters/trumpsprites/Trump_right_1.png',
    ...Array.from(
      { length: 4 },
      (_, index) => `/assets/characters/trumpsprites/trump_right_${index + 2}.png`,
    ),
  ],
};

export const GAME_SPRITE_GROUPS: Readonly<Record<string, readonly string[]>> = {
  ...cukieSpriteGroups,
  ...feeSpriteGroups,
  ...hackerSpriteGroups,
  mega_node: numberedSequence('/assets/collectibles/mega_node/mega_node', 3),
  purr: numberedSequence('/assets/collectibles/purr/purr', 3),
  bug: numberedSequence('/assets/characters/bug/bug', 3),
  energy: ['/assets/collectibles/gemas.png'],
  explosion: numberedSequence('/assets/effects/Explosion', 10),
  energy_explosion: numberedSequence('/assets/effects/En-Explosion', 10),
  green_explosion: numberedSequence('/assets/effects/green-Explosion', 10),
  damage: ['/assets/effects/damagecukie.png'],
};

const MAX_CONCURRENT_SPRITE_REQUESTS = 6;
const MAX_SPRITE_LOAD_ATTEMPTS = 3;

export class SpriteManager {
  private static instance: SpriteManager;
  private spriteSheets = new Map<string, SpriteSheet>();
  private animations = new Map<string, SpriteAnimation>();
  private loadedSprites = new Map<string, HTMLImageElement>();
  private inFlightSprites = new Map<string, Promise<HTMLImageElement>>();
  private gameSpritesPromise: Promise<void> | null = null;
  private activeRequests = 0;
  private requestQueue: Array<() => void> = [];

  public static getInstance(): SpriteManager {
    if (!SpriteManager.instance) {
      SpriteManager.instance = new SpriteManager();
    }
    return SpriteManager.instance;
  }

  public loadGameSprites(onProgress?: (progress: number) => void): Promise<void> {
    if (this.gameSpritesPromise) return this.gameSpritesPromise;

    const paths = Array.from(new Set(Object.values(GAME_SPRITE_GROUPS).flat()));
    let completed = 0;

    this.gameSpritesPromise = Promise.all(
      paths.map(path =>
        this.loadSingleSprite(path).then(() => {
          completed += 1;
          onProgress?.(completed / paths.length);
        }),
      ),
    )
      .then(() => {
        for (const [key, groupPaths] of Object.entries(GAME_SPRITE_GROUPS)) {
          const frames = groupPaths
            .map(path => this.loadedSprites.get(path))
            .filter((image): image is HTMLImageElement => Boolean(image && this.isImageReady(image)));

          if (frames.length !== groupPaths.length) {
            throw new Error(`Incomplete sprite group: ${key}`);
          }

          const normalizedFrames = key === 'energy'
            ? Array.from({ length: 6 }, () => frames[0])
            : frames;
          this.spriteSheets.set(key, {
            frames: normalizedFrames,
            frameCount: normalizedFrames.length,
          });
        }

        console.log(`✅ ${paths.length} sprites preparados con concurrencia limitada`);
      })
      .catch(error => {
        this.gameSpritesPromise = null;
        throw error;
      });

    return this.gameSpritesPromise;
  }

  public loadSingleSprite(path: string): Promise<HTMLImageElement> {
    const cached = this.loadedSprites.get(path);
    if (cached && this.isImageReady(cached)) {
      return Promise.resolve(cached);
    }

    const inFlight = this.inFlightSprites.get(path);
    if (inFlight) return inFlight;

    const loadPromise = this.loadSpriteWithRetry(path)
      .then(image => {
        this.loadedSprites.set(path, image);
        return image;
      })
      .finally(() => {
        this.inFlightSprites.delete(path);
      });

    this.inFlightSprites.set(path, loadPromise);
    return loadPromise;
  }

  public areGameSpritesLoaded(): boolean {
    return Object.entries(GAME_SPRITE_GROUPS).every(([key, paths]) => {
      const sheet = this.spriteSheets.get(key);
      const expectedFrames = key === 'energy' ? 6 : paths.length;
      return Boolean(
        sheet &&
        sheet.frameCount === expectedFrames &&
        sheet.frames.every(image => this.isImageReady(image)),
      );
    });
  }

  public getSpriteSheet(key: string): SpriteSheet | null {
    return this.spriteSheets.get(key) ?? null;
  }

  public getCurrentFrame(key: string): HTMLImageElement | null {
    const animation = this.animations.get(key);
    const spriteSheet = this.spriteSheets.get(key);
    if (!animation || !spriteSheet) return null;

    const frameIndex = Math.floor(animation.currentFrame) % spriteSheet.frameCount;
    return spriteSheet.frames[frameIndex] ?? null;
  }

  public createAnimation(key: string, frameRate = 100, loop = true): void {
    this.animations.set(key, {
      currentFrame: 0,
      lastFrameTime: Date.now(),
      frameRate,
      loop,
      playing: true,
    });
  }

  public updateAnimations(): void {
    const now = Date.now();
    for (const [key, animation] of this.animations) {
      if (!animation.playing) continue;

      if (now - animation.lastFrameTime < animation.frameRate) continue;
      const spriteSheet = this.spriteSheets.get(key);
      if (!spriteSheet) continue;

      animation.currentFrame += 1;
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

  public cleanup(): void {
    this.spriteSheets.clear();
    this.loadedSprites.clear();
    this.inFlightSprites.clear();
    this.gameSpritesPromise = null;
    console.log('🧹 Caché de sprites en memoria limpiada');
  }

  public getStats(): { spriteSheets: number; cachedImages: number; animations: number } {
    return {
      spriteSheets: this.spriteSheets.size,
      cachedImages: this.loadedSprites.size,
      animations: this.animations.size,
    };
  }

  private async loadSpriteWithRetry(path: string): Promise<HTMLImageElement> {
    await this.acquireRequestSlot();
    try {
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= MAX_SPRITE_LOAD_ATTEMPTS; attempt += 1) {
        try {
          return await this.loadImage(path);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(`Failed to load sprite: ${path}`);
          if (attempt < MAX_SPRITE_LOAD_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, 300 * 2 ** (attempt - 1)));
          }
        }
      }

      throw lastError ?? new Error(`Failed to load sprite: ${path}`);
    } finally {
      this.releaseRequestSlot();
    }
  }

  private loadImage(path: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (this.isImageReady(image)) {
          resolve(image);
        } else {
          reject(new Error(`Invalid sprite response: ${path}`));
        }
      };
      image.onerror = () => reject(new Error(`Failed to load sprite: ${path}`));
      image.src = gamePublicPath(path);
    });
  }

  private acquireRequestSlot(): Promise<void> {
    if (this.activeRequests < MAX_CONCURRENT_SPRITE_REQUESTS) {
      this.activeRequests += 1;
      return Promise.resolve();
    }

    return new Promise(resolve => {
      this.requestQueue.push(() => {
        this.activeRequests += 1;
        resolve();
      });
    });
  }

  private releaseRequestSlot(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.requestQueue.shift()?.();
  }

  private isImageReady(image: HTMLImageElement): boolean {
    return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  }
}

export const spriteManager = SpriteManager.getInstance();
