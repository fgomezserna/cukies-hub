import { useRef, useCallback, useEffect } from 'react';

// Tipos de sonidos disponibles
export type SoundType = 
  // Effects
  | 'energy_collect'
  | 'mega_node_collect' 
  | 'purr_collect'
  | 'vaul_collect'
  | 'checkpoint_collect'
  | 'checkpoint'
  | 'heart_collect'
  | 'life'
  | 'collision_damage'
  | 'auch'
  | 'bug_collision'
  | 'hacker_collision'
  | 'hacker_escape' // NUEVO: Cuando hacker recoge 5 energy y escapa
  | 'level_up'
  // UI
  | 'button_click'
  | 'game_start'
  | 'pause'
  | 'resume'
  // Voice
  | 'jeff_goit'
  | 'whale_chad'
  // Music
  | 'background_music'
  | 'background_music_alt'
  | 'frenzy_mode'
  | 'game_over';

// Configuración de cada sonido
const SOUND_CONFIG: Record<SoundType, { 
  path: string; 
  volume: number; 
  loop?: boolean;
  category: 'effect' | 'music' | 'ui' | 'voice';
}> = {
  // Effects
  energy_collect: { path: '/assets/sounds/effects/coin.mp3', volume: 0.6, category: 'effect' },
  mega_node_collect: { path: '/assets/sounds/effects/power_up.mp3', volume: 0.7, category: 'effect' },
  purr_collect: { path: '/assets/sounds/effects/meow-4.mp3', volume: 0.8, category: 'effect' },
  vaul_collect: { path: '/assets/sounds/effects/vaul_collect.mp3', volume: 0.8, category: 'effect' },
  checkpoint_collect: { path: '/assets/sounds/effects/checkpoint_collect.mp3', volume: 0.7, category: 'effect' },
  checkpoint: { path: '/assets/sounds/effects/checkpoint.mp3', volume: 0.8, category: 'effect' },
  heart_collect: { path: '/assets/sounds/effects/life.mp3', volume: 0.8, category: 'effect' },
  life: { path: '/assets/sounds/effects/life.wav', volume: 0.8, category: 'effect' },
  collision_damage: { path: '/assets/sounds/effects/collision_damage.mp3', volume: 0.5, category: 'effect' },
  auch: { path: '/assets/sounds/effects/auch.mp3', volume: 0.7, category: 'effect' },
  bug_collision: { path: '/assets/sounds/effects/bug_collision.mp3', volume: 0.8, category: 'effect' },
  hacker_collision: { path: '/assets/sounds/effects/voice_trump.mp3', volume: 0.7, category: 'voice' },
  hacker_escape: { path: '/assets/sounds/effects/voice_trump.mp3', volume: 0.8, category: 'voice' }, // NUEVO: Mismo sonido pero diferente evento
  level_up: { path: '/assets/sounds/effects/level_up.mp3', volume: 0.7, category: 'effect' },
  
  // UI
  button_click: { path: '/assets/sounds/ui/button-click-01.mp3', volume: 0.5, category: 'ui' },
  game_start: { path: '/assets/sounds/ui/game_start.mp3', volume: 0.6, category: 'ui' },
  pause: { path: '/assets/sounds/ui/pause.mp3', volume: 0.5, category: 'ui' },
  resume: { path: '/assets/sounds/ui/resume.mp3', volume: 0.5, category: 'ui' },
  
  // Voice
  jeff_goit: { path: '/assets/sounds/voice/jeff_goit.mp3', volume: 0.8, category: 'voice' },
  whale_chad: { path: '/assets/sounds/voice/whale_chad.mp3', volume: 0.8, category: 'voice' },
  
  // Music
  background_music: { path: '/assets/sounds/music/HoliznaCC0 - Game BOI 4.mp3', volume: 0.2, loop: true, category: 'music' },
  background_music_alt: { path: '/assets/sounds/music/HoliznaCC0 - Track 1.mp3', volume: 0.2, loop: true, category: 'music' },
  frenzy_mode: { path: '/assets/sounds/music/frenzy_mode.mp3', volume: 0.4, loop: true, category: 'music' },
  game_over: { path: '/assets/sounds/music/game_over.wav', volume: 0.6, category: 'music' },
};

