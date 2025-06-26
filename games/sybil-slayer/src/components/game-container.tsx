"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import GameCanvas from './game-canvas';
import InfoModal from './info-modal';
import { useGameState } from '@/hooks/useGameState';
import { useGameInput } from '@/hooks/useGameInput';
import { useGameLoop } from '@/hooks/useGameLoop';
import { useAudio } from '@/hooks/useAudio';
import { Button } from "@/components/ui/button";
import { Github, Play, Pause, RotateCcw } from 'lucide-react';
import { FPS } from '@/lib/constants';
import { assetLoader } from '@/lib/assetLoader';


const GameContainer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const basePath = '/games/sybil-slayer';
  // Estado para notificar recogida de energía
  const [energyCollectedFlag, setEnergyCollectedFlag] = useState(0);
  // Estado para notificar daño
  const [damageFlag, setDamageFlag] = useState(0);
  
  // Estado para controlar el modal de información
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  
  // Estado para controlar la animación de jeff_goit
  const [jeffGoitAnimation, setJeffGoitAnimation] = useState<{
    active: boolean;
    start: number;
    phase: 'entering' | 'visible' | 'exiting';
  } | null>(null);
  
  // Estado para controlar la animación de whalechadmode
  const [whaleChadAnimation, setWhaleChadAnimation] = useState<{
    active: boolean;
    start: number;
    phase: 'entering' | 'visible' | 'exiting';
  } | null>(null);
  
  // Estado para controlar la animación de meow (purr effect)
  const [meowAnimation, setMeowAnimation] = useState<{
    active: boolean;
    start: number;
    phase: 'entering' | 'visible' | 'exiting';
    immunityDuration: number; // Duración total de la inmunidad
  } | null>(null);
  
  // Estado para controlar la animación de unlisted (fee damage effect)
  const [unlistedAnimation, setUnlistedAnimation] = useState<{
    active: boolean;
    start: number;
    phase: 'entering' | 'visible' | 'exiting';
  } | null>(null);
  
  // Estado para controlar la animación de giga vault (vaul effect)
  const [gigaVaultAnimation, setGigaVaultAnimation] = useState<{
    active: boolean;
    start: number;
    phase: 'entering' | 'visible' | 'exiting';
  } | null>(null);
  
  // Estado para controlar la animación del hacker (cuando toca al token)
  const [hackerAnimation, setHackerAnimation] = useState<{
    active: boolean;
    start: number;
    phase: 'entering' | 'visible' | 'exiting';
  } | null>(null);
  
  // Ref para la imagen de jeff_goit
  const jeffGoitImgRef = useRef<HTMLImageElement | null>(null);
  
  // Ref para la imagen de whalechadmode
  const whaleChadImgRef = useRef<HTMLImageElement | null>(null);
  
  // Ref para la imagen de meow
  const meowImgRef = useRef<HTMLImageElement | null>(null);
  
  // Ref para la imagen de unlisted
  const unlistedImgRef = useRef<HTMLImageElement | null>(null);
  
  // Ref para la imagen de giga vault
  const gigaVaultImgRef = useRef<HTMLImageElement | null>(null);
  
  // Ref para la imagen del hacker (trump)
  const hackerTrumpImgRef = useRef<HTMLImageElement | null>(null);
  
  // Ref para rastrear si se recolectó un checkpoint
  const lastGlowTimerRef = useRef<number>(0);
  
  // Ref para rastrear si se recolectó un mega node
  const lastBoostTimerRef = useRef<number>(0);
  
  // Ref para rastrear si se recolectó purr
  const purrCollectionCountRef = useRef<number>(0);
  
  // Ref para rastrear el nivel actual y detectar cambios
  const lastLevelRef = useRef<number>(1);
  
  // Ref para rastrear el último daño por fee
  const lastFeeDamageTimeRef = useRef<number>(0);
  
  // Ref para rastrear cuando se recoge un vaul
  const lastVaulCollectionTimeRef = useRef<number>(0);
  
  // Ref para rastrear el último daño por hacker
  const lastHackerDamageTimeRef = useRef<number>(0);
  
  // Initialize audio system
  const { playSound, playMusic, stopMusic, setVolume, toggleMusic, isMusicEnabled, playGameOverSound, toggleSounds, isSoundsEnabled } = useAudio();
  
  // Estado para controlar el botón de música
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [soundsEnabled, setSoundsEnabled] = useState(true); // NUEVO: Estado para sonidos de efectos
  
  // Sincronizar estado inicial con el hook de audio
  useEffect(() => {
    setMusicEnabled(isMusicEnabled());
    setSoundsEnabled(isSoundsEnabled()); // NUEVO: Sincronizar sonidos también
  }, [isMusicEnabled, isSoundsEnabled]);
  
  // Estado para loading de assets
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Precargar assets al montar el componente
  useEffect(() => {
    assetLoader.preloadAll(progress => {
      setLoadingProgress(progress);
    }).then(() => {
      setAssetsLoaded(true);
    });
  }, []);
  
  // Estilos CSS para las animaciones
  const animationStyles = `
    @keyframes pulse {
      0% {
        transform: scale(1);
        filter: brightness(1) drop-shadow(0 0 10px rgba(255, 215, 0, 0.5));
      }
      50% {
        transform: scale(1.12);
        filter: brightness(1.3) drop-shadow(0 0 20px rgba(255, 215, 0, 0.8));
      }
      100% {
        transform: scale(1.05);
        filter: brightness(1.15) drop-shadow(0 0 15px rgba(255, 215, 0, 0.7));
      }
    }
  `;

  // Callback para explosion
  const handleEnergyCollected = useCallback(() => {
    setEnergyCollectedFlag(flag => flag + 1);
    playSound('energy_collect');
  }, [playSound]);

  // Callback para daño
  const handleDamage = useCallback(() => {
    setDamageFlag(flag => flag + 1);
    playSound('auch');
  }, [playSound]);

  // Initialize gameState AFTER determining canvas size
  // Callback para cuando el hacker escapa después de recoger 5 energy
  const handleHackerEscape = useCallback(() => {
    console.log("¡Hacker escapó después de recoger 5 energy! Activando animación lateral");
    
    // Activar la animación del hacker (misma que cuando toca al token)
    setHackerAnimation({
      active: true,
      start: Date.now(),
      phase: 'entering'
    });
  }, []);

  const { gameState, updateGame, updateInputRef, startGame, togglePause, resetGame } = useGameState(canvasSize.width, canvasSize.height, handleEnergyCollected, handleDamage, playSound, handleHackerEscape);
  const inputState = useGameInput();

  // Helper para obtener tiempo pausable para animaciones
  const getPausableTime = useCallback(() => {
    if (gameState.status === 'paused') {
      // Si está pausado, devolver el tiempo que tenía cuando se pausó
      // Para esto necesitamos almacenar cuándo se pausó
      return Date.now(); // Por ahora usar tiempo real como fallback
    }
    return Date.now();
  }, [gameState.status]);

  // Update the gameState hook's internal input ref whenever useGameInput changes
  useEffect(() => {
    updateInputRef(inputState);
  }, [inputState, updateInputRef]);


  // Resize handler
   const handleResize = useCallback(() => {
       if (containerRef.current) {
           // Usar un porcentaje mayor del ancho de la ventana para hacer el grid más grande
           const maxWidth = Math.min(window.innerWidth * 0.85, 1100); // 85% del ancho de ventana con máximo de 1100px
           const maxHeight = window.innerHeight * 0.75; // 75% del viewport height

           // Mantener una relación de aspecto apropiada basada en el ancho
           const newWidth = Math.min(maxWidth, 1100);
           
           // Asegurar que el grid se vea con celdas cuadradas perfectas
           // El tamaño del grid es 40px, así que hacemos que el ancho y el alto sean múltiplos exactos de 40
           const gridSize = 40;
           
           // Ajuste de proporciones: reducir el ancho para evitar deformación
           // Calculamos un ancho apropiado que sea múltiplo de 40px y mantenga una mejor proporción
           const idealWidthInCells = Math.floor(newWidth / gridSize);
           // Preferimos un ancho que sea aproximadamente 3/4 del ancho disponible
           const adjustedWidthInCells = Math.floor(idealWidthInCells * 0.8);
           const heightInCells = Math.floor(maxHeight / gridSize);
           
           // Aseguramos que las dimensiones sean múltiplos exactos de 40px
           const adjustedWidth = adjustedWidthInCells * gridSize;
           const adjustedHeight = heightInCells * gridSize;

           // Solo actualizar si el tamaño cambia realmente para prevenir actualizaciones innecesarias
           if (adjustedWidth !== canvasSize.width || adjustedHeight !== canvasSize.height) {
               console.log(`Resizing canvas to: ${adjustedWidth}x${adjustedHeight}`);
               setCanvasSize({ width: adjustedWidth, height: adjustedHeight });
               // useGameState effect manejará la actualización del tamaño interno del canvas
           }
       }
   }, [canvasSize.width, canvasSize.height]);


  // Effect for initial size and resize listener
  useEffect(() => {
    handleResize(); // Set initial size
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]); // Run on mount and when handleResize changes

  // NUEVO: Pausa automática cuando se cambia de pestaña
  useEffect(() => {
    let wasPlayingBeforeHidden = false;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // La pestaña se ocultó (cambió a otra pestaña o minimizó)
        if (gameState.status === 'playing') {
          wasPlayingBeforeHidden = true;
          console.log('📱 Pestaña oculta - Pausando juego automáticamente');
          playSound('pause');
          togglePause();
        }
      } else {
        // La pestaña volvió a estar visible
        if (wasPlayingBeforeHidden && gameState.status === 'paused') {
          console.log('📱 Pestaña visible de nuevo - El juego queda pausado (presiona P para reanudar)');
          // Nota: No reanudamos automáticamente, el usuario debe presionar P
          wasPlayingBeforeHidden = false;
        }
      }
    };

    // Añadir listener para detectar cambios de visibilidad
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [gameState.status, togglePause, playSound]); // Dependencias para que react re-evalúe cuando cambien


 // Game loop integration using the custom hook
  useGameLoop((deltaTime, isPaused) => {
    // Pass deltaTime to the updateGame function provided by useGameState
    // El deltaTime será 0 si está pausado, pausando efectivamente todas las actualizaciones
    updateGame(deltaTime);
  }, FPS, gameState.status === 'paused'); // Target FPS, pasar estado de pausa


  // UI Button Handlers
  const handleStartPauseClick = () => {
      if (gameState.status === 'playing') {
          playSound('pause');
          togglePause();
      } else if (gameState.status === 'paused') {
          playSound('resume');
          togglePause();
      } else {
          playSound('game_start');
          
          // Si estamos en game over, detener el sonido de game over antes de empezar
          if (gameState.status === 'gameOver') {
            console.log('🎮 Start desde Game Over - Deteniendo sonido de game over');
            stopMusic();
          }
          
          startGame();
      }
  };

   const handleResetClick = () => {
      playSound('button_click');
      
      // Si estamos en game over, detener el sonido de game over
      if (gameState.status === 'gameOver') {
        console.log('🔄 Reset desde Game Over - Deteniendo sonido de game over');
        stopMusic();
      }
      
      resetGame();
      
      // CORREGIDO: Ya no reactivamos música en reset, 
      // se activará automáticamente cuando el status cambie a 'playing'
   };

   const handleMusicToggle = () => {
      playSound('button_click');
      const newState = toggleMusic();
      setMusicEnabled(newState);
      
      // CORREGIDO: No reiniciar música al toggle, el sistema de audio maneja esto automáticamente
   };

   // NUEVO: Handler para el toggle de sonidos de efectos
   const handleSoundsToggle = () => {
      playSound('button_click');
      const newState = toggleSounds();
      setSoundsEnabled(newState);
   };

   const handleInfoToggle = () => {
      playSound('button_click');
      setIsInfoModalOpen(!isInfoModalOpen);
   };

  // Detectar cuando se recoge un checkpoint
  useEffect(() => {
    // Verificar si el token tiene efecto glow y glowTimer, lo que indica que se recogió un checkpoint
    if (gameState.token.glow && gameState.token.glowTimer && gameState.token.glowTimer > 0) {
      // Si es un valor nuevo de glowTimer, considerarlo como una nueva recolección
      if (lastGlowTimerRef.current === 0 || gameState.token.glowTimer > lastGlowTimerRef.current) {
        console.log("¡Checkpoint recogido! Activando animación de jeff_goit por el lado izquierdo");
        
        // Reproducir sonidos
        playSound('checkpoint_collect');
        playSound('checkpoint');
        playSound('jeff_goit');
        
        // Activar la animación sin importar si ya hay una activa
        setJeffGoitAnimation({
          active: true,
          start: Date.now(),
          phase: 'entering'
        });
        
        // Actualizar el valor del último glowTimer
        lastGlowTimerRef.current = gameState.token.glowTimer;
      } 
    } else if (gameState.token.glowTimer === 0) {
      // Reiniciar el valor de referencia cuando el efecto termina
      lastGlowTimerRef.current = 0;
    }
  }, [gameState.token.glow, gameState.token.glowTimer, playSound]);

  // Detectar cuando se recoge un mega node
  useEffect(() => {
    // Verificar si el token tiene boostTimer, lo que indica que se recogió un mega node
    if (gameState.token.boostTimer && gameState.token.boostTimer > 0) {
      // Si es un valor nuevo de boostTimer, considerarlo como una nueva recolección
      if (lastBoostTimerRef.current === 0 || gameState.token.boostTimer > lastBoostTimerRef.current) {
        console.log("¡Mega Node recogido! Activando animación de whalechadmode por el lado derecho");
        
        // Reproducir sonidos
        playSound('mega_node_collect');
        playSound('whale_chad');
        
        // Activar la animación sin importar si ya hay una activa
        setWhaleChadAnimation({
          active: true,
          start: Date.now(),
          phase: 'entering'
        });
        
        // Actualizar el valor del último boostTimer
        lastBoostTimerRef.current = gameState.token.boostTimer;
      } 
    } else if (gameState.token.boostTimer === 0) {
      // Reiniciar el valor de referencia cuando el efecto termina
      lastBoostTimerRef.current = 0;
    }
  }, [gameState.token.boostTimer, playSound]);

  // Detectar cuando se recoge purr
  useEffect(() => {
    // Detectar cuando el immunityTimer está en su valor máximo (recién recolectado)
    // PURR_IMMUNITY_DURATION_MS = 5000, así que detectamos valores >= 4900
    if (gameState.token.immunityTimer >= 4900) {
      // Verificar que no hayamos procesado ya esta recolección
      const currentCount = Math.floor(gameState.token.immunityTimer / 100); // Usar como ID único
      
      if (currentCount !== purrCollectionCountRef.current && !meowAnimation?.active) {
        console.log("¡Purr recogido! Inmunidad activada");
        console.log("🐱 Intentando reproducir sonido purr_collect...");
        
        // Reproducir sonido de purr
        playSound('purr_collect');
        console.log("🐱 Comando playSound('purr_collect') ejecutado");
        
        // ✅ PROTECCIÓN: Solo activar si no hay ya una animación activa
        // Activar la animación de meow
        setMeowAnimation({
          active: true,
          start: Date.now(),
          phase: 'entering',
          immunityDuration: gameState.token.immunityTimer
        });
        console.log("🐱 Activando animación de meow");
        
        // Actualizar contador para evitar duplicados
        purrCollectionCountRef.current = currentCount;
      }
    }
    
    // Resetear contador cuando la inmunidad termina
    if (gameState.token.immunityTimer === 0) {
      purrCollectionCountRef.current = 0;
    }
  }, [gameState.token.immunityTimer, playSound, meowAnimation?.active]);

  // Detectar cambios de nivel
  useEffect(() => {
    if (gameState.level > lastLevelRef.current) {
      console.log(`¡Subida de nivel! Nivel ${gameState.level}`);
      playSound('level_up');
      lastLevelRef.current = gameState.level;
    }
  }, [gameState.level, playSound]);

  // Detectar cuando un fee causa daño
  useEffect(() => {
    // Verificar si hubo daño reciente por un fee específicamente
    if (gameState.lastDamageTime && 
        gameState.lastDamageTime > lastFeeDamageTimeRef.current &&
        gameState.lastDamageSource === 'fee') {
      // Este es un nuevo daño causado por un fee, activar animación de unlisted
      console.log("¡Fee causó daño! Activando animación de unlisted");
      
      // Reproducir sonido específico para fee damage
      playSound('auch');
      
      // Activar la animación de unlisted
      setUnlistedAnimation({
        active: true,
        start: Date.now(),
        phase: 'entering'
      });
      
      // Actualizar el tiempo del último daño por fee
      lastFeeDamageTimeRef.current = gameState.lastDamageTime;
    }
  }, [gameState.lastDamageTime, gameState.lastDamageSource, playSound]);

  // Detectar cuando se recoge un vaul
  useEffect(() => {
    // Verificar si se activó el multiplicador (vaul recogido)
    if (gameState.multiplierEndTime && 
        gameState.multiplierEndTime > lastVaulCollectionTimeRef.current) {
      // Se recogió un vaul, activar animación de giga vault
      console.log("¡Vaul recogido! Activando animación de giga vault");
      
      // Reproducir sonido específico para vaul
      playSound('vaul_collect');
      
      // Activar la animación de giga vault
      setGigaVaultAnimation({
        active: true,
        start: Date.now(),
        phase: 'entering'
      });
      
      // Actualizar el tiempo del último vaul recogido
      lastVaulCollectionTimeRef.current = gameState.multiplierEndTime;
    }
  }, [gameState.multiplierEndTime, playSound]);

  // Detectar cuando el hacker toca al token
  useEffect(() => {
    // Verificar si hubo daño reciente por un hacker específicamente
    if (gameState.lastDamageTime && 
        gameState.lastDamageTime > lastHackerDamageTimeRef.current &&
        gameState.lastDamageSource === 'hacker') {
      // Este es un nuevo daño causado por un hacker, activar animación
      console.log("¡Hacker tocó al token! Activando animación de Trump");
      
      // Reproducir sonido específico para hacker collision (ya se reproduce en useGameState)
      // playSound('hacker_collision'); // Ya se reproduce automáticamente
      
      // Activar la animación del hacker
      setHackerAnimation({
        active: true,
        start: Date.now(),
        phase: 'entering'
      });
      
      // Actualizar el tiempo del último daño por hacker
      lastHackerDamageTimeRef.current = gameState.lastDamageTime;
    }
  }, [gameState.lastDamageTime, gameState.lastDamageSource, playSound]);

  // Advertencia de tiempo bajo
  useEffect(() => {
    if (gameState.status === 'playing' && gameState.timer <= 10 && gameState.timer > 0) {
      // Solo mostrar advertencia en intervalos específicos para evitar spam
      const timeLeft = Math.ceil(gameState.timer);
      if (timeLeft === 10 || timeLeft === 5 || timeLeft === 3 || timeLeft === 1) {
        console.log(`¡Advertencia! Quedan ${timeLeft} segundos`);
      }
    }
  }, [gameState.timer, gameState.status]);

  // Manejar música de fondo según el estado del juego
  useEffect(() => {
    if (gameState.status === 'gameOver') {
      // Reproducir sonido de game over independientemente del control de música
      console.log('💀 Game Over - Reproduciendo sonido de game over');
      playGameOverSound();
    } else if (gameState.status === 'playing' || gameState.status === 'countdown') {
      // CORREGIDO: Solo iniciar música cuando realmente empezamos a jugar
      // NO reiniciar música cuando está pausado, ya que debe continuar donde se quedó
      playMusic('background_music');
    }
    // En estado 'idle' o 'paused' no cambiar la música
  }, [gameState.status, playGameOverSound]); // CORREGIDO: Removido playMusic, stopMusic, y gameState.score

  // Iniciar música de fondo automáticamente al cargar el componente
  useEffect(() => {
    // Pequeño delay para asegurar que el sistema de audio esté listo
    const timer = setTimeout(() => {
      if (gameState.status !== 'gameOver') {
        playMusic('background_music');
      }
    }, 1000); // 1 segundo de delay

    return () => clearTimeout(timer);
  }, []); // Solo ejecutar una vez al montar el componente
  
  // Manejar las fases de la animación de jeff_goit
  useEffect(() => {
    if (!jeffGoitAnimation || !jeffGoitAnimation.active) return;
    
    const intervalId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - jeffGoitAnimation.start;
      
      // Fases de la animación actualizadas:
      // 1. entering - 800ms - deslizándose desde fuera izquierda hacia dentro
      // 2. visible - 2000ms - visible completamente PARADO
      // 3. exiting - 800ms - retrocediendo hacia fuera izquierda
      
      if (jeffGoitAnimation.phase === 'entering' && elapsed >= 800) {
        // Cambiar a fase visible
        console.log("Cambiando a fase VISIBLE");
        setJeffGoitAnimation({
          active: true,
          start: now,
          phase: 'visible'
        });
      } else if (jeffGoitAnimation.phase === 'visible' && elapsed >= 2000) {
        // Cambiar a fase saliente
        console.log("Cambiando a fase EXITING");
        setJeffGoitAnimation({
          active: true,
          start: now,
          phase: 'exiting'
        });
      } else if (jeffGoitAnimation.phase === 'exiting' && elapsed >= 800) {
        // Terminar la animación
        console.log("Terminando animación");
        setJeffGoitAnimation(null);
      }
    }, 50);
    
    return () => clearInterval(intervalId);
  }, [jeffGoitAnimation]);
  
  // Manejar las fases de la animación de whalechadmode
  useEffect(() => {
    if (!whaleChadAnimation || !whaleChadAnimation.active) return;
    
    const intervalId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - whaleChadAnimation.start;
      
      // Fases de la animación iguales a jeff pero desde el lado derecho:
      // 1. entering - 800ms - deslizándose desde fuera derecha hacia dentro
      // 2. visible - 2000ms - visible completamente PARADO
      // 3. exiting - 800ms - retrocediendo hacia fuera derecha
      
      if (whaleChadAnimation.phase === 'entering' && elapsed >= 800) {
        // Cambiar a fase visible
        console.log("Whale Chad: Cambiando a fase VISIBLE");
        setWhaleChadAnimation({
          active: true,
          start: now,
          phase: 'visible'
        });
      } else if (whaleChadAnimation.phase === 'visible' && elapsed >= 2000) {
        // Cambiar a fase saliente
        console.log("Whale Chad: Cambiando a fase EXITING");
        setWhaleChadAnimation({
          active: true,
          start: now,
          phase: 'exiting'
        });
      } else if (whaleChadAnimation.phase === 'exiting' && elapsed >= 800) {
        // Terminar la animación
        console.log("Whale Chad: Terminando animación");
        setWhaleChadAnimation(null);
      }
    }, 50);
    
    return () => clearInterval(intervalId);
  }, [whaleChadAnimation]);
  
  // Manejar las fases de la animación de meow (purr effect)
  useEffect(() => {
    if (!meowAnimation || !meowAnimation.active) return;
    // Pausar animaciones cuando el juego está pausado
    if (gameState.status === 'paused') return;
    
    const intervalId = setInterval(() => {
      // No ejecutar animaciones si el juego está pausado
      if (gameState.status === 'paused') return;
      
      const now = Date.now();
      const elapsed = now - meowAnimation.start;
      const currentImmunityTimer = gameState.token.immunityTimer;
      
      // ✅ CORREGIDO: Sincronizado con el contador de inmunidad
      // Fases de la animación:
      // 1. entering - 800ms - deslizándose desde fuera derecha hacia dentro
      // 2. visible - HASTA QUE immunityTimer ≤ 500ms - visible con contador
      // 3. exiting - 800ms - retrocediendo hacia fuera derecha
      
      if (meowAnimation.phase === 'entering' && elapsed >= 800) {
        // Cambiar a fase visible
        console.log("🐱 Meow: Cambiando a fase VISIBLE");
        setMeowAnimation({
          active: true,
          start: now,
          phase: 'visible',
          immunityDuration: meowAnimation.immunityDuration
        });
      } else if (meowAnimation.phase === 'visible' && currentImmunityTimer <= 500) {
        // ✅ Salir cuando queden ≤500ms de inmunidad (como estaba originalmente)
        console.log("🐱 Meow: Inmunidad casi terminada, cambiando a fase EXITING");
        setMeowAnimation({
          active: true,
          start: now,
          phase: 'exiting',
          immunityDuration: meowAnimation.immunityDuration
        });
      } else if (meowAnimation.phase === 'exiting' && elapsed >= 800) {
        // Terminar la animación
        console.log("🐱 Meow: Terminando animación");
        setMeowAnimation(null);
      }
      
      // ✅ PROTECCIÓN EXTRA: Si inmunidad terminó completamente, terminar inmediatamente
      if (currentImmunityTimer <= 0) {
        console.log("🐱 Meow: Inmunidad terminada completamente, terminando animación");
        setMeowAnimation(null);
      }
    }, 50);
    
    return () => clearInterval(intervalId);
  }, [meowAnimation, gameState.status, gameState.token.immunityTimer]);
  
  // Manejar las fases de la animación de unlisted (fee damage effect)
  useEffect(() => {
    if (!unlistedAnimation || !unlistedAnimation.active) return;
    // Pausar animaciones cuando el juego está pausado
    if (gameState.status === 'paused') return;
    
    const intervalId = setInterval(() => {
      // No ejecutar animaciones si el juego está pausado
      if (gameState.status === 'paused') return;
      
      const now = Date.now();
      const elapsed = now - unlistedAnimation.start;
      
      // Fases de la animación iguales a whalechadmode pero desde el lado izquierdo superior:
      // 1. entering - 800ms - deslizándose desde fuera izquierda hacia dentro
      // 2. visible - 2000ms - visible completamente PARADO  
      // 3. exiting - 800ms - retrocediendo hacia fuera izquierda
      
      if (unlistedAnimation.phase === 'entering' && elapsed >= 800) {
        // Cambiar a fase visible
        console.log("Unlisted: Cambiando a fase VISIBLE");
        setUnlistedAnimation({
          active: true,
          start: now,
          phase: 'visible'
        });
      } else if (unlistedAnimation.phase === 'visible' && elapsed >= 2000) {
        // Cambiar a fase saliente
        console.log("Unlisted: Cambiando a fase EXITING");
        setUnlistedAnimation({
          active: true,
          start: now,
          phase: 'exiting'
        });
      } else if (unlistedAnimation.phase === 'exiting' && elapsed >= 800) {
        // Terminar la animación
        console.log("Unlisted: Terminando animación");
        setUnlistedAnimation(null);
      }
    }, 50);
    
    return () => clearInterval(intervalId);
  }, [unlistedAnimation, gameState.status]);

  // Manejar las fases de la animación de giga vault (vaul effect)
  useEffect(() => {
    if (!gigaVaultAnimation || !gigaVaultAnimation.active) return;
    // Pausar animaciones cuando el juego está pausado
    if (gameState.status === 'paused') return;
    
    const intervalId = setInterval(() => {
      // No ejecutar animaciones si el juego está pausado
      if (gameState.status === 'paused') return;
      
      const now = Date.now();
      const elapsed = now - gigaVaultAnimation.start;
      
      // Fases de la animación iguales a whalechadmode desde el lado izquierdo inferior:
      // 1. entering - 800ms - deslizándose desde fuera izquierda hacia dentro
      // 2. visible - 2000ms - visible completamente PARADO  
      // 3. exiting - 800ms - retrocediendo hacia fuera izquierda
      
      if (gigaVaultAnimation.phase === 'entering' && elapsed >= 800) {
        // Cambiar a fase visible
        console.log("Giga Vault: Cambiando a fase VISIBLE");
        setGigaVaultAnimation({
          active: true,
          start: now,
          phase: 'visible'
        });
      } else if (gigaVaultAnimation.phase === 'visible' && elapsed >= 2000) {
        // Cambiar a fase saliente
        console.log("Giga Vault: Cambiando a fase EXITING");
        setGigaVaultAnimation({
          active: true,
          start: now,
          phase: 'exiting'
        });
      } else if (gigaVaultAnimation.phase === 'exiting' && elapsed >= 800) {
        // Terminar la animación
        console.log("Giga Vault: Terminando animación");
        setGigaVaultAnimation(null);
      }
    }, 50);
    
    return () => clearInterval(intervalId);
  }, [gigaVaultAnimation, gameState.status]);

  // Manejar las fases de la animación del hacker
  useEffect(() => {
    if (!hackerAnimation || !hackerAnimation.active) return;
    // Pausar animaciones cuando el juego está pausado
    if (gameState.status === 'paused') return;
    
    const intervalId = setInterval(() => {
      // No ejecutar animaciones si el juego está pausado
      if (gameState.status === 'paused') return;
      
      const now = Date.now();
      const elapsed = now - hackerAnimation.start;
      
      // Fases de la animación del hacker:
      // 1. entering - 800ms - deslizándose desde fuera derecha hacia dentro
      // 2. visible - 2000ms - visible completamente con mensaje
      // 3. exiting - 800ms - retrocediendo hacia fuera derecha
      
      if (hackerAnimation.phase === 'entering' && elapsed >= 800) {
        // Cambiar a fase visible
        console.log("Hacker: Cambiando a fase VISIBLE");
        setHackerAnimation({
          active: true,
          start: now,
          phase: 'visible'
        });
      } else if (hackerAnimation.phase === 'visible' && elapsed >= 2000) {
        // Cambiar a fase exiting
        console.log("Hacker: Cambiando a fase EXITING");
        setHackerAnimation({
          active: true,
          start: now,
          phase: 'exiting'
        });
      } else if (hackerAnimation.phase === 'exiting' && elapsed >= 800) {
        // Terminar animación
        console.log("Hacker: Terminando animación");
        setHackerAnimation(null);
      }
    }, 50);
    
    return () => clearInterval(intervalId);
  }, [hackerAnimation, gameState.status]);

  // Cargar imágenes de efectos especiales que no están en el assetLoader
  useEffect(() => {
    const loadSpecialImage = (src: string, ref: React.MutableRefObject<HTMLImageElement | null>, name: string) => {
      const img = new window.Image();
      img.onload = () => {
        ref.current = img;
        console.log(`✅ Imagen ${name} cargada`);
      };
      img.onerror = () => console.error(`❌ Error cargando ${name}`);
      img.src = `${basePath}${src}`;
    };

    loadSpecialImage('/games/sybil-slayer/play/assets/collectibles/jeff_goit.png', jeffGoitImgRef, 'jeff_goit.png');
    loadSpecialImage('/games/sybil-slayer/play/assets/collectibles/whalechadmode.png', whaleChadImgRef, 'whalechadmode.png');
    loadSpecialImage('/games/sybil-slayer/play/assets/collectibles/meow.png', meowImgRef, 'meow.png');
    loadSpecialImage('/games/sybil-slayer/play/assets/collectibles/unlisted.png', unlistedImgRef, 'unlisted.png');
    loadSpecialImage('/games/sybil-slayer/play/assets/collectibles/giga_vault.png', gigaVaultImgRef, 'giga_vault.png');
    loadSpecialImage('/games/sybil-slayer/play/assets/collectibles/pay_tariffs.png', hackerTrumpImgRef, 'pay_tariffs.png');
    
  }, [basePath]);

  // Justo antes del return principal del componente:
  if (!assetsLoaded) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-50">
        <div className="w-full flex flex-col items-center justify-center py-10">
          <div className="w-3/4 mb-4">
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-4 bg-primary rounded-full transition-all duration-300"
                style={{ width: `${Math.round(loadingProgress * 100)}%` }}
              ></div>
            </div>
          </div>
          <p className="text-muted-foreground text-lg font-pixellari mt-2">Cargando assets: {Math.round(loadingProgress * 100)}%</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex flex-col items-center justify-center w-full h-full p-4 bg-black text-white font-pixellari overflow-hidden">
      <style>{animationStyles}</style>
      
      {/* Fondo con nubes en movimiento */}
      <div 
        className="absolute inset-0 w-full h-full bg-repeat-x cloud-animation z-0"
        style={{ backgroundImage: `url(${basePath}/games/sybil-slayer/play/assets/ui/game-container/clouds-background.png)`, backgroundSize: 'auto 100%' }}
      />
      
      {/* Contenedor del juego con fondo principal */}
      <div 
        className="relative z-10"
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
          backgroundImage: `url(${basePath}/games/sybil-slayer/play/assets/ui/game-container/background-playing.png)`,
          backgroundSize: 'cover',
          boxShadow: '0 0 20px 5px hsl(var(--primary) / 0.5)',
          border: '2px solid hsl(var(--primary))',
          borderRadius: '15px'
        }}
      >
        {gameState.status === 'idle' ? (
          <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 z-20 bg-background/30 backdrop-blur-sm">
            <h1 className="text-6xl md:text-8xl font-pixellari text-white drop-shadow-lg mb-8 text-center select-none tracking-wide">
              SYBIL SLAYER
            </h1>
            <p className="text-lg md:text-xl font-pixellari text-primary-foreground mb-8 text-center max-w-xl select-none">
              Welcome to SYBIL SLAYER!<br/>
              Dodge obstacles, collect energy and achieve the highest score.<br/>
              Ready to play?
            </p>
            <button 
              onClick={handleStartPauseClick} 
              className="focus:outline-none game-button mb-4"
              aria-label="Start game"
            >
              <Image 
                src={`${basePath}/games/sybil-slayer/play/assets/ui/buttons/play-button.png`}
                alt="Play"
                width={160}
                height={60}
                className="game-img"
              />
            </button>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center relative">
            {/* Score, Hearts y Timer */}
            <div className="w-full flex justify-between mb-2 px-4 items-center absolute top-2 left-0 right-0">
                {/* Score Box */}
                <div className="relative">
                    <Image 
                        src={`${basePath}/games/sybil-slayer/play/assets/ui/buttons/box_letters.png`}
                        alt="Score box"
                        width={150}
                        height={50}
                        className="game-img"
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-shadow">
                        <span style={{ color: gameState.scoreMultiplier > 1 ? '#FFD700' : '#00FFFF' }}>
                            Score: {gameState.score}
                        </span>
                    </div>
                </div>
                {/* Hearts Box */}
                <div className="relative">
                    <Image 
                        src={`${basePath}/games/sybil-slayer/play/assets/ui/buttons/box_letters.png`}
                        alt="Hearts box"
                        width={150}
                        height={50}
                        className="game-img"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                        {Array.from({ length: gameState.hearts }).map((_, i) => (
                            <Image
                                key={i}
                                src={`${basePath}/games/sybil-slayer/play/assets/collectibles/heart.png`}
                                alt="Heart"
                                width={28}
                                height={28}
                                className="inline-block mr-1"
                            />
                        ))}
                    </div>
                </div>
                {/* Time Box */}
                <div className="relative">
                    <Image 
                        src={`${basePath}/games/sybil-slayer/play/assets/ui/buttons/box_letters.png`}
                        alt="Time box"
                        width={150}
                        height={50}
                        className="game-img"
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-shadow">
                        <span className={gameState.timer <= 10 ? 'text-destructive' : 'text-primary'}>
                            Time: {Math.ceil(gameState.timer)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Canvas del Juego */}
            <div className="w-full h-full flex justify-center items-center">
              {canvasSize.width > 0 && canvasSize.height > 0 && (
                  <GameCanvas
                      gameState={gameState}
                      width={canvasSize.width}
                      height={canvasSize.height}
                      energyCollectedFlag={energyCollectedFlag}
                      damageFlag={damageFlag}
                  />
              )}
            </div>

            {/* Overlay de Pausa */}
            {gameState.status === 'paused' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm z-30">
                    <h2 className="text-3xl font-bold text-primary mb-2 font-pixellari text-shadow-glow">PAUSED</h2>
                    <p className="text-xl text-primary font-pixellari text-shadow">Press P to Resume</p>
                </div>
            )}
            
            {/* Control Buttons */}
            <div className="flex space-x-8 absolute bottom-4">
              <button onClick={handleStartPauseClick} className="focus:outline-none game-button">
                  <Image 
                      src={gameState.status === 'playing' ? `${basePath}/games/sybil-slayer/play/assets/ui/buttons/pause-button.png` : `${basePath}/games/sybil-slayer/play/assets/ui/buttons/play-button.png`}
                      alt={gameState.status === 'playing' ? "Pause" : "Play"} 
                      width={120} 
                      height={50}
                      className="game-img"
                  />
              </button>
              <button onClick={handleResetClick} className="focus:outline-none game-button">
                  <Image 
                      src={`${basePath}/games/sybil-slayer/play/assets/ui/buttons/reset-button.png`} 
                      alt="Reset" 
                      width={120} 
                      height={50}
                      className="game-img"
                  />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de información */}
      <InfoModal 
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        onPlaySound={playSound}
      >
        <div className="flex flex-col items-center">
          <Image width={80} height={80} className="game-img mb-2" alt="Jeff GOIT" src={`${basePath}/games/sybil-slayer/play/assets/collectibles/jeff_goit.png`}/>
          <p className="text-sm">JEFF GOIT</p>
        </div>
        <div className="flex flex-col items-center">
          <Image width={80} height={80} className="game-img mb-2" alt="Whale CHAD Mode" src={`${basePath}/games/sybil-slayer/play/assets/collectibles/whalechadmode.png`}/>
          <p className="text-sm">WHALECHAD MODE</p>
        </div>
        <div className="flex flex-col items-center">
          <Image width={80} height={80} className="game-img mb-2" alt="Purr" src={`${basePath}/games/sybil-slayer/play/assets/collectibles/meow.png`}/>
          <p className="text-sm">PURR</p>
        </div>
        <div className="flex flex-col items-center">
          <Image width={80} height={80} className="game-img mb-2" alt="Pay Tariffs" src={`${basePath}/games/sybil-slayer/play/assets/collectibles/pay_tariffs.png`}/>
          <p className="text-sm">PAY TARIFFS</p>
        </div>
        <div className="flex flex-col items-center">
          <Image width={80} height={80} className="game-img mb-2" alt="Giga Vault" src={`${basePath}/games/sybil-slayer/play/assets/collectibles/giga_vault.png`}/>
          <p className="text-sm">GIGA VAULT</p>
        </div>
        <div className="flex flex-col items-center">
          <Image width={80} height={80} className="game-img mb-2" alt="Unlisted" src={`${basePath}/games/sybil-slayer/play/assets/collectibles/unlisted.png`}/>
          <p className="text-sm">UNLISTED</p>
        </div>
      </InfoModal>

      {/* Botones de control flotantes */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        <button onClick={handleMusicToggle} className="focus:outline-none hover:scale-110 transition-transform">
          <Image 
            src={musicEnabled ? `${basePath}/games/sybil-slayer/play/assets/ui/buttons/music_on.png` : `${basePath}/games/sybil-slayer/play/assets/ui/buttons/music_off.png`}
            alt={musicEnabled ? "Music On" : "Music Off"} 
            width={50} height={50} className="game-img"
          />
        </button>
        <button onClick={handleSoundsToggle} className="focus:outline-none hover:scale-110 transition-transform">
          <Image 
            src={soundsEnabled ? `${basePath}/games/sybil-slayer/play/assets/ui/buttons/sounds_on.png` : `${basePath}/games/sybil-slayer/play/assets/ui/buttons/sounds_off.png`}
            alt={soundsEnabled ? "Sounds On" : "Sounds Off"} 
            width={50} height={50} className="game-img"
          />
        </button>
        <button onClick={handleInfoToggle} className="focus:outline-none hover:scale-110 transition-transform">
          <Image 
            src={`${basePath}/games/sybil-slayer/play/assets/ui/buttons/button_info.png`}
            alt="Información" 
            width={50} height={50} className="game-img"
          />
        </button>
      </div>
    </div>
  );
};

export default GameContainer;
