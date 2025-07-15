'use client';

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { GameResult } from '@/types/game';
import { useAudio } from '@/hooks/useAudio';

interface GameResultProps {
  result: GameResult;
  betAmount: number;
  onPlayAgain: () => void;
}

export function GameResultComponent({ result, betAmount, onPlayAgain }: GameResultProps) {
  const profit = result.finalAmount - betAmount;
  const { playSound, stopMusic } = useAudio();

  // CLEANUP: Detener TODA la música cuando el componente se desmonte
  useEffect(() => {
    // Reproducir música de victoria inmediatamente al montar el componente
    console.log('🏆 Reproduciendo música de Victoria...');
    try {
      playSound('victory_road');
      console.log('✅ Música victory_road reproducida exitosamente');
    } catch (error) {
      console.error('❌ Error reproduciendo música victory_road:', error);
    }

    return () => {
      console.log('🔇 CLEANUP: Componente GameResultComponent (Victoria) desmontándose - Deteniendo TODA la música...');
      try {
        // Buscar y detener TODOS los elementos de audio en el DOM
        const allAudioElements = document.querySelectorAll('audio');
        let stoppedCount = 0;
        
        allAudioElements.forEach((audio, index) => {
          console.log(`🎵 CLEANUP VICTORIA Audio ${index}: src=${audio.src}, paused=${audio.paused}`);
          if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
            stoppedCount++;
            console.log(`🔇 ✅ CLEANUP VICTORIA Audio detenido: ${index}`);
          }
        });
        
        console.log(`🔇 ✅ CLEANUP VICTORIA Detenidos ${stoppedCount} audios en total`);
      } catch (error) {
        console.error('❌ CLEANUP VICTORIA Error deteniendo audios:', error);
      }
    };
  }, [playSound]);

  const handlePlayAgain = () => {
    console.log('🎮 handlePlayAgain called (Victory)');
    
    // DETENER TODA LA MÚSICA antes de continuar
    console.log('🏠 PLAY AGAIN - Deteniendo toda la música...');
    try {
      const allAudioElements = document.querySelectorAll('audio');
      let stoppedCount = 0;
      
      allAudioElements.forEach((audio, index) => {
        console.log(`🎵 PLAY AGAIN Audio ${index}: src=${audio.src}, paused=${audio.paused}`);
        if (!audio.paused) {
          audio.pause();
          audio.currentTime = 0;
          stoppedCount++;
          console.log(`🔇 ✅ PLAY AGAIN Audio detenido: ${index}`);
        }
      });
      
      console.log(`🔇 ✅ PLAY AGAIN Detenidos ${stoppedCount} audios antes de nuevo juego`);
    } catch (error) {
      console.error('❌ PLAY AGAIN Error deteniendo audios:', error);
    }
    
    // También usar el método del hook por si acaso
    try {
      stopMusic();
    } catch (error) {
      console.error('❌ PLAY AGAIN Error con stopMusic():', error);
    }
    
    // Reproducir sonido del botón
    console.log('🔊 Intentando reproducir sonido del botón PLAY AGAIN (Victory)...');
    try {
      playSound('button_click');
      console.log('✅ Sonido Victory reproducido exitosamente');
    } catch (error) {
      console.error('❌ Error reproduciendo sonido Victory:', error);
    }
    
    // Llamar a onPlayAgain después de un pequeño delay
    setTimeout(() => {
      onPlayAgain();
    }, 50);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/20">
      {/* Contenedor principal con caja pixel art */}
      <div className="relative z-10 max-w-2xl mx-auto px-4">
        {/* Caja principal usando asset PNG */}
        <div 
          className="relative px-16 py-12 w-full max-w-xl min-h-[400px] flex flex-col items-center justify-between"
          style={{
            backgroundImage: 'url(/assets/images/box_446x362.png)',
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated'
          }}
        >
          {/* Título de victoria */}
          <div className="text-center space-y-6 pt-8">
            <h1 
              className="text-6xl md:text-8xl font-bold text-yellow-400 pixellari-title"
              style={{ 
                textShadow: '4px 4px 0px rgba(184, 134, 11, 0.8)'
              }}
            >
              VICTORY!
            </h1>

            {/* Icono de victoria */}
            <div className="text-6xl">🏆</div>

            {/* Mensaje de ganancia */}
            <div className="pixellari-title text-xl md:text-2xl text-white space-y-2">
              <p>Congratulations!</p>
              <p 
                className="text-green-400 text-2xl md:text-3xl font-bold"
                style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.8)' }}
              >
                WON: +${profit.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Botón PLAY AGAIN dentro de la caja */}
          <div className="pb-8">
            <Button 
              onClick={handlePlayAgain}
              onMouseDown={() => {
                // Reproducir sonido también en mouseDown para mayor garantía
                console.log('🔊 Sonido Victory desde mouseDown');
                playSound('button_click');
              }}
              disableSound={true} // Desactivamos el sonido automático porque lo manejamos manualmente
              className="pixellari-title text-2xl px-12 py-4 bg-transparent border-none text-white font-bold hover:scale-105 transition-transform"
              style={{
                backgroundImage: 'url(/assets/images/button_442x75_groc.png)',
                backgroundSize: '100% 100%',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                imageRendering: 'pixelated',
                textShadow: '2px 2px 0px rgba(0,0,0,0.8)',
                minWidth: '300px',
                height: '80px'
              }}
            >
              🎮 PLAY AGAIN 🎮
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}