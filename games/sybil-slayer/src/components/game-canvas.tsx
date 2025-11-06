"use client";

import React, { useRef, useEffect, useCallback } from 'react';
import { assetLoader } from '@/lib/assetLoader';
import type { GameState, Token, Obstacle, Collectible, DirectionType, RayHazard, RedZone } from '@/types/game';
import {
    TOKEN_COLOR, FEE_COLOR, BUG_COLOR, HACKER_COLOR,
    ENERGY_POINT_COLOR, MEGA_NODE_COLOR, SCORE_FONT, TIMER_FONT,
    MESSAGE_FONT, PAUSE_FONT, PRIMARY_COLOR_CSS, FOREGROUND_COLOR_CSS,
    DESTRUCTIVE_COLOR_CSS, ACCENT_COLOR_CSS,
    FEE_RADIUS, RUNE_CONFIG,
    GOAT_ELIMINATION_DURATION_MS, GOAT_SKIN_COLOR,
    RED_ZONE_WARNING_DURATION_MS
} from '@/lib/constants';

interface GameCanvasProps {
  gameState: GameState;
  width: number;
  height: number;
  energyCollectedFlag?: number;
  damageFlag?: number;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, width, height, energyCollectedFlag, damageFlag }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // ✅ HELPER: Función para calcular tiempo pausable para animaciones
  const getAnimationTime = useCallback(() => {
    if (gameState.status === 'paused') {
      // Durante pausa, usar un tiempo fijo para "congelar" animaciones
      return gameState.gameStartTime || 0;
    }
    return gameState.gameStartTime ? (Date.now() - gameState.gameStartTime) : Date.now();
  }, [gameState.status, gameState.gameStartTime]);

  const gridImgRef = useRef<HTMLImageElement | null>(null);
  const tokenImgRef = useRef<HTMLImageElement | null>(null);
  const feeImgRef = useRef<HTMLImageElement | null>(null);
  const bugImgRef = useRef<HTMLImageElement | null>(null);
  const hackerImgRef = useRef<HTMLImageElement | null>(null);
  const walletImgRef = useRef<HTMLImageElement | null>(null);
  // ELIMINADO: energyImgRef ya no se usa (se usan sprites animados)
  const megaNodeImgRef = useRef<HTMLImageElement | null>(null);
  const heartImgRef = useRef<HTMLImageElement | null>(null);
  const vaulImgRef = useRef<HTMLImageElement | null>(null);
  const watchSandImgRef = useRef<HTMLImageElement | null>(null);
  const barrImgRef = useRef<HTMLImageElement | null>(null);
  const progressBarrImgRef = useRef<HTMLImageElement | null>(null);
  const checkpointImgRef = useRef<HTMLImageElement | null>(null);
  // ELIMINADO: pauseOverlayImgRef ya no se usa (overlay manejado en game-container.tsx)
  const gameOverImgRef = useRef<HTMLImageElement | null>(null);
  const walletGameOverImgRef = useRef<HTMLImageElement | null>(null); // Nueva ref para wallet_gameover.png
  const gameOverTimeImgRef = useRef<HTMLImageElement | null>(null); // Ref para gameover_time.png
  const gameOverVidasImgRef = useRef<HTMLImageElement | null>(null); // Ref para gameover_vidas.png
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = React.useState({ width, height });
  
  // OPTIMIZACIÓN: Sistema centralizado de carga de assets
  const [assetsLoaded, setAssetsLoaded] = React.useState<{[key: string]: boolean}>({});
  const [assetLoadErrors, setAssetLoadErrors] = React.useState<{[key: string]: string[]}>({});
  const retryCountRef = useRef<{[key: string]: number}>({});
  
  // Función optimizada para cargar imágenes con retry y mejor manejo de errores
  const loadImageOptimized = useCallback((src: string, ref: React.MutableRefObject<HTMLImageElement | null>, assetKey: string, maxRetries = 3) => {
    const img = new Image();
    const retryCount = retryCountRef.current[assetKey] || 0;
    
    img.onload = () => {
      ref.current = img;
      setAssetsLoaded(prev => ({ ...prev, [assetKey]: true }));
      // Limpiar errores previos si la carga fue exitosa
      setAssetLoadErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[assetKey];
        return newErrors;
      });
      console.log(`✅ Asset cargado: ${assetKey}`);
    };
    
    img.onerror = (e) => {
      console.error(`❌ Error cargando ${assetKey} (${src}):`, e);
      
      if (retryCount < maxRetries) {
        // Intentar nuevamente después de un breve delay
        setTimeout(() => {
          retryCountRef.current[assetKey] = retryCount + 1;
          console.log(`🔄 Reintentando cargar ${assetKey} (intento ${retryCount + 1}/${maxRetries})`);
          loadImageOptimized(src, ref, assetKey, maxRetries);
        }, 1000 * (retryCount + 1)); // Delay progresivo
      } else {
        setAssetLoadErrors(prev => ({
          ...prev,
          [assetKey]: [...(prev[assetKey] || []), `Failed after ${maxRetries} retries: ${e}`]
        }));
        console.error(`💥 Asset ${assetKey} falló definitivamente después de ${maxRetries} intentos`);
      }
    };
    
    img.src = src;
  }, []);
  
  // OPTIMIZACIÓN: Función para cargar sprites en batch con mejor organización
  const loadSpriteBatch = useCallback((
    basePath: string, 
    spriteRef: React.MutableRefObject<HTMLImageElement[]>, 
    assetKey: string, 
    count: number, 
    startIndex = 1
  ) => {
    const sprites: HTMLImageElement[] = [];
    let loadedCount = 0;
    
    for (let i = startIndex; i < startIndex + count; i++) {
      const img = new Image();
      const spriteSrc = `${basePath}_${i}.png`;
      
      img.onload = () => {
        sprites[i - startIndex] = img;
        loadedCount++;
        
        if (loadedCount === count) {
          spriteRef.current = sprites;
          setAssetsLoaded(prev => ({ ...prev, [assetKey]: true }));
          console.log(`✅ Batch de sprites cargado: ${assetKey} (${count} imágenes)`);
        }
      };
      
      img.onerror = (e) => {
        console.error(`❌ Error cargando sprite ${spriteSrc}:`, e);
        setAssetLoadErrors(prev => ({
          ...prev,
          [assetKey]: [...(prev[assetKey] || []), `Sprite ${i}: ${e}`]
        }));
      };
      
      img.src = spriteSrc;
    }
  }, []);
  
  // Referencias para los sprites animados del mega node
  const megaNodeSprite1Ref = useRef<HTMLImageElement | null>(null);
  const megaNodeSprite2Ref = useRef<HTMLImageElement | null>(null);
  const megaNodeSprite3Ref = useRef<HTMLImageElement | null>(null);
  
  // Referencias para los sprites animados de purr
  const purrSprite1Ref = useRef<HTMLImageElement | null>(null);
  const purrSprite2Ref = useRef<HTMLImageElement | null>(null);
  const purrSprite3Ref = useRef<HTMLImageElement | null>(null);
  const purrSprite4Ref = useRef<HTMLImageElement | null>(null);
  
  // Referencias para los sprites animados del bug
  const bugSprite1Ref = useRef<HTMLImageElement | null>(null);
  const bugSprite2Ref = useRef<HTMLImageElement | null>(null);
  const bugSprite3Ref = useRef<HTMLImageElement | null>(null);
  
  // Referencias para los sprites animados
  const feeSpritesRef = useRef<Record<DirectionType, HTMLImageElement[]>>({
    up: [],
    down: [],
    left: [],
    right: [],
    north_east: [],
    north_west: [],
    south_east: [],
    south_west: [],
  });
  
  // Referencias para los sprites del hacker (Trump)
  const hackerSpritesRef = useRef<Record<'up' | 'left' | 'right', HTMLImageElement[]>>({
    up: [],
    left: [],
    right: []
  });
  
  // Referencias para los sprites animados del token (personaje principal)
  const tokenSpritesRef = useRef<Record<DirectionType, HTMLImageElement[]>>({
    up: [],
    down: [],
    left: [],
    right: [],
    north_east: [],
    north_west: [],
    south_east: [],
    south_west: []
  });
  // Referencias para los sprites de boost (run)
  const tokenRunSpritesRef = useRef<Record<DirectionType, HTMLImageElement[]>>({
    up: [],
    down: [],
    left: [],
    right: [],
    north_east: [],
    north_west: [],
    south_east: [],
    south_west: []
  });
  // Contador de frames para la animación del token
  const tokenFrameCounterRef = useRef<number>(0);
  
  // Referencias para los sprites animados de energía
  const energySpritesRef = useRef<HTMLImageElement[]>([]);
  // Contador de frames para la animación de energía
  const energyFrameCounterRef = useRef<number>(0);
  
  // Referencias para los sprites de explosión (efecto boost)
  const explosionSpritesRef = useRef<HTMLImageElement[]>([]);
  // Referencias para los sprites de explosión de energía
  const enExplosionSpritesRef = useRef<HTMLImageElement[]>([]);
  // Referencias para los sprites de explosión verde (para heart y mega_node)
  const greenExplosionSpritesRef = useRef<HTMLImageElement[]>([]);
  // Estado para controlar la animación de explosión boost
  const [explosion, setExplosion] = React.useState<{active: boolean, frame: number, x: number, y: number, start: number} | null>(null);
  // Estado para controlar la animación de explosión de energía
  const [enExplosion, setEnExplosion] = React.useState<{active: boolean, frame: number, x: number, y: number, start: number} | null>(null);
  // Estado para controlar las animaciones de explosión verde (para heart y mega_node)
  const [greenExplosions, setGreenExplosions] = React.useState<{active: boolean, frame: number, x: number, y: number, start: number, type: 'heart' | 'megaNode' | 'purr' | 'vaul'}[]>([]);
  const prevBoostRef = useRef<number>(0);
  
  // Ref para la última posición del token al recoger energía
  const lastEnergyPosRef = useRef<{x: number, y: number}>({x: 0, y: 0});
  
  // Referencia para el sprite de daño
  const damageImgRef = useRef<HTMLImageElement | null>(null);
  // Estado para controlar la animación de daño
  const [damageEffect, setDamageEffect] = React.useState<{active: boolean, start: number} | null>(null);
  const prevDamageTimeRef = useRef<number>(0);
  const prevDamageFlagRef = useRef(damageFlag);
  
  // Referencia para la imagen de arenas movedizas
  const quicksandImgRef = useRef<HTMLImageElement | null>(null);
  
  // Rastrear los collectibles previos para detectar desapariciones
  const prevCollectiblesRef = useRef<Collectible[]>([]);
  
  // Cargar imágenes una vez al montar el componente
  useEffect(() => {
    // Cargar imagen de fondo (pantallajuego)
    const gridImg = new Image();
    gridImg.src = '/assets/ui/game-container/pantallajuego3.png';
    gridImg.onload = () => {
      gridImgRef.current = gridImg;
    };
    
    // Cargar imagen del token (jugador)
    const tokenImg = new Image();
    tokenImg.src = '/assets/characters/token.png';
    tokenImg.onload = () => {
      tokenImgRef.current = tokenImg;
    };
    
    // Cargar imagen de fee (obstáculo)
    const feeImg = new Image();
    feeImg.src = '/assets/obstacles/fee.png';
    feeImg.onload = () => {
      feeImgRef.current = feeImg;
    };
    
    // Cargar imagen de bug (obstáculo)
    const bugImg = new Image();
    bugImg.src = '/assets/obstacles/bug.png';
    bugImg.onload = () => {
      bugImgRef.current = bugImg;
    };
    
    // Cargar imagen de wallet para mostrar sobre el bug
    const walletImg = new Image();
    walletImg.src = '/assets/collectibles/wallet_2.png';
    walletImg.onload = () => {
      console.log('✅ Imagen wallet_2.png cargada exitosamente');
      walletImgRef.current = walletImg;
    };
    walletImg.onerror = (e) => {
      console.error('❌ Error cargando wallet_2.png:', e);
    };
    
    // Cargar imagen de hacker (obstáculo - Trump)
    const hackerImg = new Image();
    hackerImg.src = '/assets/obstacles/trump.png';
    hackerImg.onload = () => {
      console.log('✅ Imagen trump.png cargada EXITOSAMENTE');
      hackerImgRef.current = hackerImg;
    };
    hackerImg.onerror = (e) => {
      console.error('❌ Error cargando trump.png:', e);
    };
    
    // ELIMINADO: Ya no necesitamos cargar la imagen estática de energía
    // porque ahora usamos sprites animados de energía
    
    // Cargar imagen de Haku (antes mega node) - respaldo por si fallan los sprites
    const megaNodeImg = new Image();
    megaNodeImg.src = '/assets/collectibles/haku.png';
    megaNodeImg.onload = () => {
      megaNodeImgRef.current = megaNodeImg;
    };
    
    // Cargar sprites animados del mega nodo
    const megaNodeSprite1 = new Image();
    megaNodeSprite1.src = '/assets/collectibles/mega_node/mega_node_1.png';
    megaNodeSprite1.onload = () => {
      console.log('✅ Sprite mega_node_1.png cargado EXITOSAMENTE');
      megaNodeSprite1Ref.current = megaNodeSprite1;
    };
    megaNodeSprite1.onerror = (e) => {
      console.error('❌ Error cargando mega_node_1.png:', e);
    };
    
    const megaNodeSprite2 = new Image();
    megaNodeSprite2.src = '/assets/collectibles/mega_node/mega_node_2.png';
    megaNodeSprite2.onload = () => {
      console.log('✅ Sprite mega_node_2.png cargado EXITOSAMENTE');
      megaNodeSprite2Ref.current = megaNodeSprite2;
    };
    megaNodeSprite2.onerror = (e) => {
      console.error('❌ Error cargando mega_node_2.png:', e);
    };
    
    const megaNodeSprite3 = new Image();
    megaNodeSprite3.src = '/assets/collectibles/mega_node/mega_node_3.png';
    megaNodeSprite3.onload = () => {
      console.log('✅ Sprite mega_node_3.png cargado EXITOSAMENTE');
      megaNodeSprite3Ref.current = megaNodeSprite3;
    };
    megaNodeSprite3.onerror = (e) => {
      console.error('❌ Error cargando mega_node_3.png:', e);
    };
    
    // Cargar sprites animados para fees
    // - Para right (este), usar sprites de malvado3/est (11 frames: 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36)
    // - Para left (oeste), usar sprites de malvado3/west (11 frames: 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35)
    // - Para up (norte), usar sprites de malvado3/north (8 frames: 37, 38, 39, 41, 42, 44, 45, 47)
    // - Para down (sur), usar 14 frames (1..14) de malvado3/South
    // - Para direcciones diagonales, usar 10 frames cada una:
    //   - north-west: 68, 70, 72, 74, 76, 78, 80, 82, 84, 86
    //   - north-est: 69, 71, 73, 75, 77, 79, 81, 83, 85, 87
    //   - south-west: 48, 50, 52, 54, 56, 58, 60, 62, 64, 66
    //   - south-est: 49, 51, 53, 55, 57, 59, 61, 63, 65, 67
    const directions: DirectionType[] = ['up', 'down', 'left', 'right', 'north_west', 'north_east', 'south_west', 'south_east'];
    
    directions.forEach(direction => {
      if (direction === 'right') {
        // Cargar sprites de est (este) - 11 frames con números pares
        const estFrames = [16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36];
        estFrames.forEach((frameNum, index) => {
          const img = new Image();
          img.src = `/assets/characters/malvado3/est/${frameNum}.png`;
          img.onload = () => {
            feeSpritesRef.current[direction][index] = img;
            if (index === estFrames.length - 1) {
              console.log(`✅ Sprites malvado3/est cargados para fee dirección ${direction} (11 frames)`);
            }
          };
          img.onerror = (e) => {
            console.error(`❌ Error cargando malvado3/est/${frameNum}.png para dirección ${direction}:`, e);
          };
        });
      } else if (direction === 'left') {
        // Cargar sprites de west (oeste) - 11 frames con números impares
        const westFrames = [15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35];
        westFrames.forEach((frameNum, index) => {
          const img = new Image();
          img.src = `/assets/characters/malvado3/west/${frameNum}.png`;
          img.onload = () => {
            feeSpritesRef.current[direction][index] = img;
            if (index === westFrames.length - 1) {
              console.log(`✅ Sprites malvado3/west cargados para fee dirección ${direction} (11 frames)`);
            }
          };
          img.onerror = (e) => {
            console.error(`❌ Error cargando malvado3/west/${frameNum}.png para dirección ${direction}:`, e);
          };
        });
      } else if (direction === 'up') {
        // Cargar sprites de north (norte) - 8 frames
        const northFrames = [37, 38, 39, 41, 42, 44, 45, 47];
        northFrames.forEach((frameNum, index) => {
          const img = new Image();
          img.src = `/assets/characters/malvado3/north/${frameNum}.png`;
          img.onload = () => {
            feeSpritesRef.current[direction][index] = img;
            if (index === northFrames.length - 1) {
              console.log(`✅ Sprites malvado3/north cargados para fee dirección ${direction} (8 frames)`);
            }
          };
          img.onerror = (e) => {
            console.error(`❌ Error cargando malvado3/north/${frameNum}.png para dirección ${direction}:`, e);
          };
        });
      } else if (direction === 'down') {
        // Para down, usar South (14 frames)
        for (let i = 1; i <= 14; i++) {
          const img = new Image();
          img.src = `/assets/characters/malvado3/South/${i}.png`;
          img.onload = () => {
            feeSpritesRef.current[direction][i - 1] = img; // normalizar a índice 0..13
            if (i === 14) {
              console.log(`✅ Sprites malvado3 (South 1-14) cargados para fee dirección ${direction} (14 frames)`);
            }
          };
          img.onerror = (e) => {
            console.error(`❌ Error cargando malvado3/South/${i}.png para dirección ${direction}:`, e);
          };
        }
      } else if (direction === 'north_west') {
        // Cargar sprites de north-west (noroeste) - 10 frames
        const northWestFrames = [68, 70, 72, 74, 76, 78, 80, 82, 84, 86];
        northWestFrames.forEach((frameNum, index) => {
          const img = new Image();
          img.src = `/assets/characters/malvado3/north-west/${frameNum}.png`;
          img.onload = () => {
            feeSpritesRef.current[direction][index] = img;
            if (index === northWestFrames.length - 1) {
              console.log(`✅ Sprites malvado3/north-west cargados para fee dirección ${direction} (10 frames)`);
            }
          };
          img.onerror = (e) => {
            console.error(`❌ Error cargando malvado3/north-west/${frameNum}.png para dirección ${direction}:`, e);
          };
        });
      } else if (direction === 'north_east') {
        // Cargar sprites de north-est (noreste) - 10 frames
        const northEastFrames = [69, 71, 73, 75, 77, 79, 81, 83, 85, 87];
        northEastFrames.forEach((frameNum, index) => {
          const img = new Image();
          img.src = `/assets/characters/malvado3/north-est/${frameNum}.png`;
          img.onload = () => {
            feeSpritesRef.current[direction][index] = img;
            if (index === northEastFrames.length - 1) {
              console.log(`✅ Sprites malvado3/north-est cargados para fee dirección ${direction} (10 frames)`);
            }
          };
          img.onerror = (e) => {
            console.error(`❌ Error cargando malvado3/north-est/${frameNum}.png para dirección ${direction}:`, e);
          };
        });
      } else if (direction === 'south_west') {
        // Cargar sprites de south-west (suroeste) - 10 frames
        const southWestFrames = [48, 50, 52, 54, 56, 58, 60, 62, 64, 66];
        southWestFrames.forEach((frameNum, index) => {
          const img = new Image();
          img.src = `/assets/characters/malvado3/south-west/${frameNum}.png`;
          img.onload = () => {
            feeSpritesRef.current[direction][index] = img;
            if (index === southWestFrames.length - 1) {
              console.log(`✅ Sprites malvado3/south-west cargados para fee dirección ${direction} (10 frames)`);
            }
          };
          img.onerror = (e) => {
            console.error(`❌ Error cargando malvado3/south-west/${frameNum}.png para dirección ${direction}:`, e);
          };
        });
      } else if (direction === 'south_east') {
        // Cargar sprites de south-est (sureste) - 10 frames
        const southEastFrames = [49, 51, 53, 55, 57, 59, 61, 63, 65, 67];
        southEastFrames.forEach((frameNum, index) => {
          const img = new Image();
          img.src = `/assets/characters/malvado3/south-est/${frameNum}.png`;
          img.onload = () => {
            feeSpritesRef.current[direction][index] = img;
            if (index === southEastFrames.length - 1) {
              console.log(`✅ Sprites malvado3/south-est cargados para fee dirección ${direction} (10 frames)`);
            }
          };
          img.onerror = (e) => {
            console.error(`❌ Error cargando malvado3/south-est/${frameNum}.png para dirección ${direction}:`, e);
          };
        });
      }
    });
    
    // Cargar sprites animados del hacker (Trump)
    // Trump solo tiene 3 direcciones (up, left, right) con 5 frames cada uno
    const hackerDirections: ('up' | 'left' | 'right')[] = ['up', 'left', 'right'];
    hackerDirections.forEach(direction => {
      for (let i = 1; i <= 5; i++) {
        const img = new Image();
        // Corregir la inconsistencia en nombres de archivo basándose en los archivos reales
        let fileName: string;
        if (direction === 'right') {
          // Para right: Trump_right_1.png y trump_right_2,3,4,5.png
          fileName = i === 1 ? 'Trump' : 'trump';
        } else {
          // Para up y left: todos usan Trump_ (T mayúscula)
          fileName = 'Trump';
        }
        
        img.src = `/assets/characters/trumpsprites/${fileName}_${direction}_${i}.png`;
        img.onload = () => {
          hackerSpritesRef.current[direction][i-1] = img;
          console.log(`✅ Sprite ${fileName}_${direction}_${i}.png cargado correctamente`);
        };
        img.onerror = (e) => {
          console.error(`❌ Error cargando sprite ${fileName}_${direction}_${i}.png:`, e);
          // Intentar con la variante alternativa como fallback
          const altFileName = fileName === 'Trump' ? 'trump' : 'Trump';
          const altImg = new Image();
          altImg.src = `/assets/characters/trumpsprites/${altFileName}_${direction}_${i}.png`;
          altImg.onload = () => {
            hackerSpritesRef.current[direction][i-1] = altImg;
            console.log(`✅ Sprite alternativo ${altFileName}_${direction}_${i}.png cargado correctamente`);
          };
          altImg.onerror = () => {
            console.error(`❌ También falló el sprite alternativo ${altFileName}_${direction}_${i}.png`);
          };
        };
      }
    });
    
    // Cargar sprites del nuevo personaje Cukie (8 frames por dirección)
    const cukieMap: Record<DirectionType, {dir: string, abbr: string}> = {
      up: { dir: 'north', abbr: 'n' },
      down: { dir: 'south', abbr: 's' },
      left: { dir: 'west', abbr: 'w' },
      right: { dir: 'east', abbr: 'e' },
      north_east: { dir: 'north_east', abbr: 'ne' },
      north_west: { dir: 'north_west', abbr: 'nw' },
      south_east: { dir: 'south_east', abbr: 'se' },
      south_west: { dir: 'south_west', abbr: 'sw' }
    };

    (Object.keys(cukieMap) as DirectionType[]).forEach(direction => {
      const { dir, abbr } = cukieMap[direction];
      for (let i = 1; i <= 8; i++) {
        const img = new Image();
        const pad = i.toString().padStart(2, '0');
        img.src = `/assets/characters/cukiesprites/${dir}/cukie_walk_${abbr}_${pad}.png`;
        img.onload = () => {
          tokenSpritesRef.current[direction][i-1] = img;
          tokenRunSpritesRef.current[direction][i-1] = img; // usar mismos frames para run
        };
      }
    });
    
    // Cargar sprites de energía como recurso (usar una sola imagen para todos los frames)
    for (let i = 1; i <= 6; i++) {
      const img = new Image();
      img.src = '/assets/collectibles/gemas.png';
      img.onload = () => {
        energySpritesRef.current[i-1] = img;
      };
      img.onerror = () => {
        // Fallback: usar sprites antiguos si la gema no existe
        const fallback = new Image();
        fallback.src = `/assets/collectibles/energy/energy_${i}.png`;
        fallback.onload = () => {
          energySpritesRef.current[i-1] = fallback;
        };
      };
    }
    
    // Cargar sprites de explosión (efecto boost)
    for (let i = 1; i <= 10; i++) {
      const img = new Image();
      img.src = `/assets/effects/Explosion_${i}.png`;
      img.onload = () => {
        explosionSpritesRef.current[i-1] = img;
      };
    }
    // Cargar sprites de explosión de energía
    for (let i = 1; i <= 10; i++) {
      const img = new Image();
      img.src = `/assets/effects/En-Explosion_${i}.png`;
      img.onload = () => {
        enExplosionSpritesRef.current[i-1] = img;
      };
    }
    
    // Cargar sprites de explosión verde (para heart y mega_node)
    for (let i = 1; i <= 10; i++) {
      const img = new Image();
      img.src = `/assets/effects/green-Explosion_${i}.png`;
      img.onload = () => {
        greenExplosionSpritesRef.current[i-1] = img;
      };
    }
    
    // Cargar sprite de daño
    const damageImg = new Image();
    damageImg.src = '/assets/effects/damagecukie.png';
    damageImg.onload = () => {
      damageImgRef.current = damageImg;
    };
    
    // Cargar imagen de arenas movedizas
    const quicksandImg = new Image();
    quicksandImg.src = '/assets/obstacles/arenasmovedizas2.png';
    quicksandImg.onload = () => {
      quicksandImgRef.current = quicksandImg;
      console.log('✅ Imagen de arenas movedizas cargada correctamente');
    };
    quicksandImg.onerror = (e) => {
      console.error('❌ Error cargando imagen de arenas movedizas:', e);
    };
    
    // Cargar sprites animados de purr (gato)
    const purrSprite1 = new Image();
    purrSprite1.onload = () => {
      purrSprite1Ref.current = purrSprite1;
      console.log('✅ Purr sprite 1 cargado correctamente');
    };
    purrSprite1.onerror = (e) => {
      console.error('❌ Error cargando purr sprite 1:', e);
    };
    purrSprite1.src = '/assets/collectibles/purr/purr_1.png';

    const purrSprite2 = new Image();
    purrSprite2.onload = () => {
      purrSprite2Ref.current = purrSprite2;
      console.log('✅ Purr sprite 2 cargado correctamente');
    };
    purrSprite2.onerror = (e) => {
      console.error('❌ Error cargando purr sprite 2:', e);
    };
    purrSprite2.src = '/assets/collectibles/purr/purr_2.png';

    const purrSprite3 = new Image();
    purrSprite3.onload = () => {
      purrSprite3Ref.current = purrSprite3;
      console.log('✅ Purr sprite 3 cargado correctamente');
    };
    purrSprite3.onerror = (e) => {
      console.error('❌ Error cargando purr sprite 3:', e);
    };
    purrSprite3.src = '/assets/collectibles/purr/purr_3.png';

    // purrSprite4 no existe, solo tenemos purr_1, purr_2 y purr_3
    // const purrSprite4 = new Image();
    // purrSprite4.onload = () => {
    //   purrSprite4Ref.current = purrSprite4;
    //   console.log('✅ Purr sprite 4 cargado correctamente');
    // };
    // purrSprite4.onerror = (e) => {
    //   console.error('❌ Error cargando purr sprite 4:', e);
    // };
    // purrSprite4.src = '/assets/collectibles/purr/purr_4.png';
    
    // Cargar sprites animados del bug
    const bugSprite1 = new Image();
    bugSprite1.onload = () => {
      bugSprite1Ref.current = bugSprite1;
      console.log('✅ Bug sprite 1 cargado correctamente');
    };
    bugSprite1.onerror = (e) => {
      console.error('❌ Error cargando bug sprite 1:', e);
    };
    bugSprite1.src = '/assets/characters/bug/bug_1.png';

    const bugSprite2 = new Image();
    bugSprite2.onload = () => {
      bugSprite2Ref.current = bugSprite2;
      console.log('✅ Bug sprite 2 cargado correctamente');
    };
    bugSprite2.onerror = (e) => {
      console.error('❌ Error cargando bug sprite 2:', e);
    };
    bugSprite2.src = '/assets/characters/bug/bug_2.png';

    const bugSprite3 = new Image();
    bugSprite3.onload = () => {
      bugSprite3Ref.current = bugSprite3;
      console.log('✅ Bug sprite 3 cargado correctamente');
    };
    bugSprite3.onerror = (e) => {
      console.error('❌ Error cargando bug sprite 3:', e);
    };
    bugSprite3.src = '/assets/characters/bug/bug_3.png';
    
    // ELIMINADO: Carga de imagen de overlay de pausa (ya no se usa)
    // El overlay de pausa se maneja en game-container.tsx
    
    // Cargar imagen de game over
    const gameOverImg = new Image();
    gameOverImg.src = '/assets/collectibles/gameover_trump .png'; // Nota: el archivo tiene un espacio extra
    gameOverImg.onload = () => {
      console.log('✅ Imagen gameover_trump .png cargada EXITOSAMENTE');
      gameOverImgRef.current = gameOverImg;
    };
    gameOverImg.onerror = (e) => {
      console.error('❌ Error cargando gameover_trump .png:', e);
    };
    
    // Cargar imagen de game over específica para bugs (wallet)
    const walletGameOverImg = new Image();
    walletGameOverImg.src = '/assets/collectibles/wallet_gameover.png';
    walletGameOverImg.onload = () => {
      console.log('✅ Imagen wallet_gameover.png cargada EXITOSAMENTE');
      walletGameOverImgRef.current = walletGameOverImg;
    };
    walletGameOverImg.onerror = (e) => {
      console.error('❌ Error cargando wallet_gameover.png:', e);
    };

    // Cargar imagen de game over por tiempo
    const gameOverTimeImg = new Image();
    gameOverTimeImg.src = '/assets/collectibles/gameover_time.png';
    gameOverTimeImg.onload = () => {
      console.log('✅ Imagen gameover_time.png cargada EXITOSAMENTE');
      gameOverTimeImgRef.current = gameOverTimeImg;
    };
    gameOverTimeImg.onerror = (e) => {
      console.error('❌ Error cargando gameover_time.png:', e);
    };

    // Cargar imagen de game over por vidas
    const gameOverVidasImg = new Image();
    gameOverVidasImg.src = '/assets/collectibles/gameover_vidas.png';
    gameOverVidasImg.onload = () => {
      console.log('✅ Imagen gameover_vidas.png cargada EXITOSAMENTE');
      gameOverVidasImgRef.current = gameOverVidasImg;
    };
    gameOverVidasImg.onerror = (e) => {
      console.error('❌ Error cargando gameover_vidas.png:', e);
    };
    
    // Cargar imagen del heart
    const heartImg = new Image();
    heartImg.src = '/assets/collectibles/heart.png';
    heartImg.onload = () => {
      console.log('✅ Imagen heart.png cargada EXITOSAMENTE');
      heartImgRef.current = heartImg;
    };
    heartImg.onerror = (e) => {
      console.error('❌ Error cargando heart.png:', e);
    };

    // Cargar imagen del vault
    const vaulImg = new Image();
    vaulImg.src = '/assets/collectibles/vault.png';
    vaulImg.onload = () => {
      console.log('✅ Imagen vault.png cargada EXITOSAMENTE');
      vaulImgRef.current = vaulImg;
    };
    vaulImg.onerror = (e) => {
      console.error('❌ Error cargando vault.png:', e);
    };

    // Cargar imagen del watch_sand (efecto encima del vaul)
    const watchSandImg = new Image();
    watchSandImg.src = '/assets/collectibles/watch_sand.png';
    watchSandImg.onload = () => {
      console.log('✅ Imagen watch_sand.png cargada EXITOSAMENTE');
      watchSandImgRef.current = watchSandImg;
    };
    watchSandImg.onerror = (e) => {
      console.error('❌ Error cargando watch_sand.png:', e);
    };

    // Cargar imagen del checkpoint
    const checkpointImg = new Image();
    checkpointImg.src = '/assets/collectibles/checkpointcukies.png';
    checkpointImg.onload = () => {
      console.log('✅ Imagen checkpointcukies.png cargada EXITOSAMENTE');
      checkpointImgRef.current = checkpointImg;
    };
    checkpointImg.onerror = (e) => {
      console.error('❌ Error cargando checkpointcukies.png:', e);
    };

    // Cargar imágenes al inicio
    const barrImg = new Image();
    barrImg.src = '/assets/collectibles/barravault1.png';
    barrImg.onload = () => {
      barrImgRef.current = barrImg;
    };

    // Cargar barra de progreso
    const progressBarrImg = new Image();
    progressBarrImg.src = '/assets/collectibles/barravault2.png';
    progressBarrImg.onload = () => {
      progressBarrImgRef.current = progressBarrImg;
    };
  }, []);

  // Función para determinar la dirección basada en el vector de velocidad
  const getDirection = (velocity: { x: number, y: number }): DirectionType => {
    // Detectar movimiento diagonal
    const isDiagonal = Math.abs(velocity.x) > 0 && Math.abs(velocity.y) > 0;
    
    if (isDiagonal) {
      // Movimiento diagonal
      if (velocity.x > 0 && velocity.y < 0) {
        return 'north_east';
      } else if (velocity.x < 0 && velocity.y < 0) {
        return 'north_west';
      } else if (velocity.x > 0 && velocity.y > 0) {
        return 'south_east';
      } else if (velocity.x < 0 && velocity.y > 0) {
        return 'south_west';
      }
    }
    
    // Movimiento cardinal
    if (Math.abs(velocity.x) > Math.abs(velocity.y)) {
      return velocity.x > 0 ? 'right' : 'left';
    } else {
      return velocity.y > 0 ? 'down' : 'up';
    }
  };

  const drawRay = (ctx: CanvasRenderingContext2D, ray: RayHazard, timestamp: number) => {
    ctx.save();

    if (ray.phase === 'warning') {
      // FASE DE ADVERTENCIA: Parpadeo azul cian
      const flicker = 0.5 + 0.5 * Math.sin(timestamp / 120);
      ctx.globalCompositeOperation = 'lighter';

      // Capa exterior más ancha para advertencia
      const warningWidth = ray.width * 5;
      const warningHeight = ray.height * 5;
      const baseAlpha = 0.3 + 0.4 * flicker;
      
      ctx.globalAlpha = baseAlpha;
      if (ray.orientation === 'vertical') {
        const warningGradient = ctx.createLinearGradient(
          ray.x - (warningWidth - ray.width) / 2, 
          0, 
          ray.x + ray.width + (warningWidth - ray.width) / 2, 
          0
        );
        warningGradient.addColorStop(0, 'rgba(0, 200, 255, 0.0)');
        warningGradient.addColorStop(0.3, 'rgba(0, 150, 255, 0.4)');
        warningGradient.addColorStop(0.5, 'rgba(0, 200, 255, 0.8)');
        warningGradient.addColorStop(0.7, 'rgba(0, 150, 255, 0.4)');
        warningGradient.addColorStop(1, 'rgba(0, 200, 255, 0.0)');
        ctx.fillStyle = warningGradient;
        ctx.fillRect(
          ray.x - (warningWidth - ray.width) / 2, 
          ray.y, 
          warningWidth, 
          ray.height
        );
      } else {
        const warningGradient = ctx.createLinearGradient(
          0, 
          ray.y - (warningHeight - ray.height) / 2, 
          0, 
          ray.y + ray.height + (warningHeight - ray.height) / 2
        );
        warningGradient.addColorStop(0, 'rgba(0, 200, 255, 0.0)');
        warningGradient.addColorStop(0.3, 'rgba(0, 150, 255, 0.4)');
        warningGradient.addColorStop(0.5, 'rgba(0, 200, 255, 0.8)');
        warningGradient.addColorStop(0.7, 'rgba(0, 150, 255, 0.4)');
        warningGradient.addColorStop(1, 'rgba(0, 200, 255, 0.0)');
        ctx.fillStyle = warningGradient;
        ctx.fillRect(
          ray.x, 
          ray.y - (warningHeight - ray.height) / 2, 
          ray.width, 
          warningHeight
        );
      }
    } else {
      // FASE ACTIVA: Rayo azul brillante con chispas
      // Usar 'lighten' para el halo - preserva el color más claro (azul) sobre fondos oscuros (redzone)
      ctx.globalCompositeOperation = 'lighten';

      // Aura exterior azul cian - colores más intensos y opacos para que se vean sobre cualquier fondo
      const outerBlurWidth = ray.width * 8;
      const outerBlurHeight = ray.height * 8;
      
      ctx.globalAlpha = 0.5;
      if (ray.orientation === 'vertical') {
        const outerGradient = ctx.createLinearGradient(
          ray.x - (outerBlurWidth - ray.width) / 2, 
          0, 
          ray.x + ray.width + (outerBlurWidth - ray.width) / 2, 
          0
        );
        outerGradient.addColorStop(0, 'rgba(0, 100, 255, 0.0)');
        outerGradient.addColorStop(0.3, 'rgba(0, 150, 255, 0.4)');
        outerGradient.addColorStop(0.5, 'rgba(0, 200, 255, 0.6)');
        outerGradient.addColorStop(0.7, 'rgba(0, 150, 255, 0.4)');
        outerGradient.addColorStop(1, 'rgba(0, 100, 255, 0.0)');
        ctx.fillStyle = outerGradient;
        ctx.fillRect(
          ray.x - (outerBlurWidth - ray.width) / 2, 
          ray.y, 
          outerBlurWidth, 
          ray.height
        );
      } else {
        const outerGradient = ctx.createLinearGradient(
          0, 
          ray.y - (outerBlurHeight - ray.height) / 2, 
          0, 
          ray.y + ray.height + (outerBlurHeight - ray.height) / 2
        );
        outerGradient.addColorStop(0, 'rgba(0, 100, 255, 0.0)');
        outerGradient.addColorStop(0.3, 'rgba(0, 150, 255, 0.4)');
        outerGradient.addColorStop(0.5, 'rgba(0, 200, 255, 0.6)');
        outerGradient.addColorStop(0.7, 'rgba(0, 150, 255, 0.4)');
        outerGradient.addColorStop(1, 'rgba(0, 100, 255, 0.0)');
        ctx.fillStyle = outerGradient;
        ctx.fillRect(
          ray.x, 
          ray.y - (outerBlurHeight - ray.height) / 2, 
          ray.width, 
          outerBlurHeight
        );
      }

      // Halo intermedio azul brillante - colores más intensos
      const midBlurWidth = ray.width * 4;
      const midBlurHeight = ray.height * 4;
      
      ctx.globalAlpha = 0.8;
      if (ray.orientation === 'vertical') {
        const midGradient = ctx.createLinearGradient(
          ray.x - (midBlurWidth - ray.width) / 2, 
          0, 
          ray.x + ray.width + (midBlurWidth - ray.width) / 2, 
          0
        );
        midGradient.addColorStop(0, 'rgba(0, 200, 255, 0.0)');
        midGradient.addColorStop(0.3, 'rgba(0, 220, 255, 0.6)');
        midGradient.addColorStop(0.5, 'rgba(0, 240, 255, 0.9)');
        midGradient.addColorStop(0.7, 'rgba(0, 220, 255, 0.6)');
        midGradient.addColorStop(1, 'rgba(0, 200, 255, 0.0)');
        ctx.fillStyle = midGradient;
        ctx.fillRect(
          ray.x - (midBlurWidth - ray.width) / 2, 
          ray.y, 
          midBlurWidth, 
          ray.height
        );
      } else {
        const midGradient = ctx.createLinearGradient(
          0, 
          ray.y - (midBlurHeight - ray.height) / 2, 
          0, 
          ray.y + ray.height + (midBlurHeight - ray.height) / 2
        );
        midGradient.addColorStop(0, 'rgba(0, 200, 255, 0.0)');
        midGradient.addColorStop(0.3, 'rgba(0, 220, 255, 0.6)');
        midGradient.addColorStop(0.5, 'rgba(0, 240, 255, 0.9)');
        midGradient.addColorStop(0.7, 'rgba(0, 220, 255, 0.6)');
        midGradient.addColorStop(1, 'rgba(0, 200, 255, 0.0)');
        ctx.fillStyle = midGradient;
        ctx.fillRect(
          ray.x, 
          ray.y - (midBlurHeight - ray.height) / 2, 
          ray.width, 
          midBlurHeight
        );
      }

      // Núcleo central azul brillante - usar 'lighter' para mantener el brillo intenso
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1.0;
      if (ray.orientation === 'vertical') {
        const coreGradient = ctx.createLinearGradient(ray.x, 0, ray.x + ray.width, 0);
        coreGradient.addColorStop(0, 'rgba(0, 200, 255, 0.8)');
        coreGradient.addColorStop(0.3, 'rgba(255, 255, 255, 1.0)');
        coreGradient.addColorStop(0.5, 'rgba(255, 255, 255, 1.0)');
        coreGradient.addColorStop(0.7, 'rgba(255, 255, 255, 1.0)');
        coreGradient.addColorStop(1, 'rgba(0, 200, 255, 0.8)');
        ctx.fillStyle = coreGradient;
        ctx.fillRect(ray.x, ray.y, ray.width, ray.height);
      } else {
        const coreGradient = ctx.createLinearGradient(0, ray.y, 0, ray.y + ray.height);
        coreGradient.addColorStop(0, 'rgba(0, 200, 255, 0.8)');
        coreGradient.addColorStop(0.3, 'rgba(255, 255, 255, 1.0)');
        coreGradient.addColorStop(0.5, 'rgba(255, 255, 255, 1.0)');
        coreGradient.addColorStop(0.7, 'rgba(255, 255, 255, 1.0)');
        coreGradient.addColorStop(1, 'rgba(0, 200, 255, 0.8)');
        ctx.fillStyle = coreGradient;
        ctx.fillRect(ray.x, ray.y, ray.width, ray.height);
      }

      // Efecto de puntos/chispas eliminado intencionalmente
    }

    ctx.restore();
  };

  const drawRays = (ctx: CanvasRenderingContext2D, rays: RayHazard[] | undefined, timestamp: number) => {
    if (!rays || rays.length === 0) {
      return;
    }
    rays.forEach(ray => drawRay(ctx, ray, timestamp));
  };

  const drawRedZone = (ctx: CanvasRenderingContext2D, zone: RedZone, timestamp: number) => {
    ctx.save();

    const centerX = zone.x + zone.width / 2;
    const centerY = zone.y + zone.height / 2;
    const maxRadius = Math.max(zone.width, zone.height) * 0.7; // Radio máximo para cubrir toda la zona
    const timeFactor = timestamp * 0.003;

    // Calcular el progreso de expansión de la mancha
    // Siempre usar warningStartTime si existe, independientemente de la fase
    // Esto asegura que la mancha siempre se expanda desde el centro hacia afuera
    let expansionProgress = 1.0; // Por defecto, completamente expandida
    
    if (zone.warningStartTime) {
      // Calcular el tiempo transcurrido desde que empezó la advertencia
      const elapsed = Math.max(0, timestamp - zone.warningStartTime);
      const progress = Math.max(0, Math.min(1, elapsed / RED_ZONE_WARNING_DURATION_MS));
      // Usar easeOut para que empiece rápido y termine suave
      const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
      expansionProgress = easeOut(progress);
    }
    // Si no hay warningStartTime o ya pasó el tiempo, expansionProgress es 1.0 (completamente expandida)

    // Calcular el radio actual basado en el progreso (desde 0 hasta maxRadius)
    const currentRadius = maxRadius * expansionProgress;

    if (quicksandImgRef.current) {
      // Si la mancha aún no ha alcanzado el tamaño completo, usar el efecto de mancha
      if (expansionProgress < 1.0) {
        // Crear máscara irregular tipo mancha que se expande desde el centro
        ctx.save();
        ctx.beginPath();
        const lobes = 24; // más puntos => borde más orgánico
        for (let i = 0; i < lobes; i++) {
          const a = (i / lobes) * Math.PI * 2;
          const noise = 0.18 * Math.sin(5 * a + timeFactor) + 0.08 * Math.sin(11 * a - timeFactor * 0.66);
          const r = currentRadius * (1 + noise);
          const px = centerX + r * Math.cos(a);
          const py = centerY + r * Math.sin(a);
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();
        ctx.clip();
        // Sutil animación de opacidad para llamar la atención
        const flicker = 0.85 + 0.15 * Math.sin(timestamp / 180);
        ctx.globalAlpha = 0.5 + 0.4 * expansionProgress * flicker;
        ctx.drawImage(quicksandImgRef.current, zone.x, zone.y, zone.width, zone.height);
        ctx.restore();
      } else {
        // Cuando está completamente expandida, mostrar la imagen completa sin máscara
        ctx.globalAlpha = 0.95;
        ctx.drawImage(quicksandImgRef.current, zone.x, zone.y, zone.width, zone.height);
      }
    } else {
      // Fallback: dibujar una mancha sin imagen
      if (expansionProgress < 1.0) {
        // Mancha en expansión
        const lobes = 24;
        ctx.beginPath();
        for (let i = 0; i < lobes; i++) {
          const a = (i / lobes) * Math.PI * 2;
          const noise = 0.18 * Math.sin(5 * a + timeFactor) + 0.08 * Math.sin(11 * a - timeFactor * 0.66);
          const r = currentRadius * (1 + noise);
          const px = centerX + r * Math.cos(a);
          const py = centerY + r * Math.sin(a);
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();
        ctx.globalAlpha = 0.25 + 0.35 * expansionProgress;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.fill();
      } else {
        // Completamente expandida
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = 'rgba(220, 30, 30, 0.85)';
        ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
      }
    }

    ctx.restore();
  };

  const drawRedZones = (ctx: CanvasRenderingContext2D, zones: RedZone[] | undefined, timestamp: number) => {
    if (!zones || zones.length === 0) {
      return;
    }
    zones.forEach(zone => drawRedZone(ctx, zone, timestamp));
  };

  const drawGoatAura = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    baseSize: number,
    blink: boolean,
    eliminationRatio: number
  ) => {
    ctx.save();
    const time = Date.now();
    const pulse = 1 + 0.08 * Math.sin(time / 160);
    const blinkFactor = blink ? (0.55 + 0.45 * Math.sin(time / 90)) : 1;
    const intensity = 0.4 + 0.6 * eliminationRatio;

    ctx.globalCompositeOperation = 'lighter';

    // Capa exterior suave
    ctx.beginPath();
    ctx.arc(x, y, (baseSize / 2) * 1.35 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 215, 0, ${0.18 * blinkFactor * intensity})`;
    ctx.fill();

    // Capa media brillante
    ctx.beginPath();
    ctx.arc(x, y, (baseSize / 2) * 1.05 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 235, 120, ${0.22 * blinkFactor * intensity})`;
    ctx.fill();

    // Núcleo luminoso
    ctx.beginPath();
    ctx.arc(x, y, (baseSize / 2) * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 200, ${0.28 * blinkFactor * intensity})`;
    ctx.fill();

    // Trazos que simulan cuernos
    const hornHeight = baseSize * 0.4;
    const hornWidth = baseSize * 0.18;
    const hornYOffset = baseSize * 0.45;

    ctx.fillStyle = `rgba(255, 230, 160, ${0.7 * blinkFactor})`;

    ctx.beginPath();
    ctx.moveTo(x - hornWidth, y - hornYOffset);
    ctx.lineTo(x - hornWidth * 1.4, y - hornYOffset + hornHeight * 0.4);
    ctx.lineTo(x - hornWidth * 0.3, y - hornYOffset + hornHeight * 0.6);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + hornWidth, y - hornYOffset);
    ctx.lineTo(x + hornWidth * 1.4, y - hornYOffset + hornHeight * 0.4);
    ctx.lineTo(x + hornWidth * 0.3, y - hornYOffset + hornHeight * 0.6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };

  const drawObject = (ctx: CanvasRenderingContext2D, obj: Token | Obstacle | Collectible) => {
     // Determinar qué imagen usar basado en el tipo de objeto
     let img = null;
     
     // Si es el token (jugador) - usar animación
     if (!('type' in obj)) {
       const direction = obj.direction || 'down';
       const frameIndex = obj.frameIndex || 0;
       // Si está en boost, usar sprites de run
       const isBoost = obj.boostTimer && obj.boostTimer > 0;
       const isImmune = obj.immunityTimer && obj.immunityTimer > 0;
       const goatEliminationActive = !!(obj.goatEliminationTimer && obj.goatEliminationTimer > 0);
       const goatImmunityActive = !!(obj.goatImmunityTimer && obj.goatImmunityTimer > 0);
       const goatEliminationRatio = goatEliminationActive
         ? Math.max(0, Math.min(1, (obj.goatEliminationTimer || 0) / GOAT_ELIMINATION_DURATION_MS))
         : 0;
       const sprites = isBoost ? tokenRunSpritesRef.current : tokenSpritesRef.current;
       if (sprites[direction] && sprites[direction][frameIndex]) {
         const tokenImg = sprites[direction][frameIndex];
         // Usar un tamaño diferente si está en modo boost
         const scaleFactor = isBoost ? 1.3 : 1.46; // Cambiado de 1.67 a 1.46 para hacer el token de 70x70px
         const tokenImgSize = obj.radius * 2 * scaleFactor;
         
         // Nueva lógica: manejar ambos efectos simultáneamente
         ctx.save();
         
         // Si tiene ambos efectos activos, dibujar ambas auras con diferentes tamaños
         if (isBoost && isImmune) {
           // Calcular parámetros para efectos de inmunidad mejorados
           const timeRemaining = obj.immunityTimer || 0;
           const shouldBlink = timeRemaining <= 2000; // Parpadear en los últimos 2 segundos
           const blinkIntensity = shouldBlink ? (0.5 + 0.5 * Math.sin(Date.now() / 100)) : 1.0;
           const fadeAlpha = Math.max(0.1, Math.min(1.0, timeRemaining / 1000)); // Desaparece gradualmente
           
           // Aura de purr mejorada (más grande, púrpura, exterior)
           ctx.shadowColor = `rgba(128, 0, 255, ${0.8 * blinkIntensity * fadeAlpha})`;
           ctx.shadowBlur = 30;
           
           // Capa exterior púrpura
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, tokenImgSize/1.1, 0, Math.PI * 2);
           ctx.fillStyle = `rgba(128, 0, 255, ${0.35 * blinkIntensity * fadeAlpha})`;
           ctx.fill();
           
           // Capa media púrpura
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, tokenImgSize/1.4, 0, Math.PI * 2);
           ctx.fillStyle = `rgba(160, 32, 255, ${0.4 * blinkIntensity * fadeAlpha})`;
           ctx.fill();
           
           // Círculo exterior pulsante púrpura (más grande)
           const baseTime = shouldBlink ? getAnimationTime() / 150 : getAnimationTime() / 300;
           const purrPulseSize = tokenImgSize * (1.6 + 0.4 * Math.sin(baseTime) * blinkIntensity);
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, purrPulseSize/2, 0, Math.PI * 2);
           ctx.fillStyle = `rgba(128, 0, 255, ${0.18 * blinkIntensity * fadeAlpha})`;
           ctx.fill();
           
           // Partículas violetas (reducidas para no sobrecargar)
           for (let i = 0; i < 6; i++) {
             const angle = (Date.now() / 1000 + i * Math.PI / 3) % (Math.PI * 2);
             const distance = tokenImgSize/1.6 + 8 * Math.sin(Date.now() / 200 + i);
             const particleX = obj.x + Math.cos(angle) * distance;
             const particleY = obj.y + Math.sin(angle) * distance;
             
             ctx.beginPath();
             ctx.arc(particleX, particleY, 2.5 * blinkIntensity * fadeAlpha, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(255, 150, 255, ${0.7 * blinkIntensity * fadeAlpha})`;
             ctx.fill();
           }
           
           // Aura de boost (más pequeña, azul, interior)
           ctx.shadowColor = 'rgba(0, 255, 255, 0.8)';
           ctx.shadowBlur = 15;
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, tokenImgSize/1.8, 0, Math.PI * 2);
           ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
           ctx.fill();
           
           // Círculo interior pulsante azul (más pequeño)
           const boostPulseSize = tokenImgSize * (1.0 + 0.25 * Math.sin(getAnimationTime() / 200));
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, boostPulseSize/2, 0, Math.PI * 2);
           ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
           ctx.fill();
           
           // Dibujar el sprite con brillo combinado (púrpura dominante)
           ctx.shadowColor = `rgba(160, 32, 255, ${1.0 * blinkIntensity * fadeAlpha})`;
           ctx.shadowBlur = shouldBlink ? 35 : 25;
           if (goatEliminationActive) {
             drawGoatAura(ctx, obj.x, obj.y, tokenImgSize, goatImmunityActive, goatEliminationRatio);
           }
           ctx.drawImage(tokenImg, obj.x - tokenImgSize/2, obj.y - tokenImgSize/2, tokenImgSize, tokenImgSize);
           
         } else if (isBoost) {
           // Solo efecto de boost (azul)
           ctx.shadowColor = 'rgba(0, 255, 255, 0.8)';
           ctx.shadowBlur = 15;
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, tokenImgSize/1.5, 0, Math.PI * 2);
           ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
           ctx.fill();
           
           // Añadir un segundo círculo exterior pulsante
           const pulseSize = tokenImgSize * (1.2 + 0.3 * Math.sin(Date.now() / 200));
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, pulseSize/2, 0, Math.PI * 2);
           ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
           ctx.fill();
           
           // Dibujar el sprite con brillo
           ctx.shadowColor = 'rgba(0, 255, 255, 0.8)';
           ctx.shadowBlur = 15;
           if (goatEliminationActive) {
             drawGoatAura(ctx, obj.x, obj.y, tokenImgSize, goatImmunityActive, goatEliminationRatio);
           }
           ctx.drawImage(tokenImg, obj.x - tokenImgSize/2, obj.y - tokenImgSize/2, tokenImgSize, tokenImgSize);
           
         } else if (isImmune) {
           // Solo efecto de inmunidad púrpura mejorado
           // Calcular tiempo restante para efectos de parpadeo
           const timeRemaining = obj.immunityTimer || 0;
           const shouldBlink = timeRemaining <= 2000; // Parpadear en los últimos 2 segundos
           const blinkIntensity = shouldBlink ? (0.5 + 0.5 * Math.sin(Date.now() / 100)) : 1.0;
           
           // Efecto de desaparición gradual
           const fadeAlpha = Math.max(0.1, Math.min(1.0, timeRemaining / 1000)); // Desaparece gradualmente
           
           // Aura principal violeta con múltiples capas
           ctx.shadowColor = `rgba(128, 0, 255, ${0.9 * blinkIntensity * fadeAlpha})`;
           ctx.shadowBlur = 25;
           
           // Capa exterior - Aura grande violeta
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, tokenImgSize/1.3, 0, Math.PI * 2);
           ctx.fillStyle = `rgba(128, 0, 255, ${0.4 * blinkIntensity * fadeAlpha})`;
           ctx.fill();
           
           // Capa media - Aura intermedia más intensa
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, tokenImgSize/1.6, 0, Math.PI * 2);
           ctx.fillStyle = `rgba(160, 32, 255, ${0.5 * blinkIntensity * fadeAlpha})`;
           ctx.fill();
           
           // Capa interna - Aura cerca del token
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, tokenImgSize/2.2, 0, Math.PI * 2);
           ctx.fillStyle = `rgba(200, 100, 255, ${0.6 * blinkIntensity * fadeAlpha})`;
           ctx.fill();
           
           // Círculo exterior pulsante violeta
           const baseTime = shouldBlink ? Date.now() / 150 : Date.now() / 300;
           const pulseSize = tokenImgSize * (1.4 + 0.4 * Math.sin(baseTime) * blinkIntensity);
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, pulseSize/2, 0, Math.PI * 2);
           ctx.fillStyle = `rgba(128, 0, 255, ${0.2 * blinkIntensity * fadeAlpha})`;
           ctx.fill();
           
           // Segundo círculo pulsante más rápido cuando parpadea
           if (shouldBlink) {
             const fastPulseSize = tokenImgSize * (1.1 + 0.3 * Math.sin(Date.now() / 80));
             ctx.beginPath();
             ctx.arc(obj.x, obj.y, fastPulseSize/2, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(255, 100, 255, ${0.3 * blinkIntensity * fadeAlpha})`;
             ctx.fill();
           }
           
           // Partículas violetas brillantes alrededor del token
           for (let i = 0; i < 8; i++) {
             const angle = (Date.now() / 1000 + i * Math.PI / 4) % (Math.PI * 2);
             const distance = tokenImgSize/1.8 + 10 * Math.sin(Date.now() / 200 + i);
             const particleX = obj.x + Math.cos(angle) * distance;
             const particleY = obj.y + Math.sin(angle) * distance;
             
             ctx.beginPath();
             ctx.arc(particleX, particleY, 3 * blinkIntensity * fadeAlpha, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(255, 150, 255, ${0.8 * blinkIntensity * fadeAlpha})`;
             ctx.fill();
           }
           
           // Dibujar el sprite con brillo púrpura mejorado
           ctx.shadowColor = `rgba(160, 32, 255, ${1.0 * blinkIntensity * fadeAlpha})`;
           ctx.shadowBlur = shouldBlink ? 30 : 20;
           if (goatEliminationActive) {
             drawGoatAura(ctx, obj.x, obj.y, tokenImgSize, goatImmunityActive, goatEliminationRatio);
           }
           ctx.drawImage(tokenImg, obj.x - tokenImgSize/2, obj.y - tokenImgSize/2, tokenImgSize, tokenImgSize);
           
        } else if (goatImmunityActive && !goatEliminationActive && !isImmune) {
           // Solo inmunidad GOAT activa - usar mismo efecto que Purr
           const timeRemaining = obj.goatImmunityTimer || 0;
           const shouldBlink = timeRemaining <= 1000; // Parpadear en los últimos 1 segundo
           const blinkIntensity = shouldBlink ? (0.5 + 0.5 * Math.sin(Date.now() / 100)) : 1.0;
           
           // Efecto de desaparición gradual
           const fadeAlpha = Math.max(0.1, Math.min(1.0, timeRemaining / 1000)); // Desaparece gradualmente
           
           // Aura principal violeta con múltiples capas (igual que Purr)
           ctx.shadowColor = `rgba(128, 0, 255, ${0.9 * blinkIntensity * fadeAlpha})`;
           ctx.shadowBlur = 25;
           
           // Capa exterior - Aura grande violeta
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, tokenImgSize/1.3, 0, Math.PI * 2);
           ctx.fillStyle = `rgba(128, 0, 255, ${0.4 * blinkIntensity * fadeAlpha})`;
           ctx.fill();
           
           // Capa media - Aura intermedia más intensa
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, tokenImgSize/1.6, 0, Math.PI * 2);
           ctx.fillStyle = `rgba(160, 32, 255, ${0.5 * blinkIntensity * fadeAlpha})`;
           ctx.fill();
           
           // Capa interna - Aura cerca del token
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, tokenImgSize/2.2, 0, Math.PI * 2);
           ctx.fillStyle = `rgba(200, 100, 255, ${0.6 * blinkIntensity * fadeAlpha})`;
           ctx.fill();
           
           // Círculo exterior pulsante violeta
           const baseTime = shouldBlink ? Date.now() / 150 : Date.now() / 300;
           const pulseSize = tokenImgSize * (1.4 + 0.4 * Math.sin(baseTime) * blinkIntensity);
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, pulseSize/2, 0, Math.PI * 2);
           ctx.fillStyle = `rgba(128, 0, 255, ${0.2 * blinkIntensity * fadeAlpha})`;
           ctx.fill();
           
           // Segundo círculo pulsante más rápido cuando parpadea
           if (shouldBlink) {
             const fastPulseSize = tokenImgSize * (1.1 + 0.3 * Math.sin(Date.now() / 80));
             ctx.beginPath();
             ctx.arc(obj.x, obj.y, fastPulseSize/2, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(255, 100, 255, ${0.3 * blinkIntensity * fadeAlpha})`;
             ctx.fill();
           }
           
           // Partículas violetas brillantes alrededor del token
           for (let i = 0; i < 8; i++) {
             const angle = (Date.now() / 1000 + i * Math.PI / 4) % (Math.PI * 2);
             const distance = tokenImgSize/1.8 + 10 * Math.sin(Date.now() / 200 + i);
             const particleX = obj.x + Math.cos(angle) * distance;
             const particleY = obj.y + Math.sin(angle) * distance;
             
             ctx.beginPath();
             ctx.arc(particleX, particleY, 3 * blinkIntensity * fadeAlpha, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(255, 150, 255, ${0.8 * blinkIntensity * fadeAlpha})`;
             ctx.fill();
           }
           
           // Dibujar el sprite con brillo púrpura (igual que Purr)
           ctx.shadowColor = `rgba(160, 32, 255, ${1.0 * blinkIntensity * fadeAlpha})`;
           ctx.shadowBlur = shouldBlink ? 30 : 20;
           ctx.drawImage(tokenImg, obj.x - tokenImgSize/2, obj.y - tokenImgSize/2, tokenImgSize, tokenImgSize);
           
        } else {
           // Dibujo normal sin efectos
           if (goatEliminationActive) {
             drawGoatAura(ctx, obj.x, obj.y, tokenImgSize, goatImmunityActive, goatEliminationRatio);
           }
           ctx.drawImage(tokenImg, obj.x - tokenImgSize/2, obj.y - tokenImgSize/2, tokenImgSize, tokenImgSize);
         }
         
         ctx.restore();
         return;
       } else {
         // Fallback: usar animación antigua si existe
         const fallbackFrame = frameIndex % 6;
         if (Array.isArray(sprites['down']) && sprites['down'][fallbackFrame]) {
           const tokenImg = sprites['down'][fallbackFrame];
           // Usar un tamaño diferente si está en modo boost
           const scaleFactor = isBoost ? 1.3 : 1.46; // Cambiado de 1.67 a 1.46 para hacer el token de 70x70px
           const tokenImgSize = obj.radius * 2 * scaleFactor;
           
           // Aplicar la misma lógica de efectos combinados para el fallback
           ctx.save();
           
                        // Si tiene ambos efectos activos, dibujar ambas auras con diferentes tamaños
             if (isBoost && isImmune) {
               // Calcular parámetros para efectos de inmunidad mejorados (fallback)
               const timeRemaining = obj.immunityTimer || 0;
               const shouldBlink = timeRemaining <= 2000; // Parpadear en los últimos 2 segundos
               const blinkIntensity = shouldBlink ? (0.5 + 0.5 * Math.sin(Date.now() / 100)) : 1.0;
               const fadeAlpha = Math.max(0.1, Math.min(1.0, timeRemaining / 1000)); // Desaparece gradualmente
               
               // Aura de purr mejorada (más grande, púrpura, exterior)
               ctx.shadowColor = `rgba(128, 0, 255, ${0.8 * blinkIntensity * fadeAlpha})`;
               ctx.shadowBlur = 30;
               
               // Capa exterior púrpura
               ctx.beginPath();
               ctx.arc(obj.x, obj.y, tokenImgSize/1.1, 0, Math.PI * 2);
               ctx.fillStyle = `rgba(128, 0, 255, ${0.35 * blinkIntensity * fadeAlpha})`;
               ctx.fill();
               
               // Capa media púrpura
               ctx.beginPath();
               ctx.arc(obj.x, obj.y, tokenImgSize/1.4, 0, Math.PI * 2);
               ctx.fillStyle = `rgba(160, 32, 255, ${0.4 * blinkIntensity * fadeAlpha})`;
               ctx.fill();
               
               // Círculo exterior pulsante púrpura (más grande)
               const baseTime = shouldBlink ? Date.now() / 150 : Date.now() / 300;
               const purrPulseSize = tokenImgSize * (1.6 + 0.4 * Math.sin(baseTime) * blinkIntensity);
               ctx.beginPath();
               ctx.arc(obj.x, obj.y, purrPulseSize/2, 0, Math.PI * 2);
               ctx.fillStyle = `rgba(128, 0, 255, ${0.18 * blinkIntensity * fadeAlpha})`;
               ctx.fill();
               
               // Partículas violetas (reducidas para no sobrecargar)
               for (let i = 0; i < 6; i++) {
                 const angle = (Date.now() / 1000 + i * Math.PI / 3) % (Math.PI * 2);
                 const distance = tokenImgSize/1.6 + 8 * Math.sin(Date.now() / 200 + i);
                 const particleX = obj.x + Math.cos(angle) * distance;
                 const particleY = obj.y + Math.sin(angle) * distance;
                 
                 ctx.beginPath();
                 ctx.arc(particleX, particleY, 2.5 * blinkIntensity * fadeAlpha, 0, Math.PI * 2);
                 ctx.fillStyle = `rgba(255, 150, 255, ${0.7 * blinkIntensity * fadeAlpha})`;
                 ctx.fill();
               }
               
               // Aura de boost (más pequeña, azul, interior)
               ctx.shadowColor = 'rgba(0, 255, 255, 0.8)';
               ctx.shadowBlur = 15;
               ctx.beginPath();
               ctx.arc(obj.x, obj.y, tokenImgSize/1.8, 0, Math.PI * 2);
               ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
               ctx.fill();
               
               // Círculo interior pulsante azul (más pequeño)
               const boostPulseSize = tokenImgSize * (1.0 + 0.25 * Math.sin(Date.now() / 200));
               ctx.beginPath();
               ctx.arc(obj.x, obj.y, boostPulseSize/2, 0, Math.PI * 2);
               ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
               ctx.fill();
               
               // Dibujar el sprite con brillo combinado (púrpura dominante)
               ctx.shadowColor = `rgba(160, 32, 255, ${1.0 * blinkIntensity * fadeAlpha})`;
               ctx.shadowBlur = shouldBlink ? 35 : 25;
               if (goatEliminationActive) {
                 drawGoatAura(ctx, obj.x, obj.y, tokenImgSize, goatImmunityActive, goatEliminationRatio);
               }
               ctx.drawImage(tokenImg, obj.x - tokenImgSize/2, obj.y - tokenImgSize/2, tokenImgSize, tokenImgSize);
             
           } else if (isBoost) {
             // Solo efecto de boost (azul)
             ctx.shadowColor = 'rgba(0, 255, 255, 0.8)';
             ctx.shadowBlur = 15;
             ctx.beginPath();
             ctx.arc(obj.x, obj.y, tokenImgSize/1.5, 0, Math.PI * 2);
             ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
             ctx.fill();
             
             // Añadir un segundo círculo exterior pulsante
             const pulseSize = tokenImgSize * (1.2 + 0.3 * Math.sin(Date.now() / 200));
             ctx.beginPath();
             ctx.arc(obj.x, obj.y, pulseSize/2, 0, Math.PI * 2);
             ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
             ctx.fill();
             
             // Dibujar el sprite con brillo
             ctx.shadowColor = 'rgba(0, 255, 255, 0.8)';
             ctx.shadowBlur = 15;
             if (goatEliminationActive) {
               drawGoatAura(ctx, obj.x, obj.y, tokenImgSize, goatImmunityActive, goatEliminationRatio);
             }
             ctx.drawImage(tokenImg, obj.x - tokenImgSize/2, obj.y - tokenImgSize/2, tokenImgSize, tokenImgSize);
             
           } else if (isImmune) {
             // Solo efecto de inmunidad púrpura mejorado (fallback)
             // Calcular tiempo restante para efectos de parpadeo
             const timeRemaining = obj.immunityTimer || 0;
             const shouldBlink = timeRemaining <= 2000; // Parpadear en los últimos 2 segundos
             const blinkIntensity = shouldBlink ? (0.5 + 0.5 * Math.sin(Date.now() / 100)) : 1.0;
             
             // Efecto de desaparición gradual
             const fadeAlpha = Math.max(0.1, Math.min(1.0, timeRemaining / 1000)); // Desaparece gradualmente
             
             // Aura principal violeta con múltiples capas
             ctx.shadowColor = `rgba(128, 0, 255, ${0.9 * blinkIntensity * fadeAlpha})`;
             ctx.shadowBlur = 25;
             
             // Capa exterior - Aura grande violeta
             ctx.beginPath();
             ctx.arc(obj.x, obj.y, tokenImgSize/1.3, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(128, 0, 255, ${0.4 * blinkIntensity * fadeAlpha})`;
             ctx.fill();
             
             // Capa media - Aura intermedia más intensa
             ctx.beginPath();
             ctx.arc(obj.x, obj.y, tokenImgSize/1.6, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(160, 32, 255, ${0.5 * blinkIntensity * fadeAlpha})`;
             ctx.fill();
             
             // Capa interna - Aura cerca del token
             ctx.beginPath();
             ctx.arc(obj.x, obj.y, tokenImgSize/2.2, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(200, 100, 255, ${0.6 * blinkIntensity * fadeAlpha})`;
             ctx.fill();
             
             // Círculo exterior pulsante violeta
             const baseTime = shouldBlink ? Date.now() / 150 : Date.now() / 300;
             const pulseSize = tokenImgSize * (1.4 + 0.4 * Math.sin(baseTime) * blinkIntensity);
             ctx.beginPath();
             ctx.arc(obj.x, obj.y, pulseSize/2, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(128, 0, 255, ${0.2 * blinkIntensity * fadeAlpha})`;
             ctx.fill();
             
             // Segundo círculo pulsante más rápido cuando parpadea
             if (shouldBlink) {
               const fastPulseSize = tokenImgSize * (1.1 + 0.3 * Math.sin(Date.now() / 80));
               ctx.beginPath();
               ctx.arc(obj.x, obj.y, fastPulseSize/2, 0, Math.PI * 2);
               ctx.fillStyle = `rgba(255, 100, 255, ${0.3 * blinkIntensity * fadeAlpha})`;
               ctx.fill();
             }
             
             // Partículas violetas brillantes alrededor del token
             for (let i = 0; i < 8; i++) {
               const angle = (Date.now() / 1000 + i * Math.PI / 4) % (Math.PI * 2);
               const distance = tokenImgSize/1.8 + 10 * Math.sin(Date.now() / 200 + i);
               const particleX = obj.x + Math.cos(angle) * distance;
               const particleY = obj.y + Math.sin(angle) * distance;
               
               ctx.beginPath();
               ctx.arc(particleX, particleY, 3 * blinkIntensity * fadeAlpha, 0, Math.PI * 2);
               ctx.fillStyle = `rgba(255, 150, 255, ${0.8 * blinkIntensity * fadeAlpha})`;
               ctx.fill();
             }
             
             // Dibujar el sprite con brillo púrpura mejorado
             ctx.shadowColor = `rgba(160, 32, 255, ${1.0 * blinkIntensity * fadeAlpha})`;
             ctx.shadowBlur = shouldBlink ? 30 : 20;
             if (goatEliminationActive) {
               drawGoatAura(ctx, obj.x, obj.y, tokenImgSize, goatImmunityActive, goatEliminationRatio);
             }
             ctx.drawImage(tokenImg, obj.x - tokenImgSize/2, obj.y - tokenImgSize/2, tokenImgSize, tokenImgSize);
             
           } else if (goatImmunityActive && !goatEliminationActive && !isImmune) {
             // Solo inmunidad GOAT activa - usar mismo efecto que Purr (fallback)
             const timeRemaining = obj.goatImmunityTimer || 0;
             const shouldBlink = timeRemaining <= 1000; // Parpadear en los últimos 1 segundo
             const blinkIntensity = shouldBlink ? (0.5 + 0.5 * Math.sin(Date.now() / 100)) : 1.0;
             
             // Efecto de desaparición gradual
             const fadeAlpha = Math.max(0.1, Math.min(1.0, timeRemaining / 1000)); // Desaparece gradualmente
             
             // Aura principal violeta con múltiples capas (igual que Purr)
             ctx.shadowColor = `rgba(128, 0, 255, ${0.9 * blinkIntensity * fadeAlpha})`;
             ctx.shadowBlur = 25;
             
             // Capa exterior - Aura grande violeta
             ctx.beginPath();
             ctx.arc(obj.x, obj.y, tokenImgSize/1.3, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(128, 0, 255, ${0.4 * blinkIntensity * fadeAlpha})`;
             ctx.fill();
             
             // Capa media - Aura intermedia más intensa
             ctx.beginPath();
             ctx.arc(obj.x, obj.y, tokenImgSize/1.6, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(160, 32, 255, ${0.5 * blinkIntensity * fadeAlpha})`;
             ctx.fill();
             
             // Capa interna - Aura cerca del token
             ctx.beginPath();
             ctx.arc(obj.x, obj.y, tokenImgSize/2.2, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(200, 100, 255, ${0.6 * blinkIntensity * fadeAlpha})`;
             ctx.fill();
             
             // Círculo exterior pulsante violeta
             const baseTime = shouldBlink ? Date.now() / 150 : Date.now() / 300;
             const pulseSize = tokenImgSize * (1.4 + 0.4 * Math.sin(baseTime) * blinkIntensity);
             ctx.beginPath();
             ctx.arc(obj.x, obj.y, pulseSize/2, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(128, 0, 255, ${0.2 * blinkIntensity * fadeAlpha})`;
             ctx.fill();
             
             // Segundo círculo pulsante más rápido cuando parpadea
             if (shouldBlink) {
               const fastPulseSize = tokenImgSize * (1.1 + 0.3 * Math.sin(Date.now() / 80));
               ctx.beginPath();
               ctx.arc(obj.x, obj.y, fastPulseSize/2, 0, Math.PI * 2);
               ctx.fillStyle = `rgba(255, 100, 255, ${0.3 * blinkIntensity * fadeAlpha})`;
               ctx.fill();
             }
             
             // Partículas violetas brillantes alrededor del token
             for (let i = 0; i < 8; i++) {
               const angle = (Date.now() / 1000 + i * Math.PI / 4) % (Math.PI * 2);
               const distance = tokenImgSize/1.8 + 10 * Math.sin(Date.now() / 200 + i);
               const particleX = obj.x + Math.cos(angle) * distance;
               const particleY = obj.y + Math.sin(angle) * distance;
               
               ctx.beginPath();
               ctx.arc(particleX, particleY, 3 * blinkIntensity * fadeAlpha, 0, Math.PI * 2);
               ctx.fillStyle = `rgba(255, 150, 255, ${0.8 * blinkIntensity * fadeAlpha})`;
               ctx.fill();
             }
             
             // Dibujar el sprite con brillo púrpura (igual que Purr)
             ctx.shadowColor = `rgba(160, 32, 255, ${1.0 * blinkIntensity * fadeAlpha})`;
             ctx.shadowBlur = shouldBlink ? 30 : 20;
             ctx.drawImage(tokenImg, obj.x - tokenImgSize/2, obj.y - tokenImgSize/2, tokenImgSize, tokenImgSize);
             
           } else {
             // Dibujo normal sin efectos
             ctx.drawImage(tokenImg, obj.x - tokenImgSize/2, obj.y - tokenImgSize/2, tokenImgSize, tokenImgSize);
           }
           
           ctx.restore();
           return;
         }
       }
     }
     
     // Dibujar fee con animación
     if ('type' in obj && obj.type === 'fee' && obj.velocity) {
       const direction = obj.direction || getDirection(obj.velocity);
       const frameIndex = obj.frameIndex || 0;
       
      // Obtener la imagen correcta según dirección y frame
      // Usar 11 frames para left y right (west/est), 8 frames para up (north), 14 frames para down (South)
      // Usar 10 frames para direcciones diagonales (north-west, north-east, south-west, south-east)
      const isDiagonal = direction === 'north_west' || direction === 'north_east' || direction === 'south_west' || direction === 'south_east';
      const maxFrames = isDiagonal ? 10 : (direction === 'up' ? 8 : (direction === 'left' || direction === 'right') ? 11 : 14);
      const frameArrayIndex = frameIndex % maxFrames;
       if (feeSpritesRef.current[direction] && feeSpritesRef.current[direction][frameArrayIndex]) {
         const eagleImg = feeSpritesRef.current[direction][frameArrayIndex];
         
         // Mantener las dimensiones naturales del águila
         const eagleWidth = eagleImg.naturalWidth;
         const eagleHeight = eagleImg.naturalHeight;
         
         // Calcular el factor de escala para que el águila tenga un tamaño apropiado
         // Usar la altura como referencia y mantener la proporción
         const targetHeight = FEE_RADIUS * 2 * 1.2; // Un poco más grande que el fee original
         const scale = targetHeight / eagleHeight;
         const scaledWidth = eagleWidth * scale;
         const scaledHeight = eagleHeight * scale;
         
         // Centrar el águila en la posición del objeto
         ctx.drawImage(eagleImg, obj.x - scaledWidth/2, obj.y - scaledHeight/2, scaledWidth, scaledHeight);
         return; // Salir de la función, ya dibujamos el objeto
       }
     }
     
     // Dibujar energía con animación
     if ('type' in obj && obj.type === 'energy') {
       // Calcular el índice de frame actual para la animación
       const frameIndex = Math.floor(Date.now() / 100) % 6; // Cambio de frame cada 100ms
       
       // Verificar si tenemos el sprite cargado
       if (energySpritesRef.current[frameIndex]) {
         const energyImg = energySpritesRef.current[frameIndex];
         // Hacemos el sprite un poco más grande que el radio físico del objeto
         const energyImgSize = obj.radius * 2 * 0.9; // Reducido de 1.2 a 0.9
         ctx.drawImage(energyImg, obj.x - energyImgSize/2, obj.y - energyImgSize/2, energyImgSize, energyImgSize);
         return; // Salir de la función, ya dibujamos el objeto
       }
     }
     
     // Dibujar checkpoint (estático)
     if ('type' in obj && obj.type === 'checkpoint') {
       // Usar la referencia cargada para evitar parpadeo
       const checkpointImg = checkpointImgRef.current;
      if (checkpointImg) {
        // Usar el tamaño natural de la imagen del checkpoint
        const checkpointWidth = checkpointImg.naturalWidth;
        const checkpointHeight = checkpointImg.naturalHeight;
         
         ctx.save();
         ctx.translate(obj.x, obj.y);
         
         // Añadir efecto de aura dorada estática
         // 1. Crear un gradiente radial para el aura
         const auraRadius = Math.max(checkpointWidth, checkpointHeight) * 0.75; // Radio del aura
         const gradientAura = ctx.createRadialGradient(0, 0, auraRadius * 0.3, 0, 0, auraRadius);
         gradientAura.addColorStop(0, 'rgba(255, 215, 0, 0.7)'); // Dorado brillante en el centro
         gradientAura.addColorStop(0.5, 'rgba(255, 215, 0, 0.3)'); // Dorado más transparente
         gradientAura.addColorStop(1, 'rgba(255, 215, 0, 0)'); // Completamente transparente en los bordes
         
         // 2. Dibujar el aura estática (sin pulso)
         ctx.beginPath();
         ctx.fillStyle = gradientAura;
         ctx.arc(0, 0, auraRadius, 0, Math.PI * 2);
         ctx.fill();
         
         // 3. Añadir sombra dorada al sprite
         ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
         ctx.shadowBlur = 15;
         
         // Dibujar con tamaño natural de la imagen, centrando la imagen
         ctx.drawImage(
           checkpointImg, 
           -checkpointWidth/2, 
           -checkpointHeight/2, 
           checkpointWidth, 
           checkpointHeight
         );
         
         // Restaurar el contexto
         ctx.shadowBlur = 0;
         ctx.restore();
       }
       return;
     }
     
     // Dibujar runas del tótem
     if ('type' in obj && obj.type === 'rune') {
       const runeCollectible = obj as Collectible;
       const runeColor = runeCollectible.color || '#9fa8da';
       const runeRadius = runeCollectible.radius * 1.1;
       
       // Mapear tipo de runa a imagen
       let runeImageKey: string;
       switch (runeCollectible.runeType) {
         case 'miner':
           runeImageKey = 'runa_miner';
           break;
         case 'chef':
           runeImageKey = 'runa_chef';
           break;
         case 'engineer':
           runeImageKey = 'runa_engineer';
           break;
         case 'farmer':
           runeImageKey = 'runa_farmer';
           break;
         case 'gatherer':
           runeImageKey = 'runa_gatherer';
           break;
         default:
           runeImageKey = 'runa_miner'; // Fallback
           break;
       }

       const runeImg = assetLoader.getAsset(runeImageKey as any);
       
       ctx.save();
       
      if (runeImg) {
        // Usar la imagen de la runa
        const imgSize = runeRadius * 2; // Tamaño basado en el radio
         ctx.drawImage(
           runeImg,
           obj.x - imgSize / 2,
           obj.y - imgSize / 2,
           imgSize,
           imgSize
         );
       } else {
         // Fallback al renderizado original si la imagen no está cargada
         ctx.shadowColor = runeColor;
         ctx.shadowBlur = 18;

         // Aura exterior
         const gradient = ctx.createRadialGradient(obj.x, obj.y, runeRadius * 0.2, obj.x, obj.y, runeRadius);
         gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
         gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
         gradient.addColorStop(1, 'rgba(0,0,0,0)');

         ctx.beginPath();
         ctx.fillStyle = gradient;
         ctx.arc(obj.x, obj.y, runeRadius * 1.4, 0, Math.PI * 2);
         ctx.fill();

         // Núcleo de la runa
         ctx.beginPath();
         ctx.fillStyle = runeColor;
         ctx.globalAlpha = 0.9;
         ctx.arc(obj.x, obj.y, runeRadius, 0, Math.PI * 2);
         ctx.fill();
         ctx.globalAlpha = 1;

         ctx.lineWidth = 3;
         ctx.strokeStyle = 'rgba(15, 15, 25, 0.85)';
         ctx.stroke();

         // Símbolo central
         ctx.shadowBlur = 0;
         ctx.fillStyle = 'rgba(10, 10, 22, 0.95)';
         ctx.font = 'bold 18px Mitr-Bold';
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         const runeLabel = runeCollectible.runeType && RUNE_CONFIG[runeCollectible.runeType] 
           ? RUNE_CONFIG[runeCollectible.runeType].label.charAt(0).toUpperCase() 
           : 'R';
         ctx.fillText(runeLabel, obj.x, obj.y + 1);
       }

       ctx.restore();
       return;
     }

     // Dibujar heart (vida extra)
     if ('type' in obj && obj.type === 'heart') {
       const heartImg = assetLoader.getAsset('corazoncukies');
       if (heartImg) {
         // Efecto de pulsación igual que mega_node
         const pulseScale = 0.9 + 0.2 * Math.sin((Date.now() % 2000) / 2000 * Math.PI * 2);
         const baseSize = obj.radius * 2 * 1.2; // Ligeramente más grande para mejor visibilidad
         const scaledSize = baseSize * pulseScale;
         
         // EFECTO DE PARPADEO: controlar la opacidad solo para esta imagen
         if ('isBlinking' in obj && obj.isBlinking) {
           // Parpadeo rápido: visible 200ms, invisible 200ms
           const blinkCycle = Math.floor(Date.now() / 200) % 2;
           const alpha = blinkCycle === 0 ? 0.3 : 1.0;
           ctx.globalAlpha = alpha;
         }
         
         ctx.drawImage(heartImg, obj.x - scaledSize/2, obj.y - scaledSize/2, scaledSize, scaledSize);
         
         // Restaurar alpha inmediatamente después de dibujar la imagen
         ctx.globalAlpha = 1.0;
         
         // Añadir efecto de brillo / resplandor sutil alrededor de corazón rojo
         ctx.save();
         ctx.translate(obj.x, obj.y);
         ctx.shadowColor = 'rgba(255, 100, 100, 0.6)';
         ctx.shadowBlur = 12;
         ctx.restore();
       }
       return;
     }

    if ('type' in obj && obj.type === 'goatSkin') {
      ctx.save();
      ctx.translate(obj.x, obj.y);

      const time = Date.now();
      const pulse = 0.92 + 0.1 * Math.sin(time / 220);
      const baseRadius = obj.radius * 1.4;

      // Efecto amarillo eliminado - solo mostrar la imagen
      // Removido: ctx.rotate(rotation); - El goatskin ya no rota

      // Usar la imagen de goatskin en lugar del hexágono dibujado
      const goatskinImg = assetLoader.getAsset('goatskin');
      if (goatskinImg) {
        const imgSize = baseRadius * 2 * pulse; // Tamaño basado en el radio con efecto de pulso
        ctx.drawImage(
          goatskinImg,
          -imgSize / 2,
          -imgSize / 2,
          imgSize,
          imgSize
        );
      } else {
        // Fallback al hexágono original si la imagen no está cargada
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const px = Math.cos(angle) * baseRadius * pulse;
          const py = Math.sin(angle) * baseRadius * pulse;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = GOAT_SKIN_COLOR;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255, 245, 200, 0.7)';
        ctx.stroke();

        // Diamante interior brillante
        const diamondSize = baseRadius * 0.55;
        ctx.beginPath();
        ctx.moveTo(0, -diamondSize);
        ctx.lineTo(diamondSize, 0);
        ctx.lineTo(0, diamondSize);
        ctx.lineTo(-diamondSize, 0);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 252, 224, 0.9)';
        ctx.fill();

        // Brillos adicionales (sin rotación)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -baseRadius * 1.1);
        ctx.lineTo(0, -baseRadius * 1.4);
        ctx.moveTo(0, baseRadius * 1.1);
        ctx.lineTo(0, baseRadius * 1.4);
        ctx.moveTo(-baseRadius * 1.1, 0);
        ctx.lineTo(-baseRadius * 1.4, 0);
        ctx.moveTo(baseRadius * 1.1, 0);
        ctx.lineTo(baseRadius * 1.4, 0);
        ctx.stroke();
      }

      ctx.restore();
      return;
    }

     // Dibujar vaul (cofre con multiplicador)
     if ('type' in obj && obj.type === 'vaul') {
       const vaulImg = vaulImgRef.current;
       if (vaulImg) {
         // Tamaño fijo de 70x70 px según especificación
         const vaulImgSize = 70;
         
         ctx.save();
         ctx.translate(obj.x, obj.y);
         
         // EFECTO DE PARPADEO: igual que otros collectibles
         if ('isBlinking' in obj && obj.isBlinking) {
           const blinkCycle = Math.floor(Date.now() / 200) % 2;
           const alpha = blinkCycle === 0 ? 0.3 : 1.0;
           ctx.globalAlpha = alpha;
         }
         
         // Añadir aura dorada especial para el vaul
         const auraRadius = vaulImgSize * 0.8;
         const gradientAura = ctx.createRadialGradient(0, 0, auraRadius * 0.3, 0, 0, auraRadius);
         gradientAura.addColorStop(0, 'rgba(255, 215, 0, 0.6)');
         gradientAura.addColorStop(0.5, 'rgba(255, 165, 0, 0.3)');
         gradientAura.addColorStop(1, 'rgba(255, 215, 0, 0)');
         
         // Dibujar aura con pulso
         const auraPulse = 1.0 + 0.3 * Math.sin((Date.now() % 1500) / 1500 * Math.PI * 2);
         ctx.beginPath();
         ctx.fillStyle = gradientAura;
         ctx.arc(0, 0, auraRadius * auraPulse, 0, Math.PI * 2);
         ctx.fill();
         
         // Añadir sombra dorada
         ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
         ctx.shadowBlur = 20;
         
         ctx.drawImage(vaulImg, -vaulImgSize/2, -vaulImgSize/2, vaulImgSize, vaulImgSize);
         
         // Restaurar alpha inmediatamente después de dibujar el vault
         ctx.globalAlpha = 1.0;
         
         // Barra de progreso con posicionamiento mejorado
         if (barrImgRef.current && progressBarrImgRef.current) {
           const progress = ('activationProgress' in obj) ? (obj.activationProgress || 0) : 0;
           
           // Posicionar barra
           const barWidth = 80;
           const barHeight = 12;
           const margin = 15;
           
           // LÓGICA CONDICIONAL: Determinar posición de la barra
           // Por defecto debajo del vaul, pero arriba si está muy cerca del borde inferior O si hay un bug tapando
           const minDistanceFromBottom = 40; // Distancia mínima desde el borde inferior del canvas
           const vaulBottomY = obj.y + (vaulImgSize/2); // Posición inferior del vaul
           const barBelowY = vaulBottomY + margin + barHeight; // Posición de la barra si va debajo
           
           // NUEVA LÓGICA: Detectar si hay un bug cerca que pueda tapar la barra
           let bugBlockingBar = false;
           const barArea = {
             x: obj.x - barWidth/2,
             y: vaulBottomY + margin - barHeight/2,
             width: barWidth,
             height: barHeight + margin * 2 // Un poco más de área para detectar conflictos
           };
           
           // Buscar bugs que estén en el área de la barra
           if (gameState.obstacles) {
             for (const obstacle of gameState.obstacles) {
               if (obstacle.type === 'bug') {
                 const bugRadius = obstacle.radius * 1.5; // Considerando el tamaño visual del bug
                 const distance = Math.sqrt(
                   Math.pow(obstacle.x - obj.x, 2) + 
                   Math.pow(obstacle.y - (barArea.y + barArea.height/2), 2)
                 );
                 
                 // Si el bug está lo suficientemente cerca para tapar la barra
                 if (distance < (bugRadius + barWidth/2 + 10)) {
                   bugBlockingBar = true;
                   console.log(`[VAUL BAR] Bug detectado tapando barra - Bug: (${obstacle.x.toFixed(1)}, ${obstacle.y.toFixed(1)})`);
                   break;
                 }
               }
             }
           }
           
           let offsetY;
           if (barBelowY >= (height - minDistanceFromBottom)) {
             // Muy cerca del borde inferior → posicionar ARRIBA
             offsetY = -(vaulImgSize/2 + margin);
             console.log(`[VAUL BAR] Posicionando ARRIBA - Vaul Y: ${obj.y.toFixed(1)}, Canvas height: ${height}`);
           } else if (bugBlockingBar) {
             // Bug tapando la barra → posicionar ARRIBA
             offsetY = -(vaulImgSize/2 + margin);
             console.log(`[VAUL BAR] Posicionando ARRIBA - Bug tapando barra`);
           } else {
             // Posición normal → posicionar DEBAJO
             offsetY = (vaulImgSize/2 + margin);
             console.log(`[VAUL BAR] Posicionando DEBAJO - Vaul Y: ${obj.y.toFixed(1)}, Canvas height: ${height}`);
           }
           
           ctx.save();
           ctx.translate(0, offsetY);
           
           // Dibujar fondo de la barra con sombra
           ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
           ctx.shadowBlur = 5;
           ctx.drawImage(
             barrImgRef.current,
             -barWidth/2,
             -barHeight/2,
             barWidth,
             barHeight
           );
           
           // Resetear sombra para la barra de progreso
           ctx.shadowBlur = 0;
           
           // Dibujar progreso con efecto brillante
           if (progress > 0) {
             const progressWidth = barWidth * progress;
             
             ctx.save();
             // Crear región de recorte para el progreso
             ctx.beginPath();
             ctx.rect(-barWidth/2, -barHeight/2, progressWidth, barHeight);
             ctx.clip();
             
             // Dibujar la barra de progreso con brillo
             ctx.globalAlpha = 0.9 + Math.sin(Date.now() / 200) * 0.1;
             ctx.drawImage(
               progressBarrImgRef.current,
               -barWidth/2,
               -barHeight/2,
               barWidth,
               barHeight
             );
             ctx.restore();
           }
           
           ctx.restore();
         }
         
         ctx.restore();
         return;
       }
     }
     
     // Continuar con la lógica normal para otros objetos
     if ('type' in obj) {
       switch(obj.type) {
         case 'fee':
           // Los fees no deben usar imagen estática, siempre sprites animados
           return; // Saltar renderizado fallback para fees
         case 'bug':
           img = bugImgRef.current;
           break;
         case 'hacker':
           img = hackerImgRef.current;
           break;
         case 'energy':
           // Usar el primer sprite de energía como fallback (ya no imagen estática)
           img = energySpritesRef.current[0];
           break;
         case 'megaNode':
           img = megaNodeImgRef.current;
           break;
         case 'purr':
           // Para purr, usar el primer sprite como fallback
           img = purrSprite1Ref.current;
           break;
         case 'heart':
           img = assetLoader.getAsset('corazoncukies');
           break;
         case 'vaul':
           img = vaulImgRef.current;
           break;
         case 'uki':
           // Usar imagen de uki.png
           img = assetLoader.getAsset('uki');
           break;
        case 'treasure':
          img = assetLoader.getAsset('treasure');
          break;
        case 'treasure2':
          img = assetLoader.getAsset('treasure2');
          break;
        case 'treasure3':
          img = assetLoader.getAsset('treasure3');
          break;
         case 'checkpoint':
           // Para checkpoint, usar el primer sprite de energía como fallback
           img = energySpritesRef.current[0];
           break;
         default:
           // MEJORADO: Para cualquier tipo no reconocido, usar mega_node como fallback genérico
           img = megaNodeImgRef.current;
       }
     } else {
       // Es el token (jugador)
       img = tokenImgRef.current;
     }
     
     // Si tenemos una imagen, dibujarla
     if (img) {
       // Calcular posición para centrar la imagen (imagen debe ser cuadrada, 2x el radio)
       const imgSize = obj.radius * 2;
       
       // Eliminado código de depuración de hitboxes
       
       // Aplicar rotación para el bug con animación de sprites
       if ('type' in obj && obj.type === 'bug') {
         // Calculamos una rotación automática con velocidad
         const rotationSpeed = 0.001;
         const uniqueOffset = obj.id ? obj.id.charCodeAt(0) / 100 : 0;
         const autoRotation = ((Date.now() * rotationSpeed) + uniqueOffset) % (Math.PI * 2);
         
         // Tamaño del bug
         const bugImgSize = obj.radius * 2 * 1.5;
         
         // Añadir efecto de glow violeta por detrás de todo el bug
         ctx.save();
         
         // Crear múltiples capas de glow violeta
         const glowLayers = [
           { blur: 30, alpha: 0.4, scale: 1.8 },
           { blur: 20, alpha: 0.6, scale: 1.4 },
           { blur: 10, alpha: 0.8, scale: 1.2 }
         ];
         
         glowLayers.forEach(layer => {
           const glowSize = bugImgSize * layer.scale;
           
           ctx.shadowColor = `rgba(138, 43, 226, ${layer.alpha})`;
           ctx.shadowBlur = layer.blur;
           ctx.shadowOffsetX = 0;
           ctx.shadowOffsetY = 0;
           
           ctx.fillStyle = `rgba(138, 43, 226, 0.1)`;
           ctx.beginPath();
           ctx.arc(obj.x, obj.y, glowSize/2, 0, Math.PI * 2);
           ctx.fill();
         });
         
         // Efecto pulsante
         const pulseTime = Date.now() * 0.004;
         const pulseIntensity = 0.3 + 0.2 * Math.sin(pulseTime);
         
         ctx.shadowColor = `rgba(138, 43, 226, ${pulseIntensity})`;
         ctx.shadowBlur = 40 + 15 * Math.sin(pulseTime * 1.5);
         ctx.shadowOffsetX = 0;
         ctx.shadowOffsetY = 0;
         ctx.fillStyle = `rgba(138, 43, 226, 0.05)`;
         ctx.beginPath();
         ctx.arc(obj.x, obj.y, bugImgSize * 0.9, 0, Math.PI * 2);
         ctx.fill();
         
         ctx.restore();
         
         // PASO 1: Dibujar bug.png estático CON ROTACIÓN en el fondo
         if (img) {
           ctx.save();
           ctx.translate(obj.x, obj.y);
           ctx.rotate(autoRotation);
           
           // Cambiado el efecto de aura roja por verde oscuro
           ctx.shadowColor = 'rgba(0, 100, 0, 0.8)';
           ctx.shadowBlur = 15;
           
           // Dibujar un halo verde oscuro pulsante debajo para enfatizar el peligro
           ctx.beginPath();
           ctx.arc(0, 0, obj.radius * 1.2, 0, Math.PI * 2);
           ctx.fillStyle = 'rgba(0, 100, 0, 0.2)';
           ctx.fill();
           
           // Dibujar el bug.png estático con rotación
           ctx.drawImage(img, -bugImgSize/2, -bugImgSize/2, bugImgSize, bugImgSize);
           
           ctx.restore();
         }
         
         // PASO 2: Dibujar sprites animados SIN ROTACIÓN encima
         // Calcular el índice de frame actual para la animación (3 frames como mega_node)
         const frameIndex = Math.floor(Date.now() / 300) % 3; // Cambio de frame cada 300ms
         
         // Seleccionar el sprite basado en el frameIndex
         let spriteImg = null;
         if (frameIndex === 0) {
           spriteImg = bugSprite1Ref.current;
         } else if (frameIndex === 1) {
           spriteImg = bugSprite2Ref.current;
         } else {
           spriteImg = bugSprite3Ref.current;
         }
         
         // Dibujar el sprite SIN rotación encima del bug estático
         if (spriteImg) {
           // Resetear sombras para los sprites
           ctx.shadowColor = 'rgba(0, 0, 0, 0)';
           ctx.shadowBlur = 0;
           
           // Hacer los sprites un poco más pequeños para que tapen bien el bug.png
           const spriteSize = bugImgSize * 0.85; // Reducido de 1.0 a 0.85 para mejor cobertura
           
           // Dibujar el sprite del bug SIN rotación, directamente en la posición
           ctx.drawImage(spriteImg, obj.x - spriteSize/2, obj.y - spriteSize/2, spriteSize, spriteSize);
         }
         
         return; // Importante: salir de la función para evitar redibujado
       }
      // Render Haku (antes mega node) usando imagen estática haku.png
      else if ('type' in obj && obj.type === 'megaNode') {
         ctx.save();
         ctx.translate(obj.x, obj.y);
         
         // Efecto de flotación vertical suave
         const floatAmplitude = obj.radius * 0.15; // 15% del radio para un movimiento sutil
         const floatPeriod = 1500; // 1.5 segundos para un ciclo completo
         // ✅ CORREGIDO: Usar tiempo pausable para animaciones
         const gameTime = gameState.status === 'paused' 
           ? (gameState.gameStartTime || 0) // Tiempo fijo durante pausa
           : gameState.gameStartTime 
             ? (Date.now() - gameState.gameStartTime) 
             : Date.now();
         const floatOffset = floatAmplitude * Math.sin(gameTime / floatPeriod * Math.PI * 2);
         
         // Aplicar la transformación para el efecto float
         ctx.translate(0, floatOffset);
         
         // También añadir un leve balanceo horizontal
         const tiltAmplitude = 0.05; // 0.05 radianes (≈3 grados) de inclinación
         const tiltPeriod = 2200; // Período ligeramente diferente para que no coincida con el float vertical
         const tiltAngle = tiltAmplitude * Math.sin(gameTime / tiltPeriod * Math.PI * 2);
         ctx.rotate(tiltAngle);
        
        // Tamaño para Haku
        const baseSize = obj.radius * 2 * 1.2; // Un poco más grande para mejor visibilidad
        const hakuImg = megaNodeImgRef.current; // ahora apunta a haku.png
        
        // EFECTO DE FONDO: Añadir un círculo de fondo con gradiente para mejorar la visibilidad
        const backgroundRadius = baseSize * 0.7; // Radio del círculo de fondo
        const pulseIntensity = 0.3 + 0.2 * Math.sin(gameTime / 800); // Efecto pulsante
        
        // Capa 1: Círculo exterior con gradiente radial oscuro (contraste con fondo azul)
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        const outerGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, backgroundRadius * 1.5);
        outerGradient.addColorStop(0, `rgba(20, 20, 40, ${0.6 + pulseIntensity * 0.2})`);
        outerGradient.addColorStop(0.5, `rgba(30, 30, 60, ${0.4 + pulseIntensity * 0.15})`);
        outerGradient.addColorStop(1, 'rgba(20, 20, 40, 0.0)');
        ctx.fillStyle = outerGradient;
        ctx.beginPath();
        ctx.arc(0, 0, backgroundRadius * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // Capa 2: Círculo medio con borde más definido
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        const midGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, backgroundRadius * 1.2);
        midGradient.addColorStop(0, `rgba(40, 40, 80, ${0.5 + pulseIntensity * 0.2})`);
        midGradient.addColorStop(0.7, `rgba(30, 30, 70, ${0.3 + pulseIntensity * 0.15})`);
        midGradient.addColorStop(1, 'rgba(20, 20, 50, 0.0)');
        ctx.fillStyle = midGradient;
        ctx.beginPath();
        ctx.arc(0, 0, backgroundRadius * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // Capa 3: Halo azul cian brillante alrededor del haku
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const glowGradient = ctx.createRadialGradient(0, 0, backgroundRadius * 0.3, 0, 0, backgroundRadius * 1.1);
        glowGradient.addColorStop(0, `rgba(100, 200, 255, ${0.3 + pulseIntensity * 0.2})`);
        glowGradient.addColorStop(0.5, `rgba(80, 180, 255, ${0.2 + pulseIntensity * 0.15})`);
        glowGradient.addColorStop(1, 'rgba(60, 150, 255, 0.0)');
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(0, 0, backgroundRadius * 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        if (hakuImg) {
          if ('isBlinking' in obj && obj.isBlinking) {
            const blinkCycle = Math.floor(Date.now() / 200) % 2;
            const alpha = blinkCycle === 0 ? 0.3 : 1.0;
            ctx.globalAlpha = alpha;
          }
          
          // Dibujar el haku con sombra azul brillante
          ctx.save();
          ctx.shadowColor = `rgba(80, 180, 255, ${0.6 + pulseIntensity * 0.2})`;
          ctx.shadowBlur = 15 + 8 * Math.sin(gameTime / 1000);
          ctx.drawImage(hakuImg, -baseSize/2, -baseSize/2, baseSize, baseSize);
          ctx.restore();
          
          ctx.globalAlpha = 1.0;
        }
         
         // Resetear sombra antes de restaurar contexto
         ctx.shadowBlur = 0;
         ctx.restore();
       }
       // Animación de sprites para purr (gato) - COPIADO EXACTAMENTE DE MEGA_NODE
       else if ('type' in obj && obj.type === 'purr') {
         ctx.save();
         ctx.translate(obj.x, obj.y);
         
         // Efecto de flotación vertical suave
         const floatAmplitude = obj.radius * 0.15; // 15% del radio para un movimiento sutil
         const floatPeriod = 1300; // Período ligeramente diferente del mega_node
         const floatOffset = floatAmplitude * Math.sin(getAnimationTime() / floatPeriod * Math.PI * 2);
         
         // Aplicar la transformación para el efecto float
         ctx.translate(0, floatOffset);
         
         // También añadir un leve balanceo horizontal
         const tiltAmplitude = 0.04; // Ligeramente diferente del mega_node
         const tiltPeriod = 2000; // Período ligeramente diferente para variación
         const tiltAngle = tiltAmplitude * Math.sin(Date.now() / tiltPeriod * Math.PI * 2);
         ctx.rotate(tiltAngle);
         
         // Calcular el índice de frame actual para la animación (4 frames para purr)
         const frameIndex = Math.floor(Date.now() / 250) % 4; // Cambio de frame cada 250ms
         
         // Tamaño fijo para purr
         const baseSize = obj.radius * 2 * 1.15; // Ligeramente diferente del mega_node
         
         // Seleccionar el sprite basado en el frameIndex
         let spriteImg = null;
         if (frameIndex === 0) {
           spriteImg = purrSprite1Ref.current;
         } else if (frameIndex === 1) {
           spriteImg = purrSprite2Ref.current;
         } else if (frameIndex === 2) {
           spriteImg = purrSprite3Ref.current;
         } else {
           // Solo tenemos 3 sprites de purr, usar el sprite 3 como fallback
           spriteImg = purrSprite3Ref.current;
         }
         
         // Usar el sprite si está disponible, de lo contrario usar la imagen estática
         if (spriteImg) {
           // EFECTO DE PARPADEO: controlar la opacidad solo para esta imagen
           if ('isBlinking' in obj && obj.isBlinking) {
             // Parpadeo rápido: visible 200ms, invisible 200ms
             const blinkCycle = Math.floor(Date.now() / 200) % 2;
             const alpha = blinkCycle === 0 ? 0.3 : 1.0;
             ctx.globalAlpha = alpha;
           }
           
           // Dibujamos el sprite con el tamaño y posición adecuados
           ctx.drawImage(spriteImg, -baseSize/2, -baseSize/2, baseSize, baseSize);
           
           // Restaurar alpha inmediatamente después de dibujar la imagen
           ctx.globalAlpha = 1.0;
           
           // Añadir efecto de brillo / resplandor sutil alrededor
           ctx.shadowColor = 'rgba(255, 80, 180, 0.4)'; // Color rosado para el gato
           ctx.shadowBlur = 8 + 3 * Math.sin(Date.now() / 1200);
         } else {
           // Mostrar advertencia solo la primera vez (1 por cada sprite faltante)
           if (frameIndex === 0 && !purrSprite1Ref.current) {
             console.warn('⚠️ Sprite #1 para purr no disponible');
           } else if (frameIndex === 1 && !purrSprite2Ref.current) {
             console.warn('⚠️ Sprite #2 para purr no disponible');
           } else if (frameIndex === 2 && !purrSprite3Ref.current) {
             console.warn('⚠️ Sprite #3 para purr no disponible');
           }
           
           // Dibujar el sprite fallback
           if (purrSprite1Ref.current) {
             // EFECTO DE PARPADEO para imagen fallback
             if ('isBlinking' in obj && obj.isBlinking) {
               const blinkCycle = Math.floor(Date.now() / 200) % 2;
               const alpha = blinkCycle === 0 ? 0.3 : 1.0;
               ctx.globalAlpha = alpha;
             }
             
             ctx.drawImage(purrSprite1Ref.current, -baseSize/2, -baseSize/2, baseSize, baseSize);
             ctx.globalAlpha = 1.0; // Restaurar alpha inmediatamente
           } else {
             // Si no tenemos ningún sprite disponible, usar sprite específico
             const fallbackFrame = frameIndex % 4 + 1;
             const fallbackSprite = new Image();
             fallbackSprite.src = `/assets/collectibles/purr/purr_${fallbackFrame}.png`;
             
             // EFECTO DE PARPADEO para sprite fallback
             if ('isBlinking' in obj && obj.isBlinking) {
               const blinkCycle = Math.floor(Date.now() / 200) % 2;
               const alpha = blinkCycle === 0 ? 0.3 : 1.0;
               ctx.globalAlpha = alpha;
             }
             
             ctx.drawImage(fallbackSprite, -baseSize/2, -baseSize/2, baseSize, baseSize);
             ctx.globalAlpha = 1.0; // Restaurar alpha inmediatamente
           }
         }
         
         // Resetear sombra antes de restaurar contexto
         ctx.shadowBlur = 0;
         ctx.restore();
       }
       // Renderizar el hacker (Trump)
       else if ('type' in obj && obj.type === 'hacker') {
         // Determinar la dirección del hacker basada en su velocidad
         let direction: 'up' | 'left' | 'right' = 'right'; // Dirección por defecto
         
         if (obj.velocity) {
           // Si se mueve principalmente hacia arriba
           if (obj.velocity.y < 0 && Math.abs(obj.velocity.y) > Math.abs(obj.velocity.x)) {
             direction = 'up';
           } 
           // Si se mueve horizontalmente o hacia abajo, usar left o right
           else {
             direction = obj.velocity.x >= 0 ? 'right' : 'left';
           }
         }
         
         // Guardar la dirección en el objeto para mantener consistencia
         obj.direction = direction as DirectionType;
         
         // Calcular el índice de frame actual para la animación
         // Si no tiene frameIndex o frameTimer, inicializarlos
         if (obj.frameIndex === undefined) {
           obj.frameIndex = 0;
         }
         if (obj.frameTimer === undefined) {
           obj.frameTimer = 0;
         }
         
         // Obtener el sprite correcto según la dirección y el frame
         if (hackerSpritesRef.current[direction] && hackerSpritesRef.current[direction][obj.frameIndex % 5]) {
           const hackerImg = hackerSpritesRef.current[direction][obj.frameIndex % 5];
           const hackerImgSize = obj.radius * 2 * 1.2; // Ligeramente más grande para mejor visibilidad
           
           // Dibujar el sprite del hacker
           ctx.save();
           ctx.translate(obj.x, obj.y);
           
           // Añadir un pequeño efecto de flotación vertical
           const floatOffset = 2 * Math.sin(Date.now() / 500);
           ctx.translate(0, floatOffset);
           
           // Aplicar un leve brillo maligno alrededor del hacker
           ctx.shadowColor = 'rgba(255, 0, 0, 0.4)';
           ctx.shadowBlur = 10;
           
           ctx.drawImage(hackerImg, -hackerImgSize/2, -hackerImgSize/2, hackerImgSize, hackerImgSize);
           
           // Dibujar la frase si está en estado "showing" y tiene una frase definida
           if (obj.phraseState === 'showing' && obj.currentPhrase) {
             // Configurar el estilo del texto
             ctx.font = '16px Mitr-Bold';
             ctx.textAlign = 'center';
             ctx.textBaseline = 'bottom';
             
             // Crear un fondo para el texto
             const textWidth = ctx.measureText(obj.currentPhrase).width;
             const padding = 10;
             const bubbleWidth = textWidth + padding * 2;
             const bubbleHeight = 30;
             
             // Dibujar el globo de texto (con un pequeño pico apuntando hacia el hacker)
             ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
             ctx.beginPath();
             // Posición del globo encima del hacker
             const bubbleY = -hackerImgSize/2 - 20;
             
             // Dibujar el rectángulo redondeado
             const radius = 8;
             ctx.beginPath();
             ctx.moveTo(-bubbleWidth/2 + radius, bubbleY - bubbleHeight);
             ctx.lineTo(bubbleWidth/2 - radius, bubbleY - bubbleHeight);
             ctx.quadraticCurveTo(bubbleWidth/2, bubbleY - bubbleHeight, bubbleWidth/2, bubbleY - bubbleHeight + radius);
             ctx.lineTo(bubbleWidth/2, bubbleY - radius);
             ctx.quadraticCurveTo(bubbleWidth/2, bubbleY, bubbleWidth/2 - radius, bubbleY);
             
             // Dibujar el pico
             ctx.lineTo(10, bubbleY);
             ctx.lineTo(0, bubbleY + 10);
             ctx.lineTo(-10, bubbleY);
             
             ctx.lineTo(-bubbleWidth/2 + radius, bubbleY);
             ctx.quadraticCurveTo(-bubbleWidth/2, bubbleY, -bubbleWidth/2, bubbleY - radius);
             ctx.lineTo(-bubbleWidth/2, bubbleY - bubbleHeight + radius);
             ctx.quadraticCurveTo(-bubbleWidth/2, bubbleY - bubbleHeight, -bubbleWidth/2 + radius, bubbleY - bubbleHeight);
             ctx.fill();
             
             // Dibujar el texto
             ctx.fillStyle = 'black';
             ctx.fillText(obj.currentPhrase, 0, bubbleY - bubbleHeight/2 + 5);
           }
           
           ctx.restore();
           return;
         }
         // Fallback a la imagen estática si los sprites no están disponibles
         else {
           // Dibujar la imagen con un tamaño proporcional al radio de colisión
           const hackerImgSize = obj.radius * 2 * 1.1; // Ligeramente más grande para mejor visibilidad
           
           // Añadir un pequeño efecto de pulsación
           const pulseScale = 1.0 + 0.1 * Math.sin(Date.now() / 500); // Pulsación sutil
           const scaledSize = hackerImgSize * pulseScale;
           
           // Dibujar la imagen de Trump
           ctx.drawImage(img, obj.x - scaledSize/2, obj.y - scaledSize/2, scaledSize, scaledSize);
           
           // Dibujar la frase si está en estado "showing" y tiene una frase definida
           if (obj.phraseState === 'showing' && obj.currentPhrase) {
             // Configurar el estilo del texto
             ctx.font = '16px Mitr-Bold';
             ctx.textAlign = 'center';
             ctx.textBaseline = 'bottom';
             
             // Crear un fondo para el texto
             const textWidth = ctx.measureText(obj.currentPhrase).width;
             const padding = 10;
             const bubbleWidth = textWidth + padding * 2;
             const bubbleHeight = 30;
             
             // Posición del globo encima del hacker
             const bubbleY = obj.y - scaledSize/2 - 20;
             
             // Dibujar el globo de texto (con un pequeño pico apuntando hacia el hacker)
             ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
             ctx.beginPath();
             
             // Dibujar el rectángulo redondeado
             const radius = 8;
             ctx.beginPath();
             ctx.moveTo(obj.x - bubbleWidth/2 + radius, bubbleY - bubbleHeight);
             ctx.lineTo(obj.x + bubbleWidth/2 - radius, bubbleY - bubbleHeight);
             ctx.quadraticCurveTo(obj.x + bubbleWidth/2, bubbleY - bubbleHeight, obj.x + bubbleWidth/2, bubbleY - bubbleHeight + radius);
             ctx.lineTo(obj.x + bubbleWidth/2, bubbleY - radius);
             ctx.quadraticCurveTo(obj.x + bubbleWidth/2, bubbleY, obj.x + bubbleWidth/2 - radius, bubbleY);
             
             // Dibujar el pico
             ctx.lineTo(obj.x + 10, bubbleY);
             ctx.lineTo(obj.x, bubbleY + 10);
             ctx.lineTo(obj.x - 10, bubbleY);
             
             ctx.lineTo(obj.x - bubbleWidth/2 + radius, bubbleY);
             ctx.quadraticCurveTo(obj.x - bubbleWidth/2, bubbleY, obj.x - bubbleWidth/2, bubbleY - radius);
             ctx.lineTo(obj.x - bubbleWidth/2, bubbleY - bubbleHeight + radius);
             ctx.quadraticCurveTo(obj.x - bubbleWidth/2, bubbleY - bubbleHeight, obj.x - bubbleWidth/2 + radius, bubbleY - bubbleHeight);
             ctx.fill();
             
             // Dibujar el texto
             ctx.fillStyle = 'black';
             ctx.fillText(obj.currentPhrase, obj.x, bubbleY - bubbleHeight/2 + 5);
           }
         }
       }
       // Para otros tipos de objetos
       else {
         // EFECTO DE PARPADEO: aplicar antes de dibujar cualquier objeto que lo necesite
         if ('isBlinking' in obj && obj.isBlinking) {
           const blinkCycle = Math.floor(Date.now() / 200) % 2;
           const alpha = blinkCycle === 0 ? 0.3 : 1.0;
           ctx.globalAlpha = alpha;
         }
         
         // Los fees siempre usan sprites animados, no imagen estática
         if ('type' in obj && obj.type === 'fee') {
           // Saltar renderizado de fee aquí - se maneja arriba con sprites
           return;
         } else {
           // Si es el token (no tiene 'type'), usar el factor de escala aumentado
           if (!('type' in obj)) {
             const tokenImgSize = imgSize * 1.46; // Factor de escala para token de 70x70px
             ctx.drawImage(img, obj.x - tokenImgSize/2, obj.y - tokenImgSize/2, tokenImgSize, tokenImgSize);
           } else {
             const standardImgSize = imgSize * 0.9; // Factor de escala estándar para otros elementos
             ctx.drawImage(img, obj.x - standardImgSize/2, obj.y - standardImgSize/2, standardImgSize, standardImgSize);
           }
         }
         
         // Restaurar alpha inmediatamente después de dibujar
         ctx.globalAlpha = 1.0;
       }
     } else {
       // MEJORADO: Sistema de fallback que usa imágenes de respaldo en lugar de círculos
       let fallbackImg = null;
       
       // Para el token, usar la imagen estática token.png como fallback final
       if (!('type' in obj)) {
         fallbackImg = tokenImgRef.current;
       } 
       // Para obstáculos, usar las imágenes estáticas correspondientes (excepto fee que usa sprites)
       else if (obj.type === 'fee') {
         // Los fees no deben usar imagen estática, siempre sprites animados
         return; // Saltar renderizado fallback para fees
       } else if (obj.type === 'bug') {
         fallbackImg = bugImgRef.current;
       } else if (obj.type === 'hacker') {
         fallbackImg = hackerImgRef.current;
       }
       // Para collectibles, usar las imágenes estáticas correspondientes
       else if (obj.type === 'energy') {
         fallbackImg = energySpritesRef.current[0]; // Usar primer sprite de energía en lugar de imagen estática
       } else if (obj.type === 'megaNode') {
         fallbackImg = megaNodeImgRef.current;
       } else if (obj.type === 'purr') {
         fallbackImg = purrSprite1Ref.current || megaNodeImgRef.current; // Usar purr_1 o mega_node como backup
       } else if (obj.type === 'heart') {
         fallbackImg = assetLoader.getAsset('corazoncukies');
       } else if (obj.type === 'vaul') {
         fallbackImg = vaulImgRef.current;
       }
       
       // Si tenemos una imagen de fallback, usarla
       if (fallbackImg) {
         const imgSize = obj.radius * 2;
         
         // EFECTO DE PARPADEO: aplicar a todos los collectibles que lo necesiten
         if ('isBlinking' in obj && obj.isBlinking) {
           const blinkCycle = Math.floor(Date.now() / 200) % 2;
           const alpha = blinkCycle === 0 ? 0.3 : 1.0;
           ctx.globalAlpha = alpha;
         }
         
         // Aplicar factores de escala apropiados
         if (!('type' in obj)) {
           // Token
           const tokenImgSize = imgSize * 1.46;
           ctx.drawImage(fallbackImg, obj.x - tokenImgSize/2, obj.y - tokenImgSize/2, tokenImgSize, tokenImgSize);
         } else if (obj.type === 'fee') {
           // Los fees no deben usar imagen estática, siempre sprites animados
           return; // Saltar renderizado fallback para fees
         } else {
           // Otros elementos con tamaño estándar
           const standardImgSize = imgSize * 0.9;
           ctx.drawImage(fallbackImg, obj.x - standardImgSize/2, obj.y - standardImgSize/2, standardImgSize, standardImgSize);
         }
         
         // Restaurar alpha inmediatamente después de dibujar
         ctx.globalAlpha = 1.0;
       } else {
         // Solo como último recurso, usar un círculo muy sutil sin color llamativo
         ctx.save();
         ctx.globalAlpha = 0.3; // Hacer muy transparente
         ctx.fillStyle = 'rgba(128, 128, 128, 0.5)'; // Gris muy sutil
         ctx.beginPath();
         ctx.arc(obj.x, obj.y, obj.radius * 0.8, 0, Math.PI * 2); // Un poco más pequeño
         ctx.fill();
         
         // Añadir un borde para indicar que es un fallback
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
         ctx.lineWidth = 1;
         ctx.stroke();
         ctx.restore();
         
         // Log de advertencia para debug
         console.warn(`⚠️ Fallback final usado para objeto tipo: ${('type' in obj) ? obj.type : 'token'}`);
       }
     }
  };

  const handleResize = useCallback(() => {
    setCanvasSize({ width, height });
  }, [width, height]);

  useEffect(() => {
    setCanvasSize({ width, height });
  }, [width, height]);

  // Detectar entrada en boost y lanzar animación boost
  useEffect(() => {
    const boost = gameState.token.boostTimer || 0;
    if (boost > 0 && prevBoostRef.current === 0) {
      // FIJO: Usar Date.now() para que las animaciones funcionen correctamente
      setExplosion({
        active: true,
        frame: 0,
        x: gameState.token.x,
        y: gameState.token.y,
        start: Date.now()
      });
      console.log('🚀 Explosión de boost activada en posición:', gameState.token.x, gameState.token.y);
    }
    prevBoostRef.current = boost;
  }, [gameState.token.boostTimer, gameState.token.x, gameState.token.y]);

  // Lanzar animación de explosión de energía al recoger energía
  useEffect(() => {
    if (energyCollectedFlag && energyCollectedFlag > 0) {
      // Guardar la posición actual del token
      lastEnergyPosRef.current = { x: gameState.token.x, y: gameState.token.y };
      // TEMPORALMENTE DESHABILITADO: Explosión amarilla/dorada al recoger energy/uki
      // Para reactivar en el futuro, descomentar las siguientes líneas:
      /*
      // FIJO: Usar Date.now() en lugar del tiempo del juego para que las animaciones funcionen correctamente
      setEnExplosion({
        active: true,
        frame: 0,
        x: gameState.token.x,
        y: gameState.token.y,
        start: Date.now()
      });
      console.log('🎆 Explosión de energía activada en posición:', gameState.token.x, gameState.token.y);
      */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [energyCollectedFlag]);

  // Lanzar animación de daño solo cuando damageFlag cambie Y el juego esté en 'playing'
  useEffect(() => {
    const prevDamageFlag = prevDamageFlagRef.current;
    if (damageFlag === prevDamageFlag) {
      return;
    }

    prevDamageFlagRef.current = damageFlag;

    if (!damageFlag || damageFlag <= 0) return;
    if (gameState.status !== 'playing') return;

    // ✅ CORREGIDO: Forzar reinicio de la animación incluso si ya hay una activa
    // Esto asegura que golpes consecutivos rápidos siempre muestren la animación
    const now = Date.now();
    setDamageEffect({ active: true, start: now });
    console.log(`💥 Efecto de daño activado (damageFlag: ${damageFlag}, timestamp: ${now})`);
  }, [damageFlag, gameState.status]);

  // Limpiar efecto de daño cuando el juego no esté en 'playing'
  useEffect(() => {
    if (gameState.status !== 'playing' && damageEffect) {
      setDamageEffect(null);
      console.log('🧹 Efecto de daño limpiado - juego no está en playing');
    }
  }, [gameState.status, damageEffect]);

  // Función para agregar una nueva explosión verde
  const addGreenExplosion = useCallback((x: number, y: number, type: 'heart' | 'megaNode' | 'purr' | 'vaul') => {
    // FIJO: Usar Date.now() para que las animaciones funcionen correctamente
    setGreenExplosions(prev => [...prev, {
      active: true,
      frame: 0,
      x,
      y,
      start: Date.now(),
      type
    }]);
    console.log(`💚 Explosión verde ${type} activada en posición:`, x, y);
  }, []);

  // Detectar cuando un heart, mega_node, purr o vaul desaparece
  useEffect(() => {
    if (gameState.status !== 'playing') return;
    
    // Verificar collectibles que estaban antes pero ya no están
    const currentCollectibles = gameState.collectibles;
    const prevCollectibles = prevCollectiblesRef.current;
    
    // Buscar los mega_node, heart, purr y vaul que ya no están en la lista actual
    prevCollectibles.forEach(prevObj => {
      if ((prevObj.type === 'heart' || prevObj.type === 'megaNode' || prevObj.type === 'purr' || prevObj.type === 'vaul')) {
        // Verificar si este objeto ya no existe en los collectibles actuales
        const stillExists = currentCollectibles.some(currentObj => currentObj.id === prevObj.id);
        
        if (!stillExists) {
          // El objeto ha desaparecido, verificar si fue recolectado por el token o expiró
          const tokenPos = { x: gameState.token.x, y: gameState.token.y };
          const objPos = { x: prevObj.x, y: prevObj.y };
          const distance = Math.sqrt(
            Math.pow(tokenPos.x - objPos.x, 2) + 
            Math.pow(tokenPos.y - objPos.y, 2)
          );
          
          // Si el token está cerca, asumimos que fue recolectado
          // De lo contrario, asumimos que expiró por tiempo
          if (distance < gameState.token.radius + prevObj.radius + 10) {
            // Fue recolectado - agregamos la explosión verde en la posición del token
            // TEMPORALMENTE DESHABILITADO para heart y megaNode: Explosión verde
            // Para reactivar en el futuro, quitar la condición del if
            if (prevObj.type !== 'heart' && prevObj.type !== 'megaNode') {
              addGreenExplosion(tokenPos.x, tokenPos.y, prevObj.type as 'heart' | 'megaNode' | 'purr' | 'vaul');
            }
          } else {
            // Expiró por tiempo - deshabilitar efecto para 'vaul'
            // Mantener explosión verde solo para purr si se desea
            if (prevObj.type !== 'heart' && prevObj.type !== 'megaNode' && prevObj.type !== 'vaul') {
              addGreenExplosion(prevObj.x, prevObj.y, prevObj.type as 'heart' | 'megaNode' | 'purr' | 'vaul');
            }
          }
        }
      }
    });
    
    // Actualizar la referencia para la próxima comparación
    prevCollectiblesRef.current = currentCollectibles;
  }, [gameState.collectibles, gameState.token, gameState.status, addGreenExplosion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Configurar alta calidad de renderizado para sprites
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    const timestamp = Date.now();

    // Dibujar fondo con imagen
    if (gridImgRef.current) {
      // Usar la imagen del grid como fondo
      // Aseguramos que la imagen se dibuje respetando la escala del grid (40px)
      const gridSize = 40;
      const columns = Math.floor(width / gridSize);
      const rows = Math.floor(height / gridSize);
      
      // Dibujamos la imagen manteniendo la proporción exacta del grid
      const adjustedWidth = columns * gridSize;
      const adjustedHeight = rows * gridSize;
      ctx.drawImage(gridImgRef.current, 0, 0, adjustedWidth, adjustedHeight);
    } else {
      // Fallback a grid con líneas si la imagen no está cargada
      ctx.strokeStyle = 'hsl(var(--border) / 0.3)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
         ctx.beginPath();
         ctx.moveTo(x, 0);
         ctx.lineTo(x, height);
         ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
         ctx.beginPath();
         ctx.moveTo(0, y);
         ctx.lineTo(width, y);
         ctx.stroke();
      }
    }

    // Draw Red Zones FIRST (arenas movedizas) - deben estar detrás de los collectibles
    drawRedZones(ctx, gameState.redZones, timestamp);

    // Draw Collectibles (checkpoints aparecen por encima de las arenas movedizas)
    gameState.collectibles.forEach(collectible => drawObject(ctx, collectible));

    // Draw Obstacles in specific order (fees first, then bugs, then hackers)
    // This ensures proper z-index: fees behind bugs, bugs behind hackers
    gameState.obstacles.filter(obstacle => obstacle.type === 'fee').forEach(fee => drawObject(ctx, fee));
    gameState.obstacles.filter(obstacle => obstacle.type === 'bug').forEach(bug => drawObject(ctx, bug));
    gameState.obstacles.filter(obstacle => obstacle.type === 'hacker' && (!obstacle.isBanished || obstacle.isRetreating)).forEach(hacker => drawObject(ctx, hacker));

    // Draw Visual Effects (explosions from fees/hackers collecting energy)
    if (gameState.visualEffects && gameState.visualEffects.length > 0) {
      gameState.visualEffects.forEach(effect => {
        ctx.save();
        ctx.globalAlpha = effect.opacity;
        ctx.translate(effect.x, effect.y);
        ctx.scale(effect.scale, effect.scale);
        
        // Calcular el frame actual basado en el frameIndex del efecto
        const frameIndex = effect.frameIndex || 0;
        
        if (effect.type === 'explosion') {
          // Usar sprites En-Explosion para fees (amarillo/dorado)
          if (enExplosionSpritesRef.current[frameIndex]) {
            const img = enExplosionSpritesRef.current[frameIndex];
            const size = 60; // Tamaño base para fee explosion
            ctx.drawImage(img, -size/2, -size/2, size, size);
          }
          
        } else if (effect.type === 'vault_activation') {
          // Efecto difuminado en tono #B695D5 para vault activado (menos intenso)
          const duration = 500; // antes 700
          const t = Math.min((effect.elapsedTime || 0) / duration, 1);
          const maxRadius = 110 * effect.scale; // antes 140
          const minRadius = 20 * effect.scale; // antes 30
          const radius = minRadius + (maxRadius - minRadius) * t;
          const baseAlpha = 0.35 * (1 - t); // antes 0.6

          ctx.globalCompositeOperation = 'lighter';
          ctx.shadowColor = 'rgba(182, 149, 213, 0.4)'; // antes 0.6
          ctx.shadowBlur = 20 * effect.scale; // antes 35

          const grad = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
          grad.addColorStop(0, `rgba(182, 149, 213, ${Math.min(1, baseAlpha + 0.1)})`);
          grad.addColorStop(0.5, `rgba(182, 149, 213, ${baseAlpha * 0.55})`);
          grad.addColorStop(1, 'rgba(182, 149, 213, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.fill();
          
          const radius2 = radius * 0.6; // antes 0.65
          const grad2 = ctx.createRadialGradient(0, 0, 0, 0, 0, radius2);
          grad2.addColorStop(0, `rgba(182, 149, 213, ${baseAlpha * 0.6})`); // antes *0.8
          grad2.addColorStop(1, 'rgba(182, 149, 213, 0)');
          ctx.fillStyle = grad2;
          ctx.beginPath();
          ctx.arc(0, 0, radius2, 0, Math.PI * 2);
          ctx.fill();
        }
        // Eliminado: partículas doradas
        
        ctx.restore();
      });
    }

    // Draw Rays (warnings and active beams)
    drawRays(ctx, gameState.rays, timestamp);

    // Red Zones ya se dibujaron antes de los collectibles

    // Draw Token (ocultar mientras está activo el efecto de daño)
    if (gameState.token) {
        const hideTokenDueToDamage = !!(damageEffect && damageEffect.active && gameState.status === 'playing');
        if (!hideTokenDueToDamage) {
          drawObject(ctx, gameState.token);
        }
    }
    // Dibujar explosión boost si está activa
    if (explosion && explosion.active) {
      const frameDuration = 100; // 1s / 10 frames
      const now = Date.now();
      const elapsed = now - explosion.start;
      const frame = Math.floor(elapsed / frameDuration);
      if (frame < 10 && explosionSpritesRef.current[frame]) {
        const img = explosionSpritesRef.current[frame];
        const size = gameState.token.radius * 4;
        ctx.drawImage(img, gameState.token.x - size/2, gameState.token.y - size/2, size, size);
      } else if (frame >= 10 && explosion.active) {
        setExplosion(null); // Ocultar animación cuando termina
      }
    }
    // Dibujar explosión de energía si está activa
    if (enExplosion && enExplosion.active) {
      const frameDuration = 100;
      const now = Date.now();
      const elapsed = now - enExplosion.start;
      const frame = Math.floor(elapsed / frameDuration);
      if (frame < 10 && enExplosionSpritesRef.current[frame]) {
        const img = enExplosionSpritesRef.current[frame];
        const size = gameState.token.radius * 4;
        // Usar la posición guardada
        ctx.drawImage(img, lastEnergyPosRef.current.x - size/2, lastEnergyPosRef.current.y - size/2, size, size);
      } else if (frame >= 10 && enExplosion.active) {
        setEnExplosion(null);
      }
    }

    // Dibujar explosiones verdes para heart, mega_node y purr
    if (greenExplosions.length > 0) {
      const frameDuration = 100; // 100ms por frame
      const now = Date.now();
      
      // Filtrar y dibujar cada explosión activa
      const updatedExplosions = greenExplosions.filter(explosion => {
        const elapsed = now - explosion.start;

        // Efecto DIFUMINADO especial para VAUL con color #B695D5
        if (explosion.type === 'vaul') {
          const duration = 500; // ms (menos tiempo)
          const t = Math.min(elapsed / duration, 1);

          // Radio animado y opacidad decreciente
          const maxRadius = 110; // antes 140
          const minRadius = 20;  // antes 30
          const radius = minRadius + (maxRadius - minRadius) * t;
          const baseAlpha = 0.35 * (1 - t); // menos opaco

          ctx.save();
          ctx.translate(explosion.x, explosion.y);
          ctx.globalCompositeOperation = 'lighter';
          ctx.shadowColor = 'rgba(182, 149, 213, 0.4)'; // #B695D5
          ctx.shadowBlur = 20;
          
          // Gradiente radial suave en tono #B695D5
          const grad = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
          grad.addColorStop(0, `rgba(182, 149, 213, ${Math.min(1, baseAlpha + 0.1)})`);
          grad.addColorStop(0.5, `rgba(182, 149, 213, ${baseAlpha * 0.55})`);
          grad.addColorStop(1, 'rgba(182, 149, 213, 0)');
          ctx.fillStyle = grad;

          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.fill();

          // Capa adicional sutil para mayor difusión
          const radius2 = radius * 0.6;
          const grad2 = ctx.createRadialGradient(0, 0, 0, 0, 0, radius2);
          grad2.addColorStop(0, `rgba(182, 149, 213, ${baseAlpha * 0.6})`);
          grad2.addColorStop(1, 'rgba(182, 149, 213, 0)');
          ctx.fillStyle = grad2;
          ctx.beginPath();
          ctx.arc(0, 0, radius2, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
          return elapsed < duration; // Mantener mientras dura la animación
        }

        // Comportamiento por sprites para los demás tipos
        const frame = Math.floor(elapsed / frameDuration);
        if (frame < 10 && greenExplosionSpritesRef.current[frame]) {
          const img = greenExplosionSpritesRef.current[frame];
          let size: number;
          if (explosion.type === 'megaNode') {
            size = 120;
          } else if (explosion.type === 'purr') {
            size = 110;
          } else {
            size = 100;
          }
          ctx.drawImage(img, explosion.x - size/2, explosion.y - size/2, size, size);
          return true;
        }
        return false;
      });
      
      if (updatedExplosions.length !== greenExplosions.length) {
        setGreenExplosions(updatedExplosions);
      }
    }

    // Reset shadow blur
    ctx.shadowBlur = 0;

    // Dibujar overlay para estados especiales
    // CORREGIDO: Removido el botón de pause del fondo durante pausa
    // El overlay de pausa se maneja en game-container.tsx
    
    // Game Over Message
    if (gameState.status === 'gameOver') {
      // Dibujar fondo negro con alpha 85% detrás de todo el contenido
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(0, 0, width, height);

      // Determinar qué imagen usar según la razón del game over
      let currentGameOverImg: HTMLImageElement | null = null;
      let gameOverType = '';
      
      switch (gameState.gameOverReason) {
        case 'bug':
          currentGameOverImg = walletGameOverImgRef.current;
          gameOverType = 'wallet';
          break;
        case 'time':
          currentGameOverImg = gameOverTimeImgRef.current;
          gameOverType = 'time';
          break;
        case 'hearts':
          currentGameOverImg = gameOverVidasImgRef.current;
          gameOverType = 'vidas';
          break;
        default:
          currentGameOverImg = gameOverImgRef.current;
          gameOverType = 'default';
          break;
      }

      if (currentGameOverImg) {
        // Mostrar imagen de game over (wallet_gameover.png para bugs, gameover_trump.png para otros)
        const gameOverImg = currentGameOverImg;
        // Calcular dimensiones para que la imagen quepa dentro del grid sin cortarse
        const maxWidth = width * 0.8; // Reducir a 80% del ancho del canvas
        const maxHeight = height * 0.6; // Máximo 60% de la altura del canvas
        
        // Calcular el tamaño manteniendo proporción
        let imgWidth = maxWidth;
        let imgHeight = imgWidth * (gameOverImg.height / gameOverImg.width);
        
        // Si la altura calculada es muy grande, ajustar por altura
        if (imgHeight > maxHeight) {
          imgHeight = maxHeight;
          imgWidth = imgHeight * (gameOverImg.width / gameOverImg.height);
        }
        
        const imgX = (width - imgWidth) / 2;
        // Centrar verticalmente con pequeño offset; para time/vidas subir 40px adicionales
        const baseImgY = (height - imgHeight) / 2 - 40;
        const extraUpOffset = (gameOverType === 'time' || gameOverType === 'vidas') ? 40 : 0;
        const imgY = baseImgY - extraUpOffset;
        
        // Añadir efecto de glow violeta por detrás SOLO para wallet_gameover.png
        if (gameOverType === 'wallet') {
          ctx.save();
          
          // Crear múltiples capas de glow violeta con diferentes intensidades
          const glowLayers = [
            { blur: 60, alpha: 0.4, scale: 1.4 },  // Capa exterior más grande y suave
            { blur: 40, alpha: 0.6, scale: 1.2 },  // Capa intermedia
            { blur: 20, alpha: 0.8, scale: 1.1 }   // Capa interior más intensa
          ];
          
          glowLayers.forEach(layer => {
            const glowWidth = imgWidth * layer.scale;
            const glowHeight = imgHeight * layer.scale;
            const glowX = (width - glowWidth) / 2;
            const glowY = (height - glowHeight) / 2 - 40;
            
            // Configurar el brillo violeta
            ctx.shadowColor = `rgba(138, 43, 226, ${layer.alpha})`; // Violeta brillante
            ctx.shadowBlur = layer.blur;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Dibujar un rectángulo invisible que genere solo la sombra/glow
            ctx.fillStyle = `rgba(138, 43, 226, 0.1)`;
            ctx.fillRect(glowX, glowY, glowWidth, glowHeight);
          });
          
          // Añadir efecto pulsante al glow
          const pulseTime = Date.now() * 0.003;
          const pulseIntensity = 0.3 + 0.2 * Math.sin(pulseTime);
          
          // Glow pulsante adicional
          ctx.shadowColor = `rgba(138, 43, 226, ${pulseIntensity})`;
          ctx.shadowBlur = 80 + 20 * Math.sin(pulseTime * 1.5);
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          ctx.fillStyle = `rgba(138, 43, 226, 0.05)`;
          ctx.fillRect(imgX - 20, imgY - 20, imgWidth + 40, imgHeight + 40);
          
          ctx.restore();
        }
        
        // Resetear cualquier efecto de sombra antes de dibujar la imagen
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        ctx.drawImage(gameOverImg, imgX, imgY, imgWidth, imgHeight);
        
        // Log para debugging
        switch (gameOverType) {
          case 'wallet':
            console.log('🐛 Mostrando wallet_gameover.png por muerte por bug');
            break;
          case 'time':
            console.log('⏰ Mostrando gameover_time.png por muerte por tiempo');
            break;
          case 'vidas':
            console.log('❤️ Mostrando gameover_vidas.png por muerte por vidas');
            break;
          default:
            console.log('💀 Mostrando gameover_trump.png por muerte normal');
            break;
        }
        
        // Calcular la parte inferior de la imagen para posicionar el texto con referencia a imagen y botones
        const imageBottom = imgY + imgHeight;
        
        // Mantener el texto del puntaje final equidistante entre la imagen y los botones
        ctx.fillStyle = '#FFFFFF'; // Texto blanco para contraste con fondo negro
        ctx.strokeStyle = '#000000'; // Borde negro para mayor legibilidad
        ctx.lineWidth = 3; // Borde más grueso
        
        // Hacer el texto más grande
        ctx.font = '32px Mitr-Bold'; // Más grande que SCORE_FONT
        ctx.textAlign = 'center';
        // Calcular Y objetivo: punto medio entre el borde inferior de la imagen y la parte superior de los botones DOM
        const BUTTONS_HEIGHT = 50; // altura de las imágenes de botón
        const BUTTONS_BOTTOM_PADDING = 64; // pb-16 en Tailwind (16 * 4px)
        const buttonsTopY = height - BUTTONS_BOTTOM_PADDING - BUTTONS_HEIGHT;
        // Seguridad: margen mínimo de separación respecto a imagen y botones
        const TEXT_MARGIN = 16;
        const idealMidY = (imageBottom + buttonsTopY) / 2;
        const minY = imageBottom + TEXT_MARGIN;
        const maxY = buttonsTopY - TEXT_MARGIN;
        const textY = Math.max(minY, Math.min(maxY, idealMidY));
        // Dibujar texto con borde en la posición calculada
        ctx.strokeText(`Final Score: ${Math.floor(gameState.score)}`, width / 2, textY);
        ctx.fillText(`Final Score: ${Math.floor(gameState.score)}`, width / 2, textY);
        
        // Texto de reinicio eliminado - ahora se usan botones
        
        // Resetear stroke
        ctx.lineWidth = 1;
      } else {
        // Fallback al texto original si la imagen no está cargada
        ctx.textAlign = 'center';
        
        // Mensaje personalizado según la razón del game over
        if (gameState.gameOverReason === 'bug') {
          // Aplicar color dorado para el mensaje de bug
          ctx.fillStyle = '#FFB700';
          ctx.font = MESSAGE_FONT;
          ctx.fillText('FATAL ERROR!', width / 2, height / 2 - 100);
          ctx.font = TIMER_FONT;
          ctx.fillText('SYBIL DETECTED - BANNED!', width / 2, height / 2 - 40);
          
          // Color dorado para el resto de textos
          ctx.fillStyle = '#FFB700';
        } else {
          ctx.fillStyle = DESTRUCTIVE_COLOR_CSS;
          ctx.font = MESSAGE_FONT;
          ctx.fillText('GAME OVER!', width / 2, height / 2 - 80);
          ctx.fillStyle = FOREGROUND_COLOR_CSS;
        }
        
        ctx.font = SCORE_FONT;
        // Subido para no solapar con los botones de Game Over
        ctx.fillText(`Final Score: ${Math.floor(gameState.score)}`, width / 2, height / 2 + 40);
        // Texto de reinicio eliminado - ahora se usan botones
      }
    }

    // COUNTDOWN ÉPICO con efectos visuales en turquesa brillante
    if (gameState.status === 'countdown' && gameState.countdown !== undefined) {
      // Fondo oscuro semi-transparente
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, 0, width, height);
      
      // ✅ CORREGIDO: Para countdown, usar tiempo normal ya que countdown no se pausa
      const gameTime = gameState.gameStartTime ? Date.now() - gameState.gameStartTime : Date.now();
      const elapsed = gameState.countdownStartTime ? gameTime - gameState.countdownStartTime : 0;
      const progress = (elapsed % 1000) / 1000; // Progreso dentro del segundo actual
      
      // Calcular el número a mostrar
      const displayNumber = gameState.countdown === 0 ? "GO!" : gameState.countdown.toString();
      
      // Colores turquesa brillantes con variación temporal
      const time = gameTime * 0.01; // Para efectos de tiempo
      const hue = 180 + Math.sin(time * 0.1) * 20; // Variación de turquesa (160-200)
      const saturation = 90 + Math.sin(time * 0.15) * 10; // 80-100%
      const lightness = 60 + Math.sin(time * 0.2) * 15; // 45-75%
      
      // Configurar texto épico
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Tamaño gigante que crece y decrece con pulsación
      const baseSize = Math.min(width, height) * 0.4; // Tamaño base grande
      const pulseSize = baseSize * (1.3 + Math.sin(progress * Math.PI * 6) * 0.3); // Pulsación durante el segundo
      const scaleEffect = 1.5 - (progress * 0.5); // Empieza grande y se reduce un poco
      const finalSize = Math.floor(pulseSize * scaleEffect);
      
      ctx.font = `${finalSize}px Mitr-Bold`;
      
      // Efecto de múltiples sombras para profundidad épica
      const shadowLayers = [
        { offsetX: 8, offsetY: 8, blur: 20, color: `hsla(${hue}, ${saturation}%, 20%, 0.8)` },
        { offsetX: 16, offsetY: 16, blur: 40, color: `hsla(${hue}, ${saturation}%, 10%, 0.6)` },
        { offsetX: 24, offsetY: 24, blur: 60, color: `hsla(${hue}, ${saturation}%, 5%, 0.4)` }
      ];
      
      // Dibujar sombras múltiples
      shadowLayers.forEach(shadow => {
        ctx.shadowColor = shadow.color;
        ctx.shadowBlur = shadow.blur;
        ctx.shadowOffsetX = shadow.offsetX;
        ctx.shadowOffsetY = shadow.offsetY;
        ctx.fillStyle = shadow.color;
        ctx.fillText(displayNumber, width / 2, height / 2);
      });
      
      // Efecto de brillo exterior múltiple
      const glowLayers = [
        { blur: 40, color: `hsla(${hue}, ${saturation}%, ${lightness + 20}%, 0.8)` },
        { blur: 60, color: `hsla(${hue}, ${saturation}%, ${lightness + 10}%, 0.6)` },
        { blur: 80, color: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.4)` },
        { blur: 100, color: `hsla(${hue}, ${saturation}%, ${lightness - 10}%, 0.2)` }
      ];
      
      glowLayers.forEach(glow => {
        ctx.shadowColor = glow.color;
        ctx.shadowBlur = glow.blur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = glow.color;
        ctx.fillText(displayNumber, width / 2, height / 2);
      });
      
      // Texto principal con gradiente turquesa brillante
      const gradient = ctx.createLinearGradient(0, height / 2 - finalSize / 2, 0, height / 2 + finalSize / 2);
      gradient.addColorStop(0, `hsl(${hue + 10}, ${saturation + 10}%, ${lightness + 25}%)`); // Turquesa muy claro arriba
      gradient.addColorStop(0.3, `hsl(${hue}, ${saturation}%, ${lightness + 15}%)`); // Turquesa brillante
      gradient.addColorStop(0.7, `hsl(${hue - 5}, ${saturation}%, ${lightness}%)`); // Turquesa medio
      gradient.addColorStop(1, `hsl(${hue - 10}, ${saturation - 10}%, ${lightness - 20}%)`); // Turquesa oscuro abajo
      
      // Resetear sombras para texto principal
      ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness + 30}%, 0.9)`;
      ctx.shadowBlur = 30;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
      ctx.fillStyle = gradient;
      ctx.fillText(displayNumber, width / 2, height / 2);
      
      // Efecto de borde con stroke múltiple
      ctx.lineWidth = 6;
      ctx.strokeStyle = `hsl(${hue - 20}, ${saturation + 20}%, ${lightness - 30}%)`;
      ctx.strokeText(displayNumber, width / 2, height / 2);
      
      ctx.lineWidth = 3;
      ctx.strokeStyle = `hsl(${hue + 10}, ${saturation + 30}%, ${lightness + 10}%)`;
      ctx.strokeText(displayNumber, width / 2, height / 2);
      
      // Partículas brillantes aleatorias alrededor del número
      if (gameState.countdown !== 0) { // Solo para números, no para "GO!"
        for (let i = 0; i < 20; i++) {
          const angle = (time + i * 137.5) * 0.02; // Espiral dorada
          const distance = 100 + Math.sin(time * 0.03 + i) * 80;
          const x = width / 2 + Math.cos(angle) * distance;
          const y = height / 2 + Math.sin(angle) * distance;
          
          const sparkleSize = 3 + Math.sin(time * 0.1 + i) * 2;
          const sparkleAlpha = 0.6 + Math.sin(time * 0.15 + i) * 0.4;
          
          ctx.shadowBlur = 20;
          ctx.shadowColor = `hsla(${hue + (i * 10)}, 100%, 80%, ${sparkleAlpha})`;
          ctx.fillStyle = `hsla(${hue + (i * 10)}, 100%, 90%, ${sparkleAlpha})`;
          
          ctx.beginPath();
          ctx.arc(x, y, sparkleSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      // Resetear sombras para evitar afectar otros elementos
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.lineWidth = 1;
    }

    // Start Message - Eliminando texto duplicado
    if (gameState.status === 'idle') {
      // No mostrar texto duplicado, ya que ya aparece en el contenedor principal
    }
    
    // Reset shadow
    ctx.shadowBlur = 0;

    // Dibujar efecto de daño si está activo (flash) - SOLO durante 'playing'
    if (damageEffect && damageEffect.active && damageImgRef.current && gameState.status === 'playing') {
      const now = Date.now();
      const elapsed = now - damageEffect.start;
      if (elapsed < 1000) {
        // ✅ CORREGIDO: Flash más rápido y siempre empieza visible
        // Visible 80ms, invisible 80ms para un efecto más notorio
        const cycleTime = 160; // Duración de un ciclo completo (visible + invisible)
        const flash = Math.floor(elapsed / 80) % 2 === 0;
        if (flash) {
          const size = gameState.token.radius * 4;
          // Aumentar opacidad para hacer el efecto más visible
          ctx.globalAlpha = 0.9;
          ctx.drawImage(damageImgRef.current, gameState.token.x - size/2, gameState.token.y - size/2, size, size);
          ctx.globalAlpha = 1.0;
        }
      } else if (damageEffect.active) {
        setDamageEffect(null);
      }
    }

 
  }, [gameState, width, height, explosion, enExplosion]);
  
  // Efecto simplificado para verificar carga inicial de sprites
  useEffect(() => {
    // Comprobación única después de un tiempo razonable
    const checkTimeout = setTimeout(() => {
      let loadedSpritesCount = 0;
      if (megaNodeSprite1Ref.current) loadedSpritesCount++;
      if (megaNodeSprite2Ref.current) loadedSpritesCount++;
      if (megaNodeSprite3Ref.current) loadedSpritesCount++;
      
      if (loadedSpritesCount < 3) {
        console.warn(`Advertencia: Solo se cargaron ${loadedSpritesCount}/3 sprites de mega node`);
      } else {
        console.log('Todos los sprites de mega node están disponibles para la animación');
      }
      
      // Verificar sprites de purr
      let purrSpritesCount = 0;
      if (purrSprite1Ref.current) purrSpritesCount++;
      if (purrSprite2Ref.current) purrSpritesCount++;
      if (purrSprite3Ref.current) purrSpritesCount++;
      
      console.log(`🐱 PURR SPRITES STATUS: ${purrSpritesCount}/3 sprites cargados`);
      console.log('🐱 Estado detallado:', {
        sprite1: !!purrSprite1Ref.current,
        sprite2: !!purrSprite2Ref.current,
        sprite3: !!purrSprite3Ref.current
      });
      
      if (purrSpritesCount < 3) {
        console.warn(`⚠️ Solo se cargaron ${purrSpritesCount}/3 sprites de purr`);
      } else {
        console.log('✅ Todos los sprites de purr están disponibles para la animación');
      }
    }, 3000);
    
    return () => clearTimeout(checkTimeout);
  }, []);

  // Precarga optimizada de sprites
  const preloadSprites = useCallback(() => {
    const sprites = [
      '/assets/collectibles/mega_node/mega_node_1.png',
      '/assets/collectibles/mega_node/mega_node_2.png',
      '/assets/collectibles/mega_node/mega_node_3.png',
      '/assets/collectibles/purr/purr_1.png',
      '/assets/collectibles/purr/purr_2.png',
      '/assets/collectibles/purr/purr_3.png'
    ];
    
    sprites.forEach(src => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        if (src.includes('mega_node_1')) megaNodeSprite1Ref.current = img;
        else if (src.includes('mega_node_2')) megaNodeSprite2Ref.current = img;
        else if (src.includes('mega_node_3')) megaNodeSprite3Ref.current = img;
        else if (src.includes('purr_1')) purrSprite1Ref.current = img;
        else if (src.includes('purr_2')) purrSprite2Ref.current = img;
        else if (src.includes('purr_3')) purrSprite3Ref.current = img;
        console.log(`✅ Sprite ${src.split('/').pop()} precargado correctamente`);
      };
    });
  }, []);

  useEffect(() => {
    preloadSprites();
  }, [preloadSprites]);

  // Precarga optimizada de sprites prioritarios
  const preloadPrioritySprites = useCallback(() => {
    console.log('🚀 Iniciando precarga de sprites prioritarios...');
    const prioritySprites = [
      '/assets/collectibles/mega_node/mega_node_1.png',
      '/assets/collectibles/mega_node/mega_node_2.png',
      '/assets/collectibles/mega_node/mega_node_3.png',
      '/assets/collectibles/purr/purr_1.png',
      '/assets/collectibles/purr/purr_2.png',
      '/assets/collectibles/purr/purr_3.png'
    ];
    
    return Promise.all(prioritySprites.map(src => new Promise((resolve, reject) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        if (src.includes('mega_node_1')) megaNodeSprite1Ref.current = img;
        else if (src.includes('mega_node_2')) megaNodeSprite2Ref.current = img;
        else if (src.includes('mega_node_3')) megaNodeSprite3Ref.current = img;
        else if (src.includes('purr_1')) purrSprite1Ref.current = img;
        else if (src.includes('purr_2')) purrSprite2Ref.current = img;
        else if (src.includes('purr_3')) purrSprite3Ref.current = img;
        console.log(`✅ Sprite prioritario ${src.split('/').pop()} precargado`);
        resolve(img);
      };
      img.onerror = () => {
        console.error(`❌ Error precargando sprite prioritario: ${src}`);
        reject();
      };
    })));
  }, []);

  // Ejecutar precarga prioritaria antes que el resto
  useEffect(() => {
    preloadPrioritySprites()
      .then(() => console.log('✨ Precarga de sprites prioritarios completada'))
      .catch(() => console.warn('⚠️ Algunos sprites prioritarios no se pudieron cargar'));
  }, [preloadPrioritySprites]);

  // OPTIMIZACIÓN: Cargar imágenes usando el sistema optimizado
  useEffect(() => {
    // ... resto del código de carga existente ...
  }, []);

  return (
     <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block border border-border rounded-lg shadow-lg"
        style={{ imageRendering: 'pixelated' }}
      />
  );
};

export default GameCanvas;
