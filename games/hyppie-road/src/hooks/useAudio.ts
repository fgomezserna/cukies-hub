import { useRef, useCallback, useEffect } from 'react';

// Tipos de sonidos disponibles
export type SoundType = 
  | 'button_click'
  | 'fall_hole'
  | 'gameover_road'
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
  background_music: { path: '/assets/sounds/Peter Gresser - Skipping in the No Standing Zone.mp3', volume: 0.3, loop: true, category: 'music' },
};

export const useAudio = () => {
  // Refs para almacenar las instancias de Audio
  const audioInstancesRef = useRef<Map<SoundType, HTMLAudioElement>>(new Map());
  const soundsEnabledRef = useRef<boolean>(true);
  const musicEnabledRef = useRef<boolean>(true);
  const currentMusicRef = useRef<SoundType | null>(null);
  
  // Estados de volumen por categoría
  const volumeSettingsRef = useRef({
    master: 1.0,
    effect: 1.0,
    music: 1.0,
    ui: 1.0,
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
        } catch (error) {
          console.warn(`⚠️ Error cargando audio ${soundType}:`, error);
        }
      }
      
      console.log('🎵 Sistema de audio inicializado');
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

    // Si son sonidos de efectos y están desactivados, no reproducir
    if ((soundConfig.category === 'effect' || soundConfig.category === 'ui') && !soundsEnabledRef.current) {
      console.log(`🔇 Sonidos desactivados, no reproduciendo: ${soundType}`);
      return;
    }

    try {
      // Reiniciar si está especificado o si es un efecto de sonido
      if (options?.restart || SOUND_CONFIG[soundType].category === 'effect' || SOUND_CONFIG[soundType].category === 'ui') {
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
      console.warn(`⚠️ Error reproduciendo ${soundType}:`, error);
    }
  }, []);

  // Función para reproducir música de fondo
  const playBackgroundMusic = useCallback(() => {
    if (!musicEnabledRef.current) {
      console.log('🔇 Música desactivada, no reproduciendo música de fondo');
      return;
    }

    console.log('🎵 Iniciando música de fondo: Peter Gresser');
    playSound('background_music');
    currentMusicRef.current = 'background_music';
  }, [playSound]);

  // Función para reproducir música específica
  const playMusic = useCallback((musicType: SoundType) => {
    if (!musicEnabledRef.current && musicType !== 'gameover_road') {
      console.log(`🔇 Música desactivada, no reproduciendo: ${musicType}`);
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
  }, [playSound]);

  // Función para detener toda la música
  const stopMusic = useCallback(() => {
    console.log('🔇 INICIANDO stopMusic() - Deteniendo toda la música...');
    
    // Detener todas las categorías de música, no solo currentMusicRef
    const musicSounds: SoundType[] = ['background_music', 'gameover_road'];
    let stoppedCount = 0;
    
    musicSounds.forEach(musicType => {
      const audio = audioInstancesRef.current.get(musicType);
      if (audio) {
        console.log(`🎵 Revisando ${musicType}: paused=${audio.paused}, currentTime=${audio.currentTime.toFixed(2)}s`);
        if (!audio.paused) {
          audio.pause();
          audio.currentTime = 0;
          audio.onended = null;
          stoppedCount++;
          console.log(`🔇 ✅ Música detenida: ${musicType}`);
        } else {
          console.log(`🔇 ⏸️ ${musicType} ya estaba pausada`);
        }
      } else {
        console.log(`🔇 ❌ Audio ${musicType} no encontrado`);
      }
    });
    
    // Limpiar la referencia actual
    console.log(`🔇 currentMusicRef.current antes: ${currentMusicRef.current}`);
    currentMusicRef.current = null;
    console.log(`🔇 FINALIZANDO stopMusic() - Detenidas ${stoppedCount} pistas. currentMusicRef limpiado.`);
  }, []);

  // Función para activar/desactivar música
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
      console.log('🔇 Música desactivada');
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

  return {
    playSound,
    playMusic,
    playBackgroundMusic,
    stopMusic,
    toggleMusic,
    toggleSounds,
    isMusicEnabled,
    getSoundsEnabled,
    currentMusic: currentMusicRef.current,
  };
}; 