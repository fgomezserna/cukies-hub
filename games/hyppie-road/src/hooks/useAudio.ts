import { useRef, useCallback, useEffect } from 'react';

// Tipos de sonidos disponibles
export type SoundType = 
  | 'button_click'
  | 'fall_hole'
  | 'gameover_road'
  | 'victory_road'
  | 'background_music';

// Configuración de cada sonido
const SOUND_CONFIG: Record<SoundType, { 
  path: string; 
  volume: number; 
  loop?: boolean;
  category: 'effect' | 'music' | 'ui';
}> = {
  // UI
  button_click: { path: '/assets/sounds/button-click-01.mp3', volume: 0.5, category: 'ui' },
  // Effects
  fall_hole: { path: '/assets/sounds/fall-hole.mp3', volume: 0.7, category: 'effect' },
  // Music
  gameover_road: { path: '/assets/sounds/gameover-road.mp3', volume: 0.6, category: 'music' },
  victory_road: { path: '/assets/sounds/victory-road.mp3', volume: 0.6, category: 'music' },
  background_music: { path: '/assets/sounds/Peter Gresser - Skipping in the No Standing Zone.mp3', volume: 0.3, loop: true, category: 'music' },
};

export const useAudio = () => {
  // Refs para almacenar las instancias de Audio
  const audioInstancesRef = useRef<Map<SoundType, HTMLAudioElement>>(new Map());
  const currentMusicRef = useRef<SoundType | null>(null);
  const musicEnabledRef = useRef<boolean>(true); // Control de música activada/desactivada
  const soundsEnabledRef = useRef<boolean>(true); // Control de sonidos de efectos activado/desactivado
  
  // Estados de volumen por categoría
  const volumeSettingsRef = useRef({
    master: 1.0,
    effect: 1.0,
    music: 1.0,
    ui: 1.0,
  });

  // Precargar todos los sonidos (SIN AUTOPLAY)
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
        } catch (error) {
          console.warn(`⚠️ Error cargando audio ${soundType}:`, error);
        }
      }
      
      console.log('🎵 Sistema de audio inicializado (sin autoplay)');
    };

    loadAudio();

    // Cleanup
    return () => {
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
    
    // Si es música y está desactivada, no reproducir (excepto gameover_road)
    if (soundConfig.category === 'music' && !musicEnabledRef.current && soundType !== 'gameover_road') {
      console.log(`🔇 Música desactivada, no reproduciendo: ${soundType}`);
      return;
    }

    // Si son sonidos de efectos/UI y están desactivados, no reproducir
    if ((soundConfig.category === 'effect' || soundConfig.category === 'ui') && !soundsEnabledRef.current) {
      console.log(`🔇 Sonidos de efectos desactivados, no reproduciendo: ${soundType}`);
      return;
    }

    try {
      // Reiniciar si está especificado o si es un efecto de sonido
      if (options?.restart || soundConfig.category === 'effect') {
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
    } catch (error) {
      console.warn(`⚠️ Error en playSound para ${soundType}:`, error);
    }
  }, []);

  // Función para reproducir música de fondo
  const playBackgroundMusic = useCallback(() => {
    if (!musicEnabledRef.current) {
      console.log('🔇 Música desactivada, no iniciando música de fondo');
      return;
    }

    // Si ya hay música de fondo reproduciéndose, no hacer nada
    if (currentMusicRef.current === 'background_music') {
      const currentMusic = audioInstancesRef.current.get('background_music');
      if (currentMusic && !currentMusic.paused && currentMusic.currentTime > 0) {
        console.log('🎵 Música de fondo ya está reproduciéndose');
        return;
      }
    }

    // Detener cualquier música actual
    if (currentMusicRef.current) {
      const currentMusic = audioInstancesRef.current.get(currentMusicRef.current);
      if (currentMusic) {
        currentMusic.pause();
        currentMusic.currentTime = 0;
        currentMusic.onended = null;
      }
    }

    // Reproducir música de fondo
    const audio = audioInstancesRef.current.get('background_music');
    if (audio) {
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log('✅ Música de fondo iniciada');
          currentMusicRef.current = 'background_music';
        }).catch(error => {
          console.warn('⚠️ Error iniciando música de fondo:', error);
        });
      }
    }
  }, []);

  // Función para reproducir música específica (detiene la música anterior)
  const playMusic = useCallback((musicType: SoundType) => {
    // Si la música está desactivada, no reproducir
    if (!musicEnabledRef.current) {
      console.log(`🔇 Música desactivada, no reproduciendo: ${musicType}`);
      return;
    }
    
    // Si es música de fondo, usar la función específica
    if (musicType === 'background_music') {
      playBackgroundMusic();
      return;
    }
    
    // Detener música actual si existe
    if (currentMusicRef.current) {
      const currentMusic = audioInstancesRef.current.get(currentMusicRef.current);
      if (currentMusic) {
        currentMusic.pause();
        currentMusic.currentTime = 0;
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

  // Función para hacer pause/resume de la música (LÓGICA DE SYBIL-SLAYER)
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

  // Función para activar/desactivar sonidos
  const toggleSounds = useCallback(() => {
    soundsEnabledRef.current = !soundsEnabledRef.current;
    console.log(`🔊 Sonidos ${soundsEnabledRef.current ? 'activados' : 'desactivados'}`);
    return soundsEnabledRef.current;
  }, []);

  // Función para obtener el estado de la música
  const isMusicEnabled = useCallback(() => {
    return musicEnabledRef.current;
  }, []);

  // Función para obtener el estado de los sonidos
  const getSoundsEnabled = useCallback(() => {
    return soundsEnabledRef.current;
  }, []);

  // Función de debug para verificar estado de audio
  const debugAudioState = useCallback(() => {
    console.log('🔍 DEBUG AUDIO STATE:');
    console.log(`  Music enabled: ${musicEnabledRef.current}`);
    console.log(`  Sounds enabled: ${soundsEnabledRef.current}`);
    console.log(`  Current music ref: ${currentMusicRef.current}`);
    
    // Verificar estado de audios en el hook
    const musicSounds: SoundType[] = ['background_music', 'gameover_road', 'victory_road'];
    musicSounds.forEach(musicType => {
      const audio = audioInstancesRef.current.get(musicType);
      if (audio) {
        console.log(`  ${musicType}: paused=${audio.paused}, time=${audio.currentTime.toFixed(2)}s`);
      } else {
        console.log(`  ${musicType}: NOT FOUND`);
      }
    });
  }, []);

  return {
    playSound,
    playMusic,
    playBackgroundMusic,
    stopMusic,
    toggleMusic,
    toggleSounds,
    isMusicEnabled,
    getSoundsEnabled,
    debugAudioState,
    currentMusic: currentMusicRef.current,
  };
}; 