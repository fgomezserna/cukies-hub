'use client';

import React, { useState, useEffect } from 'react';
import { useAudio } from '@/hooks/useAudio';

export function AudioControls() {
  const { toggleMusic, toggleSounds, isMusicEnabled, getSoundsEnabled, playSound } = useAudio();
  const [musicEnabled, setMusicEnabled] = useState(true); // EMPEZAR como true (igual que sybil-slayer)
  const [soundsEnabled, setSoundsEnabled] = useState(true);

  // Sincronizar estado continuamente con el hook de audio
  useEffect(() => {
    const interval = setInterval(() => {
      const currentMusicState = isMusicEnabled();
      const currentSoundsState = getSoundsEnabled();
      
      if (currentMusicState !== musicEnabled) {
        setMusicEnabled(currentMusicState);
        console.log(`🎵 AudioControls: Estado música sincronizado a ${currentMusicState}`);
      }
      if (currentSoundsState !== soundsEnabled) {
        setSoundsEnabled(currentSoundsState);
        console.log(`🔊 AudioControls: Estado sonidos sincronizado a ${currentSoundsState}`);
      }
    }, 100); // Verificar cada 100ms

    return () => clearInterval(interval);
  }, [isMusicEnabled, getSoundsEnabled, musicEnabled, soundsEnabled]);

  const handleMusicToggle = () => {
    console.log('🎵 BOTÓN MÚSICA CLICKEADO - Estado actual:', musicEnabled);
    
    // Reproducir sonido del botón SOLO si los sonidos están activados
    if (soundsEnabled) {
      try {
        playSound('button_click');
      } catch (error) {
        console.error('❌ Error reproduciendo sonido del botón:', error);
      }
    }
    
    // Ejecutar toggle
    try {
      const newState = toggleMusic();
      console.log('🎵 BOTÓN MÚSICA - Estado después del toggle:', newState);
      setMusicEnabled(newState);
    } catch (error) {
      console.error('❌ Error en toggleMusic:', error);
    }
  };

  const handleSoundsToggle = () => {
    console.log('🔊 handleSoundsToggle - Estado antes:', soundsEnabled);
    
    // Reproducir sonido del botón antes de cambiar el estado
    playSound('button_click');
    
    const newState = toggleSounds();
    console.log('🔊 handleSoundsToggle - Nuevo estado:', newState);
    setSoundsEnabled(newState);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {/* Botón de música */}
      <button 
        onClick={handleMusicToggle} 
        className="w-12 h-12 bg-black/60 hover:bg-black/80 border-2 border-white/30 rounded-lg backdrop-blur-sm transition-all hover:scale-110 flex items-center justify-center"
        aria-label={musicEnabled ? 'Disable music' : 'Enable music'}
        title={musicEnabled ? 'Desactivar música' : 'Activar música'}
      >
        <span className="text-2xl">
          {musicEnabled ? '🎵' : '🔇'}
        </span>
      </button>

      {/* Botón de sonidos */}
      <button 
        onClick={handleSoundsToggle} 
        className="w-12 h-12 bg-black/60 hover:bg-black/80 border-2 border-white/30 rounded-lg backdrop-blur-sm transition-all hover:scale-110 flex items-center justify-center"
        aria-label={soundsEnabled ? 'Disable sounds' : 'Enable sounds'}
        title={soundsEnabled ? 'Desactivar sonidos' : 'Activar sonidos'}
      >
        <span className="text-2xl">
          {soundsEnabled ? '🔊' : '🔈'}
        </span>
      </button>
    </div>
  );
} 