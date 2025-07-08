'use client';

import React, { useState, useEffect } from 'react';
import { useAudio } from '@/hooks/useAudio';

export function AudioControls() {
  const { toggleMusic, toggleSounds, isMusicEnabled, getSoundsEnabled, playSound } = useAudio();
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [soundsEnabled, setSoundsEnabled] = useState(true);

  // Sincronizar estado inicial con el hook de audio
  useEffect(() => {
    setMusicEnabled(isMusicEnabled());
    setSoundsEnabled(getSoundsEnabled());
  }, [isMusicEnabled, getSoundsEnabled]);

  const handleMusicToggle = () => {
    playSound('button_click');
    const newState = toggleMusic();
    setMusicEnabled(newState);
  };

  const handleSoundsToggle = () => {
    playSound('button_click');
    const newState = toggleSounds();
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