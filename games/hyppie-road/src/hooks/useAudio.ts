import { useRef, useCallback, useEffect } from 'react';

// Tipos de sonidos disponibles
export type SoundType = 
  | 'button_click';

// Configuración de cada sonido
const SOUND_CONFIG: Record<SoundType, { 
  path: string; 
  volume: number; 
  loop?: boolean;
  category: 'effect' | 'music' | 'ui';
}> = {
  // UI
  button_click: { path: '/assets/sounds/button-click-01.mp3', volume: 0.5, category: 'ui' },
};

export const useAudio = () => {
  // Refs para almacenar las instancias de Audio
  const audioInstancesRef = useRef<Map<SoundType, HTMLAudioElement>>(new Map());
  const soundsEnabledRef = useRef<boolean>(true);
  
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
    
    // Si están desactivados los sonidos, no reproducir
    if (!soundsEnabledRef.current) {
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

  // Función para activar/desactivar sonidos
  const toggleSounds = useCallback(() => {
    soundsEnabledRef.current = !soundsEnabledRef.current;
    console.log(`🔊 Sonidos ${soundsEnabledRef.current ? 'activados' : 'desactivados'}`);
    return soundsEnabledRef.current;
  }, []);

  // Función para obtener el estado de los sonidos
  const getSoundsEnabled = useCallback(() => {
    return soundsEnabledRef.current;
  }, []);

  return {
    playSound,
    toggleSounds,
    getSoundsEnabled,
  };
}; 