export const useAudio = () => {
  // Refs para almacenar las instancias de Audio
  const audioInstancesRef = useRef<Map<SoundType, HTMLAudioElement>>(new Map());
  const currentMusicRef = useRef<SoundType | null>(null);
  const musicAlternateRef = useRef<boolean>(false); // Para alternar entre las dos canciones
  const musicEnabledRef = useRef<boolean>(true); // Control de música activada/desactivada
  const soundsEnabledRef = useRef<boolean>(true); // NUEVO: Control de sonidos de efectos activado/desactivado
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null); // Para el fade-out
  const originalVolumeRef = useRef<number>(0.2); // Volumen original de la música
  
  // Estados de volumen por categoría
  const volumeSettingsRef = useRef({
    master: 1.0,
    effect: 1.0,
    music: 1.0,
    ui: 1.0,
    voice: 1.0,
  });

  // Precargar todos los sonidos
  useEffect(() => {
    const loadAudio = async () => {
      console.log('🔊 Precargando archivos de audio...');
      
      for (const [soundType, config] of Object.entries(SOUND_CONFIG)) {
        try {
          const audio = new Audio(config.path);
          audio.volume = config.volume * volumeSettingsRef.current[config.category] * volumeSettingsRef.current.master;
          audio.loop = config.loop || false;
          
          // Precargar el audio
          audio.preload = 'auto';
          
          audioInstancesRef.current.set(soundType as SoundType, audio);
          console.log(`✅ Audio cargado: ${soundType}`);
          if (soundType === 'purr_collect') {
            console.log(`🐱 PURR_COLLECT específicamente cargado con volumen: ${audio.volume}`);
          }
          if (soundType === 'hacker_collision') {
            console.log(`🗣️ HACKER_COLLISION (voice_trump) específicamente cargado con volumen: ${audio.volume}, path: ${config.path}`);
          }
          if (soundType === 'heart_collect') {
            console.log(`❤️ HEART_COLLECT (life.mp3) específicamente cargado con volumen: ${audio.volume}, path: ${config.path}`);
          }
        } catch (error) {
          console.warn(`⚠️ Error cargando audio ${soundType}:`, error);
        }
      }
      
      console.log('🎵 Sistema de audio inicializado');
    };

    loadAudio();

    // Cleanup
    return () => {
      // Limpiar fade-out
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      
      // Limpiar todas las instancias de audio
      audioInstancesRef.current.forEach(audio => {
        audio.pause();
        audio.onended = null;
        audio.ontimeupdate = null;
        audio.onloadedmetadata = null;
        audio.src = '';
      });
      audioInstancesRef.current.clear();
    };
  }, []);

  // Función para reproducir un sonido
  const playSound = useCallback((soundType: SoundType, options?: { 
    volume?: number; 
    playbackRate?: number;
    restart?: boolean;
  }) => {
    const audio = audioInstancesRef.current.get(soundType);
    if (!audio) {
      console.warn(`⚠️ Audio no encontrado: ${soundType}`);
      return;
    }

    const soundConfig = SOUND_CONFIG[soundType];
    
    // Si es música y está desactivada, no reproducir (excepto game_over)
    if (soundConfig.category === 'music' && !musicEnabledRef.current && soundType !== 'game_over') {
      console.log(`🔇 Música desactivada, no reproduciendo: ${soundType}`);
      return;
    }

    // NUEVO: Si son sonidos de efectos y están desactivados, no reproducir
    if ((soundConfig.category === 'effect' || soundConfig.category === 'ui' || soundConfig.category === 'voice') && !soundsEnabledRef.current) {
      console.log(`🔇 Sonidos de efectos desactivados, no reproduciendo: ${soundType}`);
      return;
    }

    try {
      // Reiniciar si está especificado o si es un efecto de sonido
      if (options?.restart || SOUND_CONFIG[soundType].category === 'effect') {
        audio.currentTime = 0;
      }

      // Aplicar configuraciones opcionales
      if (options?.volume !== undefined) {
        audio.volume = options.volume;
      }
      if (options?.playbackRate !== undefined) {
        audio.playbackRate = options.playbackRate;
      }

      // Reproducir
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn(`⚠️ Error reproduciendo ${soundType}:`, error);
        });
      }

      console.log(`🔊 Reproduciendo: ${soundType}`);
      if (soundType === 'purr_collect') {
        console.log(`🐱 PURR_COLLECT reproducido exitosamente con volumen: ${audio.volume}`);
      }
      if (soundType === 'hacker_collision') {
        console.log(`🗣️ HACKER_COLLISION (voice_trump) reproducido exitosamente con volumen: ${audio.volume}, path: ${SOUND_CONFIG[soundType].path}`);
      }
      if (soundType === 'heart_collect') {
        console.log(`❤️ HEART_COLLECT (life.mp3) reproducido exitosamente con volumen: ${audio.volume}, path: ${SOUND_CONFIG[soundType].path}`);
      }
    } catch (error) {
      console.warn(`⚠️ Error al reproducir ${soundType}:`, error);
    }
  }, []);

  // Función para aplicar fade-out en los últimos 5 segundos
  const startFadeOut = useCallback((audio: HTMLAudioElement, duration: number) => {
    const fadeStartTime = duration - 5; // Empezar fade-out 5 segundos antes del final
    const fadeSteps = 50; // Número de pasos para suavizar el fade
    const fadeInterval = 100; // Intervalo en ms entre pasos (5000ms / 50 = 100ms)
    
    // Limpiar cualquier fade anterior
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    
    const checkTime = () => {
      const currentTime = audio.currentTime;
      const timeRemaining = duration - currentTime;
      
      if (timeRemaining <= 5 && timeRemaining > 0) {
        // Calcular el volumen basado en el tiempo restante (fade-out lineal)
        const fadeProgress = (5 - timeRemaining) / 5; // 0 = inicio del fade, 1 = final
        const targetVolume = originalVolumeRef.current * (1 - fadeProgress);
        audio.volume = Math.max(0, targetVolume);
        
        console.log(`🎵 Fade-out: ${timeRemaining.toFixed(1)}s restantes, volumen: ${(audio.volume * 100).toFixed(0)}%`);
      }
    };
    
    // Monitorear el tiempo cada 100ms
    fadeIntervalRef.current = setInterval(checkTime, fadeInterval);
  }, []);

  // Función para reproducir música de fondo con alternancia mejorada
  const playBackgroundMusic = useCallback(() => {
    // Si la música está desactivada, no reproducir
    if (!musicEnabledRef.current) {
      console.log(`🔇 Música de fondo desactivada`);
      return;
    }
    
    // Limpiar fade anterior si existe
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    
    // Alternar entre las dos canciones
    const musicToPlay = musicAlternateRef.current ? 'background_music_alt' : 'background_music';
    musicAlternateRef.current = !musicAlternateRef.current; // Cambiar para la próxima vez
    
    // Detener música actual si existe
    if (currentMusicRef.current) {
      const currentMusic = audioInstancesRef.current.get(currentMusicRef.current);
      if (currentMusic) {
        currentMusic.pause();
        currentMusic.currentTime = 0;
        currentMusic.onended = null;
        currentMusic.ontimeupdate = null; // Limpiar eventos de tiempo
      }
    }

    // Reproducir nueva música
    const audio = audioInstancesRef.current.get(musicToPlay);
    if (audio) {
      // Restaurar volumen original
      const musicConfig = SOUND_CONFIG[musicToPlay];
      originalVolumeRef.current = musicConfig.volume * 
        volumeSettingsRef.current[musicConfig.category] * 
        volumeSettingsRef.current.master;
      audio.volume = originalVolumeRef.current;
      
      // Configurar eventos para monitoreo de duración
      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        console.log(`🎵 Duración de ${musicToPlay}: ${duration.toFixed(1)}s`);
        
        // Iniciar fade-out si la canción es lo suficientemente larga
        if (duration > 10) { // Solo aplicar fade-out si la canción dura más de 10 segundos
          startFadeOut(audio, duration);
        }
      };
      
      // Configurar evento para cuando termine la canción
      audio.onended = () => {
        console.log(`🎵 Canción completada: ${musicToPlay}, duración total reproducida`);
        
        // Limpiar fade
        if (fadeIntervalRef.current) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
        }
        
        // Reproducir la siguiente canción automáticamente
        playBackgroundMusic();
      };
      
      // Configurar el audio y reproducir
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn(`⚠️ Error reproduciendo ${musicToPlay}:`, error);
        });
      }
      
      currentMusicRef.current = musicToPlay;
      console.log(`🎵 Iniciando reproducción completa: ${musicToPlay}`);
    }
  }, [startFadeOut]);

  // Función para reproducir música (detiene la música anterior)
  const playMusic = useCallback((musicType: SoundType) => {
    // Si la música está desactivada, no reproducir
    if (!musicEnabledRef.current) {
      console.log(`🔇 Música desactivada, no reproduciendo: ${musicType}`);
      return;
    }
    
    // Si es música de fondo, verificar si ya está reproduciéndose o pausada
    if (musicType === 'background_music') {
      // CORREGIDO: Solo iniciar música de fondo si no hay música reproduciéndose
      if (currentMusicRef.current && 
          (currentMusicRef.current === 'background_music' || currentMusicRef.current === 'background_music_alt')) {
        const currentMusic = audioInstancesRef.current.get(currentMusicRef.current);
        
        // Si está pausada, reanudar en lugar de reiniciar
        if (currentMusic && currentMusic.paused && currentMusic.currentTime > 0) {
          const playPromise = currentMusic.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.warn(`⚠️ Error reanudando ${currentMusicRef.current}:`, error);
            });
          }
          console.log(`▶️ Reanudando música pausada: ${currentMusicRef.current} (desde tiempo: ${currentMusic.currentTime.toFixed(2)}s)`);
          return;
        }
        
        // Si ya está reproduciéndose, no hacer nada
        if (currentMusic && !currentMusic.paused && !currentMusic.ended && currentMusic.currentTime > 0) {
          console.log(`🎵 Música de fondo ya está reproduciéndose: ${currentMusicRef.current} (tiempo: ${currentMusic.currentTime.toFixed(2)}s)`);
          return;
        }
      }
      
      console.log(`🎵 Iniciando nueva sesión de música de fondo`);
      playBackgroundMusic();
      return;
    }
    
    // Detener música actual si existe
    if (currentMusicRef.current) {
      const currentMusic = audioInstancesRef.current.get(currentMusicRef.current);
      if (currentMusic) {
        currentMusic.pause();
        currentMusic.currentTime = 0;
        // Limpiar el evento onended si existe
        currentMusic.onended = null;
      }
    }

    // Reproducir nueva música
    playSound(musicType);
    currentMusicRef.current = musicType;
    console.log(`🎵 Música cambiada a: ${musicType}`);
  }, [playSound, playBackgroundMusic]);

  // Función para detener un sonido específico
  const stopSound = useCallback((soundType: SoundType) => {
    const audio = audioInstancesRef.current.get(soundType);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      console.log(`⏹️ Detenido: ${soundType}`);
    }
  }, []);

  // Función para detener toda la música
  const stopMusic = useCallback(() => {
    // Limpiar fade-out si está activo
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    
    if (currentMusicRef.current) {
      const currentMusic = audioInstancesRef.current.get(currentMusicRef.current);
      if (currentMusic) {
        currentMusic.onended = null;
        currentMusic.ontimeupdate = null;
        currentMusic.onloadedmetadata = null;
      }
      stopSound(currentMusicRef.current);
      currentMusicRef.current = null;
      console.log('🎵 Música detenida');
    }
  }, [stopSound]);

  // Función especial para reproducir sonido de game over
  // Se reproduce independientemente del control de música y puede cortar la música actual
  const playGameOverSound = useCallback(() => {
    console.log('💀 Reproduciendo sonido de Game Over (independiente del control de música)');
    
    // Limpiar fade-out si está activo
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    
    // Detener cualquier música actual
    if (currentMusicRef.current) {
      const currentMusic = audioInstancesRef.current.get(currentMusicRef.current);
      if (currentMusic) {
        currentMusic.pause();
        currentMusic.currentTime = 0;
        currentMusic.onended = null;
        currentMusic.ontimeupdate = null;
        currentMusic.onloadedmetadata = null;
      }
    }
    
    // Reproducir game over directamente con playSound (no afectado por musicEnabled)
    const audio = audioInstancesRef.current.get('game_over');
    if (audio) {
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn(`⚠️ Error reproduciendo game_over:`, error);
        });
      }
      currentMusicRef.current = 'game_over';
      console.log('💀 Sonido de Game Over reproducido exitosamente');
    } else {
      console.warn('⚠️ Audio de game_over no encontrado');
    }
  }, []);

  // Función para ajustar volumen por categoría
  const setVolume = useCallback((category: keyof typeof volumeSettingsRef.current, volume: number) => {
    volumeSettingsRef.current[category] = Math.max(0, Math.min(1, volume));
    
    // Actualizar volumen de todos los audios de esa categoría
    audioInstancesRef.current.forEach((audio, soundType) => {
      const config = SOUND_CONFIG[soundType];
      if (config.category === category || category === 'master') {
        audio.volume = config.volume * 
          volumeSettingsRef.current[config.category] * 
          volumeSettingsRef.current.master;
      }
    });
    
    console.log(`🔊 Volumen ${category} ajustado a: ${volume}`);
  }, []);

  // Función para obtener el volumen actual
  const getVolume = useCallback((category: keyof typeof volumeSettingsRef.current) => {
    return volumeSettingsRef.current[category];
  }, []);

  // Función para hacer pause/resume de la música
  const toggleMusic = useCallback(() => {
    musicEnabledRef.current = !musicEnabledRef.current;
    
    if (!musicEnabledRef.current) {
      // Si se desactiva, pausar música actual (sin resetear)
      if (currentMusicRef.current) {
        const currentMusic = audioInstancesRef.current.get(currentMusicRef.current);
        if (currentMusic && !currentMusic.paused) {
          currentMusic.pause();
          console.log(`⏸️ Música pausada: ${currentMusicRef.current} (tiempo: ${currentMusic.currentTime.toFixed(2)}s)`);
        }
      }
      console.log('🔇 Música pausada');
    } else {
      // Si se activa, reanudar música desde donde se quedó
      if (currentMusicRef.current) {
        const currentMusic = audioInstancesRef.current.get(currentMusicRef.current);
        if (currentMusic && currentMusic.paused && currentMusic.currentTime > 0) {
          const playPromise = currentMusic.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.warn(`⚠️ Error reanudando ${currentMusicRef.current}:`, error);
            });
          }
          console.log(`▶️ Música reanudada: ${currentMusicRef.current} (desde tiempo: ${currentMusic.currentTime.toFixed(2)}s)`);
        } else {
          // Si no hay música o se perdió, iniciar música de fondo
          console.log('🔊 No hay música pausada, iniciando música de fondo');
          playBackgroundMusic();
        }
      } else {
        // Si no hay música actual, iniciar música de fondo
        console.log('🔊 Música activada, iniciando música de fondo');
        playBackgroundMusic();
      }
    }
    
    return musicEnabledRef.current;
  }, [playBackgroundMusic]);

  // Función para obtener el estado actual de la música
  const isMusicEnabled = useCallback(() => {
    return musicEnabledRef.current;
  }, []);

  // NUEVO: Función para hacer toggle de los sonidos de efectos
  const toggleSounds = useCallback(() => {
    soundsEnabledRef.current = !soundsEnabledRef.current;
    
    if (!soundsEnabledRef.current) {
      console.log('🔇 Sonidos de efectos desactivados');
    } else {
      console.log('🔊 Sonidos de efectos activados');
    }
    
    return soundsEnabledRef.current;
  }, []);

  // NUEVO: Función para obtener el estado actual de los sonidos
  const isSoundsEnabled = useCallback(() => {
    return soundsEnabledRef.current;
  }, []);

  return {
    playSound,
    playMusic,
    stopSound,
    stopMusic,
    setVolume,
    getVolume,
    toggleMusic,
    isMusicEnabled,
    currentMusic: currentMusicRef.current,
    playGameOverSound,
    // NUEVO: Funciones para control de sonidos de efectos
    toggleSounds,
    isSoundsEnabled,
  };
}; 