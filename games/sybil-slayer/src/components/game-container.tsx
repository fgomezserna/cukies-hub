"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useGameConnection } from '../hooks/useGameConnection';
import GameCanvas from './game-canvas';
import InfoModal from './info-modal';
import { useGameState } from '../hooks/useGameState';
import { useGameInput } from '../hooks/useGameInput';
import { useGameLoop } from '../hooks/useGameLoop';
import { useAudio } from '../hooks/useAudio';
import { Button } from "./ui/button";
import { Github, Play, Pause, RotateCcw } from 'lucide-react';
import { FPS, BASE_GAME_WIDTH, BASE_GAME_HEIGHT } from '../lib/constants';
import { assetLoader } from '../lib/assetLoader';
import { spriteManager } from '../lib/spriteManager';
import { performanceMonitor } from '../lib/performanceMonitor';


interface GameContainerProps {
  width?: number;
  height?: number;
}

const GameContainer: React.FC<GameContainerProps> = ({ width, height }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { 
    isAuthenticated, 
    user, 
    gameSession, 
    sendCheckpoint, 
    sendSessionEnd, 
    startCheckpointInterval, 
    stopCheckpointInterval 
  } = useGameConnection();
  const [canvasSize, setCanvasSize] = useState({ width: width || 800, height: height || 600 });
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
  
  // Estado para loading de assets optimizado
  const [criticalAssetsLoaded, setCriticalAssetsLoaded] = useState(false);
  const [allAssetsLoaded, setAllAssetsLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingPhase, setLoadingPhase] = useState<'preload' | 'full'>('preload');

  // Carga progresiva y optimizada de assets con monitoreo de rendimiento
  useEffect(() => {
    const loadAssets = async () => {
      try {
        // Inicializar monitoreo de rendimiento
        performanceMonitor.startTimer('totalAssets');
        performanceMonitor.startTimer('criticalAssets');
        performanceMonitor.startTimer('sprites');
        
        console.log('🚀 Iniciando carga optimizada de assets...');
        setLoadingPhase('preload');
        
        // Cargar assets críticos en paralelo
        const [, ] = await Promise.all([
          assetLoader.preloadCritical((progress) => {
            setLoadingProgress(progress * 0.6); // 60% para assets críticos
          }),
          spriteManager.loadGameSprites().then(() => {
            performanceMonitor.endTimer('sprites');
            setLoadingProgress(prev => prev + 0.3); // 30% para sprites
          })
        ]);
        
        performanceMonitor.endTimer('criticalAssets');
        console.log('✅ Assets críticos y sprites cargados - juego puede iniciar');
        setCriticalAssetsLoaded(true);
        
        // Fase 2: Cargar assets restantes en background
        setTimeout(async () => {
          console.log('⏳ Cargando assets decorativos en background...');
          setLoadingPhase('full');
          
          await assetLoader.loadRemaining((progress, phase) => {
            setLoadingProgress(0.9 + (progress * 0.1)); // 10% restante
            setLoadingPhase(phase);
          });
          
          performanceMonitor.endTimer('totalAssets');
          console.log('🎉 Todos los assets cargados');
          setAllAssetsLoaded(true);
          
          // Mostrar reporte de rendimiento en desarrollo
          if (process.env.NODE_ENV === 'development') {
            setTimeout(() => {
              performanceMonitor.printReport();
            }, 1000);
          }
        }, 300); // Delay reducido para mejor UX
        
      } catch (error) {
        console.error('❌ Error cargando assets:', error);
        performanceMonitor.recordAssetFailed();
        // Aún así permitir que el juego inicie con assets básicos
        setCriticalAssetsLoaded(true);
      }
    };
    
    loadAssets();
  }, []);
  
  // Estilos CSS para las animaciones
  const animationStyles = `
    @keyframes pulse {
      0% {
        transform: scale(1);
        filter: brightness(1) drop-shadow(0 0 10px rgba(138, 43, 226, 0.5));
      }
      50% {
        transform: scale(1.12);
        filter: brightness(1.3) drop-shadow(0 0 20px rgba(138, 43, 226, 0.8));
      }
      100% {
        transform: scale(1.05);
        filter: brightness(1.15) drop-shadow(0 0 15px rgba(138, 43, 226, 0.7));
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

  useEffect(() => {
    if (width && height && (canvasSize.width !== width || canvasSize.height !== height)) {
      setCanvasSize({ width, height });
    }
  }, [width, height, canvasSize.width, canvasSize.height]);

  const inputState = useGameInput();
  const { gameState, updateGame, updateInputRef, startGame, togglePause, resetGame } = useGameState(canvasSize.width, canvasSize.height, handleEnergyCollected, handleDamage, playSound, handleHackerEscape);

  // Log para verificar la recepción de datos de autenticación
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('Game received auth state from Dapp:', { isAuthenticated, user });
    }
  }, [isAuthenticated, user]);

  // Handle game session start
  useEffect(() => {
    if (gameSession && gameState.status === 'playing') {
      console.log('🎮 [GAME] Starting checkpoint interval for session:', gameSession.sessionId);
      startCheckpointInterval(
        () => gameState.score,
        () => {
          const now = Date.now();
          const startTime = gameState.gameStartTime || now;
          return now - startTime;
        }
      );
    }
    
    return () => {
      if (gameState.status !== 'playing') {
        stopCheckpointInterval();
      }
    };
  }, [gameSession, gameState.status, gameState.score, gameState.gameStartTime, startCheckpointInterval, stopCheckpointInterval]);

  // Handle game session end
  useEffect(() => {
    if (gameSession && gameState.status === 'gameOver') {
      console.log('🏁 [GAME] Ending session with score:', gameState.score);
      sendSessionEnd(gameState.score, {
        gameOverReason: gameState.gameOverReason,
        level: gameState.level,
        hearts: gameState.hearts
      });
      stopCheckpointInterval();
    }
  }, [gameSession, gameState.status, gameState.score, gameState.gameOverReason, gameState.level, gameState.hearts, sendSessionEnd, stopCheckpointInterval]);

  // Update the gameState hook's internal input ref whenever useGameInput changes
  useEffect(() => {
    updateInputRef(inputState);
  }, [inputState, updateInputRef]);

  // Helper para obtener tiempo pausable para animaciones
  const getPausableTime = useCallback(() => {
    if (gameState.status === 'paused') {
      // Si está pausado, devolver el tiempo que tenía cuando se pausó
      // Para esto necesitamos almacenar cuándo se pausó
      return Date.now(); // Por ahora usar tiempo real como fallback
    }
    return Date.now();
  }, [gameState.status]);

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

  // Usar assets del AssetLoader optimizado en lugar de carga individual
  useEffect(() => {
    // Actualizar referencias cuando los assets estén disponibles
    const updateImageRefs = () => {
      jeffGoitImgRef.current = assetLoader.getAsset('jeff_goit');
      whaleChadImgRef.current = assetLoader.getAsset('whalechadmode');
      meowImgRef.current = assetLoader.getAsset('meow');
      unlistedImgRef.current = assetLoader.getAsset('unlisted');
      gigaVaultImgRef.current = assetLoader.getAsset('giga_vault');
      hackerTrumpImgRef.current = assetLoader.getAsset('pay_tariffs');
    };
    
    // Actualizar inmediatamente si ya están cargados
    updateImageRefs();
    
    // Verificar periódicamente hasta que todos estén cargados
    const interval = setInterval(() => {
      updateImageRefs();
      
      // Detener cuando todos los assets críticos estén disponibles
      if (jeffGoitImgRef.current && whaleChadImgRef.current && 
          meowImgRef.current && unlistedImgRef.current && 
          gigaVaultImgRef.current && hackerTrumpImgRef.current) {
        clearInterval(interval);
        console.log('✅ Todas las referencias de imágenes actualizadas desde AssetLoader');
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [allAssetsLoaded]);

  // Escalado responsivo
  const [scale, setScale] = useState(1);

  const calculateScale = useCallback(() => {
    const newScale = Math.min(
      window.innerWidth / BASE_GAME_WIDTH,
      window.innerHeight / BASE_GAME_HEIGHT,
      1 // no ampliamos por encima del 100%
    );
    setScale(newScale);
  }, []);

  // Recalcular al montar y al redimensionar
  useEffect(() => {
    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [calculateScale]);

  // Loading screen optimizado con fases
  if (!criticalAssetsLoaded) {
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
          <p className="text-muted-foreground text-lg font-pixellari mt-2">
            {loadingPhase === 'preload' 
              ? `Cargando elementos esenciales: ${Math.round(loadingProgress * 100)}%`
              : `Optimizando experiencia: ${Math.round(loadingProgress * 100)}%`
            }
          </p>
          <p className="text-muted-foreground text-sm font-pixellari mt-1 opacity-70">
            {loadingPhase === 'preload' 
              ? 'Preparando juego...'
              : 'Cargando efectos especiales...'
            }
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center min-h-screen">
      {/* Menú de bienvenida */}
      {gameState.status === 'idle' ? (
        <>
          {/* Fondo animado igual que en el juego */}
           {/* Fondo del juego */}
           <div 
            className="fixed inset-0 w-full h-full overflow-hidden -z-10"
            style={{
              backgroundImage: "url('/assets/ui/game-container/background-playing.png')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundAttachment: 'fixed',
              backgroundRepeat: 'no-repeat'
            }}
          ></div>
          
          {/* Capa de nubes con animación */}
          <div 
            className="fixed top-0 left-0 w-full h-[400px] overflow-hidden -z-[9] cloud-animation"
            style={{
              backgroundImage: "url('/assets/ui/game-container/clouds-background.png')",
              backgroundSize: '3300px 400px',
              backgroundRepeat: 'repeat-x',
              pointerEvents: 'none'
            }}
          ></div>
          <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 z-20 bg-background/30 backdrop-blur-sm">
            <div
              className="flex flex-col items-center justify-center"
              style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
            >
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
                  src="/assets/ui/buttons/play-button.png"
                  alt="Play"
                  width={160}
                  height={60}
                  className="game-img"
                />
              </button>
            </div>
          </div>
        </>
      ) : gameState.status === 'countdown' ? (
        /* ✅ CORREGIDO: Durante countdown, NO mostrar fondos para que solo se vea grid-background.png */
        <div className="game-container mx-auto flex flex-col items-center p-4 md:p-8">
          {/* Estilos para las animaciones */}
          <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
          
          {/* Sin fondos durante countdown - solo el grid del canvas será visible */}
          
          <div className="flex flex-col items-center justify-center w-full max-w-[1100px] mx-auto my-2" style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: BASE_GAME_WIDTH }}>
            {/* Score, Hearts y Timer con cajas */}
            <div className="w-full flex justify-between mb-2 px-4 items-center">
              <div className="relative">
                <Image 
                  src="/assets/ui/buttons/box_letters.png"
                  alt="Score box"
                  width={150}
                  height={50}
                  className="game-img"
                />
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-shadow">
                  <span className="text-primary">
                    Score: {gameState.score}
                  </span>
                </div>
              </div>

              {/* Caja de corazones centrada */}
              <div className="relative">
                <Image 
                  src="/assets/ui/buttons/box_letters.png"
                  alt="Hearts box"
                  width={150}
                  height={50}
                  className="game-img"
                />
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-primary text-shadow">
                  {Array.from({ length: gameState.hearts }).map((_, i) => (
                    <Image
                      key={i}
                      src="/assets/collectibles/heart.png"
                      alt="Heart"
                      width={28}
                      height={28}
                      className="inline-block mr-1 align-middle"
                    />
                  ))}
                </div>
              </div>

              <div className="relative">
                <Image 
                  src="/assets/ui/buttons/box_letters.png"
                  alt="Time box"
                  width={150}
                  height={50}
                  className="game-img"
                />
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-shadow">
                  <span className="text-primary">
                    Time: {Math.ceil(gameState.timer)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Canvas del juego */}
            <div ref={containerRef} className="w-full flex justify-center items-center mb-4 relative">
              
              {/* Render canvas only when size is determined */}
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
            
            {/* Botones principales */}
            <div className="flex space-x-8 mb-3 justify-center">
              <button 
                onClick={handleStartPauseClick} 
                className="focus:outline-none game-button"
                aria-label="Start"
              >
                <Image 
                  src="/assets/ui/buttons/play-button.png"
                  alt="Play" 
                  width={120} 
                  height={50}
                  className="game-img"
                />
              </button>
              <button 
                onClick={handleResetClick} 
                className="focus:outline-none game-button"
                aria-label="Reset game"
              >
                <Image 
                  src="/assets/ui/buttons/reset-button.png" 
                  alt="Reset" 
                  width={120} 
                  height={50}
                  className="game-img"
                />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ✅ Estados normales (playing, paused, gameOver): mostrar fondos completos */
        <div className="game-container mx-auto flex flex-col items-center p-4 md:p-8">
          {/* Estilos para las animaciones */}
          <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
          
          {/* Fondo del juego */}
          <div 
            className="fixed inset-0 w-full h-full overflow-hidden -z-10"
            style={{
              backgroundImage: "url('/assets/ui/game-container/background-playing.png')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundAttachment: 'fixed',
              backgroundRepeat: 'no-repeat'
            }}
          ></div>
          
          {/* Capa de nubes con animación */}
          <div 
            className="fixed top-0 left-0 w-full h-[400px] overflow-hidden -z-[9] cloud-animation"
            style={{
              backgroundImage: "url('/assets/ui/game-container/clouds-background.png')",
              backgroundSize: '3300px 400px',
              backgroundRepeat: 'repeat-x',
              pointerEvents: 'none'
            }}
          ></div>
          
          <div
            className="flex flex-col items-center justify-center w-full max-w-[1100px] mx-auto my-2"
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: BASE_GAME_WIDTH }}
          >
            {/* Score, Hearts y Timer con cajas */}
            <div className="w-full flex justify-between mb-2 px-4 items-center">
              <div className="relative">
                {/* Aura roja expansiva cuando el hacker roba score */}
                {gameState.scoreStealEffect && gameState.scoreStealEffect.active && (
                  <>
                    {/* Múltiples capas de aura roja para efecto expansivo */}
                    <div 
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: 'radial-gradient(circle, rgba(255, 0, 0, 0.3) 0%, rgba(255, 0, 0, 0.1) 50%, transparent 100%)',
                        animation: 'redAuraExpand 3s ease-out forwards',
                        transform: 'scale(1)',
                        zIndex: -1
                      }}
                    />
                    <div 
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: 'radial-gradient(circle, rgba(255, 50, 50, 0.4) 0%, rgba(255, 50, 50, 0.15) 40%, transparent 80%)',
                        animation: 'redAuraExpand 3s ease-out 0.2s forwards',
                        transform: 'scale(1)',
                        zIndex: -1
                      }}
                    />
                    <div 
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: 'radial-gradient(circle, rgba(255, 100, 100, 0.5) 0%, rgba(255, 100, 100, 0.2) 30%, transparent 70%)',
                        animation: 'redAuraExpand 3s ease-out 0.4s forwards',
                        transform: 'scale(1)',
                        zIndex: -1
                      }}
                    />
                  </>
                )}
                
                <Image 
                  src="/assets/ui/buttons/box_letters.png"
                  alt="Score box"
                  width={150}
                  height={50}
                  className="game-img"
                />
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-shadow">
                  <span 
                    style={{
                      color: gameState.scoreMultiplier > 1 ? '#FFD700' : '#00FFFF',
                      textShadow: gameState.scoreMultiplier > 1 
                        ? '0 0 10px rgba(255, 215, 0, 0.8), 2px 2px 4px rgba(0, 0, 0, 0.8)' 
                        : '2px 2px 4px rgba(0, 0, 0, 0.8)',
                      animation: gameState.scoreMultiplier > 1 ? 'pulse 1s infinite alternate' : 'none'
                    }}
                  >
                    Score: {gameState.score}
                  </span>
                </div>
                {/* Temporizador de multiplicador x5 - FUERA de la caja */}
                {(() => {
                  if (gameState.scoreMultiplier !== 1 || gameState.multiplierEndTime) {
                    console.log(`[VAULT-ISSUE] UI Condición:
                      - scoreMultiplier: ${gameState.scoreMultiplier}
                      - multiplierEndTime: ${gameState.multiplierEndTime}
                      - multiplierTimeRemaining: ${gameState.multiplierTimeRemaining}
                      - Condición (>1): ${gameState.scoreMultiplier > 1}
                      - Condición (endTime): ${!!gameState.multiplierEndTime}
                      - MOSTRAR x5: ${gameState.scoreMultiplier > 1 && gameState.multiplierEndTime}`);
                  }
                  return null;
                })()}
                {gameState.scoreMultiplier > 1 && gameState.multiplierEndTime && (
                  <div 
                    style={{
                      position: 'absolute',
                      left: '160px', // Al lado derecho de la caja
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#FFD700',
                      fontSize: '20px',
                      fontWeight: 'bold',
                      fontFamily: 'Pixellari, monospace',
                      textShadow: '0 0 10px rgba(255, 215, 0, 0.8), 2px 2px 4px rgba(0, 0, 0, 0.8)',
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '2px solid #FFD700',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    x5 {gameState.multiplierTimeRemaining || 0}s
                  </div>
                )}
              </div>

              {/* Caja de corazones centrada */}
              <div className="relative">
                <Image 
                  src="/assets/ui/buttons/box_letters.png"
                  alt="Hearts box"
                  width={150}
                  height={50}
                  className="game-img"
                />
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-primary text-shadow">
                  {Array.from({ length: gameState.hearts }).map((_, i) => (
                    <Image
                      key={i}
                      src="/assets/collectibles/heart.png"
                      alt="Heart"
                      width={28}
                      height={28}
                      className="inline-block mr-1 align-middle"
                    />
                  ))}
                </div>
              </div>

              <div className="relative">
                <Image 
                  src="/assets/ui/buttons/box_letters.png"
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
            
            {/* Canvas del juego - Ahora con mayor tamaño y menos margen */}
            <div ref={containerRef} className="w-full flex justify-center items-center mb-4 relative">

              {/* Animación de jeff_goit al lado izquierdo del grid */}
              {jeffGoitAnimation && jeffGoitAnimation.active && (
                <div 
                  className="absolute" 
                  style={{
                    bottom: '20px',
                    left: (() => {
                      const containerWidth = canvasSize.width;
                      const imageWidth = 250;
                      const stopDistance = 100; // Aumentado de 20px a 100px para que no toque el grid
                      
                      if (jeffGoitAnimation.phase === 'entering') {
                        // Entra desde -250px hasta la posición de parada
                        const progress = (Date.now() - jeffGoitAnimation.start) / 800;
                        const startPos = -imageWidth;
                        const endPos = -stopDistance;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      } else if (jeffGoitAnimation.phase === 'visible') {
                        // Se mantiene quieto en la posición de parada
                        return `${-stopDistance}px`;
                      } else {
                        // Retrocede desde la posición de parada hacia fuera
                        const progress = (Date.now() - jeffGoitAnimation.start) / 800;
                        const startPos = -stopDistance;
                        const endPos = -imageWidth;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      }
                    })(),
                    width: '250px',
                    height: '250px',
                    transition: 'none', // Removemos transition CSS para usar cálculo manual
                    filter: 'drop-shadow(0 0 15px rgba(255, 215, 0, 0.8))'
                  }}
                >
                  <img 
                    src="/assets/collectibles/jeff_goit.png" 
                    alt="¡Go it!" 
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      animation: jeffGoitAnimation.phase === 'visible' 
                        ? 'pulse 0.8s infinite alternate'
                        : 'none'
                    }}
                  />
                </div>
              )}

              {/* Animación de whalechadmode al lado derecho del grid */}
              {whaleChadAnimation && whaleChadAnimation.active && (
                <div 
                  className="absolute" 
                  style={{
                    bottom: '20px',
                    right: (() => {
                      const containerWidth = canvasSize.width;
                      const imageWidth = 250;
                      const stopDistance = 140; // Aumentado de 100px a 140px para alejarlo del grid
                      
                      if (whaleChadAnimation.phase === 'entering') {
                        // Entra desde fuera derecha hasta la posición de parada
                        const progress = (Date.now() - whaleChadAnimation.start) / 800;
                        const startPos = -imageWidth; // Comienza fuera de la pantalla por la derecha
                        const endPos = -stopDistance; // Se detiene a 140px del grid
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      } else if (whaleChadAnimation.phase === 'visible') {
                        // Se mantiene quieto en la posición de parada
                        return `${-stopDistance}px`;
                      } else {
                        // Retrocede desde la posición de parada hacia fuera derecha
                        const progress = (Date.now() - whaleChadAnimation.start) / 800;
                        const startPos = -stopDistance;
                        const endPos = -imageWidth;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      }
                    })(),
                    width: '250px',
                    height: '250px',
                    transition: 'none', // Removemos transition CSS para usar cálculo manual
                    filter: 'drop-shadow(0 0 15px rgba(0, 191, 255, 0.8))' // Azul cyan para diferenciarlo de jeff
                  }}
                >
                  <img 
                    src="/assets/collectibles/whalechadmode.png" 
                    alt="¡Whale Chad Mode!" 
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      animation: whaleChadAnimation.phase === 'visible' 
                        ? 'pulse 0.8s infinite alternate'
                        : 'none'
                    }}
                  />
                </div>
              )}

              {/* Animación de meow (purr effect) al lado derecho superior del grid */}
              {meowAnimation && meowAnimation.active && (
                <div 
                  className="absolute" 
                  style={{
                    top: '20px', // Posicionado arriba para no solaparse con whale chad
                    right: (() => {
                      const imageWidth = 200; // Más pequeño que whale chad
                      const stopDistance = 120; // Aumentado de 80px a 120px para alejarlo del grid
                      
                      if (meowAnimation.phase === 'entering') {
                        // ✅ CORREGIDO: Usar 800ms como jeff_goit
                        const progress = (Date.now() - meowAnimation.start) / 800;
                        const startPos = -imageWidth;
                        const endPos = -stopDistance;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      } else if (meowAnimation.phase === 'visible') {
                        // Se mantiene quieto en la posición de parada
                        return `${-stopDistance}px`;
                      } else {
                        // ✅ CORREGIDO: Usar 800ms como jeff_goit
                        const progress = (Date.now() - meowAnimation.start) / 800;
                        const startPos = -stopDistance;
                        const endPos = -imageWidth;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      }
                    })(),
                    width: '200px',
                    height: '200px',
                    transition: 'none', // ✅ CORREGIDO: Removemos transition CSS
                    filter: 'drop-shadow(0 0 15px rgba(138, 43, 226, 0.8))' // CORRECCIÓN: Violeta para el gato
                  }}
                >
                  <img 
                    src="/assets/collectibles/meow.png" 
                    alt="¡Meow! Inmunidad activada" 
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      animation: meowAnimation.phase === 'visible' 
                        ? 'pulse 0.6s infinite alternate'
                        : 'none'
                    }}
                  />
                  
                  {/* Contador de inmunidad - CORRECCIÓN: Mostrar desde el inicio y más separado */}
                  {(meowAnimation.phase === 'entering' || meowAnimation.phase === 'visible') && (
                    <div 
                      style={{
                        position: 'absolute',
                        bottom: '-30px', // CORRECCIÓN: Más separado del PNG (era '10px')
                        left: '50%',
                        transform: 'translateX(-50%)',
                        color: '#8A2BE2', // CORRECCIÓN: Violeta para coincidir con el resplandor
                        fontSize: '18px',
                        fontWeight: 'bold',
                        fontFamily: 'Pixellari, monospace',
                        textShadow: '0 0 10px rgba(138, 43, 226, 0.8), 2px 2px 4px rgba(0, 0, 0, 0.8)', // CORRECCIÓN: Violeta
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '2px solid #8A2BE2', // CORRECCIÓN: Borde violeta
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {Math.ceil(gameState.token.immunityTimer / 1000)}s
                    </div>
                  )}
                </div>
              )}

              {/* Animación de unlisted (fee damage effect) al lado izquierdo del grid */}
              {unlistedAnimation && unlistedAnimation.active && (
                <div 
                  className="absolute" 
                  style={{
                    top: '20px', // Arriba del grid (posición similar a meow pero del lado izquierdo)
                    left: (() => {
                      const imageWidth = 250;
                      const stopDistance = 100; // Misma distancia que jeff
                      
                      if (unlistedAnimation.phase === 'entering') {
                        // Entra desde fuera izquierda
                        const progress = (Date.now() - unlistedAnimation.start) / 800;
                        const startPos = -imageWidth;
                        const endPos = -stopDistance;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      } else if (unlistedAnimation.phase === 'visible') {
                        return `${-stopDistance}px`;
                      } else {
                        // Retrocede hacia fuera izquierda
                        const progress = (Date.now() - unlistedAnimation.start) / 800;
                        const startPos = -stopDistance;
                        const endPos = -imageWidth;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      }
                    })(),
                    width: '250px',
                    height: '250px',
                    transition: 'none',
                    filter: 'drop-shadow(0 0 15px rgba(220, 20, 60, 0.8))' // Rojo carmesí para el daño
                  }}
                >
                  <img 
                    src="/assets/collectibles/unlisted.png" 
                    alt="¡Unlisted! Daño recibido" 
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      animation: unlistedAnimation.phase === 'visible' 
                        ? 'pulse 0.5s infinite alternate'
                        : 'none'
                    }}
                  />
                </div>
              )}

              {/* Animación de giga_vault al lado izquierdo del grid - NUEVA */}
              {gigaVaultAnimation && gigaVaultAnimation.active && (
                <div 
                  className="absolute" 
                  style={{
                    bottom: '300px', // Arriba de jeff_goit
                    left: (() => {
                      const imageWidth = 250;
                      const stopDistance = 100; // Misma distancia que jeff
                      
                      if (gigaVaultAnimation.phase === 'entering') {
                        // Entra desde fuera izquierda
                        const progress = (Date.now() - gigaVaultAnimation.start) / 800;
                        const startPos = -imageWidth;
                        const endPos = -stopDistance;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      } else if (gigaVaultAnimation.phase === 'visible') {
                        // Se mantiene quieto en la posición de parada
                        return `${-stopDistance}px`;
                      } else {
                        // Retrocede hacia fuera izquierda
                        const progress = (Date.now() - gigaVaultAnimation.start) / 800;
                        const startPos = -stopDistance;
                        const endPos = -imageWidth;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      }
                    })(),
                    width: '250px',
                    height: '250px',
                    transition: 'none',
                    filter: 'drop-shadow(0 0 15px rgba(255, 215, 0, 0.8))' // Dorado como el vaul
                  }}
                >
                  <img 
                    src="/assets/collectibles/giga_vault.png" 
                    alt="¡Giga Vault! Multiplicador x5!" 
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      animation: gigaVaultAnimation.phase === 'visible' 
                        ? 'pulse 0.8s infinite alternate'
                        : 'none'
                    }}
                  />
                </div>
              )}
              
              {/* Animación del hacker (hacker collision effect) al lado derecho del grid */}
              {hackerAnimation && hackerAnimation.active && (
                <div 
                  className="absolute" 
                  style={{
                    top: '50%', // Centrado verticalmente
                    transform: 'translateY(-50%)',
                    right: (() => {
                      const imageWidth = 300; // Tamaño más grande para el hacker
                      const stopDistance = 150; // Distancia de parada
                      
                      if (hackerAnimation.phase === 'entering') {
                        // Entra desde fuera derecha hacia dentro
                        const progress = (Date.now() - hackerAnimation.start) / 800;
                        const startPos = -imageWidth;
                        const endPos = -stopDistance;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      } else if (hackerAnimation.phase === 'visible') {
                        // Se mantiene quieto en la posición de parada
                        return `${-stopDistance}px`;
                      } else {
                        // Retrocede hacia fuera derecha
                        const progress = (Date.now() - hackerAnimation.start) / 800;
                        const startPos = -stopDistance;
                        const endPos = -imageWidth;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      }
                    })(),
                    width: '300px',
                    height: '300px',
                    transition: 'none',
                    filter: 'drop-shadow(0 0 20px rgba(255, 69, 0, 0.9))' // Efecto de resplandor rojo/naranja
                  }}
                >
                  <img 
                    src="/assets/collectibles/pay_tariffs.png" 
                    alt="Pay Tariffs!" 
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      animation: hackerAnimation.phase === 'visible' 
                        ? 'pulse 0.7s infinite alternate'
                        : 'none'
                    }}
                  />
                </div>
              )}
              
              {/* Render canvas only when size is determined */}
              {canvasSize.width > 0 && canvasSize.height > 0 && (
                <GameCanvas
                  gameState={gameState}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  energyCollectedFlag={energyCollectedFlag}
                  damageFlag={damageFlag}
                />
              )}
              
              {/* Mensaje de pausa como overlay sobre el grid */}
              {gameState.status === 'paused' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm">
                  <h2 className="text-3xl font-bold text-primary mb-2 font-pixellari text-shadow-glow">PAUSED</h2>
                  <p className="text-xl text-primary font-pixellari text-shadow">Press P to Resume</p>
                  <p className="text-sm text-primary/70 font-pixellari text-shadow mt-2">Game auto-pauses when switching tabs</p>
                </div>
              )}
            </div>
            
            {/* Botones principales */}
            <div className="flex space-x-8 mb-3 justify-center">
              <button 
                onClick={handleStartPauseClick} 
                className="focus:outline-none game-button"
                aria-label={gameState.status === 'playing' ? 'Pause' : gameState.status === 'paused' ? 'Resume' : 'Start'}
              >
                <Image 
                  src={gameState.status === 'playing' 
                    ? "/assets/ui/buttons/pause-button.png" 
                    : "/assets/ui/buttons/play-button.png"}
                  alt={gameState.status === 'playing' ? "Pause" : "Play"} 
                  width={120} 
                  height={50}
                  className="game-img"
                />
              </button>
              <button 
                onClick={handleResetClick} 
                className="focus:outline-none game-button"
                aria-label="Reset game"
              >
                <Image 
                  src="/assets/ui/buttons/reset-button.png" 
                  alt="Reset" 
                  width={120} 
                  height={50}
                  className="game-img"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de información - Siempre disponible */}
      <InfoModal 
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        onPlaySound={playSound}
      />

      {/* Botones de control - Esquina inferior derecha - Siempre visibles */}
      <div 
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        style={{ transform: `scale(${scale})`, transformOrigin: 'bottom right' }}
      >
        {/* Botón de música */}
        <button 
          onClick={handleMusicToggle} 
          className="focus:outline-none game-button"
          aria-label={musicEnabled ? 'Disable music' : 'Enable music'}
        >
          <Image 
            src={musicEnabled 
              ? "/assets/ui/buttons/music_on.png" 
              : "/assets/ui/buttons/music_off.png"}
            alt={musicEnabled ? "Music On" : "Music Off"} 
            width={50} 
            height={50}
            className="game-img"
          />
        </button>

        {/* Botón de sonidos */}
        <button 
          onClick={handleSoundsToggle} 
          className="focus:outline-none game-button"
          aria-label={soundsEnabled ? 'Disable sounds' : 'Enable sounds'}
        >
          <Image 
            src={soundsEnabled 
              ? "/assets/ui/buttons/sounds_on.png" 
              : "/assets/ui/buttons/sounds_off.png"}
            alt={soundsEnabled ? "Sounds On" : "Sounds Off"} 
            width={50} 
            height={50}
            className="game-img"
          />
        </button>

        {/* Botón de información */}
        <button 
          onClick={handleInfoToggle} 
          className="focus:outline-none game-button"
          aria-label="Información del juego"
        >
          <Image 
            src="/assets/ui/buttons/button_info.png"
            alt="Información" 
            width={50} 
            height={50}
            className="game-img"
          />
        </button>
      </div>
    </div>
  );
};

export default GameContainer;
